import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const context=vm.createContext({window:{},structuredClone});
for(const file of ['database.js','overview-domain.js','overview/cards-domain.js','overview/cards-recovery.js','overview/view.js'])vm.runInContext(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),context);
const {CampaignDatabase:database,OverviewDomain:domain,OverviewCardsDomain:cards,OverviewCardsRecovery:recovery,OverviewView:view}=context.window;
const json=value=>JSON.parse(JSON.stringify(value)),timestamp='2026-10-08T15:30:00Z',field=valor=>({valor,estado:'confirmado'});
function legacy(cost=21){
  const manifest={schema:'manifesto_mcc_v1',gerado_em_utc:timestamp,identificacao_mcc:{id:'111-111-1111',nome:'MCC E-com'},separacao_temporal:{D_zero:{datas_detectadas:['2026-10-08']},D_menos_1:{datas_detectadas:['2026-10-07']}},campanhas:[{nome_campanha_exato:'Synthetic recovery',mcc_id:'111-111-1111',metricas_D_zero:{presente:true,data:field('2026-10-08'),moeda:field('BRL'),custo_total:field(cost),impressoes:field(40),cliques_google:field(2),conversoes:field(0),valor_conversao:field(0),estado_campanha:field('Ativada')},metricas_D_menos_1:{presente:true,data:field('2026-10-07'),moeda:field('BRL'),custo_total:field(41),impressoes:field(80),cliques_google:field(4),conversoes:field(0),valor_conversao:field(0)}}]};
  const base=database.importManifest(database.create(),manifest,()=>[],{overwrite:true}).base;
  base.atualizado_em=timestamp;base.privateMarker={preserve:true};return base;
}
function storage(initial,{abort=false,throwOnPut=false,throwTransaction=false}={}){
  let stored=json(initial);const calls={opens:0,closes:0,writes:0,transactions:[]};
  return{calls,read:()=>stored,openDatabase:async()=>{
    calls.opens++;
    return{close(){calls.closes++},transaction(names,mode){
      calls.transactions.push({names,mode});if(throwTransaction)throw new Error('transaction failed');
      let pending,aborted=false;const request={},tx={error:null,abort(){aborted=true;queueMicrotask(()=>tx.onabort())},objectStore(){return{get(key){assert.equal(key,'atual');queueMicrotask(()=>{request.result=json(stored);request.onsuccess();if(aborted)return;if(abort){tx.error=new Error('write aborted');tx.onabort()}else{if(pending)stored=pending;tx.oncomplete()}});return request},put(base,key){assert.equal(key,'atual');calls.writes++;if(throwOnPut)throw new Error('put failed');pending=json(base)}}}};
      return tx;
    }};
  }};
}
function render(base){
  const dom=createRoot(),controller=view.mount({root:dom.root,state:{totalsMode:'consolidated'},getSnapshot:()=>({rows:[],dates:{},d1Totals:[]}),getCardSnapshot:()=>cards.read(base),getCardRevision:()=>cards.read(base).revision,domain:{...domain,sumObservedMetric(){throw new Error('view must not calculate')},sumObservedProfit(){throw new Error('view must not calculate')}},format,actions:{}});
  controller.render();return dom.get('#kpis').innerHTML;
}
test('reproduces empty legacy cards, then repairs once, preserving all data and F5 without another calculation',async()=>{
  const original=legacy(),before=JSON.stringify(original),db=storage(original);let calculations=0;
  const producer={...cards,create(...args){calculations++;return cards.create(...args)}};
  assert.doesNotMatch(render(original),/BRL 21\.00/);
  const result=await recovery.ensure({base:original,openDatabase:db.openDatabase,cards:producer});
  assert.equal(result.recovered,true);assert.equal(calculations,1);
  assert.match(render(result.base),/BRL 21\.00/);assert.match(render(result.base),/BRL -41\.00/);
  assert.equal(JSON.stringify(original),before,'input never mutated');
  const saved=db.read(),withoutSummary={...saved};delete withoutSummary.overview_cards;
  assert.deepEqual(withoutSummary,json(original),'only the additive summary changed');
  assert.equal(saved.atualizado_em,timestamp);assert.equal(saved.overview_cards.computedAt,timestamp);
  assert.equal(saved.overview_cards.recovery.reason,'missing_or_invalid_summary');
  assert.deepEqual(db.calls.transactions,[{names:'bases',mode:'readwrite'}]);assert.equal(db.calls.closes,1);
  for(let reload=0;reload<3;reload++){
    const next=await recovery.ensure({base:json(db.read()),openDatabase:db.openDatabase,cards:producer});
    assert.equal(next.recovered,false);assert.equal(render(next.base),render(result.base));
  }
  assert.equal(calculations,1);assert.equal(db.calls.opens,1);assert.equal(db.calls.writes,1);
});
test('recovery rechecks latest base atomically and never overwrites an MCC commit or unrelated concurrent data',async()=>{
  const stale=legacy(),latest=legacy(30);latest.concurrentField='keep';latest.overview_cards=cards.create(latest,{computedAt:timestamp});
  const db=storage(latest),result=await recovery.ensure({base:stale,openDatabase:db.openDatabase,cards:{...cards,create(){throw new Error('must not recompute newer MCC')}}});
  assert.equal(result.recovered,false);assert.equal(result.base.concurrentField,'keep');assert.equal(result.base.overview_cards.summary.d0.investment.value,30);assert.equal(db.calls.writes,0);
  const uncomputed=legacy(32);uncomputed.concurrentField='also keep';const fresh=storage(uncomputed);
  const repaired=await recovery.ensure({base:stale,openDatabase:fresh.openDatabase});
  assert.equal(repaired.base.concurrentField,'also keep');assert.equal(repaired.base.overview_cards.summary.d0.investment.value,32);
});
test('transaction abort, synchronous put or creation failure keeps original data and closes the connection',async()=>{
  for(const options of [{abort:true},{throwOnPut:true},{throwTransaction:true}]){
    const base=legacy(),db=storage(base,options);
    await assert.rejects(recovery.ensure({base,openDatabase:db.openDatabase}),/aborted|failed/);
    assert.deepEqual(db.read(),json(base));assert.equal(db.calls.closes,1);
  }
});
test('empty/non-MCC/unknown-time/future-version bases do not trigger repair; invalid current summary does; observed zero remains zero',async()=>{
  for(const base of [null,database.create(),{schema:'old'}, {...legacy(),atualizado_em:null,manifesto_atual:{campanhas:[{}]}}, {...legacy(),overview_cards:{version:2}}]){
    const result=await recovery.ensure({base,openDatabase:()=>{throw new Error('must not open')}});assert.equal(result.recovered,false);
  }
  const base=legacy(0);base.overview_cards={version:1,revision:'broken'};
  const db=storage(base),result=await recovery.ensure({base,openDatabase:db.openDatabase});
  assert.equal(result.recovered,true);assert.equal(result.base.overview_cards.summary.d0.investment.value,0);
  assert.match(render(result.base),/BRL 0\.00/);
});
test('repair is published and awaited before normalization/display; failure does not discard the loaded table',async()=>{
  const source=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  assert.match(source,/overview\/cards-recovery\.js\?v=1/);
  const start=source.indexOf('    async function restoreLocalBase('),end=source.indexOf('    function validateProductCatalogBackup(',start),adapter=source.slice(start,end);
  assert.ok(adapter.indexOf('await OverviewCardsRecovery.ensure')<adapter.indexOf('CampaignDatabase.mergeEventLogs'));
  const db=storage(legacy()),state={productCatalog:{ocultos:[],aliases:{}},legacyTotalsMigrationReport:null};
  const sandbox=vm.createContext({CampaignBaseReader:{read:async()=>({base:json(db.read()),events:[]})},OverviewCardsRecovery:recovery,openLocalDb:db.openDatabase,CampaignDatabase:database,state,embeddedManifest:null,renderLegacyMigrationNotice(){},render(){},toast(){throw new Error('unexpected repair failure')}});
  vm.runInContext('let derivedCache;'+adapter,sandbox);await sandbox.restoreLocalBase({persist:false,renderPage:false});
  assert.equal(state.database.overview_cards.summary.d0.investment.value,21);assert.match(render(state.database),/BRL 21\.00/);
  let warned=false;sandbox.OverviewCardsRecovery={ensure:async()=>{throw new Error('synthetic failure')}};sandbox.toast=()=>{warned=true};
  await sandbox.restoreLocalBase({persist:false,renderPage:false});assert.equal(warned,true);assert.equal(state.database.campanhas.length,1);
});
