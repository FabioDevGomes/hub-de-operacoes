import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {readColumnWidths, columnKey, mountColumnWidths} from '../src/curadoria/column-widths.mjs';
import {mountCurationWidths} from '../src/curadoria/column-widths-page.mjs';

function preferences() {
  const values = new Map(); let writes = 0;
  return {values,get writes(){return writes;},getItem:key=>values.get(key),setItem(key,value){writes++; values.set(key,value);}};
}
class Element {
  constructor(tag,doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.dataset = {}; this.children = []; this.attrs = {};
    this.hidden = false; this.colSpan = 1; this.textContent = ''; this.natural = 100; this.measurements = 0;
    this.style = {removeProperty(key){delete this[key === 'min-width' ? 'minWidth' : key];}};
    const classes = new Set();
    this.classList = {contains:key=>classes.has(key),add:(...keys)=>keys.forEach(key=>classes.add(key)),remove:(...keys)=>keys.forEach(key=>classes.delete(key)),toggle(key,value){if(value)classes.add(key);else classes.delete(key);}};
  }
  set className(value) { this.classList.add(...value.split(' ')); }
  setAttribute(key,value) { this.attrs[key] = value; }
  append(child) { this.children.push(child); child.parent = this; }
  prepend(child) { this.children.unshift(child); child.parent = this; }
  replaceChildren(...children) { this.children.forEach(child=>child.parent=null); this.children=[]; children.forEach(child=>this.append(child)); }
  remove() { if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this); this.parent=null; }
  before(child) { this.parent?.append(child); }
  closest(selector) { for(let e=this;e;e=e.parent)if(e.tagName.toLowerCase()===selector)return e; return null; }
  querySelector(selector) {
    const matches = e => selector === '[data-sort]' ? !!e.dataset.sort : selector.startsWith('.') ? e.classList.contains(selector.slice(1)) : e.tagName.toLowerCase() === selector;
    for(const child of this.children){if(matches(child))return child;const nested=child.querySelector(selector);if(nested)return nested;} return null;
  }
  getBoundingClientRect() {
    this.measurements++;
    const table = this.closest('table'), shown = table?.tHead?.rows[0]?.cells.filter(h=>!h.hidden&&!h.classList.contains('hidden-column')) || [];
    const group = table?.children.find(e=>e.tagName==='COLGROUP'), col = group?.children[shown.indexOf(this)];
    return {width:col ? parseFloat(col.style.width) : this.natural};
  }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture(id) { this.capture = null; this.onlostpointercapture?.({pointerId:id}); }
}
function fixture(storage = preferences(), key = 'screen:main') {
  const doc = {createElement:tag=>new Element(tag,doc)};
  doc.body = doc.createElement('body');
  const table = doc.createElement('table'), head = doc.createElement('thead'), row = doc.createElement('tr');
  doc.body.append(table); table.append(head); head.append(row); head.rows = [{cells:row.children}]; table.tHead = head;
  const makeHeader = (key,width=100) => {const header=doc.createElement('th');header.dataset.col=key;header.textContent=key;header.natural=width;return header;};
  row.append(makeHeader('product',250)); row.append(makeHeader('payout',100)); row.append(makeHeader('lastSeen',170));
  const headers=()=>head.rows[0].cells, handle=key=>headers().find(h=>h.dataset.col===key).querySelector('.hub-column-resizer');
  const args={table,preferences:storage,preferenceKey:key}, errors=[];
  const controller=mountColumnWidths({...args,onError:message=>errors.push(message)});
  return {doc,table,head,row,headers,handle,makeHeader,storage,controller,args,errors};
}
function event(extra={}) { return {button:0,pointerId:7,clientX:100,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra}; }
function pointer(f,delta) { const h=f.handle('payout');h.onpointerdown(event());h.onpointermove(event({clientX:100+delta}));return h; }

