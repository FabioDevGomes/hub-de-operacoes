function Test-AssetStudioPrivateAddress {
    param([Net.IPAddress]$Address)
    if ($Address.IsIPv4MappedToIPv6) { return Test-AssetStudioPrivateAddress $Address.MapToIPv4() }
    if ($Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) {
        $bytes = $Address.GetAddressBytes()
        return $bytes[0] -eq 0 -or $bytes[0] -eq 10 -or $bytes[0] -eq 127 -or $bytes[0] -ge 224 `
            -or ($bytes[0] -eq 100 -and $bytes[1] -ge 64 -and $bytes[1] -le 127) `
            -or ($bytes[0] -eq 169 -and $bytes[1] -eq 254) `
            -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) `
            -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168) `
            -or ($bytes[0] -eq 198 -and ($bytes[1] -eq 18 -or $bytes[1] -eq 19))
    }
    if ($Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetworkV6) {
        $bytes = $Address.GetAddressBytes()
        return $Address.IsIPv6Loopback -or $Address.IsIPv6LinkLocal -or $Address.IsIPv6SiteLocal `
            -or $Address.IsIPv6Multicast -or ($bytes[0] -band 0xFE) -eq 0xFC
    }
    return $true
}

function Assert-AssetStudioPublicUri {
    param([AllowNull()][object]$Uri)
    $candidate = $Uri
    while ($candidate -is [Array] -and $candidate.Count -eq 1) { $candidate = $candidate[0] }
    if ($candidate -is [Array]) {
        throw [ArgumentException]::new('Informe uma única URL pública HTTP ou HTTPS.')
    }
    if ($candidate -is [Uri]) {
        $parsedUri = $candidate
    } else {
        $uriText = [string]$candidate
        $parsedUri = $null
        if (-not [Uri]::TryCreate($uriText, [UriKind]::Absolute, [ref]$parsedUri)) {
            throw [ArgumentException]::new('Informe uma URL pública HTTP ou HTTPS válida.')
        }
    }
    if (-not $parsedUri.IsAbsoluteUri -or $parsedUri.Scheme -notin @('http', 'https') -or $parsedUri.UserInfo) {
        throw [ArgumentException]::new('Informe uma URL pública HTTP ou HTTPS sem credenciais.')
    }
    $hostName = $parsedUri.DnsSafeHost.Trim('[',']').TrimEnd('.').ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($hostName) -or $hostName -eq 'localhost' -or $hostName.EndsWith('.localhost') -or $hostName.EndsWith('.local') -or $hostName.EndsWith('.internal') -or $hostName.EndsWith('.home')) {
        throw [ArgumentException]::new('A captura aceita somente páginas públicas.')
    }
    $address = $null
    if ([Net.IPAddress]::TryParse($hostName, [ref]$address)) {
        if (Test-AssetStudioPrivateAddress $address) { throw [ArgumentException]::new('A captura aceita somente páginas públicas.') }
        return
    }
    try { $addresses = @([Net.Dns]::GetHostAddresses($hostName)) }
    catch { throw [ArgumentException]::new('Não foi possível resolver o domínio da URL informada.') }
    if (-not $addresses.Count -or @($addresses | Where-Object { Test-AssetStudioPrivateAddress $_ }).Count) {
        throw [ArgumentException]::new('A captura aceita somente domínios resolvidos para endereços públicos.')
    }
}
function Receive-AssetStudioCdpMessage {
    param([Net.WebSockets.ClientWebSocket]$Socket, [int]$TimeoutMilliseconds = 30000)
    $buffer = [byte[]]::new(32768)
    $message = [IO.MemoryStream]::new()
    try {
        do {
            $timeout = [Threading.CancellationTokenSource]::new($TimeoutMilliseconds)
            try {
                $received = $Socket.ReceiveAsync([ArraySegment[byte]]::new($buffer, 0, $buffer.Length), $timeout.Token).GetAwaiter().GetResult()
            } catch [OperationCanceledException] {
                throw [TimeoutException]::new('O navegador demorou demais para responder à captura.')
            } finally {
                $timeout.Dispose()
            }
            if ($received.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) {
                throw [InvalidOperationException]::new('O navegador encerrou a sessão de captura.')
            }
            $message.Write($buffer, 0, $received.Count)
        } while (-not $received.EndOfMessage)
        return [Text.Encoding]::UTF8.GetString($message.ToArray()) | ConvertFrom-Json
    } finally {
        $message.Dispose()
    }
}

