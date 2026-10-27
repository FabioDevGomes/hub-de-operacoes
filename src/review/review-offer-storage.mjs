import {OFFER_SCHEMA,OFFER_FIELDS,PACKAGE_FIELDS,createOfferState,validateOffer} from './review-offer-domain.mjs?v=1';
export const OFFER_PREFIX='hub:review:offer:v1:';
function keyFor(id){if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new Error('Review inválida.');return OFFER_PREFIX+id}
function assertState(state,id){
  if(!state||state.schema!==OFFER_SCHEMA||state.reviewId!==id||typeof state.binding!=='string'||!OFFER_FIELDS.every(([key])=>typeof state[key]==='string')||!['includeDiscount','confirmed','reviewed'].every(key=>typeof state[key]==='boolean')||!Array.isArray(state.packages)||state.packages.length>50||new Set(state.packages.map(row=>row?.id)).size!==state.packages.length||!state.packages.every(row=>row&&/^[a-zA-Z0-9-]{1,100}$/.test(row.id)&&typeof row.enabled==='boolean'&&['unknown','free','paid'].includes(row.shipping)&&PACKAGE_FIELDS.every(([key])=>typeof row[key]==='string')))throw new Error('Rascunho da oferta inválido. O registro original foi preservado.');
}
function historyFor(storage,id){const raw=storage.getItem(keyFor(id));if(raw===null)return [];const history=JSON.parse(raw);if(!Array.isArray(history)||!history.length)throw new Error('Histórico da oferta inválido.');for(const [index,entry] of history.entries()){if(!entry||entry.revision!==index+1||typeof entry.savedAt!=='string')throw new Error('Revisões da oferta inválidas.');assertState(entry.state,id)}return history}
export function loadOffer(storage,draft){return historyFor(storage,draft.id).at(-1)||{revision:0,savedAt:null,state:createOfferState(draft)}}
export function saveOffer(storage,state,{expectedRevision=0,now=()=>new Date().toISOString()}={}){
  assertState(state,state.reviewId);const errors=validateOffer(state);if(Object.keys(errors).length){const error=new Error(Object.values(errors).join('\n'));error.fields=errors;throw error}
  const history=historyFor(storage,state.reviewId),latest=history.at(-1);if((latest?.revision||0)!==expectedRevision)throw new Error('A oferta foi alterada em outra aba. Exporte as edições antes de recarregar.');
  if(latest&&JSON.stringify(latest.state)===JSON.stringify(state))return latest;
  const entry={revision:expectedRevision+1,savedAt:now(),state};storage.setItem(keyFor(state.reviewId),JSON.stringify([...history,entry]));return entry;
}
