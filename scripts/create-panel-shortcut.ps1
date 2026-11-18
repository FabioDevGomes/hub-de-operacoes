[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$launcherPath = Join-Path $projectRoot 'iniciar-painel.cmd'
$iconPath = Join-Path $projectRoot 'src\panel-launcher.ico'
$shortcutPath = Join-Path $projectRoot 'Iniciar Hub.lnk'

if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
    throw 'O inicializador iniciar-painel.cmd não foi encontrado.'
}
if (-not (Test-Path -LiteralPath $iconPath -PathType Leaf)) {
    throw 'O ícone do inicializador não foi encontrado em src\panel-launcher.ico.'
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'Inicia o Hub no navegador local.'
$shortcut.Save()

Write-Output "Atalho atualizado: $shortcutPath"