function Invoke-AssetStudioCdpCommand {
    param(
        [Net.WebSockets.ClientWebSocket]$Socket,
        [string]$Method,
        [hashtable]$Parameters = @{}
    )
    $script:assetStudioCaptureCommandId++
    $commandId = $script:assetStudioCaptureCommandId
    $json = @{ id = $commandId; method = $Method; params = $Parameters } | ConvertTo-Json -Depth 12 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $Socket.SendAsync([ArraySegment[byte]]::new($bytes, 0, $bytes.Length), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    while ($true) {
        $response = Receive-AssetStudioCdpMessage -Socket $Socket
        if ($response.id -ne $commandId) { continue }
        if ($response.error) { throw [InvalidOperationException]::new([string]$response.error.message) }
        return $response.result
    }
}

function Get-AssetStudioCdpValue {
    param([Net.WebSockets.ClientWebSocket]$Socket, [string]$Expression)
    $response = Invoke-AssetStudioCdpCommand -Socket $Socket -Method 'Runtime.evaluate' -Parameters @{
        expression = $Expression
        returnByValue = $true
        awaitPromise = $true
    }
    if ($response.exceptionDetails) { throw [InvalidOperationException]::new('A página não permitiu ler o estado necessário para concluir a captura.') }
    return $response.result.value
}

function Get-AssetStudioFavicon {
    param([string]$Url, [string]$PageUrl)
    $currentUri = [Uri]$Url
    for ($redirect = 0; $redirect -le 5; $redirect++) {
        Assert-AssetStudioPublicUri -Uri $currentUri
        $request = [Net.HttpWebRequest]::Create($currentUri)
        $request.Method = 'GET'
        $request.UserAgent = 'Mozilla/5.0 Hub Asset Studio local capture'
        $request.Accept = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        $request.Referer = $PageUrl
        $request.AllowAutoRedirect = $false
        $request.Timeout = 20000
        $request.ReadWriteTimeout = 20000
        $response = $null
        try { $response = [Net.HttpWebResponse]$request.GetResponse() }
        catch [Net.WebException] {
            $response = $_.Exception.Response
            if (-not $response) { return $null }
        }
        try {
            $status = [int]$response.StatusCode
            if ($status -ge 300 -and $status -lt 400) {
                $locationValues = @($response.Headers.GetValues('Location'))
                $location = if ($locationValues.Count) { [string]$locationValues[0] } else { '' }
                if ([string]::IsNullOrWhiteSpace($location) -or $redirect -eq 5) { return $null }
                $currentUri = [Uri]::new($currentUri, [string]$location)
                continue
            }
            if ($status -ne 200 -or ($response.ContentLength -gt 5MB)) { return $null }
            $stream = $response.GetResponseStream()
            $memory = [IO.MemoryStream]::new()
            try {
                $buffer = [byte[]]::new(8192)
                while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    if ($memory.Length + $read -gt 5MB) { return $null }
                    $memory.Write($buffer, 0, $read)
                }
                $bytes = $memory.ToArray()
            } finally {
                $stream.Dispose()
                $memory.Dispose()
            }
            if (-not $bytes.Length) { return $null }
            $contentType = ([string]$response.ContentType -split ';', 2)[0].Trim().ToLowerInvariant()
            $extension = [IO.Path]::GetExtension($currentUri.AbsolutePath).ToLowerInvariant()
            if (-not $contentType.StartsWith('image/')) {
                $contentType = switch ($extension) {
                    '.svg' { 'image/svg+xml' }
                    '.png' { 'image/png' }
                    '.jpg' { 'image/jpeg' }
                    '.jpeg' { 'image/jpeg' }
                    '.webp' { 'image/webp' }
                    '.ico' { 'image/x-icon' }
                    default { '' }
                }
            }
            if (-not $contentType.StartsWith('image/')) { return $null }
            $fileName = if ($extension -match '^\.(?:svg|png|jpe?g|webp|ico|gif)$') { '03' + $extension } else { '03.png' }
            return @{ data = [Convert]::ToBase64String($bytes); contentType = $contentType; fileName = $fileName }
        } finally {
            $response.Dispose()
        }
    }
    return $null
}

