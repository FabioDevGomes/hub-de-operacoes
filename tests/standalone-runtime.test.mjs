import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';

const launcher=await readFile(new URL('../scripts/iniciar-painel.ps1',import.meta.url),'utf8');
const server=await readFile(new URL('../scripts/serve-panel.ps1',import.meta.url),'utf8');
const presellCommon=await readFile(new URL('../presell-engine/modules/Presell.Validation.Common.psm1',import.meta.url),'utf8');
const presellWorkflow=await readFile(new URL('../presell-engine/tools/Invoke-PresellWorkflow.ps1',import.meta.url),'utf8');
const presellStructure=await readFile(new URL('../presell-engine/tools/Test-PresellStructure.ps1',import.meta.url),'utf8');

assert.doesNotMatch(launcher,/codex-runtimes|serve_panel\.py|python\.exe/i);
assert.match(launcher,/serve-panel\.ps1/);
assert.match(launcher,/\$port\s*=\s*8765/);
assert.doesNotMatch(launcher,/8765\.\.8785|candidatePorts/);
assert.match(launcher,/separaria a base IndexedDB/);
assert.doesNotMatch(launcher,/-ProductsRoot/);
assert.match(server,/TcpListener/);
assert.doesNotMatch(server,/HttpListener|python/i);
assert.match(server,/param\([\s\S]*\[string\]\$ProductsRoot/);
assert.match(server,/\$resolvedProductsRoot/);
assert.match(server,/\[char\]0x00E1/);
assert.match(server,/data-local\\products-root\.txt/,'raiz de produtos pode ser configurada localmente sem alterar o iniciador');
assert.doesNotMatch(server,/não foi possível identificar o perfil proprietário do projeto/,'o servidor deve iniciar mesmo quando não consegue inferir a pasta de produtos');
assert.match(server,/A pasta de produtos não está configurada[\s\S]*-ProductsRoot/,'uso de Pre-Sell informa como configurar a pasta quando necessário');
assert.match(server,/if \(\$Produce -and -not \(Test-Path -LiteralPath \$templateRoot/,'produção de Pre-Sell valida a presença do template configurado');
assert.doesNotMatch(server,/Join-Path\s+\$env:USERPROFILE\s+'OneDrive\\tráfego pago\\produtos'/i);
assert.match(server,/presell-ficha-\{0\}\.json/);
assert.match(server,/-FichaPath\s+\$temporaryFicha/);
assert.doesNotMatch(server,/-FichaJson\s+\$fichaJson/);
assert.match(server,/runtime\s*=\s*'powershell'/);
assert.match(server,/engine\s*=\s*'embedded'/);
assert.match(server,/\/api\/presell\/validate/);
assert.match(server,/\/api\/presell\/produce/);
assert.match(presellCommon,/function Get-PresellPowerShellExecutable/);
assert.match(presellCommon,/Process\]::GetCurrentProcess\(\)\.MainModule\.FileName/);
assert.match(presellCommon,/Get-Process -Id \$PID/);
assert.match(presellCommon,/if \(-not \[string\]::IsNullOrWhiteSpace\(\$engineDirectory\)\)\s*\{\s*\$hostExecutable = Join-Path -Path \$engineDirectory/);
assert.match(presellCommon,/\$powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File \$ScriptPath/);
assert.match(presellWorkflow,/\$powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File \$ProductionScript/);
assert.doesNotMatch(presellCommon,/&\s*pwsh\b/i,'validadores não devem depender de pwsh estar no PATH');
assert.doesNotMatch(presellWorkflow,/&\s*pwsh\b/i,'produção do workflow não deve depender de pwsh estar no PATH');
assert.match(presellStructure,/\[string\]\$RulesPath,/);
assert.match(presellStructure,/if \(\[string\]::IsNullOrWhiteSpace\(\$RulesPath\)\)\s*\{\s*\$RulesPath = Join-Path -Path \$PSScriptRoot/);
assert.doesNotMatch(presellStructure,/\$RulesPath\s*=\s*\(Join-Path\s+\$PSScriptRoot/,'RulesPath não deve usar PSScriptRoot no bloco param');

for(const relative of [
  'dist/index.html',
  'dist/preparador-MCC/index.html',
  'dist/curadoria/index.html',
  'dist/curadoria/gerentes/index.html',
  'dist/curadoria/top-performance/index.html',
  'presell-engine/tools/New-PresellFromFicha.ps1',
  'presell-engine/tools/Invoke-PresellWorkflow.ps1',
  'presell-engine/tools/Test-PresellStructure.ps1',
  'presell-engine/tools/Test-PresellAgainstFicha.ps1',
  'presell-engine/modules/Presell.Validation.Common.psm1',
  'presell-engine/config/presell-rules.json'
]) await access(new URL(`../${relative}`,import.meta.url));

console.log('standalone runtime ok');
