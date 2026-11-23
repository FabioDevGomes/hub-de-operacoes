import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPolicyCentral} from '../src/google-ads/google-ads-policy-central.mjs';
import {policyReviewRows} from '../src/google-ads/google-ads-policy-review-domain.mjs';

test('salva snapshot central, reutiliza resultado e consulta ao voltar a reprovação',async()=>{
 const records=new Map();let revision=1,queries=0,time=Date.parse('2026-11-21T12:00:00Z');
 const fetchImpl=async(url,options)=>{const input=JSON.parse(options.body),op=input.operations[0],key=op.input.key;if(url.endsWith('/transaction/read'))return {ok:true,json:async()=>({revision,results:[records.has(key)?{revision,state:'present',value:records.get(key)}:{revision,state:'absent'}]})};if(input.expectedRevision!==revision)return {ok:false,status:409};if(op.input.expectedState==='absent'&&records.has(key))return {ok:false,status:409};if(op.input.expectedState==='present'&&records.get(key)!==op.input.expectedValue)return {ok:false,status:409};records.set(key,op.input.value);revision++;return {ok:true,json:async()=>({revision,results:[{revision}]})}};
 const query=async()=>{queries++;return {read_at_utc:new Date(time).toISOString(),ads:[{campaign_id:'12',ad_group_id:'34',ad_id:'56',approval_status:'DISAPPROVED',topics:[{topic:queries===1?'DESTINATION_NOT_WORKING':'OTHER_POLICY',type:'PROHIBITED'}]}]}};
 const client=createPolicyCentral({fetchImpl,query,clock:()=>new Date(time)}),report={managerCustomerId:'1111111111',customerId:'2222222222',configuration:{campaigns:[{campaignId:'12',campaignName:'Exemplo',primaryStatusReasons:['HAS_ADS_DISAPPROVED']}]}};
 await client.collect(report,'snap1');assert.equal(queries,1);assert.equal((await client.getSnapshot('snap1'))[0].change,'first');const firstKey=policyReviewRows(await client.getSnapshot('snap1'))[0].key;await client.markReviewed('snap1',firstKey);assert.ok((await client.getReviews())[firstKey]);
 time+=3600000;await client.collect(report,'snap2');assert.equal(queries,1);assert.equal((await client.getSnapshot('snap2'))[0].change,null);
 report.configuration.campaigns[0].primaryStatusReasons=[];await client.collect(report,'snap3');
 report.configuration.campaigns[0].primaryStatusReasons=['HAS_ADS_DISAPPROVED'];await client.collect(report,'snap4');assert.equal(queries,2);assert.equal((await client.getSnapshot('snap4'))[0].change,'changed');assert.equal((await client.getSnapshot('snap1'))[0].ads[0].topics[0].topic,'DESTINATION_NOT_WORKING');assert.notEqual(policyReviewRows(await client.getSnapshot('snap4'))[0].key,firstKey);
});

test('falha preserva último resultado e não repete antes de 24 horas',async()=>{
 const records=new Map();let revision=1,time=Date.parse('2026-11-21T12:00:00Z'),calls=0;
 const fetchImpl=async(url,options)=>{const input=JSON.parse(options.body),op=input.operations[0],key=op.input.key;if(url.endsWith('/transaction/read'))return {ok:true,json:async()=>({revision,results:[records.has(key)?{revision,state:'present',value:records.get(key)}:{revision,state:'absent'}]})};if(input.expectedRevision!==revision)return {ok:false,status:409};records.set(key,op.input.value);revision++;return {ok:true,json:async()=>({revision,results:[{revision}]})}};
 const query=async()=>{calls++;if(calls>1)throw Error('indisponível');return {read_at_utc:new Date(time).toISOString(),ads:[{campaign_id:'12',ad_group_id:'34',ad_id:'56',approval_status:'DISAPPROVED',topics:[{topic:'DESTINATION_NOT_WORKING',type:'PROHIBITED'}]}]}};
 const client=createPolicyCentral({fetchImpl,query,clock:()=>new Date(time)}),report={managerCustomerId:'1111111111',customerId:'2222222222',configuration:{campaigns:[{campaignId:'12',primaryStatusReasons:['HAS_ADS_DISAPPROVED']}]}};
 await client.collect(report,'first');time+=25*3600000;await client.collect(report,'failed');const result=(await client.getSnapshot('failed'))[0];assert.equal(result.status,'failed');assert.equal(result.ads[0].topics[0].topic,'DESTINATION_NOT_WORKING');time+=3600000;await client.collect(report,'later');assert.equal(calls,2);
});

test('analisar um motivo não analisa outro anúncio e recorrência gera nova pendência',async()=>{
 const records=new Map();let revision=1,time=Date.parse('2026-11-21T12:00:00Z');
 const fetchImpl=async(url,options)=>{const input=JSON.parse(options.body),op=input.operations[0],key=op.input.key;if(url.endsWith('/transaction/read'))return {ok:true,json:async()=>({revision,results:[records.has(key)?{revision,state:'present',value:records.get(key)}:{revision,state:'absent'}]})};if(input.expectedRevision!==revision)return {ok:false,status:409};records.set(key,op.input.value);revision++;return {ok:true,json:async()=>({revision,results:[{revision}]})}};
 const query=async()=>({read_at_utc:new Date(time).toISOString(),ads:['56','57'].map(ad=>({campaign_id:'12',ad_group_id:'34',ad_id:ad,approval_status:'DISAPPROVED',topics:[{topic:'DESTINATION_NOT_WORKING',type:'PROHIBITED'}]}))});
 const client=createPolicyCentral({fetchImpl,query,clock:()=>new Date(time)}),report={managerCustomerId:'1111111111',customerId:'2222222222',configuration:{campaigns:[{campaignId:'12',primaryStatusReasons:['HAS_ADS_DISAPPROVED']}]}};
 await client.collect(report,'a');const first=policyReviewRows(await client.getSnapshot('a'));await client.markReviewed('a',first[0].key);const reviews=await client.getReviews();assert.equal(policyReviewRows(await client.getSnapshot('a'),reviews).filter(row=>!row.reviewedAtUtc).length,1);
 report.configuration.campaigns[0].primaryStatusReasons=[];await client.collect(report,'b');report.configuration.campaigns[0].primaryStatusReasons=['HAS_ADS_DISAPPROVED'];await client.collect(report,'c');assert.equal(policyReviewRows(await client.getSnapshot('c'),await client.getReviews()).filter(row=>!row.reviewedAtUtc).length,2);
});
