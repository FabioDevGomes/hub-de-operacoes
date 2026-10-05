$script:KnowledgePersonalSkillNames = @(
    'controle-gastos-pessoal',
    'dtc-google-ads-copy',
    'padrao-bordas-hub',
    'painel-operacao-google-ads',
    'preparacao-manifesto-mcc',
    'presell-one-fold',
    'repo-change-commit-flow'
)
$script:KnowledgePanelSkillNames = @(
    'controle-gastos-pessoal',
    'observabilidade-decisoria',
    'painel-operacao-google-ads'
)
$script:KnowledgeIncludedExtensions = @(
    '.md', '.txt', '.yaml', '.yml', '.py', '.js', '.mjs',
    '.css', '.html', '.ps1', '.sh', '.cmd', '.bat', '.toml', '.svg'
)
$script:KnowledgeExcludedDirectories = @(
    '.git', '.system', 'node_modules', '.venv', 'venv', '__pycache__',
    'data-local', 'dist', 'coverage', 'site-packages'
)
$script:KnowledgeExcludedFilePatterns = @(
    '*.env', '.env*', '*credential*', '*secret*', '*token*', '*password*',
    '*backup*', '*.pem', '*.key', '*.pfx', '*.p12'
)
$script:KnowledgeMaxFileBytes = 5MB
$script:KnowledgeMaxArchiveBytes = 50MB

function Add-KnowledgeFile {
    param(
        [System.Collections.Generic.List[object]]$Files,
        [string]$Root,
        [string]$SourcePath,
        [string]$ZipRoot,
        [string]$Group,
        [string]$FileNamePattern
    )

    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) { return }
    $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar
    $resolvedFile = [IO.Path]::GetFullPath($SourcePath)
    if (-not $resolvedFile.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) { return }
    $attributes = [IO.File]::GetAttributes($resolvedFile)
    if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or ($attributes -band [IO.FileAttributes]::Directory) -ne 0) { return }

    $relative = $resolvedFile.Substring($resolvedRoot.Length)
    foreach ($segment in ($relative -split '[\\/]')) {
        if ($segment.StartsWith('.') -or $segment -in $script:KnowledgeExcludedDirectories) { return }
    }
    $fileName = [IO.Path]::GetFileName($resolvedFile)
    foreach ($pattern in $script:KnowledgeExcludedFilePatterns) { if ($fileName -like $pattern) { return } }
    if ($FileNamePattern -and $resolvedFile -notlike ('*' + [IO.Path]::DirectorySeparatorChar + $FileNamePattern)) { return }
    $extension = [IO.Path]::GetExtension($resolvedFile).ToLowerInvariant()
    if ($extension -notin $script:KnowledgeIncludedExtensions) { return }
    $length = ([IO.FileInfo]::new($resolvedFile)).Length
    if ($length -gt $script:KnowledgeMaxFileBytes) { throw 'Um arquivo de conhecimento excede o limite permitido.' }

    $relativeZipPath = $relative.Replace('\', '/')
    $zipRootNormalized = $ZipRoot.TrimEnd('/')
    $zipPath = if ([string]::IsNullOrWhiteSpace($zipRootNormalized)) { $relativeZipPath } else { $zipRootNormalized + '/' + $relativeZipPath }
    if (@($Files | Where-Object { $_.Path -eq $zipPath }).Count -gt 0) { return }
    $Files.Add([pscustomobject]@{ Path = $zipPath; Group = $Group; Bytes = [long]$length; FullPath = $resolvedFile })
}

function Add-KnowledgeTree {
    param(
        [System.Collections.Generic.List[object]]$Files,
        [string]$Root,
        [string]$ZipRoot,
        [string]$Group,
        [string]$FileNamePattern
    )
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return }
    $resolvedRoot = [IO.Path]::GetFullPath($Root)
    $pending = [System.Collections.Generic.Stack[string]]::new()
    $pending.Push($resolvedRoot)
    while ($pending.Count -gt 0) {
        $directory = $pending.Pop()
        foreach ($item in @(Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop)) {
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or ($item.Attributes -band [IO.FileAttributes]::Hidden) -ne 0 -or $item.Name.StartsWith('.')) { continue }
            if ($item.PSIsContainer) {
                if ($item.Name -in $script:KnowledgeExcludedDirectories) { continue }
                $pending.Push($item.FullName)
            } else {
                Add-KnowledgeFile -Files $Files -Root $resolvedRoot -SourcePath $item.FullName -ZipRoot $ZipRoot -Group $Group -FileNamePattern $FileNamePattern
            }
        }
    }
}

