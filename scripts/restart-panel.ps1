[CmdletBinding()]
param(
    [Parameter(Mandatory)][int]$ServerProcessId,
    [Parameter(Mandatory)][long]$ServerProcessStartUtcTicks,
    [int]$Port = 8765,
    [string]$ProductsRoot
)

$ErrorActionPreference = 'Stop'
$deadline = [DateTime]::UtcNow.AddSeconds(30)

while ([DateTime]::UtcNow -lt $deadline) {
    $serverProcess = Get-Process -Id $ServerProcessId -ErrorAction SilentlyContinue
    if ($null -eq $serverProcess) { break }
    try { $matchesOriginalProcess = $serverProcess.StartTime.ToUniversalTime().Ticks -eq $ServerProcessStartUtcTicks }
    catch { $matchesOriginalProcess = $false }
    if (-not $matchesOriginalProcess) { break }
    Start-Sleep -Milliseconds 200
}

$remainingProcess = Get-Process -Id $ServerProcessId -ErrorAction SilentlyContinue
if ($null -ne $remainingProcess) {
    try { $stillOriginalProcess = $remainingProcess.StartTime.ToUniversalTime().Ticks -eq $ServerProcessStartUtcTicks }
    catch { $stillOriginalProcess = $false }
    if ($stillOriginalProcess) { throw 'O servidor anterior não encerrou dentro do tempo esperado.' }
}

$launcher = Join-Path $PSScriptRoot 'iniciar-painel.ps1'
$launchParameters = @{ Port = $Port; NoOpenBrowser = $true }
if (-not [string]::IsNullOrWhiteSpace($ProductsRoot)) { $launchParameters.ProductsRoot = $ProductsRoot }
& $launcher @launchParameters
