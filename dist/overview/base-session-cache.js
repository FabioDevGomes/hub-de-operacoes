(function(root){
  'use strict';
  const CACHE_KEY='hub:overview:base-session-cache:v1';
  const CAPTURE_HISTORY_KEY='hub:overview:google-ads-capture-history:v1';
  const MARKER_KEY='hub:campaign-base-cache-marker:v1';
  const CACHE_SCHEMA='overview_base_session_cache_v1';
  const CAPTURE_HISTORY_SCHEMA='google_ads_capture_history_session_v1';
  const MAX_SERIALIZED_CHARS=2_000_000;
  const FALLBACK_CAPTURE_HISTORY_MAX_ENTRIES=24;

  function captureHistoryMaxEntries(){
    const configured=Number(root.CampaignDatabase?.GOOGLE_ADS_CAPTURE_HISTORY_MAX_ENTRIES);
    return Number.isInteger(configured)&&configured>0?configured:FALLBACK_CAPTURE_HISTORY_MAX_ENTRIES;
  }

  function token(prefix){return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`}
  function invalidateStorage(storage){
    try{storage?.setItem(MARKER_KEY,token('dirty'));return true}
    catch{try{storage?.removeItem(MARKER_KEY)}catch{}return false}
  }
  function markFreshStorage(storage){
    try{storage?.setItem(MARKER_KEY,token('clean'));return true}
    catch{return false}
  }
  function isBase(value){return value?.schema==='base_campanhas_v1'&&Array.isArray(value.campanhas)&&Array.isArray(value.diario)}
  function isCatalog(value){return value?.schema==='catalogo_produtos_v1'&&typeof value==='object'&&!Array.isArray(value)}
  function readCaptureHistory(storage,maxChars=MAX_SERIALIZED_CHARS){try{const raw=storage?.getItem(CAPTURE_HISTORY_KEY);if(!raw||raw.length>maxChars)return[];const snapshot=JSON.parse(raw);return snapshot?.schema===CAPTURE_HISTORY_SCHEMA&&Array.isArray(snapshot.entries)?snapshot.entries:[]}catch{return[]}}
  function historyForRecovery(sources){
    const entries=new Map();let sequence=0;
    for(const source of sources){if(!Array.isArray(source))continue;for(const entry of source){if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;const id=String(entry.id||'').trim(),completedAt=Date.parse(entry.completedAtUtc||'');if(!id||!Number.isFinite(completedAt)||(!Array.isArray(entry.changes)&&entry.eventType!=='automatic_pause'))continue;const previous=entries.get(id);if(!previous||completedAt>=previous.completedAt)entries.set(id,{entry,completedAt,sequence:sequence++})}}
    const ordered=[...entries.values()].sort((a,b)=>a.completedAt-b.completedAt||a.sequence-b.sequence),pauseEvents=ordered.filter(item=>item.entry.eventType==='automatic_pause'),captureRuns=ordered.filter(item=>item.entry.eventType!=='automatic_pause').slice(-captureHistoryMaxEntries());
    return[...captureRuns,...pauseEvents].sort((a,b)=>a.completedAt-b.completedAt||a.sequence-b.sequence).map(item=>item.entry);
  }

  function create({sessionStorage:session=root.sessionStorage,localStorage:local=root.localStorage,version=root.document?.querySelector('meta[name="hub-system-version"]')?.content||'',maxSerializedChars=MAX_SERIALIZED_CHARS}={}){
    let pendingSnapshot=null,pendingId=null,pendingKind=null;
    function getMarker(){try{return local?.getItem(MARKER_KEY)||null}catch{return null}}
    function cancelPending(){
      if(pendingId==null)return;
      try{if(pendingKind==='idle')root.cancelIdleCallback?.(pendingId);else root.clearTimeout?.(pendingId)}catch{}
      pendingId=null;pendingKind=null;
    }
    function restore(){
      if(!version)return null;
      const currentMarker=getMarker();
      if(!currentMarker?.startsWith('clean:'))return null;
      try{
        const raw=session?.getItem(CACHE_KEY);
        if(!raw||raw.length>maxSerializedChars)return null;
        const snapshot=JSON.parse(raw);
        if(snapshot?.schema!==CACHE_SCHEMA||snapshot.version!==version||snapshot.marker!==currentMarker||!isBase(snapshot.database)||!isCatalog(snapshot.productCatalog))return null;
        return{database:snapshot.database,productCatalog:snapshot.productCatalog};
      }catch{return null}
    }
    function recoverGoogleAdsCaptureHistory(){
      const histories=[readCaptureHistory(local,maxSerializedChars),readCaptureHistory(session,maxSerializedChars)];
      try{const raw=session?.getItem(CACHE_KEY);if(raw&&raw.length<=maxSerializedChars){const snapshot=JSON.parse(raw),database=snapshot?.database;if(snapshot?.schema===CACHE_SCHEMA&&isBase(database)&&Array.isArray(database.google_ads_api_change_history))histories.push(database.google_ads_api_change_history)}}catch{}
      return historyForRecovery(histories);
    }
    function saveGoogleAdsCaptureHistory(history){
      if(!Array.isArray(history))return false;
      try{
        const savedAt=new Date(),entries=historyForRecovery([readCaptureHistory(local,maxSerializedChars),readCaptureHistory(session,maxSerializedChars),history],savedAt),raw=JSON.stringify({schema:CAPTURE_HISTORY_SCHEMA,savedAt:savedAt.toISOString(),entries});
        if(raw.length>maxSerializedChars)return false;
        let durableSaved=false;
        try{local?.setItem(CAPTURE_HISTORY_KEY,raw);durableSaved=Boolean(local)}catch{}
        try{session?.setItem(CAPTURE_HISTORY_KEY,raw)}catch{}
        return durableSaved;
      }catch{return false}
    }
    function save(snapshot){
      const currentMarker=getMarker();
      if(!version||!currentMarker?.startsWith('clean:')||!isBase(snapshot?.database)||!isCatalog(snapshot?.productCatalog))return false;
      try{
        const raw=JSON.stringify({schema:CACHE_SCHEMA,version,marker:currentMarker,savedAt:new Date().toISOString(),database:snapshot.database,productCatalog:snapshot.productCatalog});
        if(raw.length>maxSerializedChars){session?.removeItem(CACHE_KEY);return false}
        if(getMarker()!==currentMarker)return false;
        session?.setItem(CACHE_KEY,raw);
        return true;
      }catch{return false}
    }
    function scheduleSave(snapshot){
      pendingSnapshot=snapshot;cancelPending();
      const run=()=>{pendingId=null;pendingKind=null;const current=pendingSnapshot;pendingSnapshot=null;if(current)save(current)};
      try{
        if(typeof root.requestIdleCallback==='function'){pendingKind='idle';pendingId=root.requestIdleCallback(run,{timeout:1200})}
        else{pendingKind='timeout';pendingId=root.setTimeout(run,40)}
      }catch{run()}
    }
    function flush(){
      if(!pendingSnapshot)return false;
      const snapshot=pendingSnapshot;pendingSnapshot=null;cancelPending();return save(snapshot);
    }
    function markFresh(expectedMarker){if(arguments.length&&getMarker()!==expectedMarker)return false;return markFreshStorage(local)}
    return Object.freeze({restore,recoverGoogleAdsCaptureHistory,saveGoogleAdsCaptureHistory,save,scheduleSave,flush,marker:getMarker,invalidate:()=>invalidateStorage(local),markFresh});
  }

  root.OverviewBaseSessionCache=Object.freeze({create,invalidate:()=>invalidateStorage(root.localStorage),CACHE_KEY,MARKER_KEY,MAX_SERIALIZED_CHARS});
  if(typeof module==='object'&&module.exports)module.exports=root.OverviewBaseSessionCache;
})(typeof window==='object'?window:globalThis);
