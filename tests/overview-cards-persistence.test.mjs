import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const context=vm.createContext({window:{},structuredClone});
for(const file of ['database.js','overview-domain.js','overview/cards-domain.js','overview/view.js'])vm.runInContext(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),context);
const database=context.window.CampaignDatabase,domain=context.window.OverviewDomain,cards=context.window.OverviewCardsDomain,view=context.window.OverviewView;
const app=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const json=value=>JSON.parse(JSON.stringify(value)),timestamp='2026-10-08T15:30:00Z',field=valor=>({valor,estado:valor==null?'ausente':'confirmado'});
function capture(index,period,cost,{conversions=0,commission=0}={}){
  const date=period==='d0'?'2026-10-08':'2026-10-07',key=period==='d0'?'metricas_D_zero':'metricas_D_menos_1';
  return {identificacao_mcc:{id:index?'222-222-2222':'111-111-1111',nome:index?'MCC Nutra':'MCC E-com'},gerado_em_utc:timestamp,separacao_temporal:{D_zero:{estado:period==='d0'?'fornecido':'nao_fornecido',datas_detectadas:period==='d0'?[date]:[]},D_menos_1:{estado:period==='d1'?'fornecido':'nao_fornecido',datas_detectadas:period==='d1'?[date]:[]}},[period==='d0'?'captura_D_zero':'captura_D_menos_1']:{escopo:'all_campaigns',capturada_em:timestamp},campanhas:[{nome_campanha_exato:'Synthetic '+index,mcc_id:index?'222-222-2222':'111-111-1111',[key]:{presente:true,data:field(date),moeda:field('BRL'),custo_total:field(cost),impressoes:field(cost==null?null:2*cost),cliques_google:field(cost==null?null:1),conversoes:field(conversions),valor_conversao:field(commission),estado_campanha:field('Ativada')}}]};
}
const rowFactory=c=>['d0','d1'].flatMap(period=>{const m=c[period==='d0'?'metricas_D_zero':'metricas_D_menos_1'];return m?.presente?[{date:m.data.valor,period,cells:{B:{value:m.impressoes.valor},C:{value:m.cliques_google.valor},F:{value:m.conversoes.valor},O:{value:m.custo_total.valor},P:{value:m.valor_conversao.valor}}}]:[]});
function apply(base,manifest,computedAt=timestamp){const next=database.importManifest(base,manifest,rowFactory,{overwrite:true}).base;next.overview_cards=cards.create(next,{computedAt});return next}
function fixture(){let base=database.create();for(const index of [0,1])base=apply(base,capture(index,'d0',10+index));for(const index of [1,0])base=apply(base,capture(index,'d1',20+index));return base}
const card=(markup,name)=>markup.match(new RegExp('<section class="[^"]*'+name+'[^"]*"[^>]*>[\\s\\S]*?<\\/section>'))?.[0]||'';
function mount(base){
  const dom=createRoot(),state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active'};
  const forbidden=()=>{throw new Error('Card aggregation must not run on page load or navigation')};
  const controller=view.mount({root:dom.root,state,getSnapshot:()=>({rows:[],dates:{},d1Totals:[],referenceDate:'2026-10-08'}),getCardSnapshot:()=>cards.read(base),getCardRevision:()=>cards.read(base).revision,domain:{...domain,sumObservedMetric:forbidden,sumObservedProfit:forbidden},format,actions:{}});
  controller.render();return {...dom,state,controller};
}

test('saved summaries preserve D0 after alternating D−1 MCCs, coverage and reload without any card sums',()=>{
  const base=fixture(),saved=json(cards.read(base));
  assert.equal(saved.summary.d0.investment.value,21);
  assert.equal(saved.summary.d0.profit.value,-21);
  assert.equal(saved.summary.d1.investment.value,41);
  assert.equal(saved.summary.d1.profit.value,-41);
  assert.equal(saved.manifestMccCoverage.d0.complete,true);
  assert.equal(saved.manifestMccCoverage.d1.complete,true);
  const before=JSON.stringify(base),ui=mount(base);
  assert.match(card(ui.get('#kpis').innerHTML,'kpi-group-d0'),/BRL 21\.00/);
  assert.match(card(ui.get('#kpis').innerHTML,'kpi-d1-profit'),/BRL -41\.00/);
  const markup=ui.get('#kpis').innerHTML;
  for(const period of ['#totalsD1','#totalsD0','#totalsConsolidated'])ui.get(period).onclick();
  ui.get('#search').value='nothing';ui.get('#search').oninput();ui.controller.render();
  assert.equal(ui.get('#kpis').innerHTML,markup);
  assert.equal(mount(json(database.normalize(base))).get('#kpis').innerHTML,markup,'F5/round-trip shows the saved results unchanged');
  assert.equal(JSON.stringify(base),before,'display never writes or normalizes the source in place');
});

