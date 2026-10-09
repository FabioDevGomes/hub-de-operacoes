import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {mountColumnPicker} from '../src/table-columns.mjs';
import {createRoot,format} from './helpers/view-dom.mjs';
const viewSource=await readFile(new URL('../src/product-diary/view.js',import.meta.url),'utf8');
const domainSource=await readFile(new URL('../src/product-diary/domain.js',import.meta.url),'utf8');
const settled=()=>new Promise(setImmediate);
function events(node={}){
  const listeners=new Map();return Object.assign(node,{listeners,style:{},dataset:{},addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),emit:(type,event={})=>listeners.get(type)?.(event),focus(){this.focused=true}});
}
function setup({preferences,loader}={}){
  const context=vm.createContext({window:{}});vm.runInContext(domainSource,context);vm.runInContext(viewSource,context);
  const dom=createRoot(),picker=events(dom.get('#productColumnPicker')),doc=events(),viewport=events();
  doc.defaultView=viewport;viewport.innerHeight=900;picker.ownerDocument=doc;picker.getBoundingClientRect=()=>({top:180,bottom:212});picker.contains=()=>false;
  const parts=Object.fromEntries(['[data-column-options]','.hub-column-menu','[data-column-message]','[data-column-reset]','summary'].map(key=>[key,events()]));
  picker.querySelector=key=>parts[key];
  const columns=context.window.ProductDiaryDomain.productColumns,row=()=>({cells:columns.map(()=>events({hidden:false}))});
  const table={rows:[row(),row(),row()],dataset:{}};table.tHead={rows:[table.rows[0]]};
  dom.get('#productTableWrap').querySelector=()=>table;
  const values=new Map(),writes=[];
  preferences??={getItem:key=>values.get(key),setItem:(key,value)=>{writes.push(key);values.set(key,value)},removeItem:key=>{writes.push(key);values.delete(key)}};
  let snapshot={sheetName:'Sintética',rows:[],displayRows:[],manualSalesByDate:new Map(),summary:null,investment:null,clicks:null,conversions:null},loads=0,mounts=0;
  const controller=context.window.ProductDiaryView.mount({root:dom.root,domain:context.window.ProductDiaryDomain,format,preferences,getSnapshot:()=>snapshot,actions:{setTitle(){}},loadColumnPicker:()=>{loads++;return loader?loader():Promise.resolve({mountColumnPicker:args=>{mounts++;return mountColumnPicker(args)}})}});
  return {...dom,picker,parts,doc,viewport,table,row,values,writes,preferences,controller,setSnapshot:value=>snapshot=value,counts:()=>({loads,mounts}),
    choose(key,checked){parts['[data-column-options]'].emit('change',{target:{closest:()=>({dataset:{columnChoice:key},checked,disabled:key==='A'})}});picker.emit('change')},snapshot:()=>snapshot};
}
test('diary reuses global picker, preserves Data, synchronizes footer and persists only explicit choices',async()=>{
  const s=setup();s.controller.render('Primeira');s.controller.render('Primeira');await settled();
  assert.deepEqual(s.counts(),{loads:1,mounts:1});assert.equal(s.writes.length,0);
  assert.match(s.parts['[data-column-options]'].innerHTML,/data-column-choice="A" checked disabled/);
  const before=JSON.stringify(s.snapshot()),cards=s.get('#productSummary').innerHTML,totals=s.get('#productTotals').innerHTML;
  s.choose('O',false);for(const row of s.table.rows)assert.equal(row.cells[15].hidden,true);
  s.choose('A',false);assert.equal(s.table.rows[0].cells[0].hidden,false);
  assert.deepEqual(s.writes,['hub:product-diary:visible-columns:v1','hub:product-diary:search-share-choice:v1']);assert.equal(s.values.has('hub:overview:visible-columns:v1'),false);
  assert.equal(s.get('#productSummary').innerHTML,cards);assert.equal(s.get('#productTotals').innerHTML,totals);assert.equal(JSON.stringify(s.snapshot()),before);
  s.table.rows=[s.row(),s.row(),s.row()];s.table.tHead.rows=[s.table.rows[0]];s.controller.render('Segunda','workbook','exact-id');
  for(const row of s.table.rows)assert.equal(row.cells[15].hidden,true);assert.deepEqual(s.counts(),{loads:1,mounts:1});
  s.choose('O',true);for(const row of s.table.rows)assert.equal(row.cells[15].hidden,false);
  for(const [key] of s.table.rows[0].cells.map((_,i)=>[String.fromCharCode(65+i)]))if(key!=='A')s.choose(key,false);
  assert.equal(s.get('#productBody td.empty').colSpan,1,'empty state follows visible columns');
  s.parts['[data-column-reset]'].emit('click');s.picker.emit('click');assert.equal(s.table.dataset.columnSelection,'all');assert.equal(s.get('#productBody td.empty').colSpan,18);
  assert.equal(s.values.has('hub:product-diary:visible-columns:v1'),false);
  s.picker.open=true;s.picker.emit('keydown',{key:'Escape',preventDefault(){}});assert.equal(s.picker.open,false);assert.equal(s.parts.summary.focused,true);
  s.picker.open=true;s.doc.emit('pointerdown',{target:{}});assert.equal(s.picker.open,false);
  s.controller.dispose();assert.equal(s.picker.listeners.size,0);assert.equal(s.doc.listeners.size,0);assert.equal(s.viewport.listeners.size,0);
});
test('stored diary preference restores on reopen, blocked storage reports session-only and legacy remains separate',async()=>{
  const stored=new Map([['hub:product-diary:visible-columns:v1','["A","C"]']]),preferences={getItem:key=>stored.get(key),setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
  const s=setup({preferences});s.controller.render('Nativa');await settled();assert.equal(s.table.rows[0].cells[1].hidden,true);assert.equal(s.table.rows[0].cells[2].hidden,false);
  s.choose('B',true);assert.equal(s.table.rows[0].cells[1].hidden,false);assert.match(s.parts['[data-column-message]'].textContent,/sessão/);
  s.setSnapshot({...s.snapshot(),summary:{metrics:{},historical_number:1}});s.picker.open=true;s.controller.render('Legada','legacy');
  assert.equal(s.picker.classList.contains('hidden'),true);assert.equal(s.picker.open,false);assert.equal(s.get('#productTableWrap').classList.contains('hidden'),true);
  s.setSnapshot({...s.snapshot(),summary:null});s.controller.render('Nativa');assert.equal(s.picker.classList.contains('hidden'),false);assert.equal(s.table.rows[0].cells[1].hidden,false);
  s.controller.dispose();
});
test('new share column appears in older saved preferences but respects a later explicit hide',async()=>{
  const stored=new Map([['hub:product-diary:visible-columns:v1','["A","C"]']]),writes=[];
  const preferences={getItem:key=>stored.get(key),setItem:(key,value)=>{writes.push(key);stored.set(key,value)},removeItem:key=>stored.delete(key)};
  const first=setup({preferences});first.controller.render('Antiga');await settled();
  assert.equal(first.table.rows[0].cells[12].hidden,false);
  assert.equal(first.table.rows[0].cells[1].hidden,true);
  assert.equal(writes.length,0,'displaying an old preference does not write storage');
  first.choose('R',false);first.controller.dispose();
  const reopened=setup({preferences});reopened.controller.render('Reaberta');await settled();
  assert.equal(reopened.table.rows[0].cells[12].hidden,true);
  assert.equal(reopened.table.rows[0].cells[1].hidden,true);
  reopened.controller.dispose();
});
test('loading failure never alters the table or reports a saved preference; disposal cancels late mounting',async()=>{
  const s=setup({loader:()=>Promise.reject(Error('offline'))});s.controller.render('Teste');await settled();assert.match(s.parts['[data-column-message]'].textContent,/Não foi possível carregar/);assert.equal(s.writes.length,0);assert.equal(s.table.rows[0].cells[1].hidden,false);s.controller.dispose();
  let resolve,mounted=false;const pending=setup({loader:()=>new Promise(done=>{resolve=done})});pending.controller.render('Teste');await Promise.resolve();pending.controller.dispose();resolve({mountColumnPicker(){mounted=true}});await settled();assert.equal(mounted,false);
});
test('markup and CSS use the existing Overview button/menu without clipping or duplication',async()=>{
  const template=await readFile(new URL('../src/product-diary/template.html',import.meta.url),'utf8'),css=await readFile(new URL('../src/product-diary/product-diary.css',import.meta.url),'utf8');
  assert.match(template,/id="productColumnPicker" class="hub-column-picker"><summary class="btn">Colunas/);
  for(const marker of ['hub-column-menu','data-column-options','data-column-reset','data-column-message'])assert.ok(template.includes(marker));
  assert.match(css,/#productDiaryPanel:has\(#productColumnPicker\[open\]\)\{overflow:visible\}/);
  assert.ok(viewSource.includes("import('../table-columns.mjs?v=1')"));assert.doesNotMatch(css,/\.hub-column-menu\{/,'menu appearance belongs to shared CSS');
});
