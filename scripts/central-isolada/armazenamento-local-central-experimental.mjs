// Prova de LocalStorage centralizado. Não é adaptador de produção.
export function createExperimentalLocalStorage(db) {
  const reserved=new Set(['hub:campaign-delivery:records:v1']);
  function keyOk(key){return typeof key==='string' && key.length>0 && key.length<=512 && !reserved.has(key)}
  function readInternal(key,withinTransaction=false) {
    if(!keyOk(key))throw Error('Chave inválida ou reservada');
    if(withinTransaction&&!db.isTransaction)throw Error('Transação externa ausente');
    if(!withinTransaction)db.exec('BEGIN');
    try {
      const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
      const row=db.prepare('SELECT value FROM local_storage WHERE key=?').get(key);
      if(!withinTransaction)db.exec('COMMIT');return row?{revision,state:'present',value:row.value}:{revision,state:'absent'};
    } catch(error){if(!withinTransaction)db.exec('ROLLBACK');throw error}
  }
  function read(key){return readInternal(key)}
  function listInTransaction({prefix,offset=0,limit=100}){
    if(!db.isTransaction)throw Error('Transação externa ausente');
    if(typeof prefix!=='string'||!prefix||prefix.length>512||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error('Consulta inválida');
    const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
    const records=db.prepare('SELECT key,value FROM local_storage WHERE substr(key,1,?)=? ORDER BY key LIMIT ? OFFSET ?').all([...prefix].length,prefix,limit+1,offset);
    if(records.some(row=>reserved.has(row.key)))throw Error('Chave reservada');
    const hasMore=records.length>limit;if(hasMore)records.pop();return {revision,records,nextOffset:hasMore?offset+records.length:null};
  }
  function writeInternal({key,expectedRevision,expectedState,expectedValue,value},withinTransaction=false) {
    if(!keyOk(key) || !Number.isSafeInteger(expectedRevision) || !['absent','present'].includes(expectedState) || typeof value!=='string' || (expectedState==='present' && typeof expectedValue!=='string'))throw Error('Operação inválida');
    if(withinTransaction&&!db.isTransaction)throw Error('Transação externa ausente');
    if(!withinTransaction)db.exec('BEGIN IMMEDIATE');
    try {
      const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
      const row=db.prepare('SELECT value FROM local_storage WHERE key=?').get(key);
      if(revision!==expectedRevision || (expectedState==='absent' && row) || (expectedState==='present' && (!row || row.value!==expectedValue))) {const e=Error('Conflito de revisão');e.code='VERSION_CONFLICT';throw e;}
      if(row && row.value===value){if(!withinTransaction)db.exec('COMMIT');return {revision,changed:false}}
      db.prepare('INSERT INTO local_storage_history(key,revision,previous_present,previous_value,next_value) VALUES(?,?,?,?,?)').run(key,revision+1,row?1:0,row?row.value:null,value);
      if(row) db.prepare('UPDATE local_storage SET value=? WHERE key=?').run(value,key);
      else db.prepare('INSERT INTO local_storage(key,value) VALUES(?,?)').run(key,value);
      db.prepare('UPDATE state SET version=? WHERE id=1').run(revision+1);
      if(!withinTransaction)db.exec('COMMIT');return {revision:revision+1,changed:true};
    } catch(e){if(!withinTransaction)db.exec('ROLLBACK');throw e}
  }
  function write(input){return writeInternal(input)}
  return {read,write,listInTransaction,readInTransaction(key){return readInternal(key,true)},writeInTransaction(input){return writeInternal(input,true)}};
}
