import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared month/day navigation has a single published stylesheet loaded after the theme', async () => {
  const [css, published, app, build] = await Promise.all([
    read('src/month-navigation.css'), read('dist/month-navigation.css'),
    read('dist/index.html'), read('build.mjs'),
  ]);
  assert.equal(published, css);
  assert.match(build, /src\/month-navigation\.css/);
  assert.ok(app.indexOf('month-navigation.css?v=3') > app.indexOf('theme-colors.css?v=5'));
for (const asset of ['control-macro/control-macro.css?v=6','billing/billing.css?v=2','personal-finance/personal-finance.css?v=50','billing-view.mjs?v=9','personal-finance-view.mjs?v=90','meu-tempo/meu-tempo.css?v=32','meu-tempo/meu-tempo-view.mjs?v=28']) {
    assert.ok(app.includes(asset), `cache atualizado: ${asset}`);
  }
});

test('monthly and daily consumers share the label, arrows and current-period action', async () => {
  const [billing, macro, finance, time] = await Promise.all([
    read('src/billing/billing-view.mjs'), read('src/control-macro/template.html'),
    read('src/personal-finance/personal-finance-view.mjs'), read('src/meu-tempo/meu-tempo-view.mjs'),
  ]);
  for (const [name, source] of [['billing',billing],['macro',macro],['finance',finance],['time',time]]) {
    assert.ok(source.includes('hub-month-navigation'), name);
    assert.ok(source.includes('hub-month-label'), name);
    assert.equal((source.match(/\bhub-month-arrow\b/g) || []).length, 2, name);
  }
  assert.match(billing, /adjacentRecordedMonth\(mode, month, 'previous'\)[\s\S]*?adjacentRecordedMonth\(mode, month, 'next'\)/);
  assert.match(macro, /<\/div>\s*<button id="macroCurrentMonth" class="btn hub-month-current"/);
  assert.match(macro, /id="macroCurrentMonth" class="btn hub-month-current"[^>]*>Mês atual<\/button>/);
  assert.match(finance, /hub-month-navigation--period/);
  assert.match(finance, /class="hub-month-label" aria-live="polite">\$\{esc\(periodLabel\)\}/);
  assert.match(finance, /<\/div><button class="btn hub-month-current hub-standard-action" type="button" data-action="current-period"/);
  assert.match(finance, /data-action="period-shift" data-delta="-1"/);
  assert.match(finance, /data-action="period-shift" data-delta="1"/);
  assert.match(finance, /state\.viewMode === 'quarter' \? 3 : 1/);
  assert.ok(finance.includes('Domain.MIN_CONSOLIDATED_MONTH_COUNT'));
  assert.match(time, /dateField\('timeDate',selectedDate,'hub-month-date-entry hub-month-label','Data selecionada'\)/);
  assert.match(time, /id="timeToday" class="btn hub-month-current" type="button">Hoje/);
  assert.match(time, /id="timePreviousDay" class="btn hub-month-arrow" type="button" data-shift="-1"/);
  assert.match(time, /id="timeNextDay" class="btn hub-month-arrow" type="button" data-shift="1"/);
  for (const path of ['billing/billing.css','control-macro/control-macro.css','personal-finance/personal-finance.css','meu-tempo/meu-tempo.css']) {
    const css = await read(`src/${path}`);
    assert.doesNotMatch(css, /\.hub-month-(?:navigation|arrow|label)[^{]*\{/);
    assert.doesNotMatch(css, /\.(?:billing-month-navigation>span|macro-month-label|pf-month-nav strong)\{/);
  }
});

test('compact borderless layout keeps centered text, full periods and visible interaction states', async () => {
  const css = await read('src/month-navigation.css');
  assert.match(css, /padding:3px;border:0;border-radius:9px;background:#0a1627/);
  assert.match(css, /flex:0 0 27px;width:27px;height:27px/);
  assert.match(css, /justify-content:center;flex:0 1 118px/);
  assert.match(css, /text-align:center/);
  assert.match(css, /font-size:\.72rem;font-weight:400/);
  assert.match(css, /\.hub-month-navigation>\.hub-month-label:is\(input\.hub-month-date-entry\)\{[^}]*width:118px;height:27px;[^}]*border:0;[^}]*text-align:center;font:inherit;font-size:\.72rem;font-weight:400/s);
  assert.match(css, /input\.hub-month-date-entry\):focus\{box-shadow:none\}/);
  assert.match(css, /\.btn\.hub-month-current\{[^}]*min-height:33px;padding:6px 9px;border:0;font-size:\.72rem/);
  assert.match(css, /ação leva ao período atual: o rótulo depende da granularidade/);
  const [visualGuide, architecture] = await Promise.all([
    read('.agents/skills/painel-operacao-google-ads/references/visual-style.md'),
    read('.agents/skills/painel-operacao-google-ads/references/architecture.md'),
  ]);
  assert.match(visualGuide, /“Hoje” para navegação diária, “Mês atual” para mensal/);
  assert.match(architecture, /src\/month-navigation\.css.*Hoje.*Mês atual/);
  assert.match(css, /--period>\.hub-month-label\{[^}]*white-space:normal/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:2px solid/);
  assert.match(css, /:disabled\{opacity:\.38;cursor:not-allowed/);
  assert.match(css, /:hover:not\(:disabled\)/);
  assert.doesNotMatch(css, /text-overflow:ellipsis|overflow:hidden/);
});