function Get-AssetStudioCapture {
    param([string]$Body, [int]$Port = 8765)
    try { $payload = $Body | ConvertFrom-Json }
    catch { throw [ArgumentException]::new('O pedido de captura não contém JSON válido.') }
    $urlText = ([string]$payload.url).Trim()
    if (-not $urlText -or $urlText.Length -gt 4096) { throw [ArgumentException]::new('A entrega selecionada não tem um link de afiliado válido.') }
    try { $pageUri = [Uri]::new($urlText) }
    catch { throw [ArgumentException]::new('O link de afiliado não é uma URL válida.') }
    Assert-AssetStudioPublicUri -Uri $pageUri

    $chromePath = Find-ChromeExecutable
    if (-not $chromePath) { throw [InvalidOperationException]::new('O Google Chrome não foi localizado para executar a captura local.') }
    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('hub-asset-studio-capture-' + [guid]::NewGuid().ToString('N'))
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $fullTempRoot = [IO.Path]::GetFullPath($tempRoot)
    if (-not $fullTempRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw [InvalidOperationException]::new('Não foi possível preparar a pasta temporária isolada da captura.')
    }
    $profileRoot = Join-Path $fullTempRoot 'profile'
    $devToolsFile = Join-Path $profileRoot 'DevToolsActivePort'
    $chromeProcess = $null
    $socket = $null
    try {
        [IO.Directory]::CreateDirectory($profileRoot) | Out-Null
        $arguments = '--headless=new --no-first-run --no-default-browser-check --disable-background-networking --disable-extensions --remote-debugging-port=0 --user-data-dir="{0}" about:blank' -f $profileRoot
        $chromeProcess = Start-Process -FilePath $chromePath -ArgumentList $arguments -WindowStyle Hidden -PassThru -ErrorAction Stop
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        while (-not (Test-Path -LiteralPath $devToolsFile -PathType Leaf) -and [DateTime]::UtcNow -lt $deadline) {
            if ($chromeProcess.HasExited) { throw [InvalidOperationException]::new('O Chrome encerrou antes de iniciar a captura.') }
            Start-Sleep -Milliseconds 200
        }
        if (-not (Test-Path -LiteralPath $devToolsFile -PathType Leaf)) { throw [TimeoutException]::new('O Chrome não iniciou a interface local de captura.') }
        $activePortLines = [IO.File]::ReadAllLines($devToolsFile)
        $debugPort = 0
        if ($activePortLines.Count -lt 2 -or -not [int]::TryParse($activePortLines[0], [ref]$debugPort) -or $debugPort -lt 1 -or $debugPort -gt 65535) {
            throw [InvalidOperationException]::new('O Chrome não forneceu uma porta de depuração válida.')
        }
        $targets = @(Invoke-RestMethod -Uri "http://127.0.0.1:$debugPort/json/list" -Method Get -TimeoutSec 5)
        $target = $targets | Where-Object { $_.type -eq 'page' -and $_.webSocketDebuggerUrl } | Select-Object -First 1
        if (-not $target) { throw [InvalidOperationException]::new('O Chrome não abriu a aba temporária para a captura.') }
        $webSocketUri = [Uri]$target.webSocketDebuggerUrl
        if ($webSocketUri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw [InvalidOperationException]::new('A sessão de captura retornou um endereço de depuração inesperado.') }
        if ($webSocketUri.Host -ne '127.0.0.1') {
            $builder = [UriBuilder]::new($webSocketUri)
            $builder.Host = '127.0.0.1'
            $webSocketUri = $builder.Uri
        }
        $socket = [Net.WebSockets.ClientWebSocket]::new()
        $socket.ConnectAsync($webSocketUri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $script:assetStudioCaptureCommandId = 0
        Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Page.enable' | Out-Null
        Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Runtime.enable' | Out-Null
        Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Network.enable' | Out-Null
        $blockedUrls = @(
            '*://localhost/*', '*://*.localhost/*', '*://127.*/*', '*://10.*/*', '*://192.168.*/*',
            '*://169.254.*/*', '*://172.16.*/*', '*://172.17.*/*', '*://172.18.*/*', '*://172.19.*/*',
            '*://172.2*/*', '*://172.3*/*', '*://[::1]/*', '*://*.local/*', '*://*.internal/*', 'file:///*'
        )
        Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Network.setBlockedURLs' -Parameters @{ urls = $blockedUrls } | Out-Null
        Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Emulation.setDeviceMetricsOverride' -Parameters @{
            width = 1892; height = 908; deviceScaleFactor = 1; mobile = $false; screenWidth = 1892; screenHeight = 908
        } | Out-Null
        $navigation = Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Page.navigate' -Parameters @{ url = $pageUri.AbsoluteUri }
        if ($navigation.errorText) { throw [InvalidOperationException]::new('O Chrome não conseguiu abrir a página de origem.') }
        $pageReady = $false
        $loadDeadline = [DateTime]::UtcNow.AddSeconds(60)
        while ([DateTime]::UtcNow -lt $loadDeadline) {
            if ($chromeProcess.HasExited) { throw [InvalidOperationException]::new('O Chrome encerrou antes de concluir a navegação.') }
            Start-Sleep -Milliseconds 400
            try {
                if ((Get-AssetStudioCdpValue -Socket $socket -Expression 'document.readyState') -eq 'complete') { $pageReady = $true; break }
            } catch { }
        }
        if (-not $pageReady) { throw [TimeoutException]::new('A página não terminou de carregar dentro do tempo permitido.') }
        $finalPageUrl = [string](Get-AssetStudioCdpValue -Socket $socket -Expression 'location.href')
        try { Assert-AssetStudioPublicUri -Uri ([Uri]$finalPageUrl) }
        catch { throw [InvalidOperationException]::new('A página redirecionou para um destino não público; a captura foi interrompida.') }
        Start-Sleep -Milliseconds 1200
        $desktopResult = Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Page.captureScreenshot' -Parameters @{
            format = 'png'; fromSurface = $true; captureBeyondViewport = $false
        }
        if (-not $desktopResult.data -or $desktopResult.data.Length -gt 16MB) { throw [InvalidOperationException]::new('A captura Desktop ficou vazia ou excedeu o limite permitido.') }

        Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Emulation.setDeviceMetricsOverride' -Parameters @{
            width = 393; height = 852; deviceScaleFactor = 1; mobile = $true; screenWidth = 393; screenHeight = 852;
            screenOrientation = @{ type = 'portraitPrimary'; angle = 0 }
        } | Out-Null
        Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Emulation.setTouchEmulationEnabled' -Parameters @{ enabled = $true; maxTouchPoints = 1 } | Out-Null
        Start-Sleep -Milliseconds 600
        $mobileResult = Invoke-AssetStudioCdpCommand -Socket $socket -Method 'Page.captureScreenshot' -Parameters @{
            format = 'png'; fromSurface = $true; captureBeyondViewport = $false
        }
        if (-not $mobileResult.data -or $mobileResult.data.Length -gt 16MB) { throw [InvalidOperationException]::new('A captura Mobile ficou vazia ou excedeu o limite permitido.') }

        $favicon = $null
        $faviconStatus = 'missing'
        try {
            $faviconUrl = [string](Get-AssetStudioCdpValue -Socket $socket -Expression "(() => { const icon = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]'); return icon?.href || new URL('/favicon.ico', location.href).href; })()")
            if ($faviconUrl) {
                $favicon = Get-AssetStudioFavicon -Url $faviconUrl -PageUrl $finalPageUrl
                if ($favicon) { $faviconStatus = 'found' }
                else { $faviconStatus = 'unavailable' }
            }
        } catch { $faviconStatus = 'unavailable' }

        return @{
            desktop = @{ data = [string]$desktopResult.data; contentType = 'image/png'; fileName = '01.png' }
            mobile = @{ data = [string]$mobileResult.data; contentType = 'image/png'; fileName = '02.png' }
            favicon = $favicon
            faviconStatus = $faviconStatus
        }
    } finally {
        if ($socket) {
            try { $socket.Dispose() } catch { }
        }
        if ($chromeProcess -and -not $chromeProcess.HasExited) {
            try { $chromeProcess.Kill(); $chromeProcess.WaitForExit(5000) | Out-Null } catch { }
        }
        if (Test-Path -LiteralPath $fullTempRoot -PathType Container) {
            try { [IO.Directory]::Delete($fullTempRoot, $true) } catch { }
        }
    }
}
