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
  async function appendHistoricalAutomaticPauseEvent({openDatabase,domain,input}){
    const db=await openDatabase();
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('bases','readwrite'),store=tx.objectStore('bases'),request=store.get('atual');
        let result,changed=false,failure;
        request.onsuccess=()=>{
          try{
            if(!request.result)throw new Error('Carregue a base local antes de registrar o evento no Diário.');
            result=domain.appendHistoricalAutomaticPauseEvent(request.result,input);
            changed=result!==request.result;
            if(changed)store.put(result,'atual');
          }catch(error){failure=error;tx.abort()}
        };
        tx.oncomplete=()=>resolve({base:result,changed});
        tx.onerror=()=>reject(failure||tx.error||new Error('Não foi possível registrar a pausa anterior no Diário.'));
        tx.onabort=()=>reject(failure||tx.error||new Error('O registro da pausa anterior no Diário foi cancelado.'));
      });
    }finally{db.close()}
  }
  global.ProductDiaryObservationStorage=Object.freeze({save,appendAutomaticPauseEvent,appendHistoricalAutomaticPauseEvent});
})(typeof window==='object'?window:globalThis);
