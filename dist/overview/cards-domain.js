(function(root){
  const VERSION=4,fields=['investment','impressions','clicks'];
  const emptyResult=()=>({value:null,observedCount:0,totalCount:0});
  const emptyPeriod=()=>Object.fromEntries([...fields,'profit'].map(field=>[field,emptyResult()]));
  const empty=Object.freeze({version:VERSION,revision:'unavailable',summary:{d1:emptyPeriod(),d0:{...emptyPeriod(),campaignsWithImpressions:emptyResult()}},dates:{d1:'',d0:''},activeCount:null,pausedCount:null,pausedTodayCampaigns:[],manifestMccCoverage:{},mccImportUpdates:[],apiMccUpdates:[],apiCaptureSnapshotCount:0,pendingSaleCount:0,fractionalSaleCount:0});
  // Reads stay pure. One-time legacy recovery is coordinated separately by cards-recovery.js.
  function read(base){
    const saved=base?.overview_cards;
    if(saved?.version!==VERSION||typeof saved.revision!=='string'||!saved.revision)return empty;
    if(!Number.isInteger(saved.pendingSaleCount)||saved.pendingSaleCount<0||!Number.isInteger(saved.fractionalSaleCount)||saved.fractionalSaleCount<0)return empty;
    for(const period of ['d1','d0'])for(const field of [...fields,'profit']){
      const result=saved.summary?.[period]?.[field];
      if(!result||(result.value!==null&&(typeof result.value!=='number'||!Number.isFinite(result.value)))||!Number.isInteger(result.observedCount)||!Number.isInteger(result.totalCount)||result.observedCount<0||result.totalCount<result.observedCount)return empty;
    }
    const impressionCampaigns=saved.summary?.d0?.campaignsWithImpressions;
    if(!impressionCampaigns||(impressionCampaigns.value!==null&&(!Number.isInteger(impressionCampaigns.value)||impressionCampaigns.value<0||impressionCampaigns.value>impressionCampaigns.observedCount))||!Number.isInteger(impressionCampaigns.observedCount)||!Number.isInteger(impressionCampaigns.totalCount)||impressionCampaigns.observedCount<0||impressionCampaigns.totalCount<impressionCampaigns.observedCount)return empty;
    const dates={d1:saved.manifestMccCoverage?.d1?.date??saved.dates?.d1,d0:saved.manifestMccCoverage?.d0?.date??saved.dates?.d0};
    return{...saved,
      manifestMccCoverage:root.OverviewDomain.manifestMccCoverage(base,base?.manifesto_atual,dates),
      mccImportUpdates:root.OverviewDomain.latestMccImportUpdates(base?.mccs||[],base?.manifesto_atual?.cobertura_D_zero_por_mcc||{})
    };
  }
  // Pure projection. Caller stores this small result atomically with the applied MCC base.
  function create(base,{database=root.CampaignDatabase,domain=root.OverviewDomain,exchangeRate=5.1,computedAt,operationalSourceMode='manifest',periodDates=null,sharedProjection=null,guruMediaSalesByCampaignDate=null}={}){
    if(!database||!domain)throw new Error('O cálculo compartilhado dos cartões MCC não foi carregado.');
    const sourceBase=base,canShareBase=sharedProjection?.database===sourceBase&&sharedProjection?.operationalSourceMode===operationalSourceMode;
    base=database.operationalProjection?database.operationalProjection(base):base;
    const timestamp=computedAt||base.atualizado_em;
    if(!timestamp||!Number.isFinite(new Date(timestamp).getTime()))throw new Error('Horário da atualização MCC inválido.');
    const manifest=base.manifesto_atual,stored=base.campanhas||[],states=database.manifestOperationalStates(manifest),current=(manifest?.campanhas||[]).filter(c=>String(c?.nome_campanha_exato||'').trim()),keys=new Set(current.map(c=>String(c.nome_campanha_exato).toLocaleLowerCase('pt-BR'))),snapshotOnly=operationalSourceMode==='api'?domain.apiSnapshotOnlyCampaignRows(stored,current):stored.filter(c=>c.status==='pausada'&&c.nome_mcc&&!keys.has(c.nome_mcc.toLocaleLowerCase('pt-BR'))).map(c=>({nome_campanha_exato:c.nome_mcc,metricas_D_zero:{presente:false},metricas_D_menos_1:{presente:false},custo_D_zero:{presente:false}})),campaigns=[...current,...snapshotOnly];
    const storedForCampaign=domain.storedCampaignLookup(stored,operationalSourceMode),apiStatusIndex=operationalSourceMode==='api'?domain.latestCompleteApiCampaignStatuses(base):null,apiStatuses=apiStatusIndex?.statuses,dates=periodDates||domain.manifestPeriodDates(base,manifest),useOperationalDate=operationalSourceMode==='api',canSharePeriod=canShareBase&&sharedProjection.projectionExchangeRate===exchangeRate&&sharedProjection.periodDates?.d0===dates.d0&&sharedProjection.periodDates?.d1===dates.d1,latestSnapshots=canSharePeriod?sharedProjection.latestSnapshots:domain.authoritativeMccSnapshots(manifest,{exchangeRate}),snapshotsByCampaignName=canSharePeriod?sharedProjection.snapshotsByCampaignName:new Map(),dailyByCampaign=canShareBase?sharedProjection.dailyByCampaign:new Map(),histories=canShareBase?sharedProjection.historyTotals:database.campaignTotalsMap(base),adjustments=canShareBase?sharedProjection.salesAdjustments:database.salesAdjustmentMap(base),periodTotals=canSharePeriod?sharedProjection.periodTotalsByCampaignKey:null;
    if(!canSharePeriod)for(const row of latestSnapshots.rows){const key=row.campaignName.toLocaleLowerCase('pt-BR');if(!snapshotsByCampaignName.has(key))snapshotsByCampaignName.set(key,[]);snapshotsByCampaignName.get(key).push(row)}
    if(!canShareBase)for(const row of base.diario||[]){if(!dailyByCampaign.has(row.campanha_id))dailyByCampaign.set(row.campanha_id,[]);dailyByCampaign.get(row.campanha_id).push(row)}
    const context={dates,latestSnapshots,snapshotsByCampaignName,dailyByCampaign,exchangeRate,useOperationalDate},d1=[],d1Profits=[],d0=[],profits=[];let activeCount=0;
    const guruMediaFor=(campaignId,date)=>guruMediaSalesByCampaignDate?.get(String(campaignId||''))?.get(String(date||''))||null;
    const profitTotalsWithGuruMedia=(totals,record,date,adjustment)=>{const guru=record?.id?guruMediaFor(record.id,date):null,rawCommission=totals?.commission,parsedCommission=rawCommission==null||rawCommission===''?null:Number(rawCommission),hasCommission=Number.isFinite(parsedCommission),adjustmentAmount=adjustment?Number(adjustment.commissionAdjustment||0):0;let commission=hasCommission?parsedCommission:null;if(guru?.commissionBrl!=null)commission=Math.max(commission??0,Number(guru.commissionBrl));if(adjustment)commission=(commission??0)+adjustmentAmount;const result={...totals,guruMediaSalesCount:Number(guru?.count)||0,guruMediaPayoutSalesCount:Number(guru?.payoutCount)||0,guruMediaPayoutBrl:guru?.commissionBrl??null};if(commission!=null)result.commission=commission;return result};
    for(const campaign of campaigns){
      const exactName=String(campaign?.nome_campanha_exato||'').trim(),key=exactName.toLocaleLowerCase('pt-BR'),normalizedName=exactName.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('pt-BR');if(!key)continue;const record=storedForCampaign(campaign),apiStatus=(record?.id?apiStatuses?.get(String(record.id)):null)||apiStatusIndex?.statusesByName.get(normalizedName),paused=apiStatus?apiStatus!=='ENABLED':record?.status==='pausada'||['pausada','ausente'].includes(states.get(key)),periodKey=record?.id?`id:${record.id}`:`name:${key}`,cached=periodTotals?.get(periodKey);
      if(!paused)activeCount++;
      const history=(operationalSourceMode==='api'&&record?.id?histories.get(`id:${record.id}`):null)||histories.get(`mcc:${key}`)||histories.get(`aba:${String(record?.aba||'').toLowerCase()}`);
      const previousDay=cached&&Object.hasOwn(cached,'d1')?cached.d1:domain.campaignD1Totals(campaign,history,{...context,stored:record});if(!useOperationalDate||previousDay.fromOperationalCapture){d1.push(previousDay);const d1Adjustment=record?adjustments.get(record.id)?.byDate?.[previousDay.date||dates.d1]:null;
        d1Profits.push(profitTotalsWithGuruMedia(previousDay,record,previousDay.date||dates.d1,d1Adjustment))}
      const day=cached&&Object.hasOwn(cached,'d0')?cached.d0:domain.campaignD0Totals(campaign,{...context,stored:record});
      if(useOperationalDate?day.fromOperationalCapture===true:campaign.metricas_D_zero?.presente!==false||campaign.metricas_D_zero?.retida_no_dia===true||day.fromStoredCapture===true){
        d0.push(day);const adjustment=record?adjustments.get(record.id)?.byDate?.[day.date||dates.d0]:null;
        profits.push(profitTotalsWithGuruMedia(day,record,day.date||dates.d0,adjustment));
      }
    }
    const impressionCampaignCount=totals=>{const entries=Array.isArray(totals)?totals:[],observed=entries.filter(item=>item?.impressions!=null&&item.impressions!==''&&Number.isFinite(Number(item.impressions)));return{value:observed.length?observed.filter(item=>Number(item.impressions)>0).length:null,observedCount:observed.length,totalCount:entries.length}};
    const summarize=(totals,profitTotals=totals,includeImpressionCampaignCount=false)=>({...Object.fromEntries(fields.map(field=>[field,domain.sumObservedMetric(totals,field)])),profit:domain.sumObservedProfit(profitTotals),guruMediaSalesCount:profitTotals.reduce((sum,item)=>sum+(Number(item.guruMediaSalesCount)||0),0),guruMediaPayoutSalesCount:profitTotals.reduce((sum,item)=>sum+(Number(item.guruMediaPayoutSalesCount)||0),0),guruMediaPayoutBrl:profitTotals.some(item=>item.guruMediaPayoutBrl!=null)?profitTotals.reduce((sum,item)=>sum+(Number(item.guruMediaPayoutBrl)||0),0):null,provisional:totals.some(item=>item.provisional===true),...(includeImpressionCampaignCount?{campaignsWithImpressions:impressionCampaignCount(totals)}:{})});
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(timestamp)),values=[...adjustments.values()];
    return{version:VERSION,revision:timestamp,computedAt:timestamp,exchangeRate,summary:{d1:summarize(d1,d1Profits),d0:summarize(d0,profits,true)},dates,activeCount,pausedCount:campaigns.length-activeCount,pausedTodayDate:today,operationalSourceMode,pausedTodayCampaigns:domain.pausedCampaignNamesOnDate(stored,today,{sourceMode:operationalSourceMode,apiCaptures:base.google_ads_api_daily_captures,apiChangeHistory:base.google_ads_api_change_history}),manifestCaptureInfo:domain.manifestCaptureInfo(manifest),manifestMccCoverage:domain.manifestMccCoverage(base,manifest,{d1:domain.previousIsoDate(today),d0:today}),mccImportUpdates:domain.latestMccImportUpdates(base.mccs||[],manifest?.cobertura_D_zero_por_mcc||{}),apiMccUpdates:domain.latestApiMccUpdates(base.mccs||[],base.google_ads_api_daily_captures||[]),apiCaptureSnapshotCount:Array.isArray(base.google_ads_api_capture_snapshots)?base.google_ads_api_capture_snapshots.length:0,pendingSaleCount:values.reduce((sum,item)=>sum+Number(item.pendingConfirmationCount??item.pendingConversions??0),0),fractionalSaleCount:values.reduce((sum,item)=>sum+(Number(item.fractionalValuePendingCount)||0),0)};
  }
  root.OverviewCardsDomain=Object.freeze({VERSION,create,read});
})(typeof window==='object'?window:globalThis);
