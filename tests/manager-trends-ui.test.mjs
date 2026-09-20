import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../dist/curadoria/gerentes/index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/curadoria/trends-sheet.css',import.meta.url),'utf8');

assert.ok(html.includes('Países explícitos da oferta'),'lista consultiva de países ausente da tela Trends');
assert.ok(html.includes('Selecione até cinco países'),'limite de cinco países não está explicado na tela');
assert.ok(html.includes('managerTrendsCountries.length<5'),'limite de cinco países não está implementado');
assert.ok(html.includes('slice(0,5)'),'restauração das avaliações ainda limita os países a menos de cinco');
assert.ok(html.includes('countries:[...managerTrendsCountries]'),'países não são persistidos com a avaliação');
assert.ok(html.includes('Produto novo')&&html.includes('Produto antigo'),'classificação de momento do produto ausente');
assert.ok(html.includes('productAge:managerTrendsProductAge||null'),'momento do produto não é persistido');
assert.ok(html.includes('closeManagerSheet();await refresh()'),'a ficha não fecha e atualiza depois de salvar');
assert.ok(html.includes("productAgeLabel(latest?.productAge)"),'momento do produto não aparece no selo da listagem');
assert.ok(html.includes('assessmentCountries(latest)'),'países não aparecem no selo da listagem');
assert.ok(html.includes('Histórico das avaliações'),'histórico visível das avaliações ausente');
assert.ok(html.includes('TrendsDomain.appendAssessment'),'alterações do mesmo dia ainda substituem o histórico');
assert.ok(css.includes('.trends-country-action.selected'),'seleção visual do país ausente');
assert.ok(css.includes('row-gap:12px'),'espaçamento vertical dos botões de país ausente');
assert.ok(!html.includes('Visão Clássica')&&!html.includes('Visão Moderna'),'blocos antigos de colagem ainda aparecem na tela');
assert.ok(html.includes("button.classList.toggle('selected',selected)"),'último resultado não volta destacado');
assert.ok(css.includes('.trends-result-action.selected'),'destaque visual do último resultado ausente');
assert.ok(css.includes('grid-template-columns:repeat(6,minmax(0,1fr))'),'botões de resultado não foram compactados');

console.log('manager trends ui ok');
