import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTrendsSaveAction,trendPageState} from '../src/curadoria/trends-save-action.mjs';

// Synthetic editor/storage. No personal browser profile or real IndexedDB.
const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
function fixture(persist=async()=>true){
  let context={tab:'trends',offerKey:'synthetic:one',previous:null,draft:{status:'',term:'Synthetic',countries:[],productAge:''}};
  const listeners={},messages=[],writes=[],nodes=[];
  const parent={querySelector:()=>nodes[0]||null};
  const doc={createElement:()=>({dataset:{},setAttribute(){},textContent:''})};
  const button={dataset:{},ownerDocument:doc,parentElement:parent,before:node=>nodes.push(node),addEventListener(){}};
  const scope={addEventListener:(name,fn)=>listeners[name]=fn,querySelectorAll:()=>[],querySelector:()=>null};
  const action=mountTrendsSaveAction({button,scope,delay:10,getContext:()=>context,
    persist:async(...args)=>{writes.push(structuredClone(args));return persist(...args);},feedback:message=>messages.push(message)});
  const event={isComposing:false,target:{matches:()=>true,closest:()=>({})}};
  return {action,button,messages,writes,nodes,listeners,event,get context(){return context;},set context(value){context=value;}};
}

test('text edits never autosave; only explicit Save stores an unclassified draft',async()=>{
  const f=fixture();assert.equal(f.writes.length,0);assert.equal(f.nodes.length,1);
  for(const term of ['S','Sy','Synthetic edited']){f.context.draft.term=term;f.listeners.input(f.event);}
  assert.equal(f.nodes[0].dataset.state,'pending');await settle();
  assert.equal(f.writes.length,0,'input and time passing do not write');
  await f.action.save();
  assert.deepEqual(f.writes,[['synthetic:one','',{term:'Synthetic edited',countries:[],productAge:''}]]);
  assert.equal(f.nodes[0].textContent,'Salvo');
  const previous={status:'stable',searchTerm:'Old',assessmentId:'history'};
  assert.deepEqual(trendPageState({pageDraft:{term:'Draft',status:''}},previous),{...previous,term:'Draft',searchTerm:'Draft',status:''});
});

test('country, age and change/blur remain pending until explicit Save',async()=>{
  const f=fixture();f.context.draft.status='stable';f.context.draft.countries=['US'];
  f.listeners.click(f.event);await settle();
  f.context.draft.productAge='old';f.listeners.change(f.event);await settle();
  assert.equal(f.writes.length,0);await f.action.save();
  assert.equal(f.writes.length,1);assert.equal(f.writes[0][1],'stable');assert.equal(f.writes[0][2].productAge,'old');
  assert.deepEqual(f.writes[0][2].countries,['US']);
  await f.action.save();assert.equal(f.writes.length,1,'repeated Save does not duplicate history');
});

test('flush waits for an identical in-flight autosave instead of dropping the following metadata action',async()=>{
  let release;const f=fixture(()=>new Promise(resolve=>{release=resolve;}));
  const save=f.action.save();let finished=false;
  const flush=f.action.flush().then(value=>{finished=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);
  assert.equal(f.writes.length,1);release(true);
  assert.equal(await save,true);assert.equal(await flush,true);
  assert.equal(f.writes.length,1,'flush does not append an identical assessment');
});

test('flush writes pending debounced text immediately and keeps the original offer key',async()=>{
  const f=fixture();f.context.draft.term='Pending field';f.listeners.input(f.event);
  assert.equal(await f.action.flush(),true);assert.equal(f.writes.length,1);
  await settle();assert.equal(f.writes.length,1,'the cancelled debounce does not duplicate the write');
  assert.equal(f.writes[0][0],'synthetic:one');assert.equal(f.writes[0][2].term,'Pending field');
});

test('result selection is pending, explicit saves serialize without navigation',async()=>{
  let release;const f=fixture(()=>new Promise(resolve=>{release=resolve;}));
  f.action.select('up');await settle();assert.equal(f.writes.length,0);
  const first=f.action.save();assert.equal(f.button.disabled,true);
  assert.equal(f.nodes[0].dataset.state,'saving');assert.doesNotMatch(f.nodes[0].textContent,/Salvo/);
  f.context.draft.term='Edited while saving';const second=f.action.save();
  release(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.writes.length,2);assert.equal(f.writes[1][1],'up');assert.equal(f.writes[1][2].term,'Edited while saving');
  release(true);assert.equal(await first,true);await second;
  assert.equal(f.context.offerKey,'synthetic:one');assert.equal(f.context.tab,'trends');assert.equal(f.button.disabled,false);
});

test('changing offers does not write the discarded draft or leak the selected result',async()=>{
  const f=fixture();f.context.draft.term='First offer draft';f.listeners.input(f.event);
  f.action.select('up');
  f.context={tab:'trends',offerKey:'synthetic:two',previous:null,draft:{status:'stable',term:'Second offer',countries:[],productAge:''}};
  f.action.sync();f.listeners.input(f.event);await settle();
  assert.equal(f.writes.length,0);await f.action.save();
  assert.deepEqual(f.writes.map(([key])=>key),['synthetic:two']);
  assert.equal(f.writes[0][2].term,'Second offer');assert.equal(f.writes[0][1],'stable');
});

test('reverting a field while saving persists the reversal instead of comparing a stale assessment',async()=>{
  let release;const f=fixture(()=>new Promise(resolve=>{release=resolve;}));
  f.context.previous={status:'stable',searchTerm:'Synthetic',countries:[],productAge:''};f.context.draft.status='stable';
  f.context.draft.term='Temporary edit';const first=f.action.save();
  f.context.draft.term='Synthetic';f.action.save();release(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.writes.length,2);assert.equal(f.writes[1][2].term,'Synthetic');release(true);await first;
});

test('failure preserves edits, never shows green success, and manual retry works',async()=>{
  let fail=true;const f=fixture(async()=>{if(fail)throw Error('Synthetic failure');return true;});
  assert.equal(await f.action.save('down'),false);assert.equal(f.nodes[0].dataset.state,'error');
  assert.equal(f.button.disabled,false);assert.equal(f.context.draft.term,'Synthetic');
  fail=false;assert.equal(await f.action.save(),true);assert.equal(f.nodes[0].dataset.state,'saved');
  assert.equal(f.writes[1][1],'down');
});

test('non-Trends edits do not write, and switching tabs clears the Trends confirmation',async()=>{
  const f=fixture();await f.action.save('stable');assert.equal(f.nodes[0].dataset.state,'saved');
  f.context.tab='images';f.action.sync();f.listeners.input(f.event);f.listeners.change(f.event);await settle();
  assert.equal(f.writes.length,1);assert.equal(f.nodes[0].textContent,'');
  f.action.confirmed();assert.equal(f.nodes[0].textContent,'');
});
