(function(global){
  // Manual text never replaces source cell Q, which also informs campaign policy.
  function observationFor(base,campaignId,date){
    return (base?.observacoes_diario||[]).find(item=>String(item.campanha_id)===String(campaignId)&&item.data===date)||null;
  }
  function saveObservation(base,{campaignId,date,text,expectedRevision},now=new Date().toISOString()){
    if(!base||base.campanhas?.filter(item=>item.id===campaignId).length!==1)throw new Error('Campanha não identificada na base local.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Data do diário inválida.');
    if(typeof text!=='string'||text.length>10000)throw new Error('A observação deve ter até 10.000 caracteres.');
    const previous=observationFor(base,campaignId,date),revision=previous?.revisao||0;
    if(!Number.isInteger(expectedRevision)||expectedRevision!==revision)throw new Error('Esta observação mudou em outra janela. Feche e reabra a edição antes de salvar.');
    if(previous?.texto===text)return base;
    const updated=structuredClone(base),record={campanha_id:campaignId,data:date,texto:text,revisao:revision+1,atualizado_em:now,historico:[...(previous?.historico||[]),...(previous?[{texto:previous.texto,revisao:revision,atualizado_em:previous.atualizado_em}]:[])],eventos:[...(previous?.eventos||[])]};
    updated.observacoes_diario=(updated.observacoes_diario||[]).filter(item=>String(item.campanha_id)!==String(campaignId)||item.data!==date);
    updated.observacoes_diario.push(record);updated.atualizado_em=now;
    return updated;
  }
  function campaignDateForInstant(value){const instant=new Date(value);if(!value||!Number.isFinite(instant.getTime()))throw new Error('Horário do evento inválido.');const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant),part=type=>parts.find(item=>item.type===type)?.value||'';return`${part('year')}-${part('month')}-${part('day')}`}
  function hasAutomaticPauseEvent(base,campaignId){return(base?.observacoes_diario||[]).some(item=>String(item.campanha_id)===String(campaignId)&&(item.eventos||[]).some(event=>event?.tipo==='google_ads_auto_pause'))}
  function automaticPauseCampaignIds(base){
    const ids=new Set();
    for(const item of base?.observacoes_diario||[])if((item.eventos||[]).some(event=>event?.tipo==='google_ads_auto_pause'))ids.add(String(item.campanha_id));
    return(base?.campanhas||[]).filter(campaign=>ids.has(String(campaign.id))).map(campaign=>String(campaign.id));
  }
  function listAutomaticPauseEvents(base){
    const knownRules=['negative_remaining','product_performance','minimum_product_performance','reference_competitor','campaign_age','campaign_zero_impressions','clicks_without_sale'],campaigns=new Map((base?.campanhas||[]).map(campaign=>[String(campaign.id),campaign])),confirmedHistoryById=new Map(),byId=new Map();
    for(const history of base?.google_ads_api_change_history||[]){
      if(history?.eventType!=='automatic_pause'||history?.status!=='completed'||typeof history.completedAtUtc!=='string'||!Number.isFinite(Date.parse(history.completedAtUtc)))continue;
      const changes=(history.changes||[]).filter(change=>String(change?.campaignInternalId||'')&&Array.isArray(change?.fields)&&change.fields.some(field=>field?.key==='campaignStatus'&&String(field.before||'').toUpperCase()==='ENABLED'&&String(field.after||'').toUpperCase()==='PAUSED'));
      if(changes.length!==1)continue;
      const change=changes[0],id=String(history.id||'');if(!id||!id.startsWith(`google-ads-auto-pause:${change.campaignInternalId}:`))continue;
      confirmedHistoryById.set(id,{history,change,occurredAtUtc:new Date(history.completedAtUtc).toISOString()});
    }
    for(const observation of base?.observacoes_diario||[])for(const event of observation.eventos||[]){
      if(event?.tipo!=='google_ads_auto_pause'||typeof event.ocorrido_em_utc!=='string'||!Number.isFinite(Date.parse(event.ocorrido_em_utc)))continue;
      const campaignId=String(observation.campanha_id||''),campaign=campaigns.get(campaignId),occurredAtUtc=new Date(event.ocorrido_em_utc).toISOString(),id=String(event.id||`${campaignId}:${occurredAtUtc}`),correlationId=String(event.id||`google-ads-auto-pause:${campaignId}:${occurredAtUtc}`),confirmed=confirmedHistoryById.get(correlationId),change=confirmed?.change;
      if(byId.has(id))continue;
      if(confirmed?.occurredAtUtc!==occurredAtUtc||String(change?.campaignInternalId||'')!==campaignId)confirmedHistoryById.delete(correlationId);
      const exactChange=confirmedHistoryById.get(correlationId)?.change,rule=knownRules.includes(event.regra)?event.regra:knownRules.includes(exactChange?.rule)?exactChange.rule:'',reason=String(exactChange?.reason||'').trim();
      byId.set(id,{id,campaignId,campaignName:String(campaign?.nome_campanha_exato||campaign?.nome_mcc||campaign?.nome_exibicao||''),occurredAtUtc,rule,...(reason&&reason!=='Regra de pausa automática'?{reason}:{}),...(Number.isSafeInteger(event.limite_dias)&&event.limite_dias>0?{thresholdDays:event.limite_dias}:Number.isSafeInteger(exactChange?.thresholdDays)&&exactChange.thresholdDays>0?{thresholdDays:exactChange.thresholdDays}:{}),...(Number.isSafeInteger(event.limite_impressoes)&&event.limite_impressoes>=0?{maxImpressions:event.limite_impressoes}:Number.isSafeInteger(exactChange?.maxImpressions)&&exactChange.maxImpressions>=0?{maxImpressions:exactChange.maxImpressions}:{}),...(Number.isSafeInteger(event.limite_cliques)&&event.limite_cliques>=0?{thresholdClicks:event.limite_cliques}:Number.isSafeInteger(exactChange?.thresholdClicks)&&exactChange.thresholdClicks>=0?{thresholdClicks:exactChange.thresholdClicks}:{})});
    }
    return[...byId.values()].sort((a,b)=>Date.parse(b.occurredAtUtc)-Date.parse(a.occurredAtUtc));
  }
  function validIsoDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date}
  function appendEvent(base,storedCampaignId,date,event,now){
    const previous=observationFor(base,storedCampaignId,date);
    if((previous?.eventos||[]).some(item=>item?.id===event.id))return base;
    const updated=structuredClone(base),record=previous?{...previous,eventos:[...(previous.eventos||[]),event],atualizado_em:now}:{campanha_id:storedCampaignId,data:date,texto:'',revisao:0,atualizado_em:now,historico:[],eventos:[event]};
    updated.observacoes_diario=(updated.observacoes_diario||[]).filter(item=>String(item.campanha_id)!==String(storedCampaignId)||item.data!==date);updated.observacoes_diario.push(record);updated.atualizado_em=now;
    return updated;
  }
  function appendAutomaticPauseEvent(base,{campaignId,occurredAtUtc,rule,thresholdDays,maxImpressions,thresholdClicks},now=new Date().toISOString()){
    const matchingCampaigns=(base?.campanhas||[]).filter(item=>String(item.id)===String(campaignId));
    if(matchingCampaigns.length!==1)throw new Error('Campanha não identificada na base local.');
    const storedCampaignId=matchingCampaigns[0].id;
    const instant=new Date(occurredAtUtc);if(!occurredAtUtc||!Number.isFinite(instant.getTime()))throw new Error('Horário do evento de pausa inválido.');
    const confirmedAtUtc=instant.toISOString(),date=campaignDateForInstant(confirmedAtUtc),previous=observationFor(base,storedCampaignId,date),eventId=`google-ads-auto-pause:${storedCampaignId}:${confirmedAtUtc}`;
    const knownRules=['negative_remaining','product_performance','minimum_product_performance','reference_competitor','campaign_age','campaign_zero_impressions','clicks_without_sale'],existing=(previous?.eventos||[]).find(event=>event?.id===eventId&&event?.tipo==='google_ads_auto_pause');
    if(existing){
      const effectiveRule=existing.regra||(knownRules.includes(rule)?rule:''),additions={};
      if(!existing.regra&&knownRules.includes(rule))additions.regra=rule;
      if(effectiveRule==='clicks_without_sale'&&existing.limite_cliques==null&&Number.isSafeInteger(thresholdClicks)&&thresholdClicks>=0&&thresholdClicks<=99)additions.limite_cliques=thresholdClicks;
      if(effectiveRule==='campaign_age'&&existing.limite_dias==null&&Number.isSafeInteger(thresholdDays)&&thresholdDays>0)additions.limite_dias=thresholdDays;
      if(effectiveRule==='campaign_age'&&existing.limite_impressoes==null&&Number.isSafeInteger(maxImpressions)&&maxImpressions>=0)additions.limite_impressoes=maxImpressions;
      if(!Object.keys(additions).length)return base;
      const updated=structuredClone(base),observation=observationFor(updated,storedCampaignId,date),event=observation?.eventos?.find(item=>item?.id===eventId&&item?.tipo==='google_ads_auto_pause');
      if(!event)return base;
      Object.assign(event,additions);observation.atualizado_em=now;updated.atualizado_em=now;return updated;
    }
    const event={id:eventId,tipo:'google_ads_auto_pause',ocorrido_em_utc:confirmedAtUtc};if(knownRules.includes(rule))event.regra=rule;if(rule==='clicks_without_sale'&&Number.isSafeInteger(thresholdClicks)&&thresholdClicks>=0&&thresholdClicks<=99)event.limite_cliques=thresholdClicks;if(rule==='campaign_age'&&Number.isSafeInteger(thresholdDays)&&thresholdDays>0)event.limite_dias=thresholdDays;if(rule==='campaign_age'&&Number.isSafeInteger(maxImpressions)&&maxImpressions>=0)event.limite_impressoes=maxImpressions;
    return appendEvent(base,storedCampaignId,date,event,now);
  }
  function appendObservedAutomaticPauseEvent(base,{campaignId,observedFromUtc,observedToUtc,captureRecordId},now=new Date().toISOString()){
    const matchingCampaigns=(base?.campanhas||[]).filter(item=>String(item.id)===String(campaignId));
    if(matchingCampaigns.length!==1)throw new Error('Campanha não identificada na base local.');
    const from=new Date(observedFromUtc),to=new Date(observedToUtc),recorded=new Date(now),captureId=String(captureRecordId||'').trim();
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to||!captureId||!Number.isFinite(recorded.getTime()))throw new Error('A observação da pausa não tem intervalo ou captura válida.');
    const storedCampaignId=matchingCampaigns[0].id,date=campaignDateForInstant(to.toISOString()),eventId=`google-ads-auto-pause-observed:${storedCampaignId}:${captureId}`,previous=observationFor(base,storedCampaignId,date);
    if((previous?.eventos||[]).some(event=>event?.id===eventId))return base;
    return appendEvent(base,storedCampaignId,date,{id:eventId,tipo:'google_ads_auto_pause_observed',observado_de_utc:from.toISOString(),observado_ate_utc:to.toISOString(),capture_id:captureId,relatado_pelo_usuario:true},recorded.toISOString());
  }
  function appendCpaAdjustmentEvent(base,{campaignId,verifiedAtUtc,timeSource='google_ads_api',direction,previousTargetCpaMicros,targetCpaMicros,commissionTargetCents,currencyCode,stepPercentagePoints=2},now=new Date().toISOString()){
    const matchingCampaigns=(base?.campanhas||[]).filter(item=>String(item.id)===String(campaignId));
    if(matchingCampaigns.length!==1)throw new Error('Campanha não identificada na base local.');
    const instant=new Date(verifiedAtUtc),recorded=new Date(now),previousMicros=safeInteger(previousTargetCpaMicros),nextMicros=safeInteger(targetCpaMicros),commissionCents=safeInteger(commissionTargetCents),currency=String(currencyCode||'').toUpperCase();
    if(!Number.isFinite(instant.getTime())||!Number.isFinite(recorded.getTime())||previousMicros==null||previousMicros<=0||nextMicros==null||nextMicros<=0||commissionCents==null||commissionCents<=0||!/^([A-Z]{3})$/.test(currency)||!['increase','decrease'].includes(direction)||![2,4].includes(stepPercentagePoints)||(direction==='increase'?nextMicros<=previousMicros:nextMicros>=previousMicros))throw new Error('A confirmação do ajuste de CPA não contém valores válidos para o Diário.');
    const storedCampaignId=matchingCampaigns[0].id,occurredAtUtc=instant.toISOString(),date=campaignDateForInstant(occurredAtUtc),eventId=`google-ads-cpa-adjustment:${storedCampaignId}:${occurredAtUtc}:${previousMicros}:${nextMicros}${stepPercentagePoints===2?'':':4'}`,denominator=commissionCents*10_000;
    if(!Number.isSafeInteger(denominator)||denominator<=0)throw new Error('A comissão usada para registrar o ajuste de CPA é inválida.');
    const event={id:eventId,tipo:'google_ads_cpa_adjustment',ocorrido_em_utc:occurredAtUtc,origem_horario:timeSource==='google_ads_api'?'google_ads_api':'confirmacao_hub',direcao:direction,valor_anterior_micros:String(previousMicros),valor_novo_micros:String(nextMicros),comissao_total_centavos:commissionCents,moeda:currency,percentual_anterior:previousMicros/denominator*100,percentual_novo:nextMicros/denominator*100,passo_pontos_percentuais:stepPercentagePoints};
    return appendEvent(base,storedCampaignId,date,event,recorded.toISOString());
  }
  function appendBudgetAdjustmentEvent(base,{campaignId,verifiedAtUtc,direction,previousBudgetAmountMicros,budgetAmountMicros,currencyCode,percentage=5},now=new Date().toISOString()){
    const matchingCampaigns=(base?.campanhas||[]).filter(item=>String(item.id)===String(campaignId));
    if(matchingCampaigns.length!==1)throw new Error('Campanha não identificada na base local.');
    const instant=new Date(verifiedAtUtc),recorded=new Date(now),previousMicros=safeInteger(previousBudgetAmountMicros),nextMicros=safeInteger(budgetAmountMicros),currency=String(currencyCode||'').toUpperCase(),preview=global.ProductDiaryBudgetAdjustmentDomain?.createPreview({budgetAmountMicros:previousMicros,currencyCode:currency},direction,percentage);
    if(!Number.isFinite(instant.getTime())||!Number.isFinite(recorded.getTime())||previousMicros==null||nextMicros==null||!/^([A-Z]{3})$/.test(currency)||!['increase','decrease'].includes(direction)||![5,10].includes(percentage)||!preview||preview.targetBudgetMicros!==nextMicros)throw new Error('A confirmação do ajuste de orçamento não contém valores válidos para o Diário.');
    const storedCampaignId=matchingCampaigns[0].id,occurredAtUtc=instant.toISOString(),date=campaignDateForInstant(occurredAtUtc),eventId=`google-ads-budget-adjustment:${storedCampaignId}:${occurredAtUtc}:${previousMicros}:${nextMicros}`;
    const event={id:eventId,tipo:'google_ads_budget_adjustment',ocorrido_em_utc:occurredAtUtc,origem_horario:'google_ads_api',direcao:direction,orcamento_anterior_micros:String(previousMicros),orcamento_novo_micros:String(nextMicros),moeda:currency,percentual_ajuste:percentage};
    return appendEvent(base,storedCampaignId,date,event,recorded.toISOString());
  }
  function appendSearchTermsAnalysisEvent(base,{campaignId,occurredAtUtc},now=new Date().toISOString()){
    const matchingCampaigns=(base?.campanhas||[]).filter(item=>String(item.id)===String(campaignId));
    if(matchingCampaigns.length!==1)throw new Error('Campanha não identificada na base local.');
    const instant=new Date(occurredAtUtc),recorded=new Date(now);
    if(!Number.isFinite(instant.getTime())||!Number.isFinite(recorded.getTime()))throw new Error('Horário da análise de termos inválido.');
    const storedCampaignId=matchingCampaigns[0].id,occurredAt=instant.toISOString(),date=campaignDateForInstant(occurredAt),eventId=`google-ads-search-terms-analysis:${storedCampaignId}:${occurredAt}`;
    return appendEvent(base,storedCampaignId,date,{id:eventId,tipo:'google_ads_search_terms_analysis',acao:'review_search_terms',ocorrido_em_utc:occurredAt},recorded.toISOString());
  }
  function appendCampaignListOpenedEvent(base,{campaignId,occurredAtUtc},now=new Date().toISOString()){
    const matchingCampaigns=(base?.campanhas||[]).filter(item=>String(item.id)===String(campaignId));
    if(matchingCampaigns.length!==1)throw new Error('Campanha não identificada na base local.');
    const instant=new Date(occurredAtUtc),recorded=new Date(now);
    if(!Number.isFinite(instant.getTime())||!Number.isFinite(recorded.getTime()))throw new Error('Horário da abertura da lista inválido.');
    const storedCampaignId=matchingCampaigns[0].id,occurredAt=instant.toISOString(),date=campaignDateForInstant(occurredAt),eventId=`google-ads-campaign-list-opened:${storedCampaignId}:${occurredAt}`;
    return appendEvent(base,storedCampaignId,date,{id:eventId,tipo:'google_ads_campaign_list_opened',acao:'open_account_campaign_list',ocorrido_em_utc:occurredAt},recorded.toISOString());
  }
  function appendCampaignKeywordAddedEvent(base,{campaignId,term,matchType,kind,source='search_terms',occurredAtUtc},now=new Date().toISOString()){
    const matches=(base?.campanhas||[]).filter(item=>String(item.id)===String(campaignId));if(matches.length!==1)throw new Error('Campanha não identificada na base local.');
    const keyword=String(term||'').trim().replace(/\s+/g,' '),match=String(matchType||'').toUpperCase(),keywordKind=String(kind||''),origin=String(source||''),instant=new Date(occurredAtUtc),recorded=new Date(now);
    if(!keyword||Array.from(keyword).length>80||!['BROAD','PHRASE','EXACT'].includes(match)||!['positive','negative'].includes(keywordKind)||!['search_terms','search_terms_observed','campaign_creation'].includes(origin)||!Number.isFinite(instant.getTime())||!Number.isFinite(recorded.getTime()))throw new Error('O registro da palavra-chave não contém dados válidos.');
    const storedCampaignId=matches[0].id;
    if(origin==='search_terms_observed'&&(base?.observacoes_diario||[]).some(item=>String(item.campanha_id)===String(storedCampaignId)&&(item.eventos||[]).some(event=>event?.tipo==='google_ads_campaign_keyword_added'&&event.kind===keywordKind&&String(event.term||'').trim().replace(/\s+/g,' ').toLocaleLowerCase()===keyword.toLocaleLowerCase()&&event.match_type===match)))return base;
    const occurredAt=instant.toISOString(),date=campaignDateForInstant(occurredAt),eventId=`google-ads-keyword-added:${storedCampaignId}:${keywordKind}:${encodeURIComponent(keyword)}:${match}:${occurredAt}`;
    return appendEvent(base,storedCampaignId,date,{id:eventId,tipo:'google_ads_campaign_keyword_added',kind:keywordKind,term:keyword,match_type:match,source:origin,ocorrido_em_utc:occurredAt},recorded.toISOString());
  }
  function latestVerifiedBudgetAdjustment(input,observations=[]){
    if(!input||typeof input!=='object')return input;
    const currency=String(input.currencyCode||'').toUpperCase(),capturedAt=Date.parse(input.observedAtUtc||'');
    if(!/^[A-Z]{3}$/.test(currency))return input;
    let latest=null,latestAt=-Infinity;
    for(const observation of Array.isArray(observations)?observations:[])for(const event of Array.isArray(observation?.eventos)?observation.eventos:[]){
      if(event?.tipo!=='google_ads_budget_adjustment'||event.origem_horario!=='google_ads_api'||String(event.moeda||'').toUpperCase()!==currency)continue;
      const occurredAt=Date.parse(event.ocorrido_em_utc||''),amount=safeInteger(event.orcamento_novo_micros);
      if(!Number.isFinite(occurredAt)||amount==null||amount<=0)continue;
      if(occurredAt>latestAt){latest=event;latestAt=occurredAt}
    }
    if(!latest||Number.isFinite(capturedAt)&&latestAt<=capturedAt)return input;
    return{...input,budgetAmountMicros:String(safeInteger(latest.orcamento_novo_micros)),observedAtUtc:new Date(latestAt).toISOString()};
  }
  function campaignAnalysisIndicators(base){
    const campaignIds=new Set((base?.campanhas||[]).map(campaign=>String(campaign.id))),latestByCampaign=new Map();
    for(const observation of base?.observacoes_diario||[])for(const event of observation.eventos||[]){
      const campaignId=String(observation.campanha_id||''),instant=new Date(event?.ocorrido_em_utc||'');
      if(!campaignIds.has(campaignId)||!Number.isFinite(instant.getTime()))continue;
      let action='';
      if(event.tipo==='google_ads_search_terms_analysis'&&event.acao==='review_search_terms')action='Avaliação de termos de pesquisa';
      else if(event.tipo==='google_ads_campaign_list_opened'&&event.acao==='open_account_campaign_list')action='Listagem de campanhas da conta aberta';
      else if(event.tipo==='google_ads_cpa_adjustment'&&['increase','decrease'].includes(event.direcao)){
        const previous=safeInteger(event.valor_anterior_micros),next=safeInteger(event.valor_novo_micros),commission=safeInteger(event.comissao_total_centavos),currency=String(event.moeda||'').toUpperCase();
        const step=event.passo_pontos_percentuais==null?2:event.passo_pontos_percentuais;
        if(previous==null||previous<=0||next==null||next<=0||commission==null||commission<=0||!/^([A-Z]{3})$/.test(currency)||![2,4].includes(step)||(event.direcao==='increase'?next<=previous:next>=previous))continue;
        action=event.direcao==='increase'?`CPA aumentado em ${step}%`:`CPA reduzido em ${step}%`;
      }
      else if(event.tipo==='google_ads_budget_adjustment'&&['increase','decrease'].includes(event.direcao)){
        const percentage=event.percentual_ajuste==null?5:event.percentual_ajuste,previous=safeInteger(event.orcamento_anterior_micros),next=safeInteger(event.orcamento_novo_micros),currency=String(event.moeda||'').toUpperCase(),preview=global.ProductDiaryBudgetAdjustmentDomain?.createPreview({budgetAmountMicros:previous,currencyCode:currency},event.direcao,percentage);
        if(previous==null||next==null||!/^([A-Z]{3})$/.test(currency)||![5,10].includes(percentage)||!preview||preview.targetBudgetMicros!==next)continue;
        action=event.direcao==='increase'?`Orçamento diário aumentado em ${percentage}%`:`Orçamento diário reduzido em ${percentage}%`;
      }
      if(!action)continue;
      const occurredAtUtc=instant.toISOString(),current=latestByCampaign.get(campaignId);
      if(!current||Date.parse(occurredAtUtc)>Date.parse(current.occurredAtUtc)||(occurredAtUtc===current.occurredAtUtc&&String(event.id||'')>current.eventId))latestByCampaign.set(campaignId,{campaignId,occurredAtUtc,action,eventId:String(event.id||'')});
    }
    return[...latestByCampaign.values()].map(({eventId,...item})=>item).sort((a,b)=>a.campaignId.localeCompare(b.campaignId));
  }
  function safeInteger(value){const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:null}
  global.ProductDiaryObservations=Object.freeze({observationFor,saveObservation,hasAutomaticPauseEvent,automaticPauseCampaignIds,listAutomaticPauseEvents,appendAutomaticPauseEvent,appendObservedAutomaticPauseEvent,appendCpaAdjustmentEvent,appendBudgetAdjustmentEvent,appendSearchTermsAnalysisEvent,appendCampaignListOpenedEvent,appendCampaignKeywordAddedEvent,latestVerifiedBudgetAdjustment,campaignAnalysisIndicators});
})(typeof window==='object'?window:globalThis);
