import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import {saveCopySelection, loadCopySelection} from '../src/google-ads/google-ads-copy-selection-storage.mjs';

const source = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');
const selectionCode = source.slice(source.indexOf('  function selectedAssets(kind)'), source.indexOf('  function showCopyTextEditor('));
const sitelinkCode = source.slice(source.indexOf('  function sitelinksFromParsedCopy()'), source.indexOf('  function pendingCampaignSitelinks()'));

function fixture() {
  const data = new Map();
  const parsed = () => ({headlines:[{id:'headline-0',kind:'headline',text:'Título',limit:30}],descriptions:[{id:'description-0',kind:'description',text:'Descrição',limit:90}],sitelinks:[{id:'sitelink-0',title:{text:'Link'},descriptions:[{text:'Um'},{text:'Dois'}]},{id:'sitelink-1',title:{text:'Outro'},descriptions:[{text:'Três'},{text:'Quatro'}]}]});
  const context = vm.createContext({saveCopySelection,loadCopySelection,window:{localStorage:{getItem:key=>data.get(key) ?? null,setItem:(key,value)=>data.set(key,value)}},copyImportInput:{value:'copy sintética'},activeDraftId:'draft-1',campaignDeliveryQueryId:'',activeCampaignBatchId:'batch-1',copyImportMode:'campaign',copyImportStorageError:'',parsedCopy:parsed(),selectedCopyAssets:new Set(['headline-0','description-0']),selectedCopySitelinks:new Map([['sitelink-1',1]]),sitelinksSelectionTouched:true,selectedPromotion:false});
  vm.runInContext(selectionCode + sitelinkCode + ';this.save=persistCopySelection;this.restore=restoreCopySelection;this.limits=selectedCopyLimitMessage;this.links=sitelinksFromParsedCopy;this.sitelinkCount=selectedCopySitelinkCount;', context);
  return {context,parsed};
}

test('escolhas e edições são recuperadas para a mesma copy e rascunho', () => {
  const {context,parsed}=fixture();
  context.parsedCopy.headlines[0].text='Título editado';
  context.save();
  context.parsedCopy=parsed(); context.selectedCopyAssets=new Set(); context.selectedCopySitelinks=new Map();
  assert.equal(context.restore(),true);
  assert.equal(context.parsedCopy.headlines[0].text,'Título editado');
  assert.deepEqual(Array.from(context.selectedCopyAssets),['headline-0','description-0']);
  assert.deepEqual(Array.from(context.selectedCopySitelinks.entries(),entry=>Array.from(entry)),[['sitelink-1',1]]);
  context.activeDraftId='draft-2';
  assert.equal(context.restore(),false);
  context.activeDraftId='draft-1'; context.copyImportInput.value='outra copy';
  assert.equal(context.restore(),false);
});

test('sitelinks selecionados são preparados e pendências de tamanho são explicadas', () => {
  const {context}=fixture();
  assert.deepEqual(Array.from(context.links().sitelinks,link=>link.title),['Outro']);
  context.sitelinksSelectionTouched=false;
  assert.equal(context.links().sitelinks.length,0);
  context.parsedCopy.headlines[0].text='x'.repeat(31);
  assert.match(context.limits(),/título 1 \(31\/30\)/);
  context.parsedCopy.headlines[0].text='x'.repeat(30);
  assert.equal(context.limits(),'');
});

test('contador mostra sitelinks efetivamente selecionados até o limite de seis', () => {
  const {context}=fixture();
  assert.equal(context.sitelinkCount(),1);
  context.sitelinksSelectionTouched=false;
  assert.equal(context.sitelinkCount(),0);
  context.parsedCopy.sitelinks=Array.from({length:8},(_,index)=>({
    id:'sitelink-'+index,
    title:{text:'Link '+index,limit:25},
    descriptions:[{text:'Descrição '+index},{text:'Detalhe '+index}],
  }));
  context.sitelinksSelectionTouched=true;
  context.selectedCopySitelinks=new Map(Array.from({length:8},(_,index)=>['sitelink-'+index,index+1]));
  assert.equal(context.sitelinkCount(),6);
  context.copyImportMode='batch-sitelinks';
  context.selectedCopySitelinks=new Map([['sitelink-0',1],['sitelink-1',2],['sitelink-2',3]]);
  assert.equal(context.sitelinkCount(),3);
});

test('resumo de importação apresenta a quarta cápsula de sitelinks e a oculta no modo dedicado', () => {
  assert.match(source, /<span data-copy-import-sitelinks-count hidden>0\/6 sitelinks<\/span>/);
  const start=source.indexOf('  function renderCopyImportResults() {');
  const end=source.indexOf('  function organizeCopyImportInput()',start);
  const renderer=source.slice(start,end);
  assert.match(renderer,/sitelinksCountIndicator\.textContent = sitelinksCount \+ '\/6 sitelinks'/);
  assert.match(renderer,/sitelinksCountIndicator\.hidden = batchSitelinksMode/);
  assert.match(renderer,/sitelinksCountIndicator\.classList\.toggle\('is-complete', !batchSitelinksMode && sitelinksCount === 6\)/);
});

test('promoção única é pré-selecionada em nova importação, sem substituir escolha salva ou modo de sitelinks', () => {
  assert.match(source, /if \(!restoredSelection && copyImportMode !== 'batch-sitelinks' && parsedCopy\.promotion\) selectedPromotion = true;/);
});
