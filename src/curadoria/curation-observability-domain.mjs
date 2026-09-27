import {computeAutomaticSignal} from './automatic-signal-domain.mjs';

export const DB_NAME='radar-curadoria-observability';
export const DB_VERSION=1;
export const STORE_NAMES=Object.freeze({events:'events',details:'event_details',snapshots:'pretest_snapshots',correlations:'correlations'});
export const SNAPSHOT_TYPE='snapshot_decisao';

export const EVENT_TYPES=Object.freeze({
  trends_saved:'Google Trends salvo',
  images_saved:'Google Imagens salvo',
  glimpse_completed:'Análise Glimpse concluída',
  decision_changed:'Decisão alterada',
  snapshot_decisao_created:'Snapshot de decisão criado'
});

export function normalizeName(value=''){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
}

export function stableId(prefix,value){
  const text=typeof value==='string'?value:stableStringify(value);
  let hash=0xcbf29ce484222325n;
  for(let index=0;index<text.length;index++){hash^=BigInt(text.charCodeAt(index));hash=BigInt.asUintN(64,hash*0x100000001b3n)}
  return `${prefix}_${hash.toString(16).padStart(16,'0')}`
}

export function stableStringify(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function cloneSnapshotValue(value){
  if(value===undefined)return null;
  if(typeof structuredClone==='function')return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function eventBase({origin,subjectId,productKey,productName,offerRefs=[],occurredAt,eventType,decisionStatus=null,correlationId=null,summary={}}){
  const resolvedName=productName||'Produto sem nome';
  return {origin,subjectId,productKey:productKey||null,productName:resolvedName,productNameKey:normalizeName(resolvedName),offerRefs:cloneSnapshotValue(offerRefs),occurredAt:occurredAt||new Date().toISOString(),eventType,decisionStatus,correlationId,summary:cloneSnapshotValue(summary)};
}

export function createAssessmentEvent({origin,subjectId,productKey,productName,offerRefs=[],assessment,eventType,summary={}}){
  if(!assessment||!eventType)throw new Error('Avaliação persistida e tipo de evento são obrigatórios.');
  const occurredAt=assessment.capturedAt||assessment.updatedAt||new Date().toISOString();
  const event=eventBase({origin,subjectId,productKey,productName,offerRefs,occurredAt,eventType,summary});
  event.eventId=stableId('cur',`${origin}|${subjectId}|${eventType}|${assessment.assessmentId||occurredAt}`);
  event.detailId=event.eventId;
  return {event,detail:{detailId:event.detailId,kind:'assessment',payload:cloneSnapshotValue(assessment)}};
}

export function createGlimpseEvent({origin,subjectId,productKey,productName,offerRefs=[],analysis}){
  if(!analysis?.analysisId)throw new Error('A análise Glimpse concluída precisa ter analysisId.');
  const intent=analysis.indicators?.intent||null;
  const event=eventBase({origin,subjectId,productKey,productName,offerRefs,occurredAt:analysis.capturedAt,eventType:'glimpse_completed',summary:{glimpse:analysis.signal?.level||null,signal:analysis.signal?.level||null,volume:analysis.parsed?.volume?.display||null,movement:analysis.parsed?.movement?.percent??null,movementPeriod:analysis.parsed?.movement?.period||null,intent:intent?{level:intent.level||null,commercialCount:intent.commercialCount??null,uniqueTermCount:intent.uniqueTermCount??null}:null,coverage:analysis.indicators?.coverage?.level||null,alerts:cloneSnapshotValue(analysis.alerts||[]),confidence:cloneSnapshotValue(analysis.confidence||null),dimensions:cloneSnapshotValue(analysis.dimensions||null),analyzerVersion:analysis.analyzerVersion||null,ruleVersion:analysis.signal?.rulesVersion||null}});
  event.eventId=stableId('cur',`${origin}|${subjectId}|glimpse_completed|${analysis.analysisId}`);
  event.detailRef={database:'radar-glimpse',store:'analyses',key:analysis.analysisId};
  return {event,detail:null};
}

export function decisionNeedsSnapshot(previousStatus,currentStatus){
  return currentStatus==='Subir campanha'&&previousStatus!=='Subir campanha';
}

export function createDecisionBundle({origin,subjectId,productKey,productName,offerRefs=[],offerSnapshot,trends,images,glimpse,decision,previousStatus,automaticSignal:providedAutomaticSignal=null}){
  const history=Array.isArray(decision?.history)?decision.history:[],transition=history.at(-1)||{},occurredAt=transition.capturedAt||decision?.updatedAt||new Date().toISOString(),status=transition.status||decision?.status||decision?.currentStatus||'Não definido',transitionIdentity=transition.transitionId||transition.id||`${occurredAt}|${history.length}|${status}`;
  const event=eventBase({origin,subjectId,productKey,productName,offerRefs,occurredAt,eventType:'decision_changed',decisionStatus:status,summary:{notes:decision?.notes||''}});
  event.eventId=stableId('cur',`${origin}|${subjectId}|decision_changed|${transitionIdentity}`);
  event.detailId=event.eventId;
  const decisionDetail={detailId:event.detailId,kind:'decision',payload:{status,notes:decision?.notes||'',occurredAt}};
  if(!decisionNeedsSnapshot(previousStatus,status))return {event,detail:decisionDetail,snapshot:null,snapshotEvent:null,correlation:null};

  const snapshotId=stableId('snap',`${origin}|${subjectId}|${transitionIdentity}`);
  const latestTrend=[...(trends?.assessments||[])].sort((a,b)=>String(b?.capturedAt||b?.date||'').localeCompare(String(a?.capturedAt||a?.date||'')))[0]||null;
  const compactImages=images?.currentByCountry?images:{currentByCountry:[]};
  const compactGlimpse=compactGlimpseReference(glimpse);
  const automaticSignal=providedAutomaticSignal||computeAutomaticSignal({trends,images:images||compactImages,glimpse});
  const snapshot={snapshotId,snapshot_type:SNAPSHOT_TYPE,origin,subjectId,productKey:productKey||null,productName:productName||'Produto sem nome',offerRefs:cloneSnapshotValue(offerRefs),capturedAt:occurredAt,source:cloneSnapshotValue(offerSnapshot),signals:{trends:latestTrend?{latestAssessment:cloneSnapshotValue(latestTrend),keywordCandidates:cloneSnapshotValue(trends?.keywordCandidates||[])}:null,images:cloneSnapshotValue(compactImages),glimpse:compactGlimpse},automatic_signal:automaticSignal.label,automatic_signal_coverage:cloneSnapshotValue(automaticSignal.coverage),automatic_signal_version:automaticSignal.version,automatic_signal_captured_at:occurredAt,automatic_signal_components:cloneSnapshotValue(automaticSignal.components),decision:{status,occurredAt,notes:decision?.notes||''}};
  const snapshotEvent=eventBase({origin,subjectId,productKey,productName,offerRefs,occurredAt,eventType:'snapshot_decisao_created',decisionStatus:status,correlationId:`corr_${snapshotId}`,summary:{trends:latestTrendSummary(latestTrend),images:compactImageSummary(compactImages.currentByCountry),glimpse:compactGlimpse?.signal?.level||null,glimpseDetails:compactGlimpse?{analyzerVersion:compactGlimpse.analyzerVersion,ruleVersion:compactGlimpse.signal.rulesVersion,alerts:compactGlimpse.alerts,confidence:compactGlimpse.confidence,dimensions:compactGlimpse.dimensions,intent:compactGlimpse.indicators.intent}:null}});
  snapshotEvent.eventId=stableId('cur',`snapshot_decisao_created|${snapshotId}`);
  snapshotEvent.snapshotId=snapshotId;
  const correlation={correlationId:`corr_${snapshotId}`,snapshotEventId:snapshotEvent.eventId,origin,subjectId,productKey:productKey||null,productName:productName||'Produto sem nome',offerRefs:cloneSnapshotValue(offerRefs),snapshotId,status:'pending',links:[],history:[{action:'pending_created',occurredAt,reason:'Decisão alterada para Subir campanha'}],createdAt:occurredAt,updatedAt:occurredAt};
  return {event,detail:decisionDetail,snapshot,snapshotEvent,correlation};
}

function compactGlimpseReference(analysis){if(!analysis)return null;const intent=analysis.indicators?.intent||null;return{analysisId:analysis.analysisId||null,capturedAt:analysis.capturedAt||null,analyzerVersion:analysis.analyzerVersion||null,signal:{level:analysis.signal?.level||null,rulesVersion:analysis.signal?.rulesVersion||null},alerts:cloneSnapshotValue(analysis.alerts||[]),confidence:cloneSnapshotValue(analysis.confidence||null),dimensions:cloneSnapshotValue(analysis.dimensions||null),parsed:{volume:{display:analysis.parsed?.volume?.display||null},movement:{percent:analysis.parsed?.movement?.percent??null,period:analysis.parsed?.movement?.period||null}},indicators:{intent:intent?{level:intent.level||null,commercialCount:intent.commercialCount??null,uniqueTermCount:intent.uniqueTermCount??null}:null,coverage:{level:analysis.indicators?.coverage?.level||null}}}}
function latestTrendSummary(item){return item?{status:item.status||null,searchTerm:item.searchTerm||null,countries:item.countries||[item.country].filter(Boolean),period:item.period||null,capturedAt:item.capturedAt||item.date||null}:null}
function compactImageSummary(items=[]){return items.map(item=>({country:item.country||null,status:item.status||null,searchTerm:item.searchTerm||null,sampleSize:item.sampleSize??null,capturedAt:item.capturedAt||item.date||null,negativeKeywordCandidates:item.negativeKeywordCandidates||[]}))}

export function summarizeOperationalCandidates(events=[],productName=''){
  const key=normalizeName(productName);if(!key)return[];
  const matches=new Map();
  for(const event of events){
    if(!event?.product_id||!event?.test_id||!event?.account_id||!event?.campaign_id||normalizeName(event.product_name)!==key)continue;
    const confidence=event.metadata?.identity_confidence||'';
    if(/ambiguous|missing|unresolved/i.test(confidence))continue;
    let candidate=matches.get(event.product_id);
    if(!candidate){candidate={product_id:event.product_id,product_name:event.product_name||productName,tests:new Map()};matches.set(event.product_id,candidate)}
    const test=candidate.tests.get(event.test_id)||{test_id:event.test_id,account_id:event.account_id,campaigns:new Map()};
    test.campaigns.set(event.campaign_id,{campaign_id:event.campaign_id,campaign_name:event.campaign_name||event.campaign_id,iteration_id:event.iteration_id||null});candidate.tests.set(event.test_id,test);
  }
  return [...matches.values()].map(candidate=>({...candidate,tests:[...candidate.tests.values()].map(test=>({...test,campaigns:[...test.campaigns.values()]}))}));
}
