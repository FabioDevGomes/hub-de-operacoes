import {IMAGE_SCHEMA,IMAGE_ITEMS,IMAGE_FIELDS,createImagesState,validateImages} from './review-images-domain.mjs?v=1';
export const IMAGE_PREFIX='hub:review:images:v1:';
function keyFor(id){if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new Error('Review inválida.');return IMAGE_PREFIX+id}
function assertState(state,id){
  if(!state||state.schema!==IMAGE_SCHEMA||state.reviewId!==id||typeof state.binding!=='string'||!Number.isSafeInteger(state.offerRevision)||state.offerRevision<0||typeof state.fixedConfirmed!=='boolean'||typeof state.reviewed!=='boolean'||!['pending','source','manual'].includes(state.hero?.choice)||!IMAGE_FIELDS.every(field=>typeof state.hero[field]==='string'||typeof state.hero[field]==='boolean')||!IMAGE_ITEMS.every(item=>IMAGE_FIELDS.every(field=>typeof state.items?.[item.key]?.[field]==='string'||typeof state.items[item.key][field]==='boolean'))||!IMAGE_FIELDS.every(field=>typeof state.customBadge?.[field]==='string'||typeof state.customBadge?.[field]==='boolean'))throw new Error('Rascunho de imagens inválido. O registro original foi preservado.');
}
function historyFor(storage,id){const raw=storage.getItem(keyFor(id));if(raw===null)return [];const history=JSON.parse(raw);if(!Array.isArray(history)||!history.length)throw new Error('Histórico de imagens inválido.');for(const [index,entry] of history.entries()){if(!entry||entry.revision!==index+1||typeof entry.savedAt!=='string')throw new Error('Revisões de imagens inválidas.');assertState(entry.state,id)}return history}
export function loadImages(storage,draft){return historyFor(storage,draft.id).at(-1)||{revision:0,savedAt:null,state:createImagesState(draft)}}
export function saveImages(storage,state,{expectedRevision=0,now=()=>new Date().toISOString()}={}){
  assertState(state,state.reviewId);const errors=validateImages(state);if(Object.keys(errors).length){const error=new Error(Object.values(errors).join('\n'));error.fields=errors;throw error}
  const history=historyFor(storage,state.reviewId),latest=history.at(-1);if((latest?.revision||0)!==expectedRevision)throw new Error('As imagens foram alteradas em outra aba. Exporte suas edições antes de recarregar.');
  if(latest&&JSON.stringify(latest.state)===JSON.stringify(state))return latest;
  const entry={revision:expectedRevision+1,savedAt:now(),state};storage.setItem(keyFor(state.reviewId),JSON.stringify([...history,entry]));return entry;
}