test('ignoring a campaign removes it from the persisted overview cards while preserving the source history',()=>{
  const base=fixture(),ignoredCampaign=base.campanhas.find(item=>item.nome_mcc==='Synthetic 0'),before=JSON.stringify(base),ignored=database.setCampaignIgnored(base,ignoredCampaign.id,true,timestamp),saved=cards.create(ignored,{computedAt:timestamp});
  assert.equal(saved.summary.d0.investment.value,11);
  assert.equal(saved.summary.d1.investment.value,21);
  assert.equal(saved.activeCount,1);
  assert.equal(saved.summary.d0.investment.observedCount,1);
  assert.equal(JSON.stringify(base),before,'the underlying MCC records and existing card snapshot are unchanged');
  assert.equal(ignored.diario.length,4,'the persisted base retains all imported daily records');
  assert.equal(ignored.campanhas.find(item=>item.id===ignoredCampaign.id).ignorada,true);
});

test('cancelling a linked manual sale refreshes the persisted provisional count without changing MCC conversions',()=>{
  const base=fixture(),campaign=base.campanhas[0],date='2026-10-08';
  const manual=database.addProvisionalSale(base,{campanha_id:campaign.id,data:date,produto:'Synthetic product',plataforma:'Demo',valor_brl:25,pais_codigo:'US',chave_duplicidade:'synthetic-cancel-key'});
  const before=cards.create(manual.base,{computedAt:'2026-10-08T15:00:00Z'});
  assert.equal(before.pendingSaleCount,1,'resumo mostra o lançamento manual pendente antes do cancelamento');
  const cancelled=database.cancelProvisionalSale(manual.base,{id:manual.sale.id,reason:'Venda duplicada',now:'2026-10-08T16:00:00Z'});
  const after=cards.create(cancelled.base,{computedAt:'2026-10-08T16:00:00Z'});
  assert.equal(after.pendingSaleCount,0,'novo resumo persistido deixa de contar a venda provisória cancelada');
  assert.equal(cancelled.base.diario.length,manual.base.diario.length,'cancelar o lançamento não altera o Diário MCC');
  assert.equal(JSON.stringify(cancelled.base.manifesto_atual),JSON.stringify(manual.base.manifesto_atual),'cancelar o lançamento preserva a captura oficial da MCC');
});

