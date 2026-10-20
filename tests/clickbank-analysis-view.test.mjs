import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
  const brandButtons=['brand_bidding','no_brand_bidding',''].map(brandBidding=>element({brandBidding}));
  const sortButtons=[element({sort:'decision'})];
  node('#trendResults').querySelectorAll=selector=>selector==='[data-trends-result]'?resultButtons:[];
  const sheet=node('#offerSheet');sheet.classList.add('hidden');
  sheet.querySelector=selector=>node(selector);
  sheet.querySelectorAll=selector=>selector==='[data-tab]'?tabs:selector==='[data-panel]'?panels:[];
  const root={querySelector:selector=>selector==='#trendResults [data-trends-result].selected'?resultButtons.find(button=>button.classList.contains('selected'))||null:node(selector),querySelectorAll:selector=>selector==='[data-sort]'?sortButtons:selector==='[data-image-candidate-list]'?lists:selector==='[data-brand-bidding]'?brandButtons:selector.startsWith('[data-brand-bidding],')?[...brandButtons,node('#manualCountry'),node('#addManualCountry')]:[]};
  const trendsScope=node('[data-panel="trends"]');trendsScope.querySelector=node;
  trendsScope.querySelectorAll=selector=>selector.includes('data-trends-result')?resultButtons.filter(button=>!selector.includes('.selected')||button.classList.contains('selected')):[];
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
  return {view,state,calls,sheet,node,tabs,panels,lists,resultButtons,brandButtons,sortButtons,actions,open,clickTab};
}

const hiddenKey='hub:clickbank-top-offers:hidden-offer-keys:v1';

test('a coluna Decisão alterna ordenação alfabética crescente/decrescente pelo status exibido',()=>{
  const f=fixture();
  f.state.captures[0].offers.push(
    {offerKey:'live',offerName:'Campanha no ar',seller:'EXAMPLE',rank:2},
    {offerKey:'review',offerName:'Revisar',seller:'EXAMPLE',rank:3},
    {offerKey:'hidden',offerName:'Ocultar',seller:'EXAMPLE',rank:4},
    {offerKey:'launch',offerName:'Subir campanha',seller:'EXAMPLE',rank:5},
  );
  f.state.decisions=[
    {offerKey:'live',currentStatus:'Campanha no ar'},
    {offerKey:'review',currentStatus:'Revisar'},
    {offerKey:'hidden',currentStatus:'Ocultar'},
    {offerKey:'launch',currentStatus:'Subir campanha'},
  ];
  f.view.render(f.state);
  const sort=f.sortButtons[0];
  assert.equal(sort.getAttribute('aria-sort'),'none');
  const renderedKeys=()=>[...f.node('#rows').innerHTML.matchAll(/<tr data-offer="([^"]+)"/g)].map(match=>match[1]);
  sort.onclick();
  assert.equal(sort.getAttribute('aria-sort'),'descending');
  assert.deepEqual(renderedKeys(),['launch','review','hidden','offer','live'],'a ausência entra no status padrão “Não definido”');
  sort.onclick();
  assert.equal(sort.getAttribute('aria-sort'),'ascending');
  assert.deepEqual(renderedKeys(),['live','offer','hidden','review','launch']);
});

test('brand confirmation stays only in the header; other messages and errors remain visible in the sheet',()=>{
  const f=fixture();f.open('trends');
  f.view.showMessage('Uma confirmação anterior.');
  f.view.showMessage('Classificação salva: No brand bidding.',{headerOnly:true});
  assert.equal(f.node('#sheetMessage').textContent,'','success does not add a line or move the cards');
  assert.equal(f.node('#message').textContent,'Uma confirmação anterior.','the list message is untouched');
  f.view.showMessage('Não foi possível salvar.',{headerOnly:true,error:true});
  assert.equal(f.node('#sheetMessage').textContent,'Não foi possível salvar.');
  assert.equal(f.node('#sheetMessage').classList.contains('error'),true);
  f.view.showMessage('Outro recurso salvo.');
  assert.equal(f.node('#sheetMessage').textContent,'Outro recurso salvo.','only the targeted confirmation is removed');
});

