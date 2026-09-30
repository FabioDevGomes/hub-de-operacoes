[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Destination,

    [string]$FichaPath,

    [string]$FichaJson,

    [Parameter(Mandatory = $true)]
    [string]$TemplateRoot
)

$ErrorActionPreference = 'Stop'

$rulesPath = Join-Path $PSScriptRoot '..\config\presell-rules.json'
$rules = [System.IO.File]::ReadAllText($rulesPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$detailsId = [string]$rules.templateIdentifiers.detailsId
if ($detailsId -notmatch '^[A-Za-z][A-Za-z0-9_-]*$') {
    throw 'Identificador dos detalhes da oferta inválido nas regras do template.'
}

function Convert-TemplateIdentifiers {
    param([string]$Template)

    # Normalize only template identifiers, before inserting factual offer content.
    foreach ($legacyId in @($rules.templateIdentifiers.legacyDetailsIds)) {
        if ([string]::IsNullOrWhiteSpace([string]$legacyId)) { continue }
        $pattern = '(?<![A-Za-z0-9_-])' + [regex]::Escape([string]$legacyId) + '(?![A-Za-z0-9_-])'
        $Template = [regex]::Replace($Template, $pattern, $detailsId, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    }
    return $Template
}

function Get-FichaValue {
    param([object]$Ficha, [string]$Name)
    $property = $Ficha.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return [string]$property.Value
}

function Encode-Html {
    param([string]$Value)
    return [System.Net.WebUtility]::HtmlEncode($Value)
}

function Read-Ficha {
    if (-not [string]::IsNullOrWhiteSpace($FichaPath)) {
        if (-not (Test-Path -LiteralPath $FichaPath -PathType Leaf)) {
            throw "Arquivo da ficha não encontrado: $FichaPath"
        }
        $fichaText = [System.IO.File]::ReadAllText($FichaPath, [System.Text.Encoding]::UTF8)
        return ($fichaText | ConvertFrom-Json)
    }
    if (-not [string]::IsNullOrWhiteSpace($FichaJson)) {
        return ($FichaJson | ConvertFrom-Json)
    }
    throw 'Informe -FichaPath ou -FichaJson.'
}

function Get-SafeStylesheet {
    param([string]$Stylesheet)

    $clean = [regex]::Replace(
        $Stylesheet,
        '@font-face\{[^}]*https?://[^}]*\}',
        '',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    $contaminationMarker = '\s*$/g;function Re'
    $markerIndex = $clean.IndexOf($contaminationMarker, [System.StringComparison]::Ordinal)
    if ($markerIndex -ge 0) {
        $widgetIndex = $clean.IndexOf('#cookie-consent-widget-br', $markerIndex, [System.StringComparison]::Ordinal)
        $head = $clean.Substring(0, $markerIndex)
        $tail = if ($widgetIndex -ge 0) { $clean.Substring($widgetIndex) } else { '' }
        $clean = $head + "`r`n" + $tail
    }

    $unsafePatterns = @(
        '@font-face\{[^}]*https?://',
        '<script\b',
        'google-analytics',
        'gtag\s*\(',
        'clarity',
        'flow\s+tracking',
        'facebook\s+pixel'
    )
    foreach ($pattern in $unsafePatterns) {
        if ($clean -match $pattern) {
            throw "O styles.css do template contém conteúdo proibido após a sanitização: $pattern"
        }
    }
    return $clean
}

$ficha = Read-Ficha
$requiredFields = @(
    'htmlLanguage', 'countryCode', 'pageTitle', 'affiliateUrl',
    'cookieTitle', 'cookieText', 'acceptLabel', 'declineLabel',
    'closeAriaLabel', 'detailsLabel', 'faqTitle',
    'offerMainTitle', 'offerIntro', 'offerOverviewTitle', 'offerOverviewText',
    'priceTitle', 'priceText', 'shippingGuaranteeTitle', 'shippingGuaranteeText'
)
$missingFields = @(
    foreach ($field in $requiredFields) {
        if ([string]::IsNullOrWhiteSpace((Get-FichaValue $ficha $field))) { $field }
    }
)
if ($missingFields.Count -gt 0) {
    throw ('Campos obrigatórios ausentes na ficha: ' + ($missingFields -join ', '))
}
if (@($ficha.faqs).Count -notin @($rules.acceptedFaqCounts)) {
    throw 'A ficha deve conter três ou quatro itens em faqs.'
}
foreach ($faq in @($ficha.faqs)) {
    if ([string]::IsNullOrWhiteSpace([string]$faq.question) -or [string]::IsNullOrWhiteSpace([string]$faq.answer)) {
        throw 'Cada FAQ deve conter question e answer.'
    }
}

$htmlLanguage = Get-FichaValue $ficha 'htmlLanguage'
$countryCode = Get-FichaValue $ficha 'countryCode'
$assetFolder = Get-FichaValue $ficha 'assetFolder'
if ([string]::IsNullOrWhiteSpace($assetFolder)) {
    $assetFolder = 'background'
}
if ($htmlLanguage -notmatch '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$') {
    throw 'Código de idioma HTML inválido.'
}
if ($countryCode -notmatch '^[A-Z]{2}$') {
    throw 'Código de país inválido; use duas letras maiúsculas.'
}
if ($assetFolder -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]*$') {
    throw 'Nome da pasta de assets inválido.'
}
$affiliateUri = $null
if (-not [Uri]::TryCreate((Get-FichaValue $ficha 'affiliateUrl'), [UriKind]::Absolute, [ref]$affiliateUri) -or $affiliateUri.Scheme -notin @('http', 'https')) {
    throw 'URL de afiliação inválida.'
}

if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
    throw "Diretório de destino não encontrado: $Destination"
}
foreach ($asset in @('01.png', '02.png', '03.png')) {
    $assetPath = Join-Path (Join-Path $Destination $assetFolder) $asset
    if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
        throw "Asset obrigatório ausente: $assetFolder/$asset"
    }
}

