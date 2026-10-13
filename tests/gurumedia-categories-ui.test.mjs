import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import * as Domain from '../src/curadoria/top-performance/top-performance-domain.mjs';
import * as GuruCollections from '../src/curadoria/top-performance/gurumedia-collections-domain.mjs';

const html=await readFile(new URL('../src/curadoria/top-performance/index.html',import.meta.url),'utf8');
const raw=await readFile(new URL('./fixtures/gurumedia-nutra-diet.txt',import.meta.url),'utf8');
function source(name){const line=html.split(/\r?\n/).find(line=>line.startsWith(`function ${name}(`)||line.startsWith(`async function ${name}(`));assert.ok(line,name);return line}
function harness(world={offers:[],collections:[],snapshots:[]},saveCollection=async()=>{}){
  const nodes=new Map(),$=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',checked:false,disabled:false,innerHTML:'',classList:{toggle(){},add(){}},close(){this.closed=true}});return nodes.get(selector)};
  $('#visibilityFilter').value='all';const notices=[];
  const invalidate=html.match(/\$\('#pasteArea'\)\.oninput=(\(\)=>\{.*?\});\$\('#validateImport'\)/)?.[1];assert.ok(invalidate);
  const factory=new Function('Domain','GuruCollections','$','Storage','toast','crypto','world',`
    let {offers,collections,snapshots}=world,draft=null;
    const guruIndex=GuruCollections.projectGuruMediaCollections(offers,collections,snapshots),hiddenOffers=new Set(),sortOffers=items=>items;
    const safe=value=>String(value??''),DecisionUI={normalizeDecision:v=>v},decisionFor=id=>({currentStatus:'Revisar'}),refresh=async()=>{};
    ${source('filteredOffers')}
    ${source('prepareImport')}
    ${source('confirmImport')}
    return{filteredOffers,prepareImport,confirmImport,invalidate:${invalidate},draft:()=>draft};
  `);
  return{...factory(Domain,GuruCollections,$,{saveCollection},message=>notices.push(message),{randomUUID:()=>String(nodes.size)},world),$,notices};
}

test('a prévia real identifica Nutra, conta 13 e não grava ao validar; editar exige nova validação',async()=>{
  let writes=0;const ui=harness(undefined,async()=>writes++);ui.$('#pasteArea').value=raw;
  await ui.prepareImport();assert.equal(writes,0);assert.equal(ui.draft().collection.captureScope,'nutra-diet');
  assert.equal(ui.$('#confirmImport').disabled,false);assert.ok(ui.$('#previewMetrics').innerHTML.includes('Nutra / Diet'));assert.ok(ui.$('#previewMetrics').innerHTML.includes('<b>13</b>'));
  ui.$('#pasteArea').value='Outra colagem';ui.invalidate();assert.equal(ui.draft(),null);assert.equal(ui.$('#confirmImport').disabled,true);
  await ui.confirmImport();assert.equal(writes,0);
});

test('categoria desconhecida e colagem incompleta bloqueiam o botão real de confirmação',async()=>{
  const ui=harness();ui.$('#pasteArea').value=raw.replace('## Nutra / Diet','## Categoria desconhecida');await ui.prepareImport();assert.equal(ui.draft(),null);assert.equal(ui.$('#confirmImport').disabled,true);
  ui.$('#pasteArea').value=raw.replace('**13 offers**','**14 offers**');await ui.prepareImport();assert.equal(ui.draft().parsed.valid,false);assert.equal(ui.$('#confirmImport').disabled,true);
  await ui.confirmImport();assert.equal(ui.$('#importDialog').closed,undefined);
});

test('confirmação real salva uma vez enquanto pendente e conserva colagem em caso de falha',async()=>{
  let calls=0,release;const pending=new Promise(resolve=>{release=resolve}),ui=harness(undefined,async data=>{calls++;assert.equal(data.offers.length,13);assert.equal(data.snapshots.length,13);assert.equal(data.collection.captureScope,'nutra-diet');await pending});
  ui.$('#pasteArea').value=raw;await ui.prepareImport();const saving=ui.confirmImport();await ui.confirmImport();assert.equal(calls,1);assert.equal(ui.$('#confirmImport').disabled,true);release();await saving;
  assert.equal(ui.$('#importDialog').closed,true);assert.equal(ui.$('#pasteArea').value,'');assert.equal(ui.draft(),null);
  const failed=harness(undefined,async()=>{throw new Error('Falha sintética')});failed.$('#pasteArea').value=raw;await failed.prepareImport();
  const original=console.error;console.error=()=>{};try{await failed.confirmImport()}finally{console.error=original}
  assert.equal(failed.$('#pasteArea').value,raw);assert.ok(failed.draft());assert.equal(failed.$('#confirmImport').disabled,false);assert.ok(failed.notices[0].includes('preservada'));
});

