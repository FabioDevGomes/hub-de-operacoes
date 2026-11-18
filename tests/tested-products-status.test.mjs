import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const html=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const adapter=html.slice(html.indexOf('function testedProducts(){'),html.indexOf('\n    let testedProductsController'));
const firstSaleRefresh=html.slice(html.indexOf('async function refreshOverviewFirstSaleClickIndex('),html.indexOf('\n    async function refreshGuruMediaCampaignSnapshot'));
const testedProductsRender=html.slice(html.indexOf('function renderTestedProducts(){'),html.indexOf('\n    function accountCampaignTotals'));
assert.ok(firstSaleRefresh.includes('if(!state.database)return false;'),'o índice da primeira venda não deve concluir antes de a base operacional carregar');
assert.ok(firstSaleRefresh.includes('mergeFirstSaleSales(billingSales,[...projectedMccSales,...guruMediaSales])'),'a projeção deve reunir MCC/GuruMedia sem gravar no banco ao abrir Produtos Testados');
assert.ok(firstSaleRefresh.includes("firstSaleRows({campaigns:sourceBase.campanhas||[],sales,diary:database.diario||[],apiCaptures:state.googleAdsSourceMode==='api'?sourceBase.google_ads_api_daily_captures||[]:[]})"),'a primeira venda deve usar o Diário e, em fonte API, as capturas diárias por ID/data');
assert.ok(testedProductsRender.includes("if(!overviewBillingSourceLoaded)void refreshOverviewBillingSource()"),'Produtos Testados deve carregar a mesma fonte de Faturamento da Visão Geral antes de calcular cliques na primeira venda');
assert.ok(html.includes('if(overviewFirstSaleClickIndexPromise)await overviewFirstSaleClickIndexPromise;'),'a atualização GuruMedia deve aguardar o índice anterior antes de recalcular sua própria projeção');
const activeHelper=html.match(/function activeCampaignRows\(\)\{[^\n]+\}/)[0];
const domainContext=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/tested-products/domain.js',import.meta.url),'utf8'),domainContext);
const domain=domainContext.window.TestedProductsDomain;

function fixture(overrides={}){
  const names=['Closed 1','Closed 2','Mixed 1','Mixed 2','Absent'];
  const source=names.map((name,index)=>({id:`campaign-${index}`,nome_mcc:name,nome_exibicao:name}));
  const manifest=names.slice(0,4).map((name,index)=>({nome_campanha_exato:name,_status:index===3?'ativa':'pausada',metricas_D_zero:{presente:true,data:'2026-10-06',conversoes:{value:2}}}));
  const context={campaigns:manifest,latestSnapshots:{rows:[],dates:[]},dailyByCampaign:new Map(source.map(c=>[c.id,[{data:'2026-10-06',celulas:{F:{value:0},O:{value:10},P:{value:30}}}]])),salesAdjustments:new Map()};
  const catalog={ocultos:[],aliases:{},datas_inicio:{},ajustes_testados:overrides};
  const firstSaleClicksByCampaign=new Map();if(overrides.firstSaleClicksByCampaign)for(const [id,value] of Object.entries(overrides.firstSaleClicksByCampaign))firstSaleClicksByCampaign.set(id,value);
  const sandbox={derivedContext:()=>context,campaignRows:()=>context.campaigns,currentCampaignRows:()=>manifest,state:{database:{campanhas:source},productCatalog:catalog},overviewFirstSaleClicksByCampaign:firstSaleClicksByCampaign,operationalDatabase:()=>sandbox.state.database,manifestDates:()=>({d0:'2026-10-06',d1:null}),testedProductName:c=>c.nome_exibicao,campaignIdentity:()=>({dateSort:null}),campaignSheet:name=>name,ProductCatalog:{normalize:value=>value},TestedProductsDomain:domain};
  const before=JSON.stringify({source,manifest,catalog,daily:[...context.dailyByCampaign]});
  vm.createContext(sandbox);vm.runInContext(activeHelper,sandbox);
  const products=vm.runInContext(`(${adapter})`,sandbox)();
  assert.equal(JSON.stringify({source,manifest,catalog,daily:[...context.dailyByCampaign]}),before,'a projeção não deve alterar registros ou catálogo');
  return {products,context,manifest,source,catalog};
}

test('produto com todas as campanhas pausadas no manifesto fica Histórico',()=>{
  const {products}=fixture();
  assert.equal(products.find(p=>p.label==='Closed').active,false);
  assert.equal(products.find(p=>p.label==='Absent').active,false);
  assert.equal(products.filter(p=>p.active).length,1);
});

test('uma campanha realmente ativa mantém o produto misto Ativo',()=>{
  const {products}=fixture();
  const product=products.find(p=>p.label==='Mixed');
  assert.equal(product.active,true);
  assert.equal(product.campaigns.length,2);
});

test('separa venda sem vínculo, cliques indisponíveis e subtotal de primeira venda',()=>{
  const {products}=fixture({firstSaleClicksByCampaign:{'campaign-0':null,'campaign-2':5,'campaign-3':null}});
  assert.equal(products.find(p=>p.label==='Absent').firstSaleClicksStatus,'no-linked-sale');
  assert.equal(products.find(p=>p.label==='Closed').firstSaleClicksCount,null);
  assert.equal(products.find(p=>p.label==='Closed').firstSaleClicksStatus,'clicks-unavailable');
  assert.equal(products.find(p=>p.label==='Mixed').firstSaleClicksCount,5);
  assert.equal(products.find(p=>p.label==='Mixed').firstSaleClicksStatus,'partial');
  assert.equal(products.find(p=>p.label==='Mixed').firstSaleClicksPartial,true);
});

test('filtrar a situação não perde conversões e métricas das campanhas pausadas',()=>{
  const {products}=fixture();
  const product=products.find(p=>p.label==='Closed');
  assert.equal(product.salesCount,4,'mantém os snapshots D0 das duas campanhas pausadas');
  assert.equal(product.totalBilled,60);
  assert.equal(product.totalInvestment,20);
  assert.equal(product.totalProfit,40);
});

test('correção da situação calculada preserva ajustes manuais independentes',()=>{
  const {products}=fixture({closed:{values:{totalProfit:99}},mixed:{values:{active:false}}});
  const closed=products.find(p=>p.label==='Closed'),mixed=products.find(p=>p.label==='Mixed');
  assert.equal(closed.active,false);
  assert.equal(closed.totalProfit,99);
  assert.equal(closed.calculated.totalProfit,40);
  assert.equal(mixed.active,false);
  assert.equal(mixed.calculated.active,true);
});
