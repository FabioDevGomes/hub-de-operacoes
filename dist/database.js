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
  function uniqueEvents(events){const byId=new Map();for(const event of events||[]){const id=String(event?.event_id||'').trim();if(id&&!byId.has(id))byId.set(id,clone(event))}return[...byId.values()]}
  function create(){return{schema:SCHEMA,atualizado_em:new Date().toISOString(),manifesto_atual:null,campanhas:[],diario:[],campos_operacionais:[],importacoes:[],snapshots_campanhas:[],vendas_provisorias:[],event_log:[]}}
  function normalize(base){const value=base?.schema===SCHEMA?clone(base):create();value.campanhas??=[];value.diario??=[];value.campos_operacionais??=[];value.importacoes??=[];value.snapshots_campanhas??=[];value.vendas_provisorias??=[];value.event_log=uniqueEvents(value.event_log);return value}
  function mergeEventLogs(baseInput,events){const base=normalize(baseInput);base.event_log=uniqueEvents([...base.event_log,...(events||[])]);return base}
  function campaignIndexes(base){return{byId:new Map(base.campanhas.map(x=>[x.id,x])),byExact:new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x])),byDisplay:new Map(base.campanhas.map(x=>[x.nome_exibicao.toLowerCase(),x]))}}
  function campaignStartDate(exactName,referenceDate){const match=String(exactName||'').match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\s*(?:[–—-]\s*)?/);if(!match)return null;const reference=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(referenceDate||'')),year=match[3]?(match[3].length===2?`20${match[3]}`:match[3]):reference?.[1];if(!year)return null;const iso=`${year}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;return /^\d{4}-\d{2}-\d{2}$/.test(iso)?iso:null}
  function previousExactForDisplay(base,display,exactName,beforeDate){let found=null;for(const snapshot of base.snapshots_campanhas||[]){if(beforeDate&&snapshot.data>=beforeDate)continue;for(const name of snapshot.campanhas||[])if(String(name).toLowerCase()!==String(exactName).toLowerCase()&&displayName(String(name)).toLowerCase()===display.toLowerCase())found={name:String(name),date:snapshot.data}}return found?.name||null}
  function splitLegacyExactCollision(base,existing,exactName,display,status,referenceDate){const targetId=idFor(exactName),start=campaignStartDate(exactName,referenceDate),previous=previousExactForDisplay(base,display,exactName,start);if(existing.id===targetId||!start||!previous)return existing;if(existing.nome_mcc_corrigido_em&&confirmedDateAliasKeys(base).has(previous.trim().toLocaleLowerCase('pt-BR')))return existing;let target=base.campanhas.find(x=>x.id===targetId);if(!target){target={...existing,id:targetId,nome_mcc:exactName,nome_exibicao:display,status};base.campanhas.push(target)}for(const row of base.diario)if(row.campanha_id===existing.id&&row.data>=start)row.campanha_id=target.id;for(const sale of base.vendas_provisorias)if(sale.campanha_id===existing.id&&sale.data>=start)sale.campanha_id=target.id;for(const record of base.campos_operacionais)if(record.campanha_id===existing.id)record.campanha_id=target.id;existing.nome_mcc=previous;existing.nome_exibicao=display;existing.status='historico';delete existing.movimento_status;target.nome_mcc=exactName;target.nome_exibicao=display;target.status=status;target.identidade_separada_em=new Date().toISOString();return target}
  function ensureCampaign(base,{exactName=null,sheetName,status='historico',referenceDate=null}){const indexes=campaignIndexes(base),display=sheetName||displayName(exactName);if(exactName){const exact=indexes.byExact.get(exactName.toLowerCase());if(exact)return splitLegacyExactCollision(base,exact,exactName,display,status,referenceDate);const unclaimed=base.campanhas.find(x=>!x.nome_mcc&&x.nome_exibicao.toLowerCase()===display.toLowerCase());if(unclaimed){unclaimed.nome_mcc=exactName;unclaimed.nome_exibicao=display;unclaimed.status=status;return unclaimed}}else{const displayed=indexes.byDisplay.get(display.toLowerCase());if(displayed)return displayed}const campaign={id:idFor(exactName||display),nome_mcc:exactName,nome_exibicao:display,status};if(referenceDate&&/^\d{1,2}[\/-]\d{1,2}\s*[–—-]/.test(String(exactName||'')))campaign.data_inicio_ano_inferido=new Date().getFullYear();base.campanhas.push(campaign);return campaign}
  function mergeCells(existing,incoming,overwrite,conflicts,context){const result=clone(existing||{});for(const [column,cell] of Object.entries(incoming||{})){if(!cell||isBlank(cell.value))continue;const previous=result[column];if(!previous||isBlank(previous.value)){result[column]=clone(cell);continue}if(comparable(previous.value)===comparable(cell.value))continue;if(overwrite)result[column]=clone(cell);else conflicts.push({...context,coluna:column,anterior:previous.value,novo:cell.value})}return result}
  function importWorkbook(baseInput,workbook,{overwrite=false}={}){const base=normalize(baseInput),conflicts=[];const dailyIndex=new Map(base.diario.map(x=>[`${x.campanha_id}|${x.data}`,x]));const totals=workbook?.sheets?.find(s=>s.name.toLowerCase()==='totais');for(const sheet of workbook?.sheets||[]){if(sheet===totals)continue;const dailyRows=sheet.rows.filter(row=>typeof row.cells.A?.value==='number'&&row.cells.A.value>=30000&&row.cells.A.value<=70000);if(!dailyRows.length)continue;const campaign=ensureCampaign(base,{sheetName:sheet.name,status:sheet.visible?'ativa':'historico'});for(const row of dailyRows){const date=excelDateToIso(row.cells.A.value),key=`${campaign.id}|${date}`,existing=dailyIndex.get(key),cells=clone(row.cells);if(existing)existing.celulas=mergeCells(existing.celulas,cells,overwrite,conflicts,{campanha:campaign.nome_exibicao,data:date});else{const record={campanha_id:campaign.id,data:date,celulas:cells,fontes:['excel']};base.diario.push(record);dailyIndex.set(key,record)}}}
    if(totals){for(const row of totals.rows){const exact=String(row.cells.C?.value??'').trim();if(!exact)continue;const campaign=ensureCampaign(base,{exactName:exact,sheetName:displayName(exact),status:'ativa'}),incoming={roi_atual:row.cells.L??null,investimento_atual:row.cells.M??null,limite_teste:row.cells.O??null,valor_restante:row.cells.P??null},existing=base.campos_operacionais.find(x=>x.campanha_id===campaign.id);if(existing)Object.assign(existing,incoming);else base.campos_operacionais.push({campanha_id:campaign.id,...incoming})}}
    const reconciledSales=reconcileProvisionalSales(base);base.importacoes.push({tipo:'excel',arquivo:workbook?.fileName||null,executada_em:new Date().toISOString(),registros:base.diario.length,conflitos:conflicts.length});base.atualizado_em=new Date().toISOString();return{base,conflicts,reconciledSales}}
  function manifestDate(manifest){const temporal=manifest?.separacao_temporal||{};return temporal.D_zero?.datas_detectadas?.[0]||temporal.D_menos_1?.datas_detectadas?.[0]||new Date().toISOString().slice(0,10)}
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
  function pauseCutoffForImport(campaign,source,manifest){
    const observed=explicitPauseDate(source,manifest),prior=confirmedPauseDate(campaign),cutoff=observed&&prior?(observed<prior?observed:prior):observed||prior,activeDate=explicitActiveDate(source,manifest),currentState=manifestOperationalStates(manifest).get(String(campaign?.nome_mcc||'').trim().toLowerCase());
    return cutoff&&currentState==='ativa'&&activeDate&&activeDate>cutoff?null:cutoff;
  }
  // D−1 supplies financial history; only the current collection determines activity.
  function manifestOperationalStates(manifest){
    const hasD0=Boolean(manifest?.separacao_temporal?.D_zero?.datas_detectadas?.length),states=new Map();
    for(const source of manifest?.campanhas||[]){
      const key=String(source.nome_campanha_exato||'').trim().toLowerCase();if(!key)continue;
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
  function confirmedDateAliasKeys(base){
    const currentNames=new Set(base.campanhas.map(item=>String(item.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'))),aliases=new Set();
    const parts=name=>{const match=String(name||'').trim().match(/^(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)\s*[–—-]\s*(.+)$/);return match?{date:match[1],suffix:match[2].trim().toLocaleLowerCase('pt-BR')}:null};
    for(const campaign of base.campanhas){if(!campaign.nome_mcc_corrigido_em)continue;const current=parts(campaign.nome_mcc);if(!current)continue;for(const previousName of[campaign.nome_mcc_anterior,...(campaign.nome_mcc_anteriores||[])]){const previous=parts(previousName),key=String(previousName||'').trim().toLocaleLowerCase('pt-BR');if(previous&&previous.suffix===current.suffix&&previous.date!==current.date&&!currentNames.has(key))aliases.add(key)}}
    return aliases;
  }
  function campaignNumberGroups(baseInput,manifest){
    const base=normalize(baseInput),incoming=manifestNames(manifest),incomingKeys=new Set(incoming.map(name=>name.toLocaleLowerCase('pt-BR'))),known=new Set(incoming),confirmedAliases=confirmedDateAliasKeys(base);
    for(const campaign of base.campanhas||[])if(campaign.nome_mcc)known.add(String(campaign.nome_mcc).trim());
    for(const snapshot of base.snapshots_campanhas||[])for(const name of snapshot.campanhas||[])if(String(name||'').trim())known.add(String(name).trim());
    for(const campaign of base.manifesto_atual?.campanhas||[])if(campaign.nome_campanha_exato)known.add(String(campaign.nome_campanha_exato).trim());
    const groups=new Map();
    for(const name of known){const group=displayName(name),nameKey=name.toLocaleLowerCase('pt-BR');if(confirmedAliases.has(nameKey)&&!incomingKeys.has(nameKey)||group.toLocaleLowerCase('pt-BR')===nameKey)continue;const key=group.toLocaleLowerCase('pt-BR'),entry=groups.get(key)||{group,names:new Map(),incomingNames:new Map()};entry.names.set(nameKey,name);if(incomingKeys.has(nameKey))entry.incomingNames.set(nameKey,name);groups.set(key,entry)}
    const dateChanges=campaignDateChangeCandidates(base,manifest);
    return[...groups.values()].filter(entry=>entry.incomingNames.size&&entry.names.size>1).filter(entry=>!dateChanges.some(item=>entry.names.size===2&&entry.names.has(item.oldName.toLocaleLowerCase('pt-BR'))&&entry.names.has(item.newName.toLocaleLowerCase('pt-BR')))).map(entry=>({group:entry.group,incomingNames:[...entry.incomingNames.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'})),knownNames:[...entry.names.values()].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}))})).sort((a,b)=>a.group.localeCompare(b.group,'pt-BR',{numeric:true,sensitivity:'base'}));
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
    const base=normalize(baseInput),previous=new Set(manifestNames(base.manifesto_atual).map(name=>name.toLocaleLowerCase('pt-BR'))),existing=new Set(base.campanhas.map(item=>String(item.nome_mcc||'').toLocaleLowerCase('pt-BR'))),candidates=[];
    const firstDiaryYear=new Map();for(const row of base.diario){const year=String(row.data||'').slice(0,4);if(!/^\d{4}$/.test(year))continue;const prior=firstDiaryYear.get(row.campanha_id);if(!prior||year<prior)firstDiaryYear.set(row.campanha_id,year)}
    const campaignYear=item=>item.data_inicio_ano_inferido||item.data_inicio_confirmada?.slice(0,4)||firstDiaryYear.get(item.id)||new Date().getFullYear();
    const parts=(name,inferredYear=new Date().getFullYear())=>{const match=String(name||'').match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(\s*[–—-]\s*.+)$/);if(!match)return null;const day=Number(match[1]),month=Number(match[2]),year=match[3]?(match[3].length===2?2000+Number(match[3]):Number(match[3])):Number(inferredYear);if(day<1||day>31||month<1||month>12)return null;return{date:`${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`,suffix:match[4].trim().toLocaleLowerCase('pt-BR')}};
    const incomingNames=new Set(manifestNames(manifest).map(name=>name.toLocaleLowerCase('pt-BR')));
    for(const source of manifest?.campanhas||[]){const newName=String(source.nome_campanha_exato||'').trim(),next=parts(newName);if(!next||existing.has(newName.toLocaleLowerCase('pt-BR')))continue;const account=sourceAccountId(source),legacyAccount=accountSuffix(metricValue(source.metricas_D_zero?.conta)??metricValue(source.metricas_D_menos_1?.conta)),matches=base.campanhas.filter(item=>{const old=parts(item.nome_mcc,campaignYear(item));return old&&old.suffix===next.suffix&&old.date!==next.date&&previous.has(String(item.nome_mcc).toLocaleLowerCase('pt-BR'))&&!incomingNames.has(String(item.nome_mcc).toLocaleLowerCase('pt-BR'))&&(!account||!item.conta_id||account===item.conta_id)&&(!legacyAccount||!item.conta_sufixo||legacyAccount===item.conta_sufixo)});if(matches.length===1){const campaign=matches[0],shortName=displayName(newName);candidates.push({campaignId:campaign.id,oldName:campaign.nome_mcc,newName,shortName:shortName===newName?newName.replace(/^\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\s*[–—-]\s*/,'').split(/\s*\(/)[0].trim():shortName,oldDate:parts(campaign.nome_mcc,campaignYear(campaign)).date,newDate:next.date})}
    }
    const counts=new Map();for(const item of candidates)counts.set(item.campaignId,(counts.get(item.campaignId)||0)+1);return candidates.filter(item=>counts.get(item.campaignId)===1);
  }
  function setCampaignStartDate(baseInput,campaignId,date){
    const base=normalize(baseInput),campaign=base.campanhas.find(item=>item.id===campaignId),match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));if(!campaign||!match)throw new Error('Campanha ou data inválida.');const check=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));if(check.toISOString().slice(0,10)!==date)throw new Error('Data inválida.');const old=campaignStartDate(campaign.nome_mcc,date);if(!old)throw new Error('O nome da campanha não contém uma data inicial reconhecível.');campaign.data_inicio_confirmada=date;campaign.data_inicio_anterior=old;campaign.data_inicio_confirmada_em=new Date().toISOString();base.atualizado_em=campaign.data_inicio_confirmada_em;return base;
  }
  function setCampaignMinimumRoi(baseInput,campaignId,value){
    const base=normalize(baseInput),campaign=base.campanhas.find(item=>item.id===campaignId),minimum=typeof value==='number'?value:NaN;
    if(!campaign)throw new Error('Campanha não encontrada para editar o ROI mínimo.');
    if(!Number.isFinite(minimum)||minimum<0)throw new Error('O ROI mínimo deve ser um número igual ou maior que zero.');
    campaign.roi_minimo_pct=minimum;base.atualizado_em=new Date().toISOString();return base;
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
  function updateCampaignSnapshot(base,manifest,previousStatus,previousManifest,dateChanges=[]){
    const capturedAt=new Date().toISOString(),date=manifestDate(manifest),names=manifestNames(manifest),states=manifestOperationalStates(manifest),activeNames=names.filter(name=>states.get(name.toLowerCase())==='ativa'),currentKeys=new Set(activeNames.map(x=>x.toLowerCase())),explicitPauses=new Map((manifest?.campanhas||[]).map(source=>[String(source.nome_campanha_exato||'').trim().toLowerCase(),explicitPauseDate(source,manifest)]).filter(([key,pauseDate])=>key&&pauseDate));
    if(!base.snapshots_campanhas.length&&base.manifesto_atual){const priorDate=manifestDate(base.manifesto_atual),priorNames=manifestNames(base.manifesto_atual),priorStates=manifestOperationalStates(base.manifesto_atual);if(priorNames.length)base.snapshots_campanhas.push({data:priorDate,capturada_em:base.atualizado_em||capturedAt,campanhas:priorNames,campanhas_ativas:priorNames.filter(name=>priorStates.get(name.toLowerCase())==='ativa')})}
    const sameIndex=base.snapshots_campanhas.findIndex(x=>x.data===date),sameDayPrevious=sameIndex>=0?base.snapshots_campanhas[sameIndex]:null,snapshot={data:date,capturada_em:capturedAt,campanhas:names,campanhas_ativas:activeNames,campanhas_pausadas:names.filter(name=>states.get(name.toLowerCase())==='pausada')},previousQualificationByName=new Map((previousManifest?.campanhas||[]).map(item=>[String(item.nome_campanha_exato||'').toLowerCase(),qualificationStatus(item)]));
    if(sameIndex>=0)base.snapshots_campanhas[sameIndex]=snapshot;else base.snapshots_campanhas.push(snapshot);
    base.snapshots_campanhas.sort((a,b)=>a.data.localeCompare(b.data)||a.capturada_em.localeCompare(b.capturada_em));
    const previous=[...base.snapshots_campanhas].filter(x=>x.data<date).at(-1)||null,transitionPrevious=sameDayPrevious||previous,previousKeys=new Set(snapshotActiveNames(transitionPrevious).map(x=>x.toLowerCase())),priorNameByNew=new Map(dateChanges.map(item=>[item.newName.toLowerCase(),item.oldName.toLowerCase()]));
    for(const campaign of base.campanhas){const exact=String(campaign.nome_mcc||'').trim(),key=exact.toLowerCase();if(!exact)continue;const presentBefore=previousKeys.has(key)||previousKeys.has(priorNameByNew.get(key));if(currentKeys.has(key)){const wasPaused=previousStatus.get(key)==='pausada'||campaign.pausada_em;campaign.status='ativa';campaign.ultima_aparicao=date;campaign.status_origem='presente_na_coleta';campaign.movimento_status=wasPaused&&!presentBefore?'reativada':transitionPrevious?.data===date?'manteve':previous&&presentBefore?'manteve':'nova';if(wasPaused&&!presentBefore)campaign.reativada_em=date;delete campaign.pausada_em;delete campaign.pausa_confirmada_em;delete campaign.motivo_pausa}else if(states.has(key)||presentBefore||previousQualificationByName.has(key)){const explicitPause=states.get(key)==='pausada',wasPaused=previousStatus.get(key)==='pausada';campaign.status='pausada';if(explicitPause){const detected=explicitPauses.get(key)||date,priorConfirmed=confirmedPauseDate(campaign),confirmedAt=priorConfirmed&&priorConfirmed<detected?priorConfirmed:detected;campaign.pausa_confirmada_em=confirmedAt;campaign.pausada_em=confirmedAt;campaign.ultima_aparicao=confirmedAt;campaign.status_origem='status_na_coleta'}else{if(!wasPaused||!campaign.pausada_em)campaign.pausada_em=date;const priorConfirmed=confirmedPauseDate(campaign);if(priorConfirmed)campaign.pausa_confirmada_em=priorConfirmed;campaign.ultima_aparicao=campaign.ultima_aparicao||transitionPrevious?.data||null;campaign.status_origem='ausencia_na_coleta'}campaign.movimento_status=wasPaused?'manteve':'pausada';const qualification=campaign.status_qualificacao_observado||previousQualificationByName.get(key)||null;if(qualification)campaign.status_qualificacao_observado=qualification;campaign.motivo_pausa=explicitPause?null:isRejectedQualification(qualification)?'reprovacao':null}}
    return{data:date,anterior:previous?.data||null,pausadas:base.campanhas.filter(x=>x.status==='pausada'&&(x.pausada_em===date||explicitPauses.get(String(x.nome_mcc||'').toLowerCase())===x.pausada_em)).map(x=>x.nome_mcc),novas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='nova').map(x=>x.nome_mcc),reativadas:base.campanhas.filter(x=>x.status==='ativa'&&x.movimento_status==='reativada'&&x.reativada_em===date).map(x=>x.nome_mcc)}
  }
  function metricValue(value){if(value==null||value==='')return null;if(typeof value==='object'&&Object.hasOwn(value,'valor')){if(['ausente','invalido'].includes(value.estado))return null;return value.valor===''?null:value.valor}return value}
  function metricRecord(metrics,key){return Object.hasOwn(metrics||{},key)?clone(metrics[key]):null}
  function explicitCampaignStatus(source){for(const metrics of[source?.metricas_D_zero,source?.metricas_D_menos_1]){const value=metricValue(metrics?.estado_campanha)??metrics?.raw?.campaign_state;if(value!=null&&String(value).trim())return String(value).trim();const fallback=metricValue(metrics?.status_campanha),normalized=normalizeProductKey(fallback);if(fallback!=null&&(pausedCampaignState.test(normalized)||activeCampaignState.test(normalized)))return String(fallback).trim()}return null}
  function qualificationStatus(source){for(const metrics of[source?.metricas_D_zero,source?.metricas_D_menos_1]){const value=metricValue(metrics?.status_qualificacao)??metricValue(metrics?.status_campanha)??metrics?.raw?.status;if(value!=null&&String(value).trim())return String(value).trim()}return null}
  function isRejectedQualification(value){const normalized=normalizeProductKey(value);return /nao qualificad|reprovad|disapprov|not eligible|ineligible/.test(normalized)}
  function observationDate(source){return metricValue(source?.metricas_D_zero?.data)||metricValue(source?.metricas_D_menos_1?.data)||null}
  function campaignTitleParts(name){let text=String(name||'').trim().replace(/^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s*(?:[–—-]\s*)?/,'').trim();text=text.split(/\s+\(/,1)[0].trim();text=text.replace(/\s+[–—-]\s+(?=(?:\d{1,3}%|(?:US\$|U\$|R\$)|CPA\b)).*$/i,'').trim();return text}
  function numberedTitle(name){const title=campaignTitleParts(name),match=title.match(/^(.*?)\s+(\d{1,3})$/);return match&&match[1].trim()?{title,base:match[1].trim(),number:Number(match[2]),rawNumber:match[2]}:null}
  function normalizeProductKey(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
  function sourceAccountId(source){const values=[metricValue(source?.metricas_D_zero?.conta_id),metricValue(source?.metricas_D_menos_1?.conta_id)].filter(value=>value!=null&&value!=='');const ids=[...new Set(values.map(canonicalAccountId))];if(ids.includes(null)||ids.length>1)throw new Error(`Número completo da conta inválido ou divergente para a campanha “${source?.nome_campanha_exato||''}”.`);return ids[0]||null}
  function accountForSource(source,campaign){const account=metricValue(source?.metricas_D_zero?.conta)??metricValue(source?.metricas_D_menos_1?.conta);return sourceAccountId(source)||campaign?.conta_id||accountSuffix(account)||campaign?.conta_sufixo||null}
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
  function buildObservabilityEvents({base,beforeCampaigns,beforeDaily,beforeManifest,beforeSnapshotNames,manifest,source,dateChanges=[]}){
    const timestamp=new Date().toISOString(),existingIds=new Set((base.event_log||[]).map(event=>event.event_id)),events=[],knownNames=new Set(manifestNames(beforeManifest).map(name=>name.toLocaleLowerCase('pt-BR')));for(const name of beforeSnapshotNames||[])if(name)knownNames.add(String(name).toLocaleLowerCase('pt-BR'));
    const oldNames=beforeCampaigns.filter(item=>item.nome_mcc).map(item=>({name:item.nome_mcc,account:base.campanhas.find(value=>value.id===item.id)?.conta_id||item.conta_id||item.conta_sufixo||null})),incomingNames=(manifest?.campanhas||[]).map(item=>({name:item.nome_campanha_exato,account:accountForSource(item,null)})),identityContext=[...oldNames,...incomingNames],beforeByName=new Map(beforeCampaigns.filter(item=>item.nome_mcc).map(item=>[String(item.nome_mcc).toLocaleLowerCase('pt-BR'),item])),priorSignalsByCampaign=new Map();for(const item of dateChanges){const oldKey=item.oldName.toLocaleLowerCase('pt-BR'),newKey=item.newName.toLocaleLowerCase('pt-BR');if(knownNames.has(oldKey))knownNames.add(newKey);if(beforeByName.has(oldKey))beforeByName.set(newKey,beforeByName.get(oldKey))}for(const row of beforeDaily){const state=priorSignalsByCampaign.get(row.campanha_id)||{delivered:false,noDelivery:false},values=['B','C','O'].map(column=>row.celulas?.[column]?.value);if(values.some(value=>value!=null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>0))state.delivered=true;const[rawImpressions,rawClicks,rawCost]=values,impressions=Number(rawImpressions),clicks=Number(rawClicks),costAbsent=rawCost==null||rawCost==='',cost=costAbsent?null:Number(rawCost);if(rawImpressions!=null&&rawImpressions!==''&&rawClicks!=null&&rawClicks!==''&&Number.isFinite(impressions)&&Number.isFinite(clicks)&&impressions===0&&clicks===0&&(costAbsent||Number.isFinite(cost)&&cost===0))state.noDelivery=true;priorSignalsByCampaign.set(row.campanha_id,state)}
    const append=(type,entity,fingerprint,payload)=>{const id=eventId(type,entity,fingerprint);if(existingIds.has(id))return;existingIds.add(id);events.push({event_id:id,timestamp,event_type:type,...payload})},processedStatusTransitions=new Set();
    const seenAccounts=new Set(beforeCampaigns.map(item=>base.campanhas.find(value=>value.id===item.id)?.conta_id||item.conta_id||item.conta_sufixo).filter(Boolean));for(const oldSource of beforeManifest?.campanhas||[]){const account=accountForSource(oldSource,beforeByName.get(String(oldSource.nome_campanha_exato||'').toLocaleLowerCase('pt-BR')));if(account)seenAccounts.add(account)}
    const currentNames=new Set(manifestNames(manifest).map(name=>name.toLocaleLowerCase('pt-BR'))),pauseDate=manifestDate(manifest);for(const priorSource of beforeManifest?.campanhas||[]){const exact=String(priorSource.nome_campanha_exato||'').trim(),key=exact.toLocaleLowerCase('pt-BR');if(!exact||currentNames.has(key))continue;const campaign=base.campanhas.find(value=>String(value.nome_mcc||'').toLocaleLowerCase('pt-BR')===key);if(!campaign||campaign.status!=='pausada')continue;const accountId=accountForSource(priorSource,campaign),identity=productIdentity(priorSource,campaign,identityContext),qualification=qualificationStatus(priorSource)||campaign.status_qualificacao_observado||null,pauseReason=isRejectedQualification(qualification)?'reprovacao':null,snapshot=campaignSnapshot(base,priorSource,campaign,identity),previousOccurrences=[...(base.event_log||[]),...events].filter(event=>event.event_type==='campaign_pause_detected'&&event.campaign_id===campaign.id&&event.metadata?.observation_date===pauseDate).length,fingerprint=previousOccurrences?`${pauseDate}|${previousOccurrences+1}`:pauseDate;append('campaign_pause_detected',campaign.id,fingerprint,{test_id:identity.testId,product_id:identity.productId,product_name:identity.productName,account_id:accountId,campaign_id:campaign.id,iteration_id:campaign.id,campaign_name:exact,iteration_number:identity.iterationNumber,geo:explicitGeo(priorSource),source,snapshot,metadata:{identity_confidence:identity.confidence,observation_date:pauseDate,pause_label:pauseReason?'Pausada por reprovação':'Pausada',pause_reason:pauseReason,pause_detection_method:'ausencia_na_coleta_ativa',last_observed_qualification:qualification}})}
    for(const item of manifest?.campanhas||[]){const exact=String(item.nome_campanha_exato||'').trim();if(!exact)continue;const campaign=base.campanhas.find(value=>String(value.nome_mcc||'').toLocaleLowerCase('pt-BR')===exact.toLocaleLowerCase('pt-BR'));if(!campaign)continue;const accountId=accountForSource(item,campaign),identity=productIdentity(item,campaign,identityContext),geo=explicitGeo(item),snapshot=campaignSnapshot(base,item,campaign,identity),date=observationDate(item),common={test_id:identity.testId,product_id:identity.productId,product_name:identity.productName,account_id:accountId,campaign_id:campaign.id,iteration_id:campaign.id,campaign_name:exact,iteration_number:identity.iterationNumber,geo,source,snapshot,metadata:{identity_confidence:identity.confidence}},iterationEntity=`${campaign.id}|${identity.testId||`account:${accountId||'unknown'}`}`;
      if(!knownNames.has(exact.toLocaleLowerCase('pt-BR')))append('test_iteration_created',iterationEntity,'first-seen',{...common,metadata:{...common.metadata,first_seen_at:timestamp}});
      if(accountId&&!seenAccounts.has(accountId)){const accountPayload={...common,test_id:null,product_id:null,product_name:null,iteration_number:null,metadata:{identity_confidence:'account_observed_with_campaign',first_seen_at:timestamp}};append('account_first_seen',accountId,'first-seen',accountPayload);append('account_first_used',accountId,'first-used',accountPayload);seenAccounts.add(accountId)}
      const prior=beforeByName.get(exact.toLocaleLowerCase('pt-BR')),nextStatus=explicitCampaignStatus(item),priorStatus=prior?.estado_campanha_observado;if(priorStatus&&nextStatus&&normalizeProductKey(priorStatus)!==normalizeProductKey(nextStatus)){const observationDateValue=date||'unknown',transitionKey=`${campaign.id}|${observationDateValue}|${priorStatus}|${nextStatus}`;if(!processedStatusTransitions.has(transitionKey)){processedStatusTransitions.add(transitionKey);const previousOccurrences=[...(base.event_log||[]),...events].filter(event=>event.event_type==='campaign_status_changed'&&event.campaign_id===campaign.id&&event.metadata?.observation_date===date&&event.metadata?.from_status===priorStatus&&event.metadata?.to_status===nextStatus).length,baseFingerprint=`${observationDateValue}|${priorStatus}|${nextStatus}`,fingerprint=previousOccurrences?`${baseFingerprint}|${previousOccurrences+1}`:baseFingerprint;append('campaign_status_changed',campaign.id,fingerprint,{...common,metadata:{...common.metadata,from_status:priorStatus,to_status:nextStatus,observation_date:date}})}}
      const priorSignals=priorSignalsByCampaign.get(campaign.id),hasDeliveryEvent=(base.event_log||[]).some(event=>event.event_type==='campaign_delivery_started'&&event.campaign_id===campaign.id)||events.some(event=>event.event_type==='campaign_delivery_started'&&event.campaign_id===campaign.id);
      if(priorSignals?.noDelivery&&!priorSignals.delivered&&!hasDeliveryEvent){for(const period of['metricas_D_menos_1','metricas_D_zero']){const metrics=item[period];if(!metrics||metrics.presente===false)continue;const periodDate=metricValue(metrics.data);if(!periodDate)continue;const currentSignals=['impressoes','cliques_google','custo_total'].map(key=>Number(metricValue(metrics[key]))).filter(Number.isFinite),currentHasDelivery=currentSignals.some(value=>value>0);if(currentHasDelivery){append('campaign_delivery_started',campaign.id,periodDate,{...common,metadata:{...common.metadata,observation_date:periodDate,period:period==='metricas_D_zero'?'D_zero':'D_menos_1'}});break}}
      }
    }
    return events
  }
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
  function importManifest(baseInput,manifest,rowFactory,{overwrite=false,source='hub_manifest_import',trackEvents=true,confirmedDateChanges=[]}={}){
    const base=normalize(baseInput),beforeCampaigns=base.campanhas.map(clone),beforeDaily=base.diario.map(clone),beforeManifest=clone(base.manifesto_atual),beforeSnapshotNames=(base.snapshots_campanhas||[]).flatMap(item=>item.campanhas||[]),conflicts=[],previousStatus=new Map(base.campanhas.filter(x=>x.nome_mcc).map(x=>[x.nome_mcc.toLowerCase(),x.status]));
    const dateChanges=campaignDateChangeCandidates(base,manifest),confirmed=new Set(confirmedDateChanges.map(item=>`${item.campaignId}|${item.oldName}|${item.newName}`));if(dateChanges.some(item=>!confirmed.has(`${item.campaignId}|${item.oldName}|${item.newName}`))){const error=new Error('Há mudança de data no nome de campanha que precisa de confirmação.');error.code='CAMPAIGN_DATE_CHANGE_CONFIRMATION_REQUIRED';error.dateChanges=dateChanges;throw error}for(const item of dateChanges){const campaign=base.campanhas.find(value=>value.id===item.campaignId);campaign.nome_mcc_anteriores=[...new Set([...(campaign.nome_mcc_anteriores||[]),campaign.nome_mcc_anterior,item.oldName].filter(Boolean))];campaign.nome_mcc=item.newName;campaign.nome_mcc_anterior=item.oldName;campaign.nome_mcc_corrigido_em=new Date().toISOString();if(/^\d{1,2}[\/-]\d{1,2}\s*[–—-]/.test(item.newName))campaign.data_inicio_ano_inferido=new Date().getFullYear();previousStatus.set(item.newName.toLowerCase(),previousStatus.get(item.oldName.toLowerCase()))}
    const dailyIndex=new Map(base.diario.map(x=>[`${x.campanha_id}|${x.data}`,x]));
    for(const source of manifest?.campanhas||[]){
      const exact=source.nome_campanha_exato,campaign=ensureCampaign(base,{exactName:exact,sheetName:displayName(exact),status:'ativa',referenceDate:manifestDate(manifest)});
      const accountValues=[metricValue(source.metricas_D_zero?.conta),metricValue(source.metricas_D_menos_1?.conta)],suffix=accountValues.map(accountSuffix).find(Boolean),domain=accountValues.map(accountDomain).find(Boolean),fullId=sourceAccountId(source);
      if(fullId&&campaign.conta_id&&campaign.conta_id!==fullId)throw new Error(`A campanha “${exact}” já pertence a outra conta completa. A importação foi interrompida.`);
      if(fullId)campaign.conta_id=fullId;
      if(suffix&&!campaign.conta_sufixo)campaign.conta_sufixo=suffix;
      if(domain)campaign.conta_dominio=domain;
      const observedStatus=explicitCampaignStatus(source),observedQualification=qualificationStatus(source);
      if(observedStatus)campaign.estado_campanha_observado=observedStatus;
      if(observedQualification)campaign.status_qualificacao_observado=observedQualification;
      const made=rowFactory(source),rows=Array.isArray(made)?made:[made],pauseCutoff=pauseCutoffForImport(campaign,source,manifest);
      for(const row of rows.filter(Boolean)){
        const dateValue=row.date||source.metricas_D_menos_1?.data?.valor||manifest?.separacao_temporal?.D_menos_1?.datas_detectadas?.[0],date=normalizeManifestDate(dateValue);
        if(!date||pauseCutoff&&date>pauseCutoff)continue;
        const key=`${campaign.id}|${date}`,existing=base.diario.find(item=>item.campanha_id===campaign.id&&item.data===date)||dailyIndex.get(key);
        if(existing){existing.celulas=mergeCells(existing.celulas,row.cells,overwrite,conflicts,{campanha:campaign.nome_exibicao,data:date});if(!existing.fontes.includes('manifesto'))existing.fontes.push('manifesto');existing.periodos??=[];if(row.period&&!existing.periodos.includes(row.period))existing.periodos.push(row.period);dailyIndex.set(key,existing)}
        else{const record={campanha_id:campaign.id,data:date,celulas:clone(row.cells),fontes:['manifesto'],periodos:row.period?[row.period]:[]};base.diario.push(record);dailyIndex.set(key,record)}
      }
    }
    linkHistoricalAccounts(base,manifest);
    const reconciledSales=reconcileProvisionalSales(base);const mccBillingSales=buildMccBillingSales(base,manifest,conflicts,{overwrite});const movimentos=updateCampaignSnapshot(base,manifest,previousStatus,beforeManifest,dateChanges),observability=trackEvents?buildObservabilityEvents({base,beforeCampaigns,beforeDaily,beforeManifest,beforeSnapshotNames,manifest,source,dateChanges}):[];base.event_log=uniqueEvents([...base.event_log,...observability]);base.manifesto_atual=clone(manifest);base.importacoes.push({tipo:'manifesto',executada_em:new Date().toISOString(),registros:(manifest?.campanhas||[]).length,conflitos:conflicts.length,movimentos});base.atualizado_em=new Date().toISOString();return{base,conflicts,movimentos,events:observability,reconciledSales,mccBillingSales}
  }
  function dailyRows(baseInput,sheetName,campaignId=null){
    const base=normalize(baseInput),campaign=campaignId?base.campanhas.find(x=>x.id===campaignId):base.campanhas.find(x=>String(x.nome_exibicao||'').toLowerCase()===String(sheetName||'').toLowerCase());
    if(!campaign)return[];
    return base.diario.filter(x=>x.campanha_id===campaign.id).sort((a,b)=>a.data.localeCompare(b.data)).map((x,index)=>({index:index+1,cells:clone(x.celulas)}));
  }
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
    const sale={id:`sale_${idFor(dedupe).slice(4)}`,billing_sale_id:`manual-sale:${idFor(dedupe)}`,campanha_id:campaign.id,conta:campaign.conta_id||campaign.conta_sufixo||null,data:date,hora:String(input.hora||'').trim()||null,produto:String(input.produto||'').trim()||null,plataforma:String(input.plataforma||'').trim()||null,valor_brl:amount,pais_codigo:country,origem:String(input.origem||'FlowTracking').trim(),identificador_mascarado:String(input.identificador_mascarado||'').trim()||null,chave_duplicidade:dedupe,status:'provisoria',registrada_em:new Date().toISOString()};
    base.vendas_provisorias.push(sale);base.importacoes.push({tipo:'venda_provisoria',executada_em:sale.registrada_em,registros:1,conflitos:0});base.atualizado_em=sale.registrada_em;return{base,sale,duplicate:false};
  }
  function updateProvisionalSale(baseInput,input){
    const base=normalize(baseInput),sale=base.vendas_provisorias.find(item=>String(item.id)===String(input?.id)),campaign=base.campanhas.find(item=>item.id===input?.campanha_id),date=String(input?.data||'').trim(),parsedDate=new Date(`${date}T00:00:00Z`),amount=Number(input?.valor_brl),country=String(input?.pais_codigo||'').trim().toUpperCase(),dedupe=String(input?.chave_duplicidade||sale?.chave_duplicidade||'').trim().toLowerCase(),hour=String(input?.hora||'').trim(),product=String(input?.produto||'').trim(),platform=String(input?.plataforma||'').trim();
    if(!sale||sale.status==='cancelada')throw new Error('O lançamento provisório não está disponível para edição.');
    if(!campaign)throw new Error('Selecione uma campanha válida para o lançamento.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(parsedDate.getTime())||parsedDate.toISOString().slice(0,10)!==date)throw new Error('A data da venda não foi reconhecida.');
    if(!Number.isFinite(amount)||amount<=0)throw new Error('Informe um valor em reais maior que zero.');
    if(!/^[A-Z]{2}$/.test(country))throw new Error('Selecione um país válido.');
    if(hour&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hour))throw new Error('Informe a hora no formato HH:MM.');
    if(!product||!platform)throw new Error('Produto e plataforma são obrigatórios.');
    if(!dedupe)throw new Error('Não foi possível preservar a chave de prevenção de duplicidade.');
    if(base.vendas_provisorias.some(item=>item.id!==sale.id&&item.status!=='cancelada'&&item.chave_duplicidade===dedupe))throw new Error('A alteração corresponde a outro lançamento já registrado; nenhum dado foi alterado.');
    const now=new Date().toISOString();
    Object.assign(sale,{campanha_id:campaign.id,conta:campaign.conta_id||campaign.conta_sufixo||null,data:date,hora:hour||null,produto:product,plataforma:platform,valor_brl:amount,pais_codigo:country,chave_duplicidade:dedupe,editado_em:now});
    reconcileProvisionalSales(base);base.atualizado_em=now;return{base,sale};
  }
  function reconcileProvisionalSales(base){
    const official=new Map();for(const row of base.diario){if(!row.fontes?.includes('excel')&&!row.periodos?.includes('d1'))continue;const key=`${row.campanha_id}|${row.data}`,count=Math.max(0,Math.floor(Number(row.celulas?.F?.value)||0)),current=official.get(key)||{count:0,source:null};official.set(key,{count:current.count+count,source:row.periodos?.includes('d1')?'mcc_d1':current.source||'excel_legacy'})}
    const groups=new Map();for(const sale of base.vendas_provisorias.filter(x=>x.status!=='cancelada')){const key=`${sale.campanha_id}|${sale.data}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(sale)}
    const reconciledAt=new Date().toISOString(),changed=[];for(const [key,sales] of groups){sales.sort((a,b)=>String(a.registrada_em||'').localeCompare(String(b.registrada_em||'')));const evidence=official.get(key)||{count:0,source:null},confirmed=Math.min(sales.length,evidence.count);sales.forEach((sale,index)=>{const wasConfirmed=sale.status==='conciliada';if(index<confirmed){if(!wasConfirmed||sale.conciliacao_origem!==evidence.source){sale.status='conciliada';sale.conciliada_em??=reconciledAt;sale.conciliacao_origem=evidence.source;changed.push(clone(sale))}}else if(wasConfirmed){sale.status='provisoria';delete sale.conciliada_em;delete sale.conciliacao_origem;changed.push(clone(sale))}})}return changed;
  }
  function buildMccBillingSales(base,manifest,conflicts,{overwrite=false}={}){
    const campaigns=new Map(base.campanhas.map(item=>[String(item.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'),item])),manualCounts=new Map();
    for(const sale of base.vendas_provisorias||[]){if(sale.status==='cancelada')continue;const key=`${sale.campanha_id}|${sale.data}`;manualCounts.set(key,(manualCounts.get(key)||0)+1)}
    const updates=new Map(),periods=[['d0','metricas_D_zero','D_zero'],['d1','metricas_D_menos_1','D_menos_1']];
    for(const source of manifest?.campanhas||[]){const campaign=campaigns.get(String(source?.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR'));if(!campaign)continue;
      for(const[period,field,temporalKey]of periods){const metrics=source[field];if(!metrics||metrics.presente===false)continue;const detected=manifest?.separacao_temporal?.[temporalKey]?.datas_detectadas?.[0],date=normalizeManifestDate(metrics.data,detected),rawConversions=metricValue(metrics.conversoes);if(!date||rawConversions==null)continue;const conversions=Number(rawConversions);if(!Number.isFinite(conversions)||conversions<0)continue;
        const blocked=!overwrite&&conflicts.some(item=>item.campanha===campaign.nome_exibicao&&item.data===date&&['F','P'].includes(item.coluna));if(blocked)continue;
        const key=`${campaign.id}|${date}`,manualCount=manualCounts.get(key)||0,residual=Math.max(0,conversions-manualCount),rawValue=metricValue(metrics.valor_conversao)??metricValue(metrics.comissao_recebida),parsedValue=rawValue==null?null:Number(rawValue),validValue=Number.isFinite(parsedValue)&&parsedValue>=0?parsedValue:null,currency=String(metricValue(metrics.moeda)||'').trim().toUpperCase(),canAttributeValue=manualCount===0&&residual>0&&validValue!=null;
        const confirmationStatus=residual>0?(period==='d1'?'confirmed':'provisional'):conversions>0&&manualCount>0?'represented_by_manual':'not_confirmed',saleId=`mcc-conversion:${campaign.id}:${date}`;
        const amountFields={value_brl:canAttributeValue&&currency==='BRL'?validValue:null,value_usd:canAttributeValue&&currency==='USD'?validValue:null};
        const note=manualCount&&residual>0?`A MCC informou ${conversions} conversão(ões); ${manualCount} já coberta(s) por lançamento(s) manual(is). O valor agregado não foi dividido para evitar duplicidade.`:residual>0?`Agregado MCC: ${residual} conversão(ões). Valor informado não significa recebimento confirmado.`:conversions>0&&manualCount>0?'As conversões MCC desta campanha/data já estão cobertas por lançamento(s) manual(is).':`A importação ${period==='d1'?'D−1':'D0'} não confirmou conversões para esta campanha/data.`;
        const sale={sale_id:saleId,sale_date:date,platform:'Google Ads MCC',product:campaign.nome_exibicao||campaign.nome_mcc,commission_type:'Valor de conversão MCC',account:accountForSource(source,campaign)||'',...amountFields,payment_status:'pending',observed_payment_status:'pending',confirmation_status:confirmationStatus,confirmation_source:period==='d1'?'MCC D−1':'MCC D0',confirmed_at:period==='d1'?new Date().toISOString():null,campaign_id:campaign.id,conversion_count:residual,source:'mcc_conversion_aggregate',source_ref:key,source_period:period,notes:note,active:residual>0};
        const previous=updates.get(key);if(!previous||period==='d1'||previous.source_period!=='d1')updates.set(key,sale);
      }
    }
    return[...updates.values()];
  }
  function mccBillingSalesFromDiary(baseInput,{manifestOnly=false}={}){
    const base=normalize(baseInput),campaigns=new Map(base.campanhas.map(item=>[item.id,item])),campaignsByName=new Map(base.campanhas.map(item=>[String(item.nome_mcc||'').trim().toLocaleLowerCase('pt-BR'),item])),manualCounts=new Map(),updates=new Map();
    let eligibleKeys=null;
    if(manifestOnly){eligibleKeys=new Map();const temporal=base.manifesto_atual?.separacao_temporal||{};for(const source of base.manifesto_atual?.campanhas||[]){const campaign=campaignsByName.get(String(source?.nome_campanha_exato||'').trim().toLocaleLowerCase('pt-BR'));if(!campaign)continue;for(const[period,field,temporalKey]of[['d0','metricas_D_zero','D_zero'],['d1','metricas_D_menos_1','D_menos_1']]){const metrics=source[field],rawConversions=metricValue(metrics?.conversoes);if(!metrics||metrics.presente===false||rawConversions==null||!Number.isFinite(Number(rawConversions)))continue;const date=normalizeManifestDate(metrics.data,temporal[temporalKey]?.datas_detectadas?.[0]);if(date){const rawValue=metricValue(metrics.valor_conversao)??metricValue(metrics.comissao_recebida),value=rawValue==null?null:Number(rawValue),key=`${campaign.id}|${date}`,previous=eligibleKeys.get(key);if(!previous||period==='d1')eligibleKeys.set(key,{period,conversions:Number(rawConversions),value:Number.isFinite(value)&&value>=0?value:null})}}}}
    for(const sale of base.vendas_provisorias||[]){if(sale.status==='cancelada')continue;const key=`${sale.campanha_id}|${sale.data}`;manualCounts.set(key,(manualCounts.get(key)||0)+1)}
    for(const row of base.diario||[]){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(row.data||'')))continue;const campaign=campaigns.get(row.campanha_id);if(!campaign?.nome_mcc)continue;const key=`${campaign.id}|${row.data}`,manifestExpected=eligibleKeys?.get(key),temporal=base.manifesto_atual?.separacao_temporal||{},rowConversions=Number(row.celulas?.F?.value),d1Date=normalizeManifestDate(null,temporal.D_menos_1?.datas_detectadas?.[0]),d0Date=normalizeManifestDate(null,temporal.D_zero?.datas_detectadas?.[0]),periodicFallback=manifestOnly&&rowConversions>0?(row.data===d1Date?'d1':row.data===d0Date?'d0':null):null,expected=manifestExpected||(periodicFallback?{period:periodicFallback,conversions:rowConversions,value:null}:null);if(manifestOnly&&!expected)continue;let period=expected?.period||(row.periodos?.includes('d1')?'d1':row.periodos?.includes('d0')?'d0':null);if(!period)continue;if(manifestExpected){const diaryValue=row.celulas?.P?.value,validDiaryValue=diaryValue!=null&&diaryValue!==''&&Number.isFinite(Number(diaryValue));if(Number(row.celulas?.F?.value)!==manifestExpected.conversions||(manifestExpected.value!=null&&(!validDiaryValue||Number(diaryValue)!==manifestExpected.value)))continue}const conversions=Number(row.celulas?.F?.value);if(!Number.isFinite(conversions)||conversions<0||(conversions===0&&period!=='d1'))continue;
      const manualCount=manualCounts.get(key)||0,residual=Math.max(0,conversions-manualCount),rawValue=row.celulas?.P?.value,parsedValue=rawValue==null||rawValue===''?null:Number(rawValue),validValue=Number.isFinite(parsedValue)&&parsedValue>=0?parsedValue:null,canAttributeValue=manualCount===0&&residual>0&&validValue!=null,confirmationStatus=residual>0?(period==='d1'?'confirmed':'provisional'):conversions>0&&manualCount>0?'represented_by_manual':'not_confirmed',saleId=`mcc-conversion:${campaign.id}:${row.data}`;
      const note=manualCount&&residual>0?`O Diário MCC informa ${conversions} conversão(ões); ${manualCount} já coberta(s) por lançamento(s) manual(is). O valor agregado não foi dividido para evitar duplicidade.`:residual>0?`Agregado recuperado do Diário MCC: ${residual} conversão(ões). Valor informado não significa recebimento confirmado.`:manualCount>0&&conversions>0?'As conversões MCC desta campanha/data já estão cobertas por lançamento(s) manual(is).':period==='d1'?'A importação D−1 não confirmou conversões para esta campanha/data.':'O Diário MCC não confirma conversões para esta campanha/data.';
      const sale={sale_id:saleId,sale_date:row.data,platform:'Google Ads MCC',product:campaign.nome_exibicao||campaign.nome_mcc,commission_type:'Valor de conversão MCC',account:campaign.conta_id||campaign.conta_sufixo||'',value_brl:canAttributeValue?validValue:null,value_usd:null,payment_status:'pending',observed_payment_status:'pending',confirmation_status:confirmationStatus,confirmation_source:period==='d1'?'MCC D−1':'MCC D0',confirmed_at:period==='d1'?new Date().toISOString():null,campaign_id:campaign.id,conversion_count:residual,source:'mcc_conversion_aggregate',source_ref:key,source_period:period,notes:note,active:residual>0};
      const previous=updates.get(key);if(!previous||period==='d1'||previous.source_period!=='d1')updates.set(key,sale)
    }
    return[...updates.values()]
  }
  function mccBillingSalesFromManifest(baseInput){const base=normalize(baseInput);return buildMccBillingSales(base,base.manifesto_atual,[],{overwrite:true})}
  function salesAdjustmentMap(baseInput){
    const base=normalize(baseInput),official=new Map(),groups=new Map();
    for(const row of base.diario){const key=`${row.campanha_id}|${row.data}`,entry=official.get(key)||{conversions:0,commission:0};entry.conversions+=Number(row.celulas?.F?.value)||0;entry.commission+=Number(row.celulas?.P?.value)||0;official.set(key,entry)}
    for(const sale of base.vendas_provisorias.filter(x=>x.status==='provisoria'||!x.status)){const key=`${sale.campanha_id}|${sale.data}`,group=groups.get(key)||{campaignId:sale.campanha_id,date:sale.data,sales:[],amount:0,countries:new Set()};group.sales.push(sale);group.amount+=Number(sale.valor_brl)||0;if(sale.pais_codigo)group.countries.add(sale.pais_codigo);groups.set(key,group)}
    const map=new Map();
    for(const [key,group] of groups){const seen=official.get(key)||{conversions:0,commission:0},confirmed=Math.min(group.sales.length,Math.max(0,Math.floor(seen.conversions))),pendingSales=group.sales.slice(confirmed),pendingConversions=pendingSales.length,pendingAmount=pendingSales.reduce((sum,sale)=>sum+(Number(sale.valor_brl)||0),0),commissionAdjustment=confirmed?pendingAmount:Math.max(0,pendingAmount-seen.commission),summary=map.get(group.campaignId)||{pendingConversions:0,commissionAdjustment:0,sales:0,manualSales:0,countries:new Set(),byDate:{}};summary.pendingConversions+=pendingConversions;summary.commissionAdjustment+=commissionAdjustment;summary.sales+=pendingConversions;summary.manualSales+=group.sales.length;for(const sale of group.sales)if(sale.pais_codigo)summary.countries.add(sale.pais_codigo);summary.byDate[group.date]={pendingConversions,commissionAdjustment,sales:pendingConversions,manualSales:group.sales.length,countries:[...new Set(group.sales.map(x=>x.pais_codigo).filter(Boolean))],productSales:pendingSales.map(sale=>{const amount=Number(sale.valor_brl);return{product:String(sale.produto||'').trim()||null,amount:Number.isFinite(amount)?amount:null}})};map.set(group.campaignId,summary)}
    return map;
  }
  window.CampaignDatabase={SCHEMA,create,normalize,mergeEventLogs,importWorkbook,importManifest,manifestOperationalStates,campaignNumberReuseIssues,campaignNumberHistoryWarnings,campaignDateChangeCandidates,setCampaignStartDate,setCampaignMinimumRoi,reconcileCampaignSnapshots,dailyRows,campaignTotalsMap,consecutiveZeroImpressionDays,investmentTotalsMap,operationalMap,accountDomain,addProvisionalSale,updateProvisionalSale,mccBillingSalesFromDiary,mccBillingSalesFromManifest,salesAdjustmentMap};
})();
