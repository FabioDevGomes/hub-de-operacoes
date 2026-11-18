import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCampaignHandoffSelection} from '../src/copy-ficha/copy-ficha-deploy.mjs';

const storage={getItem:()=>null,setItem:()=>{}};
const job={id:'presell-de01',campaignDeliveryId:'delivery-de02',product:'Power Heat Pro',createdAtUtc:'2026-11-13T18:00:00.000Z',targets:[
  {accountId:'1234567890',accountName:'Conta DE',publicUrl:'https://getpowerheatpro-de.example.test/',status:'published'},
]};

test('vínculo pelo ID da entrega prevalece sobre variante no nome e envia o nome canônico da entrega',()=>{
  const result=resolveCampaignHandoffSelection([job],storage,{id:'delivery-de02',productName:'Power Heat Pro DE02'},null);
  assert.equal(result.current?.prepared.ok,true);
  assert.equal(result.current.prepared.payload.product,'Power Heat Pro DE02');
  assert.equal(result.current.prepared.payload.targets[0].url,'https://getpowerheatpro-de.example.test/');
});

test('trabalho antigo sem ID continua exigindo correspondência exata do produto',()=>{
  const legacy={...job,id:'legacy',campaignDeliveryId:undefined};
  const result=resolveCampaignHandoffSelection([legacy],storage,{id:'delivery-de02',productName:'Power Heat Pro DE02',createdAt:'2026-11-13T17:00:00.000Z'},null);
  assert.equal(result.current,null);
  assert.match(result.reason,/Ainda não há uma Pre-Sell vinculada à entrega/);
});
