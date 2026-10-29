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

function Get-PresellOutputExcerpt {
    param([string]$Text, [int]$Limit = 900)

    $excerpt = ([string]$Text -split '\r?\n' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 8) -join ' | '
    $excerpt = ($excerpt -replace '\s+', ' ').Trim()
    if ([string]::IsNullOrWhiteSpace($excerpt)) { return 'O processo não escreveu saída.' }
    if ($excerpt.Length -gt $Limit) { return '[trecho final, truncado] ' + $excerpt.Substring($excerpt.Length - $Limit) }
    return $excerpt
}

function ConvertTo-PresellPowerShellLiteral {
    param([AllowEmptyString()][string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
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
    $previousOutputEncoding = [Console]::OutputEncoding
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Set UTF-8 in the validator process itself and in this process's decoder.
        [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
        # Native stderr becomes PowerShell ErrorRecords. Keep it non-terminating here so
        # stdout can be parsed independently and both streams remain available to the log.
        $ErrorActionPreference = 'Continue'
        $argumentStatements = [System.Collections.Generic.List[string]]::new()
        for ($index = 0; $index -lt $Arguments.Count; $index++) {
            $token = [string]$Arguments[$index]
            if ($token -notmatch '^-[A-Za-z][A-Za-z0-9-]*$') { throw 'Argumento inválido para o validador.' }
            $parameterName = $token.Substring(1)
            $parameterKey = ConvertTo-PresellPowerShellLiteral $parameterName
            if ($index + 1 -lt $Arguments.Count -and ([string]$Arguments[$index + 1]) -notmatch '^-[A-Za-z][A-Za-z0-9-]*$') {
                $valueLiteral = ConvertTo-PresellPowerShellLiteral ([string]$Arguments[$index + 1])
                $argumentStatements.Add('$argumentMap[' + $parameterKey + '] = ' + $valueLiteral)
                $index++
            }
            else {
                $argumentStatements.Add('$argumentMap[' + $parameterKey + '] = $true')
            }
        }
        $command = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)' + [Environment]::NewLine +
            ('$scriptPath = ' + (ConvertTo-PresellPowerShellLiteral $ScriptPath)) + [Environment]::NewLine +
            '$argumentMap = @{}' + [Environment]::NewLine +
            ($argumentStatements -join [Environment]::NewLine) + [Environment]::NewLine +
            '& $scriptPath @argumentMap' + [Environment]::NewLine +
            'exit $LASTEXITCODE'
        $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($command))
        $captured = @(& $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedCommand 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        [Console]::OutputEncoding = $previousOutputEncoding
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $output = ($captured | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | Out-String)
    $stderr = ($captured | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] } | ForEach-Object {
        if ($null -ne $_.Exception -and -not [string]::IsNullOrWhiteSpace($_.Exception.Message)) { $_.Exception.Message }
        else { [string]$_ }
    } | Out-String).Trim()
    try {
        $report = $output | ConvertFrom-Json -ErrorAction Stop
        if ($null -eq $report -or $null -eq $report.PSObject.Properties['overall'] -or $null -eq $report.PSObject.Properties['checks']) {
            throw 'O JSON retornado não contém os campos esperados overall e checks.'
        }
    }
    catch {
        $parseError = $_.Exception.Message
        $details = @(
            "Validador: $ScriptPath"
            "ExitCode: $exitCode"
            "Falha ao interpretar o relatório: $parseError"
            "Saída padrão: $(Get-PresellOutputExcerpt $output)"
            "Erro padrão: $(Get-PresellOutputExcerpt $stderr)"
        )
        return [PSCustomObject]@{
            module  = 'workflow'
            overall = 'BLOCKED'
            checks  = @([PSCustomObject]@{
                name = 'validator-output'
                status = 'BLOCK'
                message = 'A validação não retornou um relatório legível. O código de saída, sem esse relatório, não confirma se houve uma regra de conteúdo violada ou uma falha interna; a aprovação não foi confirmada.'
                items = $details
            })
        }
    }

    $expectedExitCode = switch ($report.overall) {
        'BLOCKED' { 2 }
        'PASS_WITH_WARNINGS' { 1 }
        default { 0 }
    }
    if ($exitCode -ne $expectedExitCode) {
        $report.checks = @($report.checks) + @([PSCustomObject]@{
            name = 'validator-exit-code'
            status = 'BLOCK'
            message = 'O código de saída do processo não corresponde ao estado informado no relatório.'
            items = @("ExitCode: $exitCode", "Esperado para $($report.overall): $expectedExitCode")
        })
        $report.overall = 'BLOCKED'
    }

    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        $stderrCheck = [PSCustomObject]@{
            name = 'validator-stderr'
            status = 'WARN'
            message = 'O validador também escreveu uma mensagem no fluxo de erro; o relatório JSON foi lido, mas revise o diagnóstico técnico.'
            items = @((Get-PresellOutputExcerpt $stderr))
        }
        $report.checks = @($report.checks) + @($stderrCheck)
        if ($report.overall -eq 'PASS') { $report.overall = 'PASS_WITH_WARNINGS' }
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
