[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Destination,

    [string]$RulesPath,

    [string]$AssetFolder,

    [switch]$Json
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RulesPath)) {
    $RulesPath = Join-Path -Path $PSScriptRoot -ChildPath '..\config\presell-rules.json'
}

function New-Check {
    param(
        [string]$Name,
        [ValidateSet('PASS', 'WARN', 'BLOCK')]
        [string]$Status,
        [string]$Message,
        [string[]]$Items = @()
    )

    [PSCustomObject]@{
        name    = $Name
        status  = $Status
        message = $Message
        items   = @($Items)
    }
}

function Read-TextFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    try {
        return [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path)
    }
    catch {
        return $null
    }
}

$checks = [System.Collections.Generic.List[object]]::new()
$resolvedDestination = $null

if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
    $checks.Add((New-Check 'destination' 'BLOCK' 'Diretório da pre-sell não existe ou não é uma pasta.' @($Destination)))
}
else {
    $resolvedDestination = (Resolve-Path -LiteralPath $Destination).Path
    $checks.Add((New-Check 'destination' 'PASS' 'Diretório da pre-sell encontrado.' @($resolvedDestination)))
}

$rules = $null
if (-not (Test-Path -LiteralPath $RulesPath -PathType Leaf)) {
    $checks.Add((New-Check 'rules' 'BLOCK' 'Arquivo de regras não encontrado.' @($RulesPath)))
}
else {
    try {
        $rules = Get-Content -LiteralPath $RulesPath -Raw | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace($AssetFolder)) {
            $AssetFolder = [string]$rules.defaultAssetFolder
        }
        if ($AssetFolder -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') {
            throw 'Nome da pasta de assets inválido.'
        }
        $checks.Add((New-Check 'rules' 'PASS' 'Arquivo de regras carregado.' @($RulesPath)))
    }
    catch {
        $checks.Add((New-Check 'rules' 'BLOCK' 'Arquivo de regras inválido.' @($_.Exception.Message)))
    }
}

