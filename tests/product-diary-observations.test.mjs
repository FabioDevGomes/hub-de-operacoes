import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const context=vm.createContext({window:{},structuredClone,queueMicrotask});
for(const file of ['database.js','product-diary/domain.js','product-diary/cpa-adjustment-domain.js','product-diary/observation-domain.js','product-diary/observation-storage.js','product-diary/view.js']){
  vm.runInContext(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),context);
}
const {ProductDiaryObservations:domain,ProductDiaryObservationStorage:storage,ProductDiaryView:view,ProductDiaryDomain:diary,ProductDiaryCpaAdjustmentDomain:cpaDomain,CampaignDatabase:database}=context.window;
const date='2026-10-02',now='2026-10-06T12:00:00.000Z';
const base=()=>({schema:database.SCHEMA,campanhas:[{id:'a',nome_exibicao:'Mesmo nome',status:'pausada'},{id:'b',nome_exibicao:'Mesmo nome',status:'ativa'}],
  diario:[{campanha_id:'a',data:date,celulas:{A:{value:date},Q:{value:'Pausada'},O:{value:12},P:{value:30},F:{value:1}}}],
  manifesto_atual:{campanhas:[]},vendas_provisorias:[],event_log:[],atualizado_em:'antes',other:{preserved:true}});
