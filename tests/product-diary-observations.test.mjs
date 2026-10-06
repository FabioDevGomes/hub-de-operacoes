import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const context=vm.createContext({window:{},structuredClone,queueMicrotask});
for(const file of ['database.js','product-diary/domain.js','product-diary/observation-domain.js','product-diary/observation-storage.js','product-diary/view.js']){
  vm.runInContext(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),context);
}
const {ProductDiaryObservations:domain,ProductDiaryObservationStorage:storage,ProductDiaryView:view,ProductDiaryDomain:diary,CampaignDatabase:database}=context.window;
const date='2026-10-02',now='2026-10-06T12:00:00.000Z';
const base=()=>({schema:database.SCHEMA,campanhas:[{id:'a',nome_exibicao:'Mesmo nome',status:'pausada'},{id:'b',nome_exibicao:'Mesmo nome',status:'ativa'}],
  diario:[{campanha_id:'a',data:date,celulas:{A:{value:date},Q:{value:'Pausada'},O:{value:12},P:{value:30},F:{value:1}}}],
  manifesto_atual:{campanhas:[]},vendas_provisorias:[],event_log:[],atualizado_em:'antes',other:{preserved:true}});
const input=(text='Texto revisado',campaignId='a',expectedRevision=0)=>({campaignId,date,text,expectedRevision});
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
  const imported=database.importManifest(otherCampaign,{schema:'manifesto_mcc_v1',campanhas:[],separacao_temporal:{}},()=>[],{trackEvents:false}).base;
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
  assert.match(build,/src\/table-edit-actions.css/);assert.match(index,/observation-storage.js\?v=1/);
  const adapter=index.match(/async function saveDiaryObservation\(input\)\{[^\r\n]+/)?.[0];
  assert.match(adapter,/diary-observation-updated/);
  assert.doesNotMatch(adapter,/announceBaseUpdated|syncMccDiaryRowsToBilling|persistLocalBase/);
  assert.match(index,/type==='diary-observation-updated'\)\{restoreLocalBase\(\{persist:false,renderPage:false\}\)/);
});
