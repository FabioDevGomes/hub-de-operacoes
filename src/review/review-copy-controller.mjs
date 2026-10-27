import {createCopyState,copyBinding,createCopySnapshot,copyReadiness,validateCopySection,COPY_SECTIONS} from './review-copy-domain.mjs?v=1';
import {loadCopy,saveCopy} from './review-copy-storage.mjs?v=1';
import {listDrafts} from './review-materials-storage.mjs?v=1';
import {FIXED_IMAGES} from './review-images-domain.mjs?v=1';

export function createCopyController({storage,materials,analysis,reviewer,offer,images,now}){
  const buffers=new Map();
  function ensure(id=materials.current().draft.id){if(!buffers.has(id)){const draft=materials.list().find(item=>item.draft.id===id)?.draft;if(!draft)throw new Error('Review não encontrada.');try{const entry=loadCopy(storage,draft);buffers.set(id,{...entry,saved:JSON.stringify(entry.state),error:''})}catch(error){const state=createCopyState(draft);buffers.set(id,{state,revision:0,savedAt:null,saved:JSON.stringify(state),error:error.message})}}return buffers.get(id)}
  function record(controller){if(!controller)return{revision:0,dirty:false,reviewed:false,error:'Etapa indisponível.'};try{const item=controller.current();return{revision:Number(item.revision)||0,dirty:item.saved!==JSON.stringify(item.state),reviewed:item.state?.reviewed===true,confirmed:item.state?.confirmed===true,offerRevision:Number(item.state?.offerRevision)||0,error:item.error||'',state:item.state}}catch(error){return{revision:0,dirty:false,reviewed:false,error:error.message}}}
  function sourceContext(){const current=materials.current(),material=materials.list().find(item=>item.draft.id===current.draft.id),a=record(analysis),r=record(reviewer),o=record(offer),i=record(images),imageState=i.state||{};const assets={
      hero:imageState.hero?.choice==='source'?imageState.hero.candidate:imageState.hero?.choice==='manual'?imageState.hero.url:'',
      howItWorksDesktop:FIXED_IMAGES.howItWorksDesktop,howItWorksMobile:FIXED_IMAGES.howItWorksMobile,
      scamAlert:imageState.items?.scamAlert?.url||'',whatIsIt:imageState.items?.whatIsIt?.url||'',ingredients:imageState.items?.ingredients?.kind==='image'?imageState.items.ingredients.url:'',
      sixPack:imageState.items?.sixPack?.url||'',femaleAvatar:imageState.items?.femaleAvatar?.url||'',maleAvatar:imageState.items?.maleAvatar?.url||'',guaranteeBadge:Number(o.state?.guaranteeDays)===60?FIXED_IMAGES.guarantee60:imageState.customBadge?.url||'',
    };
    return{draft:current.draft,materials:{revision:material?.revision||0,dirty:Boolean(material?.dirty),product:current.draft.product,market:current.draft.market,salesUrl:current.draft.salesUrl,publicationUrl:current.draft.publicationUrl,portal:current.draft.portal,error:material?.error||''},analysis:a,reviewer:r,offer:o,images:i,assets};}
  function readiness(){const item=ensure(),context=sourceContext();return copyReadiness(item.state,context.draft,context)}
  return{
    current:()=>ensure(),hasUnsaved:()=>[...buffers.values()].some(item=>item.saved!==JSON.stringify(item.state)),readiness,sourceContext,
    update(path,value){const parts=String(path).split('.');if(parts.length!==3||parts[0]!=='sections'||!COPY_SECTIONS.some(section=>section.key===parts[1]))return;const item=ensure(),section=item.state.sections[parts[1]],field=parts[2];if(!['status','copy','basis','sourceReference','evidence','claimCheck','claimNote','ctaLabel','ctaUrl','ctaConfirmed','assetKey','decisionNote'].includes(field))return;
      if(field==='status'&&!['draft','reviewed','omitted'].includes(value))return;
      if(field==='basis'&&!['pending','offer','reviewer','label','salesPage','vsl','external','userVerified','editorial','unsupported'].includes(value))return;
      if(field==='claimCheck'&&!['pending','checked','flagged','notApplicable'].includes(value))return;
      if(field==='assetKey'&&!['none','hero','howItWorksDesktop','howItWorksMobile','scamAlert','whatIsIt','ingredients','sixPack','femaleAvatar','maleAvatar','guaranteeBadge'].includes(value))return;
      if(field==='ctaConfirmed'&&typeof value!=='boolean')return;
      const next=field==='ctaConfirmed'?value:String(value);if(field==='status'&&next==='reviewed'){const errors=validateCopySection({...section,status:next},{assets:sourceContext().assets});if(Object.keys(errors).length){const error=new Error(Object.values(errors).slice(0,5).join('\n'));error.fields=Object.fromEntries(Object.entries(errors).map(([key,message])=>[`sections.${parts[1]}.${key}`,message]));throw error}}
      if(field==='status'&&next==='omitted'&&!section.decisionNote.trim()){const error=new Error('Explique por que a seção foi omitida antes de marcá-la como omitida.');error.fields={[`sections.${parts[1]}.decisionNote`]:'Informe a justificativa de omissão.'};throw error}
      if(section[field]===next)return;section[field]=next;
      if(field!=='status'&&!(field==='decisionNote'&&section.status==='omitted'))section.status='draft';
      if(field==='ctaLabel'||field==='ctaUrl')section.ctaConfirmed=false;item.state.reviewed=false;
    },
    confirmSources(){const item=ensure(),context=sourceContext();if(!context.materials.revision||context.materials.dirty)throw new Error('Salve os materiais atuais no passo 1 antes de vincular as fontes.');const snapshot=createCopySnapshot(context),changed=JSON.stringify(item.state.sourceSnapshot)!==JSON.stringify(snapshot)||item.state.binding!==copyBinding(context.draft);if(changed)for(const key of Object.keys(item.state.sections)){item.state.sections[key].status='draft';item.state.sections[key].claimCheck='pending';item.state.sections[key].ctaConfirmed=false}item.state.binding=copyBinding(context.draft);item.state.sourceSnapshot=snapshot;item.state.reviewed=false;return changed},
    setReviewed(value){const item=ensure();if(value){const quality=readiness();if(!quality.ready)throw new Error(quality.gaps.slice(0,8).join('\n'))}item.state.reviewed=Boolean(value)},
    save(id=materials.current().draft.id){const item=ensure(id);if(item.error)throw new Error(item.error);const material=materials.list().find(entry=>entry.draft.id===id),latest=listDrafts(storage).items.find(entry=>entry.draft.id===id);if(!material?.revision||!latest||material.dirty)throw new Error('Salve primeiro os materiais desta review no passo 1.');if(material.revision!==latest.revision)throw new Error('Os materiais mudaram em outra aba. Exporte a copy e recarregue.');if(item.state.reviewed&&!readiness().ready)item.state.reviewed=false;const saved=saveCopy(storage,item.state,{expectedRevision:item.revision,now});Object.assign(item,{revision:saved.revision,savedAt:saved.savedAt,saved:JSON.stringify(item.state)});return saved},
  };
}
