import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const html = await readFile(new URL('../src/preparador-MCC/index.html', import.meta.url), 'utf8');
const source = (date, managerAccountId='111-222-3333') => ({
  dates:[date], managerAccountId, managerAccountName:'MCC sintética', duplicateNames:{},
  records:[{ conta_id:'444-555-6666', nome_campanha_exato:'Oferta sintética' }]
});

function harness() {
  const nodes = new Map();
  const context = vm.createContext({
    slots:{ d1:null, d0:null }, excludedD0:null, currentResult:null, currentManifest:null,
    previewRole:'d1', previewSort:{}, currentFilename:'', numberingValidationReady:false,
    buildCalls:0, writes:0, history:[], rendered:[],
    q(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { textContent:'', disabled:false, handlers:{},
        addEventListener(type, handler) { this.handlers[type] = handler; } });
      return nodes.get(selector);
    },
    qa:() => [], canonicalAccountId:value => String(value || '').replace(/\D/g,''),
    renderSlot:slot => context.rendered.push(slot), clearD1DeltaPanel(){},
    renderSelectedCaptureReports(){}, renderCapturePeriodIndicators(){}, refreshCurrentCaptureReports(){},
    renderD0CaptureHistory(){}, updateD0ApplyAvailability(){}, browsingCaptureReports:false,
    newD0CaptureEntry:parsed => ({ id:parsed.dates[0] }),
    saveD0CaptureEntry:entry => context.history.push(entry),
    resetResults(){ context.currentResult=null; },
    showInputBlock(message){ context.block=message; context.currentResult=null; },
    buildManifest(d1,d0) {
      context.buildCalls++;
      return { payload:'{}', manifest:{
        validacao_manifesto:{ modo_entrada:d1 && d0 ? 'D_menos_1_e_D_zero' : d1 ? 'D_menos_1_somente' : 'D_zero_somente' },
        separacao_temporal:{ D_menos_1:{datas_detectadas:d1?.dates || []}, D_zero:{datas_detectadas:d0?.dates || []} }
      } };
    },
    renderResults(){}, validatePreparedNumbering(){}, renderPreviewTable(){},
    decodeMccD1GridCapture:async capture => { if (capture.invalid) throw new Error('D−1 inválido'); return capture; },
    decodeMccGridCapture:async capture => capture,
    parseSource:decoded => decoded.parsed,
    sourceDescriptor:() => ({ colunas_obrigatorias_ausentes:[] }),
    applyManifestToPanel(){ context.writes++; }, window:{}
  });
  const dateStart=html.indexOf('    const MCC_OPERATIONAL_TIME_ZONE');
  vm.runInContext(html.slice(dateStart,html.indexOf('    function parseNumber',dateStart)),context);
  const start=html.indexOf('    function attemptBuild()');
  const end=html.indexOf("    qa('.source-tab')",start);
  vm.runInContext(html.slice(start,end),context);
  const receiveStart=html.indexOf("    q('#clear-all').addEventListener");
  const receiveEnd=html.indexOf("    q('#apply-manifest').addEventListener",receiveStart);
  vm.runInContext(html.slice(receiveStart,receiveEnd),context);
  return { context, nodes, capture:parsed => ({ parsed, reportDate:parsed.dates[0], campaignCount:parsed.records.length }) };
}

test('D−1 aceita D0 antigo fora da prévia, sem perder captura ou gravar base/histórico',async () => {
  const {context:c,nodes,capture}=harness();
  const old=source('2026-10-07');
  old.captureHistory={id:'histórico-preservado'};
  c.slots.d0=old;
  const d1=source('2026-10-07');
  const result=await c.window.__hubReceiveMccD1Grid(capture(d1));
  assert.equal(result.ok,true);
  assert.equal(result.previewReady,true);
  assert.equal(c.currentResult.manifest.validacao_manifesto.modo_entrada,'D_menos_1_somente');
  assert.equal(c.slots.d1,d1);
  assert.equal(c.slots.d0,null);
  assert.equal(c.excludedD0,old);
  assert.equal(old.captureHistory.id,'histórico-preservado');
  assert.equal(c.currentResult.manifest.separacao_temporal.D_zero.datas_detectadas.length,0);
  assert.match(nodes.get('#capture-mode-status').textContent,/preservado fora da prévia; não será aplicado/);
  assert.equal(c.writes,0);
  assert.equal(c.history.length,0);
  // Repetir D−1 não perde a captura D0 já excluída.
  await c.window.__hubReceiveMccD1Grid(capture(d1));
  assert.equal(c.excludedD0,old);
});

