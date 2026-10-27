import {REVIEWER_SCHEMA,REVIEWER_FIELDS,RATING_CRITERIA,TESTIMONIAL_SLOTS,TESTIMONIAL_FIELDS,createReviewerState,validateReviewer} from './review-reviewer-domain.mjs?v=2';
export const REVIEWER_PREFIX='hub:review:reviewer:v1:';
function keyFor(id){if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new Error('Review inválida.');return REVIEWER_PREFIX+id}
function assertState(state,id){
  const strings=(object,fields)=>object&&fields.every(([key])=>typeof object[key]==='string');
  if(!state||state.schema!==REVIEWER_SCHEMA||state.reviewId!==id||typeof state.binding!=='string'||typeof state.reviewed!=='boolean'||typeof state.includeTestimonials!=='boolean'||!strings(state.reviewer,REVIEWER_FIELDS)||typeof state.reviewer.realUseConfirmed!=='boolean'||typeof state.reviewer.publishConsent!=='boolean'||!state.rating||state.rating.method!=='equal-mean-v1'||typeof state.rating.include!=='boolean'||typeof state.rating.confirmed!=='boolean'||!RATING_CRITERIA.every(([key])=>strings(state.rating.criteria?.[key],[['score'],['reason']]))||!TESTIMONIAL_SLOTS.every(([key])=>strings(state.testimonials?.[key],TESTIMONIAL_FIELDS)&&typeof state.testimonials[key].realConfirmed==='boolean'&&typeof state.testimonials[key].publishConsent==='boolean'))throw new Error('Rascunho de reviewer inválido. O registro original foi preservado.');
}
function historyFor(storage,id){const raw=storage.getItem(keyFor(id));if(raw===null)return [];const history=JSON.parse(raw);if(!Array.isArray(history)||!history.length)throw new Error('Histórico do reviewer inválido.');for(const [index,entry] of history.entries()){if(!entry||entry.revision!==index+1||typeof entry.savedAt!=='string')throw new Error('Revisões do reviewer inválidas.');assertState(entry.state,id)}return history}
export function loadReviewer(storage,draft){return historyFor(storage,draft.id).at(-1)||{revision:0,savedAt:null,state:createReviewerState(draft)}}
export function saveReviewer(storage,state,{expectedRevision=0,now=()=>new Date().toISOString()}={}){
  assertState(state,state.reviewId);const errors=validateReviewer(state,{draft:true});if(Object.keys(errors).length){const error=new Error(Object.values(errors).join('\n'));error.fields=errors;throw error}
  const history=historyFor(storage,state.reviewId),latest=history.at(-1);if((latest?.revision||0)!==expectedRevision)throw new Error('O reviewer foi alterado em outra aba. Exporte suas edições antes de recarregar.');
  if(latest&&JSON.stringify(latest.state)===JSON.stringify(state))return latest;
  const entry={revision:expectedRevision+1,savedAt:now(),state};storage.setItem(keyFor(state.reviewId),JSON.stringify([...history,entry]));return entry;
}
