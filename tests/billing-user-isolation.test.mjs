import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as Domain from '../src/billing/billing-domain.mjs';
import * as Storage from '../src/billing/billing-storage.mjs';

const source = await readFile(new URL('../src/billing/billing-view.mjs', import.meta.url), 'utf8');
const between = (start, end) => {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first);
  return source.slice(first, last);
};
const readView = new Function('Domain', 'Storage', `
  let chartRenderSequence=0;
  const esc=String, displayDate=String, money=(value,currency)=>currency+':'+(value??'missing');
  ${between('function getFilters(root)', 'function invalidateMonthNavigation(root)')}
  ${between('function lifetimeTotalKpi(sales)', 'function cashKpis(movements)')}
  ${between('function kpi(label', 'function renderAggregate(root)')}
  ${between('async function renderMonthlyChart(root)', 'function buildMonthlyChartSvg(')}
  function buildMonthlyChartSvg(series){ return JSON.stringify(series); }
  return { lifetimeTotalKpi, competenceKpis, renderMonthlyChart };
`)(Domain, Storage);
const sale = (sale_id, sale_date, value_brl, overrides={}) => Domain.normalizeSale({ sale_id, sale_date, value_brl, product:'Synthetic product', platform:'Synthetic platform', ...overrides });
const fixtures = {
  empty: [],
  first: [sale('same-id', '2026-09-10', 120, { value_usd:10, conversion_count:2 }), sale('extra', '2026-10-01', 30), sale('cancelled', '2026-10-01', 900, { active:false })],
  second: [sale('same-id', '2026-10-01', 7, { value_usd:2 })],
};
const snapshot = structuredClone(fixtures);
let selected='empty';
const originalDb=globalThis.indexedDB, originalRange=globalThis.IDBKeyRange;
globalThis.IDBKeyRange={ bound:(start,end)=>({start,end}) };
globalThis.indexedDB={ open() {
  const request={};
  const sales=fixtures[selected];
  queueMicrotask(()=>{
    request.result={ close(){}, transaction(storeName,mode) {
      assert.equal(mode,'readonly','calculating KPIs/chart never writes to a user database');
      const tx={ objectStore(name) {
        const rows=name==='billing_sales'?sales:[];
        const read=(range,index)=>{
          const result={};
          queueMicrotask(()=>{
            result.result=structuredClone(rows.filter(row=>!range||(row[index]>=range.start&&row[index]<=range.end)));
            result.onsuccess?.();
            queueMicrotask(()=>tx.oncomplete?.());
          });
          return result;
        };
        return {getAll:()=>read(),index:index=>({getAll:range=>read(range,index)})};
      }};
      return tx;
    }};
    request.onsuccess?.();
  });
  return request;
}};
async function report(profile) {
  selected=profile;
  const all=await Storage.queryAllSales();
  const nodes=new Map();
  const root={__billing:{mode:'competence',range:{start:'2026-10-01',end:'2026-10-31'}}, querySelector(selector) {
    if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',clientWidth:720});
    return nodes.get(selector);
  }};
  await readView.renderMonthlyChart(root);
  return {total:readView.lifetimeTotalKpi(all),count:readView.competenceKpis([],[],all),chart:nodes.get('#billingMonthlyChart').innerHTML};
}
try {
  const empty=await report('empty');
  assert.match(empty.total,/BRL:missing/);
  assert.match(empty.count,/Total de vendas<\/span><strong>0<\/strong>/);
  assert.match(empty.chart,/Nenhum lançamento deste navegador/);
  const first=await report('first');
  assert.match(first.total,/BRL:150/);
  assert.match(first.total,/USD:10/);
  assert.match(first.count,/Total de vendas<\/span><strong>3<\/strong>/);
  assert.deepEqual(JSON.parse(first.chart).map(row=>[row.key,row.value]),[['2026-09',120],['2026-10',30]]);
  const second=await report('second');
  assert.match(second.total,/BRL:7/);
  assert.match(second.total,/USD:2/);
  assert.match(second.count,/Total de vendas<\/span><strong>1<\/strong>/);
  assert.deepEqual(JSON.parse(second.chart).map(row=>[row.key,row.value]),[['2026-10',7]]);
  assert.match((await report('empty')).chart,/Nenhum lançamento deste navegador/,'a fresh user still has no data after other users are read');
  assert.deepEqual(fixtures,snapshot,'existing financial records remain unchanged');
} finally {
  if(originalDb===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=originalDb;
  if(originalRange===undefined)delete globalThis.IDBKeyRange;else globalThis.IDBKeyRange=originalRange;
}
console.log('billing user isolation: empty and independent databases drive totals, sales count and monthly chart');
