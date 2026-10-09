import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import { showCaptureStatus, showCaptureError } from '../extensions/mcc-d0-bridge/capture-status-view.mjs';

const root = new URL('../', import.meta.url);
const extension = new URL('extensions/mcc-d0-bridge/', root);
const [manifestText, popup, script] = await Promise.all([
  readFile(new URL('manifest.json', extension), 'utf8'),
  readFile(new URL('popup.html', extension), 'utf8'),
  readFile(new URL('popup.js', extension), 'utf8')
]);
const manifest = JSON.parse(manifestText);

assert.equal(manifest.version, '1.2.23', 'alterações na extensão incrementam pelo menos o patch');
assert.match(manifest.description, /Captura MCC D0\/D−1/);
assert.ok(popup.includes('id="capture-title"') && popup.includes('id="vsl-title"'), 'os títulos das seções permanecem visíveis');
assert.doesNotMatch(popup, /Na MCC, selecione um único dia, use o botão discreto abaixo/);
assert.doesNotMatch(popup, /Inicie o vídeo na aba ativa\. 1× e 10× usam reprodução contínua/);
assert.ok(popup.includes('id="scroll-to-bottom"') && popup.includes('id="vsl-speed-1"'), 'os controles de captura e velocidade permanecem disponíveis');
assert.ok(popup.includes('Vídeo principal HTML5 ou VTurb.'), 'a nota sobre o vídeo permanece visível');
assert.doesNotMatch(popup, /Captura a página atual e abre Top Offers CB com o campo preenchido/);
assert.ok(popup.includes('id="capture-clickbank"'), 'a ação de captura ClickBank permanece disponível');
assert.ok(popup.includes('id="capture-dtc-countries"') && popup.includes('id="dtc-countries-status"'), 'a captura de países da DTC tem ação e retorno próprios');
assert.doesNotMatch(popup, /No checkout DTC, capture|Mantenha Top Offers CB aberto no Hub/);
assert.match(popup, /class="clickbank-actions"[^>]*>[\s\S]*?id="capture-dtc-countries" class="secondary compact-action"[^>]*>[\s\S]*?<\/div>/, 'captura DTC compartilha o grupo e o tamanho compacto das ações ClickBank');
assert.match(manifest.description, /países comuns ClickBank/);
assert.ok(popup.includes('id="capture-d0"') && popup.includes('id="capture-d1"'), 'capturas diretas D0/D−1 permanecem disponíveis');
assert.ok(popup.includes('class="capture-actions" role="group" aria-label="Ações de captura MCC"'), 'botões D0 e D−1 ficam em um grupo horizontal');
assert.ok(popup.includes('class="clickbank-actions" role="group" aria-label="Ações ClickBank"'), 'ações ClickBank ficam em um grupo horizontal');
assert.match(popup, /\.capture-actions,\s*\.clickbank-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'cada par usa duas colunas flexíveis');
assert.match(popup, /button\.compact-action\s*\{[^}]*font-size:\s*12px[^}]*white-space:\s*nowrap/, 'botões em par são compactos e mantêm os rótulos em uma linha');
assert.ok(popup.includes('id="scroll-to-bottom"'), 'popup oferece rolagem automática antes das capturas');
assert.ok(popup.indexOf('id="scroll-to-bottom"') < popup.indexOf('id="capture-d1"'), 'rolagem fica acima dos botões de captura');
assert.match(popup, /button\.scroll-page[^}]*font-size:\s*11px/, 'botão de rolagem usa apresentação compacta e discreta');
for (const removedId of [
  'send-form','csv-file','send-button','read-grid','read-text','compare-csv','compare-button','experiment-status','experiment-result'
]) assert.ok(!popup.includes(`id="${removedId}"`), `popup não deve mais exibir ${removedId}`);
assert.doesNotMatch(popup, /Fallback · CSV manual|Experimento local|Testar leitura da MCC|Testar captura por texto|Comparar prévia com CSV/);
assert.doesNotMatch(script, /createCsvTransferPayload|READ_ACTIVE_MCC_GRID|READ_ACTIVE_MCC_TEXT|FORWARD_D0_CSV|compareMcc/i,
  'o popup mantém somente rolagem e ações diretas de captura');
assert.ok(script.includes("type: 'CAPTURE_AND_FORWARD_MCC_D0'") && script.includes("type: 'CAPTURE_AND_FORWARD_MCC_D1'"));
assert.ok(script.includes("type: 'SCROLL_ACTIVE_MCC_TO_BOTTOM'"));

assert.match(popup, /\.status\.error/);
assert.match(popup, /aria-atomic="true"/);
const background = await readFile(new URL('background.js', extension), 'utf8');
assert.equal((background.match(/errors: error\?\.errors/g) || []).length, 2, 'D0 e D−1 preservam erros estruturados até o popup');

