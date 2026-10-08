import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const shared = await read('src/curadoria/trends-sheet.css');
assert.equal(shared, await read('dist/curadoria/trends-sheet.css'));
assert.match(shared, /\.glimpse-badge:hover:not\(:focus-visible\)\{outline:none\}/);
assert.match(shared, /\.glimpse-badge:focus-visible\{outline:2px solid[^}]+outline-offset:2px\}/);
for (const match of shared.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (!match[1].includes('glimpse-badge') && !match[1].includes('[data-action="glimpse"]')) continue;
  if (match[1].includes(':hover') && !match[1].includes('glimpse-shortcut')) assert.doesNotMatch(match[2], /outline:\s*2px/, 'hover Glimpse não pode restaurar contorno decorativo');
}
const lists = [
  ['top-performance', null], ['gerentes', null],
  ['hot-offers-ms', 'hot-offers-ms-view.mjs'],
  ['smartadv-offers', 'smartadv-offers-view.mjs'],
  ['clickbank-top-offers', 'clickbank-top-offers-view.mjs'],
];
for (const [name, module] of lists) {
  for (const directory of ['src','dist']) {
    const html = await read(directory + '/curadoria/' + name + '/index.html');
    assert.ok(html.includes('trends-sheet.css?v=20261007-glimpse-borderless'), name + ' usa a folha atual');
    assert.ok(html.includes('hub-table-button-behavior'), name + ' adota o comportamento de tabela');
    const view = module ? await read(directory + '/curadoria/' + name + '/' + module) : html;
    assert.ok(view.includes('glimpse-badge'), name + ' mantém o atalho Glimpse');
    if (!module) {
      const functionName = name === 'gerentes' ? 'managerGlimpseBadge' : 'topGlimpseBadge';
      const badge = view.match(new RegExp('function ' + functionName + '[^\n]+'))?.[0] || '';
      assert.ok(badge.includes('<a class="glimpse-badge hub-table-button-appearance '));
      assert.ok(badge.includes('href="${safe(href)}"'));
      assert.ok(!badge.includes('role="button"'), 'link não muda de semântica');
      assert.equal((view.match(/hub-table-button-appearance/g) || []).length, 1, 'opt-in restrito ao Glimpse');
    } else {
      assert.ok(view.includes('data-action="glimpse"'));
      assert.ok(view.includes('data-curation-focus="glimpse"'));
    }
  }
}
const radar = await read('src/curadoria/index.html');
assert.ok(!radar.includes('class="glimpse-badge'), 'Radar não possui coluna Glimpse');
console.log('cinco colunas Glimpse: hover sem contorno; foco e semântica preservados');
