import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mountClickBankTopOffersView} from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs';

// DOM mínimo em memória: nenhuma base real, importação ou dependência de browser.
function fixture(offerId=null, preferences) {
  const document={createElement:()=>element(),addEventListener(){},removeEventListener(){}};
  function element(dataset={}) {
    const classes=new Set(),attributes=new Map();
    return {dataset,ownerDocument:document,children:[],value:'',innerHTML:'',textContent:'',listeners:{},style:{},hidden:false,disabled:false,
      classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,on){if(on??!classes.has(value))classes.add(value);else classes.delete(value);}},
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      setAttribute(name,value){attributes.set(name,String(value));},getAttribute(name){return attributes.get(name);},addEventListener(type,handler){this.listeners[type]=handler;},querySelector(){return element();},querySelectorAll(){return [];},
    };
  }
  const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  node('.tablewrap table').rows=[];
  node('[data-curation-columns]').querySelector=node;
  const tabs=['trends','glimpse','images','history'].map(tab=>element({tab}));
  const panels=['trends','glimpse','images','history'].map(panel=>element({panel}));
  const lists=['DE','US'].map(imageCandidateList=>element({imageCandidateList}));
  const resultButtons=['up','stable','down','point_peak','low_volume','no_data','inconclusive'].map(trendsResult=>element({trendsResult}));
  node('#trendResults').querySelectorAll=selector=>selector==='[data-trends-result]'?resultButtons:[];
  const sheet=node('#offerSheet');sheet.classList.add('hidden');
  sheet.querySelector=selector=>node(selector);
  sheet.querySelectorAll=selector=>selector==='[data-tab]'?tabs:selector==='[data-panel]'?panels:[];
  const root={querySelector:node,querySelectorAll:selector=>selector==='[data-image-candidate-list]'?lists:[]};
  const calls=[],actions={
    openGlimpse:item=>calls.push(['glimpse',item.offerKey]),saveImage:(...args)=>calls.push(['saveImage',...args]),
    saveTrend:async(...args)=>{calls.push(['saveTrend',...args]);return true;},
    openImagesExcluding:(...args)=>calls.push(['exclude',...args]),
  };
  const view=mountClickBankTopOffersView({root,actions,preferences});
  const state={captures:[{captureId:'capture',capturedAt:'2026-01-02T12:00:00Z',listName:'Top Offers',page:{total:1,completeUniverse:true},offers:[{offerKey:'offer',offerName:'Produto <teste>',seller:'EXAMPLE',rank:1,...(offerId?{offerId}:{})}]}],
    offerMetadata:[{offerKey:'offer',manualCountries:['DE','US']}],trends:[],
    images:[{offerKey:'offer',searchTerm:'Produto',assessments:[{assessmentId:'a',country:'DE',status:'mixed',capturedAt:'2026-01-02T13:00:00Z',negativeKeywordCandidates:['outra marca']}]}],glimpse:[]};
  view.render(state);
  const open=action=>node('#rows').listeners.click({target:{closest(selector){return selector==='[data-action]'?{dataset:{action,key:'offer'}}:null;}}});
  const clickTab=tab=>node('.tabs').listeners.click({target:{closest(){return {dataset:{tab}};}}});
  return {view,state,calls,sheet,node,tabs,panels,lists,resultButtons,actions,open,clickTab};
}

const hiddenKey='hub:clickbank-top-offers:hidden-offer-keys:v1';
function visibilityClick(f,key='offer') {
  let stopped=false;
  f.node('#rows').listeners.click({stopPropagation(){stopped=true;},target:{closest:selector=>selector==='[data-offer-visibility]'?{dataset:{offerVisibility:key}}:null}});
  return stopped;
}
function setVisibility(f,value){f.node('#visibilityFilter').value=value;f.node('#visibilityFilter').onchange();}

test('Ocultar/Reexibir usa o canto discreto da Oferta sem abrir ficha ou alterar capturas/decisões',()=>{
  const stored=new Map(),writes=[],preferences={getItem:key=>stored.get(key)??null,setItem(key,value){stored.set(key,value);writes.push([key,value]);}};
  const f=fixture(null,preferences),original=JSON.stringify(f.state);
  assert.match(f.node('#rows').innerHTML,/class="offer-name hub-edit-host"/);
  assert.match(f.node('#rows').innerHTML,/<button type="button" class="hub-corner-edit" data-offer-visibility="offer" aria-label="Ocultar Produto &lt;teste&gt;">Ocultar<\/button>/);
  assert.equal(writes.length,0,'montar/renderizar não grava preferências');
  assert.equal(visibilityClick(f),true);
  assert.equal(f.node('#rows').innerHTML,'');
  assert.deepEqual(writes,[[hiddenKey,'["offer"]']]);
  assert.equal(f.view.getActiveOfferKey(),'');
  assert.equal(f.sheet.classList.contains('hidden'),true);
  setVisibility(f,'hidden');
  assert.match(f.node('#rows').innerHTML,/>Reexibir<\/button>/);
  setVisibility(f,'all');
  assert.match(f.node('#rows').innerHTML,/data-offer="offer"/);
  visibilityClick(f);
  assert.deepEqual(writes.at(-1),[hiddenKey,'[]']);
  setVisibility(f,'visible');
  assert.match(f.node('#rows').innerHTML,/>Ocultar<\/button>/);
  assert.equal(JSON.stringify(f.state),original,'captura, metadados e análises permanecem intactos');
  assert.equal(f.node('#offerCount').textContent,'1','total na captura continua representando a fonte');
  assert.equal(f.calls.length,0,'ocultação não salva avaliação nem decisão');
});

