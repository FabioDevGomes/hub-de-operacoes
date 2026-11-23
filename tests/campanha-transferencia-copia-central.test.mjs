import test from 'node:test';
import assert from 'node:assert/strict';
import {readCentralPresellHandoff,acknowledgeCentralPresellHandoff} from '../src/google-ads/campanha-transferencia-copia-central.mjs';
import {GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY,GOOGLE_ADS_PRESELL_HANDOFF_STORAGE_PREFIX} from '../src/google-ads/google-ads-presell-campaign-handoff.mjs';

const payload={schemaVersion:1,id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',sourceJobId:'job-ficticio',product:'Produto fictício',targets:[{accountId:'1234567890',url:'https://example.com/'}]};
function service(initial={}) {
 const values=new Map(Object.entries(initial));let revision=0;
 return {values,request:async(path,body)=>{
  if(path==='/transaction/read')return {revision,results:body.operations.map(({input:{key}})=>({revision,state:values.has(key)?'present':'absent',...(values.has(key)?{value:values.get(key)}:{})}))};
  assert.equal(body.expectedRevision,revision);
  for(const {input} of body.operations){assert.equal(values.has(input.key)?'present':'absent',input.expectedState);if(input.expectedState==='present')assert.equal(values.get(input.key),input.expectedValue);values.set(input.key,input.value)}
  revision++;return {revision,results:body.operations.map(()=>({revision}))};
 }};
}
test('lê transferência e confirma preservando registros anteriores',async()=>{
 const key=GOOGLE_ADS_PRESELL_HANDOFF_STORAGE_PREFIX+payload.id;
 const previous=JSON.stringify({outro:{fingerprint:'anterior'}});
 const api=service({[key]:JSON.stringify(payload),[GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY]:previous});
 const result=await readCentralPresellHandoff(api.request,payload.id);
 assert.equal(result.payload.product,payload.product);
 await acknowledgeCentralPresellHandoff(api.request,result.payload,'2026-11-19T00:00:00.000Z');
 const ack=JSON.parse(api.values.get(GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY));
 assert.deepEqual(ack.outro,{fingerprint:'anterior'});assert.ok(ack['job-ficticio'].fingerprint);
 assert.equal(api.values.get(key),JSON.stringify(payload));
});
test('não confirma quando registro anterior é inválido',async()=>{
 const api=service({[GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY]:'[]'});
 await assert.rejects(acknowledgeCentralPresellHandoff(api.request,payload),/inválidas/);
 assert.equal(api.values.get(GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY),'[]');
});
test('não aceita transferência ausente ou de identificador divergente',async()=>{
 const api=service();await assert.rejects(readCentralPresellHandoff(api.request,payload.id),/indisponível/);
 const key=GOOGLE_ADS_PRESELL_HANDOFF_STORAGE_PREFIX+payload.id;
 api.values.set(key,JSON.stringify({...payload,id:'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'}));
 await assert.rejects(readCentralPresellHandoff(api.request,payload.id),/inválida/);
});
