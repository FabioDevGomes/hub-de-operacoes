import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deliverD0GridToPreparador, deliverD1GridToPreparador} from '../extensions/mcc-d0-bridge/bridge.mjs';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('src/preparador-MCC/index.html', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('extensions/mcc-d0-bridge/manifest.json', root), 'utf8'));
const extensionFiles = ['popup.js', 'background.js', 'bridge.mjs', 'mcc-grid-reader.mjs', 'mcc-grid-domain.mjs'];
const extensionSource = (await Promise.all(extensionFiles.map(file => readFile(new URL(`extensions/mcc-d0-bridge/${file}`, root), 'utf8')))).join('\n');
const backgroundSource = await readFile(new URL('extensions/mcc-d0-bridge/background.js', root), 'utf8');

assert.equal(manifest.version, '1.2.18', 'a extensão deve anunciar a versão da mudança');
assert.deepEqual(manifest.permissions, ['scripting', 'activeTab', 'clipboardWrite'], 'leitura continua via activeTab; escrita de clipboard é exclusiva da ação ClickBank');
assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1:8765/preparador-MCC/*','http://127.0.0.1:8765/curadoria/clickbank-top-offers/*'], 'somente as duas rotas locais de destino são permitidas');
assert.ok(!/<textarea\b|type="file"|Selecionar arquivo|Ctrl\+V/i.test(html), 'a tela não deve exibir controles nem instruções para colagem ou seleção manual de arquivos');
assert.equal((html.match(/class="capture-box" data-slot=/g) || []).length, 2, 'a tela deve manter os slots de recebimento D−1 e D0');
assert.ok(html.includes('window.__hubReceiveMccD0Grid') && html.includes('window.__hubReceiveMccD1Grid'), 'os receptores D0/D−1 estruturados continuam disponíveis');
assert.ok(html.includes('id="apply-manifest"'), 'a confirmação final do Preparador precisa continuar presente');
assert.ok(!extensionSource.includes('FORWARD_D0_CSV') && !extensionSource.includes('deliverD0CsvToPreparador'), 'a extensão não deve manter o caminho legado de encaminhamento de CSV');
assert.ok(!extensionSource.includes('createCsvTransferPayload') && !extensionSource.includes('DataTransfer'), 'a extensão não deve converter arquivos em transferências manuais');
assert.ok(extensionSource.includes("type: 'CAPTURE_AND_FORWARD_MCC_D0'") && extensionSource.includes("type: 'CAPTURE_AND_FORWARD_MCC_D1'"), 'o popup preserva as duas capturas diretas');
assert.ok(backgroundSource.includes('deliverD0GridToPreparador') && backgroundSource.includes('deliverD1GridToPreparador'), 'o service worker mantém o encaminhamento estrutural da extensão');

const oldGlobals = new Map(['location', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const received = [];
Object.assign(globalThis, {
  location: {origin:'http://127.0.0.1:8765', pathname:'/preparador-MCC/'},
  window: {
    async __hubReceiveMccD0Grid(capture) { received.push(['d0', capture]); return {ok:true, campaignCount:capture.records.length}; },
    async __hubReceiveMccD1Grid(capture) { received.push(['d1', capture]); return {ok:true, campaignCount:capture.records.length}; }
  }
});
try {
  const d0 = {schema:'mcc-d0-grid-v3', source:'mcc_chrome_extension', records:[{campaign:'D0'}]};
  const d1 = {schema:'mcc-d1-grid-v3', periodRole:'d1', source:'mcc_chrome_extension', records:[{campaign:'D1'}]};
  assert.deepEqual(await deliverD0GridToPreparador(d0), {ok:true, campaignCount:1});
  assert.deepEqual(await deliverD1GridToPreparador(d1), {ok:true, campaignCount:1});
  assert.deepEqual(received, [['d0', d0], ['d1', d1]], 'as capturas estruturadas chegam aos receptores existentes sem passar por campos de arquivo');
} finally {
  for (const [key, descriptor] of oldGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('paridade MCC: D0/D−1 estruturados continuam funcionando sem colagem ou fluxo de arquivos');