test('ocultação persiste por offerKey entre capturas/reabertura e continua combinada à busca',()=>{
  const stored=new Map([[hiddenKey,'["offer"]']]),preferences={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  const f=fixture(null,preferences);
  assert.equal(f.node('#rows').innerHTML,'');
  f.state.captures.push({...f.state.captures[0],captureId:'older',capturedAt:'2026-01-01T12:00:00Z'});
  f.view.render(f.state);f.view.selectCapture('older');
  assert.equal(f.node('#rows').innerHTML,'','mesma oferta continua oculta em outra captura');
  setVisibility(f,'hidden');
  assert.match(f.node('#rows').innerHTML,/>Reexibir<\/button>/);
  f.node('#search').value='não corresponde';f.node('#search').oninput();
  assert.equal(f.node('#rows').innerHTML,'');
  f.node('#search').value='<teste>';f.node('#search').oninput();
  assert.match(f.node('#rows').innerHTML,/data-offer="offer"/);
  assert.equal(fixture(null,preferences).node('#rows').innerHTML,'','nova montagem restaura a preferência');
  visibilityClick(f,'unknown');
  assert.equal(stored.get(hiddenKey),'["offer"]','chave não presente na captura não grava');
});

test('preferência indisponível ou inválida mantém ocultação segura na sessão com aviso',()=>{
  const f=fixture(null,{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}});
  assert.match(f.node('#rows').innerHTML,/>Ocultar<\/button>/);
  visibilityClick(f);
  assert.equal(f.node('#rows').innerHTML,'');
  assert.match(f.node('#message').textContent,/nesta sessão/);
  setVisibility(f,'hidden');visibilityClick(f);setVisibility(f,'visible');
  assert.match(f.node('#rows').innerHTML,/>Ocultar<\/button>/);
  for(const raw of ['invalid','{}','[null,42,{}]']){
    const clean=fixture(null,{getItem:key=>key===hiddenKey?raw:null});
    assert.match(clean.node('#rows').innerHTML,/>Ocultar<\/button>/);
  }
});

test('Resultado de Trends fica pendente até Salvar e só então confirma a gravação',async()=>{
  const f=fixture();f.open('trends');
  const save=f.node('#saveSheetButton'),selected=f.resultButtons.find(button=>button.dataset.trendsResult==='up');
  assert.equal(save.disabled,false,'Salvar permanece ativo mesmo antes de alterar o resultado');
  selected.onclick();
  assert.equal(f.calls.length,0,'escolher o resultado não grava automaticamente');
  assert.equal(save.disabled,false);
  assert.match(f.node('#trendMessage').textContent,/Clique em Salvar/);
  await save.onclick();
  assert.equal(f.calls.filter(call=>call[0]==='saveTrend').length,1);
  assert.equal(f.calls.find(call=>call[0]==='saveTrend')[2],'up');
  assert.equal(save.disabled,false,'Salvar continua ativo depois de gravar');
  assert.match(f.node('#sheetMessage').textContent,/salva/);
});

test('Salvar ativo orienta a escolher um resultado se a oferta ainda não tiver avaliação',async()=>{
  const f=fixture();f.open('trends');
  const save=f.node('#saveSheetButton');
  assert.equal(save.disabled,false);
  await save.onclick();
  assert.equal(f.calls.filter(call=>call[0]==='saveTrend').length,0,'não grava uma avaliação sem resultado');
  assert.match(f.node('#trendMessage').textContent,/Selecione um resultado/);
});

test('Salvar reutiliza o resultado atual quando a oferta já tem uma avaliação',async()=>{
  const f=fixture();
  f.state.trends=[{offerKey:'offer',assessments:[{assessmentId:'saved',status:'stable',countries:[],productAge:'old',searchTerm:'busca existente',capturedAt:'2026-01-02T13:00:00Z'}]}];
  f.view.render(f.state);f.open('trends');
  const save=f.node('#saveSheetButton');
  assert.equal(save.disabled,false);
  await save.onclick();
  assert.equal(f.calls.filter(call=>call[0]==='saveTrend').length,1);
  const saved=f.calls.find(call=>call[0]==='saveTrend');
  assert.equal(saved[2],'stable','usa o último resultado selecionado');
  assert.equal(saved[3].term,'busca existente');
});

