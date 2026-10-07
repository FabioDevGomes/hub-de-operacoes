import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const consumers = [
  ['curadoria/index.html', 'radar'],
  ['curadoria/gerentes/index.html', 'manager'],
  ['curadoria/top-performance/index.html', 'ecommerce'],
  ['curadoria/hot-offers-ms/index.html', 'hot-offers-ms'],
  ['curadoria/smartadv-offers/index.html', 'smartadv-offers'],
  ['curadoria/clickbank-top-offers/index.html', 'clickbank-top-offers'],
];
const tableSearches = [
  ['src/overview/template.html', 'dist/overview/template.html', /id="search" class="search hub-search-filter"/],
  ['src/tested-products/template.html', 'dist/tested-products/template.html', /id="testedSearch" class="search hub-search-filter"/],
  ['src/billing/billing-view.mjs', 'dist/billing/billing-view.mjs', /id="billingSearch" class="search hub-search-filter hub-search-filter--fill"/],
  ['src/curadoria/curation-observability-view.mjs', 'dist/curadoria/curation-observability-view.mjs', /class="search hub-search-filter hub-search-filter--fill" data-filter="productName"/],
  ['src/curadoria/index.html', 'dist/curadoria/index.html', /class="control hub-search-filter hub-search-filter--fill" id="search"/],
  ['src/curadoria/gerentes/index.html', 'dist/curadoria/gerentes/index.html', /class="control hub-search-filter hub-search-filter--fill" placeholder="Buscar produto, país ou categoria"/],
  ['src/curadoria/top-performance/index.html', 'dist/curadoria/top-performance/index.html', /class="control hub-search-filter hub-search-filter--fill" id="search"/],
  ['src/curadoria/hot-offers-ms/index.html', 'dist/curadoria/hot-offers-ms/index.html', /class="control hub-search-filter hub-search-filter--fill" id="search"/],
  ['src/curadoria/smartadv-offers/index.html', 'dist/curadoria/smartadv-offers/index.html', /class="control search hub-search-filter hub-search-filter--fill" id="search"/],
  ['src/curadoria/clickbank-top-offers/index.html', 'dist/curadoria/clickbank-top-offers/index.html', /class="control search hub-search-filter" id="search"/],
];
const tableSelects = [
  ['src/overview/template.html', 'dist/overview/template.html', ['campaignStatusFilter']],
  ['src/accounts/accounts-view.mjs', 'dist/accounts/accounts-view.mjs', ['accountReportAccount','accountReportProduct','accountReportStatus','accountDetailStatusFilter','accountCpaCoverageStatus']],
  ['src/cpa/template.html', 'dist/cpa/template.html', ['cpaStatus','cpaAccount','cpaProduct','cpaCountry','cpaPlatform']],
  ['src/billing/billing-view.mjs', 'dist/billing/billing-view.mjs', ['billingPlatform','billingProduct','billingAccount','billingStatus','billingRecordState','billingDimension']],
  ['src/index.template.html', 'dist/index.html', ['observabilityProductFilter','observabilityAccountFilter','observabilityCampaignFilter','observabilityTypeFilter']],
  ['src/curadoria/curation-observability-view.mjs', 'dist/curadoria/curation-observability-view.mjs', ['origin','eventType','decisionStatus','correlationStatus'].map(value => `data-filter="${value}"`)],
  ['src/curadoria/index.html', 'dist/curadoria/index.html', ['movementFilter','autoFilter','statusFilter','networkFilter','clickbankFilter','landingFilter']],
  ['src/curadoria/gerentes/index.html', 'dist/curadoria/gerentes/index.html', ['dateFilter','movementFilter','visibilityFilter','countryFilter','imagesFilter','rulesFilter']],
  ['src/curadoria/top-performance/index.html', 'dist/curadoria/top-performance/index.html', ['badgeFilter','countryFilter','featureFilter','languageFilter','decisionFilter','movementFilter','presenceFilter','visibilityFilter']],
  ['src/curadoria/hot-offers-ms/index.html', 'dist/curadoria/hot-offers-ms/index.html', ['scopeFilter','categoryFilter','affiliationFilter','decisionFilter','movementFilter','presenceFilter','visibilityFilter']],
  ['src/curadoria/smartadv-offers/index.html', 'dist/curadoria/smartadv-offers/index.html', ['verticalFilter','geoFilter','brandFilter']],
];

test('shared control surfaces are published and loaded through the existing theme chain', async () => {
  const [source, published, theme, sidebar, app] = await Promise.all([
    read('src/control-surfaces.css'), read('dist/control-surfaces.css'),
    read('dist/theme-colors.css'), read('dist/sidebar-component.css'), read('dist/index.html'),
  ]);
  assert.equal(published, source);
  assert.match(theme, /@import url\("\/control-surfaces\.css\?v=4"\)/);
  assert.match(sidebar, /@import url\("\/theme-colors\.css\?v=5"\)/);
  assert.match(app, /href="theme-colors\.css\?v=5"/);
  for (const [path, key] of consumers) {
    const page = await read(`dist/${path}`);
    assert.ok(page.includes(`data-hub-sidebar-active="${key}"`), path);
    assert.match(page, /sidebar-component\.css\?v=12/, path);
    assert.ok(source.includes(`[data-hub-sidebar-active="${key}"]`), path);
    assert.match(page, /<(?:input|select)\b[^>]*class="[^"]*\bcontrol\b/, path);
  }
});

