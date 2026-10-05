import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page = await readFile(new URL('../src/curadoria/smartadv-offers/index.html', import.meta.url), 'utf8');
const view = await readFile(new URL('../src/curadoria/smartadv-offers/smartadv-offers-view.mjs', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/curadoria/smartadv-offers/smartadv-offers-page.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/curadoria/smartadv-offers/smartadv-offers.css', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../src/sidebar-component.js', import.meta.url), 'utf8');
const curationHome = await readFile(new URL('../src/curadoria/index.html', import.meta.url), 'utf8');

for (const id of ['smartAdvOffersRoot','openImport','captureSelect','captureInfo','search','verticalFilter','geoFilter','channelFilter','brandFilter','rows','importDialog','pasteArea','validateImport','confirmImport','exportBackup','restoreBackup','offerSheet','sheetTitle','trendsTerm','trendCountries','trendCandidate','trendResults','imagesTerm','imageCountries','glimpseFrame','addManualCountry']) {
  assert.ok(page.includes(`id="${id}"`), `elemento ${id} ausente da página`);
}
const appRootStart = page.indexOf('<main id="smartAdvOffersRoot">');
const appRootEnd = page.indexOf('</main>', appRootStart);
const importDialogStart = page.indexOf('<dialog id="importDialog"');
assert.ok(importDialogStart > appRootStart && importDialogStart < appRootEnd, 'o diálogo de importação deve ficar dentro da raiz da interface');
assert.ok(page.includes('data-hub-sidebar-active="smartadv-offers"'));
assert.ok(page.includes('Curadoria · SmartAdv') && page.includes('Ofertas SmartAdv'));
assert.match(page, /\.\/smartadv-offers-page\.mjs\?v=\d+/);
assert.match(view, /const \$ = \(selector, scope = document\) => scope\.querySelector\(selector\)/, 'a view resolve controles dentro da raiz recebida');
assert.ok(view.includes('replace(/[&<>"\']/g'), 'texto colado deve ser escapado antes de ir para HTML');
assert.ok(view.includes('captureOfferHistory') && view.includes('historyLabel'));
assert.ok(view.includes('ausências não são tratadas como ofertas removidas'));
assert.ok(view.includes('class="offer-name" title="${escape(item.productName)}">${escape(item.productName)}</td>'), 'a tabela mostra o nome do produto sem os metadados do título original');
for (const [label,tab] of [['Google Trends','trends'],['Glimpse','glimpse'],['Google Imagens','images']]) assert.ok(page.includes(`<th scope="col">${label}</th>`)&&page.includes(`data-tab="${tab}"`),`${label} tem coluna e painel de análise`);
assert.ok(page.includes('<th scope="col">Decisão</th>') && view.includes('DecisionUI.buttonHtml'), 'a tabela SmartAdv tem uma coluna de decisão');
assert.ok(view.includes('DecisionUI.openDecisionPicker') && controller.includes('Storage.putDecision(stored)'), 'a decisão é salva exclusivamente em Ofertas SmartAdv');
assert.ok(controller.includes('Decisão salva somente em Ofertas SmartAdv'), 'a interface deixa claro o escopo da decisão');
assert.ok(view.includes('KeywordCandidatesUI.renderKeywordCandidates')&&view.includes('showRemoveForSaved:true'),'candidatas negativas salvas podem ser removidas pelo X');
assert.ok(view.includes('data-image-candidate-input')&&view.includes("event.key==='Enter'"),'novas candidatas negativas são adicionadas com Enter');
assert.ok(view.includes('slice(0,5)')&&view.includes('Selecione no máximo cinco países'),'Google Trends respeita o limite de cinco países');
assert.ok(view.includes('data-curation-focus="trends"')&&view.includes('data-curation-focus="glimpse"')&&view.includes('data-curation-focus="images"'),'as três colunas preservam o retorno de foco para a linha da oferta');
assert.ok(view.includes('data/hora original não informadas'));
assert.ok(controller.includes('await Storage.saveCapture(capture)'));
assert.ok(controller.includes('Storage.mergeBackup(payload)'));
assert.ok(controller.includes('Storage.put(Storage.STORES.trends,stored)')&&controller.includes('Storage.put(Storage.STORES.images,stored)'));
assert.ok(controller.includes("origin:'smartadv-offers'")&&controller.includes('GlimpseStorage.getAllAnalyses()'));
assert.doesNotMatch(controller, /offers:\s*\[\s*raw|clipboardText:\s*raw/i, 'o texto bruto não deve ser salvo nas capturas');
assert.ok(css.includes('var(--bg') && css.includes('.filters{') && css.includes('@media(max-width:680px)'));
const tabsRule = css.match(/#offerSheet \.tabs\{[^}]*\}/)?.[0] || '';
const tabButtonRule = css.match(/#offerSheet \.tabs \.btn\{[^}]*\}/)?.[0] || '';
assert.ok(tabsRule.includes('display:grid') && tabsRule.includes('grid-template-columns:repeat(3,minmax(0,1fr))') && tabsRule.includes('width:min(100%,312px)') && tabsRule.includes('border:0'), 'as três abas usam um grupo compacto, sem borda e com colunas iguais');
assert.ok(tabButtonRule.includes('width:100%') && tabButtonRule.includes('min-height:34px') && tabButtonRule.includes('white-space:nowrap'), 'os botões das abas mantêm largura e altura uniformes');
assert.ok(css.includes('#offerSheet .tabs .btn:focus-visible{outline:2px solid var(--smartadv-blue)'), 'o foco de teclado continua visível nas abas');
assert.match(page, /smartadv-offers\.css\?v=8/);
assert.ok(sidebar.includes("{ key: 'smartadv-offers', label: 'Ofertas SmartAdv', href: '/curadoria/smartadv-offers/' }"));
assert.ok(curationHome.includes('href="/curadoria/smartadv-offers/"'), 'a entrada também aparece no início da Curadoria');

console.log('smartadv offers ui ok');
