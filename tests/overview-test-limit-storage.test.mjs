import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultTestLimitSettings,loadTestLimitSettings,saveTestLimitSettings} from '../src/overview/test-limit-settings-storage.mjs';

function memoryDb(base,{fail=false}={}){
  let stored=structuredClone(base),closed=0,writes=0;const stores=[];
  const db={close(){closed++},transaction(name,mode){
    stores.push([name,mode]);let staged,aborted=false;
    const tx={error:null,abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())},objectStore(store){assert.equal(store,'bases');return{get(key){assert.equal(key,'atual');const request={};queueMicrotask(()=>{request.result=structuredClone(stored);request.onsuccess?.();queueMicrotask(()=>{if(aborted)return;if(fail){tx.error=new Error('Falha na transação');tx.onabort?.();return}if(staged!==undefined)stored=staged;tx.oncomplete?.()})});return request},put(value,key){assert.equal(key,'atual');writes++;staged=structuredClone(value)}}}};return tx;
  }};
  return{openDb:async()=>db,get value(){return stored},get closed(){return closed},get writes(){return writes},stores};
}

test('salva somente as regras aditivas sem alterar timestamp, diário, MCC ou eventos',async()=>{
  const base={schema:'base_campanhas_v1',atualizado_em:'2026-10-06T10:00:00Z',campanhas:[{id:'x'}],diario:[{metricas:{cliques:321}}],manifesto_atual:{id:'mcc'},event_log:[{event_id:'preservar'}],outro_campo:true};
  const fake=memoryDb(base),value={cpaMinimumPercent:85,commissionPercent:45,roiBySales:{1:5,2:15,3:25,4:35}},result=await saveTestLimitSettings(value,{openDb:fake.openDb});
  assert.deepEqual(result,value);assert.deepEqual(fake.value,{...base,regras_limite_teste:value});assert.deepEqual(fake.stores,[['bases','readwrite']]);assert.equal(fake.writes,1);assert.equal(fake.closed,1);
  assert.deepEqual(await loadTestLimitSettings({openDb:fake.openDb}),value);assert.equal(fake.closed,2);assert.equal(fake.writes,1);
});

test('bases antigas mantêm padrões atuais e leitura não grava',async()=>{
  const fake=memoryDb({schema:'base_campanhas_v1',atualizado_em:'2026-10-06'});
  assert.deepEqual(defaultTestLimitSettings,{cpaMinimumPercent:90,commissionPercent:50,roiBySales:{1:10,2:20,3:30,4:30}});
  assert.deepEqual(await loadTestLimitSettings({openDb:fake.openDb}),defaultTestLimitSettings);assert.equal(fake.writes,0);
  fake.value.regras_limite_teste={cpaMinimumPercent:80,commissionPercent:40,roiBySales:{1:0,2:-101,3:30}};
  assert.deepEqual(await loadTestLimitSettings({openDb:fake.openDb}),{cpaMinimumPercent:80,commissionPercent:40,roiBySales:{1:0,2:20,3:30,4:30}});
});

test('falhas abortam a gravação e dados inválidos são barrados antes de abrir o banco',async()=>{
  const base={schema:'base_campanhas_v1'},value={cpaMinimumPercent:85,commissionPercent:50,roiBySales:{1:10,2:20,3:30,4:30}},fake=memoryDb(base,{fail:true});
  await assert.rejects(saveTestLimitSettings(value,{openDb:fake.openDb}),/Falha na transação/);assert.deepEqual(fake.value,base);assert.equal(fake.closed,1);
  const missing=memoryDb(null);await assert.rejects(saveTestLimitSettings(value,{openDb:missing.openDb}),/base não está carregada/);assert.equal(missing.writes,0);
  let opened=0;
  for(const invalid of [{...value,cpaMinimumPercent:0},{...value,commissionPercent:-1},{...value,roiBySales:{...value.roiBySales,4:-100}}])await assert.rejects(saveTestLimitSettings(invalid,{openDb:async()=>{opened++;throw Error('Não deveria abrir')}}));
  assert.equal(opened,0);
});
