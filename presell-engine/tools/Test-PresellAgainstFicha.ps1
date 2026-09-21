[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Destination,

    [string]$FichaPath,

    [string]$FichaJson,

    [switch]$Json
)

$ErrorActionPreference = 'Stop'

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

function Get-PropertyValue {
    param(
        [object]$Object,
        [string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return [string]$property.Value
}

function Normalize-Whitespace {
    param([string]$Value)

    if ($null -eq $Value) { return '' }
    return (($Value -replace '\s+', ' ').Trim())
}

$checks = [System.Collections.Generic.List[object]]::new()
$indexPath = Join-Path $Destination 'index.html'

if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
    $checks.Add((New-Check 'destination' 'BLOCK' 'Diretório da pre-sell não existe.' @($Destination)))
}
elseif (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    $checks.Add((New-Check 'index' 'BLOCK' 'index.html não existe no diretório da pre-sell.' @($indexPath)))
}
else {
    $checks.Add((New-Check 'destination' 'PASS' 'Diretório da pre-sell encontrado.' @($Destination)))
    $checks.Add((New-Check 'index' 'PASS' 'index.html encontrado.' @($indexPath)))
}

$rawFicha = $null
if (-not [string]::IsNullOrWhiteSpace($FichaPath)) {
    if (-not (Test-Path -LiteralPath $FichaPath -PathType Leaf)) {
        $checks.Add((New-Check 'ficha' 'BLOCK' 'Arquivo da ficha não encontrado.' @($FichaPath)))
    }
    else {
        $rawFicha = Get-Content -LiteralPath $FichaPath -Raw
    }
}
elseif (-not [string]::IsNullOrWhiteSpace($FichaJson)) {
    $rawFicha = $FichaJson
}
else {
    $checks.Add((New-Check 'ficha' 'BLOCK' 'Informe -FichaPath ou -FichaJson.'))
}

$ficha = $null
if ($null -ne $rawFicha) {
    try {
        $ficha = $rawFicha | ConvertFrom-Json
        $checks.Add((New-Check 'ficha' 'PASS' 'Ficha JSON carregada.'))
    }
    catch {
        $checks.Add((New-Check 'ficha' 'BLOCK' 'Ficha JSON inválida.' @($_.Exception.Message)))
    }
}

$indexText = $null
$stylesText = $null
if (Test-Path -LiteralPath $indexPath -PathType Leaf) {
    try {
        $indexText = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $indexPath).Path)
    }
    catch {
        $checks.Add((New-Check 'index-readable' 'BLOCK' 'index.html não pôde ser lido.' @($_.Exception.Message)))
    }
}
$stylesPath = Join-Path $Destination 'styles.css'
if (Test-Path -LiteralPath $stylesPath -PathType Leaf) {
    try {
        $stylesText = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $stylesPath).Path)
    }
    catch {
        $checks.Add((New-Check 'styles-readable' 'BLOCK' 'styles.css não pôde ser lido.' @($_.Exception.Message)))
    }
}

