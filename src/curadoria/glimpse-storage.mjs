export const DB_NAME='radar-glimpse';
export const DB_VERSION=1;
export const STORE='analyses';
export function openGlimpseDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,DB_VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE)){const store=db.createObjectStore(STORE,{keyPath:'analysisId'});store.createIndex('productKey','productKey');store.createIndex('capturedAt','capturedAt')}};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
export async function getAllAnalyses(){const db=await openGlimpseDB();return new Promise((resolve,reject)=>{const request=db.transaction(STORE).objectStore(STORE).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
export async function getLatestByProduct(productKey){const all=await getAllAnalyses();return all.filter(item=>item.productKey===productKey).sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)))[0]||null}
export async function getHistoryByProduct(productKey){const all=await getAllAnalyses();return all.filter(item=>item.productKey===productKey).sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)))}
export async function saveAnalysis(value){const db=await openGlimpseDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error)})}
