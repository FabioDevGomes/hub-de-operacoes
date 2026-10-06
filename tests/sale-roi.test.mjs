import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const context=vm.createContext({window:{},structuredClone});
for(const file of ['database.js','overview-domain.js','overview/sale-roi-domain.js'])vm.runInContext(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),context);
const database=context.window.CampaignDatabase,overview=context.window.OverviewDomain,domain=context.window.SaleRoiDomain;
const metric=valor=>({valor,estado:valor==null?'ausente':'observado'});
function setCapture(base,{cost=50,commission=0,conversions=0,currency='BRL',date='2026-10-05'}={}){
  base.manifesto_atual={separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:[{nome_campanha_exato:'Oferta 01',metricas_D_zero:{presente:true,data:metric(date),moeda:metric(currency),custo_total:metric(cost),conversoes:metric(conversions),valor_conversao:metric(commission)}}]};
}
function fixture(){const base=database.create();base.campanhas=[{id:'campaign-a',nome_mcc:'Oferta 01',nome_exibicao:'Oferta 01'}];
  base.diario=[{campanha_id:'campaign-a',data:'2026-10-04',celulas:{O:{value:100},P:{value:0},F:{value:0}}},{campanha_id:'campaign-a',data:'2026-10-05',celulas:{O:{value:999},P:{value:999},F:{value:8}}}];setCapture(base);return base;}
