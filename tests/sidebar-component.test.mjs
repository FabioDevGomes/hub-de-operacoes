import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/sidebar-component.js', import.meta.url), 'utf8');
const built = await readFile(new URL('../dist/sidebar-component.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../dist/sidebar-component.css', import.meta.url), 'utf8');
const viewRegistry = await readFile(new URL('../src/view-registry.js', import.meta.url), 'utf8');
assert.equal(built, source, 'o build deve publicar exatamente o componente canônico do menu');

const pages = [
  ['Visão Geral', '../dist/index.html', 'data-hub-sidebar-mode="app"'],
  ['Preparador MCC', '../dist/preparador-MCC/index.html', 'data-hub-sidebar-active="preparer"'],
  ['Radar SpyHero', '../dist/curadoria/index.html', 'data-hub-sidebar-active="radar"'],
  ['Lista de Gerente', '../dist/curadoria/gerentes/index.html', 'data-hub-sidebar-active="manager"'],
  ['E-commerce GM', '../dist/curadoria/top-performance/index.html', 'data-hub-sidebar-active="ecommerce"'],
  ['Top Offers CB', '../dist/curadoria/clickbank-top-offers/index.html', 'data-hub-sidebar-active="clickbank-top-offers"'],
  ['Hot Offers MS', '../dist/curadoria/hot-offers-ms/index.html', 'data-hub-sidebar-active="hot-offers-ms"'],
  ['Ofertas SmartAdv', '../dist/curadoria/smartadv-offers/index.html', 'data-hub-sidebar-active="smartadv-offers"'],
  ['Asset Studio', '../dist/asset-studio/index.html', 'data-hub-sidebar-active="asset-studio"'],
];

for (const [name, path, mode] of pages) {
  const html = await readFile(new URL(path, import.meta.url), 'utf8');
  assert.ok(html.includes('data-hub-sidebar'), `${name}: mount do menu compartilhado ausente`);
  assert.ok(html.includes(mode), `${name}: modo ou item ativo não foi configurado`);
  assert.ok(html.includes('sidebar-component.js') && html.includes('sidebar-component.css'), `${name}: dependência compartilhada não foi conectada`);
  assert.ok(html.includes('sidebar-component.css?v=15'), `${name}: cache do CSS compartilhado do menu está desatualizado`);
  assert.ok(html.includes('sidebar-component.js?v=20261008-collapse-icon'), `${name}: cache do ícone do menu está desatualizado`);
  assert.ok(html.includes('data-hub-sidebar-products'), `${name}: área Produtos não usa o componente`);
  assert.doesNotMatch(html, /data-sidebar-group="(?:operation|analysis|curation|creation|personal|products)"/, `${name}: grupos continuam copiados na página`);
  assert.doesNotMatch(html, /painel-sidebar-grupo-aberto-v1/, `${name}: implementação antiga do acordeão ainda está duplicada`);
}

