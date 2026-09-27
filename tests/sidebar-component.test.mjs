import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
  ['Asset Studio', '../dist/asset-studio/index.html', 'data-hub-sidebar-active="asset-studio"'],
];

for (const [name, path, mode] of pages) {
  const html = await readFile(new URL(path, import.meta.url), 'utf8');
  assert.ok(html.includes('data-hub-sidebar'), `${name}: mount do menu compartilhado ausente`);
  assert.ok(html.includes(mode), `${name}: modo ou item ativo não foi configurado`);
  assert.ok(html.includes('sidebar-component.js') && html.includes('sidebar-component.css'), `${name}: dependência compartilhada não foi conectada`);
  assert.ok(html.includes('data-hub-sidebar-products'), `${name}: área Produtos não usa o componente`);
  assert.doesNotMatch(html, /data-sidebar-group="(?:operation|analysis|curation|creation|personal|products)"/, `${name}: grupos continuam copiados na página`);
  assert.doesNotMatch(html, /painel-sidebar-grupo-aberto-v1/, `${name}: implementação antiga do acordeão ainda está duplicada`);
}

const groupOrder = ['operation', 'finance', 'analysis', 'curation', 'creation', 'personal'];
let previous = -1;
for (const group of groupOrder) {
  const index = source.indexOf(`id: '${group}'`);
  assert.ok(index > previous, `ordem canônica de grupos inválida em ${group}`);
  previous = index;
}
for (const label of [
  'Visão geral', 'Preparador MCC', 'Controle Macro', 'Faturamento', 'Análise por faixa de CPA', 'Mapa por conta',
  'Observabilidade decisória', 'Observabilidade da Curadoria', 'Radar SpyHero', 'Lista de Gerente GM',
  'E-commerce GM', 'Asset Studio', 'Copy e Ficha', 'Gerador de Pre-Sell', 'Meu Tempo', 'Controle de gastos',
  'Produtos testados', 'Diário de campanha',
]) assert.ok(source.includes(label), `item ${label} ausente da configuração compartilhada`);
assert.ok(source.includes("group.id === 'operation' ? productsMarkup(mode, activeKey) : ''"), 'submenu Produtos não é inserido dentro do grupo Operação');
const operationStart = source.indexOf("{ id: 'operation'");
const financeStart = source.indexOf("{ id: 'finance'");
const analysisStart = source.indexOf("{ id: 'analysis'");
const operationItems = source.slice(operationStart, financeStart);
const financeItems = source.slice(financeStart, analysisStart);
assert.ok(!operationItems.includes("key: 'macro'"), 'Controle Macro não deve permanecer no grupo Operação');
assert.ok(financeItems.includes("key: 'macro'") && financeItems.includes("key: 'billing'"), 'Controle Macro e Faturamento devem compartilhar o grupo Financeiro');
assert.ok(source.includes("const topName = name === 'products' ? 'operation' : name"), 'abrir Produtos não mantém Operação expandida como grupo pai');
assert.ok(source.includes('const isProductsSubgroup = group.dataset.sidebarGroup === \'products\''), 'Produtos perdeu o comportamento expansível dentro de Operação');
const creationStart = source.indexOf("{ id: 'creation'");
const creationEnd = source.indexOf("{ id: 'personal'", creationStart);
const creationItems = source.slice(creationStart, creationEnd);
assert.ok(creationItems.indexOf("key: 'asset-studio'") < creationItems.indexOf("key: 'copy'") && creationItems.indexOf("key: 'copy'") < creationItems.indexOf("key: 'presell'"), 'Asset Studio deve aparecer antes de Copy e Ficha e Gerador de Pre-Sell no grupo Criação de ofertas');
for (const id of ['totalsNav', 'controlMacroNav', 'billingNav', 'cpaReportNav', 'accountReportNav', 'observabilityNav', 'curationObservabilityNav', 'testedProductsNav', 'timeNav', 'copyFichaNav', 'presellNav']) {
  assert.ok(viewRegistry.includes(id) || source.includes(id), `ID de navegação SPA ${id} não foi preservado no registro`);
}
assert.ok(source.includes('definition?.navId'), 'a navegação SPA deve reutilizar os IDs do registro de telas');
assert.ok(source.includes('campaignList') && source.includes('activeListTab') && source.includes('historyListTab'), 'controles dinâmicos do Diário não foram preservados');
assert.ok(source.includes('body.animate(') && source.includes('prefers-reduced-motion: reduce') && source.includes('body.inert = !expanded'), 'animação, acessibilidade e movimento reduzido do acordeão devem continuar');
assert.ok(source.includes('productHost?.remove()'), 'host antigo de Produtos permanece visível fora de Operação');
assert.ok(source.includes('localStorage.setItem(STORAGE_KEY, name)'), 'preferência do grupo aberto não é compartilhada entre telas');
assert.ok(source.includes("const COLLAPSED_STORAGE_KEY = 'painel-sidebar-recolhido-v1'"), 'preferência de recolhimento do menu não é persistida');
assert.ok(source.includes('data-hub-sidebar-collapse-toggle') && source.includes('Expandir menu lateral') && source.includes('Recolher menu lateral'), 'controle acessível de recolhimento/expansão do menu ausente');
assert.ok(source.includes("layout?.classList.toggle('hub-sidebar-collapsed', collapsed)"), 'estado recolhido não é aplicado ao layout compartilhado');
assert.ok(css.includes('.hub-sidebar-layout.hub-sidebar-collapsed { grid-template-columns: 42px minmax(0, 1fr) !important; }') && css.includes('> :not(.hub-sidebar-collapse-toggle)'), 'modo recolhido não reduz a navegação a uma faixa estreita com controle visível');
assert.ok(css.includes('.hub-menu-group.collapsed') && css.includes('.hub-menu-products #campaignList') && css.includes('max-height: clamp('), 'grupos compactos e lista rolável com altura limitada devem manter o espaçamento da seção Operação estável');
assert.match(css, /\.hub-menu-products \.list-tabs\s*\{[^}]*padding:\s*0[^}]*border:\s*0/s, 'abas Ativas/Histórico devem ser compactas e sem moldura externa');
assert.match(css, /\.hub-menu-products #search\s*\{[^}]*min-height:\s*31px/s, 'campo de busca do Diário de campanha deve permanecer compacto');
assert.match(css, /\.hub-menu-products #campaignList \.campaign-btn\s*\{[^}]*min-height:\s*28px/s, 'itens da lista do Diário de campanha devem usar altura compacta');
assert.match(css, /\.hub-menu-products \.sidebar-empty\s*\{[^}]*padding:\s*7px 8px/s, 'estado vazio do Diário de campanha também deve respeitar o espaçamento compacto');
assert.doesNotMatch(css, /data-sidebar-group="operation"\)?:not\(\.collapsed\)[^{]*\{[^}]*flex:\s*1\s+1\s+auto/s, 'a seção Operação não deve crescer para ocupar o espaço vazio do menu');

const glimpse = await readFile(new URL('../dist/curadoria/glimpse/index.html', import.meta.url), 'utf8');
assert.ok(!glimpse.includes('data-hub-sidebar'), 'a tela transitória Glimpse deve permanecer focada e sem menu lateral');
console.log('shared sidebar component ok');
