import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startCentralReadOnly} from '../scripts/central-isolada/server.mjs';
import {startCentralFixture} from '../scripts/central-isolada/server-ficticio.mjs';
import {startCentralWrite} from '../scripts/central-isolada/server-escrita.mjs';

const hubPort=18821,centralPort=18822,origin=`http://127.0.0.1:${hubPort}`;
function call(path,{method='GET',headers={},body='',port=hubPort}={}){return new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,path,method,headers,agent:false},res=>{let text='';res.on('data',v=>text+=v);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}))});req.on('error',reject);req.end(body);
})}
async function ready(child,port=hubPort){for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('Servidor de teste encerrou');try{if((await call('/api/presell/health',{port})).status===200)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('Servidor de teste não iniciou')}
test('servidor operacional mantém a rota central desligada por padrão',async()=>{
 const port=18823,script=fileURLToPath(new URL('../scripts/serve-panel.ps1',import.meta.url));
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Port',String(port)],{stdio:'ignore',windowsHide:true});
 try{await ready(child,port);const result=await call('/central/snapshot',{port,headers:{origin:`http://127.0.0.1:${port}`}});assert.equal(result.status,404);assert.equal(result.body.error,'central_not_enabled')}
 finally{child.kill();await new Promise(ok=>child.once('exit',ok))}
});
test('proxy opcional conecta serviço real em leitura e recusa origens, escrita e indisponibilidade',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hub-proxy-central-')),path=join(dir,'ficticia.sqlite');
 const db=new DatabaseSync(path);
 db.exec("CREATE TABLE lab_marker(value TEXT);INSERT INTO lab_marker VALUES('hub-central-lab-v1');CREATE TABLE state(id INTEGER,version INTEGER,value TEXT);INSERT INTO state VALUES(1,1,'[]');CREATE TABLE local_storage(key TEXT,value TEXT);INSERT INTO local_storage VALUES('hub:campaign-delivery:records:v1','[]');CREATE TABLE package_entries(path TEXT,size INTEGER,sha256 TEXT,data BLOB);CREATE TABLE binaries(path TEXT,size INTEGER,sha256 TEXT,data BLOB);CREATE TABLE source_info(source TEXT,status TEXT,version_json TEXT,missing_json TEXT);INSERT INTO source_info VALUES('teste','presente','1','null');CREATE TABLE stores(source TEXT,store TEXT,keypath_json TEXT,auto_increment INTEGER);CREATE TABLE records(source TEXT,store TEXT,ordinal INTEGER,key_json TEXT,value_json TEXT);CREATE TABLE route_history(delivery_id TEXT,version INTEGER,event TEXT)");db.close();const before=readFileSync(path);
 const central=await startCentralReadOnly({path,port:centralPort,hubPort});
 const script=fileURLToPath(new URL('../scripts/serve-panel.ps1',import.meta.url));
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Port',String(hubPort),'-CentralReadOnlyProxy','-CentralReadOnlyPort',String(centralPort),'-CentralReadOnlyDatabase',path],{stdio:'ignore',windowsHide:true});
 let closed=false;
 try{
  await ready(child);
  const headers={origin,'content-type':'application/json'};
  const read=await call('/central/package/sources',{headers:{origin}});assert.equal(read.status,200);assert.equal(read.body.sources[0].source,'teste');
  assert.equal((await call('/central/indexed/put',{method:'POST',headers,body:'{}'})).status,403);
  assert.equal((await call('/central/indexed/get',{method:'POST',headers:{...headers,origin:'http://externo.test'},body:'{}'})).status,403);
  await central.close();closed=true;assert.deepEqual(readFileSync(path),before);
  assert.equal((await call('/central/indexed/get',{method:'POST',headers,body:'{}'})).status,503);
 }finally{child.kill();await new Promise(ok=>child.once('exit',ok));if(!closed)await central.close();rmSync(dir,{recursive:true,force:true})}
});

