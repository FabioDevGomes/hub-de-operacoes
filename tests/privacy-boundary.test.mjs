import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const missing = async relative => assert.rejects(
  access(new URL(`../${relative}`, import.meta.url)),
  error => error?.code === 'ENOENT',
  `${relative} contém dados privados e não pode existir no pacote compartilhável`,
);

for (const path of [
  'src/billing/seed-v1.json',
  'dist/billing/seed-v1.json',
  'dist/campaign-snapshot-seed.json',
  'dist/__paused-history-source.json',
]) await missing(path);

const billingView = await readFile(new URL('../src/billing/billing-view.mjs', import.meta.url), 'utf8');
const indexTemplate = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const producer = await readFile(new URL('../presell-engine/tools/New-PresellFromFicha.ps1', import.meta.url), 'utf8');
const presellValidator = await readFile(new URL('../presell-engine/tools/Test-PresellStructure.ps1', import.meta.url), 'utf8');
const databaseTest = await readFile(new URL('./database.test.mjs', import.meta.url), 'utf8');
const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');

assert.doesNotMatch(billingView, /seed-v1\.json|installBillingSeed/, 'Faturamento não deve carregar histórico pessoal do pacote');
assert.doesNotMatch(indexTemplate, /campaign-snapshot-seed\.json|__paused-history-source\.json/, 'Hub não deve carregar snapshots pessoais versionados');
assert.doesNotMatch(producer, /C:\\Users\\|Fabio-Vaio|OneDrive/i, 'ferramenta compartilhada não deve conter caminho pessoal');
assert.doesNotMatch(`${producer}\n${presellValidator}\n${databaseTest}`, /trustedfocus\.shop|@gmail\.com/i, 'código e fixtures não devem expor domínio ou e-mail operacional');
assert.ok(producer.includes(String.raw`'@font-face\{[^}]*https?://`), 'sanitização deve bloquear fontes externas sem depender de um domínio pessoal');
for (const rule of ['src/billing/seed-*.json','dist/billing/seed-*.json','dist/campaign-snapshot-seed.json','dist/__paused-history-source.json']) assert.ok(ignore.includes(rule), `${rule} deve permanecer ignorado pelo Git`);

console.log('privacy boundary ok');
