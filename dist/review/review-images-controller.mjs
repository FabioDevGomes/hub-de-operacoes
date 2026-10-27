import {createImagesState,offerBinding,imagesReadiness,IMAGE_ITEMS,IMAGE_FIELDS} from './review-images-domain.mjs?v=1';
import {loadImages,saveImages} from './review-images-storage.mjs?v=1';
import {listDrafts} from './review-materials-storage.mjs?v=1';
import {loadOffer} from './review-offer-storage.mjs?v=1';
export function createImagesController({storage,materials,offer,now}){
  const buffers=new Map();
  function ensure(id=materials.current().draft.id){if(!buffers.has(id)){const draft=materials.list().find(item=>item.draft.id===id)?.draft;if(!draft)throw new Error('Review não encontrada.');try{const entry=loadImages(storage,draft);buffers.set(id,{...entry,saved:JSON.stringify(entry.state),error:''})}catch(error){const state=createImagesState(draft);buffers.set(id,{state,revision:0,savedAt:null,saved:JSON.stringify(state),error:error.message})}}return buffers.get(id)}
  function offerEntry(draft){try{const currentOffer=offer.current(),item=loadOffer(storage,draft);if(currentOffer.state.reviewId!==draft.id||currentOffer.saved!==JSON.stringify(currentOffer.state)||currentOffer.revision!==item.revision)return null;return {revision:item.revision,state:JSON.parse(currentOffer.saved)}}catch{return null}}
  return {
    current:()=>ensure(),hasUnsaved:()=>[...buffers.values()].some(item=>item.saved!==JSON.stringify(item.state)),
    readiness(){const draft=materials.current().draft;return imagesReadiness(ensure().state,draft,{offerEntry:offerEntry(draft),offerDraft:draft})},
    update(path,value){const state=ensure().state,parts=path.split('.');let target=state,key=path,boolean=false;
      if(parts.length===1&&path==='fixedConfirmed'){target=state;key=path;boolean=true}
      else if(parts.length===2&&parts[0]==='hero'&&['choice','candidate',...IMAGE_FIELDS].includes(parts[1])){target=state.hero;key=parts[1];boolean=['confirmed'].includes(key);if(key==='choice'&&!['pending','source','manual'].includes(value))return}
      else if(parts.length===3&&parts[0]==='items'&&IMAGE_ITEMS.some(item=>item.key===parts[1])&&(IMAGE_FIELDS.includes(parts[2])||parts[2]==='kind')){target=state.items[parts[1]];key=parts[2];boolean=['confirmed','sixBottlesConfirmed'].includes(key);if(key==='kind'&&!(parts[1]==='ingredients'&&['image','text'].includes(value)))return}
      else if(parts.length===2&&parts[0]==='customBadge'&&IMAGE_FIELDS.includes(parts[1])){target=state.customBadge;key=parts[1];boolean=key==='confirmed'}
      else return;
      const next=boolean?Boolean(value):String(value);if(target[key]===next)return;target[key]=next;
      if(parts[0]==='hero'&&key!=='confirmed')state.hero.confirmed=false;
      if(parts[0]==='items'&&key!=='confirmed'&&key!=='sixBottlesConfirmed')state.items[parts[1]].confirmed=false;
      if(parts[0]==='customBadge'&&key!=='confirmed')state.customBadge.confirmed=false;
      state.reviewed=false;
    },
    confirmBinding(){const state=ensure().state,draft=materials.current().draft,current=offerEntry(draft);if(!current||current.state.binding!==offerBinding(draft))throw new Error('A oferta precisa estar salva e confirmada para o produto e a página atuais no passo 4.');const changed=state.binding!==offerBinding(draft)||state.offerRevision!==current.revision;if(changed){state.binding=offerBinding(draft);state.offerRevision=current.revision;state.fixedConfirmed=false;state.hero.confirmed=false;for(const item of IMAGE_ITEMS){state.items[item.key].confirmed=false;if(item.key==='sixPack')state.items[item.key].sixBottlesConfirmed=false}state.customBadge.confirmed=false;state.reviewed=false}},
    setReviewed(value){const state=ensure().state;if(value){const quality=this.readiness();if(!quality.ready)throw new Error(quality.gaps.slice(0,8).join('\n'))}state.reviewed=Boolean(value)},
    save(id=materials.current().draft.id){const item=ensure(id);if(item.error)throw new Error(item.error);const material=materials.list().find(entry=>entry.draft.id===id),latest=listDrafts(storage).items.find(entry=>entry.draft.id===id);if(!material?.revision||!latest||material.dirty)throw new Error('Salve primeiro os materiais da review no passo 1.');if(material.revision!==latest.revision)throw new Error('Os materiais mudaram em outra aba. Exporte as edições e recarregue.');if(item.state.reviewed&&!this.readiness().ready)item.state.reviewed=false;const saved=saveImages(storage,item.state,{expectedRevision:item.revision,now});Object.assign(item,{revision:saved.revision,savedAt:saved.savedAt,saved:JSON.stringify(item.state)});return saved}
  };
}
