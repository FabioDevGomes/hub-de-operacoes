import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const source=await readFile(new URL('../src/curadoria/gerentes/index.html',import.meta.url),'utf8');
const shared=await readFile(new URL('../src/table-edit-actions.css',import.meta.url),'utf8');
const sidebar=await readFile(new URL('../src/sidebar-component.js',import.meta.url),'utf8');

test('Lista de Gerente GM usa o nome do menu e o padrão compartilhado de Ocultar/Reexibir',()=>{
  assert.match(sidebar,/label:\s*'Lista de Gerente GM'/);
  assert.match(source,/<title>Lista de Gerente GM<\/title>/);
  assert.match(source,/<h1>Lista de Gerente GM<\/h1>/);
  assert.match(source,/table-edit-actions\.css\?v=3/);
  assert.match(source,/class="product-cell hub-edit-host" data-col="product"/);
  assert.match(source,/class="item-visibility hub-corner-edit \$\{hidden\?'restore':''\}"/);
  assert.match(source,/\.product-cell\.hub-edit-host\{padding-right:54px\}/);
  assert.match(shared,/html body table :is\(thead,tbody\) :is\(th,td\) :is\(a,button\):is\(\.hub-corner-edit,\.hub-discreet-action\)/);
  assert.match(shared,/:is\(\.hub-corner-edit,\.hub-discreet-action\)\{[^}]*background:transparent!important;box-shadow:none!important;/);
  assert.match(shared,/font-size:\.65rem!important/);
  assert.match(shared,/text-decoration:underline dotted/);
  assert.match(shared,/:hover\{[^}]*color:#b6d4f2[^}]*box-shadow:none!important/);
  assert.match(shared,/:focus-visible\{outline:2px solid[^}]*!important/);
  assert.doesNotMatch(source,/\.item-visibility(?:\.restore|:hover)?\{/);
});

test('Ocultar/Reexibir da Lista de Gerente GM mantém persistência, filtro e clique isolado',()=>{
  assert.match(source,/const HIDDEN_PRODUCTS_PREFS='radar-gerentes-itens-ocultos-v1'/);
  assert.match(source,/localStorage\.setItem\(HIDDEN_PRODUCTS_PREFS,JSON\.stringify\(\[\.\.\.hiddenProducts\]\)\)/);
  assert.match(source,/<option value="visible">Itens visíveis<\/option><option value="hidden">Itens ocultos<\/option><option value="all">Todos os itens<\/option>/);
  assert.match(source,/button\.onclick=event=>\{event\.stopPropagation\(\);setProductHidden\(button\.dataset\.toggleProductVisibility,button\.dataset\.hidden!=='true'\)\}/);
});