const input=(text='Texto revisado',campaignId='a',expectedRevision=0)=>({campaignId,date,text,expectedRevision});
test('CPA previews support independent 2 and 4 percentage-point steps',()=>{
  const adjustment={targetCpaMicros:27_600_000,commissionCents:4_600,commissionCurrency:'USD',currencyCode:'USD'};
  assert.deepEqual(JSON.parse(JSON.stringify(cpaDomain.supportedStepPercentages)),[2,4]);
  assert.equal(cpaDomain.defaultStepPercentagePoints,2);
  assert.equal(cpaDomain.createPreview(adjustment,'increase').targetCpaMicros,28_520_000,'o passo legado continua em 2 pontos');
  assert.equal(cpaDomain.createPreview(adjustment,'increase',4).targetCpaMicros,29_440_000);
  assert.equal(cpaDomain.createPreview(adjustment,'decrease',4).targetCpaMicros,25_760_000);
  assert.equal(cpaDomain.createPreview(adjustment,'increase',3),null,'passos fora da lista permitida são recusados');
});
test('bulk pause lookup preserves individual lookup semantics, including historical events',()=>{
  const data={campanhas:[{id:'a'},{id:2},{id:'a'},{id:'missing'},{id:3}],observacoes_diario:[
    {campanha_id:'a',eventos:[{tipo:'google_ads_auto_pause',ocorrido_em_data:'2026-10-01'}]},
    {campanha_id:'2',eventos:[{tipo:'google_ads_auto_pause',ocorrido_em_utc:'2026-10-02T12:00:00Z'}]},
    {campanha_id:3,eventos:[{tipo:'other'}]}, {campanha_id:'unknown',eventos:[{tipo:'google_ads_auto_pause'}]}
  ]};
  const before=JSON.stringify(data);
  const expected=data.campanhas.filter(c=>domain.hasAutomaticPauseEvent(data,c.id)).map(c=>String(c.id));
  assert.deepEqual(Array.from(domain.automaticPauseCampaignIds(data)),expected);
  assert.deepEqual(Array.from(domain.automaticPauseCampaignIds({})),[]);
  assert.equal(JSON.stringify(data),before);
});
test('notes use stable campaign/date, preserve source Q and every financial/status field',()=>{
  const original=base(),before=JSON.stringify(original),updated=domain.saveObservation(original,input(),now);
  assert.equal(JSON.stringify(original),before);
  assert.equal(updated.diario[0].celulas.Q.value,'Pausada');
  assert.equal(domain.observationFor(updated,'a',date).texto,'Texto revisado');
  assert.equal(domain.observationFor(updated,'b',date),null);
  const stripped=structuredClone(updated);delete stripped.observacoes_diario;stripped.atualizado_em='antes';
  assert.deepEqual(stripped,original);
});
test('notes survive JSON backup, normalization and MCC import; revisions retain previous text',()=>{
  const first=domain.saveObservation(base(),input(),now),normalized=database.normalize(JSON.parse(JSON.stringify(first)));
  const second=domain.saveObservation(normalized,input('Segunda edição','a',1),'2026-10-06T13:00:00Z');
  assert.equal(domain.observationFor(second,'a',date).revisao,2);
  assert.equal(domain.observationFor(second,'a',date).historico[0].texto,'Texto revisado');
  assert.equal(domain.observationFor(second,'a',date).historico[0].revisao,1);
  const otherCampaign=domain.saveObservation(second,input('Outra campanha','b',0),now);
  assert.equal(domain.observationFor(otherCampaign,'a',date).texto,'Segunda edição');
  assert.equal(domain.observationFor(otherCampaign,'b',date).texto,'Outra campanha');
  assert.equal(domain.observationFor(database.normalize(otherCampaign),'b',date).texto,'Outra campanha');
  const imported=database.importManifest(otherCampaign,{schema:'manifesto_mcc_v1',campanhas:[],separacao_temporal:{}}).base;
  assert.equal(domain.observationFor(imported,'a',date).texto,'Segunda edição');
  assert.equal(domain.observationFor(imported,'a',date).historico[0].texto,'Texto revisado');
});
test('explicit blank is saved, identical text is no-op, stale revisions and invalid inputs reject',()=>{
  const first=domain.saveObservation(base(),input(''),now);
  assert.equal(domain.observationFor(first,'a',date).texto,'');
  assert.equal(domain.saveObservation(first,input('','a',1),now),first);
  assert.throws(()=>domain.saveObservation(first,input('stale')),/outra janela/);
  assert.throws(()=>domain.saveObservation(base(),input('x','missing')),/não identificada/);
  assert.throws(()=>domain.saveObservation(base(),{...input(),date:'2026-02-30'}),/Data/);
  assert.throws(()=>domain.saveObservation(base(),input('x'.repeat(10001))),/10.000/);
});
test('search-term review events are campaign-scoped, idempotent and listed alongside successful CPA adjustments',()=>{
  const original=base(),review=domain.appendSearchTermsAnalysisEvent(original,{campaignId:'a',occurredAtUtc:'2026-11-06T03:10:00.000Z'},'2026-11-06T03:11:00.000Z');
  assert.notEqual(review,original);assert.equal(original.observacoes_diario,undefined);
  const observation=domain.observationFor(review,'a','2026-11-06');
  assert.equal(observation.eventos[0].tipo,'google_ads_search_terms_analysis');
  assert.equal(observation.eventos[0].acao,'review_search_terms');
  assert.equal(domain.appendSearchTermsAnalysisEvent(review,{campaignId:'a',occurredAtUtc:'2026-11-06T03:10:00.000Z'},'2026-11-06T03:12:00.000Z'),review);
  assert.throws(()=>domain.appendSearchTermsAnalysisEvent(review,{campaignId:'missing',occurredAtUtc:'2026-11-06T03:10:00Z'}),/não identificada/);
  const cpa=domain.appendCpaAdjustmentEvent(review,{campaignId:'a',verifiedAtUtc:'2026-11-06T03:20:00Z',direction:'increase',previousTargetCpaMicros:1_000_000,targetCpaMicros:1_020_000,commissionTargetCents:10_000,currencyCode:'USD'},'2026-11-06T03:20:01Z');
  const indicators=domain.campaignAnalysisIndicators({...cpa,observacoes_diario:[...cpa.observacoes_diario,{campanha_id:'unknown',data:'2026-11-06',eventos:[{tipo:'google_ads_search_terms_analysis',acao:'review_search_terms',ocorrido_em_utc:'2026-11-06T03:30:00Z'}]}]});
  assert.deepEqual(JSON.parse(JSON.stringify(indicators)),[{campaignId:'a',occurredAtUtc:'2026-11-06T03:20:00.000Z',action:'CPA aumentado em 2%'}]);
  const decreased=domain.appendCpaAdjustmentEvent(cpa,{campaignId:'a',verifiedAtUtc:'2026-11-06T03:30:00Z',direction:'decrease',previousTargetCpaMicros:1_020_000,targetCpaMicros:999_600,commissionTargetCents:10_000,currencyCode:'USD'},'2026-11-06T03:30:01Z');
  assert.deepEqual(JSON.parse(JSON.stringify(domain.campaignAnalysisIndicators(decreased))),[{campaignId:'a',occurredAtUtc:'2026-11-06T03:30:00.000Z',action:'CPA reduzido em 2%'}]);
  assert.deepEqual(JSON.parse(JSON.stringify(domain.campaignAnalysisIndicators(review))),[{campaignId:'a',occurredAtUtc:'2026-11-06T03:10:00.000Z',action:'Avaliação de termos de pesquisa'}]);
});

