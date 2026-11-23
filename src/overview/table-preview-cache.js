(function(root){
  'use strict';
  const CACHE_KEY='hub:overview:table-preview:v1';
  const SCHEMA='overview_table_preview_v2';
  const MAX_SERIALIZED_CHARS=1_048_576;
  const MODES=new Set(['consolidated','d1','d0']);
  const SNAPSHOT_FIELDS=['previewOnly','rows','dates','referenceDate','remainingAlertMinimum','remainingAlertYellowMinimum','billedRevenueLoaded','billedRevenueReadError','historyEntries'];

  function compactSnapshot(snapshot){
    const compact={};
    for(const key of SNAPSHOT_FIELDS)if(snapshot&&Object.prototype.hasOwnProperty.call(snapshot,key))compact[key]=snapshot[key];
    return compact;
  }
  function isSnapshot(snapshot){return Boolean(snapshot?.previewOnly===true&&Array.isArray(snapshot.rows)&&snapshot.rows.every(row=>row?.displayOnlyPreview===true&&!Object.hasOwn(row,'googleAdsCampaignAction')&&!Object.hasOwn(row,'account'))&&snapshot.dates&&typeof snapshot.dates==='object'&&typeof snapshot.referenceDate==='string')}
  function parseCache(storage,version){
    try{
      const raw=storage?.getItem(CACHE_KEY);
      if(!raw||raw.length>MAX_SERIALIZED_CHARS)return{cache:{schema:SCHEMA,version,entries:{}},rawLength:raw?.length||0};
      const cache=JSON.parse(raw);
      if(cache?.schema!==SCHEMA||cache.version!==version||!cache.entries||typeof cache.entries!=='object'||Array.isArray(cache.entries))return{cache:{schema:SCHEMA,version,entries:{}},rawLength:raw.length};
      return{cache,rawLength:raw.length};
    }catch{return{cache:{schema:SCHEMA,version,entries:{}},rawLength:0}}
  }
  function create(options={}){
    let storage=options.sessionStorage,version=options.version||root.document?.querySelector('meta[name="hub-system-version"]')?.content||'',maxSerializedChars=options.maxSerializedChars||MAX_SERIALIZED_CHARS;
    if(!Object.prototype.hasOwnProperty.call(options,'sessionStorage'))try{storage=root.sessionStorage}catch{storage=null}
    let pending=null,pendingId=null,pendingKind='';
    function cancelPending(){if(pendingId==null)return;try{if(pendingKind==='idle')root.cancelIdleCallback?.(pendingId);else root.clearTimeout?.(pendingId)}catch{}pendingId=null;pendingKind=''}
    function restore(mode,sourceMode){
      if(!version||!MODES.has(mode))return null;
      const {cache}=parseCache(storage,version),entry=cache.entries[mode];
      if(entry?.mode!==mode||entry.sourceMode!==sourceMode||!Number.isFinite(Date.parse(entry.savedAtUtc||''))||!isSnapshot(entry.snapshot))return null;
      return{snapshot:entry.snapshot,savedAtUtc:entry.savedAtUtc,sourceMode:entry.sourceMode,mode:entry.mode};
    }
    function saveNow(record){
      if(!version||!MODES.has(record?.mode)||!['api','manifest'].includes(record?.sourceMode)||!isSnapshot(record?.snapshot))return false;
      const {cache}=parseCache(storage,version),entry={mode:record.mode,sourceMode:record.sourceMode,savedAtUtc:new Date().toISOString(),snapshot:compactSnapshot(record.snapshot)};
      cache.entries[record.mode]=entry;
      let serialized='';
      try{serialized=JSON.stringify(cache)}catch{return false}
      while(serialized.length>maxSerializedChars){
        const candidates=Object.entries(cache.entries).filter(([mode])=>mode!==record.mode).sort((a,b)=>Date.parse(a[1]?.savedAtUtc||'')-Date.parse(b[1]?.savedAtUtc||''));
        if(!candidates.length){delete cache.entries[record.mode];return false}
        delete cache.entries[candidates[0][0]];
        try{serialized=JSON.stringify(cache)}catch{return false}
      }
      try{storage?.setItem(CACHE_KEY,serialized);return Boolean(storage)}catch{return false}
    }
    function scheduleSave(record){
      pending=record;cancelPending();
      const run=()=>{pendingId=null;pendingKind='';const current=pending;pending=null;if(current)saveNow(current)};
      try{if(typeof root.requestIdleCallback==='function'){pendingKind='idle';pendingId=root.requestIdleCallback(run,{timeout:1500})}else{pendingKind='timeout';pendingId=root.setTimeout(run,80)}}catch{run()}
    }
    function flush(){if(!pending)return false;const current=pending;pending=null;cancelPending();return saveNow(current)}
    function clear(){cancelPending();pending=null;try{storage?.removeItem(CACHE_KEY);return true}catch{return false}}
    return Object.freeze({restore,scheduleSave,flush,clear,key:CACHE_KEY,maxSerializedChars});
  }

  root.OverviewTablePreviewCache=Object.freeze({create,CACHE_KEY,MAX_SERIALIZED_CHARS});
  if(typeof module==='object'&&module.exports)module.exports=root.OverviewTablePreviewCache;
})(typeof window==='object'?window:globalThis);
