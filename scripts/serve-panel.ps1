[CmdletBinding()]
param(
    [int]$Port = 8765,
    [string]$ProductsRoot
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$siteDirectory = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$engineRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'presell-engine'))
if ([string]::IsNullOrWhiteSpace($ProductsRoot)) {
    if ($projectRoot -match '^(?<Profile>[A-Za-z]:\\Users\\[^\\]+)(?:\\|$)') {
        $trafficFolder = 'tr' + [char]0x00E1 + 'fego pago'
        $ProductsRoot = Join-Path $Matches.Profile (Join-Path 'OneDrive' (Join-Path $trafficFolder 'produtos'))
    } else {
        throw 'Informe ProductsRoot explicitamente; não foi possível identificar o perfil proprietário do projeto.'
    }
}
$resolvedProductsRoot = [IO.Path]::GetFullPath($ProductsRoot)
$templateRoot = Join-Path $resolvedProductsRoot 'template\presell-cookie-base'

function Get-StatusReason {
    param([int]$StatusCode)
    switch ($StatusCode) {
        200 { 'OK' }
        400 { 'Bad Request' }
        404 { 'Not Found' }
        405 { 'Method Not Allowed' }
        413 { 'Payload Too Large' }
        500 { 'Internal Server Error' }
        default { 'Error' }
    }
}

function Write-HttpResponse {
    param(
        [IO.Stream]$Stream,
        [int]$StatusCode,
        [string]$ContentType,
        [byte[]]$Body
    )
    $reason = Get-StatusReason $StatusCode
    $header = "HTTP/1.1 $StatusCode $reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store, no-cache, must-revalidate, max-age=0`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
    $Stream.Flush()
}

function Write-JsonResponse {
    param([IO.Stream]$Stream, [int]$StatusCode, [object]$Payload)
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Depth 30 -Compress))
    Write-HttpResponse $Stream $StatusCode 'application/json; charset=utf-8' $bytes
}

function Read-HttpRequest {
    param([IO.Stream]$Stream)
    $headerBuffer = New-Object IO.MemoryStream
    $previous3 = -1
    $previous2 = -1
    $previous1 = -1
    try {
        while ($headerBuffer.Length -lt 65536) {
            $current = $Stream.ReadByte()
            if ($current -lt 0) { throw 'Conexão encerrada antes do cabeçalho HTTP.' }
            $headerBuffer.WriteByte([byte]$current)
            if ($previous3 -eq 13 -and $previous2 -eq 10 -and $previous1 -eq 13 -and $current -eq 10) { break }
            $previous3 = $previous2
            $previous2 = $previous1
            $previous1 = $current
        }
        if ($headerBuffer.Length -ge 65536) { throw 'Cabeçalho HTTP muito grande.' }
        $headerText = [Text.Encoding]::ASCII.GetString($headerBuffer.ToArray())
    } finally {
        $headerBuffer.Dispose()
    }

    $lines = $headerText -split "`r`n"
    $requestLine = $lines[0] -split ' ', 3
    if ($requestLine.Count -ne 3) { throw 'Linha de requisição HTTP inválida.' }
    $headers = @{}
    foreach ($line in $lines[1..($lines.Count - 1)]) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $separator = $line.IndexOf(':')
        if ($separator -gt 0) { $headers[$line.Substring(0, $separator).Trim()] = $line.Substring($separator + 1).Trim() }
    }

    $contentLength = 0
    if ($headers.ContainsKey('Content-Length') -and -not [int]::TryParse($headers['Content-Length'], [ref]$contentLength)) {
        throw 'Content-Length inválido.'
    }
    if ($contentLength -lt 0 -or $contentLength -gt 200000) { throw 'O tamanho da ficha é inválido.' }
    $bodyBytes = New-Object byte[] $contentLength
    $offset = 0
    while ($offset -lt $contentLength) {
        $read = $Stream.Read($bodyBytes, $offset, $contentLength - $offset)
        if ($read -le 0) { throw 'Conexão encerrada antes do corpo HTTP.' }
        $offset += $read
    }
    return @{
        Method = $requestLine[0].ToUpperInvariant()
        Target = $requestLine[1]
        Body = [Text.Encoding]::UTF8.GetString($bodyBytes)
    }
}

function Resolve-SafeDestination {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'O diretório de destino é obrigatório.' }
    $destination = [IO.Path]::GetFullPath($Value)
    $rootPrefix = $resolvedProductsRoot.TrimEnd('\') + '\'
    if (-not $destination.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'O destino deve ficar dentro da pasta local de produtos.' }
    $relative = $destination.Substring($rootPrefix.Length)
    if (($relative -split '[\\/]').Count -lt 2) { throw 'Informe uma pasta de página dentro de um produto.' }
    return $destination
}

