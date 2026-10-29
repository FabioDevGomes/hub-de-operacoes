import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const windowsOnly = process.platform === 'win32';

test('Hostinger inventory paths normalize both query-relative and root-relative paths and detect type collisions', { skip: !windowsOnly }, () => {
  const serverPath = fileURLToPath(new URL('../scripts/serve-panel.ps1', import.meta.url));
  const psQuote = value => `'${value.replaceAll("'", "''")}'`;
  const command = [
    "$ErrorActionPreference='Stop'",
    `$sourcePath=${psQuote(serverPath)}`,
    '$tokens=$null;$parseErrors=$null',
    '$ast=[System.Management.Automation.Language.Parser]::ParseFile($sourcePath,[ref]$tokens,[ref]$parseErrors)',
    "if($parseErrors.Count){throw ($parseErrors | ForEach-Object { $_.Message } | Out-String)}",
    "$names=@('ConvertTo-HostingerRootRelativePath','ConvertTo-HostingerRemoteEntryMap','Get-HostingerPublishPathCollision')",
    '$functions=$ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $names -contains $node.Name},$true)',
    'foreach($fn in $functions){. ([scriptblock]::Create($fn.Extent.Text))}',
    'function Assert-Case($condition,$message){if(-not $condition){throw $message}}',
    "$relative=ConvertTo-HostingerRootRelativePath -Path '01.png' -Directory 'tryly';Assert-Case ($relative -ceq 'tryly/01.png') 'query-relative path was not rooted'",
    "$rooted=ConvertTo-HostingerRootRelativePath -Path 'tryly/02.png' -Directory 'tryly';Assert-Case ($rooted -ceq 'tryly/02.png') 'root-relative path was prefixed twice'",
    "$publicHtml=ConvertTo-HostingerRootRelativePath -Path 'public_html/tryly/03.png' -Directory 'tryly';Assert-Case ($publicHtml -ceq 'tryly/03.png') 'public_html prefix was not normalized'",
    "$publicHtmlRoot=ConvertTo-HostingerRootRelativePath -Path 'public_html/index.html' -Directory '';Assert-Case ($publicHtmlRoot -ceq 'index.html') 'public_html root prefix was not normalized'",
    "$root=ConvertTo-HostingerRootRelativePath -Path 'index.html' -Directory '';Assert-Case ($root -ceq 'index.html') 'root path changed when no query directory is used'",
    "$entries=ConvertTo-HostingerRemoteEntryMap -Directory 'tryly' -Items @([pscustomobject]@{path='01.png';type='file';size_bytes=11},[pscustomobject]@{path='folder';type='directory'},[pscustomobject]@{path='link.html';type='symlink'},[pscustomobject]@{path='sub/page.html';type='file';size_bytes=7},[pscustomobject]@{path='current-file';type='file';size_bytes=2})",
    "Assert-Case ($entries.ContainsKey('tryly/01.png')) 'query-relative file was not normalized in the inventory map'",
    "$file=Get-HostingerPublishPathCollision -Path 'tryly/01.png' -RemoteEntries $entries;Assert-Case ($file.kind -ceq 'file') 'existing file conflict was not classified'",
    "$directory=Get-HostingerPublishPathCollision -Path 'tryly/folder' -RemoteEntries $entries;Assert-Case ($directory.kind -ceq 'directory') 'directory occupying a file path was not classified'",
    "$link=Get-HostingerPublishPathCollision -Path 'tryly/link.html' -RemoteEntries $entries;Assert-Case ($link.kind -ceq 'symlink') 'symlink occupying a file path was not classified'",
    "$parentFile=Get-HostingerPublishPathCollision -Path 'tryly/current-file' -RemoteEntries $entries -ExpectedDirectory;Assert-Case ($parentFile.kind -ceq 'file-blocks-directory') 'file blocking a required directory was not classified'",
    "$inferred=Get-HostingerPublishPathCollision -Path 'tryly/sub' -RemoteEntries $entries -ExpectedDirectory;Assert-Case ($null -eq $inferred) 'parent directory inferred from a descendant file was treated as a collision'",
    "$missing=Get-HostingerPublishPathCollision -Path 'tryly/missing.png' -RemoteEntries $entries;Assert-Case ($null -eq $missing) 'a missing path was reported as a collision'"
  ].join(';');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'PowerShell path diagnostics failed');
});
