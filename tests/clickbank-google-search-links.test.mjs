import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as Images from '../dist/curadoria/image-search-domain.mjs';

const view=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers.css',import.meta.url),'utf8');

assert.equal(Images.googleSearchUrl('Gluco Extend','US'),'https://www.google.com/search?q=Gluco+Extend&gl=us&hl=en');
assert.equal(Images.googleSearchUrl('Produto teste','DE'),'https://www.google.com/search?q=Produto+teste&gl=de&hl=de');
assert.equal(Images.googleSearchUrl('Produto teste','CA'),'https://www.google.com/search?q=Produto+teste&gl=ca&hl=en');
for(const country of ['US','DE','CA'])assert.doesNotMatch(Images.googleSearchUrl('Produto teste',country),/[?&](?:udm|tbm|sxsrf|fbs|ved)=/);

assert.ok(view.includes("metadata=metadataFor(item),countries=metadata.manualCountries||[],productName=String(metadata.canonicalProductName||'').trim()"),'a pesquisa é associada ao nome canônico salvo e aos países já listados na ficha');
assert.ok(view.includes("const country=header.closest('.image-country-card')?.querySelector('[data-image-search]')?.dataset.imageSearch;"),'cada link deriva o GEO do seu cartão');
assert.ok(view.includes('if(!productName){const note=document.createElement(\'span\')')&&view.includes('Defina o nome do produto para gerar a busca.'),'sem nome canônico, a ficha explica como liberar o link');
assert.ok(view.includes('link.href=Images.googleSearchUrl(productName,country)'),'o link usa o nome salvo e a localização do cartão');
assert.ok(view.includes("link.target='_blank';link.rel='noopener noreferrer';link.textContent='Pesquisar no Google'"),'o link abre a pesquisa normal em nova aba');
assert.match(css,/\.image-google-search-link\{[^}]*text-decoration:underline/,'o atalho tem aparência de link');
assert.match(css,/\.image-google-search-link:focus-visible\{outline:2px solid/,'o link mantém foco de teclado visível');

console.log('clickbank google search links ok');
