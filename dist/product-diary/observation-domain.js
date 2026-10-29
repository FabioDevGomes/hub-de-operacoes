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
  function campaignDateForInstant(value){const instant=new Date(value);if(!value||!Number.isFinite(instant.getTime()))throw new Error('Horário do evento de pausa inválido.');const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant),part=type=>parts.find(item=>item.type===type)?.value||'';return`${part('year')}-${part('month')}-${part('day')}`}
  function hasAutomaticPauseEvent(base,campaignId){return(base?.observacoes_diario||[]).some(item=>String(item.campanha_id)===String(campaignId)&&(item.eventos||[]).some(event=>event?.tipo==='google_ads_auto_pause'))}
  function listAutomaticPauseEvents(base){
    const campaigns=new Map((base?.campanhas||[]).map(campaign=>[String(campaign.id),campaign])),byId=new Map();
    for(const observation of base?.observacoes_diario||[])for(const event of observation.eventos||[]){
      if(event?.tipo!=='google_ads_auto_pause'||typeof event.ocorrido_em_utc!=='string'||!Number.isFinite(Date.parse(event.ocorrido_em_utc)))continue;
      const campaignId=String(observation.campanha_id||''),campaign=campaigns.get(campaignId),id=String(event.id||`${campaignId}:${event.ocorrido_em_utc}`);
      if(byId.has(id))continue;
      byId.set(id,{id,campaignId,campaignName:String(campaign?.nome_campanha_exato||campaign?.nome_mcc||campaign?.nome_exibicao||''),occurredAtUtc:new Date(event.ocorrido_em_utc).toISOString(),rule:['negative_remaining','product_performance','campaign_age','campaign_zero_impressions'].includes(event.regra)?event.regra:''});
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
  function appendAutomaticPauseEvent(base,{campaignId,occurredAtUtc,rule},now=new Date().toISOString()){
    const matchingCampaigns=(base?.campanhas||[]).filter(item=>String(item.id)===String(campaignId));
    if(matchingCampaigns.length!==1)throw new Error('Campanha não identificada na base local.');
    const storedCampaignId=matchingCampaigns[0].id;
    const instant=new Date(occurredAtUtc);if(!occurredAtUtc||!Number.isFinite(instant.getTime()))throw new Error('Horário do evento de pausa inválido.');
    const confirmedAtUtc=instant.toISOString(),date=campaignDateForInstant(confirmedAtUtc),previous=observationFor(base,storedCampaignId,date),eventId=`google-ads-auto-pause:${storedCampaignId}:${confirmedAtUtc}`;
    if((previous?.eventos||[]).some(event=>event?.id===eventId))return base;
    const event={id:eventId,tipo:'google_ads_auto_pause',ocorrido_em_utc:confirmedAtUtc};if(['negative_remaining','product_performance','campaign_age','campaign_zero_impressions'].includes(rule))event.regra=rule;
    return appendEvent(base,storedCampaignId,date,event,now);
  }
  function appendHistoricalAutomaticPauseEvent(base,{campaignId,occurredOn},now=new Date().toISOString()){
    const matchingCampaigns=(base?.campanhas||[]).filter(item=>String(item.id)===String(campaignId));
    if(matchingCampaigns.length!==1)throw new Error('Campanha não identificada na base local.');
    if(!validIsoDate(occurredOn))throw new Error('Data do evento de pausa inválida.');
    const storedCampaignId=matchingCampaigns[0].id,previous=observationFor(base,storedCampaignId,occurredOn);
    const alreadyRecorded=(previous?.eventos||[]).some(event=>{
      if(event?.tipo!=='google_ads_auto_pause')return false;
      if(event.ocorrido_em_data===occurredOn)return true;
      try{return event.ocorrido_em_utc&&campaignDateForInstant(event.ocorrido_em_utc)===occurredOn}catch{return false}
    });
    if(alreadyRecorded)return base;
    return appendEvent(base,storedCampaignId,occurredOn,{id:`google-ads-auto-pause:${storedCampaignId}:date:${occurredOn}`,tipo:'google_ads_auto_pause',ocorrido_em_data:occurredOn},now);
  }
  global.ProductDiaryObservations=Object.freeze({observationFor,saveObservation,hasAutomaticPauseEvent,listAutomaticPauseEvents,appendAutomaticPauseEvent,appendHistoricalAutomaticPauseEvent});
})(typeof window==='object'?window:globalThis);
