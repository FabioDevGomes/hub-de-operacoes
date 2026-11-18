(function(root){
  const campaignNameCollator=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'}),searchTextCache=new WeakMap();
  function numeric(value){if(value==null||value==='')return null;const number=Number(value);return Number.isFinite(number)?number:null}
  function money(value){return Math.round(value*100+Math.sign(value)*1e-8)/100}
  function manifestPeriodDates(base,manifest){
    const temporal=manifest?.separacao_temporal||{},reportedD0=temporal.D_zero?.estado==='nao_fornecido'?'':manifestDate(temporal.D_zero?.datas_detectadas?.[0]),reportedD1=temporal.D_menos_1?.estado==='nao_fornecido'?'':manifestDate(temporal.D_menos_1?.datas_detectadas?.[0]),candidates=[];
    // Resolve an omitted D0 only from stored report dates, never from the upload clock.
    for(const capture of Object.values(manifest?.cobertura_D_zero_por_mcc||{}))candidates.push(manifestDate(capture?.data));
    for(const campaign of manifest?.campanhas||[]){const date=manifestDate(campaign.metricas_D_zero?.data);if(!Array.isArray(campaign.datas_coleta)||campaign.datas_coleta.includes(date))candidates.push(date)}
    const managers=new Set((base?.campanhas||[]).filter(campaign=>campaign.mcc_id).map(campaign=>campaign.id));
    for(const row of base?.diario||[])if(managers.has(row.campanha_id)&&row.fontes?.includes('manifesto')&&row.periodos?.includes('d0'))candidates.push(manifestDate(row.data));
    const d0=reportedD0||candidates.filter(date=>date&&(!reportedD1||previousIsoDate(date)===reportedD1)).sort().at(-1)||'';
    return{d1:reportedD1||previousIsoDate(d0),d0};
  }
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
      if(temporal[role]?.estado!=='nao_fornecido')for(const date of temporal[role]?.datas_detectadas||[])mark(owner,period,date);
      for(const campaign of manifest?.campanhas||[]){
        const id=remember(campaign.mcc_id)||(manifest?.escopo_contas?.consolidado?null:owner),metrics=campaign[field];
        if(!metrics||metrics.presente===false)continue;
        const date=manifestDate(metrics.data,temporal[role]?.datas_detectadas?.[0]);
        if(Array.isArray(campaign.datas_coleta)&&!campaign.datas_coleta.some(value=>manifestDate(value)===date))continue;
        if(metrics.presente===true||['impressoes','cliques_google','custo_total','conversoes'].some(key=>manifestField(metrics[key])!=null))mark(id,period,date);
      }
    }
    for(const [period,field] of [['d0','cobertura_D_zero_por_mcc'],['d1','cobertura_D_menos_1_por_mcc']])for(const [id,capture] of Object.entries(manifest?.[field]||{}))mark(id,period,capture?.data);
    // Stored D−1 uploads remain provable after a D0-only update of the same manager.
    for(const row of base?.diario||[]){
      if(!row.fontes?.includes('manifesto'))continue;
      for(const period of ['d1','d0'])if(row.periodos?.includes(period)&&row.data===periodDates[period])mark(campaignsById.get(row.campanha_id)?.mcc_id,period,row.data);
    }
    const expectedCount=known.size,result={};
    for(const period of ['d1','d0'])result[period]={date:periodDates[period],receivedCount:received[period].size,expectedCount,complete:Boolean(periodDates[period]&&expectedCount>0&&received[period].size===expectedCount),managers:[...known].map(id=>({id,name:(base?.mccs||[]).find(manager=>managerId(manager.id)===id)?.nome||id,received:received[period].has(id)}))};
    return result;
  }
  function mccCollectionCoverage(base,manifest,directory,dates={}){
    const manifestCoverage=manifestMccCoverage(base,manifest,dates),managerId=value=>{const digits=String(value??'').trim().replace(/\D/g,'');return /^\d{10}$/.test(digits)?digits:null},directoryManagers=new Map(),directoryAccounts=new Map(),seenAccounts=new Set();
    let directoryValid=directory?.schemaVersion===1&&Array.isArray(directory.managers)&&Array.isArray(directory.accounts);
    if(directoryValid){
      for(const manager of directory.managers){const id=manager?.customerId==null?null:managerId(manager.customerId);if(manager?.customerId!=null&&!id){directoryValid=false;break}if(id)directoryManagers.set(id,String(manager.name||id))}
      if(directoryValid)for(const account of directory.accounts){const customerId=managerId(account?.customerId),manager=account?.managerCustomerId==null?null:managerId(account.managerCustomerId),key=`${manager||'direct'}|${customerId||''}`;if(!customerId||account?.managerCustomerId!=null&&!manager||manager&&!directoryManagers.has(manager)||seenAccounts.has(key)){directoryValid=false;break}seenAccounts.add(key);if(!manager)continue;const accounts=directoryAccounts.get(manager)||new Set();accounts.add(customerId);directoryAccounts.set(manager,accounts)}
    }
    const directoryHasWarnings=Number(directory?.warningCount)!==0,known=new Map();
    for(const manager of manifestCoverage.d0?.managers||[])known.set(manager.id,manager.name);
    for(const manager of manifestCoverage.d1?.managers||[])if(!known.has(manager.id))known.set(manager.id,manager.name);
    for(const [id,name] of directoryManagers)if(!known.has(id))known.set(id,name);
    const apiCaptures=base?.google_ads_api_daily_captures||[],periodDates={d1:manifestCoverage.d1?.date||'',d0:manifestCoverage.d0?.date||''},captureAccounts={d1:new Map(),d0:new Map()};
    for(const capture of apiCaptures){
      if(Number(capture?.captureSchemaVersion)<3||capture?.queryComplete!==true||!['rows_returned','completed_no_rows'].includes(capture?.coverageStatus))continue;
      const manager=managerId(capture.managerCustomerId),customer=managerId(capture.customerId);if(!manager||!customer)continue;
      for(const period of ['d1','d0']){
        const date=periodDates[period];if(!date||capture.date!==date)continue;
        const validBusinessDay=period==='d1'?capture.businessTimeZone==='America/Sao_Paulo'&&capture.businessDate===date:!capture.businessTimeZone||(capture.businessTimeZone==='America/Sao_Paulo'&&capture.businessDate===date);
        if(!validBusinessDay)continue;
        const accounts=captureAccounts[period].get(manager)||new Set();accounts.add(customer);captureAccounts[period].set(manager,accounts);
      }
    }
    const result={};
    for(const period of ['d1','d0']){
      const manifestManagers=new Map((manifestCoverage[period]?.managers||[]).map(manager=>[manager.id,manager])),apiSeen=captureAccounts[period],managers=[...known].map(([id,fallbackName])=>{
        const manifestReceived=manifestManagers.get(id)?.received===true,expectedAccounts=directoryAccounts.get(id)||new Set(),apiCapturedCount=[...expectedAccounts].filter(customer=>apiSeen.get(id)?.has(customer)).length,apiReceived=directoryValid&&!directoryHasWarnings&&expectedAccounts.size>0&&apiCapturedCount===expectedAccounts.size,received=manifestReceived||apiReceived;
        return{id,name:manifestManagers.get(id)?.name||fallbackName,received,manifestReceived,apiReceived,apiCapturedCount,apiExpectedCount:expectedAccounts.size,directoryHasWarnings,source:manifestReceived&&apiReceived?'Manifesto MCC + API':manifestReceived?'Manifesto MCC':apiReceived?'Google Ads API':null};
      });
      const receivedCount=managers.filter(manager=>manager.received).length,expectedCount=managers.length;
      result[period]={date:periodDates[period],receivedCount,expectedCount,complete:Boolean(periodDates[period]&&expectedCount>0&&receivedCount===expectedCount),managers};
    }
    return result;
  }
  function manifestCaptureInfo(manifest){
    const captures=[manifest?.captura_D_zero?.capturada_em,manifest?.captura_D_menos_1?.capturada_em].filter(value=>typeof value==='string'&&value.trim()&&Number.isFinite(Date.parse(value)));
    if(captures.length)return{timestamp:captures.reduce((latest,value)=>Date.parse(value)>Date.parse(latest)?value:latest),source:'capture'};
    const generated=manifest?.gerado_em_utc;
    return typeof generated==='string'&&generated.trim()&&Number.isFinite(Date.parse(generated))?{timestamp:generated,source:'generated'}:{timestamp:null,source:null};
  }
  function latestMccImportUpdates(managers=[],coverage={}){
    const managerId=value=>{const digits=String(value??'').replace(/\D/g,'');return /^\d{10}$/.test(digits)?digits:null},valid=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null,captures=new Map(Object.entries(coverage||{}).map(([id,item])=>[managerId(id),item]));
    return[...(Array.isArray(managers)?managers:[])].map(manager=>{
      const id=managerId(manager?.id);if(!id)return null;
      const imported=valid(manager?.ultima_importacao_em),captured=valid(captures.get(id)?.capturada_em),timestamp=imported||captured;
      return{id:String(manager.id).trim(),name:String(manager?.nome||'').trim()||`MCC ${id}`,timestamp,source:imported?'import':captured?'capture':null};
    }).filter(Boolean).sort((a,b)=>managerId(a.id).localeCompare(managerId(b.id),'pt-BR',{numeric:true}));
  }
  function latestApiMccUpdates(managers=[],dailyCaptures=[]){
    const managerId=value=>{const digits=String(value??'').replace(/\D/g,'');return /^\d{10}$/.test(digits)?digits:null},latest=new Map();
    for(const capture of Array.isArray(dailyCaptures)?dailyCaptures:[]){
      if(Number(capture?.captureSchemaVersion)<3||capture?.queryComplete!==true||!['rows_returned','completed_no_rows'].includes(capture?.coverageStatus))continue;
      const id=managerId(capture?.managerCustomerId),customer=managerId(capture?.customerId),timestamp=typeof capture?.capturedAtUtc==='string'&&Number.isFinite(Date.parse(capture.capturedAtUtc))?capture.capturedAtUtc:null;
      if(!id||!customer||!timestamp)continue;
      const previous=latest.get(id);if(!previous||Date.parse(timestamp)>Date.parse(previous.timestamp))latest.set(id,{timestamp,name:String(capture?.managerName||'').trim()});
    }
    return(Array.isArray(managers)?managers:[]).map(manager=>{
      const id=managerId(manager?.id);if(!id)return null;
      const capture=latest.get(id);
      return{id:String(manager.id).trim(),name:String(manager?.nome||capture?.name||'').trim()||`MCC ${id}`,timestamp:capture?.timestamp||null,source:capture?'api':null};
    }).filter(Boolean).sort((a,b)=>managerId(a.id).localeCompare(managerId(b.id),'pt-BR',{numeric:true}));
  }
  function sumObservedMetric(rows,field){const entries=Array.isArray(rows)?rows:[];let total=0,observedCount=0;for(const row of entries){const value=numeric(row?.[field]);if(value==null)continue;total+=value;observedCount++}return{value:observedCount?total:null,observedCount,totalCount:entries.length}}
  // Sum the table's existing projections, not cards, commission or hidden campaigns.
  function overviewTableTotals(rows){
    const entries=(Array.isArray(rows)?rows:[]).map(row=>({...row.totals,profit:row.profit}));
    const billedEntries=(Array.isArray(rows)?rows:[]).map(row=>row?.billedRevenue).filter(item=>item?.applicable),billedObserved=billedEntries.filter(item=>typeof item.amount==='number'&&Number.isFinite(item.amount)),billedComplete=billedObserved.length===billedEntries.length;
    const billedTotal={value:billedComplete&&billedEntries.length?money(billedObserved.reduce((sum,item)=>sum+item.amount,0)):null,observedCount:billedObserved.length,totalCount:billedEntries.length,complete:billedComplete};
    return Object.fromEntries([...['investment','impressions','clicks','conversions','profit'].map(field=>{
      const total=sumObservedMetric(entries,field);
      return[field,{...total,value:total.value==null?null:['investment','profit'].includes(field)?money(total.value):total.value}];
    }),['billedRevenue',billedTotal]]);
  }
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
      const observed=metrics.presente!==false,retained=period==='d0'&&metrics.retida_no_dia===true,present=observed||retained,currency=String(manifestValue(metrics.moeda)||'').trim().toUpperCase(),periodRate=numeric(metrics.exchange_rate_usd_brl)??numeric(exchangeRate),factor=currency==='USD'&&periodRate>0?periodRate:1;
      let investment=manifestField(metrics.custo_total),costCurrency=currency;
      if(period==='d0'){
        const cost=campaign.custo_D_zero,rawCost=manifestField(cost?.custo_total_destino_totais_coluna_M);
        if(cost?.presente!==false&&rawCost!=null){investment=rawCost;costCurrency=String(manifestValue(cost.moeda)||currency).trim().toUpperCase()}
      }
      const costRate=period==='d0'?(numeric(campaign.custo_D_zero?.exchange_rate_usd_brl)??periodRate):periodRate,costFactor=costCurrency==='USD'&&costRate>0?costRate:1;
      const commission=manifestField(metrics.valor_conversao)??manifestField(metrics.comissao_recebida);
      rows.push({campaignName:String(campaign.nome_campanha_exato||''),...(Array.isArray(campaign.datas_coleta)?{scopeDates:[...campaign.datas_coleta]}:{}),period,date,present,observed,retained,captureScope:campaign.captura_D_zero_escopo||null,captureComplete:campaign.captura_D_zero_completa??null,exchangeRate:periodRate,investment:!present||investment==null?null:investment*costFactor,impressions:present?manifestField(metrics.impressoes):null,clicks:present?manifestField(metrics.cliques_google):null,conversions:present?manifestField(metrics.conversoes):null,commission:!present||commission==null?null:commission*factor});
    }
    const rowsByCampaignDate=new Map();for(const row of rows){const key=`${row.campaignName.toLocaleLowerCase('pt-BR')}|${row.date}`,previous=rowsByCampaignDate.get(key);if(!previous||row.period==='d1')rowsByCampaignDate.set(key,row)}
    return{dates:[...dates].sort(),rows:[...rowsByCampaignDate.values()].sort((a,b)=>a.date.localeCompare(b.date))};
  }
  function replaceAuthoritativeDates(history,snapshots=[],authoritativeDates=[],preserveFieldsByDate={}){
    const fields=['investment','impressions','clicks','conversions','commission'],source=history||{},total={};for(const field of fields)total[field]=numeric(source[field]);
    const scoped=snapshots.find(row=>Array.isArray(row.scopeDates)),dates=[...new Set(scoped?scoped.scopeDates:authoritativeDates||[])],rowsByDate=new Map();for(const row of snapshots||[]){if(!row?.date)continue;const previous=rowsByDate.get(row.date);if(!previous||row.period==='d1')rowsByDate.set(row.date,row)}
    const adjustedObserved={};for(const field of fields){let observed=Math.max(0,Number(source.observed?.[field])||0);for(const date of dates){const previous=numeric(source.byDate?.[date]?.[field]),snapshot=rowsByDate.get(date),preserve=previous!=null&&preserveFieldsByDate?.[date]?.includes(field),next=preserve?previous:snapshot?.present?numeric(snapshot[field]):null;if(previous!=null||next!=null){total[field]=(total[field]??0)-(previous??0)+(next??0);observed+=Number(next!=null)-Number(previous!=null)}}adjustedObserved[field]=observed;total[field]=observed>0?total[field]:null}
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
  function operationalDayTotals(stored,date,dailyByCampaign,isPreviousDay=false){
    const row=stored&&date?dailyByCampaign?.get(stored.id)?.find(item=>item.data===date&&item.fontes?.includes('google_ads_api')):null;
    if(!row)return{investment:null,impressions:null,clicks:null,conversions:null,commission:null,date,fromOperationalCapture:false};
    const read=column=>numeric(row.celulas?.[column]?.value);
    return{investment:read('O'),impressions:read('B'),clicks:read('C'),conversions:read('F'),commission:read('P'),date,fromOperationalCapture:true,...(isPreviousDay?{provisional:row.google_ads_api_sao_paulo_day!==true}:{})};
  }
  // Shared by the live table and the summary computed only during an MCC application.
  function campaignD0Totals(c,{dates,stored,dailyByCampaign,snapshotsByCampaignName,exchangeRate=5.1,useOperationalDate=false}){
    if(useOperationalDate)return operationalDayTotals(stored,dates.d0,dailyByCampaign);
    const valueOf=obj=>obj?.valor??null,m=c.metricas_D_zero||{},periodRate=numeric(m.exchange_rate_usd_brl)??exchangeRate,date=dates.d0||'',dailyRow=stored&&date?dailyByCampaign.get(stored.id)?.find(row=>row.data===date):null,snapshot=snapshotsByCampaignName.get(String(c.nome_campanha_exato||'').toLocaleLowerCase('pt-BR'))?.find(row=>row.period==='d0'&&row.date===date),cost=valueOf(c.custo_D_zero?.custo_total_destino_totais_coluna_M),costRate=numeric(c.custo_D_zero?.exchange_rate_usd_brl)??periodRate,direct={present:m.presente!==false,investment:!c.custo_D_zero||c.custo_D_zero.presente===false||cost==null?null:Number(cost)*(valueOf(c.custo_D_zero.moeda)==='USD'?costRate:1),impressions:valueOf(m.impressoes),clicks:valueOf(m.cliques_google),conversions:valueOf(m.conversoes),commission:valueOf(m.valor_conversao)??valueOf(m.comissao_recebida)};
    if(!date)return resolveD0Totals({present:false},null,date);
    if(!snapshot&&valueOf(m.data)!==date&&(Array.isArray(c.datas_coleta)||m.presente===false||valueOf(m.data))){
      const observed=dailyRow?.fontes?.includes('manifesto')&&dailyRow.periodos?.includes('d0')?dailyRow:null;
      return{...resolveD0Totals({present:!c.datas_coleta?.includes(date),investment:null,impressions:null,clicks:null,conversions:null,commission:null},observed,date),fromStoredCapture:!!observed&&!c.datas_coleta?.includes(date)};
    }
    return snapshot?{investment:snapshot.investment,impressions:snapshot.impressions,clicks:snapshot.clicks,conversions:snapshot.conversions,commission:snapshot.commission,date:snapshot.date}:resolveD0Totals(direct,dailyRow,date);
  }
  function campaignD1Totals(c,history,{dates,snapshotsByCampaignName,latestSnapshots,exchangeRate=5.1,useOperationalDate=false,stored,dailyByCampaign}){
    if(useOperationalDate)return operationalDayTotals(stored,dates.d1,dailyByCampaign,true);
    const valueOf=obj=>obj?.valor??null,name=String(c.nome_campanha_exato||'').toLocaleLowerCase('pt-BR'),snapshot=snapshotsByCampaignName.get(name)?.find(row=>row.period==='d1'&&(!row.scopeDates||row.date===dates.d1));
    if(snapshot)return{investment:snapshot.investment,impressions:snapshot.impressions,clicks:snapshot.clicks,conversions:snapshot.conversions,commission:snapshot.commission,date:snapshot.date};
    const m=c.metricas_D_menos_1||{},periodRate=numeric(m.exchange_rate_usd_brl)??exchangeRate,date=Array.isArray(c.datas_coleta)?dates.d1:valueOf(m.data)||dates.d1,factor=String(valueOf(m.moeda)||'').toUpperCase()==='USD'&&periodRate>0?periodRate:1,rawInvestment=valueOf(m.custo_total),rawCommission=valueOf(m.valor_conversao)??valueOf(m.comissao_recebida),direct={investment:rawInvestment==null?null:Number(rawInvestment)*factor,impressions:valueOf(m.impressoes),clicks:valueOf(m.cliques_google),conversions:valueOf(m.conversoes),commission:rawCommission==null?null:Number(rawCommission)*factor,date},recorded=date?history?.byDate?.[date]:null;
    if(Array.isArray(c.datas_coleta)&&valueOf(m.data)!==date)return resolveD1Totals({investment:null,impressions:null,clicks:null,conversions:null,commission:null,date},recorded);
    return latestSnapshots.dates.includes(date)?direct:resolveD1Totals(direct,recorded);
  }
  function profitForTotals(totals){if(!totals)return null;const investment=numeric(totals.investment),commission=numeric(totals.commission);if(investment==null||commission==null)return null;return money(commission-investment)}
  function mccNameForCampaign(campaign,managers=[]){
    const id=String(campaign?.mcc_id??'').trim();
    if(!id)return null;
    const manager=(Array.isArray(managers)?managers:[]).find(item=>String(item?.id??'').trim()===id);
    return typeof manager?.nome==='string'&&manager.nome.trim()?manager.nome.trim():null;
  }
  function totalsColumns(mode,totalLabel='total'){
    const billedLabel=totalLabel==='D zero'?'D0':totalLabel==='D−1'?'D−1':'total';
    return[['date','Data'],['campaign','Campanha'],['zeroDays','Dias sem impressões'],['current',`Investimento ${totalLabel}`],['billedRevenue',`Faturado ${billedLabel} (R$)`],['imp',`Impressões ${totalLabel}`],['clicks',`Cliques ${totalLabel}`],['firstClickImpressions','Impr. no 1º clique'],['conv',`Conversões ${totalLabel}`],['firstSaleClicks','Cliques na 1ª venda'],['roi','ROI atual'],['saleRoiFirst','ROI 1ª venda'],['saleRoiSecond','ROI 2ª venda'],['profit',`Lucro ${totalLabel} (R$)`],['account','Conta'],['mcc','MCC'],['limit','Limite de teste'],['remaining','Valor restante'],['status','Situação'],['diagnosis','Diagnóstico'],['actions','Ação']];
  }
  const columnWidths=Object.freeze({date:52,campaign:330,zeroDays:96,current:108,billedRevenue:128,imp:96,clicks:76,firstClickImpressions:118,conv:96,firstSaleClicks:126,roi:72,saleRoiFirst:96,saleRoiSecond:96,profit:110,account:100,mcc:124,limit:140,remaining:102,status:82,diagnosis:184,actions:122});
  function visibleColumns(columns,selected){
    return Array.isArray(selected)?columns.filter(([key])=>key==='campaign'||selected.includes(key)):columns;
  }
  function campaignDiagnosis({totals,budget,manualSales=0}={}){
    const impressions=numeric(totals?.impressions),clicks=numeric(totals?.clicks),conversions=numeric(totals?.conversions),investment=numeric(totals?.investment),sales=Math.max(0,numeric(manualSales)||0,conversions||0),base='Classificação informativa sobre os dados consolidados disponíveis no Hub. Conversões do Google Ads podem representar ações diferentes de venda; vendas manuais ainda podem estar provisórias. Esta leitura não confirma atribuição de venda pela GuruMedia à campanha.';
    const result=(key,label,tone,detail)=>({key,label,tone,title:`${detail} ${base}`});
    if(sales>0){
      if(budget?.remaining!=null&&budget.remaining<0)return result('conversion-over-limit','Conversão · acima do limite','warn',`Há ${conversions>0?`${conversions} conversão(ões) registrada(s)`:''}${manualSales>0?`${conversions>0?' e ':''}${manualSales} venda(s) manual(is) no Hub`:''}; o gasto consolidado excede em ${money(Math.abs(budget.remaining))} o limite de teste calculado atualmente.`);
      return result('conversion-recorded','Conversão registrada','positive',`${conversions>0?`${conversions} conversão(ões) constam no consolidado`:''}${manualSales>0?`${conversions>0?' e ':''}${manualSales} venda(s) manual(is) no Hub`:''}.`);
    }
    if(impressions!=null&&clicks!=null&&impressions<clicks)return result('inconsistent-metrics','Leitura inconsistente','warn',`O consolidado mostra ${impressions} impressão(ões) e ${clicks} clique(s); confira as capturas e os períodos usados.`);
    if(clicks>0){
      if(budget?.salesCount===0&&budget.remaining!=null&&budget.remaining<=0)return result('test-limit-reached','Limite de teste atingido','danger',`Há ${clicks} clique(s), nenhuma conversão registrada e o gasto atingiu ou ultrapassou o limite de teste calculado.`);
      return result('clicks-no-conversion','Cliques · sem conversão registrada','info',`Há ${clicks} clique(s) consolidados, mas nenhuma conversão registrada no Hub.`);
    }
    if(impressions>0){
      if(clicks===0)return result('impressions-no-clicks','Impressões · sem cliques','warn',`Há ${impressions} impressão(ões) consolidadas e nenhum clique registrado.`);
      return result('partial-click-data','Impressões · cliques sem leitura','muted',`Há ${impressions} impressão(ões), mas a leitura de cliques não está disponível no consolidado.`);
    }
    if(impressions===0&&clicks===0)return result('no-impressions','Sem impressões observadas','muted','A base consolidada registra zero impressões e zero cliques.');
    if(investment!=null||impressions!=null||clicks!=null||conversions!=null)return result('partial-data','Dados parciais','muted','Há métricas consolidadas, mas elas não permitem classificar entrega ou conversão com segurança.');
    return result('insufficient-data','Sem dados suficientes','muted','Ainda não há métricas consolidadas suficientes para classificar a campanha.');
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
      const values={date:r=>r.identity.dateSort,campaign:r=>r.identity.name,zeroDays:r=>r.zeroDays,status:r=>r.c._status==='pausada'?'pausada':r.numberReuse?'renumerar':r.rejected?'reprovada':r.c._movement==='reativada'?'reativada':'ativa',current:r=>r.totals?.investment??null,billedRevenue:r=>r.billedRevenue?.amount??null,imp:r=>r.totals?.impressions??null,clicks:r=>r.totals?.clicks??null,firstClickImpressions:r=>r.firstClickImpressionObservation?.impressions??null,conv:r=>r.totals?.conversions??null,firstSaleClicks:r=>r.firstSaleClicks??null,roi:r=>r.roi,saleRoiFirst:r=>r.saleHistory?.[0]?.snapshot?.roi_percent??null,saleRoiSecond:r=>r.saleHistory?.[1]?.snapshot?.roi_percent??null,profit:r=>r.profit,account:r=>r.account,mcc:r=>r.mcc,limit:r=>sortCell(r.testLimit),remaining:r=>sortCell(r.testRemaining),diagnosis:r=>r.diagnosis?.label??''};
        rows.sort((a,b)=>{const av=values[state.sortKey](a),bv=values[state.sortKey](b);if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;const result=typeof av==='string'?campaignNameCollator.compare(av,bv):av-bv;return state.sortDir==='asc'?result:-result});
    return rows;
  }
  function firstClickImpressionObservations(snapshots=[]){
    const trustedZeroEvidence=new Set(['complete_sao_paulo_day_query_and_current_enabled_inventory','complete_recent_query_and_prior_campaign_mapping','complete_daily_query_and_current_inventory']),ordered=(Array.isArray(snapshots)?snapshots:[]).map((snapshot,index)=>({snapshot,index,capturedAt:Date.parse(snapshot?.completedAtUtc||'')})).filter(item=>item.snapshot?.periodType==='D0'&&Number.isFinite(item.capturedAt)&&Array.isArray(item.snapshot.accounts)).sort((a,b)=>a.capturedAt-b.capturedAt||a.index-b.index),previousByCampaignDate=new Map(),firstByCampaign=new Map(),positiveSeen=new Set();
    for(const{snapshot,capturedAt}of ordered){
      const capturedAtUtc=new Date(capturedAt).toISOString();
      for(const account of snapshot.accounts){
        const date=String(account?.date||''),customer=String(account?.customerId||'').replace(/\D/g,''),manager=String(account?.managerCustomerId||'').replace(/\D/g,''),timeZone=String(account?.timeZone||'');
        if(account?.queryComplete!==true||account?.scope!=='ALL'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!/^[0-9]{10}$/.test(customer)||manager&&!/^[0-9]{10}$/.test(manager))continue;
        for(const campaign of Array.isArray(account?.campaigns)?account.campaigns:[]){
          const campaignId=String(campaign?.campaignInternalId||''),impressions=numeric(campaign?.impressions),clicks=numeric(campaign?.clicks);
          if(!campaignId||campaign?.mappingStatus!=='mapped'||campaign?.metricsAvailable!==true||impressions==null||impressions<0||clicks==null||clicks<0)continue;
          if(campaign.inferredZero===true&&!trustedZeroEvidence.has(String(campaign.zeroEvidence||'')))continue;
          const identity=[manager||'direct',customer,campaignId,date,timeZone].join('|'),previous=previousByCampaignDate.get(identity);
          if(clicks>0){if(previous?.clicks===0&&!positiveSeen.has(campaignId)&&!firstByCampaign.has(campaignId))firstByCampaign.set(campaignId,{impressions,capturedAtUtc,date,baselineCapturedAtUtc:previous.capturedAtUtc});positiveSeen.add(campaignId)}
          previousByCampaignDate.set(identity,{clicks,capturedAtUtc});
        }
      }
    }
    return firstByCampaign;
  }
  function activeMetricProductCounts(rows=[],field='impressions',minimumValue=1){
    const counts=new Map();
    const threshold=Number.isFinite(Number(minimumValue))?Math.max(0,Number(minimumValue)):1;
    for(const row of Array.isArray(rows)?rows:[]){
      const key=String(row?.productKey??'').trim(),status=row?.filterStatus||row?.c?._status,value=numeric(row?.totals?.[field]);
      if(!key||status!=='ativa'||value==null||value<threshold||value<=0)continue;
      counts.set(key,(counts.get(key)||0)+1);
    }
    return counts;
  }
  const activeImpressionProductCounts=rows=>activeMetricProductCounts(rows,'impressions');
  function activeClickProductGroups(rows=[],minimumClicks=1){
    const groups=new Map(),threshold=Number.isFinite(Number(minimumClicks))?Math.max(1,Number(minimumClicks)):1;
    for(const row of Array.isArray(rows)?rows:[]){
      const key=String(row?.productKey??'').trim(),status=row?.filterStatus||row?.c?._status,value=numeric(row?.consolidatedTotals?.clicks??row?.totals?.clicks);
      if(!key||status!=='ativa'||row?.c?.apiSnapshotOnly===true||value==null||value<threshold)continue;
      const group=groups.get(key)||[];group.push(row);groups.set(key,group);
    }
    return groups;
  }
  function qualifyingActiveClickProductGroups(rows=[],{minimumClicks=1,minimumCampaigns=2}={}){
    const threshold=Number.isInteger(Number(minimumCampaigns))?Math.max(2,Number(minimumCampaigns)):2;
    return new Map([...activeClickProductGroups(rows,minimumClicks)].filter(([,group])=>group.length>=threshold));
  }
  const activeClickProductCounts=(rows,minimumClicks=1)=>new Map([...activeClickProductGroups(rows,minimumClicks)].map(([key,group])=>[key,group.length]));
  const activeD0ImpressionProductCounts=activeImpressionProductCounts;
  function rowVisible(row,filter,referenceDate,{retentionHours=0,now=Date.now()}={}){const status=row?.filterStatus||row?.c?._status||'',paused=status==='pausada',historical=status==='historico',pausedAt=row?.pausedAt||'',automaticPauseAt=Date.parse(row?.autoPauseConfirmedAtUtc||''),elapsedHours=(typeof now==='number'?now:Date.parse(now||''))-automaticPauseAt,validRetentionHours=Number(retentionHours),temporarilyVisible=paused&&Number.isFinite(automaticPauseAt)&&Number.isFinite(elapsedHours)&&Number.isFinite(validRetentionHours)&&validRetentionHours>0&&elapsedHours>=0&&elapsedHours/3600000<validRetentionHours,cutoff=new Date(`${referenceDate}T00:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-6);const recentPaused=paused&&pausedAt>=cutoff.toISOString().slice(0,10);return !(filter==='active'&&(historical||paused&&!temporarilyVisible)||filter==='history'&&!paused&&!historical||filter==='paused'&&!paused||filter==='paused7'&&!recentPaused)}
  // Navigation-only entries preserve the old History access without inventing MCC metrics.
  function historyNavigationRows(entries=[],operationalRows=[]){return entries.filter(entry=>entry.source==='legacy'||!operationalRows.some(row=>entry.id?row.campaignId===entry.id:row.c?.nome_campanha_exato===entry.name)).map(entry=>({c:{nome_campanha_exato:entry.exactName||entry.name,_status:'historico'},identity:{name:entry.label||entry.name,dateLabel:'—',dateSort:null},campaignId:entry.id||null,diaryName:entry.name,diarySource:entry.source||'workbook',totals:null,d0Totals:{},zeroDays:null,roi:null,profit:null,historyEntry:true}))}
  function searchRows(rows,query){const term=String(query??'').trim().toLocaleLowerCase('pt-BR');return (rows||[]).filter(row=>{if(!term)return true;let text=searchTextCache.get(row);if(text===undefined){text=`${row.c?.nome_campanha_exato||''} ${row.identity?.name||''}`.toLocaleLowerCase('pt-BR');searchTextCache.set(row,text)}return text.includes(term)})}
  // Start dates from the existing campaign identity, never dates inferred from delivery metrics.
  function activeCampaignStartDates(rows=[],{filter='active',referenceDate='',retentionHours=0,now=Date.now()}={}){
    return [...new Set(rows.filter(row=>filter==='active'&&referenceDate===''?row.c?._status==='ativa':rowVisible(row,filter,referenceDate,{retentionHours,now})).map(row=>row.identity?.dateSort)
      .filter(date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&manifestDate(date)===date))].sort();
  }
  function campaignDateNavigation(rows,selectedDate='',direction=0,options={}){
    const dates=activeCampaignStartDates(rows,options);
    let date=dates.includes(selectedDate)?selectedDate:'';
    const index=dates.indexOf(date);
    // From All, backward starts at newest and forward starts at oldest.
    if(direction<0)date=dates[index<0?dates.length-1:Math.max(0,index-1)]||'';
    else if(direction>0)date=dates[index<0?0:Math.min(dates.length-1,index+1)]||'';
    const current=dates.indexOf(date);
    return {dates,date,canPrevious:dates.length>0&&(current<0||current>0),canNext:dates.length>0&&(current<0||current<dates.length-1)};
  }
  function campaignRowsOnStartDate(rows,date){return (rows||[]).filter(row=>!date||row.identity?.dateSort===date)}
  function storedCampaignForSource(storedCampaigns=[],source,sourceMode='manifest'){
    const rows=Array.isArray(storedCampaigns)?storedCampaigns:[],name=String(source?.nome_campanha_exato||source?.nome_mcc||'').trim(),key=name.toLocaleLowerCase('pt-BR');if(!key)return null;
    if(sourceMode!=='api'){let match=null;for(const item of rows)if(String(item?.nome_mcc||'').trim().toLocaleLowerCase('pt-BR')===key)match=item;return match}
    const digits=value=>{const candidate=value&&typeof value==='object'?value.valor:value,normalized=String(candidate??'').replace(/\D/g,'');return /^\d{10}$/.test(normalized)?normalized:''},account=digits(source?.metricas_D_zero?.conta_id)||digits(source?.metricas_D_menos_1?.conta_id)||digits(source?._account)||digits(source?.conta_id),manager=digits(source?.mcc_id),matches=rows.filter(item=>String(item?.nome_mcc||'').trim().toLocaleLowerCase('pt-BR')===key&&(!account||digits(item?.conta_id)===account)&&(!manager||!item?.mcc_id||digits(item?.mcc_id)===manager));return matches.length===1?matches[0]:null;
  }
  function storedCampaignLookup(storedCampaigns=[],sourceMode='manifest'){
    const rows=Array.isArray(storedCampaigns)?storedCampaigns:[],byName=new Map();
    for(const item of rows){const key=String(item?.nome_mcc||'').trim().toLocaleLowerCase('pt-BR');if(!key)continue;const matches=byName.get(key)||[];matches.push(item);byName.set(key,matches)}
    const digits=value=>{const candidate=value&&typeof value==='object'?value.valor:value,normalized=String(candidate??'').replace(/\D/g,'');return /^\d{10}$/.test(normalized)?normalized:''};
    return source=>{
      const name=String(source?.nome_campanha_exato||source?.nome_mcc||'').trim(),key=name.toLocaleLowerCase('pt-BR');if(!key)return null;
      const matches=byName.get(key)||[];if(sourceMode!=='api')return matches.length?matches[matches.length-1]:null;
      const account=digits(source?.metricas_D_zero?.conta_id)||digits(source?.metricas_D_menos_1?.conta_id)||digits(source?._account)||digits(source?.conta_id),manager=digits(source?.mcc_id),filtered=matches.filter(item=>(!account||digits(item?.conta_id)===account)&&(!manager||!item?.mcc_id||digits(item?.mcc_id)===manager));
      return filtered.length===1?filtered[0]:null;
    };
  }
  function latestCompleteApiCampaignStatuses(base){
    const snapshots=(Array.isArray(base?.google_ads_api_capture_snapshots)?base.google_ads_api_capture_snapshots:[])
      .filter(snapshot=>String(snapshot?.scope||'ALL').toUpperCase()==='ALL'
        &&Array.isArray(snapshot?.accounts)&&snapshot.accounts.length>0
        &&snapshot.accounts.every(account=>account?.queryComplete===true))
      .sort((left,right)=>String(right?.completedAtUtc||'').localeCompare(String(left?.completedAtUtc||'')));
    const snapshot=snapshots[0]||null,statuses=new Map(),names=new Map();
    for(const account of snapshot?.accounts||[])for(const campaign of account?.campaigns||[]){
      const id=String(campaign?.campaignInternalId||''),status=String(campaign?.campaignStatus||'').trim().toUpperCase();
      if(!['ENABLED','PAUSED','REMOVED'].includes(status))continue;
      if(id)statuses.set(id,status);
      const name=String(campaign?.campaignName||'').normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('pt-BR');
      if(name){const matches=names.get(name)||new Set();matches.add(status);names.set(name,matches)}
    }
    const statusesByName=new Map([...names].filter(([,matches])=>matches.size===1).map(([name,matches])=>[name,[...matches][0]]));
    return{snapshot,statuses,statusesByName};
  }
  function apiSnapshotOnlyCampaignRows(storedCampaigns=[],knownRows=[]){
    const digits=value=>{const candidate=value&&typeof value==='object'?value.valor:value,normalized=String(candidate??'').replace(/\D/g,'');return /^\d{10}$/.test(normalized)?normalized:''},nameKey=row=>String(row?.nome_campanha_exato||row?.nome_mcc||'').normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('pt-BR'),accountId=row=>digits(row?._account||row?.conta_id||row?.metricas_D_zero?.conta_id||row?.metricas_D_menos_1?.conta_id),managerId=row=>digits(row?.mcc_id),sameCampaign=(left,right)=>{const leftName=nameKey(left),rightName=nameKey(right);if(!leftName||leftName!==rightName)return false;const leftAccount=accountId(left),rightAccount=accountId(right),leftManager=managerId(left),rightManager=managerId(right);if(leftAccount&&rightAccount)return leftAccount===rightAccount&&(!leftManager||!rightManager||leftManager===rightManager);return !leftAccount&&!rightAccount},seen=[...(Array.isArray(knownRows)?knownRows:[])],result=[];
    for(const stored of Array.isArray(storedCampaigns)?storedCampaigns:[]){
      const name=String(stored?.nome_mcc||'').trim(),account=accountId(stored),manager=managerId(stored),status=String(stored?.status||'').trim().toLowerCase();
      if(stored?.apiSnapshotOnly!==true||!name||!stored?.id||!account||!['ativa','pausada'].includes(status)||seen.some(row=>sameCampaign(row,stored)))continue;
      const row={nome_campanha_exato:name,nome_exibicao:String(stored.nome_exibicao||name).trim(),conta_id:account,mcc_id:manager||null,google_ads_campaign_id:String(stored.google_ads_campaign_id||''),metricas_D_zero:{presente:false},metricas_D_menos_1:{presente:false},custo_D_zero:{presente:false},google_ads_current_configuration:{campaignStatus:status==='ativa'?'ENABLED':'PAUSED'},_status:status,_account:account,_storedCampaignId:String(stored.id),_diarySource:'api',apiSnapshotOnly:true};
      if(stored.google_ads_campaign_origem)row.google_ads_campaign_origem=String(stored.google_ads_campaign_origem);
      result.push(row);seen.push(row);
    }
    return result;
  }
  function pausedCampaignNamesOnDate(campaigns,date,{sourceMode='manifest',apiCaptures=[],apiChangeHistory=[]}={}){
    const target=String(date??'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(target))return[];
    const rows=Array.isArray(campaigns)?campaigns:[],campaignName=campaign=>String(campaign?.nome_mcc||campaign?.nome_exibicao||'').trim();
    const digits=value=>String(value??'').replace(/\D/g,''),accountKey=(manager,customer,campaign)=>`${digits(manager)||'direct'}|${digits(customer)}|${String(campaign??'')}`,
      validTimestamp=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?time:null;},
      campaignById=new Map(rows.filter(campaign=>campaign?.id!=null).map(campaign=>[String(campaign.id),campaign])),latestByCampaign=new Map(),latestByIdentity=new Map();
    for(const capture of Array.isArray(apiCaptures)?apiCaptures:[]){
      if(Number(capture?.captureSchemaVersion)<2||capture?.configuration?.complete!==true||!Array.isArray(capture.configuration.campaigns))continue;
      const capturedAt=validTimestamp(capture.capturedAtUtc),customer=digits(capture.customerId),manager=digits(capture.managerCustomerId);
      if(capturedAt==null||!/^\d{10}$/.test(customer)||manager&&!/^\d{10}$/.test(manager))continue;
      for(const config of capture.configuration.campaigns){
        const internalId=String(config?.campaignInternalId||''),campaignId=String(config?.campaignId||''),campaign=campaignById.get(internalId);
        if(config?.mappingStatus!=='mapped'||!campaign||!/^\d{1,20}$/.test(campaignId)||digits(campaign.conta_id)!==customer||digits(campaign.mcc_id)!==manager)continue;
        const observed={capturedAt,status:String(config.campaignStatus||'').toUpperCase(),campaign,identity:accountKey(manager,customer,campaignId)},previousCampaign=latestByCampaign.get(internalId),previousIdentity=latestByIdentity.get(observed.identity);
        if(!previousCampaign||capturedAt>=previousCampaign.capturedAt)latestByCampaign.set(internalId,observed);
        if(!previousIdentity||capturedAt>=previousIdentity.capturedAt)latestByIdentity.set(observed.identity,observed);
      }
    }
    const selected=new Map();
    rows.forEach((campaign,index)=>{
      if(campaign?.status==='pausada'&&String(campaign?.pausada_em??'').slice(0,10)===target){const name=campaignName(campaign);if(name)selected.set(campaign?.id==null?`legacy:${index}`:String(campaign.id),name)}
      if(sourceMode!=='api')return;
      const latest=campaign?.id==null?null:latestByCampaign.get(String(campaign.id)),stillPaused=!latest||!['ENABLED','PAUSED','REMOVED'].includes(latest.status)||latest.status==='PAUSED';
      if(stillPaused&&campaign?.status==='pausada'&&String(campaign?.pausada_em??'').slice(0,10)===target){const name=campaignName(campaign);if(name)selected.set(campaign?.id==null?`legacy:${index}`:String(campaign.id),name)}
    });
    for(const entry of Array.isArray(apiChangeHistory)?apiChangeHistory:[]){
      const completedAt=validTimestamp(entry?.completedAtUtc);
      if(completedAt==null||new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(completedAt))!==target)continue;
      for(const change of Array.isArray(entry?.changes)?entry.changes:[]){
        const statusChanged=(Array.isArray(change?.fields)?change.fields:[]).some(field=>field?.key==='campaignStatus'&&String(field.before||'').toUpperCase()==='ENABLED'&&String(field.after||'').toUpperCase()==='PAUSED');
        if(!statusChanged)continue;
        const identity=accountKey(change.managerCustomerId,change.customerId,change.campaignId),latest=latestByIdentity.get(identity);
        if(entry.status==='completed'&&((entry.eventType==='automatic_pause'&&entry.executionMode==='automatic')||(entry.eventType==='manual_pause'&&entry.executionMode==='manual'))){
          const internalId=String(change.campaignInternalId||''),campaign=campaignById.get(internalId),customer=digits(change.customerId),manager=digits(change.managerCustomerId),campaignId=String(change.campaignId||'');
          if(!campaign||!/^\d{10}$/.test(customer)||digits(campaign.conta_id)!==customer||manager&&digits(campaign.mcc_id)&&digits(campaign.mcc_id)!==manager||!/^[1-9]\d{0,19}$/.test(campaignId)||(campaign.google_ads_campaign_id&&String(campaign.google_ads_campaign_id)!==campaignId))continue;
          const name=campaignName(campaign);if(name)selected.set(internalId,name);
          continue;
        }
        if(sourceMode!=='api')continue;
        const campaign=latest?.campaign;
        if(!latest||latest.status!=='PAUSED'||latest.capturedAt<completedAt||String(change.campaignInternalId||'')!==String(campaign?.id||''))continue;
        const name=campaignName(campaign);if(name)selected.set(String(campaign.id),name);
      }
    }
    return[...selected.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));
  }
  root.OverviewDomain=Object.freeze({campaignD0Totals,campaignD1Totals,activeCampaignStartDates,campaignDateNavigation,campaignRowsOnStartDate,storedCampaignForSource,storedCampaignLookup,latestCompleteApiCampaignStatuses,apiSnapshotOnlyCampaignRows,manifestPeriodDates,manifestMccCoverage,mccCollectionCoverage,manifestCaptureInfo,latestMccImportUpdates,latestApiMccUpdates,mccNameForCampaign,sortRows,firstClickImpressionObservations,activeMetricProductCounts,activeImpressionProductCounts,activeClickProductCounts,activeClickProductGroups,qualifyingActiveClickProductGroups,activeD0ImpressionProductCounts,searchRows,rowVisible,historyNavigationRows,pausedCampaignNamesOnDate,deriveTestBudget,campaignDiagnosis,parseMinimumRoi,parseTestLimit,testLimitForRoi,roiForTestLimit,parseCommissionTestPercent,testLimitForCommission,percentForCommissionLimit,parseRemainingAlert,remainingAlertThreshold,remainingWarningThreshold,remainingAlertTone,sumObservedMetric,overviewTableTotals,sumObservedProfit,resolveD0Totals,resolveD1Totals,profitForTotals,previousIsoDate,authoritativeMccSnapshots,replaceAuthoritativeDates,totalsColumns,columnWidths,visibleColumns,defaultTestLimitSettings,testLimitSettings});
})(typeof window==='object'?window:globalThis);
