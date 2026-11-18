import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
const start=template.indexOf("    $('#notificationCenterList')?.addEventListener('click',event=>{");
const end=template.indexOf("\n    document.addEventListener('click'",start);
assert.ok(start>=0&&end>start,'notification history click handler should exist');
const handlerSource=template.slice(start,end);

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