// Isolated transactional double; never opens the user's IndexedDB.
function memoryDb(initial,{failPut=false}={}){
  let stored=structuredClone(initial),writes=0,closed=0;
  const db={close(){closed++},transaction(name,mode){
    assert.equal(name,'bases');assert.equal(mode,'readwrite');
    const tx={error:null,aborted:false,objectStore(){return{
      get(key){assert.equal(key,'atual');const request={};queueMicrotask(()=>{
        request.result=structuredClone(stored);request.onsuccess();
        if(!tx.aborted)queueMicrotask(()=>tx.oncomplete());
      });return request},
      put(value,key){assert.equal(key,'atual');if(failPut)throw new Error('storage bloqueado');stored=structuredClone(value);writes++}
    }},abort(){tx.aborted=true;queueMicrotask(()=>tx.onabort())}};
    return tx;
  }};
  return {openDatabase:async()=>db,get:()=>stored,get writes(){return writes},get closed(){return closed}};
}
test('reported snapshot pause appends a distinct Diary and capture-history event atomically and idempotently',async()=>{
  const db=memoryDb(base()),input={
    campaignId:'a',googleCampaignId:'24408705974',managerCustomerId:'3533796641',customerId:'4404265713',
    managerName:'MCC Nutra',accountName:'Conta de teste',campaignName:'Campanha de teste',captureRecordId:'capture:current',
    observedFromUtc:'2026-11-02T13:14:08.107Z',observedToUtc:'2026-11-02T15:15:04.386Z',beforeStatus:'ENABLED',afterStatus:'PAUSED',
  };
  const result=await storage.appendObservedAutomaticPauseEvent({...db,domain,database,input});
  assert.equal(result.changed,true);
  const observation=domain.observationFor(result.base,'a','2026-11-02');
  assert.equal(observation.eventos[0].tipo,'google_ads_auto_pause_observed');
  assert.equal(observation.eventos[0].relatado_pelo_usuario,true);
  assert.equal(result.base.google_ads_api_change_history[0].eventType,'automatic_pause_observed');
  assert.equal(result.base.google_ads_api_change_history[0].status,'observed');
  assert.equal(result.base.google_ads_api_change_history[0].observedFromUtc,input.observedFromUtc);
  assert.equal(result.base.google_ads_api_change_history[0].observedToUtc,input.observedToUtc);
  assert.equal(result.base.google_ads_api_change_history[0].changes[0].reason,'Transição ativa → pausada observada entre snapshots; regra e horário exato não disponíveis.');
  const duplicate=await storage.appendObservedAutomaticPauseEvent({...db,domain,database,input});
  assert.equal(duplicate.changed,false);
  assert.equal(db.writes,1);
});
test('storage reads latest persisted base, preserves other-window changes and closes transaction',async()=>{
  const latest=base();latest.other.fromAnotherWindow='preservado';const db=memoryDb(latest);
  const result=await storage.save({...db,domain,input:input()});
  assert.equal(result.other.fromAnotherWindow,'preservado');assert.equal(db.get().diario[0].celulas.O.value,12);
  assert.equal(db.writes,1);assert.equal(db.closed,1);
  await assert.rejects(storage.save({...db,domain,input:input('outro')}),/outra janela/);
  assert.equal(db.writes,1);assert.equal(db.closed,2);
});
test('missing base and storage failure reject without reporting success',async()=>{
  const missing=memoryDb(null);await assert.rejects(storage.save({...missing,domain,input:input()}),/Carregue a base/);
  assert.equal(missing.writes,0);assert.equal(missing.closed,1);
  const blocked=memoryDb(base(),{failPut:true});await assert.rejects(storage.save({...blocked,domain,input:input()}),/bloqueado/);
  assert.equal(blocked.writes,0);assert.equal(blocked.closed,1);
});
test('search-term review storage commits once and reports a duplicate as a no-op',async()=>{
  const db=memoryDb(base()),input={campaignId:'a',occurredAtUtc:'2026-11-06T03:10:00Z'};
  const result=await storage.appendSearchTermsAnalysisEvent({...db,domain,input});
  assert.equal(result.changed,true);assert.equal(db.writes,1);assert.equal(db.closed,1);
  const duplicate=await storage.appendSearchTermsAnalysisEvent({...db,domain,input});
  assert.equal(duplicate.changed,false);assert.equal(db.writes,1);assert.equal(db.closed,2);
});
test('verified CPA adjustment storage commits once and reports a duplicate as a no-op',async()=>{
  const db=memoryDb(base()),input={campaignId:'a',verifiedAtUtc:'2026-11-06T03:20:00Z',direction:'increase',previousTargetCpaMicros:1_000_000,targetCpaMicros:1_020_000,commissionTargetCents:10_000,currencyCode:'USD'};
  const result=await storage.appendCpaAdjustmentEvent({...db,domain,input});
  assert.equal(result.changed,true);assert.equal(db.writes,1);assert.equal(db.closed,1);
  const observation=domain.observationFor(result.base,'a','2026-11-06');
  assert.equal(observation.eventos[0].tipo,'google_ads_cpa_adjustment');
  assert.equal(observation.eventos[0].direcao,'increase');
  const duplicate=await storage.appendCpaAdjustmentEvent({...db,domain,input});
  assert.equal(duplicate.changed,false);assert.equal(db.writes,1);assert.equal(db.closed,2);
});
test('4-point CPA adjustments persist their step, produce the right indicator and deduplicate independently',async()=>{
  const db=memoryDb(base()),input={campaignId:'a',verifiedAtUtc:'2026-11-06T03:40:00Z',direction:'increase',previousTargetCpaMicros:1_020_000,targetCpaMicros:5_020_000,commissionTargetCents:10_000,currencyCode:'USD',stepPercentagePoints:4};
  const result=await storage.appendCpaAdjustmentEvent({...db,domain,input});
  assert.equal(result.changed,true);
  const observation=domain.observationFor(result.base,'a','2026-11-06');
  assert.equal(observation.eventos[0].passo_pontos_percentuais,4);
  assert.deepEqual(JSON.parse(JSON.stringify(domain.campaignAnalysisIndicators(result.base))),[{campaignId:'a',occurredAtUtc:'2026-11-06T03:40:00.000Z',action:'CPA aumentado em 4%'}]);
  const duplicate=await storage.appendCpaAdjustmentEvent({...db,domain,input});
  assert.equal(duplicate.changed,false);
  assert.throws(()=>domain.appendCpaAdjustmentEvent(base(),{...input,verifiedAtUtc:'2026-11-06T03:41:00Z',stepPercentagePoints:3}),/valores válidos/);
});

