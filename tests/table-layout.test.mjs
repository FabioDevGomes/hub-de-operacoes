import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [source, built, app, overviewTemplate, overviewCss, testedTemplate, diaryTemplate, cpaTemplate, macroTemplate] = await Promise.all([
  read('../src/table-layout.css'),
  read('../dist/table-layout.css'),
  read('../dist/index.html'),
  read('../src/overview/template.html'),
  read('../src/overview/overview.css'),
  read('../src/tested-products/template.html'),
  read('../src/product-diary/template.html'),
  read('../src/cpa/template.html'),
  read('../src/control-macro/template.html'),
]);

assert.equal(built, source, 'o build publica a folha compartilhada sem divergência');
assert.match(source, /--hub-table-row-bg:\s*#101E33/i);
assert.match(source, /--hub-table-row-hover-bg:\s*rgba\(79,\s*167,\s*255,\s*\.12\)/);
assert.match(source, /\.hub-table-layout tbody td/);
assert.match(source, /\.tablewrap > table tbody td/);
assert.match(source, /:not\(\.selected\):not\(\[data-detail-row\]\):hover/);
assert.doesNotMatch(source, /(?:^|[;\s])color\s*:/im, 'a folha de layout não altera cores semânticas de texto');
assert.ok(app.includes('/table-layout.css?v=1'), 'a SPA carrega o CSS compartilhado');
assert.ok(app.includes('class="totals-table hub-table-layout"'), 'a Visão Geral usa o componente compartilhado');
assert.ok(overviewTemplate.includes('class="totals-table hub-table-layout"'));
assert.ok(testedTemplate.includes('class="catalog-table hub-table-layout"'));
assert.ok(diaryTemplate.includes('class="product-table hub-table-layout"'));
assert.ok(diaryTemplate.includes('<table class="hub-table-layout" aria-label="ROI no registro'));
assert.ok(cpaTemplate.includes('class="cpa-summary hub-table-layout"') && cpaTemplate.includes('<table class="hub-table-layout">'));
assert.ok(macroTemplate.includes('class="macro-table hub-table-layout"'));
assert.ok(overviewCss.includes('var(--hub-table-row-bg)') && overviewCss.includes('var(--hub-table-row-hover-bg)'));
assert.doesNotMatch(overviewCss, /nth-child\(even\).*background/i, 'a tabela não reintroduz faixas alternadas');
assert.ok(overviewCss.includes('color:#ffc0c6') && overviewCss.includes('color:#d3b8bd'), 'alertas continuam com tipografia semântica própria');

for (const page of [
  '../src/curadoria/index.html',
  '../src/curadoria/gerentes/index.html',
  '../src/curadoria/clickbank-top-offers/index.html',
  '../src/curadoria/hot-offers-ms/index.html',
  '../src/curadoria/smartadv-offers/index.html',
  '../src/curadoria/top-performance/index.html',
  '../src/curadoria/glimpse/index.html',
]) {
  assert.ok((await read(page)).includes('/table-layout.css?v=1'), `${page} carrega o layout de tabela compartilhado`);
}
