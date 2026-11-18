import {parseGoogleAdsCampaignName} from './google-ads-campaign-name-parser.mjs?v=6';

export function deliveryCpaLevels(start) {
  const value=Number(start);
  if(!Number.isFinite(value)||value<30||value>80||Math.abs(Math.round(value*100)-value*100)>1e-7)return [];
  const levels=[];
  for(let step=0;value+step*10<=80;step++)levels.push(Math.round((value+step*10)*100)/100);
  return levels;
}

export function resolveDeliveryCpaSelection(start,selected) {
  let levels=deliveryCpaLevels(start);
  if(!levels.length)levels=deliveryCpaLevels(40);
  const marked=[...new Set((Array.isArray(selected)?selected:[]).map(Number).filter(value=>levels.includes(value)))].sort((a,b)=>a-b);
  if(!marked.length)marked.push(levels[0]);
  return {start:levels[0],levels,selected:marked,base:marked[0]};
}

function roundCurrencyAmount(value) {
  const amount=Number(value);
  return Number.isFinite(amount)?(Math.round((amount+Number.EPSILON)*100)/100).toFixed(2):'';
}

export function convertGoogleAdsCurrencyAmount({amount,sourceCurrency,targetCurrency,usdBrlRate}={}) {
  const value=Number(amount),source=String(sourceCurrency||'').trim().toUpperCase(),target=String(targetCurrency||'').trim().toUpperCase();
  if(!Number.isFinite(value)||value<=0||!/^[A-Z]{3}$/.test(source)||!/^[A-Z]{3}$/.test(target))return null;
  const sourceAmount=String(value);
  if(source===target)return {sourceAmount,targetAmount:sourceAmount,targetCurrency:target,converted:false};
  const rate=Number(usdBrlRate);
  if(!Number.isFinite(rate)||rate<=0||rate>100)return null;
  if(source==='USD'&&target==='BRL')return {sourceAmount,targetAmount:roundCurrencyAmount(value*rate),targetCurrency:target,converted:true};
  if(source==='BRL'&&target==='USD')return {sourceAmount,targetAmount:roundCurrencyAmount(value/rate),targetCurrency:target,converted:true};
  return null;
}

export function suggestedGoogleAdsDailyBudget({commission,sourceCurrency='USD',targetCurrency,usdBrlRate}={}) {
  const commissionAmount=Number(commission);
  if(!Number.isFinite(commissionAmount)||commissionAmount<=0)return '';
  const converted=convertGoogleAdsCurrencyAmount({amount:commissionAmount*1.5,sourceCurrency,targetCurrency,usdBrlRate});
  return converted?roundCurrencyAmount(converted.targetAmount):'';
}

export function calculateGoogleAdsCommissionCpa({commission,percent,sourceCurrency='USD',targetCurrency,usdBrlRate}={}) {
  const commissionAmount=Number(commission),pct=Number(percent);
  if(!Number.isFinite(commissionAmount)||commissionAmount<=0||!Number.isFinite(pct)||pct<=0)return null;
  const sourceAmount=roundCurrencyAmount(commissionAmount*pct/100);
  if(!sourceAmount||Number(sourceAmount)<=0)return null;
  const converted=convertGoogleAdsCurrencyAmount({amount:sourceAmount,sourceCurrency,targetCurrency,usdBrlRate});
  return converted?{...converted,sourceAmount,targetAmount:converted.converted?converted.targetAmount:sourceAmount}:null;
}

export function prepareDeliveryCampaign({product,countries,geoTargetingMode='COUNTRIES',brandBidding,commissionUsd,percent,date,iteration,currency,usdBrlRate,platformCode='CB'}={}) {
  const amount=Number(commissionUsd),pct=Number(percent),index=Number(iteration);
  const platform=String(platformCode||'CB').trim().toUpperCase();
  const inputCountries=Array.isArray(countries)?countries.map(v=>String(v).trim().toUpperCase()):[];
  const geos=[...new Set(inputCountries)];
  const geoMode=String(geoTargetingMode||'COUNTRIES').trim().toUpperCase();
  const model=brandBidding==='brand_bidding'?'BB':brandBidding==='no_brand_bidding'?'NBB':'';
  const nameProduct=String(product||'').trim().replace(/\s+/g,' ');
  const validGeography=geoMode==='WORLD'?!geos.length:geoMode==='COUNTRIES'&&geos.length>0&&geos.length<=20&&geos.every(v=>/^[A-Z]{2}$/.test(v));
  if(!/^[A-Z]{2}$/.test(platform)||!nameProduct||!validGeography||!model||!Number.isFinite(amount)||amount<=0||!Number.isFinite(pct)||pct<30||pct>80||!Number.isInteger(index)||index<1||index>999||!/^\d{1,2}\/\d{1,2}$/.test(String(date||'')))return {ok:false,reason:'Informe produto, país ou modo Mundo, plataforma, classificação BB/NBB e comissão para preparar a campanha.'};
  const name=String(date)+' - '+nameProduct+' '+String(index).padStart(2,'0')+' ('+platform+'-'+model+'-'+(geoMode==='WORLD'?'WORLD':geos.join('/'))+') '+pct+'% - U$ '+amount.toFixed(2);
  if(Array.from(name).length>128||!parseGoogleAdsCampaignName(name).ok)return {ok:false,reason:'Não foi possível montar um nome válido com os dados da oferta.'};
  const sourceCpa=roundCurrencyAmount(amount*pct/100);
  const conversion=calculateGoogleAdsCommissionCpa({commission:amount,percent:pct,sourceCurrency:'USD',targetCurrency:currency,usdBrlRate});
  const cpa=conversion?.targetAmount||null;
  return {ok:true,name,cpa,currency:cpa?String(currency||'').toUpperCase():'',percent:pct,commissionUsd:amount,sourceCpa,platformCode:platform,geoTargetingMode:geoMode};
}
