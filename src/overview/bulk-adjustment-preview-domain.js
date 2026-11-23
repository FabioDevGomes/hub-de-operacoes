(function(global){
  const numericId=value=>/^[1-9]\d{0,19}$/.test(String(value??''));
  const customerId=value=>/^\d{10}$/.test(String(value??'').replace(/\D/g,''));
  const actionPattern=/^(cpa|budget):(increase|decrease):(2|4|5|10)$/;
  function parseAction(value){
    const match=actionPattern.exec(String(value||''));
    if(!match)return null;
    const kind=match[1],direction=match[2],percentage=Number(match[3]);
    if(kind==='cpa'&&![2,4].includes(percentage)||kind==='budget'&&![5,10].includes(percentage))return null;
    return{kind,direction,percentage};
  }
  function campaignName(row){return String(row?.c?.nome_campanha_exato||row?.identity?.name||'Campanha').trim()||'Campanha'}
  function campaignNameParts(row){
    const name=campaignName(row),match=/^(.*\S)\s+(\d+)(?=\s+\([^)]*\)\s+\d+%\s+-)/.exec(name);
    if(!match)return{name,campaignNumber:''};
    return{name:`${match[1]}${name.slice(match[0].length)}`,campaignNumber:match[2]};
  }
  function commonEligibility(row){
    if(!String(row?.campaignId||''))return'Campanha sem vínculo interno no Diário.';
    const action=row?.googleAdsCampaignAction||{};
    if(action.mappingStatus!=='mapped'||!customerId(action.managerCustomerId)||!customerId(action.customerId)||!numericId(action.campaignId))return'MCC, conta ou ID da campanha sem vínculo confirmado.';
    return'';
  }
  function buildPreview(row,selection){
    const unavailable=commonEligibility(row);
    if(unavailable)return{eligible:false,reason:unavailable};
    const input=row?.[selection.kind==='cpa'?'cpaAdjustment':'budgetAdjustment'];
    if(!input)return{eligible:false,reason:selection.kind==='cpa'?'Configuração atual de CPA não disponível no Hub.':'Configuração atual do orçamento não disponível no Hub.'};
    const status=String(input.campaignStatus||'').toUpperCase();
    if(!['ENABLED','PAUSED'].includes(status))return{eligible:false,reason:'Status da campanha não permite este ajuste.'};
    let preview=null;
    if(selection.kind==='cpa'){
      const action=row.googleAdsCampaignAction||{};
      if(String(input.channelType||'').toUpperCase()!=='SEARCH')return{eligible:false,reason:'O ajuste de CPA está disponível somente para campanhas Search.'};
      if(!['TARGET_CPA','MAXIMIZE_CONVERSIONS'].includes(String(input.biddingStrategyType||'').toUpperCase())||String(input.biddingStrategyResource||'').trim())return{eligible:false,reason:'Estratégia de CPA não compatível com o ajuste.'};
      if(input.targetCpaResolution==='unresolved_portfolio'||input.targetCpaResolution==='unavailable')return{eligible:false,reason:'O CPA está vinculado a um portfólio ou não pôde ser resolvido.'};
      if(!global.ProductDiaryCpaAdjustmentDomain?.createPreview)return{eligible:false,reason:'Cálculo de prévia do CPA indisponível.'};
      preview=global.ProductDiaryCpaAdjustmentDomain.createPreview(input,selection.direction,selection.percentage);
    }else{
      const action=row.googleAdsCampaignAction||{},customer=String(action.customerId||'').replace(/\D/g,'');
      if(input.budgetPeriod!=='DAILY')return{eligible:false,reason:'A campanha não usa orçamento diário.'};
      if(input.budgetShared!==false)return{eligible:false,reason:'O orçamento é compartilhado ou não foi confirmado como exclusivo.'};
      if(!new RegExp(`^customers/${customer}/campaignBudgets/[1-9]\\d{0,19}$`).test(String(input.budgetResource||'')))return{eligible:false,reason:'O recurso do orçamento não foi confirmado para esta conta.'};
      if(!global.ProductDiaryBudgetAdjustmentDomain?.createPreview)return{eligible:false,reason:'Cálculo de prévia do orçamento indisponível.'};
      preview=global.ProductDiaryBudgetAdjustmentDomain.createPreview(input,selection.direction,selection.percentage);
    }
    if(!preview)return{eligible:false,reason:'Os dados atuais não permitem calcular um valor ajustado válido.'};
    return{eligible:true,preview,input};
  }
  function createPreview(rows,actionValue){
    const selection=parseAction(actionValue);
    if(!selection)return{selection:null,eligible:[],excluded:(Array.isArray(rows)?rows:[]).map(row=>({row,...campaignNameParts(row),eligible:false,reason:'Ação selecionada inválida.'}))};
    const results=(Array.isArray(rows)?rows:[]).map(row=>({row,...campaignNameParts(row),...buildPreview(row,selection)}));
    return{selection,eligible:results.filter(item=>item.eligible),excluded:results.filter(item=>!item.eligible),results};
  }
  function pendingItems(items,outcomes){return(Array.isArray(items)?items:[]).filter(item=>{const status=outcomes?.get?.(item?.row)?.status;return !status||status==='confirmation_required'})}
  global.OverviewBulkAdjustmentPreviewDomain=Object.freeze({parseAction,createPreview,pendingItems});
})(typeof window==='object'?window:globalThis);
