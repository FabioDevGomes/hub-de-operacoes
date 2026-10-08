import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as Domain from '../src/curadoria/glimpse-domain.mjs';
import * as Clipboard from '../src/curadoria/glimpse/clipboard.mjs';

const source = (await readFile(new URL('../src/curadoria/glimpse/glimpse-page.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const raw = 'Test product\n8K searches past month\nPeople Also Search\ntest product reviews\ntest product price';
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness({origin='hot-offers-ms',reference=true,embedded=true,failSave=false,failClipboard=false,clipboardText=raw,readClipboard}={}) {
  const nodes = new Map(),messages = [],stored = [],listeners = new Map();
  const clipboardReads = {count:0};
  function node(selector) {
    if (!nodes.has(selector)) {
      const classes = new Set();
      nodes.set(selector,{textContent:'',innerHTML:'',value:'',disabled:false,style:{},dataset:{},scrollHeight:104,
        classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle:(value,active)=>active?classes.add(value):classes.delete(value)},
        addEventListener(){},setAttribute(){},focus(){},remove(){this.removed=true}});
    }
    return nodes.get(selector);
  }
  const parent = {postMessage:message=>messages.push(message)};
  const document = {querySelector:node,querySelectorAll:()=>[],documentElement:node('html'),title:''};
  const window = {parent,addEventListener:(type,listener)=>listeners.set(type,listener)};
  const context = vm.createContext({
    Domain,Clipboard,document,window,URLSearchParams,Intl,Date,Map,console:{error(){},warn(){}},
    location:{origin:'http://localhost',search:'?origin='+origin+'&embedded='+Number(embedded)+'&product=Test%20product&productKey=test-product'+(reference?'&presentation=reference':'')},
    navigator:{clipboard:{readText:async()=>{clipboardReads.count++;if(failClipboard) throw new Error('Denied');return readClipboard?readClipboard():clipboardText}}},
    requestAnimationFrame(){},setTimeout,scrollTo(){},
    Storage:{openGlimpseDB:async()=>{},getHistoryByProduct:async()=>stored,saveAnalysis:async analysis=>{if(failSave)throw new Error('Storage unavailable');stored.push(analysis)}},
    CurationObservability:{recordGlimpse:async()=>{}},
  });
  vm.runInContext(source+'\n globalThis.api={finishAnalysis,pasteAndAnalyze,analyzeInput};',context);
  return {api:context.api,node,messages,stored,parent,listeners,location:context.location,clipboardReads};
}

const clipboardOrigins = ['top','manager','smartadv-offers','hot-offers-ms','clickbank-top-offers'];
for (const origin of clipboardOrigins) {
  test(`Colar e analisar lê Ctrl+C somente no clique e analisa em ${origin}`,async()=>{
    let resolveRead;
    const pendingRead = new Promise(resolve=>{resolveRead=resolve});
    const h=harness({origin,reference:false,embedded:origin!=='manager',readClipboard:()=>pendingRead});await settle();
    assert.equal(h.clipboardReads.count,0,'abrir a análise não lê o clipboard');
    assert.equal(h.node('#clipboardCapture').classList.contains('hidden'),false);
    assert.equal(h.node('#manualPaste').classList.contains('hidden'),true);
    const button=h.node('#pasteAnalyze');button.onclick();
    assert.equal(h.clipboardReads.count,1);
    assert.equal(button.disabled,true);assert.equal(button.textContent,'Lendo...');
    button.onclick();assert.equal(h.clipboardReads.count,1,'clique repetido durante leitura é ignorado');
    resolveRead(raw);await settle();await settle();
    assert.equal(h.node('#rawInput').value,raw);
    assert.equal(h.stored.length,1,'o mesmo clique analisa e inicia o autosalvamento');
    assert.equal(h.stored[0].productKey,'test product');
    assert.equal(h.node('#results').classList.contains('hidden'),false);
    assert.match(h.node('#volumeCard').textContent,/8K/);
    assert.match(h.node('#peopleAlsoSearchItems').innerHTML,/test product reviews/);
    assert.equal(button.disabled,false);assert.equal(button.textContent,'Colar e analisar');
    await h.api.finishAnalysis();assert.equal(h.stored.length,1,'Salvar não duplica a coleta');
  });
}

test('clipboard vazio ou negado conserva o padrão e permite tentar novamente nas cinco origens',async()=>{
  for (const origin of clipboardOrigins) {
    for (const failClipboard of [false,true]) {
      const h=harness({origin,reference:false,embedded:origin!=='manager',clipboardText:'',failClipboard});await settle();
      h.node('#rawInput').value='conteúdo anterior';
      h.node('#pasteAnalyze').onclick();await settle();await settle();
      assert.equal(h.clipboardReads.count,1);assert.equal(h.stored.length,0);
      assert.equal(h.node('#rawInput').value,'conteúdo anterior','falha não trata o texto anterior como nova captura');
      assert.match(h.node('#message').textContent,failClipboard?/Permita o acesso/:/vazia/);
      assert.equal(h.node('#manualPaste').classList.contains('hidden'),true);
      assert.equal(h.node('#pasteAnalyze').disabled,false);
      assert.equal(h.node('#pasteAnalyze').textContent,'Colar e analisar');
    }
  }
});

test('Hot Offers MS reference usa clipboard, salva uma vez e confirma sem fechar',async()=>{
  const h=harness();await settle();
  assert.equal(h.node('#clipboardCapture').classList.contains('hidden'),false);
  assert.equal(h.node('#manualPaste').classList.contains('hidden'),true);
  assert.equal(h.node('.footer').removed,true);
  assert.equal(h.node('html').classList.contains('wide-offer-embedded'),true);
  await h.api.pasteAndAnalyze();await settle();
  assert.equal(h.stored.length,1,'a colagem salva automaticamente');
  await h.api.finishAnalysis();await h.api.finishAnalysis();
  assert.equal(h.stored.length,1,'Salvar não duplica a análise já persistida');
  assert.equal(h.messages.filter(m=>m.type==='hub-glimpse-save-result'&&m.saved===true).length,2);
  assert.equal(h.messages.some(m=>m.type==='hub-glimpse-close'),false);
});

test('referência vazia ou com falha não confirma sucesso nem fecha',async()=>{
  const empty=harness();await settle();await empty.api.finishAnalysis();
  assert.equal(empty.messages.at(-1).saved,false);
  const failure=harness({failSave:true});await settle();
  await failure.api.pasteAndAnalyze();await settle();await failure.api.finishAnalysis();
  assert.equal(failure.stored.length,0);
  assert.equal(failure.messages.at(-1).saved,false);
  assert.equal(failure.messages.some(m=>m.type==='hub-glimpse-close'),false);
  assert.match(failure.node('#message').textContent,/Não foi possível salvar/);
});

test('clipboard negado na referência mantém captura compacta e informa a permissão',async()=>{
  const h=harness({failClipboard:true});await settle();await h.api.pasteAndAnalyze();
  assert.equal(h.node('#manualPaste').classList.contains('hidden'),true);
  assert.match(h.node('#message').textContent,/Permita o acesso/);
  assert.equal(h.node('#pasteAnalyze').disabled,false);
  assert.equal(h.stored.length,0);
});

test('todas as origens usam a referência mesmo com links antigos sem presentation',async()=>{
  for (const origin of ['top','manager','smartadv-offers','hot-offers-ms','clickbank-top-offers']) {
    const h=harness({origin,reference:false});await settle();
    h.node('#rawInput').value=raw;h.api.analyzeInput();await h.api.finishAnalysis();
    assert.equal(h.stored.length,1);
    assert.equal(h.messages.at(-1).type,'hub-glimpse-save-result');
    assert.equal(h.messages.at(-1).saved,true);
    assert.equal(h.messages.some(m=>m.type==='hub-glimpse-close'),false);
    assert.equal(h.node('.footer').removed,true);
    assert.equal(h.node('#manualPaste').classList.contains('hidden'),true);
    assert.equal(h.node('.standalone-bar').classList.contains('hidden'),true);
  }
});

test('Lista de Gerente independente confirma Salvo sem navegar, e Voltar conserva origem',async()=>{
  const h=harness({origin:'manager',embedded:false});await settle();
  assert.equal(h.node('.standalone-bar').classList.contains('hidden'),false);
  await h.api.pasteAndAnalyze();await settle();await h.api.finishAnalysis();
  assert.equal(h.node('#standaloneSaved').textContent,'Salvo');
  assert.equal(h.node('#standaloneSaved').hidden,false);
  assert.equal(h.stored.length,1);assert.equal(h.messages.length,0);
  h.node('#cancelTop').onclick();await settle();
  assert.equal(h.location.href,'../gerentes/');
  h.node('#newCollection').onclick();
  assert.equal(h.node('#standaloneSaved').hidden,true);
  await h.api.finishAnalysis();assert.equal(h.node('#standaloneSaved').hidden,true);
});

test('iframe só aceita Salvar vindo do pai e da mesma origem',async()=>{
  const h=harness();await settle();
  const listener=h.listeners.get('message');
  listener({origin:'https://example.invalid',source:h.parent,data:{type:'hub-glimpse-finish'}});
  listener({origin:'http://localhost',source:{},data:{type:'hub-glimpse-finish'}});
  await settle();assert.equal(h.messages.length,0);
  listener({origin:'http://localhost',source:h.parent,data:{type:'hub-glimpse-finish'}});
  await settle();assert.equal(h.messages.at(-1).saved,false);
});
