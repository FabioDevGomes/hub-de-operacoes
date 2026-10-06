(function(global){
  // Manual text never replaces source cell Q, which also informs campaign policy.
  function observationFor(base,campaignId,date){
    return (base?.observacoes_diario||[]).find(item=>item.campanha_id===campaignId&&item.data===date)||null;
  }
  function saveObservation(base,{campaignId,date,text,expectedRevision},now=new Date().toISOString()){
    if(!base||base.campanhas?.filter(item=>item.id===campaignId).length!==1)throw new Error('Campanha não identificada na base local.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Data do diário inválida.');
    if(typeof text!=='string'||text.length>10000)throw new Error('A observação deve ter até 10.000 caracteres.');
    const previous=observationFor(base,campaignId,date),revision=previous?.revisao||0;
    if(!Number.isInteger(expectedRevision)||expectedRevision!==revision)throw new Error('Esta observação mudou em outra janela. Feche e reabra a edição antes de salvar.');
    if(previous?.texto===text)return base;
    const updated=structuredClone(base),record={campanha_id:campaignId,data:date,texto:text,revisao:revision+1,atualizado_em:now,historico:[...(previous?.historico||[]),...(previous?[{texto:previous.texto,revisao:revision,atualizado_em:previous.atualizado_em}]:[])]};
    updated.observacoes_diario=(updated.observacoes_diario||[]).filter(item=>item.campanha_id!==campaignId||item.data!==date);
    updated.observacoes_diario.push(record);updated.atualizado_em=now;
    return updated;
  }
  global.ProductDiaryObservations=Object.freeze({observationFor,saveObservation});
})(typeof window==='object'?window:globalThis);
