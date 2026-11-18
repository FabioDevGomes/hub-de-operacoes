import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildGoogleAdsPresellCampaignHandoff,validateGoogleAdsPresellCampaignHandoff,writeGoogleAdsPresellCampaignHandoff,readGoogleAdsPresellCampaignHandoff} from '../src/google-ads/google-ads-presell-campaign-handoff.mjs';
import {readGoogleAdsPresellCampaignHandoffForJob,resolveGoogleAdsPresellTargets} from '../src/google-ads/google-ads-presell-url-bridge.mjs';
const job={id:'1793413690028-uhmz26',product:'Produto sintético',targets:[
  {accountId:'1234567890',accountName:'Conta A',publicUrl:'https://a.example.test/',status:'published'},
  {accountId:'1234567891',accountName:'Conta B',publicUrl:'https://b.example.test/',status:'published'},
  {accountId:'1234567892',accountName:'Conta C',publicUrl:'https://c.example.test/',status:'published'}
]};
function storage(seed={}){const values=new Map(Object.entries(seed));return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}}
test('contas e URLs publicadas sobrevivem à preparação, gravação e leitura',()=>{
  const prepared=buildGoogleAdsPresellCampaignHandoff(job);assert.equal(prepared.ok,true);
  const cache=storage();const written=writeGoogleAdsPresellCampaignHandoff(prepared.payload,cache,null);
  assert.ok(written);assert.ok(validateGoogleAdsPresellCampaignHandoff(written));
  const read=readGoogleAdsPresellCampaignHandoff(written.id,cache,null);
  assert.deepEqual(read.targets.map(t=>[t.accountId,t.url]),job.targets.map(t=>[t.accountId,t.publicUrl]));
  assert.equal(resolveGoogleAdsPresellTargets({handoff:read,campaignProduct:job.product}).targets.length,3);
});
test('a retomada pelo identificador revalida as URLs e mantém todas as contas',()=>{
  const cache=storage({'hub:presell-deploy-jobs:v1':JSON.stringify([job])});
  const result=readGoogleAdsPresellCampaignHandoffForJob(job.id,{storage:cache});
  assert.equal(result.ok,true);assert.equal(result.payload.targets.length,3);
  assert.deepEqual(result.payload.targets.map(t=>t.url),job.targets.map(t=>t.publicUrl));
});
test('endereços inseguros ou não publicados continuam bloqueados',()=>{
  assert.equal(buildGoogleAdsPresellCampaignHandoff({...job,targets:[{...job.targets[0],publicUrl:'http://a.example.test/'}]}).ok,false);
  assert.equal(buildGoogleAdsPresellCampaignHandoff({...job,targets:[{...job.targets[0],status:'pending'}]}).ok,false);
});
test('variante DE02 da campanha aceita a Pre-Sell do produto-base quando a oferta confirma o mesmo produto',()=>{
  const handoff={...buildGoogleAdsPresellCampaignHandoff({...job,product:'Power Heat Pro'}).payload,id:'presell-job-12345678'};
  const result=resolveGoogleAdsPresellTargets({handoff,campaignProduct:'Power Heat Pro DE02',offerName:'Power Heat Pro'});
  assert.equal(result.matched,true);
  assert.equal(result.targets.length,3);
  const wrongOffer=resolveGoogleAdsPresellTargets({handoff,campaignProduct:'Power Heat Pro DE02',offerName:'Outro produto'});
  assert.equal(wrongOffer.matched,false);
});
