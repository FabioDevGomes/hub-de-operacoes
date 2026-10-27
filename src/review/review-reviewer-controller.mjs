import {createReviewerState,reviewerBinding,reviewerReadiness,REVIEWER_FIELDS,RATING_CRITERIA,TESTIMONIAL_SLOTS,TESTIMONIAL_FIELDS} from './review-reviewer-domain.mjs?v=2';
import {loadReviewer,saveReviewer} from './review-reviewer-storage.mjs?v=2';
import {listDrafts} from './review-materials-storage.mjs?v=1';
export function createReviewerController({storage,materials,now}){
  const buffers=new Map();
  function ensure(id=materials.current().draft.id){if(!buffers.has(id)){const draft=materials.list().find(item=>item.draft.id===id)?.draft;if(!draft)throw new Error('Review não encontrada.');try{const entry=loadReviewer(storage,draft);buffers.set(id,{...entry,saved:JSON.stringify(entry.state),error:''})}catch(error){const state=createReviewerState(draft);buffers.set(id,{state,revision:0,savedAt:null,saved:JSON.stringify(state),error:error.message})}}return buffers.get(id)}
  return {
    current:()=>ensure(),hasUnsaved:()=>[...buffers.values()].some(item=>item.saved!==JSON.stringify(item.state)),
    update(path,value){
      const item=ensure(),state=item.state,parts=path.split('.');let target,key,boolean=false;
      if(parts[0]==='reviewer'&&parts.length===2&&(REVIEWER_FIELDS.some(([field])=>field===parts[1])||['realUseConfirmed','publishConsent'].includes(parts[1]))){target=state.reviewer;key=parts[1];boolean=['realUseConfirmed','publishConsent'].includes(key);if(['displayName','source'].includes(key)){state.reviewer.realUseConfirmed=false;state.reviewer.publishConsent=false}}
      else if(parts[0]==='rating'&&parts.length===2&&['include','confirmed'].includes(parts[1])){target=state.rating;key=parts[1];boolean=true}
      else if(parts[0]==='rating'&&parts.length===3&&RATING_CRITERIA.some(([field])=>field===parts[1])&&['score','reason'].includes(parts[2])){target=state.rating.criteria[parts[1]];key=parts[2];state.rating.confirmed=false}
      else if(parts[0]==='testimonials'&&parts.length===3&&TESTIMONIAL_SLOTS.some(([slot])=>slot===parts[1])&&(TESTIMONIAL_FIELDS.some(([field])=>field===parts[2])||['realConfirmed','publishConsent'].includes(parts[2]))){target=state.testimonials[parts[1]];key=parts[2];boolean=['realConfirmed','publishConsent'].includes(key);if(!boolean){target.publishConsent=false;if(key!=='avatarUrl')target.realConfirmed=false}}
      else if(path==='includeTestimonials'){target=state;key=path;boolean=true}else return;
      const next=boolean?Boolean(value):String(value);
      if(target[key]!==next&&parts[0]==='reviewer'&&!boolean){state.reviewer.publishConsent=false;state.reviewer.realUseConfirmed=false;state.rating.confirmed=false}
      target[key]=next;state.reviewed=false;
    },
    confirmBinding(){const state=ensure().state;const binding=reviewerBinding(materials.current().draft);if(state.binding!==binding){state.reviewer.realUseConfirmed=false;state.reviewer.publishConsent=false;state.rating.confirmed=false;for(const [slot] of TESTIMONIAL_SLOTS){state.testimonials[slot].realConfirmed=false;state.testimonials[slot].publishConsent=false}}state.binding=binding;state.reviewed=false},
    setReviewed(value){const state=ensure().state;if(value){const readiness=reviewerReadiness(state,materials.current().draft);if(!readiness.ready)throw new Error(readiness.gaps.slice(0,5).join('\n'))}state.reviewed=Boolean(value)},
    save(id=materials.current().draft.id){const item=ensure(id);if(item.error)throw new Error(item.error);const material=materials.list().find(entry=>entry.draft.id===id),latest=listDrafts(storage).items.find(entry=>entry.draft.id===id);if(!material?.revision||!latest||material.dirty)throw new Error('Salve primeiro os materiais da review no passo 1.');if(material.revision!==latest.revision)throw new Error('Os materiais mudaram em outra aba. Exporte as edições e recarregue.');if(!item.revision)item.state.binding=reviewerBinding(material.draft);if(item.state.reviewed&&!reviewerReadiness(item.state,latest.draft).ready)item.state.reviewed=false;const saved=saveReviewer(storage,item.state,{expectedRevision:item.revision,now});Object.assign(item,{revision:saved.revision,savedAt:saved.savedAt,saved:JSON.stringify(item.state)});return saved}
  };
}
