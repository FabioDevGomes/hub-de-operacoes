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

assert.equal(manifest.version, '1.2.3', 'alterações na extensão incrementam pelo menos o patch');
assert.match(manifest.description, /Captura a grade da MCC/);
assert.ok(popup.includes('id="capture-d0"') && popup.includes('id="capture-d1"'), 'capturas diretas D0/D−1 permanecem disponíveis');
for (const removedId of [
  'send-form','csv-file','send-button','read-grid','read-text','compare-csv','compare-button','experiment-status','experiment-result'
]) assert.ok(!popup.includes(`id="${removedId}"`), `popup não deve mais exibir ${removedId}`);
assert.doesNotMatch(popup, /Fallback · CSV manual|Experimento local|Testar leitura da MCC|Testar captura por texto|Comparar prévia com CSV/);
assert.doesNotMatch(script, /createCsvTransferPayload|READ_ACTIVE_MCC_GRID|READ_ACTIVE_MCC_TEXT|FORWARD_D0_CSV|compareMcc/i,
  'o popup mantém somente as ações diretas de captura');
assert.ok(script.includes("type: 'CAPTURE_AND_FORWARD_MCC_D0'") && script.includes("type: 'CAPTURE_AND_FORWARD_MCC_D1'"));

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
const d0 = new Element('button', doc), d1 = new Element('button', doc);
const nodes = { '#capture-d0':d0, '#capture-d1':d1, '#capture-status':status };
let response = failure;
const requests = [];
const context = vm.createContext({
  document:{ querySelector:selector => nodes[selector] },
  showCaptureStatus, showCaptureError,
  chrome:{ runtime:{ sendMessage:async request => { requests.push(request.type); return response; } } }
});
vm.runInContext(script.replace(/^import .*?;\s*/s, ''), context);
for (const button of [d0, d1]) {
  await button.click();
  assert.equal(button.disabled, false);
  assert.equal(status.children[0].textContent, 'Captura bloqueada: campanha duplicada');
}
assert.deepEqual(requests, ['CAPTURE_AND_FORWARD_MCC_D0', 'CAPTURE_AND_FORWARD_MCC_D1']);
response = { ok:true, result:{ campaignCount:2, reportDate:'2026-10-01', waitingForD0:true } };
await d1.click();
assert.ok(!status.classes.has('error'));
assert.match(status.textContent, /Aguardando D0/);
console.log('MCC extension popup: D0/D−1, duplicate error emphasis, safe text, status reset; version 1.2.3');
