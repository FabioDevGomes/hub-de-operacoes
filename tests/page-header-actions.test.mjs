import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const css = await read('src/curadoria/curation-header-actions.css');
const sidebar = await read('src/sidebar-component.css');
const consumers = [
  'index.template.html', 'asset-studio/index.html', 'preparador-MCC/index.html',
  'curadoria/index.html', 'curadoria/gerentes/index.html',
  'curadoria/top-performance/index.html', 'curadoria/hot-offers-ms/index.html',
  'curadoria/clickbank-top-offers/index.html', 'curadoria/smartadv-offers/index.html',
];
const scope = 'main>header:is(.topbar,.top,.page-head,.hero)>:is(.actions,.hero-actions)';

test('todas as telas do shell carregam a mesma regra, com cache atualizado', async () => {
  assert.match(sidebar, /@import url\("\/curadoria\/curation-header-actions\.css\?v=5"\)/);
  for (const path of consumers) {
    const source = await read(`src/${path}`);
    const publishedPath = path === 'index.template.html' ? 'index.html' : path;
    const published = await read(`dist/${publishedPath}`);
    assert.match(source, /sidebar-component\.css\?v=15/, path);
    assert.match(published, /sidebar-component\.css\?v=15/, publishedPath);
  }
  assert.match(await read('src/curadoria/glimpse/index.html'), /curation-header-actions\.css\?v=5/);
  assert.equal(await read('dist/sidebar-component.css'), sidebar);
  assert.equal(await read('dist/curadoria/curation-header-actions.css'), css);
});

test('o contrato é único para cabeçalhos e ações explicitamente opt-in', () => {
  // Cada seletor de regra, inclusive estados e mídia, mantém o escopo explícito.
  const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)]
    .map(match => match[1].trim()).filter(selector => !selector.startsWith('@') && selector !== ':root');
  assert.ok(selectors.length >= 8);
  const positionScopes = [
    'main:has(>header:is(.topbar,.top,.page-head,.hero)>:is(.actions,.hero-actions))',
    'main>header:is(.topbar,.top,.page-head,.hero):has(>:is(.actions,.hero-actions))',
  ];
  assert.ok(selectors.every(selector => selector.startsWith(scope) || selector.startsWith(`:is(${scope}>:is(.btn,.button),.hub-standard-action)`) || positionScopes.includes(selector)), selectors.join('\n'));
  assert.ok(css.includes('gap:var(--hub-page-action-gap,8px);flex-wrap:wrap'));
  for (const rule of ['min-height:36px', 'padding:8px 11px', 'border:0',
    'border-radius:10px', 'font-size:.78rem', 'font-weight:400',
    'display:inline-flex', 'text-decoration:none', 'white-space:nowrap']) {
    assert.ok(css.includes(rule), rule);
  }
});

test('distância superior de 16px é global e não depende de correções locais', async () => {
  assert.ok(css.includes('--hub-page-action-top:16px'));
  assert.ok(css.includes('@media(min-width:981px)'));
  assert.ok(css.includes('padding-top:var(--hub-page-action-top)!important'));
  assert.ok(css.includes('align-items:flex-start!important;margin-top:0'));
  assert.ok(css.includes('margin-top:0;transform:none;align-self:flex-start'));
  assert.doesNotMatch(await read('src/index.template.html'), /\.topbar>\.actions\{margin-top:-8px\}/);
  assert.doesNotMatch(await read('src/overview/knowledge-export.css'), /translateY\(-5px\)/);
});

test('o padrão preserva acessibilidade e não substitui cores de alerta', () => {
  assert.ok(css.includes(':not(.primary,.finish-button,.orange,.danger,.warn,.warning,.success,.error)'));
  assert.ok(css.includes('background:var(--hub-button-bg,#101e32)'));
  assert.ok(css.includes(':not(:disabled,[aria-disabled="true"]):is(:hover,:focus-visible)'));
  assert.ok(css.includes(':is(:disabled,[aria-disabled="true"]){opacity:.45;cursor:not-allowed}'));
  assert.ok(css.includes(':focus-visible{outline:2px solid rgba(101,169,255,.45);outline-offset:2px}'));
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(css.includes('{transition:none}'));
});