test('D−1 sozinho e D−1/D0 compatíveis continuam disponíveis',async () => {
  for (const d0 of [null,source('2026-10-08')]) {
    const {context:c,capture}=harness();
    c.slots.d0=d0;
    await c.window.__hubReceiveMccD1Grid(capture(source('2026-10-07')));
    assert.equal(c.slots.d0,d0);
    assert.equal(c.excludedD0,null);
    assert.equal(c.currentResult.manifest.validacao_manifesto.modo_entrada,d0?'D_menos_1_e_D_zero':'D_menos_1_somente');
    assert.equal(c.writes,0);
  }
});

test('usuário pode escolher somente D−1 mesmo com D0 compatível e depois recombinar',async () => {
  const {context:c,nodes,capture}=harness();
  const d0=source('2026-10-08');
  c.slots.d0=d0;
  await c.window.__hubReceiveMccD1Grid(capture(source('2026-10-07')));
  const button=nodes.get('#d1-only');
  assert.equal(button.disabled,false);
  button.handlers.click();
  assert.equal(c.excludedD0,d0);
  assert.equal(c.currentResult.manifest.validacao_manifesto.modo_entrada,'D_menos_1_somente');
  assert.equal(button.textContent,'Incluir D0 na prévia');
  button.handlers.click();
  assert.equal(c.slots.d0,d0);
  assert.equal(c.excludedD0,null);
  assert.equal(c.currentResult.manifest.validacao_manifesto.modo_entrada,'D_menos_1_e_D_zero');
  assert.equal(c.writes,0);
});

test('D0 incompatível não pode ser reincluído nem substituir a prévia D−1 válida',async () => {
  for (const d0 of [source('2026-10-07'),source('2026-10-08','777-888-9999')]) {
    const {context:c,nodes,capture}=harness();
    c.slots.d0=d0;
    await c.window.__hubReceiveMccD1Grid(capture(source('2026-10-07')));
    const result=c.currentResult;
    nodes.get('#d1-only').handlers.click();
    assert.equal(c.currentResult,result);
    assert.equal(c.slots.d0,null);
    assert.equal(c.excludedD0,d0);
    assert.match(nodes.get('#capture-mode-status').textContent,/A prévia continua somente D−1/);
    assert.equal(c.writes,0);
  }
});

test('nova captura D0 compatível combina; uma incompatível é recusada sem perder D−1',async () => {
  const {context:c,capture}=harness();
  c.slots.d0=source('2026-10-07');
  await c.window.__hubReceiveMccD1Grid(capture(source('2026-10-07')));
  const old=c.excludedD0;
  const result=c.currentResult;
  await assert.rejects(c.window.__hubReceiveMccD0Grid(capture(source('2026-10-07'))),/não são consecutivas/);
  assert.equal(c.excludedD0,old);
  assert.equal(c.currentResult,result);
  await c.window.__hubReceiveMccD0Grid(capture(source('2026-10-08')));
  assert.equal(c.excludedD0,null);
  assert.equal(c.currentResult.manifest.validacao_manifesto.modo_entrada,'D_menos_1_e_D_zero');
  assert.equal(c.history.length,1);
  assert.equal(c.writes,0);
});

test('D−1 rejeitado não exclui D0; controles vazios não montam prévia nem escrevem',async () => {
  const {context:c,nodes,capture}=harness();
  c.renderCaptureMode();
  assert.equal(nodes.get('#d1-only').disabled,true);
  nodes.get('#d1-only').handlers.click();
  assert.equal(c.buildCalls,0);
  const d0=source('2026-10-07'); c.slots.d0=d0;
  await assert.rejects(c.window.__hubReceiveMccD1Grid({...capture(source('2026-10-07')),invalid:true}),/inválido/);
  await assert.rejects(c.window.__hubReceiveMccD1Grid({...capture(source('2026-10-07')),campaignCount:2}),/quantidade/);
  await assert.rejects(c.window.__hubReceiveMccD1Grid({...capture(source('2026-10-07')),reportDate:'2026-10-06'}),/data D−1/);
  assert.equal(c.slots.d0,d0);
  assert.equal(c.excludedD0,null);
  assert.equal(c.buildCalls,0);
  assert.equal(c.writes,0);
});

test('fonte publicada conserva os controles e o estado de D−1 isolado',async () => {
  assert.equal(await readFile(new URL('../dist/preparador-MCC/index.html',import.meta.url),'utf8'),html);
  assert.match(html,/id="d1-only" type="button" disabled/);
  assert.match(html,/id="capture-mode-status" role="status" aria-live="polite"/);
  assert.match(html,/pill.textContent = 'Fora da prévia'/);
});
