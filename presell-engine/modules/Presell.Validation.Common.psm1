Set-StrictMode -Version Latest

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

    $output = & pwsh -NoProfile -File $ScriptPath @Arguments 2>&1 | Out-String
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

Export-ModuleMember -Function Get-PresellOverall, New-PresellWorkflowPhase, Invoke-PresellValidator, New-PresellWorkflowReport, Get-PresellExitCode
