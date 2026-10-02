(function(root){
  function numeric(value){if(value==null||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null}
  function money(value){return Math.round(value*100+Math.sign(value)*1e-8)/100}
  function sumObservedMetric(rows,field){const entries=Array.isArray(rows)?rows:[];let total=0,observedCount=0;for(const row of entries){const value=numeric(row?.[field]);if(value==null)continue;total+=value;observedCount++}return{value:observedCount?total:null,observedCount,totalCount:entries.length}}
  function sumObservedProfit(totalsList){const entries=Array.isArray(totalsList)?totalsList:[];let investment=0,commission=0,observedCount=0;for(const totals of entries){const spent=numeric(totals?.investment),revenue=numeric(totals?.commission);if(spent==null||revenue==null)continue;investment+=spent;commission+=revenue;observedCount++}return{value:observedCount?profitForTotals({investment,commission}):null,observedCount,totalCount:entries.length}}
  function previousIsoDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return'';const date=new Date(`${value}T00:00:00.000Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return'';date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10)}
  function resolveD0Totals(direct,dailyRow,date){
    const result={...direct,date};
    if(!date||dailyRow?.data!==date)return result;
    const columns={investment:'O',impressions:'B',clicks:'C',conversions:'F',commission:'P'};
    for(const [field,column] of Object.entries(columns))if(result[field]==null)result[field]=numeric(dailyRow.celulas?.[column]?.value);
    return result;
  }
  function resolveD1Totals(direct,recorded){
    const result={...direct};
    for(const field of ['investment','impressions','clicks','conversions','commission'])if(result[field]==null&&recorded?.[field]!=null)result[field]=recorded[field];
    return result;
  }
  function profitForTotals(totals){if(!totals)return null;const investment=numeric(totals.investment),commission=numeric(totals.commission);if(investment==null||commission==null)return null;return money(commission-investment)}
  function totalsColumns(mode,totalLabel='total'){
    return[['date','Data'],['campaign','Campanha'],['zeroDays','Dias sem impressões'],['current',`Investimento ${totalLabel}`],['imp',`Impressões ${totalLabel}`],['clicks',`Cliques ${totalLabel}`],['conv',`Conversões ${totalLabel}`],['roi','ROI atual'],['profit',`Lucro ${totalLabel} (R$)`],['account','Conta'],['limit','Limite de teste'],['remaining','Valor restante'],['status','Situação']];
  }
  function parseMinimumRoi(value){const text=String(value??'').trim();if(!/^\d+(?:[.,]\d+)?$/.test(text))throw new Error('Informe somente um número para o ROI mínimo, sem o símbolo %.');const result=Number(text.replace(',','.'));if(!Number.isFinite(result)||result<0)throw new Error('O ROI mínimo deve ser um número igual ou maior que zero.');return result}
  function deriveTestBudget({commission,commissionCurrency,exchangeRate,conversions,sales,revenue,investment,minimumRoiOverride}={}){
    const payout=numeric(commission),rate=numeric(exchangeRate),conversionCount=numeric(conversions),manualSaleCount=numeric(sales),actualRevenue=numeric(revenue),spent=numeric(investment);
    if(conversionCount==null&&!(manualSaleCount>0))return null;
    const saleCount=Math.max(0,conversionCount??0,manualSaleCount??0);
    let payoutBrl=null;
    if(payout!=null&&payout>=0){
      if(commissionCurrency==='BRL')payoutBrl=payout;
      else if(commissionCurrency==='USD'&&rate!=null&&rate>0)payoutBrl=payout*rate;
    }
    const defaultMinimumRoi=saleCount===0?0:saleCount===1?10:saleCount===2?20:30,override=numeric(minimumRoiOverride),minimumRoi=override!=null&&override>=0?override:defaultMinimumRoi;
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
  function sortRows(input,state,sortCell){const rows=[...(input||[])];
      const values={date:r=>r.identity.dateSort,campaign:r=>r.identity.name.toLocaleLowerCase('pt-BR'),zeroDays:r=>r.zeroDays,status:r=>r.c._status==='pausada'?'pausada':r.numberReuse?'renumerar':r.rejected?'reprovada':r.c._movement==='reativada'?'reativada':'ativa',current:r=>r.totals?.investment??null,imp:r=>r.totals?.impressions??null,clicks:r=>r.totals?.clicks??null,conv:r=>r.totals?.conversions??null,roi:r=>r.roi,profit:r=>r.profit,account:r=>r.account,limit:r=>sortCell(r.testLimit),remaining:r=>sortCell(r.testRemaining)};
       rows.sort((a,b)=>{const av=values[state.sortKey](a),bv=values[state.sortKey](b);if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;const result=typeof av==='string'?av.localeCompare(bv,'pt-BR',{numeric:true,sensitivity:'base'}):av-bv;return state.sortDir==='asc'?result:-result});
    return rows;
  }
  function rowVisible(row,filter,referenceDate){const paused=row.c._status==='pausada',pausedAt=row.pausedAt||'',cutoff=new Date(`${referenceDate}T00:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-6);const recentPaused=paused&&pausedAt>=cutoff.toISOString().slice(0,10);return !(filter==='active'&&paused||filter==='paused'&&!paused||filter==='paused7'&&!recentPaused)}
  root.OverviewDomain=Object.freeze({sortRows,rowVisible,deriveTestBudget,parseMinimumRoi,sumObservedMetric,sumObservedProfit,resolveD0Totals,resolveD1Totals,profitForTotals,previousIsoDate,totalsColumns});
})(typeof window==='object'?window:globalThis);
