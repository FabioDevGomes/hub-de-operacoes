import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const html=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8');
const functionSource=name=>html.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n    \\}`))?.[0] || '';
const names=['captureReportSummary','normalizeCapturedReports','capturedReportsForD0','refreshCurrentCaptureReports','normalizeD0CaptureHistory','readD0CaptureHistory','writeD0CaptureHistory','newD0CaptureEntry','canonicalAccountId','addIsoDay','reportDatePairIssue','renderHistoricalReport','renderCapturePeriodIndicators','renderSelectedCaptureReports','metaLine','updateD0ApplyAvailability','sourcesHaveDisjointAccounts','installParsedSource'];
class Element {
  constructor(){this.children=[];this.nodes=new Map();this.attributes={};this.hidden=false;this.classList={toggle(){}};}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Element());return this.nodes.get(key);}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
}
const plain=value=>JSON.parse(JSON.stringify(value));
const source=(date,manager='111-222-3333',count=2)=>({managerAccountId:manager,managerAccountName:'MCC sintética',dates:[date],records:Array.from({length:count},()=>({moeda:'BRL'}))});
const timestamp='2026-10-08T12:00:00.000Z';
function harness(){
  const nodes=new Map();
  const context={slots:{d0:null,d1:null},excludedD0:null,d0CaptureHistory:[],selectedD0CaptureId:null,browsingCaptureReports:false,
    D0_CAPTURE_HISTORY_KEY:'test',D0_CAPTURE_HISTORY_LIMIT:7,currentResult:null,numberingValidationReady:true,numberingIssues:[],
    q(key){if(!nodes.has(key))nodes.set(key,new Element());return nodes.get(key);},
    document:{createElement:()=>new Element()},renderSlot:slot=>context.liveRendered.push(slot),liveRendered:[],
    attemptBuild(){},renderCaptureMode(){},clearD1DeltaPanel(){},previewSort:{},
    formatD0CaptureFullTime:value=>value,
    saveD0CaptureEntry(entry){context.d0CaptureHistory=context.normalizeD0CaptureHistory([...context.d0CaptureHistory.filter(item=>item.id!==entry.id),entry]);}
  };
  vm.runInNewContext(names.map(functionSource).join('\n'),context);
  return {c:context,nodes};
}
test('barra superior contém dois indicadores fixos, sem borda, com contexto único e responsividade',()=>{
  const panel=html.match(/<section class="panel" id="d0-capture-history-panel"[\s\S]*?<\/section>/)[0];
  const header=panel.slice(0,panel.indexOf('<div class="panel-body">'));
  for(const period of ['d1','d0'])assert.ok(header.includes('data-capture-period="'+period+'"'));
  assert.equal((html.match(/id="capture-report-context"/g)||[]).length,1);
  assert.ok(header.includes('id="capture-report-context"'));
  assert.ok(header.includes('role="status" aria-live="polite" aria-label="Períodos registrados'));
  assert.match(html,/\.capture-period-indicators \{[^}]*grid-template-columns: repeat\(2, 116px\)[^}]*margin-left: auto/);
  assert.match(html,/\.capture-period-indicator \{[^}]*border: 0[^}]*background: var\(--surface-soft\)/);
  assert.match(html,/\.capture-period-indicator\[data-state="captured"\] \{ background: var\(--green-soft\); color: var\(--green\)/);
  assert.match(html,/@media \(max-width: 480px\).*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('indicadores refletem apenas o histórico selecionado, inclusive ausência comprovada e legado desconhecido',()=>{
  const {c,nodes}=harness();
  const indicator=period=>nodes.get('[data-capture-period="'+period+'"]');
  const d0=c.newD0CaptureEntry(source('2026-10-08',undefined,0),timestamp);
  c.slots.d1=source('2026-10-07');
  const both=c.newD0CaptureEntry(source('2026-10-08'),timestamp);
  c.slots.d0=source('2026-10-09','444-555-6666');c.browsingCaptureReports=true;
  const before=JSON.stringify([d0,both,c.slots]);
  c.renderSelectedCaptureReports(d0);
  assert.equal(indicator('d0').attributes['data-state'],'captured','zero campaigns still proves capture');
  assert.equal(indicator('d1').attributes['data-state'],'missing','live D−1 must not illuminate a different historical record');
  assert.equal(indicator('d1').querySelector('small').textContent,'Não capturado');
  c.renderSelectedCaptureReports(both);
  assert.equal(indicator('d1').attributes['data-state'],'captured');
  assert.equal(indicator('d0').attributes['data-state'],'captured');
  const legacy={...d0};delete legacy.reports;c.renderSelectedCaptureReports(legacy);
  assert.equal(indicator('d0').attributes['data-state'],'captured');
  assert.equal(indicator('d1').attributes['data-state'],'unknown');
  assert.equal(indicator('d1').querySelector('small').textContent,'Não registrado');
  const invalid=plain(both);invalid.reports.d1.managerAccountId='444-555-6666';c.renderSelectedCaptureReports(invalid);
  assert.equal(indicator('d1').attributes['data-state'],'unknown');
  assert.equal(JSON.stringify([d0,both,c.slots]),before);
});

test('captura atual sinaliza D−1/D0 isolados, ambos, erro, D0 excluído e limpeza sem gravar',()=>{
  const {c,nodes}=harness(),state=period=>nodes.get('[data-capture-period="'+period+'"]');
  c.q('#d0-history-save-status').hidden=true;
  c.slots.d1=source('2026-10-07');c.renderSelectedCaptureReports(null);
  assert.equal(state('d1').attributes['data-state'],'captured');assert.equal(state('d0').attributes['data-state'],'waiting');
  assert.equal(nodes.get('#d0-capture-history-panel').hidden,false);
  c.slots.d1=null;c.slots.d0=source('2026-10-08');c.renderSelectedCaptureReports(null);
  assert.equal(state('d1').attributes['data-state'],'waiting');assert.equal(state('d0').attributes['data-state'],'captured');
  c.slots.d1=source('2026-10-07');c.renderSelectedCaptureReports(null);
  assert.equal(state('d1').attributes['data-state'],'captured');assert.equal(state('d0').attributes['data-state'],'captured');
  c.excludedD0=c.slots.d0;c.slots.d0=null;c.renderSelectedCaptureReports(null);
  assert.equal(state('d0').querySelector('small').textContent,'✓ Fora da prévia');
  assert.match(state('d0').title,/não será aplicado/);
  c.excludedD0=null;c.slots.d1={error:'inválida'};c.renderSelectedCaptureReports(null);
  assert.equal(state('d1').attributes['data-state'],'error');
  c.slots.d1=null;c.renderSelectedCaptureReports(null);
  assert.equal(state('d1').attributes['data-state'],'waiting');assert.equal(state('d0').attributes['data-state'],'waiting');
  assert.equal(nodes.get('#d0-capture-history-panel').hidden,true);
  assert.deepEqual(c.d0CaptureHistory,[]);
});

test('resumos persistem D0 sozinho ou ambos com datas, horários, MCC, contagem e moedas; não guardam registros',()=>{
  const {c}=harness(),d0=source('2026-10-08',undefined,0);
  const entry=c.newD0CaptureEntry(d0,timestamp);
  let normalized=c.normalizeD0CaptureHistory([entry])[0];
  assert.equal(normalized.reports.d0.campaignCount,0);
  assert.equal(normalized.reports.d1,null);
  c.slots.d1={...source('2026-10-07'),receivedAt:'2026-10-08T11:00:00Z'};
  normalized=c.normalizeD0CaptureHistory([c.newD0CaptureEntry(d0,timestamp)])[0];
  assert.equal(normalized.reports.d1.campaignCount,2);
  assert.deepEqual(plain(normalized.reports.d1.dates),['2026-10-07']);
  assert.equal(normalized.reports.d1.capturedAt,'2026-10-08T11:00:00.000Z');
  assert.deepEqual(plain(normalized.reports.d0.currencies),[]);
  assert.ok(!JSON.stringify(normalized.reports).includes('records'));
  const storage={getItem:()=>JSON.stringify([normalized]),setItem(){throw Error('read must not write');}};
  assert.deepEqual(plain(c.readD0CaptureHistory(storage)),plain([normalized]));
  assert.equal(c.writeD0CaptureHistory({setItem(){throw Error('quota');}},[entry]),false);
});
test('não associa D−1 de outra MCC/data nem aceita metadados inválidos como captura comprovada',()=>{
  const {c}=harness(),d0=source('2026-10-08');
  for(const d1 of [source('2026-10-07','444-555-6666'),source('2026-10-06')]){
    c.slots.d1=d1;assert.equal(c.newD0CaptureEntry(d0,timestamp).reports.d1,null);
  }
  c.slots.d1=source('2026-10-07');
  const entry=plain(c.newD0CaptureEntry(d0,timestamp));
  for(const change of [e=>e.reports.d1.managerAccountId='444-555-6666',e=>e.reports.d1.dates=['2026-10-06'],e=>e.reports.d0.campaignCount='2',e=>delete e.reports.d1,e=>e.reports.d0.dates=['2026-02-31']]){
    const invalid=structuredClone(entry);change(invalid);
    assert.equal(c.normalizeCapturedReports(invalid.reports,invalid),null);
  }
});
test('D−1 recebido depois atualiza apenas o contexto da captura D0 atual e mantém deltas congelados',()=>{
  const {c}=harness(),d0=source('2026-10-08');
  d0.captureHistory=c.newD0CaptureEntry(d0,timestamp);
  const row={campaign:'Oferta sintética',currency:'BRL',impressions:0,clicks:1,cost:2,status:null};
  c.d0CaptureHistory=c.normalizeD0CaptureHistory([{...d0.captureHistory,state:'calculated',rows:[row]}]);
  c.slots.d0=d0;c.slots.d1={...source('2026-10-07'),receivedAt:timestamp};
  c.refreshCurrentCaptureReports();
  assert.equal(c.d0CaptureHistory[0].state,'calculated');
  assert.deepEqual(plain(c.d0CaptureHistory[0].rows),[row]);
  assert.equal(c.d0CaptureHistory[0].reports.d1.campaignCount,2);
  const before=JSON.stringify(c.d0CaptureHistory);
  c.slots.d1=source('2026-10-07','444-555-6666');c.refreshCurrentCaptureReports();
  assert.equal(JSON.stringify(c.d0CaptureHistory),before);
});
test('cartões seguem a seleção, distinguem ausência de D−1 de histórico incompleto e nunca usam número de deltas como total',()=>{
  const {c,nodes}=harness(),entry=plain(c.newD0CaptureEntry(source('2026-10-08'),timestamp));
  c.renderSelectedCaptureReports(entry);
  assert.match(nodes.get('#capture-report-context').textContent,/Somente D0/);
  assert.equal(nodes.get('[data-slot="d1"]').querySelector('.status-pill').textContent,'Não capturado');
  const total=nodes.get('[data-slot="d0"]').querySelector('.capture-meta').children[1].children[1];
  assert.equal(total.textContent,'2 campanhas');
  c.slots.d1=source('2026-10-07');
  const combined=plain(c.newD0CaptureEntry(source('2026-10-08'),timestamp));
  c.browsingCaptureReports=true;c.renderSelectedCaptureReports(combined);
  assert.match(nodes.get('#capture-report-context').textContent,/D0 e D−1 capturados/);
  assert.equal(nodes.get('[data-slot="d1"]').querySelector('.status-pill').textContent,'Capturada');
  assert.equal(nodes.get('#show-current-reports').hidden,false);
  assert.equal(nodes.get('#d1-only').hidden,true);
  const legacy={...entry};delete legacy.reports;
  const original=JSON.stringify(legacy);c.renderSelectedCaptureReports(legacy);
  assert.equal(nodes.get('[data-slot="d1"]').querySelector('.status-pill').textContent,'Não registrado');
  assert.equal(nodes.get('[data-slot="d0"]').querySelector('.capture-meta').children[1].children[1].textContent,'Não registrado');
  assert.equal(JSON.stringify(legacy),original);
  c.browsingCaptureReports=false;c.renderSelectedCaptureReports(null);
  assert.equal(nodes.get('#capture-report-context').hidden,true);
  assert.equal(nodes.get('#d1-only').hidden,false);
  assert.deepEqual(c.liveRendered,['d1','d0']);
});
test('consulta histórica bloqueia Atualizar base mesmo com prévia D−1 válida; voltar restaura disponibilidade',()=>{
  const {c,nodes}=harness();
  c.slots.d1=source('2026-10-07');
  c.currentResult={manifest:{validacao_manifesto:{modo_entrada:'D_menos_1_somente'}},critical:[]};
  c.browsingCaptureReports=true;c.updateD0ApplyAvailability();
  assert.equal(nodes.get('#apply-manifest').disabled,true);
  c.browsingCaptureReports=false;c.updateD0ApplyAvailability();
  assert.equal(nodes.get('#apply-manifest').disabled,false);
});
test('recepção instala horários reais, associa períodos nos dois sentidos e sai da consulta histórica',()=>{
  for(const order of [['d0','d1'],['d1','d0']]){
    const {c}=harness();c.browsingCaptureReports=true;
    for(const slot of order){
      c.installParsedSource(slot,source(slot==='d0'?'2026-10-08':'2026-10-07'),{capturedAt:slot==='d0'?timestamp:'2026-10-08T11:00:00Z'});
    }
    assert.equal(c.browsingCaptureReports,false);
    assert.equal(c.d0CaptureHistory.length,1);
    assert.equal(c.d0CaptureHistory[0].reports.d1.capturedAt,'2026-10-08T11:00:00.000Z');
    assert.equal(c.d0CaptureHistory[0].reports.d0.capturedAt,timestamp);
    assert.equal(c.slots.d0.records.length,2);
    assert.equal(c.slots.d1.records.length,2);
  }
});
