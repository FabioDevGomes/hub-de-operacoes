import {sourcesFor,prepareRequest,parseAnalysis,isStale,validateSections,CLASSIFICATIONS,createAnalysisState,requestStatus,requestPrompt,analysisQuality,ANALYSIS_SECTIONS,fieldFor} from './review-analysis-domain.mjs?v=2';
import {loadAnalysis,saveAnalysis} from './review-analysis-storage.mjs?v=2';
import {listDrafts} from './review-materials-storage.mjs?v=1';
const clone=value=>JSON.parse(JSON.stringify(value));
export function createAnalysisController({storage,materials,createId,now=()=>new Date().toISOString()}){
  const buffers=new Map();
  function ensure(id=materials.current().draft.id){
    if(!buffers.has(id)){
      try{const entry=loadAnalysis(storage,id);buffers.set(id,{...entry,saved:JSON.stringify(entry.state),preview:null,error:''})}
      catch(error){const state=createAnalysisState(id);buffers.set(id,{state,revision:0,savedAt:null,saved:JSON.stringify(state),preview:null,error:error.message})}
    }
    return buffers.get(id);
  }
  function item(){return ensure()}
  function selected(){return item().state.selectedSources??sourcesFor(materials.current().draft).filter(source=>source.available&&source.analyzable).map(source=>source.id)}
  function checkMaterial(){
    const current=materials.current(),visible=materials.list().find(row=>row.draft.id===current.draft.id);
    if(!current.revision||visible?.dirty)throw new Error('Salve os materiais desta review no passo 1 antes de preparar ou aplicar a análise.');
    const latest=listDrafts(storage).items.find(row=>row.draft.id===current.draft.id);
    if(!latest||latest.revision!==current.revision)throw new Error('Os materiais foram alterados em outra aba. Baixe as edições pendentes e recarregue antes de continuar.');
  }
  function checkSources(){
    const request=item().state.request;if(!request)return;
    const status=requestStatus(request,materials.current().draft,selected());
    if(status.code!=='current')throw new Error(status.message);
  }
  return {
    current:()=>item(),selected,
    currentPrompt(){checkMaterial();checkSources();if(!item().state.request)throw new Error('Prepare um pedido antes de copiar.');return requestPrompt(item().state.request)},
    hasUnsaved:()=>[...buffers.values()].some(entry=>entry.saved!==JSON.stringify(entry.state)),
    selectSources(ids){const entry=item();entry.state.selectedSources=[...new Set(ids)];entry.preview=null;entry.state.reviewed=false},
    prepare(){checkMaterial();const entry=item();if(entry.error)throw new Error(entry.error);entry.state.request=prepareRequest(materials.current().draft,selected(),{requestId:createId(),createdAt:now()});entry.preview=null;entry.state.reviewed=false;return entry.state.request},
    setImport(text){const entry=item();entry.state.importText=String(text);entry.preview=null},
    preview(){checkSources();const entry=item();entry.preview=parseAnalysis(entry.state.importText,entry.state.request);return entry.preview},
    apply(){
      checkMaterial();checkSources();const entry=item();if(!entry.preview)throw new Error('Valide a resposta para conferir a prévia antes de aplicar.');
      if(isStale(entry.preview,materials.current().draft))throw new Error('Os materiais mudaram depois deste pedido. Prepare um novo pedido antes de aplicar a análise.');
      if(entry.state.result)entry.state.previousResults.push(clone(entry.state.result));
      entry.state.result=clone(entry.preview);entry.preview=null;entry.state.reviewed=false;
    },
    updateField(section,key,property,value){
      if(!['text','classification','sourceIds','evidence'].includes(property))return;
      const entry=item();if(!entry.state.result||!ANALYSIS_SECTIONS.some(block=>block.id===section&&block.fields.some(([field])=>field===key)))return;
      let row=entry.state.result.sections[section].find(row=>row.key===key);
      if(!row){row=fieldFor(null,section,key);entry.state.result.sections[section].push(row)}
      if(property==='classification'&&!Object.hasOwn(CLASSIFICATIONS,value))return;
      if(property==='sourceIds'&&!Array.isArray(value))return;
      row[property]=value;if(property!=='classification'&&row.classification==='confirmed')row.classification='inferred';
      entry.state.reviewed=false;
    },
    setReviewed(value){const entry=item();if(value){if(!entry.state.result)throw new Error('Aplique uma análise antes de marcar a revisão.');if(isStale(entry.state.result,materials.current().draft))throw new Error('Os materiais mudaram. Prepare e aplique uma nova análise antes de concluir a revisão.');if(!analysisQuality(entry.state).substantive)throw new Error('A estrutura está válida, mas não há conteúdo analítico. Preencha os campos sustentados pelas fontes; mantenha as lacunas sem inventar dados.');const errors=validateSections(entry.state.result.sections,entry.state.result.request,{allowConfirmed:true});if(errors.length)throw new Error(errors.slice(0,3).join('\n'))}entry.state.reviewed=Boolean(value)},
    save(id=materials.current().draft.id){
      const entry=ensure(id);if(entry.error)throw new Error(entry.error);
      const current=materials.list().find(row=>row.draft.id===id);
      if(!current?.revision)throw new Error('Salve a review no passo 1 antes de salvar sua análise.');
      const latest=listDrafts(storage).items.find(row=>row.draft.id===id);
      if(!latest)throw new Error('Os materiais desta review não puderam ser lidos.');
      if(entry.state.reviewed&&(isStale(entry.state.result,latest.draft)||!analysisQuality(entry.state).substantive))entry.state.reviewed=false;
      const saved=saveAnalysis(storage,entry.state,{expectedRevision:entry.revision,now});Object.assign(entry,{revision:saved.revision,savedAt:saved.savedAt,saved:JSON.stringify(entry.state)});return saved;
    }
  };
}
