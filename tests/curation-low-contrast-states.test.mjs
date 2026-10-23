import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {applyLowContrastClasses, lowContrastClassForBadge} from '../src/curadoria/curation-low-contrast-states.mjs';

test('somente os rótulos explicitamente sem pesquisa recebem classe neutra', () => {
  assert.equal(lowContrastClassForBadge('trends-badge','Não pesquisado'),'unsearched');
  assert.equal(lowContrastClassForBadge('trends-badge','Não pesquisado · !'),'unsearched');
  assert.equal(lowContrastClassForBadge('trends-badge','Sem dados'),'');
  assert.equal(lowContrastClassForBadge('glimpse-badge','Pesquisar'),'unsearched');
  assert.equal(lowContrastClassForBadge('glimpse-badge','4K · Misto'),'');
  assert.equal(lowContrastClassForBadge('image-badge','Não verificado'),'unverified');
  assert.equal(lowContrastClassForBadge('image-badge','1 de 2'),'');
  assert.equal(lowContrastClassForBadge('decision-badge','Não definido'),'');
});

test('aplica e remove as classes semânticas conforme o rótulo atual da linha', () => {
  const badges = new Map([
    ['.trends-badge',{textContent:'Não pesquisado',classes:new Set()}],
    ['.glimpse-badge',{textContent:'Pesquisar',classes:new Set()}],
    ['.image-badge',{textContent:'Dominante',classes:new Set(['unverified'])}],
  ]);
  for (const badge of badges.values()) badge.classList={toggle:(name,enabled)=>enabled?badge.classes.add(name):badge.classes.delete(name)};
  const row={querySelectorAll:selector=>badges.has(selector)?[badges.get(selector)]:[]};
  applyLowContrastClasses([row]);
  assert.ok(badges.get('.trends-badge').classes.has('unsearched'));
  assert.ok(badges.get('.glimpse-badge').classes.has('unsearched'));
  assert.ok(!badges.get('.image-badge').classes.has('unverified'));
});

test('todas as telas de lista da Curadoria carregam o CSS compartilhado', async () => {
  const root=new URL('../src/curadoria/',import.meta.url),version='20261021-curation-low-contrast';
  for(const path of ['index.html','gerentes/index.html','top-performance/index.html','hot-offers-ms/index.html','smartadv-offers/index.html','clickbank-top-offers/index.html','manual/index.html']){
    const html=await readFile(new URL(path,root),'utf8');
    assert.ok(html.includes(`trends-sheet.css?v=${version}`),`${path} atualiza o CSS de baixo contraste`);
  }
  const ecom=await readFile(new URL('top-performance/index.html',root),'utf8');
  assert.ok(ecom.includes('curation-low-contrast-states.mjs?v=1'),'a tabela inline aplica as classes após cada atualização');
});
