import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const lists = [
  ['index.html', 'toolbar'],
  ['gerentes/index.html', 'toolbar'],
  ['top-performance/index.html', 'filter-grid'],
  ['hot-offers-ms/index.html', 'filter-grid'],
  ['smartadv-offers/index.html', 'filters'],
  ['clickbank-top-offers/index.html', 'filter-grid'],
];

test('six curation lists opt into the same compact stylesheet in source and build', async () => {
  const source = await read('src/curadoria/curation-table-filters.css');
  assert.equal(await read('dist/curadoria/curation-table-filters.css'), source);
  for (const [path, container] of lists) {
    const html = await read(`src/curadoria/${path}`);
    assert.equal(await read(`dist/curadoria/${path}`), html, path);
    assert.ok(html.includes(`class="${container} hub-curation-table-filters"`), path);
    assert.equal((html.match(/hub-curation-table-filters/g) || []).length, 1, path);
    assert.ok(html.includes('href="/curadoria/curation-table-filters.css?v=2"'), path);
  }
});

test('compact measurements are scoped to list filters without overriding widths or focus', async () => {
  const css = await read('src/curadoria/curation-table-filters.css');
  const rule = css.match(/\.hub-curation-table-filters :is\(input, select\)\.control\s*\{([^}]*)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /height:\s*32px/);
  assert.match(rule, /min-height:\s*32px/);
  assert.match(rule, /padding:\s*7px/);
  assert.match(rule, /font-size:\s*\.74rem/);
  assert.match(rule, /box-sizing:\s*border-box/);
  assert.doesNotMatch(rule, /(?:width|background|border|outline)\s*:/);
  assert.doesNotMatch(css, /(?:^|\n)(?:input|select|\.control|\.btn|button)\s*\{/);
});

test('GM clear and columns actions reuse the Hub shadow, with keyboard and disabled states', async () => {
  const [html, css, header] = await Promise.all([
    read('src/curadoria/top-performance/index.html'),
    read('src/curadoria/curation-table-filters.css'),
    read('src/curadoria/curation-header-actions.css'),
  ]);
  assert.match(html, /<button class="btn hub-table-toolbar-action" id="clearFilters">Limpar filtros<\/button>/);
  assert.match(html, /<summary class="btn hub-table-toolbar-action">Colunas<\/summary>/);
  for (const shadow of ['0 4px 9px rgba(0,0,0,.55)', '0 5px 12px rgba(0,0,0,.65)']) {
    assert.ok(css.replaceAll(' ', '').includes(shadow.replaceAll(' ', '')));
    assert.ok(header.replaceAll(' ', '').includes(shadow.replaceAll(' ', '')));
  }
  assert.match(css, /:not\(:disabled,\[aria-disabled="true"\]\):is\(:hover,:focus-visible\)/);
  assert.match(css, /outline:\s*2px solid var\(--hub-control-focus/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  for (const [path] of lists.filter(([path]) => path !== 'top-performance/index.html')) {
    assert.doesNotMatch(await read(`src/curadoria/${path}`), /hub-table-toolbar-action/);
  }
});
