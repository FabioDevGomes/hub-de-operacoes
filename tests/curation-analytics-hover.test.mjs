import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../src/curadoria/', import.meta.url);
const [sharedCss, ecommerce, hotPage, hotView, smartPage, smartView, clickbankPage, clickbankView] = await Promise.all([
  readFile(new URL('trends-sheet.css', root), 'utf8'),
  readFile(new URL('top-performance/index.html', root), 'utf8'),
  readFile(new URL('hot-offers-ms/index.html', root), 'utf8'),
  readFile(new URL('hot-offers-ms/hot-offers-ms-view.mjs', root), 'utf8'),
  readFile(new URL('smartadv-offers/index.html', root), 'utf8'),
  readFile(new URL('smartadv-offers/smartadv-offers-view.mjs', root), 'utf8'),
  readFile(new URL('clickbank-top-offers/index.html', root), 'utf8'),
  readFile(new URL('clickbank-top-offers/clickbank-top-offers-view.mjs', root), 'utf8'),
]);

assert.ok(sharedCss.includes('html body :is(.table-action[data-action="trends"],.table-action[data-action="glimpse"],.table-action[data-action="images"]):is(:hover,:focus-visible){filter:brightness(1.25);transform:translateY(-1px);outline:2px solid rgba(101,169,255,.45);outline-offset:2px}'),
  'atalhos analíticos usam o hover e foco visual compartilhados');
assert.match(sharedCss, /html body :is\(\.glimpse-badge,\.table-action\[data-action="glimpse"\]\)\{border:0;background:transparent\}/,
  'a informação da coluna Glimpse não mantém borda nem fundo de botão');

for (const [name, page] of [['E-commerce GM', ecommerce], ['Hot Offers MS', hotPage], ['SmartAdv', smartPage], ['Top Offers CB', clickbankPage]]) {
  assert.match(page, /trends-sheet\.css\?v=20261006-curation-header-color/, `${name} invalida o cache do estilo compartilhado atualizado`);
}

for (const [name, view] of [['Hot Offers MS', hotView], ['SmartAdv', smartView], ['Top Offers CB', clickbankView]]) {
  assert.ok(view.includes('title="Abrir Google Trends"'), `${name} mantém tooltip nativo em Google Trends`);
  assert.ok(view.includes('title="Abrir Google Imagens"'), `${name} mantém tooltip nativo em Imagens`);
  assert.ok(view.includes('Última análise ') && view.includes('Abrir Glimpse'), `${name} mantém tooltip contextual em Glimpse`);
}

assert.match(ecommerce, /function trendsBadge\(item\)[\s\S]*?title="\$\{safe\(title\)\}"/,
  'E-commerce GM mantém tooltip em Google Trends');
assert.match(ecommerce, /function imagesBadge\(item\)[\s\S]*?title="\$\{safe\(title\)\}"/,
  'E-commerce GM mantém tooltip em Imagens');
assert.match(ecommerce, /function topGlimpseBadge\(item\)[\s\S]*?title="\$\{safe\(analysis\?`Última análise:/,
  'E-commerce GM mantém tooltip contextual em Glimpse');

console.log('curation analytics hover ok');
