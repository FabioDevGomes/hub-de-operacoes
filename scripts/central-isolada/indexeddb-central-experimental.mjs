// Operações de laboratório para stores com keyPath simples.
// Não utilizar em produção: transações IndexedDB e índices ainda não são implementados.
import {createHash} from 'node:crypto';

function framed(tag,body){const len=Buffer.alloc(8);len.writeBigUInt64BE(BigInt(body.length));return Buffer.concat([Buffer.from(tag),len,body]);}
function numberIdentity(value){if(typeof value!=='number'||Number.isNaN(value))throw Error('Chave numérica inválida');const data=Buffer.alloc(8);data.writeDoubleBE(value===0?0:value);return framed('n',data)}
function readBinary(db,ref){
  if(typeof ref.path!=='string')throw Error('Referência binária inválida');
  const row=db.prepare('SELECT data,size,sha256 FROM binaries WHERE path=?').get(ref.path);
  if(!row || row.data.length!==row.size || createHash('sha256').update(row.data).digest('hex')!==row.sha256 || (ref.size!==undefined && ref.size!==row.size) || (ref.sha256!==undefined && ref.sha256!==row.sha256))throw Error('Binário ausente ou inválido');
  return Buffer.from(row.data);
}
export function keyIdentity(db,key,depth=0){
  if(depth>150)throw Error('Chave muito profunda');
  if(typeof key==='string')return framed('s',Buffer.from(key,'utf16le'));
  if(typeof key==='number')return numberIdentity(key);
  if(Array.isArray(key))return framed('a',Buffer.concat(key.map(k=>keyIdentity(db,k,depth+1))));
  if(!key || typeof key!=='object')throw Error('Chave inválida');
  if(key.$hubType==='number') {const values={'-0':0,'Infinity':Infinity,'-Infinity':-Infinity};if(!Object.hasOwn(values,key.value))throw Error('Chave inválida');return numberIdentity(values[key.value]);}
  if(key.$hubType==='date') {const millis=Date.parse(key.value);if(!Number.isFinite(millis) || new Date(millis).toISOString()!==key.value)throw Error('Data inválida');const data=Buffer.alloc(8);data.writeDoubleBE(millis===0?0:millis);return framed('d',data);}
  if(key.$hubType==='array' && Array.isArray(key.value)){
    if(key.holes!==undefined&&(!Array.isArray(key.holes)||key.holes.length))throw Error('Chave de array esparsa inválida');
    return framed('a',Buffer.concat(key.value.map(k=>keyIdentity(db,k,depth+1))));
  }
  if(key.$hubType==='buffer')return framed('b',readBinary(db,key));
  throw Error('Tipo de chave não suportado');
}

