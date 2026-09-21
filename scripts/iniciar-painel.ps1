$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$siteDirectory = Join-Path $projectRoot 'dist'
$dataDirectory = Join-Path $projectRoot 'data-local'
$pidFile = Join-Path $dataDirectory 'painel-server.pid'
$urlFile = Join-Path $dataDirectory 'painel-server.url'
$port = 8765
$serverUrl = 'http://127.0.0.1:8765/'
$healthUrl = $serverUrl + 'api/presell/health'

if (-not (Test-Path -LiteralPath (Join-Path $siteDirectory 'index.html'))) {
    throw 'O painel não foi encontrado na pasta dist.'
}

try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
    if ($health.presellApi -eq 'v2' -and $health.runtime -eq 'powershell') {
        Start-Process $serverUrl
        exit 0
    }
} catch {
    # O servidor independente ainda não está ativo na origem persistente.
}

try {
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    $probe.Start()
} catch {
    throw 'A porta 8765 está ocupada por um servidor antigo. Encerre o servidor antigo uma vez e execute novamente. A porta não será trocada porque isso separaria a base IndexedDB.'
} finally {
    if ($null -ne $probe) { $probe.Stop() }
}

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$serverScript = Join-Path $PSScriptRoot 'serve-panel.ps1'
$argumentLine = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Port {1}' -f $serverScript.Replace('"','\"'), $port
$server = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentLine -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
$server.Id | Set-Content -LiteralPath $pidFile -Encoding ascii
$serverUrl | Set-Content -LiteralPath $urlFile -Encoding ascii

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        if ($health.presellApi -eq 'v2') {
            Start-Process $serverUrl
            exit 0
        }
    } catch {
        Start-Sleep -Milliseconds 200
    }
}

throw "O servidor PowerShell foi iniciado, mas não respondeu na porta $port."
