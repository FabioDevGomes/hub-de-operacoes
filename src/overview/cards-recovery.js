/* One-time compatibility repair. Normal reads never recalculate saved MCC cards. */
(function(root){
  'use strict';
  function needsRecovery(base,cards,database){
    if(!base||base.schema!==database.SCHEMA||cards.read(base)===base.overview_cards)return false;
    // A newer producer must not be downgraded by an older Hub tab.
    if(Number(base.overview_cards?.version)>cards.VERSION)return false;
    return Array.isArray(base.manifesto_atual?.campanhas)&&
      !!(base.manifesto_atual.campanhas.length||base.mccs?.length)&&
      Number.isFinite(new Date(base.atualizado_em||base.manifesto_atual.gerado_em_utc||'').getTime());
  }
  async function ensure({base,openDatabase,cards=root.OverviewCardsDomain,database=root.CampaignDatabase}){
    const diagnostics=root.HubOverviewPerformanceDiagnostics,measuring=diagnostics?.requested===true,clock=()=>measuring?(root.performance?.now?.()??null):null,record=(stage,startPerfMs,endPerfMs)=>{if(startPerfMs!=null&&endPerfMs!=null)diagnostics?.recordBaseLoadDetail?.({stage,startPerfMs,endPerfMs})},totalStartedAt=clock();
    try{
      let stageStartedAt=clock(),required=needsRecovery(base,cards,database);record('recovery-eligibility-check',stageStartedAt,clock());
      if(!required)return{base,recovered:false};
      stageStartedAt=clock();const db=await openDatabase();record('recovery-open-database',stageStartedAt,clock());
      try{
        const transactionStartedAt=clock(),result=await new Promise((resolve,reject)=>{
          const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
          let output,failure,writeStartedAt=null;
          request.onsuccess=()=>{
            try{
              const latest=request.result;
              // Recheck inside the write transaction: another tab/MCC may have repaired it.
              output={base:latest||base,recovered:false};
              required=needsRecovery(latest,cards,database);record('recovery-indexeddb-recheck',transactionStartedAt,clock());
              if(!required)return;
              stageStartedAt=clock();const summary=cards.create(latest,{computedAt:latest.atualizado_em||latest.manifesto_atual.gerado_em_utc});record('recovery-card-calculation',stageStartedAt,clock());
              summary.recovery={version:1,reason:'missing_or_invalid_summary',recoveredAt:new Date().toISOString()};
              const repaired={...latest,overview_cards:summary};
              root.OverviewBaseSessionCache?.invalidate();
              writeStartedAt=clock();store.put(repaired,'atual');
              output={base:repaired,recovered:true};
            }catch(error){failure=error;tx.abort();}
          };
          tx.oncomplete=()=>{if(output?.recovered)root.OverviewBaseSessionCache?.invalidate();if(writeStartedAt!=null)record('recovery-indexeddb-write-commit',writeStartedAt,clock());else record('recovery-indexeddb-read-commit',transactionStartedAt,clock());resolve(output)};
          tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('A recuperação dos cartões foi interrompida.'));
        });
        return result;
      }finally{const closeStartedAt=clock();db.close();record('recovery-close-database',closeStartedAt,clock())}
    }finally{record('recovery-total',totalStartedAt,clock())}
  }
  root.OverviewCardsRecovery=Object.freeze({ensure});
})(typeof window==='object'?window:globalThis);
