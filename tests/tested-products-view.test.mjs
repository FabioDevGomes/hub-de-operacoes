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
  h.setList('.catalog-edit',[{key:products[0]?.key||'synthetic',product:products[0]?.label||'Synthetic'}]);
  h.setList('.catalog-remove',[{key:'synthetic',product:'Synthetic'}]);
  const choices={name:null,remove:false},dialogs={prompt:()=>choices.name,confirm:()=>choices.remove};
  const controller=ctx.window.TestedProductsView.mount({root:h.root,getSnapshot:()=>({products,removed}),domain,format,
    preferences:{getItem:key=>saved.get(key)||'[]',setItem:(key,value)=>saved.set(key,value)},
    actions:{saveAdjustments:async(...args)=>calls.push(['adjust',...args]),hide:async(...args)=>calls.push(['hide',...args]),restore:async()=>calls.push(['restore']),purge:()=>calls.push(['purge'])},
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
test('Tested product search filters product and related campaign names without changing totals or source data',()=>{
  const rows=[product('Café Azul',true,100),product('Produto Beta',true,50),product('Histórico',false,20)];
  rows[0].campaigns=['ResQVac 01 (GM-BB-US)'];rows[0].relatedCampaigns=['ResQVac 01 (GM-BB-US)'];
  const original=structuredClone(rows),h=harness(rows);h.controller.render();
  h.get('#testedSearch').value='cafe';h.get('#testedSearch').oninput();
  assert.match(h.get('#testedProductsBody').innerHTML,/Café Azul/);
  assert.doesNotMatch(h.get('#testedProductsBody').innerHTML,/Produto Beta|Histórico/);
  assert.equal(h.get('#testedProductsCount').textContent,'3 produtos');
  assert.equal(h.get('#testedActiveProductsCount').textContent,'2 com campanhas ativas');
  h.get('#testedSearch').value='resqvac';h.get('#testedSearch').oninput();
  assert.match(h.get('#testedProductsBody').innerHTML,/Café Azul/,'busca por campanha relacionada deve encontrar seu produto');
  assert.doesNotMatch(h.get('#testedProductsBody').innerHTML,/Produto Beta/);
  h.get('#testedSearch').value='sem correspondência';h.get('#testedSearch').oninput();
  assert.match(h.get('#testedProductsBody').innerHTML,/Nenhum produto corresponde à busca/);
  h.get('#testedSearch').value='';h.get('#testedSearch').oninput();
  assert.match(h.get('#testedProductsBody').innerHTML,/Produto Beta/);
  assert.deepEqual(rows,original);assert.deepEqual(h.calls,[],'buscar não grava ajustes, catálogo ou base');
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
test('Tested catalog editor opens all fields without manual checks, cancels without writes and saves only changed fields',async()=>{
  const h=harness([product('Synthetic',true,50)],1);h.controller.render();
  const edit=h.root.querySelectorAll('.catalog-edit')[0],remove=h.root.querySelectorAll('.catalog-remove')[0];
  await edit.onclick();await remove.onclick();assert.deepEqual(h.calls,[]);
  assert.equal(h.get('#testedEditDialog').open,true);
  assert.equal(h.get('#tested-edit-label').value,'Synthetic');
  assert.equal(h.get('#tested-edit-label').disabled,false);
  assert.doesNotMatch(h.get('#testedEditFields').innerHTML,/type="checkbox"|tested-manual-|Ajuste manual/);
  h.get('#testedEditCancel').onclick();assert.equal(h.get('#testedEditDialog').open,false);assert.deepEqual(h.calls,[]);
  await edit.onclick();h.get('#tested-edit-label').value='Edited';
  await h.get('#testedEditForm').onsubmit({preventDefault(){}});
  h.choices.remove=true;await remove.onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[['adjust','Synthetic',{label:'Edited'}],['hide','synthetic']]);
  assert.equal(h.get('#testedEditDialog').open,false);
  await h.get('#restoreProducts').onclick();assert.deepEqual(h.calls.at(-1),['restore']);
  assert.doesNotMatch(domainSource,/document|indexedDB|localStorage|fetch\(/);
  assert.doesNotMatch(viewSource,/indexedDB|localStorage|fetch\(/);
  assert.doesNotMatch(viewSource,/\bprompt\(/);
});

test('editor restores individual or all calculated fields without persisting before save',async()=>{
  const base=product('Synthetic',true,50,2,25),row=domain.applyManualAdjustments(base,{label:'Manual',salesCount:10,totalProfit:-100});
  const h=harness([row]);h.controller.render();await h.root.querySelectorAll('.catalog-edit')[0].onclick();
  assert.equal(h.get('#tested-edit-label').disabled,false);assert.equal(h.get('#tested-edit-salesCount').value,'10');
  h.get('#tested-restore-salesCount').onclick();assert.equal(h.get('#tested-edit-salesCount').value,'2');
  assert.deepEqual(h.calls,[]);
  await h.get('#testedEditForm').onsubmit({preventDefault(){}});
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),['adjust','Synthetic',{label:'Manual',totalProfit:-100}]);
  await h.root.querySelectorAll('.catalog-edit')[0].onclick();h.get('#testedEditReset').onclick();assert.equal(h.get('#tested-edit-label').value,'Synthetic');
  await h.get('#testedEditForm').onsubmit({preventDefault(){}});assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1))),['adjust','Synthetic',{}]);
});