test('servidor PowerShell e serviço fictício gravam, recuperam e bloqueiam outras origens',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hub-proxy-write-')),path=join(dir,'ficticia.sqlite');let central,child;
 const create=()=>{const db=new DatabaseSync(path);db.exec("CREATE TABLE preproduction_marker(value TEXT);INSERT INTO preproduction_marker VALUES('hub-preproducao-ficticia-v1');CREATE TABLE state(id INTEGER,version INTEGER,value TEXT);INSERT INTO state VALUES(1,1,'[]');CREATE TABLE local_storage(key TEXT,value TEXT);INSERT INTO local_storage VALUES('hub:campaign-delivery:records:v1','[]');CREATE TABLE local_storage_history(key TEXT,revision INTEGER,previous_present INTEGER,previous_value TEXT,next_value TEXT);CREATE TABLE route_history(delivery_id TEXT,version INTEGER,event TEXT);CREATE TABLE stores(source TEXT,store TEXT,keypath_json TEXT,auto_increment INTEGER);CREATE TABLE records(source TEXT,store TEXT,ordinal INTEGER,key_json TEXT,value_json TEXT);CREATE TABLE binaries(path TEXT,size INTEGER,sha256 TEXT,data BLOB);CREATE TABLE indexed_history(source TEXT,store TEXT,ordinal INTEGER,revision INTEGER,previous_value TEXT,next_value TEXT)");db.close()};
 const launch=()=>spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../scripts/serve-panel.ps1',import.meta.url)),'-Port',String(hubPort),'-CentralFictitiousProxy','-CentralReadOnlyPort',String(centralPort)],{stdio:'ignore',windowsHide:true});
 try{
  create();central=await startCentralFixture({path,port:centralPort,hubPort});child=launch();await ready(child);
  const headers={origin,'content-type':'application/json'},body=JSON.stringify({expectedRevision:1,operations:[{type:'local_put',input:{key:'ficticio',expectedState:'absent',value:'salvo'}}]});
  const deliveries=await call('/central/transaction/read',{method:'POST',headers,body:JSON.stringify({operations:[{type:'delivery_list',input:{}}]})});assert.equal(deliveries.status,200);assert.deepEqual(deliveries.body.results[0].value,[]);
  assert.equal((await call('/central/transaction',{method:'POST',headers,body})).status,200);
  assert.equal((await call('/central/transaction',{method:'POST',headers:{...headers,origin:'http://externo.test'},body})).status,403);
  await central.close();central=null;
  assert.equal((await call('/central/transaction/read',{method:'POST',headers,body:'{}'})).status,503);
  central=await startCentralFixture({path,port:centralPort,hubPort});
  const read=await call('/central/transaction/read',{method:'POST',headers,body:JSON.stringify({operations:[{type:'local_get',input:{key:'ficticio'}}]})});
  assert.equal(read.status,200);assert.equal(read.body.results[0].value,'salvo');
 }finally{if(child){child.kill();await new Promise(ok=>child.once('exit',ok))}if(central)await central.close();rmSync(dir,{recursive:true,force:true})}
});

test('iniciador com modo central pedido não abre o Hub quando a base de teste está ausente',async()=>{
 const root=mkdtempSync(join(tmpdir(),'hub-iniciador-sem-base-')),scripts=join(root,'scripts'),dist=join(root,'dist');
 mkdirSync(scripts);mkdirSync(dist);writeFileSync(join(dist,'index.html'),'<html></html>');
 const original=fileURLToPath(new URL('../scripts/',import.meta.url));
 copyFileSync(join(original,'iniciar-painel.ps1'),join(scripts,'iniciar-painel.ps1'));
 const mock=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({presellApi:'v2',runtime:'powershell',instanceId:'teste',centralReadOnlyProxy:true}))});
 await new Promise((resolve,reject)=>{mock.once('error',reject);mock.listen(18824,'127.0.0.1',resolve)});
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(scripts,'iniciar-painel.ps1'),'-Port','18824','-NoOpenBrowser','-CentralReadOnlyProxy'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 let output='';child.stderr.on('data',v=>output+=v);child.stdout.on('data',v=>output+=v);
 try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});assert.notEqual(code,0);assert.match(output,/base central isolada/i)}
 finally{await new Promise(resolve=>mock.close(resolve));rmSync(root,{recursive:true,force:true})}
});

