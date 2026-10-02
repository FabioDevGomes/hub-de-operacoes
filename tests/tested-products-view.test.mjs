import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';
const ctx=vm.createContext({window:{}});
const domainSource=await readFile(new URL('../src/tested-products/domain.js',import.meta.url),'utf8');
const viewSource=await readFile(new URL('../src/tested-products/view.js',import.meta.url),'utf8');
vm.runInContext(domainSource,ctx);vm.runInContext(viewSource,ctx);
const domain=ctx.window.TestedProductsDomain;
const product=(key,active,billed,salesCount=0,profit=billed)=>({key,name:key,label:key,campaigns:[key+' 01'],startDate:'2026-09-01',first:'2026-09-01',last:'2026-09-02',active,totalBilled:billed,totalProfit:profit,salesCount});
function harness(products,removed=0){
  const h=createRoot(),saved=new Map(),calls=[],messages=[];
  h.setList('[data-tested-sort]',['product','campaigns','status','revenue','profit','sales'].map(testedSort=>({testedSort})));
  h.setList('[data-tested-col]',['product','revenue','profit','sales'].map(testedCol=>({testedCol})));
  h.setList('[data-tested-column]',[{testedColumn:'revenue'},{testedColumn:'profit'},{testedColumn:'sales'}]);
  h.setList('.catalog-edit',[{key:'synthetic',product:'Synthetic'}]);
  h.setList('.catalog-remove',[{key:'synthetic',product:'Synthetic'}]);
  const choices={name:null,remove:false},dialogs={prompt:()=>choices.name,confirm:()=>choices.remove};
  const controller=ctx.window.TestedProductsView.mount({root:h.root,getSnapshot:()=>({products,removed}),domain,format,
    preferences:{getItem:key=>saved.get(key)||'[]',setItem:(key,value)=>saved.set(key,value)},
    actions:{rename:async(...args)=>calls.push(['rename',...args]),hide:async(...args)=>calls.push(['hide',...args]),restore:async()=>calls.push(['restore']),download:()=>calls.push(['download']),purge:()=>calls.push(['purge'])},
    dialogs,toast:(...args)=>messages.push(args)});
  return {...h,controller,saved,calls,dialogs,choices,messages};
}
test('Tested product sorting preserves active first, numeric order, missing last and original array',()=>{
  const rows=[product('Historic',false,null,1),product('Active B',true,20,2),product('Active A',true,100,8)],original=structuredClone(rows);
  assert.equal(domain.sortProducts(rows)[0].label,'Active A');
  assert.equal(domain.sortProducts(rows,'revenue','desc')[0].totalBilled,100);
  assert.equal(domain.sortProducts(rows,'revenue','asc').at(-1).totalBilled,null);
  assert.equal(domain.sortProducts(rows,'profit','desc')[0].totalProfit,100);
  assert.equal(domain.sortProducts(rows,'profit','asc').at(-1).totalProfit,null);
  assert.equal(domain.sortProducts(rows,'sales','desc')[0].salesCount,8);
  assert.deepEqual(rows,original);
  assert.equal(domain.normalizeDate('2027-01-02','2026-10-01'),'2025-01-02');
});
test('Tested view preserves counts, states, currency and escaping',()=>{
  const h=harness([product('<Synthetic>',true,0),product('Historical',false,null,null)],1);h.controller.render();
  assert.equal(h.get('#testedProductsCount').textContent,'2 produtos');
  assert.equal(h.get('#testedActiveProductsCount').textContent,'1 com campanha ativa');
  assert.match(h.get('#testedProductsBody').innerHTML,/data-tested-col="sales" class="num">0<\/td>/);
  assert.match(h.get('#testedProductsBody').innerHTML,/data-tested-col="sales" class="num">—<\/td>/);
  assert.match(h.get('#testedProductsBody').innerHTML,/data-tested-col="profit" class="num">BRL 0\.00<\/td>/);
  assert.match(h.get('#testedProductsBody').innerHTML,/data-tested-col="profit" class="num">—<\/td>/);
  assert.match(h.get('#testedProductsBody').innerHTML,/&lt;Synthetic&gt;/);
  assert.match(h.get('#testedProductsBody').innerHTML,/tested-status active/);
  assert.match(h.get('#testedProductsBody').innerHTML,/BRL 0.00/);
  assert.equal(h.get('#restoreProducts').classList.contains('hidden'),false);
  assert.deepEqual(h.calls,[],'rendering must not invoke catalog writes');
});
test('negative total profit is red without bold and other profit states stay unchanged',()=>{
  const h=harness([product('Loss',true,100,0,-25),product('Profit',true,100,0,25),product('Unknown',false,null,null,null)]);h.controller.render();
  const html=h.get('#testedProductsBody').innerHTML;
  assert.match(html,/data-tested-col="profit" class="num negative">BRL -25\.00<\/td>/);
  assert.match(html,/data-tested-col="profit" class="num">BRL 25\.00<\/td>/);
  assert.match(html,/data-tested-col="profit" class="num">—<\/td>/);
  assert.doesNotMatch(html,/<td data-tested-col="profit"[^>]*><strong>/);
});
test('Tested view preserves sorting and column preferences across rendering',()=>{
  const h=harness([product('Z',true,50),product('A',true,100)]);h.controller.render();
  h.root.querySelectorAll('[data-tested-sort]').find(e=>e.dataset.testedSort==='revenue').onclick();
  assert.ok(h.get('#testedProductsBody').innerHTML.indexOf('>Z<')<h.get('#testedProductsBody').innerHTML.indexOf('>A<'));
  h.root.querySelectorAll('[data-tested-sort]').find(e=>e.dataset.testedSort==='profit').onclick();
  assert.ok(h.get('#testedProductsBody').innerHTML.indexOf('>Z<')<h.get('#testedProductsBody').innerHTML.indexOf('>A<'));
  h.root.querySelectorAll('[data-tested-sort]').find(e=>e.dataset.testedSort==='profit').onclick();
  assert.ok(h.get('#testedProductsBody').innerHTML.indexOf('>A<')<h.get('#testedProductsBody').innerHTML.indexOf('>Z<'));
  const input=h.root.querySelectorAll('[data-tested-column]')[0];input.checked=false;input.onchange();
  assert.equal(h.saved.get('painel-produtos-testados-colunas-v1'),'["revenue"]');
  h.controller.render();
  assert.equal(h.root.querySelectorAll('[data-tested-col]')[1].classList.contains('hidden-column'),true);
  assert.match(h.get('#testedColumnsMenu').innerHTML,/Vendas/);
  assert.match(h.get('#testedColumnsMenu').innerHTML,/Lucro total/);
});
test('Tested catalog actions require user intent and retain existing callbacks',async()=>{
  const h=harness([product('Synthetic',true,50)],1);h.controller.render();
  const edit=h.root.querySelectorAll('.catalog-edit')[0],remove=h.root.querySelectorAll('.catalog-remove')[0];
  await edit.onclick();await remove.onclick();assert.deepEqual(h.calls,[]);
  h.choices.name='Edited';h.choices.remove=true;
  await edit.onclick();await remove.onclick();
  assert.deepEqual(h.calls,[['rename','synthetic','Edited'],['hide','synthetic']]);
  await h.get('#restoreProducts').onclick();assert.deepEqual(h.calls.at(-1),['restore']);
  assert.doesNotMatch(domainSource,/document|indexedDB|localStorage|fetch\(/);
  assert.doesNotMatch(viewSource,/indexedDB|localStorage|fetch\(/);
});
