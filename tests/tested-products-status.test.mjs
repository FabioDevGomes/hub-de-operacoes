import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const html=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const adapter=html.slice(html.indexOf('function testedProducts(){'),html.indexOf('\n    let testedProductsController'));
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
  const sandbox={derivedContext:()=>context,campaignRows:()=>context.campaigns,currentCampaignRows:()=>manifest,state:{database:{campanhas:source},productCatalog:catalog},manifestDates:()=>({d0:'2026-10-06',d1:null}),testedProductName:c=>c.nome_exibicao,campaignIdentity:()=>({dateSort:null}),campaignSheet:name=>name,ProductCatalog:{normalize:value=>value},TestedProductsDomain:domain};
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
