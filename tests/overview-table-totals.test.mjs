import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';
const context=vm.createContext({window:{}});
for(const path of ['overview-domain.js','overview/view.js'])vm.runInContext(await readFile(new URL('../src/'+path,import.meta.url),'utf8'),context);
const domain=context.window.OverviewDomain;
const row=(name,status='ativa',amount=10,date='2026-09-29')=>({
  c:{nome_campanha_exato:name,_status:status},identity:{name,dateLabel:'29/09',dateSort:date},
  campaignId:name,pausedAt:'2026-09-29',totals:{investment:amount,impressions:amount,clicks:2,conversions:1},
  profit:-amount,roi:null,zeroDays:0
});
function setup(periodRows,preferences){
  const dom=createRoot(),state={totalsMode:'consolidated',sortKey:'current',sortDir:'desc',campaignStatusFilter:'active'},calls=[];
  const snapshots=Object.fromEntries(['consolidated','d1','d0'].map(mode=>[mode,{
    rows:periodRows[mode]||[],dates:{d1:'2026-09-29',d0:'2026-09-30'},referenceDate:'2026-09-30',
    activeCount:2,pausedCount:1,pendingSaleCount:0,d1Totals:[],historyEntries:[]
  }]));
  const controller=context.window.OverviewView.mount({root:dom.root,state,domain,format,preferences,
    getSnapshot:()=>snapshots[state.totalsMode],actions:{showProduct:(...args)=>calls.push(args)}});
  controller.render();
  const cell=key=>dom.get('#totalsFoot').innerHTML.match(new RegExp('<(?:td|th)[^>]*data-column="'+key+'"[^>]*>(.*?)</(?:td|th)>'))?.[1];
  return{...dom,state,snapshots,calls,controller,cell};
}
test('pure totals sum only projected fields, retain negative profit/fractions, round money and preserve inputs',()=>{
  const rows=[row('A'),row('B')];
  rows[0].totals={investment:.1,impressions:0,clicks:null,conversions:.98};
  rows[1].totals={investment:.2,impressions:null,clicks:3,conversions:1};
  rows[0].profit=10.01;rows[1].profit=-20.02;
  const before=JSON.stringify(rows),totals=domain.overviewTableTotals(rows);
  assert.equal(totals.investment.value,.3);assert.equal(totals.impressions.value,0);
  assert.equal(totals.clicks.value,3);assert.equal(totals.conversions.value,1.98);
  assert.equal(totals.profit.value,-10.01);assert.equal(totals.clicks.observedCount,1);
  assert.equal(JSON.stringify(rows),before);
  assert.deepEqual(Object.keys(totals).sort(),['clicks','conversions','impressions','investment','profit']);
});
test('empty/missing/invalid are absent, while observed zero stays zero',()=>{
  for(const rows of [[],[{totals:{investment:null,impressions:NaN,clicks:'',conversions:Infinity},profit:undefined}]]){
    for(const total of Object.values(domain.overviewTableTotals(rows)))assert.equal(total.value,null);
  }
  const zero=domain.overviewTableTotals([{totals:{investment:0,impressions:0,clicks:0,conversions:0},profit:0}]);
  for(const total of Object.values(zero))assert.equal(total.value,0);
});
test('footer combines status, search and start-date filters without changing cards or underlying rows',()=>{
  const rows=[row('Alfa'),row('Alfa pausada','pausada',30),row('Beta','ativa',20,'2026-09-30')];
  const s=setup({consolidated:rows}),before=JSON.stringify(s.snapshots),cards=s.get('#kpis').innerHTML;
  assert.equal(s.cell('current'),'BRL 30.00');assert.equal(s.cell('imp'),'30');
  assert.equal(s.cell('clicks'),'4');assert.equal(s.cell('conv'),'2');assert.equal(s.cell('profit'),'BRL -30.00');
  s.get('#campaignStatusFilter').onchange({target:{value:'all'}});
  assert.equal(s.cell('current'),'BRL 60.00');
  s.get('#search').value='ALFA';s.get('#search').oninput();assert.equal(s.cell('current'),'BRL 40.00');
  s.get('#campaignStatusFilter').onchange({target:{value:'paused'}});assert.equal(s.cell('current'),'BRL 30.00');
  s.get('#campaignStartDate').onchange({target:{value:'2026-09-30'}});assert.equal(s.cell('current'),'—');
  s.get('#search').value='';s.get('#search').oninput();
  s.get('#campaignStatusFilter').onchange({target:{value:'active'}});assert.equal(s.cell('current'),'BRL 20.00');
  assert.equal(s.get('#kpis').innerHTML,cards);assert.equal(JSON.stringify(s.snapshots),before);assert.deepEqual(s.calls,[]);
});
test('period changes use their own projections and do not fallback to Consolidado for missing D0',()=>{
  const s=setup({consolidated:[row('A','ativa',90)],d1:[row('A','ativa',12)],d0:[{...row('A'),totals:null,profit:null}]});
  assert.equal(s.cell('current'),'BRL 90.00');
  s.get('#totalsD1').onclick();assert.equal(s.cell('current'),'BRL 12.00');
  s.get('#totalsD0').onclick();assert.equal(s.cell('current'),'—');assert.equal(s.cell('profit'),'—');
  s.get('#totalsConsolidated').onclick();assert.equal(s.cell('current'),'BRL 90.00');
});
test('column visibility, sorting and many scrolled rows keep one final non-interactive footer',async()=>{
  const rows=Array.from({length:100},(_,i)=>row('A'+i));
  const s=setup({consolidated:rows},{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});
  assert.equal(s.cell('current'),'BRL 1000.00');assert.equal(s.cell('campaign'),'Totais');
  s.setList('[data-column-choice]',[{columnChoice:'current'}]);s.controller.render();
  const choice=s.root.querySelectorAll('[data-column-choice]')[0];choice.checked=false;choice.onchange();
  assert.equal(s.cell('current'),undefined);assert.equal(s.cell('imp'),'1000');
  s.get('#overviewColumnsReset').onclick();assert.equal(s.cell('current'),'BRL 1000.00');
  s.state.sortDir='asc';s.controller.render();assert.equal(s.cell('current'),'BRL 1000.00');
  assert.equal((s.get('#totalsFoot').innerHTML.match(/<tr>/g)||[]).length,1);
  assert.doesNotMatch(s.get('#totalsFoot').innerHTML,/data-campaign=|href=|<button/);
  assert.match(s.get('#totalsFoot').innerHTML,/100 de 100 com valor observado/);
  const template=await readFile(new URL('../src/overview/template.html',import.meta.url),'utf8');
  assert.match(template,/<tbody id="totalsBody"><\/tbody><tfoot id="totalsFoot"[^>]*><\/tfoot><\/table>/);
  const css=await readFile(new URL('../src/overview/overview.css',import.meta.url),'utf8');
  assert.match(css,/tfoot :is\(th,td\)\{position:static;padding:3px 10px;line-height:1\.2/);
  assert.match(css,/tfoot th\[data-column\]\{position:static;height:auto/,'row header cannot inherit sticky position or 44px height from column headers');
});
