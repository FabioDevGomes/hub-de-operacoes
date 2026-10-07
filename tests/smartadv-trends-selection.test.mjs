import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as Trends from '../src/curadoria/trends-domain.mjs';
import {mountSmartAdvOffersView} from '../src/curadoria/smartadv-offers/smartadv-offers-view.mjs';

// DOM isolado em memória; não abre IndexedDB nem grava avaliações reais.
function fixture(t,{preferences={getItem(){return null;},setItem(){}}}={}) {
  function element(dataset={}) {
    const classes=new Set(),attributes=new Map();let html='';
    const el={dataset,ownerDocument:document,children:[],listeners:{},value:'',textContent:'',disabled:false,
      classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on??!classes.has(c))classes.add(c);else classes.delete(c);}},
      setAttribute:(key,value)=>attributes.set(key,String(value)),getAttribute:key=>attributes.get(key),
      addEventListener(type,handler){this.listeners[type]=handler;},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      querySelectorAll(selector){return this.children.filter(child=>{
        const attr=selector.match(/\[data-([\w-]+)\]/)?.[1]?.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
        return attr&&attr in child.dataset&&(!selector.includes('.selected')||child.classList.contains('selected'));
      });},focus(){},
    };
    Object.defineProperty(el,'innerHTML',{get:()=>html,set(value){
      html=value;el.children=[];
      for(const match of value.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)) {
        const child=element();child.textContent=match[2];
        for(const attr of match[1].matchAll(/data-([\w-]+)="([^"]*)"/g))child.dataset[attr[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attr[2];
        for(const c of (match[1].match(/class="([^"]*)"/)?.[1]||'').split(/\s+/).filter(Boolean))child.classList.add(c);
        for(const attr of match[1].matchAll(/(aria-[\w-]+)="([^"]*)"/g))child.setAttribute(attr[1],attr[2]);
        el.children.push(child);
      }
    }});
    return el;
  }
  const document={createElement:()=>element(),addEventListener(){},removeEventListener(){}};
  const nodes=new Map(),node=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  const sheet=node('#offerSheet');sheet.classList.add('hidden');
  sheet.querySelector=node;
  node('#smartAdvColumnPicker').querySelector=node;
  node('.tablewrap table').rows=[];
  const tabs=['trends','glimpse','images'].map(tab=>element({tab}));
  const panels=['trends','glimpse','images'].map(panel=>element({panel}));
  sheet.querySelectorAll=selector=>selector==='.tabs [data-tab]'?tabs:selector==='[data-panel]'?panels:[];
  document.querySelector=node;document.querySelectorAll=()=>[];
  const previousDocument=globalThis.document,previousWindow=globalThis.window;
  globalThis.document=document;globalThis.window={scrollTo(){},addEventListener(){},removeEventListener(){},localStorage:preferences};document.defaultView=globalThis.window;
  t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;});
  const root={ownerDocument:document,querySelector:node,querySelectorAll:()=>[]},calls=[];
  node('#visibilityFilter').value='visible';
  const actions={closeOffer(){},saveTrend:async(...args)=>{calls.push(args);return true;}};
  const view=mountSmartAdvOffersView({root,actions,preferences});
  const state={captures:[{captureId:'synthetic',capturedAt:'2026-01-01T12:00:00Z',offers:[{offerId:123,offerName:'Example FR',vertical:'Example',geoTargets:['FR'],allowedChannels:[],brandBidding:null,offerUrl:''}]}],trends:[],images:[],glimpse:[],decisions:[]};
  view.render(state);
  const open=()=>node('#rows').listeners.click({target:{closest:selector=>selector==='[data-action]'?{dataset:{key:'123',action:'trends'}}:null}});
  const result=status=>node('#trendResults').children.find(button=>button.dataset.trendsResult===status);
  const selectCountry=()=>{const country=node('#trendCountries').children[0];node('#trendCountries').listeners.click({target:{closest:()=>country}});};
  open();return {view,state,node,calls,actions,open,result,selectCountry,preferences};
}

