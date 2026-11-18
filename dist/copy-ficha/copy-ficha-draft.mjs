// Keep the existing key and unknown legacy properties; persist the structured ficha in this browser-local draft.
export const STORAGE_KEY='copy-ficha-draft-v1';
export function draftStorageKey(scopeId=''){
  const scope=String(scopeId||'').trim();
  return scope?`${STORAGE_KEY}:delivery:${encodeURIComponent(scope)}`:STORAGE_KEY;
}
export function readDraft(storage,scopeId=''){
  try{storage??=globalThis.localStorage;return JSON.parse(storage.getItem(draftStorageKey(scopeId))||'null')}catch{return null}
}
export function listDrafts(storage){
  try{
    storage??=globalThis.localStorage;
    const drafts=[];
    for(let index=0;index<storage.length;index++){
      const key=storage.key(index);
      if(key!==STORAGE_KEY&&!key?.startsWith(`${STORAGE_KEY}:delivery:`))continue;
      let draft;
      try{draft=JSON.parse(storage.getItem(key)||'null')}catch{continue}
      if(!draft||typeof draft!=='object'||!String(draft.structuredFicha||'').trim()||!String(draft.destination||'').trim())continue;
      drafts.push({key,draft});
    }
    return drafts.sort((left,right)=>String(right.draft.savedAtUtc||'').localeCompare(String(left.draft.savedAtUtc||'')));
  }catch{return[]}
}
export function writeDraft(data,storage,scopeId=''){
  try{
    storage??=globalThis.localStorage;
    const key=draftStorageKey(scopeId),previous=readDraft(storage,scopeId)||{},draft={...previous,...data};
    if(Array.isArray(previous.packages))draft.packages=previous.packages;
    delete draft.packagesManuallyEdited;
    storage.setItem(key,JSON.stringify(draft));
  }catch{}
}
export function clearDraft(storage,scopeId=''){
  try{storage??=globalThis.localStorage;storage.removeItem(draftStorageKey(scopeId))}catch{}
}
