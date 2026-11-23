import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planPolicyChecks,policyTopicsForCampaign,POLICY_RECHECK_MS} from '../src/google-ads/google-ads-policy-planner.mjs';
test('consulta inicial, intervalo, resolução e recorrência são independentes por campanha',()=>{
 const now=Date.parse('2026-11-21T12:00:00Z'),campaign=(id,rejected)=>({campaignId:id,primaryStatusReasons:rejected?['HAS_ADS_DISAPPROVED']:[]});
 const prior={'1':{rejected:true,attemptAtUtc:new Date(now-1000).toISOString()},'2':{rejected:true,attemptAtUtc:new Date(now-POLICY_RECHECK_MS).toISOString()},'3':{rejected:false,attemptAtUtc:new Date(now-1000).toISOString()}};
 const result=planPolicyChecks([campaign('1',true),campaign('2',true),campaign('3',true),campaign('4',false)],prior,now);
 assert.deepEqual(result.due,['2','3']);assert.equal(result.next['4'].rejected,false);
});
test('motivos permanecem associados ao anúncio e campanha',()=>{
 const ads=[{campaign_id:'1',ad_group_id:'2',ad_id:'3',approval_status:'DISAPPROVED',topics:[{topic:'DESTINATION_NOT_WORKING',type:'PROHIBITED'}]},{campaign_id:'1',ad_group_id:'2',ad_id:'4',approval_status:'APPROVED',topics:[]}];
 assert.deepEqual(policyTopicsForCampaign(ads,'1'),[{adGroupId:'2',adId:'3',topics:[{topic:'DESTINATION_NOT_WORKING',type:'PROHIBITED'}]}]);
});
