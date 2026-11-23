import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syncCampaignConfirmations, progressWithCentralConfirmations} from '../src/google-ads/campanha-confirmacoes-central.mjs';
import {campaignSetSignature, sharedStepFingerprint} from '../src/campaign-delivery/progress-domain.mjs';

test('sincroniza somente lote vinculado ao mesmo conjunto e projeta confirmações', async () => {
  const campaign = {customerId:'1234567890', campaignId:'123', source:'created', verified:true, positiveGeoTargetType:'PRESENCE', customConversionGoalName:'Meta', conversionActionName:'Compra'};
  const batch = {id:'batch1', draftId:'draft1', updatedAt:'2026-11-20T10:00:00Z', formSnapshot:{__hub_campaign_delivery_source:{deliveryId:'delivery1'}}, campaigns:[campaign], sitelinks:[]};
  const signature = campaignSetSignature(batch.campaigns);
  batch.workflowConfirmations = Object.fromEntries(['targeting','exclusions','images'].map(step => [step,{campaignSet:signature,fingerprint:sharedStepFingerprint(batch,step),confirmedAtUtc:'2026-11-20T10:00:00Z'}]));
  campaign.sitelinksResult={verified:true,signature:'[]'};
  let snapshot={batchId:'draft1',data:{deliveryId:'delivery1',createdCampaigns:[{...campaign}]}};
  let writes=0;
  const client={read:async()=>({snapshot,revision:1,raw:'old'}),save:async(id,data)=>{writes++;snapshot={batchId:id,data}}};
  assert.equal(await syncCampaignConfirmations(client,snapshot,[batch],{isExpansionBlocked:()=>false}),true);
  assert.equal(writes,1);
  const progress=progressWithCentralConfirmations({batch:null,curadoria:true,assets:true,presell:true,expansionBlocked:false},snapshot);
  assert.equal(progress.complete,true);
  assert.equal(await syncCampaignConfirmations(client,snapshot,[batch],{isExpansionBlocked:()=>false}),false);
  assert.equal(writes,1);
  const different={...snapshot,data:{...snapshot.data,createdCampaigns:[{...campaign,campaignId:'999'}]}};
  assert.equal(progressWithCentralConfirmations({batch:null},different).batch,null);
  assert.equal(await syncCampaignConfirmations(client,different,[batch]),false);
});
