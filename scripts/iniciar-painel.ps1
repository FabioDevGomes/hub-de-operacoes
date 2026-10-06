$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$siteDirectory = Join-Path $projectRoot 'dist'
$dataDirectory = Join-Path $projectRoot 'data-local'
$pidFile = Join-Path $dataDirectory 'painel-server.pid'
$urlFile = Join-Path $dataDirectory 'painel-server.url'
$port = 8765
$serverUrl = 'http://127.0.0.1:8765/'
$healthUrl = $serverUrl + 'api/presell/health'

function Open-PanelPage {
    try {
        Start-Process $serverUrl
    } catch {
        Write-Warning "O servidor está ativo, mas não foi possível abrir o navegador automaticamente. Acesse $serverUrl"
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $siteDirectory 'index.html'))) {
    throw 'O painel não foi encontrado na pasta dist.'
}

$health = $null
try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
} catch {
    # O servidor independente ainda não está ativo na origem persistente.
}
if ($health -and $health.presellApi -eq 'v2' -and $health.runtime -eq 'powershell') {
    Open-PanelPage
    exit 0
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
            Open-PanelPage
            exit 0
        }
    } catch {
        Start-Sleep -Milliseconds 200
    }
}

throw "O servidor PowerShell foi iniciado, mas não respondeu na porta $port."
