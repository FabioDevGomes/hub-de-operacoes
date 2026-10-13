import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as Trends from '../src/curadoria/trends-domain.mjs';
import {mountTrendsSaveAction,sameTrendAssessment,trendPageState} from '../src/curadoria/trends-save-action.mjs';

// Actual legacy consumers, synthetic DOM/storage only; never open real databases.
const origins={
  top:{path:'top-performance/index.html',fn:'saveTrend',action:'topTrendsSave',indent:'',key:'offerId',sheet:'#offerSheet',panel:'[data-panel="trends"]',button:'#saveSheetButton',term:'#trendsTerm',selected:'#topTrendsResults [data-trends-result].selected',message:'#topTrendsMessage'},
  manager:{path:'gerentes/index.html',fn:'saveManagerTrendsResult',action:'managerTrendsSave',indent:'  ',key:'productKey',sheet:'#productSheet',panel:'#managerTrendsPanel',button:'#managerSaveTrends',term:'#managerTrendsTerm',selected:'#managerTrendsResults [data-trends-result].selected',message:'#managerTrendsMessage'},
  radar:{path:'index.html',fn:'saveTrendsResult',action:'radarTrendsSave',indent:'    ',key:'id',sheet:'#productSheet',panel:'#trendsSheetPanel',button:'#radarSaveTrends',term:'#trendsSearchTerm',message:'#trendsMessage'},
};

async function fixture(origin){
  const cfg=origins[origin],source=await readFile(new URL('../src/curadoria/'+cfg.path,import.meta.url),'utf8');
  const nodes=new Map(),node=selector=>{
    if(!nodes.has(selector)){const classes=new Set();nodes.set(selector,{value:'',textContent:'',checked:false,disabled:true,dataset:{},classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)},listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}});}
    return nodes.get(selector);
  };
  if(cfg.selected)node(cfg.selected).dataset.trendsResult='stable';node(cfg.term).value='Synthetic product';
  const previous={assessmentId:'previous',date:Trends.localDateKey(),capturedAt:'2026-01-01T12:00:00Z',status:'stable',searchTerm:'Synthetic product',countries:[],productAge:null,demandConcentrated:false};
  const entry={offerId:'own-123',productKey:'own-123',assessments:[previous],keywordCandidates:['existing synthetic candidate'],collections:[]};
  const record={id:'own-123',name:'Synthetic product',productName:'Synthetic product',offerId:'own-123',key:'own-123',trendsAssessments:[previous],trendsCollections:[],history:[{action:'existing'}]};
  const writes=[],events=[];let fail=false;
  const context=vm.createContext({Trends,TrendsDomain:Trends,mountTrendsSaveAction,sameTrendAssessment,trendPageState,Date,crypto:{randomUUID:()=> 'synthetic-new'},$:node,
    offers:[record],productIndex:new Map([['own-123',record]]),records:[record],activeOfferId:'own-123',activeKey:'own-123',activeId:'own-123',
    trends:[entry],trendsIndex:new Map([['own-123',entry]]),trendsFor:()=>context.trendsIndex.get('own-123'),
    trendsCountries:new Set(),productAge:'',managerTrendsCountries:new Set(),managerTrendsProductAge:'',productAgeLabel:value=>value||'',
    Storage:{STORES:{trends:'top-only'},put:async(store,value)=>{if(fail)throw new Error('synthetic write failure');writes.push({store,value});}},
    putAll:async(store,[value])=>{if(fail)throw new Error('synthetic write failure');writes.push({store:'manager-'+store,value});},
    putMany:async([value])=>{if(fail)throw new Error('synthetic write failure');writes.push({store:'radar-only',value});},
    render:()=>events.push('render'),loadTrends:()=>events.push('reload'),loadManagerTrends:()=>events.push('reload'),loadTodayTrends:()=>events.push('reload'),renderTrendsHistory(){},renderManagerTrendsHistory(){},validateTrends(){},
    refresh:async()=>{events.push('refresh');if(origin==='radar'&&writes.length)context.records=[writes.at(-1).value];},
    closeOffer:()=>{events.push('close');node(cfg.sheet).classList.add('hidden');},closeManagerSheet:()=>{events.push('close');node(cfg.sheet).classList.add('hidden');},closeProductSheet:()=>{events.push('close');node(cfg.sheet).classList.add('hidden');},
    listFocus:{restore:()=>events.push('restore')},toast:()=>events.push('toast'),
  });
  const persister=source.match(new RegExp('async function '+cfg.fn+'\\(status,[\\s\\S]*?\\n'+cfg.indent+'}'))?.[0];
  const action=source.match(new RegExp('const '+cfg.action+'=mountTrendsSaveAction\\([\\s\\S]*?\\n'+cfg.indent+'\\}\\);'))?.[0];
  assert.ok(persister&&action,'extract the actual implementation');
  vm.runInContext(persister+'\n'+action+'\nglobalThis.action='+cfg.action,context);
  return {context,node,cfg,writes,events,previous,entry,record,fail(){fail=true;}};
}