if ($null -ne $resolvedDestination -and $null -ne $rules) {
    $requiredFiles = @($rules.requiredFiles)
    $missingFiles = @(
        foreach ($relativePath in $requiredFiles) {
            $candidate = Join-Path $resolvedDestination $relativePath
            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { $relativePath }
        }
    )
    if ($missingFiles.Count -gt 0) {
        $checks.Add((New-Check 'required-files' 'BLOCK' 'Arquivos obrigatórios ausentes.' $missingFiles))
    }
    else {
        $checks.Add((New-Check 'required-files' 'PASS' 'Todos os arquivos obrigatórios existem.' $requiredFiles))
    }

    $assetNames = @($rules.requiredAssetNames)
    if ($assetNames.Count -eq 0) {
        $assetNames = @($rules.requiredAssets | ForEach-Object { Split-Path -Leaf $_ })
    }
    $requiredAssets = @($assetNames | ForEach-Object { "$AssetFolder/$_" })
    $missingAssets = @(
        foreach ($relativePath in $requiredAssets) {
            $candidate = Join-Path $resolvedDestination $relativePath
            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { $relativePath }
        }
    )
    if ($missingAssets.Count -gt 0) {
        $checks.Add((New-Check 'required-assets' 'BLOCK' 'Assets obrigatórios ausentes.' $missingAssets))
    }
    else {
        $checks.Add((New-Check 'required-assets' 'PASS' 'Todos os assets obrigatórios existem.' $requiredAssets))
    }

    $indexPath = Join-Path $resolvedDestination 'index.html'
    $indexText = Read-TextFile $indexPath
    $allText = @(
        foreach ($relativePath in $requiredFiles) {
            $text = Read-TextFile (Join-Path $resolvedDestination $relativePath)
            if ($null -ne $text) { $text }
        }
    ) -join "`n"

    if ($null -eq $indexText) {
        $checks.Add((New-Check 'index-readable' 'BLOCK' 'index.html não pôde ser lido.' @($indexPath)))
    }
    else {
        $checks.Add((New-Check 'index-readable' 'PASS' 'index.html pode ser lido.' @($indexPath)))

        $placeholderMatches = [regex]::Matches($indexText, '\{\{[^}]+\}\}') | ForEach-Object Value | Sort-Object -Unique
        if ($placeholderMatches.Count -gt 0) {
            $checks.Add((New-Check 'placeholders' 'BLOCK' 'Ainda existem placeholders no index.html.' $placeholderMatches))
        }
        else {
            $checks.Add((New-Check 'placeholders' 'PASS' 'Nenhum placeholder foi encontrado no index.html.'))
        }

        $externalScripts = [regex]::Matches($indexText, '<script\b[^>]+\bsrc\s*=\s*["''][^"'']+https?://[^"'']+["'']', 'IgnoreCase') | ForEach-Object Value
        if ($externalScripts.Count -gt 0) {
            $checks.Add((New-Check 'external-scripts' 'BLOCK' 'Scripts externos foram encontrados.' $externalScripts))
        }
        else {
            $checks.Add((New-Check 'external-scripts' 'PASS' 'Nenhum script externo foi encontrado.'))
        }

        $hrefs = [regex]::Matches($indexText, '(?:href|data-url)\s*=\s*["'']([^"'']+)["'']', 'IgnoreCase') | ForEach-Object { $_.Groups[1].Value }
        $invalidUrls = @(
            foreach ($href in $hrefs) {
                if ($href -notmatch '^(?:\./|https?://|#|mailto:|tel:)') { $href }
            }
        )
        if ($invalidUrls.Count -gt 0) {
            $checks.Add((New-Check 'links' 'WARN' 'Há referências de link que não seguem os formatos esperados.' ($invalidUrls | Sort-Object -Unique)))
        }
        else {
            $checks.Add((New-Check 'links' 'PASS' 'Referências de links seguem os formatos esperados.' ($hrefs | Sort-Object -Unique)))
        }

        $expectedFavicon = "./$AssetFolder/03.png"
        if ($hrefs -notcontains $expectedFavicon) {
            $checks.Add((New-Check 'favicon-reference' 'BLOCK' 'O favicon não referencia o asset obrigatório esperado.' @($expectedFavicon)))
        }
        else {
            $checks.Add((New-Check 'favicon-reference' 'PASS' 'O favicon referencia o asset obrigatório esperado.' @($expectedFavicon)))
        }

        $stylesPath = Join-Path $resolvedDestination 'styles.css'
        $stylesText = Read-TextFile $stylesPath
        $expectedBackgroundReferences = @("./$AssetFolder/01.png", "./$AssetFolder/02.png")
        $missingBackgroundReferences = @(
            foreach ($reference in $expectedBackgroundReferences) {
                if ($null -eq $stylesText -or $stylesText -notmatch [regex]::Escape($reference)) { $reference }
            }
        )
        if ($missingBackgroundReferences.Count -gt 0) {
            $checks.Add((New-Check 'background-references' 'BLOCK' 'O CSS não referencia todos os backgrounds obrigatórios.' $missingBackgroundReferences))
        }
        else {
            $checks.Add((New-Check 'background-references' 'PASS' 'O CSS referencia os backgrounds desktop e mobile obrigatórios.' $expectedBackgroundReferences))
        }
    }

    $mandatoryForbiddenTokens = @(
        'hume\.trustedfocus\.shop',
        'google-analytics',
        'gtag\s*\(',
        'clarity',
        'flow\s+tracking',
        'facebook\s+pixel'
    )
    $configuredForbiddenTokens = @($rules.forbiddenTokens)
    $forbiddenTokens = @($mandatoryForbiddenTokens + $configuredForbiddenTokens) | Sort-Object -Unique
    $foundForbidden = @(
        foreach ($token in $forbiddenTokens) {
            if ($allText -match $token) { $token }
        }
    )
    if ($foundForbidden.Count -gt 0) {
        $checks.Add((New-Check 'forbidden-content' 'BLOCK' 'Foram encontrados tokens proibidos ou indicadores de conteúdo herdado/rastreamento.' $foundForbidden))
    }
    else {
        $checks.Add((New-Check 'forbidden-content' 'PASS' 'Nenhum token proibido foi encontrado.'))
    }

    $htmlSignals = @(
        if ($indexText -notmatch '<!DOCTYPE\s+html') { 'DOCTYPE html ausente' }
        if ($indexText -notmatch '<html\b') { 'elemento html ausente' }
        if ($indexText -notmatch '</html>') { 'fechamento html ausente' }
    )
    if ($htmlSignals.Count -gt 0) {
        $checks.Add((New-Check 'html-shape' 'BLOCK' 'A estrutura HTML básica está incompleta.' $htmlSignals))
    }
    else {
        $checks.Add((New-Check 'html-shape' 'PASS' 'A estrutura HTML básica está presente.'))
    }
}

$overall = if (@($checks | Where-Object status -eq 'BLOCK').Count -gt 0) {
    'BLOCKED'
}
elseif (@($checks | Where-Object status -eq 'WARN').Count -gt 0) {
    'PASS_WITH_WARNINGS'
}
else {
    'PASS'
}

$report = [PSCustomObject]@{
    module      = 'presell-structure-validator'
    version     = '1.0.0'
    destination = $Destination
    readOnly    = $true
    overall     = $overall
    checks      = @($checks)
}

if ($Json) {
    $report | ConvertTo-Json -Depth 8
}
else {
    Write-Output ("RESULTADO: {0}" -f $report.overall)
    foreach ($check in $report.checks) {
        Write-Output ("[{0}] {1}: {2}" -f $check.status, $check.name, $check.message)
        foreach ($item in $check.items) { Write-Output ("  - {0}" -f $item) }
    }
}

if ($overall -eq 'BLOCKED') { exit 2 }
if ($overall -eq 'PASS_WITH_WARNINGS') { exit 1 }
exit 0
