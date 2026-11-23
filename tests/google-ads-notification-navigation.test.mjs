import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const start=template.indexOf("    $('#notificationCenterList')?.addEventListener('click',event=>{");
const end=template.indexOf("\n    document.addEventListener('click'",start);
assert.ok(start>=0&&end>start,'notification history click handler should exist');
const handlerSource=template.slice(start,end);
const bridgeStart=template.indexOf("    window.addEventListener('hub:open-google-ads-history',event=>{");
const bridgeEnd=template.indexOf("\n    document.documentElement.dataset.hubGoogleAdsHistoryBridge='ready';",bridgeStart);
assert.ok(bridgeStart>=0&&bridgeEnd>bridgeStart,'history selection bridge should exist');
const bridgeSource=template.slice(bridgeStart,bridgeEnd);

function harness(activeView){
  let onClick;
  const actions=[];
  const list={addEventListener:(type,listener)=>{if(type==='click')onClick=listener}};
  const context=vm.createContext({
    $:selector=>selector==='#notificationCenterList'?list:null,
    state:{activeView},
    markGoogleAdsAutoNotificationRead:id=>actions.push(['read',id]),
    closeGoogleAdsNotificationCenter:()=>actions.push(['close']),
    openGoogleAdsHistorySnapshot:id=>actions.push(['same-screen',id]),
    openGoogleAdsHistoryInTab:id=>actions.push(['tab',id])
  });
  vm.runInContext(handlerSource,context);
  return {actions,onClick};
}

function clickHistory(onClick){
  const button={dataset:{notificationHistoryId:'snapshot-123',notificationId:'notice-456'}};
  onClick({target:{closest:selector=>selector==='[data-notification-history-id]'?button:null}});
}

test('history notification uses the open Snapshots da Operação screen and marks the notice read',()=>{
  const {actions,onClick}=harness('google-ads');
  clickHistory(onClick);
  assert.deepEqual(actions,[['read','notice-456'],['close'],['same-screen','snapshot-123']]);
});

test('history notification keeps the extension tab flow from other screens',()=>{
  const {actions,onClick}=harness('totals');
  clickHistory(onClick);
  assert.deepEqual(actions,[['read','notice-456'],['close'],['tab','snapshot-123']]);
});

test('history selection bridge acknowledges only a record actually selected in the open tab',()=>{
  for(const selected of [true,false]){
    let listener,prevented=false,replaced=false;
    const context=vm.createContext({
      window:{addEventListener:(type,callback)=>{if(type==='hub:open-google-ads-history')listener=callback}},
      location:{href:'http://127.0.0.1:8765/?view=google-ads',origin:'http://127.0.0.1:8765'},
      URL,history:{state:null,replaceState:()=>{replaced=true}},
      selectGoogleAdsHistorySnapshotInCurrentView:id=>id==='snapshot-123'&&selected
    });
    vm.runInContext(bridgeSource,context);
    listener({detail:{historyId:'snapshot-123'},preventDefault:()=>{prevented=true}});
    assert.equal(prevented,selected,'the extension fallback should run when the open tab did not select the record');
    assert.equal(replaced,selected,'the history ID is written to the URL only after selection succeeds');
  }
});
