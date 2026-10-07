(function(root){
  function numeric(value){if(value==null||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null}
  function money(value){return Math.round(value*100+Math.sign(value)*1e-8)/100}
  function manifestMccCoverage(base,manifest,dates={}){
    // Manager IDs are distinct from client accounts. Only exact period/date evidence counts.
    const managerId=value=>{const digits=String(value??'').trim().replace(/-/g,'');return /^\d{10}$/.test(digits)?digits:null},known=new Set(),received={d1:new Set(),d0:new Set()},periodDates={d1:manifestDate(dates.d1),d0:manifestDate(dates.d0)};
    const remember=value=>{const id=managerId(value);if(id)known.add(id);return id};
    const mark=(value,period,date)=>{const id=remember(value);if(id&&periodDates[period]&&manifestDate(date)===periodDates[period])received[period].add(id)};
    for(const manager of base?.mccs||[])remember(manager.id);
    const campaignsById=new Map();for(const campaign of base?.campanhas||[]){remember(campaign.mcc_id);campaignsById.set(campaign.id,campaign)}
    const temporal=manifest?.separacao_temporal||{},owner=remember(manifest?.identificacao_mcc?.id);
    for(const [period,role,field] of [['d1','D_menos_1','metricas_D_menos_1'],['d0','D_zero','metricas_D_zero']]){
      // Top-level dates belong to the incoming manager, not all retained managers.
      for(const date of temporal[role]?.datas_detectadas||[])mark(owner,period,date);
      for(const campaign of manifest?.campanhas||[]){
        const id=remember(campaign.mcc_id)||(manifest?.escopo_contas?.consolidado?null:owner),metrics=campaign[field];
        if(!metrics||metrics.presente===false)continue;
        const date=manifestDate(metrics.data,temporal[role]?.datas_detectadas?.[0]);
        if(Array.isArray(campaign.datas_coleta)&&!campaign.datas_coleta.some(value=>manifestDate(value)===date))continue;
        if(metrics.presente===true||['impressoes','cliques_google','custo_total','conversoes'].some(key=>manifestField(metrics[key])!=null))mark(id,period,date);
      }
    }
    for(const [id,capture] of Object.entries(manifest?.cobertura_D_zero_por_mcc||{}))mark(id,'d0',capture?.data);
    // Stored D−1 uploads remain provable after a D0-only update of the same manager.
    for(const row of base?.diario||[]){
      if(!row.fontes?.includes('manifesto'))continue;
      for(const period of ['d1','d0'])if(row.periodos?.includes(period)&&row.data===periodDates[period])mark(campaignsById.get(row.campanha_id)?.mcc_id,period,row.data);
    }
    const expectedCount=Math.max(2,known.size),result={};
    for(const period of ['d1','d0'])result[period]={date:periodDates[period],receivedCount:received[period].size,expectedCount,complete:Boolean(periodDates[period]&&received[period].size===expectedCount)};
    return result;
  }
  function manifestCaptureInfo(manifest){
    const captures=[manifest?.captura_D_zero?.capturada_em,manifest?.captura_D_menos_1?.capturada_em].filter(value=>typeof value==='string'&&value.trim()&&Number.isFinite(Date.parse(value)));
    if(captures.length)return{timestamp:captures.reduce((latest,value)=>Date.parse(value)>Date.parse(latest)?value:latest),source:'capture'};
    const generated=manifest?.gerado_em_utc;
    return typeof generated==='string'&&generated.trim()&&Number.isFinite(Date.parse(generated))?{timestamp:generated,source:'generated'}:{timestamp:null,source:null};
  }
  function latestMccImportUpdates(managers=[],coverage={}){
    const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR'),managerId=value=>String(value||'').replace(/\D/g,''),captures=new Map(Object.entries(coverage||{}).map(([id,item])=>[managerId(id),item]));
    const resolve=(label,pattern)=>{
      const matches=(Array.isArray(managers)?managers:[]).filter(manager=>[manager?.nome,...(Array.isArray(manager?.nomes_anteriores)?manager.nomes_anteriores:[])].some(name=>pattern.test(normalized(name)))).map(manager=>{
        const imported=manager?.ultima_importacao_em,captured=captures.get(managerId(manager?.id))?.capturada_em,valid=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null,timestamp=valid(imported)||valid(captured);
        return{timestamp,source:valid(imported)?'import':timestamp?'capture':null};
      }).sort((a,b)=>(Date.parse(b.timestamp||0)||0)-(Date.parse(a.timestamp||0)||0));
      return{label,...(matches[0]||{timestamp:null,source:null})};
    };
    return{ecom:resolve('MCC Ecom',/\be[\s._-]*com(?:merce)?\b/),nutra:resolve('MCC Nutra',/\bnutra\b/)};
  }
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
    return[['date','Data'],['campaign','Campanha'],['zeroDays','Dias sem impressões'],['current',`Investimento ${totalLabel}`],['imp',`Impressões ${totalLabel}`],['clicks',`Cliques ${totalLabel}`],['conv',`Conversões ${totalLabel}`],['roi','ROI atual'],['saleRoiFirst','ROI 1ª venda'],['saleRoiSecond','ROI 2ª venda'],['profit',`Lucro ${totalLabel} (R$)`],['account','Conta'],['limit','Limite de teste'],['remaining','Valor restante'],['status','Situação']];
  }
  const columnWidths=Object.freeze({date:52,campaign:330,zeroDays:96,current:108,imp:96,clicks:76,conv:96,roi:72,saleRoiFirst:96,saleRoiSecond:96,profit:110,account:100,limit:140,remaining:102,status:82});
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
  const defaultTestLimitSettings=Object.freeze({cpaMinimumPercent:90,commissionPercent:50,roiBySales:Object.freeze({1:10,2:20,3:30,4:30})});
  function testLimitSettings(value={}){
    const settings=value&&typeof value==='object'?value:{},roi=value.roiBySales&&typeof value.roiBySales==='object'?value.roiBySales:{};
    const roiBySales={};
    for(let sales=1;sales<=4;sales++){const minimum=numeric(roi[sales]);roiBySales[sales]=minimum!=null&&minimum>-100?minimum:defaultTestLimitSettings.roiBySales[sales]}
    const cpaMinimumPercent=numeric(settings.cpaMinimumPercent),commissionPercent=numeric(settings.commissionPercent);
    return{cpaMinimumPercent:cpaMinimumPercent>0?cpaMinimumPercent:defaultTestLimitSettings.cpaMinimumPercent,commissionPercent:commissionPercent>0?commissionPercent:defaultTestLimitSettings.commissionPercent,roiBySales};
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
  function parseCommissionTestPercent(value){const percent=parseMinimumRoi(value);if(percent<=0)throw new Error('O percentual da comissão destinado ao teste deve ser maior que zero.');return percent}
  function testLimitForCommission(commissionBrl,percent){const commission=numeric(commissionBrl);if(!(commission>0))throw new Error('Não há comissão válida para calcular o limite de teste.');return money(commission*parseCommissionTestPercent(percent)/100)}
  function percentForCommissionLimit(commissionBrl,value){const commission=numeric(commissionBrl),limit=parseTestLimit(value);if(!(commission>0))throw new Error('Não há comissão válida para calcular o percentual.');const exact=limit/commission*100;for(let decimals=2;decimals<=10;decimals++){const factor=10**decimals,candidate=Math.round(exact*factor)/factor;if(candidate>0&&testLimitForCommission(commission,candidate)===money(limit))return candidate}return parseCommissionTestPercent(exact)}
  function parseRemainingAlert(value){const text=String(value??'').trim();if(/^(?:0+(?:[.,]0+)?|R\$\s*0+(?:[.,]0+)?)$/.test(text))return 0;return money(parseTestLimit(value))}
  function remainingAlertThreshold(value){const threshold=numeric(value);return threshold!=null&&threshold>=0?threshold:140}
  function remainingWarningThreshold(value){const threshold=numeric(value);return threshold!=null&&threshold>=0?threshold:null}
  function remainingAlertTone(value,redMinimum,yellowMinimum){const amount=numeric(value);if(amount==null)return'';if(amount<remainingAlertThreshold(redMinimum))return'negative';const warning=remainingWarningThreshold(yellowMinimum);return warning!=null&&amount<warning?'remaining-warning':''}
  function deriveTestBudget({commission,commissionCurrency,exchangeRate,conversions,sales,revenue,investment,minimumRoiOverride,cpaPercent,commissionTestPercentOverride,testLimitSettings:settingsInput}={}){
    const payout=numeric(commission),rate=numeric(exchangeRate),conversionCount=numeric(conversions),manualSaleCount=numeric(sales),actualRevenue=numeric(revenue),spent=numeric(investment);
    if(conversionCount==null&&!(manualSaleCount>0))return null;
    const settings=testLimitSettings(settingsInput);
    const saleCount=Math.max(0,conversionCount??0,manualSaleCount??0);
    let payoutBrl=null;
    if(payout!=null&&payout>=0){
      if(commissionCurrency==='BRL')payoutBrl=payout;
      else if(commissionCurrency==='USD'&&rate!=null&&rate>0)payoutBrl=payout*rate;
    }
    const roiSalesBucket=saleCount===1?1:saleCount===2?2:saleCount===3?3:4,defaultMinimumRoi=saleCount===0?0:settings.roiBySales[roiSalesBucket],override=numeric(minimumRoiOverride),minimumRoi=override!=null&&override>-100?override:defaultMinimumRoi;
    const totalRevenue=saleCount===0?payoutBrl:actualRevenue??(payoutBrl==null?null:payoutBrl*saleCount);
    let limit;
    if(saleCount===0){
      if(payoutBrl==null||payoutBrl<=0)return null;
      limit=payoutBrl;
      if(numeric(cpaPercent)>=settings.cpaMinimumPercent){const override=numeric(commissionTestPercentOverride),commissionTestPercent=override>0?override:settings.commissionPercent;limit=testLimitForCommission(payoutBrl,commissionTestPercent);return{limit,remaining:spent==null?null:money(limit-spent),minimumRoi,salesCount:saleCount,revenue:totalRevenue,cpaPercent:numeric(cpaPercent),cpaMinimumPercent:settings.cpaMinimumPercent,commissionTestPercent,commissionBrl:payoutBrl}}
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
  function rowVisible(row,filter,referenceDate){const paused=row.c._status==='pausada',historical=row.c._status==='historico',pausedAt=row.pausedAt||'',cutoff=new Date(`${referenceDate}T00:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-6);const recentPaused=paused&&pausedAt>=cutoff.toISOString().slice(0,10);return !(filter==='active'&&(paused||historical)||filter==='history'&&!paused&&!historical||filter==='paused'&&!paused||filter==='paused7'&&!recentPaused)}
  // Navigation-only entries preserve the old History access without inventing MCC metrics.
  function historyNavigationRows(entries=[],operationalRows=[]){return entries.filter(entry=>entry.source==='legacy'||!operationalRows.some(row=>entry.id?row.campaignId===entry.id:row.c?.nome_campanha_exato===entry.name)).map(entry=>({c:{nome_campanha_exato:entry.exactName||entry.name,_status:'historico'},identity:{name:entry.label||entry.name,dateLabel:'—',dateSort:null},campaignId:entry.id||null,diaryName:entry.name,diarySource:entry.source||'workbook',totals:null,d0Totals:{},zeroDays:null,roi:null,profit:null,historyEntry:true}))}
  function searchRows(rows,query){const term=String(query??'').trim().toLocaleLowerCase('pt-BR');return (rows||[]).filter(row=>!term||`${row.c?.nome_campanha_exato||''} ${row.identity?.name||''}`.toLocaleLowerCase('pt-BR').includes(term))}
  function pausedCampaignNamesOnDate(campaigns,date){
    const target=String(date??'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(target))return[];
    return (Array.isArray(campaigns)?campaigns:[])
      .filter(campaign=>campaign?.status==='pausada'&&String(campaign?.pausada_em??'').slice(0,10)===target)
      .map(campaign=>String(campaign.nome_mcc||campaign.nome_exibicao||'').trim())
      .filter(Boolean)
      .sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));
  }
  root.OverviewDomain=Object.freeze({manifestMccCoverage,manifestCaptureInfo,latestMccImportUpdates,sortRows,searchRows,rowVisible,historyNavigationRows,pausedCampaignNamesOnDate,deriveTestBudget,parseMinimumRoi,parseTestLimit,testLimitForRoi,roiForTestLimit,parseCommissionTestPercent,testLimitForCommission,percentForCommissionLimit,parseRemainingAlert,remainingAlertThreshold,remainingWarningThreshold,remainingAlertTone,sumObservedMetric,sumObservedProfit,resolveD0Totals,resolveD1Totals,profitForTotals,previousIsoDate,authoritativeMccSnapshots,replaceAuthoritativeDates,totalsColumns,columnWidths,visibleColumns,defaultTestLimitSettings,testLimitSettings});
})(typeof window==='object'?window:globalThis);
