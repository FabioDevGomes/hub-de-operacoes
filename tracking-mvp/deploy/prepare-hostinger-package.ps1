[CmdletBinding()]
param(
    [Parameter()]
    [string]$Package = 'google-ads-campaign-actions',

    [Parameter()]
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deployRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $deployRoot
$manifestKey = [System.IO.Path]::GetFileNameWithoutExtension($Package)
if ($manifestKey -notmatch '^[a-z0-9][a-z0-9-]*$') {
    throw "Invalid package manifest key: $Package"
}
$manifestDirectory = Join-Path $deployRoot 'manifests'
$manifestPath = Join-Path $manifestDirectory "$manifestKey.json"

function Read-JsonFile {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required manifest not found: $Path"
    }
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-OptionalProperty {
    param(
        [Parameter(Mandatory)][object]$Object,
        [Parameter(Mandatory)][string]$Name,
        [Parameter()][object]$DefaultValue = $null
    )
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $DefaultValue }
    return $property.Value
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Assert-ChildPath {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$Candidate,
        [Parameter(Mandatory)][string]$Label
    )
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $candidateFull = [System.IO.Path]::GetFullPath($Candidate)
    if (-not $candidateFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label escapes the expected directory: $candidateFull"
    }
    return $candidateFull
}

function Get-PhpDispatchOperations {
    param(
        [Parameter(Mandatory)][string]$SourceText,
        [Parameter(Mandatory)][string]$FunctionName
    )
    $functionMatch = [regex]::Match($SourceText, "function\s+$([regex]::Escape($FunctionName))\s*\(")
    if (-not $functionMatch.Success) {
        throw "Dispatch function not found in source: $FunctionName"
    }

    # The action dispatcher is the final function in this endpoint. Collect literal
    # operation comparisons and the explicit allow-list used by its status handler.
    $dispatchText = $SourceText.Substring($functionMatch.Index)
    $operationNames = [System.Collections.Generic.List[string]]::new()
    foreach ($match in [regex]::Matches($dispatchText, "\`$operation\s*===\s*'([^']+)'")) {
        $operationNames.Add($match.Groups[1].Value)
    }
    foreach ($listMatch in [regex]::Matches($dispatchText, "in_array\(\s*\`$operation\s*,\s*\[([^\]]+)\]")) {
        foreach ($nameMatch in [regex]::Matches($listMatch.Groups[1].Value, "'([^']+)'")) {
            $operationNames.Add($nameMatch.Groups[1].Value)
        }
    }
    return @($operationNames | Sort-Object -Unique)
}

function Invoke-PhpLint {
    param([Parameter(Mandatory)][string]$Path)
    $phpCommand = Get-Command php -ErrorAction SilentlyContinue
    if ($null -eq $phpCommand) {
        throw 'PHP CLI was not found. Install/configure php to run the required syntax check.'
    }
    $lintOutput = & $phpCommand.Source -l $Path 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "PHP syntax check failed for $Path`n$($lintOutput -join "`n")"
    }
    return ($lintOutput -join ' ').Trim()
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Text
    )
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

$manifest = Read-JsonFile -Path $manifestPath
if ($manifest.schemaVersion -ne 1) {
    throw 'Unsupported package manifest schema version.'
}
if ($manifest.packageName -ne $manifestKey) {
    throw "Package name mismatch in manifest: $($manifest.packageName)"
}
if ($manifest.releasePrefix -notmatch '^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$') {
    throw "Invalid release prefix in manifest: $($manifest.releasePrefix)"
}
if (@($manifest.files).Count -eq 0) {
    throw 'The package manifest has no files to publish.'
}

$requiredOperations = $null
$requiredOperationsManifest = [string](Get-OptionalProperty -Object $manifest -Name 'requiredOperationsManifest')
if (-not [string]::IsNullOrWhiteSpace($requiredOperationsManifest)) {
    $requiredOperationsPath = Assert-ChildPath `
        -Root $manifestDirectory `
        -Candidate (Join-Path $manifestDirectory $requiredOperationsManifest) `
        -Label 'Operation baseline manifest'
    $requiredOperations = Read-JsonFile -Path $requiredOperationsPath
    if ($requiredOperations.schemaVersion -ne 1) {
        throw 'Unsupported operation inventory schema version.'
    }
}

