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
    if(!needsRecovery(base,cards,database))return{base,recovered:false};
    const db=await openDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
        let result,failure;
        request.onsuccess=()=>{
          try{
            const latest=request.result;
            // Recheck inside the write transaction: another tab/MCC may have repaired it.
            result={base:latest||base,recovered:false};
            if(!needsRecovery(latest,cards,database))return;
            const summary=cards.create(latest,{computedAt:latest.atualizado_em||latest.manifesto_atual.gerado_em_utc});
            summary.recovery={version:1,reason:'missing_or_invalid_summary',recoveredAt:new Date().toISOString()};
            const repaired={...latest,overview_cards:summary};
            store.put(repaired,'atual');
            result={base:repaired,recovered:true};
          }catch(error){failure=error;tx.abort();}
        };
        tx.oncomplete=()=>resolve(result);
        tx.onerror=tx.onabort=()=>reject(failure||tx.error||new Error('A recuperação dos cartões foi interrompida.'));
      });
    }finally{db.close();}
  }
  root.OverviewCardsRecovery=Object.freeze({ensure});
})(typeof window==='object'?window:globalThis);
