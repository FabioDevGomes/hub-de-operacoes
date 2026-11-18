(function(global){
  async function save({openDatabase,domain,input}){
    const db=await openDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
        let result,failure;
        request.onsuccess=()=>{
          try{
            if(!request.result)throw new Error('Carregue a base local antes de editar o diário.');
            result=domain.saveObservation(request.result,input);
            if(result!==request.result)store.put(result,'atual');
          }catch(error){failure=error;tx.abort()}
        };
        tx.oncomplete=()=>resolve(result);
        tx.onerror=()=>reject(failure||tx.error||new Error('Não foi possível salvar a observação.'));
        tx.onabort=()=>reject(failure||tx.error||new Error('O salvamento foi cancelado.'));
      });
    }finally{db.close()}
  }
  async function appendAutomaticPauseEvent({openDatabase,domain,database,input}){
    const db=await openDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
        let result,changed=false,failure;
        request.onsuccess=()=>{
          try{
            if(!request.result)throw new Error('Carregue a base local antes de registrar o evento no Diário.');
            result=domain.appendAutomaticPauseEvent(request.result,input);
            if(result!==request.result&&database?.confirmAutomaticPause)result=database.confirmAutomaticPause(result,input);
            if(database?.appendGoogleAdsAutomaticPauseHistory)result=database.appendGoogleAdsAutomaticPauseHistory(result,input);
            changed=result!==request.result;
            if(changed)store.put(result,'atual');
          }catch(error){failure=error;tx.abort()}
        };
        tx.oncomplete=()=>resolve({base:result,changed});
        tx.onerror=()=>reject(failure||tx.error||new Error('Não foi possível registrar a pausa automática no Diário.'));
        tx.onabort=()=>reject(failure||tx.error||new Error('O registro da pausa automática no Diário foi cancelado.'));
      });
    }finally{db.close()}
  }
  async function appendObservedAutomaticPauseEvent({openDatabase,domain,database,input}){
    const db=await openDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
        let result,changed=false,failure;
        request.onsuccess=()=>{
          try{
            if(!request.result)throw new Error('Carregue a base local antes de registrar a pausa observada.');
            result=domain.appendObservedAutomaticPauseEvent(request.result,input);
            if(result!==request.result&&database?.appendGoogleAdsObservedAutomaticPauseHistory)result=database.appendGoogleAdsObservedAutomaticPauseHistory(result,input);
            changed=result!==request.result;
            if(changed)store.put(result,'atual');
          }catch(error){failure=error;tx.abort()}
        };
        tx.oncomplete=()=>resolve({base:result,changed});
        tx.onerror=()=>reject(failure||tx.error||new Error('Não foi possível registrar a pausa observada.'));
        tx.onabort=()=>reject(failure||tx.error||new Error('O registro da pausa observada foi cancelado.'));
      });
    }finally{db.close()}
  }
  async function appendCpaAdjustmentEvent({openDatabase,domain,input}){
    const db=await openDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
        let result,changed=false,failure;
        request.onsuccess=()=>{
          try{
            if(!request.result)throw new Error('Carregue a base local antes de registrar o ajuste no Diário.');
            result=domain.appendCpaAdjustmentEvent(request.result,input);
            changed=result!==request.result;
            if(changed)store.put(result,'atual');
          }catch(error){failure=error;tx.abort()}
        };
        tx.oncomplete=()=>resolve({base:result,changed});
        tx.onerror=()=>reject(failure||tx.error||new Error('Não foi possível registrar o ajuste de CPA no Diário.'));
        tx.onabort=()=>reject(failure||tx.error||new Error('O registro do ajuste de CPA no Diário foi cancelado.'));
      });
    }finally{db.close()}
  }
  async function appendBudgetAdjustmentEvent({openDatabase,domain,input}){
    const db=await openDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
        let result,changed=false,failure;
        request.onsuccess=()=>{
          try{
            if(!request.result)throw new Error('Carregue a base local antes de registrar o ajuste no Diário.');
            result=domain.appendBudgetAdjustmentEvent(request.result,input);
            changed=result!==request.result;
            if(changed)store.put(result,'atual');
          }catch(error){failure=error;tx.abort()}
        };
        tx.oncomplete=()=>resolve({base:result,changed});
        tx.onerror=()=>reject(failure||tx.error||new Error('Não foi possível registrar o ajuste de orçamento no Diário.'));
        tx.onabort=()=>reject(failure||tx.error||new Error('O registro do ajuste de orçamento no Diário foi cancelado.'));
      });
    }finally{db.close()}
  }
  async function appendSearchTermsAnalysisEvent({openDatabase,domain,input}){
    const db=await openDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
        let result,changed=false,failure;
        request.onsuccess=()=>{
          try{
            if(!request.result)throw new Error('Carregue a base local antes de registrar a análise no Diário.');
            result=domain.appendSearchTermsAnalysisEvent(request.result,input);
            changed=result!==request.result;
            if(changed)store.put(result,'atual');
          }catch(error){failure=error;tx.abort()}
        };
        tx.oncomplete=()=>resolve({base:result,changed});
        tx.onerror=()=>reject(failure||tx.error||new Error('Não foi possível registrar a análise no Diário.'));
        tx.onabort=()=>reject(failure||tx.error||new Error('O registro da análise no Diário foi cancelado.'));
      });
    }finally{db.close()}
  }
  async function appendCampaignKeywordAddedEvents({openDatabase,domain,inputs}){
    const db=await openDatabase();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');let result,changed=false,failure;
      request.onsuccess=()=>{try{if(!request.result)throw new Error('Carregue a base local antes de registrar as palavras-chave.');result=request.result;for(const input of Array.isArray(inputs)?inputs:[]){const next=domain.appendCampaignKeywordAddedEvent(result,input);if(next!==result){result=next;changed=true}}if(changed)store.put(result,'atual')}catch(error){failure=error;tx.abort()}};
      tx.oncomplete=()=>resolve({base:result,changed});tx.onerror=()=>reject(failure||tx.error||new Error('Não foi possível registrar as palavras-chave no Diário.'));tx.onabort=()=>reject(failure||tx.error||new Error('O registro das palavras-chave no Diário foi cancelado.'));
    })}finally{db.close()}
  }
  async function appendCampaignListOpenedEvent({openDatabase,domain,input}){
    const db=await openDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
        let result,changed=false,failure;
        request.onsuccess=()=>{
          try{
            if(!request.result)throw new Error('Carregue a base local antes de registrar a abertura da lista de campanhas.');
            result=domain.appendCampaignListOpenedEvent(request.result,input);
            changed=result!==request.result;
            if(changed)store.put(result,'atual');
          }catch(error){failure=error;tx.abort()}
        };
        tx.oncomplete=()=>resolve({base:result,changed});
        tx.onerror=()=>reject(failure||tx.error||new Error('Não foi possível registrar a abertura da lista de campanhas no Diário.'));
        tx.onabort=()=>reject(failure||tx.error||new Error('O registro da abertura da lista de campanhas foi cancelado.'));
      });
    }finally{db.close()}
  }
  global.ProductDiaryObservationStorage=Object.freeze({save,appendAutomaticPauseEvent,appendObservedAutomaticPauseEvent,appendCpaAdjustmentEvent,appendBudgetAdjustmentEvent,appendSearchTermsAnalysisEvent,appendCampaignListOpenedEvent,appendCampaignKeywordAddedEvents});
})(typeof window==='object'?window:globalThis);
