// Serviço central de escrita: exige base identificada e ativação explícita.
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectPreparedDatabase} from './servico-base-preparada-leitura.mjs';
import {createExperimentalRepository} from './repositorio-entrega-experimental.mjs';
import {createExperimentalLocalStorage} from './armazenamento-local-central-experimental.mjs';
import {createExperimentalIndexedStore} from './indexeddb-central-experimental.mjs';
import {createCentralTransaction} from './transacao-central-experimental.mjs';
import {createExperimentalService} from './servico-entrega-experimental.mjs';
import {createReconstructedReader} from './leitor-pacote-reconstruido-experimental.mjs';
import {createRealProgressQuery} from './progresso-central-fontes-reais.mjs';

export async function startCentralWrite({path,port=18782,hubPort=8765}){
 if(typeof path!=='string'||!path||!Number.isInteger(port)||!Number.isInteger(hubPort)||port<1||port>65535||hubPort<1||hubPort>65535||port===hubPort)throw Error('Configuração inválida');
 const absolute=resolve(path),stat=lstatSync(absolute);
 if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(absolute)!==absolute)throw Error('Arquivo da base inválido');
 inspectPreparedDatabase(absolute);
 const check=new DatabaseSync(absolute,{readOnly:true});
 try{
  const marker=check.prepare('SELECT value FROM central_activation_marker').all();
  if(marker.length!==1||marker[0].value!=='hub-central-write-v1')throw Error('Base não autorizada para escrita central');
  const pending=check.prepare('SELECT count(*) n FROM stores s LEFT JOIN store_index_catalog c ON c.source=s.source AND c.store=s.store WHERE c.verified IS NOT 1').get().n;
  if(pending||check.prepare('SELECT count(*) n FROM store_indexes WHERE multi_entry=1').get().n)throw Error('Índices não suportados');
  for(const store of check.prepare('SELECT source,store,keypath_json,auto_increment FROM stores').iterate()){
   const keyPath=JSON.parse(store.keypath_json);
   if(keyPath!==null&&(typeof keyPath!=='string'||!/^[$A-Za-z_][$A-Za-z0-9_]*(\.[$A-Za-z_][$A-Za-z0-9_]*)*$/.test(keyPath)))throw Error('Chave não suportada');
   if(store.auto_increment&&!check.prepare('SELECT next_id FROM store_generators WHERE source=? AND store=?').get(store.source,store.store))throw Error('Gerador não verificado');
  }
 }finally{check.close()}
 const db=new DatabaseSync(absolute);let repo,server;
 try{
  db.exec('PRAGMA busy_timeout=5000');repo=createExperimentalRepository({database:db,initialize:false});
  const local=createExperimentalLocalStorage(db),indexed=createExperimentalIndexedStore(db);
  const service=createExperimentalService({origin:`http://127.0.0.1:${hubPort}`,repository:repo,centralLocalStorage:local,centralIndexedStore:indexed,centralTransaction:createCentralTransaction(db,{local,indexed,repository:repo}),reconstructedReader:createReconstructedReader(db),queryProgress:createRealProgressQuery(db)});
  server=http.createServer(async(req,res)=>{
   if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return}
   if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({service:'hub-central-write-v1',hubPort,database:absolute}));return}
   if(!req.url?.startsWith('/central/')){res.writeHead(404);res.end();return}
   req.url=req.url.slice('/central'.length);try{await service.handleRequest(req,res,port)}catch{if(!res.headersSent)res.writeHead(500);res.end()}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok)});
  return {close:async()=>{await new Promise((ok,fail)=>server.close(error=>error?fail(error):ok()));repo.close()}};
 }catch(error){if(server?.listening)await new Promise(ok=>server.close(ok));if(repo)repo.close();else db.close();throw error}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let instance;try{instance=await startCentralWrite({path:process.argv[2],port:Number(process.argv[3]||18782),hubPort:Number(process.argv[4]||8765)});console.log('Serviço central em escrita iniciado.')}
 catch(error){console.error('Serviço central não iniciado:',error.message);process.exitCode=1}
 if(instance)for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await instance.close();process.exit(0)});
}
