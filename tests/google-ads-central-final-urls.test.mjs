import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleAdsCentralFinalUrlIndex} from '../src/google-ads/google-ads-campaign-batch-final-urls.mjs';

test('URL central exige conta e campanha exatas e recusa divergências e URLs inseguras', async () => {
  const records = [
    {batchId:'one',data:{createdCampaigns:[{customerId:'1234567890',campaignId:'12',finalUrl:'https://example.com/'},{customerId:'1234567890',campaignId:'13',finalUrl:'https://first.example/'},{customerId:'1234567890',campaignId:'14',finalUrl:'http://example.com/'}]}},
    {batchId:'two',data:{createdCampaigns:[{customerId:'1234567890',campaignId:'13',finalUrl:'https://second.example/'}]}}
  ].map(s=>({key:'hub:campaign-snapshot:v1:'+s.batchId,value:JSON.stringify({schemaVersion:1,...s})}));
  const fetchImpl=async()=>({ok:true,json:async()=>({revision:1,results:[{revision:1,records,nextOffset:null}]})});
  const index=await googleAdsCentralFinalUrlIndex({fetchImpl});
  assert.equal(index.get('1234567890:12'),'https://example.com/');
  assert.equal(index.has('1234567890:13'),false);
  assert.equal(index.has('1234567890:14'),false);
  assert.equal(index.has('9999999999:12'),false);
});
