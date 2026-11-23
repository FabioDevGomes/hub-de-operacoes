// Serviço de teste: somente base previamente marcada como fictícia e porta não operacional.
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {lstatSync} from 'node:fs';
import {createExperimentalRepository} from './repositorio-entrega-experimental.mjs';
import {createExperimentalLocalStorage} from './armazenamento-local-central-experimental.mjs';
import {createExperimentalIndexedStore} from './indexeddb-central-experimental.mjs';
import {createCentralTransaction} from './transacao-central-experimental.mjs';
import {createExperimentalService} from './servico-entrega-experimental.mjs';

export async function startCentralFixture({path,port,hubPort}){
 if(typeof path!=='string'||!path||!Number.isInteger(port)||!Number.isInteger(hubPort)||[8765,hubPort].includes(port)||hubPort===8765||port<1||hubPort<1||port>65535||hubPort>65535)throw Error('Configuração fictícia inválida');
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Arquivo fictício inválido');
 const check=new DatabaseSync(path,{readOnly:true});
 try{
  const marker=check.prepare('SELECT value FROM preproduction_marker').all();
  if(marker.length!==1||marker[0].value!=='hub-preproducao-ficticia-v1'||check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Base fictícia não reconhecida');
 }finally{check.close()}
 const db=new DatabaseSync(path);let repo,server;
 try{
  repo=createExperimentalRepository({database:db,initialize:false});
  const local=createExperimentalLocalStorage(db),indexed=createExperimentalIndexedStore(db);
  const service=createExperimentalService({origin:`http://127.0.0.1:${hubPort}`,repository:repo,centralLocalStorage:local,centralIndexedStore:indexed,centralTransaction:createCentralTransaction(db,{local,indexed,repository:repo})});
  server=http.createServer(async(req,res)=>{
   if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return}
   if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({service:'hub-central-fictitious-v1',hubPort}));return}
   if(!req.url?.startsWith('/central/')){res.writeHead(404);res.end();return}
   req.url=req.url.slice('/central'.length);
   try{await service.handleRequest(req,res,port)}catch{if(!res.headersSent)res.writeHead(500);res.end()}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  return {close:async()=>{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));repo.close()}};
 }catch(error){if(server?.listening)await new Promise(resolve=>server.close(resolve));if(repo)repo.close();else db.close();throw error}
}
