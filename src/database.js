(function(){
  const SCHEMA='base_campanhas_v1';

  const clone=value=>structuredClone(value);
  const isBlank=value=>value==null||value==='';
  const comparable=value=>JSON.stringify(value??null);
  const excelDateToIso=serial=>new Date(Math.round((Number(serial)-25569)*86400000)).toISOString().slice(0,10);
  const displayName=name=>{
    let match;
    if(match=name.match(/\bWego6\s+(\d+)\b/i))return`Wego6 ${+match[1]}`;
    if(match=name.match(/\bMedicGLP\s+(\d+)\b/i))return`MagicGLP ${+match[1]}`;
    if(match=name.match(/\bSlimQA\s+(\d+)\b/i))return`SlimQA ${+match[1]}`;
    if(match=name.match(/\bAkemi\s+(\d+)\b/i))return`Akemi ${String(+match[1]).padStart(2,'0')}`;
    return name;
  };
  const accountSuffix=value=>String(value??'').trim().match(/^(\d{4})(?!\d)/)?.[1]??null;
  const canonicalAccountId=value=>{const raw=String(value??'').trim();if(/^\d{3}-\d{3}-\d{4}$/.test(raw))return raw;if(/^\d{10}$/.test(raw))return`${raw.slice(0,3)}-${raw.slice(3,6)}-${raw.slice(6)}`;return null};
  const accountDomain=value=>String(value??'').replace(/\p{Cf}/gu,'').match(/(?:^|\s)(\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(?=$|[\s,;])/i)?.[1]??null;
  function idFor(value){
    let hash=2166136261;
    for(const char of String(value).toLowerCase()){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}
    return`cmp_${(hash>>>0).toString(36)}`;
  }
  function create(){return{schema:SCHEMA,atualizado_em:new Date().toISOString(),manifesto_atual:null,mccs:[],campanhas:[],diario:[],google_ads_api_daily_captures:[],google_ads_api_capture_snapshots:[],google_ads_api_change_history:[],control_macro_api_syncs:[],campos_operacionais:[],importacoes:[],snapshots_campanhas:[],vendas_provisorias:[],mcc_fractional_value_confirmations:[],mcc_conversion_value_overrides:[],manifest_duplicate_suppressions:[]}}
  function normalize(base,copyInput=true){const value=base?.schema===SCHEMA?(copyInput?clone(base):base):create();value.mccs??=[];value.campanhas??=[];value.diario??=[];value.google_ads_api_daily_captures=Array.isArray(value.google_ads_api_daily_captures)?value.google_ads_api_daily_captures:[];value.google_ads_api_capture_snapshots=Array.isArray(value.google_ads_api_capture_snapshots)?value.google_ads_api_capture_snapshots:[];value.google_ads_api_change_history=Array.isArray(value.google_ads_api_change_history)?value.google_ads_api_change_history:[];value.control_macro_api_syncs=Array.isArray(value.control_macro_api_syncs)?value.control_macro_api_syncs:[];value.campos_operacionais??=[];value.importacoes??=[];value.snapshots_campanhas??=[];value.vendas_provisorias??=[];value.mcc_fractional_value_confirmations=Array.isArray(value.mcc_fractional_value_confirmations)?value.mcc_fractional_value_confirmations:[];value.mcc_conversion_value_overrides=Array.isArray(value.mcc_conversion_value_overrides)?value.mcc_conversion_value_overrides:[];value.manifest_duplicate_suppressions=Array.isArray(value.manifest_duplicate_suppressions)?value.manifest_duplicate_suppressions:[];return value}
  function duplicateNameKey(value){return String(value??'').normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('pt-BR')}
  function duplicateGroupKey(accountId,name){return`${accountId}\u0000${duplicateNameKey(name)}`}
  function duplicateMetricValue(value){const raw=metricValue(value);if(raw==null)return null;if(typeof raw==='number')return Number.isFinite(raw)?raw:String(raw);const text=String(raw).trim();if(!text)return null;if(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text))return Number(text);if(/^[+-]?\d+,\d+$/.test(text))return Number(text.replace(',','.'));return text}
  function duplicateMetricEvidence(source){
    const fields=['data','moeda','impressoes','cliques_google','custo_total','conversoes','valor_conversao','estado_campanha','status_campanha'],numericFields=new Set(['impressoes','cliques_google','custo_total','conversoes','valor_conversao']);
    const periods=['metricas_D_menos_1','metricas_D_zero'].map(key=>{const metrics=source?.[key];return{present:!!metrics&&metrics.presente!==false,values:Object.fromEntries(fields.map(field=>[field,duplicateMetricValue(metrics?.[field])]))}});
    return{signature:JSON.stringify(periods),hasObservedMetrics:periods.some(period=>[...numericFields].some(field=>typeof period.values[field]==='number'&&Number.isFinite(period.values[field])))};
  }
  function setManifestDuplicateSuppression(baseInput,{accountId,name,suppressed=true,now=new Date().toISOString()}={}){
    const base=normalize(baseInput),account=canonicalAccountId(accountId),normalizedName=duplicateNameKey(name);if(!account||!normalizedName)throw new Error('Informe o ID completo da conta e o nome da campanha para ajustar a duplicidade.');
    const key=duplicateGroupKey(account,normalizedName),keys=new Set(base.manifest_duplicate_suppressions.filter(item=>typeof item==='string'));
    if(suppressed){const matches=(base.manifesto_atual?.campanhas||[]).filter(source=>{if(duplicateNameKey(source?.nome_campanha_exato)!==normalizedName)return false;try{return sourceAccountId(source)===account}catch{return false}}),evidence=matches.map(duplicateMetricEvidence);if(matches.length<2||!evidence[0]?.hasObservedMetrics||!evidence.every(item=>item.hasObservedMetrics&&item.signature===evidence[0].signature))throw new Error('As linhas atuais não formam uma duplicidade verificável com métricas idênticas; nenhuma linha foi ocultada.')}
    if(suppressed)keys.add(key);else keys.delete(key);
    base.manifest_duplicate_suppressions=[...keys];base.atualizado_em=now;return base
  }
  function operationalProjection(baseInput,manifestOverride=null){
    if(!baseInput)return null;
    const base=normalize(baseInput);
    const duplicateSuppressions=new Set(base.manifest_duplicate_suppressions||[]);
    const projectManifest=manifest=>{
      if(!manifest)return manifest;
      const entries=manifest.campanhas||[],groups=new Map(),suppressedGroups=new Set(),seenSuppressedRows=new Map(),campaigns=[];
      for(const item of entries){let accountId=null;try{accountId=sourceAccountId(item)}catch{}const name=duplicateNameKey(item?.nome_campanha_exato);if(!accountId||!name)continue;const key=duplicateGroupKey(accountId,name),group=groups.get(key)||[];group.push(item);groups.set(key,group)}
      for(const [key,items] of groups){if(items.length<2||!duplicateSuppressions.has(key))continue;const evidence=items.map(duplicateMetricEvidence);if(evidence[0].hasObservedMetrics&&evidence.every(item=>item.hasObservedMetrics&&item.signature===evidence[0].signature))suppressedGroups.add(key)}
      for(const item of entries){
        const keyName=duplicateNameKey(item?.nome_campanha_exato);let accountId=null;try{accountId=sourceAccountId(item)}catch{}
        const duplicateKey=accountId&&keyName?duplicateGroupKey(accountId,keyName):null;
        if(duplicateKey&&suppressedGroups.has(duplicateKey)){const seen=seenSuppressedRows.get(duplicateKey)||0;if(seen===0)campaigns.push(item);seenSuppressedRows.set(duplicateKey,seen+1);continue}
        campaigns.push(item);
      }
      return{...clone(manifest),campanhas:campaigns};
    };
    base.manifesto_atual=projectManifest(manifestOverride||base.manifesto_atual);
    return base
  }
  function fractionalEvidenceKey(campaignId,date,period,conversions,valueObserved,value){return[String(campaignId),String(date),String(period),Number(conversions).toFixed(8),valueObserved?'observed':'missing',valueObserved?Number(value).toFixed(2):''].join('|')}
  function fractionalValueConfirmation(base,key){return(base.mcc_fractional_value_confirmations||[]).find(item=>item?.key===key)||null}
  function campaignIndexes(base){const campaigns=Array.isArray(base?.campanhas)?base.campanhas:[],nameOf=(campaign,key)=>String(campaign?.[key]||'').trim();return{byId:new Map(campaigns.filter(x=>x?.id!=null).map(x=>[x.id,x])),byExact:new Map(campaigns.map(x=>[x,nameOf(x,'nome_mcc')]).filter(([,name])=>name).map(([x,name])=>[name.toLowerCase(),x])),byDisplay:new Map(campaigns.map(x=>[x,nameOf(x,'nome_exibicao')||displayName(nameOf(x,'nome_mcc'))]).filter(([,name])=>name).map(([x,name])=>[name.toLowerCase(),x]))}}
  function campaignStartDate(exactName,referenceDate){const match=String(exactName||'').match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\s*(?:[–—-]\s*)?/);if(!match)return null;const reference=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(referenceDate||'')),year=match[3]?(match[3].length===2?`20${match[3]}`:match[3]):reference?.[1];if(!year)return null;const iso=`${year}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;return /^\d{4}-\d{2}-\d{2}$/.test(iso)?iso:null}
  function previousExactForDisplay(base,display,exactName,beforeDate){let found=null;for(const snapshot of base.snapshots_campanhas||[]){if(beforeDate&&snapshot.data>=beforeDate)continue;for(const name of snapshot.campanhas||[])if(String(name).toLowerCase()!==String(exactName).toLowerCase()&&displayName(String(name)).toLowerCase()===display.toLowerCase())found={name:String(name),date:snapshot.data}}return found?.name||null}
  function splitLegacyExactCollision(base,existing,exactName,display,status,referenceDate){const targetId=idFor(exactName),start=campaignStartDate(exactName,referenceDate),previous=previousExactForDisplay(base,display,exactName,start);if(existing.id===targetId||!start||!previous)return existing;if(existing.nome_mcc_corrigido_em&&confirmedDateAliasKeys(base).has(previous.trim().toLocaleLowerCase('pt-BR')))return existing;let target=base.campanhas.find(x=>x.id===targetId);if(!target){target={...existing,id:targetId,nome_mcc:exactName,nome_exibicao:display,status};base.campanhas.push(target)}for(const row of base.diario)if(row.campanha_id===existing.id&&row.data>=start)row.campanha_id=target.id;for(const sale of base.vendas_provisorias)if(sale.campanha_id===existing.id&&sale.data>=start)sale.campanha_id=target.id;for(const record of base.campos_operacionais)if(record.campanha_id===existing.id)record.campanha_id=target.id;existing.nome_mcc=previous;existing.nome_exibicao=display;existing.status='historico';delete existing.movimento_status;target.nome_mcc=exactName;target.nome_exibicao=display;target.status=status;target.identidade_separada_em=new Date().toISOString();return target}
  function ensureCampaign(base,{exactName=null,sheetName,status='historico',referenceDate=null}){const indexes=campaignIndexes(base),display=sheetName||displayName(exactName);if(exactName){const exact=indexes.byExact.get(exactName.toLowerCase());if(exact)return splitLegacyExactCollision(base,exact,exactName,display,status,referenceDate);const unclaimed=base.campanhas.find(x=>!x.nome_mcc&&x.nome_exibicao.toLowerCase()===display.toLowerCase());if(unclaimed){unclaimed.nome_mcc=exactName;unclaimed.nome_exibicao=display;unclaimed.status=status;return unclaimed}}else{const displayed=indexes.byDisplay.get(display.toLowerCase());if(displayed)return displayed}const campaign={id:idFor(exactName||display),nome_mcc:exactName,nome_exibicao:display,status};if(referenceDate&&/^\d{1,2}[\/-]\d{1,2}\s*[–—-]/.test(String(exactName||'')))campaign.data_inicio_ano_inferido=new Date().getFullYear();base.campanhas.push(campaign);return campaign}
  function mergeCells(existing,incoming,overwrite,conflicts,context){const result=clone(existing||{});for(const [column,cell] of Object.entries(incoming||{})){if(!cell||isBlank(cell.value))continue;const previous=result[column];if(!previous||isBlank(previous.value)){result[column]=clone(cell);continue}if(comparable(previous.value)===comparable(cell.value))continue;if(overwrite)result[column]=clone(cell);else conflicts.push({...context,coluna:column,anterior:previous.value,novo:cell.value})}return result}
  function importWorkbook(baseInput,workbook,{overwrite=false}={}){const base=normalize(baseInput),conflicts=[];const dailyIndex=new Map(base.diario.map(x=>[`${x.campanha_id}|${x.data}`,x]));const totals=workbook?.sheets?.find(s=>s.name.toLowerCase()==='totais');for(const sheet of workbook?.sheets||[]){if(sheet===totals)continue;const dailyRows=sheet.rows.filter(row=>typeof row.cells.A?.value==='number'&&row.cells.A.value>=30000&&row.cells.A.value<=70000);if(!dailyRows.length)continue;const campaign=ensureCampaign(base,{sheetName:sheet.name,status:sheet.visible?'ativa':'historico'});for(const row of dailyRows){const date=excelDateToIso(row.cells.A.value);if(!campaignDiaryDateAllowed(base,campaign.id,date))continue;const key=`${campaign.id}|${date}`,existing=dailyIndex.get(key),cells=clone(row.cells);if(existing)existing.celulas=mergeCells(existing.celulas,cells,overwrite,conflicts,{campanha:campaign.nome_exibicao,data:date});else{const record={campanha_id:campaign.id,data:date,celulas:cells,fontes:['excel']};base.diario.push(record);dailyIndex.set(key,record)}}}
    if(totals){for(const row of totals.rows){const exact=String(row.cells.C?.value??'').trim();if(!exact)continue;const campaign=ensureCampaign(base,{exactName:exact,sheetName:displayName(exact),status:'ativa'}),incoming={roi_atual:row.cells.L??null,investimento_atual:row.cells.M??null,limite_teste:row.cells.O??null,valor_restante:row.cells.P??null},existing=base.campos_operacionais.find(x=>x.campanha_id===campaign.id);if(existing)Object.assign(existing,incoming);else base.campos_operacionais.push({campanha_id:campaign.id,...incoming})}}
    applyStoredConversionValueOverridesToDiary(base);const reconciledSales=reconcileProvisionalSales(base);base.importacoes.push({tipo:'excel',arquivo:workbook?.fileName||null,executada_em:new Date().toISOString(),registros:base.diario.length,conflitos:conflicts.length});base.atualizado_em=new Date().toISOString();return{base,conflicts,reconciledSales}}
  function manifestDate(manifest){const temporal=manifest?.separacao_temporal||{};return temporal.D_zero?.datas_detectadas?.[0]||temporal.D_menos_1?.datas_detectadas?.[0]||new Date().toISOString().slice(0,10)}
  const GOOGLE_ADS_API_OPERATIONAL_START_DATE='2026-10-26';
  const GOOGLE_ADS_API_CAPTURE_WINDOW_DAYS=7;
  const GOOGLE_ADS_CAPTURE_HISTORY_MAX_ENTRIES=24;
  const GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_DEFAULT=10;
  const GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_MAX=100;
  function normalizeGoogleAdsCaptureSnapshotRetention(value){const parsed=Number(value);return Number.isInteger(parsed)?Math.max(1,Math.min(GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_MAX,parsed)):GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_DEFAULT}
  function googleAdsDateInTimeZone(timeZone,instant=new Date()){try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);return`${parts.find(part=>part.type==='year')?.value}-${parts.find(part=>part.type==='month')?.value}-${parts.find(part=>part.type==='day')?.value}`}catch{return''}}
  function googleAdsConfigurationMismatch(report,{customerId,managerCustomerId,currencyCode,timeZone,today}){
    const observed=report?.configuration;if(!observed)return[];
    const show=value=>String(value??'').trim()||'ausente',showManager=value=>String(value??'').trim()||'acesso direto',issues=[];
    if(observed.complete!==true)issues.push('snapshot incompleto');
    if(observed.customerId!==customerId)issues.push(`ID da conta: configuração ${show(observed.customerId)}, esperado ${customerId}`);
    if((observed.managerCustomerId||'')!==managerCustomerId)issues.push(`MCC de acesso: configuração ${showManager(observed.managerCustomerId)}, esperada ${showManager(managerCustomerId)}`);
    if(observed.currencyCode!==currencyCode)issues.push(`moeda: configuração ${show(observed.currencyCode)}, métricas ${currencyCode}`);
    if(observed.timeZone!==timeZone)issues.push(`fuso: configuração ${show(observed.timeZone)}, métricas ${timeZone}`);
    if(!Array.isArray(observed.campaigns))issues.push('lista de campanhas ausente ou inválida');
    else if(observed.campaigns.length>1000)issues.push(`lista de campanhas acima do limite (${observed.campaigns.length}/1.000)`);
    const generatedAt=Date.parse(observed.generatedAtUtc);
    if(!Number.isFinite(generatedAt))issues.push('horário de geração ausente ou inválido');
    else{
      const snapshotDate=googleAdsDateInTimeZone(timeZone,new Date(generatedAt));
      if(snapshotDate!==today)issues.push(`data local do snapshot ${snapshotDate||'indeterminada'}, esperada ${today} (${timeZone})`);
    }
    return issues;
  }
  function shiftGoogleAdsDate(date,days){const[y,m,d]=String(date||'').split('-').map(Number);if(!y||!m||!d)return'';const value=new Date(Date.UTC(y,m-1,d+days));return`${value.getUTCFullYear()}-${String(value.getUTCMonth()+1).padStart(2,'0')}-${String(value.getUTCDate()).padStart(2,'0')}`}
  function validGoogleAdsCaptureHistoryEntry(entry){return entry?.eventType==='clickbank_sale_detected'?/^clickbank-sale:\d{1,20}$/.test(String(entry.id||''))&&Number.isFinite(Date.parse(entry.completedAtUtc||'')):Array.isArray(entry?.changes)||(entry?.status==='failed'&&entry?.executionMode==='automatic'&&['D0','D-1'].includes(entry?.periodType))}
  function pruneGoogleAdsCaptureHistory(history){if(!Array.isArray(history))return[];const entries=new Map();let sequence=0;for(const entry of history){if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;const id=String(entry.id||'').trim(),completedAt=Date.parse(entry.completedAtUtc||'');if(!id||!Number.isFinite(completedAt)||!validGoogleAdsCaptureHistoryEntry(entry))continue;const previous=entries.get(id);if(!previous||completedAt>=previous.completedAt)entries.set(id,{entry,completedAt,sequence:sequence++})}const ordered=[...entries.values()].sort((a,b)=>a.completedAt-b.completedAt||a.sequence-b.sequence),preservedEvents=ordered.filter(item=>['automatic_pause','automatic_pause_observed','manual_pause','clickbank_sale_detected'].includes(item.entry.eventType)),captureRuns=ordered.filter(item=>!['automatic_pause','automatic_pause_observed','manual_pause','clickbank_sale_detected'].includes(item.entry.eventType)).slice(-GOOGLE_ADS_CAPTURE_HISTORY_MAX_ENTRIES);return[...captureRuns,...preservedEvents].sort((a,b)=>a.completedAt-b.completedAt||a.sequence-b.sequence).map(item=>item.entry)}
  function pruneGoogleAdsCaptureSnapshots(snapshots,limit=GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_DEFAULT,history=[]){if(!Array.isArray(snapshots))return[];const entries=new Map(),historyById=new Map((Array.isArray(history)?history:[]).filter(item=>item?.id).map(item=>[String(item.id),item]));let sequence=0;for(const snapshot of snapshots){if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))continue;const id=String(snapshot.id||'').trim(),capturedAt=Date.parse(snapshot.completedAtUtc||'');if(!id||!Number.isFinite(capturedAt)||!Array.isArray(snapshot.accounts))continue;const previous=entries.get(id);if(!previous||capturedAt>=previous.capturedAt)entries.set(id,{snapshot,capturedAt,sequence:sequence++})}const sorted=[...entries.values()].sort((a,b)=>a.capturedAt-b.capturedAt||a.sequence-b.sequence),automatic=[],other=[];for(const item of sorted){const snapshot=item.snapshot,run=historyById.get(String(snapshot.runId||snapshot.id)),executionMode=snapshot.executionMode||run?.executionMode||'automatic',periodType=snapshot.periodType||run?.periodType||'D0';if(executionMode==='automatic'&&(periodType==='D0'||periodType==='D-1'))automatic.push(item);else other.push(item)}const retainedAutomatic=automatic.slice(-normalizeGoogleAdsCaptureSnapshotRetention(limit)),otherCapacity=Math.max(0,GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_MAX-retainedAutomatic.length),retainedOther=otherCapacity?other.slice(-otherCapacity):[],retained=[...retainedOther,...retainedAutomatic].sort((a,b)=>a.capturedAt-b.capturedAt||a.sequence-b.sequence);return retained.map(item=>item.snapshot)}
  function mergeGoogleAdsCaptureSnapshots(...sources){return pruneGoogleAdsCaptureSnapshots(sources.flatMap(source=>Array.isArray(source)?source:[]),GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_MAX)}
  function googleAdsApiCaptureDateRange(today,windowDays=GOOGLE_ADS_API_CAPTURE_WINDOW_DAYS){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(today||''))||today<GOOGLE_ADS_API_OPERATIONAL_START_DATE)throw new Error('A captura API só começa em 26/10/2026 e exige uma data válida da conta.');if(!Number.isInteger(windowDays)||windowDays<1||windowDays>14)throw new Error('A janela de captura deve ter entre 1 e 14 dias.');const candidate=shiftGoogleAdsDate(today,-(windowDays-1));return{dateFrom:candidate<GOOGLE_ADS_API_OPERATIONAL_START_DATE?GOOGLE_ADS_API_OPERATIONAL_START_DATE:candidate,dateTo:today,windowDays}}
  function historicalGoogleAdsConfiguration(previous,date,customerId,managerCustomerId,currencyCode,timeZone,observationTimeZone=timeZone){const configuration=previous?.configuration;if(previous?.customerId!==customerId||(previous.managerCustomerId||'')!==managerCustomerId||previous.currencyCode!==currencyCode||previous.timeZone!==timeZone||configuration?.complete!==true||(configuration.customerId!=null&&configuration.customerId!==customerId)||(configuration.managerCustomerId!=null&&(configuration.managerCustomerId||'')!==managerCustomerId)||(configuration.currencyCode!=null&&configuration.currencyCode!==currencyCode)||(configuration.timeZone!=null&&configuration.timeZone!==timeZone)||!Array.isArray(configuration.campaigns)||!Number.isFinite(Date.parse(configuration.generatedAtUtc))||googleAdsDateInTimeZone(observationTimeZone,new Date(configuration.generatedAtUtc))!==date)return null;return configuration}
  function apiCampaignMappingIndex(base,priorCaptures){
    const priorIdsByAccountCampaign=new Map(),campaignsByAccountName=new Map(),campaignsByManagerAccountName=new Map(),campaignsByAccountGoogleId=new Map(),campaignByStringId=new Map();
    const accountKey=(manager,account)=>`${manager||'direct'}|${account||''}`;
    for(const campaign of base.campanhas||[]){
      if(typeof campaign?.id==='string'&&!campaignByStringId.has(campaign.id))campaignByStringId.set(campaign.id,campaign);
      const account=canonicalAccountId(campaign?.conta_id);if(!account)continue;
      const manager=canonicalAccountId(campaign?.mcc_id),name=String(campaign?.nome_mcc||'').trim();
      const add=(index,key)=>{const items=index.get(key)||[];items.push(campaign);index.set(key,items)};
      add(campaignsByAccountName,`${account}|${name}`);
      if(manager)add(campaignsByManagerAccountName,`${accountKey(manager,account)}|${name}`);
      const googleCampaignId=String(campaign?.google_ads_campaign_id||'');if(/^[1-9]\d{0,19}$/.test(googleCampaignId))add(campaignsByAccountGoogleId,`${accountKey(manager,account)}|${googleCampaignId}`);
    }
    for(const capture of priorCaptures||[]){
      const manager=canonicalAccountId(capture?.managerCustomerId),account=canonicalAccountId(capture?.customerId);if(!account)continue;
      const prefix=accountKey(manager,account);
      for(const previous of capture.rows||[]){if(!previous?.campaignInternalId||!previous?.campaignId)continue;const key=`${prefix}|${String(previous.campaignId)}`,ids=priorIdsByAccountCampaign.get(key)||new Set();ids.add(String(previous.campaignInternalId));priorIdsByAccountCampaign.set(key,ids)}
    }
    return{accountKey,priorIdsByAccountCampaign,campaignsByAccountName,campaignsByManagerAccountName,campaignsByAccountGoogleId,campaignByStringId};
  }
  function apiCampaignMapping(base,managerCustomerId,customerId,row,index){
    const manager=canonicalAccountId(managerCustomerId),account=canonicalAccountId(customerId),accountScope=index.accountKey(manager,account),campaignId=String(row.campaignId||''),priorIds=index.priorIdsByAccountCampaign.get(`${accountScope}|${campaignId}`)||new Set(),googleIdCandidates=index.campaignsByAccountGoogleId.get(`${accountScope}|${campaignId}`)||[];
    if(googleIdCandidates.length>1)return{campaignInternalId:null,mappingStatus:'ambiguous'};
    if(googleIdCandidates.length===1){const campaign=googleIdCandidates[0];if(priorIds.size&&!(priorIds.size===1&&priorIds.has(String(campaign.id))))return{campaignInternalId:null,mappingStatus:'mapping_conflict'};return{campaignInternalId:campaign.id,mappingStatus:'mapped'}}
    if(priorIds.size===1){const campaign=index.campaignByStringId.get([...priorIds][0]),valid=Boolean(campaign&&campaign.conta_id===account&&(!manager||!campaign.mcc_id||campaign.mcc_id===manager));return valid?{campaignInternalId:campaign.id,mappingStatus:'mapped'}:{campaignInternalId:null,mappingStatus:'mapping_conflict'}}
    if(priorIds.size>1)return{campaignInternalId:null,mappingStatus:'ambiguous'};
    const name=String(row.campaignName||'').trim(),accountCandidates=index.campaignsByAccountName.get(`${account}|${name}`)||[],candidates=(manager?index.campaignsByManagerAccountName.get(`${accountScope}|${name}`):accountCandidates)||[];
    if(manager&&!candidates.length&&accountCandidates.length){if(accountCandidates.length===1&&!accountCandidates[0].mcc_id)return{campaignInternalId:accountCandidates[0].id,mappingStatus:'mapped'};return{campaignInternalId:null,mappingStatus:'mapping_conflict'}}
    if(candidates.length===1)return{campaignInternalId:candidates[0].id,mappingStatus:'mapped'};
    return{campaignInternalId:null,mappingStatus:candidates.length?'ambiguous':'unmapped'};
  }
  function addCurrentApiSnapshotCampaigns(base,captures){
    const snapshots=Array.isArray(base.google_ads_api_capture_snapshots)?base.google_ads_api_capture_snapshots:[],latestByAccount=new Map(),knownInternalIds=new Set((base.campanhas||[]).map(item=>String(item?.id||''))),mappingIndex=apiCampaignMappingIndex(base,captures);
    for(const snapshot of snapshots){
      if(snapshot?.periodType!=='D0'||!Number.isFinite(Date.parse(snapshot.completedAtUtc||'')))continue;
      const completedAt=Date.parse(snapshot.completedAtUtc);
      for(const account of snapshot.accounts||[]){
        const manager=canonicalAccountId(account?.managerCustomerId),customer=canonicalAccountId(account?.customerId),date=String(account?.date||''),timeZone=String(account?.timeZone||'');
        if(!customer||!timeZone||!/^\d{4}-\d{2}-\d{2}$/.test(date)||googleAdsDateInTimeZone(timeZone,new Date(completedAt))!==date)continue;
        const key=`${manager||'direct'}|${customer}`,previous=latestByAccount.get(key);if(!previous||completedAt>previous.completedAt)latestByAccount.set(key,{snapshot,account,manager,customer,completedAt});
      }
    }
    for(const{snapshot,account,manager,customer}of latestByAccount.values()){
      if(account.queryComplete!==true||account.configurationComplete!==true)continue;
      for(const campaign of account.campaigns||[]){
        const name=String(campaign?.campaignName||'').trim().slice(0,240),nameKey=duplicateNameKey(name),campaignId=String(campaign?.campaignId||''),status=String(campaign?.campaignStatus||'').toUpperCase();
        if(!nameKey||! /^[1-9]\d{0,19}$/.test(campaignId)||!['ENABLED','PAUSED'].includes(status))continue;
        const mapping=apiCampaignMapping(base,manager,customer,campaign,mappingIndex);if(mapping.mappingStatus!=='unmapped')continue;
        const id=`api_${idFor(`${manager||'direct'}|${customer}|${campaignId}`)}`;if(knownInternalIds.has(id))continue;
        base.campanhas.push({id,nome_mcc:name,nome_exibicao:displayName(name),conta_id:customer,mcc_id:manager,google_ads_campaign_id:campaignId,status:status==='ENABLED'?'ativa':'pausada',apiSnapshotOnly:true,apiSnapshotObservedAt:snapshot.completedAtUtc});
        knownInternalIds.add(id);
      }
    }
  }
  function syncGoogleAdsSnapshotCampaigns(baseInput,{now=new Date().toISOString()}={}){
    if(!baseInput||baseInput.schema!==SCHEMA)throw new Error('A base local válida precisa estar carregada antes de sincronizar campanhas dos snapshots Google Ads.');
    const base=normalize(baseInput),nowDate=new Date(now);if(!Number.isFinite(nowDate.getTime()))throw new Error('O horário da sincronização dos snapshots é inválido.');
    const latestByAccount=new Map(),registered=[],linked=[],refreshed=[],conflicts=[];let changed=false;
    for(const snapshot of base.google_ads_api_capture_snapshots||[]){
      if(snapshot?.periodType!=='D0')continue;const completedAt=Date.parse(snapshot.completedAtUtc||'');if(!Number.isFinite(completedAt))continue;
      for(const account of snapshot.accounts||[]){
        const manager=canonicalAccountId(account?.managerCustomerId),customer=canonicalAccountId(account?.customerId),date=String(account?.date||''),timeZone=String(account?.timeZone||''),generatedAt=Date.parse(account?.configurationGeneratedAtUtc||'');
        if(!customer||!timeZone||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||account.queryComplete!==true||account.configurationComplete!==true||!Number.isFinite(generatedAt))continue;
        if(googleAdsDateInTimeZone(timeZone,nowDate)!==date||googleAdsDateInTimeZone(timeZone,new Date(completedAt))!==date||googleAdsDateInTimeZone(timeZone,new Date(generatedAt))!==date)continue;
        const key=`${manager||'direct'}|${customer}`,previous=latestByAccount.get(key);if(!previous||completedAt>previous.completedAt)latestByAccount.set(key,{snapshot,account,manager,customer,completedAt});
      }
    }
    const accountKey=(manager,customer)=>`${manager||'direct'}|${customer}`;
    const sameCampaign=(item,candidate)=>String(item?.nome_mcc||'').trim()===candidate.campaignName&&canonicalAccountId(item?.conta_id)===candidate.customerId&&(!candidate.managerCustomerId||!canonicalAccountId(item?.mcc_id)||canonicalAccountId(item.mcc_id)===candidate.managerCustomerId);
    const sameAccount=(item,candidate)=>canonicalAccountId(item?.conta_id)===candidate.customerId&&(!candidate.managerCustomerId||!canonicalAccountId(item?.mcc_id)||canonicalAccountId(item.mcc_id)===candidate.managerCustomerId);
    const mappingRows=(candidate,campaign)=>{
      const mark=row=>{if(String(row?.campaignId||'')!==candidate.campaignId)return;if(row.campaignInternalId&&String(row.campaignInternalId)!==String(campaign.id))return;if(row.campaignInternalId!==campaign.id||row.mappingStatus!=='mapped'){row.campaignInternalId=campaign.id;row.mappingStatus='mapped';changed=true}};
      for(const capture of base.google_ads_api_daily_captures||[]){if(accountKey(canonicalAccountId(capture?.managerCustomerId),canonicalAccountId(capture?.customerId))!==accountKey(candidate.managerCustomerId,candidate.customerId))continue;for(const row of capture.rows||[])mark(row);for(const row of capture.configuration?.campaigns||[])mark(row)}
      for(const snapshot of base.google_ads_api_capture_snapshots||[])for(const account of snapshot.accounts||[]){if(accountKey(canonicalAccountId(account?.managerCustomerId),canonicalAccountId(account?.customerId))!==accountKey(candidate.managerCustomerId,candidate.customerId))continue;for(const row of account.campaigns||[])mark(row)}
      for(const history of base.google_ads_api_change_history||[])for(const row of history.changes||[]){if(accountKey(canonicalAccountId(row?.managerCustomerId),canonicalAccountId(row?.customerId))!==accountKey(candidate.managerCustomerId,candidate.customerId))continue;mark(row)}
    };
    for(const{snapshot,account,manager,customer,completedAt}of latestByAccount.values())for(const observed of account.campaigns||[]){
      const campaignId=String(observed?.campaignId||''),campaignName=String(observed?.campaignName||'').trim().slice(0,240),status=String(observed?.campaignStatus||'').toUpperCase();
      if(!/^[1-9][0-9]{0,19}$/.test(campaignId)||!campaignName||!['ENABLED','PAUSED'].includes(status))continue;
      const candidate={managerCustomerId:manager,customerId:customer,campaignId,campaignName,status,accountName:String(account.accountName||'').trim().slice(0,240),snapshotAtUtc:snapshot.completedAtUtc||new Date(completedAt).toISOString()};
      const priorIds=new Set();if(observed.campaignInternalId)priorIds.add(String(observed.campaignInternalId));
      const collect=row=>{if(String(row?.campaignId||'')===campaignId&&row?.campaignInternalId)priorIds.add(String(row.campaignInternalId))};
      for(const capture of base.google_ads_api_daily_captures||[])if(accountKey(canonicalAccountId(capture?.managerCustomerId),canonicalAccountId(capture?.customerId))===accountKey(manager,customer)){for(const row of capture.rows||[])collect(row);for(const row of capture.configuration?.campaigns||[])collect(row)}
      for(const saved of base.google_ads_api_capture_snapshots||[])for(const savedAccount of saved.accounts||[])if(accountKey(canonicalAccountId(savedAccount?.managerCustomerId),canonicalAccountId(savedAccount?.customerId))===accountKey(manager,customer))for(const row of savedAccount.campaigns||[])collect(row);
      for(const history of base.google_ads_api_change_history||[])for(const row of history.changes||[])if(accountKey(canonicalAccountId(row?.managerCustomerId),canonicalAccountId(row?.customerId))===accountKey(manager,customer))collect(row);
      if(priorIds.size>1){conflicts.push(`${campaignName}: IDs locais anteriores divergentes.`);continue}
      let campaign=null;
      const priorId=priorIds.size?[...priorIds][0]:null;
      if(priorId){const prior=base.campanhas.find(item=>String(item?.id)===priorId),sameExternalIdentity=String(prior?.google_ads_campaign_id||'')===campaignId;if(!prior||!sameAccount(prior,candidate)||(!sameCampaign(prior,candidate)&&!sameExternalIdentity)||(prior.google_ads_campaign_id&&!sameExternalIdentity)){conflicts.push(`${campaignName}: vínculo local anterior incompatível.`);continue}campaign=prior}
      if(!campaign){const matches=base.campanhas.filter(item=>String(item?.google_ads_campaign_id||'')===campaignId&&sameAccount(item,candidate));if(matches.length>1){conflicts.push(`${campaignName}: mais de um cadastro local já usa o ID da campanha.`);continue}if(matches.length===1)campaign=matches[0]}
      if(!campaign){const matches=base.campanhas.filter(item=>!item?.google_ads_campaign_id&&sameCampaign(item,candidate));if(matches.length===1)campaign=matches[0]}
      if(!campaign){
        const id=`cmp_gads_${manager?.replace(/\D/g,'')||'direct'}_${customer.replace(/\D/g,'')}_${campaignId}`;
        if(base.campanhas.some(item=>String(item?.id)===id)){conflicts.push(`${campaignName}: ID interno calculado já está ocupado.`);continue}
        campaign={id,nome_mcc:campaignName,nome_exibicao:displayName(campaignName),conta_id:customer,...(manager?{mcc_id:manager}:{}),...(candidate.accountName?{conta_nome:candidate.accountName}:{}),google_ads_campaign_id:campaignId,google_ads_campaign_origem:'google_ads_api_snapshot',google_ads_snapshot_registered_at_utc:now,google_ads_snapshot_observed_at_utc:candidate.snapshotAtUtc,estado_campanha_observado:status,status:status==='ENABLED'?'ativa':'pausada',apiSnapshotOnly:true};base.campanhas.push(campaign);registered.push(campaign.id);changed=true;
      }else{
        if(campaign.google_ads_campaign_id&&String(campaign.google_ads_campaign_id)!==campaignId){conflicts.push(`${campaignName}: o cadastro local já está ligado a outro ID Google Ads.`);continue}
        if(!campaign.google_ads_campaign_id){campaign.google_ads_campaign_id=campaignId;if(!campaign.google_ads_campaign_origem)campaign.google_ads_campaign_origem='google_ads_api_snapshot';linked.push(campaign.id);changed=true}
        if(!campaign.mcc_id&&manager){campaign.mcc_id=manager;changed=true}
        if(!campaign.conta_nome&&candidate.accountName){campaign.conta_nome=candidate.accountName;changed=true}
        if(campaign.apiSnapshotOnly===true&&campaign.nome_mcc!==campaignName){campaign.nome_mcc=campaignName;campaign.nome_exibicao=displayName(campaignName);changed=true}
        if(campaign.apiSnapshotOnly===true&&Date.parse(candidate.snapshotAtUtc)>Date.parse(campaign.google_ads_snapshot_observed_at_utc||'')){
          campaign.google_ads_snapshot_observed_at_utc=candidate.snapshotAtUtc;campaign.estado_campanha_observado=status;campaign.status=status==='ENABLED'?'ativa':'pausada';refreshed.push(campaign.id);changed=true;
        }
      }
      const automaticPause=latestConfirmedAutomaticPause(base,campaign.id),reactivationConfirmed=status==='ENABLED'&&automaticPause&&(automaticPause.occurredAtUtc?Date.parse(candidate.snapshotAtUtc)>Date.parse(automaticPause.occurredAtUtc):account.date>automaticPause.date);
      if(reactivationConfirmed&&(!campaign.reativada_em||account.date>campaign.reativada_em||campaign.status==='pausada'||campaign.pausada_em||campaign.pausa_confirmada_em)){
        campaign.reativada_em=campaign.reativada_em&&campaign.reativada_em>account.date?campaign.reativada_em:account.date;campaign.status='ativa';campaign.status_origem='presente_na_coleta';campaign.estado_campanha_observado='ENABLED';delete campaign.pausada_em;delete campaign.pausa_confirmada_em;changed=true;
      }
      mappingRows(candidate,campaign);
    }
    if(changed)base.atualizado_em=now;
    return{base,changed,registeredCount:registered.length,linkedCount:linked.length,refreshedCount:refreshed.length,conflicts};
  }
  function registerGoogleAdsHubCreatedCampaigns(baseInput,campaigns,{source='verified_create_response',now=new Date().toISOString()}={}){
    if(!baseInput||baseInput.schema!==SCHEMA)throw new Error('A base local válida precisa estar carregada antes de vincular campanhas do Hub.');
    if(!Array.isArray(campaigns))throw new Error('A lista de campanhas do Hub não foi reconhecida.');
    if(!['verified_create_response','saved_hub_batch'].includes(source))throw new Error('A origem das campanhas não está autorizada para vínculo local.');
    const base=normalize(baseInput),conflicts=[],registered=[],linkedExisting=[],alreadyRegistered=[],linkedCaptureRows=new Set(),linkedSnapshotRows=new Set(),linkedHistoryRows=new Set(),accountKey=(manager,account)=>`${manager||'direct'}|${account}`,sameIdentity=(campaign,item)=>String(campaign?.nome_mcc||'').trim()===item.campaignName&&canonicalAccountId(campaign?.conta_id)===item.customerId&&(canonicalAccountId(campaign?.mcc_id)||null)===item.managerCustomerId;
    let changed=false;
    const updatesFor=(item,campaign)=>{
      const mark=(row,collection,key)=>{
        if(String(row?.campaignId||'')!==item.campaignId)return;
        const rowName=String(row?.campaignName||'').trim();if(rowName&&rowName!==item.campaignName)return;
        if(row?.campaignInternalId&&String(row.campaignInternalId)!==String(campaign.id)){conflicts.push(`${item.campaignName}: uma captura já aponta para outra campanha local.`);return}
        if(row.campaignInternalId!==campaign.id||row.mappingStatus!=='mapped'){
          row.campaignInternalId=campaign.id;row.mappingStatus='mapped';changed=true;
          if(collection==='capture')linkedCaptureRows.add(key);else if(collection==='snapshot')linkedSnapshotRows.add(key);else linkedHistoryRows.add(key);
        }
      };
      for(const capture of base.google_ads_api_daily_captures||[]){if(canonicalAccountId(capture?.customerId)!==item.customerId||(canonicalAccountId(capture?.managerCustomerId)||null)!==item.managerCustomerId)continue;for(const row of capture.rows||[])mark(row,'capture',`${capture.customerId}|${capture.managerCustomerId||''}|${capture.date}|${item.campaignId}`);for(const row of capture.configuration?.campaigns||[])mark(row,'capture',`${capture.customerId}|${capture.managerCustomerId||''}|${capture.date}|configuration|${item.campaignId}`)}
      for(const snapshot of base.google_ads_api_capture_snapshots||[]){for(const account of snapshot.accounts||[]){if(canonicalAccountId(account?.customerId)!==item.customerId||(canonicalAccountId(account?.managerCustomerId)||null)!==item.managerCustomerId)continue;for(const row of account.campaigns||[])mark(row,'snapshot',`${snapshot.id}|${account.customerId}|${item.campaignId}`)}}
      for(const history of base.google_ads_api_change_history||[]){for(const row of history.changes||[]){if(canonicalAccountId(row?.customerId)!==item.customerId||(canonicalAccountId(row?.managerCustomerId)||null)!==item.managerCustomerId)continue;mark(row,'history',`${history.id}|${item.campaignId}`)}}
    };
    for(const raw of campaigns){
      const managerDigits=String(raw?.managerCustomerId??'').replace(/\D/g,''),customerDigits=String(raw?.customerId??'').replace(/\D/g,''),campaignId=String(raw?.campaignId??''),campaignName=String(raw?.campaignName??'').trim(),status=String(raw?.status??'').toUpperCase(),trusted=source==='saved_hub_batch'?['PAUSED','ENABLED'].includes(status):raw?.verified===true&&status==='PAUSED';
      if(raw?.source!=='created'||!trusted||!/^\d{10}$/.test(customerDigits)||(managerDigits&&!/^\d{10}$/.test(managerDigits))||!/^[1-9]\d{0,19}$/.test(campaignId)||!campaignName||campaignName.length>240){conflicts.push('Uma campanha foi ignorada porque não é uma criação confirmada com conta, nome, ID e estado válido no lote.');continue}
      const item={managerCustomerId:managerDigits?canonicalAccountId(managerDigits):null,customerId:canonicalAccountId(customerDigits),campaignId,campaignName,accountName:String(raw.accountName||'').trim().slice(0,240),status};
      const priorIds=new Set();
      for(const capture of base.google_ads_api_daily_captures||[]){if(canonicalAccountId(capture?.customerId)!==item.customerId||(canonicalAccountId(capture?.managerCustomerId)||null)!==item.managerCustomerId)continue;for(const row of capture.rows||[]){if(String(row?.campaignId||'')!==item.campaignId)continue;if(String(row?.campaignName||'').trim()!==item.campaignName){conflicts.push(`${item.campaignName}: o ID ${item.campaignId} já aparece com outro nome na captura.`);continue}if(row?.campaignInternalId)priorIds.add(String(row.campaignInternalId))}}
      if(priorIds.size>1){conflicts.push(`${item.campaignName}: o ID da API já aponta para mais de uma campanha local.`);continue}
      let campaign=null;
      const sameExternalId=base.campanhas.filter(row=>String(row?.google_ads_campaign_id||'')===item.campaignId&&canonicalAccountId(row?.conta_id)===item.customerId&&(canonicalAccountId(row?.mcc_id)||null)===item.managerCustomerId);
      if(sameExternalId.length){if(sameExternalId.length!==1||!sameIdentity(sameExternalId[0],item)){conflicts.push(`${item.campaignName}: o ID da Google Ads API já está vinculado a uma identidade diferente.`);continue}campaign=sameExternalId[0]}
      if(!campaign&&priorIds.size===1){const prior=base.campanhas.find(row=>String(row.id)=== [...priorIds][0]);if(!prior||!sameIdentity(prior,item)){conflicts.push(`${item.campaignName}: a captura anterior não corresponde à conta, MCC e nome confirmados pelo Hub.`);continue}campaign=prior}
      if(!campaign){
        const nameMatches=base.campanhas.filter(row=>String(row?.nome_mcc||'').trim()===item.campaignName),scoped=nameMatches.filter(row=>canonicalAccountId(row?.conta_id)===item.customerId&&(canonicalAccountId(row?.mcc_id)||null)===item.managerCustomerId);
        if(scoped.length>1){conflicts.push(`${item.campaignName}: há mais de um registro local com o mesmo nome, conta e MCC.`);continue}
        if(scoped.length===1)campaign=scoped[0];
        else if(nameMatches.some(row=>canonicalAccountId(row?.conta_id)===item.customerId)){conflicts.push(`${item.campaignName}: o nome existe na mesma conta, mas com MCC ou vínculo incompatível.`);continue}
      }
      if(!campaign){
        const id=`cmp_gads_${item.managerCustomerId?.replace(/\D/g,'')||'direct'}_${item.customerId.replace(/\D/g,'')}_${item.campaignId}`;
        if(base.campanhas.some(row=>String(row.id)===id)){conflicts.push(`${item.campaignName}: o ID interno calculado já pertence a outro registro.`);continue}
        campaign={id,nome_mcc:item.campaignName,nome_exibicao:displayName(item.campaignName),status:item.status==='ENABLED'?'ativa':'pausada',conta_id:item.customerId,...(item.managerCustomerId?{mcc_id:item.managerCustomerId}:{}),...(item.accountName?{conta_nome:item.accountName}:{}),google_ads_campaign_id:item.campaignId,google_ads_campaign_origem:'hub_created',estado_campanha_observado:item.status};
        base.campanhas.push(campaign);registered.push(campaign.id);changed=true;
      }else{
        if(campaign.google_ads_campaign_id&&String(campaign.google_ads_campaign_id)!==item.campaignId){conflicts.push(`${item.campaignName}: o registro local já está ligado a outro ID da Google Ads API.`);continue}
        if(!sameIdentity(campaign,item)){conflicts.push(`${item.campaignName}: o registro local não corresponde à conta, MCC e nome confirmados pelo Hub.`);continue}
        const wasAlreadyRegistered=String(campaign.google_ads_campaign_id||'')===item.campaignId;
        if(campaign.google_ads_campaign_id!==item.campaignId){campaign.google_ads_campaign_id=item.campaignId;campaign.google_ads_campaign_origem='hub_created';changed=true}
        if(campaign.apiSnapshotOnly===true){delete campaign.apiSnapshotOnly;campaign.google_ads_campaign_origem='hub_created';changed=true}
        if(source==='verified_create_response'&&campaign.estado_campanha_observado!==item.status){campaign.estado_campanha_observado=item.status;changed=true}
        if(wasAlreadyRegistered)alreadyRegistered.push(campaign.id);else linkedExisting.push(campaign.id);
      }
      updatesFor(item,campaign);
    }
    if(changed)base.atualizado_em=now;
    return{base,registeredCount:registered.length,linkedExistingCount:linkedExisting.length,alreadyRegisteredCount:alreadyRegistered.length,linkedCaptureCount:linkedCaptureRows.size,linkedSnapshotCount:linkedSnapshotRows.size,linkedHistoryCount:linkedHistoryRows.size,conflicts,changed};
  }
  function googleAdsHubCampaignRecoveryStatus(baseInput,campaigns){
    if(!Array.isArray(campaigns))throw new Error('A lista de campanhas do Hub não foi reconhecida.');
    const base=baseInput?.schema===SCHEMA?baseInput:null,rows=Array.isArray(base?.campanhas)?base.campanhas:[],pendingCampaigns=[];
    let alreadyRegisteredCount=0;
    for(const item of campaigns){
      const manager=canonicalAccountId(item?.managerCustomerId),customer=canonicalAccountId(item?.customerId),campaignId=String(item?.campaignId??''),campaignName=String(item?.campaignName??'').trim();
      const exactMatches=customer&&campaignId&&campaignName?rows.filter(row=>String(row?.google_ads_campaign_id||'')===campaignId&&String(row?.nome_mcc||'').trim()===campaignName&&canonicalAccountId(row?.conta_id)===customer&&(canonicalAccountId(row?.mcc_id)||null)===manager):[];
      if(exactMatches.length===1)alreadyRegisteredCount++;
      else pendingCampaigns.push(item);
    }
    return{totalCount:campaigns.length,pendingCampaigns,alreadyRegisteredCount};
  }
  function googleAdsCaptureDifferences(previous,current){
    if(!previous||!current)return{changedCampaigns:[],comparedCampaigns:0};
    const metricFields=['impressions','clicks','costMicros','conversions','conversionsValue'],configurationFields=['campaignName','campaignStatus','primaryStatus','primaryStatusReasons','biddingStrategyType','biddingStrategyResource','targetCpaMicros','targetCpaResolution','budgetPeriod','budgetAmountMicros','budgetTotalAmountMicros','budgetShared'];
    const oldRows=new Map((previous.rows||[]).map(row=>[String(row.campaignId),row])),newRows=new Map((current.rows||[]).map(row=>[String(row.campaignId),row]));
    const oldConfig=new Map((previous.configuration?.complete===true?previous.configuration.campaigns:[]).map(row=>[String(row.campaignId),row])),newConfig=new Map((current.configuration?.complete===true?current.configuration.campaigns:[]).map(row=>[String(row.campaignId),row]));
    const ids=new Set([...oldRows.keys(),...newRows.keys(),...oldConfig.keys(),...newConfig.keys()]),changedCampaigns=[];const comparedCampaignIds=new Set();
    for(const campaignId of ids){
      const beforeRow=oldRows.get(campaignId),afterRow=newRows.get(campaignId),beforeConfig=oldConfig.get(campaignId),afterConfig=newConfig.get(campaignId),fields=[];
      if(beforeRow&&afterRow){
        comparedCampaignIds.add(campaignId);
        for(const key of metricFields){if(['costMicros','conversionsValue'].includes(key)&&previous.currencyCode!==current.currencyCode)continue;const before=beforeRow[key],after=afterRow[key];if(before!=null&&after!=null&&Number(before)!==Number(after))fields.push({key,before:Number(before),after:Number(after)})}
      }
      if(beforeConfig&&afterConfig){
        comparedCampaignIds.add(campaignId);
        for(const key of configurationFields){const before=beforeConfig[key],after=afterConfig[key];if(before==null||after==null||before===''||after==='')continue;const same=Array.isArray(before)||Array.isArray(after)?JSON.stringify(before)===JSON.stringify(after):before===after;if(!same)fields.push({key,before:clone(before),after:clone(after)})}
      }
      if(fields.length){const row=afterRow||afterConfig||beforeRow||beforeConfig;changedCampaigns.push({date:current.date,campaignId,campaignInternalId:afterRow?.campaignInternalId||afterConfig?.campaignInternalId||beforeRow?.campaignInternalId||beforeConfig?.campaignInternalId||null,campaignName:String(afterRow?.campaignName||afterConfig?.campaignName||beforeRow?.campaignName||beforeConfig?.campaignName||'Campanha sem nome').slice(0,240),fields})}
    }
    return{changedCampaigns,comparedCampaignCount:comparedCampaignIds.size};
  }
  function googleAdsCaptureFromSnapshot(snapshot,account){
    const campaigns=Array.isArray(account?.campaigns)?account.campaigns:[],rows=campaigns.filter(item=>item?.metricsAvailable===true).map(item=>({campaignId:String(item.campaignId||''),campaignInternalId:item.campaignInternalId||null,campaignName:String(item.campaignName||''),campaignStatus:String(item.campaignStatus||''),channelType:String(item.channelType||''),impressions:item.impressions??null,clicks:item.clicks??null,conversions:item.conversions??null,costMicros:item.costMicros??null,conversionsValue:item.conversionsValue??null})),configuration=account?.configurationComplete===true?{complete:true,campaigns:campaigns.map(item=>({campaignId:String(item.campaignId||''),campaignInternalId:item.campaignInternalId||null,campaignName:String(item.campaignName||''),campaignStatus:String(item.campaignStatus||''),channelType:String(item.channelType||'')}))}:null;
    return{managerCustomerId:account?.managerCustomerId||null,customerId:String(account?.customerId||''),managerName:String(account?.managerName||''),accountName:String(account?.accountName||''),date:String(account?.date||''),currencyCode:String(account?.currencyCode||''),timeZone:String(account?.timeZone||''),businessTimeZone:snapshot?.periodType==='D-1'?'America/Sao_Paulo':null,campaignStatusFilter:String(account?.scope||snapshot?.scope||'ALL'),queryComplete:account?.queryComplete===true,configuration,rows,capturedAtUtc:snapshot?.completedAtUtc||''};
  }
  function findGoogleAdsCaptureBaseline(current,previousCaptures,previousSnapshots,{periodType='Janela',allowEarlierDate=false,now=new Date().toISOString()}={}){
    const manager=String(current?.managerCustomerId||'').replace(/\D/g,'')||'direct',customer=String(current?.customerId||'').replace(/\D/g,''),scope=String(current?.campaignStatusFilter||'ALL'),currentTime=Date.parse(current?.capturedAtUtc||now),candidates=[];
    const add=(capture,capturedAtUtc)=>{
      const time=Date.parse(capturedAtUtc||capture?.capturedAtUtc||capture?.generatedAtUtc||'');
      if(!capture||(String(capture.managerCustomerId||'').replace(/\D/g,'')||'direct')!==manager)return;
      if(String(capture.customerId||'').replace(/\D/g,'')!==customer||capture.queryComplete!==true||!Array.isArray(capture.rows)||!/^\d{4}-\d{2}-\d{2}$/.test(String(capture.date||''))||String(capture.date)>String(current.date||''))return;
      if(String(capture.campaignStatusFilter||'ALL')!==scope||!Number.isFinite(time)||!Number.isFinite(currentTime)||time>currentTime)return;
      const capturePeriod=capture.businessTimeZone==='America/Sao_Paulo'?'D-1':'D0';
      if(periodType==='D-1'&&capturePeriod!=='D-1'||periodType==='D0'&&capturePeriod!=='D0')return;
      candidates.push({capture,time});
    };
    for(const capture of previousCaptures||[])add(capture,capture?.capturedAtUtc||capture?.generatedAtUtc);
    for(const snapshot of previousSnapshots||[]){
      if(snapshot?.periodType!==periodType)continue;
      for(const account of snapshot.accounts||[]){
        const sameManager=(String(account?.managerCustomerId||'').replace(/\D/g,'')||'direct')===manager;
        if(!sameManager||String(account?.customerId||'').replace(/\D/g,'')!==customer)continue;
        add(googleAdsCaptureFromSnapshot(snapshot,account),snapshot.completedAtUtc);
      }
    }
    const exact=candidates.filter(item=>item.capture.date===current.date);
    const eligible=exact.length?exact:allowEarlierDate?candidates.filter(item=>item.capture.date<current.date):[];
    eligible.sort((a,b)=>b.time-a.time||String(b.capture.date).localeCompare(String(a.capture.date)));
    return eligible[0]||null;
  }
  function mergeGoogleAdsCaptureHistory(...sources){
    const entries=new Map();let sequence=0;
    for(const source of sources){
      if(!Array.isArray(source))continue;
      for(const entry of source){
        if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
        const id=String(entry.id||'').trim();if(!id||!Number.isFinite(Date.parse(entry.completedAtUtc||''))||!validGoogleAdsCaptureHistoryEntry(entry))continue;
        const key=id;
        const previous=entries.get(key),completedAt=Date.parse(entry.completedAtUtc||'');
        if(!previous||Number.isFinite(completedAt)&&(!Number.isFinite(previous.completedAt)||completedAt>previous.completedAt))entries.set(key,{entry,completedAt:Number.isFinite(completedAt)?completedAt:null,sequence:sequence++});
      }
    }
    return pruneGoogleAdsCaptureHistory([...entries.values()].sort((a,b)=>(a.completedAt??-Infinity)-(b.completedAt??-Infinity)||a.sequence-b.sequence).map(item=>item.entry));
  }
  function appendClickBankSaleDetectedHistory(base,sales,now=new Date().toISOString()){
    if(!base||!Array.isArray(sales))throw new Error('A base e a lista de vendas são necessárias para registrar a venda no histórico.');
    const detectedAt=new Date(now);if(!Number.isFinite(detectedAt.getTime()))throw new Error('Horário de detecção da venda inválido.');
    const existing=Array.isArray(base.google_ads_api_change_history)?base.google_ads_api_change_history:[],known=new Set(existing.filter(item=>item?.eventType==='clickbank_sale_detected').map(item=>String(item.id||''))),additions=[];
    for(const item of sales){
      const sale=item?.sale||item,transactionId=String(sale?.transactionId||sale?.transaction_id||'').trim();
      if(!/^\d{1,20}$/.test(transactionId)||/^0+$/.test(transactionId))continue;
      const id=`clickbank-sale:${transactionId}`;if(known.has(id))continue;
      const transactionTime=String(sale?.transactionTimeUtc||sale?.transaction_time_utc||'').trim(),receivedTime=String(sale?.receivedAtUtc||sale?.received_at_utc||'').trim(),saleTime=Number.isFinite(Date.parse(transactionTime))?transactionTime:Number.isFinite(Date.parse(receivedTime))?receivedTime:detectedAt.toISOString(),saleTimeSource=saleTime===transactionTime?'transaction':saleTime===receivedTime?'received':'detected';
      const commissionRaw=sale?.commissionTotal??sale?.commission_total??null,commission=commissionRaw==null||commissionRaw===''?null:String(commissionRaw),currency=String(sale?.commissionCurrency||sale?.commission_currency||'').trim();
      if(commission!==null&&!/^\d{1,10}(?:\.\d{1,4})?$/.test(commission))continue;
      const productName=String(item?.productName||'').trim().slice(0,160),productKey=String(sale?.productKey||sale?.product_key||'').trim().slice(0,120),presellHost=String(sale?.presellHost||sale?.presell_host||'').trim().slice(0,253);
      additions.push({id,eventType:'clickbank_sale_detected',completedAtUtc:detectedAt.toISOString(),saleOccurredAtUtc:saleTime,saleTimeSource,transactionId,productName:productName||productKey||'Produto não identificado',productKey:productKey||null,presellHost:presellHost||null,commissionTotal:commission,currencyCode:/^[A-Z]{3}$/.test(currency)?currency:null,attributionStatus:['matched','unmatched','ambiguous'].includes(sale?.attributionStatus||sale?.attribution_status)?sale.attributionStatus||sale.attribution_status:'unmatched',campaignAttribution:'unavailable',changes:[]});
      known.add(id);
    }
    if(!additions.length)return{base,events:[],changed:false};
    const next={...base,google_ads_api_change_history:pruneGoogleAdsCaptureHistory([...existing,...additions])};
    return{base:next,events:additions,changed:true};
  }
  function appendGoogleAdsAutomaticPauseHistory(base,{campaignId,googleCampaignId,managerCustomerId,customerId,managerName,accountName,campaignName,occurredAtUtc,rule,thresholdDays,maxImpressions,thresholdClicks},now=new Date().toISOString()){
    const instant=new Date(occurredAtUtc);if(!occurredAtUtc||!Number.isFinite(instant.getTime()))throw new Error('Horário da pausa automática inválido.');
    const manager=String(managerCustomerId||'').replace(/\D/g,''),account=String(customerId||'').replace(/\D/g,''),googleId=String(googleCampaignId||'').trim(),internalId=String(campaignId||'').trim(),name=String(campaignName||'').trim();
    if(!/^\d{10}$/.test(account)||manager&&!/^\d{10}$/.test(manager)||!/^\d{1,20}$/.test(googleId)||!internalId||!name)throw new Error('A campanha não tem vínculo completo para registrar a pausa no histórico da API.');
    const completedAtUtc=instant.toISOString(),id=`google-ads-auto-pause:${internalId}:${completedAtUtc}`,safeThresholdDays=rule==='campaign_age'&&Number.isSafeInteger(thresholdDays)&&thresholdDays>0?thresholdDays:null,safeMaxImpressions=rule==='campaign_age'&&Number.isSafeInteger(maxImpressions)&&maxImpressions>=0?maxImpressions:null,safeThresholdClicks=rule==='clicks_without_sale'&&Number.isSafeInteger(thresholdClicks)&&thresholdClicks>=0&&thresholdClicks<=99?thresholdClicks:null,ruleLabels={negative_remaining:'Valor restante negativo',product_performance:'Desempenho do mesmo produto',campaign_age:safeThresholdDays?`Campanha acima do limite de ${safeThresholdDays} dias${safeMaxImpressions==null?'':` e até ${safeMaxImpressions} impressões`}`:'Campanha acima do limite de dias',campaign_zero_impressions:'Dias sem impressões',minimum_product_performance:'Concorrente pausada após a referência atingir os mínimos de impressões e cliques',reference_competitor:'Concorrente mais próxima da referência por impressões',clicks_without_sale:safeThresholdClicks==null?'Limite de cliques sem venda':`Limite de ${safeThresholdClicks} cliques acumulados sem venda`},reason=ruleLabels[rule]||'Regra de pausa automática',existingEntry=(base?.google_ads_api_change_history||[]).find(item=>String(item?.id||'')===id);
    if(existingEntry){
      const existingChange=(existingEntry.changes||[]).find(change=>String(change?.campaignInternalId||'')===internalId&&String(change?.campaignId||'')===googleId&&String(change?.customerId||'').replace(/\D/g,'')===account&&String(change?.managerCustomerId||'').replace(/\D/g,'')===manager);
      if(!existingChange||!Object.hasOwn(ruleLabels,rule))return base;
      const additions={};
      if(!existingChange.rule)additions.rule=rule;
      if((!String(existingChange.reason||'').trim()||existingChange.reason==='Regra de pausa automática')&&reason)additions.reason=reason;
      if(safeThresholdDays!=null&&existingChange.thresholdDays==null)additions.thresholdDays=safeThresholdDays;
      if(safeMaxImpressions!=null&&existingChange.maxImpressions==null)additions.maxImpressions=safeMaxImpressions;
      if(safeThresholdClicks!=null&&existingChange.thresholdClicks==null)additions.thresholdClicks=safeThresholdClicks;
      if(!Object.keys(additions).length)return base;
      const updated=clone(base),entry=updated.google_ads_api_change_history.find(item=>String(item?.id||'')===id),change=(entry?.changes||[]).find(item=>String(item?.campaignInternalId||'')===internalId&&String(item?.campaignId||'')===googleId&&String(item?.customerId||'').replace(/\D/g,'')===account&&String(item?.managerCustomerId||'').replace(/\D/g,'')===manager);
      if(!change)return base;
      Object.assign(change,additions);updated.atualizado_em=now;return updated;
    }
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant),part=type=>parts.find(item=>item.type===type)?.value||'',date=`${part('year')}-${part('month')}-${part('day')}`;
    const entry={id,eventType:'automatic_pause',completedAtUtc,periodType:'Ação',executionMode:'automatic',status:'completed',scope:'CAMPAIGN',accountCount:1,managerCount:manager?1:0,captureDatesWithBaseline:0,captureDatesWithoutBaseline:0,comparedCampaignDateCount:0,diffRowCount:1,changedFieldCount:1,changes:[{managerCustomerId:manager||null,managerName:String(managerName||manager||'MCC não identificada').slice(0,100),customerId:account,accountName:String(accountName||`Conta ${account}`).slice(0,160),currencyCode:'',date,campaignId:googleId,campaignInternalId:internalId,campaignName:name.slice(0,240),reason,rule,...(safeThresholdDays?{thresholdDays:safeThresholdDays}:{}),...(safeMaxImpressions!=null?{maxImpressions:safeMaxImpressions}:{}),...(safeThresholdClicks!=null?{thresholdClicks:safeThresholdClicks}:{}),fields:[{key:'campaignStatus',before:'ENABLED',after:'PAUSED'}]}]};
    const updated=clone(base);updated.google_ads_api_change_history=mergeGoogleAdsCaptureHistory(updated.google_ads_api_change_history,[entry]);updated.atualizado_em=now;return updated;
  }
  function appendGoogleAdsObservedAutomaticPauseHistory(base,{campaignId,googleCampaignId,managerCustomerId,customerId,managerName,accountName,campaignName,captureRecordId,observedFromUtc,observedToUtc,beforeStatus,afterStatus},now=new Date().toISOString()){
    const manager=String(managerCustomerId||'').replace(/\D/g,''),account=String(customerId||'').replace(/\D/g,''),googleId=String(googleCampaignId||'').trim(),internalId=String(campaignId||'').trim(),name=String(campaignName||'').trim(),captureId=String(captureRecordId||'').trim();
    const from=new Date(observedFromUtc),to=new Date(observedToUtc),recorded=new Date(now),before=String(beforeStatus||'').trim().toUpperCase(),after=String(afterStatus||'').trim().toUpperCase();
    if(!/^\d{10}$/.test(account)||manager&&!/^\d{10}$/.test(manager)||!/^[1-9]\d{0,19}$/.test(googleId)||!internalId||!name||!captureId||!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to||!Number.isFinite(recorded.getTime())||before==='PAUSED'||after!=='PAUSED')throw new Error('A transição observada não tem vínculo ou intervalo válido para registrar.');
    const id=`google-ads-auto-pause-observed:${internalId}:${captureId}`,existing=Array.isArray(base?.google_ads_api_change_history)&&base.google_ads_api_change_history.some(item=>String(item?.id||'')===id);if(existing)return base;
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(to),part=type=>parts.find(item=>item.type===type)?.value||'',date=`${part('year')}-${part('month')}-${part('day')}`;
    const entry={id,eventType:'automatic_pause_observed',completedAtUtc:recorded.toISOString(),recordedAtUtc:recorded.toISOString(),observedFromUtc:from.toISOString(),observedToUtc:to.toISOString(),captureRecordId:captureId,reportedByUser:true,periodType:'Ação',executionMode:'manual',status:'observed',scope:'CAMPAIGN',accountCount:1,managerCount:manager?1:0,captureDatesWithBaseline:0,captureDatesWithoutBaseline:0,comparedCampaignDateCount:0,diffRowCount:1,changedFieldCount:1,changes:[{managerCustomerId:manager||null,managerName:String(managerName||manager||'MCC não identificada').slice(0,100),customerId:account,accountName:String(accountName||`Conta ${account}`).slice(0,160),currencyCode:'',date,campaignId:googleId,campaignInternalId:internalId,campaignName:name.slice(0,240),reason:'Transição ativa → pausada observada entre snapshots; regra e horário exato não disponíveis.',source:'user_reported_snapshot_transition',fields:[{key:'campaignStatus',before,after}]}]};
    const updated=clone(base);updated.google_ads_api_change_history=mergeGoogleAdsCaptureHistory(updated.google_ads_api_change_history,[entry]);updated.atualizado_em=recorded.toISOString();return updated;
  }
  function buildGoogleAdsCaptureHistoryEntry(previousCaptures,nextCaptures,{now,businessDayCapture,activeCampaignsOnly,executionMode='manual',executionPass='initial',triggerReason=null,triggerAccountCount=0,previousSnapshots=[]}={}){
    const dates=[...new Set(nextCaptures.map(item=>item.date))].sort(),isD0=nextCaptures.length>0&&nextCaptures.every(item=>item.date===googleAdsDateInTimeZone(item.timeZone,new Date(now))),periodType=businessDayCapture?'D-1':isD0?'D0':'Janela';
    const comparisons=nextCaptures.map(current=>{const baseline=findGoogleAdsCaptureBaseline(current,previousCaptures,previousSnapshots,{periodType,allowEarlierDate:false,now}),previous=baseline?.capture||null;return{current,previous,baselineCapturedAtUtc:previous?.capturedAtUtc||previous?.generatedAtUtc||null,...googleAdsCaptureDifferences(previous,current)}});
    const comparisonBaselines=comparisons.filter(item=>item.previous).map(item=>({managerCustomerId:item.current.managerCustomerId||null,customerId:item.current.customerId,accountName:String(item.current.accountName||'').slice(0,160),currentDate:item.current.date,referenceDate:item.previous.date,capturedAtUtc:item.baselineCapturedAtUtc,periodType,scope:item.current.campaignStatusFilter||'ALL'}));
    const changes=comparisons.flatMap(item=>item.changedCampaigns.map(change=>({managerCustomerId:item.current.managerCustomerId||null,managerName:String(item.current.managerName||item.previous?.managerName||item.current.managerCustomerId||'Conta direta').slice(0,100),customerId:item.current.customerId,accountName:item.current.accountName,currencyCode:item.current.currencyCode,baselineDate:item.previous?.date||null,baselineCapturedAtUtc:item.baselineCapturedAtUtc,...change})));
    const accountDirectoryChange=executionMode==='automatic'&&triggerReason==='account_directory_change';
    return{id:`${now}:${Math.random().toString(36).slice(2,10)}`,completedAtUtc:now,periodType,dateFrom:dates[0]||null,dateTo:dates.at(-1)||null,dates,scope:activeCampaignsOnly?'ENABLED':'ALL',executionMode:executionMode==='automatic'?'automatic':'manual',...(executionMode==='automatic'&&executionPass==='reconciliation'?{executionPass:'reconciliation'}:{}),...(accountDirectoryChange?{triggerReason:'account_directory_change',triggerAccountCount:Math.max(1,Math.min(1000,Math.trunc(Number(triggerAccountCount)||1)))}:{}),accountCount:new Set(nextCaptures.map(item=>`${item.managerCustomerId||'direct'}|${item.customerId}`)).size,managerCount:new Set(nextCaptures.map(item=>item.managerCustomerId||'direct')).size,captureDatesWithBaseline:comparisons.filter(item=>item.previous).length,captureDatesWithoutBaseline:comparisons.filter(item=>!item.previous).length,comparisonBaselines,comparedCampaignDateCount:comparisons.reduce((sum,item)=>sum+item.comparedCampaignCount,0),diffRowCount:changes.length,changedFieldCount:changes.reduce((sum,item)=>sum+item.fields.length,0),changes};
  }
  function reconcileGoogleAdsCaptureHistoryComparisons(history,snapshots,captures=[]){
    const savedSnapshots=Array.isArray(snapshots)?snapshots:[],savedCaptures=Array.isArray(captures)?captures:[];
    return(Array.isArray(history)?history:[]).map(record=>{
      if(record?.executionMode!=='automatic'||!['D0','D-1'].includes(record.periodType)||record.status==='failed')return record;
      const storedBaselines=Array.isArray(record.comparisonBaselines)?record.comparisonBaselines:null,storedChanges=Array.isArray(record.changes)?record.changes:[],hasStoredCrossDateBaseline=storedBaselines?.some(item=>item?.currentDate&&item?.referenceDate&&item.currentDate!==item.referenceDate)===true,hasStoredCrossDateChange=storedChanges.some(item=>item?.baselineDate&&item?.date&&item.baselineDate!==item.date);
      if(storedBaselines&&!hasStoredCrossDateBaseline&&!hasStoredCrossDateChange&&storedChanges.every(item=>item?.baselineDate&&item?.date&&item.baselineDate===item.date||!item?.baselineDate&&!item?.date))return record;
      const snapshot=savedSnapshots.find(item=>String(item?.runId||item?.id||'')===String(record.id||'')),snapshotTime=Date.parse(snapshot?.completedAtUtc||'');
      if(!snapshot||!Number.isFinite(snapshotTime)||!Array.isArray(snapshot.accounts)){
        const oldBaselines=Array.isArray(record.comparisonBaselines)?record.comparisonBaselines:[],oldChanges=Array.isArray(record.changes)?record.changes:[],hasCrossDateBaseline=oldBaselines.some(item=>item?.currentDate&&item?.referenceDate&&item.currentDate!==item.referenceDate),hasCrossDateChange=oldChanges.some(item=>item?.baselineDate&&item?.date&&item.baselineDate!==item.date);
        if(!hasCrossDateBaseline&&!hasCrossDateChange)return record;
        const comparisonBaselines=oldBaselines.filter(item=>!item?.currentDate||!item?.referenceDate||item.currentDate===item.referenceDate),changes=oldChanges.filter(item=>!item?.baselineDate||!item?.date||item.baselineDate===item.date),accountCount=Math.max(0,Number(record.accountCount)||0);
        return{...record,crossDateComparisonsSuppressed:true,captureDatesWithBaseline:comparisonBaselines.length,captureDatesWithoutBaseline:Math.max(0,accountCount-comparisonBaselines.length),comparisonBaselines,comparedCampaignDateCount:comparisonBaselines.length?Number(record.comparedCampaignDateCount)||changes.length:0,diffRowCount:changes.length,changedFieldCount:changes.reduce((sum,item)=>sum+(Array.isArray(item.fields)?item.fields.length:0),0),changes};
      }
      const priorCaptures=savedCaptures.filter(item=>{const time=Date.parse(item?.capturedAtUtc||item?.generatedAtUtc||'');return Number.isFinite(time)&&time<snapshotTime}),priorSnapshots=savedSnapshots.filter(item=>String(item?.id||'')!==String(snapshot.id||'')&&Date.parse(item?.completedAtUtc||'')<snapshotTime),comparisons=snapshot.accounts.map(account=>{
        const current=googleAdsCaptureFromSnapshot(snapshot,account),baseline=findGoogleAdsCaptureBaseline(current,priorCaptures,priorSnapshots,{periodType:record.periodType,allowEarlierDate:false,now:snapshot.completedAtUtc}),previous=baseline?.capture||null;
        return{current,previous,baselineCapturedAtUtc:previous?.capturedAtUtc||previous?.generatedAtUtc||null,...googleAdsCaptureDifferences(previous,current)};
      }),comparisonBaselines=comparisons.filter(item=>item.previous).map(item=>({managerCustomerId:item.current.managerCustomerId||null,customerId:item.current.customerId,accountName:String(item.current.accountName||'').slice(0,160),currentDate:item.current.date,referenceDate:item.previous.date,capturedAtUtc:item.baselineCapturedAtUtc,periodType:record.periodType,scope:item.current.campaignStatusFilter||'ALL'}));
      const changes=comparisons.flatMap(item=>item.changedCampaigns.map(change=>({managerCustomerId:item.current.managerCustomerId||null,managerName:String(item.current.managerName||item.previous?.managerName||item.current.managerCustomerId||'Conta direta').slice(0,100),customerId:item.current.customerId,accountName:item.current.accountName,currencyCode:item.current.currencyCode,baselineDate:item.previous?.date||null,baselineCapturedAtUtc:item.baselineCapturedAtUtc,...change})));
      return{...record,crossDateComparisonsSuppressed:false,captureDatesWithBaseline:comparisonBaselines.length,captureDatesWithoutBaseline:Math.max(0,snapshot.accounts.length-comparisonBaselines.length),comparisonBaselines,comparedCampaignDateCount:comparisons.reduce((sum,item)=>sum+item.comparedCampaignCount,0),diffRowCount:changes.length,changedFieldCount:changes.reduce((sum,item)=>sum+item.fields.length,0),changes};
    });
  }
  function normalizeGoogleAdsCaptureFailureInfo(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||Number(value.schemaVersion)!==1)return null;
    const safeStatus=value=>{const number=Number(value);return Number.isInteger(number)&&number>=100&&number<=599?number:null};
    const safeText=(value,pattern,max=120)=>typeof value==='string'&&value.length<=max&&pattern.test(value)?value:null;
    const allowedStages=new Set(['google_ads_transport','oauth_transport','google_ads_api','oauth_token']);
    const samples=(Array.isArray(value.samples)?value.samples:[]).slice(0,3).flatMap(sample=>{
      if(!sample||typeof sample!=='object'||Array.isArray(sample))return[];
      const reasonCode=safeText(sample.reasonCode,/^[a-z][a-z0-9_]{0,79}$/,80);
      if(!reasonCode)return[];
      const accountSuffix=safeText(sample.accountSuffix,/^\d{4}$/,4);
      const diagnosticId=safeText(sample.diagnosticId,/^gads-\d{14}-[a-f0-9]{10}$/,32);
      const googleStatus=safeText(sample.googleStatus,/^[A-Z][A-Z0-9_]{0,79}$/,80);
      const googleRequestId=safeText(sample.googleRequestId,/^[A-Za-z0-9._:-]{8,120}$/,120);
      const stage=allowedStages.has(sample.stage)?sample.stage:null;
      const googleErrorCodes=[...new Set((Array.isArray(sample.googleErrorCodes)?sample.googleErrorCodes:[]).filter(code=>typeof code==='string'&&/^(?:[A-Z][A-Z0-9_]{0,79}|[A-Za-z][A-Za-z0-9_]{0,59}\.[A-Z][A-Z0-9_]{0,79})$/.test(code)))].slice(0,3);
      const curlErrno=Number(sample.curlErrno);
      return[{
        reasonCode,
        ...(accountSuffix?{accountSuffix}:{}),
        ...(safeStatus(sample.httpStatus)?{httpStatus:safeStatus(sample.httpStatus)}:{}),
        ...(diagnosticId?{diagnosticId}:{}),
        ...(stage?{stage}:{}),
        ...(safeStatus(sample.upstreamHttpStatus)?{upstreamHttpStatus:safeStatus(sample.upstreamHttpStatus)}:{}),
        ...(googleStatus?{googleStatus}:{}),
        ...(googleRequestId?{googleRequestId}:{}),
        ...(googleErrorCodes.length?{googleErrorCodes}:{}),
        ...(Number.isInteger(curlErrno)&&curlErrno>0&&curlErrno<100000?{curlErrno}:{}),
        ...(typeof sample.retryable==='boolean'?{retryable:sample.retryable}:{}),
      }];
    });
    if(!samples.length)return null;
    return{schemaVersion:1,failureCount:Math.max(samples.length,Math.min(1000,Math.trunc(Number(value.failureCount)||samples.length))),samples};
  }
  function buildGoogleAdsCaptureFailureHistoryEntry(periodType,{now=new Date().toISOString(),businessDate=null,executionPass='initial',failureInfo=null,triggerReason=null,triggerAccountCount=0}={}){
    if(!['D0','D-1'].includes(periodType))throw new Error('O período da falha automática não foi reconhecido.');
    const completedAtUtc=new Date(now).toISOString(),date=periodType==='D-1'&&/^\d{4}-\d{2}-\d{2}$/.test(String(businessDate||''))?businessDate:null,diagnostics=normalizeGoogleAdsCaptureFailureInfo(failureInfo),effectiveTriggerReason=triggerReason||failureInfo?.triggerReason,accountDirectoryChange=effectiveTriggerReason==='account_directory_change',affectedAccounts=triggerAccountCount||failureInfo?.triggerAccountCount,attemptedAccounts=Number(failureInfo?.attemptedAccountCount);
    return{id:`${completedAtUtc}:failed:${Math.random().toString(36).slice(2,10)}`,completedAtUtc,periodType,executionMode:'automatic',...(periodType==='D-1'&&executionPass==='reconciliation'?{executionPass:'reconciliation'}:{}),...(accountDirectoryChange?{triggerReason:'account_directory_change',triggerAccountCount:Math.max(1,Math.min(1000,Math.trunc(Number(affectedAccounts)||1))),...(Number.isInteger(attemptedAccounts)&&attemptedAccounts>0?{accountCount:Math.min(1000,attemptedAccounts)}:{})}:{}),status:'failed',failureMessage:'A tentativa automática não foi concluída.',...(diagnostics?{failureInfo:diagnostics}:{}),dateFrom:date,dateTo:date,dates:date?[date]:[],scope:'ALL',captureDatesWithBaseline:0,captureDatesWithoutBaseline:0,comparedCampaignDateCount:0,diffRowCount:0,changedFieldCount:0,changes:[]};
  }
  function googleAdsCaptureSnapshotAccount(capture){const metricRows=new Map((capture.rows||[]).map(row=>[String(row.campaignId||''),row])),configurationRows=new Map((capture.configuration?.campaigns||[]).map(row=>[String(row.campaignId||''),row])),ids=new Set([...configurationRows.keys(),...metricRows.keys()]),campaigns=[...ids].map(campaignId=>{const row=metricRows.get(campaignId)||{},configuration=configurationRows.get(campaignId)||{};return{campaignId,campaignInternalId:row.campaignInternalId||configuration.campaignInternalId||null,campaignName:String(configuration.campaignName||row.campaignName||'').slice(0,240),campaignStatus:String(configuration.campaignStatus||row.campaignStatus||'').toUpperCase(),channelType:configuration.channelType||row.channelType||'',mappingStatus:configuration.mappingStatus||row.mappingStatus||'unmapped',impressions:row.impressions??null,clicks:row.clicks??null,conversions:row.conversions??null,costMicros:row.costMicros??null,conversionsValue:row.conversionsValue??null,inferredZero:row.inferredZero===true,zeroEvidence:row.zeroEvidence||null,metricsAvailable:metricRows.has(campaignId)}});return{managerCustomerId:capture.managerCustomerId||null,managerName:capture.managerName||'',customerId:capture.customerId,accountName:capture.accountName||'',date:capture.date,currencyCode:capture.currencyCode,exchangeRateUsdBrl:Number.isFinite(Number(capture.exchangeRateUsdBrl))&&Number(capture.exchangeRateUsdBrl)>0?Number(capture.exchangeRateUsdBrl):null,timeZone:capture.timeZone,scope:capture.campaignStatusFilter||'ALL',queryComplete:capture.queryComplete===true,configurationComplete:capture.configuration?.complete===true,configurationGeneratedAtUtc:capture.configuration?.generatedAtUtc||null,campaigns}}
  function buildGoogleAdsCaptureSnapshot(captures,run,now){if(!run)return null;const periodType=run.periodType==='D-1'?'D-1':run.periodType==='D0'?'D0':null;if(!periodType)return null;const currentDay=captures.filter(capture=>capture.queryComplete===true&&(periodType==='D-1'?capture.businessTimeZone==='America/Sao_Paulo'&&capture.businessDate===capture.date&&capture.date===run.dateTo:capture.businessTimeZone!=='America/Sao_Paulo'&&capture.date===googleAdsDateInTimeZone(capture.timeZone,new Date(now))));if(!currentDay.length)return null;return{id:run.id,runId:run.id,completedAtUtc:now,periodType,executionMode:run.executionMode||'manual',...(run.triggerReason==='account_directory_change'?{triggerReason:'account_directory_change',triggerAccountCount:Math.max(1,Math.min(1000,Math.trunc(Number(run.triggerAccountCount)||1)))}:{}),scope:currentDay.some(capture=>capture.campaignStatusFilter==='ENABLED')?'ENABLED':'ALL',accountCount:currentDay.length,campaignCount:currentDay.reduce((sum,capture)=>sum+(capture.rows?.length||0),0),accounts:currentDay.map(googleAdsCaptureSnapshotAccount)}}
  function googleAdsCaptureSnapshotTotals(snapshot,dailyCaptures=[]){
    const accounts=Array.isArray(snapshot?.accounts)?snapshot.accounts:[],expectedAccounts=Number(snapshot?.accountCount);
    if(!accounts.length||!Number.isInteger(expectedAccounts)||expectedAccounts!==accounts.length)return null;
    const accountRows=accounts.map(account=>{const campaigns=Array.isArray(account?.campaigns)?account.campaigns:[],metricRows=campaigns.filter(campaign=>campaign?.metricsAvailable===true),date=String(account?.date||''),dateTime=Date.parse(`${date}T00:00:00.000Z`),validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(dateTime)&&new Date(dateTime).toISOString().slice(0,10)===date,completeFullScope=account?.queryComplete===true&&account?.scope==='ALL'&&validDate;return{account,campaigns,metricRows,completeFullScope}});
    const summarizeMetric=key=>{
      let value=0,observedRows=0,missingRows=0,accountsWithObservedRows=0,completeAccounts=0,inferredZeroAccounts=0,scopeIncompleteAccounts=0;
      for(const entry of accountRows){
        const{account,campaigns,metricRows,completeFullScope}=entry;
        if(account?.queryComplete!==true){missingRows+=Math.max(1,campaigns.length);continue}
        if(!completeFullScope)scopeIncompleteAccounts++;
        if(!metricRows.length){if(completeFullScope){inferredZeroAccounts++;completeAccounts++}else missingRows++;continue}
        let accountComplete=completeFullScope,accountHasObservedRows=false;
        for(const campaign of metricRows){
          const raw=campaign?.[key],rawText=raw==null?'':String(raw).trim();
          if(rawText===''||!Number.isFinite(Number(raw))){missingRows++;accountComplete=false;continue}
          value+=Number(raw);observedRows++;accountHasObservedRows=true;
        }
        if(accountHasObservedRows)accountsWithObservedRows++;
        if(accountComplete)completeAccounts++;
      }
      return{value:observedRows||inferredZeroAccounts?value:null,complete:completeAccounts===accounts.length,accountsWithValue:accountsWithObservedRows,totalAccounts:accounts.length,completeAccounts,observedRows,missingRows,inferredZeroAccounts,scopeIncompleteAccounts};
    };
    const impressions=summarizeMetric('impressions'),clicks=summarizeMetric('clicks'),costMetric=summarizeMetric('costMicros');
    let costBrlObserved=0,canConvertObservedCosts=true,observedCostRows=0;const nativeCosts=new Map();
    for(const entry of accountRows){
      const{account,metricRows}=entry;if(account?.queryComplete!==true)continue;
      const manager=String(account.managerCustomerId||'').replace(/\D/g,'')||'direct',customer=String(account.customerId||'').replace(/\D/g,''),date=String(account.date||''),currency=String(account.currencyCode||'').trim().toUpperCase();
      const savedCapture=(Array.isArray(dailyCaptures)?dailyCaptures:[]).find(item=>(String(item?.managerCustomerId||'').replace(/\D/g,'')||'direct')===manager&&String(item?.customerId||'').replace(/\D/g,'')===customer&&String(item?.date||'')===date&&item?.queryComplete===true);
      const rate=Number(account.exchangeRateUsdBrl??savedCapture?.exchangeRateUsdBrl),hasRate=Number.isFinite(rate)&&rate>0;
      for(const campaign of metricRows){
        const raw=campaign?.costMicros,rawText=raw==null?'':String(raw).trim();if(rawText===''||!Number.isFinite(Number(raw)))continue;
        const amount=Number(raw)/1_000_000;nativeCosts.set(currency,(nativeCosts.get(currency)||0)+amount);observedCostRows++;
        if(currency==='BRL')costBrlObserved+=amount;
        else if(currency==='USD'&&hasRate)costBrlObserved+=amount*rate;
        else canConvertObservedCosts=false;
      }
    }
    const costsByCurrency=observedCostRows?[...nativeCosts].map(([currencyCode,amount])=>({currencyCode,amount:Math.round(amount*100)/100})).sort((a,b)=>a.currencyCode.localeCompare(b.currencyCode)):null;
    const costBrlObservedValue=observedCostRows&&canConvertObservedCosts?Math.round(costBrlObserved*100)/100:costMetric.complete&&Number(costMetric.value)===0?0:null;
    const costBrl=costMetric.complete&&costBrlObservedValue!=null?costBrlObservedValue:null;
    const metricCoverage={impressions,clicks,cost:costMetric},complete=[impressions.complete,clicks.complete,costMetric.complete].every(Boolean),completeAccountCount=Math.min(impressions.completeAccounts,clicks.completeAccounts,costMetric.completeAccounts);
    return{date:String(accounts[0]?.date||''),accountCount:accounts.length,impressions:impressions.complete?impressions.value:null,impressionsObserved:impressions.value,clicks:clicks.complete?clicks.value:null,clicksObserved:clicks.value,costBrl,costBrlObserved:costBrlObservedValue,costsByCurrency,metricCoverage,coverage:{complete,completeAccountCount,totalAccounts:accounts.length}};
  }
  function googleAdsCaptureHistoryClickDetails(history,snapshots=[],dailyCaptures=[]){
    if(!history?.id||history.status==='failed'||!['D0','D-1'].includes(history.periodType))return null;
    const savedSnapshots=Array.isArray(snapshots)?snapshots:[],savedCaptures=Array.isArray(dailyCaptures)?dailyCaptures:[],snapshot=savedSnapshots.find(item=>String(item?.runId||item?.id||'')===String(history.id)&&item?.periodType===history.periodType),snapshotTime=Date.parse(snapshot?.completedAtUtc||history.completedAtUtc||'');
    if(!snapshot||!Number.isFinite(snapshotTime)||!Array.isArray(snapshot.accounts)||!googleAdsCaptureSnapshotTotals(snapshot,savedCaptures))return null;
    const priorCaptures=savedCaptures.filter(item=>{const time=Date.parse(item?.capturedAtUtc||item?.generatedAtUtc||'');return Number.isFinite(time)&&time<snapshotTime}),priorSnapshots=savedSnapshots.filter(item=>String(item?.runId||item?.id||'')!==String(history.id)&&item?.periodType===history.periodType&&Date.parse(item?.completedAtUtc||'')<snapshotTime);
    let delta=0,completeAccounts=0;
    for(const account of snapshot.accounts){
      const current=googleAdsCaptureFromSnapshot(snapshot,account),baseline=findGoogleAdsCaptureBaseline(current,priorCaptures,priorSnapshots,{periodType:history.periodType,allowEarlierDate:false,now:snapshot.completedAtUtc}),currentTotals=googleAdsCaptureSnapshotTotals({accountCount:1,accounts:[account]},savedCaptures),previousAccount=baseline?googleAdsCaptureSnapshotAccount(baseline.capture):null,previousTotals=previousAccount?googleAdsCaptureSnapshotTotals({accountCount:1,accounts:[previousAccount]},priorCaptures):null,currentCoverage=currentTotals?.metricCoverage?.clicks,previousCoverage=previousTotals?.metricCoverage?.clicks;
      if(!baseline||currentTotals?.clicks==null||previousTotals?.clicks==null||currentCoverage?.complete!==true||previousCoverage?.complete!==true)continue;
      delta+=Number(currentTotals.clicks)-Number(previousTotals.clicks);completeAccounts++;
    }
    if(!completeAccounts)return null;
    const normalizedDelta=Math.round(delta),totalAccounts=snapshot.accounts.length;
    return{count:Math.abs(normalizedDelta),delta:normalizedDelta,partial:completeAccounts<totalAccounts,completeAccounts,totalAccounts};
  }
  function saveGoogleAdsDailyCaptures(baseInput,reports,{todayByAccount={},dateFromByAccount={},exchangeRateQuote=null,previewOnly=false,businessTimeZone=null,activeCampaignsOnly=false,executionMode='manual',executionPass='initial',triggerReason=null,triggerAccountCount=0,captureSnapshotRetentionLimit=GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_DEFAULT,mutateInput=false,now=new Date().toISOString()}={}){
    if(!baseInput||baseInput.schema!==SCHEMA)throw new Error('A base atual não foi reconhecida; a captura API foi cancelada para proteger os dados existentes.');
    const base=normalize(baseInput,!mutateInput),captures=[...base.google_ads_api_daily_captures],mappingIndex=apiCampaignMappingIndex(base,captures),savedDates=new Set(),seen=new Set(),seenAccounts=new Set();let savedRows=0;
    if(!Array.isArray(reports)||!reports.length)throw new Error('Nenhuma consulta diária da Google Ads API foi recebida.');
    const hasBusinessDayReports=reports.some(report=>report?.businessTimeZone!=null||report?.businessDate!=null),businessDayQuery=businessTimeZone==='America/Sao_Paulo';
    if(hasBusinessDayReports&&!businessDayQuery)throw new Error('A consulta do dia civil de São Paulo precisa ser identificada e validada antes de continuar.');
    const nullableNumber=value=>value==null||value===''?null:(Number.isFinite(Number(value))?Number(value):null),nextCaptures=[],configurationErrors=[];
    const zeroMetrics={impressions:0,clicks:0,ctr:null,averageCpcMicros:null,costMicros:0,conversions:0,costPerConversionMicros:null,conversionsValue:0,searchImpressionShare:null,searchTopImpressionShare:null,searchAbsoluteTopImpressionShare:null,topImpressionPercentage:null,absoluteTopImpressionPercentage:null};
    for(const report of reports){
      const customerId=String(report?.customerId??'').replace(/\D/g,''),managerCustomerId=report?.managerCustomerId==null?'':String(report.managerCustomerId).replace(/\D/g,''),today=String(todayByAccount?.[customerId]||''),expectedRange=googleAdsApiCaptureDateRange(today),dateFrom=String(report?.dateFrom??''),dateTo=String(report?.dateTo??''),providedStart=String(dateFromByAccount?.[customerId]||dateFrom),businessDayPreview=previewOnly===true&&businessDayQuery;
      if(!/^\d{10}$/.test(customerId)||managerCustomerId&&!/^\d{10}$/.test(managerCustomerId))throw new Error('A consulta diária contém um ID de conta/MCC inválido.');
      if(seenAccounts.has(`${managerCustomerId||'direct'}|${customerId}`))throw new Error('A rodada repetiu uma conta/MCC; nenhuma captura foi gravada.');seenAccounts.add(`${managerCustomerId||'direct'}|${customerId}`);
      const yesterday=shiftGoogleAdsDate(today,-1),saoPauloToday=googleAdsDateInTimeZone('America/Sao_Paulo',new Date(now)),saoPauloYesterday=shiftGoogleAdsDate(saoPauloToday,-1),earliestSaoPauloBusinessDate=shiftGoogleAdsDate(saoPauloToday,-(GOOGLE_ADS_API_CAPTURE_WINDOW_DAYS-1)),isCurrentWindow=/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)&&dateTo===today&&dateFrom>=expectedRange.dateFrom&&dateFrom<=today,isYesterdayOnly=dateFrom===yesterday&&dateTo===yesterday&&dateFrom>=expectedRange.dateFrom,isSaoPauloBusinessDate=businessDayQuery&&report.businessTimeZone==='America/Sao_Paulo'&&report.businessDate===dateFrom&&dateFrom===dateTo&&dateFrom<=saoPauloYesterday&&dateFrom>=earliestSaoPauloBusinessDate&&report.queryComplete===true&&(dateFrom===saoPauloYesterday||executionMode==='automatic');
      if(businessDayQuery&&!isSaoPauloBusinessDate)throw new Error(`A consulta precisa confirmar um dia completo de São Paulo dentro da janela automática de ${GOOGLE_ADS_API_CAPTURE_WINDOW_DAYS} dias. Nenhum dado foi gravado.`);
      if(activeCampaignsOnly&&(!isSaoPauloBusinessDate||dateFrom!==saoPauloYesterday||report.campaignStatusFilter!=='ENABLED'))throw new Error('A consulta somente de campanhas ativas exige D−1 completo e confirmação do filtro ENABLED pelo serviço. Nenhum dado foi gravado.');
      if(providedStart!==dateFrom||!/^\d{4}-\d{2}-\d{2}$/.test(dateTo)||(!isCurrentWindow&&!isYesterdayOnly&&!isSaoPauloBusinessDate)||dateFrom<GOOGLE_ADS_API_OPERATIONAL_START_DATE)throw new Error(`A captura da conta ${customerId} precisa ficar dentro da janela recente (${expectedRange.dateFrom} a ${today}) ou ser um dia civil de São Paulo validado dentro da janela de ${GOOGLE_ADS_API_CAPTURE_WINDOW_DAYS} dias. Datas anteriores ao início da API não foram alteradas.`);
      const currencyCode=String(report.currencyCode||'').trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currencyCode))throw new Error(`A moeda da conta ${customerId} não foi identificada; nenhuma captura foi gravada.`);
      const timeZone=String(report.timeZone||'').trim().slice(0,80);if(!timeZone)throw new Error(`O fuso horário da conta ${customerId} não foi identificado; nenhuma captura foi gravada.`);if(googleAdsDateInTimeZone(timeZone)!==today)throw new Error(`A data da conta ${customerId} mudou durante a gravação; repita a captura para salvar a janela recente atualizada.`);
      const rowsByDate=new Map();
      for(const row of Array.isArray(report.rows)?report.rows:[]){
        const date=String(row?.date??''),campaignId=String(row?.campaignId??'');if(date<dateFrom||date>dateTo||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{1,20}$/.test(campaignId))throw new Error(`A consulta diária da conta ${customerId} contém campanha ou data fora da janela solicitada; nenhuma captura foi gravada.`);
        const group=rowsByDate.get(date)||[],normalized={date,campaignId,campaignName:String(row.campaignName||'').trim().slice(0,240),campaignStatus:String(row.campaignStatus||'').trim().slice(0,40).toUpperCase(),channelType:String(row.channelType||'').trim().slice(0,60),impressions:nullableNumber(row.impressions),clicks:nullableNumber(row.clicks),ctr:nullableNumber(row.ctr),averageCpcMicros:nullableNumber(row.averageCpcMicros),costMicros:nullableNumber(row.costMicros),conversions:nullableNumber(row.conversions),costPerConversionMicros:nullableNumber(row.costPerConversionMicros),conversionsValue:nullableNumber(row.conversionsValue),searchImpressionShare:nullableNumber(row.searchImpressionShare),searchTopImpressionShare:nullableNumber(row.searchTopImpressionShare),searchAbsoluteTopImpressionShare:nullableNumber(row.searchAbsoluteTopImpressionShare),topImpressionPercentage:nullableNumber(row.topImpressionPercentage),absoluteTopImpressionPercentage:nullableNumber(row.absoluteTopImpressionPercentage)};
        if(activeCampaignsOnly&&normalized.campaignStatus!=='ENABLED')throw new Error('A consulta filtrada retornou campanha que não está ativa; nenhum dado foi gravado. Repita a prévia para atualizar os status.');
        if(group.some(item=>item.campaignId===campaignId))throw new Error('A consulta diária repetiu uma campanha na mesma data; nenhuma captura foi gravada.');
        group.push({...normalized,...apiCampaignMapping(base,managerCustomerId,customerId,normalized,mappingIndex)});rowsByDate.set(date,group);
      }
      let configuration=null,observedConfiguration=null;
      if(report.configuration&&(activeCampaignsOnly||!(isSaoPauloBusinessDate&&!previewOnly))){
        const observed=report.configuration,mismatch=googleAdsConfigurationMismatch(report,{customerId,managerCustomerId,currencyCode,timeZone,today});
        if(mismatch.length){const accountName=String(report.accountName||'').trim().slice(0,80)||'Conta Google Ads',managerName=String(report.managerName||'').trim().slice(0,80),managerLabel=managerCustomerId?`${managerName?`${managerName} · `:''}${managerCustomerId}`:'acesso direto';configurationErrors.push(`MCC ${managerLabel} · ${accountName} (${customerId}): ${mismatch.join('; ')}`);continue;}
        const configurations=observed.campaigns.map(item=>{const normalized=globalThis.GoogleAdsConfigDomain.sanitize(item);return{...normalized,...apiCampaignMapping(base,managerCustomerId,customerId,normalized,mappingIndex)}});
        if(new Set(configurations.map(item=>item.campaignId)).size!==configurations.length)throw new Error('A configuração contém campanhas duplicadas; nenhuma captura foi gravada.');
        observedConfiguration={complete:true,customerId,managerCustomerId:managerCustomerId||null,currencyCode,timeZone,generatedAtUtc:observed.generatedAtUtc,campaigns:configurations};
        configuration=observedConfiguration;
      }
      if(activeCampaignsOnly&&(!report.queryComplete||observedConfiguration?.complete!==true))throw new Error(`A consulta ativa de ${customerId} precisa de métricas completas e inventário atual completo para confirmar campanhas com zero. Nenhum dado foi gravado.`);
      if(activeCampaignsOnly){const enabledCampaignIds=new Set(observedConfiguration.campaigns.filter(item=>item.campaignStatus==='ENABLED').map(item=>item.campaignId));for(const row of rowsByDate.get(dateFrom)||[])if(!enabledCampaignIds.has(row.campaignId))throw new Error(`A consulta ativa de ${customerId} não corresponde ao inventário ENABLED atual. Nenhum dado foi gravado.`)}
      const quoteRate=Number(exchangeRateQuote?.rate),freshRate=Number.isFinite(quoteRate)&&quoteRate>0?quoteRate:null;
      for(let date=dateFrom;date<=dateTo;date=shiftGoogleAdsDate(date,1)){
        const captureKey=`${managerCustomerId||'direct'}|${customerId}|${date}`;if(seen.has(captureKey))throw new Error('A consulta diária repetiu uma conta/MCC/data; nenhuma captura foi gravada.');seen.add(captureKey);
        const previous=captures.find(item=>`${String(item.managerCustomerId||'').replace(/\D/g,'')||'direct'}|${String(item.customerId||'').replace(/\D/g,'')}|${String(item.date||'')}`===captureKey);
        if(!isSaoPauloBusinessDate&&previous?.businessTimeZone==='America/Sao_Paulo'&&previous.businessDate===date)continue;
        const isToday=date===today,dayRows=rowsByDate.get(date)||[],rows=[...dayRows],returned=new Set(rows.map(item=>item.campaignId));
        const activeCampaignIds=new Set((observedConfiguration?.campaigns||[]).filter(item=>item.campaignStatus==='ENABLED').map(item=>item.campaignId));
        if(activeCampaignsOnly)for(const item of observedConfiguration.campaigns){if(item.campaignStatus!=='ENABLED'||returned.has(item.campaignId))continue;rows.push({date,campaignId:item.campaignId,campaignName:item.campaignName,campaignStatus:item.campaignStatus,channelType:item.channelType,campaignInternalId:item.campaignInternalId||null,mappingStatus:item.mappingStatus||'unmapped',...zeroMetrics,inferredZero:true,zeroEvidence:'complete_sao_paulo_day_query_and_current_enabled_inventory'});returned.add(item.campaignId)}
        if(activeCampaignsOnly)for(const oldRow of previous?.rows||[]){if(activeCampaignIds.has(oldRow.campaignId)||returned.has(oldRow.campaignId))continue;rows.push({...oldRow,date});returned.add(oldRow.campaignId)}
        if(!businessDayPreview&&report.queryComplete===true&&previous?.queryComplete===true)for(const oldRow of previous.rows||[]){if(returned.has(oldRow.campaignId)||oldRow.mappingStatus!=='mapped'||!oldRow.campaignInternalId)continue;rows.push({...oldRow,...zeroMetrics,date,inferredZero:true,zeroEvidence:'complete_recent_query_and_prior_campaign_mapping'});returned.add(oldRow.campaignId)}
        let dayConfiguration=businessDayPreview?configuration:isSaoPauloBusinessDate?historicalGoogleAdsConfiguration(previous,date,customerId,managerCustomerId,currencyCode,timeZone,'America/Sao_Paulo'):isToday?configuration:historicalGoogleAdsConfiguration(previous,date,customerId,managerCustomerId,currencyCode,timeZone);
        if(activeCampaignsOnly&&businessDayPreview&&dayConfiguration)dayConfiguration={...dayConfiguration,campaigns:dayConfiguration.campaigns.filter(item=>item.campaignStatus==='ENABLED')};
        if(!activeCampaignsOnly&&!businessDayPreview&&dayConfiguration&&report.queryComplete===true)for(const item of dayConfiguration.campaigns){if(returned.has(item.campaignId)||item.mappingStatus!=='mapped')continue;rows.push({date,campaignId:item.campaignId,campaignName:item.campaignName,campaignStatus:item.campaignStatus,channelType:item.channelType,campaignInternalId:item.campaignInternalId,mappingStatus:item.mappingStatus,...zeroMetrics,inferredZero:true,zeroEvidence:'complete_daily_query_and_current_inventory'});returned.add(item.campaignId)}
        if(businessDayPreview&&dayConfiguration&&report.queryComplete===true)for(const item of dayConfiguration.campaigns){if(returned.has(item.campaignId)||item.mappingStatus!=='mapped')continue;rows.push({date,campaignId:item.campaignId,campaignName:item.campaignName,campaignStatus:item.campaignStatus,channelType:item.channelType,campaignInternalId:item.campaignInternalId,mappingStatus:item.mappingStatus,impressions:null,clicks:null,ctr:null,averageCpcMicros:null,costMicros:null,conversions:null,costPerConversionMicros:null,conversionsValue:null,searchImpressionShare:null,searchTopImpressionShare:null,searchAbsoluteTopImpressionShare:null,previewConfigurationOnly:true});returned.add(item.campaignId)}
        const priorRate=previous?.currencyCode===currencyCode?Number(previous.exchangeRateUsdBrl):null,usePriorQuote=(!isToday||isSaoPauloBusinessDate)&&currencyCode==='USD'&&Number.isFinite(priorRate)&&priorRate>0,exchangeRateUsdBrl=usePriorQuote?priorRate:freshRate;
        const capture={captureSchemaVersion:4,managerCustomerId:managerCustomerId||null,managerName:String(report.managerName||'').trim().slice(0,100),customerId,date,currencyCode,timeZone,accountName:String(report.accountName||'').trim().slice(0,160),generatedAtUtc:String(report.generatedAtUtc||''),capturedAtUtc:now,exchangeRateUsdBrl:currencyCode==='USD'?exchangeRateUsdBrl:null,exchangeRateQuoteDate:usePriorQuote?previous.exchangeRateQuoteDate||null:exchangeRateQuote?.quoteDate||null,exchangeRateSource:usePriorQuote?previous.exchangeRateSource||null:exchangeRateQuote?.source||null,exchangeRateRetrievedAt:usePriorQuote?previous.exchangeRateRetrievedAt||null:exchangeRateQuote?.retrievedAt||null,exchangeRateIsStale:usePriorQuote?previous.exchangeRateIsStale===true:exchangeRateQuote?.isStale===true,coverageStatus:rows.length?'rows_returned':'completed_no_rows',queryComplete:report.queryComplete===true,campaignStatusFilter:activeCampaignsOnly?'ENABLED':'ALL',...(activeCampaignsOnly?{campaignScope:'current_enabled_only'}:{}),configuration:dayConfiguration,...(isSaoPauloBusinessDate?{businessTimeZone:'America/Sao_Paulo',businessDate:date}:{}),...(businessDayPreview?{previewConfigurationCurrent:true}:{}),shareMetricsAvailable:report.shareMetricsAvailable===true,rows};
        capture.positionMetricsAvailable=report.positionMetricsAvailable===true;
        nextCaptures.push(capture);savedDates.add(date);savedRows+=rows.length;
      }
    }
    if(configurationErrors.length)throw new Error(`Prévia/captura cancelada: configuração incompatível em ${configurationErrors.length} conta(s). ${configurationErrors.join(' | ')}. Nenhum dado foi gravado.`);
    const captureHistory=previewOnly?null:nextCaptures.length?buildGoogleAdsCaptureHistoryEntry(captures,nextCaptures,{now,businessDayCapture:businessDayQuery,activeCampaignsOnly,executionMode,executionPass,triggerReason,triggerAccountCount,previousSnapshots:base.google_ads_api_capture_snapshots}):null,captureSnapshot=previewOnly?null:buildGoogleAdsCaptureSnapshot(nextCaptures,captureHistory,now);
    for(const capture of nextCaptures){const key=`${capture.managerCustomerId||'direct'}|${capture.customerId}|${capture.date}`,index=captures.findIndex(item=>`${String(item.managerCustomerId||'').replace(/\D/g,'')||'direct'}|${String(item.customerId||'').replace(/\D/g,'')}|${String(item.date||'')}`===key);if(index>=0)captures[index]=capture;else captures.push(capture)}
    if(captureHistory)base.google_ads_api_change_history=mergeGoogleAdsCaptureHistory(base.google_ads_api_change_history,[captureHistory]);
    if(captureSnapshot)base.google_ads_api_capture_snapshots=pruneGoogleAdsCaptureSnapshots([...base.google_ads_api_capture_snapshots,captureSnapshot],captureSnapshotRetentionLimit,base.google_ads_api_change_history);
    else base.google_ads_api_capture_snapshots=pruneGoogleAdsCaptureSnapshots(base.google_ads_api_capture_snapshots,captureSnapshotRetentionLimit,base.google_ads_api_change_history);
    base.google_ads_api_daily_captures=captures;base.importacoes.push({tipo:'google_ads_api_daily',executada_em:now,contas:nextCaptures.length,registros:savedRows,datas:[...savedDates].sort()});base.atualizado_em=now;
    const projection=previewOnly?null:googleAdsApiProjectionSummary(base),batchRows=nextCaptures.flatMap(item=>item.rows||[]);
    return{base,captureSnapshot,savedCaptures:nextCaptures.length,savedRows,dates:[...savedDates].sort(),projection:{...(projection||{}),batch:{rows:batchRows.length,mappedRows:batchRows.filter(row=>row.mappingStatus==='mapped'&&row.campaignInternalId).length,unmappedRows:batchRows.filter(row=>row.mappingStatus==='unmapped').length,ambiguousRows:batchRows.filter(row=>row.mappingStatus==='ambiguous'||row.mappingStatus==='mapping_conflict').length}}};
  }
  function googleAdsApiProjectionSummary(baseInput){
    const captures=Array.isArray(baseInput?.google_ads_api_daily_captures)?baseInput.google_ads_api_daily_captures:[],hasV2Capture=new Set(),captureKey=item=>[item?.managerCustomerId,item?.customerId,item?.date].map(value=>`${typeof value}:${String(value)}`).join('|');
    for(const item of captures)if(Number(item?.captureSchemaVersion)>=2)hasV2Capture.add(captureKey(item));
    const mappingBase=baseInput||{campanhas:[]},mappingIndex=apiCampaignMappingIndex(mappingBase,captures);let captureCount=0,rowCount=0,mappedRows=0,unmappedRows=0,ambiguousRows=0,unsupportedCurrencyRows=0,legacyCapturesPending=0;const dates=new Set();
    for(const item of captures){
      const version=Number(item?.captureSchemaVersion||0),date=String(item?.date||''),rows=Array.isArray(item?.rows)?item.rows:[];
      if(version>=2&&date>=GOOGLE_ADS_API_OPERATIONAL_START_DATE){
        captureCount++;dates.add(date);
        for(const row of rows){
          if(item.coverageStatus!=='rows_returned')continue;
          rowCount++;
          if(!['BRL','USD'].includes(item?.currencyCode))unsupportedCurrencyRows++;
          const resolvedMapping=row.mappingStatus==='unmapped'&&row.campaignInternalId?row:row.mappingStatus==='mapped'&&row.campaignInternalId?row:apiCampaignMapping(mappingBase,item.managerCustomerId,item.customerId,row,mappingIndex);
          if(resolvedMapping.mappingStatus==='mapped'&&resolvedMapping.campaignInternalId)mappedRows++;
          else if(resolvedMapping.mappingStatus==='unmapped')unmappedRows++;
          else if(resolvedMapping.mappingStatus==='ambiguous'||resolvedMapping.mappingStatus==='mapping_conflict')ambiguousRows++;
        }
      }else if(version<2&&date===googleAdsDateInTimeZone(item?.timeZone)&&date>=GOOGLE_ADS_API_OPERATIONAL_START_DATE&&!hasV2Capture.has(captureKey(item)))legacyCapturesPending++;
    }
    return{startDate:GOOGLE_ADS_API_OPERATIONAL_START_DATE,captures:captureCount,rows:rowCount,mappedRows,unmappedRows,ambiguousRows,unsupportedCurrencyRows,legacyCapturesPending,dates:[...dates].sort()};
  }
  function clearManifestGoogleAdsMetricFallbacks(base){
    const columns=['B','C','F','G','I','J','K','L','M','N','O','P','Q','R'];
    const metricKeys=['impressoes','cliques_google','conversoes','porcentagem_impressao_primeira_posicao','porcentagem_impressao_parte_superior','participacao_impressao_rede_pesquisa','custo_total','custo_medio','valor_conversao','status_qualificacao','status_campanha','estrategia_lance','cpa_desejado','orcamento_diario'];
    for(const row of base.diario||[]){
      const date=normalizeManifestDate(row?.data);if(!date||date<GOOGLE_ADS_API_OPERATIONAL_START_DATE)continue;
      const periods=new Set(row.periodos||[]),hasManualOverride=Boolean(row.fontes?.includes('conversion_value_override'))||['d0','d1'].some(period=>(!periods.size||periods.has(period))&&findConversionValueOverride(base,row.campanha_id,date,period));
      for(const column of columns){if(column==='P'&&hasManualOverride)continue;if(['K','L'].includes(column)&&row.celulas?.[column]?.origem==='google_ads_api'){delete row.celulas[column];continue}if(row.celulas?.[column]?.origem==='google_ads_api')continue;delete row.celulas?.[column]}
    }
    const manifest=base.manifesto_atual;
    for(const source of manifest?.campanhas||[]){
      const name=String(source?.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR');let account=null,manager=null;try{account=sourceAccountId(source)}catch{}try{manager=sourceManagerId(source,manifest)}catch{}
      const candidates=base.campanhas.filter(item=>String(item?.nome_mcc||'').trim().toLocaleLowerCase('pt-BR')===name),matchedCandidates=candidates.filter(item=>(!account||item.conta_id===account)&&(!manager||!item.mcc_id||item.mcc_id===manager)),campaign=matchedCandidates.length===1?matchedCandidates[0]:candidates.length===1?candidates[0]:null;
      for(const[period,field,temporalKey]of[['d0','metricas_D_zero','D_zero'],['d1','metricas_D_menos_1','D_menos_1']]){
        const metrics=source[field],date=normalizeManifestDate(metrics?.data,manifest?.separacao_temporal?.[temporalKey]?.datas_detectadas?.[0]);if(!metrics||!date||date<GOOGLE_ADS_API_OPERATIONAL_START_DATE)continue;
        const override=campaign&&findConversionValueOverride(base,campaign.id,date,period);if(override)applyConversionValueOverrideToSource(base,campaign,source,period,manifest);
        for(const key of metricKeys){const clearLegacyPositionMetric=['porcentagem_impressao_primeira_posicao','porcentagem_impressao_parte_superior'].includes(key)&&metrics[key]?.origem==='google_ads_api';if(!clearLegacyPositionMetric&&(metrics[key]?.origem==='google_ads_api'||override&&['valor_conversao'].includes(key)))continue;delete metrics[key]}
        if(metrics.custo_D_zero){const costDate=normalizeManifestDate(metrics.custo_D_zero.data,manifest?.separacao_temporal?.D_zero?.datas_detectadas?.[0]);if(!costDate||costDate>=GOOGLE_ADS_API_OPERATIONAL_START_DATE)delete metrics.custo_D_zero}
      }
    }
  }
  function googleAdsApiOperationalProjection(baseInput){
    if(!baseInput)return null;
    const base=normalize(baseInput),captures=(base.google_ads_api_daily_captures||[]).filter(item=>Number(item?.captureSchemaVersion)>=2&&String(item?.date||'')>=GOOGLE_ADS_API_OPERATIONAL_START_DATE&&item.coverageStatus==='rows_returned').sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.capturedAtUtc).localeCompare(String(b.capturedAtUtc)));clearManifestGoogleAdsMetricFallbacks(base);addCurrentApiSnapshotCampaigns(base,captures);const summary=googleAdsApiProjectionSummary(base),campaignById=new Map(base.campanhas.map(item=>[String(item.id),item])),saoPauloToday=googleAdsDateInTimeZone('America/Sao_Paulo'),saoPauloYesterday=shiftGoogleAdsDate(saoPauloToday,-1),mappingIndex=apiCampaignMappingIndex(base,captures),apiActivityDates=googleAdsApiActivityDatesByCampaign(base,captures,mappingIndex);
    const accountMatches=(campaign,capture)=>Boolean(campaign&&campaign.conta_id===canonicalAccountId(capture.customerId)&&(!capture.managerCustomerId||!campaign.mcc_id||campaign.mcc_id===canonicalAccountId(capture.managerCustomerId)));
    const stateMetric=value=>value==null?null:{valor:value,estado:Number(value)===0?'zero_confirmado':'confirmado',origem:'google_ads_api'};
    const setMetric=(metrics,key,value)=>{if(value==null)return;metrics[key]=stateMetric(value)};
    const safeMicros=value=>value==null?null:Number.isFinite(Number(value))?Number(value)/1_000_000:null;
    const apiSourceRows=[],diaryByCampaignDate=new Map(),conversionOverridesByCampaignId=new Map();
    for(const record of base.diario){let dates=diaryByCampaignDate.get(record.campanha_id);if(!dates){dates=new Map();diaryByCampaignDate.set(record.campanha_id,dates)}if(!dates.has(record.data))dates.set(record.data,record)}
    for(const item of base.mcc_conversion_value_overrides||[]){let dates=conversionOverridesByCampaignId.get(item?.campaign_id);if(!dates){dates=new Set();conversionOverridesByCampaignId.set(item?.campaign_id,dates)}dates.add(item?.date)}
    for(const capture of captures){
      const configurationByCampaignId=new Map();
      for(const item of capture.configuration?.campaigns||[])if(!configurationByCampaignId.has(item?.campaignId))configurationByCampaignId.set(item?.campaignId,item);
      for(const apiRow of capture.rows||[]){
        const mapping=apiRow.mappingStatus==='unmapped'&&apiRow.campaignInternalId?apiRow:apiRow.mappingStatus==='mapped'&&apiRow.campaignInternalId?apiRow:apiCampaignMapping(base,capture.managerCustomerId,capture.customerId,apiRow,mappingIndex);if(mapping.mappingStatus!=='mapped'||!mapping.campaignInternalId)continue;
        const campaign=campaignById.get(String(mapping.campaignInternalId));if(!accountMatches(campaign,capture))continue;
        if(!campaignDiaryDateAllowed(base,campaign.id,capture.date,{apiActivityDates:apiActivityDates.get(String(campaign.id))||[]}))continue;
        const existing=diaryByCampaignDate.get(campaign.id)?.get(capture.date),record=existing||{campanha_id:campaign.id,data:capture.date,celulas:{},fontes:[]};
        record.celulas??={};if(!Array.isArray(record.fontes))record.fontes=[];if(!record.fontes.includes('google_ads_api'))record.fontes.push('google_ads_api');
        record.google_ads_api_sao_paulo_day=capture.businessTimeZone==='America/Sao_Paulo'&&capture.businessDate===capture.date;
        if(!Object.hasOwn(record.celulas,'A')){const[year,month,day]=capture.date.split('-').map(Number);record.celulas.A={value:Math.floor(Date.UTC(year,month-1,day)/86400000)+25569,text:capture.date}}
        const moneySupported=capture.currencyCode==='BRL'||capture.currencyCode==='USD',rate=Number(capture.exchangeRateUsdBrl),hasRate=capture.currencyCode==='BRL'||Number.isFinite(rate)&&rate>0,moneyFactor=capture.currencyCode==='USD'&&hasRate?rate:1;
        const averageCpcMicros=apiRow.averageCpcMicros??(apiRow.clicks>0&&apiRow.costMicros!=null?Number(apiRow.costMicros)/Number(apiRow.clicks):null),averageNative=apiRow.clicks===0?null:safeMicros(averageCpcMicros),costNative=safeMicros(apiRow.costMicros),valueNative=apiRow.conversionsValue==null?null:Number(apiRow.conversionsValue);
        const writeCell=(column,value)=>{if(value==null)return;const previous=record.celulas[column]&&typeof record.celulas[column]==='object'?record.celulas[column]:{};record.celulas[column]={...previous,value,origem:'google_ads_api',capturedAtUtc:capture.capturedAtUtc,currencyCode:capture.currencyCode,...(capture.currencyCode==='USD'&&hasRate?{exchangeRateUsdBrl:rate}:{})}};
        const rawConfig=configurationByCampaignId.get(apiRow.campaignId),configMapping=rawConfig?apiCampaignMapping(base,capture.managerCustomerId,capture.customerId,rawConfig,mappingIndex):null,config=configMapping?.mappingStatus==='mapped'&&String(configMapping.campaignInternalId)===String(campaign.id)?{...rawConfig,...configMapping}:null,labels=globalThis.GoogleAdsConfigDomain;
        if(config&&labels){writeCell('M',labels.budget(config,capture.currencyCode));writeCell('N',labels.strategy(config));writeCell('Q',labels.qualification(config));record.google_ads_configuration_observed_at=capture.configuration.generatedAtUtc;
          if(capture.previewConfigurationCurrent===true||capture.date===saoPauloToday&&capture.date===googleAdsDateInTimeZone(capture.timeZone)){if(['ENABLED','PAUSED','REMOVED'].includes(config.campaignStatus))campaign.status=config.campaignStatus==='ENABLED'?'ativa':'pausada';campaign.estado_campanha_observado=config.campaignStatus;campaign.status_qualificacao_observado=labels.qualification(config);campaign.google_ads_primary_status_reasons=clone(config.primaryStatusReasons)}
        }
        writeCell('B',apiRow.impressions);writeCell('C',apiRow.clicks);writeCell('F',apiRow.conversions);
        if(apiRow.impressions!=null&&apiRow.clicks!=null){if(Number(apiRow.impressions)>0)writeCell('G',Number(apiRow.clicks)/Number(apiRow.impressions));else record.celulas.G={value:null,origem:'google_ads_api'}}
        if(apiRow.clicks===0){record.celulas.I={value:null,origem:'google_ads_api'};record.celulas.J={value:null,origem:'google_ads_api'}}
        const writeRateCell=(column,value)=>{if(value==null){record.celulas[column]={value:null,estado:'indisponivel',origem:'google_ads_api',capturedAtUtc:capture.capturedAtUtc};return}writeCell(column,value)};
        writeRateCell('K',apiRow.absoluteTopImpressionPercentage);writeRateCell('L',apiRow.topImpressionPercentage);
        if(apiRow.searchImpressionShare==null)record.celulas.R={value:null,estado:'indisponivel',origem:'google_ads_api',capturedAtUtc:capture.capturedAtUtc};
        else if(Number(apiRow.searchImpressionShare)>0&&Number(apiRow.searchImpressionShare)<0.1)record.celulas.R={value:'<10%',estado:'limite',operador:'<',limite:10,original:'<10%',origem:'google_ads_api',capturedAtUtc:capture.capturedAtUtc};
        else writeCell('R',apiRow.searchImpressionShare);
        if(apiRow.inferredZero)for(const column of ['G','I','J','K','L','R'])record.celulas[column]={value:null,origem:'google_ads_api',zeroEvidence:apiRow.zeroEvidence};
        if(moneySupported&&hasRate){if(averageNative!=null){if(capture.currencyCode==='USD')writeCell('I',averageNative);writeCell('J',averageNative*moneyFactor)}if(costNative!=null)writeCell('O',Math.round(costNative*moneyFactor*100)/100);const override=conversionOverridesByCampaignId.get(campaign.id)?.has(capture.date)===true;if(valueNative!=null&&!override)writeCell('P',Math.round(valueNative*moneyFactor*100)/100)}
        if(!existing){base.diario.push(record);let dates=diaryByCampaignDate.get(campaign.id);if(!dates){dates=new Map();diaryByCampaignDate.set(campaign.id,dates)}dates.set(capture.date,record)}
        apiSourceRows.push({campaign,capture,apiRow,config,record,moneySupported,hasRate,rate,costNative,averageNative,valueNative});
      }
    }
    const manifest=base.manifesto_atual;
    if(manifest&&apiSourceRows.length){
      const effectiveManifest=clone(manifest),manifestSourcesByCampaignName=new Map(),campaignsByName=new Map();
      for(const source of effectiveManifest.campanhas||[]){const key=String(source?.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR'),rows=manifestSourcesByCampaignName.get(key)||[];rows.push(source);manifestSourcesByCampaignName.set(key,rows)}
      for(const campaign of base.campanhas){const key=String(campaign?.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'),rows=campaignsByName.get(key)||[];rows.push(campaign);campaignsByName.set(key,rows)}
      for(const item of apiSourceRows){
        const{campaign,capture,apiRow,config,moneySupported,hasRate,rate,costNative,averageNative,valueNative}=item,account=canonicalAccountId(capture.customerId),manager=canonicalAccountId(capture.managerCustomerId),campaignName=String(campaign.nome_mcc||'').trim(),campaignNameKey=campaignName.toLocaleLowerCase('pt-BR'),accountToday=googleAdsDateInTimeZone(capture.timeZone),operationalPeriod=capture.businessTimeZone==='America/Sao_Paulo'&&capture.businessDate===capture.date&&capture.date===saoPauloYesterday?'d1':capture.date===saoPauloToday&&capture.date===accountToday?'d0':null;
        const sameNameSources=manifestSourcesByCampaignName.get(campaignNameKey)||[];
        let source=sameNameSources.find(row=>{try{return sourceAccountId(row)===account&&(!manager||sourceManagerId(row,effectiveManifest)===manager)}catch{return false}});
        if(!source){
          const sameNameCampaigns=campaignsByName.get(campaignNameKey)||[];
          if(!campaignName||sameNameSources.length||sameNameCampaigns.length!==1||String(sameNameCampaigns[0]?.id)!==String(campaign.id)||!operationalPeriod)continue;
          source={nome_campanha_exato:campaignName,mcc_id:manager||canonicalAccountId(campaign.mcc_id),...(campaign.apiSnapshotOnly===true?{apiSnapshotOnly:true}:{}),metricas_D_zero:{presente:false,conta_id:{valor:account}},metricas_D_menos_1:{presente:false,conta_id:{valor:account}}};
          effectiveManifest.campanhas??=[];effectiveManifest.campanhas.push(source);sameNameSources.push(source);manifestSourcesByCampaignName.set(campaignNameKey,sameNameSources);
        }
        if(campaign.apiSnapshotOnly===true)source.apiSnapshotOnly=true;
        if(campaign.google_ads_campaign_origem)source.google_ads_campaign_origem=campaign.google_ads_campaign_origem;
        const configurationTime=Date.parse(capture.configuration?.generatedAtUtc||''),configurationAge=Date.now()-configurationTime,previousConfigurationTime=Date.parse(source.google_ads_current_configuration?.observedAtUtc||'');
        if(config&&globalThis.GoogleAdsConfigDomain&&capture.businessTimeZone!=='America/Sao_Paulo'&&Number.isFinite(configurationTime)&&configurationAge>=0&&configurationAge<=24*60*60*1000&&(!Number.isFinite(previousConfigurationTime)||configurationTime>=previousConfigurationTime)){const labels=globalThis.GoogleAdsConfigDomain;source.google_ads_current_configuration={...clone(config),observedAtUtc:capture.configuration.generatedAtUtc,currencyCode:capture.currencyCode,qualificationLabel:labels.qualification(config),strategyLabel:labels.strategy(config),budgetLabel:labels.budget(config,capture.currencyCode)}}
        if(!operationalPeriod)continue;
        const periods=operationalPeriod==='d1'?[['d1','metricas_D_menos_1']]:[['d0','metricas_D_zero']];
        for(const[period,field]of periods){
          const override=findConversionValueOverride(base,campaign.id,capture.date,period),metrics=source[field]||(source[field]={});metrics.presente=true;setMetric(metrics,'data',capture.date);setMetric(metrics,'impressoes',apiRow.impressions);setMetric(metrics,'cliques_google',apiRow.clicks);setMetric(metrics,'conversoes',apiRow.conversions);
          if(apiRow.absoluteTopImpressionPercentage!=null)setMetric(metrics,'porcentagem_impressao_primeira_posicao',Number(apiRow.absoluteTopImpressionPercentage)*100);
          if(apiRow.topImpressionPercentage!=null)setMetric(metrics,'porcentagem_impressao_parte_superior',Number(apiRow.topImpressionPercentage)*100);
          if(apiRow.searchImpressionShare!=null){const value=Number(apiRow.searchImpressionShare)*100;metrics.participacao_impressao_rede_pesquisa=value>0&&value<10?{valor:null,estado:'limite',operador:'<',limite:10,original:'<10%',origem:'google_ads_api'}:{valor:value,estado:value===0?'zero_confirmado':'confirmado',original:`${value}%`,origem:'google_ads_api'}}
          if(apiRow.inferredZero)for(const key of ['custo_medio','porcentagem_impressao_primeira_posicao','porcentagem_impressao_parte_superior','participacao_impressao_rede_pesquisa'])metrics[key]={valor:null,estado:'indisponivel',origem:'google_ads_api'};
          const observedCampaignStatus=config?.campaignStatus||(capture.date===saoPauloToday&&capture.date===googleAdsDateInTimeZone(capture.timeZone)?apiRow.campaignStatus:null);if(observedCampaignStatus)metrics.estado_campanha=stateMetric(observedCampaignStatus);
          if(config&&globalThis.GoogleAdsConfigDomain){const labels=globalThis.GoogleAdsConfigDomain;setMetric(metrics,'status_qualificacao',labels.qualification(config));setMetric(metrics,'status_campanha',labels.qualification(config));setMetric(metrics,'estrategia_lance',labels.strategy(config));setMetric(metrics,'cpa_desejado',config.targetCpaMicros==null?null:config.targetCpaMicros/1e6);if(config.budgetPeriod==='DAILY')setMetric(metrics,'orcamento_diario',config.budgetAmountMicros==null?null:config.budgetAmountMicros/1e6);metrics.google_ads_configuration={budgetLabel:labels.budget(config,capture.currencyCode),targetCpaResolution:config.targetCpaResolution,observedAtUtc:capture.configuration.generatedAtUtc,primaryStatus:config.primaryStatus,reasons:clone(config.primaryStatusReasons),budgetResource:config.budgetResource,budgetShared:config.budgetShared,budgetPeriod:config.budgetPeriod};}
          if(config?.targetCpaResolution==='not_set')metrics.cpa_desejado={valor:null,estado:'nao_configurado',origem:'google_ads_api'};
          if(config?.budgetPeriod==='CUSTOM_PERIOD')metrics.orcamento_diario={valor:null,estado:'orcamento_total',origem:'google_ads_api'};
          if(moneySupported&&hasRate){setMetric(metrics,'moeda',capture.currencyCode);if(capture.currencyCode==='USD'&&!override){metrics.exchange_rate_usd_brl=rate;metrics.exchange_rate_usd_brl_source=capture.exchangeRateSource||'Cotação registrada na captura API';metrics.exchange_rate_usd_brl_quote_date=capture.exchangeRateQuoteDate||null;metrics.exchange_rate_usd_brl_retrieved_at=capture.exchangeRateRetrievedAt||null}if(!override){setMetric(metrics,'custo_total',costNative);setMetric(metrics,'custo_medio',averageNative);setMetric(metrics,'valor_conversao',valueNative)}}
          if(period==='d0'&&moneySupported&&hasRate&&costNative!=null){source.custo_D_zero??={};source.custo_D_zero.presente=true;setMetric(source.custo_D_zero,'data',capture.date);setMetric(source.custo_D_zero,'moeda',capture.currencyCode);setMetric(source.custo_D_zero,'custo_total_destino_totais_coluna_M',costNative);if(capture.currencyCode==='USD'){source.custo_D_zero.exchange_rate_usd_brl=rate;source.custo_D_zero.exchange_rate_usd_brl_source=capture.exchangeRateSource||'Cotação registrada na captura API';source.custo_D_zero.exchange_rate_usd_brl_quote_date=capture.exchangeRateQuoteDate||null}}
        }
      }
      base.manifesto_atual=effectiveManifest;
    }
    base.google_ads_api_projection_summary=summary;
    return base;
  }
  function normalizeManifestDate(value,fallback=null){for(const raw of[value,fallback]){const text=String(metricValue(raw)??'').trim(),iso=text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);if(iso)return iso[1];const local=text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);if(local){const day=Number(local[1]),month=Number(local[2]),year=Number(local[3]),date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day)return`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}}return''}
  function manifestNames(manifest){return[...new Set((manifest?.campanhas||[]).map(x=>String(x.nome_campanha_exato||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}))}
  const pausedCampaignState=/^(pausad[ao]s?|paused|removid[ao]s?|removed|excluid[ao]s?|inativ[ao]s?|disabled)$/;
  const activeCampaignState=/^(ativad[ao]s?|ativa|active|enabled|eligible)$/;
  function operationalStateValue(metrics){
    if(!metrics||metrics.presente===false)return null;
    const direct=metricValue(metrics.estado_campanha)??metrics.raw?.campaign_state;
    if(direct!=null&&String(direct).trim())return pausedCampaignState.test(normalizeProductKey(direct))?'pausada':'ativa';
    const fallback=metricValue(metrics.status_campanha),normalized=normalizeProductKey(fallback);
    if(fallback!=null&&pausedCampaignState.test(normalized))return'pausada';
    if(fallback!=null&&activeCampaignState.test(normalized))return'ativa';
    return null;
  }
  function explicitPauseDate(source,manifest){
    const d0=source?.metricas_D_zero,d1=source?.metricas_D_menos_1,d0State=operationalStateValue(d0);
    if(d0State==='pausada')return normalizeManifestDate(metricValue(d0?.data),manifest?.separacao_temporal?.D_zero?.datas_detectadas?.[0])||null;
    if(d0State==='ativa')return null;
    if(operationalStateValue(d1)==='pausada')return normalizeManifestDate(metricValue(d1?.data),manifest?.separacao_temporal?.D_menos_1?.datas_detectadas?.[0])||null;
    return null;
  }
  function explicitActiveDate(source,manifest){
    const d0=source?.metricas_D_zero,d1=source?.metricas_D_menos_1,d0State=operationalStateValue(d0);
    if(d0State==='ativa')return normalizeManifestDate(metricValue(d0?.data),manifest?.separacao_temporal?.D_zero?.datas_detectadas?.[0])||null;
    if(d0State==='pausada')return null;
    if(operationalStateValue(d1)==='ativa')return normalizeManifestDate(metricValue(d1?.data),manifest?.separacao_temporal?.D_menos_1?.datas_detectadas?.[0])||null;
    return null;
  }
  function confirmedPauseDate(campaign){return campaign?.pausa_confirmada_em||(campaign?.status_origem==='status_na_coleta'?campaign?.pausada_em||null:null)}
  function latestConfirmedAutomaticPause(base,campaignId){
    let latest=null;
    for(const observation of base?.observacoes_diario||[]){if(String(observation?.campanha_id)!==String(campaignId))continue;for(const event of observation.eventos||[]){
      if(event?.tipo!=='google_ads_auto_pause')continue;
      const occurredAt=typeof event.ocorrido_em_utc==='string'&&Number.isFinite(Date.parse(event.ocorrido_em_utc))?new Date(event.ocorrido_em_utc).toISOString():null;
      const date=normalizeManifestDate(event.ocorrido_em_data||observation.data)||(occurredAt?googleAdsDateInTimeZone('America/Sao_Paulo',new Date(occurredAt)):'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
      if(!latest||occurredAt&&(!latest.occurredAtUtc||Date.parse(occurredAt)>Date.parse(latest.occurredAtUtc))||!occurredAt&&!latest.occurredAtUtc&&date>latest.date)latest={date,occurredAtUtc:occurredAt};
    }}
    return latest;
  }
  function googleAdsApiActivityDatesByCampaign(base,captures=base?.google_ads_api_daily_captures||[],providedMappingIndex=null){
    const campaigns=new Map((base?.campanhas||[]).map(item=>[String(item.id),item])),mappingIndex=providedMappingIndex||apiCampaignMappingIndex(base,captures),dates=new Map();
    for(const capture of captures){if(capture?.coverageStatus!=='rows_returned'||capture?.queryComplete!==true)continue;const customer=canonicalAccountId(capture.customerId),manager=canonicalAccountId(capture.managerCustomerId);
      for(const row of capture.rows||[]){const impressions=Number(row?.impressions),clicks=Number(row?.clicks);if(!(Number.isFinite(impressions)&&impressions>0||Number.isFinite(clicks)&&clicks>0))continue;
        const mapping=row.mappingStatus==='unmapped'&&row.campaignInternalId?row:row.mappingStatus==='mapped'&&row.campaignInternalId?row:apiCampaignMapping(base,capture.managerCustomerId,capture.customerId,row,mappingIndex);if(mapping.mappingStatus!=='mapped'||!mapping.campaignInternalId)continue;
        const id=String(mapping.campaignInternalId),campaign=campaigns.get(id),date=String(capture.date||'');if(!campaign||!/^\d{4}-\d{2}-\d{2}$/.test(date)||campaign.conta_id!==customer||manager&&campaign.mcc_id!==manager||campaign.google_ads_campaign_id&&String(row?.campaignId||'')!==String(campaign.google_ads_campaign_id))continue;
        const values=dates.get(id)||[];if(!values.includes(date)){values.push(date);dates.set(id,values)}
      }
    }
    for(const values of dates.values())values.sort();return dates;
  }
  function firstGoogleAdsActivityDateAfterPause(base,campaignId,pauseDate,activityDates=null){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(pauseDate||'')))return null;
    const dates=activityDates||googleAdsApiActivityDatesByCampaign(base).get(String(campaignId))||[];return dates.find(date=>date>pauseDate)||null;
  }
  function confirmAutomaticPause(baseInput,{campaignId,occurredAtUtc}={}){
    const base=normalize(baseInput),matches=base.campanhas.filter(item=>String(item.id)===String(campaignId)),instant=new Date(occurredAtUtc);
    if(matches.length!==1)throw new Error('Campanha não identificada na base local.');
    if(!occurredAtUtc||!Number.isFinite(instant.getTime()))throw new Error('Horário do evento de pausa inválido.');
    const campaign=matches[0],date=googleAdsDateInTimeZone('America/Sao_Paulo',instant);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Data local do evento de pausa inválida.');
    campaign.status='pausada';campaign.pausada_em=date;campaign.pausa_confirmada_em=date;campaign.status_origem='google_ads_auto_pause';campaign.estado_campanha_observado='PAUSED';campaign.movimento_status='pausada';
    base.atualizado_em=new Date().toISOString();return base;
  }
  function recordGoogleAdsManualCampaignStatus(baseInput,{campaignId,googleCampaignId,managerCustomerId,customerId,managerName,accountName,campaignName,status,verifiedAtUtc}={},now=new Date().toISOString()){
    const base=normalize(baseInput),internalId=String(campaignId||'').trim(),googleId=String(googleCampaignId||'').trim(),manager=String(managerCustomerId||'').replace(/\D/g,''),account=String(customerId||'').replace(/\D/g,''),target=String(status||'').trim().toUpperCase(),instant=new Date(verifiedAtUtc);
    if(!internalId||!/^[1-9]\d{0,19}$/.test(googleId)||!/^[0-9]{10}$/.test(account)||manager&&!/^[0-9]{10}$/.test(manager)||!['PAUSED','ENABLED'].includes(target)||!verifiedAtUtc||!Number.isFinite(instant.getTime()))throw new Error('A confirmação manual não tem identidade ou horário válidos.');
    const matches=base.campanhas.filter(item=>String(item?.id||'')===internalId);if(matches.length!==1)throw new Error('A campanha confirmada não foi identificada de forma única na base local.');
    const campaign=matches[0],campaignAccount=String(campaign.conta_id||'').replace(/\D/g,''),campaignManager=String(campaign.mcc_id||'').replace(/\D/g,''),linkedGoogleId=String(campaign.google_ads_campaign_id||'').trim();
    if(campaignAccount!==account||campaignManager!==manager||linkedGoogleId&&linkedGoogleId!==googleId)throw new Error('A conta, MCC ou ID Google Ads da campanha não corresponde ao registro local.');
    const date=googleAdsDateInTimeZone('America/Sao_Paulo',instant);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('A data local da confirmação manual é inválida.');
    campaign.google_ads_campaign_id=googleId;campaign.status=target==='PAUSED'?'pausada':'ativa';campaign.status_origem='google_ads_manual_action';campaign.estado_campanha_observado=target;campaign.status_confirmado_em_utc=instant.toISOString();campaign.movimento_status=target==='PAUSED'?'pausada':'reativada';
    if(target==='PAUSED'){campaign.pausada_em=date;campaign.pausa_confirmada_em=date;const name=String(campaignName||campaign.nome_mcc||campaign.nome_exibicao||'').trim();if(!name)throw new Error('O nome da campanha não está disponível para registrar a pausa manual.');const completedAtUtc=instant.toISOString(),id=`google-ads-manual-pause:${internalId}:${completedAtUtc}`,entry={id,eventType:'manual_pause',completedAtUtc,periodType:'Ação',executionMode:'manual',status:'completed',scope:'CAMPAIGN',accountCount:1,managerCount:manager?1:0,captureDatesWithBaseline:0,captureDatesWithoutBaseline:0,comparedCampaignDateCount:0,diffRowCount:1,changedFieldCount:1,changes:[{managerCustomerId:manager||null,managerName:String(managerName||manager||'MCC não identificada').slice(0,100),customerId:account,accountName:String(accountName||`Conta ${account}`).slice(0,160),currencyCode:'',date,campaignId:googleId,campaignInternalId:internalId,campaignName:name.slice(0,240),reason:'Pausa manual confirmada pela interface do Hub.',source:'hub_manual_campaign_action',fields:[{key:'campaignStatus',before:'ENABLED',after:'PAUSED'}]}]};base.google_ads_api_change_history=mergeGoogleAdsCaptureHistory(base.google_ads_api_change_history,[entry])}
    else{campaign.reativada_em=date;delete campaign.pausada_em;delete campaign.pausa_confirmada_em}
    base.atualizado_em=now;return base;
  }
  function campaignDiaryStatusWindow(baseInput,campaignId,options={}){
    const{manifest=null,source=null}=options;
    const base=baseInput?.schema===SCHEMA?baseInput:create(),campaign=base.campanhas.find(item=>String(item.id)===String(campaignId));if(!campaign)return{pauseConfirmedAt:null,reactivatedAt:null};
    let matchingSource=null,currentState=null,sourcePause=null,sourceActive=null;
    if(manifest){const exactName=String(campaign.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'),candidates=(manifest.campanhas||[]).filter(item=>String(item.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR')===exactName),sameIdentity=item=>{try{return(!campaign.conta_id||sourceAccountId(item)===canonicalAccountId(campaign.conta_id))&&(!campaign.mcc_id||sourceManagerId(item,manifest)===canonicalAccountId(campaign.mcc_id))}catch{return false}};matchingSource=source||(candidates.find(sameIdentity)||(candidates.length===1?candidates[0]:null));currentState=matchingSource?manifestOperationalStates(manifest).get(exactName):null;sourcePause=explicitPauseDate(matchingSource,manifest);sourceActive=explicitActiveDate(matchingSource,manifest)||(currentState==='ativa'?manifestDate(manifest):null)}
    const event=latestConfirmedAutomaticPause(base,campaignId),explicit=confirmedPauseDate(campaign),recordedPause=[explicit,event?.date].filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))).sort().at(-1)||null;
    const apiActivity=recordedPause?firstGoogleAdsActivityDateAfterPause(base,campaignId,recordedPause,Object.hasOwn(options,'apiActivityDates')?options.apiActivityDates:null):null;
    // ultima_aparicao and the current manifest date are observation dates, not
    // proof of when delivery resumed. Prefer the earliest dated evidence.
    const reactivationCandidates=[campaign.reativada_em,...[sourceActive,apiActivity].filter(value=>!recordedPause||value>recordedPause)].filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&(!recordedPause||value>=recordedPause)).sort();
    const reactivatedAt=reactivationCandidates[0]||null;
    // A repeated paused status is not a new pause. Keep the original cutoff until
    // a confirmed reactivation opens a new cycle; then the source can establish
    // the date of a subsequent explicit pause.
    const sourceStartsNewPause=sourcePause&&(!recordedPause||reactivatedAt&&reactivatedAt>recordedPause&&sourcePause>=reactivatedAt),pauseConfirmedAt=sourceStartsNewPause?sourcePause:recordedPause;
    return{pauseConfirmedAt,reactivatedAt:reactivatedAt&&pauseConfirmedAt&&reactivatedAt>=pauseConfirmedAt?reactivatedAt:null};
  }
  function campaignDiaryDateAllowed(base,campaignId,date,options={}){
    const normalized=normalizeManifestDate(date);if(!normalized)return true;
    const{pauseConfirmedAt,reactivatedAt}=campaignDiaryStatusWindow(base,campaignId,options);
    return!pauseConfirmedAt||normalized<=pauseConfirmedAt||Boolean(reactivatedAt&&normalized>=reactivatedAt);
  }
  // D−1 supplies financial history; only the current collection determines activity.
  function manifestOperationalStates(manifest){
    const hasD0=Boolean(manifest?.separacao_temporal?.D_zero?.datas_detectadas?.length),states=new Map();
    for(const source of manifest?.campanhas||[]){
      const key=String(source.nome_campanha_exato||'').trim().toLowerCase();if(!key)continue;
      const apiStatus=source.google_ads_current_configuration?.campaignStatus;
      if(['ENABLED','PAUSED','REMOVED'].includes(apiStatus)){states.set(key,apiStatus==='ENABLED'?'ativa':'pausada');continue}
      const d0=source.metricas_D_zero,d1=source.metricas_D_menos_1,d0State=operationalStateValue(d0),d1State=operationalStateValue(d1);
      if(hasD0){
        if(!d0)states.set(key,d1?d1State||'ativa':'ausente');
        else if(d0.presente===false)states.set(key,d1State==='pausada'?'pausada':'ausente');
        else states.set(key,d0State|| (d1State==='pausada'?'pausada':'ativa'));
        continue;
      }
      const metrics=d0?.presente!==false&&d0?d0:d1;
      if(!metrics||metrics.presente===false){states.set(key,'ausente');continue}
      states.set(key,operationalStateValue(metrics)||'ativa');
    }
    return states;
  }
  function snapshotActiveNames(snapshot){return snapshot?.campanhas_ativas??snapshot?.campanhas??[]}
  function manifestAccountScope(manifest){
    const records=manifest?.campanhas||[],ids=records.map(sourceAccountId);
    return records.length&&ids.every(Boolean)?new Set(ids):null;
  }
  function campaignInScope(campaign,manifest){const scope=manifestAccountScope(manifest),managerId=sourceManagerId(null,manifest),campaignManagerId=canonicalAccountId(campaign?.mcc_id),captureScope=manifest?.captura_D_zero?.escopo;if(managerId&&campaignManagerId!==managerId)return false;if(managerId&&!['all_campaigns','active_only'].includes(captureScope)&&!manifestNames(manifest).some(name=>String(name).trim().toLowerCase()===String(campaign?.nome_mcc||'').trim().toLowerCase()))return false;if(scope)return scope.has(canonicalAccountId(campaign?.conta_id));return managerId?campaignManagerId===managerId:true}
  function mergeD0Coverage(previous,incoming,retainedCount=0){
    const coverage={...(previous?.cobertura_D_zero_por_mcc||{})},id=String(incoming?.identificacao_mcc?.id||''),capture=incoming?.captura_D_zero,date=incoming?.separacao_temporal?.D_zero?.datas_detectadas?.[0];
    if(!id||!capture||!date)return coverage;
    const prior=coverage[id],sameDate=prior?.data===date,scope=['all_campaigns','active_only'].includes(capture.escopo)?capture.escopo:'unknown',complete=scope==='all_campaigns'||(sameDate&&prior?.completa===true);
    coverage[id]={data:date,escopo:scope,completa:complete,campanhas_capturadas:Number(capture.campanhas_capturadas)||0,campanhas_retidas:retainedCount,capturada_em:capture.capturada_em||incoming.gerado_em_utc||null};
    return coverage;
  }
  function applyD0CoverageToCampaigns(campaigns,coverage,managerId){
    const item=coverage?.[String(managerId||'')];if(!item)return;
    for(const campaign of campaigns||[])if(!managerId||String(campaign.mcc_id||'')===String(managerId)){
      campaign.captura_D_zero_escopo=item.escopo;campaign.captura_D_zero_completa=item.completa;campaign.captura_D_zero_data=item.data;
    }
  }
  function mergeD1Coverage(previous,incoming){
    const coverage={...(previous?.cobertura_D_menos_1_por_mcc||{})},id=sourceManagerId(null,incoming),date=incoming?.separacao_temporal?.D_menos_1?.datas_detectadas?.[0];
    if(id&&date&&incoming?.separacao_temporal?.D_menos_1?.estado!=='nao_fornecido')coverage[id]={data:date,capturada_em:incoming?.captura_D_menos_1?.capturada_em||incoming?.gerado_em_utc||null};
    return coverage;
  }
  function mergeAccountCaptures(base,previous,incoming){
    const managerId=sourceManagerId(null,incoming),accountScope=manifestAccountScope(incoming);
    if((!managerId&&!accountScope)||!previous?.campanhas?.length){const result=clone(incoming);result.cobertura_D_zero_por_mcc=mergeD0Coverage(previous,incoming);result.cobertura_D_menos_1_por_mcc=mergeD1Coverage(previous,incoming);applyD0CoverageToCampaigns(result.campanhas,result.cobertura_D_zero_por_mcc,incoming.identificacao_mcc?.id);return result}
    const incomingNames=new Set(manifestNames(incoming).map(name=>name.toLowerCase())),byName=new Map(base.campanhas.map(c=>[String(c.nome_mcc||'').toLowerCase(),c]));
    const dates=manifest=>['D_zero','D_menos_1'].flatMap(role=>manifest?.separacao_temporal?.[role]?.datas_detectadas||[]);
    const d0Date=incoming.separacao_temporal?.D_zero?.datas_detectadas?.[0],partialD0=managerId?incoming.captura_D_zero?.escopo!=='all_campaigns':incoming.captura_D_zero?.escopo==='active_only';
    const records=(incoming.campanhas||[]).map(item=>{const record={...clone(item),datas_coleta:dates(incoming)},prior=previous.campanhas.find(candidate=>(managerId?sourceManagerId(candidate,null)===managerId:sourceAccountId(candidate)!=null&&accountScope.has(sourceAccountId(candidate)))&&String(candidate.nome_campanha_exato||'').trim().toLowerCase()===String(item.nome_campanha_exato||'').trim().toLowerCase()),priorDate=prior?.metricas_D_zero?.data?.valor||previous.separacao_temporal?.D_zero?.datas_detectadas?.[0];if(partialD0&&d0Date&&priorDate===d0Date&&item.metricas_D_zero?.presente===false&&prior?.metricas_D_zero?.presente!==false&&(prior?.metricas_D_zero||prior?.custo_D_zero)){record.metricas_D_zero=clone(prior.metricas_D_zero);if(record.metricas_D_zero)record.metricas_D_zero.presente=false;record.metricas_D_zero.retida_no_dia=true;record.metricas_D_zero.captura_atual='ausente';if(prior.custo_D_zero){record.custo_D_zero=clone(prior.custo_D_zero);record.custo_D_zero.presente=false;record.custo_D_zero.retida_no_dia=true}record._d0RetidaNaCaptura=true}return record});
    for(const prior of previous.campanhas){
      const name=String(prior.nome_campanha_exato||'').trim(),key=name.toLowerCase();
      if(managerId?sourceManagerId(prior,null)!==managerId:(()=>{const id=sourceAccountId(prior)||canonicalAccountId(byName.get(key)?.conta_id);return !id||!accountScope.has(id)})()){const preserved=clone(prior);preserved.datas_coleta=prior.datas_coleta||dates(previous);records.push(preserved);continue}
      if(incomingNames.has(key))continue;
      // Confirmed title changes retain one campaign, not a second missing record.
      if(base.campanhas.some(c=>incomingNames.has(String(c.nome_mcc||'').toLowerCase())&&[...(c.nome_mcc_anteriores||[]),...(c.cpa_titulos_anteriores||[])].some(alias=>String(alias).toLowerCase()===key)))continue;
      const id=sourceAccountId(prior)||canonicalAccountId(byName.get(key)?.conta_id),preserved=clone(prior);
      preserved.datas_coleta=dates(incoming);
      for(const[field,role]of[['metricas_D_zero','D_zero'],['metricas_D_menos_1','D_menos_1'],['custo_D_zero','D_zero']]){
        const date=incoming.separacao_temporal?.[role]?.datas_detectadas?.[0];
        const priorDate=prior.metricas_D_zero?.data?.valor||previous.separacao_temporal?.D_zero?.datas_detectadas?.[0];
        if(role==='D_zero'&&partialD0&&date&&priorDate===date&&prior.metricas_D_zero&&(prior.metricas_D_zero.presente!==false||prior.metricas_D_zero.retida_no_dia===true)){
          const retained=clone(prior[field]);if(retained){retained.presente=false;retained.retida_no_dia=true;if(field==='metricas_D_zero')retained.captura_atual='ausente';preserved[field]=retained}else preserved[field]={presente:false};
          if(field==='metricas_D_zero')preserved._d0RetidaNaCaptura=true;
          continue;
        }
        preserved[field]=date?{presente:false,data:{valor:date,estado:'confirmado'},...(id?{conta_id:{valor:id,estado:'confirmado'}}:{})}:{presente:false};
      }
      records.push(preserved);
    }
    const result={...clone(incoming),campanhas:records,escopo_contas:{ids:[...new Set(records.map(item=>sourceAccountId(item)||canonicalAccountId(byName.get(String(item.nome_campanha_exato||'').toLowerCase())?.conta_id)).filter(Boolean))],consolidado:true}};
    const retainedCount=result.campanhas.filter(item=>item._d0RetidaNaCaptura).length;
    for(const item of result.campanhas)delete item._d0RetidaNaCaptura;
    result.cobertura_D_zero_por_mcc=mergeD0Coverage(previous,incoming,retainedCount);
    result.cobertura_D_menos_1_por_mcc=mergeD1Coverage(previous,incoming);
    applyD0CoverageToCampaigns(result.campanhas,result.cobertura_D_zero_por_mcc,incoming.identificacao_mcc?.id);
    return result;
  }
  function confirmedDateAliasKeys(base){
    const currentNames=new Set(base.campanhas.map(item=>String(item.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'))),aliases=new Set();
    const parts=name=>{const match=String(name||'').trim().match(/^(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)\s*[–—-]\s*(.+)$/);return match?{date:match[1],suffix:match[2].trim().toLocaleLowerCase('pt-BR')}:null};
    for(const campaign of base.campanhas){if(!campaign.nome_mcc_corrigido_em)continue;const current=parts(campaign.nome_mcc);if(!current)continue;for(const previousName of[campaign.nome_mcc_anterior,...(campaign.nome_mcc_anteriores||[])]){const previous=parts(previousName),key=String(previousName||'').trim().toLocaleLowerCase('pt-BR');if(previous&&previous.suffix===current.suffix&&previous.date!==current.date&&!currentNames.has(key))aliases.add(key)}}
    return aliases;
  }
  function confirmedCpaAliasKeys(base){
    const currentNames=new Set(base.campanhas.map(item=>String(item.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'))),aliases=new Set();
    for(const campaign of base.campanhas)for(const previousName of campaign.cpa_titulos_anteriores||[]){const key=String(previousName||'').trim().toLocaleLowerCase('pt-BR');if(key&&!currentNames.has(key))aliases.add(key)}
    return aliases;
  }
  function campaignNumberGroups(baseInput,manifest){
    const base=normalize(baseInput),incoming=manifestNames(manifest),incomingKeys=new Set(incoming.map(name=>name.toLocaleLowerCase('pt-BR'))),known=new Set(incoming),confirmedAliases=confirmedDateAliasKeys(base),confirmedCpaAliases=confirmedCpaAliasKeys(base);
    for(const campaign of base.campanhas||[])if(campaign.nome_mcc)known.add(String(campaign.nome_mcc).trim());
    for(const snapshot of base.snapshots_campanhas||[])for(const name of snapshot.campanhas||[])if(String(name||'').trim())known.add(String(name).trim());
    for(const campaign of base.manifesto_atual?.campanhas||[])if(campaign.nome_campanha_exato)known.add(String(campaign.nome_campanha_exato).trim());
    const groups=new Map();
    for(const name of known){const group=displayName(name),nameKey=name.toLocaleLowerCase('pt-BR');if((confirmedAliases.has(nameKey)||confirmedCpaAliases.has(nameKey))&&!incomingKeys.has(nameKey)||group.toLocaleLowerCase('pt-BR')===nameKey)continue;const key=group.toLocaleLowerCase('pt-BR'),entry=groups.get(key)||{group,names:new Map(),incomingNames:new Map()};entry.names.set(nameKey,name);if(incomingKeys.has(nameKey))entry.incomingNames.set(nameKey,name);groups.set(key,entry)}
    const dateChanges=campaignDateChangeCandidatesFromBase(base,manifest),cpaChanges=campaignCpaChangeCandidatesFromBase(base,manifest);
    return[...groups.values()].filter(entry=>entry.incomingNames.size&&entry.names.size>1).filter(entry=>!dateChanges.some(item=>entry.names.size===2&&entry.names.has(item.oldName.toLocaleLowerCase('pt-BR'))&&entry.names.has(item.newName.toLocaleLowerCase('pt-BR')))&&!cpaChanges.some(item=>entry.names.has(item.oldName.toLocaleLowerCase('pt-BR'))&&entry.names.has(item.newName.toLocaleLowerCase('pt-BR')))).map(entry=>({group:entry.group,incomingNames:[...entry.incomingNames.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'})),knownNames:[...entry.names.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}))})).sort((a,b)=>a.group.localeCompare(b.group,'pt-BR',{numeric:true,sensitivity:'base'}));
  }
  // Historical names are evidence, not a second campaign in the current collection.
  // Keep exact-name identities separate; never infer a rename from the short number.
  function campaignNumberReuseIssues(baseInput,manifest){
    return campaignNumberGroups(baseInput,manifest).filter(item=>item.incomingNames.length>1);
  }
  function campaignNumberHistoryWarnings(baseInput,manifest){
    return campaignNumberGroups(baseInput,manifest).filter(item=>item.incomingNames.length===1).map(item=>({...item,historicalNames:item.knownNames.filter(name=>!item.incomingNames.some(incoming=>incoming.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))}));
  }
  function campaignDateChangeCandidates(baseInput,manifest){
    return campaignDateChangeCandidatesFromBase(normalize(baseInput),manifest);
  }
  function campaignDateChangeCandidatesFromBase(base,manifest){
    const previous=new Set(manifestNames(base.manifesto_atual).map(name=>name.toLocaleLowerCase('pt-BR'))),existing=new Set(base.campanhas.map(item=>String(item.nome_mcc||'').toLocaleLowerCase('pt-BR'))),candidates=[];
    const firstDiaryYear=new Map();for(const row of base.diario){const year=String(row.data||'').slice(0,4);if(!/^\d{4}$/.test(year))continue;const prior=firstDiaryYear.get(row.campanha_id);if(!prior||year<prior)firstDiaryYear.set(row.campanha_id,year)}
    const campaignYear=item=>item.data_inicio_ano_inferido||item.data_inicio_confirmada?.slice(0,4)||firstDiaryYear.get(item.id)||new Date().getFullYear();
    const parts=(name,inferredYear=new Date().getFullYear())=>{const match=String(name||'').match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(\s*[–—-]\s*.+)$/);if(!match)return null;const day=Number(match[1]),month=Number(match[2]),year=match[3]?(match[3].length===2?2000+Number(match[3]):Number(match[3])):Number(inferredYear);if(day<1||day>31||month<1||month>12)return null;return{date:`${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`,suffix:match[4].trim().toLocaleLowerCase('pt-BR')}};
    const incomingNames=new Set(manifestNames(manifest).map(name=>name.toLocaleLowerCase('pt-BR')));
    for(const source of manifest?.campanhas||[]){const newName=String(source.nome_campanha_exato||'').trim(),next=parts(newName);if(!next||existing.has(newName.toLocaleLowerCase('pt-BR')))continue;const account=sourceAccountId(source),legacyAccount=accountSuffix(metricValue(source.metricas_D_zero?.conta)??metricValue(source.metricas_D_menos_1?.conta)),matches=base.campanhas.filter(item=>{const old=parts(item.nome_mcc,campaignYear(item));return old&&old.suffix===next.suffix&&old.date!==next.date&&previous.has(String(item.nome_mcc).toLocaleLowerCase('pt-BR'))&&!incomingNames.has(String(item.nome_mcc).toLocaleLowerCase('pt-BR'))&&(!account||!item.conta_id||account===item.conta_id)&&(!legacyAccount||!item.conta_sufixo||legacyAccount===item.conta_sufixo)});if(matches.length===1){const campaign=matches[0],shortName=displayName(newName);candidates.push({campaignId:campaign.id,oldName:campaign.nome_mcc,newName,shortName:shortName===newName?newName.replace(/^\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\s*[–—-]\s*/,'').split(/\s*\(/)[0].trim():shortName,oldDate:parts(campaign.nome_mcc,campaignYear(campaign)).date,newDate:next.date})}
    }
    const counts=new Map();for(const item of candidates)counts.set(item.campaignId,(counts.get(item.campaignId)||0)+1);return candidates.filter(item=>counts.get(item.campaignId)===1);
  }
  function campaignCpaChangeCandidates(baseInput,manifest){
    return campaignCpaChangeCandidatesFromBase(normalize(baseInput),manifest);
  }
  function campaignCpaChangeCandidatesFromBase(base,manifest){
    const previousByName=new Map((base.manifesto_atual?.campanhas||[]).map(item=>[String(item.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR'),item])),incoming=manifest?.campanhas||[],incomingByName=new Map();
    for(const source of incoming){const key=String(source.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR'),items=incomingByName.get(key)||[];items.push(source);incomingByName.set(key,items)}
    const currentNames=new Set(base.campanhas.map(item=>String(item.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'))),previousNames=new Set([...previousByName.keys()]),percentInfo=name=>{const text=String(name||'').trim(),matches=[...text.matchAll(/(\d{1,3}(?:[.,]\d+)?)%/g)];if(matches.length!==1)return null;const match=matches[0],value=Number(match[1].replace(',','.'));if(!Number.isFinite(value))return null;return{value,signature:`${text.slice(0,match.index)}{CPA_PERCENT}${text.slice(match.index+match[0].length)}`.toLocaleLowerCase('pt-BR')}},hasCpaStrategy=source=>[source?.metricas_D_zero,source?.metricas_D_menos_1].some(metrics=>String(metricValue(metrics?.estrategia_lance)||'').trim().toLocaleLowerCase('pt-BR').startsWith('cpa'));
    const candidates=[];
    for(const [newKey,sources] of incomingByName){if(sources.length!==1||currentNames.has(newKey))continue;const source=sources[0],newName=String(source.nome_campanha_exato||'').trim(),next=percentInfo(newName);if(!next||!hasCpaStrategy(source))continue;const newAccount=sourceAccountId(source);if(!newAccount)continue;
      const matches=base.campanhas.filter(campaign=>{const oldName=String(campaign.nome_mcc||'').trim(),oldKey=oldName.toLocaleLowerCase('pt-BR'),old=percentInfo(oldName),prior=previousByName.get(oldKey);if(!old||old.value===next.value||old.signature!==next.signature||!prior||!hasCpaStrategy(prior)||!previousNames.has(oldKey)||incomingByName.has(oldKey)||campaign.status!=='ativa'||campaign.conta_id!==newAccount)return false;const priorAccount=sourceAccountId(prior);return Boolean(priorAccount&&priorAccount===newAccount)});
      if(matches.length===1)candidates.push({campaignId:matches[0].id,oldName:matches[0].nome_mcc,newName,oldPercent:percentInfo(matches[0].nome_mcc).value,newPercent:next.value});
    }
    const campaignCounts=new Map(),newNameCounts=new Map();for(const item of candidates){campaignCounts.set(item.campaignId,(campaignCounts.get(item.campaignId)||0)+1);const key=item.newName.toLocaleLowerCase('pt-BR');newNameCounts.set(key,(newNameCounts.get(key)||0)+1)}
    return candidates.filter(item=>campaignCounts.get(item.campaignId)===1&&newNameCounts.get(item.newName.toLocaleLowerCase('pt-BR'))===1);
  }
  function setCampaignStartDate(baseInput,campaignId,date){
    const base=normalize(baseInput),campaign=base.campanhas.find(item=>item.id===campaignId),match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));if(!campaign||!match)throw new Error('Campanha ou data inválida.');const check=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));if(check.toISOString().slice(0,10)!==date)throw new Error('Data inválida.');const old=campaignStartDate(campaign.nome_mcc,date);if(!old)throw new Error('O nome da campanha não contém uma data inicial reconhecível.');campaign.data_inicio_confirmada=date;campaign.data_inicio_anterior=old;campaign.data_inicio_confirmada_em=new Date().toISOString();base.atualizado_em=campaign.data_inicio_confirmada_em;return base;
  }
  function setCampaignMinimumRoi(baseInput,campaignId,value){
    const base=normalize(baseInput),campaign=base.campanhas.find(item=>item.id===campaignId),minimum=typeof value==='number'?value:NaN;
    if(!campaign)throw new Error('Campanha não encontrada para editar o ROI mínimo.');
    if(!Number.isFinite(minimum)||minimum<=-100)throw new Error('O ROI mínimo deve ser um número maior que -100%.');
    campaign.roi_minimo_pct=minimum;base.atualizado_em=new Date().toISOString();return base;
  }
  function setCampaignCommissionTestPercent(baseInput,campaignId,value){
    const base=normalize(baseInput),campaign=base.campanhas.find(item=>item.id===campaignId);
    if(!campaign)throw new Error('Campanha não encontrada para editar o limite de teste.');
    if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw new Error('Informe um percentual da comissão maior que zero.');
    campaign.limite_teste_comissao_pct=value;base.atualizado_em=new Date().toISOString();return base;
  }
  function setRemainingAlertThreshold(baseInput,value,yellowValue){
    if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('Informe um valor mínimo de alerta em reais, maior ou igual a zero.');
    if(yellowValue!==undefined&&yellowValue!==null&&(typeof yellowValue!=='number'||!Number.isFinite(yellowValue)||yellowValue<0))throw new Error('Informe um valor mínimo amarelo em reais, maior ou igual a zero, ou deixe em branco.');
    const base=normalize(baseInput);base.valor_restante_alerta_minimo=Math.round(value*100)/100;if(yellowValue!==undefined)base.valor_restante_alerta_amarelo_minimo=yellowValue===null?null:Math.round(yellowValue*100)/100;base.atualizado_em=new Date().toISOString();return base;
  }
  function reconcileCampaignSnapshots(baseInput,snapshotsInput){
    const base=normalize(baseInput),previousStatus=new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x.status])),capturedAt=new Date().toISOString();
    for(const source of snapshotsInput||[]){const date=String(source?.data||'').trim(),names=[...new Set((source?.campanhas||[]).map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));if(!date||!names.length)continue;const snapshot={...clone(source),data:date,capturada_em:source.capturada_em||capturedAt,campanhas:names},sameIndex=base.snapshots_campanhas.findIndex(x=>x.data===date);if(sameIndex>=0)base.snapshots_campanhas[sameIndex]=snapshot;else base.snapshots_campanhas.push(snapshot)}
    base.snapshots_campanhas.sort((a,b)=>a.data.localeCompare(b.data)||a.capturada_em.localeCompare(b.capturada_em));
    const current=base.snapshots_campanhas.at(-1)||null,previous=base.snapshots_campanhas.at(-2)||null;if(!current)return{base,movimentos:{data:null,anterior:null,pausadas:[],novas:[],reativadas:[]}};
    const currentKeys=new Set(snapshotActiveNames(current).map(x=>x.toLowerCase())),previousKeys=new Set(snapshotActiveNames(previous).map(x=>x.toLowerCase())),pausedKeys=new Set((current.campanhas_pausadas||[]).map(x=>x.toLowerCase()));
    for(const campaign of base.campanhas){const exact=String(campaign.nome_mcc||'').trim(),key=exact.toLowerCase();if(!exact)continue;if(currentKeys.has(key)){const wasPaused=previousStatus.get(key)==='pausada'||campaign.pausada_em;campaign.status='ativa';campaign.ultima_aparicao=current.data;campaign.status_origem='presente_na_coleta';campaign.movimento_status=wasPaused&&!previousKeys.has(key)?'reativada':previous&&previousKeys.has(key)?'manteve':'nova';if(wasPaused&&!previousKeys.has(key))campaign.reativada_em=current.data;delete campaign.pausada_em;delete campaign.pausa_confirmada_em}else if(pausedKeys.has(key)||previousKeys.has(key)){const wasPaused=previousStatus.get(key)==='pausada',explicit=pausedKeys.has(key);campaign.status='pausada';if(explicit){const priorConfirmed=confirmedPauseDate(campaign);campaign.pausa_confirmada_em=priorConfirmed&&priorConfirmed<current.data?priorConfirmed:current.data;campaign.pausada_em=campaign.pausa_confirmada_em;campaign.ultima_aparicion=campaign.pausa_confirmada_em}else{if(!wasPaused||!campaign.pausada_em)campaign.pausada_em=current.data;const priorConfirmed=confirmedPauseDate(campaign);if(priorConfirmed)campaign.pausa_confirmada_em=priorConfirmed;campaign.ultima_aparicion=campaign.ultima_aparicion||previous?.data||null}campaign.status_origem=explicit?'status_na_coleta':'ausencia_na_coleta';campaign.movimento_status=wasPaused?'manteve':'pausada'}}
    const movimentos={data:current.data,anterior:previous?.data||null,pausadas:base.campanhas.filter(x=>x.status==='pausada'&&x.pausada_em===current.data).map(x=>x.nome_mcc),novas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='nova').map(x=>x.nome_mcc),reativadas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='reativada'&&x.reativada_em===current.data).map(x=>x.nome_mcc)};base.atualizado_em=capturedAt;return{base,movimentos}
  }
  function updateCampaignSnapshot(base,manifest,previousStatus,previousManifest,dateChanges=[],capturedManifest=manifest){
    const capturedAt=new Date().toISOString(),date=manifestDate(manifest),names=manifestNames(manifest),states=manifestOperationalStates(manifest),activeNames=names.filter(name=>states.get(name.toLowerCase())==='ativa'),currentKeys=new Set(activeNames.map(x=>x.toLowerCase())),explicitPauses=new Map((manifest?.campanhas||[]).map(source=>[String(source.nome_campanha_exato||'').trim().toLowerCase(),explicitPauseDate(source,manifest)]).filter(([key,pauseDate])=>key&&pauseDate));
    if(!base.snapshots_campanhas.length&&base.manifesto_atual){const priorDate=manifestDate(base.manifesto_atual),priorNames=manifestNames(base.manifesto_atual),priorStates=manifestOperationalStates(base.manifesto_atual);if(priorNames.length)base.snapshots_campanhas.push({data:priorDate,capturada_em:base.atualizado_em||capturedAt,campanhas:priorNames,campanhas_ativas:priorNames.filter(name=>priorStates.get(name.toLowerCase())==='ativa')})}
    const sameIndex=base.snapshots_campanhas.findIndex(x=>x.data===date),sameDayPrevious=sameIndex>=0?base.snapshots_campanhas[sameIndex]:null,snapshot={data:date,capturada_em:capturedAt,campanhas:names,campanhas_ativas:activeNames,campanhas_pausadas:names.filter(name=>states.get(name.toLowerCase())==='pausada')},previousQualificationByName=new Map((previousManifest?.campanhas||[]).map(item=>[String(item.nome_campanha_exato||'').toLowerCase(),qualificationStatus(item)]));
    if(sameIndex>=0)base.snapshots_campanhas[sameIndex]=snapshot;else base.snapshots_campanhas.push(snapshot);
    base.snapshots_campanhas.sort((a,b)=>a.data.localeCompare(b.data)||a.capturada_em.localeCompare(b.capturada_em));
    const previous=[...base.snapshots_campanhas].filter(x=>x.data<date).at(-1)||null,transitionPrevious=sameDayPrevious||previous,previousKeys=new Set(snapshotActiveNames(transitionPrevious).map(x=>x.toLowerCase())),priorNameByNew=new Map(dateChanges.map(item=>[item.newName.toLowerCase(),item.oldName.toLowerCase()]));
    for(const campaign of base.campanhas){if(!campaignInScope(campaign,capturedManifest)||!currentKeys.has(String(campaign.nome_mcc||'').trim().toLowerCase()))continue;const pause=latestConfirmedAutomaticPause(base,campaign.id);if(pause&&date>pause.date&&(!campaign.reativada_em||campaign.reativada_em<=pause.date))campaign.reativada_em=date}
    for(const campaign of base.campanhas){if(!campaignInScope(campaign,capturedManifest))continue;const exact=String(campaign.nome_mcc||'').trim(),key=exact.toLowerCase();if(!exact)continue;const presentBefore=previousKeys.has(key)||previousKeys.has(priorNameByNew.get(key));if(currentKeys.has(key)){const wasPaused=previousStatus.get(key)==='pausada'||campaign.pausada_em;campaign.status='ativa';campaign.ultima_aparicao=date;campaign.status_origem='presente_na_coleta';campaign.movimento_status=wasPaused&&!presentBefore?'reativada':transitionPrevious?.data===date?'manteve':previous&&presentBefore?'manteve':'nova';if(wasPaused&&!presentBefore)campaign.reativada_em=date;delete campaign.pausada_em;delete campaign.pausa_confirmada_em;delete campaign.motivo_pausa}else if(states.has(key)||presentBefore||previousQualificationByName.has(key)){const explicitPause=states.get(key)==='pausada',wasPaused=previousStatus.get(key)==='pausada';campaign.status='pausada';if(explicitPause){const detected=explicitPauses.get(key)||date,priorConfirmed=confirmedPauseDate(campaign),confirmedAt=priorConfirmed&&priorConfirmed<detected?priorConfirmed:detected;campaign.pausa_confirmada_em=confirmedAt;campaign.pausada_em=confirmedAt;campaign.ultima_aparicao=confirmedAt;campaign.status_origem='status_na_coleta'}else{if(!wasPaused||!campaign.pausada_em)campaign.pausada_em=date;const priorConfirmed=confirmedPauseDate(campaign);if(priorConfirmed)campaign.pausa_confirmada_em=priorConfirmed;campaign.ultima_aparicao=campaign.ultima_aparicao||transitionPrevious?.data||null;campaign.status_origem='ausencia_na_coleta'}campaign.movimento_status=wasPaused?'manteve':'pausada';const qualification=campaign.status_qualificacao_observado||previousQualificationByName.get(key)||null;if(qualification)campaign.status_qualificacao_observado=qualification;campaign.motivo_pausa=explicitPause?null:isRejectedQualification(qualification)?'reprovacao':null}}
    return{data:date,anterior:previous?.data||null,pausadas:base.campanhas.filter(x=>campaignInScope(x,capturedManifest)&&x.status==='pausada'&&(x.pausada_em===date||explicitPauses.get(String(x.nome_mcc||'').toLowerCase())===x.pausada_em)).map(x=>x.nome_mcc),novas:base.campanhas.filter(x=>campaignInScope(x,capturedManifest)&&x.status==='ativa'&&x.movimento_status==='nova').map(x=>x.nome_mcc),reativadas:base.campanhas.filter(x=>campaignInScope(x,capturedManifest)&&x.status==='ativa'&&x.movimento_status==='reativada'&&x.reativada_em===date).map(x=>x.nome_mcc)}
  }
  function metricValue(value){if(value==null||value==='')return null;if(typeof value==='object'&&Object.hasOwn(value,'valor')){if(['ausente','invalido'].includes(value.estado))return null;return value.valor===''?null:value.valor}return value}
  function conversionValueOverrideKey(campaignId,date,period){return`${String(campaignId)}|${String(date)}|${String(period)}`}
  function findConversionValueOverride(base,campaignId,date,period){const key=conversionValueOverrideKey(campaignId,date,period);return(base.mcc_conversion_value_overrides||[]).find(item=>item?.key===key)||null}
  function setMetricValue(metrics,key,value){const previous=metrics?.[key];metrics[key]=previous&&typeof previous==='object'&&Object.hasOwn(previous,'valor')?{...previous,valor:value,estado:'corrigido_manualmente'}:value}
  function applyConversionValueOverrideToSource(base,campaign,source,period,manifest){
    const field=period==='d1'?'metricas_D_menos_1':'metricas_D_zero',temporalKey=period==='d1'?'D_menos_1':'D_zero',metrics=source?.[field];if(!metrics)return null;
    const date=normalizeManifestDate(metrics.data,manifest?.separacao_temporal?.[temporalKey]?.datas_detectadas?.[0]),override=date&&findConversionValueOverride(base,campaign.id,date,period);if(!override)return null;
    setMetricValue(metrics,'valor_conversao',override.value);setMetricValue(metrics,'moeda',override.currency);
    if(override.currency==='USD'&&Number.isFinite(Number(override.exchange_rate_usd_brl)))metrics.exchange_rate_usd_brl=Number(override.exchange_rate_usd_brl);
    return override;
  }
  function applyConversionValueOverrideToDiary(base,override){
    const campaign=base.campanhas.find(item=>item.id===override.campaign_id);if(!campaign)return null;
    let row=base.diario.find(item=>item.campanha_id===override.campaign_id&&item.data===override.date);
    if(!row){row={campanha_id:override.campaign_id,data:override.date,celulas:{},fontes:['conversion_value_override'],periodos:[override.period]};base.diario.push(row)}
    row.celulas??={};row.celulas.P={...(row.celulas.P&&typeof row.celulas.P==='object'?row.celulas.P:{}),value:Number(override.value)*(override.currency==='USD'?Number(override.exchange_rate_usd_brl)||1:1)};
    row.periodos??=[];if(!row.periodos.includes(override.period))row.periodos.push(override.period);row.fontes??=[];if(!row.fontes.includes('conversion_value_override'))row.fontes.push('conversion_value_override');
    return row;
  }
  function applyStoredConversionValueOverridesToDiary(base){for(const override of base.mcc_conversion_value_overrides||[])applyConversionValueOverrideToDiary(base,override)}
  function applyStoredConversionValueOverridesToManifest(base,manifest){
    if(!manifest||!Array.isArray(manifest.campanhas))return manifest;
    const campaigns=new Map(base.campanhas.map(item=>[String(item.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'),item]));
    for(const source of manifest.campanhas){const campaign=campaigns.get(String(source?.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR'));if(!campaign)continue;for(const period of['d0','d1']){const override=applyConversionValueOverrideToSource(base,campaign,source,period,manifest);if(override)applyConversionValueOverrideToDiary(base,override)}}
    return manifest;
  }
  // Search impression share is a percentage, not a top/absolute-top rate.
  // Bounds remain non-numeric observations; absent/invalid values never become zero.
  function parseSearchImpressionShare(raw){
    const original=String(raw??'').trim();
    if(!original||/^(?:--?|—|n\/?a|n\.a\.|não disponível|nao disponivel)$/i.test(original))return{valor:null,estado:'ausente',original};
    const match=original.match(/^([<>])?\s*(\d+(?:[.,]\d+)?)\s*%?$/),value=match?Number(match[2].replace(',','.')):NaN;
    if(!Number.isFinite(value)||value<0||value>100)return{valor:null,estado:'invalido',original};
    if(match[1])return{valor:null,estado:'limite',operador:match[1],limite:value,original};
    return{valor:value,estado:value===0?'zero_confirmado':'confirmado',original};
  }
  function searchImpressionShareCells(metrics){
    const key='participacao_impressao_rede_pesquisa';
    if(!Object.hasOwn(metrics||{},key))return{};
    const field=metrics[key],state=field?.estado;
    const parsed=state==='ausente'||state==='invalido'?{valor:null,estado:state,original:String(field.original??'')}:parseSearchImpressionShare(state==='limite'?`${field.operador} ${field.limite}%`:field?.valor??field);
    const cell={value:parsed.estado==='limite'?`${parsed.operador}${String(parsed.limite).replace('.',',')}%`:parsed.valor==null?null:parsed.valor/100,estado:parsed.estado,original:String(field?.original??parsed.original)};
    if(parsed.estado==='limite')Object.assign(cell,{operador:parsed.operador,limite:parsed.limite});
    return{R:cell};
  }
  function explicitCampaignStatus(source){for(const metrics of[source?.metricas_D_zero,source?.metricas_D_menos_1]){const value=metricValue(metrics?.estado_campanha)??metrics?.raw?.campaign_state;if(value!=null&&String(value).trim())return String(value).trim();const fallback=metricValue(metrics?.status_campanha),normalized=normalizeProductKey(fallback);if(fallback!=null&&(pausedCampaignState.test(normalized)||activeCampaignState.test(normalized)))return String(fallback).trim()}return null}
  function qualificationStatus(source){for(const metrics of[source?.metricas_D_zero,source?.metricas_D_menos_1]){const value=metricValue(metrics?.status_qualificacao)??metricValue(metrics?.status_campanha)??metrics?.raw?.status;if(value!=null&&String(value).trim())return String(value).trim()}return null}
  function isRejectedQualification(value){const normalized=normalizeProductKey(value);return /nao qualificad|reprovad|disapprov|not eligible|ineligible/.test(normalized)}
  function normalizeProductKey(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
  function sourceAccountId(source){const values=[metricValue(source?.metricas_D_zero?.conta_id),metricValue(source?.metricas_D_menos_1?.conta_id)].filter(value=>value!=null&&value!=='');const ids=[...new Set(values.map(canonicalAccountId))];if(ids.includes(null)||ids.length>1)throw new Error(`Número completo da conta inválido ou divergente para a campanha “${source?.nome_campanha_exato||''}”.`);return ids[0]||null}
  function sourceManagerId(source,manifest){const raw=source?.mcc_id??manifest?.identificacao_mcc?.id;if(raw==null||raw==='')return null;const id=canonicalAccountId(raw);if(!id)throw new Error(`ID de MCC inválido para a campanha “${source?.nome_campanha_exato||''}”.`);return id}
  function validateCampaignMccIdentity(base,manifest){const incomingByName=new Map();for(const source of manifest?.campanhas||[]){const name=String(source?.nome_campanha_exato||''),key=name.toLowerCase(),incomingId=sourceManagerId(source,manifest);if(!name||!incomingId)continue;const priorIncoming=incomingByName.get(key);if(priorIncoming&&priorIncoming.id!==incomingId)throw campaignMccIdentityError(name,priorIncoming.id,incomingId);incomingByName.set(key,{name,id:incomingId});for(const existing of base.campanhas){if(String(existing?.nome_mcc||'').toLowerCase()!==key)continue;const existingId=canonicalAccountId(existing?.mcc_id);if(existingId&&existingId!==incomingId)throw campaignMccIdentityError(name,existingId,incomingId)}}}
  function campaignMccIdentityError(name,existingId,incomingId){const error=new Error(`A importação foi interrompida para preservar os dados: a campanha “${name}” já está associada à MCC ${existingId}, mas o manifesto a identifica na MCC ${incomingId}. Nome de campanha sozinho não confirma que seja o mesmo registro; revise a associação antes de importar.`);error.code='CAMPAIGN_MCC_IDENTITY_CONFLICT';return error}
  function upsertManager(base,id,name,importedAt=null){const label=String(name||'').trim();if(!/^MCC(?:\s+.+)?$/i.test(label))throw new Error(`Nome da MCC inválido para o ID ${id}.`);const now=new Date().toISOString(),timestamp=importedAt||now;let manager=base.mccs.find(item=>item.id===id);if(!manager){manager={id,nome:label,atualizado_em:now,ultima_importacao_em:timestamp};base.mccs.push(manager);return manager}if(manager.nome!==label){manager.nomes_anteriores=[...new Set([...(manager.nomes_anteriores||[]),manager.nome].filter(Boolean))];manager.nome=label;manager.atualizado_em=now}manager.ultima_importacao_em=timestamp;return manager}
  function accountForSource(source,campaign){const account=metricValue(source?.metricas_D_zero?.conta)??metricValue(source?.metricas_D_menos_1?.conta);return sourceAccountId(source)||campaign?.conta_id||accountSuffix(account)||campaign?.conta_sufixo||null}
  function linkHistoricalAccounts(base,manifest){
    const observed=new Map(),domainsById=new Map(),add=(suffix,id)=>{if(!suffix||!id)return;const ids=observed.get(suffix)||new Set();ids.add(id);observed.set(suffix,ids)};
    for(const [suffix,id] of Object.entries(base.contas_identidade||{}))add(suffix,canonicalAccountId(id));
    for(const campaign of base.campanhas)add(campaign.conta_sufixo,canonicalAccountId(campaign.conta_id));
    for(const source of manifest?.campanhas||[]){const id=sourceAccountId(source);if(!id)continue;for(const metrics of[source.metricas_D_zero,source.metricas_D_menos_1]){const account=metricValue(metrics?.conta),domain=accountDomain(account);add(accountSuffix(account),id);if(domain){const domains=domainsById.get(id)||new Set();domains.add(domain);domainsById.set(id,domains)}}}
    for(const [suffix,ids] of observed)if(ids.size>1&&base.contas_identidade?.[suffix])throw new Error(`O prefixo histórico ${suffix} passou a apontar para contas completas diferentes. Revise a associação antes de atualizar a base.`);
    const aliases=Object.fromEntries([...observed].filter(([,ids])=>ids.size===1).map(([suffix,ids])=>[suffix,[...ids][0]]));
    base.contas_identidade=aliases;
    for(const campaign of base.campanhas){const id=aliases[campaign.conta_sufixo],domains=domainsById.get(id);if(!campaign.conta_id&&id&&(!campaign.conta_dominio||!domains?.size||domains.has(campaign.conta_dominio)))campaign.conta_id=id}
    const byId=new Map(base.campanhas.map(campaign=>[campaign.id,campaign]));
    for(const sale of base.vendas_provisorias||[]){const campaign=byId.get(sale.campanha_id);if(campaign?.conta_id&&(!sale.conta||sale.conta===campaign.conta_sufixo))sale.conta=campaign.conta_id}
    return aliases
  }
  function importManifest(baseInput,manifestInput,rowFactory,{overwrite=false,confirmedDateChanges=[]}={}){
    const manifest=clone(manifestInput),importedAt=new Date().toISOString(),base=normalize(baseInput),beforeManifest=clone(base.manifesto_atual),conflicts=[],previousStatus=new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x.status]));
    const dateChanges=campaignDateChangeCandidates(base,manifest),cpaChanges=campaignCpaChangeCandidates(base,manifest),nameChanges=[...dateChanges,...cpaChanges],confirmed=new Set(confirmedDateChanges.map(item=>`${item.campaignId}|${item.oldName}|${item.newName}`));if(dateChanges.some(item=>!confirmed.has(`${item.campaignId}|${item.oldName}|${item.newName}`))){const error=new Error('Há mudança de data no nome de campanha que precisa de confirmação.');error.code='CAMPAIGN_DATE_CHANGE_CONFIRMATION_REQUIRED';error.dateChanges=dateChanges;throw error}for(const item of dateChanges){const campaign=base.campanhas.find(value=>value.id===item.campaignId);campaign.nome_mcc_anteriores=[...new Set([...(campaign.nome_mcc_anteriores||[]),campaign.nome_mcc_anterior,item.oldName].filter(Boolean))];campaign.nome_mcc=item.newName;campaign.nome_mcc_anterior=item.oldName;campaign.nome_mcc_corrigido_em=new Date().toISOString();if(/^\d{1,2}[\/-]\d{1,2}\s*[–—-]/.test(item.newName))campaign.data_inicio_ano_inferido=new Date().getFullYear();previousStatus.set(item.newName.toLowerCase(),previousStatus.get(item.oldName.toLowerCase()))}for(const item of cpaChanges){const campaign=base.campanhas.find(value=>value.id===item.campaignId);campaign.cpa_titulos_anteriores=[...new Set([...(campaign.cpa_titulos_anteriores||[]),item.oldName].filter(Boolean))];campaign.nome_mcc=item.newName;campaign.nome_exibicao=displayName(item.newName);previousStatus.set(item.newName.toLowerCase(),previousStatus.get(item.oldName.toLowerCase()))}
    validateCampaignMccIdentity(base,manifest);const dailyIndex=new Map(base.diario.map(x=>[`${x.campanha_id}|${x.data}`,x]));
    for(const source of manifest?.campanhas||[]){
      const exact=source.nome_campanha_exato,campaign=ensureCampaign(base,{exactName:exact,sheetName:displayName(exact),status:'ativa',referenceDate:manifestDate(manifest)});for(const period of['d0','d1'])applyConversionValueOverrideToSource(base,campaign,source,period,manifest);
      const accountValues=[metricValue(source.metricas_D_zero?.conta),metricValue(source.metricas_D_menos_1?.conta)],suffix=accountValues.map(accountSuffix).find(Boolean),domain=accountValues.map(accountDomain).find(Boolean),fullId=sourceAccountId(source);
      const managerId=sourceManagerId(source,manifest),managerName=source?.mcc_nome||manifest?.identificacao_mcc?.nome;
      if(managerId){upsertManager(base,managerId,managerName,importedAt);campaign.mcc_id=managerId}
      if(fullId&&campaign.conta_id&&campaign.conta_id!==fullId)throw new Error(`A campanha “${exact}” já pertence a outra conta completa. A importação foi interrompida.`);
      if(fullId)campaign.conta_id=fullId;
      if(suffix&&!campaign.conta_sufixo)campaign.conta_sufixo=suffix;
      if(domain)campaign.conta_dominio=domain;
      const observedStatus=explicitCampaignStatus(source),observedQualification=qualificationStatus(source);
      if(observedStatus)campaign.estado_campanha_observado=observedStatus;
      if(observedQualification)campaign.status_qualificacao_observado=observedQualification;
      const made=rowFactory(source),rows=Array.isArray(made)?made:[made];
      for(const row of rows.filter(Boolean)){
        const dateValue=row.date||source.metricas_D_menos_1?.data?.valor||manifest?.separacao_temporal?.D_menos_1?.datas_detectadas?.[0],date=normalizeManifestDate(dateValue);
        if(!date||!campaignDiaryDateAllowed(base,campaign.id,date,{manifest,source}))continue;
        const key=`${campaign.id}|${date}`,existing=base.diario.find(item=>item.campanha_id===campaign.id&&item.data===date)||dailyIndex.get(key);
        if(existing){existing.celulas=mergeCells(existing.celulas,row.cells,overwrite,conflicts,{campanha:campaign.nome_exibicao,data:date});if(!existing.fontes.includes('manifesto'))existing.fontes.push('manifesto');existing.periodos??=[];if(row.period&&!existing.periodos.includes(row.period))existing.periodos.push(row.period);dailyIndex.set(key,existing)}
        else{const record={campanha_id:campaign.id,data:date,celulas:clone(row.cells),fontes:['manifesto'],periodos:row.period?[row.period]:[]};base.diario.push(record);dailyIndex.set(key,record)}
        const rowPeriod=row.period|| (date===normalizeManifestDate(source.metricas_D_menos_1?.data,manifest?.separacao_temporal?.D_menos_1?.datas_detectadas?.[0])?'d1':'d0'),override=findConversionValueOverride(base,campaign.id,date,rowPeriod);if(override)applyConversionValueOverrideToDiary(base,override);
      }
    }
    const manifestManagerId=sourceManagerId(null,manifest),manifestManagerName=manifest?.identificacao_mcc?.nome;if(manifestManagerId&&manifestManagerName)upsertManager(base,manifestManagerId,manifestManagerName,importedAt);
    linkHistoricalAccounts(base,manifest);
    const reconciledSales=reconcileProvisionalSales(base);const mccBillingSales=buildMccBillingSales(base,manifest,conflicts,{overwrite});const consolidated=mergeAccountCaptures(base,beforeManifest,manifest);applyStoredConversionValueOverridesToManifest(base,consolidated);const movimentos=updateCampaignSnapshot(base,consolidated,previousStatus,beforeManifest,nameChanges,manifest);base.manifesto_atual=consolidated;base.importacoes.push({tipo:'manifesto',executada_em:new Date().toISOString(),registros:(manifest?.campanhas||[]).length,conflitos:conflicts.length,movimentos});base.atualizado_em=new Date().toISOString();return{base,conflicts,movimentos,reconciledSales,mccBillingSales}
  }
  function dailyRows(baseInput,sheetName,campaignId=null){
    const base=normalize(baseInput),campaign=campaignId?base.campanhas.find(x=>x.id===campaignId):base.campanhas.find(x=>String(x.nome_exibicao||'').toLowerCase()===String(sheetName||'').toLowerCase());
    if(!campaign)return[];
    return base.diario.filter(x=>x.campanha_id===campaign.id).sort((a,b)=>a.data.localeCompare(b.data)).map((x,index)=>({index:index+1,cells:clone(x.celulas)}));
  }
  function campaignTotalsMap(baseInput,alreadyNormalized=false){
    const base=alreadyNormalized?baseInput:normalize(baseInput),campaigns=new Map(base.campanhas.map(x=>[x.id,x])),sums=new Map(),rows=new Map(),apiCampaigns=new Set();
    for(const record of base.diario){
      const campaign=campaigns.get(record.campanha_id);
      if(!campaign)continue;
      if(record.fontes?.includes('google_ads_api')||Object.values(record.celulas||{}).some(cell=>cell?.origem==='google_ads_api'))apiCampaigns.add(campaign.id);const total=sums.get(campaign.id)||{investment:0,impressions:0,clicks:0,conversions:0,commission:0,observed:{investment:0,impressions:0,clicks:0,conversions:0,commission:0},byDate:{}};
      const day=total.byDate[record.data]||{investment:null,impressions:null,clicks:null,conversions:null,commission:null};
      for(const [field,column] of Object.entries({investment:'O',impressions:'B',clicks:'C',conversions:'F',commission:'P'})){
        const value=Number(record.celulas?.[column]?.value);
        if(record.celulas?.[column]?.value!=null&&record.celulas[column].value!==''&&Number.isFinite(value)){total[field]+=value;day[field]=(day[field]??0)+value;total.observed[field]++}
      }
      total.byDate[record.data]=day;
      sums.set(campaign.id,total);
      rows.set(campaign.id,(rows.get(campaign.id)||0)+1);
    }
    const map=new Map();
    for(const campaign of base.campanhas){
      if(!rows.has(campaign.id))continue;
      const total=sums.get(campaign.id);
      const exactName=String(campaign.nome_mcc||'').trim(),display=String(campaign.nome_exibicao||displayName(exactName)).trim();
      if(apiCampaigns.has(campaign.id)||campaign.apiSnapshotOnly===true)map.set(`id:${campaign.id}`,total);
      if(exactName)map.set(`mcc:${exactName.toLowerCase()}`,total);
      if(display)map.set(`aba:${display.toLowerCase()}`,total);
    }
    return map;
  }
  function consecutiveZeroImpressionDays(baseInput,campaignId,referenceDate,overrides=[]){
    const base=normalize(baseInput),byDate=new Map();
    for(const record of base.diario){
      if(record.campanha_id!==campaignId||!record.data)continue;
      const raw=record.celulas?.B?.value;
      if(raw==null||raw==='')continue;
      const value=Number(raw);
      if(Number.isFinite(value))byDate.set(record.data,value);
    }
    for(const item of overrides||[]){
      if(!item?.date||item.impressions==null||item.impressions==='')continue;
      const value=Number(item.impressions);
      if(Number.isFinite(value))byDate.set(item.date,value);
    }
    const date=String(referenceDate||[...byDate.keys()].sort().at(-1)||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!byDate.has(date))return null;
    const cursor=new Date(`${date}T00:00:00Z`);let count=0;
    while(true){
      const current=cursor.toISOString().slice(0,10);
      if(!byDate.has(current)||byDate.get(current)!==0)break;
      count++;cursor.setUTCDate(cursor.getUTCDate()-1);
    }
    return count;
  }
  function investmentTotalsMap(baseInput){const totals=campaignTotalsMap(baseInput),map=new Map();for(const [key,value] of totals)map.set(key,value.investment);return map}
  function operationalMap(baseInput,alreadyNormalized=false){const base=alreadyNormalized?baseInput:normalize(baseInput),campaigns=new Map(base.campanhas.map(x=>[x.id,x])),map=new Map();for(const record of base.campos_operacionais){const campaign=campaigns.get(record.campanha_id);if(!campaign?.nome_mcc)continue;map.set(campaign.nome_mcc,{L:record.roi_atual,M:record.investimento_atual,O:record.limite_teste,P:record.valor_restante})}return map}
  function addProvisionalSale(baseInput,input){
    const base=normalize(baseInput),campaign=base.campanhas.find(x=>x.id===input?.campanha_id),date=String(input?.data||'').trim(),amount=Number(input?.valor_brl),country=String(input?.pais_codigo||'').trim().toUpperCase(),dedupe=String(input?.chave_duplicidade||'').trim().toLowerCase();
    if(!campaign)throw new Error('Selecione uma campanha válida para registrar a venda.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('A data da venda não foi reconhecida.');
    if(!Number.isFinite(amount)||amount<=0)throw new Error('O valor da venda não foi reconhecido.');
    if(!/^[A-Z]{2}$/.test(country))throw new Error('Selecione o país ou marque País não identificado.');
    if(!dedupe)throw new Error('Não foi possível criar a chave de prevenção de duplicidade.');
    reconcileProvisionalSales(base);
    const existing=base.vendas_provisorias.find(x=>x.chave_duplicidade===dedupe&&x.status!=='cancelada');
    if(existing){const sameKey=existing.campanha_id===campaign.id&&existing.data===date,flowTrackingConfirmation=input.confirmar_valor_real===true&&sameKey,needsFractionConfirmation=Boolean(existing.mcc_conversao_fracionaria&&!existing.mcc_valor_real_confirmado),canConfirm=flowTrackingConfirmation&&(!existing.valor_real_confirmado||Number(existing.valor_brl)!==amount||needsFractionConfirmation);if(canConfirm){const now=new Date().toISOString();existing.valor_brl=amount;existing.valor_real_confirmado=true;existing.valor_real_confirmado_origem='flowtracking';existing.valor_real_confirmado_em=now;if(existing.mcc_conversao_fracionaria){existing.mcc_valor_real_confirmado=true;existing.mcc_valor_real_confirmado_em=now}existing.editado_em=now;base.atualizado_em=now;return{base,sale:existing,duplicate:true,updated:true}}return{base,sale:existing,duplicate:true};}
    const now=new Date().toISOString(),sale={id:`sale_${idFor(dedupe).slice(4)}`,billing_sale_id:`manual-sale:${idFor(dedupe)}`,campanha_id:campaign.id,conta:campaign.conta_id||campaign.conta_sufixo||null,data:date,hora:String(input.hora||'').trim()||null,produto:String(input.produto||'').trim()||null,plataforma:String(input.plataforma||'').trim()||null,valor_brl:amount,pais_codigo:country,origem:String(input.origem||'FlowTracking').trim(),identificador_mascarado:String(input.identificador_mascarado||'').trim()||null,chave_duplicidade:dedupe,status:'provisoria',registrada_em:now};if(input.confirmar_valor_real===true){sale.valor_real_confirmado=true;sale.valor_real_confirmado_origem='flowtracking';sale.valor_real_confirmado_em=now}
    base.vendas_provisorias.push(sale);reconcileProvisionalSales(base);if(input.confirmar_valor_real===true&&sale.mcc_conversao_fracionaria){sale.mcc_valor_real_confirmado=true;sale.mcc_valor_real_confirmado_em=now}base.importacoes.push({tipo:'venda_provisoria',executada_em:now,registros:1,conflitos:0});base.atualizado_em=now;return{base,sale,duplicate:false};
  }
  function updateProvisionalSale(baseInput,input){
    const base=normalize(baseInput);reconcileProvisionalSales(base);const sale=base.vendas_provisorias.find(item=>String(item.id)===String(input?.id)),campaign=base.campanhas.find(item=>item.id===input?.campanha_id),date=String(input?.data||'').trim(),parsedDate=new Date(`${date}T00:00:00Z`),amount=Number(input?.valor_brl),country=String(input?.pais_codigo||'').trim().toUpperCase(),dedupe=String(input?.chave_duplicidade||sale?.chave_duplicidade||'').trim().toLowerCase(),hour=String(input?.hora||'').trim(),product=String(input?.produto||'').trim(),platform=String(input?.plataforma||'').trim();
    if(!sale||sale.status==='cancelada')throw new Error('O lançamento provisório não está disponível para edição.');
    if(!campaign)throw new Error('Selecione uma campanha válida para o lançamento.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date)throw new Error('A data da venda não foi reconhecida.');
    if(!Number.isFinite(amount)||amount<=0)throw new Error('Informe um valor em reais maior que zero.');
    if(!/^[A-Z]{2}$/.test(country))throw new Error('Selecione um país válido.');
    if(hour&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hour))throw new Error('Informe a hora no formato HH:MM.');
    if(!product||!platform)throw new Error('Produto e plataforma são obrigatórios.');
    if(!dedupe)throw new Error('Não foi possível preservar a chave de prevenção de duplicidade.');
    if(base.vendas_provisorias.some(item=>item.id!==sale.id&&item.status!=='cancelada'&&item.chave_duplicidade===dedupe))throw new Error('A alteração corresponde a outro lançamento já registrado; nenhum dado foi alterado.');
    const now=new Date().toISOString(),fractionalKeyUnchanged=sale.campanha_id===campaign.id&&sale.data===date,amountChanged=Number(sale.valor_brl)!==amount;
    if(!fractionalKeyUnchanged){delete sale.mcc_conversao_fracionaria;delete sale.mcc_valor_real_confirmado;delete sale.mcc_valor_real_confirmado_em}
    Object.assign(sale,{campanha_id:campaign.id,conta:campaign.conta_id||campaign.conta_sufixo||null,data:date,hora:hour||null,produto:product,plataforma:platform,valor_brl:amount,pais_codigo:country,chave_duplicidade:dedupe,editado_em:now});
    if(amountChanged){sale.valor_real_confirmado=true;sale.valor_real_confirmado_origem='faturamento';sale.valor_real_confirmado_em=now;if(fractionalKeyUnchanged&&sale.mcc_conversao_fracionaria){sale.mcc_valor_real_confirmado=true;sale.mcc_valor_real_confirmado_em=now}}
    reconcileProvisionalSales(base);base.atualizado_em=now;return{base,sale};
  }
  function cancelProvisionalSale(baseInput,{id,reason,now=new Date().toISOString()}={}){
    const base=normalize(baseInput),sale=base.vendas_provisorias.find(item=>String(item.id)===String(id)),why=String(reason||'').trim();
    if(!sale)throw new Error('O lançamento provisório não foi encontrado na base compartilhada.');
    if(!why)throw new Error('Informe o motivo do cancelamento.');
    if(sale.status==='cancelada')return{base,sale,changed:false};
    sale.status_antes_cancelamento=sale.status||'provisoria';
    sale.status='cancelada';sale.cancelada_em=now;sale.motivo_cancelamento=why;
    base.atualizado_em=now;
    return{base,sale,changed:true};
  }
  function correctMccConversionValue(baseInput,{campaign_id,date,period,currency,value,exchange_rate_usd_brl}={}){
    const base=normalize(baseInput),campaign=base.campanhas.find(item=>String(item.id)===String(campaign_id)),isoDate=String(date||'').trim(),normalizedPeriod=String(period||'').trim().toLowerCase(),normalizedCurrency=String(currency||'').trim().toUpperCase(),amount=Number(value);
    if(!campaign?.nome_mcc)throw new Error('A campanha MCC desta conversão não foi encontrada na base compartilhada.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)||normalizeManifestDate(isoDate)!==isoDate)throw new Error('A data da conversão não é válida.');
    if(!['d0','d1'].includes(normalizedPeriod))throw new Error('O período MCC da conversão não foi reconhecido.');
    if(!['BRL','USD'].includes(normalizedCurrency))throw new Error('Selecione a moeda do valor corrigido (R$ ou US$).');
    if(!Number.isFinite(amount)||amount<0)throw new Error('Informe um valor de conversão válido, igual ou maior que zero.');
    const manifest=base.manifesto_atual,source=(manifest?.campanhas||[]).find(item=>String(item.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR')===String(campaign.nome_mcc).trim().toLocaleLowerCase('pt-BR')),field=normalizedPeriod==='d1'?'metricas_D_menos_1':'metricas_D_zero',temporalKey=normalizedPeriod==='d1'?'D_menos_1':'D_zero',metrics=source?.[field],metricDate=metrics?normalizeManifestDate(metrics.data,manifest?.separacao_temporal?.[temporalKey]?.datas_detectadas?.[0]):'',sourceCurrency=metrics&&metricDate===isoDate?String(metricValue(metrics.moeda)||'').trim().toUpperCase():'';
    if(sourceCurrency&&sourceCurrency!==normalizedCurrency)throw new Error(`A MCC registrou este valor em ${sourceCurrency}; a correção deve usar a mesma moeda.`);
    const previousOverride=findConversionValueOverride(base,campaign.id,isoDate,normalizedPeriod),row=base.diario.find(item=>item.campanha_id===campaign.id&&item.data===isoDate),priorDailyValue=row?.celulas?.P?.value,sourceValue=metrics&&metricDate===isoDate?(metricValue(metrics.valor_conversao)??metricValue(metrics.comissao_recebida)):null,rawRate=metrics&&metricDate===isoDate?Number(metrics.exchange_rate_usd_brl):NaN,exchangeRate=normalizedCurrency==='USD'?(Number.isFinite(rawRate)&&rawRate>0?rawRate:Number(exchange_rate_usd_brl)) : null;
    if(normalizedCurrency==='USD'&&(!Number.isFinite(exchangeRate)||exchangeRate<=0))throw new Error('Não há cotação USD/BRL válida para propagar o valor em reais. Atualize a cotação e tente novamente.');
    const now=new Date().toISOString(),override={key:conversionValueOverrideKey(campaign.id,isoDate,normalizedPeriod),campaign_id:campaign.id,campaign_name:campaign.nome_mcc,date:isoDate,period:normalizedPeriod,currency:normalizedCurrency,value:Number(amount.toFixed(2)),source_value:previousOverride?.source_value??(sourceValue==null?null:Number(sourceValue)),source_currency:previousOverride?.source_currency||sourceCurrency||null,source_daily_value_brl:previousOverride?.source_daily_value_brl??(priorDailyValue==null?null:Number(priorDailyValue)),exchange_rate_usd_brl:exchangeRate,updated_at:now,source:'billing'};
    const index=base.mcc_conversion_value_overrides.findIndex(item=>item?.key===override.key);if(index>=0)base.mcc_conversion_value_overrides[index]=override;else base.mcc_conversion_value_overrides.push(override);
    if(metrics&&metricDate===isoDate){setMetricValue(metrics,'valor_conversao',override.value);setMetricValue(metrics,'moeda',normalizedCurrency);if(normalizedCurrency==='USD')metrics.exchange_rate_usd_brl=exchangeRate}
    applyConversionValueOverrideToDiary(base,override);base.atualizado_em=now;
    return{base,override,previousValue:previousOverride?.value??(sourceValue==null?priorDailyValue:Number(sourceValue))??null};
  }
  function confirmFractionalConversionValue(baseInput,{confirmationKey,value_brl}={}){
    const base=normalize(baseInput),amount=Number(value_brl);
    if(!Number.isFinite(amount)||amount<=0)throw new Error('Informe o valor real em reais, maior que zero.');
    const item=[...salesAdjustmentMap(base).values()].flatMap(summary=>summary.fractionalValuePendingItems||[]).find(candidate=>candidate.confirmationKey===String(confirmationKey||''));
    if(!item)throw new Error('Este valor fracionário mudou ou já foi confirmado. Atualize a lista e tente novamente.');
    const now=new Date().toISOString(),sale=item.saleId?base.vendas_provisorias.find(candidate=>String(candidate.id)===String(item.saleId)&&candidate.status!=='cancelada'):null;
    if(item.saleId&&!sale)throw new Error('O lançamento vinculado não está mais disponível. Atualize a lista e tente novamente.');
    const confirmation={key:item.confirmationKey,campaign_id:item.campaignId,date:item.date,period:item.period,conversions:item.conversions,partial_value_observed:item.currentValueBrl!=null,partial_value_brl:item.currentValueBrl,value_brl:Number(amount.toFixed(2)),source:'overview',confirmed_at:now};
    const existingIndex=base.mcc_fractional_value_confirmations.findIndex(record=>record?.key===confirmation.key);
    if(existingIndex>=0)base.mcc_fractional_value_confirmations[existingIndex]=confirmation;else base.mcc_fractional_value_confirmations.push(confirmation);
    if(sale){Object.assign(sale,{valor_brl:confirmation.value_brl,valor_real_confirmado:true,valor_real_confirmado_origem:'overview',valor_real_confirmado_em:now,mcc_valor_real_confirmado:true,mcc_valor_real_confirmado_em:now,editado_em:now})}
    base.atualizado_em=now;
    return{base,sale,confirmation,item};
  }
  function reconcileProvisionalSales(base){
    const official=new Map();for(const row of base.diario){const fromExcel=row.fontes?.includes('excel'),fromD1=row.periodos?.includes('d1'),fromD0=row.periodos?.includes('d0');if(!fromExcel&&!fromD1&&!fromD0)continue;const rawCount=row.celulas?.F?.value;if(rawCount==null||rawCount===''||!Number.isFinite(Number(rawCount))||Number(rawCount)<0)continue;const key=`${row.campanha_id}|${row.data}`,current=official.get(key)||{count:0,commission:0,commissionObserved:false,fromD1:false,d1Observed:false,d1Count:0,d1Commission:0,d1CommissionObserved:false,d0Observed:false,d0Count:0,d0Commission:0,d0CommissionObserved:false,source:null},rawCommission=row.celulas?.P?.value,commission=rawCommission==null||rawCommission===''?null:Number(rawCommission),count=Number(rawCount);if(fromExcel||fromD1){current.count+=count;if(commission!=null&&Number.isFinite(commission)){current.commission+=commission;current.commissionObserved=true}}if(fromD1){current.fromD1=true;current.d1Observed=true;current.d1Count+=count;if(commission!=null&&Number.isFinite(commission)){current.d1Commission+=commission;current.d1CommissionObserved=true}}if(fromD0){current.d0Observed=true;current.d0Count+=count;if(commission!=null&&Number.isFinite(commission)){current.d0Commission+=commission;current.d0CommissionObserved=true}}current.source=fromD1?'mcc_d1':current.source||'excel_legacy';official.set(key,current)}
    const groups=new Map();for(const sale of base.vendas_provisorias.filter(x=>x.status!=='cancelada')){const key=`${sale.campanha_id}|${sale.data}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(sale)}
    const reconciledAt=new Date().toISOString(),changed=[];
    for(const [key,sales] of groups){
      sales.sort((a,b)=>String(a.registrada_em||'').localeCompare(String(b.registrada_em||'')));
      const evidence=official.get(key)||{count:0,commission:0,commissionObserved:false,fromD1:false,d1Observed:false,d1Count:0,d1Commission:0,d1CommissionObserved:false,d0Observed:false,d0Count:0,d0Commission:0,d0CommissionObserved:false,source:null};
      const fractionalD1=evidence.d1Observed&&evidence.d1Count>0&&Math.abs(evidence.d1Count-Math.round(evidence.d1Count))>1e-8;
      const fractionalD0=!evidence.d1Observed&&evidence.d0Observed&&evidence.d0Count>0&&Math.abs(evidence.d0Count-Math.round(evidence.d0Count))>1e-8;
      const fractionalPeriod=fractionalD1?'d1':fractionalD0?'d0':null;
      const fractionalCount=fractionalD1?evidence.d1Count:fractionalD0?evidence.d0Count:0;
      const fractionalCommission=fractionalD1?evidence.d1Commission:evidence.d0Commission;
      const fractionalCommissionObserved=fractionalD1?evidence.d1CommissionObserved:evidence.d0CommissionObserved;
      const d0IsCurrentEvidence=!evidence.d1Observed&&evidence.d0Observed;
      const recognizedCount=evidence.d1Observed?Math.ceil(evidence.count-1e-8):d0IsCurrentEvidence?Math.floor(evidence.d0Count+1e-8):Math.floor(evidence.count+1e-8);
      const confirmationSource=evidence.d1Observed?'mcc_d1':d0IsCurrentEvidence?'mcc_d0':evidence.source;
      const confirmed=Math.min(sales.length,recognizedCount),fractionalIndex=Math.floor(fractionalCount+1e-8);
      sales.forEach((sale,index)=>{
        const before=JSON.stringify([sale.status,sale.conciliada_em||null,sale.conciliacao_origem||null,sale.mcc_conversao_fracionaria||null,sale.mcc_valor_real_confirmado||false,sale.mcc_valor_real_confirmado_em||null]),wasConfirmed=sale.status==='conciliada';
        if(index<confirmed){sale.status='conciliada';sale.conciliada_em??=reconciledAt;sale.conciliacao_origem=confirmationSource}
        else if(wasConfirmed){sale.status='provisoria';delete sale.conciliada_em;delete sale.conciliacao_origem}
        if(fractionalPeriod&&index===fractionalIndex){
          const marker={periodo:fractionalPeriod,conversoes:Number(fractionalCount.toFixed(8)),valor_conversao_presente:fractionalCommissionObserved,valor_conversao:fractionalCommissionObserved?Number(fractionalCommission.toFixed(2)):null},sameMarker=sale.mcc_conversao_fracionaria&&sale.mcc_conversao_fracionaria.periodo===marker.periodo&&sale.mcc_conversao_fracionaria.conversoes===marker.conversoes&&sale.mcc_conversao_fracionaria.valor_conversao_presente===marker.valor_conversao_presente&&sale.mcc_conversao_fracionaria.valor_conversao===marker.valor_conversao,wasRealConfirmed=Boolean(sameMarker&&(sale.valor_real_confirmado===true||sale.mcc_valor_real_confirmado===true));
          sale.mcc_conversao_fracionaria=marker;sale.mcc_valor_real_confirmado=wasRealConfirmed;
          if(wasRealConfirmed)sale.mcc_valor_real_confirmado_em??=sale.valor_real_confirmado_em||reconciledAt;else delete sale.mcc_valor_real_confirmado_em;
        }else{delete sale.mcc_conversao_fracionaria;delete sale.mcc_valor_real_confirmado;delete sale.mcc_valor_real_confirmado_em}
        const after=JSON.stringify([sale.status,sale.conciliada_em||null,sale.conciliacao_origem||null,sale.mcc_conversao_fracionaria||null,sale.mcc_valor_real_confirmado||false,sale.mcc_valor_real_confirmado_em||null]);
        if(before!==after)changed.push(clone(sale));
      });
    }
    return changed;
  }
  function inferAffiliatePlatformFromCampaignName(value){const match=String(value||'').match(/(?:^|[^A-Za-z0-9])(CB|MS|GM)(?=[-_])/i);return({CB:'ClickBank',MS:'Midi Scalers',GM:'Guru Media'})[match?.[1]?.toUpperCase()]||null}
  function createMccBillingContext(base){
    const manualCounts=new Map();
    for(const sale of base.vendas_provisorias||[]){if(sale.status==='cancelada')continue;const key=`${sale.campanha_id}|${sale.data}`;manualCounts.set(key,(manualCounts.get(key)||0)+1)}
    return{manualCounts,fractionalAdjustments:salesAdjustmentMap(base)}
  }
  function buildMccBillingSales(base,manifest,conflicts,{overwrite=false,billingContext=null}={}){
    const campaigns=new Map(base.campanhas.map(item=>[String(item.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'),item])),context=billingContext||createMccBillingContext(base),{manualCounts,fractionalAdjustments}=context;
    const updates=new Map(),periods=[['d0','metricas_D_zero','D_zero'],['d1','metricas_D_menos_1','D_menos_1']];
    for(const source of manifest?.campanhas||[]){const campaign=campaigns.get(String(source?.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR'));if(!campaign)continue;
      for(const[period,field,temporalKey]of periods){const metrics=source[field];if(!metrics||metrics.presente===false)continue;const detected=manifest?.separacao_temporal?.[temporalKey]?.datas_detectadas?.[0],date=normalizeManifestDate(metrics.data,detected),rawConversions=metricValue(metrics.conversoes);if(!date||rawConversions==null)continue;const conversions=Number(rawConversions);if(!Number.isFinite(conversions)||conversions<0)continue;
        const blocked=!overwrite&&conflicts.some(item=>item.campanha===campaign.nome_exibicao&&item.data===date&&['F','P'].includes(item.coluna));if(blocked)continue;
        const key=`${campaign.id}|${date}`,manualCount=manualCounts.get(key)||0,residual=Math.max(0,conversions-manualCount),rawValue=metricValue(metrics.valor_conversao)??metricValue(metrics.comissao_recebida),parsedValue=rawValue==null?null:Number(rawValue),validValue=Number.isFinite(parsedValue)&&parsedValue>=0?parsedValue:null,currency=String(metricValue(metrics.moeda)||'').trim().toUpperCase(),fractionalValue=fractionalAdjustments.get(campaign.id)?.fractionalValueRecords?.find(item=>item.date===date&&item.period===period&&item.conversions===Number(conversions.toFixed(8))&&item.confirmed),confirmedRealValue=manualCount===0&&Number.isFinite(Number(fractionalValue?.confirmedValueBrl))?Number(fractionalValue.confirmedValueBrl):null,canAttributeValue=manualCount===0&&residual>0&&(validValue!=null||confirmedRealValue!=null);
        const confirmationStatus=residual>0?(period==='d1'?'confirmed':'provisional'):conversions>0&&manualCount>0?'represented_by_manual':'not_confirmed',saleId=`mcc-conversion:${campaign.id}:${date}`;
        const amountFields=confirmedRealValue!=null&&canAttributeValue?{value_brl:confirmedRealValue,value_usd:null}:{value_brl:canAttributeValue&&currency==='BRL'?validValue:null,value_usd:canAttributeValue&&currency==='USD'?validValue:null};
        const noteBase=manualCount&&residual>0?`A MCC informou ${conversions} conversão(ões); ${manualCount} já coberta(s) por lançamento(s) manual(is). O valor agregado não foi dividido para evitar duplicidade.`:residual>0?`Agregado MCC: ${residual} conversão(ões). Valor informado não significa recebimento confirmado.`:conversions>0&&manualCount>0?'As conversões MCC desta campanha/data já estão cobertas por lançamento(s) manual(is).':`A importação ${period==='d1'?'D−1':'D0'} não confirmou conversões para esta campanha/data.`,note=confirmedRealValue!=null&&canAttributeValue?`${noteBase} Valor real da conversão fracionária confirmado manualmente: R$ ${confirmedRealValue.toFixed(2)}; isso não confirma recebimento.`:noteBase;
        const sale={sale_id:saleId,sale_date:date,platform:inferAffiliatePlatformFromCampaignName(campaign.nome_mcc)||'Google Ads MCC',product:campaign.nome_exibicao||campaign.nome_mcc,commission_type:'Valor de conversão MCC',account:accountForSource(source,campaign)||'',...amountFields,payment_status:'pending',observed_payment_status:'pending',confirmation_status:confirmationStatus,confirmation_source:period==='d1'?'MCC D−1':'MCC D0',confirmed_at:period==='d1'?new Date().toISOString():null,campaign_id:campaign.id,conversion_count:residual,source:'mcc_conversion_aggregate',source_ref:key,source_period:period,notes:note,active:residual>0};
        const previous=updates.get(key);if(!previous||period==='d1'||previous.source_period!=='d1')updates.set(key,sale);
      }
    }
    const temporal=manifest?.separacao_temporal||{},d0Date=normalizeManifestDate(null,temporal.D_zero?.datas_detectadas?.[0]);
    if(d0Date&&(manifest?.campanhas||[]).length){
      const presentD0=new Set((manifest.campanhas||[]).filter(source=>source?.metricas_D_zero&&source.metricas_D_zero.presente!==false).map(source=>String(source?.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR')));
      for(const campaign of base.campanhas){const name=String(campaign.nome_mcc||'').trim(),keyName=name.toLocaleLowerCase('pt-BR');if(!name||!campaignInScope(campaign,manifest)||presentD0.has(keyName))continue;const key=`${campaign.id}|${d0Date}`,previous=updates.get(key);if(previous?.source_period==='d1')continue;updates.set(key,{sale_id:`mcc-conversion:${campaign.id}:${d0Date}`,sale_date:d0Date,platform:inferAffiliatePlatformFromCampaignName(name)||'Google Ads MCC',product:campaign.nome_exibicao||name,commission_type:'Valor de conversão MCC',account:campaign.conta_id||campaign.conta_sufixo||'',value_brl:null,value_usd:null,payment_status:'pending',observed_payment_status:'pending',confirmation_status:'not_confirmed',confirmation_source:'MCC D0',confirmed_at:null,campaign_id:campaign.id,conversion_count:0,source:'mcc_conversion_aggregate',source_ref:key,source_period:'d0',notes:'A captura MCC D0 mais recente não contém métricas para esta campanha/data; agregado anterior desativado.',active:false})}
    }
    return[...updates.values()];
  }
  function mccBillingSalesFromDiary(baseInput,{manifestOnly=false}={}){
    const base=normalize(baseInput),campaigns=new Map(base.campanhas.map(item=>[item.id,item])),campaignsByName=new Map(base.campanhas.map(item=>[String(item.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'),item])),manualCounts=new Map(),updates=new Map(),fractionalAdjustments=salesAdjustmentMap(base);
    let eligibleKeys=null;
    if(manifestOnly){eligibleKeys=new Map();const temporal=base.manifesto_atual?.separacao_temporal||{};for(const source of base.manifesto_atual?.campanhas||[]){const campaign=campaignsByName.get(String(source?.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR'));if(!campaign)continue;for(const[period,field,temporalKey]of[['d0','metricas_D_zero','D_zero'],['d1','metricas_D_menos_1','D_menos_1']]){const metrics=source[field],rawConversions=metricValue(metrics?.conversoes);if(!metrics||metrics.presente===false||rawConversions==null||!Number.isFinite(Number(rawConversions)))continue;const date=normalizeManifestDate(metrics.data,temporal[temporalKey]?.datas_detectadas?.[0]);if(date){const rawValue=metricValue(metrics.valor_conversao)??metricValue(metrics.comissao_recebida),value=rawValue==null?null:Number(rawValue),key=`${campaign.id}|${date}`,previous=eligibleKeys.get(key);if(!previous||period==='d1')eligibleKeys.set(key,{period,conversions:Number(rawConversions),value:Number.isFinite(value)&&value>=0?value:null})}}}}
    for(const sale of base.vendas_provisorias||[]){if(sale.status==='cancelada')continue;const key=`${sale.campanha_id}|${sale.data}`;manualCounts.set(key,(manualCounts.get(key)||0)+1)}
    for(const row of base.diario||[]){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(row.data||'')))continue;const campaign=campaigns.get(row.campanha_id);if(!campaign?.nome_mcc)continue;const key=`${campaign.id}|${row.data}`,manifestExpected=eligibleKeys?.get(key),temporal=base.manifesto_atual?.separacao_temporal||{},rowConversions=Number(row.celulas?.F?.value),d1Date=normalizeManifestDate(null,temporal.D_menos_1?.datas_detectadas?.[0]),d0Date=normalizeManifestDate(null,temporal.D_zero?.datas_detectadas?.[0]),periodicFallback=manifestOnly&&rowConversions>0?(row.data===d1Date?'d1':row.data===d0Date?'d0':null):null,expected=manifestExpected||(periodicFallback?{period:periodicFallback,conversions:rowConversions,value:null}:null);if(manifestOnly&&!expected)continue;let period=expected?.period||(row.periodos?.includes('d1')?'d1':row.periodos?.includes('d0')?'d0':null);if(!period)continue;if(manifestExpected){const diaryValue=row.celulas?.P?.value,validDiaryValue=diaryValue!=null&&diaryValue!==''&&Number.isFinite(Number(diaryValue));if(Number(row.celulas?.F?.value)!==manifestExpected.conversions||(manifestExpected.value!=null&&(!validDiaryValue||Number(diaryValue)!==manifestExpected.value)))continue}const conversions=Number(row.celulas?.F?.value);if(!Number.isFinite(conversions)||conversions<0||(conversions===0&&period!=='d1'))continue;
      const manualCount=manualCounts.get(key)||0,residual=Math.max(0,conversions-manualCount),rawValue=row.celulas?.P?.value,parsedValue=rawValue==null||rawValue===''?null:Number(rawValue),validValue=Number.isFinite(parsedValue)&&parsedValue>=0?parsedValue:null,fractionalValue=fractionalAdjustments.get(campaign.id)?.fractionalValueRecords?.find(item=>item.date===row.data&&item.period===period&&item.conversions===Number(conversions.toFixed(8))&&item.confirmed),confirmedRealValue=manualCount===0&&Number.isFinite(Number(fractionalValue?.confirmedValueBrl))?Number(fractionalValue.confirmedValueBrl):null,canAttributeValue=manualCount===0&&residual>0&&(validValue!=null||confirmedRealValue!=null),confirmationStatus=residual>0?(period==='d1'?'confirmed':'provisional'):conversions>0&&manualCount>0?'represented_by_manual':'not_confirmed',saleId=`mcc-conversion:${campaign.id}:${row.data}`;
      const noteBase=manualCount&&residual>0?`O Diário MCC informa ${conversions} conversão(ões); ${manualCount} já coberta(s) por lançamento(s) manual(is). O valor agregado não foi dividido para evitar duplicidade.`:residual>0?`Agregado recuperado do Diário MCC: ${residual} conversão(ões). Valor informado não significa recebimento confirmado.`:manualCount>0&&conversions>0?'As conversões MCC desta campanha/data já estão cobertas por lançamento(s) manual(is).':period==='d1'?'A importação D−1 não confirmou conversões para esta campanha/data.':'O Diário MCC não confirma conversões para esta campanha/data.',note=confirmedRealValue!=null&&canAttributeValue?`${noteBase} Valor real da conversão fracionária confirmado manualmente: R$ ${confirmedRealValue.toFixed(2)}; isso não confirma recebimento.`:noteBase;
      const sale={sale_id:saleId,sale_date:row.data,platform:inferAffiliatePlatformFromCampaignName(campaign.nome_mcc)||'Google Ads MCC',product:campaign.nome_exibicao||campaign.nome_mcc,commission_type:'Valor de conversão MCC',account:campaign.conta_id||campaign.conta_sufixo||'',value_brl:confirmedRealValue!=null&&canAttributeValue?confirmedRealValue:canAttributeValue?validValue:null,value_usd:null,payment_status:'pending',observed_payment_status:'pending',confirmation_status:confirmationStatus,confirmation_source:period==='d1'?'MCC D−1':'MCC D0',confirmed_at:period==='d1'?new Date().toISOString():null,campaign_id:campaign.id,conversion_count:residual,source:'mcc_conversion_aggregate',source_ref:key,source_period:period,notes:note,active:residual>0};
      const previous=updates.get(key);if(!previous||period==='d1'||previous.source_period!=='d1')updates.set(key,sale)
    }
    return[...updates.values()]
  }
  function mccBillingSalesFromManifest(baseInput){const base=normalize(baseInput);return buildMccBillingSales(base,base.manifesto_atual,[],{overwrite:true})}
  function googleAdsApiBillingSales(baseInput){
    if(!baseInput)return[];
    const base=normalize(baseInput),campaigns=new Map(base.campanhas.map(item=>[String(item.id),item])),billingContext=createMccBillingContext(base),updates=new Map();
    for(const capture of base.google_ads_api_daily_captures||[]){
      const captureTimeZone=capture.businessTimeZone==='America/Sao_Paulo'?'America/Sao_Paulo':capture.timeZone,today=googleAdsDateInTimeZone(captureTimeZone);if(Number(capture.captureSchemaVersion)<3||capture.queryComplete!==true||capture.date<GOOGLE_ADS_API_OPERATIONAL_START_DATE||!today||capture.date>today||capture.date<googleAdsApiCaptureDateRange(today).dateFrom)continue;
      const period=capture.date===today?'d0':'d1',metricField=period==='d0'?'metricas_D_zero':'metricas_D_menos_1',temporalField=period==='d0'?'D_zero':'D_menos_1';
      for(const row of capture.rows||[]){
        const campaign=campaigns.get(String(row.campaignInternalId));
        if(row.mappingStatus!=='mapped'||!campaign||campaign.conta_id!==canonicalAccountId(capture.customerId)||(capture.managerCustomerId&&campaign.mcc_id!==canonicalAccountId(capture.managerCustomerId))||row.conversions==null)continue;
        const source={nome_campanha_exato:campaign.nome_mcc,mcc_id:campaign.mcc_id,[metricField]:{presente:true,data:{valor:capture.date},conta_id:{valor:campaign.conta_id},moeda:{valor:capture.currencyCode},conversoes:{valor:row.conversions},valor_conversao:{valor:row.conversionsValue},exchange_rate_usd_brl:capture.exchangeRateUsdBrl}},manifest={separacao_temporal:{[temporalField]:{datas_detectadas:[capture.date]}},campanhas:[source]};
        applyConversionValueOverrideToSource(base,campaign,source,period,manifest);
        const scopedBase={...base,campanhas:[campaign],manifesto_atual:manifest};
        const sale=buildMccBillingSales(scopedBase,manifest,[],{overwrite:true,billingContext}).find(item=>item.campaign_id===campaign.id&&item.sale_date===capture.date);if(!sale)continue;
        updates.set(sale.sale_id,{...sale,data_source:'google_ads_api',source_captured_at:capture.capturedAtUtc,commission_type:'Valor de conversão Google Ads API',confirmation_source:period==='d0'?'Google Ads API D0':'Google Ads API D−1 (atualizável)',notes:`${sale.notes.replaceAll('MCC','Google Ads API')}${period==='d1'?' Métricas de conversão podem ser revisadas durante a janela recente de atualização; esta linha não confirma pagamento.':''}`});
      }
    }
    return[...updates.values()];
  }
  function manualMccMatchCandidates(baseInput){
    const base=normalize(baseInput),campaigns=new Map(base.campanhas.map(item=>[String(item.id),item])),manifestByName=new Map((base.manifesto_atual?.campanhas||[]).map(item=>[String(item?.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR'),item]));
    const accountKey=value=>{const full=canonicalAccountId(value);if(full)return`id:${full}`;const suffix=String(value??'').trim().match(/^(\d{4})$/)?.[1];return suffix?`suffix:${suffix}`:null};
    const valueInBrl=aggregate=>{
      if(aggregate.value_brl!=null&&aggregate.value_brl!==''&&Number.isFinite(Number(aggregate.value_brl)))return Number(aggregate.value_brl);
      if(aggregate.value_usd==null||aggregate.value_usd===''||!Number.isFinite(Number(aggregate.value_usd)))return null;
      const campaign=campaigns.get(String(aggregate.campaign_id));if(!campaign)return null;
      const source=manifestByName.get(String(campaign.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'));
      const metrics=aggregate.source_period==='d1'?source?.metricas_D_menos_1:source?.metricas_D_zero;
      const override=findConversionValueOverride(base,campaign.id,aggregate.sale_date,aggregate.source_period);
      const rate=Number(override?.currency==='USD'?override.exchange_rate_usd_brl:metrics?.exchange_rate_usd_brl);
      if(!Number.isFinite(rate)||rate<=0)return null;
      return Number((Number(aggregate.value_usd)*rate).toFixed(2));
    };
    const aggregates=mccBillingSalesFromManifest(base).filter(item=>item.source==='mcc_conversion_aggregate'&&item.active!==false&&['d0','d1'].includes(item.source_period)&&Number(item.conversion_count)===1);
    const candidates=[];
    for(const manual of base.vendas_provisorias||[]){
      if(manual.status!=='provisoria'||!manual.billing_sale_id||!Number.isFinite(Number(manual.valor_brl))||Number(manual.valor_brl)<=0)continue;
      const manualCampaign=campaigns.get(String(manual.campanha_id)),manualAccount=accountKey(manual.conta)||accountKey(manualCampaign?.conta_id)||accountKey(manualCampaign?.conta_sufixo);
      if(!manualAccount)continue;
      for(const aggregate of aggregates){
        if(String(aggregate.campaign_id)===String(manual.campanha_id)||aggregate.sale_date!==manual.data)continue;
        const targetCampaign=campaigns.get(String(aggregate.campaign_id)),targetAccount=accountKey(targetCampaign?.conta_id)||accountKey(targetCampaign?.conta_sufixo)||accountKey(aggregate.account);
        if(!targetCampaign||!targetAccount||targetAccount!==manualAccount)continue;
        const mccValueBrl=valueInBrl(aggregate);if(!Number.isFinite(mccValueBrl)||mccValueBrl<=0)continue;
        const differenceBrl=Number(Math.abs(Number(manual.valor_brl)-mccValueBrl).toFixed(2)),toleranceBrl=Number(Math.max(0.5,Math.max(Number(manual.valor_brl),mccValueBrl)*0.005).toFixed(2));
        if(differenceBrl>toleranceBrl)continue;
        candidates.push({manual_sale_id:String(manual.id),manual_billing_sale_id:String(manual.billing_sale_id),manual_campaign_id:String(manual.campanha_id),manual_product:String(manual.produto||''),manual_value_brl:Number(manual.valor_brl),mcc_campaign_id:String(aggregate.campaign_id),mcc_sale_id:String(aggregate.sale_id),mcc_product:String(targetCampaign.nome_exibicao||targetCampaign.nome_mcc||''),mcc_campaign_name:String(targetCampaign.nome_mcc||targetCampaign.nome_exibicao||''),date:String(manual.data),account:String(aggregate.account||targetCampaign.conta_id||targetCampaign.conta_sufixo||''),source_period:aggregate.source_period,mcc_value_brl:mccValueBrl,difference_brl:differenceBrl,tolerance_brl:toleranceBrl});
      }
    }
    return candidates.sort((a,b)=>a.manual_billing_sale_id.localeCompare(b.manual_billing_sale_id)||a.mcc_campaign_name.localeCompare(b.mcc_campaign_name,'pt-BR'));
  }
  function salesAdjustmentMapCore(base,forcedProvisionalSales=new Set()){
    const official=new Map(),allSales=new Map(),pendingGroups=new Map(),campaigns=new Map(base.campanhas.map(campaign=>[campaign.id,campaign]));
    for(const row of base.diario){const rawConversions=row.celulas?.F?.value;if(rawConversions==null||rawConversions===''||!Number.isFinite(Number(rawConversions))||Number(rawConversions)<0)continue;const key=`${row.campanha_id}|${row.data}`,entry=official.get(key)||{conversions:0,d1Conversions:0,d0Conversions:0,d1Observed:false,d0Observed:false,commission:0,commissionObserved:false,d1Commission:0,d1CommissionObserved:false,d0Commission:0,d0CommissionObserved:false},count=Number(rawConversions),rawCommission=row.celulas?.P?.value,commission=rawCommission==null||rawCommission===''?null:Number(rawCommission),fromD1=row.periodos?.includes('d1'),fromD0=row.periodos?.includes('d0');entry.conversions+=count;if(row.fontes?.includes('excel')||fromD1){if(commission!=null&&Number.isFinite(commission)){entry.commission+=commission;entry.commissionObserved=true}}if(fromD1){entry.d1Observed=true;entry.d1Conversions+=count;if(commission!=null&&Number.isFinite(commission)){entry.d1Commission+=commission;entry.d1CommissionObserved=true}}if(fromD0){entry.d0Observed=true;entry.d0Conversions+=count;if(commission!=null&&Number.isFinite(commission)){entry.d0Commission+=commission;entry.d0CommissionObserved=true}}official.set(key,entry)}
    for(const sale of base.vendas_provisorias){if(sale.status==='cancelada')continue;const key=`${sale.campanha_id}|${sale.data}`,active=allSales.get(key)||[];active.push(sale);allSales.set(key,active);if(sale.status==='provisoria'||!sale.status||forcedProvisionalSales.has(sale)){const group=pendingGroups.get(key)||{campaignId:sale.campanha_id,date:sale.data,sales:[]};group.sales.push(sale);pendingGroups.set(key,group)}}
    const map=new Map(),keys=new Set([...official.keys(),...allSales.keys()]);
    for(const key of keys){
      const seen=official.get(key)||{conversions:0,d1Conversions:0,d0Conversions:0,d1Observed:false,d0Observed:false,commission:0,commissionObserved:false,d1Commission:0,d1CommissionObserved:false,d0Commission:0,d0CommissionObserved:false},activeSales=(allSales.get(key)||[]).sort((a,b)=>String(a.registrada_em||'').localeCompare(String(b.registrada_em||''))),provisionalSales=(pendingGroups.get(key)?.sales||[]).sort((a,b)=>String(a.registrada_em||'').localeCompare(String(b.registrada_em||''))),fractionalD1=seen.d1Observed&&seen.d1Conversions>0&&Math.abs(seen.d1Conversions-Math.round(seen.d1Conversions))>1e-8,fractionalD0=!seen.d1Observed&&seen.d0Observed&&seen.d0Conversions>0&&Math.abs(seen.d0Conversions-Math.round(seen.d0Conversions))>1e-8,fractionalPeriod=fractionalD1?'d1':fractionalD0?'d0':null,fractionalCount=fractionalD1?seen.d1Conversions:seen.d0Conversions,fractionalCommission=fractionalD1?seen.d1Commission:seen.d0Commission,fractionalCommissionObserved=fractionalD1?seen.d1CommissionObserved:seen.d0CommissionObserved,hasFractional=Boolean(fractionalPeriod),campaignId=String(key).split('|')[0],date=String(key).slice(String(key).indexOf('|')+1),recognized=seen.conversions>0?Math.floor(seen.conversions)+(hasFractional?1:0):0,matchedSales=activeSales.slice(0,recognized),fractionalSale=hasFractional?activeSales[Math.floor(fractionalCount+1e-8)]||null:null,partialMccValue=fractionalCommissionObserved?Number(fractionalCommission.toFixed(2)):null,confirmationKey=hasFractional?fractionalEvidenceKey(campaignId,date,fractionalPeriod,fractionalCount,fractionalCommissionObserved,fractionalCommission):null,storedConfirmation=confirmationKey?fractionalValueConfirmation(base,confirmationKey):null,fractionalMarker=fractionalSale?.mcc_conversao_fracionaria,matchingSaleConfirmation=Boolean(fractionalSale?.mcc_valor_real_confirmado&&fractionalMarker?.periodo===fractionalPeriod&&fractionalMarker?.conversoes===Number(fractionalCount.toFixed(8))&&fractionalMarker?.valor_conversao_presente===fractionalCommissionObserved&&fractionalMarker?.valor_conversao===(fractionalCommissionObserved?Number(fractionalCommission.toFixed(2)):null)),fractionalConfirmed=Boolean(storedConfirmation||matchingSaleConfirmation),confirmedValueBrl=storedConfirmation?Number(storedConfirmation.value_brl):matchingSaleConfirmation?Number(fractionalSale.valor_brl):null,fractionalValuePendingCount=hasFractional&&!fractionalConfirmed?1:0;
      const pendingSales=provisionalSales.filter(sale=>activeSales.indexOf(sale)>=recognized||recognized===0),pendingConversions=pendingSales.length,pendingConfirmationCount=provisionalSales.length,pendingAmount=pendingSales.reduce((sum,sale)=>sum+(Number(sale.valor_brl)||0),0),canReplaceFractionalValue=hasFractional&&fractionalConfirmed&&Boolean(fractionalSale)&&activeSales.length===recognized&&matchedSales.length===recognized,replaceD0Commission=!seen.d1Observed&&seen.d0Observed&&!hasFractional&&seen.d0Conversions>0&&Math.abs(seen.d0Conversions-activeSales.length)<1e-8&&activeSales.length>0&&provisionalSales.length===activeSales.length,manualD0CommissionAdjustment=replaceD0Commission?activeSales.reduce((sum,sale)=>sum+(Number(sale.valor_brl)||0),0)-(seen.d0CommissionObserved?seen.d0Commission:0):0,baseCommissionAdjustment=canReplaceFractionalValue?matchedSales.reduce((sum,sale)=>sum+(Number(sale.valor_brl)||0),0)-(partialMccValue??0):replaceD0Commission?manualD0CommissionAdjustment:pendingConversions?Math.max(0,pendingAmount-seen.commission):0,commissionAdjustment=baseCommissionAdjustment+(hasFractional&&fractionalConfirmed&&!fractionalSale?confirmedValueBrl-(partialMccValue??0):0),group=pendingGroups.get(key),summary=map.get(campaignId)||{pendingConversions:0,pendingConfirmationCount:0,commissionAdjustment:0,sales:0,manualSales:0,countries:new Set(),fractionalValuePendingCount:0,fractionalValuePendingItems:[],fractionalValueRecords:[],byDate:{}};
      if(hasFractional){const campaign=campaigns.get(campaignId),productName=String(fractionalSale?.produto||campaign?.nome_exibicao||campaign?.nome_mcc||campaignId).trim(),fractionalRecord={confirmationKey,campaignId,date,period:fractionalPeriod,conversions:Number(fractionalCount.toFixed(8)),currentValueBrl:partialMccValue,confirmed:fractionalConfirmed,confirmedValueBrl};summary.fractionalValueRecords.push(fractionalRecord);if(fractionalValuePendingCount)summary.fractionalValuePendingItems.push({...fractionalRecord,productName,saleId:fractionalSale?.id||null})}
      summary.pendingConversions+=pendingConversions;summary.pendingConfirmationCount+=pendingConfirmationCount;summary.commissionAdjustment+=commissionAdjustment;summary.sales+=pendingConversions;summary.manualSales+=provisionalSales.length;summary.fractionalValuePendingCount+=fractionalValuePendingCount;for(const sale of provisionalSales)if(sale.pais_codigo)summary.countries.add(sale.pais_codigo);if(pendingConversions||pendingConfirmationCount||fractionalValuePendingCount||commissionAdjustment){summary.byDate[date]={pendingConversions,pendingConfirmationCount,commissionAdjustment,sales:pendingConversions,manualSales:provisionalSales.length,countries:[...new Set(provisionalSales.map(x=>x.pais_codigo).filter(Boolean))],productSales:pendingSales.map(sale=>{const amount=Number(sale.valor_brl);return{product:String(sale.produto||'').trim()||null,amount:Number.isFinite(amount)?amount:null}})}}if(provisionalSales.length||fractionalValuePendingCount||pendingConversions||commissionAdjustment||hasFractional)map.set(campaignId,summary)
    }
    return map;
  }
  function salesAdjustmentMap(baseInput){
    const base=normalize(baseInput),d1Observed=new Set(base.diario.filter(row=>row.periodos?.includes('d1')&&row.celulas?.F?.value!=null&&row.celulas.F.value!==''&&Number.isFinite(Number(row.celulas.F.value))).map(row=>`${row.campanha_id}|${row.data}`)),d0Confirmed=base.vendas_provisorias.filter(sale=>sale.status==='conciliada'&&sale.conciliacao_origem==='mcc_d0'&&!d1Observed.has(`${sale.campanha_id}|${sale.data}`));
    const map=salesAdjustmentMapCore(base,new Set(d0Confirmed));
    for(const sale of d0Confirmed){const summary=map.get(sale.campanha_id);if(!summary)continue;summary.pendingConfirmationCount=Math.max(0,summary.pendingConfirmationCount-1);const day=summary.byDate?.[sale.data];if(day)day.pendingConfirmationCount=Math.max(0,day.pendingConfirmationCount-1)}
    return map;
  }
  window.CampaignDatabase={parseSearchImpressionShare,searchImpressionShareCells,SCHEMA,GOOGLE_ADS_API_OPERATIONAL_START_DATE,GOOGLE_ADS_API_CAPTURE_WINDOW_DAYS,GOOGLE_ADS_CAPTURE_HISTORY_MAX_ENTRIES,GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_DEFAULT,GOOGLE_ADS_CAPTURE_SNAPSHOT_RETENTION_MAX,normalizeGoogleAdsCaptureSnapshotRetention,pruneGoogleAdsCaptureSnapshots,mergeGoogleAdsCaptureSnapshots,googleAdsApiCaptureDateRange,googleAdsCaptureSnapshotTotals,googleAdsCaptureHistoryClickDetails,create,normalize,mergeGoogleAdsCaptureHistory,pruneGoogleAdsCaptureHistory,appendGoogleAdsAutomaticPauseHistory,appendGoogleAdsObservedAutomaticPauseHistory,appendClickBankSaleDetectedHistory,buildGoogleAdsCaptureFailureHistoryEntry,setManifestDuplicateSuppression,operationalProjection,googleAdsApiOperationalProjection,googleAdsApiProjectionSummary,importWorkbook,importManifest,saveGoogleAdsDailyCaptures,registerGoogleAdsHubCreatedCampaigns,googleAdsHubCampaignRecoveryStatus,manifestOperationalStates,campaignNumberReuseIssues,campaignNumberHistoryWarnings,campaignDateChangeCandidates,campaignCpaChangeCandidates,setCampaignStartDate,setCampaignMinimumRoi,setCampaignCommissionTestPercent,setRemainingAlertThreshold,reconcileCampaignSnapshots,dailyRows,campaignTotalsMap,consecutiveZeroImpressionDays,investmentTotalsMap,operationalMap,accountDomain,addProvisionalSale,updateProvisionalSale,cancelProvisionalSale,correctMccConversionValue,confirmFractionalConversionValue,mccBillingSalesFromDiary,mccBillingSalesFromManifest,manualMccMatchCandidates,inferAffiliatePlatformFromCampaignName,salesAdjustmentMap};
  window.CampaignDatabase.reconcileGoogleAdsCaptureHistoryComparisons=reconcileGoogleAdsCaptureHistoryComparisons;
  window.CampaignDatabase.googleAdsApiBillingSales=googleAdsApiBillingSales;
  window.CampaignDatabase.syncGoogleAdsSnapshotCampaigns=syncGoogleAdsSnapshotCampaigns;
  window.CampaignDatabase.confirmAutomaticPause=confirmAutomaticPause;
  window.CampaignDatabase.recordGoogleAdsManualCampaignStatus=recordGoogleAdsManualCampaignStatus;
  window.CampaignDatabase.latestConfirmedAutomaticPause=latestConfirmedAutomaticPause;
  window.CampaignDatabase.campaignDiaryStatusWindow=campaignDiaryStatusWindow;
  window.CampaignDatabase.campaignDiaryDateAllowed=campaignDiaryDateAllowed;
})();
