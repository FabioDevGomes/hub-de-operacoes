import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(await read('src/product-diary/domain.js'),context);
vm.runInContext(await read('src/product-diary/view.js'),context);
const domain=context.window.ProductDiaryDomain,view=context.window.ProductDiaryView;
const normalized=value=>JSON.parse(JSON.stringify(value));
const row=(date,values)=>({date,cells:Object.fromEntries(Object.entries({A:date,...values}).map(([col,value])=>[col,{value}]))});
const empty=()=>({sheetName:'Campanha sintética',rows:[],displayRows:[],manualSalesByDate:new Map(),summary:null,pauseConfirmedAt:null,investment:null,clicks:null,conversions:null});
function mount(initial){const dom=createRoot();let snapshot=initial;const controller=view.mount({root:dom.root,domain,format,getSnapshot:()=>snapshot,actions:{setTitle(){}}});return{...dom,controller,setSnapshot:value=>snapshot=value}}
const cells=html=>[...html.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(match=>match[1]);

test('table totals sum only the five requested observed columns without mutating source rows',()=>{
  const rows=[row('2026-10-01',{B:10,C:2,F:.1,O:.1,P:1.23,G:.8,M:100}),row('2026-10-02',{B:'15',C:0,F:.2,O:.2,P:'2.34',G:.9,M:100})],before=JSON.stringify(rows);
  assert.deepEqual(normalized(domain.productDiaryTableTotals(rows)),{B:25,C:2,F:.3,O:.3,P:3.57});
  assert.equal(JSON.stringify(rows),before);
  assert.deepEqual(normalized(domain.productDiaryTableTotals([])),{B:null,C:null,F:null,O:null,P:null});
});

test('totals preserve explicit zero, missing/invalid fields, negative adjustments and partial observation',()=>{
  const invalid=[null,undefined,'',' ',false,true,NaN,Infinity,'—','inválido'];
  for(const value of invalid)assert.deepEqual(normalized(domain.productDiaryTableTotals([row('2026-10-01',{B:value,C:value,F:value,O:value,P:value})])),{B:null,C:null,F:null,O:null,P:null});
  assert.deepEqual(normalized(domain.productDiaryTableTotals([row('2026-10-01',{B:0,C:'0',F:0,O:0,P:0})])),{B:0,C:0,F:0,O:0,P:0});
  assert.deepEqual(normalized(domain.productDiaryTableTotals([row('2026-10-01',{B:5,O:10,P:3}),row('2026-10-02',{B:null,O:-1.5,P:-1})])),{B:5,C:null,F:null,O:8.5,P:2});
});

test('footer is the last table section, totals use centered compact style and fresh cache versions',async()=>{
  const template=await read('src/product-diary/template.html'),css=await read('src/product-diary/product-diary.css'),index=await read('src/index.template.html');
  assert.match(template,/<tbody id="productBody"><\/tbody><tfoot id="productTotals"><\/tfoot><\/table>/);
  assert.match(css,/#productView \.product-table tfoot th,#productView \.product-table tfoot td\{position:static;[^}]*text-align:center/);
  assert.match(index,/product-diary\/domain\.js\?v=5/);assert.match(index,/product-diary\/view\.js\?v=10/);assert.match(index,/product-diary\/product-diary\.css\?v=13/);
});

test('all native campaign diaries append one aligned totals row, separate from daily count and provisional sales',()=>{
  const rows=[row('2026-10-01',{B:10,C:2,F:.5,O:1.25,P:3}),row('2026-10-02',{B:20,C:3,F:1,O:2.75,P:4})],manualSalesByDate=new Map([['2026-10-03',{pendingConversions:2}]]),before=JSON.stringify(rows),s=mount({...empty(),rows,displayRows:rows,manualSalesByDate});
  for(const source of ['manifest','workbook']){
    s.controller.render('Sintética',source,'campaign-id');
    const footer=s.get('#productTotals').innerHTML,values=cells(footer);
    assert.equal(values.length,18);assert.equal((footer.match(/<tr/g)||[]).length,1);
    assert.equal(values[0],'Totais');assert.equal(values[1],'30');assert.equal(values[2],'5');assert.equal(values[5],'1.50');assert.equal(values[15],'4.00');assert.equal(values[16],'7.00');
    for(const index of [3,4,6,7,8,9,10,11,12,13,14,17])assert.equal(values[index],'—');
    assert.match(footer,/vendas manuais provisórias não incluídas/);assert.doesNotMatch(footer,/data-edit-observation|has-sales|manual-sale-note/);
    assert.equal(s.get('#rowCount').textContent,'3 dias');assert.doesNotMatch(s.get('#productBody').innerHTML,/Totais/);
    const previous=footer;s.controller.render('Sintética',source,'campaign-id');assert.equal(s.get('#productTotals').innerHTML,previous);
  }
  assert.equal(JSON.stringify(rows),before);
});

test('footer follows inclusive pause cutoff, clears in legacy summary and recalculates on campaign switch',()=>{
  const rows=[row('2026-10-01',{B:1,C:2,F:0,O:3,P:0}),row('2026-10-02',{B:4,C:5,F:1,O:6,P:7}),row('2026-10-03',{B:999,C:999,F:999,O:999,P:999})],s=mount({...empty(),rows,displayRows:rows,pauseConfirmedAt:'2026-10-02'});
  s.controller.render('Pausada');let values=cells(s.get('#productTotals').innerHTML);assert.equal(values[1],'5');assert.equal(values[15],'9.00');assert.equal(s.get('#rowCount').textContent,'2 dias');
  s.setSnapshot({...empty(),summary:{metrics:{}}});s.controller.render('Legado','legacy','legacy-id');assert.equal(s.get('#productTotals').innerHTML,'');
  const fresh=[row('2026-10-04',{B:0,C:0,F:0,O:0,P:0})];s.setSnapshot({...empty(),rows:fresh,displayRows:fresh});s.controller.render('Outra','manifest','other-id');
  assert.equal((s.get('#productTotals').innerHTML.match(/product-zero-value/g)||[]).length,5);values=cells(s.get('#productTotals').innerHTML);assert.equal(values[1],'0');assert.equal(values[15],'0.00');
  s.setSnapshot(empty());s.controller.render('Vazia');assert.equal(cells(s.get('#productTotals').innerHTML).slice(1).every(value=>value==='—'),true);
});
