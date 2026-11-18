import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sourcePage = await readFile(new URL('../src/curadoria/clickbank-top-offers/index.html', import.meta.url), 'utf8');
const sourceCss = await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers.css', import.meta.url), 'utf8');
const sharedSidebarCss = await readFile(new URL('../src/sidebar-component.css', import.meta.url), 'utf8');
const builtPage = await readFile(new URL('../dist/curadoria/clickbank-top-offers/index.html', import.meta.url), 'utf8');
const builtCss = await readFile(new URL('../dist/curadoria/clickbank-top-offers/clickbank-top-offers.css', import.meta.url), 'utf8');

assert.match(sourcePage, /<nav class="sidebar-nav hub-menu" data-hub-sidebar data-hub-sidebar-active="clickbank-top-offers"/, 'Top Offers CB usa a navegação compartilhada e marca a opção ativa');
assert.match(sourcePage, /sidebar-component\.js\?v=[^"']+/, 'a página monta o componente compartilhado do menu');
assert.match(sharedSidebarCss, /\.hub-sidebar-layout\.hub-sidebar-collapsed \{ grid-template-columns: 42px minmax\(0, 1fr\) !important; \}/, 'a largura recolhida continua sendo definida pelo shell compartilhado');
assert.match(sourceCss, /#clickbankTopOffersRoot #offerSheet\.product-sheet\{inset:0 0 0 224px\}/, 'a ficha deixa visível o menu expandido no desktop');
assert.match(sourceCss, /\.hub-sidebar-layout\.hub-sidebar-collapsed #clickbankTopOffersRoot #offerSheet\.product-sheet\{left:42px;inset-inline-start:42px\}/, 'a ficha acompanha o menu recolhido no desktop');
assert.match(sourceCss, /#clickbankTopOffersRoot #offerSheet:has\(\[data-panel="glimpse"\]:not\(\.hidden\)\)\{inset:0 0 auto 224px;width:auto\}/, 'Glimpse também preserva o menu expandido');
assert.match(sourceCss, /@media\(max-width:980px\)\{\s*#clickbankTopOffersRoot\{position:relative\}\s*#clickbankTopOffersRoot #offerSheet\.product-sheet\{position:absolute;inset:0;width:auto;min-height:100vh\}/, 'em telas estreitas a ficha começa abaixo do menu empilhado');
assert.match(sourceCss, /\.hub-sidebar-layout\.hub-sidebar-collapsed #clickbankTopOffersRoot #offerSheet\.product-sheet\{left:0;inset-inline-start:0\}/, 'o modo recolhido estreito continua alinhado à área principal');
assert.ok(builtPage.includes('clickbank-top-offers.css?v=53'), 'a página publicada aponta para o CSS atualizado');
assert.equal(builtCss, sourceCss, 'a distribuição contém exatamente o CSS da fonte canônica');

console.log('Top Offers CB conserva o menu compartilhado ao abrir a ficha.');
