import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mountClickBankTopOffersView} from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs';

// DOM mínimo em memória: nenhuma base real, importação ou dependência de browser.
function fixture() {
  const document={createElement:()=>element()};
  function element(dataset={}) {
    const classes=new Set();
    return {dataset,ownerDocument:document,children:[],value:'',innerHTML:'',textContent:'',listeners:{},
      classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,on){if(on??!classes.has(value))classes.add(value);else classes.delete(value);}},
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      setAttribute(){},addEventListener(type,handler){this.listeners[type]=handler;},querySelectorAll(){return [];},
    };
  }
  const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  const tabs=['trends','glimpse','images','history'].map(tab=>element({tab}));
  const panels=['trends','glimpse','images','history'].map(panel=>element({panel}));
  const lists=['DE','US'].map(imageCandidateList=>element({imageCandidateList}));
  const sheet=node('#offerSheet');sheet.classList.add('hidden');
  sheet.querySelector=selector=>node(selector);
  sheet.querySelectorAll=selector=>selector==='[data-tab]'?tabs:selector==='[data-panel]'?panels:[];
  const root={querySelector:node,querySelectorAll:selector=>selector==='[data-image-candidate-list]'?lists:[]};
  const calls=[];
  const view=mountClickBankTopOffersView({root,actions:{
    openGlimpse:item=>calls.push(['glimpse',item.offerKey]),saveImage:(...args)=>calls.push(['saveImage',...args]),
    openImagesExcluding:(...args)=>calls.push(['exclude',...args]),
  }});
  const state={captures:[{captureId:'capture',capturedAt:'2026-01-02T12:00:00Z',listName:'Top Offers',page:{total:1,completeUniverse:true},offers:[{offerKey:'offer',offerName:'Produto <teste>',seller:'EXAMPLE',rank:1}]}],
    offerMetadata:[{offerKey:'offer',manualCountries:['DE','US']}],trends:[],
    images:[{offerKey:'offer',searchTerm:'Produto',assessments:[{assessmentId:'a',country:'DE',status:'mixed',capturedAt:'2026-01-02T13:00:00Z',negativeKeywordCandidates:['outra marca']}]}],glimpse:[]};
  view.render(state);
  const open=action=>node('#rows').listeners.click({target:{closest(selector){return selector==='[data-action]'?{dataset:{action,key:'offer'}}:null;}}});
  const clickTab=tab=>node('.tabs').listeners.click({target:{closest(){return {dataset:{tab}};}}});
  return {view,state,calls,sheet,node,tabs,panels,lists,open,clickTab};
}

test('CB abre Glimpse/Imagens diretamente, muda abas e conclui sem gravar',()=>{
  const f=fixture(),initial=JSON.stringify(f.state);
  f.open('glimpse');
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
  f.clickTab('images');f.node('#finishImages').onclick();
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