test('saving without editing creates no automatic overrides and restoring still leaves fields editable',async()=>{
  const h=harness([product('Synthetic',true,50)]);h.controller.render();await h.root.querySelectorAll('.catalog-edit')[0].onclick();
  await h.get('#testedEditForm').onsubmit({preventDefault(){}});assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),['adjust','Synthetic',{}]);
  await h.root.querySelectorAll('.catalog-edit')[0].onclick();h.get('#testedEditReset').onclick();
  assert.equal(h.get('#tested-edit-salesCount').disabled,false);h.get('#tested-edit-salesCount').value='3';
  await h.get('#testedEditForm').onsubmit({preventDefault(){}});assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1))),['adjust','Synthetic',{salesCount:3}]);
});

test('invalid data keeps editor open and displays field error without a write',async()=>{
  const h=harness([product('Synthetic',true,50)]);h.controller.render();await h.root.querySelectorAll('.catalog-edit')[0].onclick();
  h.get('#tested-edit-campaignCount').value='1.5';
  await h.get('#testedEditForm').onsubmit({preventDefault(){}});
  assert.equal(h.get('#testedEditDialog').open,true);assert.equal(h.get('#tested-edit-campaignCount').getAttribute('aria-invalid'),'true');assert.match(h.get('#tested-error-campaignCount').textContent,/inteira/);assert.deepEqual(h.calls,[]);
});

test('failed persistence leaves draft intact; duplicate submissions and closing while saving are blocked',async()=>{
  const h=harness([product('Synthetic',true,50)]);h.controller.render();await h.root.querySelectorAll('.catalog-edit')[0].onclick();
  h.get('#tested-edit-salesCount').value='7';
  // A deferred action proves the view waits for the catalog transaction, not a base reload.
  let rejectSave;const result=new Promise((_,reject)=>{rejectSave=reject});
  const second=createRoot();let calls=0;const controller=ctx.window.TestedProductsView.mount({root:second.root,getSnapshot:()=>({products:[product('Synthetic',true,50)],removed:0}),domain,format,preferences:{getItem:()=>null,setItem(){}},dialogs:{confirm:()=>false},toast(){},actions:{saveAdjustments:()=>{calls++;return result}}});
  second.setList('.catalog-edit',[{key:'Synthetic'}]);controller.render();await second.root.querySelectorAll('.catalog-edit')[0].onclick();
  second.get('#tested-edit-salesCount').value='7';
  const saving=second.get('#testedEditForm').onsubmit({preventDefault(){}});await second.get('#testedEditForm').onsubmit({preventDefault(){}});
  second.get('#testedEditCancel').onclick();let cancelled=false;second.get('#testedEditDialog').oncancel({preventDefault(){cancelled=true}});
  assert.equal(calls,1);assert.equal(cancelled,true);assert.equal(second.get('#testedEditDialog').open,true);assert.equal(second.get('#testedEditSave').disabled,true);
  rejectSave(new Error('Synthetic catalog failure'));await saving;
  assert.match(second.get('#testedEditError').textContent,/catalog failure/);assert.equal(second.get('#tested-edit-salesCount').value,'7');assert.equal(second.get('#testedEditSave').disabled,false);assert.equal(second.get('#testedEditDialog').open,true);
});

test('manual values keep their text label and tooltip without pencil icons, preserving missing versus zero',()=>{
  const row=domain.applyManualAdjustments(product('Synthetic',true,50,2),{salesCount:0,campaignCount:null,totalProfit:-5,relatedCampaigns:['<manual>']});
  const h=harness([row]);h.controller.render();const html=h.get('#testedProductsBody').innerHTML;
  assert.match(html,/Ajuste manual nesta lista/);assert.match(html,/data-manual="true"/);assert.match(html,/data-tested-col="campaigns" class="num">—/);assert.match(html,/data-tested-col="sales" class="num">0/);assert.match(html,/&lt;manual&gt;/);assert.equal(domain.editorValues(row).campaignCount,null);
  assert.match(html,/title="Ajuste manual somente em Produtos Testados"/);assert.doesNotMatch(html,/tested-manual-marker|✎|✏/);
});
