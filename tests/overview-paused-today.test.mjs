import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source=await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8');
const window={};
vm.runInNewContext(source,{window});
const pausedCampaignNamesOnDate=window.OverviewDomain.pausedCampaignNamesOnDate;

const campaign={id:'cmp_internal_1',nome_mcc:'Campanha pausada automaticamente',conta_id:'4404265713',mcc_id:'3533796641',google_ads_campaign_id:'24408705974',status:'pausada',pausada_em:'2026-11-05'};
const capture=(capturedAtUtc,campaignStatus)=>({
  captureSchemaVersion:2,
  capturedAtUtc,
  managerCustomerId:'3533796641',
  customerId:'4404265713',
  configuration:{complete:true,campaigns:[{mappingStatus:'mapped',campaignInternalId:'cmp_internal_1',campaignId:'24408705974',campaignStatus}]},
});
const activeBeforePause=capture('2026-11-05T13:00:00.000Z','ENABLED');
const automaticPause={
  eventType:'automatic_pause',
  executionMode:'automatic',
  status:'completed',
  completedAtUtc:'2026-11-05T14:00:00.000Z',
  changes:[{managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'24408705974',campaignInternalId:'cmp_internal_1',fields:[{key:'campaignStatus',before:'ENABLED',after:'PAUSED'}]}],
};

test('server-confirmed automatic pause appears before a new API capture',()=>{
  assert.deepEqual(Array.from(pausedCampaignNamesOnDate([campaign],'2026-11-05',{sourceMode:'api',apiCaptures:[activeBeforePause],apiChangeHistory:[automaticPause]})),['Campanha pausada automaticamente']);
});

test('a later PAUSED capture keeps the automatic pause in the list',()=>{
  assert.deepEqual(Array.from(pausedCampaignNamesOnDate([campaign],'2026-11-05',{sourceMode:'api',apiCaptures:[activeBeforePause,capture('2026-11-05T15:00:00.000Z','PAUSED')],apiChangeHistory:[automaticPause]})),['Campanha pausada automaticamente']);
});

test('a later ENABLED or REMOVED capture removes the reactivated campaign',()=>{
  for(const status of ['ENABLED','REMOVED'])assert.deepEqual(Array.from(pausedCampaignNamesOnDate([campaign],'2026-11-05',{sourceMode:'api',apiCaptures:[activeBeforePause,capture('2026-11-05T15:00:00.000Z',status)],apiChangeHistory:[automaticPause]})),[],`${status} posterior invalida a pausa na lista`);
});

test('automatic pause history does not match a campaign with a different saved identity',()=>{
  assert.deepEqual(Array.from(pausedCampaignNamesOnDate([{...campaign,google_ads_campaign_id:'999'}],'2026-11-05',{sourceMode:'api',apiCaptures:[activeBeforePause],apiChangeHistory:[automaticPause]})),[]);
});