$targetNames = @('index.html', 'styles.css', 'scripts.js')
foreach ($targetName in $targetNames) {
    $targetPath = Join-Path $Destination $targetName
    if (Test-Path -LiteralPath $targetPath) {
        throw "Sobrescrita recusada: $targetPath"
    }
    $templatePath = Join-Path $TemplateRoot $targetName
    if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
        throw "Arquivo do template ausente: $templatePath"
    }
}

$indexTemplate = [System.IO.File]::ReadAllText((Join-Path $TemplateRoot 'index.html'), [System.Text.Encoding]::UTF8)
$indexTemplate = Convert-TemplateIdentifiers $indexTemplate
$faqItems = @($ficha.faqs)
if ($faqItems.Count -eq 3) {
    # Omit only the template's optional fourth pair, before inserting supplied text.
    $fourthFaqPattern = '(?is)<h3\b[^>]*>\s*\{\{FAQ_4_QUESTION\}\}\s*</h3>\s*<p\b[^>]*>\s*\{\{FAQ_4_ANSWER\}\}\s*</p>'
    $indexTemplate = [regex]::Replace($indexTemplate, $fourthFaqPattern, '')
    if ($indexTemplate -match '\{\{FAQ_4_(?:QUESTION|ANSWER)\}\}') {
        throw 'O template não permite omitir com segurança a quarta FAQ.'
    }
}
$replacements = [ordered]@{
    HTML_LANG                 = $htmlLanguage
    PAGE_TITLE               = Encode-Html (Get-FichaValue $ficha 'pageTitle')
    COUNTRY_CODE             = $countryCode
    AFFILIATE_URL            = Encode-Html (Get-FichaValue $ficha 'affiliateUrl')
    COOKIE_CLOSE_ARIA_LABEL  = Encode-Html (Get-FichaValue $ficha 'closeAriaLabel')
    COOKIE_TITLE             = Encode-Html (Get-FichaValue $ficha 'cookieTitle')
    COOKIE_TEXT              = Encode-Html (Get-FichaValue $ficha 'cookieText')
    COOKIE_ACCEPT_LABEL      = Encode-Html (Get-FichaValue $ficha 'acceptLabel')
    COOKIE_DECLINE_LABEL     = Encode-Html (Get-FichaValue $ficha 'declineLabel')
    DETAILS_LABEL            = Encode-Html (Get-FichaValue $ficha 'detailsLabel')
    OFFER_MAIN_TITLE         = Encode-Html (Get-FichaValue $ficha 'offerMainTitle')
    OFFER_INTRO              = Encode-Html (Get-FichaValue $ficha 'offerIntro')
    OFFER_OVERVIEW_TITLE     = Encode-Html (Get-FichaValue $ficha 'offerOverviewTitle')
    OFFER_OVERVIEW_TEXT      = Encode-Html (Get-FichaValue $ficha 'offerOverviewText')
    PRICE_TITLE              = Encode-Html (Get-FichaValue $ficha 'priceTitle')
    PRICE_TEXT               = Encode-Html (Get-FichaValue $ficha 'priceText')
    SHIPPING_GUARANTEE_TITLE = Encode-Html (Get-FichaValue $ficha 'shippingGuaranteeTitle')
    SHIPPING_GUARANTEE_TEXT  = Encode-Html (Get-FichaValue $ficha 'shippingGuaranteeText')
    FAQ_TITLE                = Encode-Html (Get-FichaValue $ficha 'faqTitle')
    FAQ_1_QUESTION           = Encode-Html ([string]$faqItems[0].question)
    FAQ_1_ANSWER             = Encode-Html ([string]$faqItems[0].answer)
    FAQ_2_QUESTION           = Encode-Html ([string]$faqItems[1].question)
    FAQ_2_ANSWER             = Encode-Html ([string]$faqItems[1].answer)
    FAQ_3_QUESTION           = Encode-Html ([string]$faqItems[2].question)
    FAQ_3_ANSWER             = Encode-Html ([string]$faqItems[2].answer)
}
if ($faqItems.Count -eq 4) {
    $replacements['FAQ_4_QUESTION'] = Encode-Html ([string]$faqItems[3].question)
    $replacements['FAQ_4_ANSWER'] = Encode-Html ([string]$faqItems[3].answer)
}

