(function(global){
  'use strict';
  const EVENTS_KEY_PREFIX='hub:auto-pause-diagnostics:events:v1:';
  const ENABLED_KEY='hub:auto-pause-diagnostics:enabled:v1';
  const LIMIT=1200,RETENTION_MS=48*60*60*1000;
  const tabId=global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const listeners=new Set();
  let enabled=true,storageAvailable=true,storageError='';const sessionEvents=[];
  try{enabled=global.localStorage.getItem(ENABLED_KEY)!=='false';if(global.localStorage.getItem(ENABLED_KEY)===null)global.localStorage.setItem(ENABLED_KEY,'true')}catch(error){storageAvailable=false;storageError=error?.name||'StorageError'}
  function now(){return new Date().toISOString()}
  const eventStorageKey=()=>EVENTS_KEY_PREFIX+tabId;
  function readKey(key){try{const parsed=JSON.parse(global.localStorage.getItem(key)||'[]');return Array.isArray(parsed)?parsed.filter(item=>item&&typeof item.at==='string'):[]}catch{return[]}}
  function read(){return readKey(eventStorageKey())}
  function trim(events){const cutoff=Date.now()-RETENTION_MS;return events.filter(item=>Date.parse(item.at)>=cutoff).slice(-LIMIT)}
  function emit(event){for(const listener of listeners){try{listener(event)}catch{}}}
  function record(type,details={}){
    if(!enabled)return null;
    const event={at:now(),type:String(type||'event').slice(0,64),tabId,...pageState(),...sanitize(details)};
    if(!storageAvailable){sessionEvents.push(event);sessionEvents.splice(0,Math.max(0,sessionEvents.length-LIMIT));emit(event);return event}
    try{const events=trim([...read(),...sessionEvents,event]);global.localStorage.setItem(eventStorageKey(),JSON.stringify(events));sessionEvents.length=0;storageAvailable=true;storageError='';emit(event);return event}catch(error){storageAvailable=false;storageError=error?.name||'StorageError';sessionEvents.push(event);sessionEvents.splice(0,Math.max(0,sessionEvents.length-LIMIT));emit(event);return event}
  }
  function pageState(){let route='unknown';try{const url=new URL(global.location.href);route=url.pathname+(url.searchParams.has('view')?`?view=${safeString(url.searchParams.get('view'),48)}`:'')}catch{}return{visibility:global.document?.visibilityState||'unknown',focused:global.document?.hasFocus?.()===true,route}}
  function safeString(value,max=180){return String(value??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,max)}
  function sanitize(details){const allowed=new Set(['cause','mode','route','rule','stage','reason','campaign','product','role','outcome','durationMs','deadlineAt','lateByMs','candidateCount','excludedCount','linkedCount','staleCount','failedCount','pausedCount','alreadyPausedCount','blockedProducts','snapshotCount','automatic','periodType','executionMode','refreshMode','elapsedMs','enabledRules','errorName']);const output={};for(const[key,value]of Object.entries(details||{})){if(!allowed.has(key)||value==null)continue;if(['durationMs','lateByMs','candidateCount','excludedCount','linkedCount','staleCount','failedCount','pausedCount','alreadyPausedCount','blockedProducts','snapshotCount','elapsedMs'].includes(key)){if(Number.isFinite(Number(value)))output[key]=Math.round(Number(value));continue}if(key==='enabledRules'&&Array.isArray(value)){output[key]=value.map(item=>safeString(item,64)).slice(0,20);continue}if(key==='automatic'){output[key]=Boolean(value);continue}output[key]=safeString(value,key==='deadlineAt'?40:120)}return output}
  function getEvents(){try{const all=[],keys=Array.from({length:global.localStorage.length},(_,index)=>global.localStorage.key(index)).filter(key=>key?.startsWith(EVENTS_KEY_PREFIX));for(const key of keys){const stored=readKey(key),retained=trim(stored);all.push(...retained);if(!retained.length)global.localStorage.removeItem(key);else if(retained.length!==stored.length)global.localStorage.setItem(key,JSON.stringify(retained))}const cutoff=Date.now()-RETENTION_MS;all.push(...sessionEvents.filter(item=>Date.parse(item.at)>=cutoff));return all.sort((a,b)=>String(a.at).localeCompare(String(b.at))).slice(-5000)}catch{return trim([...read(),...sessionEvents])}}
  function setEnabled(value){enabled=Boolean(value);try{global.localStorage.setItem(ENABLED_KEY,String(enabled));storageAvailable=true;storageError=''}catch(error){storageAvailable=false;storageError=error?.name||'StorageError'}if(enabled)record('monitoring-enabled');else{const event={at:now(),type:'monitoring-disabled',tabId,...pageState()};if(storageAvailable){try{global.localStorage.setItem(eventStorageKey(),JSON.stringify(trim([...read(),...sessionEvents,event])));sessionEvents.length=0}catch(error){storageAvailable=false;storageError=error?.name||'StorageError';sessionEvents.push(event)}}else sessionEvents.push(event)}emit(null);return enabled}
  function subscribe(listener){if(typeof listener!=='function')return()=>{};listeners.add(listener);return()=>listeners.delete(listener)}
  function download(){const events=getEvents(),report={format:'hub-auto-pause-timing-v1',createdAt:now(),monitoringEnabled:enabled,storageMode:storageAvailable?'persistent-local':'current-tab-memory',storageError:storageAvailable?null:storageError||'StorageUnavailable',retentionHours:48,eventCount:events.length,events};const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=global.document.createElement('a');anchor.href=url;anchor.download=`hub-pausas-automaticas-timing-${now().replace(/[:.]/g,'-')}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return report.eventCount}
  function state(){const events=getEvents();return{enabled,storageAvailable,storageError,storageMode:storageAvailable?'persistent-local':'current-tab-memory',eventCount:events.length,retentionHours:48,lastEvent:events.at(-1)||null}}
  function lifecycle(event){if(!enabled)return;record('page-lifecycle',{stage:event,reason:event==='visibilitychange'?global.document?.visibilityState:undefined})}
  global.document?.addEventListener('visibilitychange',()=>lifecycle('visibilitychange'));
  global.addEventListener?.('focus',()=>lifecycle('focus'));
  global.addEventListener?.('blur',()=>lifecycle('blur'));
  global.addEventListener?.('pageshow',event=>{if(enabled)record('pageshow',{reason:event.persisted?'bfcache':'navigation'})});
  global.addEventListener?.('pagehide',event=>{if(enabled)record('pagehide',{reason:event.persisted?'bfcache':'navigation'})});
  global.addEventListener?.('freeze',()=>lifecycle('freeze'));
  global.addEventListener?.('resume',()=>lifecycle('resume'));
  global.document?.addEventListener('DOMContentLoaded',()=>{if(global.document.wasDiscarded)record('page-restored-after-discard')},{once:true});
  global.addEventListener?.('storage',event=>{if(event.key===ENABLED_KEY){enabled=event.newValue!=='false';emit(null)}else if(event.key?.startsWith(EVENTS_KEY_PREFIX))emit(null)});
  global.HubAutomaticPauseDiagnostics=Object.freeze({record,getEvents,setEnabled,subscribe,download,state});
})(globalThis);
