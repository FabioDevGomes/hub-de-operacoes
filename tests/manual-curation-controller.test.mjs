import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as Domain from '../src/curadoria/manual/manual-domain.mjs';
import {exploreUrl} from '../src/curadoria/trends-domain.mjs';
import {imageSearchUrl,imageSearchUrlExcluding} from '../src/curadoria/image-search-domain.mjs';
import {createManualStorage} from '../src/curadoria/manual/manual-storage.mjs';
import {memoryIndexedDB} from './helpers/manual-memory-idb.mjs';
const source=(await readFile(new URL('../src/curadoria/manual/manual-page.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve));};
function harness(){
  let reads=0,failRead=false,closes=0,restores=0,renders=[],notices=[],actions;
  const base=createManualStorage({factory:memoryIndexedDB()});
  const storage={...base,readState:async()=>{reads++;if(failRead)throw Error('Falha sintética de leitura');return base.readState();}};
  const element=()=>{const classes=new Set();return {dataset:{},style:{},classList:{contains:key=>classes.has(key),add:key=>classes.add(key),remove:key=>classes.delete(key)}};};
  const frame={...element(),contentWindow:{}},sheet=element(),panel=element(),nodes=new Map([['#glimpseFrame',frame],['#offerSheet',sheet],['[data-panel="glimpse"]',panel]]);
  const root={querySelector:key=>{if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);}};
  const handlers=[];
  vm.runInNewContext(source,{Domain,storage,exploreUrl,imageSearchUrl,imageSearchUrlExcluding,
    document:{querySelector:()=>root},window:{addEventListener:(_type,fn)=>handlers.push(fn),open(){}},location:{origin:'http://127.0.0.1:8765'},localStorage:{},URL,URLSearchParams,Blob,setTimeout,
    mountCurationListFocus:()=>({restore(){restores++;}}),mountGlimpseHeaderAction(){},
    mountManualView:options=>{actions=options.actions;return {render:state=>renders.push(state),notice:message=>notices.push(message),closeSheet:()=>closes++};},
  });
  return {base,frame,sheet,panel,actions,reads:()=>reads,renders:()=>renders,notices:()=>notices,closes:()=>closes,restores:()=>restores,failRead:()=>{failRead=true;},message:data=>handlers.forEach(fn=>fn(data))};
}
test('manual controller: Glimpse usa identidade explícita e só aceita resultado do iframe ativo na mesma origem',async()=>{
  const h=harness();await settle();
  const p=await h.actions.saveProduct({name:'Mesmo produto'});
  h.actions.openGlimpse(p);
  const query=new URL(h.frame.src,'http://127.0.0.1:8765').searchParams;
  assert.equal(query.get('origin'),'manual');assert.equal(query.get('productKey'),p.productId);assert.equal(query.get('product'),p.name);
  const message={origin:'http://127.0.0.1:8765',source:h.frame.contentWindow,data:{type:'hub-glimpse-save-result',saved:true}},before=h.reads();
  h.message({...message,origin:'https://example.com'});h.message({...message,source:{}});
  h.message({...message,data:{type:'hub-glimpse-save-result',saved:false}});
  h.sheet.classList.add('hidden');h.message({...message,data:{type:'hub-glimpse-close'}});h.sheet.classList.remove('hidden');
  h.panel.classList.add('hidden');h.message({...message,data:{type:'hub-glimpse-close'}});h.panel.classList.remove('hidden');
  await settle();assert.equal(h.reads(),before);
  h.message(message);await settle();assert.equal(h.reads(),before+1);
  h.message({...message,data:{type:'hub-glimpse-resize',height:-1}});assert.equal(h.frame.style.height,undefined);
  h.message({...message,data:{type:'hub-glimpse-resize',height:1200}});assert.equal(h.frame.style.height,'1200px');
  h.message({...message,data:{type:'hub-glimpse-close'}});assert.equal(h.closes(),1);
});
test('manual controller: erro de atualização após commit informa que os dados foram salvos, sem mensagem genérica de sucesso',async()=>{
  const h=harness();await settle();h.failRead();
  await assert.rejects(h.actions.saveProduct({name:'Persistido'}),/Dados salvos, mas a lista não pôde ser atualizada/);
  assert.equal((await h.base.readState()).products[0].name,'Persistido');assert.equal(h.renders().length,1);
});
test('manual controller: voltar relê autosalvamento do Glimpse antes de restaurar foco, inclusive sem clicar Salvar',async()=>{
  const h=harness();await settle();const p=await h.actions.saveProduct({name:'Produto'});
  await h.base.saveAnalysis({analysisId:'auto-g',productId:p.productId,productKey:p.productId,capturedAt:'2026-10-09T12:00:00Z'},p.productId);
  assert.equal(h.renders().at(-1).analyses.length,0);
  h.actions.restoreFocus();await settle();
  assert.equal(h.renders().at(-1).analyses[0].analysisId,'auto-g');assert.equal(h.restores(),1);
  await h.base.saveAnalysis({analysisId:'auto-g-late',productId:p.productId,productKey:p.productId,capturedAt:'2026-10-09T12:01:00Z'},p.productId);
  h.sheet.classList.add('hidden');h.message({origin:'http://127.0.0.1:8765',source:h.frame.contentWindow,data:{type:'hub-glimpse-save-result',saved:true}});await settle();
  assert.equal(h.renders().at(-1).analyses.length,2,'autosalvamento concluído depois do retorno também atualiza a lista');assert.equal(h.restores(),2);
  h.failRead();h.actions.restoreFocus();await settle();assert.equal(h.restores(),3);assert.match(h.notices().at(-1),/atualizar a lista ao voltar/);
});