test('o filtro real cruza categoria com busca, movimento, presença e payout, sem duplicar IDs',()=>{
  const world={offers:[],collections:[],snapshots:[]};
  function append(label,ids){const raw=`${label}\n${ids.length} offers\n`+ids.map(id=>`TopBrand OK\nExample ${id}#${id}\nExample ${id}\nUS$45`).join('\n'),plan=GuruCollections.prepareGuruMediaCollection({...world,parsed:Domain.parseTopPerformers(raw),collectionId:`c${world.collections.length}`,capturedAt:`2026-10-10T1${world.collections.length}:00:00Z`}),map=new Map(world.offers.map(offer=>[offer.offerId,offer]));for(const offer of plan.updated)map.set(offer.offerId,offer);world.offers=[...map.values()];world.collections.push(plan.collection);world.snapshots.push(...plan.current)}
  append('eCommerce',['10001','10002']);append('Nutra / Diet',['10003','10004']);append('Top Performers',['10003','10001']);append('Nutra / Diet',['10004']);
  const ui=harness(world);assert.equal(ui.filteredOffers().length,4);ui.$('#categoryFilter').value='nutra-diet';assert.deepEqual(ui.filteredOffers().map(offer=>offer.offerId),['10003','10004']);
  ui.$('#presenceFilter').value='present';assert.deepEqual(ui.filteredOffers().map(offer=>offer.offerId),['10004']);ui.$('#presenceFilter').value='absent';assert.deepEqual(ui.filteredOffers().map(offer=>offer.offerId),['10003']);
  ui.$('#presenceFilter').value='';ui.$('#movementFilter').value='up';assert.deepEqual(ui.filteredOffers().map(offer=>offer.offerId),['10004']);ui.$('#movementFilter').value='';ui.$('#search').value='10003';assert.equal(ui.filteredOffers().length,1);
  ui.$('#search').value='';ui.$('#payoutMin').value='46';assert.equal(ui.filteredOffers().length,0);ui.$('#payoutMin').value='';ui.$('#categoryFilter').value='ecommerce';assert.equal(ui.filteredOffers().length,2);
  assert.ok(ui.filteredOffers().every(offer=>offer.latestMovement!=='exited'),'a saída em Nutra não apaga e-commerce');
});

test('publicação e ligações preservam rota, banco, análises e atualização das colunas ao filtrar',async()=>{
  const dist=await readFile(new URL('../dist/curadoria/top-performance/index.html',import.meta.url),'utf8'),sidebar=await readFile(new URL('../src/sidebar-component.js',import.meta.url),'utf8');
  for(const source of [html,dist]){assert.ok(source.includes('<h1>Plataforma Guru Media</h1>'));assert.ok(source.includes('id="categoryFilter"'));assert.ok(source.includes("'#categoryFilter,#badgeFilter"));assert.ok(source.includes("input.onchange=()=>render()"));assert.ok(source.includes('gurumedia-filters.css?v=1'));assert.ok(source.includes('gurumedia-collections-domain.mjs?v=1'));assert.ok(source.includes('data-hub-sidebar-active="ecommerce"'));assert.ok(source.includes("for(const id of['categoryFilter','search'"));}
  assert.ok(sidebar.includes("label: 'Plataforma Guru Media'"));assert.ok(sidebar.includes('/curadoria/top-performance/'));
  const css=await readFile(new URL('../src/curadoria/top-performance/gurumedia-filters.css',import.meta.url),'utf8');
  assert.match(css,/\.filter-grid\.hub-curation-table-filters\s*\{/,'o CSS incremental deve prevalecer sobre a grade legada definida depois do head');
  assert.equal(css.match(/grid-template-columns:\s*([^;]+);/)[1].trim().split(/\s+/).length,12,'todos os doze controles devem caber na faixa sem empurrar Colunas para outra linha');
});
