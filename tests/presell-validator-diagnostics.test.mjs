import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const engine=fileURLToPath(new URL('../presell-engine/',import.meta.url));
const windowsOnly={skip:process.platform!=='win32',timeout:15000};
const quote=value=>`'${value.replaceAll("'","''")}'`;

test('validator-output preserves the PowerShell error and exit code when JSON cannot be read',windowsOnly,async()=>{
  const root=await mkdtemp(join(tmpdir(),"presell-validator-log-é-'test'-"));
  try{
    const validator=join(root,'synthetic-validator.ps1');
    const wrapper=join(root,'invoke-validator.ps1');
    const module=join(engine,'modules','Presell.Validation.Common.psm1');
    await writeFile(validator,"[Console]::Out.WriteLine('SYNTHETIC_STDOUT: result is not JSON')\n[Console]::Error.WriteLine('SYNTHETIC_STDERR: validator failed before creating a report')\nexit 2\n",'utf8');
    await writeFile(wrapper,`\uFEFF$ErrorActionPreference = 'Stop'\nImport-Module -Name ${quote(module)} -Force\n$result = Invoke-PresellValidator -ScriptPath ${quote(validator)} -Arguments @('-SyntheticProbe')\n$json = $result | ConvertTo-Json -Depth 8 -Compress\n[Console]::Write([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json)))\n`,'utf8');
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',wrapper],{encoding:'utf8',timeout:10000,windowsHide:true});
    assert.ifError(result.error);
    assert.equal(result.status,0,result.stderr);
    let report;
    try{report=JSON.parse(Buffer.from(result.stdout.trim(),'base64').toString('utf8'))}catch(error){assert.fail(`${error.message}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)}
    assert.equal(report.overall,'BLOCKED');
    assert.equal(report.checks[0].name,'validator-output');
    assert.equal(report.checks[0].status,'BLOCK');
    assert.match(report.checks[0].message,/não confirma se houve uma regra de conteúdo violada/);
    assert.doesNotMatch(report.checks[0].message,/Ã|�/,'acentos devem sobreviver ao retorno do processo PowerShell');
    assert.ok(report.checks[0].items.some(item=>item==='ExitCode: 2'));
    assert.ok(report.checks[0].items.some(item=>item.includes('SYNTHETIC_STDERR')||item.includes('SYNTHETIC_STDOUT')));
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('a readable BLOCKED report with exit code 2 remains a content-rule result',windowsOnly,async()=>{
  const root=await mkdtemp(join(tmpdir(),'presell-validator-block-test-'));
  try{
    const validator=join(root,'synthetic-block.ps1');
    const wrapper=join(root,'invoke-validator.ps1');
    const module=join(engine,'modules','Presell.Validation.Common.psm1');
    await writeFile(validator,"[PSCustomObject]@{module='synthetic';overall='BLOCKED';checks=@([PSCustomObject]@{name='synthetic-rule';status='BLOCK';message='synthetic content rule';items=@()})} | ConvertTo-Json -Depth 5 -Compress\nexit 2\n",'utf8');
    await writeFile(wrapper,`\uFEFF$ErrorActionPreference = 'Stop'\nImport-Module -Name ${quote(module)} -Force\n$result = Invoke-PresellValidator -ScriptPath ${quote(validator)} -Arguments @('-SyntheticProbe')\n$json = $result | ConvertTo-Json -Depth 8 -Compress\n[Console]::Write([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json)))\n`,'utf8');
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',wrapper],{encoding:'utf8',timeout:10000,windowsHide:true});
    assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
    const report=JSON.parse(Buffer.from(result.stdout.trim(),'base64').toString('utf8'));
    assert.equal(report.overall,'BLOCKED');assert.equal(report.checks[0].name,'synthetic-rule');
    assert.ok(!report.checks.some(check=>check.name==='validator-output'||check.name==='validator-exit-code'));
  }finally{await rm(root,{recursive:true,force:true})}
});

test('report diagnostics remain local to the Hub source and are not embedded in the static page',async()=>{
  const page=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  assert.doesNotMatch(page,/SYNTHETIC_STDERR|SYNTHETIC_STDOUT/);
});