test('falha ao salvar mantém o resultado pendente para nova tentativa',async()=>{
  const f=fixture();f.open('trends');
  f.actions.saveTrend=async()=>false;
  f.resultButtons.find(button=>button.dataset.trendsResult==='stable').onclick();
  const save=f.node('#saveSheetButton');
  await save.onclick();
  assert.equal(save.disabled,false,'a seleção pendente continua disponível para tentar novamente');
  assert.match(f.node('#trendMessage').textContent,/Não foi possível salvar/);
  assert.equal(f.node('#trendMessage').classList.contains('error'),true);
});

test('Offer ID torna a posição # clicável e mostra Abrir oferta abaixo de Países; captura antiga não inventa link',()=>{
  const current=fixture('ENREV');current.open('trends');
  assert.match(current.node('#rows').innerHTML,/clickbank-rank-link[^>]*>#1<\/a>/);
  assert.equal(current.node('#openClickBankOffer').href,'https://accounts.clickbank.com/master/dashboard/affiliate-marketplace#/offer-details?offer=ENREV&clickUrl=undefined');
  assert.equal(current.node('#openClickBankOffer').classList.contains('hidden'),false);
  assert.equal(current.node('#clickBankOfferUnavailable').classList.contains('hidden'),true);
  const legacy=fixture();legacy.open('trends');
  assert.match(legacy.node('#rows').innerHTML,/>#1<\/td>/);
  assert.doesNotMatch(legacy.node('#rows').innerHTML,/clickbank-rank-link/);
  assert.equal(legacy.node('#openClickBankOffer').classList.contains('hidden'),true);
  assert.equal(legacy.node('#clickBankOfferUnavailable').classList.contains('hidden'),false);
});

test('total de resultados vai para a faixa de filtros e não reserva a linha descritiva removida',()=>{
  const f=fixture('ENREV'),count=f.node('#captureResultCount');
  f.state.captures[0].page.total=1251;
  f.view.render(f.state);
  assert.equal(count.textContent,'1.251 resultados · Lista completa');
  assert.equal(count.hidden,false);
  f.state.captures[0].page.total=null;
  f.state.captures[0].page.completeUniverse=false;
  f.view.render(f.state);
  assert.equal(count.textContent,'');
  assert.equal(count.hidden,true);
});

test('a lista extrai nomes atuais e futuros, busca o título original e preserva captura e chaves',()=>{
  const f=fixture();
  const offer=f.state.captures[0].offers[0];
  offer.offerName='NEW : Aurora <Power> System - Conversions Monster !';
  const original=JSON.stringify(f.state);
  f.view.render(f.state);
  const rows=f.node('#rows');
  assert.match(rows.innerHTML, /class="offer-name hub-edit-host" title="NEW : Aurora &lt;Power&gt; System - Conversions Monster !"><span>Aurora &lt;Power&gt; System<\/span>/);
  assert.match(rows.innerHTML, /data-offer="offer"/);
  f.node('#search').value='conversions monster';
  f.node('#search').oninput();
  assert.match(rows.innerHTML, /Aurora &lt;Power&gt; System<\/span>/, 'o slogan original continua pesquisável');
  f.node('#search').value='aurora <power> system';
  f.node('#search').oninput();
  assert.match(rows.innerHTML, /data-offer="offer"/);
  assert.equal(JSON.stringify(f.state),original);
  assert.equal(f.calls.length,0,'a apresentação não grava nem migra registros');
  const next={...offer,offerKey:'future-offer',offerName:'NEW : FutureCore - $9 EPC',rank:2};
  f.state.captures[0].offers.push(next);
  f.node('#search').value='';
  f.view.render(f.state);
  assert.match(rows.innerHTML, /data-offer="future-offer"/);
  assert.match(rows.innerHTML, />FutureCore<\/span>/, 'novas entradas usam a mesma extração');
});

test('extensão preenche e abre o diálogo existente; repetição não reabre e cancelar não grava',()=>{
  const f=fixture(),dialog=f.node('#importDialog'),paste=f.node('#pasteArea');
  let opened=0,focused=0;
  dialog.showModal=()=>{opened++;dialog.open=true;};
  dialog.close=()=>{dialog.open=false;};
  paste.focus=()=>focused++;
  const original=JSON.stringify(f.state);
  f.view.prepareImport('Texto recebido da extensão');
  assert.equal(paste.value,'Texto recebido da extensão');assert.equal(dialog.open,true);
  assert.equal(opened,1);assert.equal(focused,1);
  f.view.prepareImport('Texto recebido da extensão');
  assert.equal(opened,1);assert.equal(focused,2);
  f.view.closeImport();assert.equal(dialog.open,false);
  assert.equal(JSON.stringify(f.state),original);
  assert.equal(f.calls.length,0);
});

test('CB abre Glimpse/Imagens diretamente, muda abas e conclui sem gravar',()=>{
  const f=fixture(),initial=JSON.stringify(f.state);
  f.open('glimpse');
  assert.equal(f.node('#saveSheetButton').hidden,false,'Salvar continua na mesma barra também no Glimpse');
  assert.equal(f.node('#saveSheetButton').disabled,false,'o botão compartilhado aciona o salvamento do Glimpse nessa aba');
  assert.equal(f.sheet.classList.contains('hidden'),false);
  assert.equal(f.tabs.find(tab=>tab.classList.contains('active')).dataset.tab,'glimpse');
  assert.equal(f.panels.find(panel=>!panel.classList.contains('hidden')).dataset.panel,'glimpse');
  assert.deepEqual(f.calls,[['glimpse','offer']]);
  f.view.returnFromGlimpse();
  assert.equal(f.tabs.find(tab=>tab.classList.contains('active')).dataset.tab,'trends');
  f.node('#closeSheet').onclick();
  assert.equal(f.sheet.classList.contains('hidden'),true);
  f.open('images');
  assert.equal(f.tabs.find(tab=>tab.classList.contains('active')).dataset.tab,'images');
  assert.equal(f.node('#imagesMessage').textContent,'1 de 2 países verificados.');
  assert.match(f.node('#imageCountries').innerHTML,/Manual/);
  assert.match(f.node('#imageCountries').innerHTML,/data-image-search="DE"/);
  assert.match(f.node('#imageCountries').innerHTML,/data-image-candidate-input="US"/);
  assert.equal(f.node('#allImagesHistory').innerHTML,f.node('#imagesHistory').innerHTML);
  f.clickTab('history');
  assert.equal(f.tabs.find(tab=>tab.classList.contains('active')).dataset.tab,'history');
  assert.match(f.node('#allImagesHistory').innerHTML,/Mista/);
  f.clickTab('images');
  assert.equal(f.node('#saveSheetButton').hidden,false,'Salvar permanece visível na aba Imagens');
  assert.equal(f.node('#saveSheetButton').disabled,true,'Imagens grava cada ação automaticamente, sem um salvamento manual pendente');
  assert.match(f.node('#saveSheetButton').title,/automaticamente/);
  f.clickTab('history');
  assert.equal(f.node('#saveSheetButton').disabled,true,'o histórico mantém a ação comum desativada por ser somente leitura');
  assert.match(f.node('#saveSheetButton').title,/somente leitura/);
  f.node('#closeSheet').onclick();
  assert.equal(f.sheet.classList.contains('hidden'),true);
  assert.equal(JSON.stringify(f.state),initial,'navegação não modifica entradas');
  assert.equal(f.calls.filter(call=>call[0]==='saveImage').length,0);
});

test('CB mostra erros na ficha e mantém X/busca coletiva das negativas salvas',()=>{
  const f=fixture();f.open('images');
  f.view.showMessage('Selecione um resultado visual.',{error:true});
  assert.equal(f.node('#sheetMessage').textContent,'Selecione um resultado visual.');
  assert.equal(f.node('#sheetMessage').classList.contains('error'),true);
  const [items,searchAll]=f.lists[0].children;
  assert.equal(items.children[0].children[1].textContent,'×');
  searchAll.onclick({preventDefault(){},stopPropagation(){}});
  assert.deepEqual(f.calls.at(-1),['exclude','Produto','DE',['outra marca']]);
  items.children[0].children[1].onclick({preventDefault(){},stopPropagation(){}});
  assert.deepEqual(f.calls.at(-1),['saveImage','offer','DE','mixed',[],{candidateOnly:true}]);
});

test('CB sem país mostra ausência e não inventa cartões/classificação',()=>{
  const f=fixture();f.state.offerMetadata=[];f.state.images=[];f.view.render(f.state);f.open('images');
  assert.match(f.node('#imagesMessage').textContent,/Adicione países manualmente/);
  assert.doesNotMatch(f.node('#imageCountries').innerHTML,/data-image-search/);
  assert.equal(f.calls.length,0);
});

test('Quiz pode ser classificado manualmente e aparece na ficha e na coluna PAG.',()=>{
  const f=fixture();
  f.state.offerMetadata[0].salesPageType='quiz';
  f.view.render(f.state);
  f.open('trends');
  assert.match(f.node('#salesPageTypeActions').innerHTML,/data-sales-page-type="quiz" aria-pressed="true">QUIZ/);
  assert.match(f.node('#rows').innerHTML,/<td class="page-type-cell">QUIZ<\/td>/);
});
