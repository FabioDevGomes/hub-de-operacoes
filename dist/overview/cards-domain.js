(function(root){
  const VERSION=1,fields=['investment','impressions','clicks'];
  const emptyResult=()=>({value:null,observedCount:0,totalCount:0});
  const emptyPeriod=()=>Object.fromEntries([...fields,'profit'].map(field=>[field,emptyResult()]));
  const empty=Object.freeze({version:VERSION,revision:'unavailable',summary:{d1:emptyPeriod(),d0:emptyPeriod()},dates:{d1:'',d0:''},activeCount:null,pausedCount:null,pausedTodayCampaigns:[],pendingSaleCount:0,fractionalSaleCount:0});
  // No fallback calculation here: legacy bases wait for the next explicit MCC application.
  function read(base){
    const saved=base?.overview_cards;
    if(saved?.version!==VERSION||typeof saved.revision!=='string'||!saved.revision)return empty;
    for(const period of ['d1','d0'])for(const field of [...fields,'profit']){
      const result=saved.summary?.[period]?.[field];
      if(!result||(result.value!==null&&(typeof result.value!=='number'||!Number.isFinite(result.value)))||!Number.isInteger(result.observedCount)||!Number.isInteger(result.totalCount)||result.observedCount<0||result.totalCount<result.observedCount)return empty;
    }
    return saved;
  }
  // Pure projection. Caller stores this small result atomically with the applied MCC base.
  function create(base,{database=root.CampaignDatabase,domain=root.OverviewDomain,exchangeRate=5.1,computedAt}={}){
    if(!database||!domain)throw new Error('O cálculo compartilhado dos cartões MCC não foi carregado.');
    const timestamp=computedAt||base.atualizado_em;
    if(!timestamp||!Number.isFinite(new Date(timestamp).getTime()))throw new Error('Horário da atualização MCC inválido.');
    const manifest=base.manifesto_atual,stored=base.campanhas||[],byName=new Map(stored.filter(c=>c.nome_mcc).map(c=>[c.nome_mcc.toLocaleLowerCase('pt-BR'),c])),states=database.manifestOperationalStates(manifest),current=manifest?.campanhas||[],keys=new Set(current.map(c=>c.nome_campanha_exato.toLocaleLowerCase('pt-BR'))),campaigns=[...current,...stored.filter(c=>c.status==='pausada'&&c.nome_mcc&&!keys.has(c.nome_mcc.toLocaleLowerCase('pt-BR'))).map(c=>({nome_campanha_exato:c.nome_mcc,metricas_D_zero:{presente:false},metricas_D_menos_1:{presente:false},custo_D_zero:{presente:false}}))];
    const dates=domain.manifestPeriodDates(base,manifest),latestSnapshots=domain.authoritativeMccSnapshots(manifest,{exchangeRate}),snapshotsByCampaignName=new Map(),dailyByCampaign=new Map(),histories=database.campaignTotalsMap(base),adjustments=database.salesAdjustmentMap(base);
    for(const row of latestSnapshots.rows){const key=row.campaignName.toLocaleLowerCase('pt-BR');if(!snapshotsByCampaignName.has(key))snapshotsByCampaignName.set(key,[]);snapshotsByCampaignName.get(key).push(row)}
    for(const row of base.diario||[]){if(!dailyByCampaign.has(row.campanha_id))dailyByCampaign.set(row.campanha_id,[]);dailyByCampaign.get(row.campanha_id).push(row)}
    const context={dates,latestSnapshots,snapshotsByCampaignName,dailyByCampaign,exchangeRate},d1=[],d0=[],profits=[];let activeCount=0;
    for(const campaign of campaigns){
      const key=campaign.nome_campanha_exato.toLocaleLowerCase('pt-BR'),record=byName.get(key),paused=record?.status==='pausada'||['pausada','ausente'].includes(states.get(campaign.nome_campanha_exato.trim().toLowerCase()));
      if(!paused)activeCount++;
      const history=histories.get(`mcc:${key}`)||histories.get(`aba:${String(record?.aba||'').toLowerCase()}`);
      d1.push(domain.campaignD1Totals(campaign,history,context));
      const day=domain.campaignD0Totals(campaign,{...context,stored:record});
      if(campaign.metricas_D_zero?.presente!==false||campaign.metricas_D_zero?.retida_no_dia===true||day.fromStoredCapture===true){
        d0.push(day);const adjustment=record?adjustments.get(record.id)?.byDate?.[day.date||dates.d0]:null;
        profits.push(adjustment?{...day,commission:Number(day.commission||0)+Number(adjustment.commissionAdjustment||0)}:day);
      }
    }
    const summarize=(totals,profitTotals=totals)=>({...Object.fromEntries(fields.map(field=>[field,domain.sumObservedMetric(totals,field)])),profit:domain.sumObservedProfit(profitTotals)});
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(timestamp)),values=[...adjustments.values()];
    return{version:VERSION,revision:timestamp,computedAt:timestamp,exchangeRate,summary:{d1:summarize(d1),d0:summarize(d0,profits)},dates,activeCount,pausedCount:campaigns.length-activeCount,pausedTodayDate:today,pausedTodayCampaigns:domain.pausedCampaignNamesOnDate(stored,today),manifestCaptureInfo:domain.manifestCaptureInfo(manifest),manifestMccCoverage:domain.manifestMccCoverage(base,manifest,{d1:domain.previousIsoDate(today),d0:today}),mccImportUpdates:domain.latestMccImportUpdates(base.mccs||[],manifest?.cobertura_D_zero_por_mcc||{}),pendingSaleCount:values.reduce((sum,item)=>sum+item.pendingConversions,0),fractionalSaleCount:values.reduce((sum,item)=>sum+(Number(item.fractionalValuePendingCount)||0),0)};
  }
  root.OverviewCardsDomain=Object.freeze({VERSION,create,read});
})(typeof window==='object'?window:globalThis);
