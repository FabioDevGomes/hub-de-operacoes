import {normalizeDraft,validateDraft} from './review-materials-domain.mjs?v=1';
export const DRAFT_PREFIX='hub:review:materials:v1:';
function draftKey(id){if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new Error('Identificador da review inválido.');return DRAFT_PREFIX+id}
function readHistory(storage,id){
  const raw=storage.getItem(draftKey(id));
  if(raw===null)return [];
  const history=JSON.parse(raw);
  if(!Array.isArray(history)||!history.length||history.some((entry,index)=>!entry||entry.revision!==index+1||entry.draft?.id!==id||entry.draft?.schema!=='hub-review-materials-v1'||typeof entry.savedAt!=='string'))throw new Error('Rascunho salvo em formato inválido. O conteúdo original foi preservado.');
  return history;
}
export function listDrafts(storage){
  const items=[],warnings=[];
  for(let index=0;index<storage.length;index++){
    const key=storage.key(index);if(!key?.startsWith(DRAFT_PREFIX))continue;
    const id=key.slice(DRAFT_PREFIX.length);
    try{const latest=readHistory(storage,id).at(-1);items.push({...latest,draft:normalizeDraft(latest.draft)})}catch{warnings.push('Um rascunho não pôde ser lido e foi preservado sem alterações.')}
  }
  return {items:items.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)),warnings};
}
export function saveDraft(storage,value,{expectedRevision=0,now=()=>new Date().toISOString()}={}){
  const draft=normalizeDraft(value),errors=validateDraft(draft);
  if(Object.keys(errors).length){const error=new Error('Confira os campos destacados antes de salvar.');error.fields=errors;throw error}
  const history=readHistory(storage,draft.id),latest=history.at(-1);
  if((latest?.revision||0)!==expectedRevision)throw new Error('Esta review foi alterada em outra aba. Baixe seu rascunho antes de recarregar; suas edições continuam nesta tela.');
  if(latest&&JSON.stringify(normalizeDraft(latest.draft))===JSON.stringify(draft))return latest;
  const entry={revision:expectedRevision+1,savedAt:now(),draft};
  storage.setItem(draftKey(draft.id),JSON.stringify([...history,entry]));
  return entry;
}
