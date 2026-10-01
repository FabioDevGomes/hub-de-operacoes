// Keep the existing key and unknown legacy properties; pasted ficha is session-only.
export const STORAGE_KEY='copy-ficha-draft-v1';
export function readDraft(storage){
  try{storage??=globalThis.localStorage;return JSON.parse(storage.getItem(STORAGE_KEY)||'null')}catch{return null}
}
export function writeDraft(data,storage){
  try{
    storage??=globalThis.localStorage;
    const previous=readDraft(storage)||{},draft={...previous,...data};
    if(Array.isArray(previous.packages))draft.packages=previous.packages;
    delete draft.packagesManuallyEdited;
    storage.setItem(STORAGE_KEY,JSON.stringify(draft));
  }catch{}
}
export function clearDraft(storage){
  try{storage??=globalThis.localStorage;storage.removeItem(STORAGE_KEY)}catch{}
}
