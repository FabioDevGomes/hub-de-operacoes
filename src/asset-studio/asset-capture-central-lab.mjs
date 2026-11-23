// Ponte experimental para o cache de capturas; dados e arquivos originais não são apagados.
const SOURCE='hub-asset-studio-capture-cache',STORE='captures';
function base64(bytes){let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value)}
async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function createAssetCaptureLabBridge({request,encode,decode}){
 if(typeof request!=='function'||typeof encode!=='function'||typeof decode!=='function')throw Error('Ponte indisponível');
 const observed=new Map();
 async function get(key){
  if(typeof key!=='string'||!key)throw Error('Chave inválida');
  const snapshot=await request('/transaction/read',{operations:[{type:'indexed_get',input:{source:SOURCE,store:STORE,key}}]});
  const result=snapshot?.results?.[0];if(!Number.isSafeInteger(snapshot?.revision)||snapshot.results?.length!==1||result?.revision!==snapshot.revision||!Object.hasOwn(result,'record')||(result.record!==null&&(!result.record||result.record.key!==key||!Object.hasOwn(result.record,'value'))))throw Error('Resposta incompleta');
  return {revision:snapshot.revision,record:result.record};
 }
 const readBinary=async ref=>{
  const result=await request('/indexed/binary',{path:ref.path});
  if(!Number.isSafeInteger(result?.size)||typeof result.base64!=='string')throw Error('Binário indisponível');
  const bytes=Uint8Array.from(atob(result.base64),char=>char.charCodeAt(0));
  if(bytes.length!==result.size||await hash(bytes)!==result.sha256||ref.size!==result.size||ref.sha256!==result.sha256)throw Error('Integridade binária divergente');
  return bytes;
 };
 return {
  async read(key){const result=await get(key);observed.set(key,result);return result.record?decode(result.record.value,readBinary):null},
  async write(key,value){
   const previous=observed.get(key)||await get(key),current=await get(key),binaries=[];
   if(JSON.stringify(previous.record?.value??null)!==JSON.stringify(current.record?.value??null)){const error=Error('Captura alterada em outra sessão; atualize antes de salvar.');error.code='VERSION_CONFLICT';throw error}
   const encoded=await encode(value,async(bytes,meta)=>{
    if(!(bytes instanceof Uint8Array)||bytes.length>16*1024*1024)throw Error('Imagem excede limite');
    const sha256=await hash(bytes),path=`arquivos/sha-${sha256}.bin`;
    binaries.push({path,size:bytes.length,sha256,base64:base64(bytes)});
    return {path,size:bytes.length,sha256,mime:meta.mime||'',...(meta.name?{name:meta.name}:{}),...(meta.lastModified===undefined?{}:{lastModified:meta.lastModified})};
   });
   const input={source:SOURCE,store:STORE,key,value:encoded,expectedState:previous.record?'present':'absent',...(previous.record?{expectedValue:previous.record.value}:{}),binaries};
   const result=await request('/transaction',{expectedRevision:current.revision,operations:[{type:'indexed_put',input}]});
   if(!Number.isSafeInteger(result?.revision)||result.results?.length!==1||result.results[0]?.revision!==result.revision)throw Error('Confirmação inválida');
   const baseRevision=previous.revision;for(const item of observed.values())if(item.revision===baseRevision)item.revision=result.revision;
   observed.set(key,{revision:result.revision,record:{key,value:encoded}});
  },
  async remove(key){
   const previous=observed.get(key)||await get(key),current=await get(key);
   if(JSON.stringify(previous.record?.value??null)!==JSON.stringify(current.record?.value??null)){const error=Error('Captura alterada em outra sessão; atualize antes de remover.');error.code='VERSION_CONFLICT';throw error}
   if(!previous.record)return;
   const result=await request('/transaction',{expectedRevision:current.revision,operations:[{type:'indexed_hide',input:{source:SOURCE,store:STORE,key,expectedValue:previous.record.value}}]});
   if(!Number.isSafeInteger(result?.revision)||result.results?.length!==1||result.results[0]?.revision!==result.revision)throw Error('Confirmação inválida');
   const baseRevision=previous.revision;for(const item of observed.values())if(item.revision===baseRevision)item.revision=result.revision;
   observed.set(key,{revision:result.revision,record:null});
  }
 };
}

