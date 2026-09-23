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
  function idFor(value){
    let hash=2166136261;
    for(const char of String(value).toLowerCase()){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}
    return`cmp_${(hash>>>0).toString(36)}`;
  }
  function uniqueEvents(events){const byId=new Map();for(const event of events||[]){const id=String(event?.event_id||'').trim();if(id&&!byId.has(id))byId.set(id,clone(event))}return[...byId.values()]}
  function create(){return{schema:SCHEMA,atualizado_em:new Date().toISOString(),manifesto_atual:null,campanhas:[],diario:[],campos_operacionais:[],importacoes:[],snapshots_campanhas:[],vendas_provisorias:[],event_log:[]}}
  function normalize(base){const value=base?.schema===SCHEMA?clone(base):create();value.campanhas??=[];value.diario??=[];value.campos_operacionais??=[];value.importacoes??=[];value.snapshots_campanhas??=[];value.vendas_provisorias??=[];value.event_log=uniqueEvents(value.event_log);return value}
  function mergeEventLogs(baseInput,events){const base=normalize(baseInput);base.event_log=uniqueEvents([...base.event_log,...(events||[])]);return base}
  function campaignIndexes(base){return{byId:new Map(base.campanhas.map(x=>[x.id,x])),byExact:new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x])),byDisplay:new Map(base.campanhas.map(x=>[x.nome_exibicao.toLowerCase(),x]))}}
  function campaignStartDate(exactName,referenceDate){const match=String(exactName||'').match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\s*(?:[–—-]\s*)?/);if(!match)return null;const reference=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(referenceDate||'')),year=match[3]?(match[3].length===2?`20${match[3]}`:match[3]):reference?.[1];if(!year)return null;const iso=`${year}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;return /^\d{4}-\d{2}-\d{2}$/.test(iso)?iso:null}
  function previousExactForDisplay(base,display,exactName,beforeDate){let found=null;for(const snapshot of base.snapshots_campanhas||[]){if(beforeDate&&snapshot.data>=beforeDate)continue;for(const name of snapshot.campanhas||[])if(String(name).toLowerCase()!==String(exactName).toLowerCase()&&displayName(String(name)).toLowerCase()===display.toLowerCase())found={name:String(name),date:snapshot.data}}return found?.name||null}
  function splitLegacyExactCollision(base,existing,exactName,display,status,referenceDate){const targetId=idFor(exactName),start=campaignStartDate(exactName,referenceDate),previous=previousExactForDisplay(base,display,exactName,start);if(existing.id===targetId||!start||!previous)return existing;let target=base.campanhas.find(x=>x.id===targetId);if(!target){target={...existing,id:targetId,nome_mcc:exactName,nome_exibicao:display,status};base.campanhas.push(target)}for(const row of base.diario)if(row.campanha_id===existing.id&&row.data>=start)row.campanha_id=target.id;for(const sale of base.vendas_provisorias)if(sale.campanha_id===existing.id&&sale.data>=start)sale.campanha_id=target.id;for(const record of base.campos_operacionais)if(record.campanha_id===existing.id)record.campanha_id=target.id;existing.nome_mcc=previous;existing.nome_exibicao=display;existing.status='historico';delete existing.movimento_status;target.nome_mcc=exactName;target.nome_exibicao=display;target.status=status;target.identidade_separada_em=new Date().toISOString();return target}
  function ensureCampaign(base,{exactName=null,sheetName,status='historico',referenceDate=null}){const indexes=campaignIndexes(base),display=sheetName||displayName(exactName);if(exactName){const exact=indexes.byExact.get(exactName.toLowerCase());if(exact)return splitLegacyExactCollision(base,exact,exactName,display,status,referenceDate);const unclaimed=base.campanhas.find(x=>!x.nome_mcc&&x.nome_exibicao.toLowerCase()===display.toLowerCase());if(unclaimed){unclaimed.nome_mcc=exactName;unclaimed.nome_exibicao=display;unclaimed.status=status;return unclaimed}}else{const displayed=indexes.byDisplay.get(display.toLowerCase());if(displayed)return displayed}const campaign={id:idFor(exactName||display),nome_mcc:exactName,nome_exibicao:display,status};base.campanhas.push(campaign);return campaign}
  function mergeCells(existing,incoming,overwrite,conflicts,context){const result=clone(existing||{});for(const [column,cell] of Object.entries(incoming||{})){if(!cell||isBlank(cell.value))continue;const previous=result[column];if(!previous||isBlank(previous.value)){result[column]=clone(cell);continue}if(comparable(previous.value)===comparable(cell.value))continue;if(overwrite)result[column]=clone(cell);else conflicts.push({...context,coluna:column,anterior:previous.value,novo:cell.value})}return result}
  function importWorkbook(baseInput,workbook,{overwrite=false}={}){const base=normalize(baseInput),conflicts=[];const dailyIndex=new Map(base.diario.map(x=>[`${x.campanha_id}|${x.data}`,x]));const totals=workbook?.sheets?.find(s=>s.name.toLowerCase()==='totais');for(const sheet of workbook?.sheets||[]){if(sheet===totals)continue;const dailyRows=sheet.rows.filter(row=>typeof row.cells.A?.value==='number'&&row.cells.A.value>=30000&&row.cells.A.value<=70000);if(!dailyRows.length)continue;const campaign=ensureCampaign(base,{sheetName:sheet.name,status:sheet.visible?'ativa':'historico'});for(const row of dailyRows){const date=excelDateToIso(row.cells.A.value),key=`${campaign.id}|${date}`,existing=dailyIndex.get(key),cells=clone(row.cells);if(existing)existing.celulas=mergeCells(existing.celulas,cells,overwrite,conflicts,{campanha:campaign.nome_exibicao,data:date});else{const record={campanha_id:campaign.id,data:date,celulas:cells,fontes:['excel']};base.diario.push(record);dailyIndex.set(key,record)}}}
    if(totals){for(const row of totals.rows){const exact=String(row.cells.C?.value??'').trim();if(!exact)continue;const campaign=ensureCampaign(base,{exactName:exact,sheetName:displayName(exact),status:'ativa'}),incoming={roi_atual:row.cells.L??null,investimento_atual:row.cells.M??null,limite_teste:row.cells.O??null,valor_restante:row.cells.P??null},existing=base.campos_operacionais.find(x=>x.campanha_id===campaign.id);if(existing)Object.assign(existing,incoming);else base.campos_operacionais.push({campanha_id:campaign.id,...incoming})}}
    reconcileProvisionalSales(base);base.importacoes.push({tipo:'excel',arquivo:workbook?.fileName||null,executada_em:new Date().toISOString(),registros:base.diario.length,conflitos:conflicts.length});base.atualizado_em=new Date().toISOString();return{base,conflicts}}
  function manifestDate(manifest){const temporal=manifest?.separacao_temporal||{};return temporal.D_zero?.datas_detectadas?.[0]||temporal.D_menos_1?.datas_detectadas?.[0]||new Date().toISOString().slice(0,10)}
  function manifestNames(manifest){return[...new Set((manifest?.campanhas||[]).map(x=>String(x.nome_campanha_exato||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}))}
  function campaignNumberReuseIssues(baseInput,manifest){
    const base=normalize(baseInput),incoming=manifestNames(manifest),incomingKeys=new Set(incoming.map(name=>name.toLocaleLowerCase('pt-BR'))),known=new Set(incoming);
    for(const campaign of base.campanhas||[])if(campaign.nome_mcc)known.add(String(campaign.nome_mcc).trim());
    for(const snapshot of base.snapshots_campanhas||[])for(const name of snapshot.campanhas||[])if(String(name||'').trim())known.add(String(name).trim());
    for(const campaign of base.manifesto_atual?.campanhas||[])if(campaign.nome_campanha_exato)known.add(String(campaign.nome_campanha_exato).trim());
    const groups=new Map();
    for(const name of known){const group=displayName(name),nameKey=name.toLocaleLowerCase('pt-BR');if(group.toLocaleLowerCase('pt-BR')===nameKey)continue;const key=group.toLocaleLowerCase('pt-BR'),entry=groups.get(key)||{group,names:new Map(),incomingNames:new Map()};entry.names.set(nameKey,name);if(incomingKeys.has(nameKey))entry.incomingNames.set(nameKey,name);groups.set(key,entry)}
    return[...groups.values()].filter(entry=>entry.incomingNames.size&&entry.names.size>1).map(entry=>({group:entry.group,incomingNames:[...entry.incomingNames.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'})),knownNames:[...entry.names.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}))})).sort((a,b)=>a.group.localeCompare(b.group,'pt-BR',{numeric:true,sensitivity:'base'}));
  }
  function reconcileCampaignSnapshots(baseInput,snapshotsInput){
    const base=normalize(baseInput),previousStatus=new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x.status])),capturedAt=new Date().toISOString();
    for(const source of snapshotsInput||[]){const date=String(source?.data||'').trim(),names=[...new Set((source?.campanhas||[]).map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));if(!date||!names.length)continue;const snapshot={data:date,capturada_em:source.capturada_em||capturedAt,campanhas:names},sameIndex=base.snapshots_campanhas.findIndex(x=>x.data===date);if(sameIndex>=0)base.snapshots_campanhas[sameIndex]=snapshot;else base.snapshots_campanhas.push(snapshot)}
    base.snapshots_campanhas.sort((a,b)=>a.data.localeCompare(b.data)||a.capturada_em.localeCompare(b.capturada_em));
    const current=base.snapshots_campanhas.at(-1)||null,previous=base.snapshots_campanhas.at(-2)||null;if(!current)return{base,movimentos:{data:null,anterior:null,pausadas:[],novas:[],reativadas:[]}};
    const currentKeys=new Set(current.campanhas.map(x=>x.toLowerCase())),previousKeys=new Set((previous?.campanhas||[]).map(x=>x.toLowerCase()));
    for(const campaign of base.campanhas){const exact=String(campaign.nome_mcc||'').trim(),key=exact.toLowerCase();if(!exact)continue;if(currentKeys.has(key)){const wasPaused=previousStatus.get(key)==='pausada'||campaign.pausada_em;campaign.status='ativa';campaign.ultima_aparicao=current.data;campaign.status_origem='presente_na_coleta';campaign.movimento_status=wasPaused&&!previousKeys.has(key)?'reativada':previous&&previousKeys.has(key)?'manteve':'nova';if(wasPaused&&!previousKeys.has(key))campaign.reativada_em=current.data;delete campaign.pausada_em}else if(previousKeys.has(key)){campaign.status='pausada';campaign.pausada_em=current.data;campaign.ultima_aparicao=previous.data;campaign.status_origem='ausencia_na_coleta';campaign.movimento_status='pausada'}}
    const movimentos={data:current.data,anterior:previous?.data||null,pausadas:base.campanhas.filter(x=>x.status==='pausada'&&x.pausada_em===current.data).map(x=>x.nome_mcc),novas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='nova').map(x=>x.nome_mcc),reativadas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='reativada'&&x.reativada_em===current.data).map(x=>x.nome_mcc)};base.atualizado_em=capturedAt;return{base,movimentos}
  }
  function updateCampaignSnapshot(base,manifest,previousStatus){
    const capturedAt=new Date().toISOString(),date=manifestDate(manifest),names=manifestNames(manifest),currentKeys=new Set(names.map(x=>x.toLowerCase()));
    if(!base.snapshots_campanhas.length&&base.manifesto_atual){const priorDate=manifestDate(base.manifesto_atual),priorNames=manifestNames(base.manifesto_atual);if(priorNames.length)base.snapshots_campanhas.push({data:priorDate,capturada_em:base.atualizado_em||capturedAt,campanhas:priorNames})}
    const sameIndex=base.snapshots_campanhas.findIndex(x=>x.data===date),snapshot={data:date,capturada_em:capturedAt,campanhas:names};
    if(sameIndex>=0)base.snapshots_campanhas[sameIndex]=snapshot;else base.snapshots_campanhas.push(snapshot);
    base.snapshots_campanhas.sort((a,b)=>a.data.localeCompare(b.data)||a.capturada_em.localeCompare(b.capturada_em));
    const previous=[...base.snapshots_campanhas].filter(x=>x.data<date).at(-1)||null,previousKeys=new Set((previous?.campanhas||[]).map(x=>x.toLowerCase()));
    for(const campaign of base.campanhas){const exact=String(campaign.nome_mcc||'').trim(),key=exact.toLowerCase();if(!exact)continue;if(currentKeys.has(key)){const wasPaused=previousStatus.get(key)==='pausada'||campaign.pausada_em;campaign.status='ativa';campaign.ultima_aparicao=date;campaign.status_origem='presente_na_coleta';campaign.movimento_status=wasPaused&&!previousKeys.has(key)?'reativada':previous&&previousKeys.has(key)?'manteve':'nova';if(wasPaused&&!previousKeys.has(key))campaign.reativada_em=date;delete campaign.pausada_em}else if(previousKeys.has(key)){campaign.status='pausada';campaign.pausada_em=date;campaign.ultima_aparicao=previous.data;campaign.status_origem='ausencia_na_coleta';campaign.movimento_status='pausada'}}
    return{data:date,anterior:previous?.data||null,pausadas:base.campanhas.filter(x=>x.status==='pausada'&&x.pausada_em===date).map(x=>x.nome_mcc),novas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='nova').map(x=>x.nome_mcc),reativadas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='reativada'&&x.reativada_em===date).map(x=>x.nome_mcc)}
  }
  function metricValue(value){if(value==null||value==='')return null;if(typeof value==='object'&&Object.hasOwn(value,'valor')){if(['ausente','invalido'].includes(value.estado))return null;return value.valor===''?null:value.valor}return value}
  function metricRecord(metrics,key){return Object.hasOwn(metrics||{},key)?clone(metrics[key]):null}
  function explicitCampaignStatus(source){for(const metrics of[source?.metricas_D_zero,source?.metricas_D_menos_1]){const value=metricValue(metrics?.estado_campanha)??metrics?.raw?.campaign_state;if(value!=null&&String(value).trim())return String(value).trim()}return null}
  function qualificationStatus(source){for(const metrics of[source?.metricas_D_zero,source?.metricas_D_menos_1]){const value=metricValue(metrics?.status_qualificacao)??metrics?.raw?.status;if(value!=null&&String(value).trim())return String(value).trim()}return null}
  function observationDate(source){return metricValue(source?.metricas_D_zero?.data)||metricValue(source?.metricas_D_menos_1?.data)||null}
  function campaignTitleParts(name){let text=String(name||'').trim().replace(/^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s*(?:[–—-]\s*)?/,'').trim();text=text.split(/\s+\(/,1)[0].trim();text=text.replace(/\s+[–—-]\s+(?=(?:\d{1,3}%|(?:US\$|U\$|R\$)|CPA\b)).*$/i,'').trim();return text}
  function numberedTitle(name){const title=campaignTitleParts(name),match=title.match(/^(.*?)\s+(\d{1,3})$/);return match&&match[1].trim()?{title,base:match[1].trim(),number:Number(match[2]),rawNumber:match[2]}:null}
  function normalizeProductKey(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
  function accountForSource(source,campaign){const account=metricValue(source?.metricas_D_zero?.conta)??metricValue(source?.metricas_D_menos_1?.conta);return accountSuffix(account)||campaign?.conta_sufixo||null}
  function productIdentity(source,campaign,allNames){
    const campaignName=String(source?.nome_campanha_exato||campaign?.nome_mcc||''),numbered=numberedTitle(campaignName);let productName=campaignTitleParts(campaignName),iterationNumber=null,confidence='campaign_title';
    if(numbered){const rootKey=normalizeProductKey(numbered.base),account=accountForSource(source,campaign),knownFamily=/^(?:wego6|medicglp|magicglp|slimqa|akemi|nebueaser)(?:\s|$)/i.test(numbered.base),zeroPadded=numbered.rawNumber.length>1&&numbered.rawNumber.startsWith('0'),sibling=(allNames||[]).some(item=>{if(String(item.name||'').toLocaleLowerCase('pt-BR')===campaignName.toLocaleLowerCase('pt-BR'))return false;const other=numberedTitle(item.name);return Boolean(other&&normalizeProductKey(other.base)===rootKey&&other.number!==numbered.number&&(!account||!item.account||account===item.account))});if(knownFamily||zeroPadded||sibling){productName=numbered.base;iterationNumber=numbered.number;confidence=knownFamily?'known_product_family':zeroPadded?'zero_padded_iteration':'numbered_sibling'}else return{productName:null,productId:null,testId:null,iterationNumber:null,confidence:'ambiguous_numbered_title'}
    }
    productName=productName.replace(/^MedicGLP$/i,'MagicGLP').trim();const productKey=normalizeProductKey(productName),account=accountForSource(source,campaign);if(!productKey)return{productName:null,productId:null,testId:null,iterationNumber,confidence:'missing_product'};const productId=`product:${productKey}`,testId=account?`test:${productKey}|account:${account}`:null;return{productName,productId,testId,iterationNumber,confidence:account?'identified_from_title_and_account':'missing_account'}
  }
  function explicitGeo(source){for(const value of[source?.geo,source?.geo_codes,source?.metricas_D_zero?.geo,source?.metricas_D_menos_1?.geo]){const resolved=metricValue(value);if(resolved!=null&&String(resolved).trim())return clone(resolved)}return null}
  function derivedMetricSnapshot(metrics){const value=key=>metricValue(metrics?.[key]),cost=Number(value('custo_total')),conversions=Number(value('conversoes')),revenue=Number(value('valor_conversao')),validCost=value('custo_total')!=null&&Number.isFinite(cost),validConversions=value('conversoes')!=null&&Number.isFinite(conversions),validRevenue=value('valor_conversao')!=null&&Number.isFinite(revenue);return{cpa_real:validCost&&validConversions&&conversions>0?cost/conversions:null,roi:validCost&&validRevenue&&cost>0?(revenue-cost)/cost*100:null}}
  function snapshotPeriod(metrics){if(!metrics||metrics.presente===false)return null;const fields=['data','moeda','impressoes','cliques_google','custo_total','conversoes','valor_conversao','cpa_desejado','orcamento_diario','estrategia_lance','porcentagem_impressao_primeira_posicao','porcentagem_impressao_parte_superior'];const snapshot={};for(const key of fields)snapshot[key]=metricRecord(metrics,key);snapshot.status_campanha_observado=metricRecord(metrics,'estado_campanha')||metricRecord(metrics,'raw')?.campaign_state||null;snapshot.status_qualificacao=metricRecord(metrics,'status_qualificacao')||metricRecord(metrics,'status_campanha')||metricRecord(metrics,'raw')?.status||null;snapshot.geo=metricRecord(metrics,'geo');Object.assign(snapshot,derivedMetricSnapshot(metrics));return snapshot}
  function campaignSnapshot(base,source,campaign,identity){const operation=base.campos_operacionais.find(item=>item.campanha_id===campaign?.id);return{status_hub:campaign?.status||null,status_campanha_observado:explicitCampaignStatus(source),status_qualificacao:qualificationStatus(source),geo:explicitGeo(source),periods:{D_menos_1:snapshotPeriod(source?.metricas_D_menos_1),D_zero:snapshotPeriod(source?.metricas_D_zero)},campos_operacionais:operation?{roi_atual:clone(operation.roi_atual??null),investimento_atual:clone(operation.investimento_atual??null),limite_teste:clone(operation.limite_teste??null),valor_restante:clone(operation.valor_restante??null)}:null,identity_confidence:identity.confidence}}
  function eventId(type,entity,fingerprint='once'){return`evt:${type}:${encodeURIComponent(String(entity||'unknown'))}:${encodeURIComponent(String(fingerprint))}`}
  function buildObservabilityEvents({base,beforeCampaigns,beforeDaily,beforeManifest,beforeSnapshotNames,manifest,source}){
    const timestamp=new Date().toISOString(),existingIds=new Set((base.event_log||[]).map(event=>event.event_id)),events=[],knownNames=new Set(manifestNames(beforeManifest).map(name=>name.toLocaleLowerCase('pt-BR')));for(const name of beforeSnapshotNames||[])if(name)knownNames.add(String(name).toLocaleLowerCase('pt-BR'));
    const oldNames=beforeCampaigns.filter(item=>item.nome_mcc).map(item=>({name:item.nome_mcc,account:item.conta_sufixo||null})),incomingNames=(manifest?.campanhas||[]).map(item=>({name:item.nome_campanha_exato,account:accountForSource(item,null)})),identityContext=[...oldNames,...incomingNames],beforeByName=new Map(beforeCampaigns.filter(item=>item.nome_mcc).map(item=>[String(item.nome_mcc).toLocaleLowerCase('pt-BR'),item])),priorDailyByKey=new Map(beforeDaily.map(item=>[`${item.campanha_id}|${item.data}`,item]));
    const append=(type,entity,fingerprint,payload)=>{const id=eventId(type,entity,fingerprint);if(existingIds.has(id))return;existingIds.add(id);events.push({event_id:id,timestamp,event_type:type,...payload})};
    const seenAccounts=new Set(beforeCampaigns.map(item=>item.conta_sufixo).filter(Boolean));for(const oldSource of beforeManifest?.campanhas||[]){const account=accountForSource(oldSource,beforeByName.get(String(oldSource.nome_campanha_exato||'').toLocaleLowerCase('pt-BR')));if(account)seenAccounts.add(account)}
    for(const item of manifest?.campanhas||[]){const exact=String(item.nome_campanha_exato||'').trim();if(!exact)continue;const campaign=base.campanhas.find(value=>String(value.nome_mcc||'').toLocaleLowerCase('pt-BR')===exact.toLocaleLowerCase('pt-BR'));if(!campaign)continue;const accountId=accountForSource(item,campaign),identity=productIdentity(item,campaign,identityContext),geo=explicitGeo(item),snapshot=campaignSnapshot(base,item,campaign,identity),date=observationDate(item),common={test_id:identity.testId,product_id:identity.productId,product_name:identity.productName,account_id:accountId,campaign_id:campaign.id,iteration_id:campaign.id,campaign_name:exact,iteration_number:identity.iterationNumber,geo,source,snapshot,metadata:{identity_confidence:identity.confidence}},iterationEntity=`${campaign.id}|${identity.testId||`account:${accountId||'unknown'}`}`;
      if(!knownNames.has(exact.toLocaleLowerCase('pt-BR')))append('test_iteration_created',iterationEntity,'first-seen',{...common,metadata:{...common.metadata,first_seen_at:timestamp}});
      if(accountId&&!seenAccounts.has(accountId)){const accountPayload={...common,test_id:null,product_id:null,product_name:null,iteration_number:null,metadata:{identity_confidence:'account_observed_with_campaign',first_seen_at:timestamp}};append('account_first_seen',accountId,'first-seen',accountPayload);append('account_first_used',accountId,'first-used',accountPayload);seenAccounts.add(accountId)}
      const prior=beforeByName.get(exact.toLocaleLowerCase('pt-BR')),nextStatus=explicitCampaignStatus(item),priorStatus=prior?.estado_campanha_observado;if(priorStatus&&nextStatus&&normalizeProductKey(priorStatus)!==normalizeProductKey(nextStatus)){append('campaign_status_changed',campaign.id,`${date||'unknown'}|${priorStatus}|${nextStatus}`,{...common,metadata:{...common.metadata,from_status:priorStatus,to_status:nextStatus,observation_date:date}})}
      const hadPriorDelivery=beforeDaily.some(row=>row.campanha_id===campaign.id&&['B','C','O'].some(column=>{const value=Number(row.celulas?.[column]?.value);return row.celulas?.[column]?.value!=null&&row.celulas[column].value!==''&&Number.isFinite(value)&&value>0}));const hasDeliveryEvent=(base.event_log||[]).some(event=>event.event_type==='campaign_delivery_started'&&event.campaign_id===campaign.id)||events.some(event=>event.event_type==='campaign_delivery_started'&&event.campaign_id===campaign.id);
      if(!hadPriorDelivery&&!hasDeliveryEvent){for(const period of['metricas_D_menos_1','metricas_D_zero']){const metrics=item[period];if(!metrics||metrics.presente===false)continue;const periodDate=metricValue(metrics.data);if(!periodDate)continue;const priorRow=priorDailyByKey.get(`${campaign.id}|${periodDate}`);if(!priorRow)continue;const rawImpressions=priorRow.celulas?.B?.value,rawClicks=priorRow.celulas?.C?.value,rawCost=priorRow.celulas?.O?.value,impressions=Number(rawImpressions),clicks=Number(rawClicks),costAbsent=rawCost==null||rawCost==='',cost=costAbsent?null:Number(rawCost),priorNoDelivery=rawImpressions!=null&&rawImpressions!==''&&rawClicks!=null&&rawClicks!==''&&Number.isFinite(impressions)&&Number.isFinite(clicks)&&impressions===0&&clicks===0&&(costAbsent||Number.isFinite(cost)&&cost===0),currentSignals=['impressoes','cliques_google','custo_total'].map(key=>Number(metricValue(metrics[key]))).filter(Number.isFinite),currentHasDelivery=currentSignals.some(value=>value>0);if(priorNoDelivery&&currentHasDelivery){append('campaign_delivery_started',campaign.id,periodDate,{...common,metadata:{...common.metadata,observation_date:periodDate,period:period==='metricas_D_zero'?'D_zero':'D_menos_1'}});break}}
      }
    }
    return events
  }
  function importManifest(baseInput,manifest,rowFactory,{overwrite=false,source='hub_manifest_import',trackEvents=true}={}){
    const base=normalize(baseInput),beforeCampaigns=base.campanhas.map(clone),beforeDaily=base.diario.map(clone),beforeManifest=clone(base.manifesto_atual),beforeSnapshotNames=(base.snapshots_campanhas||[]).flatMap(item=>item.campanhas||[]),conflicts=[],previousStatus=new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x.status]));
    const dailyIndex=new Map(base.diario.map(x=>[`${x.campanha_id}|${x.data}`,x]));
    for(const source of manifest?.campanhas||[]){
      const exact=source.nome_campanha_exato,campaign=ensureCampaign(base,{exactName:exact,sheetName:displayName(exact),status:'ativa',referenceDate:manifestDate(manifest)});
      const suffix=accountSuffix(source.metricas_D_zero?.conta?.valor??source.metricas_D_menos_1?.conta?.valor);
      if(suffix)campaign.conta_sufixo=suffix;
      const observedStatus=explicitCampaignStatus(source);
      if(observedStatus)campaign.estado_campanha_observado=observedStatus;
      const made=rowFactory(source),rows=Array.isArray(made)?made:[made];
      for(const row of rows.filter(Boolean)){
        const date=row.date||source.metricas_D_menos_1?.data?.valor||manifest?.separacao_temporal?.D_menos_1?.datas_detectadas?.[0];
        if(!date)continue;
        const key=`${campaign.id}|${date}`,existing=base.diario.find(item=>item.campanha_id===campaign.id&&item.data===date)||dailyIndex.get(key);
        if(existing){existing.celulas=mergeCells(existing.celulas,row.cells,overwrite,conflicts,{campanha:campaign.nome_exibicao,data:date});if(!existing.fontes.includes('manifesto'))existing.fontes.push('manifesto');existing.periodos??=[];if(row.period&&!existing.periodos.includes(row.period))existing.periodos.push(row.period);dailyIndex.set(key,existing)}
        else{const record={campanha_id:campaign.id,data:date,celulas:clone(row.cells),fontes:['manifesto'],periodos:row.period?[row.period]:[]};base.diario.push(record);dailyIndex.set(key,record)}
      }
    }
    reconcileProvisionalSales(base);const movimentos=updateCampaignSnapshot(base,manifest,previousStatus),observability=trackEvents?buildObservabilityEvents({base,beforeCampaigns,beforeDaily,beforeManifest,beforeSnapshotNames,manifest,source}):[];base.event_log=uniqueEvents([...base.event_log,...observability]);base.manifesto_atual=clone(manifest);base.importacoes.push({tipo:'manifesto',executada_em:new Date().toISOString(),registros:(manifest?.campanhas||[]).length,conflitos:conflicts.length,movimentos});base.atualizado_em=new Date().toISOString();return{base,conflicts,movimentos,events:observability}
  }
  function dailyRows(baseInput,sheetName){const base=normalize(baseInput),campaign=base.campanhas.find(x=>x.nome_exibicao.toLowerCase()===String(sheetName).toLowerCase());if(!campaign)return[];return base.diario.filter(x=>x.campanha_id===campaign.id).sort((a,b)=>a.data.localeCompare(b.data)).map((x,index)=>({index:index+1,cells:clone(x.celulas)}))}
  function campaignTotalsMap(baseInput){
    const base=normalize(baseInput),campaigns=new Map(base.campanhas.map(x=>[x.id,x])),sums=new Map(),rows=new Map();
    for(const record of base.diario){
      const campaign=campaigns.get(record.campanha_id);
      if(!campaign)continue;
      const total=sums.get(campaign.id)||{investment:0,impressions:0,clicks:0,conversions:0,commission:0,observed:{investment:0,impressions:0,clicks:0,conversions:0,commission:0},byDate:{}};
      const day=total.byDate[record.data]||{investment:0,impressions:0,clicks:0,conversions:0,commission:0};
      for(const [field,column] of Object.entries({investment:'O',impressions:'B',clicks:'C',conversions:'F',commission:'P'})){
        const value=Number(record.celulas?.[column]?.value);
        if(record.celulas?.[column]?.value!=null&&record.celulas[column].value!==''&&Number.isFinite(value)){total[field]+=value;day[field]+=value;total.observed[field]++}
      }
      total.byDate[record.data]=day;
      sums.set(campaign.id,total);
      rows.set(campaign.id,(rows.get(campaign.id)||0)+1);
    }
    const map=new Map();
    for(const campaign of base.campanhas){
      if(!rows.has(campaign.id))continue;
      const total=sums.get(campaign.id);
      if(campaign.nome_mcc)map.set(`mcc:${campaign.nome_mcc.toLowerCase()}`,total);
      map.set(`aba:${campaign.nome_exibicao.toLowerCase()}`,total);
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
  function operationalMap(baseInput){const base=normalize(baseInput),campaigns=new Map(base.campanhas.map(x=>[x.id,x])),map=new Map();for(const record of base.campos_operacionais){const campaign=campaigns.get(record.campanha_id);if(!campaign?.nome_mcc)continue;map.set(campaign.nome_mcc,{L:record.roi_atual,M:record.investimento_atual,O:record.limite_teste,P:record.valor_restante})}return map}
  function addProvisionalSale(baseInput,input){
    const base=normalize(baseInput),campaign=base.campanhas.find(x=>x.id===input?.campanha_id),date=String(input?.data||'').trim(),amount=Number(input?.valor_brl),country=String(input?.pais_codigo||'').trim().toUpperCase(),dedupe=String(input?.chave_duplicidade||'').trim().toLowerCase();
    if(!campaign)throw new Error('Selecione uma campanha válida para registrar a venda.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('A data da venda não foi reconhecida.');
    if(!Number.isFinite(amount)||amount<=0)throw new Error('O valor da venda não foi reconhecido.');
    if(!/^[A-Z]{2}$/.test(country))throw new Error('Selecione o país ou marque País não identificado.');
    if(!dedupe)throw new Error('Não foi possível criar a chave de prevenção de duplicidade.');
    const existing=base.vendas_provisorias.find(x=>x.chave_duplicidade===dedupe&&x.status!=='cancelada');
    if(existing)return{base,sale:existing,duplicate:true};
    const sale={id:`sale_${idFor(dedupe).slice(4)}`,campanha_id:campaign.id,data:date,hora:String(input.hora||'').trim()||null,produto:String(input.produto||'').trim()||null,plataforma:String(input.plataforma||'').trim()||null,valor_brl:amount,pais_codigo:country,origem:String(input.origem||'FlowTracking').trim(),identificador_mascarado:String(input.identificador_mascarado||'').trim()||null,chave_duplicidade:dedupe,status:'provisoria',registrada_em:new Date().toISOString()};
    base.vendas_provisorias.push(sale);base.importacoes.push({tipo:'venda_provisoria',executada_em:sale.registrada_em,registros:1,conflitos:0});base.atualizado_em=sale.registrada_em;return{base,sale,duplicate:false};
  }
  function reconcileProvisionalSales(base){
    const official=new Map();for(const row of base.diario){if(!row.fontes?.includes('excel')&&!row.periodos?.includes('d1'))continue;const key=`${row.campanha_id}|${row.data}`,count=Math.max(0,Math.floor(Number(row.celulas?.F?.value)||0));official.set(key,(official.get(key)||0)+count)}
    const groups=new Map();for(const sale of base.vendas_provisorias.filter(x=>x.status!=='cancelada')){const key=`${sale.campanha_id}|${sale.data}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(sale)}
    const reconciledAt=new Date().toISOString();for(const [key,sales] of groups){sales.sort((a,b)=>String(a.registrada_em||'').localeCompare(String(b.registrada_em||'')));const confirmed=Math.min(sales.length,official.get(key)||0);sales.forEach((sale,index)=>{if(index<confirmed){sale.status='conciliada';sale.conciliada_em??=reconciledAt;sale.conciliacao_origem='conversao_oficial'}else if(sale.status==='conciliada'){sale.status='provisoria';delete sale.conciliada_em;delete sale.conciliacao_origem}})}
  }
  function salesAdjustmentMap(baseInput){
    const base=normalize(baseInput),official=new Map(),groups=new Map();
    for(const row of base.diario){const key=`${row.campanha_id}|${row.data}`,entry=official.get(key)||{conversions:0,commission:0};entry.conversions+=Number(row.celulas?.F?.value)||0;entry.commission+=Number(row.celulas?.P?.value)||0;official.set(key,entry)}
    for(const sale of base.vendas_provisorias.filter(x=>x.status==='provisoria'||!x.status)){const key=`${sale.campanha_id}|${sale.data}`,group=groups.get(key)||{campaignId:sale.campanha_id,date:sale.data,sales:[],amount:0,countries:new Set()};group.sales.push(sale);group.amount+=Number(sale.valor_brl)||0;if(sale.pais_codigo)group.countries.add(sale.pais_codigo);groups.set(key,group)}
    const map=new Map();
    for(const [key,group] of groups){const seen=official.get(key)||{conversions:0,commission:0},confirmed=Math.min(group.sales.length,Math.max(0,Math.floor(seen.conversions))),pendingSales=group.sales.slice(confirmed),pendingConversions=pendingSales.length,pendingAmount=pendingSales.reduce((sum,sale)=>sum+(Number(sale.valor_brl)||0),0),commissionAdjustment=confirmed?pendingAmount:Math.max(0,pendingAmount-seen.commission),summary=map.get(group.campaignId)||{pendingConversions:0,commissionAdjustment:0,sales:0,manualSales:0,countries:new Set(),byDate:{}};summary.pendingConversions+=pendingConversions;summary.commissionAdjustment+=commissionAdjustment;summary.sales+=pendingConversions;summary.manualSales+=group.sales.length;for(const sale of group.sales)if(sale.pais_codigo)summary.countries.add(sale.pais_codigo);summary.byDate[group.date]={pendingConversions,commissionAdjustment,sales:pendingConversions,manualSales:group.sales.length,countries:[...new Set(group.sales.map(x=>x.pais_codigo).filter(Boolean))]};map.set(group.campaignId,summary)}
    return map;
  }
  window.CampaignDatabase={SCHEMA,create,normalize,mergeEventLogs,importWorkbook,importManifest,campaignNumberReuseIssues,reconcileCampaignSnapshots,dailyRows,campaignTotalsMap,consecutiveZeroImpressionDays,investmentTotalsMap,operationalMap,addProvisionalSale,salesAdjustmentMap};
})();