test('ClickBank Trends history shows only date/time and restores a prior term without searching',()=>{
  const f=fixture();
  f.state.trends=[{offerKey:'offer',assessments:[],keywordCandidates:[],searchHistory:[
    {searchedAt:'2026-01-02T10:05:00.000Z',term:'older search term'},
    {searchedAt:'2026-01-03T11:15:00.000Z',term:'newest search term'},
  ]}];
  f.view.render(f.state);
  f.open('trends');
  const history=f.node('#trendSearchHistory');
  assert.equal(history.disabled,false);
  assert.equal(history.value,'0','a busca mais recente fica selecionada');
  assert.match(history.innerHTML,/2026|03\/01\/26|03\/01\/2026/,'as opções apresentam data e horário');
  assert.doesNotMatch(history.innerHTML,/older search term|newest search term|Termo|Última busca/,'nenhum termo ou descrição extra aparece no combo');
  history.value='1';history.onchange();
  assert.equal(f.node('#trendsTerm').value,'older search term','selecionar o histórico apenas recupera o termo no campo');
  assert.equal(f.calls.length,0,'selecionar uma entrada não abre uma pesquisa');
});

test('ClickBank Trends history selector is positioned beside the candidate input and tracks both search actions',async()=>{
  const [page,controller,view]=await Promise.all([
    readFile(new URL('../src/curadoria/clickbank-top-offers/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs',import.meta.url),'utf8'),
  ]);
  const candidate=page.indexOf('id="trendCandidate"'),history=page.indexOf('id="trendSearchHistory"');
  assert.ok(candidate>=0&&history>candidate,'o histórico fica à direita do campo de candidata na mesma faixa');
  assert.match(controller,/async function openTrends\(term\)[\s\S]*?window\.open\(Trends\.exploreUrl\(searchedTerm\)[\s\S]*?Storage\.setTrendSearchTimestamp\(baseRecord\(item\),searchedAt,searchedTerm\)/,'a busca registra o histórico somente depois de abrir a aba do Google Trends');
  assert.match(view,/onSearch:term=>actions\.openTrends\(term\)/,'os botões de candidatas usam o mesmo registro da pesquisa principal');
});

test('Brand bidding stays pending and is committed only by Save with the current Trends draft',async()=>{
  const f=fixture();f.open('trends');
  assert.match(f.node('#brandBiddingActions').innerHTML,/data-brand-bidding="" aria-pressed="true">Não definido/);
  f.node('#trendsTerm').value='Edited pending term';
  f.actions.saveTrend=async(key,status,draft)=>{
    f.calls.push(['saveTrend',key,status,draft]);
    assert.equal(key,'offer');assert.equal(draft.term,'Edited pending term');
    assert.equal(draft.metadataPatch.brandBidding,'no_brand_bidding');
    f.state.offerMetadata[0].brandBidding=draft.metadataPatch.brandBidding;f.view.render(f.state);return true;
  };
  await f.brandButtons[1].onclick();
  assert.equal(f.calls.length,0);
  assert.equal(f.sheet.classList.contains('hidden'),false);
  assert.match(f.node('#trendMessage').textContent,/pendentes/);
  await f.node('#saveSheetButton').listeners.click();
  assert.equal(f.calls.length,1);
  f.node('#closeSheet').onclick();f.open('trends');
  assert.match(f.node('#brandBiddingActions').innerHTML,/data-brand-bidding="no_brand_bidding" aria-pressed="true"/);
});

test('failed manual Save retains the pending brand selection and permits retry',async()=>{
  const f=fixture();f.open('trends');
  f.actions.saveTrend=async()=>false;
  await f.brandButtons[0].onclick();
  await f.node('#saveSheetButton').listeners.click();
  assert.match(f.node('#trendMessage').textContent,/Não foi possível salvar/);
  assert.equal(f.state.offerMetadata[0].brandBidding,undefined);
  assert.match(f.node('#brandBiddingActions').innerHTML,/data-brand-bidding="" aria-pressed="true"/);
  assert.ok(f.brandButtons.every(button=>!button.disabled));
  assert.equal(f.sheet.classList.contains('hidden'),false);
});

test('preview replaces source total with the supplied new-product count, including zero',()=>{
  const f=fixture(),parsed={parsedCount:50,page:{total:1238,start:51,end:100},issues:[],valid:true};
  for(const newProductCount of [50,7,0]){
    f.view.showImportPreview({parsed,newProductCount});
    assert.match(f.node('#previewMetrics').innerHTML,new RegExp('Produtos novos detectados</span><b>'+newProductCount+'</b>'));
    assert.doesNotMatch(f.node('#previewMetrics').innerHTML,/Resultados na fonte|1238/);
    assert.match(f.node('#previewMetrics').innerHTML,/51–100/);
    assert.match(f.node('#previewStatus').textContent,/Captura parcial/);
    assert.equal(f.node('#confirmImport').disabled,false);
    assert.equal(f.calls.length,0,'rendering a preview does not save');
  }
  f.view.showImportPreview({parsed});
  assert.match(f.node('#previewMetrics').innerHTML,/Produtos novos detectados<\/span><b>—<\/b>/,'unknown count is not a fabricated zero');
});

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

test('Resultado de Trends fica pendente até Salvar, mantém ficha aberta e não duplica',async()=>{
  const f=fixture();f.open('trends');
  const save=f.node('#saveSheetButton'),selected=f.resultButtons.find(button=>button.dataset.trendsResult==='up');
  assert.equal(save.disabled,false);await selected.onclick();
  assert.equal(f.calls.length,0);assert.match(f.node('#trendMessage').textContent,/pendentes/);
  await save.listeners.click();
  assert.equal(f.calls.filter(call=>call[0]==='saveTrend').length,1);
  assert.equal(f.calls.find(call=>call[0]==='saveTrend')[2],'up');
  assert.equal(f.sheet.classList.contains('hidden'),false);
  assert.match(f.node('#trendMessage').textContent,/salva/);
  await save.listeners.click();
  assert.equal(f.calls.filter(call=>call[0]==='saveTrend').length,1,'mesma avaliação não é salva novamente');
  assert.equal(save.disabled,false);
});

test('Salvar antes de escolher resultado persiste um rascunho sem classificação artificial',async()=>{
  const f=fixture();f.open('trends');const save=f.node('#saveSheetButton');
  assert.equal(save.disabled,false);await save.listeners.click();
  const call=f.calls.find(call=>call[0]==='saveTrend');assert.equal(call[2],'');
  assert.equal(call[3].term,'Produto <teste>');assert.match(f.node('#trendMessage').textContent,/Rascunho/);
});

test('Salvar reutiliza o resultado atual quando a oferta já tem uma avaliação',async()=>{
  const f=fixture();
  f.state.trends=[{offerKey:'offer',assessments:[{assessmentId:'saved',status:'stable',countries:[],productAge:'old',searchTerm:'busca existente',capturedAt:'2026-01-02T13:00:00Z'}]}];
  f.view.render(f.state);f.open('trends');
  const save=f.node('#saveSheetButton');
  assert.equal(save.disabled,false);
  f.node('#trendsTerm').value='busca editada';await save.listeners.click();
  assert.equal(f.calls.filter(call=>call[0]==='saveTrend').length,1);
  const saved=f.calls.find(call=>call[0]==='saveTrend');
  assert.equal(saved[2],'stable','usa o último resultado selecionado');
  assert.equal(saved[3].term,'busca editada');
});

test('falha ao salvar mantém o resultado pendente para nova tentativa',async()=>{
  const f=fixture();f.open('trends');
  f.actions.saveTrend=async()=>false;
  await f.resultButtons.find(button=>button.dataset.trendsResult==='stable').onclick();
  const save=f.node('#saveSheetButton');
  await save.listeners.click();
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
  f.view.selectCapture('capture');
  assert.equal(count.textContent,'1.251 resultados · Lista completa');
  assert.equal(count.hidden,false);
  f.state.captures[0].page.total=null;
  f.state.captures[0].page.completeUniverse=false;
  f.view.render(f.state);
  assert.equal(count.textContent,'');
  assert.equal(count.hidden,true);
});

test('Todas as capturas reúne faixas sem duplicar, mantém busca/ocultação/ficha e não grava dados',()=>{
  const writes=[],f=fixture(null,{getItem:()=>null,setItem:(...args)=>writes.push(args)});
  const offer=f.state.captures[0].offers[0];
  f.state.captures=[
    {...f.state.captures[0],captureId:'page2',capturedAt:'2026-01-04T12:00:00Z',page:{start:51,end:100,total:1000},offers:[{...offer,offerKey:'second',offerName:'Second Product',rank:51}]},
    {...f.state.captures[0],captureId:'recent',capturedAt:'2026-01-03T12:00:00Z',offers:[{...offer,rank:1}]},
    {...f.state.captures[0],captureId:'old',capturedAt:'2026-01-01T12:00:00Z',offers:[{...offer,rank:5}]},
  ];
  const original=JSON.stringify(f.state);f.view.render(f.state);
  assert.equal(f.node('#captureSelect').value,'__all__');
  assert.match(f.node('#captureSelect').innerHTML,/Todas as capturas · 2 ofertas únicas/);
  assert.equal(f.node('#captureSelect').disabled,false);
  assert.equal(f.node('#offerCountLabel').textContent,'Ofertas no histórico');
  assert.equal(f.node('#offerCount').textContent,'2');
  assert.equal(f.node('#movementCount').textContent,'1');
  assert.equal((f.node('#rows').innerHTML.match(/data-offer="offer"/g)||[]).length,1);
  assert.match(f.node('#rows').innerHTML,/↑ 4/);
  assert.match(f.node('#rows').innerHTML,/Duas últimas aparições: #5 em .* → #1 em /);
  assert.match(f.node('#rows').innerHTML,/Nova/);
  assert.equal(f.node('#captureResultCount').textContent,'Últimas posições observadas');
  f.node('#search').value='<teste>';f.node('#search').oninput();
  assert.match(f.node('#rows').innerHTML,/data-offer="offer"/);
  assert.doesNotMatch(f.node('#rows').innerHTML,/data-offer="second"/);
  f.open('images');assert.equal(f.view.getActiveOfferKey(),'offer','atalho de faixa anterior continua abrindo a ficha');
  f.node('#closeSheet').onclick();
  f.node('#search').value='';f.node('#search').oninput();
  assert.equal(writes.length,0,'seleção, busca, render e navegação não escrevem');
  assert.equal(JSON.stringify(f.state),original);
  visibilityClick(f);assert.doesNotMatch(f.node('#rows').innerHTML,/data-offer="offer"/);
  setVisibility(f,'hidden');assert.match(f.node('#rows').innerHTML,/data-offer="offer"/);
  assert.equal(writes.length,1,'somente Ocultar salva a preferência explícita');
  assert.equal(JSON.stringify(f.state),original);
});

test('modo consolidado continua selecionado após captura nova; seleção individual continua disponível',()=>{
  const f=fixture(),select=f.node('#captureSelect');
  assert.equal(select.value,'__all__');assert.equal(select.disabled,false,'até uma captura pode alternar para visão individual');
  f.view.selectCapture('capture',{preserveAll:true});assert.equal(select.value,'__all__');
  select.onchange({target:{value:'capture'}});
  assert.equal(select.value,'capture');
  assert.equal(f.node('#offerCountLabel').textContent,'Ofertas na captura');
  assert.equal(f.node('#captureResultCount').textContent,'1 resultados · Lista completa');
  const next={...f.state.captures[0],captureId:'next',capturedAt:'2026-01-04T12:00:00Z'};
  f.state.captures.push(next);f.view.render(f.state);
  assert.equal(select.value,'capture','atualizar análises não muda seleção histórica');
  f.view.selectCapture('next',{preserveAll:true});assert.equal(select.value,'next','salvar captura em modo individual seleciona a nova');
  select.onchange({target:{value:'__all__'}});
  assert.match(f.node('#rows').innerHTML,/= 0/);assert.equal(f.node('#offerCount').textContent,'1');
  f.view.render({captures:[]});
  assert.equal(select.value,'__all__');assert.equal(select.disabled,true);
  assert.equal(f.node('#offerCount').textContent,'0');assert.equal(f.node('#rows').innerHTML,'');
  assert.match(f.node('#empty').textContent,/primeira captura/);
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
