[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Destination,

    [ValidateSet('Validate', 'Produce')]
    [string]$Mode = 'Validate',

    [string]$FichaPath,

    [string]$FichaJson,

    [string]$ProductionScript,

    [string]$AssetFolder = 'background',

    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$commonModule = Join-Path $PSScriptRoot '..\modules\Presell.Validation.Common.psm1'
Import-Module -Name $commonModule -Force

function Get-PhaseStatus {
    param([object]$Report)
    if ($Report.overall -eq 'BLOCKED') { return 'BLOCKED' }
    if ($Report.overall -eq 'PASS_WITH_WARNINGS') { return 'PASS_WITH_WARNINGS' }
    return 'PASS'
}

function Get-FichaArguments {
    if (-not [string]::IsNullOrWhiteSpace($FichaPath)) {
        return @('-FichaPath', $FichaPath)
    }
    if (-not [string]::IsNullOrWhiteSpace($FichaJson)) {
        return @('-FichaJson', $FichaJson)
    }
    return @()
}

$phases = [System.Collections.Generic.List[object]]::new()
$structureScript = Join-Path $PSScriptRoot 'Test-PresellStructure.ps1'
$fichaScript = Join-Path $PSScriptRoot 'Test-PresellAgainstFicha.ps1'

# A validação inicial é informativa quando o destino ainda não existe ou está vazio.
if (Test-Path -LiteralPath $Destination -PathType Container) {
    $initial = Invoke-PresellValidator $structureScript @('-Destination', $Destination, '-AssetFolder', $AssetFolder, '-Json')
    $initialStatus = Get-PhaseStatus $initial
    if ($initialStatus -eq 'BLOCKED') {
        $initialStatus = 'PASS_WITH_WARNINGS'
        $initial = [PSCustomObject]@{
            module = $initial.module
            overall = 'PASS_WITH_WARNINGS'
            checks = @($initial.checks)
            note = 'Falhas estruturais iniciais serão reavaliadas após a produção.'
        }
    }
    $phases.Add((New-PresellWorkflowPhase 'initial-structure' $initialStatus $initial))
}
else {
    $phases.Add((New-PresellWorkflowPhase 'initial-structure' 'PASS_WITH_WARNINGS' ([PSCustomObject]@{
        module = 'presell-workflow'
        overall = 'PASS_WITH_WARNINGS'
        checks = @([PSCustomObject]@{name='destination';status='WARN';message='Destino ainda não existe; estado esperado antes da produção.';items=@($Destination)})
    })))
}

if ($Mode -eq 'Produce') {
    if ([string]::IsNullOrWhiteSpace($ProductionScript)) {
        $phases.Add((New-PresellWorkflowPhase 'production' 'BLOCKED' ([PSCustomObject]@{
            module = 'presell-workflow'
            overall = 'BLOCKED'
            checks = @([PSCustomObject]@{name='production-script';status='BLOCK';message='Modo Produce exige -ProductionScript explícito.';items=@()})
        })))
    }
    elseif (-not (Test-Path -LiteralPath $ProductionScript -PathType Leaf)) {
        $phases.Add((New-PresellWorkflowPhase 'production' 'BLOCKED' ([PSCustomObject]@{
            module = 'presell-workflow'
            overall = 'BLOCKED'
            checks = @([PSCustomObject]@{name='production-script';status='BLOCK';message='Script de produção não encontrado.';items=@($ProductionScript)})
        })))
    }
    else {
        $productionArgs = @('-Destination', $Destination) + (Get-FichaArguments)
        & pwsh -NoProfile -File $ProductionScript @productionArgs
        if ($LASTEXITCODE -ne 0) {
            $phases.Add((New-PresellWorkflowPhase 'production' 'BLOCKED' ([PSCustomObject]@{
                module = 'presell-workflow'
                overall = 'BLOCKED'
                checks = @([PSCustomObject]@{name='production';status='BLOCK';message='Script de produção terminou com erro.';items=@("ExitCode: $LASTEXITCODE")})
            })))
        }
        else {
            $phases.Add((New-PresellWorkflowPhase 'production' 'PASS' ([PSCustomObject]@{
                module = 'presell-workflow'
                overall = 'PASS'
                checks = @([PSCustomObject]@{name='production';status='PASS';message='Script de produção terminou com sucesso.';items=@($ProductionScript)})
            })))
        }
    }
}
else {
    $phases.Add((New-PresellWorkflowPhase 'production' 'PASS' ([PSCustomObject]@{
        module = 'presell-workflow'
        overall = 'PASS'
        checks = @([PSCustomObject]@{name='production';status='PASS';message='Produção não executada; modo Validate.';items=@()})
    })))
}

# Validações finais só são executadas quando há uma produção solicitada ou um destino existente.
if ($Mode -eq 'Produce' -or (Test-Path -LiteralPath $Destination -PathType Container)) {
    $finalStructure = Invoke-PresellValidator $structureScript @('-Destination', $Destination, '-AssetFolder', $AssetFolder, '-Json')
    $phases.Add((New-PresellWorkflowPhase 'final-structure' (Get-PhaseStatus $finalStructure) $finalStructure))

    $fichaArgs = Get-FichaArguments
    if ($fichaArgs.Count -eq 0) {
        $phases.Add((New-PresellWorkflowPhase 'ficha' 'BLOCKED' ([PSCustomObject]@{
            module = 'presell-workflow'
            overall = 'BLOCKED'
            checks = @([PSCustomObject]@{name='ficha';status='BLOCK';message='Validação da ficha exige -FichaPath ou -FichaJson.';items=@()})
        })))
    }
    else {
        $fichaReport = Invoke-PresellValidator $fichaScript (@('-Destination', $Destination, '-Json') + $fichaArgs)
        $phases.Add((New-PresellWorkflowPhase 'ficha' (Get-PhaseStatus $fichaReport) $fichaReport))
    }
}

$report = New-PresellWorkflowReport $Destination $Mode $phases
if ($Json) {
    $report | ConvertTo-Json -Depth 12
}
else {
    Write-Output ("RESULTADO: {0}" -f $report.overall)
    foreach ($phase in $report.phases) {
        Write-Output ("[{0}] {1}" -f $phase.status, $phase.name)
    }
}
exit (Get-PresellExitCode $report.overall)