const groupOrder = ['operation', 'analysis', 'finance', 'curation', 'creation', 'personal'];
let previous = -1;
for (const group of groupOrder) {
  const index = source.indexOf(`id: '${group}'`);
  assert.ok(index > previous, `ordem canônica de grupos inválida em ${group}`);
  previous = index;
}
for (const label of [
  'Visão geral', 'Preparador MCC', 'Controle Macro', 'Faturamento', 'Análise por faixa de CPA', 'Mapa por conta',
  'Observabilidade decisória', 'Observabilidade da Curadoria', 'Radar SpyHero', 'Lista de Gerente GM',
  'E-commerce GM', 'Top Offers CB', 'Hot Offers MS', 'Asset Studio', 'Ficha e Presell', 'Meu Tempo', 'Controle de gastos',
  'Produtos testados',
]) assert.ok(source.includes(label), `item ${label} ausente da configuração compartilhada`);
assert.doesNotMatch(source, /function productsMarkup|data-sidebar-toggle="products"|data-sidebar-group="products"/, 'Produtos testados deve ser um item direto, sem seção expansível Produtos');
const operationStart = source.indexOf("{ id: 'operation'");
const analysisStart = source.indexOf("{ id: 'analysis'");
const operationItems = source.slice(operationStart, analysisStart);
assert.ok(operationItems.includes("key: 'tested'") && operationItems.indexOf("key: 'tested'") > operationItems.indexOf("key: 'preparer'"), 'Produtos testados deve ficar diretamente após Preparador MCC em Operação');
const financeStart = source.indexOf("{ id: 'finance'");
const curationStart = source.indexOf("{ id: 'curation'");
const financeItems = source.slice(financeStart, curationStart);
assert.ok(!operationItems.includes("key: 'macro'"), 'Controle Macro não deve permanecer no grupo Operação');
assert.ok(financeItems.includes("key: 'macro'") && financeItems.includes("key: 'billing'"), 'Controle Macro e Faturamento devem compartilhar o grupo Financeiro');
assert.ok(source.includes("const topName = name === 'products' ? 'operation' : name"), 'abrir Produtos não mantém Operação expandida como grupo pai');
const creationStart = source.indexOf("{ id: 'creation'");
const creationEnd = source.indexOf("{ id: 'personal'", creationStart);
const creationItems = source.slice(creationStart, creationEnd);
assert.ok(creationItems.indexOf("key: 'asset-studio'") < creationItems.indexOf("key: 'copy'"), 'Asset Studio deve aparecer antes de Ficha e Presell no grupo Criação de ofertas');
assert.ok(!creationItems.includes("key: 'presell'"), 'Gerador de Pre-Sell não deve aparecer como tela separada');
for (const id of ['totalsNav', 'controlMacroNav', 'billingNav', 'cpaReportNav', 'accountReportNav', 'observabilityNav', 'curationObservabilityNav', 'testedProductsNav', 'timeNav', 'copyFichaNav']) {
  assert.ok(viewRegistry.includes(id) || source.includes(id), `ID de navegação SPA ${id} não foi preservado no registro`);
}
const registryContext=vm.createContext({window:{},URLSearchParams,encodeURIComponent});
vm.runInContext(viewRegistry,registryContext);
const views=registryContext.window.PanelViews;
assert.equal(views.definition('presell').navId,views.definition('copy').navId,'o alias de Pre-Sell deve ativar o mesmo item da tela unificada');
assert.equal(views.resolveRoute('/?view=presell').id,'copy','links antigos devem abrir Ficha e Presell, sem um segundo menu');
assert.ok(source.includes('definition?.navId'), 'a navegação SPA deve reutilizar os IDs do registro de telas');
assert.doesNotMatch(source, /Diário de campanha|id="campaignList"|id="activeListTab"|id="historyListTab"/, 'o acesso ao Diário agora pertence à Visão Geral, não ao menu lateral');
assert.ok(source.includes('body.animate(') && source.includes('prefers-reduced-motion: reduce') && source.includes('body.inert = !expanded'), 'animação, acessibilidade e movimento reduzido do acordeão devem continuar');
assert.ok(source.includes('productHost?.remove()'), 'host antigo de Produtos permanece visível fora de Operação');
assert.ok(source.includes('localStorage.setItem(STORAGE_KEY, name)'), 'preferência do grupo aberto não é compartilhada entre telas');
assert.ok(source.includes("const COLLAPSED_STORAGE_KEY = 'painel-sidebar-recolhido-v1'"), 'preferência de recolhimento do menu não é persistida');
assert.ok(source.includes('data-hub-sidebar-collapse-toggle') && source.includes('Expandir menu lateral') && source.includes('Recolher menu lateral'), 'controle acessível de recolhimento/expansão do menu ausente');
assert.ok(source.includes("layout?.classList.toggle('hub-sidebar-collapsed', collapsed)"), 'estado recolhido não é aplicado ao layout compartilhado');
assert.ok(css.includes('.hub-sidebar-layout.hub-sidebar-collapsed { grid-template-columns: 42px minmax(0, 1fr) !important; }') && css.includes('> :not(.hub-sidebar-collapse-toggle)'), 'modo recolhido não reduz a navegação a uma faixa estreita com controle visível');
assert.match(css, /\.hub-sidebar-layout\s*>\s*aside\.hub-sidebar-aside\s*\{\s*background:\s*#202a3c;\s*border:\s*0;/, 'a aparência global do menu deve vencer os estilos locais do aside nas telas independentes');
assert.ok(css.includes('.hub-menu-group.collapsed'), 'grupos expansíveis do menu devem permanecer');
const overviewTemplate=await readFile(new URL('../src/overview/template.html',import.meta.url),'utf8');
assert.doesNotMatch(source, /<input id="search"/, 'a busca foi movida do menu para a Visão Geral');
assert.match(overviewTemplate, /class="panel-controls">[\s\S]*?<input id="search"[^>]*aria-label="Buscar campanha"[^>]*><select id="campaignStatusFilter"/, 'busca acessível deve ficar antes do filtro de situação no cabeçalho, após a navegação de datas');
assert.match(overviewTemplate, /<option value="history">Histórico<\/option>/, 'registros históricos devem permanecer acessíveis no filtro da Visão Geral');
assert.doesNotMatch(css, /data-sidebar-group="operation"\)?:not\(\.collapsed\)[^{]*\{[^}]*flex:\s*1\s+1\s+auto/s, 'a seção Operação não deve crescer para ocupar o espaço vazio do menu');

const glimpse = await readFile(new URL('../dist/curadoria/glimpse/index.html', import.meta.url), 'utf8');
assert.ok(!glimpse.includes('data-hub-sidebar'), 'a tela transitória Glimpse deve permanecer focada e sem menu lateral');
console.log('shared sidebar component ok');
