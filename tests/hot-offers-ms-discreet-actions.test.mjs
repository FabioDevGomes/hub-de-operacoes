import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {mountHotOffersMsView} from '../src/curadoria/hot-offers-ms/hot-offers-ms-view.mjs';

const html = await readFile(new URL('../src/curadoria/hot-offers-ms/index.html',import.meta.url),'utf8');
const css = await readFile(new URL('../src/curadoria/hot-offers-ms/hot-offers-ms.css',import.meta.url),'utf8');

test('Hot Offers MS reutiliza o canto discreto compartilhado, reservando espaço para o nome', () => {
  assert.match(html,/href="\/table-edit-actions\.css\?v=3"/);
  assert.match(css,/#hotOffersMsRoot \.tablewrap td\.product-cell\.hub-edit-host\{padding-right:54px\}/);
  assert.doesNotMatch(css,/\.hub-corner-edit\s*\{/,'fonte, fundo, sombra e posição pertencem somente ao componente global');
  assert.doesNotMatch(css,/\.table-action[^{}]*\[data-action="hide"\]/,'Ocultar não deve receber o formato de cápsula da coluna Ações');
});

// DOM e preferências em memória: não acessa o banco nem o navegador operacional.
function fixture(t, initialHidden = []) {
  const nodes = new Map(), stored = new Map([['hot-offers-ms-hidden-v1',JSON.stringify(initialHidden)]]), writes = [];
  function node(selector) {
    if (!nodes.has(selector)) {
      const classes = new Set();
      nodes.set(selector,{
        value:selector === '#visibilityFilter' ? 'visible' : '', tagName:'SELECT', innerHTML:'', textContent:'', listeners:{},
        classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),toggle(name,force){if(force ?? !classes.has(name))classes.add(name);else classes.delete(name);}},
        addEventListener(type,listener){this.listeners[type]=listener;},
        querySelector:node,querySelectorAll:()=>[],
      });
    }
    return nodes.get(selector);
  }
  const originals = new Map(['document','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(()=>{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>stored.get(key) ?? null,setItem(key,value){stored.set(key,value);writes.push([key,value]);}}});
  const offers = [
    {offerKey:'bottom:4253',offerId:'4253',productName:'Produto <teste> & nome comprido',scope:'bottom',sourceOrder:1,countriesVisible:['US']},
    {offerKey:'bottom:4018',offerId:'4018',productName:'Outra oferta',scope:'bottom',sourceOrder:2,countriesVisible:['DE']},
  ];
  let businessWrites=0;
  const mount=()=>{const view=mountHotOffersMsView({root:node('#hotOffersMsRoot'),actions:{saveDecision(){businessWrites++;}}});view.render({offers});return view;};
  const clickHide=key=>node('#rows').listeners.click({target:{closest:selector=>selector==='[data-action]'?{dataset:{action:'hide',key}}:null}});
  const visibility=value=>{node('#visibilityFilter').value=value;node('#visibilityFilter').listeners.change();};
  return {node,writes,mount,clickHide,visibility,get businessWrites(){return businessWrites;}};
}

test('Ocultar fica uma única vez em Produto; Abrir permanece em Ações e nomes são escapados', t => {
  const f=fixture(t), view=f.mount(), rows=f.node('#rows').innerHTML;
  const cells=[...rows.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)].map(match=>match[0]);
  const products=cells.filter(cell=>cell.includes('data-col="product"'));
  assert.equal(products.length,2);
  for(const cell of products){
    assert.match(cell,/class="product-cell hub-edit-host"/);
    assert.match(cell,/<button type="button" class="hub-corner-edit" data-action="hide"/);
    assert.match(cell,/>Ocultar<\/button>/);
    assert.doesNotMatch(cell,/class="table-action"/);
  }
  assert.ok(products[0].includes('Produto &lt;teste&gt; &amp; nome comprido'));
  assert.match(products[0],/aria-label="Ocultar Produto &lt;teste&gt; &amp; nome comprido"/);
  assert.equal((rows.match(/data-action="hide"/g)||[]).length,2);
  for(const cell of cells.filter(cell=>cell.includes('data-action="detail"'))){
    assert.match(cell,/>Abrir<\/button>/);
    assert.doesNotMatch(cell,/data-action="hide"/);
  }
  assert.equal(view.getActiveOfferKey(),null);
});

test('ocultar, filtrar e reexibir preservam a preferência existente e não abrem ficha nem salvam decisões', t => {
  const f=fixture(t), view=f.mount();
  f.clickHide('bottom:4253');
  assert.deepEqual(f.writes,[['hot-offers-ms-hidden-v1','["bottom:4253"]']]);
  assert.doesNotMatch(f.node('#rows').innerHTML,/data-offer="bottom:4253"/);
  assert.match(f.node('#rows').innerHTML,/data-offer="bottom:4018"/);
  assert.equal(view.getActiveOfferKey(),null);
  f.visibility('hidden');
  assert.match(f.node('#rows').innerHTML,/>Reexibir<\/button>/);
  assert.doesNotMatch(f.node('#rows').innerHTML,/data-offer="bottom:4018"/);
  f.visibility('all');
  assert.equal((f.node('#rows').innerHTML.match(/data-offer=/g)||[]).length,2);
  f.visibility('visible');
  f.mount();
  assert.doesNotMatch(f.node('#rows').innerHTML,/data-offer="bottom:4253"/,'reabrir conserva ofertas ocultas');
  f.visibility('hidden');
  f.clickHide('bottom:4253');
  assert.deepEqual(f.writes.at(-1),['hot-offers-ms-hidden-v1','[]']);
  f.visibility('visible');
  assert.equal((f.node('#rows').innerHTML.match(/data-offer=/g)||[]).length,2);
  assert.equal(f.businessWrites,0);
});
