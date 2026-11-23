// Serviço de teste em loopback; repositório em memória por padrão e dados fictícios.
import http from 'node:http';
import { createExperimentalRepository } from './repositorio-entrega-experimental.mjs';

const operations = new Set(['create','updateCountries','updatePositiveKeywords','updateNegativeKeywords','updateImageSearchTerm','updateCommission','updateProductName','updateAffiliateUrl','updateAssetWork','updateAssetRoute','markOpened']);
const MAX_REQUEST_BYTES=64*1024*1024;
async function readJsonBody(req){
  let size=0;const chunks=[];
  for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>MAX_REQUEST_BYTES){const error=Error('Limite excedido');error.code='SIZE_LIMIT';throw error}chunks.push(bytes)}
  return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
}
export function createExperimentalService({ origin = 'http://127.0.0.1:18781', repository = createExperimentalRepository(), queryProgress = null, reconstructedReader = null, centralLocalStorage = null, centralIndexedStore = null, centralTransaction = null, readOnly = false } = {}) {
  const repo = repository;
  async function handleRequest(req,res,port) {
    function respond(status, payload) { const body=JSON.stringify(payload); res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(body); }
    if (req.headers.host !== `127.0.0.1:${port}` || req.headers.origin !== origin) return respond(403,{error:'forbidden'});
    if (req.method === 'GET' && req.url === '/snapshot') return respond(200,await repo.list());
    if (req.method === 'GET' && req.url.startsWith('/storage?')) {
      if (!centralLocalStorage) return respond(503,{error:'storage_unavailable'});
      try { const params=new URL(req.url,'http://127.0.0.1').searchParams;
        if ([...params.keys()].some(key=>key!=='key') || params.getAll('key').length!==1) return respond(400,{error:'invalid_request'});
        return respond(200,centralLocalStorage.read(params.get('key')));
      } catch { return respond(400,{error:'invalid_request'}); }
    }
    if (req.method === 'GET' && req.url === '/package/sources') {
      if (!reconstructedReader) return respond(503,{error:'package_unavailable'});
      try { return respond(200,{sources:reconstructedReader.sources()}); } catch { return respond(503,{error:'package_unavailable'}); }
    }
    if (req.method === 'GET' && req.url.startsWith('/package/store?')) {
      if (!reconstructedReader) return respond(503,{error:'package_unavailable'});
      try {
        const params=new URL(req.url,'http://127.0.0.1').searchParams;
        if ([...params.keys()].some(key=>!['source','store'].includes(key)) || params.getAll('source').length!==1 || params.getAll('store').length!==1) return respond(400,{error:'invalid_request'});
        return respond(200,reconstructedReader.readStore(params.get('source'),params.get('store')));
      } catch { return respond(503,{error:'source_unavailable'}); }
    }
    if (req.method === 'GET' && req.url.startsWith('/package/record?')) {
      if (!reconstructedReader) return respond(503,{error:'package_unavailable'});
      try {
        const params=new URL(req.url,'http://127.0.0.1').searchParams;
        if ([...params.keys()].some(key=>!['source','store','ordinal'].includes(key)) || ['source','store','ordinal'].some(key=>params.getAll(key).length!==1) || !/^(0|[1-9]\d*)$/.test(params.get('ordinal'))) return respond(400,{error:'invalid_request'});
        const result=reconstructedReader.record(params.get('source'),params.get('store'),Number(params.get('ordinal')));
        return result===null?respond(404,{error:'record_not_found'}):respond(200,result);
      } catch { return respond(503,{error:'source_unavailable'}); }
    }
    if (req.method === 'GET' && req.url.startsWith('/route-history/')) {
      const id=req.url.slice('/route-history/'.length);
      if (!/^[A-Za-z0-9_-]{1,180}$/.test(id)) return respond(400,{error:'invalid_request'});
      try { return respond(200,{events:await repo.getRouteHistory(id)}); }
      catch { return respond(503,{error:'history_unavailable'}); }
    }
    if (req.method === 'GET' && req.url.startsWith('/progress/')) {
      const id = req.url.slice('/progress/'.length);
      if (!/^[A-Za-z0-9_-]{1,180}$/.test(id)) return respond(400,{error:'invalid_request'});
      if (typeof queryProgress !== 'function') return respond(503,{error:'progress_unavailable'});
      try { return respond(200,await queryProgress(id)); }
      catch { return respond(503,{error:'progress_unavailable'}); }
    }
    if (readOnly && req.method !== 'GET' && !(req.method==='POST'&&['/indexed/query','/indexed/get','/indexed/scan','/indexed/binary','/transaction/read'].includes(req.url))) return respond(403,{error:'read_only'});
    if(req.method==='POST'&&['/transaction','/transaction/read'].includes(req.url)&&req.headers['content-type']==='application/json'){
      if(!centralTransaction)return respond(503,{error:'transaction_unavailable'});
      try{const input=await readJsonBody(req);return respond(200,req.url==='/transaction/read'?centralTransaction.read(input):centralTransaction.commit(input))}
      catch(error){return error.code==='SIZE_LIMIT'?respond(413,{error:'size_limit'}):error.code==='VERSION_CONFLICT'?respond(409,{error:'version_conflict'}):respond(400,{error:'invalid_request'})}
    }
    if (req.method === 'POST' && ['/indexed/put','/indexed/batch','/indexed/query','/indexed/get','/indexed/scan','/indexed/binary'].includes(req.url) && req.headers['content-type']==='application/json') {
      if (!centralIndexedStore) return respond(503,{error:'indexed_unavailable'});
      try {const input=await readJsonBody(req);return respond(200,req.url==='/indexed/put'?centralIndexedStore.put(input):req.url==='/indexed/batch'?centralIndexedStore.putBatch(input):req.url==='/indexed/get'?centralIndexedStore.get(input):req.url==='/indexed/scan'?centralIndexedStore.scan(input):req.url==='/indexed/binary'?centralIndexedStore.binary(input):centralIndexedStore.queryIndex(input))}
      catch(error){return error.code==='SIZE_LIMIT'?respond(413,{error:'size_limit'}):error.code==='VERSION_CONFLICT'?respond(409,{error:'version_conflict'}):respond(400,{error:'invalid_request'})}
    }
    if (req.method === 'POST' && req.url === '/storage' && req.headers['content-type']==='application/json') {
      if (!centralLocalStorage) return respond(503,{error:'storage_unavailable'});
      try {return respond(200,centralLocalStorage.write(await readJsonBody(req)))}
      catch(error) {return error.code==='SIZE_LIMIT'?respond(413,{error:'size_limit'}):error.code==='VERSION_CONFLICT'?respond(409,{error:'version_conflict'}):respond(400,{error:'invalid_request'})}
    }
    if (req.method !== 'POST' || req.url !== '/operation' || req.headers['content-type'] !== 'application/json') return respond(404,{error:'not_found'});
    try {
      const input=await readJsonBody(req);
      if (!input || !operations.has(input.operation) || !Array.isArray(input.args) || !Number.isInteger(input.version)) return respond(400,{error:'invalid_request'});
      const result = await repo[input.operation](input.version,...input.args);
      return respond(200,result);
    } catch(error) {
      if (error.code === 'SIZE_LIMIT') return respond(413,{error:'size_limit'});
      if (error.code === 'VERSION_CONFLICT') return respond(409,{error:'version_conflict'});
      return respond(400,{error:'invalid_request'});
    }
  }
  const server = http.createServer((req,res) => handleRequest(req,res,server.address().port));
  return { server, handleRequest, close: async () => { await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())); repo.close(); } };
}
