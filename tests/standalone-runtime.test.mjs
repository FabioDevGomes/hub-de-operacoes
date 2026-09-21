import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';

const launcher=await readFile(new URL('../scripts/iniciar-painel.ps1',import.meta.url),'utf8');
const server=await readFile(new URL('../scripts/serve-panel.ps1',import.meta.url),'utf8');

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
assert.doesNotMatch(server,/Join-Path\s+\$env:USERPROFILE\s+'OneDrive\\tráfego pago\\produtos'/i);
assert.match(server,/presell-ficha-\{0\}\.json/);
assert.match(server,/-FichaPath\s+\$temporaryFicha/);
assert.doesNotMatch(server,/-FichaJson\s+\$fichaJson/);
assert.match(server,/runtime\s*=\s*'powershell'/);
assert.match(server,/engine\s*=\s*'embedded'/);
assert.match(server,/\/api\/presell\/validate/);
assert.match(server,/\/api\/presell\/produce/);

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