export function validateValue(db,value,depth=0){
  if(depth>150)throw Error('Valor muito profundo');
  if(value===null || typeof value==='string' || typeof value==='boolean' || (typeof value==='number' && Number.isFinite(value)))return;
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('Envelope inválido');
  const t=value.$hubType;
  if(['blob','file','buffer'].includes(t)){if(t==='file'&&value.lastModified!==undefined&&!Number.isSafeInteger(value.lastModified))throw Error('File.lastModified inválido');readBinary(db,value);return}
  if(t==='undefined')return;
  if(t==='number' && ['NaN','Infinity','-Infinity','-0'].includes(value.value))return;
  if(t==='bigint' && typeof value.value==='string' && /^-?\d+$/.test(value.value))return;
  if(t==='date' && typeof value.value==='string' && Number.isFinite(Date.parse(value.value)))return;
  if(t==='array' && Array.isArray(value.value)){
    if(value.holes!==undefined||value.properties!==undefined){
      if(!Array.isArray(value.holes)||!Array.isArray(value.properties))throw Error('Metadados de array inválidos');
      const holes=new Set();for(const index of value.holes){const item=value.value[index];if(!Number.isSafeInteger(index)||index<0||index>=value.value.length||holes.has(index)||item?.$hubType!=='undefined'||Object.keys(item).length!==1)throw Error('Posição vazia inválida');holes.add(index)}
      const names=new Set();for(const entry of value.properties){if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||entry[0]==='length'||names.has(entry[0])||(String(Number(entry[0]))===entry[0]&&Number.isInteger(Number(entry[0]))&&Number(entry[0])>=0&&Number(entry[0])<4294967295))throw Error('Propriedade de array inválida');names.add(entry[0]);validateValue(db,entry[1],depth+1)}
    }
    for(const item of value.value)validateValue(db,item,depth+1);return
  }
  if(t==='object' && Array.isArray(value.entries)) {const names=new Set();for(const item of value.entries){if(!Array.isArray(item)||item.length!==2||typeof item[0]!=='string'||names.has(item[0]))throw Error('Objeto inválido');names.add(item[0]);validateValue(db,item[1],depth+1)}return}
  throw Error('Tipo de valor não suportado');
}
export function extractPath(value,path){
  let field=value;
  for(const part of path.split('.')){
    if(!field || field.$hubType!=='object'||!Array.isArray(field.entries))return undefined;
    const found=field.entries.filter(entry=>entry[0]===part);
    if(found.length!==1)return undefined;
    field=found[0][1];
  }
  return field;
}
function indexKey(value,definition){
  const paths=Array.isArray(definition.keyPath)?definition.keyPath:[definition.keyPath];
  const values=paths.map(path=>extractPath(value,path));
  if(values.some(v=>v===undefined))return null;
  return Array.isArray(definition.keyPath)?values:values[0];
}
export function indexIdentity(db,value,definition){
  const key=indexKey(value,definition);if(key===null)return null;
  try{return keyIdentity(db,key)}catch{return null}
}
function orderedKey(db,key){
  keyIdentity(db,key);
  if(typeof key==='number')return [1,key===0?0:key];
  if(typeof key==='string')return [3,key];
  if(Array.isArray(key))return [5,key.map(item=>orderedKey(db,item))];
  if(key.$hubType==='number')return [1,{'-0':0,'Infinity':Infinity,'-Infinity':-Infinity}[key.value]];
  if(key.$hubType==='date')return [2,Date.parse(key.value)];
  if(key.$hubType==='buffer')return [4,readBinary(db,key)];
  if(key.$hubType==='array')return [5,key.value.map(item=>orderedKey(db,item))];
  throw Error('Chave não suportada');
}
function compareOrdered(a,b){
  if(a[0]!==b[0])return a[0]-b[0];
  if(a[0]===4)return Buffer.compare(a[1],b[1]);
  if(a[0]===5){for(let i=0;i<Math.min(a[1].length,b[1].length);i++){const n=compareOrdered(a[1][i],b[1][i]);if(n)return n}return a[1].length-b[1].length}
  return a[1]===b[1]?0:a[1]<b[1]?-1:1;
}
export function createExperimentalIndexedStore(db,{indexDefinitions=null}={}){
  const visibilityAvailable=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='indexed_visibility'").get();
  const activeClause=visibilityAvailable?' AND COALESCE((SELECT v.visible FROM indexed_visibility v WHERE v.source=records.source AND v.store=records.store AND v.ordinal=records.ordinal ORDER BY v.revision DESC LIMIT 1),1)=1':'';
  function visible(source,store,ordinal){
    if(!visibilityAvailable)return true;
    const row=db.prepare('SELECT visible FROM indexed_visibility WHERE source=? AND store=? AND ordinal=? ORDER BY revision DESC LIMIT 1').get(source,store,ordinal);
    return !row||row.visible===1;
  }
  function definitionsFor(source,store){
    if(Array.isArray(indexDefinitions))return indexDefinitions;
    let present;
    try{present=db.prepare('SELECT verified FROM store_index_catalog WHERE source=? AND store=?').get(source,store)}catch{throw Error('Índices não verificados')}
    if(present?.verified!==1)throw Error('Índices não verificados');
    return db.prepare('SELECT name,keypath_json,is_unique,multi_entry FROM store_indexes WHERE source=? AND store=? ORDER BY name').all(source,store).map(row=>({name:row.name,keyPath:JSON.parse(row.keypath_json),unique:!!row.is_unique,multiEntry:!!row.multi_entry}));
  }
  function describeInTransaction({source,store}){
    if(!db.isTransaction)throw Error('Transação externa ausente');
    if(typeof source!=='string'||typeof store!=='string')throw Error('Fonte inválida');
    const info=db.prepare('SELECT status,version_json FROM source_info WHERE source=?').get(source);
    const config=db.prepare('SELECT keypath_json,auto_increment FROM stores WHERE source=? AND store=?').get(source,store);
    if(info?.status!=='presente'||!config)throw Error('Store indisponível');
    const version=JSON.parse(info.version_json);if(!Number.isSafeInteger(version)||version<1)throw Error('Versão indisponível');
    return {revision:db.prepare('SELECT version FROM state WHERE id=1').get().version,databaseVersion:version,keyPath:JSON.parse(config.keypath_json),autoIncrement:!!config.auto_increment,indexes:definitionsFor(source,store)};
  }
  function createClickBankWriteCache(operations){
    if(!db.isTransaction)throw Error('Transação externa ausente');
    const cache=new Map();
    for(const op of operations){
      const {source,store,key}=op.input;
      if(!['radar-clickbank-top-offers','radar-top-performance'].includes(source)||typeof key!=='string')return null;
      const id=JSON.stringify([source,store]);if(cache.has(id))continue;
      if(definitionsFor(source,store).some(index=>index.unique||index.multiEntry))return null;
      const rows=new Map();let max=-1;
      for(const row of db.prepare('SELECT ordinal,key_json,value_json FROM records WHERE source=? AND store=? ORDER BY ordinal').iterate(source,store)){
        max=Math.max(max,row.ordinal);const identity=keyIdentity(db,JSON.parse(row.key_json)).toString('hex');
        if(rows.has(identity))throw Error('Chaves duplicadas');
        rows.set(identity,{row,active:visible(source,store,row.ordinal)});
      }
      cache.set(id,{rows,max});
    }
    return cache;
  }
  function applyPut({source,store,key,value,expectedRevision,expectedState,expectedValue,binaries=[]},withinBatch=false,batchCache=null){
    if(typeof source!=='string'||typeof store!=='string'||!Number.isSafeInteger(expectedRevision)||!['absent','present'].includes(expectedState))throw Error('Entrada inválida');
    if(!Array.isArray(binaries)||binaries.length>100)throw Error('Binários inválidos');
    if(withinBatch&&!db.isTransaction)throw Error('Transação externa ausente');
    if(!withinBatch)db.exec('BEGIN IMMEDIATE');
    try{
      const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
      if(revision!==expectedRevision){const e=Error('Conflito de revisão');e.code='VERSION_CONFLICT';throw e}
      const status=db.prepare('SELECT status FROM source_info WHERE source=?').get(source);
      const config=db.prepare('SELECT keypath_json,auto_increment FROM stores WHERE source=? AND store=?').get(source,store);
      if(status?.status!=='presente'||!config)throw Error('Store indisponível ou ainda não suportada');
      const keyPath=JSON.parse(config.keypath_json);
      if(keyPath!==null && (typeof keyPath!=='string'||!/^[$A-Za-z_][$A-Za-z0-9_]*(\.[$A-Za-z_][$A-Za-z0-9_]*)*$/.test(keyPath)))throw Error('KeyPath ainda não suportado');
      const definitions=definitionsFor(source,store);
      if(definitions.some(d=>!d || typeof d.name!=='string' || (typeof d.keyPath!=='string' && (!Array.isArray(d.keyPath)||!d.keyPath.every(x=>typeof x==='string'))) || typeof d.unique!=='boolean' || d.multiEntry))throw Error('Índice ainda não suportado');
      for(const binary of binaries){
        if(!binary || typeof binary.path!=='string' || !/^arquivos\/[a-zA-Z0-9._-]+$/.test(binary.path) || typeof binary.base64!=='string' || binary.base64.length>Math.ceil((16*1024*1024)/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(binary.base64))throw Error('Binário inválido');
        const bytes=Buffer.from(binary.base64,'base64'),hash=createHash('sha256').update(bytes).digest('hex');
        if(bytes.length>16*1024*1024 || binary.size!==bytes.length || binary.sha256!==hash)throw Error('Integridade binária divergente');
        const existing=db.prepare('SELECT size,sha256,data FROM binaries WHERE path=?').get(binary.path);
        if(existing){if(existing.size!==bytes.length || existing.sha256!==hash || !Buffer.from(existing.data).equals(bytes))throw Error('Caminho binário em conflito');}
        else db.prepare('INSERT INTO binaries(path,size,sha256,data) VALUES(?,?,?,?)').run(binary.path,bytes.length,hash,bytes);
      }
      let generator=null, generatedKey;
      if(config.auto_increment){
        generator=db.prepare('SELECT next_id FROM store_generators WHERE source=? AND store=?').get(source,store);
        if(!generator || !Number.isSafeInteger(generator.next_id) || generator.next_id<1)throw Error('Gerador indisponível');
        if(key===undefined){
          if(expectedState!=='absent'||typeof keyPath!=='string'||keyPath.includes('.')||value?.$hubType!=='object'||!Array.isArray(value.entries)||value.entries.some(entry=>entry[0]===keyPath))throw Error('Geração de chave ainda não suportada');
          generatedKey=generator.next_id;key=generatedKey;value={...value,entries:[...value.entries,[keyPath,key]]};
        }
      }
      const identity=keyIdentity(db,key);validateValue(db,value);
      if(keyPath!==null){
        const field=extractPath(value,keyPath);
        if(field===undefined)throw Error('KeyPath ausente ou ambíguo');
        if(!keyIdentity(db,field).equals(identity))throw Error('Chave diverge do KeyPath');
      }
      const uniqueKeys=definitions.filter(d=>d.unique).map(definition=>({definition,identity:indexIdentity(db,value,definition)}));
      let match=null,matchVisible=false,max=-1;
      const cached=batchCache?.get(JSON.stringify([source,store]));
      if(cached){const found=cached.rows.get(identity.toString('hex'));match=found?.row||null;matchVisible=found?.active||false;max=cached.max}
      else for(const row of db.prepare('SELECT ordinal,key_json,value_json FROM records WHERE source=? AND store=? ORDER BY ordinal').iterate(source,store)){
        max=Math.max(max,row.ordinal);
        const sameKey=keyIdentity(db,JSON.parse(row.key_json)).equals(identity);
        const active=visible(source,store,row.ordinal);
        if(sameKey){if(match)throw Error('Chaves duplicadas');match=row;matchVisible=active;}
        else if(active)for(const index of uniqueKeys){if(index.identity && indexIdentity(db,JSON.parse(row.value_json),index.definition)?.equals(index.identity))throw Error('Conflito de índice único');}
      }
      if((expectedState==='absent' && matchVisible)||(expectedState==='present' && (!matchVisible||JSON.stringify(JSON.parse(match.value_json))!==JSON.stringify(expectedValue)))){const e=Error('Conflito de valor');e.code='VERSION_CONFLICT';throw e}
      const next=JSON.stringify(value),storedKey=JSON.stringify(key),ordinal=match?match.ordinal:max+1;
      db.prepare('INSERT INTO indexed_history(source,store,ordinal,revision,previous_value,next_value) VALUES(?,?,?,?,?,?)').run(source,store,ordinal,revision+1,match?match.value_json:null,next);
      if(match)db.prepare('UPDATE records SET value_json=? WHERE source=? AND store=? AND ordinal=?').run(next,source,store,ordinal);
      else db.prepare('INSERT INTO records(source,store,ordinal,key_json,value_json) VALUES(?,?,?,?,?)').run(source,store,ordinal,storedKey,next);
      if(match&&!matchVisible)db.prepare('INSERT INTO indexed_visibility(source,store,ordinal,revision,visible) VALUES(?,?,?,?,1)').run(source,store,ordinal,revision+1);
      if(cached){cached.max=Math.max(cached.max,ordinal);cached.rows.set(identity.toString('hex'),{row:{ordinal,key_json:storedKey,value_json:next},active:true})}
      if(generator && typeof key==='number' && Number.isFinite(key) && key>=generator.next_id){
        const nextId=Math.floor(key)+1;
        if(!Number.isSafeInteger(nextId))throw Error('Gerador esgotado');
        db.prepare('UPDATE store_generators SET next_id=? WHERE source=? AND store=?').run(nextId,source,store);
      }
      db.prepare('UPDATE state SET version=? WHERE id=1').run(revision+1);
      if(!withinBatch)db.exec('COMMIT');return {revision:revision+1,...(generatedKey===undefined?{}:{generatedKey})};
    }catch(error){if(!withinBatch)db.exec('ROLLBACK');throw error}
  }
  function put(input){return applyPut(input)}
  function putBatch({expectedRevision,operations}){
    if(!Number.isSafeInteger(expectedRevision)||!Array.isArray(operations)||!operations.length||operations.length>100)throw Error('Lote inválido');
    db.exec('BEGIN IMMEDIATE');
    try{
      let revision=expectedRevision;const results=[];
      for(const operation of operations){const result=applyPut({...operation,expectedRevision:revision},true);revision=result.revision;results.push(result)}
      db.exec('COMMIT');return {revision,results};
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  function queryIndex({source,store,indexName,key,range,limit=100}){
    if(typeof source!=='string'||typeof store!=='string'||typeof indexName!=='string'||!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error('Consulta inválida');
    if((key===undefined)===(range===undefined))throw Error('Informe chave ou intervalo');
    if(range!==undefined && (!range || typeof range!=='object' || Array.isArray(range) || (!Object.hasOwn(range,'lower')&&!Object.hasOwn(range,'upper')) || (range.lowerOpen!==undefined&&typeof range.lowerOpen!=='boolean') || (range.upperOpen!==undefined&&typeof range.upperOpen!=='boolean')))throw Error('Intervalo inválido');
    db.exec('BEGIN');
    try{
      const matches=definitionsFor(source,store).filter(index=>index.name===indexName);
      if(matches.length!==1||matches[0].multiEntry)throw Error('Índice indisponível ou não suportado');
      const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
      const status=db.prepare('SELECT status FROM source_info WHERE source=?').get(source);
      if(status?.status!=='presente'||!db.prepare('SELECT 1 FROM stores WHERE source=? AND store=?').get(source,store))throw Error('Store indisponível');
      const exact=key===undefined?null:orderedKey(db,key),lower=range && Object.hasOwn(range,'lower')?orderedKey(db,range.lower):null,upper=range && Object.hasOwn(range,'upper')?orderedKey(db,range.upper):null;
      if(lower&&upper && (compareOrdered(lower,upper)>0 || (compareOrdered(lower,upper)===0 && (range.lowerOpen||range.upperOpen))))throw Error('Intervalo inválido');
      const records=[];
      for(const row of db.prepare('SELECT ordinal,key_json,value_json FROM records WHERE source=? AND store=?'+activeClause+' ORDER BY ordinal').iterate(source,store)){
        const value=JSON.parse(row.value_json),idx=indexKey(value,matches[0]);
        if(idx===null)continue;
        let sortKey;try{sortKey=orderedKey(db,idx)}catch{continue}
        if(exact&&compareOrdered(sortKey,exact)!==0)continue;
        if(lower&&(compareOrdered(sortKey,lower)<0||(range.lowerOpen&&compareOrdered(sortKey,lower)===0)))continue;
        if(upper&&(compareOrdered(sortKey,upper)>0||(range.upperOpen&&compareOrdered(sortKey,upper)===0)))continue;
        const primary=JSON.parse(row.key_json);records.push({key:primary,value,sortKey,primarySort:orderedKey(db,primary)});
      }
      records.sort((a,b)=>compareOrdered(a.sortKey,b.sortKey)||compareOrdered(a.primarySort,b.primarySort));
      const count=records.length,selected=records.slice(0,limit).map(({key,value})=>({key,value}));
      db.exec('COMMIT');return {revision,records:selected,count,truncated:count>selected.length};
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  function getInternal({source,store,key},withinTransaction=false,batchCache=null){
    if(typeof source!=='string'||typeof store!=='string'||key===undefined)throw Error('Consulta inválida');
    if(withinTransaction&&!db.isTransaction)throw Error('Transação externa ausente');
    if(!withinTransaction)db.exec('BEGIN');
    try{
      const status=db.prepare('SELECT status FROM source_info WHERE source=?').get(source);
      if(status?.status!=='presente'||!db.prepare('SELECT 1 FROM stores WHERE source=? AND store=?').get(source,store))throw Error('Store indisponível');
      const identity=keyIdentity(db,key);
      let record=null;
      const cached=batchCache?.get(JSON.stringify([source,store]));
      if(cached){const match=cached.rows.get(identity.toString('hex'));if(match?.active)record={key:JSON.parse(match.row.key_json),value:JSON.parse(match.row.value_json)}}
      else for(const row of db.prepare('SELECT ordinal,key_json,value_json FROM records WHERE source=? AND store=?'+activeClause).iterate(source,store)){
        if(keyIdentity(db,JSON.parse(row.key_json)).equals(identity)){
          if(record)throw Error('Chaves duplicadas');
          record={key:JSON.parse(row.key_json),value:JSON.parse(row.value_json)};
        }
      }
      const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
      if(!withinTransaction)db.exec('COMMIT');return {revision,record};
    }catch(error){if(!withinTransaction)db.exec('ROLLBACK');throw error}
  }
  function get(input){return getInternal(input)}
  // Remove apenas da visão ativa; o registro e as versões anteriores permanecem.
  function hideInternal({source,store,key,expectedRevision,expectedValue},withinTransaction=false){
    if(!visibilityAvailable)throw Error('Histórico de visibilidade indisponível');
    if(typeof source!=='string'||typeof store!=='string'||key===undefined||!Number.isSafeInteger(expectedRevision)||expectedValue===undefined)throw Error('Operação inválida');
    if(withinTransaction&&!db.isTransaction)throw Error('Transação externa ausente');
    if(!withinTransaction)db.exec('BEGIN IMMEDIATE');
    try{
      const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
      if(revision!==expectedRevision){const error=Error('Conflito de revisão');error.code='VERSION_CONFLICT';throw error}
      if(db.prepare('SELECT status FROM source_info WHERE source=?').get(source)?.status!=='presente'||!db.prepare('SELECT 1 FROM stores WHERE source=? AND store=?').get(source,store))throw Error('Store indisponível');
      const identity=keyIdentity(db,key);let match=null;
      for(const row of db.prepare('SELECT ordinal,key_json,value_json FROM records WHERE source=? AND store=?').iterate(source,store)){
        if(keyIdentity(db,JSON.parse(row.key_json)).equals(identity)&&visible(source,store,row.ordinal)){if(match)throw Error('Chaves duplicadas');match=row}
      }
      if(!match||JSON.stringify(JSON.parse(match.value_json))!==JSON.stringify(expectedValue)){const error=Error('Conflito de valor');error.code='VERSION_CONFLICT';throw error}
      db.prepare('INSERT INTO indexed_visibility(source,store,ordinal,revision,visible) VALUES(?,?,?,?,0)').run(source,store,match.ordinal,revision+1);
      db.prepare('UPDATE state SET version=? WHERE id=1').run(revision+1);
      if(!withinTransaction)db.exec('COMMIT');return {revision:revision+1,hidden:1};
    }catch(error){if(!withinTransaction)db.exec('ROLLBACK');throw error}
  }
  function clearInternal({source,store,expectedRevision,expectedCount},withinTransaction=false){
    if(!visibilityAvailable)throw Error('Histórico de visibilidade indisponível');
    if(typeof source!=='string'||typeof store!=='string'||!Number.isSafeInteger(expectedRevision)||!Number.isSafeInteger(expectedCount)||expectedCount<0)throw Error('Operação inválida');
    if(withinTransaction&&!db.isTransaction)throw Error('Transação externa ausente');
    if(!withinTransaction)db.exec('BEGIN IMMEDIATE');
    try{
      const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
      if(revision!==expectedRevision){const error=Error('Conflito de revisão');error.code='VERSION_CONFLICT';throw error}
      if(db.prepare('SELECT status FROM source_info WHERE source=?').get(source)?.status!=='presente'||!db.prepare('SELECT 1 FROM stores WHERE source=? AND store=?').get(source,store))throw Error('Store indisponível');
      const rows=db.prepare('SELECT ordinal FROM records WHERE source=? AND store=?').all(source,store).filter(row=>visible(source,store,row.ordinal));
      if(rows.length!==expectedCount){const error=Error('Conflito de contagem');error.code='VERSION_CONFLICT';throw error}
      if(rows.length){const insert=db.prepare('INSERT INTO indexed_visibility(source,store,ordinal,revision,visible) VALUES(?,?,?,?,0)');for(const row of rows)insert.run(source,store,row.ordinal,revision+1);db.prepare('UPDATE state SET version=? WHERE id=1').run(revision+1)}
      if(!withinTransaction)db.exec('COMMIT');return {revision:revision+(rows.length?1:0),hidden:rows.length};
    }catch(error){if(!withinTransaction)db.exec('ROLLBACK');throw error}
  }
  function binary({path,expectedRevision}){
    if(typeof path!=='string'||!/^arquivos\/[a-zA-Z0-9._-]+$/.test(path)||(expectedRevision!==undefined&&!Number.isSafeInteger(expectedRevision)))throw Error('Referência inválida');
    db.exec('BEGIN');
    try{
      const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
      if(expectedRevision!==undefined&&revision!==expectedRevision){const e=Error('Conflito de revisão');e.code='VERSION_CONFLICT';throw e}
      const bytes=readBinary(db,{path});if(bytes.length>16*1024*1024)throw Error('Binário excede limite');
      const result={revision,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')};
      db.exec('COMMIT');return result;
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  // Paginação por revisão evita misturar capturas após alterações concorrentes.
  function scanInternal({source,store,indexName=null,range=null,direction='next',limit=100,offset=0,expectedRevision},withinTransaction=false){
    if(typeof source!=='string'||typeof store!=='string'||(indexName!==null&&typeof indexName!=='string')||!['next','prev'].includes(direction)||!Number.isSafeInteger(limit)||limit<1||limit>500||!Number.isSafeInteger(offset)||offset<0||(offset>0&&!Number.isSafeInteger(expectedRevision)))throw Error('Consulta inválida');
    if(range!==null&&(!range||typeof range!=='object'||Array.isArray(range)||(range.lowerOpen!==undefined&&typeof range.lowerOpen!=='boolean')||(range.upperOpen!==undefined&&typeof range.upperOpen!=='boolean')))throw Error('Intervalo inválido');
    if(withinTransaction&&!db.isTransaction)throw Error('Transação externa ausente');
    if(!withinTransaction)db.exec('BEGIN');
    try{
      const revision=db.prepare('SELECT version FROM state WHERE id=1').get().version;
      if(expectedRevision!==undefined&&revision!==expectedRevision){const e=Error('Conflito de revisão');e.code='VERSION_CONFLICT';throw e}
      const status=db.prepare('SELECT status FROM source_info WHERE source=?').get(source);
      if(status?.status!=='presente'||!db.prepare('SELECT 1 FROM stores WHERE source=? AND store=?').get(source,store))throw Error('Store indisponível');
      let definition=null;
      if(indexName!==null){const matches=definitionsFor(source,store).filter(index=>index.name===indexName);if(matches.length!==1||matches[0].multiEntry)throw Error('Índice indisponível ou não suportado');definition=matches[0]}
      const lower=range&&Object.hasOwn(range,'lower')?orderedKey(db,range.lower):null,upper=range&&Object.hasOwn(range,'upper')?orderedKey(db,range.upper):null;
      if(lower&&upper&&(compareOrdered(lower,upper)>0||(compareOrdered(lower,upper)===0&&(range.lowerOpen||range.upperOpen))))throw Error('Intervalo inválido');
      const rows=[];
      for(const row of db.prepare('SELECT ordinal,key_json,value_json FROM records WHERE source=? AND store=?'+activeClause).iterate(source,store)){
        const key=JSON.parse(row.key_json),value=JSON.parse(row.value_json),candidate=definition?indexKey(value,definition):key;
        if(candidate===null)continue;
        let sort;try{sort=orderedKey(db,candidate)}catch{if(definition)continue;throw Error('Chave inválida')}
        if(lower&&(compareOrdered(sort,lower)<0||(range.lowerOpen&&compareOrdered(sort,lower)===0)))continue;
        if(upper&&(compareOrdered(sort,upper)>0||(range.upperOpen&&compareOrdered(sort,upper)===0)))continue;
        rows.push({key,value,indexKey:definition?candidate:undefined,sort,primary:orderedKey(db,key)});
      }
      rows.sort((a,b)=>(compareOrdered(a.sort,b.sort)||compareOrdered(a.primary,b.primary))*(direction==='prev'?-1:1));
      const records=rows.slice(offset,offset+limit).map(({key,value,indexKey})=>indexKey===undefined?{key,value}:{key,value,indexKey}),nextOffset=offset+records.length<rows.length?offset+records.length:null;
      if(!withinTransaction)db.exec('COMMIT');return {revision,records,count:rows.length,nextOffset};
    }catch(error){if(!withinTransaction)db.exec('ROLLBACK');throw error}
  }
  function scan(input){return scanInternal(input)}
  return {put,putBatch,queryIndex,get,scan,binary,describeInTransaction,createClickBankWriteCache,getInTransaction(input,cache){return getInternal(input,true,cache)},scanInTransaction(input){return scanInternal(input,true)},putInTransaction(input,cache){return applyPut(input,true,cache)},hideInTransaction(input){return hideInternal(input,true)},clearInTransaction(input){return clearInternal(input,true)}};
}
