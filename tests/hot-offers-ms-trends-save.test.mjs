import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mountHotMsTrendsSave, sameTrendAssessment} from '../src/curadoria/hot-offers-ms/hot-offers-ms-trends-save.mjs';

function harness(persist = async()=>true) {
  const handlers = new Map(), calls = [], messages = [];
  const button = {disabled:true,addEventListener:(event,handler)=>handlers.set(event,handler)};
  let context = {tab:'trends',offerKey:'hot:synthetic',previous:null,
    draft:{status:'stable',term:'Synthetic Collar',countries:['US','CA'],productAge:'new'}};
  const action = mountHotMsTrendsSave({button,getContext:()=>context,
    persist:async(...args)=>{calls.push(args);return persist(...args);},
    feedback:message=>messages.push(message)});
  return {button,calls,messages,action,click:()=>handlers.get('click')(),
    get context(){return context;},set context(value){context=value;}};
}

test('Trends habilita Salvar e grava exatamente o rascunho da oferta, sem escrever ao montar',async()=>{
  const h=harness();
  assert.equal(h.calls.length,0);
  h.action.sync();assert.equal(h.button.disabled,false);
  assert.equal(await h.click(),true);
  assert.deepEqual(h.calls,[['hot:synthetic','stable',{
    term:'Synthetic Collar',countries:['US','CA'],productAge:'new',
  }]]);
  assert.equal(h.messages.at(-1),'Avaliação de Trends salva.');
  assert.equal(h.button.disabled,false);
});

test('sem resultado válido, Salvar pede seleção e não grava',async()=>{
  for (const status of ['', 'invalid']) {
    const h=harness();h.context.draft.status=status;
    assert.equal(await h.click(),false);
    assert.equal(h.calls.length,0);
    assert.match(h.messages.at(-1),/Selecione um resultado/);
  }
});

test('repetir Salvar sem mudanças não duplica o histórico nem a observabilidade',async()=>{
  const h=harness();h.context.previous={status:'stable',searchTerm:'Synthetic Collar',
    countries:['CA','US'],productAge:'new'};
  assert.equal(await h.click(),true);
  assert.equal(h.calls.length,0);
  assert.equal(h.messages.at(-1),'Sem alterações para salvar.');
  for (const patch of [{term:'Changed'}, {countries:['US']}, {productAge:'old'}, {status:'up'}]) {
    assert.equal(sameTrendAssessment(h.context.previous,{...h.context.draft,...patch}),false);
  }
});

test('Salvar vazio de países e momento preserva os campos opcionais',async()=>{
  const h=harness();h.context.draft.countries=[];h.context.draft.productAge='';
  await h.click();assert.deepEqual(h.calls[0][2],{
    term:'Synthetic Collar',countries:[],productAge:'',
  });
});

test('durante a gravação, bloqueia clique repetido e só confirma após persistência',async()=>{
  let complete;const h=harness(()=>new Promise(resolve=>{complete=resolve;}));
  const first=h.click();assert.equal(h.button.disabled,true);
  assert.equal(h.messages.at(-1),'Salvando…');
  assert.equal(await h.click(),false);assert.equal(h.calls.length,1);
  complete(true);assert.equal(await first,true);
  assert.equal(h.button.disabled,false);assert.match(h.messages.at(-1),/salva/);
});

test('falha ou resposta não confirmada preserva o rascunho e permite tentar novamente',async()=>{
  for(const fail of [async()=>{throw new Error('synthetic failure');},async()=>false]) {
    const h=harness(fail),before=structuredClone(h.context.draft);
    assert.equal(await h.click(),false);
    assert.deepEqual(h.context.draft,before);
    assert.equal(h.button.disabled,false);
    assert.match(h.messages.at(-1),/Não foi possível salvar/);
    assert.ok(!h.messages.includes('Avaliação de Trends salva.'));
    await h.click();assert.equal(h.calls.length,2);
  }
});

test('outras abas não disparam Trends nem alteram o botão controlado pelo Glimpse',async()=>{
  const h=harness();
  for(const tab of ['glimpse','images','overview','history']) {
    h.context.tab=tab;h.button.disabled=true;
    h.action.sync();assert.equal(h.button.disabled,true);
    assert.equal(await h.click(),false);
    assert.equal(h.calls.length,0);
  }
  h.context.tab='trends';h.context.offerKey=null;
  assert.equal(await h.click(),false);assert.equal(h.calls.length,0);
});

test('resposta tardia não confirma em outra oferta nem reabilita o Salvar do iframe',async()=>{
  let complete;const h=harness(()=>new Promise(resolve=>{complete=resolve;}));
  const pending=h.click();h.context={...h.context,tab:'glimpse',offerKey:'hot:other'};
  h.button.disabled=true;complete(true);await pending;
  assert.equal(h.button.disabled,true);
  assert.equal(h.messages.at(-1),'Salvando…');
});

test('integração publicada preserva seleção pendente, Salvar manual, banco próprio e ficha aberta',async()=>{
  const view=await readFile(new URL('../src/curadoria/hot-offers-ms/hot-offers-ms-view.mjs',import.meta.url),'utf8');
  const page=await readFile(new URL('../src/curadoria/hot-offers-ms/hot-offers-ms-page.mjs',import.meta.url),'utf8');
  const published=await readFile(new URL('../dist/curadoria/hot-offers-ms/hot-offers-ms-trends-save.mjs',import.meta.url),'utf8');
  const source=await readFile(new URL('../src/curadoria/hot-offers-ms/hot-offers-ms-trends-save.mjs',import.meta.url),'utf8');
  assert.equal(published,source);
  assert.match(view,/status:\$\('#trendResults \[data-trends-result\]\.selected'\)/);
  assert.match(view,/TrendsUI\.renderResultButtons[\s\S]*?value=>trendsSave\.select/);
  assert.match(view,/persist:\(\.\.\.args\)=>actions\.saveTrend\(\.\.\.args\)/);
  assert.match(page,/await Storage\.put\(Storage\.STORES\.trends,stored\);[\s\S]*?view\.refreshOffer\(item,'trends'\)/);
  assert.match(page,/view\.showToast\('Avaliação de Trends salva\.'\);\s+return true;/);
});
