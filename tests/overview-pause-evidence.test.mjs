import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

const context=vm.createContext({window:{},setTimeout,clearTimeout,setInterval,clearInterval});
vm.runInContext(await readFile(new URL('../src/overview/view.js',import.meta.url),'utf8'),context);
const awaitDomain=await readFile(new URL('../src/overview-domain.js',import.meta.url),'utf8');
const blocked=context.window.OverviewView.pauseEvidenceBlocks;
const candidate={internalCampaignId:'local-1',managerCustomerId:'1234567890',customerId:'0987654321',campaignId:'42'};
const pause={...candidate,confirmedAtUtc:'2026-11-01T12:00:10Z'};

test('a pause confirmed after the status query suppresses the stale candidate',()=>{
  assert.equal(blocked({candidate,applied:pause,configurationAt:'2026-11-01T12:00:00Z'}),true);
  assert.equal(blocked({candidate,history:[{campaignId:'local-1',occurredAtUtc:pause.confirmedAtUtc}],configurationAt:'2026-11-01T12:00:00Z'}),true);
  assert.equal(blocked({candidate,applied:pause,configurationAt:null}),true);
});

test('a newer enabled observation or confirmed reactivation allows reevaluation',()=>{
  assert.equal(blocked({candidate,applied:pause,configurationAt:'2026-11-01T12:00:11Z'}),false);
  assert.equal(blocked({candidate,applied:pause,configurationAt:'2026-11-01T12:00:00Z',override:{...candidate,status:'ENABLED',verifiedAtUtc:'2026-11-01T12:01:00Z'}}),false);
});

test('an already paused observation survives as evidence without inventing a pause event',()=>{
  assert.equal(blocked({candidate,observed:{...candidate,verifiedAtUtc:'2026-11-01T12:00:10Z'},configurationAt:'2026-11-01T12:00:00Z'}),true);
  assert.equal(blocked({candidate,override:{...candidate,status:'PAUSED',verifiedAtUtc:'2026-11-01T12:00:10Z'},configurationAt:'2026-11-01T12:00:00Z'}),true);
});

test('evidence from a different campaign or account is ignored',()=>{
  assert.equal(blocked({candidate,applied:{...pause,customerId:'1111111111'},history:[{campaignId:'other',occurredAtUtc:pause.confirmedAtUtc}],configurationAt:'2026-11-01T12:00:00Z'}),false);
});