test('SmartAdv oculta e reexibe ofertas por ID usando apenas uma preferência local',t=>{
  const stored=new Map(),preferences={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  const f=fixture(t,{preferences}),rows=f.node('#rows'),key='hub:smartadv-offers:hidden-offer-ids:v1';
  const hide=rows.children.find(button=>button.dataset.toggleSmartadvVisibility==='123');
  assert.ok(hide,'a linha oferece a ação de ocultar');
  let prevented=false,stopped=false;
  rows.listeners.click({target:{closest:selector=>selector==='[data-toggle-smartadv-visibility]'?hide:null},preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.equal(prevented,true);
  assert.equal(stopped,true);
  assert.equal(rows.innerHTML,'','a oferta desaparece do filtro padrão após ocultar');
  assert.deepEqual(JSON.parse(stored.get(key)),['123']);

  const visibility=f.node('#visibilityFilter');visibility.value='hidden';visibility.listeners.change();
  assert.match(rows.innerHTML,/data-offer="123"/,'a opção Itens ocultos exibe a oferta');
  const restore=rows.children.find(button=>button.dataset.toggleSmartadvVisibility==='123');
  assert.equal(restore.textContent,'Reexibir');
  rows.listeners.click({target:{closest:selector=>selector==='[data-toggle-smartadv-visibility]'?restore:null},preventDefault(){},stopPropagation(){}});
  assert.equal(rows.innerHTML,'','a oferta some da lista de ocultos depois de reexibir');
  assert.deepEqual(JSON.parse(stored.get(key)),[]);
});

test('SmartAdv saves and marks the result without selecting or inventing a country',async t=>{
  const f=fixture(t);
  f.actions.saveTrend=async(item,status,draft)=>{
    f.calls.push([item,status,draft]);
    f.state.trends=[{offerKey:'smartadv:123',assessments:[{assessmentId:'synthetic',status,countries:draft.countries,date:'2026-01-01',searchTerm:draft.term,capturedAt:'2026-01-01T13:00:00Z'}]}];
    f.view.render(f.state);f.view.showMessage('Avaliação de Google Trends salva.');return true;
  };
  await f.result('up').onclick();
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0][2].countries,[],'não atribui o país disponível à avaliação');
  assert.equal(f.result('up').getAttribute('aria-pressed'),'true');
  assert.equal(f.node('#trendCountries').children[0].getAttribute('aria-pressed'),'false');
  assert.doesNotMatch(f.node('#trendResultMessage').textContent,/Selecione ao menos um país/);
  f.node('#closeSheet').onclick();f.open();
  assert.equal(f.result('up').getAttribute('aria-pressed'),'true');
  assert.equal(f.calls.length,1,'reabrir preserva o registro sem salvar novamente');
});

test('SmartAdv controller persists an empty country list and retains prior assessments',async()=>{
  const source=await readFile(new URL('../src/curadoria/smartadv-offers/smartadv-offers-page.mjs',import.meta.url),'utf8');
  const previous={offerKey:'smartadv:123',assessments:[{assessmentId:'previous',status:'stable',countries:['FR'],date:'2026-01-01',capturedAt:'2026-01-01T12:00:00Z'}]};
  const writes=[],messages=[];
  const context=vm.createContext({Trends,crypto:{randomUUID:()=> 'new-assessment'},console,
    offerContext:()=>({offerKey:'smartadv:123',productName:'Example'}),trendFor:()=>previous,countryCodes:()=>['FR'],
    Storage:{STORES:{trends:'trends'},put:async(store,record)=>writes.push({store,record})},trends:[previous],
    updateRecord:(_records,next)=>[next],show(){},recordAssessment(){},
    view:{refreshOffer(){},showMessage:message=>messages.push(message)},
  });
  vm.runInContext(source.slice(source.indexOf('async function saveTrend('),source.indexOf('async function addTrendCandidate(')),context);
  assert.equal(await context.saveTrend({offerId:123},'no_data',{countries:[],term:'Example'}),true);
  assert.equal(writes.length,1);
  assert.equal(writes[0].record.assessments.length,2);
  assert.deepEqual(Array.from(writes[0].record.assessments.at(-1).countries),[]);
  assert.equal(writes[0].record.assessments.at(-1).status,'no_data');
  assert.equal(previous.assessments.length,1,'não substitui o histórico anterior');
  assert.match(messages.at(-1),/salva/);
});

test('SmartAdv marks the saved result and restores selection/history after reopening',async t=>{
  const f=fixture(t);f.selectCountry();
  f.actions.saveTrend=async(item,status,draft)=>{
    f.calls.push([item,status,draft]);
    f.state.trends=[{offerKey:'smartadv:123',assessments:[{assessmentId:'synthetic',status,countries:draft.countries,searchTerm:draft.term,capturedAt:'2026-01-01T13:00:00Z'}]}];
    f.view.render(f.state);f.view.showMessage('Avaliação de Google Trends salva.');return true;
  };
  await f.result('stable').onclick();
  assert.equal(f.result('stable').classList.contains('selected'),true);
  assert.equal(f.result('stable').getAttribute('aria-pressed'),'true');
  assert.deepEqual(f.calls[0][2].countries,['FR']);
  assert.match(f.node('#trendsHistory').innerHTML,/Estável/);
  f.node('#closeSheet').onclick();f.open();
  assert.equal(f.result('stable').getAttribute('aria-pressed'),'true');
  assert.equal(f.result('up').getAttribute('aria-pressed'),'false');
  assert.equal(f.calls.length,1,'reabrir não salva novamente');
});

test('SmartAdv waits for persistence and never marks a failed save as selected',async t=>{
  const f=fixture(t);f.selectCountry();let fail;
  f.actions.saveTrend=()=>new Promise((resolve,reject)=>{fail=reject;});
  const button=f.result('down'),pending=button.onclick();
  assert.equal(button.disabled,true);
  assert.equal(button.getAttribute('aria-pressed'),'false');
  fail(new Error('synthetic storage error'));await pending;
  assert.equal(button.disabled,false);
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.match(f.node('#trendResultMessage').textContent,/Não foi possível salvar/);
  assert.equal(f.node('#trendResultMessage').classList.contains('error'),true);
});
