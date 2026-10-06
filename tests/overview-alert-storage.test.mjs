import assert from 'node:assert/strict';
import test from 'node:test';
import {saveRemainingAlerts,loadRemainingAlerts} from '../src/overview/remaining-alert-storage.mjs';

function memoryDb(base,{fail=false}={}){
  let stored=structuredClone(base),closed=0,writes=0;const stores=[];
  const db={close(){closed++},transaction(name,mode){
    stores.push([name,mode]);let staged,aborted=false;
    const tx={error:null,abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())},objectStore(store){
      assert.equal(store,'bases');
      return {get(key){assert.equal(key,'atual');const request={};
        queueMicrotask(()=>{request.result=structuredClone(stored);request.onsuccess?.();queueMicrotask(()=>{if(aborted)return;if(fail){tx.error=new Error('Falha na transação');tx.onabort?.();return}if(staged!==undefined)stored=staged;tx.oncomplete?.()})});return request},
        put(value,key){assert.equal(key,'atual');writes++;staged=structuredClone(value)}};
    }};
    return tx;
  }};
  return{openDb:async()=>db,get value(){return stored},get closed(){return closed},get writes(){return writes},stores};
}

test('salva apenas cores na base mais recente, sem eventos, cópias financeiras ou timestamp MCC novo',async()=>{
  const base={schema:'base_campanhas_v1',atualizado_em:'2026-10-06T10:00:00Z',campanhas:[{id:'nova'}],diario:[{valor:321}],manifesto_atual:{id:'captura-nova'},event_log:[{event_id:'preservar'}],outra_configuracao:42};
  const fake=memoryDb(base),result=await saveRemainingAlerts({minimum:100,yellowMinimum:200},{openDb:fake.openDb});
  assert.deepEqual(result,{minimum:100,yellowMinimum:200});assert.deepEqual(fake.value,{...base,valor_restante_alerta_minimo:100,valor_restante_alerta_amarelo_minimo:200});
  assert.deepEqual(fake.stores,[['bases','readwrite']]);assert.equal(fake.writes,1);assert.equal(fake.closed,1);
  assert.deepEqual(await loadRemainingAlerts({openDb:fake.openDb}),result);assert.equal(fake.closed,2);assert.equal(fake.writes,1);
});
test('erro aborta as duas configurações, ausência não cria base e entradas inválidas não abrem banco',async()=>{
  const base={schema:'base_campanhas_v1',valor_restante_alerta_minimo:100,valor_restante_alerta_amarelo_minimo:200},fake=memoryDb(base,{fail:true});
  await assert.rejects(saveRemainingAlerts({minimum:50,yellowMinimum:150},{openDb:fake.openDb}),/Falha/);
  assert.deepEqual(fake.value,base);assert.equal(fake.closed,1);
  const missing=memoryDb(null);await assert.rejects(saveRemainingAlerts({minimum:50,yellowMinimum:150},{openDb:missing.openDb}),/base não está carregada/);assert.equal(missing.writes,0);
  let opened=0;
  for(const values of [{minimum:-1,yellowMinimum:200},{minimum:100,yellowMinimum:NaN},{minimum:100,yellowMinimum:-1}]){
    await assert.rejects(saveRemainingAlerts(values,{openDb:async()=>{opened++;throw Error('Não deveria abrir')}}));
  }
  assert.equal(opened,0);
});
test('zero, casas decimais, backup legado e desativação do amarelo permanecem válidos',async()=>{
  const fake=memoryDb({schema:'base_campanhas_v1'});
  assert.deepEqual(await loadRemainingAlerts({openDb:fake.openDb}),{minimum:undefined,yellowMinimum:null});
  assert.deepEqual(await saveRemainingAlerts({minimum:0,yellowMinimum:200.555},{openDb:fake.openDb}),{minimum:0,yellowMinimum:200.56});
  assert.deepEqual(await saveRemainingAlerts({minimum:100,yellowMinimum:null},{openDb:fake.openDb}),{minimum:100,yellowMinimum:null});
});