function register(base,key,amount=200,extra={}){
  const result=database.addProvisionalSale(base,{campanha_id:'campaign-a',data:'2026-10-05',hora:'10:00',valor_brl:amount,pais_codigo:'ZZ',produto:'Oferta',plataforma:'Teste',chave_duplicidade:key,...extra});
  if(!result.duplicate)result.sale.roi_no_registro=domain.capture(result.base,result.sale,{database,overview,exchangeRate:5});
  return result;
}
test('manual registration captures cumulative ROI with latest MCC replacing stale Diary; later captures and duplicates cannot change it',()=>{
  const input=fixture(),before=JSON.stringify(input),first=register(input,'first');
  const photo=first.sale.roi_no_registro;
  assert.equal(photo.investment_brl,150);assert.equal(photo.revenue_brl,200);assert.ok(Math.abs(photo.roi_percent-100/3)<1e-9);
  assert.equal(photo.registered_at,first.sale.registrada_em);assert.equal(photo.metrics_date,'2026-10-05');
  assert.equal(JSON.stringify(input),before,'read-only capture and addition preserve caller data');
  setCapture(first.base,{cost:80,commission:200,conversions:1});
  const second=register(first.base,'second',100,{hora:'11:00'});
  assert.equal(second.sale.roi_no_registro.investment_brl,180);assert.equal(second.sale.roi_no_registro.revenue_brl,300);
  const all=domain.campaignSales(second.base,'campaign-a');assert.equal(all[0].snapshot.roi_percent,photo.roi_percent);assert.ok(Math.abs(all[1].snapshot.roi_percent-200/3)<1e-9);
  setCapture(second.base,{cost:200,commission:300,conversions:2});
  const repeated=register(second.base,'first');assert.equal(repeated.duplicate,true);assert.equal(JSON.stringify(repeated.sale.roi_no_registro),JSON.stringify(photo));assert.equal(repeated.base.vendas_provisorias.length,2);
  const restored=database.normalize(JSON.parse(JSON.stringify(second.base)));assert.equal(JSON.stringify(restored.vendas_provisorias[0].roi_no_registro),JSON.stringify(photo),'snapshot survives backup/restore');
});
test('sale already in D0 is counted once; third and subsequent sales are also photographed',()=>{
  let base=fixture();setCapture(base,{cost:50,commission:200,conversions:1});let result=register(base,'one');
  assert.equal(result.sale.roi_no_registro.revenue_brl,200);
  setCapture(result.base,{cost:60,commission:300,conversions:2});result=register(result.base,'two',100,{hora:'11:00'});
  assert.equal(result.sale.roi_no_registro.revenue_brl,300);
  setCapture(result.base,{cost:100,commission:400,conversions:3});result=register(result.base,'three',100,{hora:'12:00'});
  assert.equal(result.sale.roi_no_registro.revenue_brl,400);assert.equal(domain.campaignSales(result.base,'campaign-a').length,3);
  assert.equal(domain.campaignSales(result.base,'campaign-a')[2].snapshot.roi_percent,100);
});
test('mixed reconciled/provisional sales use official coverage once; edits retain original photograph and campaign identity',()=>{
  const first=register(fixture(),'one'),base=first.base;base.vendas_provisorias[0].status='conciliada';setCapture(base,{cost:80,conversions:1,commission:200});
  const second=register(base,'two',100,{hora:'11:00'});assert.equal(second.sale.roi_no_registro.revenue_brl,300);
  const original=JSON.stringify(second.sale.roi_no_registro);
  const changed=database.updateProvisionalSale(second.base,{...second.sale,id:second.sale.id,valor_brl:120});
  assert.equal(JSON.stringify(changed.sale.roi_no_registro),original,'financial edit does not fabricate a new historical ROI');
  changed.base.campanhas.push({id:'campaign-b',nome_mcc:'Outra',nome_exibicao:'Outra'});
  const reassigned=database.updateProvisionalSale(changed.base,{...changed.sale,campanha_id:'campaign-b'});
  assert.equal(domain.campaignSales(reassigned.base,'campaign-b')[0].snapshot,null,'original campaign ROI must not be presented as ROI of another campaign');
});
test('missing or zero investment means unavailable ROI, not zero; operational USD rate is frozen',()=>{
  const base=fixture();base.diario=[];setCapture(base,{cost:0});const zero=register(base,'zero');
  assert.equal(zero.sale.roi_no_registro.investment_brl,0);assert.equal(zero.sale.roi_no_registro.roi_percent,null);assert.match(zero.sale.roi_no_registro.unavailable_reason,/zero/);
  setCapture(base,{cost:null});const missing=register(base,'missing');assert.equal(missing.sale.roi_no_registro.investment_brl,null);assert.equal(missing.sale.roi_no_registro.roi_percent,null);
  setCapture(base,{cost:10,currency:'USD',conversions:1,commission:40});const usd=register(base,'usd');
  assert.equal(usd.sale.roi_no_registro.exchange_rate,5);assert.equal(usd.sale.roi_no_registro.investment_brl,50);assert.equal(usd.sale.roi_no_registro.revenue_brl,200);assert.equal(usd.sale.roi_no_registro.roi_percent,300);
});
test('legacy sales reserve their chronological slots, cancelled/other campaign sales excluded; no retroactive ROI invented',()=>{
  const base=fixture();base.vendas_provisorias=[{id:'legacy',campanha_id:'campaign-a',data:'2026-10-04',status:'conciliada'},{id:'cancelled',campanha_id:'campaign-a',data:'2026-10-01',status:'cancelada'},{id:'other',campanha_id:'other',data:'2026-10-01'}];
  const result=register(base,'new'),before=JSON.stringify(result.base),sales=domain.campaignSales(result.base,'campaign-a');
  assert.equal(sales.length,2);assert.equal(sales[0].snapshot,null);assert.equal(sales[1].sequence,2);assert.ok(sales[1].snapshot);assert.equal(JSON.stringify(result.base),before);
});
test('manual adapter persists sale and ROI photograph together; failed persistence rolls back and repeats do not recapture',async()=>{
  const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8'),start=template.indexOf('    async function saveProvisionalSale(){'),end=template.indexOf('    let timeModulePromise=',start),source=template.slice(start,end);
  const ctx=vm.createContext({window:{},structuredClone});
  for(const file of ['database.js','overview-domain.js','overview/sale-roi-domain.js'])vm.runInContext(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),ctx);
  const nodes=new Map([['#saleCampaign',{value:'campaign-a'}],['#saleIdentifier',{value:'synthetic-id'}],['#saleSaveMessage',{}]]),initial=fixture();let fail=false,writes=0,closes=0;
  Object.assign(ctx,{CampaignDatabase:ctx.window.CampaignDatabase,OverviewDomain:ctx.window.OverviewDomain,SaleRoiDomain:ctx.window.SaleRoiDomain,saleSource:'flowtracking',
    state:{database:initial,rate:5,saleCountry:'ZZ',saleDraft:{date:'2026-10-05',hour:'10:00',amount:200,product:'Oferta',platform:'Teste'}},
    $:key=>nodes.get(key),sha256:async()=> 'unique',closeSaleModal:()=>closes++,showTotals:()=>{},renderStatus:()=>{},toast:()=>{},
    persistLocalBase:async({provisionalBillingSales})=>{writes++;assert.equal(provisionalBillingSales[0],ctx.state.database.vendas_provisorias.at(-1));assert.equal(provisionalBillingSales[0].roi_no_registro.investment_brl,150);if(fail)throw Error('synthetic persistence failure')}});
  vm.runInContext(source,ctx);fail=true;await ctx.saveProvisionalSale();assert.equal(ctx.state.database,initial);assert.equal(closes,0);assert.match(nodes.get('#saleSaveMessage').textContent,/persistence failure/);
  fail=false;await ctx.saveProvisionalSale();assert.equal(closes,1);assert.equal(writes,2);const photo=JSON.stringify(ctx.state.database.vendas_provisorias[0].roi_no_registro);
  await ctx.saveProvisionalSale();assert.equal(writes,2);assert.equal(JSON.stringify(ctx.state.database.vendas_provisorias[0].roi_no_registro),photo);assert.match(nodes.get('#saleSaveMessage').textContent,/não foi duplicada/);
});
test('campaign-scoped MCC snapshots preserve another MCC dates and convert both investment and revenue once',()=>{
  const base=fixture(),a=base.manifesto_atual.campanhas[0];a.datas_coleta=['2026-10-05'];
  base.manifesto_atual.separacao_temporal.D_zero.datas_detectadas=['2026-10-06'];
  base.manifesto_atual.campanhas.push({nome_campanha_exato:'Outra MCC',datas_coleta:['2026-10-06'],metricas_D_zero:{presente:true,data:metric('2026-10-06'),moeda:metric('BRL'),custo_total:metric(5000),conversoes:metric(2),valor_conversao:metric(9000)}});
  const sale=register(base,'scoped').sale;assert.equal(sale.roi_no_registro.investment_brl,150);assert.equal(sale.roi_no_registro.revenue_brl,200);assert.equal(sale.roi_no_registro.metrics_date,'2026-10-05');
});
test('real D−1 domain reconciliation changes confirmation only and preserves the saved ROI photograph',()=>{
  const result=register(fixture(),'confirm'),original=JSON.stringify(result.sale.roi_no_registro),manifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-10-05']},D_zero:{datas_detectadas:['2026-10-06']}},campanhas:[{nome_campanha_exato:'Oferta 01',metricas_D_menos_1:{presente:true,data:metric('2026-10-05'),moeda:metric('BRL'),custo_total:metric(80),conversoes:metric(1),valor_conversao:metric(200)},metricas_D_zero:{presente:true,data:metric('2026-10-06'),moeda:metric('BRL'),custo_total:metric(20),conversoes:metric(0),valor_conversao:metric(0)}}]};
  for(const row of result.base.diario){row.fontes=['manifesto'];row.periodos=[]}
  const imported=database.importManifest(result.base,manifest,()=>[{date:'2026-10-05',period:'d1',cells:{F:{value:1},O:{value:80},P:{value:200}}},{date:'2026-10-06',period:'d0',cells:{F:{value:0},O:{value:20},P:{value:0}}}],{overwrite:true,trackEvents:false});
  assert.equal(imported.base.vendas_provisorias[0].status,'conciliada');assert.equal(JSON.stringify(imported.base.vendas_provisorias[0].roi_no_registro),original);assert.equal(domain.campaignSales(imported.base,'campaign-a')[0].snapshot.roi_percent,result.sale.roi_no_registro.roi_percent);
});
