import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {mediaScalersOfferUrl} from '../src/curadoria/hot-offers-ms/hot-offers-ms-view.mjs';

const html = await readFile(new URL('../src/curadoria/hot-offers-ms/index.html',import.meta.url),'utf8');
const css = await readFile(new URL('../src/curadoria/hot-offers-ms/hot-offers-ms.css',import.meta.url),'utf8');
const sidebarCss = await readFile(new URL('../src/sidebar-component.css',import.meta.url),'utf8');
const view = await readFile(new URL('../src/curadoria/hot-offers-ms/hot-offers-ms-view.mjs',import.meta.url),'utf8');
const page = await readFile(new URL('../src/curadoria/hot-offers-ms/hot-offers-ms-page.mjs',import.meta.url),'utf8');

test('a tela tem entrada independente, navegação comum e confirmação de lista completa por funil', () => {
  assert.match(html,/data-hub-sidebar-active="hot-offers-ms"/);
  assert.match(html,/href="\.\/hot-offers-ms\.css/);
  assert.match(html,/id="importScope"/);
  assert.match(html,/id="completeListConfirm"/);
  assert.match(html,/Confirmo que colei a lista completa/);
  assert.match(html,/class="modalbody import-body"/);
  assert.match(html,/class="preview-metrics" id="previewMetrics"/);
  assert.match(html,/id="previewStatus"/);
  assert.match(html,/id="previewIssues"/);
  assert.match(view,/\['Interpretadas',preview\.parsedCount\]/);
  assert.match(view,/\['Países alterados',summary\.countryChanges/);
  assert.match(view,/\['Categoria alterada',summary\.categoryChanges/);
  assert.match(page,/if \(!preview\.valid \|\| !pendingImport\) return/);
  assert.match(page,/completeListConfirmed:true/);
});

test('a view encaminha filtros e ações sem acessar persistência', () => {
  assert.doesNotMatch(html,/id="countryFilter"|Todos os países/,'a tela não deve exibir o filtro de países');
  assert.doesNotMatch(view,/countryFilter|country:value\(/,'a view não deve encaminhar o filtro de países');
  assert.doesNotMatch(html,/id="paymentMax"|Pagamento máx\./,'a tela não deve exibir o filtro de pagamento máximo');
  assert.doesNotMatch(view,/paymentMax/,'a view não deve encaminhar o filtro de pagamento máximo');
  for (const label of ['Google Trends','Google Imagens','Glimpse','Histórico','Afiliação','Movimento','Decisão']) assert.ok((html + view).includes(label),label + ' ausente da tela');
  for (const callback of ['saveDecision','saveTrend','saveImage','openGlimpse','openCollection','addManualCountry','openImagesExcluding']) assert.ok((view + page).includes('actions.' + callback) || page.includes('function ' + callback),callback + ' não é encaminhado');
  assert.match(view,/Candidatas negativas/,'a ficha deve permitir registrar candidatas para exclusão em Imagens');
  assert.doesNotMatch(view,/indexedDB|openHotOffersMsDB|\.put\(/,'a view não deve abrir nem gravar no banco');
  assert.match(page,/mountCurationListFocus\('hot-offers-ms'/,'o retorno da ficha deve preservar foco/rolagem');
});

test('Enter salva a candidata positiva e atualiza a lista na hora, como na E-commerce GM', () => {
  const addCandidate = page.match(/async function addTrendCandidate\(offerKey,value\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(addCandidate,'ação de salvar candidata ausente');
  assert.match(addCandidate,/await Storage\.put\(Storage\.STORES\.trends,stored\)[\s\S]*?trends = \[\.\.\.trends\.filter[\s\S]*?show\(\); view\.refreshOffer\(item,'trends'\)/,'a persistência atualiza primeiro o estado da view, antes de renderizar a ficha novamente');
  assert.match(addCandidate,/return true/,'o formulário só limpa o campo quando a persistência confirma sucesso');
  assert.match(view,/async function submitTrendCandidate\(input = \$\('#trendCandidate'\)\)[\s\S]*?await actions\.addTrendCandidate\(activeOfferKey,input\.value\)[\s\S]*?if \(saved\) input\.value = ''[\s\S]*?input\.focus\(\)/,'após salvar, a candidata aparece, o campo limpa e o foco fica pronto para a próxima');
  assert.match(view,/event\.key === 'Enter'[\s\S]*?event\.preventDefault\(\); void submitTrendCandidate\(event\.currentTarget\)/,'Enter envia a candidata sem submeter a página nem exigir clique adicional');
});

test('os filtros ficam em uma linha com a tipografia compacta do E-commerce GM', () => {
  assert.match(html,/\.filter-grid\{display:grid;grid-template-columns:[^}]+;[^}]*overflow-x:auto\}/,'a barra deve ter uma única grade horizontal rolável');
  assert.match(html,/\.filter-grid \.control\{[^}]*font-size:\.74rem/,'os campos devem usar o tamanho de fonte do E-commerce GM');
  assert.match(html,/\.filter-grid \.btn\{[^}]*font-size:\.74rem;white-space:nowrap/,'os botões devem manter a mesma tipografia e não quebrar linha');
});

test('o cabeçalho usa a convenção de título das telas de Curadoria', () => {
  assert.match(html,/<header class="top"><div><div class="eyebrow">Curadoria · MediaScalers<\/div><h1>Hot Offers MS<\/h1><div class="sub">/);
  assert.match(sidebarCss,/\.shell:has\(> aside \.hub-menu\[data-hub-sidebar-active="hot-offers-ms"\]\) > main > header\.top h1 \{ font-size: 1\.2rem; \}/,'o título principal deve ter o mesmo tamanho efetivo do E-commerce GM');
});

test('a tabela não exibe o selo HOT ao lado do nome do produto', () => {
  assert.doesNotMatch(view,/class="hot-pill">HOT/);
  assert.match(view,/item\.productName/,'o nome do produto permanece visível na tabela');
});

test('as abas compartilhadas seguem a ordem da E-commerce GM e preservam o Resumo específico', () => {
  const tabs = [...html.matchAll(/<button class="btn(?: active)?" data-tab="([^"]+)"[^>]*>([^<]+)<\/button>/g)];
  assert.deepEqual(tabs.map(([,key]) => key),['overview','trends','glimpse','images','history']);
  assert.deepEqual(tabs.slice(1).map(([, ,label]) => label),['Google Trends','Glimpse','Google Imagens','Histórico']);
  assert.match(html,/data-panel="overview"[\s\S]*?Decisão de curadoria[\s\S]*?Dados da oferta/,'o resumo mantém as ações próprias da Hot Offers MS');
});

test('Glimpse na Hot Offers MS acompanha o layout embutido da E-commerce GM', () => {
  assert.match(html,/#offerSheet:has\(\[data-panel="glimpse"\]:not\(\.hidden\)\)\{padding:0\}/,'somente a aba Glimpse ocupa a mesma área da E-commerce GM');
  assert.match(html,/#offerSheet:has\(\[data-panel="glimpse"\]:not\(\.hidden\)\) \.sheet-inner\{max-width:1280px;padding:24px\}/,'a largura e o recuo da aba Glimpse seguem a ficha da E-commerce GM');
  assert.match(html,/#offerSheet \[data-panel="glimpse"\]>.card\{padding:0;margin:0;border:0;border-radius:0;background:transparent\}/,'o cartão extra não envolve visualmente a análise');
  assert.match(html,/#offerSheet \[data-panel="glimpse"\]>.card>p:first-child\{display:none\}/,'o texto introdutório extra não aparece no painel');
  assert.match(html,/data-panel="glimpse"[^>]*>[\s\S]*?iframe id="glimpseFrame" class="glimpse-embedded-frame"/,'o Glimpse continua incorporado e mantém a mesma tela funcional');
});

test('Google Trends oferece link da oferta na MediaScalers usando somente Offer ID numérico', () => {
  assert.equal(mediaScalersOfferUrl('2323'),'https://admin.mediascalers.com/offers/2323');
  assert.equal(mediaScalersOfferUrl('4679'),'https://admin.mediascalers.com/offers/4679');
  assert.equal(mediaScalersOfferUrl('../2323'),null,'IDs inválidos não podem alterar o destino do link');
  assert.equal(mediaScalersOfferUrl(''),null);
  assert.match(html,/class="trends-search-actions"><button class="btn primary" id="openTrends"/,'a pesquisa fica como única ação ao lado do termo, igual à E-commerce GM');
  assert.doesNotMatch(html,/id="openPlatformOffer"/,'o link de oferta não fica mais agrupado à pesquisa de Trends');
  assert.match(view,/function renderMediaScalersOfferLink\(item\)/,'a ação de oferta tem renderizador próprio da ficha');
  assert.match(view,/ageRow\.after\(group\)/,'a ação fica após o seletor de momento do produto, como na E-commerce GM');
  assert.match(view,/trends-offer-link[^`]*Abrir oferta #\$\{escape\(offerId\)\}/,'a ação mostra o Offer ID no mesmo formato compacto da E-commerce GM');
  assert.match(view,/target="_blank" rel="noopener noreferrer" aria-label="Abrir oferta \$\{escape\(offerId\)\} na MediaScalers"/,'o link mantém acesso externo seguro e rótulo acessível');
  assert.match(view,/mediaScalersOfferUrl\(offerId\)/,'o destino continua validado e específico à MediaScalers');
  assert.match(html,/trends-sheet\.css\?v=20261004-open-offer-button/,'a ficha carrega a folha compartilhada atualizada');
  assert.match(sharedCurationCss,/,\.trends-offer-links-group\{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:11px\}/,'a ação reutiliza a apresentação compacta da E-commerce GM');
  assert.match(sharedCurationCss,/,\.trends-offer-link\{display:inline-flex;align-items:center;padding:6px 9px;font-size:\.74rem;text-decoration:none\}/,'o botão de oferta mantém o mesmo tamanho do padrão');
  assert.match(sharedCurationCss,/\.image-country-list>\.image-country-card\{margin:0;padding:12px 14px\}/,'os cartões de países mantêm o mesmo espaçamento mesmo com estilos locais');
  assert.match(view,/candidateEntry\.classList\.add\('trends-keyword-entry'\)/,'o editor de candidatas segue a estrutura usada pela E-commerce GM');
  assert.match(view,/KeywordCandidatesUI\.renderKeywordCandidates\(\$\('#trendCandidates'\)/,'a lista usa diretamente o componente compartilhado');
  assert.match(view,/countryChips\.after\(countryEditor,message\)/,'a inclusão manual de país segue o padrão compartilhado da E-commerce GM');
  assert.match(view,/className = 'manual-country-entry'/,'a edição manual de país usa o layout compartilhado');
  assert.match(view,/Países explícitos da oferta/,'o título segue a ficha E-commerce GM');
  assert.match(view,/Selecione um resultado para salvar a avaliação/,'o resultado usa o cabeçalho compacto comum sem afirmar que a ficha fecha');
  assert.match(sharedCurationCss,/#offerSheet \.trends-search-row\{display:flex;gap:10px;align-items:end\}/,'a busca usa a disposição canônica da E-commerce GM sem dividir espaço com o link');
  assert.match(sharedCurationCss,/#offerSheet \.trends-result-actions\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\);gap:6px\}/,'os resultados usam a mesma grade do E-commerce GM');
  assert.match(sharedCurationCss,/#offerSheet \.trends-country-action\{border:1px solid #40516b;background:#172337/,'os países mantêm o estilo compartilhado');
});

test('as colunas Google Trends, Glimpse e Imagens seguem a ordem do E-commerce GM após Produto', () => {
  const columns = view.match(/const COLUMNS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
  const positions = ['product','trends','glimpse','images','category'].map(key => columns.indexOf(`['${key}'`));
  assert.ok(positions.every(position => position >= 0), 'todas as colunas esperadas devem existir');
  assert.deepEqual(positions,[...positions].sort((a,b) => a-b), 'Produto, Google Trends, Glimpse, Imagens e Categoria devem ficar nessa ordem');
});

test('o diálogo de coleta fica oculto fora do fluxo de importação e fecha após salvar', () => {
  assert.match(html,/<dialog id="importDialog" class="hidden">/);
  assert.match(view,/actions\.resetImport\(\); importDialog\.classList\.remove\('hidden'\); importDialog\.showModal\(\)/);
  assert.match(view,/importDialog\.addEventListener\('close',[\s\S]*?classList\.add\('hidden'\)/);
  assert.match(view,/closeImportDialog\(\) \{ if \(importDialog\.open\) importDialog\.close\(\); importDialog\.classList\.add\('hidden'\); \}/);
  assert.match(page,/view\.closeImportDialog\(\);[\s\S]*?await refresh\(\)/);
});
