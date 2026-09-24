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

const groupOrder = ['operation', 'analysis', 'curation', 'creation', 'personal'];
let previous = -1;
for (const group of groupOrder) {
  const index = source.indexOf(`id: '${group}'`);
  assert.ok(index > previous, `ordem canônica de grupos inválida em ${group}`);
  previous = index;
}
for (const label of [
  'Visão geral', 'Preparador MCC', 'Controle Macro', 'Análise por faixa de CPA', 'Mapa por conta',
  'Observabilidade decisória', 'Observabilidade da Curadoria', 'Radar SpyHero', 'Lista de Gerente',
  'E-commerce GM', 'Asset Studio', 'Copy e Ficha', 'Gerador de Pre-Sell', 'Meu Tempo',
  'Produtos testados', 'Diário do produto',
]) assert.ok(source.includes(label), `item ${label} ausente da configuração compartilhada`);
const creationStart = source.indexOf("{ id: 'creation'");
const creationEnd = source.indexOf("{ id: 'personal'", creationStart);
const creationItems = source.slice(creationStart, creationEnd);
assert.ok(creationItems.indexOf("key: 'asset-studio'") < creationItems.indexOf("key: 'copy'") && creationItems.indexOf("key: 'copy'") < creationItems.indexOf("key: 'presell'"), 'Asset Studio deve aparecer antes de Copy e Ficha e Gerador de Pre-Sell no grupo Criação de ofertas');
for (const id of ['totalsNav', 'controlMacroNav', 'cpaReportNav', 'accountReportNav', 'observabilityNav', 'curationObservabilityNav', 'testedProductsNav', 'timeNav', 'copyFichaNav', 'presellNav']) {
  assert.ok(viewRegistry.includes(id) || source.includes(id), `ID de navegação SPA ${id} não foi preservado no registro`);
}
assert.ok(source.includes('definition?.navId'), 'a navegação SPA deve reutilizar os IDs do registro de telas');
assert.ok(source.includes('campaignList') && source.includes('activeListTab') && source.includes('historyListTab'), 'controles dinâmicos do Diário não foram preservados');
assert.ok(source.includes('body.animate(') && source.includes('prefers-reduced-motion: reduce') && source.includes('body.inert = !expanded'), 'animação, acessibilidade e movimento reduzido do acordeão devem continuar');
assert.ok(source.includes('localStorage.setItem(STORAGE_KEY, name)'), 'preferência do grupo aberto não é compartilhada entre telas');
assert.ok(css.includes('.hub-menu-group.collapsed') && css.includes('.hub-menu-products:not(.collapsed)') && css.includes('min-height: 0'), 'estilos compartilhados de grupos, controles compactos e área dinâmica de Produtos ausentes');

const glimpse = await readFile(new URL('../dist/curadoria/glimpse/index.html', import.meta.url), 'utf8');
assert.ok(!glimpse.includes('data-hub-sidebar'), 'a tela transitória Glimpse deve permanecer focada e sem menu lateral');
console.log('shared sidebar component ok');
