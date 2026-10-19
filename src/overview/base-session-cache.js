(function(root){
  'use strict';
  const CACHE_KEY='hub:overview:base-session-cache:v1';
  const MARKER_KEY='hub:campaign-base-cache-marker:v1';
  const CACHE_SCHEMA='overview_base_session_cache_v1';
  const MAX_SERIALIZED_CHARS=2_000_000;

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
    return Object.freeze({restore,save,scheduleSave,flush,marker:getMarker,invalidate:()=>invalidateStorage(local),markFresh});
  }

  root.OverviewBaseSessionCache=Object.freeze({create,invalidate:()=>invalidateStorage(root.localStorage),CACHE_KEY,MARKER_KEY,MAX_SERIALIZED_CHARS});
  if(typeof module==='object'&&module.exports)module.exports=root.OverviewBaseSessionCache;
})(typeof window==='object'?window:globalThis);
