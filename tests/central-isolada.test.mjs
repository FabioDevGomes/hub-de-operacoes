import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {startCentralReadOnly} from '../scripts/central-isolada/server.mjs';

test('serviço local abre base existente, restringe origem e impede alterações',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hub-central-read-')),path=join(dir,'data.sqlite');let instance;
 try{
  const db=new DatabaseSync(path);
  db.exec("CREATE TABLE lab_marker(value TEXT);INSERT INTO lab_marker VALUES('hub-central-lab-v1');CREATE TABLE state(id INTEGER,version INTEGER,value TEXT);INSERT INTO state VALUES(1,1,'[]');CREATE TABLE local_storage(key TEXT,value TEXT);INSERT INTO local_storage VALUES('hub:campaign-delivery:records:v1','[]');CREATE TABLE package_entries(path TEXT,size INTEGER,sha256 TEXT,data BLOB);CREATE TABLE binaries(path TEXT,size INTEGER,sha256 TEXT,data BLOB);CREATE TABLE source_info(source TEXT,status TEXT,version_json TEXT,missing_json TEXT);INSERT INTO source_info VALUES('teste','presente','1','null');CREATE TABLE stores(source TEXT,store TEXT,keypath_json TEXT,auto_increment INTEGER);CREATE TABLE records(source TEXT,store TEXT,ordinal INTEGER,key_json TEXT,value_json TEXT);CREATE TABLE route_history(delivery_id TEXT,version INTEGER,event TEXT)");db.close();
  const before=readFileSync(path),origin='http://127.0.0.1:8765',url='http://127.0.0.1:18797';
  instance=await startCentralReadOnly({path,port:18797});
  assert.equal((await(await fetch(url+'/health')).json()).service,'hub-central-readonly-v1');
  assert.equal((await(await fetch(url+'/central/package/sources',{headers:{origin}})).json()).sources[0].source,'teste');
  assert.equal((await fetch(url+'/central/package/sources',{headers:{origin:'http://example.invalid'}})).status,403);
  assert.equal((await fetch(url+'/central/operation',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,403);
  await instance.close();instance=null;assert.deepEqual(readFileSync(path),before);
 }finally{if(instance)await instance.close();rmSync(dir,{recursive:true,force:true})}
});