for(const origin of Object.keys(origins)){
  test(origin+': explicit Save uses its own stable ID, stays open, and deduplicates',async()=>{
    const f=await fixture(origin),{context,node,cfg}=f;
    assert.equal(f.writes.length,0);context.action.sync();assert.equal(node(cfg.button).disabled,false);
    assert.equal(await context.action.save(),true);assert.equal(f.writes.length,0);
    node(cfg.term).value='Edited synthetic product';
    assert.equal(await context.action.save(),true);assert.equal(f.writes.length,1);
    const stored=f.writes[0].value,assessments=origin==='radar'?stored.trendsAssessments:stored.assessments;
    assert.equal(stored[cfg.key],'own-123');assert.equal(assessments.at(-1).searchTerm,'Edited synthetic product');
    assert.equal(assessments.at(-1).status,'stable');assert.equal(f.previous.searchTerm,'Synthetic product');
    assert.equal(node(cfg.sheet).classList.contains('hidden'),false);assert.equal(f.events.includes('close'),false);
    assert.match(node(cfg.message).textContent,/salva/);
    if(origin!=='radar')assert.deepEqual(Array.from(stored.keywordCandidates),['existing synthetic candidate']);
    assert.equal(await context.action.save(),true);assert.equal(f.writes.length,1);
  });
  test(origin+': failure preserves records and fields for retry',async()=>{
    const f=await fixture(origin);f.node(f.cfg.term).value='Synthetic retry';f.fail();
    assert.equal(await f.context.action.save(),false);assert.equal(f.writes.length,0);
    assert.equal(f.previous.searchTerm,'Synthetic product');assert.equal(f.record.history.length,1);
    assert.equal(f.node(f.cfg.term).value,'Synthetic retry');assert.equal(f.node(f.cfg.sheet).classList.contains('hidden'),false);
    assert.equal(f.node(f.cfg.button).disabled,false);assert.match(f.node(f.cfg.message).textContent,/Não foi possível salvar/);
  });
  test(origin+': result selection stays pending until Save and keeps the sheet open',async()=>{
    const f=await fixture(origin);assert.equal(f.context.action.select('up'),true);assert.equal(f.writes.length,0);assert.equal(await f.context.action.save(),true);
    assert.equal(f.writes.length,1);assert.equal(f.events.includes('close'),false);assert.equal(f.node(f.cfg.sheet).classList.contains('hidden'),false);
  });
  test(origin+': Save outside Trends is inert',async()=>{
    const f=await fixture(origin);f.node(f.cfg.panel).classList.add('hidden');f.node(f.cfg.term).value='Not a Trends edit';
    assert.equal(await f.context.action.save(),false);assert.equal(f.writes.length,0);
  });
}

test('Radar detects evidence/concentration edits without changing the selected result',async()=>{
  const f=await fixture('radar');f.node('#trendsConcentrated').checked=true;f.node('#classicPaste').value='synthetic unrecognized evidence';
  assert.equal(await f.context.action.save(),true);assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].value.trendsAssessments.at(-1).demandConcentrated,true);
  assert.equal(f.writes[0].value.trendsCollections.length,0,'unrecognized raw text is not promoted to evidence');
});

for(const origin of Object.keys(origins))test(origin+': candidate edits preserve the newly saved assessment and later explicit saves retain candidates',async()=>{
  const f=await fixture(origin),name=origin==='top'?'persistTopTrendKeywordCandidates':origin==='manager'?'persistManagerTrendKeywordCandidates':'persistRadarTrendKeywordCandidates';
  const source=await readFile(new URL('../src/curadoria/'+origins[origin].path,import.meta.url),'utf8');
  f.context.renderTopTrendKeywordCandidates=()=>{};f.context.renderManagerTrendKeywordCandidates=()=>{};f.context.renderRadarTrendKeywordCandidates=()=>{};
  vm.runInContext(source.match(new RegExp('async function '+name+'[^\\n]+'))[0],f.context);
  await f.context.action.save('up');await f.context[name](f.record,['Synthetic candidate']);
  const record=f.writes.at(-1).value;
  assert.equal((origin==='radar'?record.trendsAssessments:record.assessments).at(-1).status,'up');
  f.node(f.cfg.term).value='Term after candidate';await f.context.action.save('up');
  assert.deepEqual(Array.from(origin==='radar'?f.writes.at(-1).value.trendsKeywordCandidates:f.writes.at(-1).value.keywordCandidates),['Synthetic candidate']);
});

test('legacy modules compile and their builds publish shared Save helpers',async()=>{
  for(const cfg of Object.values(origins)){
    const source=await readFile(new URL('../src/curadoria/'+cfg.path,import.meta.url),'utf8');
    const script=source.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];assert.ok(script);
    new vm.Script(script.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g,''));
    const published=await readFile(new URL('../dist/curadoria/'+cfg.path,import.meta.url),'utf8');
    assert.ok(published.includes('trends-save-action.mjs?v=4'));assert.ok(published.includes(cfg.button.slice(1)));
  }
});
