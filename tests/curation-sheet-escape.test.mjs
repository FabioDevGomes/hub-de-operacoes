import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {mountCurationSheetEscape,CURATION_ESCAPE_MESSAGE} from '../src/curadoria/sheet-escape.mjs';

function fixture() {
  const events=new Map(),messages=new Map(),sent=[];
  const state={open:true,dialog:false,clicks:0,standalone:false,standaloneClicks:0,embedded:false,disabled:false,frameHidden:false,frameRects:1};
  const back={get disabled(){return state.disabled},click(){state.clicks++;state.open=false}};
  const standalone={disabled:false,click(){state.standaloneClicks++}};
  const frame={contentWindow:{},closest(){return state.frameHidden?{}:null},getClientRects(){return Array(state.frameRects).fill({})}};
  const sheet={querySelector:()=>back,querySelectorAll:()=>[frame]};
  const doc={
    documentElement:{classList:{contains:()=>state.embedded}},
    querySelector(selector){return selector==='dialog[open]'?(state.dialog?{}:null):selector==='#cancelTop'?(state.standalone?standalone:null):state.open?sheet:null},
    addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:(type,fn)=>{if(events.get(type)===fn)events.delete(type)}
  };
  const win={location:{origin:'http://127.0.0.1:8765'},addEventListener:(type,fn)=>messages.set(type,fn),removeEventListener:(type,fn)=>{if(messages.get(type)===fn)messages.delete(type)}};
  win.parent=win;
  const dispose=mountCurationSheetEscape({doc,win});
  const key=(extra={})=>{const event={key:'Escape',defaultPrevented:false,repeat:false,isComposing:false,target:{closest:()=>null},preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true},...extra};events.get('keydown')?.(event);return event};
  const message=(extra={})=>messages.get('message')?.({origin:win.location.origin,data:{type:CURATION_ESCAPE_MESSAGE},source:frame.contentWindow,...extra});
  return{state,key,message,dispose,frame,events,messages,win,sent};
}

test('Esc aciona o mesmo botão Voltar uma vez, inclusive em inputs, e não reage na lista',()=>{
  const f=fixture(),event=f.key({target:{tagName:'INPUT',closest:()=>null}});
  assert.equal(f.state.clicks,1);assert.equal(f.state.open,false);
  assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);
  assert.equal(f.key().defaultPrevented,false);assert.equal(f.state.clicks,1);
});
test('diálogo interno, evento cancelado, composição, repetição e controle desabilitado têm prioridade',()=>{
  for(const extra of [{key:'Enter'},{defaultPrevented:true},{repeat:true},{isComposing:true},{target:{closest:()=>({})}}]){
    const f=fixture();f.key(extra);assert.equal(f.state.clicks,0);
  }
  const f=fixture();f.state.dialog=true;assert.equal(f.key().defaultPrevented,false);assert.equal(f.state.clicks,0);
  f.state.dialog=false;f.state.disabled=true;f.key();assert.equal(f.state.clicks,0);
  f.state.disabled=false;f.key();assert.equal(f.state.clicks,1);
});
test('Glimpse standalone usa Cancelar/Voltar existente, sem chamar Salvar',()=>{
  const f=fixture();f.state.open=false;f.state.standalone=true;
  assert.equal(f.key().defaultPrevented,true);assert.equal(f.state.standaloneClicks,1);assert.equal(f.state.clicks,0);
});
test('Esc dentro do iframe pede retorno ao host, sem usar o fechamento legado que troca de aba',()=>{
  const f=fixture();f.state.open=false;f.state.standalone=true;f.state.embedded=true;
  f.win.parent={postMessage:(data,origin)=>f.sent.push({data,origin})};
  f.key();
  assert.deepEqual(f.sent,[{data:{type:CURATION_ESCAPE_MESSAGE},origin:f.win.location.origin}]);
  assert.equal(f.state.standaloneClicks,0);
});
test('mensagens de Esc exigem origem, source e iframe ativo/visível; diálogos não fecham a ficha',()=>{
  const f=fixture();
  f.message({origin:'https://example.invalid'});f.message({source:{}});f.message({data:{type:'hub-glimpse-close'}});
  f.state.frameHidden=true;f.message();f.state.frameHidden=false;
  f.state.frameRects=0;f.message();f.state.frameRects=1;
  f.state.dialog=true;f.message();f.state.dialog=false;
  assert.equal(f.state.clicks,0);
  f.message();assert.equal(f.state.clicks,1);f.message();assert.equal(f.state.clicks,1);
});
test('desmontagem remove os listeners sem modificar dados',()=>{
  const f=fixture();f.dispose();assert.equal(f.events.size,0);assert.equal(f.messages.size,0);f.key();assert.equal(f.state.clicks,0);
});
test('as seis listas e o Glimpse carregam o helper único e o build o publica',async()=>{
  const pages=['index.html','gerentes/index.html','top-performance/index.html','hot-offers-ms/index.html','smartadv-offers/index.html','clickbank-top-offers/index.html','glimpse/index.html'];
  const read=path=>readFile(new URL(path,import.meta.url),'utf8');
  for(const page of pages){
    const source=await read('../src/curadoria/'+page),built=await read('../dist/curadoria/'+page);
    assert.match(source,/<script type="module" src="\/curadoria\/sheet-escape\.mjs\?v=1"><\/script>/,page);
    assert.equal(built,source,page);
  }
  assert.equal(await read('../dist/curadoria/sheet-escape.mjs'),await read('../src/curadoria/sheet-escape.mjs'));
});
