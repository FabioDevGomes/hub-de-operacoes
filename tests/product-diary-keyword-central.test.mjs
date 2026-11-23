import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createKeywordCentralClient} from '../src/product-diary/keyword-central.mjs';

test('leituras centrais preservam histórico e ficam isoladas por campanha',async()=>{
 const data=new Map();let revision=1;
 const fetchImpl=async(url,options)=>{const input=JSON.parse(options.body),op=input.operations[0],arg=op.input;let result;
  if(url.endsWith('/transaction/read')){if(op.type==='local_get')result=data.has(arg.key)?{revision,state:'present',value:data.get(arg.key)}:{revision,state:'absent'};else result={revision,records:[...data].filter(([key])=>key.startsWith(arg.prefix)).map(([key,value])=>({key,value})),nextOffset:null};return {ok:true,json:async()=>({revision,results:[result]})}}
  assert.equal(arg.expectedState,'absent');assert.equal(data.has(arg.key),false);data.set(arg.key,arg.value);revision++;return {ok:true,json:async()=>({revision,results:[{revision}]})};
 };
 const client=createKeywordCentralClient({fetchImpl}),info={managerCustomerId:'1234567890',customerId:'1234567891',campaignId:'42'},make=(date,term)=>({verified:true,readAtUtc:date,campaign:{customerId:info.customerId,campaignId:info.campaignId},positiveKeywords:[{term}],negativeKeywords:[]});
 await client.save(info,make('2026-11-20T10:00:00Z','primeira'));await client.save(info,make('2026-11-21T10:00:00Z','segunda'));
 assert.equal(data.size,2);assert.equal((await client.list(info)).positiveKeywords[0].term,'segunda');assert.equal(await client.list({...info,campaignId:'43'}),null);
 await assert.rejects(client.save(info,make('inválida','x')));
});
