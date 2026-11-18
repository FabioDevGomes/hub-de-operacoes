(function(global){
  const MICROS_PER_UNIT=1_000_000;
  const MICROS_PER_CENT=10_000;
  const DEFAULT_STEP_PERCENT=2;
  const SUPPORTED_STEP_PERCENTAGES=Object.freeze([2,4]);
  function safeInteger(value){const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:null}
  function commissionInTargetCents(commissionCents,commissionCurrency,targetCurrency,exchangeRate){
    if(!Number.isSafeInteger(commissionCents)||commissionCents<=0)return null;
    if(commissionCurrency===targetCurrency)return{cents:commissionCents,rate:1};
    if(!((commissionCurrency==='USD'&&targetCurrency==='BRL')||(commissionCurrency==='BRL'&&targetCurrency==='USD')))return null;
    const rate=Number(exchangeRate);
    if(!Number.isFinite(rate)||rate<=0||rate>100)return null;
    const converted=commissionCurrency==='USD'?commissionCents*rate:commissionCents/rate;
    if(!Number.isFinite(converted)||converted<=0||converted>Number.MAX_SAFE_INTEGER)return null;
    return{cents:Math.round(converted),rate};
  }
  function createPreview(input,direction,stepPercentagePoints=DEFAULT_STEP_PERCENT){
    const currentMicros=safeInteger(input?.targetCpaMicros),commissionCents=safeInteger(input?.commissionCents);
    const currency=String(input?.currencyCode||'').toUpperCase(),commissionCurrency=String(input?.commissionCurrency||'').toUpperCase();
    if(currentMicros==null||currentMicros<=0||!/^([A-Z]{3})$/.test(currency)||!/^([A-Z]{3})$/.test(commissionCurrency)||!['increase','decrease'].includes(direction)||!SUPPORTED_STEP_PERCENTAGES.includes(stepPercentagePoints))return null;
    const commission=commissionInTargetCents(commissionCents,commissionCurrency,currency,input?.exchangeRate);
    if(!commission)return null;
    const deltaCents=Math.round(commission.cents*stepPercentagePoints/100);
    if(deltaCents<1)return null;
    const deltaMicros=deltaCents*MICROS_PER_CENT,targetMicros=currentMicros+(direction==='increase'?deltaMicros:-deltaMicros);
    if(!Number.isSafeInteger(targetMicros)||targetMicros<=0)return null;
    const payoutMicros=commission.cents*MICROS_PER_CENT;
    return{
      direction,
      currentTargetCpaMicros:currentMicros,
      targetCpaMicros:targetMicros,
      deltaCpaMicros:deltaMicros,
      commissionCents,
      commissionCurrency,
      commissionTargetCents:commission.cents,
      currencyCode:currency,
      exchangeRate:commission.rate,
      stepPercentagePoints,
      currentTargetCpa:currentMicros/MICROS_PER_UNIT,
      targetCpa:targetMicros/MICROS_PER_UNIT,
      deltaCpa:deltaMicros/MICROS_PER_UNIT,
      commissionTarget:commission.cents/100,
      currentPercentage:currentMicros/payoutMicros*100,
      targetPercentage:targetMicros/payoutMicros*100,
    };
  }
  function currencyAmount(value,currency){
    const code=String(currency||'').toUpperCase();
    if(!/^[A-Z]{3}$/.test(code)||!Number.isFinite(Number(value)))return'—';
    try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:code}).format(Number(value))}catch{return`${code} ${Number(value).toFixed(2)}`}
  }
  global.ProductDiaryCpaAdjustmentDomain=Object.freeze({createPreview,currencyAmount,defaultStepPercentagePoints:DEFAULT_STEP_PERCENT,supportedStepPercentages:SUPPORTED_STEP_PERCENTAGES});
})(typeof window==='object'?window:globalThis);
