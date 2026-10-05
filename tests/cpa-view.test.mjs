import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';
const ctx=vm.createContext({window:{}});
const domainSource=await readFile(new URL('../src/cpa/domain.js',import.meta.url),'utf8');
const viewSource=await readFile(new URL('../src/cpa/view.js',import.meta.url),'utf8');
vm.runInContext(domainSource,ctx);vm.runInContext(viewSource,ctx);
const domain=ctx.window.CpaDomain;
function row(overrides={}){return{name:'<synthetic campaign>',product:'Synthetic',account:'Synthetic account',status:'ativa',check:{range:70,status:'ok',countries:['US'],platform:'GM',target:70,targetCurrency:'USD',calculated:70,difference:0},totals:{investment:100,conversions:2,commission:150,profit:50,roi:50,impressions:500,actualCpa:50},...overrides}}
function harness(rows=[],now=()=>new Date('2026-10-05T15:00:00-03:00')){
  const h=createRoot(),state=domain.createState(),queries=[];
  const controller=ctx.window.CpaView.mount({root:h.root,state,getRows:q=>{queries.push(q);return rows},now,domain,format:{...format,parseDate:value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value:/^\d{2}\/\d{2}\/\d{4}$/.test(value)?value.split('/').reverse().join('-'):null,campaignName:name=>name}});
  return {...h,state,controller,queries};
}
test('CPA defaults and filters preserve active/history scope and all dimensions',()=>{
  const state=domain.createState(),active=row(),paused=row({status:'pausada',product:'Other',account:'Other'});
  assert.equal(state.cpaMode,'history');assert.equal(state.cpaStatus,'ativa');
  assert.deepEqual([...domain.filterRows([active,paused],state)],[active]);
  state.cpaStatus='all';assert.equal(domain.filterRows([active,paused],state).length,2);
  for(const [key,value] of Object.entries({cpaAccount:'Synthetic account',cpaProduct:'Synthetic',cpaCountry:'US',cpaPlatform:'GM'})){
    const selection={...state,[key]:value};assert.equal(domain.filterRows([active],selection).length,1);
    assert.equal(domain.filterRows([active],{...selection,[key]:'absent'}).length,0);
  }
});
test('CPA summary uses weighted totals, flags and deterministic range selection',()=>{
  const rows=[row(),row({totals:{investment:200,conversions:1,commission:100},check:{range:70,status:'bad'}})],original=structuredClone(rows);
  const result=domain.summarizeRows(rows,'absent',format.num);
  assert.equal(result.totalInvestment,300);assert.equal(result.totalConversions,3);assert.equal(result.totalProfit,-50);
  assert.equal(result.totalRoi,-50/300*100);assert.equal(result.summaries[0].actualCpa,100);
  assert.equal(result.alerts,1);assert.equal(result.selectedRange,'70');assert.deepEqual(rows,original);
  assert.equal(domain.summarizeRows([],null,format.num).selectedRange,null);
});
test('CPA counts unique products per range without merging campaign records',()=>{
  const groups=domain.productsByRange([row(),row({product:'SYNTHETIC'}),row({product:'Other'}),row({check:{range:null}})]);
  assert.equal(groups[0].count,2);assert.equal(groups[1].key,'other');assert.equal(groups[1].count,1);
});
test('CPA view binds scope/date controls and consistently updates tables/charts',()=>{
  const h=harness([row()]);h.controller.render();
  assert.equal(h.get('#cpaDateStart').value,'05/08/2026');
  assert.equal(h.get('#cpaDateEnd').value,'05/10/2026');
  assert.equal(h.queries.at(-1).start,'2026-08-05');
  assert.equal(h.queries.at(-1).end,'2026-10-05');
  assert.match(h.get('#cpaSummaryBody').innerHTML,/data-range="70"/);
  assert.match(h.get('#cpaDetailBody').innerHTML,/&lt;synthetic campaign&gt;/);
  assert.match(h.get('#cpaImpressionsChart').innerHTML,/500/);
  assert.match(h.get('#cpaProductsByRange').innerHTML,/<strong>1<\/strong>/);
  h.get('#cpaCurrentMode').onclick();assert.equal(h.queries.at(-1).mode,'current');
  h.get('#cpaHistoryMode').onclick();assert.equal(h.queries.at(-1).mode,'history');
  h.get('#cpaStatus').onchange({target:{value:'pausada'}});assert.match(h.get('#cpaSummaryBody').innerHTML,/Nenhuma campanha/);
  h.get('#cpaDateStart').value='invalid';h.get('#cpaDateStart').onchange();
  assert.equal(h.get('#cpaDateStart').getAttribute('aria-invalid'),'true');
  assert.doesNotMatch(domainSource,/document|indexedDB|localStorage|fetch\(/);
  assert.doesNotMatch(viewSource,/indexedDB|localStorage|fetch\(/);
});
test('CPA initial period subtracts two calendar months and clamps invalid month days',()=>{
  const h=harness([],()=>new Date('2026-04-30T15:00:00-03:00'));
  h.controller.render();
  assert.equal(h.get('#cpaDateStart').value,'28/02/2026');
  assert.equal(h.get('#cpaDateEnd').value,'30/04/2026');
});
test('CPA range selection updates detail and falls back when filters remove the selected range',()=>{
  const rows=[row(),row({check:{...row().check,range:80},status:'pausada'})],h=harness(rows);
  h.state.cpaStatus='all';
  h.setList('#cpaSummaryBody tr[data-range]',[{range:'70'},{range:'80'}]);
  h.controller.render();
  h.root.querySelectorAll('#cpaSummaryBody tr[data-range]')[1].onclick();
  assert.equal(h.state.cpaSelectedRange,'80');
  assert.match(h.get('#cpaDetailTitle').textContent,/80/);
  h.get('#cpaStatus').onchange({target:{value:'ativa'}});
  assert.equal(h.state.cpaSelectedRange,'70');
  assert.equal(h.get('#cpaDetailCount').textContent,'1 campanha');
});