class Element {
  constructor(tag, doc) {
    this.tag = tag; this.ownerDocument = doc; this.children = []; this.value = '';
    this.classes = new Set(); this.disabled = false;
    this.classList = { add:name => this.classes.add(name), remove:name => this.classes.delete(name) };
  }
  set textContent(value) { this.value = value; this.children = []; }
  get textContent() { return this.value + this.children.map(child => child.textContent).join('\n'); }
  append(node) { this.children.push(node); }
  replaceChildren() { this.children = []; this.value = ''; }
  addEventListener(type, callback) { this[type] = callback; }
}
const doc = { createElement:tag => new Element(tag, doc) };
const status = new Element('div', doc);
const failure = { ok:false, errors:[{ code:'duplicates', campaigns:['Oferta exemplo <img>'], message:'Duplicidade.' }] };
showCaptureError(status, failure);
assert.equal(status.children[0].textContent, 'Captura bloqueada: campanha duplicada');
assert.ok(status.classes.has('error'));
assert.match(status.textContent, /Oferta exemplo <img>/, 'nome é exibido literalmente, não interpretado como HTML');
assert.doesNotMatch(status.textContent, /incompleta|Outros problemas/);
showCaptureError(status, { errors:[...failure.errors, {code:'incomplete', message:'Lista parcial.'}] });
assert.match(status.textContent, /Outros problemas encontrados/);
assert.match(status.textContent, /Lista parcial/);
showCaptureError(status, { message:'Data incorreta.' });
assert.equal(status.children[0].textContent, 'Captura bloqueada');
assert.match(status.textContent, /Data incorreta/);
showCaptureStatus(status, 'Validando…');
assert.ok(!status.classes.has('error'));
assert.equal(status.textContent, 'Validando…');

// Exercita os dois cliques, sem Chrome real nem escrita no Preparador.
const d0 = new Element('button', doc), d1 = new Element('button', doc), scroll = new Element('button', doc);
const nodes = { '#capture-d0':d0, '#capture-d1':d1, '#scroll-to-bottom':scroll, '#capture-status':status,
  '#capture-clickbank':new Element('button',doc), '#restore-clickbank':new Element('button',doc),
  '#capture-dtc-countries':new Element('button',doc),
  ...Object.fromEntries([1,10,20,30].map(rate => [`#vsl-speed-${rate}`,new Element('button',doc)])) };
let response = failure;
const requests = [];
const context = vm.createContext({
  document:{ querySelector:selector => nodes[selector] },
  showCaptureStatus, showCaptureError, mountClickBankCapture:()=>{}, mountClickBankDtcCountries:()=>{}, mountVslSpeed:()=>{}, navigator:{clipboard:{}},
  chrome:{ runtime:{ sendMessage:async request => { requests.push(request.type); return response; } } }
});
vm.runInContext(script.replace(/^import .*?;\s*/gm, ''), context);
let resolveScroll;
response = new Promise(resolve => { resolveScroll = resolve; });
const scrollPromise = scroll.click();
assert.ok(d0.disabled && d1.disabled && scroll.disabled, 'capturas ficam temporariamente bloqueadas durante a rolagem');
resolveScroll({ ok:true, result:{ steps:4 } });
await scrollPromise;
assert.deepEqual(requests, ['SCROLL_ACTIVE_MCC_TO_BOTTOM']);
assert.match(status.textContent, /Fim da grade alcançado/);
assert.ok(!d0.disabled && !d1.disabled && !scroll.disabled);
response = failure;
for (const button of [d0, d1]) {
  await button.click();
  assert.equal(button.disabled, false);
  assert.equal(status.children[0].textContent, 'Captura bloqueada: campanha duplicada');
}
assert.deepEqual(requests, ['SCROLL_ACTIVE_MCC_TO_BOTTOM', 'CAPTURE_AND_FORWARD_MCC_D0', 'CAPTURE_AND_FORWARD_MCC_D1']);
response = { ok:true, result:{ campaignCount:2, reportDate:'2026-10-01', previewReady:true, waitingForD0:false } };
await d1.click();
assert.ok(!status.classes.has('error'));
assert.match(status.textContent, /D−1 validado e prévia pronta/);

// O service worker restringe a rolagem à aba ativa do Google Ads e injeta
// somente o helper geométrico, sem invocar o leitor da grade.
const backgroundSource = await readFile(new URL('background.js', extension), 'utf8');
let backgroundListener;
let activeTab = { id:17, url:'https://ads.google.com/aw/campaigns' };
let injected = null;
const scrollHelper = async () => ({ ok:true, steps:3 });
const backgroundContext = vm.createContext({
  chrome:{
    runtime:{ onMessage:{ addListener:listener => { backgroundListener = listener; } } },
    tabs:{ query:async () => [activeTab] },
    scripting:{ executeScript:async options => { injected = options; return [{ result:{ ok:true, steps:3 } }]; } }
  },
  scrollMccPageToBottom:scrollHelper
});
vm.runInContext(backgroundSource.replace(/^import .*?;\s*/gm, ''), backgroundContext);
const requestScroll = () => new Promise(resolve => {
  assert.equal(backgroundListener({ type:'SCROLL_ACTIVE_MCC_TO_BOTTOM' }, null, resolve), true);
});
const scrolled = await requestScroll();
assert.equal(scrolled.ok, true);
assert.equal(injected.target.tabId, 17);
assert.equal(injected.func, scrollHelper);
activeTab = { id:18, url:'https://example.com/' };
injected = null;
const rejected = await requestScroll();
assert.equal(rejected.ok, false);
assert.equal(injected, null, 'nenhum script é injetado fora da MCC');
console.log('MCC extension popup: rolagem discreta, ações em linha, D0/D−1, bloqueios e roteamento seguro; version 1.2.23');
