import assert from 'node:assert/strict';
import {test} from 'node:test';
import {adjustGoogleAdsCampaignTargetCpa} from '../src/google-ads/google-ads-campaign-actions-service.mjs';

function response(payload){return{ok:true,status:200,headers:{get:()=>''},json:async()=>payload}}
const input=stepPercentagePoints=>({managerCustomerId:'1111111111',customerId:'2222222222',campaignId:'333',expectedTargetCpaMicros:'27600000',expectedCurrencyCode:'USD',commissionCents:4600,commissionCurrency:'USD',commissionTargetCents:4600,exchangeRate:1,direction:'increase',...(stepPercentagePoints==null?{}:{stepPercentagePoints})});

test('CPA service keeps legacy 2-point payloads and validates their exact target',async()=>{
  let request;
  const result=await adjustGoogleAdsCampaignTargetCpa(input(),{token:'synthetic-token',fetchImpl:async(url,options)=>{
    request={url:String(url),body:JSON.parse(options.body)};
    return response({ok:true,schema_version:1,operation:'adjust_campaign_target_cpa',verified:true,campaign_id:'333',previous_target_cpa_micros:'27600000',target_cpa_micros:'28520000',currency_code:'USD'});
  }});
  assert.equal(request.body.operation,'adjust_campaign_target_cpa');
  assert.equal(Object.hasOwn(request.body,'step_percentage_points'),false,'2 pontos seguem compatíveis com o endpoint anterior');
  assert.equal(result.stepPercentagePoints,2);
  assert.equal(result.targetCpaMicros,'28520000');
  await assert.rejects(adjustGoogleAdsCampaignTargetCpa(input(),{token:'synthetic-token',fetchImpl:async()=>response({ok:true,schema_version:1,operation:'adjust_campaign_target_cpa',verified:true,campaign_id:'333',previous_target_cpa_micros:'27600000',target_cpa_micros:'29990000',currency_code:'USD'})}),/não confirmou o novo CPA previsto/);
});

test('CPA service sends and checks the explicit 4-point step',async()=>{
  let request;
  const result=await adjustGoogleAdsCampaignTargetCpa(input(4),{token:'synthetic-token',fetchImpl:async(url,options)=>{
    request={url:String(url),body:JSON.parse(options.body)};
    return response({ok:true,schema_version:1,operation:'adjust_campaign_target_cpa',verified:true,campaign_id:'333',previous_target_cpa_micros:'27600000',target_cpa_micros:'29440000',currency_code:'USD',step_percentage_points:'4'});
  }});
  assert.equal(request.body.step_percentage_points,'4');
  assert.equal(result.stepPercentagePoints,4);
  assert.equal(result.targetCpaMicros,'29440000');
  let requested=false;
  await assert.rejects(adjustGoogleAdsCampaignTargetCpa(input(3),{token:'synthetic-token',fetchImpl:async()=>{requested=true;return response({})}}),/não são válidos/);
  assert.equal(requested,false,'passos não suportados são recusados antes da rede');
});
