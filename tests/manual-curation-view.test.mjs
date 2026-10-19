import {mountTrendsSaveAction,trendPageState} from '../src/curadoria/trends-save-action.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedPage } from './helpers/published-page.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as Domain from '../src/curadoria/manual/manual-domain.mjs';
import * as Trends from '../src/curadoria/trends-domain.mjs';
import * as Images from '../src/curadoria/image-search-domain.mjs';
import * as Glimpse from '../src/curadoria/glimpse-domain.mjs';
import * as DecisionUI from '../src/curadoria/decision-ui.mjs';
import * as SignalUI from '../src/curadoria/automatic-signal-ui.mjs';
import {formatLastCollection} from '../src/curadoria/last-collection.mjs';
import {createManualStorage} from '../src/curadoria/manual/manual-storage.mjs';
import {memoryIndexedDB} from './helpers/manual-memory-idb.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const source=(await read('src/curadoria/manual/manual-view.mjs')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve));};
const stamp='2026-10-09T12:00:00.000Z';
function harness(){
  const nodes=new Map(),lists=new Map(),fields=new Map(),candidates=new Map();let n=0,restores=0,failTrend=false;
  const storage=createManualStorage({factory:memoryIndexedDB(),now:()=>stamp,id:()=>`product-${++n}`});
  const node=(dataset={})=>{const classes=new Set();return {dataset,value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,style:{},open:false,classList:{add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key),toggle:(key,on)=>on?classes.add(key):classes.delete(key)},addEventListener(type,handler){this['on'+type]=handler;},setAttribute(){},removeAttribute(){},closest(){return this;},focus(){this.focused=true;},showModal(){this.open=true;},close(){this.open=false;},querySelectorAll:()=>[],reset(){for(const field of fields.values())field.value='';},reportValidity:()=>true};};
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
  const tabs=['trends','glimpse','images','history'].map(tab=>node({tab})),panels=tabs.map(t=>node({panel:t.dataset.tab}));
  lists.set('[data-tab]',tabs);lists.set('.tabs [data-tab]',tabs);lists.set('[data-panel]',panels);
  const imageActions=[node({imageActions:'US'})],imageInputs=[node({negativeInput:'US'})],imageLists=[node({negativeList:'US'})];
  lists.set('[data-image-actions]',imageActions);lists.set('[data-negative-input]',imageInputs);lists.set('[data-negative-list]',imageLists);
  lists.set('[data-close]',[{...node({close:'productDialog'})},{...node({close:'restoreDialog'})}]);
  const root={querySelector:get,querySelectorAll:selector=>lists.get(selector)||[]};
  get('#offerSheet').classList.add('hidden');
  get('#productForm').elements={namedItem:key=>{if(!fields.has(key))fields.set(key,node());return fields.get(key);}};
  get('#visibilityFilter').value='visible';
  get('#saveSheetButton').parentElement=node();
  const formValues=()=>[...fields].map(([key,value])=>[key,value.value]);
  let view;const refresh=async()=>view.render(await storage.readState());
  const save=async task=>{await task();await refresh();};
  const actions={restoreFocus:()=>restores++,openTrends(){},openImages(){},openGlimpse(){},saveProduct:(input,old)=>save(()=>storage.saveProduct(input,old)),setHidden:(id,hidden)=>save(()=>storage.setHidden(id,hidden)),saveTrend:(id,input)=>{if(failTrend)throw Error('Falha sintética');return save(()=>storage.saveTrend(id,input));},changeTrendCandidates:(id,op)=>save(()=>storage.updateTrendCandidates(id,op)),saveImage:(id,input)=>save(()=>storage.saveImage(id,input)),saveDecision:(id,status)=>save(()=>storage.saveDecision(id,status)),addCountry(){},exportBackup(){},restoreBackup:payload=>storage.mergeBackup(payload)};
  const context=vm.createContext({mountTrendsSaveAction,trendPageState,Domain,Trends,Images,Glimpse,DecisionUI,SignalUI,formatLastCollection,Intl,FormData:class {constructor(){return new Map(formValues());}},
    Candidates:{keywordCandidateMarkerHtml:()=>'',renderKeywordCandidates:(container,options)=>{candidates.set(container,options);}},
    TrendsUI:{renderResultButtons:(container,value,select)=>{container.selected=value;container.select=select;},renderProductAgeButtons:(container,value,select)=>{container.select=select;}},
    ImagesUI:{renderImageResultButtons:(container,options)=>{container.select=status=>options.onSelect(options.country,status);}},mountColumnPicker:()=>({apply(){}}),
  });
  vm.runInContext(source+'\n globalThis.mount=mountManualView;',context);view=context.mount({root,actions});
  const clickRow=(attribute,dataset)=>get('#rows').onclick({target:{closest:selector=>selector===attribute?{dataset}:null}});
  return {view,get,fields,candidates,storage,refresh,clickRow,imageActions,imageInputs,imageLists,failTrend:()=>{failTrend=true;},restores:()=>restores};
}
test('manual UI: formulário nome-only cria registro e edição preserva ID com nomes iguais',async()=>{
  const h=harness();await h.refresh();h.get('#newProduct').onclick();assert.equal(h.get('#productDialog').open,true);
  h.get('#productForm').elements.namedItem('name').value='Produto sintético';
  await h.get('#productForm').onsubmit({preventDefault(){}});
  assert.equal(h.get('#productDialog').open,false);assert.match(h.get('#rows').innerHTML,/Produto sintético/);
  const p=(await h.storage.readState()).products[0];h.clickRow('[data-edit]',{edit:p.productId});h.get('#productForm').elements.namedItem('name').value='Nome novo';await h.get('#productForm').onsubmit({preventDefault(){}});
  assert.equal((await h.storage.readState()).products[0].productId,p.productId);assert.match(h.get('#rows').innerHTML,/Nome novo/);
});
test('manual UI: atalho abre Trends sem write; salvar atualiza badge, histórico e sinal sem fechar; voltar restaura',async()=>{
  const h=harness(),p=await h.storage.saveProduct({name:'Produto',countries:'US'});await h.refresh();
  h.clickRow('[data-analysis]',{analysis:'trends',id:p.productId});assert.equal(h.get('#offerSheet').classList.contains('hidden'),false);assert.equal((await h.storage.readState()).trends.length,0);
  h.get('#trendResults').select('stable');h.get('#saveSheetButton').onclick();await settle();
  assert.equal((await h.storage.readState()).trends.length,1);assert.match(h.get('#rows').innerHTML,/Estável/);assert.match(h.get('#trendsHistory').innerHTML,/Estável/);assert.match(h.get('#sheetMessage').textContent,/salva/);assert.equal(h.get('#offerSheet').classList.contains('hidden'),false);
  h.get('#closeSheet').onclick();assert.equal(h.get('#offerSheet').classList.contains('hidden'),true);assert.equal(h.restores(),1);
});
test('manual UI: falha mantém seleção pendente, não confirma sucesso e permite tentar novamente',async()=>{
  const h=harness(),p=await h.storage.saveProduct({name:'Produto'});await h.refresh();h.clickRow('[data-analysis]',{analysis:'trends',id:p.productId});h.failTrend();h.get('#trendResults').select('up');h.get('#saveSheetButton').onclick();await settle();
  assert.match(h.get('#sheetMessage').textContent,/Não foi possível/);assert.equal(h.get('#sheetMessage').classList.contains('error'),true);assert.equal(h.get('#saveSheetButton').disabled,false);assert.equal(h.get('#trendResults').selected,'up');assert.equal((await h.storage.readState()).trends.length,0);
});