test('iniciador de escrita falha sem arquivo explícito mesmo com servidor ativo',async()=>{
 const root=mkdtempSync(join(tmpdir(),'hub-iniciador-write-')),scripts=join(root,'scripts'),dist=join(root,'dist');mkdirSync(scripts);mkdirSync(dist);writeFileSync(join(dist,'index.html'),'<html></html>');copyFileSync(fileURLToPath(new URL('../scripts/iniciar-painel.ps1',import.meta.url)),join(scripts,'iniciar-painel.ps1'));
 const mock=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({presellApi:'v2',runtime:'powershell',instanceId:'teste',centralWriteProxy:true}))});await new Promise((resolve,reject)=>{mock.once('error',reject);mock.listen(18824,'127.0.0.1',resolve)});
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(scripts,'iniciar-painel.ps1'),'-Port','18824','-NoOpenBrowser','-CentralWriteProxy','-CentralWriteDatabase',join(root,'nao-existe.sqlite')],{stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';child.stderr.on('data',v=>output+=v);child.stdout.on('data',v=>output+=v);
 try{const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});assert.notEqual(code,0);assert.match(output,/encontrada/i)}finally{await new Promise(resolve=>mock.close(resolve));rmSync(root,{recursive:true,force:true})}
});

test('escrita central requer marcador explícito e persiste pela rota operacional',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hub-write-opt-in-')),path=join(dir,'teste.sqlite');let central,child;
 const db=new DatabaseSync(path);db.exec("CREATE TABLE lab_marker(value TEXT);INSERT INTO lab_marker VALUES('hub-central-lab-v1');CREATE TABLE state(id INTEGER,version INTEGER,value TEXT);INSERT INTO state VALUES(1,1,'[]');CREATE TABLE local_storage(key TEXT,value TEXT);INSERT INTO local_storage VALUES('hub:campaign-delivery:records:v1','[]');CREATE TABLE local_storage_history(key TEXT,revision INTEGER,previous_present INTEGER,previous_value TEXT,next_value TEXT);CREATE TABLE route_history(delivery_id TEXT,version INTEGER,event TEXT);CREATE TABLE stores(source TEXT,store TEXT,keypath_json TEXT,auto_increment INTEGER);CREATE TABLE records(source TEXT,store TEXT,ordinal INTEGER,key_json TEXT,value_json TEXT);CREATE TABLE binaries(path TEXT,size INTEGER,sha256 TEXT,data BLOB);CREATE TABLE indexed_history(source TEXT,store TEXT,ordinal INTEGER,revision INTEGER,previous_value TEXT,next_value TEXT);CREATE TABLE package_entries(path TEXT,size INTEGER,sha256 TEXT,data BLOB);CREATE TABLE source_info(source TEXT,status TEXT,version_json TEXT,missing_json TEXT);CREATE TABLE store_index_catalog(source TEXT,store TEXT,verified INTEGER);CREATE TABLE store_indexes(source TEXT,store TEXT,name TEXT,keypath_json TEXT,is_unique INTEGER,multi_entry INTEGER);CREATE TABLE store_generators(source TEXT,store TEXT,next_id INTEGER)");db.close();
 try{
  await assert.rejects(startCentralWrite({path,port:centralPort,hubPort}));
  const mark=new DatabaseSync(path);mark.exec("CREATE TABLE central_activation_marker(value TEXT);INSERT INTO central_activation_marker VALUES('hub-central-write-v1')");mark.close();
  central=await startCentralWrite({path,port:centralPort,hubPort});
  child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../scripts/serve-panel.ps1',import.meta.url)),'-Port',String(hubPort),'-CentralWriteProxy','-CentralReadOnlyPort',String(centralPort),'-CentralReadOnlyDatabase',path],{stdio:'ignore',windowsHide:true});await ready(child);
  const headers={origin,'content-type':'application/json'},body=JSON.stringify({expectedRevision:1,operations:[{type:'local_put',input:{key:'ficticio',expectedState:'absent',value:'salvo'}}]});
  assert.equal((await call('/central/transaction',{method:'POST',headers,body})).status,200);
  assert.equal((await call('/central/transaction',{method:'POST',headers:{...headers,origin:'http://externo.test'},body})).status,403);
  await central.close();central=null;assert.equal((await call('/central/transaction/read',{method:'POST',headers,body:'{}'})).status,503);
  central=await startCentralWrite({path,port:centralPort,hubPort});const read=await call('/central/transaction/read',{method:'POST',headers,body:JSON.stringify({operations:[{type:'local_get',input:{key:'ficticio'}}]})});assert.equal(read.body.results[0].value,'salvo');
 }finally{if(child){child.kill();await new Promise(ok=>child.once('exit',ok))}if(central)await central.close();rmSync(dir,{recursive:true,force:true})}
});
