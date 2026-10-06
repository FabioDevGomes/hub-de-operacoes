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
  global.ProductDiaryObservationStorage=Object.freeze({save});
})(typeof window==='object'?window:globalThis);