test('manual UI: Imagens exige resultado antes de candidatas e autosalva classificações/remoções somente no cadastro ativo',async()=>{
  const h=harness(),a=await h.storage.saveProduct({name:'Mesmo nome',countries:'US'}),b=await h.storage.saveProduct({name:'Mesmo nome',countries:'US'});await h.refresh();
  h.clickRow('[data-analysis]',{analysis:'images',id:a.productId});assert.equal(h.get('#saveSheetButton').disabled,true);
  const input=h.imageInputs[0];input.value='outro produto';input.onkeydown({key:'Enter',preventDefault(){}});await settle();
  assert.match(h.get('#sheetMessage').textContent,/resultado visual/);assert.equal((await h.storage.readState()).images.length,0);
  h.imageActions[0].select('dominant');await settle();
  input.onkeydown({key:'Enter',preventDefault(){}});await settle();
  let state=await h.storage.readState();assert.deepEqual(state.images[0].assessments.at(-1).negativeKeywordCandidates,['outro produto']);assert.equal(state.images[0].assessments.length,2);
  h.candidates.get(h.imageLists[0]).onRemove('outro produto');await settle();
  state=await h.storage.readState();assert.deepEqual(state.images[0].assessments.at(-1).negativeKeywordCandidates,[]);assert.equal(state.images[0].assessments.length,3);assert.equal(state.images[0].productId,a.productId);
  assert.equal(Domain.productSnapshot(b,state).progress.done,0);assert.match(h.get('#imagesHistory').innerHTML,/outro produto/);
});
test('manual UI/build: componentes compartilhados, Esc e retorno explícito são conectados; conteúdo não é compartilhado',async()=>{
  const [html,css,page,storage,built]=await Promise.all(['src/curadoria/manual/index.html','src/curadoria/manual/manual.css','src/curadoria/manual/manual-page.mjs','src/curadoria/manual/manual-storage.mjs','dist/curadoria/manual/index.html'].map(read));
  assert.equal(publishedPage(html),built);for(const component of ['trends-sheet.css','analysis-sheet-bar.css','glimpse-embed-host.css','sheet-escape.mjs','table-headers.css?v=9','input-standard.css?v=1','white-button.css?v=6','data-hub-sidebar-active="manual"','hub-table-button-behavior','hub-curation-viewport'])assert.ok(html.includes(component),component);
  for(const flag of ['highlightOnCapture:false','restoreOnWindowReturn:false','suppressPulseOnPageHide:true'])assert.ok(page.includes(flag));
  assert.match(page,/origin:'manual',productKey:product.productId/);assert.match(page,/event.origin!==location.origin\|\|event.source!==frame.contentWindow/);
  assert.match(css,/\.surface\{border:0/);assert.match(css,/#offerSheet \.card\{background:var\(--panel\);border:0/);
  assert.doesNotMatch(storage,/radar-top-performance|radar-glimpse|\.clear\(|\.delete\(/);
  assert.doesNotMatch(html,/Colar coleta|Última coleta|Movimento|Histórico de coletas/);
});
