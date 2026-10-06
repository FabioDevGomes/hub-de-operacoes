import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createClickBankTransfer,deliverClickBankPreview,isClickBankReceiverReady} from '../extensions/mcc-d0-bridge/clickbank-forward.mjs';
import {validateExtensionCapture,mountExtensionCapture} from '../src/curadoria/clickbank-top-offers/extension-capture.mjs';
import {CLICKBANK_COLUMNS,isClickBankMarketplace} from '../extensions/mcc-d0-bridge/clickbank-domain.mjs';

const capture=()=>({ok:true,capturedCount:2,expectedCount:2,capturedAt:'2026-10-06T12:30:00Z',
  page:{start:1,end:2,total:7,pageSize:2},rows:[1,2].map(rank=>({
    rank:String(rank),name:'Oferta exemplo '+rank,seller:'EXAMPLE'+rank,avg:'$10.00',initial:'$10.00',
    future:'-',epc:'$0.00',cvr:'0.00%',gravity:'1.00',offerId:'EXAMPLE'+rank
  }))});

test('transfer preserves source timestamp, total/range, zero and missing metrics; blocks partial counts',()=>{
  const result=capture(),payload=createClickBankTransfer(result),valid=validateExtensionCapture(payload);
  assert.equal(valid.ok,true,valid.message);
  assert.equal(valid.parsed.parsedCount,2);
  assert.equal(valid.parsed.page.total,7);
  assert.equal(valid.parsed.page.completeUniverse,false);
  assert.equal(valid.capturedAt,result.capturedAt);
  assert.match(payload.text,/1–2 of 7/);
  for(const changed of [{ok:false},{capturedCount:1},{expectedCount:3},{page:null},{capturedAt:null},
    {page:{start:1,end:3,total:7}}]) assert.throws(()=>createClickBankTransfer({...result,...changed}));
  for(const changed of [{schema:'other'},{source:'other'},{expectedCount:3},{capturedAt:'invalid'},
    {text:payload.text.replace('1–2 of 7','')},{text:'x'.repeat(2*1024*1024+1)}])
    assert.equal(validateExtensionCapture({...payload,...changed}).ok,false);
});

test('receiver waits for initial read and prepares only a preview, preserving drafts and concurrent edits',async()=>{
  const target={},calls=[];let resolveReady,draft='',busy=false;
  mountExtensionCapture({target,ready:new Promise(resolve=>resolveReady=resolve),getBusy:()=>busy,getDraft:()=>draft,
    preparePreview:(text,metadata)=>{calls.push({text,metadata});draft=text;}});
  const payload=createClickBankTransfer(capture());
  const pending=target.__hubReceiveClickBankCapture(payload);
  assert.equal((await target.__hubReceiveClickBankCapture(payload)).ok,false);
  assert.equal(calls.length,0);resolveReady();
  const response=await pending;
  assert.deepEqual(response,{ok:true,parsedCount:2,previewReady:true,saved:false});
  assert.equal(calls[0].metadata.capturedAt,payload.capturedAt);
  assert.match((await target.__hubReceiveClickBankCapture(payload)).message,/rascunho/);
  assert.equal(calls.length,1);
  draft='';busy=true;assert.equal((await target.__hubReceiveClickBankCapture(payload)).ok,false);
  busy=false;assert.equal((await target.__hubReceiveClickBankCapture({})).ok,false);
  assert.equal(calls.length,1);
});

test('receiver preserves a draft created during load and reports read/preview errors',async()=>{
  const payload=createClickBankTransfer(capture()),target={};let release,draft='',calls=0;
  mountExtensionCapture({target,ready:new Promise(resolve=>release=resolve),getBusy:()=>false,getDraft:()=>draft,
    preparePreview:()=>calls++});
  const pending=target.__hubReceiveClickBankCapture(payload);draft='Rascunho manual';release();
  assert.equal((await pending).ok,false);assert.equal(calls,0);assert.equal(draft,'Rascunho manual');
  mountExtensionCapture({target,ready:Promise.resolve(),getBusy:()=>false,getDraft:()=>'',preparePreview:()=>{throw Error('Falha de prévia');}});
  assert.match((await target.__hubReceiveClickBankCapture(payload)).message,/Falha de prévia/);
});

test('serialized MAIN delivery restricts exact local destination and handles missing/stale receiver',async()=>{
  const payload=createClickBankTransfer(capture()),run=(location,window)=>vm.runInNewContext(
    '('+deliverClickBankPreview.toString()+')(payload)',{location,window,payload,setTimeout:fn=>fn()});
  let calls=0;
  const window={__hubReceiveClickBankCapture:async value=>{calls++;assert.equal(value,payload);return {ok:true,saved:false};}};
  const correct={origin:'http://127.0.0.1:8765',pathname:'/curadoria/clickbank-top-offers/'};
  for(const location of [{...correct,origin:'https://example.com'},{...correct,pathname:'/preparador-MCC/'}])
    assert.equal((await run(location,window)).ok,false);
  assert.equal(calls,0);assert.equal((await run(correct,window)).ok,true);assert.equal(calls,1);
  assert.match((await run(correct,{})).message,/Recarregue/);
  assert.equal((await run(correct,{__hubReceiveClickBankCapture:()=>{throw Error();}})).ok,false);
});

test('receiver probe accepts only the current local Top Offers CB page',()=>{
  const check=(origin,pathname,receiver=true)=>vm.runInNewContext('('+isClickBankReceiverReady.toString()+')()',{
    location:{origin,pathname},window:receiver?{__hubReceiveClickBankCapture(){}}:{}
  });
  assert.equal(check('http://127.0.0.1:8765','/curadoria/clickbank-top-offers/'),true);
  assert.equal(check('http://127.0.0.1:8765','/curadoria/clickbank-top-offers/',false),false);
  assert.equal(check('https://example.com','/curadoria/clickbank-top-offers/'),false);
});

