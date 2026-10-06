import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page = await readFile(new URL('../src/curadoria/clickbank-top-offers/index.html', import.meta.url), 'utf8');
const view = await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs', import.meta.url), 'utf8');
const controller = await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers.css', import.meta.url), 'utf8');
const sharedCss = await readFile(new URL('../src/curadoria/trends-sheet.css', import.meta.url), 'utf8');

assert.match(css, /#clickbankTopOffersRoot #captureSelect,#clickbankTopOffersRoot #search\{border:0\}/, 'somente os controles de captura e busca indicados ficam sem borda');
assert.match(css, /#clickbankTopOffersRoot #captureSelect:focus-visible,#clickbankTopOffersRoot #search:focus-visible\{outline:2px solid var\(--cb-blue\);outline-offset:2px\}/, 'os dois controles preservam foco de teclado visível');
assert.match(page, /clickbank-top-offers\.css\?v=7/, 'a folha alterada invalida o cache');

for (const id of ['clickbankTopOffersRoot','openImport','captureSelect','captureInfo','search','rows','importDialog','pasteArea','validateImport','confirmImport','exportBackup','restoreBackup','offerSheet','trendCountries','trendCandidate','trendResults','imageCountries','glimpseFrame']) {
  assert.ok(page.includes(`id="${id}"`), `elemento ${id} ausente da página`);
}
assert.ok(page.includes('data-hub-sidebar-active="clickbank-top-offers"'));
assert.ok(page.includes('Curadoria · ClickBank') && page.includes('Top Offers CB'));
assert.ok(page.includes('./clickbank-top-offers-page.mjs?v=8'));
assert.ok(controller.includes('./clickbank-top-offers-view.mjs?v=7'));
assert.ok(controller.includes("mountCurationListFocus('clickbank-top-offers'")&&controller.includes("blockingSelector:'#offerSheet:not(.hidden), #sharedDecisionDialog[open]'")&&controller.includes('highlightOnCapture:false'),'a lista captura o controle acionado e só pisca ao retornar da ficha/modal');
assert.ok(controller.includes('list-focus.mjs?v=2'),'o retorno usa a versão atualizada do helper compartilhado');
assert.match(view, /const \$ = \(selector,\s*root\) => root\.querySelector\(selector\);/, 'a busca singular recebe o seletor antes da raiz, como fazem os consumidores da view');
const rootStart = page.indexOf('<main id="clickbankTopOffersRoot">'), rootEnd = page.indexOf('</main>');
assert.ok(rootStart < page.indexOf('id="offerSheet"') && page.indexOf('id="offerSheet"') < rootEnd, 'a ficha fica sob a raiz da view');
assert.ok(rootStart < page.indexOf('id="importDialog"') && page.indexOf('id="importDialog"') < rootEnd, 'o diálogo e o campo de colagem ficam acessíveis ao adaptador');
assert.match(page, /<section class="sheet product-sheet hidden" id="offerSheet"/, 'a ficha usa o shell compartilhado de tela cheia, não fica abaixo da tabela');
assert.match(sharedCss, /\.product-sheet\{[^}]*position:fixed;inset:0;z-index:40;[^}]*overflow:auto/, 'o shell cobre a viewport com rolagem própria');
assert.match(sharedCss, /\.product-sheet\.hidden\{display:none\}/, 'fechar a ficha restaura a listagem sem remover dados');
assert.match(view, /if\(item\)openSheet\(item,button\.dataset\.action\)/, 'cada atalho abre diretamente sua aba na ficha');
assert.ok(view.includes('replace(/[&<>"\']/g'), 'texto importado deve ser escapado antes de gerar HTML');
assert.ok(view.includes('compareCapturedOffers') && view.includes('selected.page.total'));
assert.ok(view.includes('não são considerados saídas'), 'a UI informa que o recorte não permite inferir saídas');
assert.ok(controller.includes('captureId:`clickbank-${crypto.randomUUID()}`'));
assert.ok(controller.includes('await Storage.saveCapture(capture)'));
assert.ok(controller.includes('Storage.mergeBackup(payload)'));
for (const label of ['Google Trends','Glimpse','Imagens']) assert.ok(page.includes(`>${label}<`), `aba ${label} ausente`);
for (const key of ['trends','glimpse','images']) assert.ok(view.includes(`data-action="${key}"`), `coluna/ação ${key} ausente`);
assert.ok(page.includes('<th>Decisão</th>') && view.includes('DecisionUI.buttonHtml'), 'a tabela tem uma coluna de decisão');
assert.ok(view.includes('DecisionUI.openDecisionPicker') && controller.includes('Storage.putDecision(stored)'), 'a decisão é escolhida e salva exclusivamente em Top Offers CB');
assert.match(view, /<tr data-offer="\$\{escape\(item\.offerKey\)\}"/,'cada linha expõe sua identidade estável para restaurar rolagem e destaque');
for(const [kind,badge] of [['trends','trendBadge'],['glimpse','glimpseBadge'],['images','imageBadge']]) assert.match(view,new RegExp(`function ${badge}[\\s\\S]*?data-curation-focus="${kind}"`),`${kind} registra o controle acionado para piscar no retorno`);
assert.ok(controller.includes('Decisão salva somente em Top Offers CB'), 'a interface deixa claro o escopo da decisão');
assert.ok(view.includes('renderResultButtons') && view.includes('renderProductAgeButtons') && view.includes('renderImageResultButtons'), 'reutiliza os componentes compartilhados de Trends e Imagens');
assert.ok(view.includes('showRemoveForSaved:true'), 'candidatas negativas mantêm o X visível depois de reabrir a ficha');
assert.ok(controller.includes("origin:'clickbank-top-offers'"), 'eventos de análise são atribuídos à nova origem');
assert.ok(page.includes('O Marketplace não informa países') && view.includes('manualCountries'), 'não inventa GEO da origem e mantém países manuais separados');
assert.ok(css.includes('.top h1{') && css.includes('overflow-x') || css.includes('.tablewrap{overflow:auto'), 'layout mantém a tabela responsiva');
assert.ok(page.includes(' nada é salvo antes de você confirmar') || page.includes('Nada é salvo antes de você confirmar'));

console.log('clickbank top offers ui ok');

assert.match(page, /data-panel="glimpse"><iframe id="glimpseFrame"/, 'Glimpse acompanha GM sem cartão externo redundante');
assert.match(controller, /event.origin!==location.origin\|\|event.source!==frame.contentWindow/, 'resize/retorno do iframe têm origem e janela validadas');
assert.match(sharedCss, /curation-focus-row-pulse/,'a linha usa a animação compartilhada em azul-claro');
assert.match(controller, /hub-glimpse-resize[\s\S]*Math.max\(320,Math.ceil\(height\)\)/, 'altura incorpora conteúdo completo sem scroll interno');
assert.match(page, /id="finishImages" class="btn image-search-button"/, 'concluir usa o CTA azul compartilhado, sem primary verde concorrente');
assert.match(view, /\$\('#finishImages',root\)\.onclick=closeSheet/, 'concluir apenas fecha, sem salvar novamente');
assert.match(view, /Images.progress\(record.assessments\|\|\[\],countries\)/, 'progresso considera os países manuais sem presumir GEO');
assert.match(css, /#offerSheet \.card\{background:var\(--panel\);border-radius:16px/, 'o host fornece superfícies equivalentes à GM');
assert.match(css, /#offerSheet \.field-label\{display:block/, 'rótulo não fica junto ao input numa linha');
assert.match(css, /#offerSheet \.trends-search-row \.control\{width:100%\}/, 'termo utiliza toda a largura disponível');
assert.match(view, /\['message','sheetMessage'\]/, 'avisos não ficam escondidos atrás da ficha');
for(const id of ['trendsHistory','imagesHistory','allTrendsHistory','allImagesHistory']) assert.equal(page.split(`id="${id}"`).length-1,1, `histórico ${id} preserva um ID único`);
