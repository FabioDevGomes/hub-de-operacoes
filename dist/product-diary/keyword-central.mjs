const PREFIX='hub:campaign-keyword-inventory:v1:';
function identity(info){
 const manager=String(info?.managerCustomerId||''),customer=String(info?.customerId||''),campaign=String(info?.campaignId||'');
 if(!/^\d{10}$/.test(manager)||!/^\d{10}$/.test(customer)||!/^[1-9]\d{0,19}$/.test(campaign))throw Error('Identidade da campanha inválida.');
 return `${manager}:${customer}:${campaign}`;
}
export function createKeywordCentralClient({fetchImpl=globalThis.fetch}={}){
 async function request(path,input){const response=await fetchImpl('/central'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!response.ok){const e=Error('Não foi possível acessar a base central.');e.code=response.status===409?'VERSION_CONFLICT':'CENTRAL_ERROR';throw e}return response.json()}
 async function list(info){
  const prefix=PREFIX+identity(info)+':';let offset=0,revision,items=[];
  do{const response=await request('/transaction/read',{...(revision===undefined?{}:{expectedRevision:revision}),operations:[{type:'local_list',input:{prefix,offset,limit:100}}]});const row=response?.results?.[0];if(!Number.isSafeInteger(response?.revision)||row?.revision!==response.revision||!Array.isArray(row.records)||(revision!==undefined&&revision!==response.revision))throw Error('Leitura central incompleta.');revision=response.revision;for(const record of row.records){const value=JSON.parse(record.value);if(value?.schemaVersion!==1||value.identity!==identity(info)||value.result?.verified!==true||value.result.campaign?.customerId!==String(info.customerId)||value.result.campaign?.campaignId!==String(info.campaignId)||!Array.isArray(value.result.positiveKeywords)||!Array.isArray(value.result.negativeKeywords)||!Number.isFinite(Date.parse(value.result.readAtUtc)))throw Error('Leitura central inválida.');items.push(value.result)}offset=row.nextOffset;if(offset!==null&&(!Number.isInteger(offset)||offset<1))throw Error('Paginação central inválida.')}while(offset!==null);
  return items.sort((a,b)=>String(b.readAtUtc).localeCompare(String(a.readAtUtc)))[0]||null;
 }
 async function save(info,result){
  const id=identity(info);if(result?.verified!==true||result.campaign?.customerId!==String(info.customerId)||result.campaign?.campaignId!==String(info.campaignId)||!Array.isArray(result.positiveKeywords)||!Array.isArray(result.negativeKeywords)||!Number.isFinite(Date.parse(result.readAtUtc)))throw Error('Leitura confirmada inválida.');
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
  const key=PREFIX+id+':'+nonce,value=JSON.stringify({schemaVersion:1,identity:id,result});
  for(let attempt=0;attempt<3;attempt++){try{const current=await request('/transaction/read',{operations:[{type:'local_get',input:{key}}]});const row=current?.results?.[0];if(!Number.isSafeInteger(current?.revision)||row?.revision!==current.revision||row.state!=='absent')throw Error('Chave central indisponível.');const saved=await request('/transaction',{expectedRevision:current.revision,operations:[{type:'local_put',input:{key,value,expectedState:'absent'}}]});if(!Number.isSafeInteger(saved?.revision)||saved.results?.length!==1)throw Error('Gravação central não confirmada.');return result}catch(error){if(error.code!=='VERSION_CONFLICT'||attempt===2)throw error}}
 }
 return {list,save};
}