test('the product preview blocks a stale paused competitor and permits a later enabled observation',async()=>{
  vm.runInContext(awaitDomain,context);
  const {root,get}=createRoot(),state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active',rate:5.1};
  const makeRow=(id,name)=>({campaignId:id,productKey:'product',identity:{name,product:'Produto'},c:{nome_campanha_exato:name,_status:'ativa'},totals:{investment:0,impressions:0,clicks:0,conversions:0},d0Totals:{investment:0,impressions:0,clicks:0},roi:null,profit:null,zeroDays:0});
  const makeCapture=(id,completedAtUtc,configurationGeneratedAtUtc,refImpressions,refClicks)=>({id,completedAtUtc,periodType:'D0',accounts:[{managerCustomerId:'1234567890',customerId:'0987654321',date:'2026-11-01',queryComplete:true,configurationComplete:true,configurationGeneratedAtUtc,campaigns:[{campaignInternalId:'local-1',campaignId:'42',campaignName:'Concorrente',campaignStatus:'ENABLED',mappingStatus:'mapped',metricsAvailable:true,impressions:0,clicks:0},{campaignInternalId:'local-2',campaignId:'43',campaignName:'Referência',campaignStatus:'ENABLED',mappingStatus:'mapped',metricsAvailable:true,impressions:refImpressions,clicks:refClicks}]}]});
  const snapshot={rows:[makeRow('local-1','Concorrente'),makeRow('local-2','Referência')],dates:{d0:'2026-11-01',d1:'2026-10-31'},d1Totals:[],apiCaptureSnapshots:[makeCapture('first','2026-11-01T11:00:00Z','2026-11-01T11:00:00Z',0,0),makeCapture('last','2026-11-01T12:01:00Z','2026-11-01T12:00:00Z',110,3)],autoPauseHistory:[]};
  const prefs={getItem:()=>null,setItem:()=>{}};
  const controller=context.window.OverviewView.mount({root,state,getSnapshot:()=>snapshot,domain:context.window.OverviewDomain,format,preferences:prefs,actions:{}});
  controller.render();assert.equal(get('#overviewMinimumProductPauseList').innerHTML,'');get('#openAutoPauseReport').onclick();assert.match(get('#overviewMinimumProductPauseList').innerHTML,/Concorrente/);
  const saved=new Map([['hub:google-ads:auto-pause-minimum-product-performance:v1','active']]);const persistentPrefs={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  let reads=0,mutations=0;const stubActions={checkGoogleAdsCampaignCapabilities:async()=>{reads++;return{enabled:true,allowedOperations:['pause_campaign']}},readGoogleAdsCampaignConfiguration:async()=>{reads++;return{managerCustomerId:'1234567890',customerId:'0987654321',campaigns:[{campaignId:'42',campaignStatus:'PAUSED'}]}},changeGoogleAdsCampaignStatus:async()=>{mutations++;throw new Error('Não deveria pausar novamente')}};
  const firstDom=createRoot(),first=context.window.OverviewView.mount({root:firstDom.root,state:{...state},getSnapshot:()=>snapshot,domain:context.window.OverviewDomain,format,preferences:persistentPrefs,actions:stubActions});
  first.render();await new Promise(resolve=>setImmediate(resolve));assert.equal(firstDom.get('#overviewProductPauseConfirmationDialog').open,true);firstDom.get('#overviewProductPauseConfirmationAccept').onclick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,2);assert.equal(mutations,0);assert.ok(saved.has('hub:google-ads:auto-pause-observed-paused:v1:1234567890:0987654321:42'));
  const reopenedDom=createRoot(),reopened=context.window.OverviewView.mount({root:reopenedDom.root,state:{...state},getSnapshot:()=>snapshot,domain:context.window.OverviewDomain,format,preferences:persistentPrefs,actions:stubActions});
  reopened.render();await new Promise(resolve=>setImmediate(resolve));assert.equal(reopenedDom.get('#overviewProductPauseConfirmationDialog').open,false);assert.equal(reads,2);assert.equal(mutations,0);
  const failingDom=createRoot(),failingPrefs={getItem:key=>key==='hub:google-ads:auto-pause-minimum-product-performance:v1'?'active':null,setItem:key=>{if(key.startsWith('hub:google-ads:auto-pause-observed-paused:v1:'))throw new Error('armazenamento indisponível')}};
  const failing=context.window.OverviewView.mount({root:failingDom.root,state:{...state},getSnapshot:()=>snapshot,domain:context.window.OverviewDomain,format,preferences:failingPrefs,actions:stubActions});
  failing.render();await new Promise(resolve=>setImmediate(resolve));failingDom.get('#overviewProductPauseConfirmationAccept').onclick();await new Promise(resolve=>setImmediate(resolve));assert.match(failingDom.get('#overviewMinimumProductPauseMessage').textContent,/não guardados neste navegador/);assert.equal(mutations,0);
  const confirmedSaved=new Map([['hub:google-ads:auto-pause-minimum-product-performance:v1','active']]);const confirmedPrefs={getItem:key=>confirmedSaved.get(key)||null,setItem:(key,value)=>confirmedSaved.set(key,value)};
  let confirmedReads=0,confirmedMutations=0;const confirmedActions={checkGoogleAdsCampaignCapabilities:async()=>{confirmedReads++;return{enabled:true,allowedOperations:['pause_campaign']}},readGoogleAdsCampaignConfiguration:async()=>{confirmedReads++;return{managerCustomerId:'1234567890',customerId:'0987654321',campaigns:[{campaignId:'42',campaignStatus:'ENABLED'}]}},changeGoogleAdsCampaignStatus:async()=>{confirmedMutations++;return{status:'PAUSED',changed:true,verifiedAtUtc:'2026-11-01T12:00:10Z',emailNotificationStatus:'queued'}},recordAutomaticPauseInDiary:async()=>({recorded:true,autoPauseHistory:[]})};
  const confirmedDom=createRoot(),confirmed=context.window.OverviewView.mount({root:confirmedDom.root,state:{...state},getSnapshot:()=>snapshot,domain:context.window.OverviewDomain,format,preferences:confirmedPrefs,actions:confirmedActions});
  confirmed.render();await new Promise(resolve=>setImmediate(resolve));confirmedDom.get('#overviewProductPauseConfirmationAccept').onclick();await new Promise(resolve=>setImmediate(resolve));assert.equal(confirmedMutations,1);assert.equal(confirmedReads,2);
  const afterConfirmDom=createRoot(),afterConfirm=context.window.OverviewView.mount({root:afterConfirmDom.root,state:{...state},getSnapshot:()=>snapshot,domain:context.window.OverviewDomain,format,preferences:confirmedPrefs,actions:confirmedActions});
  afterConfirm.render();await new Promise(resolve=>setImmediate(resolve));assert.equal(afterConfirmDom.get('#overviewProductPauseConfirmationDialog').open,false);assert.equal(confirmedMutations,1);assert.equal(confirmedReads,2);
  snapshot.autoPauseHistory=[{campaignId:'local-2',occurredAtUtc:'2026-11-01T12:00:10Z'}];controller.render();assert.doesNotMatch(get('#overviewMinimumProductPauseList').innerHTML,/Concorrente · candidata/);
  snapshot.autoPauseHistory=[{campaignId:'local-1',occurredAtUtc:'2026-11-01T12:00:10Z'}];controller.render();assert.doesNotMatch(get('#overviewMinimumProductPauseList').innerHTML,/Concorrente · candidata/);assert.match(get('#overviewMinimumProductPauseMessage').textContent,/pausa confirmada/);
  let requests=0;const activeDom=createRoot(),activePrefs={getItem:key=>key==='hub:google-ads:auto-pause-minimum-product-performance:v1'?'active':null,setItem:()=>{}};
  const active=context.window.OverviewView.mount({root:activeDom.root,state:{...state},getSnapshot:()=>snapshot,domain:context.window.OverviewDomain,format,preferences:activePrefs,actions:{checkGoogleAdsCampaignCapabilities:()=>{requests++},readGoogleAdsCampaignConfiguration:()=>{requests++},changeGoogleAdsCampaignStatus:()=>{requests++}}});
  active.render();await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,0);assert.equal(activeDom.get('#overviewProductPauseConfirmationDialog').open,false);activeDom.get('#openAutoPauseReport').onclick();assert.match(activeDom.get('#overviewMinimumProductPauseMessage').textContent,/pausa confirmada/);
  snapshot.apiCaptureSnapshots[1].accounts[0].configurationGeneratedAtUtc='2026-11-01T12:02:00Z';snapshot.apiCaptureSnapshots[1].completedAtUtc='2026-11-01T12:03:00Z';controller.render();assert.match(get('#overviewMinimumProductPauseList').innerHTML,/Concorrente/);
});

