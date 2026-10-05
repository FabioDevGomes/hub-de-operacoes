import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
function block(start,end){const a=template.indexOf(start),b=template.indexOf(end,a);assert.ok(a>=0&&b>a);return template.slice(a,b)}
const overviewAdapter=block('    function overviewRowsForMode(){','    let overviewController=');
const diaryAdapter=block("    function productDiarySnapshot(","    let productDiaryController=");
test('overview adapter retains temporal financial projection, manual adjustments and immutable cache',async()=>{
  const context=vm.createContext({window:{}});vm.runInContext(await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8'),context);
  const campaign={nome_campanha_exato:'MCC nome completo',_status:'ativa'},stored={id:'stable-001',roi_minimo_pct:20},
    sales={pendingConversions:3,commissionAdjustment:110,manualSales:3,byDate:{
      '2026-09-29':{pendingConversions:2,commissionAdjustment:60},'2026-09-30':{pendingConversions:1,commissionAdjustment:50}}},
    cache={historyTotals:new Map(),salesAdjustments:new Map([[stored.id,sales]]),totalsRowsByMode:new Map()};
  const base={consolidated:{investment:100,commission:200,conversions:2},d1:{investment:10,commission:20,conversions:0},d0:{investment:30,commission:0,conversions:0}};
  let calculations=0;
  vm.runInContext(await readFile(new URL('../src/overview/sale-roi-domain.js',import.meta.url),'utf8'),context);
  Object.assign(context,{OverviewDomain:context.window.OverviewDomain,SaleRoiDomain:context.window.SaleRoiDomain,state:{totalsMode:'consolidated',rate:5},
    campaignRows:()=>[campaign],activeCampaignRows:()=>[campaign],derivedContext:()=>cache,
    workbookTotalsMap:()=>new Map(),databaseCampaign:()=>stored,manifestDates:()=>({d0:'2026-09-30',d1:'2026-09-29'}),
    campaignHistoricalTotals:()=>({}),totalsForMode:(_c,_h,mode=context.state.totalsMode)=>{calculations++;return base[mode]},
    d0Totals:()=>base.d0,d1Totals:()=>base.d1,cpaTitleInfo:()=>({payout:50,payoutCurrency:'BRL'}),
    fmtMoney:String,sortCell:c=>c?.value??null,campaignIdentity:name=>({name,dateLabel:'',dateSort:''}),
    campaignZeroImpressionDays:()=>0,roiForTotals:t=>t?(t.commission-t.investment)/t.investment*100:null,
    campaignAccount:()=> '7441',campaignRejected:()=>false,campaignNumberReuse:()=>null,campaignPolicyLimitation:()=>null});
  const before=JSON.stringify({campaign,stored,sales,base});vm.runInContext(overviewAdapter,context);
  for(const [mode,conversions,commission,profit] of [['consolidated',5,310,210],['d1',2,80,70],['d0',1,50,20]]){
    context.state.totalsMode=mode;const snapshot=context.overviewSnapshot(),row=snapshot.rows[0];
    assert.equal(row.totals.conversions,conversions);assert.equal(row.totals.commission,commission);assert.equal(row.profit,profit);
    assert.equal(row.d0ProfitTotals.commission,50,'lucro D0 inclui o ajuste provisório da data D0 independentemente do modo da tabela');assert.equal(row.d0ProfitTotals.investment,30);assert.equal(row.d0Totals.commission,0,'o snapshot MCC original permanece inalterado');
    assert.equal(row.campaignId,stored.id);assert.equal(row.account,'7441');assert.equal(row.budget.limit,258.33);
    assert.equal(row.budget.remaining,158.33);assert.equal(row.budget.minimumRoi,20);
    const count=calculations;context.overviewSnapshot();assert.equal(calculations,count,'sorting/filtering must reuse financial projection');
    assert.notEqual(snapshot.rows,cache.totalsRowsByMode.get(mode));
    assert.equal(cache.totalsRowsByMode.get(mode)[0].campaignId,undefined,'UI metadata must not mutate cached business rows');
  }
  assert.equal(JSON.stringify({campaign,stored,sales,base}),before);
});
test('diary adapter disambiguates same display names by stable ID, never writes or mutates history',async()=>{
  const context=vm.createContext({window:{}});vm.runInContext(await readFile(new URL('../src/product-diary/domain.js',import.meta.url),'utf8'),context);
  const campaigns=[{id:'id-a',nome_mcc:'MCC A',nome_exibicao:'Mesmo produto'},{id:'id-b',nome_mcc:'MCC B',nome_exibicao:'Mesmo produto'}],
    diario=[{campanha_id:'id-a',date:'2026-09-29',cells:{A:{value:'2026-09-29'},C:{value:10}}},
      {campanha_id:'id-b',date:'2026-09-29',cells:{A:{value:'2026-09-29'},C:{value:20}}}],
    rows=campaigns.map(c=>({nome_campanha_exato:c.nome_mcc})),
    database={campanhas:campaigns,diario},calls=[];
  vm.runInContext(await readFile(new URL('../src/overview/sale-roi-domain.js',import.meta.url),'utf8'),context);
  Object.assign(context,{SaleRoiDomain:context.window.SaleRoiDomain,state:{database,workbook:null},campaignRows:()=>rows,campaignSheet:()=> 'Mesmo produto',
    CampaignDatabase:{dailyRows:(_db,sheet,id)=>{calls.push([sheet,id]);return diario.filter(r=>r.campanha_id===id)}},
    sheetDailyRows:context.window.ProductDiaryDomain.sheetDailyRows,manifestProductRow:()=>[],
    derivedContext:()=>({salesAdjustments:new Map([['id-b',{byDate:{'2026-09-30':{pendingConversions:1}}}]])}),
    d0Totals:c=>({investment:c.nome_campanha_exato==='MCC B'?20:10})});
  const before=JSON.stringify(database);vm.runInContext(diaryAdapter,context);
  const snapshot=context.productDiarySnapshot('Mesmo produto','workbook','id-b');
  assert.equal(snapshot.rows.length,1);assert.equal(snapshot.rows[0].cells.C.value,20);assert.equal(snapshot.investment,20);
  assert.deepEqual(calls,[['Mesmo produto','id-b']]);assert.equal(snapshot.manualSalesByDate.size,1);
  assert.equal(snapshot.manualSalesByDate.get('2026-09-30').pendingConversions,1);assert.equal(JSON.stringify(database),before);
});
test('legacy adapter returns only preserved summary, does not synthesize daily history or provisional sales',()=>{
  const stored={id:'legacy-id',nome_mcc:'MCC legado',nome_exibicao:'Legado',legacy_totais:{metrics:{investment_brl:{state:'observed',value:50}}}},
    database={campanhas:[stored],diario:[]},before=JSON.stringify(database),context=vm.createContext({state:{database},Map});
  Object.assign(context,{campaignRows:()=>{throw Error('legacy must not read operational rows')},
    CampaignDatabase:{dailyRows:()=>{throw Error('legacy must not read native diary')}},
    derivedContext:()=>{throw Error('legacy must not mix manual sales')}});
  vm.runInContext(diaryAdapter,context);
  const snapshot=context.productDiarySnapshot('Legado','legacy','legacy-id');
  assert.equal(snapshot.summary,stored.legacy_totais);assert.equal(snapshot.rows.length,0);
  assert.equal(snapshot.displayRows.length,0);assert.equal(snapshot.manualSalesByDate.size,0);
  assert.equal(snapshot.investment,null);assert.equal(JSON.stringify(database),before);
});
