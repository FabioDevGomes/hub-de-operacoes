import {createPageState,pageBinding,createPageSnapshot,pageReadiness,pageSourceGaps,exportReviewHtml,renderReviewHtml} from './review-page-domain.mjs?v=1';
import {loadPage,savePage} from './review-page-storage.mjs?v=1';
import {listDrafts} from './review-materials-storage.mjs?v=1';
import {loadAnalysis} from './review-analysis-storage.mjs?v=1';
import {loadReviewer} from './review-reviewer-storage.mjs?v=1';
import {loadOffer} from './review-offer-storage.mjs?v=1';
import {loadImages} from './review-images-storage.mjs?v=1';
import {loadCopy} from './review-copy-storage.mjs?v=1';
import {COPY_SECTIONS} from './review-copy-domain.mjs?v=1';

export function createPageController({storage,materials,analysis,reviewer,offer,images,copy,now}){
  const buffers=new Map();
  function ensure(id=materials.current().draft.id){if(!buffers.has(id)){const draft=materials.list().find(item=>item.draft.id===id)?.draft;if(!draft)throw new Error('Review não encontrada.');try{const entry=loadPage(storage,draft);buffers.set(id,{...entry,saved:JSON.stringify(entry.state),error:''})}catch(error){const state=createPageState(draft);buffers.set(id,{state,revision:0,savedAt:null,saved:JSON.stringify(state),error:error.message})}}return buffers.get(id)}
  function record(controller){if(!controller)return{revision:0,dirty:false,reviewed:false,error:'Etapa indisponível.'};try{const item=controller.current();return{revision:Number(item.revision)||0,dirty:item.saved!==JSON.stringify(item.state),reviewed:item.state?.reviewed===true,confirmed:item.state?.confirmed===true,offerRevision:Number(item.state?.offerRevision)||0,error:item.error||'',state:item.state}}catch(error){return{revision:0,dirty:false,reviewed:false,error:error.message}}}
  function verifyLatest(item,load){if(!item.revision)return item;try{const latest=load();if(latest.revision!==item.revision)return{...item,dirty:true,error:'A fonte foi atualizada em outra aba; reabra e reconfirme esta etapa.'}}catch(error){return{...item,error:error.message}}return item}
  function sourceContext(){
    const current=materials.current(),draft=current.draft,listed=materials.list().find(item=>item.draft.id===draft.id),latestMaterial=listDrafts(storage).items.find(item=>item.draft.id===draft.id);
    let material={revision:listed?.revision||0,dirty:Boolean(listed?.dirty),product:draft.product,market:draft.market,publicationUrl:draft.publicationUrl,portal:draft.portal,language:draft.language,error:listed?.error||''};
    if(latestMaterial&&latestMaterial.revision!==material.revision)material={...material,dirty:true,error:'Os materiais foram atualizados em outra aba.'};
    const a=verifyLatest(record(analysis),()=>loadAnalysis(storage,draft.id)),r=verifyLatest(record(reviewer),()=>loadReviewer(storage,draft)),o=verifyLatest(record(offer),()=>loadOffer(storage,draft)),i=verifyLatest(record(images),()=>loadImages(storage,draft)),c=verifyLatest(record(copy),()=>loadCopy(storage,draft));
    const base=copy.sourceContext(),context={...base,materials:material,analysis:a,reviewer:r,offer:o,images:i,copy:c,copyQuality:copy.readiness()};
    return context;
  }
  function quality(){const item=ensure(),context=sourceContext();return pageReadiness(item.state,context.draft,context)}
  function isExportReady(){return quality().exportReady}
  return{
    current:()=>ensure(),hasUnsaved:()=>[...buffers.values()].some(item=>item.saved!==JSON.stringify(item.state)),sourceContext,readiness:quality,isExportReady,
    update(path,value){const item=ensure(),state=item.state;let target=state,key=path,boolean=false;const parts=String(path).split('.');
      if(parts.length===1&&['seoTitle','description'].includes(path)){}
      else if(parts.length===3&&parts[0]==='imageAlts'&&COPY_KEYS.has(parts[1])&&['text','confirmed'].includes(parts[2])){target=state.imageAlts[parts[1]];key=parts[2];boolean=key==='confirmed'}else return;
      if(boolean&&typeof value!=='boolean')return;const next=boolean?value:String(value);if(target[key]===next)return;target[key]=next;if(parts[0]==='imageAlts'&&key==='text')target.confirmed=false;state.reviewed=false;
    },
    confirmSources(){const item=ensure(),context=sourceContext(),gaps=pageSourceGaps(context.draft,context);if(gaps.length)throw new Error(gaps.slice(0,8).join('\n'));const snapshot=createPageSnapshot(context),changed=JSON.stringify(item.state.sourceSnapshot)!==JSON.stringify(snapshot)||item.state.binding!==pageBinding(context.draft);if(changed)for(const alt of Object.values(item.state.imageAlts))alt.confirmed=false;item.state.binding=pageBinding(context.draft);item.state.sourceSnapshot=snapshot;item.state.reviewed=false;return changed},
    setReviewed(value){const item=ensure();if(value){const result=quality();if(!result.ready)throw new Error(result.gaps.slice(0,10).join('\n'))}item.state.reviewed=Boolean(value)},
    previewHtml(){const item=ensure(),context=sourceContext();return renderReviewHtml(item.state,context.draft,context,{preview:true})},
    exportHtml(){const item=ensure(),context=sourceContext();return exportReviewHtml(item.state,context.draft,context)},
    save(id=materials.current().draft.id){const item=ensure(id);if(item.error)throw new Error(item.error);const material=materials.list().find(entry=>entry.draft.id===id),latest=listDrafts(storage).items.find(entry=>entry.draft.id===id);if(!material?.revision||!latest||material.dirty)throw new Error('Salve primeiro os materiais desta review no passo 1.');if(material.revision!==latest.revision)throw new Error('Os materiais mudaram em outra aba. Exporte as edições e recarregue.');if(item.state.reviewed&&!quality().ready)item.state.reviewed=false;const saved=savePage(storage,item.state,{expectedRevision:item.revision,now});Object.assign(item,{revision:saved.revision,savedAt:saved.savedAt,saved:JSON.stringify(item.state)});return saved}
  };
}
const COPY_KEYS=new Set(COPY_SECTIONS.map(section=>section.key));
