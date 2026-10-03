import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import * as BillingStorage from '../src/billing/billing-storage.mjs';
import {normalizeSale,summarizeCompetence,monthlyFinancialSeries} from '../src/billing/billing-domain.mjs';

const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const script=await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8');
const adapter=name=>template.split('\n').find(line=>line.trimStart().startsWith('function '+name+'('));

test('latest lower D0/D−1 drives Overview, accumulated profit and CPA, not stale Diary',()=>{
  const campaign={nome_campanha_exato:'Synthetic campaign',metricas_D_zero:{presente:true},metricas_D_menos_1:{presente:true}},stored={id:'synthetic'};
  const snapshots=[{campaignName:campaign.nome_campanha_exato,date:'2026-10-01',period:'d1',present:true,investment:20,impressions:40,clicks:4,conversions:1,commission:30},{campaignName:campaign.nome_campanha_exato,date:'2026-10-02',period:'d0',present:true,investment:10,impressions:20,clicks:2,conversions:0,commission:0}];
  const history={investment:150,impressions:300,clicks:30,conversions:6,commission:180,observed:{investment:3,impressions:3,clicks:3,conversions:3,commission:3},byDate:Object.fromEntries(['2026-09-30','2026-10-01','2026-10-02'].map(date=>[date,{investment:50,impressions:100,clicks:10,conversions:2,commission:60}]))};
  const cache={latestSnapshots:{dates:snapshots.map(row=>row.date),rows:snapshots},snapshotsByCampaignName:new Map([['synthetic campaign',snapshots]]),dailyByCampaign:new Map([[stored.id,Object.entries(history.byDate).map(([data,row])=>({data,celulas:{O:{value:row.investment},P:{value:row.commission},B:{value:row.impressions},C:{value:row.clicks},F:{value:row.conversions}}}))]]),salesAdjustments:new Map([[stored.id,{byDate:{'2026-10-02':{pendingConversions:1,commissionAdjustment:15}}}]])};
  const context=vm.createContext({window:{},state:{database:{},totalsMode:'consolidated'},derivedContext:()=>cache,manifestDates:()=>({d0:'2026-10-02',d1:'2026-10-01'}),databaseCampaign:()=>stored,valueOf:field=>field?.valor??null,currentCost:()=>{throw Error('must use snapshot')}});
  vm.runInContext(script,context);context.OverviewDomain=context.window.OverviewDomain;
  vm.runInContext(['d0Totals','d1Totals','totalsForMode','cpaPeriodTotals','roiForTotals'].map(adapter).join('\n'),context);
  assert.equal(context.d0Totals(campaign).investment,10);assert.equal(context.d0Totals(campaign).clicks,2);
  assert.equal(context.d1Totals(campaign,history).investment,20);assert.equal(context.d1Totals(campaign,history).clicks,4);
  assert.equal(context.d1Totals({nome_campanha_exato:'Missing',metricas_D_menos_1:{presente:false}},history).investment,null,'D−1 ausente na captura não herda métricas anteriores da mesma data');
  const all=context.totalsForMode(campaign,history);
  assert.equal(all.investment,80);assert.equal(all.commission,90);assert.equal(all.conversions,3);
  assert.equal(context.OverviewDomain.profitForTotals(all),10);
  const period=context.cpaPeriodTotals(campaign,cache,'2026-10-01','2026-10-02','history');
  assert.equal(period.investment,30);assert.equal(period.commission,45);assert.equal(period.conversions,2);assert.equal(period.clicks,6);
  const current=context.cpaPeriodTotals(campaign,cache,null,null,'current');
  assert.equal(current.investment,10);assert.equal(current.commission,15);assert.equal(context.OverviewDomain.profitForTotals(current),5,'provisória continua incluída no lucro D0');
  snapshots[1].investment=null;
  assert.equal(context.d0Totals(campaign).investment,null,'ausência atual não herda custo antigo do Diário');
  assert.equal(context.OverviewDomain.profitForTotals(context.d0Totals(campaign)),null);
  assert.equal(context.roiForTotals({investment:10,commission:null}),null);
  assert.equal(history.investment,150,'cálculos não modificam o histórico');
});

