import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const personalSkills = [
  'controle-gastos-pessoal', 'dtc-google-ads-copy', 'padrao-bordas-hub',
  'painel-operacao-google-ads', 'preparacao-manifesto-mcc', 'presell-one-fold',
  'repo-change-commit-flow'
];
const panelSkills = ['controle-gastos-pessoal', 'observabilidade-decisoria', 'painel-operacao-google-ads'];
const helperPath = fileURLToPath(new URL('../scripts/knowledge-export.ps1', import.meta.url));
const powershell = process.env.POWERSHELL_EXE || 'pwsh';

async function put(root, relative, contents = 'synthetic knowledge') {
  const target = join(root, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');
}

test('knowledge ZIP is built from allowlisted synthetic knowledge and excludes records, caches and secrets', {
  skip: process.platform !== 'win32'
}, async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'hub-knowledge-export-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const project = join(fixture, 'panel');
  const skills = join(fixture, 'personal-skills');

  for (const file of ['AGENTS.md', 'README.md', 'docs/maintenance.md', 'docs/knowledge-export.md']) {
    await put(project, file);
  }
  for (const skill of panelSkills) {
    await put(project, `.agents/skills/${skill}/SKILL.md`);
    await put(project, `.agents/skills/${skill}/references/contract.md`);
  }
  for (const skill of personalSkills) {
    await put(skills, `${skill}/SKILL.md`);
    await put(skills, `${skill}/references/guide.txt`);
    await put(skills, `${skill}/references/runtime.json`, 'SYNTHETIC_PRIVATE_JSON_RECORD');
    await put(skills, `${skill}/api-token.txt`, 'SYNTHETIC_API_TOKEN');
    await put(skills, `${skill}/.system/leak.md`, 'SYNTHETIC_SYSTEM_ONLY');
    await put(skills, `${skill}/__pycache__/leak.py`, 'SYNTHETIC_CACHE_ONLY');
    await put(skills, `${skill}/compiled.pyc`, 'SYNTHETIC_BYTECODE_ONLY');
  }
  for (const file of ['src/database.js', 'src/storage/hub-database.js', 'src/storage/hub-database.mjs', 'src/billing/billing-storage.mjs']) {
    await put(project, file, 'synthetic storage source');
  }
  await put(project, 'data-local/campaigns.json', 'SYNTHETIC_PRIVATE_CAMPAIGNS');
  await put(project, 'dist/old-build.md', 'SYNTHETIC_DIST_ONLY');

  const command = String.raw`
$ErrorActionPreference = 'Stop'
. $env:KNOWLEDGE_EXPORT_HELPER
$index = Get-KnowledgeExportManifest -ProjectRoot $env:KNOWLEDGE_PROJECT_ROOT -PersonalSkillsRoot $env:KNOWLEDGE_PERSONAL_ROOT
$bytes = New-KnowledgeExportZip -ProjectRoot $env:KNOWLEDGE_PROJECT_ROOT -PersonalSkillsRoot $env:KNOWLEDGE_PERSONAL_ROOT
$memory = [IO.MemoryStream]::new($bytes)
$archive = [IO.Compression.ZipArchive]::new($memory, [IO.Compression.ZipArchiveMode]::Read, $true)
try {
  $entries = @($archive.Entries | ForEach-Object FullName)
  $content = [System.Collections.Generic.List[string]]::new()
  foreach ($entry in $archive.Entries) {
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $content.Add($reader.ReadToEnd()) } finally { $reader.Dispose() }
  }
  $allContent = $content -join ' '
  [pscustomobject]@{
    available = $index.available
    entryCount = $entries.Count
    entries = $entries
    manifestRecordFlag = ($allContent -match '"containsOperationalRecords"\s*:\s*false')
    leakedSyntheticMarker = ($allContent -match 'SYNTHETIC_PRIVATE|SYNTHETIC_SYSTEM_ONLY|SYNTHETIC_CACHE_ONLY|SYNTHETIC_API_TOKEN')
  } | ConvertTo-Json -Depth 5 -Compress
} finally { $archive.Dispose(); $memory.Dispose() }
`;
  const result = spawnSync(powershell, ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      KNOWLEDGE_EXPORT_HELPER: helperPath,
      KNOWLEDGE_PROJECT_ROOT: project,
      KNOWLEDGE_PERSONAL_ROOT: skills
    }
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || 'PowerShell export test failed');
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.available, true);
  assert.equal(output.entryCount, 30);
  assert.ok(output.entries.includes('README.md'));
  assert.ok(output.entries.includes('MANIFEST.json'));
  assert.ok(output.entries.includes('panel/docs/knowledge-export.md'));
  assert.ok(output.entries.includes('panel/database/source/src/database.js'));
  assert.ok(output.entries.includes('skills/repo-change-commit-flow/SKILL.md'));
  assert.equal(output.entries.some(path => path !== 'MANIFEST.json' && /data-local|dist\/|\.system|__pycache__|\.pyc$|\.json$/i.test(path)), false);
  assert.equal(output.manifestRecordFlag, true);
  assert.equal(output.leakedSyntheticMarker, false);
});

test('knowledge export UI is wired only to the local allowlisted endpoints and shows the overview refinements', async () => {
  const [html, view, css] = await Promise.all([
    readFile(fileURLToPath(new URL('../src/index.template.html', import.meta.url)), 'utf8'),
    readFile(fileURLToPath(new URL('../src/overview/knowledge-export-view.js', import.meta.url)), 'utf8'),
    readFile(fileURLToPath(new URL('../src/overview/knowledge-export.css', import.meta.url)), 'utf8')
  ]);

  assert.match(html, /id="downloadKnowledgePack"[\s\S]*?Exportar conhecimento/);
  assert.match(html, /id="knowledgeExportModal"[\s\S]*?Baixar ZIP privado/);
  assert.match(html, /overview\/knowledge-export\.css/);
  assert.match(html, /overview\/knowledge-export-view\.js/);
  assert.match(html, /Corrigir data de campanha/);
  assert.match(html, /Baixar backup completo JSON/);
  assert.match(view, /\/api\/knowledge\/manifest/);
  assert.match(view, /\/api\/knowledge\/export\.zip/);
  assert.match(view, /X-Hub-Knowledge-Export/);
  assert.doesNotMatch(view, /indexedDB|localStorage|campaigns\.json/i);
  assert.match(css, /\.knowledge-export-files\{[^}]*overflow:auto/);
  assert.doesNotMatch(css, /translateY\(-5px\)/, 'a posição dos botões agora pertence ao CSS global');
  const headerCss = await readFile(fileURLToPath(new URL('../src/curadoria/curation-header-actions.css', import.meta.url)), 'utf8');
  assert.match(headerCss, /--hub-page-action-top:16px/);
  assert.match(headerCss, /padding-top:var\(--hub-page-action-top\)!important/);
  assert.match(css, /align-items:center/);
  assert.match(css, /#totalsView \.overview-kpi-period[^}]*font-size/);
});
