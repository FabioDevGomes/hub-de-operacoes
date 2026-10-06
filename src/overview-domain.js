(function(root){
  function numeric(value){if(value==null||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null}
  function money(value){return Math.round(value*100+Math.sign(value)*1e-8)/100}
  function sumObservedMetric(rows,field){const entries=Array.isArray(rows)?rows:[];let total=0,observedCount=0;for(const row of entries){const value=numeric(row?.[field]);if(value==null)continue;total+=value;observedCount++}return{value:observedCount?total:null,observedCount,totalCount:entries.length}}
  function sumObservedProfit(totalsList){const entries=Array.isArray(totalsList)?totalsList:[];let investment=0,commission=0,observedCount=0;for(const totals of entries){const spent=numeric(totals?.investment),revenue=numeric(totals?.commission);if(spent==null||revenue==null)continue;investment+=spent;commission+=revenue;observedCount++}return{value:observedCount?profitForTotals({investment,commission}):null,observedCount,totalCount:entries.length}}
  function previousIsoDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return'';const date=new Date(`${value}T00:00:00.000Z`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return'';date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10)}
  function manifestValue(value){if(value&&typeof value==='object'){if(value.estado==='ausente'||value.estado==='invalido')return null;if(Object.prototype.hasOwnProperty.call(value,'valor'))return value.valor;if(Object.prototype.hasOwnProperty.call(value,'value'))return value.value}return value}
  function manifestField(value){return numeric(manifestValue(value))}
  function manifestDate(value,fallback){const raw=manifestValue(value),text=String(raw??fallback??'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(text))return previousIsoDate(text)?text:'';const match=text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);if(!match)return'';const iso=`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`,date=new Date(`${iso}T00:00:00.000Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:''}
  function authoritativeMccSnapshots(manifest,{exchangeRate=1}={}){
    const temporal=manifest?.separacao_temporal||{},fallbackDates={d0:manifestDate(temporal.D_zero?.datas_detectadas?.[0]),d1:manifestDate(temporal.D_menos_1?.datas_detectadas?.[0])},dateFields={d0:'metricas_D_zero',d1:'metricas_D_menos_1'},dates=new Set(Object.values(fallbackDates).filter(Boolean)),rows=[];
    for(const campaign of manifest?.campanhas||[])for(const[period,field]of Object.entries(dateFields)){
      const metrics=campaign?.[field];if(!metrics)continue;
      const date=manifestDate(metrics.data,fallbackDates[period]);if(!date)continue;
      // A date supplied by another MCC does not make this campaign's missing period authoritative.
      if(Array.isArray(campaign.datas_coleta)&&!campaign.datas_coleta.some(value=>manifestDate(value)===date))continue;
      dates.add(date);
      const observed=metrics.presente!==false,retained=period==='d0'&&metrics.retida_no_dia===true,present=observed||retained,currency=String(manifestValue(metrics.moeda)||'').trim().toUpperCase(),factor=currency==='USD'&&numeric(exchangeRate)>0?Number(exchangeRate):1;
      let investment=manifestField(metrics.custo_total),costCurrency=currency;
      if(period==='d0'){
        const cost=campaign.custo_D_zero,rawCost=manifestField(cost?.custo_total_destino_totais_coluna_M);
        if(cost?.presente!==false&&rawCost!=null){investment=rawCost;costCurrency=String(manifestValue(cost.moeda)||currency).trim().toUpperCase()}
      }
      const costFactor=costCurrency==='USD'&&numeric(exchangeRate)>0?Number(exchangeRate):1;
      const commission=manifestField(metrics.valor_conversao)??manifestField(metrics.comissao_recebida);
      rows.push({campaignName:String(campaign.nome_campanha_exato||''),...(Array.isArray(campaign.datas_coleta)?{scopeDates:[...campaign.datas_coleta]}:{}),period,date,present,observed,retained,captureScope:campaign.captura_D_zero_escopo||null,captureComplete:campaign.captura_D_zero_completa??null,investment:!present||investment==null?null:investment*costFactor,impressions:present?manifestField(metrics.impressoes):null,clicks:present?manifestField(metrics.cliques_google):null,conversions:present?manifestField(metrics.conversoes):null,commission:!present||commission==null?null:commission*factor});
    }
    const rowsByCampaignDate=new Map();for(const row of rows){const key=`${row.campaignName.toLocaleLowerCase('pt-BR')}|${row.date}`,previous=rowsByCampaignDate.get(key);if(!previous||row.period==='d1')rowsByCampaignDate.set(key,row)}
    return{dates:[...dates].sort(),rows:[...rowsByCampaignDate.values()].sort((a,b)=>a.date.localeCompare(b.date))};
  }
  function replaceAuthoritativeDates(history,snapshots=[],authoritativeDates=[]){
    const fields=['investment','impressions','clicks','conversions','commission'],source=history||{},total={};for(const field of fields)total[field]=numeric(source[field]);
    const scoped=snapshots.find(row=>Array.isArray(row.scopeDates)),dates=[...new Set(scoped?scoped.scopeDates:authoritativeDates||[])],rowsByDate=new Map();for(const row of snapshots||[]){if(!row?.date)continue;const previous=rowsByDate.get(row.date);if(!previous||row.period==='d1')rowsByDate.set(row.date,row)}
    const adjustedObserved={};for(const field of fields){let observed=Math.max(0,Number(source.observed?.[field])||0);for(const date of dates){const previous=numeric(source.byDate?.[date]?.[field]),snapshot=rowsByDate.get(date),next=snapshot?.present?numeric(snapshot[field]):null;if(previous!=null||next!=null){total[field]=(total[field]??0)-(previous??0)+(next??0);observed+=Number(next!=null)-Number(previous!=null)}}adjustedObserved[field]=observed;total[field]=observed>0?total[field]:null}
    return{...total,observed:adjustedObserved};
  }
  function resolveD0Totals(direct,dailyRow,date){
    const {present=true,...observed}=direct||{};
    const result={...observed,date};
    if(present===false){for(const field of ['investment','impressions','clicks','conversions','commission'])result[field]=null;return result}
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
    return[['date','Data'],['campaign','Campanha'],['zeroDays','Dias sem impressões'],['current',`Investimento ${totalLabel}`],['imp',`Impressões ${totalLabel}`],['clicks',`Cliques ${totalLabel}`],['conv',`Conversões ${totalLabel}`],['roi','ROI atual'],['saleRoiFirst','ROI na 1ª venda'],['saleRoiSecond','ROI na 2ª venda'],['profit',`Lucro ${totalLabel} (R$)`],['account','Conta'],['limit','Limite de teste'],['remaining','Valor restante'],['status','Situação']];
  }
  const columnWidths=Object.freeze({date:52,campaign:250,zeroDays:96,current:108,imp:96,clicks:76,conv:96,roi:72,saleRoiFirst:96,saleRoiSecond:96,profit:110,account:110,limit:130,remaining:106,status:82});
  function visibleColumns(columns,selected){
    return Array.isArray(selected)?columns.filter(([key])=>key==='campaign'||selected.includes(key)):columns;
  }
  function parseMinimumRoi(value){
    const text=String(value??'').trim();
    if(!/^-?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text))throw new Error('Informe somente um número para o ROI mínimo, sem o símbolo %.');
    const result=Number(text.replace(',','.'));
    if(!Number.isFinite(result)||result<=-100)throw new Error('O ROI mínimo deve ser maior que -100%.');
    return result;
  }
  function parseTestLimit(value){
    const text=String(value??'').trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
    let normalized=text;
    if(/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text))normalized=text.replaceAll('.','').replace(',','.');
    else if(/^(?:\d+(?:,\d+)?|,\d+)$/.test(text))normalized=text.replace(',','.').replace(/^\./,'0.');
    else if(/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text))normalized=text.replace(/^\./,'0.');
    else throw new Error('Informe um limite de teste válido em reais, maior que zero.');
    const result=Number(normalized);
    if(!Number.isFinite(result)||result<=0)throw new Error('O limite de teste deve ser maior que zero.');
    return result;
  }
  function testLimitForRoi(totalRevenue,minimumRoi){
    const revenue=numeric(totalRevenue),roi=parseMinimumRoi(minimumRoi);
    if(revenue==null||revenue<0)throw new Error('Não há receita válida para calcular o limite de teste.');
    return money(revenue/(1+roi/100));
  }
  function roiForTestLimit(totalRevenue,testLimit){
    const revenue=numeric(totalRevenue),limit=parseTestLimit(testLimit);
    if(revenue==null||revenue<=0)throw new Error('É necessária uma receita positiva para calcular o ROI pelo limite.');
    const exact=(revenue/limit-1)*100;
    for(let decimals=2;decimals<=10;decimals++){
      const factor=10**decimals,candidate=Math.round(exact*factor)/factor;
      if(candidate>-100&&testLimitForRoi(revenue,candidate)===limit)return candidate;
    }
    return exact;
  }
  function deriveTestBudget({commission,commissionCurrency,exchangeRate,conversions,sales,revenue,investment,minimumRoiOverride}={}){
    const payout=numeric(commission),rate=numeric(exchangeRate),conversionCount=numeric(conversions),manualSaleCount=numeric(sales),actualRevenue=numeric(revenue),spent=numeric(investment);
    if(conversionCount==null&&!(manualSaleCount>0))return null;
    const saleCount=Math.max(0,conversionCount??0,manualSaleCount??0);
    let payoutBrl=null;
    if(payout!=null&&payout>=0){
      if(commissionCurrency==='BRL')payoutBrl=payout;
      else if(commissionCurrency==='USD'&&rate!=null&&rate>0)payoutBrl=payout*rate;
    }
    const defaultMinimumRoi=saleCount===0?0:saleCount===1?10:saleCount===2?20:30,override=numeric(minimumRoiOverride),minimumRoi=override!=null&&override>-100?override:defaultMinimumRoi;
    const totalRevenue=saleCount===0?payoutBrl:actualRevenue??(payoutBrl==null?null:payoutBrl*saleCount);
    let limit;
    if(saleCount===0){
      if(payoutBrl==null||payoutBrl<=0)return null;
      limit=payoutBrl;
    }else{
      if(totalRevenue==null||totalRevenue<0)return null;
      limit=totalRevenue/(1+minimumRoi/100);
    }
    limit=money(limit);
    return{limit,remaining:spent==null?null:money(limit-spent),minimumRoi,salesCount:saleCount,revenue:totalRevenue};
  }
  function sortRows(input,state,sortCell){const rows=[...(input||[])];
      const values={date:r=>r.identity.dateSort,campaign:r=>r.identity.name.toLocaleLowerCase('pt-BR'),zeroDays:r=>r.zeroDays,status:r=>r.c._status==='pausada'?'pausada':r.numberReuse?'renumerar':r.rejected?'reprovada':r.c._movement==='reativada'?'reativada':'ativa',current:r=>r.totals?.investment??null,imp:r=>r.totals?.impressions??null,clicks:r=>r.totals?.clicks??null,conv:r=>r.totals?.conversions??null,roi:r=>r.roi,saleRoiFirst:r=>r.saleHistory?.[0]?.snapshot?.roi_percent??null,saleRoiSecond:r=>r.saleHistory?.[1]?.snapshot?.roi_percent??null,profit:r=>r.profit,account:r=>r.account,limit:r=>sortCell(r.testLimit),remaining:r=>sortCell(r.testRemaining)};
       rows.sort((a,b)=>{const av=values[state.sortKey](a),bv=values[state.sortKey](b);if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;const result=typeof av==='string'?av.localeCompare(bv,'pt-BR',{numeric:true,sensitivity:'base'}):av-bv;return state.sortDir==='asc'?result:-result});
    return rows;
  }
  function rowVisible(row,filter,referenceDate){const paused=row.c._status==='pausada',pausedAt=row.pausedAt||'',cutoff=new Date(`${referenceDate}T00:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-6);const recentPaused=paused&&pausedAt>=cutoff.toISOString().slice(0,10);return !(filter==='active'&&paused||filter==='paused'&&!paused||filter==='paused7'&&!recentPaused)}
  root.OverviewDomain=Object.freeze({sortRows,rowVisible,deriveTestBudget,parseMinimumRoi,parseTestLimit,testLimitForRoi,roiForTestLimit,sumObservedMetric,sumObservedProfit,resolveD0Totals,resolveD1Totals,profitForTotals,previousIsoDate,authoritativeMccSnapshots,replaceAuthoritativeDates,totalsColumns,columnWidths,visibleColumns});
})(typeof window==='object'?window:globalThis);