function Get-KnowledgeExportIndex {
    param(
        [Parameter(Mandatory)][string]$ProjectRoot,
        [Parameter(Mandatory)][string]$PersonalSkillsRoot
    )
    $project = [IO.Path]::GetFullPath($ProjectRoot)
    $personal = [IO.Path]::GetFullPath($PersonalSkillsRoot)
    $files = [System.Collections.Generic.List[object]]::new()
    $missing = [System.Collections.Generic.List[string]]::new()

    foreach ($relative in @('AGENTS.md', 'README.md', 'docs/maintenance.md', 'docs/knowledge-export.md')) {
        $source = Join-Path $project ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $missing.Add("Documento do painel ausente: $relative"); continue }
        Add-KnowledgeFile -Files $files -Root $project -SourcePath $source -ZipRoot 'panel' -Group 'Documentação do painel'
    }

    $panelSkillRoot = Join-Path $project '.agents/skills'
    foreach ($skill in $script:KnowledgePanelSkillNames) {
        $folder = Join-Path $panelSkillRoot $skill
        if (-not (Test-Path -LiteralPath (Join-Path $folder 'SKILL.md') -PathType Leaf)) { $missing.Add("Skill do painel ausente: $skill"); continue }
        Add-KnowledgeTree -Files $files -Root $folder -ZipRoot "panel/.agents/skills/$skill" -Group 'Skills do painel'
    }

    foreach ($skill in $script:KnowledgePersonalSkillNames) {
        $folder = Join-Path $personal $skill
        if (-not (Test-Path -LiteralPath (Join-Path $folder 'SKILL.md') -PathType Leaf)) { $missing.Add("Skill pessoal ausente: $skill"); continue }
        Add-KnowledgeTree -Files $files -Root $folder -ZipRoot "skills/$skill" -Group 'Skills pessoais'
    }

    $databaseRoot = Join-Path $project 'src'
    foreach ($relative in @('database.js', 'storage/hub-database.js', 'storage/hub-database.mjs')) {
        $source = Join-Path $databaseRoot ($relative.Replace('/', [IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $missing.Add("Fonte principal do banco ausente: src/$relative"); continue }
        Add-KnowledgeFile -Files $files -Root $project -SourcePath $source -ZipRoot 'panel/database/source' -Group 'Fontes técnicas do banco'
    }
    Add-KnowledgeTree -Files $files -Root $databaseRoot -ZipRoot 'panel/database/source' -Group 'Fontes técnicas do banco' -FileNamePattern '*-storage.mjs'

    $orderedFiles = @($files | Sort-Object Path)
    $sourceBytes = [long](($orderedFiles | Measure-Object -Property Bytes -Sum).Sum)
    $totalBytes = $sourceBytes + 16384
    $missingItems = @($missing.ToArray())
    $available = $missingItems.Count -eq 0 -and $totalBytes -le $script:KnowledgeMaxArchiveBytes
    $reason = if ($missingItems.Count) { 'Há fontes de conhecimento esperadas que não foram encontradas.' } elseif ($totalBytes -gt $script:KnowledgeMaxArchiveBytes) { 'O pacote ultrapassa o limite seguro de tamanho.' } else { $null }
    return [pscustomobject]@{
        available = $available
        reason = $reason
        missing = $missingItems
        sourceFileCount = $orderedFiles.Count
        outputFileCount = $orderedFiles.Count + 2
        totalBytes = $totalBytes
        files = @($orderedFiles | ForEach-Object { [pscustomobject]@{ path = $_.Path; group = $_.Group; bytes = $_.Bytes } })
        sourceFiles = $orderedFiles
    }
}

function Get-KnowledgeReadme {
    param([string]$GeneratedAt, [object[]]$Files)
    $groups = @($Files | Group-Object Group | Sort-Object Name | ForEach-Object { '- ' + $_.Name + ': ' + $_.Count + ' arquivo(s).' })
    return @(
        '# Playbook de conhecimento do Hub',
        '',
        'Pacote privado gerado localmente para portabilidade de instruções, documentação e referências técnicas.',
        '',
        '## Conteúdo',
        '- skills/: skills pessoais em pastas com SKILL.md e seus arquivos de apoio.',
        '- panel/.agents/skills/: skills específicas do projeto do painel.',
        '- panel/: instruções e documentação do repositório.',
        '- panel/database/source/: código-fonte técnico de persistência e banco; não são registros nem cópias de bancos.',
        '- MANIFEST.json: inventário dos arquivos empacotados.',
        '',
        '## Compatibilidade',
        'As instruções usam Markdown e a convenção Agent Skills quando possível. Ferramentas diferentes podem exigir adaptação de metadados, caminhos, comandos e execução de scripts. Arquivos agents/openai.yaml são específicos da integração OpenAI. Revise scripts antes de executá-los.',
        '',
        '## Privacidade',
        'Este pacote contém somente fontes explicitamente permitidas. Não inclui IndexedDB, campanhas, vendas, finanças, bases ou backups JSON, arquivos de data-local/, perfil do navegador, credenciais, histórico Git, artefatos dist/ ou caches. Antes de compartilhar o ZIP com outro serviço ou pessoa, revise as instruções para remover caminhos locais e outros detalhes do ambiente.',
        '',
        'Gerado em UTC: ' + $GeneratedAt,
        '',
        '## Grupos de arquivos',
        $groups
    ) -join [Environment]::NewLine
}

function Get-KnowledgeManifestJson {
    param([object]$Index, [string]$GeneratedAt)
    $manifest = [ordered]@{
        format = 'hub-ai-playbook-v1'
        generatedAtUtc = $GeneratedAt
        containsOperationalRecords = $false
        fileCount = $Index.outputFileCount
        files = @(
            [pscustomobject]@{ path = 'README.md'; group = 'Informações do pacote'; bytes = $null },
            [pscustomobject]@{ path = 'MANIFEST.json'; group = 'Informações do pacote'; bytes = $null }
        ) + @($Index.files)
        exclusions = @('registros reais', 'bancos locais', 'backups', 'data-local', 'dist', 'Git history', 'credenciais', 'caches')
    }
    return $manifest | ConvertTo-Json -Depth 8
}

function Get-KnowledgeExportManifest {
    param([Parameter(Mandatory)][string]$ProjectRoot, [Parameter(Mandatory)][string]$PersonalSkillsRoot)
    $index = Get-KnowledgeExportIndex -ProjectRoot $ProjectRoot -PersonalSkillsRoot $PersonalSkillsRoot
    return [pscustomobject]@{
        available = $index.available
        reason = $index.reason
        missing = $index.missing
        sourceFileCount = $index.sourceFileCount
        outputFileCount = $index.outputFileCount
        totalBytes = $index.totalBytes
        files = $index.files
    }
}

function New-KnowledgeExportZip {
    param([Parameter(Mandatory)][string]$ProjectRoot, [Parameter(Mandatory)][string]$PersonalSkillsRoot)
    $index = Get-KnowledgeExportIndex -ProjectRoot $ProjectRoot -PersonalSkillsRoot $PersonalSkillsRoot
    if (-not $index.available) { throw 'As fontes do pacote estão incompletas ou excedem o tamanho permitido.' }
    Add-Type -AssemblyName System.IO.Compression

    $generatedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    $memory = [IO.MemoryStream]::new()
    $archive = [IO.Compression.ZipArchive]::new($memory, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($file in $index.sourceFiles) {
            $currentLength = ([IO.FileInfo]::new($file.FullPath)).Length
            if ($currentLength -gt $script:KnowledgeMaxFileBytes) { throw 'Um arquivo de conhecimento excede o limite permitido.' }
            $bytes = [IO.File]::ReadAllBytes($file.FullPath)
            $entry = $archive.CreateEntry($file.Path, [IO.Compression.CompressionLevel]::Optimal)
            $entryStream = $entry.Open()
            try { $entryStream.Write($bytes, 0, $bytes.Length) } finally { $entryStream.Dispose() }
        }

        $readmeBytes = [Text.UTF8Encoding]::new($false).GetBytes((Get-KnowledgeReadme -GeneratedAt $generatedAt -Files $index.files))
        $readmeEntry = $archive.CreateEntry('README.md', [IO.Compression.CompressionLevel]::Optimal)
        $readmeStream = $readmeEntry.Open()
        try { $readmeStream.Write($readmeBytes, 0, $readmeBytes.Length) } finally { $readmeStream.Dispose() }

        $manifestBytes = [Text.UTF8Encoding]::new($false).GetBytes((Get-KnowledgeManifestJson -Index $index -GeneratedAt $generatedAt))
        $manifestEntry = $archive.CreateEntry('MANIFEST.json', [IO.Compression.CompressionLevel]::Optimal)
        $manifestStream = $manifestEntry.Open()
        try { $manifestStream.Write($manifestBytes, 0, $manifestBytes.Length) } finally { $manifestStream.Dispose() }
    } finally {
        $archive.Dispose()
    }
    try { return ,$memory.ToArray() } finally { $memory.Dispose() }
}