$indexOutput = $indexTemplate
foreach ($entry in $replacements.GetEnumerator()) {
    $indexOutput = $indexOutput.Replace('{{' + $entry.Key + '}}', [string]$entry.Value)
}
$indexOutput = $indexOutput.Replace('./background/03.png', "./$assetFolder/03.png")
if ($indexOutput -match '\{\{[^}]+\}\}') {
    throw 'O template contém placeholders sem valor na ficha.'
}
$charsetMetaPattern = '(?is)<meta\b(?=[^>]*(?:\scharset\s*=|\shttp-equiv\s*=\s*["'']?content-type\b))[^>]*>'
$indexOutput = [regex]::Replace($indexOutput, $charsetMetaPattern, '')
$headMatch = [regex]::Match($indexOutput, '(?is)<head\b[^>]*>')
if (-not $headMatch.Success) {
    throw 'O template HTML precisa conter <head> para declarar a codificação UTF-8.'
}
$indexOutput = $indexOutput.Insert($headMatch.Index + $headMatch.Length, "`r`n    <meta charset=`"UTF-8`">")

$stylesTemplate = [System.IO.File]::ReadAllText((Join-Path $TemplateRoot 'styles.css'), [System.Text.Encoding]::UTF8)
$stylesTemplate = Convert-TemplateIdentifiers $stylesTemplate
$stylesOutput = Get-SafeStylesheet $stylesTemplate
$stylesOutput += @"

/* presell-local-assets */
body.elementor-page-8:not(.elementor-motion-effects-element-type-background),
body.elementor-page-8 > .elementor-motion-effects-container > .elementor-motion-effects-layer,
body {
  background-image: url('./$assetFolder/01.png');
  background-position: top center;
  background-repeat: no-repeat;
  background-size: cover;
  background-attachment: fixed;
  background-color: #d9dde2;
}
@media (max-width: 767px) {
  body.elementor-page-8:not(.elementor-motion-effects-element-type-background),
  body.elementor-page-8 > .elementor-motion-effects-container > .elementor-motion-effects-layer,
  body {
    background-image: url('./$assetFolder/02.png');
    background-size: 100% auto;
    background-attachment: scroll;
    background-color: #d9dde2;
  }

  #${detailsId} .faq-content {
    max-width: none;
    margin: 10px 12px 0;
    padding: 16px;
    border-radius: 14px;
    background: rgba(242, 244, 246, 0.98);
    color: #1f2933;
    box-shadow: 0 8px 24px rgba(31, 41, 51, 0.14);
  }
}

/* presell-cookie-button-alignment */
#cookie-consent-widget-br .ccw-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
}
"@
$primaryButtonColor = Get-FichaValue $ficha 'primaryButtonColor'
$primaryButtonHoverColor = Get-FichaValue $ficha 'primaryButtonHoverColor'
if (-not [string]::IsNullOrWhiteSpace($primaryButtonColor)) {
    if ($primaryButtonColor -notmatch '^#[0-9A-Fa-f]{6}$') {
        throw 'primaryButtonColor deve usar o formato hexadecimal #RRGGBB.'
    }
    if ([string]::IsNullOrWhiteSpace($primaryButtonHoverColor)) {
        $primaryButtonHoverColor = $primaryButtonColor
    }
    elseif ($primaryButtonHoverColor -notmatch '^#[0-9A-Fa-f]{6}$') {
        throw 'primaryButtonHoverColor deve usar o formato hexadecimal #RRGGBB.'
    }

    $stylesOutput += @"

/* presell-primary-button-color */
#cookie-consent-widget-br .ccw-btn-primary {
  background: $primaryButtonColor;
}
#cookie-consent-widget-br .ccw-btn-primary:hover,
#cookie-consent-widget-br .ccw-btn-primary:focus-visible {
  background: $primaryButtonHoverColor;
}
"@
}
$scriptsTemplate = [System.IO.File]::ReadAllText((Join-Path $TemplateRoot 'scripts.js'), [System.Text.Encoding]::UTF8)
$scriptsTemplate = Convert-TemplateIdentifiers $scriptsTemplate
$scriptWithoutComments = [regex]::Replace($scriptsTemplate, '/\*.*?\*/', '', [System.Text.RegularExpressions.RegexOptions]::Singleline).Trim()
$scriptsOutput = if ([string]::IsNullOrWhiteSpace($scriptWithoutComments)) {
    '/* Intencionalmente vazio: esta página não inclui scripts de terceiros. */'
} else {
    if ($scriptsTemplate -match '(?i)clarity|flow\s+tracking|google-analytics|gtag\s*\(|facebook\s+pixel') {
        throw 'O scripts.js do template contém conteúdo proibido.'
    }
    $scriptsTemplate
}

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('presell-' + [Guid]::NewGuid().ToString('N'))
[System.IO.Directory]::CreateDirectory($stagingRoot) | Out-Null
try {
    [System.IO.File]::WriteAllText((Join-Path $stagingRoot 'index.html'), $indexOutput, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $stagingRoot 'styles.css'), $stylesOutput, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $stagingRoot 'scripts.js'), $scriptsOutput, [System.Text.UTF8Encoding]::new($false))

    foreach ($targetName in $targetNames) {
        Copy-Item -LiteralPath (Join-Path $stagingRoot $targetName) -Destination (Join-Path $Destination $targetName) -ErrorAction Stop
    }
}
catch {
    foreach ($targetName in $targetNames) {
        $targetPath = Join-Path $Destination $targetName
        if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
            Remove-Item -LiteralPath $targetPath -Force -ErrorAction SilentlyContinue
        }
    }
    throw
}
finally {
    if (Test-Path -LiteralPath $stagingRoot) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

[PSCustomObject]@{
    module      = 'presell-producer'
    version     = '1.0.0'
    destination = $Destination
    created     = $targetNames
    backgroundPreserved = $true
} | ConvertTo-Json -Depth 4
