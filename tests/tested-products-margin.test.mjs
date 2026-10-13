import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/tested-products/domain.js',import.meta.url),'utf8'),context);
const domain=context.window.TestedProductsDomain;
const row=(label,totalBilled,totalProfit)=>({label,campaigns:[label],totalBilled,totalProfit,totalInvestment:75});

test('margin is profit over billed revenue, not conventional return on investment',()=>{
  assert.equal(domain.profitMarginPercent(row('Gain',100,25)),25);
  assert.equal(domain.profitMarginPercent(row('Loss',100,-25)),-25);
  assert.equal(domain.profitMarginPercent(row('Break even',100,0)),0);
  assert.equal(domain.profitMarginPercent(row('Decimal',300,100)),100/300*100);
});

test('margin distinguishes unavailable totals and zero denominator from an observed zero profit',()=>{
  for(const invalid of [null,undefined,'',NaN,Infinity,-Infinity,'100',false]){
    assert.equal(domain.profitMarginPercent(row('Missing revenue',invalid,25)),null);
    assert.equal(domain.profitMarginPercent(row('Missing profit',100,invalid)),null);
  }
  for(const billed of [0,-100])assert.equal(domain.profitMarginPercent(row('No denominator',billed,25)),null);
  assert.equal(domain.profitMarginPercent(),null);
  assert.equal(domain.profitMarginPercent(row('Overflow',Number.MIN_VALUE,Number.MAX_VALUE)),null);
});

test('margin follows effective manual totals and restoration without adding an editable or stored field',()=>{
  const original=row('Synthetic',100,25),before=structuredClone(original);
  assert.equal(domain.profitMarginPercent(domain.applyManualAdjustments(original,{totalBilled:200})),12.5);
  assert.equal(domain.profitMarginPercent(domain.applyManualAdjustments(original,{totalProfit:-50})),-50);
  assert.equal(domain.profitMarginPercent(domain.applyManualAdjustments(original,{totalBilled:200,totalProfit:40})),20);
  assert.equal(domain.profitMarginPercent(domain.applyManualAdjustments(original,{totalProfit:null})),null);
  assert.equal(domain.profitMarginPercent(domain.applyManualAdjustments(original,{})),25);
  assert.deepEqual(original,before);
  assert.equal(domain.EDIT_FIELDS.some(field=>field.key==='margin'),false);
  assert.equal(Object.hasOwn(original,'margin'),false);
});

test('numeric margin sorting keeps missing values last in both directions and leaves inputs unchanged',()=>{
  const rows=[row('Unknown',0,0),row('Gain',100,25),row('Loss',100,-10),row('Zero',100,0)],before=structuredClone(rows);
  assert.deepEqual(Array.from(domain.sortProducts(rows,'margin','asc'),p=>p.label),['Loss','Zero','Gain','Unknown']);
  assert.deepEqual(Array.from(domain.sortProducts(rows,'margin','desc'),p=>p.label),['Gain','Zero','Loss','Unknown']);
  assert.deepEqual(rows,before);
});

test('margin uses consolidated product totals, not the average of campaign margins',()=>{
  const source=[{id:'a',nome_mcc:'Synthetic 01'},{id:'b',nome_mcc:'Synthetic 02'}];
  const products=domain.buildProducts({
    source,catalog:{ocultos:[],aliases:{},datas_inicio:{}},referenceDate:'2026-10-10',
    getProductName:c=>c.nome_mcc,getCampaignIdentity:()=>({dateSort:null}),getCampaignSheet:name=>name,
    activeCampaigns:[],salesAdjustments:new Map(),
    dailyByCampaign:new Map([
      ['a',[{data:'2026-10-09',celulas:{P:{value:100},O:{value:50}}}]],
      ['b',[{data:'2026-10-09',celulas:{P:{value:300},O:{value:270}}}]]
    ])
  });
  assert.equal(products.length,1);
  assert.equal(products[0].totalBilled,400);
  assert.equal(products[0].totalProfit,80);
  assert.equal(domain.profitMarginPercent(products[0]),20);
});
