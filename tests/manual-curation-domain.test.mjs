import test from 'node:test';
import assert from 'node:assert/strict';
import * as Domain from '../src/curadoria/manual/manual-domain.mjs';
import {rowHtml} from '../src/curadoria/manual/manual-view.mjs';
const now='2026-10-09T12:00:00.000Z';
const product=(id='manual-a',fields={})=>Domain.productFromForm({name:'Mesmo Produto',...fields},null,{id,now});

test('manual: nome é o único campo obrigatório; zero e payout ausente permanecem diferentes',()=>{
  const p=product();assert.equal(p.payout.value,null);assert.equal(p.payout.currency,null);assert.deepEqual(p.countries,[]);
  assert.throws(()=>product('a',{name:' '}),/nome/);
  assert.equal(product('a',{payoutValue:'0',currency:'BRL'}).payout.value,0);
  assert.equal(product('a',{payoutValue:'1.250,50',currency:'EUR'}).payout.value,1250.5);
  assert.throws(()=>product('a',{payoutValue:'50'}),/moeda/);
  for(const value of ['-10','abc','1,234','Infinity'])assert.throws(()=>product('a',{payoutValue:value,currency:'USD'}));
});
test('manual: segurança de URL e países, sem inferir plataforma, rede ou GEO',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,x','file:///c:/x','https://user:pass@example.com'])assert.throws(()=>product('a',{url}));
  const p=product('a',{url:'https://example.com',countries:'us, DE, us',network:'Rede qualquer',productType:'Digital'});
  assert.equal(p.url,'https://example.com/');assert.deepEqual(p.countries,['US','DE']);assert.throws(()=>product('a',{countries:'Estados Unidos'}));
});
test('manual: renomear mantém ID, criação e histórico de cadastro',()=>{
  const p=product(),renamed=Domain.productFromForm({name:'Outro nome'},p,{id:'ignored',now:'2026-10-10T12:00:00.000Z'});
  assert.equal(renamed.productId,p.productId);assert.equal(renamed.createdAt,p.createdAt);assert.equal(renamed.history[0].values.name,p.name);assert.equal(p.history.length,0);
});
test('manual: conteúdos iguais não associam análises nem mesmo quando nomes normalizados coincidem',()=>{
  const a=product('a'),b=product('b'),state={products:[a,b],trends:[{productId:'a',keywordCandidates:[],assessments:[{status:'stable',date:'2026-10-09',capturedAt:now}]}],images:[{productId:'a',assessments:[{country:'US',status:'dominant',capturedAt:now}]}],analyses:[{productId:'a',productKey:'a',signal:{level:'strong'},capturedAt:now},{productKey:'mesmo produto',signal:{level:'strong'},capturedAt:now}],decisions:[{productId:'a',currentStatus:'Subir campanha',history:[]}]};
  const ar=Domain.productSnapshot(a,state),br=Domain.productSnapshot(b,state);
  assert.equal(ar.signal.coverage.available,3);assert.equal(br.signal.coverage.available,0);assert.equal(br.glimpse,null);assert.equal(br.decision.currentStatus,'Não definido');
  const renamed={...a,name:'Nome novo'};assert.equal(Domain.productSnapshot(renamed,state).signal.coverage.available,3);
});
test('manual: filtros, ordenação e apresentação segura, sem ranking/coletas ou links transformados em botões',()=>{
  const a=product('a',{name:'<img src=x onerror=alert(1)>',payoutValue:'0',currency:'USD'}),b={...product('b',{network:'Rede B'}),hidden:true};
  const state={products:[a,b]};assert.equal(Domain.filteredProducts(state).length,1);assert.equal(Domain.filteredProducts(state,{visibility:'hidden'})[0].product.productId,'b');assert.equal(Domain.filteredProducts(state,{visibility:'all',network:'Rede B'}).length,1);
  const html=rowHtml(Domain.productSnapshot(a,state));assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/USD 0,00/);assert.match(html,/data-curation-focus="glimpse"/);assert.match(html,/data-product="a"/);assert.doesNotMatch(html,/data-movement|Última coleta/);
});
