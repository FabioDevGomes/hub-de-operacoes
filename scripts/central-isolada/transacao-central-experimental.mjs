// Operações aditivas em várias fontes, com reversão integral em caso de falha.
// Não fornece exclusão nem modifica qualquer base por conta própria.
export function createCentralTransaction(db,{local,indexed,repository=null,allowReversibleHide=false}){
 if(!db||typeof local?.writeInTransaction!=='function'||typeof local?.readInTransaction!=='function'||typeof indexed?.putInTransaction!=='function'||typeof indexed?.getInTransaction!=='function'||typeof indexed?.scanInTransaction!=='function')throw Error('Repositórios indisponíveis');
 function read({operations,expectedRevision}){
  if(!Array.isArray(operations)||operations.length<1||operations.length>100)throw Error('Leitura inválida');
  db.exec('BEGIN');
  try{
   const revision=db.prepare('SELECT version FROM state WHERE id=1').get()?.version;
   if(!Number.isSafeInteger(revision))throw Error('Revisão indisponível');
   if(expectedRevision!==undefined&&revision!==expectedRevision){const error=Error('Conflito de revisão');error.code='VERSION_CONFLICT';throw error}
   const isClickBankBatch=operations.length>1&&operations.every(op=>op?.type==='indexed_get'&&op.input?.source==='radar-clickbank-top-offers'&&typeof op.input?.key==='string');
   const cache=isClickBankBatch&&typeof indexed.createClickBankWriteCache==='function'?indexed.createClickBankWriteCache(operations):null;
   const results=operations.map(operation=>{
    if(!operation||!['local_get','local_list','indexed_get','indexed_scan','indexed_metadata','delivery_get','delivery_list'].includes(operation.type)||!operation.input||typeof operation.input!=='object')throw Error('Operação inválida');
    if(operation.type==='delivery_list'){
      const state=db.prepare('SELECT value FROM state WHERE id=1').get();
      const value=JSON.parse(state.value);if(!Array.isArray(value))throw Error('Entregas inválidas');
      return {revision,state:'present',value};
    }
    if(operation.type==='delivery_get'){
      if(typeof operation.input.id!=='string'||!operation.input.id)throw Error('Entrega inválida');
      const state=db.prepare('SELECT value FROM state WHERE id=1').get();
      const matches=JSON.parse(state.value).filter(item=>item?.id===operation.input.id);
      if(matches.length>1)throw Error('Entrega duplicada');
      return matches.length?{revision,state:'present',value:matches[0]}:{revision,state:'absent'};
    }
    return operation.type==='local_get'?local.readInTransaction(operation.input.key):operation.type==='local_list'?local.listInTransaction(operation.input):operation.type==='indexed_scan'?indexed.scanInTransaction(operation.input):operation.type==='indexed_metadata'?indexed.describeInTransaction(operation.input):indexed.getInTransaction(operation.input,cache);
   });
   if(results.some(result=>result.revision!==revision))throw Error('Revisões divergentes');
   db.exec('COMMIT');return {revision,results};
  }catch(error){db.exec('ROLLBACK');throw error}
 }
 function commit({expectedRevision,operations}){
  const largeClickBankImport=Array.isArray(operations)&&operations.length<=10000&&operations.every(op=>op?.type==='indexed_put'&&op.input?.source==='radar-clickbank-top-offers'&&['captures','offerMetadata','trends','images','decisions'].includes(op.input?.store));
  const largeGuruCollection=Array.isArray(operations)&&operations.length<=10000&&operations.every(op=>op?.type==='indexed_put'&&op.input?.source==='radar-top-performance'&&['offers','collections','collection_offer_snapshots'].includes(op.input?.store));
  if(!Number.isSafeInteger(expectedRevision)||!Array.isArray(operations)||operations.length<1||(operations.length>1000&&!largeClickBankImport&&!largeGuruCollection))throw Error('Transação inválida');
  db.exec('BEGIN IMMEDIATE');
  try{
   const current=db.prepare('SELECT version FROM state WHERE id=1').get()?.version;
   if(current!==expectedRevision){const e=Error('Conflito de revisão');e.code='VERSION_CONFLICT';throw e}
   const cache=(largeClickBankImport||largeGuruCollection)&&typeof indexed.createClickBankWriteCache==='function'?indexed.createClickBankWriteCache(operations):null;
   let revision=current;const results=[];
   for(const operation of operations){
    if(!operation||typeof operation!=='object'||!['local_put','indexed_put','indexed_hide','indexed_clear','delivery_operation'].includes(operation.type)||!operation.input||typeof operation.input!=='object')throw Error('Operação inválida');
    const input={...operation.input,expectedRevision:revision};
    let result;
    if(operation.type==='indexed_hide'||operation.type==='indexed_clear'){
      if(!allowReversibleHide)throw Error('Remoção lógica não autorizada');
      result=operation.type==='indexed_hide'?indexed.hideInTransaction(input):indexed.clearInTransaction(input);
    }else if(operation.type==='delivery_operation'){
      if(typeof repository?.deliveryInTransaction!=='function')throw Error('Entrega indisponível');
      const delivery=repository.deliveryInTransaction(revision,input.operation,input.args);
      result={revision:delivery.version,result:delivery.result};
    }else result=operation.type==='local_put'?local.writeInTransaction(input):indexed.putInTransaction(input,cache);
    revision=result.revision;results.push(result);
   }
   db.exec('COMMIT');return {revision,results};
  }catch(error){db.exec('ROLLBACK');throw error}
 }
 return {read,commit};
}
