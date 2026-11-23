[CmdletBinding()]
param(
    [int]$Port = 8765,
    [switch]$NoOpenBrowser,
    [string]$ProductsRoot,
    [switch]$CentralReadOnlyProxy,
    [switch]$CentralWriteProxy,
    [string]$CentralWriteDatabase
)

$ErrorActionPreference = 'Stop'
if ($CentralWriteProxy -and ($CentralReadOnlyProxy -or [string]::IsNullOrWhiteSpace($CentralWriteDatabase))) { throw 'O modo de escrita exige uma base explícita e exclusiva.' }
if ($CentralWriteProxy) { $CentralWriteDatabase = [IO.Path]::GetFullPath($CentralWriteDatabase) }

$projectRoot = Split-Path -Parent $PSScriptRoot
$siteDirectory = Join-Path $projectRoot 'dist'
$dataDirectory = Join-Path $projectRoot 'data-local'
$centralFlag = Join-Path $dataDirectory 'central-compartilhada.flag'
if (-not $CentralReadOnlyProxy -and -not $CentralWriteProxy -and (Test-Path -LiteralPath $centralFlag -PathType Leaf)) {
    if ((Get-Content -LiteralPath $centralFlag -Raw).Trim() -cne 'hub-central-write-v1') { throw 'A configuração de ativação central é inválida.' }
    $CentralWriteDatabase = [IO.Path]::GetFullPath((Join-Path $dataDirectory 'base-central-compartilhada.sqlite'))
    $CentralWriteProxy = $true
}
$pidFile = Join-Path $dataDirectory 'painel-server.pid'
$urlFile = Join-Path $dataDirectory 'painel-server.url'
$serverUrl = "http://127.0.0.1:$Port/"
$healthUrl = $serverUrl + 'api/presell/health'
$centralDatabase = Join-Path $dataDirectory 'base-central-inicial.sqlite'
$centralScript = Join-Path $PSScriptRoot 'central-isolada\server.mjs'
$centralHealthUrl = 'http://127.0.0.1:18781/health'

function Start-CentralReadOnly {
    if (-not (Test-Path -LiteralPath $centralDatabase -PathType Leaf)) {
        if ($CentralReadOnlyProxy) { Write-Warning 'A base central isolada ainda não está configurada; o modo central não será aberto.' } else { Write-Warning 'A base central isolada ainda não está configurada; o Hub continuará usando a base do navegador.' }
        return $false
    }
    function Test-CentralHealth {
        try {
            $response = Invoke-RestMethod -Uri $centralHealthUrl -TimeoutSec 1
            return $response.service -eq 'hub-central-readonly-v1' -and $response.database -eq $centralDatabase -and $response.hubPort -eq $Port
        } catch { return $false }
    }
    if (Test-CentralHealth) { return $true }
    try {
        $node = Get-Command node.exe -ErrorAction Stop
        $probeCentral = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 18781)
        try { $probeCentral.Start() } finally { $probeCentral.Stop() }
        $centralArgs = '"{0}" "{1}" {2}' -f $centralScript.Replace('"','\"'), $centralDatabase.Replace('"','\"'), $Port
        Start-Process -FilePath $node.Source -ArgumentList $centralArgs -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (Test-CentralHealth) { return $true }
            Start-Sleep -Milliseconds 200
        }
        throw 'O serviço não respondeu com a base esperada.'
    } catch {
        if ($CentralReadOnlyProxy) { Write-Warning "Não foi possível iniciar o serviço central: $($_.Exception.Message). O modo central não será aberto." } else { Write-Warning "Não foi possível iniciar a base central isolada: $($_.Exception.Message). O Hub continuará usando a base do navegador." }
        return $false
    }
}

