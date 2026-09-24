import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {guruMediaOfferUrl} from '../src/curadoria/gurumedia-offer-link.mjs';

assert.equal(guruMediaOfferUrl('30468'), 'https://stats.gurumedia.com/offers/30468');
assert.equal(guruMediaOfferUrl(30468), 'https://stats.gurumedia.com/offers/30468');
assert.equal(guruMediaOfferUrl(''), null);
assert.equal(guruMediaOfferUrl('../offers/other'), null);
assert.equal(guruMediaOfferUrl('30468?redirect=example.com'), null);

const [top,manager] = await Promise.all([
  readFile(new URL('../src/curadoria/top-performance/index.html',import.meta.url),'utf8'),
  readFile(new URL('../src/curadoria/gerentes/index.html',import.meta.url),'utf8')
]);
const ui = await readFile(new URL('../src/curadoria/gurumedia-offer-links-ui.mjs',import.meta.url),'utf8');
assert.ok(top.includes('gurumedia-offer-links-ui.mjs?view=top'),'botão de oferta GuruMedia não está conectado ao E-commerce GM');
assert.ok(manager.includes('gurumedia-offer-links-ui.mjs?view=manager'),'botão de oferta GuruMedia não está conectado à Lista de Gerente');
assert.ok(top.includes('id="topProductAgeActions"')&&manager.includes('id="managerProductAgeActions"'),'ponto de inserção abaixo de Produto novo/Produto antigo não está presente');
assert.ok(ui.includes("document.querySelector('#sheetTitle')")&&ui.includes("document.querySelectorAll('#variantRows tr td:first-child')"),'IDs das ofertas não são lidos do contexto correto em cada tela');
assert.ok(ui.includes('target="_blank" rel="noopener noreferrer"')&&ui.includes('guruMediaOfferUrl(id)'),'atalho não abre a oferta correta em nova aba com proteção de navegação');

console.log('GuruMedia offer URL and UI wiring ok');
