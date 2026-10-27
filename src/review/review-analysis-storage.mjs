import {ANALYSIS_SCHEMA,createAnalysisState,validateSections} from './review-analysis-domain.mjs?v=2';
export const ANALYSIS_PREFIX='hub:review:analysis:v1:';
const keyFor=id=>{if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw new Error('Identificador da review inválido.');return ANALYSIS_PREFIX+id};
export function assertAnalysisState(state,id){
  if(!state||state.schema!==ANALYSIS_SCHEMA||state.reviewId!==id||typeof state.importText!=='string'||typeof state.reviewed!=='boolean'||!Array.isArray(state.previousResults)||(state.selectedSources!==null&&(!Array.isArray(state.selectedSources)||state.selectedSources.some(key=>typeof key!=='string'))))throw new Error('Análise salva em formato inválido. O registro original foi preservado.');
  function requestValid(request){return request&&request.reviewId===id&&typeof request.id==='string'&&typeof request.createdAt==='string'&&typeof request.materialSnapshot==='string'&&request.context&&typeof request.context.product==='string'&&Array.isArray(request.sources)&&request.sources.every(source=>source&&typeof source.id==='string'&&typeof source.label==='string'&&typeof source.content==='string'&&typeof source.analyzable==='boolean')}
  if(state.request&&!requestValid(state.request))throw new Error('Pedido salvo em formato inválido.');
  for(const result of [state.result,...state.previousResults].filter(Boolean))if(!requestValid(result.request)||validateSections(result.sections,result.request,{allowConfirmed:true,allowIncomplete:true}).length)throw new Error('Resultado salvo em formato inválido.');
}
function historyFor(storage,id){
  const raw=storage.getItem(keyFor(id));if(raw===null)return [];
  const history=JSON.parse(raw);
  if(!Array.isArray(history)||!history.length)throw new Error('Histórico da análise inválido. O registro original foi preservado.');
  for(const [index,entry] of history.entries()){
    if(!entry||entry.revision!==index+1||typeof entry.savedAt!=='string')throw new Error('Revisões da análise em formato inválido.');
    assertAnalysisState(entry.state,id);
  }
  return history;
}
export function loadAnalysis(storage,id){const entry=historyFor(storage,id).at(-1);return entry||{revision:0,savedAt:null,state:createAnalysisState(id)}}
export function saveAnalysis(storage,state,{expectedRevision=0,now=()=>new Date().toISOString()}={}){
  assertAnalysisState(state,state.reviewId);
  const history=historyFor(storage,state.reviewId),latest=history.at(-1);
  if((latest?.revision||0)!==expectedRevision)throw new Error('A análise foi alterada em outra aba. Baixe suas edições antes de recarregar.');
  if(latest&&JSON.stringify(latest.state)===JSON.stringify(state))return latest;
  const entry={revision:expectedRevision+1,savedAt:now(),state};
  storage.setItem(keyFor(state.reviewId),JSON.stringify([...history,entry]));return entry;
}
