(function(root){
  function numeric(value){if(value==null||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null}
  function money(value){return Math.round(value*100+Math.sign(value)*1e-8)/100}
  function sumObservedMetric(rows,field){const entries=Array.isArray(rows)?rows:[];let total=0,observedCount=0;for(const row of entries){const value=numeric(row?.[field]);if(value==null)continue;total+=value;observedCount++}return{value:observedCount?total:null,observedCount,totalCount:entries.length}}
  function deriveTestBudget({commission,commissionCurrency,exchangeRate,conversions,sales,revenue,investment}={}){
    const payout=numeric(commission),rate=numeric(exchangeRate),conversionCount=numeric(conversions),manualSaleCount=numeric(sales),actualRevenue=numeric(revenue),spent=numeric(investment);
    if(conversionCount==null&&!(manualSaleCount>0))return null;
    const saleCount=Math.max(0,conversionCount??0,manualSaleCount??0);
    let payoutBrl=null;
    if(payout!=null&&payout>=0){
      if(commissionCurrency==='BRL')payoutBrl=payout;
      else if(commissionCurrency==='USD'&&rate!=null&&rate>0)payoutBrl=payout*rate;
    }
    const minimumRoi=saleCount===0?0:saleCount===1?10:saleCount===2?20:30;
    let limit;
    if(saleCount===0){
      if(payoutBrl==null||payoutBrl<=0)return null;
      limit=payoutBrl;
    }else{
      const totalRevenue=actualRevenue??(payoutBrl==null?null:payoutBrl*saleCount);
      if(totalRevenue==null||totalRevenue<0)return null;
      limit=totalRevenue/(1+minimumRoi/100);
    }
    limit=money(limit);
    return{limit,remaining:spent==null?null:money(limit-spent),minimumRoi,salesCount:saleCount};
  }
  root.OverviewDomain=Object.freeze({deriveTestBudget,sumObservedMetric});
})(typeof window==='object'?window:globalThis);
