import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readDist = path => readFile(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const [theme, sidebar, app, overview, personalFinance, smartAdv, glimpseColors] = await Promise.all([
  readDist('theme-colors.css'),
  readDist('sidebar-component.css'),
  readDist('index.html'),
  readDist('overview/overview.css'),
  readDist('personal-finance/personal-finance.css'),
  readDist('curadoria/smartadv-offers/index.html'),
  readDist('curadoria/glimpse/people-also-search.css'),
]);

assert.match(theme, /--hub-primary-text:\s*#c3cede/i, 'o tema deve reutilizar o tom tipográfico neutro aprovado na Visão geral');
assert.match(theme, /--text:\s*var\(--hub-primary-text\)/, 'o token primário existente deve apontar para a cor central');
assert.doesNotMatch(theme, /--(?:green|red|amber)\s*:/i, 'o tema não deve redefinir as cores semânticas');
assert.match(sidebar, /@import url\("\/theme-colors\.css\?v=1"\)/, 'páginas independentes devem carregar o tema central pelo menu compartilhado');
assert.match(app, /href="theme-colors\.css\?v=1"/, 'o app principal deve carregar o tema por último');
assert.match(smartAdv, /href="\/theme-colors\.css\?v=1"/, 'a folha específica do SmartAdv deve ser seguida pelo tema');
assert.match(glimpseColors, /@import url\("\/theme-colors\.css\?v=1"\)/, 'Glimpse deve carregar o tema apesar de não usar o menu compartilhado');
assert.match(overview, /\.totals-table td\.negative\{color:var\(--overview-alert-red\)/, 'a Visão geral deve continuar preservando alertas vermelhos');
assert.match(overview, /td\.positive\{color:var\(--green\)/, 'a Visão geral deve continuar preservando indicadores verdes');
assert.match(personalFinance, /\.is-positive strong\{color:#42d7a0\}/, 'o controle financeiro deve manter valores positivos em verde');
assert.match(personalFinance, /\.is-negative strong\{color:#ff7788\}/, 'o controle financeiro deve manter valores negativos em vermelho');
assert.match(personalFinance, /\.pf-amount-input\.pf-money-usd\{color:#82d6aa\}/, 'a cor própria dos campos em USD deve permanecer intacta');
