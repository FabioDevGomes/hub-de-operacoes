import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const consumers = [
  ['Radar SpyHero', 'src/curadoria/index.html'],
  ['Lista de Gerente', 'src/curadoria/gerentes/index.html'],
  ['E-commerce GM', 'src/curadoria/top-performance/index.html'],
  ['Hot Offers MS', 'src/curadoria/hot-offers-ms/index.html'],
  ['Top Offers CB', 'src/curadoria/clickbank-top-offers/index.html'],
  ['Ofertas SmartAdv', 'src/curadoria/smartadv-offers/index.html'],
];
const sharedCss = await read('src/curadoria/curation-header-actions.css');
const trendsCss = await read('src/curadoria/trends-sheet.css');
assert.ok(trendsCss.includes('@import url("./curation-header-actions.css?v=1")'), 'as seis telas que compartilham Trends importam o padrão de cabeçalho');

for (const [screen, path] of consumers) {
  const page = await read(path);
  assert.ok(page.includes('trends-sheet.css?v=20261006-curation-header-actions'), `${screen} invalida o cache da folha compartilhada`);
}

const glimpsePage = await read('src/curadoria/glimpse/index.html');
assert.ok(glimpsePage.includes('/curadoria/curation-header-actions.css?v=1'), 'Glimpse independente carrega o mesmo padrão');
assert.match(sharedCss, /header:is\(\.topbar,\.top,\.page-head,\.hero\)>:is\(\.actions,\.hero-actions\)>:is\(\.btn,\.button\)/, 'a regra fica restrita às ações do cabeçalho principal');
assert.match(sharedCss, /min-height:36px;padding:8px 11px;border:0;font-size:\.78rem;font-weight:400;box-shadow:0 4px 9px rgba\(0,0,0,\.55\)/, 'o padrão combina dimensão compacta, peso regular, sem borda e sombra preta');
assert.match(sharedCss, /:is\(:hover,:focus-visible\)\{box-shadow:0 5px 12px rgba\(0,0,0,\.65\)\}/, 'a sombra aumenta no hover e foco');
assert.match(sharedCss, /:focus-visible\{outline:2px solid rgba\(101,169,255,\.45\);outline-offset:2px\}/, 'o foco de teclado continua visível');

const publishedCss = await read('dist/curadoria/curation-header-actions.css');
assert.equal(publishedCss, sharedCss, 'o build publica a folha compartilhada sem alterações');
console.log('curation header actions ok');