test('all table search fields use the shared filter CSS in source and build', async () => {
  for (const [sourcePath, builtPath, pattern] of tableSearches) {
    assert.match(await read(sourcePath), pattern, sourcePath);
    assert.match(await read(builtPath), pattern, builtPath);
  }
  const css = await read('src/control-surfaces.css');
  assert.match(css, /input\.hub-search-filter\.hub-search-filter--fill\s*\{\s*width:\s*100%;\s*max-width:\s*none/);
});

test('table dropdown filters use the shared Visão Geral surface in source and build', async () => {
  let count = 0;
  for (const [sourcePath, builtPath, filters] of tableSelects) {
    const [source, published] = await Promise.all([read(sourcePath), read(builtPath)]);
    for (const filter of filters) {
      const marker = filter.startsWith('data-filter=') ? filter : `id="${filter}"`;
      const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`<select\\b(?=[^>]*\\b${escaped})(?=[^>]*\\bclass="[^"]*\\bhub-table-filter\\b")[^>]*>`);
      assert.match(source, pattern, `${sourcePath}: ${marker}`);
      assert.match(published, pattern, `${builtPath}: ${marker}`);
      count++;
    }
  }
  assert.equal(count, 55, 'a varredura cobre os 55 filtros de tabela restantes após remover o filtro de meios da SmartAdv');
  const [css, overviewStyles] = await Promise.all([read('src/control-surfaces.css'), read('src/overview/overview.css')]);
  assert.match(css, /select\.hub-table-filter/);
  assert.match(css, /select\.hub-table-filter\s*\{\s*border-radius:\s*9px/);
  assert.match(css, /select\.hub-table-filter,[\s\S]*?border-color:\s*transparent/);
  assert.match(css, /select\.hub-table-filter:hover:not\(:disabled\)/);
  assert.match(css, /select\.hub-table-filter:focus-visible/);
  const overviewFilterRule = overviewStyles.match(/#totalsView \.panel-controls>#campaignStatusFilter\{([^}]*)\}/)?.[1] || '';
  assert.match(overviewFilterRule, /min-width:\s*190px/);
  assert.doesNotMatch(overviewFilterRule, /(?:border|background)(?:-color)?:/,
    'a Visão Geral deixa borda e fundo do seletor para o CSS compartilhado');
});

test('scalar controls are dark and borderless visually without changing layout or semantic buttons', async () => {
  const css = await read('src/control-surfaces.css');
  assert.match(css, /--hub-input-bg:\s*#081321/);
  assert.match(css, /--hub-button-bg:\s*#101e32/);
  assert.match(css, /background:\s*var\(--hub-input-bg\)/);
  assert.match(css, /border-color:\s*transparent/);
  assert.match(css, /:is\(input,select\)\.hub-input-surface/);
  const searchRule = css.match(/input\.hub-search-filter\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(searchRule, /width:\s*240px/);
  assert.match(searchRule, /padding:\s*8px 10px/);
  assert.match(searchRule, /font-size:\s*\.76rem/);
  assert.match(css, /input\.hub-search-filter\.hub-search-filter--fill\s*\{/);
  assert.match(css, /input\.hub-search-filter:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*?input\.hub-search-filter\s*\{\s*width:\s*100%/);
  assert.match(css, /\.hub-button-surface\s*\{\s*background:\s*var\(--hub-button-bg\)/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:\*|input|select|textarea|\.btn|button)\s*\{/);
  assert.doesNotMatch(css.replace(/input\.hub-search-filter[^{}]*\{[^}]*\}/g, ''), /(?<!max-)(?:padding|height|width|font-size|border-width)\s*:/);
  for (const type of ['file','checkbox','radio','hidden','range','color','button','submit','reset']) {
    assert.ok(css.includes(`:not([type="${type}"])`), `exclude ${type}`);
  }
  const oldRGB = [0x0b,0x19,0x2b], newRGB = [0x08,0x13,0x21];
  assert.ok(newRGB.every((value,index) => value < oldRGB[index]));
});

test('keyboard focus, hover, validation and disabled states remain distinguishable', async () => {
  const css = await read('src/control-surfaces.css');
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*2px solid var\(--hub-control-focus\);\s*outline-offset:\s*2px/);
  assert.match(css, /:hover:not\(:disabled\):not\(\[readonly\]\)/);
  assert.match(css, /\[aria-invalid="true"\],\.invalid,\.error,:invalid/);
  assert.match(css, /outline:\s*2px solid var\(--hub-control-error\)/);
  assert.match(css, /:disabled\s*\{\s*opacity:\s*\.55;\s*cursor:\s*not-allowed/);
});