test('automatic-pause modal controls recover after an unexpected confirmation error and activation toggles visibly',async()=>{
  vm.runInContext(awaitDomain,context);
  const makeRow=(id,name)=>({campaignId:id,productKey:'product',identity:{name,product:'Produto'},c:{nome_campanha_exato:name,_status:'ativa'},totals:{investment:0,impressions:0,clicks:0,conversions:0},d0Totals:{investment:0,impressions:0,clicks:0},roi:null,profit:null,zeroDays:0});
  const capture=(id,completedAtUtc,configurationGeneratedAtUtc,impressions,clicks)=>({id,completedAtUtc,periodType:'D0',accounts:[{managerCustomerId:'1234567890',customerId:'0987654321',date:'2026-11-01',queryComplete:true,configurationComplete:true,configurationGeneratedAtUtc,campaigns:[{campaignInternalId:'local-1',campaignId:'42',campaignName:'Concorrente',campaignStatus:'ENABLED',mappingStatus:'mapped',metricsAvailable:true,impressions:0,clicks:0},{campaignInternalId:'local-2',campaignId:'43',campaignName:'Referência',campaignStatus:'ENABLED',mappingStatus:'mapped',metricsAvailable:true,impressions,clicks}]}]});
  const snapshot={rows:[makeRow('local-1','Concorrente'),makeRow('local-2','Referência')],dates:{d0:'2026-11-01',d1:'2026-10-31'},d1Totals:[],apiCaptureSnapshots:[capture('first','2026-11-01T11:00:00Z','2026-11-01T11:00:00Z',0,0),capture('last','2026-11-01T12:01:00Z','2026-11-01T12:00:00Z',110,3)],autoPauseHistory:[]};
  const saved=new Map([['hub:google-ads:auto-pause-minimum-product-performance:v1','active']]),preferences={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  const {root,get}=createRoot();let titleValue='',throwOnce=true,apiCalls=0;
  const title=get('#overviewProductPauseConfirmationTitle');Object.defineProperty(title,'textContent',{configurable:true,get:()=>titleValue,set:value=>{if(throwOnce){throwOnce=false;throw new Error('falha de renderização simulada')}titleValue=String(value)}});
  const controller=context.window.OverviewView.mount({root,state:{totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active',rate:5.1},getSnapshot:()=>snapshot,domain:context.window.OverviewDomain,format,preferences,actions:{checkGoogleAdsCampaignCapabilities:()=>{apiCalls++},readGoogleAdsCampaignConfiguration:()=>{apiCalls++},changeGoogleAdsCampaignStatus:()=>{apiCalls++}}});
  controller.render();await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  const button=get('#overviewMinimumProductPauseApply');assert.match(get('#overviewMinimumProductPauseMessage').textContent,/Falha inesperada durante a verificação/);assert.equal(button.disabled,false);assert.equal(button.textContent,'Desativar regra');assert.equal(apiCalls,0);
  await button.onclick();assert.equal(button.textContent,'Ativar regra');assert.equal(button.disabled,false);assert.equal(saved.get('hub:google-ads:auto-pause-minimum-product-performance:v1'),'inactive');
  const activation=button.onclick();await new Promise(resolve=>setImmediate(resolve));assert.equal(get('#overviewProductPauseConfirmationDialog').open,true);get('#overviewProductPauseConfirmationCancel').onclick();await activation;
  assert.equal(button.textContent,'Desativar regra');assert.equal(button.disabled,false);assert.equal(saved.get('hub:google-ads:auto-pause-minimum-product-performance:v1'),'active');assert.equal(apiCalls,0);
});
