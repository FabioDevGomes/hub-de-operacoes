import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createGeographicCentralClient} from '../src/product-diary/geographic-central.mjs';
globalThis.crypto ??= webcrypto;
const info={managerCustomerId:'1234567890',customerId:'1234567891',campaignId:'123'};
const report={ok:true,operation:'geographic_detail_test',query_complete:true,manager_customer_id:info.managerCustomerId,customer_id:info.customerId,campaign_id:info.campaignId,date_from:'2026-11-01',date_to:'2026-11-14',generated_at_utc:'2026-11-15T00:00:00Z',baseline:[],details:[],location_names:{}};
test('grava e lê apenas a campanha identificada, sem substituir versões anteriores',async()=>{
 const records=new Map();let revision=0;
 const fetchImpl=async(url,options)=>{const body=JSON.parse(options.body),op=body.operations[0],input=op.input;let output;if(op.type==='local_get')output={revision,state:records.has(input.key)?'present':'absent'};else if(op.type==='local_put'){assert.equal(body.expectedRevision,revision);assert.equal(input.expectedState,'absent');records.set(input.key,input.value);revision++;output={revision}}else output={revision,records:[...records].filter(([key])=>key.startsWith(input.prefix)).map(([key,value])=>({key,value})),nextOffset:null};return {ok:true,json:async()=>({revision,results:[output]})}};
 const client=createGeographicCentralClient({fetchImpl});await client.save(info,report);await client.save(info,{...report,generated_at_utc:'2026-11-16T00:00:00Z'});assert.equal(records.size,2);assert.equal((await client.list(info)).generated_at_utc,'2026-11-16T00:00:00Z');await assert.rejects(client.save(info,{...report,campaign_id:'999'}),/inválido/);
});
