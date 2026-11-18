import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {parseKeywordLine,keywordListError,migrateLegacyKeywordText} from '../src/google-ads/google-ads-keyword-match.mjs';
test('interpreta cada linha, inclusive negativas, sem enviar os marcadores como texto',()=>{
  assert.deepEqual(['[produto]','"comprar produto"','produto'].map(v=>{const p=parseKeywordLine(v);return [p.text,p.matchType]}),[['produto','EXACT'],['comprar produto','PHRASE'],['produto','BROAD']]);
  assert.equal(keywordListError('[produto]\n"comprar produto"\nproduto',{required:true}),'');
});
test('bloqueia marcadores incompletos e duplicatas do mesmo tipo',()=>{
  assert.ok(keywordListError('[produto\noutro',{required:true}));
  assert.ok(keywordListError('[Produto]\n[produto]',{required:true}));
  assert.equal(keywordListError('[produto]\n"produto"',{required:true}),'');
});
test('preserva o tipo dos termos sem marcação dos formulários antigos',()=>{
  assert.equal(migrateLegacyKeywordText('termo\n[outro]','PHRASE'),'"termo"\n[outro]');
  assert.equal(migrateLegacyKeywordText('termo','EXACT'),'[termo]');
  assert.equal(migrateLegacyKeywordText('termo','BROAD'),'termo');
});
test('a criação mostra o tipo por linha e envia ao endpoint os marcadores para correspondência individual',async()=>{
  const view=await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs',import.meta.url),'utf8');
  const service=await readFile(new URL('../src/google-ads/google-ads-campaign-creation-service.mjs',import.meta.url),'utf8');
  assert.match(view,/parseKeywordLine\(line\)[\s\S]*?parsed\.label/);
  assert.match(view,/individualKeywordMatch:\s*true/);
  assert.match(service,/keyword_individual_match:\s*true/);
  assert.deepEqual(parseKeywordLine('"ProvaDent"'),{ok:true,empty:false,raw:'"ProvaDent"',text:'ProvaDent',matchType:'PHRASE',label:'Frase'});
});
