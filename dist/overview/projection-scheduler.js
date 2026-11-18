(function(root){
  'use strict';

  function now(){return root.performance?.now?.()??Date.now()}
  function abortError(){try{return new DOMException('A projeção foi cancelada.','AbortError')}catch{const error=new Error('A projeção foi cancelada.');error.name='AbortError';return error}}
  function throwIfAborted(signal,isCurrent){if(signal?.aborted)throw signal.reason||abortError();if(typeof isCurrent==='function'&&!isCurrent())throw abortError()}

  function yieldToBrowser(signal){
    return new Promise((resolve,reject)=>{
      let id=null,kind='';
      const cleanup=()=>signal?.removeEventListener?.('abort',onAbort);
      const finish=()=>{cleanup();resolve()};
      const onAbort=()=>{try{if(kind==='idle')root.cancelIdleCallback?.(id);else root.clearTimeout?.(id)}catch{}cleanup();reject(signal.reason||abortError())};
      if(signal?.aborted){reject(signal.reason||abortError());return}
      signal?.addEventListener?.('abort',onAbort,{once:true});
      try{kind='timeout';id=root.setTimeout(finish,0)}catch{finish()}
    });
  }

  async function map(items,mapper,{signal,maxSliceMs=8,isCurrent}={}){
    const source=Array.isArray(items)?items:[],values=new Array(source.length),stats={sliceCount:0,yieldCount:0,maxSliceMs:0,workMs:0};
    let index=0;
    while(index<source.length){
      throwIfAborted(signal,isCurrent);
      const sliceStartedAt=now(),sliceStart=index;
      do{throwIfAborted(signal);values[index]=mapper(source[index],index);index++}while(index<source.length&&now()-sliceStartedAt<maxSliceMs);
      const elapsed=Math.max(0,now()-sliceStartedAt);stats.sliceCount++;stats.workMs+=elapsed;stats.maxSliceMs=Math.max(stats.maxSliceMs,elapsed);
      if(index<source.length){stats.yieldCount++;await yieldToBrowser(signal);throwIfAborted(signal,isCurrent)}
      if(index===sliceStart)throw new Error('A projeção não avançou para a próxima linha.');
    }
    return{values,stats};
  }

  root.OverviewProjectionScheduler=Object.freeze({map,yieldToBrowser});
  if(typeof module==='object'&&module.exports)module.exports=root.OverviewProjectionScheduler;
})(typeof window==='object'?window:globalThis);
