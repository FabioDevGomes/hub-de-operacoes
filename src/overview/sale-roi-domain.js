(function(root){
  const number=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
  const compare=(a,b)=>String(a.data||'').localeCompare(String(b.data||''))||String(a.hora||'').localeCompare(String(b.hora||''))||String(a.registrada_em||'').localeCompare(String(b.registrada_em||''))||String(a.id).localeCompare(String(b.id));
  function campaignSales(base,campaignId){
    return (base?.vendas_provisorias||[]).filter(sale=>sale.campanha_id===campaignId&&sale.status!=='cancelada').slice().sort(compare).map((sale,index)=>({
      ...sale,sequence:index+1,
      snapshot:sale.roi_no_registro?.campaign_id===campaignId?sale.roi_no_registro:null
    }));
  }
  // Read-only projection: same MCC replacement and ROI convention as Overview.
  // The returned photograph is stored only by the explicit manual-sale action.
  function capture(base,sale,{database,overview,exchangeRate}={}){
    const campaign=base.campanhas.find(item=>item.id===sale.campanha_id);
    if(!campaign)throw new Error('Campanha não encontrada para registrar o ROI.');
    const historical=database.campaignTotalsMap(base),name=String(campaign.nome_mcc||'').toLocaleLowerCase('pt-BR'),
      history=historical.get(`mcc:${name}`)||historical.get(`aba:${String(campaign.nome_exibicao||'').toLocaleLowerCase('pt-BR')}`),
      current=overview.authoritativeMccSnapshots(base.manifesto_atual,{exchangeRate}),snapshots=current.rows.filter(row=>row.campaignName.toLocaleLowerCase('pt-BR')===name),
      totals=overview.replaceAuthoritativeDates(history,snapshots,current.dates),
      scopedDates=snapshots.find(row=>Array.isArray(row.scopeDates))?.scopeDates||current.dates;
    // Reconcile manual sales against authoritative D0/D−1, not a stale Diary row.
    const effective=database.normalize(base);
    effective.diario=effective.diario.filter(row=>row.campanha_id!==campaign.id||!scopedDates.includes(row.data));
    for(const row of snapshots)if(row.present)effective.diario.push({campanha_id:campaign.id,data:row.date,celulas:{F:{value:row.conversions},P:{value:row.commission}}});
    for(const item of effective.vendas_provisorias)if(item.campanha_id===campaign.id&&item.status!=='cancelada')item.status='provisoria';
    const adjustment=database.salesAdjustmentMap(effective).get(campaign.id),investment=number(totals.investment),
      officialRevenue=number(totals.commission),extra=number(adjustment?.commissionAdjustment)||0,
      revenue=officialRevenue==null?(extra>0?extra:null):officialRevenue+extra,
      roi=investment>0&&revenue!=null?(revenue-investment)/investment*100:null;
    return {version:1,campaign_id:campaign.id,registered_at:sale.registrada_em,sale_date:sale.data,sale_time:sale.hora,sale_amount_brl:sale.valor_brl,
      investment_brl:investment,revenue_brl:revenue,roi_percent:roi,exchange_rate:number(exchangeRate),
      metrics_date:snapshots.filter(row=>row.present).map(row=>row.date).sort().at(-1)||null,
      source:'campaign_cumulative_at_manual_registration',
      unavailable_reason:roi!=null?null:investment==null?'Investimento não disponível':investment<=0?'Investimento zero; ROI indefinido':'Receita não disponível'};
  }
  root.SaleRoiDomain=Object.freeze({capture,campaignSales});
})(typeof window==='object'?window:globalThis);
