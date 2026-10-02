import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { privateDistributionFiles } from '../scripts/distribution-privacy.mjs';

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
  'dist/legacy-totais-migration-v1.json',
  'dist/catalogo-produtos-oficial.json',
]) await missing(path);
assert.deepEqual(await privateDistributionFiles(fileURLToPath(new URL('../dist', import.meta.url))), [], 'o pacote inteiro, não só um seed conhecido, deve estar livre de arquivos privados');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd:fileURLToPath(new URL('../', import.meta.url)), encoding:'utf8', windowsHide:true }).split('\0').filter(Boolean);
assert.deepEqual(tracked.filter(path => /^(?:data-local\/(?!\.gitkeep$)|(?:src|dist)\/.*\.(?:json|jsonl)$)|\.(?:xlsx?|csv|tsv|db|sqlite3?)$/i.test(path)), [], 'arquivos operacionais não podem estar no índice Git atual');

const billingView = await readFile(new URL('../src/billing/billing-view.mjs', import.meta.url), 'utf8');
const indexTemplate = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const producer = await readFile(new URL('../presell-engine/tools/New-PresellFromFicha.ps1', import.meta.url), 'utf8');
const presellValidator = await readFile(new URL('../presell-engine/tools/Test-PresellStructure.ps1', import.meta.url), 'utf8');
const databaseTest = await readFile(new URL('./database.test.mjs', import.meta.url), 'utf8');
const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');

assert.doesNotMatch(billingView, /seed-v1\.json|installBillingSeed/, 'Faturamento não deve carregar histórico pessoal do pacote');
assert.doesNotMatch(indexTemplate, /campaign-snapshot-seed\.json|__paused-history-source\.json|fetch\(['"](?:legacy-totais-migration-v1|catalogo-produtos-oficial)\.json/, 'Hub não deve carregar históricos ou catálogos pessoais do pacote');
assert.doesNotMatch(producer, /C:\\Users\\|Fabio-Vaio|OneDrive/i, 'ferramenta compartilhada não deve conter caminho pessoal');
assert.doesNotMatch(`${producer}\n${presellValidator}\n${databaseTest}`, /trustedfocus\.shop|@gmail\.com/i, 'código e fixtures não devem expor domínio ou e-mail operacional');
assert.ok(producer.includes(String.raw`'@font-face\{[^}]*https?://`), 'sanitização deve bloquear fontes externas sem depender de um domínio pessoal');
for (const rule of ['src/**/*.json','dist/**/*.json','data-local/*']) assert.ok(ignore.includes(rule), `${rule} deve permanecer ignorado pelo Git`);

console.log('privacy boundary ok');
