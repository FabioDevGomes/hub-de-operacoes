import {lastCollectionCell} from '../src/curadoria/last-collection.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const source=await readFile(new URL('../src/curadoria/top-performance/index.html',import.meta.url),'utf8');
const shared=await readFile(new URL('../src/table-edit-actions.css',import.meta.url),'utf8');
const render=source.split(/\r?\n/).find(line=>line.startsWith('function render(){'));

test('E-commerce hide/show use the shared top-right discreet link without raised styling',()=>{
  assert.match(source,/table-edit-actions\.css\?v=3/);
  assert.match(source,/class="product-cell hub-edit-host"/);
  assert.match(source,/class="item-visibility hub-corner-edit/);
  assert.match(source,/\.product-cell\.hub-edit-host\{padding-right:54px\}/);
  assert.match(shared,/html body table :is\(thead,tbody\) :is\(th,td\) :is\(a,button\):is\(\.hub-corner-edit,\.hub-discreet-action\)/);
  assert.doesNotMatch(source,/\.item-visibility(?:\.restore|:hover)?\{/);
  assert.match(shared,/:is\(\.hub-corner-edit,\.hub-discreet-action\)\{[^}]*background:transparent!important;box-shadow:none!important;/);
  assert.match(shared,/font-size:\.65rem!important/);
  assert.match(shared,/text-decoration:underline dotted/);
  assert.match(shared,/:hover\{[^}]*color:#b6d4f2[^}]*box-shadow:none!important/);
  assert.match(shared,/:focus-visible\{outline:2px solid[^}]*!important/);
  assert.match(shared,/\.hub-discreet-action\{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;white-space:nowrap\}/);
});

for(const hidden of [false,true])test('discreet '+(hidden?'Reexibir':'Ocultar')+' retains offer ID, isolates row click and writes only on explicit activation',()=>{
  const nodes=new Map(),writes=[],opened=[],button={dataset:{toggleOfferVisibility:'synthetic-01',hidden:String(hidden)}},row={dataset:{offer:'synthetic-01'}};
  const node=key=>{if(!nodes.has(key))nodes.set(key,{value:key==='#visibilityFilter'?'all':'',innerHTML:'',style:{}});return nodes.get(key)};
  const item={offerId:'synthetic-01',productName:'Oferta sintética',countriesVisible:[],badges:{},payout:{value:1}};
  const context=vm.createContext({lastCollectionCell,offers:[item],hiddenOffers:new Set(hidden?[item.offerId]:[]),latestSeenByOffer:new Map(),
    $:node,$$:key=>key==='[data-toggle-offer-visibility]'?[button]:key==='[data-offer]'?[row]:[],
    filteredOffers:()=>[item],DecisionUI:{normalizeDecision:x=>x,rowClass:()=>'',buttonHtml:()=>''},
    decisionFor:()=>({currentStatus:'Revisar'}),safe:String,dateTime:()=>'',countriesText:()=>'',trendsBadge:()=>'',imagesBadge:()=>'',badgeHtml:()=>'',movementHtml:()=>'',updateSortHeaders:()=>{},applyColumns:()=>{},
    setOfferHidden:(...args)=>writes.push(args),openOffer:(...args)=>opened.push(args)});
  vm.runInContext(render,context);context.render();
  assert.equal(writes.length,0);assert.equal(opened.length,0);
  assert.match(node('#rows').innerHTML,/product-cell hub-edit-host/);
  assert.match(node('#rows').innerHTML,/item-visibility hub-corner-edit/);
  assert.ok(node('#rows').innerHTML.includes('>'+ (hidden?'Reexibir':'Ocultar')+'</button>'));
  let stopped=false;button.onclick({stopPropagation:()=>{stopped=true}});
  assert.equal(stopped,true);assert.deepEqual(writes,[[item.offerId,!hidden]]);assert.equal(opened.length,0);
});