$preparedFiles = [System.Collections.Generic.List[object]]::new()
$sourceOperations = @()
$lintResults = [System.Collections.Generic.List[string]]::new()
$baselineSourceFound = $false

foreach ($entry in $manifest.files) {
    if ($entry.destinationKey -notmatch '^[a-z0-9][a-z0-9-]*$') {
        throw "Invalid destination folder key: $($entry.destinationKey)"
    }
    if ([string]::IsNullOrWhiteSpace([string]$entry.fileName) -or [System.IO.Path]::GetFileName($entry.fileName) -ne $entry.fileName) {
        throw "Invalid upload filename: $($entry.fileName)"
    }
    if ([string]$entry.destinationServerPath -notmatch '^/[^\r\n]+$' -or @(([string]$entry.destinationServerPath -split '/') | Where-Object { $_ -eq '..' }).Count -gt 0) {
        throw "Invalid server destination path: $($entry.destinationServerPath)"
    }

    $sourcePath = Assert-ChildPath `
        -Root $projectRoot `
        -Candidate (Join-Path $projectRoot $entry.source) `
        -Label 'Manifest source'
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Canonical source file not found: $sourcePath"
    }

    $sourceText = [System.IO.File]::ReadAllText($sourcePath, [System.Text.UTF8Encoding]::new($false, $true))
    $sourceHash = Get-Sha256 -Path $sourcePath
    if ([System.IO.Path]::GetExtension($sourcePath) -ieq '.php') {
        $lintResults.Add((Invoke-PhpLint -Path $sourcePath))
    }

    if ($null -ne $requiredOperations -and $entry.source -eq $requiredOperations.source) {
        $baselineSourceFound = $true
        $sourceOperations = Get-PhpDispatchOperations -SourceText $sourceText -FunctionName $requiredOperations.dispatchFunction
    }

    $preparedFiles.Add([pscustomobject]@{
        Entry = $entry
        SourcePath = $sourcePath
        SourceText = $sourceText
        SourceSha256 = $sourceHash
    })
}

if ($null -ne $requiredOperations) {
    if (-not $baselineSourceFound) {
        throw "The source defined in the route baseline is not included in this package: $($requiredOperations.source)"
    }
    $expectedOperations = @($requiredOperations.operations | Sort-Object -Unique)
    $missingOperations = @($expectedOperations | Where-Object { $_ -notin $sourceOperations })
    $untrackedOperations = @($sourceOperations | Where-Object { $_ -notin $expectedOperations })
    if ($missingOperations.Count -gt 0 -or $untrackedOperations.Count -gt 0) {
        $details = @()
        if ($missingOperations.Count -gt 0) { $details += "Missing in source: $($missingOperations -join ', ')" }
        if ($untrackedOperations.Count -gt 0) { $details += "New/unreviewed source routes: $($untrackedOperations -join ', ')" }
        throw "Protected route inventory does not match the canonical source. Review the change before packaging. $($details -join '; ')"
    }
} else {
    $expectedOperations = @()
}

$uploadIdentities = @($manifest.files | ForEach-Object { "$($_.destinationKey)|$($_.fileName)" })
$duplicateUploads = @($uploadIdentities | Group-Object | Where-Object { $_.Count -gt 1 })
if ($duplicateUploads.Count -gt 0) {
    throw "Duplicate manifest upload target(s): $(($duplicateUploads | ForEach-Object { $_.Name }) -join ', ')"
}
foreach ($group in @($manifest.files | Group-Object destinationKey)) {
    $serverPaths = @($group.Group | ForEach-Object { [string]$_.destinationServerPath } | Sort-Object -Unique)
    if ($serverPaths.Count -ne 1) {
        throw "Manifest destination key $($group.Name) maps to multiple server paths. Use a separate destination key for each server directory."
    }
}

if ($ValidateOnly) {
    Write-Output "Package: $manifestKey"
    Write-Output "Canonical files: $($preparedFiles.Count)"
    if ($null -ne $requiredOperations) {
        Write-Output "Protected dispatcher operations: $($sourceOperations.Count)/$($expectedOperations.Count)"
    } else {
        Write-Output 'Protected dispatcher operations: no route baseline configured for this package'
    }
    Write-Output "PHP syntax: $($lintResults.Count) PHP source file(s) passed"
    Write-Output 'Package generation: skipped (-ValidateOnly)'
    exit 0
}

$releaseId = '{0}-{1}' -f $manifest.releasePrefix, (Get-Date -Format 'yyyy.MM.dd-HHmmss')
$stagingRoot = Join-Path $deployRoot 'staging'
$releaseRoot = Assert-ChildPath `
    -Root $stagingRoot `
    -Candidate (Join-Path $stagingRoot "$manifestKey-$releaseId") `
    -Label 'Package output'
if (Test-Path -LiteralPath $releaseRoot) {
    throw "Release folder already exists; no files were overwritten: $releaseRoot"
}
$tempRoot = Assert-ChildPath `
    -Root $stagingRoot `
    -Candidate (Join-Path $stagingRoot ".tmp-$manifestKey-$releaseId") `
    -Label 'Temporary package output'
if (Test-Path -LiteralPath $tempRoot) {
    throw "Temporary output already exists; no files were overwritten: $tempRoot"
}

try {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    $uploadedFiles = [System.Collections.Generic.List[object]]::new()
    foreach ($prepared in $preparedFiles) {
        $entry = $prepared.Entry
        $destinationFolder = Join-Path $tempRoot $entry.destinationKey
        if (-not (Test-Path -LiteralPath $destinationFolder)) {
            New-Item -ItemType Directory -Path $destinationFolder | Out-Null
        }
        $uploadPath = Assert-ChildPath `
            -Root $tempRoot `
            -Candidate (Join-Path $destinationFolder $entry.fileName) `
            -Label 'Upload file'

        $uploadText = $prepared.SourceText
        $releaseComment = $null
        $addReleaseComment = [bool](Get-OptionalProperty -Object $entry -Name 'addReleaseComment' -DefaultValue $false)
        if ($addReleaseComment) {
            if ([System.IO.Path]::GetExtension($entry.fileName) -ine '.php') {
                throw "Release comments can only be injected into PHP files: $($entry.fileName)"
            }
            $markerName = [string](Get-OptionalProperty -Object $entry -Name 'releaseMarkerName')
            if ([string]::IsNullOrWhiteSpace($markerName)) { $markerName = 'HUB-PACKAGE-RELEASE' }
            if ($markerName -notmatch '^[A-Z0-9-]+$') { throw "Invalid release marker name: $markerName" }
            $releaseComment = "// ${markerName}: $releaseId"
            if ($uploadText.Contains("${markerName}:")) {
                throw "Canonical source already contains the generated release marker: $($entry.source)"
            }
            $declaration = 'declare(strict_types=1);'
            $declarationIndex = $uploadText.IndexOf($declaration, [System.StringComparison]::Ordinal)
            if ($declarationIndex -lt 0 -or $uploadText.IndexOf($declaration, $declarationIndex + $declaration.Length, [System.StringComparison]::Ordinal) -ge 0) {
                throw "Could not uniquely locate strict_types declaration for release marker in $($entry.source)"
            }
            $newline = if ($uploadText.Contains("`r`n")) { "`r`n" } else { "`n" }
            $afterDeclaration = $declarationIndex + $declaration.Length
            $uploadText = $uploadText.Substring(0, $afterDeclaration) + $newline + $releaseComment + $uploadText.Substring($afterDeclaration)
        }

        Write-Utf8NoBom -Path $uploadPath -Text $uploadText
        if ([System.IO.Path]::GetExtension($uploadPath) -ieq '.php') {
            $lintResults.Add((Invoke-PhpLint -Path $uploadPath))
        }
        $stagedText = [System.IO.File]::ReadAllText($uploadPath, [System.Text.UTF8Encoding]::new($false, $true))
        if ($null -ne $releaseComment) {
            $markerSequence = $newline + $releaseComment + $newline
            if ([regex]::Matches($stagedText, [regex]::Escape($markerSequence)).Count -ne 1) {
                throw "Expected one release marker in staged file: $($entry.fileName)"
            }
            $sourceEquivalent = $stagedText.Replace($markerSequence, $newline)
            if ($sourceEquivalent -cne $prepared.SourceText) {
                throw "Staged file differs from canonical source beyond its release marker: $($entry.fileName)"
            }
        } elseif ($stagedText -cne $prepared.SourceText) {
            throw "Staged file differs from canonical source: $($entry.fileName)"
        }

        $uploadedFiles.Add([pscustomobject]@{
            source = $entry.source
            destinationKey = $entry.destinationKey
            destinationServerPath = $entry.destinationServerPath
            fileName = $entry.fileName
            sourceSha256 = $prepared.SourceSha256
            uploadSha256 = Get-Sha256 -Path $uploadPath
            releaseComment = $releaseComment
            relativeUploadPath = "$($entry.destinationKey)/$($entry.fileName)"
        })
    }

    $operationBaselinePath = $null
    if ($null -ne $requiredOperations) { $operationBaselinePath = "manifests/$requiredOperationsManifest" }
    $packageManifest = [ordered]@{
        schemaVersion = 1
        packageName = $manifest.packageName
        releaseId = $releaseId
        createdAtLocal = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
        publication = 'manual; not performed by this script'
        protectedOperationsCount = if ($null -ne $requiredOperations) { $sourceOperations.Count } else { $null }
        protectedOperationsBaseline = $operationBaselinePath
        files = @($uploadedFiles | ForEach-Object {
            [ordered]@{
                source = $_.source
                destinationKey = $_.destinationKey
                destinationServerPath = $_.destinationServerPath
                fileName = $_.fileName
                sourceSha256 = $_.sourceSha256
                uploadSha256 = $_.uploadSha256
                releaseComment = $_.releaseComment
            }
        })
    }
    Write-Utf8NoBom `
        -Path (Join-Path $tempRoot 'PACKAGE-MANIFEST.json') `
        -Text (($packageManifest | ConvertTo-Json -Depth 8) + "`n")

    $readme = [System.Collections.Generic.List[string]]::new()
    $packageDescription = [string](Get-OptionalProperty -Object $manifest -Name 'description' -DefaultValue $manifest.packageName)
    $readme.Add("# $packageDescription")
    $readme.Add('')
    $readme.Add("**Versão local:** ``$releaseId``")
    $readme.Add('**Estado:** pacote preparado localmente; o script não faz upload nem confirma o estado do servidor.')
    $readme.Add('**Regra operacional:** este é o pacote local mais recente para a próxima publicação. Confira manualmente o comentário de versão no arquivo do servidor depois do upload.')
    $readme.Add('')
    $readme.Add('## Como enviar')
    $readme.Add('')
    $readme.Add('Não envie a raiz deste pacote. Abra somente a pasta de destino abaixo e envie os arquivos listados para o caminho indicado. A raiz contém documentação e manifesto para conferência.')
    $readme.Add('')
    foreach ($group in @($uploadedFiles | Group-Object destinationKey)) {
        $first = $group.Group[0]
        $readme.Add("### Destino no servidor: ``$($first.destinationServerPath)``")
        $readme.Add('')
        $readme.Add('Pasta local de upload:')
        $readme.Add('')
        $readme.Add('```text')
        $readme.Add((Join-Path $releaseRoot $first.destinationKey))
        $readme.Add('```')
        $readme.Add('')
        foreach ($file in $group.Group) {
            $readme.Add("- [``$($file.fileName)``]($($file.relativeUploadPath)) — destino: ``$($file.destinationServerPath)/$($file.fileName)``")
            $readme.Add("  Fonte canônica: ``$($file.source)``; SHA-256 fonte: ``$($file.sourceSha256)``; SHA-256 upload: ``$($file.uploadSha256)``.")
            if ($null -ne $file.releaseComment) {
                $readme.Add("  Comentário de versão para conferência manual: ``$($file.releaseComment)``.")
            }
        }
        $readme.Add('')
    }

    $readme.Add('## Dependências já instaladas')
    $readme.Add('')
    $existingDependencies = @(Get-OptionalProperty -Object $manifest -Name 'existingServerDependencies' -DefaultValue @())
    if ($existingDependencies.Count -gt 0) {
        $dependencyList = ($existingDependencies | ForEach-Object { "``$_``" }) -join ', '
        $readme.Add("Este pacote substitui somente os arquivos listados. Preserve no servidor: $dependencyList.")
    } else {
        $readme.Add('Este pacote substitui somente os arquivos listados; não há dependências pré-instaladas registradas no manifesto.')
    }
    $readme.Add('')
    $readme.Add('## Configuração e escopo')
    $readme.Add('')
    foreach ($note in @(Get-OptionalProperty -Object $manifest -Name 'configurationNotes' -DefaultValue @())) { $readme.Add("- $note") }
    $readme.Add('')
    if ($null -ne $requiredOperations) {
        $readme.Add("A conferência local encontrou $($sourceOperations.Count) operações protegidas no dispatcher, iguais ao inventário aprovado. O PHP passou pela checagem de sintaxe. Nenhuma chamada a serviço externo foi feita.")
    } else {
        $readme.Add('Os arquivos PHP passaram pela checagem de sintaxe. Nenhuma chamada a serviço externo foi feita.')
    }
    $readme.Add('')
    $readme.Add('Antes de substituir no servidor, faça e confira um backup privado dos arquivos atuais. Após o upload manual, confira o comentário de versão listado acima no Gerenciador de Arquivos da Hostinger. O identificador local não é prova de publicação.')
    $readme.Add('')
    Write-Utf8NoBom -Path (Join-Path $tempRoot 'README.md') -Text ($readme -join "`n")

    foreach ($group in @($uploadedFiles | Group-Object destinationKey)) {
        $folder = Join-Path $tempRoot $group.Name
        $expectedNames = @($group.Group | ForEach-Object { $_.fileName } | Sort-Object -Unique)
        $folderItems = @(Get-ChildItem -LiteralPath $folder -Force)
        if (@($folderItems | Where-Object { $_.PSIsContainer }).Count -gt 0) {
            throw "Upload folder contains an unexpected subdirectory: $($group.Name)"
        }
        $actualNames = @($folderItems | ForEach-Object { $_.Name } | Sort-Object -Unique)
        if (($expectedNames -join "`n") -cne ($actualNames -join "`n")) {
            throw "Upload folder inventory mismatch in $($group.Name). Expected [$($expectedNames -join ', ')], found [$($actualNames -join ', ')]"
        }
    }

    Move-Item -LiteralPath $tempRoot -Destination $releaseRoot
    Write-Output "Package created: $releaseRoot"
    Write-Output "Release marker: $releaseId"
    if ($null -ne $requiredOperations) {
        Write-Output "Protected dispatcher operations: $($sourceOperations.Count)/$($expectedOperations.Count)"
    }
    Write-Output 'Upload folders contain only their manifest-listed files.'
    Write-Output 'Publication: manual; not performed.'
}
catch {
    if (Test-Path -LiteralPath $tempRoot) {
        $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
        $stagingPrefix = [System.IO.Path]::GetFullPath($stagingRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
        if ($resolvedTemp.StartsWith($stagingPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
        }
    }
    throw
}
