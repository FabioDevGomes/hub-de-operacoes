import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualStorage,DB_NAME} from '../src/curadoria/manual/manual-storage.mjs';
import {memoryIndexedDB} from './helpers/manual-memory-idb.mjs';
import {validateBackup} from '../src/curadoria/manual/manual-domain.mjs';
import {createAnalysis} from '../src/curadoria/glimpse-domain.mjs';
const stamp='2026-10-09T12:00:00.000Z';
const glimpse=(p,analysisId)=>({...createAnalysis('Produto\nTermo de pesquisa\n4K searches past month',{productName:p.name},stamp),analysisId,productId:p.productId,productKey:p.productId});
function setup(){let n=0;const factory=memoryIndexedDB();const storage=createManualStorage({factory,now:()=>stamp,id:()=>`manual-${++n}`});return {factory,storage};}

test('manual storage: unclassified autosave is a draft, survives backup and does not create fake history',async()=>{
  const {storage}=setup(),p=await storage.saveProduct({name:'Synthetic Product',countries:'US'});
  await storage.saveTrend(p.productId,{status:'',term:'Draft term',countries:['US'],productAge:'old'});
  let record=(await storage.readState()).trends[0];assert.equal(record.pageDraft.term,'Draft term');assert.equal(record.assessments.length,0);
  const restored=setup().storage;await restored.mergeBackup(await storage.exportBackup());assert.deepEqual((await restored.readState()).trends[0],record);
  await storage.saveTrend(p.productId,{status:'up',searchTerm:'Draft term',countries:['US'],productAge:'old'});
  record=(await storage.readState()).trends[0];assert.equal(record.pageDraft,null);assert.equal(record.assessments.length,1);assert.equal(record.assessments[0].status,'up');
});
test('manual storage: cadastro, rename, ocultação e análises preservam identidade e conteúdos independentes',async()=>{
  const {factory,storage:s}=setup(),a=await s.saveProduct({name:'Mesmo nome',countries:'US'}),b=await s.saveProduct({name:'Mesmo nome'});
  await s.saveTrend(a.productId,{status:'stable',searchTerm:'Mesmo nome',countries:[]});await s.saveTrend(a.productId,{status:'down',searchTerm:'Outro termo',countries:['US']});
  await s.updateTrendCandidates(a.productId,values=>[...values,'reviews']);await s.updateTrendCandidates(a.productId,values=>values.filter(v=>v!=='reviews'));
  await s.saveImage(a.productId,{country:'US',status:'mixed',negativeKeywordCandidates:[]});await s.saveImage(a.productId,{country:'US',status:'mixed',negativeKeywordCandidates:['outro produto']});await s.saveDecision(a.productId,'Revisar');
  const analysis=glimpse(a,'analysis-a');
  await s.saveAnalysis(analysis,a.productId);await s.saveAnalysis(analysis,a.productId);
  const rename=await s.saveProduct({name:'Nome atualizado',countries:'US'},a);await s.setHidden(a.productId,true);
  const state=await s.readState();assert.equal(state.products.find(p=>p.productId===a.productId).hidden,true);assert.equal(rename.productId,a.productId);
  assert.equal(state.trends[0].assessments.length,2);assert.equal(state.trends[0].candidateHistory.length,2);assert.equal(state.images[0].assessments.length,2);assert.equal(state.decisions[0].history.length,1);assert.equal(state.analyses.length,1);
  assert.equal((await s.historyByProduct(b.productId)).length,0);assert.deepEqual(new Set(factory.calls.map(([name])=>name)),new Set([DB_NAME]));
  assert.throws(()=>s.saveImage(b.productId,{country:'US',status:'',negativeKeywordCandidates:['foo']}),/resultado visual/);
  await assert.rejects(s.saveAnalysis({...analysis,analysisId:'analysis-b',productId:b.productId},b.productId),/identidade/);
});
test('manual storage: concorrência de cadastro impede sobrescrita; falha de gravação é atômica',async()=>{
  const {factory,storage:s}=setup(),p=await s.saveProduct({name:'Produto'});await s.saveProduct({name:'Primeira edição'},p);
  await assert.rejects(s.saveProduct({name:'Edição obsoleta'},p),/outra aba/);
  factory.failNextWrite();await assert.rejects(s.saveTrend(p.productId,{status:'stable'}),/synthetic write/);
  const state=await s.readState();assert.equal(state.products[0].name,'Primeira edição');assert.equal(state.trends.length,0);
});
test('manual storage: backup completo round-trip, merge sem perdas, conflitos locais e rejeição de outras origens',async()=>{
  const {storage:s}=setup(),p=await s.saveProduct({name:'Produto A',payoutValue:'0',currency:'USD',countries:'DE'});
  await s.saveTrend(p.productId,{status:'no_data'});await s.saveImage(p.productId,{country:'DE',status:'mixed'});await s.saveDecision(p.productId,'Campanha no ar');
  await s.saveAnalysis(glimpse(p,'g-a'),p.productId);
  const backup=await s.exportBackup();assert.equal(validateBackup(backup),backup);
  const target=setup().storage,result=await target.mergeBackup(backup);assert.equal(result.added,5);assert.deepEqual(await target.readState(),await s.readState());
  assert.equal((await target.mergeBackup(backup)).added,0);
  await target.saveProduct({name:'Edição local'},p);const conflict=await target.mergeBackup(backup);assert.equal(conflict.conflicts,1);assert.equal((await target.readState()).products[0].name,'Edição local');
  await assert.rejects(target.mergeBackup({...backup,format:'radar-glimpse'}),/Curadoria manual/);await assert.rejects(target.mergeBackup({...backup,products:[]}),/sem cadastro/);
  assert.equal((await target.readState()).analyses.length,1);
});

test('manual backup: rejeita históricos e análises incompletos antes de qualquer gravação',async()=>{
  const {storage:s}=setup(),p=await s.saveProduct({name:'Produto'});
  await s.saveTrend(p.productId,{status:'stable'});await s.saveAnalysis(glimpse(p,'g-safe'),p.productId);
  const good=await s.exportBackup(),target=setup().storage;
  for(const alter of [
    b=>b.products[0].history.push(null),
    b=>delete b.trends[0].assessments[0].date,
    b=>b.trends[0].keywordCandidates.push({text:'Inválida'}),
    b=>b.analyses[0].parsed={},
    b=>delete b.analyses[0].classified,
  ]){
    const bad=structuredClone(good);alter(bad);
    await assert.rejects(target.mergeBackup(bad));assert.equal((await target.readState()).products.length,0);
  }
});
