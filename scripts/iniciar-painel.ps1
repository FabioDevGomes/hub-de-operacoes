$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$siteDirectory = Join-Path $projectRoot 'dist'
$dataDirectory = Join-Path $projectRoot 'data-local'
$serverUrl = 'http://127.0.0.1:8765/'

if (-not (Test-Path -LiteralPath (Join-Path $siteDirectory 'index.html'))) {
    throw 'O painel não foi encontrado na pasta dist.'
}

try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $serverUrl -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
        Start-Process $serverUrl
        exit 0
    }
} catch {
    # O servidor ainda não está ativo; a inicialização continua abaixo.
}

$pythonCandidates = @(
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'),
    (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
    (Get-Command py.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

$pythonExe = $pythonCandidates | Select-Object -First 1
if (-not $pythonExe) {
    throw 'Python não foi encontrado. Abra o painel pelo Codex uma vez ou instale o Python.'
}

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$server = Start-Process -FilePath $pythonExe `
    -ArgumentList @((Join-Path $PSScriptRoot 'serve_panel.py'), '--port', '8765', '--bind', '127.0.0.1', '--directory', $siteDirectory) `
    -WorkingDirectory $siteDirectory `
    -WindowStyle Hidden `
    -PassThru
$server.Id | Set-Content -LiteralPath (Join-Path $dataDirectory 'painel-server.pid') -Encoding ascii

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $serverUrl -TimeoutSec 1
        if ($response.StatusCode -eq 200) {
            Start-Process $serverUrl
            exit 0
        }
    } catch {
        Start-Sleep -Milliseconds 250
    }
}

throw 'O servidor foi iniciado, mas o painel não respondeu na porta 8765.'