test('the billing cancellation adapter saves its linked source, billing row, audit and cards atomically',()=>{
  assert.match(app,/async function cancelBillingSale\([\s\S]*?sourceSale[\s\S]*?CampaignDatabase\.cancelProvisionalSale[\s\S]*?refreshOverviewCardsForSaleChange\(result\.base\)[\s\S]*?persistLocalBase\(\{billingSaleCancellation:\{saleId,reason:why,now\}\}\)/,
    'cancelar uma venda espelhada deve marcar a origem, recalcular cartões e passar o cancelamento à transação da base');
  assert.match(app,/billingSaleCancellation\)billingCancellation=billing\.cancelSaleToTransaction\(tx,billingSaleCancellation\.saleId,billingSaleCancellation\.reason,\{now:billingSaleCancellation\.now\}\)/,
    'a linha do Faturamento e a auditoria compartilham a transação IndexedDB que grava a base');
  assert.match(app,/announceBaseUpdated\(\{provisionalSaleIds:\[sourceSale\.id\]\}\)/,
    'outras abas recebem o ID da origem cancelada para sincronização sem reativá-la');
  assert.match(app,/async function reconcileCancelledManualSalesToBase\([\s\S]*?item\?\.source==='hub_manual_capture'[\s\S]*?item\.active===false&&item\.cancelled_at[\s\S]*?CampaignDatabase\.cancelProvisionalSale[\s\S]*?refreshOverviewCardsForSaleChange\(next\)[\s\S]*?persistLocalBase\(\)/,
    'a carga da base recupera cancelamentos antigos e persiste novamente o resumo derivado');
  assert.match(app,/reconcileCancelledManualSalesToBase\(\)\.then\(changed=>\{if\(changed\)render\(\)\}\)/,
    'a recuperação roda na inicialização sem recalcular cartões quando não há cancelamento pendente');
});

test('manual changes retain the saved summary; next MCC recomputes even without an overview mounted',()=>{
  const base=fixture(),saved=JSON.stringify(base.overview_cards);
  const changed=database.normalize(base);changed.diario[0].celulas.O.value=999;changed.atualizado_em='2026-10-08T16:00:00Z';
  assert.equal(JSON.stringify(cards.read(changed)),saved);
  const next=apply(changed,capture(0,'d0',30),'2026-10-08T16:30:00Z');
  assert.equal(next.overview_cards.summary.d0.investment.value,41);
  assert.notEqual(next.overview_cards.revision,base.overview_cards.revision);
  assert.match(card(mount(next).get('#kpis').innerHTML,'kpi-group-d0'),/BRL 41\.00/);
});

test('a D0-matched manual sale confirms and updates profit cards without double-counting MCC commission',()=>{
  const base=apply(database.create(),capture(0,'d0',10,{conversions:1,commission:75})),campaign=base.campanhas.find(item=>item.nome_mcc==='Synthetic 0');
  const added=database.addProvisionalSale(base,{campanha_id:campaign.id,data:'2026-10-08',hora:'12:00',produto:'Synthetic sale',plataforma:'Test',valor_brl:200,pais_codigo:'US',chave_duplicidade:'synthetic-d0-sale'});
  assert.equal(added.sale.status,'conciliada','an integer D0 conversion confirms a linked manual sale');
  assert.equal(added.sale.conciliacao_origem,'mcc_d0');
  const adjustment=database.salesAdjustmentMap(added.base).get(campaign.id);assert.equal(adjustment.pendingConversions,0,'the observed D0 conversion is not added a second time');assert.equal(adjustment.pendingConfirmationCount,0);assert.equal(adjustment.commissionAdjustment,125,'the manual value replaces the exact matched D0 aggregate without duplication');
  added.base.overview_cards=cards.create(added.base,{computedAt:'2026-10-08T16:00:00Z'});
  assert.equal(added.base.overview_cards.pendingSaleCount,0);
  assert.equal(added.base.overview_cards.summary.d0.profit.value,190);
  const ui=mount(added.base),pending=card(ui.get('#kpis').innerHTML,'overview-kpi-base'),profit=card(ui.get('#kpis').innerHTML,'kpi-d0-profit');
  assert.match(pending,/<strong class="kpi-value">0<\/strong>/);
  assert.match(profit,/BRL 190\.00/);
});

test('a provisional manual sale dated D−1 updates the D−1 profit card',()=>{
  const base=apply(database.create(),capture(0,'d1',20)),campaign=base.campanhas.find(item=>item.nome_mcc==='Synthetic 0');
  const added=database.addProvisionalSale(base,{campanha_id:campaign.id,data:'2026-10-07',hora:'12:00',produto:'Synthetic prior-day sale',plataforma:'Test',valor_brl:200,pais_codigo:'US',chave_duplicidade:'synthetic-d1-sale'});
  assert.equal(added.sale.status,'provisoria');
  added.base.overview_cards=cards.create(added.base,{computedAt:'2026-10-08T16:00:00Z'});
  assert.equal(added.base.overview_cards.pendingSaleCount,1);
  assert.equal(added.base.overview_cards.summary.d1.profit.value,180);
  assert.match(card(mount(added.base).get('#kpis').innerHTML,'kpi-d1-profit'),/BRL 180\.00/);
});

test('legacy/invalid cache never triggers a fallback computation; zero is observed and absence is not zero',()=>{
  const legacy=database.create(),before=JSON.stringify(legacy);mount(legacy);assert.equal(JSON.stringify(legacy),before);
  assert.match(mount(legacy).get('#kpis').title,/próxima carga MCC/);
  const zero=apply(legacy,capture(0,'d0',0));assert.equal(zero.overview_cards.summary.d0.investment.value,0);
  assert.match(card(mount(zero).get('#kpis').innerHTML,'kpi-group-d0'),/BRL 0\.00/);
  const missing=apply(legacy,capture(0,'d0',null));assert.equal(missing.overview_cards.summary.d0.investment.value,null);
  assert.doesNotMatch(card(mount(missing).get('#kpis').innerHTML,'kpi-group-d0'),/BRL/);
  for(const mutation of [saved=>saved.version=99,saved=>saved.summary.d0.investment.value='untrusted',saved=>saved.summary.d1.profit.totalCount=-1]){
    const invalid=json(zero);mutation(invalid.overview_cards);assert.equal(cards.read(invalid).revision,'unavailable');mount(invalid);
  }
});

test('table-only adapter skips card projections and the MCC apply saves summary before its success notification',async()=>{
  const source=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  const line=source.split('\n').find(line=>line.startsWith('function overviewSnapshot('));
  const forbidden=()=>{throw new Error('card-only projection called')};
  const sandbox=vm.createContext({OverviewDomain:{manifestCaptureInfo:forbidden},state:{database:{}},campaignRows:()=>[],derivedContext:()=>({salesAdjustments:new Map()}),manifestDates:()=>({}),activeCampaignRows:forbidden,currentCampaignRows:()=>[],localBaseUpdateLabel:()=>'',overviewRowsForMode:()=>[]});
  vm.runInContext(line,sandbox);assert.equal(sandbox.overviewSnapshot({includeCards:false}).pendingSaleCount,null);
  const html=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8'),start=html.indexOf('    async function applyManifestToPanel('),end=html.indexOf('\n    }',start)+6;
  let persisted=fixture(),writes=0,notifications=0,closed=0,fail=false,quoteCalls=0,quoteReady=false;
  const quote={rate:6.7,quoteDate:'2026-10-13',retrievedAt:timestamp,source:'Banco Central do Brasil · PTAX venda'};
  let nextQuote=quote;
  const applyContext=vm.createContext({
    window:{CampaignDatabase:{...database,importManifest(...args){const result=database.importManifest(...args);result.mccBillingSales=[];result.reconciledSales=[];return result}},OverviewCardsDomain:cards},
    location:{hostname:'127.0.0.1',port:'8765'},PANEL_USD_BRL_RATE:5.1,
    panelUsdBrlRateService:{refresh:async options=>{quoteCalls++;assert.equal(options.force,true);quoteReady=true;return nextQuote}},
    panelManifestWithExchangeRate:(manifest,currentQuote)=>{
      assert.equal(quoteReady,true,'the latest quote must be resolved before preparing calculations');
      return {...structuredClone(manifest),
      campanhas:manifest.campanhas.map(item=>({...structuredClone(item),metricas_D_zero:{...structuredClone(item.metricas_D_zero),exchange_rate_usd_brl:currentQuote.rate}}))};
    },
    openPanelDatabase:async()=>({close(){closed++}}),readPanelBase:async()=>persisted,panelManifestRow:rowFactory,
    writePanelBase:async(_db,base)=>{writes++;assert.equal(cards.read(base).version,2);assert.equal(cards.read(base).computedAt,base.atualizado_em);if(fail)throw new Error('write failed');persisted=json(base)},
    BroadcastChannel:class{postMessage(){notifications++}close(){}}
  });
  vm.runInContext(html.slice(start,end),applyContext);
  await applyContext.applyManifestToPanel(capture(0,'d0',50));
  assert.equal(persisted.overview_cards.summary.d0.investment.value,61);assert.equal(persisted.overview_cards.exchangeRate,quote.rate);assert.equal(persisted.manifesto_atual.campanhas[0].metricas_D_zero.exchange_rate_usd_brl,quote.rate);assert.equal(writes,1);assert.equal(notifications,1);assert.equal(quoteCalls,1);
  nextQuote={...quote,rate:5.1,isStale:true,isFallback:true,error:'BCB indisponível'};
  const staleApplied=await applyContext.applyManifestToPanel(capture(0,'d0',50));
  assert.equal(staleApplied.exchangeRateQuote.isFallback,true);assert.equal(persisted.overview_cards.exchangeRate,5.1);assert.equal(quoteCalls,2);assert.equal(writes,2);assert.equal(notifications,2,'fallback permite concluir a atualização MCC');
  const before=JSON.stringify(persisted);fail=true;
  await assert.rejects(applyContext.applyManifestToPanel(capture(0,'d0',90)),/write failed/);
  assert.equal(JSON.stringify(persisted),before);assert.equal(notifications,2);assert.equal(closed,3);assert.equal(quoteCalls,3);
});

test('the real MCC write includes base and summary in one transaction without touching legacy events',async()=>{
  const html=await readFile(new URL('../src/preparador-MCC/index.html',import.meta.url),'utf8'),start=html.indexOf('    function writePanelBase('),end=html.indexOf('\n    }',start)+6;
  const sandbox=vm.createContext({PANEL_BASE_STORE:'bases',PANEL_BASE_KEY:'atual',panelClone:structuredClone});
  vm.runInContext(html.slice(start,end),sandbox);
  let count=0,written;
  const db={transaction(names,mode){count++;assert.deepEqual([...names],['bases']);assert.equal(mode,'readwrite');const tx={objectStore(name){assert.equal(name,'bases');return{put(base,key){written=base;assert.equal(key,'atual')}}}};queueMicrotask(()=>tx.oncomplete());return tx}};
  const base=fixture();base.event_log=[{event_id:'legacy-event',tipo:'preserved'}];await sandbox.writePanelBase(db,base);
  assert.equal(count,1);assert.deepEqual(json(written.overview_cards),json(base.overview_cards));assert.deepEqual(json(written.event_log),json(base.event_log));
});
