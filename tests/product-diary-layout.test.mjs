import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';

test('diary cap follows actual space, not page scroll, and leaves the data untouched',async()=>{
  const dom=createRoot(),frames=new Map(),listeners=new Map(),properties=new Map(),observed=[];
  let nextFrame=0,documentTop=350,observerCallback,disconnected=false,visible=true;
  const window={innerHeight:900,scrollY:0,
    requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame},cancelAnimationFrame:id=>frames.delete(id),
    addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),
    ResizeObserver:class{constructor(fn){observerCallback=fn}observe(node){observed.push(node)}disconnect(){disconnected=true}}
  };
  const context=vm.createContext({window});
  for(const file of ['domain.js','view.js'])vm.runInContext(await readFile(new URL('../src/product-diary/'+file,import.meta.url),'utf8'),context);
  const wrap=dom.get('#productTableWrap');
  wrap.style={getPropertyValue:key=>properties.get(key),setProperty:(key,value)=>properties.set(key,value)};
  wrap.getBoundingClientRect=()=>({top:documentTop-window.scrollY});wrap.getClientRects=()=>visible?[{}]:[];
  wrap.scrollTop=75;wrap.scrollLeft=40;
  dom.root.parentElement={querySelectorAll:()=>[dom.get('.topbar'),dom.get('.statusbar'),dom.get('.notice')]};
  const rows=[{date:'2026-10-08',cells:{A:{value:'08/10/2026'},C:{value:3},F:{value:0},O:{value:12.34}}}];
  const snapshot={sheetName:'Teste',rows,displayRows:rows,manualSalesByDate:new Map(),summary:null,investment:12.34,clicks:3,conversions:0};
  const before=JSON.stringify(snapshot),view=window.ProductDiaryView.mount({root:dom.root,domain:window.ProductDiaryDomain,format,getSnapshot:()=>snapshot,actions:{setTitle(){}}});
  const flush=()=>{for(const [id,fn] of [...frames]){frames.delete(id);fn()}};
  const cap=()=>properties.get('--product-diary-table-max-height');
  view.render('Teste');assert.equal(cap(),undefined,'measure after rendering/visibility settles');flush();assert.equal(cap(),'538px');
  const body=dom.get('#productBody').innerHTML;
  window.scrollY=250;listeners.get('resize')();flush();assert.equal(cap(),'538px','page scroll cannot expand the cap');
  window.innerHeight=700;listeners.get('resize')();flush();assert.equal(cap(),'338px');
  documentTop=390;observerCallback();observerCallback();assert.equal(frames.size,1);flush();assert.equal(cap(),'298px');
  documentTop=850;observerCallback();flush();assert.equal(cap(),'120px','very tall headers retain a usable scroll region');
  window.innerHeight=100;listeners.get('resize')();flush();assert.equal(cap(),'88px','never exceed the viewport even in a very short window');
  visible=false;window.innerHeight=800;observerCallback();flush();assert.equal(cap(),'88px','hidden pages are not measured');
  visible=true;documentTop=300;view.render('Teste');flush();assert.equal(cap(),'488px');
  wrap.classList.add('hidden');documentTop=200;observerCallback();flush();assert.equal(cap(),'488px','legacy summary does not acquire table geometry');
  assert.equal(observed.length,5);assert.equal(listeners.has('scroll'),false);
  assert.equal(wrap.scrollTop,75);assert.equal(wrap.scrollLeft,40);
  assert.equal(dom.get('#productBody').innerHTML,body);assert.equal(JSON.stringify(snapshot),before);
  listeners.get('resize')();view.dispose();assert.equal(frames.size,0);assert.equal(disconnected,true);assert.equal(listeners.size,0);
});