function setup({failure=false}={}){
  const dom=createRoot();let savedBase=base();const requests=[];
  const rows=[{date,cells:{A:{value:date},F:{value:1},Q:{value:'Pausada'},O:{value:12}}}];
  const getSnapshot=()=>({sheetName:'Mesmo <nome>',storedCampaignId:'a',rows,displayRows:rows,observations:savedBase.observacoes_diario||[],
    manualSalesByDate:new Map([['2026-10-01',{pendingConversions:1}]]),summary:null,pauseConfirmedAt:date,investment:12,clicks:0,conversions:2});
  const controller=view.mount({root:dom.root,domain:diary,format,getSnapshot,actions:{setTitle(){},async saveObservation(data){
    requests.push(data);if(failure)throw new Error('Não salvou');savedBase=domain.saveObservation(savedBase,data,now);
  }}});
  const click=(day=date)=>dom.get('#productBody').onclick({target:{closest:()=>({dataset:{editObservation:day}})},preventDefault(){},stopPropagation(){}});
  const submit=()=>dom.get('#productObservationForm').onsubmit({preventDefault(){}});
  controller.render('MCC','workbook','a');return {...dom,requests,rows,controller,click,submit,getBase:()=>savedBase};
}
test('one discreet editor per dated row, including virtual rows; repeated rendering adds no writes',()=>{
  const s=setup(),before=JSON.stringify(s.rows);
  for(let n=0;n<3;n++)s.controller.render('MCC','workbook','a');
  const html=s.get('#productBody').innerHTML;
  assert.equal((html.match(/data-edit-observation=/g)||[]).length,2);
  assert.match(html,/hub-edit-host product-observation-cell/);assert.match(html,/hub-corner-edit/);
  assert.equal(s.requests.length,0);assert.equal(JSON.stringify(s.rows),before);
});
test('open/cancel and Escape do not write; Save updates immediately, escapes text and preserves automatic notes',async()=>{
  const s=setup();s.click();
  assert.equal(s.get('#productObservationDialog').open,true);assert.equal(s.get('#productObservationText').value,'Pausada');
  assert.equal(s.get('#productObservationContext').textContent,'Mesmo <nome> · 02/10/2026');
  s.get('#productObservationText').value='descartar';s.get('#productObservationCancel').onclick();
  assert.equal(s.get('#productObservationDialog').open,false);assert.equal(s.requests.length,0);
  s.click();s.get('#productObservationText').value='<script>teste</script>\nNova linha';
  await s.submit();
  assert.equal(s.requests.length,1);assert.equal(s.get('#productObservationDialog').open,false);
  assert.match(s.get('#productBody').innerHTML,/&lt;script&gt;teste&lt;\/script&gt;/);
  assert.match(s.get('#productBody').innerHTML,/Campanha pausada na data/);
  assert.equal(s.getBase().diario[0].celulas.Q.value,'Pausada');
  s.click('2026-10-01');s.get('#productObservationText').value='Anotação virtual';await s.submit();
  assert.match(s.get('#productBody').innerHTML,/Anotação virtual/);assert.match(s.get('#productBody').innerHTML,/aguarda MCC D−1/);
  assert.equal(s.getBase().diario.length,1);
});
test('save error preserves draft and open editor; cancelling afterwards is still possible',async()=>{
  const s=setup({failure:true});s.click();s.get('#productObservationText').value='rascunho';await s.submit();
  assert.equal(s.get('#productObservationDialog').open,true);assert.equal(s.get('#productObservationText').value,'rascunho');
  assert.equal(s.get('#productObservationError').textContent,'Não salvou');assert.equal(s.get('#productObservationSave').disabled,false);
  s.get('#productObservationCancel').onclick();assert.equal(s.get('#productObservationDialog').open,false);
});
test('shared edit stylesheet/build contracts include both consumers without duplicated positioning',async()=>{
  const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
  const css=await read('src/table-edit-actions.css'),overview=await read('src/overview/view.js'),index=await read('src/index.template.html'),build=await read('build.mjs');
  assert.match(css,/\.hub-edit-host\{position:relative\}/);assert.match(css,/top:var\(--hub-corner-edit-top,1px\)/);
  assert.match(css,/right:var\(--hub-corner-edit-right,2px\)/);assert.match(css,/:focus-visible/);
  assert.match(overview,/overview-remaining-edit hub-corner-edit/);assert.match(index,/table-edit-actions.css\?v=3/);
  assert.match(build,/src\/table-edit-actions.css/);assert.match(index,/observation-storage.js\?v=5/);
  const adapter=index.match(/async function saveDiaryObservation\(input\)\{[^\r\n]+/)?.[0];
  assert.match(adapter,/diary-observation-updated/);
  assert.doesNotMatch(adapter,/announceBaseUpdated|syncMccDiaryRowsToBilling|persistLocalBase/);
  assert.match(index,/type==='diary-observation-updated'\)\{restoreLocalBase\(\{persist:false,renderPage:false,includeCatalog:true\}\)/);
});
