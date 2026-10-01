import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {File} from 'node:buffer';
import {createCsvTransferPayload} from '../extensions/mcc-d0-bridge/payload.mjs';
import {deliverD0CsvToPreparador} from '../extensions/mcc-d0-bridge/bridge.mjs';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('dist/preparador-MCC/index.html', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('extensions/mcc-d0-bridge/manifest.json', root), 'utf8'));
const extensionIcon = await readFile(new URL('extensions/mcc-d0-bridge/icon.png', root));
const systemIcon = await readFile(new URL('dist/favicon.png', root));
const extensionFiles = ['popup.js', 'background.js', 'bridge.mjs', 'payload.mjs', 'mcc-grid-reader.mjs', 'mcc-grid-domain.mjs'];
const extensionSource = (await Promise.all(extensionFiles.map(file => readFile(new URL(`extensions/mcc-d0-bridge/${file}`, root), 'utf8')))).join('\n');
const backgroundSource = await readFile(new URL('extensions/mcc-d0-bridge/background.js', root), 'utf8');

assert.deepEqual(manifest.permissions, ['scripting', 'activeTab'], 'activeTab deve ser a única permissão adicional para leitura sob ação explícita');
assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1:8765/preparador-MCC/*'], 'o acesso de host deve ficar restrito à rota local do Preparador');
assert.equal(manifest.action.default_icon, 'icon.png', 'a ação da extensão deve usar a marca do Hub');
assert.deepEqual(manifest.icons, {'64':'icon.png'}, 'a extensão deve declarar a mesma marca para sua identidade');
assert.deepEqual(extensionIcon, systemIcon, 'o ícone da extensão deve ser uma cópia exata do favicon do sistema');
assert.ok(!/function\s+(?:parseSource|buildManifest)\b/.test(extensionSource), 'o comparador diagnóstico não pode incluir o parser do Hub nem gerar manifesto');
assert.ok(extensionSource.includes("type: 'READ_ACTIVE_MCC_GRID'") && extensionSource.includes("type: 'FORWARD_D0_CSV'"), 'a leitura experimental deve ser paralela e o fluxo de CSV existente deve permanecer');
const readHandler = backgroundSource.slice(backgroundSource.indexOf('async function readActiveMccGrid'), backgroundSource.indexOf('chrome.runtime.onMessage.addListener'));
assert.ok(readHandler.length > 0 && !readHandler.includes('forwardD0Csv'), 'a leitura da grade não pode acionar a ponte de envio ao Preparador');
assert.ok(extensionSource.includes('current-page-matches-apparent-total') && extensionSource.includes('partial-or-virtualized'), 'a prévia deve distinguir completude aparente de leitura parcial');
assert.ok(html.includes("input.addEventListener('change', () => { if(input.files?.[0]) loadDecoded(slot, decodeFile(input.files[0])); input.value=''; });"), 'a ponte deve cair no mesmo change handler do campo de arquivo existente');
assert.ok(html.includes('class="paste-box" data-slot="d0"') && html.includes('id="apply-manifest"'), 'o destino D0 e a confirmação final do Preparador precisam continuar presentes');

const parserStart = html.indexOf('    const ABSENT = new Set');
const parserEnd = html.indexOf('    function uniqueRecord(', parserStart);
assert.ok(parserStart >= 0 && parserEnd > parserStart, 'não foi possível localizar o decodificador/parser atual para teste de paridade');
const parserSource = `${html.slice(parserStart, parserEnd)}\nglobalThis.__mccParity = { decodeFile, parseSource };`;
const parserContext = vm.createContext({ crypto: webcrypto, TextDecoder });
vm.runInContext(await readFile(new URL('../src/storage/hub-database.js', import.meta.url),'utf8'), parserContext);
vm.runInContext(parserSource, parserContext, { filename: 'preparador-mcc-parser.js' });
const {decodeFile, parseSource} = parserContext.__mccParity;

const csvText = '\uFEFFRelatório D0: 23/09/2026\r\nCampaign,Campaign status,Status,Account,Currency code,Impr.,Clicks,Conversions,Cost\r\n"Ação VitaSlimex 05 (GM-BB-FR) 75% - US$ 75",Enabled,Eligible,7527,USD,123,8,1,12.34\r\nTotal: Campaigns,,,,,123,8,1,12.34\r\n';
const originalBytes = new TextEncoder().encode(csvText);
const originalFile = new File([originalBytes], 'Relatório D0.csv', {type:'text/csv', lastModified:1727100000000});

// Caminho manual existente: o arquivo original é decodificado e interpretado pelo Preparador.
const manualDecoded = await decodeFile(originalFile);
const manualResult = parseSource(manualDecoded, 'd0');

// Caminho da extensão: serializa bytes, reconstrói um File no campo D0 e aciona o mesmo handler.
const payload = await createCsvTransferPayload(originalFile);
assert.equal(payload.size, originalBytes.byteLength);
assert.deepEqual([...Buffer.from(payload.base64, 'base64')], [...originalBytes], 'o transporte base64 precisa preservar todos os bytes originais');

let bridgedResult;
let parseOnChange;
let bridgedWork;
const input = {
  files: [],
  value: '',
  dispatchEvent(event) {
    assert.equal(event.type, 'change');
    parseOnChange();
    return true;
  }
};
const box = { querySelector(selector) { assert.equal(selector, 'input.file-input[type="file"]'); return input; } };
const previousGlobals = new Map(['location', 'document', 'DataTransfer', 'File', 'Event'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
class TestDataTransfer {
  constructor() {
    this._files = [];
    this.items = {add: file => this._files.push(file)};
  }
  get files() { return this._files; }
}
class TestEvent {
  constructor(type) { this.type = type; }
}
Object.assign(globalThis, {
  location: {origin:'http://127.0.0.1:8765', pathname:'/preparador-MCC/'},
  document: {querySelector(selector) { assert.equal(selector, '.paste-box[data-slot="d0"]'); return box; }},
  DataTransfer: TestDataTransfer,
  File,
  Event: TestEvent
});
try {
  parseOnChange = () => {
    bridgedWork = (async () => {
      if (input.files?.[0]) bridgedResult = parseSource(await decodeFile(input.files[0]), 'd0');
      input.value = '';
    })();
  };
  const delivery = deliverD0CsvToPreparador(payload);
  assert.deepEqual(delivery, {ok:true, name:originalFile.name, size:originalBytes.byteLength});
  await bridgedWork;
} finally {
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

assert.deepEqual(JSON.parse(JSON.stringify(bridgedResult)), JSON.parse(JSON.stringify(manualResult)), 'o mesmo CSV precisa gerar o mesmo resultado lógico por seleção manual e pela extensão');
assert.equal(manualResult.records.length, 1, 'a paridade deve contemplar a campanha real e excluir a linha agregada total');
assert.equal(manualResult.records[0].nome_campanha_exato, 'Ação VitaSlimex 05 (GM-BB-FR) 75% - US$ 75');
assert.equal(manualResult.records[0].conta, '7527');
assert.equal(manualResult.records[0].moeda, 'USD');

console.log('paridade extensão MCC D0/manual ok — mesmos bytes, hash, decodificação e resultado lógico; nenhuma gravação realizada');