if ($null -ne $ficha -and $null -ne $indexText) {
    $metadataChecks = @(
        @{ Name = 'html-language'; Field = 'htmlLanguage'; Pattern = '<html\b[^>]*\blang\s*=\s*["'']([^"'']+)["'']'; Label = 'idioma HTML' },
        @{ Name = 'page-title'; Field = 'pageTitle'; Pattern = '<title\b[^>]*>(.*?)</title>'; Label = 'título da página' },
        @{ Name = 'country-code'; Field = 'countryCode'; Pattern = 'data-country\s*=\s*["'']([^"'']+)["'']'; Label = 'código do país' }
    )

    foreach ($metadata in $metadataChecks) {
        $expected = Get-PropertyValue $ficha $metadata.Field
        if ([string]::IsNullOrWhiteSpace($expected)) {
            $checks.Add((New-Check $metadata.Name 'WARN' ("Campo '{0}' não foi informado na ficha; comparação ignorada." -f $metadata.Field)))
            continue
        }

        $match = [regex]::Match($indexText, $metadata.Pattern, 'IgnoreCase, Singleline')
        $actual = if ($match.Success) { $match.Groups[1].Value.Trim() } else { '' }
        if ($actual -ceq $expected.Trim()) {
            $checks.Add((New-Check $metadata.Name 'PASS' ("{0} confere." -f $metadata.Label) @($actual)))
        }
        else {
            $checks.Add((New-Check $metadata.Name 'BLOCK' ("{0} divergente." -f $metadata.Label) @("Esperado: $expected", "Encontrado: $actual")))
        }
    }

    $affiliateUrl = Get-PropertyValue $ficha 'affiliateUrl'
    if ([string]::IsNullOrWhiteSpace($affiliateUrl)) {
        $checks.Add((New-Check 'affiliate-url' 'BLOCK' 'URL de afiliação não foi informada na ficha.'))
    }
    else {
        $urlValues = @([regex]::Matches($indexText, '(?:href|data-url)\s*=\s*["'']([^"'']+)["'']', 'IgnoreCase') | ForEach-Object { $_.Groups[1].Value })
        $externalUrls = @($urlValues | Where-Object { $_ -match '^https?://' })
        $wrongUrls = @($externalUrls | Where-Object { $_ -ne $affiliateUrl } | Sort-Object -Unique)
        if ($externalUrls.Count -eq 0) {
            $checks.Add((New-Check 'affiliate-url' 'BLOCK' 'Nenhuma URL externa foi encontrada no index.html.' @($affiliateUrl)))
        }
        elseif ($wrongUrls.Count -gt 0 -or @($externalUrls | Where-Object { $_ -eq $affiliateUrl }).Count -eq 0) {
            $checks.Add((New-Check 'affiliate-url' 'BLOCK' 'Existem URLs externas divergentes da URL de afiliação.' $wrongUrls))
        }
        else {
            $checks.Add((New-Check 'affiliate-url' 'PASS' 'A URL de afiliação confere em todas as referências externas.' @($affiliateUrl)))
        }
    }

    $assetFolder = Get-PropertyValue $ficha 'assetFolder'
    if (-not [string]::IsNullOrWhiteSpace($assetFolder)) {
        $expectedFavicon = "./$assetFolder/03.png"
        if ($indexText -notmatch [regex]::Escape($expectedFavicon)) {
            $checks.Add((New-Check 'asset-folder' 'BLOCK' 'A referência ao favicon diverge da pasta de assets informada na ficha.' @($expectedFavicon)))
        }
        else {
            $checks.Add((New-Check 'asset-folder' 'PASS' 'A referência ao favicon confere com a pasta de assets da ficha.' @($expectedFavicon)))
        }
    }

    $visibleText = [regex]::Replace($indexText, '<[^>]+>', ' ')
    $visibleText = [System.Net.WebUtility]::HtmlDecode($visibleText)
    $visibleTextNormalized = Normalize-Whitespace $visibleText

    $mustContain = @($ficha.mustContain)
    $missingFacts = @(
        foreach ($fact in $mustContain) {
            $expectedFact = Normalize-Whitespace ([string]$fact)
            if (-not [string]::IsNullOrWhiteSpace($expectedFact) -and $visibleTextNormalized.IndexOf($expectedFact, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
                $expectedFact
            }
        }
    )
    if ($missingFacts.Count -gt 0) {
        $checks.Add((New-Check 'confirmed-facts' 'BLOCK' 'Fatos confirmados da ficha ausentes no conteúdo visível.' $missingFacts))
    }
    else {
        $checks.Add((New-Check 'confirmed-facts' 'PASS' 'Todos os fatos confirmados informados foram encontrados no conteúdo visível.' $mustContain))
    }

    $mustNotContain = @($ficha.mustNotContain)
    $foundProhibitedFacts = @(
        foreach ($fact in $mustNotContain) {
            $prohibitedFact = Normalize-Whitespace ([string]$fact)
            if (-not [string]::IsNullOrWhiteSpace($prohibitedFact) -and $visibleTextNormalized.IndexOf($prohibitedFact, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                $prohibitedFact
            }
        }
    )
    if ($foundProhibitedFacts.Count -gt 0) {
        $checks.Add((New-Check 'prohibited-facts' 'BLOCK' 'Fatos proibidos da ficha foram encontrados no conteúdo visível.' $foundProhibitedFacts))
    }
    elseif ($mustNotContain.Count -gt 0) {
        $checks.Add((New-Check 'prohibited-facts' 'PASS' 'Nenhum fato proibido foi encontrado.' $mustNotContain))
    }

    $pending = @($ficha.pending)
    $confirmar = @($pending | Where-Object { $_ -match '(?i)confirmar' })
    if ($confirmar.Count -gt 0) {
        $checks.Add((New-Check 'pending' 'WARN' 'A ficha contém pendências que não foram decididas.' $confirmar))
    }
    elseif ($pending.Count -gt 0) {
        $checks.Add((New-Check 'pending' 'WARN' 'A ficha contém pendências.' $pending))
    }
    else {
        $checks.Add((New-Check 'pending' 'PASS' 'Nenhuma pendência foi informada na ficha.'))
    }

    $primaryButtonColor = Get-PropertyValue $ficha 'primaryButtonColor'
    $primaryButtonHoverColor = Get-PropertyValue $ficha 'primaryButtonHoverColor'
    if (-not [string]::IsNullOrWhiteSpace($primaryButtonColor)) {
        if ([string]::IsNullOrWhiteSpace($primaryButtonHoverColor)) {
            $primaryButtonHoverColor = $primaryButtonColor
        }
        if ($null -eq $stylesText) {
            $checks.Add((New-Check 'primary-button-color' 'BLOCK' 'Não foi possível validar a cor do botão porque styles.css está ausente ou ilegível.'))
        }
        else {
            $normalPattern = '(?is)#cookie-consent-widget-br\s+\.ccw-btn-primary\s*\{[^}]*background(?:-color)?\s*:\s*' + [regex]::Escape($primaryButtonColor)
            $hoverPattern = '(?is)#cookie-consent-widget-br\s+\.ccw-btn-primary:hover\s*,\s*#cookie-consent-widget-br\s+\.ccw-btn-primary:focus-visible\s*\{[^}]*background(?:-color)?\s*:\s*' + [regex]::Escape($primaryButtonHoverColor)
            $colorIssues = @()
            if ($stylesText -notmatch $normalPattern) { $colorIssues += "Cor normal esperada: $primaryButtonColor" }
            if (-not [string]::IsNullOrWhiteSpace($primaryButtonHoverColor) -and $stylesText -notmatch $hoverPattern) { $colorIssues += "Cor de hover esperada: $primaryButtonHoverColor" }
            if ($colorIssues.Count -gt 0) {
                $checks.Add((New-Check 'primary-button-color' 'BLOCK' 'A cor do botão principal diverge da ficha.' $colorIssues))
            }
            else {
                $checks.Add((New-Check 'primary-button-color' 'PASS' 'A cor do botão principal confere com a ficha.' @($primaryButtonColor, $primaryButtonHoverColor)))
            }
        }
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
    module      = 'presell-ficha-validator'
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
