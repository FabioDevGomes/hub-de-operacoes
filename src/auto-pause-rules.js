(function(global){
  const rules=[
    {id:'negative_remaining',title:'Saldo negativo'},
    {id:'product_performance',title:'Desempenho do mesmo produto'},
    {id:'reference_competitor',title:'Concorrente mais próxima da referência por impressões'},
    {id:'campaign_age',title:'Limite de dias da campanha'},
    {id:'campaign_zero_impressions',title:'Dias consecutivos sem impressões'},
    {id:'clicks_without_sale',title:'Cliques acumulados sem venda'}
  ];
  const key='hub:google-ads:auto-pause-campaign-exceptions:v1';
  const identityKey='hub:google-ads:auto-pause-campaign-exception-identities:v1';
  const legacyRuleIds=new Map([['minimum_product_performance','reference_competitor']]);
  function read(){try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return{}}}
  function readIdentities(){try{const value=JSON.parse(localStorage.getItem(identityKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return{}}}
  function normalizeIdentity(value){const managerCustomerId=String(value?.managerCustomerId||'').replace(/\D/g,''),customerId=String(value?.customerId||'').replace(/\D/g,''),campaignId=String(value?.campaignId||'');return /^\d{10}$/.test(managerCustomerId)&&/^\d{10}$/.test(customerId)&&/^[1-9]\d{0,19}$/.test(campaignId)?{managerCustomerId,customerId,campaignId}:null}
  function excludedFor(value){return Array.isArray(value)?[...new Set(value.map(ruleId=>legacyRuleIds.get(ruleId)||ruleId).filter(ruleId=>rules.some(rule=>rule.id===ruleId)))].sort():[]}
  global.HubAutoPauseRules={rules,getExcluded(campaignId){return excludedFor(read()[String(campaignId||'')])},getServerExceptions(){const exceptions=read(),identities=readIdentities();return Object.entries(exceptions).flatMap(([campaignId,excludedRules])=>{const identity=normalizeIdentity(identities[campaignId]),excluded=excludedFor(excludedRules);return identity&&excluded.length?[{...identity,excludedRules:excluded}]:[]})},saveExcluded(campaignId,ids,identityValue=null){const id=String(campaignId||'');if(!id)throw new Error('Campanha sem identificador local.');const value=read(),identities=readIdentities(),valid=excludedFor(ids),identity=normalizeIdentity(identityValue);if(valid.length){value[id]=valid;if(identity)identities[id]=identity}else{delete value[id];delete identities[id]}localStorage.setItem(key,JSON.stringify(value));localStorage.setItem(identityKey,JSON.stringify(identities));global.dispatchEvent(new CustomEvent('hub:auto-pause-exceptions-updated',{detail:{campaignId:id,excludedRules:valid,identity}}));return valid},hasExceptions(campaignId){return this.getExcluded(campaignId).length>0}};
})(globalThis);
