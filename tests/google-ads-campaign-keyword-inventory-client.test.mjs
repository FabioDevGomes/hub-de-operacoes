import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fetchGoogleAdsCampaignKeywordInventory,GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT} from '../src/google-ads/google-ads-campaign-actions-service.mjs';

const input={managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789'};
const payload=()=>({ok:true,schema_version:1,operation:'read_campaign_keyword_inventory',campaign:{customer_id:input.customerId,campaign_id:input.campaignId,campaign_name:'Campaign',status:'ENABLED',channel_type:'SEARCH'},positive_keywords:[{term:'positive',match_type:'EXACT',status:'ENABLED',scope:'AD_GROUP',ad_group_id:'456'}],negative_keywords:[{term:'negative',match_type:'PHRASE',status:'PAUSED',scope:'CAMPAIGN',ad_group_id:null}],verified:true,read_at_utc:'2026-11-20T15:30:00Z'});
const response=value=>({ok:true,status:200,json:async()=>value});

test('campaign keyword inventory client sends a read-only, exact-scope request and normalizes the verified response',async()=>{
  let request;
  const result=await fetchGoogleAdsCampaignKeywordInventory(input,{token:'synthetic-token',fetchImpl:async(url,options)=>{request={url,options};return response(payload())}});
  assert.equal(request.url,GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT);
  assert.equal(request.options.method,'POST');assert.equal(request.options.headers.Authorization,'Bearer synthetic-token');
  assert.deepEqual(JSON.parse(request.options.body),{operation:'read_campaign_keyword_inventory',manager_customer_id:input.managerCustomerId,customer_id:input.customerId,campaign_id:input.campaignId});
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{campaign:{customerId:input.customerId,campaignId:input.campaignId,campaignName:'Campaign',status:'ENABLED',channelType:'SEARCH'},verified:true,readAtUtc:'2026-11-20T15:30:00Z',positiveKeywords:[{term:'positive',matchType:'EXACT',status:'ENABLED',scope:'AD_GROUP',adGroupId:'456'}],negativeKeywords:[{term:'negative',matchType:'PHRASE',status:'PAUSED',scope:'CAMPAIGN',adGroupId:null}]});
});

test('campaign keyword inventory client rejects malformed input and incomplete or mismatched responses',async()=>{
  let called=false;
  await assert.rejects(fetchGoogleAdsCampaignKeywordInventory({...input,campaignId:'0'},{token:'synthetic-token',fetchImpl:async()=>{called=true;return response(payload())}}),/campanha Google Ads válidas/);
  assert.equal(called,false);
  const invalid=payload();invalid.positive_keywords[0].scope='CAMPAIGN';
  await assert.rejects(fetchGoogleAdsCampaignKeywordInventory(input,{token:'synthetic-token',fetchImpl:async()=>response(invalid)}),/incompleta ou incompatível/);
  const wrongCampaign=payload();wrongCampaign.campaign.campaign_id='987';
  await assert.rejects(fetchGoogleAdsCampaignKeywordInventory(input,{token:'synthetic-token',fetchImpl:async()=>response(wrongCampaign)}),/incompleta ou incompatível/);
});
