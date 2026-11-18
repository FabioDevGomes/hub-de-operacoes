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

    [switch]$AssetStudioValidated,

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

function Get-SkipFaviconArguments {
    $fichaText = ''
    if (-not [string]::IsNullOrWhiteSpace($FichaPath) -and (Test-Path -LiteralPath $FichaPath -PathType Leaf)) {
        $fichaText = [System.IO.File]::ReadAllText($FichaPath, [System.Text.Encoding]::UTF8)
    }
    elseif (-not [string]::IsNullOrWhiteSpace($FichaJson)) {
        $fichaText = $FichaJson
    }
    if ([string]::IsNullOrWhiteSpace($fichaText)) { return @() }
    try {
        $ficha = $fichaText | ConvertFrom-Json -ErrorAction Stop
        if ($ficha.skipFavicon -is [bool] -and $ficha.skipFavicon) { return @('-SkipFavicon') }
    }
    catch { }
    return @()
}

function Get-AssetStudioValidatedArguments {
    if ($AssetStudioValidated) { return @('-AssetStudioValidated') }
    return @()
}

$phases = [System.Collections.Generic.List[object]]::new()
$structureScript = Join-Path $PSScriptRoot 'Test-PresellStructure.ps1'
$fichaScript = Join-Path $PSScriptRoot 'Test-PresellAgainstFicha.ps1'

# A validação inicial é informativa quando o destino ainda não existe ou está vazio.
if (Test-Path -LiteralPath $Destination -PathType Container) {
    $initialStructureArgs = @('-Destination', $Destination, '-AssetFolder', $AssetFolder) + (Get-SkipFaviconArguments) + (Get-AssetStudioValidatedArguments) + @('-Json')
    $initial = Invoke-PresellValidator $structureScript $initialStructureArgs
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
        $productionArgs = @('-Destination', $Destination) + (Get-FichaArguments) + (Get-AssetStudioValidatedArguments)
        $powerShellExecutable = Get-PresellPowerShellExecutable
        & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $ProductionScript @productionArgs
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
    $finalStructureArgs = @('-Destination', $Destination, '-AssetFolder', $AssetFolder) + (Get-SkipFaviconArguments) + (Get-AssetStudioValidatedArguments) + @('-Json')
    $finalStructure = Invoke-PresellValidator $structureScript $finalStructureArgs
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
        $fichaValidationArgs = @('-Destination', $Destination, '-Json') + $fichaArgs + (Get-AssetStudioValidatedArguments)
        $fichaReport = Invoke-PresellValidator $fichaScript $fichaValidationArgs
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
