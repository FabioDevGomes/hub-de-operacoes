// Serviço de laboratório local, somente leitura. Não liga as telas ao SQLite.
import http from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openPreparedReadOnlyService} from './servico-base-preparada-leitura.mjs';

export async function startCentralReadOnly({path,port=18781,hubPort=8765}={}){
 if(typeof path!=='string'||!path||!Number.isInteger(port)||port<1||port>65535||port===hubPort)throw Error('Configuração inválida');
 const origin=`http://127.0.0.1:${hubPort}`,prepared=openPreparedReadOnlyService(resolve(path),origin);
 const server=http.createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return}
  if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,service:'hub-central-readonly-v1',database:resolve(path),hubPort}));return}
  if(req.headers.origin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
  if(req.method==='OPTIONS'&&req.headers.origin===origin){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Content-Type'});res.end();return}
  if(!req.url?.startsWith('/central/')){res.writeHead(404);res.end();return}
  req.url=req.url.slice('/central'.length);
  try{await prepared.service.handleRequest(req,res,port)}catch{if(!res.headersSent)res.writeHead(500);res.end()}
 });
 try{await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok)})}catch(e){prepared.close();throw e}
 return {server,close:async()=>{await new Promise((ok,fail)=>server.close(e=>e?fail(e):ok()));prepared.close()}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let instance;
 try{instance=await startCentralReadOnly({path:process.argv[2],port:18781,hubPort:Number(process.argv[3]||8765)});console.log('Serviço central isolado em leitura: 127.0.0.1:18781')}
 catch(error){console.error('Serviço central não iniciado:',error.message);process.exitCode=1}
 if(instance)for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await instance.close();process.exit(0)});
}