test('width preferences ignore invalid values, clamp limits and read without writes',()=>{
  const p=preferences();
  for(const value of ['null','[]','"bad"','{broken']){p.values.set('a',value);assert.deepEqual(readColumnWidths(p,'a'),{});}
  p.values.set('a',JSON.stringify({product:1,payout:2000,rank:10,lastSeen:50,no:'200',bad:-1,zero:0}));
  assert.deepEqual(readColumnWidths(p,'a'),{product:160,payout:1200,rank:52,lastSeen:156});assert.equal(p.writes,0);
  assert.deepEqual(readColumnWidths({getItem(){throw Error();}},'a'),{});
  const header=new Element('th');header.textContent='Decisão';assert.equal(columnKey(header),'Decisão');
  header.dataset.column='decision';assert.equal(columnKey(header),'decision');
});
test('pointer resize freezes neighbours, saves only at completion, stops sorting and uses accessible handles',()=>{
  const f=fixture(),h=f.handle('payout');assert.equal(f.storage.writes,0);assert.equal(h.attrs.role,'separator');
  assert.equal(h.attrs['aria-orientation'],'vertical');assert.equal(h.tabIndex,0);
  const down=event();h.onpointerdown(down);assert.ok(down.prevented&&down.stopped);
  h.onpointermove(event({clientX:130}));assert.equal(f.storage.writes,0);
  assert.equal(f.table.querySelector('colgroup').children[1].style.width,'130px');
  assert.equal(f.table.querySelector('colgroup').children[0].style.width,'250px');
  h.onpointerup(event({clientX:130}));assert.equal(f.storage.writes,1);assert.equal(h.capture,null);
  assert.equal(f.table.style.width,'550px');assert.equal(h.attrs['aria-valuenow'],'130');
  const click=event();h.onclick(click);assert.ok(click.prevented&&click.stopped);
});
test('pointer cancellation, Escape, lost capture, rerender and no-op never persist',()=>{
  for(const reason of ['cancel','escape','lost','refresh','noop']){
    const f=fixture(),h=pointer(f,reason==='noop'?0:30);
    if(reason==='cancel')h.onpointercancel(event());
    if(reason==='escape')h.onkeydown(event({key:'Escape'}));
    if(reason==='lost')h.onlostpointercapture(event());
    if(reason==='refresh')f.controller.refresh();
    if(reason==='noop')h.onpointerup(event());
    assert.equal(f.storage.writes,0,reason);assert.equal(f.table.classList.contains('hub-widths-custom'),false,reason);
    assert.equal(f.table.querySelector('colgroup'),null,reason);
  }
});
test('foreign pointers and non-primary mouse buttons cannot resize or complete a gesture',()=>{
  const f=fixture(),h=f.handle('payout');h.onpointerdown(event({button:2}));assert.equal(h.capture,undefined);
  h.onpointerdown(event({clientX:NaN}));assert.equal(h.capture,undefined);
  h.onpointerdown(event());h.onpointermove(event({pointerId:8,clientX:180}));h.onpointerup(event({pointerId:8,clientX:180}));
  assert.equal(f.storage.writes,0);assert.equal(h.attrs['aria-valuenow'],'100');h.onpointercancel(event());
});
test('keyboard widths survive reload, hidden columns and reordered/recreated headings; tables are independent',()=>{
  const p=preferences(),f=fixture(p,'guru:main');f.handle('payout').onkeydown(event({key:'ArrowRight',shiftKey:true}));
  assert.equal(p.writes,1);assert.equal(f.handle('payout').attrs['aria-valuenow'],'130');
  f.headers()[1].hidden=true;f.controller.refresh();assert.equal(f.table.style.width,'420px');
  f.headers()[1].hidden=false;f.controller.refresh();assert.equal(f.handle('payout').attrs['aria-valuenow'],'130');
  f.row.replaceChildren(f.makeHeader('payout'),f.makeHeader('product',250),f.makeHeader('lastSeen',170));
  f.head.rows[0].cells=f.row.children;f.controller.refresh();
  assert.equal(f.table.querySelector('colgroup').children[0].style.width,'130px');
  assert.equal(f.handle('payout').attrs['aria-valuenow'],'130');assert.equal(p.writes,1);
  assert.equal(fixture(p,'guru:main').handle('payout').attrs['aria-valuenow'],'130');
  assert.equal(fixture(p,'clickbank:main').handle('payout').attrs['aria-valuenow'],'100');
});
test('limits and blocked storage keep session edits with feedback',()=>{
  const f=fixture({getItem(){throw Error();},setItem(){throw Error();}});
  const h=pointer(f,5000);h.onpointerup(event({clientX:5100}));assert.equal(h.attrs['aria-valuenow'],'1200');
  assert.match(f.errors.at(-1),/sessão/);h.onkeydown(event({key:'ArrowRight'}));assert.equal(h.attrs['aria-valuenow'],'1200');
  h.onkeydown(event({key:'ArrowLeft'}));assert.equal(h.attrs['aria-valuenow'],'1190');
  f.controller.refresh();assert.equal(h.attrs['aria-valuenow'],'1190');
});
test('page integration ignores tbody updates and own handles, mounts late headings and dynamic auxiliary tables',()=>{
  const f=fixture();f.controller.destroy();const tables=[f.table];let scans=0, callback;
  f.doc.querySelectorAll=()=>{scans++;return tables;};
  const Observer=class {constructor(fn){callback=fn;}observe(){}disconnect(){}};
  const page=mountCurationWidths({root:f.doc,screen:'manual',preferences:f.storage,Observer,schedule:fn=>fn()});
  const body=f.doc.createElement('tbody');f.table.append(body);
  const tr=f.doc.createElement('tr');body.append(tr);tr.querySelector=()=>{throw Error('must not scan data rows');};
  const before=f.headers().reduce((n,h)=>n+h.measurements,0);
  callback([{type:'childList',target:body,addedNodes:[tr],removedNodes:[]}]);
  callback([{type:'childList',target:f.headers()[0],addedNodes:[f.handle('product')],removedNodes:[]}]);
  assert.equal(scans,1);assert.equal(f.headers().reduce((n,h)=>n+h.measurements,0),before);
  f.headers()[1].classList.add('hidden-column');callback([{type:'attributes',target:f.headers()[1]}]);
  assert.equal(f.storage.writes,0);
  const auxiliary=fixture();auxiliary.controller.destroy();tables.push(auxiliary.table);
  callback([{type:'childList',target:f.doc.body,addedNodes:[auxiliary.table],removedNodes:[]}]);
  assert.equal(scans,2);assert.ok(auxiliary.handle('payout'));
  const late=fixture();late.controller.destroy();tables.push(late.table);late.head.rows[0].cells=[];
  callback([{type:'childList',target:f.doc.body,addedNodes:[late.table],removedNodes:[]}]);
  assert.equal(late.row.children[1].querySelector('.hub-column-resizer'),null);
  late.head.rows[0].cells=late.row.children;
  callback([{type:'childList',target:late.head,addedNodes:[late.row],removedNodes:[]}]);
  assert.ok(late.handle('payout'));page.destroy();assert.equal(f.handle('payout'),null);
});
test('all seven Curadoria lists and Glimpse opt into one published shared module and stylesheet',async()=>{
  const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
  for(const path of ['index.html','gerentes/index.html','top-performance/index.html','clickbank-top-offers/index.html','smartadv-offers/index.html','hot-offers-ms/index.html','manual/index.html','glimpse/index.html']){
    for(const folder of ['src','dist']){
      const html=await read(`${folder}/curadoria/${path}`);
      assert.match(html,/column-widths-page\.mjs\?v=1" data-curation-widths=/,path);
      assert.match(html,/column-widths\.css\?v=1/,path);
    }
  }
  for(const file of ['column-widths.mjs','column-widths-page.mjs','column-widths.css'])assert.equal(await read('src/curadoria/'+file),await read('dist/curadoria/'+file));
  const css=await read('src/curadoria/column-widths.css');
  assert.match(css,/position: sticky/);assert.match(css,/focus-visible/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/table-layout:fixed/);
  assert.doesNotMatch(await read('src/index.template.html'),/column-widths-page/,'operational tables are untouched');
});
