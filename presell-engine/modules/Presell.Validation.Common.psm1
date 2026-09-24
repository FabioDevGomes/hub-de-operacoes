Set-StrictMode -Version Latest

function Get-PresellPowerShellExecutable {
    try {
        $processExecutable = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
        if (-not [string]::IsNullOrWhiteSpace($processExecutable) -and (Test-Path -LiteralPath $processExecutable -PathType Leaf)) {
            return $processExecutable
        }
    }
    catch {
        # Continua para os métodos de detecção compatíveis com o host.
    }

    try {
        $currentProcess = Get-Process -Id $PID -ErrorAction Stop
        if (-not [string]::IsNullOrWhiteSpace($currentProcess.Path) -and (Test-Path -LiteralPath $currentProcess.Path -PathType Leaf)) {
            return $currentProcess.Path
        }
    }
    catch {
        # Usa os fallbacks abaixo quando o caminho do processo não estiver acessível.
    }

    $executableName = if ($PSVersionTable.PSEdition -eq 'Core') { 'pwsh.exe' } else { 'powershell.exe' }
    $engineDirectory = $PSHOME
    if ([string]::IsNullOrWhiteSpace($engineDirectory)) {
        try {
            $engineAssemblyPath = [System.Management.Automation.PSObject].Assembly.Location
            if (-not [string]::IsNullOrWhiteSpace($engineAssemblyPath)) {
                $engineDirectory = [System.IO.Path]::GetDirectoryName($engineAssemblyPath)
            }
        }
        catch {
            $engineDirectory = $null
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($engineDirectory)) {
        $hostExecutable = Join-Path -Path $engineDirectory -ChildPath $executableName
        if (Test-Path -LiteralPath $hostExecutable -PathType Leaf) { return $hostExecutable }
    }

    foreach ($commandName in @('pwsh.exe', 'powershell.exe')) {
        $command = Get-Command -Name $commandName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace($command.Source)) { return $command.Source }
    }

    throw 'Nenhum executável do PowerShell foi encontrado para executar os validadores locais.'
}

function Get-PresellOverall {
    param([object[]]$Checks)

    if (@($Checks | Where-Object status -eq 'BLOCK').Count -gt 0) { return 'BLOCKED' }
    if (@($Checks | Where-Object status -eq 'WARN').Count -gt 0) { return 'PASS_WITH_WARNINGS' }
    return 'PASS'
}

function New-PresellWorkflowPhase {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][object]$Report
    )

    [PSCustomObject]@{
        name    = $Name
        status  = $Status
        report  = $Report
    }
}

function Invoke-PresellValidator {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) {
        return [PSCustomObject]@{
            module  = 'workflow'
            overall = 'BLOCKED'
            checks  = @([PSCustomObject]@{
                name = 'validator-script'
                status = 'BLOCK'
                message = 'Validador não encontrado.'
                items = @($ScriptPath)
            })
        }
    }

    $powerShellExecutable = Get-PresellPowerShellExecutable
    $output = & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    try {
        $report = $output | ConvertFrom-Json
    }
    catch {
        return [PSCustomObject]@{
            module  = 'workflow'
            overall = 'BLOCKED'
            checks  = @([PSCustomObject]@{
                name = 'validator-output'
                status = 'BLOCK'
                message = 'Validador produziu uma saída que não pôde ser interpretada.'
                items = @($ScriptPath, "ExitCode: $exitCode")
            })
        }
    }
    return $report
}

function New-PresellWorkflowReport {
    param(
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$Mode,
        [Parameter(Mandatory = $true)][object[]]$Phases
    )

    $phaseStatuses = @($Phases | ForEach-Object status)
    $overall = if ($phaseStatuses -contains 'BLOCKED') { 'BLOCKED' }
               elseif ($phaseStatuses -contains 'PASS_WITH_WARNINGS') { 'PASS_WITH_WARNINGS' }
               else { 'PASS' }

    [PSCustomObject]@{
        module      = 'presell-workflow'
        version     = '1.0.0'
        destination = $Destination
        mode        = $Mode
        readOnly    = ($Mode -eq 'Validate')
        overall     = $overall
        phases      = @($Phases)
    }
}

function Get-PresellExitCode {
    param([Parameter(Mandatory = $true)][string]$Overall)

    if ($Overall -eq 'BLOCKED') { return 2 }
    if ($Overall -eq 'PASS_WITH_WARNINGS') { return 1 }
    return 0
}

Export-ModuleMember -Function Get-PresellPowerShellExecutable, Get-PresellOverall, New-PresellWorkflowPhase, Invoke-PresellValidator, New-PresellWorkflowReport, Get-PresellExitCode