async function worker({existing=true,receiverReady=true,source=capture(),receiver={ok:true,parsedCount:2,previewReady:true,saved:false}}={}) {
  const code=await readFile(new URL('../extensions/mcc-d0-bridge/background.js',import.meta.url),'utf8');
  let listener;const calls=[],local='http://127.0.0.1:8765/curadoria/clickbank-top-offers/';
  const reader=()=>{};
  vm.runInNewContext(code.replace(/^import .*?;\s*/gm,''),{
    createClickBankTransfer,deliverClickBankPreview,isClickBankReceiverReady,isClickBankMarketplace,CLICKBANK_COLUMNS,collectClickBankProducts:reader,setTimeout,clearTimeout,URL,
    chrome:{runtime:{onMessage:{addListener:fn=>listener=fn}},tabs:{
      query:async query=>query.active?[{id:8,url:'https://accounts.clickbank.com/master/dashboard/affiliate-marketplace'}]:
        existing?[{id:9,url:local+'?ref=1'}]:[],
      create:async options=>{calls.push(['create',options]);return {id:existing?10:9};},
      get:(id,callback)=>callback({status:'complete'}),onUpdated:{addListener(){},removeListener(){}},
      update:async(id,options)=>{calls.push(['focus',id,options]);}
    },scripting:{executeScript:async options=>{
      calls.push(['inject',options]);
      return [{result:options.func===reader?source:options.func===isClickBankReceiverReady?receiverReady:receiver}];
    }}}
  });
  const response=await new Promise(resolve=>listener({type:'CAPTURE_AND_FORWARD_CLICKBANK'},null,resolve));
  return {response,calls};
}

test('worker reuses/opens local CB tab, injects receiver in MAIN and focuses only after acknowledgement',async()=>{
  for(const existing of [true,false]){
    const {response,calls}=await worker({existing});
    assert.equal(response.ok,true,response.message);
    assert.equal(response.result.saved,false);
    assert.equal(response.result.rows.length,2,'TSV copy remains available');
    assert.equal(calls.filter(([kind])=>kind==='create').length,existing?0:1);
    const injections=calls.filter(([kind])=>kind==='inject').map(([,options])=>options);
    assert.equal(injections[0].target.tabId,8);assert.equal(injections[0].world,undefined);
    if(existing){assert.equal(injections[1].func,isClickBankReceiverReady);assert.equal(injections[1].target.tabId,9);}
    const delivery=injections.at(-1);
    assert.equal(delivery.target.tabId,9);assert.equal(delivery.world,'MAIN');
    assert.equal(validateExtensionCapture(delivery.args[0]).ok,true);
    assert.equal(calls.at(-1)[0],'focus');
  }
});

test('worker preserves stale Hub tabs and routes into a fresh page with the current receiver',async()=>{
  const {response,calls}=await worker({existing:true,receiverReady:false});
  assert.equal(response.ok,true,response.message);
  assert.equal(calls.filter(([kind])=>kind==='create').length,1);
  const injections=calls.filter(([kind])=>kind==='inject').map(([,options])=>options);
  assert.equal(injections[1].func,isClickBankReceiverReady);
  assert.equal(injections[1].target.tabId,9,'a aba antiga é somente sondada, não alterada');
  assert.equal(injections[2].target.tabId,10,'a nova aba recebe a prévia');
  assert.equal(calls.at(-1)[0],'focus');
  assert.equal(calls.at(-1)[1],10);
});

test('worker blocks incomplete capture before destination creation and preserves rows on receiver rejection',async()=>{
  const partial=await worker({existing:false,source:{...capture(),ok:false,message:'Captura incompleta'}});
  assert.equal(partial.response.ok,false);
  assert.equal(partial.calls.filter(([kind])=>kind==='create'||kind==='focus').length,0);
  const rejected=await worker({receiver:{ok:false,message:'Rascunho preservado'}});
  assert.equal(rejected.response.ok,false);assert.match(rejected.response.message,/Rascunho preservado/);
  assert.equal(rejected.response.result.rows.length,2);
  assert.equal(rejected.calls.filter(([kind])=>kind==='focus').length,0);
});

test('same existing button forwards; manual dialog and explicit save remain and module is published',async()=>{
  const root=new URL('../',import.meta.url);
  const [popup,page,view,published]=await Promise.all([
    readFile(new URL('extensions/mcc-d0-bridge/popup.html',root),'utf8'),
    readFile(new URL('src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs',root),'utf8'),
    readFile(new URL('src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs',root),'utf8'),
    readFile(new URL('dist/curadoria/clickbank-top-offers/extension-capture.mjs',root),'utf8')
  ]);
  assert.match(popup,/id="capture-clickbank"[^>]*>Capturar produtos ClickBank/);
  assert.doesNotMatch(popup,/capture-clickbank-hub/);
  assert.match(page,/preparePreview:[\s\S]*view\.prepareImport\(raw\);validateImport\(raw,metadata\)/);
  assert.match(view,/prepareImport\(raw\) \{ paste\.value=raw;if\(!importDialog\.open\)openImport\(\);else paste\.focus\(\); \}/,
    'a entrega da extensão deve abrir o diálogo e preencher o campo de colagem');
  assert.match(page,/capturedAt:pending\.extensionCapture\?\.capturedAt/);
  assert.match(view,/prepareImport\(raw\)/);
  assert.equal(published,await readFile(new URL('src/curadoria/clickbank-top-offers/extension-capture.mjs',root),'utf8'));
});