test('first Billing backfill applies latest correction, preserves older sales, payments and manual rows',async()=>{
  const automatic={sale_id:'mcc-conversion:synthetic:2026-10-02',sale_date:'2026-10-02',product:'Synthetic product',platform:'Google Ads MCC',campaign_id:'synthetic',source:'mcc_conversion_aggregate',source_period:'d0',conversion_count:2,value_brl:100,confirmation_status:'provisional',active:true,payment_status:'issued'};
  const older={...automatic,sale_id:'mcc-conversion:synthetic:2026-09-30',sale_date:'2026-09-30',value_brl:40};
  const manual={sale_id:'manual-synthetic',sale_date:'2026-10-02',product:'Synthetic manual',platform:'Manual',source:'manual_entry',value_brl:15,confirmation_status:'manual',payment_status:'paid'};
  const rows=new Map([automatic,older,manual].map(row=>[row.sale_id,normalizeSale(row)])),audit=[],meta=new Map(),writes=[];
  const lower={...automatic,conversion_count:1,value_brl:80,payment_status:'pending'};
  const fakeDatabase={close(){},transaction(_names,mode){
    const tx={objectStore(name){
      if(name==='billing_sales')return{get(id){const request={};queueMicrotask(()=>{request.result=rows.get(id);request.onsuccess?.()});return request},put(row){writes.push(row.sale_id);rows.set(row.sale_id,row)},add(row){writes.push(row.sale_id);rows.set(row.sale_id,row)}};
      if(name==='billing_audit')return{add:row=>audit.push(row)};
      if(name==='billing_meta')return{get(key){const request={};queueMicrotask(()=>{request.result=meta.get(key);request.onsuccess?.()});return request},put:row=>meta.set(row.key,row)};
      throw Error('unexpected access: '+name);
    },abort(){throw Error('unexpected abort')}};
    assert.ok(['readonly','readwrite'].includes(mode));
    setImmediate(()=>tx.oncomplete?.());return tx;
  }};
  const database={atualizado_em:'2026-10-02T12:00:00Z',campanhas:[],vendas_provisorias:[],manifesto_atual:{separacao_temporal:{D_zero:{datas_detectadas:['2026-10-02']}}}};
  const context=vm.createContext({state:{database},openLocalDb:async()=>fakeDatabase,getBillingStorage:async()=>BillingStorage,CampaignDatabase:{
    mccBillingSalesFromDiary:(_db,options)=>options?.manifestOnly?[automatic]:[automatic,{...older,value_brl:999}],
    mccBillingSalesFromManifest:()=>[lower],
  }});
  const start=template.indexOf('    async function syncMccDiaryRowsToBilling('),end=template.indexOf('    async function persistProductCatalog(',start);
  vm.runInContext("let billingDiarySyncPromise=null,billingDiarySyncVersion='';const MCC_DIARY_BACKFILL_KEY='test-mcc',MCC_MANUAL_SALE_BACKFILL_KEY='test-manual';\n"+template.slice(start,end),context);
  const manualBefore=JSON.stringify(rows.get(manual.sale_id));
  await context.syncMccDiaryRowsToBilling();
  assert.equal(rows.get(automatic.sale_id).value_brl,80,'first backfill cannot keep the previous higher value');
  assert.equal(rows.get(automatic.sale_id).payment_status,'issued');
  assert.equal(rows.get(older.sale_id).value_brl,40,'older existing data is not overwritten by historical recovery');
  assert.equal(JSON.stringify(rows.get(manual.sale_id)),manualBefore);
  const sales=[...rows.values()];
  assert.equal(summarizeCompetence(sales,[]).grossBrl.amount,135);
  const chart=monthlyFinancialSeries({sales,start:'2026-09-01',end:'2026-10-31'});
  assert.equal(chart[0].value,40);assert.equal(chart[1].value,95);
  const auditCount=audit.length,writeCount=writes.length;
  await context.syncMccDiaryRowsToBilling({force:true});
  assert.equal(audit.length,auditCount);assert.equal(writes.length,writeCount,'repeated correction remains idempotent');
});
