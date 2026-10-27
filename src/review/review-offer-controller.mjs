import {createOfferState,createPackage,offerBinding,offerReadiness,OFFER_FIELDS,PACKAGE_FIELDS} from './review-offer-domain.mjs?v=1';
import {loadOffer,saveOffer} from './review-offer-storage.mjs?v=1';
import {listDrafts} from './review-materials-storage.mjs?v=1';
export function createOfferController({storage,materials,now}){
  const buffers=new Map();
  function ensure(id=materials.current().draft.id){if(!buffers.has(id)){const draft=materials.list().find(item=>item.draft.id===id)?.draft;if(!draft)throw new Error('Review não encontrada.');try{const entry=loadOffer(storage,draft);buffers.set(id,{...entry,saved:JSON.stringify(entry.state),error:''})}catch(error){const state=createOfferState(draft);buffers.set(id,{state,revision:0,savedAt:null,saved:JSON.stringify(state),error:error.message})}}return buffers.get(id)}
  return {
    current:()=>ensure(),hasUnsaved:()=>[...buffers.values()].some(item=>item.saved!==JSON.stringify(item.state)),
    update(path,value){const state=ensure().state,parts=path.split('.');let target=state,key=path,boolean=false;
      if(parts.length===1&&(OFFER_FIELDS.some(([field])=>field===key)||['includeDiscount','confirmed'].includes(key)))boolean=['includeDiscount','confirmed'].includes(key);
      else if(parts[0]==='packages'&&parts.length===3){target=state.packages.find(row=>row.id===parts[1]);key=parts[2];if(!target||!PACKAGE_FIELDS.some(([field])=>field===key)&&!['enabled','shipping'].includes(key))return;boolean=key==='enabled';if(key==='shipping'&&!['unknown','free','paid'].includes(value))return}
      else return;
      const next=boolean?Boolean(value):String(value);if(target[key]===next)return;target[key]=next;state.reviewed=false;if(path!=='confirmed')state.confirmed=false;
    },
    addPackage(){const state=ensure().state;if(state.packages.length>=50)throw new Error('Limite de 50 pacotes por review.');let i=1;while(state.packages.some(row=>row.id==='package-'+i))i++;state.packages.push(createPackage('package-'+i));state.confirmed=false;state.reviewed=false},
    confirmBinding(){const state=ensure().state;if(state.binding!==offerBinding(materials.current().draft)){state.binding=offerBinding(materials.current().draft);state.confirmed=false;state.reviewed=false}},
    setReviewed(value){const state=ensure().state;if(value){const quality=offerReadiness(state,materials.current().draft);if(!quality.ready)throw new Error(quality.gaps.slice(0,6).join('\n'))}state.reviewed=Boolean(value)},
    save(id=materials.current().draft.id){const item=ensure(id);if(item.error)throw new Error(item.error);const material=materials.list().find(entry=>entry.draft.id===id),latest=listDrafts(storage).items.find(entry=>entry.draft.id===id);if(!material?.revision||!latest||material.dirty)throw new Error('Salve primeiro os materiais da review no passo 1.');if(material.revision!==latest.revision)throw new Error('Os materiais mudaram em outra aba. Exporte as edições e recarregue.');if(item.state.reviewed&&!offerReadiness(item.state,latest.draft).ready)item.state.reviewed=false;const saved=saveOffer(storage,item.state,{expectedRevision:item.revision,now});Object.assign(item,{revision:saved.revision,savedAt:saved.savedAt,saved:JSON.stringify(item.state)});return saved}
  };
}
