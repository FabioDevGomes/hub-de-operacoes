(function(global){
  const metricFields=['data','moeda','impressoes','cliques_google','custo_total','conversoes','valor_conversao','estado_campanha','status_campanha'];
  const observedFields=new Set(['impressoes','cliques_google','custo_total','conversoes','valor_conversao']);
  function normalizeName(value){return String(value??'').normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('pt-BR')}
  function fullAccountId(value){const digits=String(value??'').replace(/\D/g,'');return digits.length===10?`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`:null}
  function metricValue(value){if(value==null||value==='')return null;if(typeof value==='object'&&Object.hasOwn(value,'valor')){if(['ausente','invalido'].includes(value.estado))return null;return value.valor===''?null:value.valor}return value}
  function normalizedMetric(value){const raw=metricValue(value);if(raw==null)return null;if(typeof raw==='number')return Number.isFinite(raw)?raw:String(raw);const text=String(raw).trim();if(!text)return null;if(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text))return Number(text);if(/^[+-]?\d+,\d+$/.test(text))return Number(text.replace(',','.'));return text}
  function sourceAccountId(source){const values=['metricas_D_menos_1','metricas_D_zero'].map(key=>metricValue(source?.[key]?.conta_id)).filter(value=>value!=null&&value!=='');if(!values.length)return null;const ids=values.map(fullAccountId);return ids.every(Boolean)&&new Set(ids).size===1?ids[0]:null}
  function sourceEvidence(source){
    const periods=['metricas_D_menos_1','metricas_D_zero'].map(key=>{const metrics=source?.[key];return{present:!!metrics&&metrics.presente!==false,values:Object.fromEntries(metricFields.map(field=>[field,normalizedMetric(metrics?.[field])]))}});
    const hasObservedMetrics=periods.some(period=>[...observedFields].some(field=>typeof period.values[field]==='number'&&Number.isFinite(period.values[field])));
    return{signature:JSON.stringify(periods),hasObservedMetrics,periods};
  }
  function periodSummary(period){return Object.fromEntries(['data','impressoes','cliques_google','custo_total','conversoes','valor_conversao'].map(field=>[field,period?.values?.[field]??null]))}
  function findDuplicateCampaignGroups(baseInput){
    const sources=Array.isArray(baseInput?.manifesto_atual?.campanhas)?baseInput.manifesto_atual.campanhas:[],groups=new Map(),withoutFullAccount=new Map(),suppressed=new Set(Array.isArray(baseInput?.manifest_duplicate_suppressions)?baseInput.manifest_duplicate_suppressions:[]);
    for(const [index,source] of sources.entries()){
      const name=String(source?.nome_campanha_exato||'').trim(),nameKey=normalizeName(name);if(!nameKey)continue;
      const accountId=sourceAccountId(source);
      if(!accountId){const items=withoutFullAccount.get(nameKey)||[];items.push({source,index,name});withoutFullAccount.set(nameKey,items);continue}
      const key=`${accountId}\u0000${nameKey}`,items=groups.get(key)||[];items.push({source,index,name});groups.set(key,items);
    }
    const candidates=[];
    for(const [key,items] of groups){
      if(items.length<2)continue;
      const [accountId,nameKey]=key.split('\u0000'),members=items.map((item,index)=>{const evidence=sourceEvidence(item.source);return{occurrence:index+1,name:item.name,metrics: evidence.periods.map(periodSummary),hasObservedMetrics:evidence.hasObservedMetrics,signature:evidence.signature}}),signatures=members.map(item=>item.signature),metricsIdentical=members.every(item=>item.hasObservedMetrics)&&signatures.every(signature=>signature===signatures[0]);
      const suppressionStored=suppressed.has(key);
      candidates.push({accountId,nameKey,name:items[0].name,members,metricsIdentical,suppressionStored,suppressed:suppressionStored&&metricsIdentical});
    }
    candidates.sort((a,b)=>a.accountId.localeCompare(b.accountId)||a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}));
    const unverifiableCount=[...withoutFullAccount.values()].reduce((sum,items)=>sum+Math.max(0,items.length-1),0);
    return{groups:candidates,unverifiableCount};
  }
  global.OverviewDuplicateAuditDomain=Object.freeze({normalizeName,fullAccountId,sourceAccountId,sourceEvidence,findDuplicateCampaignGroups});
})(typeof window==='object'?window:globalThis);