function Get-ContentType {
    param([string]$Path)
    switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { 'text/html; charset=utf-8' }
        '.js'   { 'text/javascript; charset=utf-8' }
        '.mjs'  { 'text/javascript; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.svg'  { 'image/svg+xml' }
        default { 'application/octet-stream' }
    }
}

function Invoke-PresellApi {
    param([string]$Body, [bool]$Produce)
    if ([string]::IsNullOrWhiteSpace($Body)) { throw 'Envie uma ficha JSON válida.' }
    $payload = $Body | ConvertFrom-Json
    if ($null -eq $payload.ficha) { throw 'Envie uma ficha JSON válida.' }
    $rawDestination = if ($payload.destination) { [string]$payload.destination } else { [string]$payload.ficha.destination }
    $destination = Resolve-SafeDestination $rawDestination
    $fichaJson = $payload.ficha | ConvertTo-Json -Depth 30 -Compress
    $assetFolder = if ($payload.ficha.assetFolder) { [string]$payload.ficha.assetFolder } else { 'assets' }
    $workflow = Join-Path $engineRoot 'tools\Invoke-PresellWorkflow.ps1'
    $temporaryFicha = Join-Path ([IO.Path]::GetTempPath()) ("presell-ficha-{0}.json" -f [Guid]::NewGuid().ToString('N'))
    try {
        [IO.File]::WriteAllText($temporaryFicha, $fichaJson, [Text.UTF8Encoding]::new($false))
        if ($Produce) {
            $producer = Join-Path $engineRoot 'tools\New-PresellFromFicha.ps1'
            $null = & $producer -Destination $destination -FichaPath $temporaryFicha -TemplateRoot $templateRoot
        }
        $reportText = (& $workflow -Destination $destination -Mode Validate -FichaPath $temporaryFicha -AssetFolder $assetFolder -Json | Out-String).Trim()
        return @{ report = ($reportText | ConvertFrom-Json) }
    } finally {
        if (Test-Path -LiteralPath $temporaryFicha -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryFicha -Force
        }
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $siteDirectory 'index.html') -PathType Leaf)) { throw 'O painel não foi encontrado na pasta dist.' }
foreach ($required in @('tools\New-PresellFromFicha.ps1','tools\Invoke-PresellWorkflow.ps1','tools\Test-PresellStructure.ps1','tools\Test-PresellAgainstFicha.ps1','modules\Presell.Validation.Common.psm1','config\presell-rules.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $engineRoot $required) -PathType Leaf)) { throw "Componente de pre-sell ausente: $required" }
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 15000
            $client.SendTimeout = 15000
            $stream = $client.GetStream()
            $request = Read-HttpRequest $stream
            $path = [Uri]::UnescapeDataString(($request.Target -split '\?', 2)[0])
            if ($request.Method -eq 'GET' -and $path -eq '/api/presell/health') {
                Write-JsonResponse $stream 200 @{ presellApi = 'v2'; runtime = 'powershell'; engine = 'embedded' }
                continue
            }
            if ($request.Method -eq 'POST' -and $path -in @('/api/presell/validate','/api/presell/produce')) {
                Write-JsonResponse $stream 200 (Invoke-PresellApi $request.Body ($path -eq '/api/presell/produce'))
                continue
            }
            if ($request.Method -ne 'GET') {
                Write-JsonResponse $stream 405 @{ error = 'Método não permitido.' }
                continue
            }
            $relative = [Uri]::UnescapeDataString($path.TrimStart('/')).Replace('/', [IO.Path]::DirectorySeparatorChar)
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
            $candidate = [IO.Path]::GetFullPath((Join-Path $siteDirectory $relative))
            $sitePrefix = $siteDirectory.TrimEnd('\') + '\'
            if (Test-Path -LiteralPath $candidate -PathType Container) { $candidate = Join-Path $candidate 'index.html' }
            if (-not $candidate.StartsWith($sitePrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                Write-JsonResponse $stream 404 @{ error = 'Arquivo não encontrado.' }
                continue
            }
            $bytes = [IO.File]::ReadAllBytes($candidate)
            Write-HttpResponse $stream 200 (Get-ContentType $candidate) $bytes
        } catch {
            try {
                if ($null -ne $stream -and $stream.CanWrite) { Write-JsonResponse $stream 400 @{ error = $_.Exception.Message } }
            } catch { }
        } finally {
            if ($null -ne $stream) { $stream.Dispose() }
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
