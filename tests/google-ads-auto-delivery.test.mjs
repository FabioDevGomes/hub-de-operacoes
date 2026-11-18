import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {deliveryCpaLevels,resolveDeliveryCpaSelection,prepareDeliveryCampaign,convertGoogleAdsCurrencyAmount,suggestedGoogleAdsDailyBudget,calculateGoogleAdsCommissionCpa} from '../src/google-ads/google-ads-auto-delivery-domain.mjs';
const creationView=await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs',import.meta.url),'utf8');

test('orçamento sugerido equivale a 1,5x a comissão e converte USD/BRL',()=>{
  assert.equal(suggestedGoogleAdsDailyBudget({commission:107,sourceCurrency:'USD',targetCurrency:'USD'}),'160.50');
  assert.equal(suggestedGoogleAdsDailyBudget({commission:107,sourceCurrency:'USD',targetCurrency:'BRL',usdBrlRate:5}),'802.50');
  assert.equal(suggestedGoogleAdsDailyBudget({commission:107,sourceCurrency:'BRL',targetCurrency:'USD',usdBrlRate:5}),'32.10');
  assert.equal(suggestedGoogleAdsDailyBudget({commission:107,sourceCurrency:'USD',targetCurrency:'EUR',usdBrlRate:5}),'');
});

test('sugestão do formulário preserva orçamento manual e persiste a origem automática',()=>{
  assert.match(creationView,/event\.target\.matches\('\[name="daily_budget"\]'\)\) event\.target\.dataset\.budgetSource = 'manual'/);
  assert.match(creationView,/dailyBudgetField\?\.dataset\.budgetSource !== 'manual'/);
  assert.match(creationView,/values\.__hub_daily_budget_source = form\.elements\.namedItem\('daily_budget'\)\.dataset\.budgetSource/);
});

test('faixas configuráveis progridem em dez pontos e respeitam o limite',()=>{
  assert.deepEqual(deliveryCpaLevels(40),[40,50,60,70,80]);
  assert.deepEqual(deliveryCpaLevels(35),[35,45,55,65,75]);
  assert.deepEqual(deliveryCpaLevels(29),[]);
  assert.deepEqual(deliveryCpaLevels(81),[]);
});

test('a menor faixa marcada é a base e as demais continuam selecionadas',()=>{
  assert.deepEqual(resolveDeliveryCpaSelection(40,[60,40,50,50]).selected,[40,50,60]);
  assert.equal(resolveDeliveryCpaSelection(40,[60,50]).base,50);
  assert.deepEqual(resolveDeliveryCpaSelection(40,[]).selected,[40]);
  assert.deepEqual(resolveDeliveryCpaSelection(35,[45,75]).selected,[45,75]);
});

test('nome e CPA usam produto, BB/NBB, países, comissão e a menor faixa escolhida',()=>{
  const selected=[60,40,50],base=Math.min(...selected);
  const result=prepareDeliveryCampaign({product:'VenoPlus 8',countries:['US','CA'],brandBidding:'no_brand_bidding',commissionUsd:88,percent:base,date:'31/10',iteration:3,currency:'USD'});
  assert.equal(result.ok,true);
  assert.equal(result.name,'31/10 - VenoPlus 8 03 (CB-NBB-US/CA) 40% - U$ 88.00');
  assert.equal(result.cpa,'35.20');
  assert.equal(result.currency,'USD');
  assert.equal(prepareDeliveryCampaign({product:'VenoPlus 8',countries:['US'],brandBidding:'brand_bidding',commissionUsd:88,percent:50,date:'31/10',iteration:4,currency:'USD'}).cpa,'44.00');
});

test('conversão de USD para BRL exige cotação; campos ausentes não viram zero',()=>{
  const base={product:'Product',countries:['US'],brandBidding:'brand_bidding',commissionUsd:88,percent:40,date:'31/10',iteration:1};
  assert.equal(prepareDeliveryCampaign({...base,currency:'BRL',usdBrlRate:5}).cpa,'176.00');
  assert.equal(prepareDeliveryCampaign({...base,currency:'BRL'}).cpa,null);
  assert.equal(prepareDeliveryCampaign({...base,currency:'CAD'}).cpa,null);
  assert.equal(prepareDeliveryCampaign({...base,brandBidding:null,currency:'USD'}).ok,false);
  assert.equal(prepareDeliveryCampaign({...base,countries:['US','invalid'],currency:'USD'}).ok,false);
  assert.equal(prepareDeliveryCampaign({...base,commissionUsd:0,currency:'USD'}).ok,false);
});

test('valores e CPA convertem nos dois sentidos entre BRL e USD com arredondamento em centavos',()=>{
  assert.deepEqual(convertGoogleAdsCurrencyAmount({amount:250,sourceCurrency:'BRL',targetCurrency:'USD',usdBrlRate:5}),{
    sourceAmount:'250',targetAmount:'50.00',targetCurrency:'USD',converted:true,
  });
  assert.deepEqual(convertGoogleAdsCurrencyAmount({amount:50,sourceCurrency:'USD',targetCurrency:'BRL',usdBrlRate:5}),{
    sourceAmount:'50',targetAmount:'250.00',targetCurrency:'BRL',converted:true,
  });
  assert.equal(convertGoogleAdsCurrencyAmount({amount:50,sourceCurrency:'BRL',targetCurrency:'USD'}),null);
  assert.equal(convertGoogleAdsCurrencyAmount({amount:50,sourceCurrency:'BRL',targetCurrency:'CAD',usdBrlRate:5}),null);
  assert.equal(calculateGoogleAdsCommissionCpa({commission:88,percent:40,sourceCurrency:'USD',targetCurrency:'BRL',usdBrlRate:5}).targetAmount,'176.00');
  assert.equal(calculateGoogleAdsCommissionCpa({commission:88,percent:40,sourceCurrency:'USD',targetCurrency:'USD',usdBrlRate:5}).targetAmount,'35.20');
});
