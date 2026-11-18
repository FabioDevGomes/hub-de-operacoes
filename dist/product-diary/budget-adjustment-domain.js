(function(global){
  function safeInteger(value){const number=Number(value);return Number.isSafeInteger(number)&&number>0?number:null}
  function currencyDigits(currency){try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:String(currency||'').toUpperCase()}).resolvedOptions().maximumFractionDigits}catch{return null}}
  function currencyAmount(value,currency){const code=String(currency||'').toUpperCase(),digits=currencyDigits(code);if(digits==null||!Number.isFinite(Number(value)))return'—';return new Intl.NumberFormat('pt-BR',{style:'currency',currency:code,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(value))}
  function createPreview(input,direction,percentage=5){
    const currentMicros=safeInteger(input?.budgetAmountMicros),currency=String(input?.currencyCode||'').toUpperCase(),digits=currencyDigits(currency);
    if(currentMicros==null||!/^([A-Z]{3})$/.test(currency)||digits==null||digits>6||!['increase','decrease'].includes(direction)||![5,10].includes(percentage))return null;
    const unitMicros=10**(6-digits),factor=BigInt(100+(direction==='increase'?percentage:-percentage)),denominator=100n*BigInt(unitMicros);
    const current=BigInt(currentMicros),targetMinorUnits=(current*factor+denominator/2n)/denominator,target=targetMinorUnits*BigInt(unitMicros);
    if(target>BigInt(Number.MAX_SAFE_INTEGER))return null;
    const nextMicros=Number(target);
    if(!Number.isSafeInteger(nextMicros)||nextMicros<=0||nextMicros===currentMicros)return null;
    return{direction,currentBudgetMicros:currentMicros,targetBudgetMicros:nextMicros,currencyCode:currency,stepPercentage:percentage,currentAmount:currentMicros/1_000_000,targetAmount:nextMicros/1_000_000};
  }
  global.ProductDiaryBudgetAdjustmentDomain=Object.freeze({createPreview,currencyAmount,currencyDigits});
})(typeof window==='object'?window:globalThis);