function Start-CentralWrite {
    if (-not (Test-Path -LiteralPath $CentralWriteDatabase -PathType Leaf)) { throw 'Base central de escrita não encontrada.' }
    $url = 'http://127.0.0.1:18782/health'
    function Test-WriteHealth {
        try { $h = Invoke-RestMethod -Uri $url -TimeoutSec 1 -Proxy $null; return $h.service -ceq 'hub-central-write-v1' -and $h.hubPort -eq $Port -and $h.database -ceq $CentralWriteDatabase } catch { return $false }
    }
    if (Test-WriteHealth) { return }
    $probeWrite = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 18782)
    try { $probeWrite.Start() } finally { $probeWrite.Stop() }
    $node = Get-Command node.exe -ErrorAction Stop
    $script = Join-Path $PSScriptRoot 'central-isolada\server-escrita.mjs'
    $argsLine = '"{0}" "{1}" 18782 {2}' -f $script.Replace('"','\"'), $CentralWriteDatabase.Replace('"','\"'), $Port
    Start-Process -FilePath $node.Source -ArgumentList $argsLine -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
    for ($i = 0; $i -lt 30; $i++) { if (Test-WriteHealth) { return }; Start-Sleep -Milliseconds 200 }
    throw 'Serviço de escrita não está disponível ou recusou a base.'
}

function Open-PanelPage {
    if ($NoOpenBrowser) { return }
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
if ($health -and $health.presellApi -eq 'v2' -and $health.runtime -eq 'powershell' -and $health.instanceId) {
    if ($CentralWriteProxy -and $health.centralWriteProxy -ne $true) { throw 'O servidor ativo não habilitou a rota central de escrita.' }
    if ($CentralWriteProxy) { Start-CentralWrite; Open-PanelPage; exit 0 }
    if ($CentralReadOnlyProxy -and $health.centralReadOnlyProxy -ne $true) { throw 'O servidor ativo não habilitou a rota central de leitura. Encerre-o antes de iniciar este modo.' }
    $centralReady = Start-CentralReadOnly
    if ($CentralReadOnlyProxy -and -not $centralReady) { throw 'A rota central foi solicitada, mas o serviço de leitura não está disponível.' }
    Open-PanelPage
    exit 0
}

try {
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    $probe.Start()
} catch {
    throw "A porta $Port está ocupada por um servidor antigo. Encerre o servidor antigo uma vez e execute novamente. A porta não será trocada porque isso separaria a base IndexedDB."
} finally {
    if ($null -ne $probe) { $probe.Stop() }
}

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$serverScript = Join-Path $PSScriptRoot 'serve-panel.ps1'
$argumentLine = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Port {1}' -f $serverScript.Replace('"','\"'), $Port
if (-not [string]::IsNullOrWhiteSpace($ProductsRoot)) {
    $argumentLine += ' -ProductsRoot "{0}"' -f $ProductsRoot.Replace('"','\"')
}
if ($CentralReadOnlyProxy) { $argumentLine += ' -CentralReadOnlyProxy' }
if ($CentralWriteProxy) { $argumentLine += ' -CentralWriteProxy -CentralReadOnlyPort 18782 -CentralReadOnlyDatabase "{0}"' -f $CentralWriteDatabase.Replace('"','\"') }
$server = Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentLine -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
$server.Id | Set-Content -LiteralPath $pidFile -Encoding ascii
$serverUrl | Set-Content -LiteralPath $urlFile -Encoding ascii

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $hubResponded = $false
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        if ($health.presellApi -eq 'v2') {
            $hubResponded = $true
            if ($CentralWriteProxy) { Start-CentralWrite; Open-PanelPage; exit 0 }
            $centralReady = Start-CentralReadOnly
            if ($CentralReadOnlyProxy -and -not $centralReady) { throw 'A rota central foi solicitada, mas o serviço de leitura não está disponível.' }
            Open-PanelPage
            exit 0
        }
    } catch {
        if (($CentralReadOnlyProxy -and $_.Exception.Message -like '*serviço de leitura*') -or ($CentralWriteProxy -and $hubResponded)) { throw }
        Start-Sleep -Milliseconds 200
    }
}

throw "O servidor PowerShell foi iniciado, mas não respondeu na porta $Port."
