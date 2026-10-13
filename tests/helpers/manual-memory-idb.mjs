// IndexedDB contract double, private to synthetic Curadoria manual tests.
// Transactions work on copies and commit only after all queued requests finish.
export function memoryIndexedDB() {
  const databases=new Map(),calls=[];let failWrite=false;
  const clone=value=>value===undefined?undefined:structuredClone(value);
  function database(name){
    if(!databases.has(name))databases.set(name,{stores:new Map(),keyPaths:new Map(),indexes:new Map()});
    const data=databases.get(name);
    const db={
      objectStoreNames:{contains:key=>data.stores.has(key)},close(){},
      createObjectStore(key,{keyPath}){data.stores.set(key,new Map());data.keyPaths.set(key,keyPath);data.indexes.set(key,new Map());return {createIndex:(index,path)=>data.indexes.get(key).set(index,path)};},
      transaction(names,mode='readonly'){
        const kinds=Array.isArray(names)?names:[names],maps=new Map(kinds.map(key=>[key,new Map([...data.stores.get(key)].map(([id,value])=>[id,clone(value)]))]));
        let pending=0,ended=false,timer;const tx={error:null};
        const finish=()=>{clearImmediate(timer);timer=setImmediate(()=>{if(pending||ended)return;ended=true;if(mode==='readwrite')for(const [key,map]of maps)data.stores.set(key,map);tx.oncomplete?.();});};
        tx.abort=()=>{if(ended)return;ended=true;clearImmediate(timer);setImmediate(()=>tx.onabort?.());};
        const request=(operation,write=false)=>{const req={};pending++;clearImmediate(timer);setImmediate(()=>{if(ended)return;try{if(write&&failWrite){failWrite=false;throw new Error('synthetic write failure');}req.result=clone(operation());req.onsuccess?.();}catch(error){req.error=error;tx.error=error;req.onerror?.();tx.abort();}finally{pending--;finish();}});return req;};
        tx.objectStore=key=>{
          const map=maps.get(key);if(!map)throw Error('store outside transaction');
          return {
            get:id=>request(()=>map.get(id)),getAll:()=>request(()=>[...map.values()]),
            put:value=>request(()=>{map.set(value[data.keyPaths.get(key)],clone(value));return value[data.keyPaths.get(key)];},true),
            add:value=>request(()=>{const id=value[data.keyPaths.get(key)];if(map.has(id))throw Error('duplicate key');map.set(id,clone(value));return id;},true),
            index:index=>({getAll:id=>request(()=>[...map.values()].filter(value=>value[data.indexes.get(key).get(index)]===id))}),
          };
        };
        finish();return tx;
      },
    };return db;
  }
  return {calls,databases,failNextWrite(){failWrite=true;},open(name,version){calls.push([name,version]);const existed=databases.has(name),req={};setImmediate(()=>{req.result=database(name);if(!existed)req.onupgradeneeded?.();req.onsuccess?.();});return req;}};
}
