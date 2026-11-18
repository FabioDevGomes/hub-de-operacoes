import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeGuruMediaCampaignAttribution } from '../src/tracking/tracking-gurumedia-domain.mjs';
import { mount } from '../src/tracking/tracking-gurumedia-view.mjs';
import { TRACKING_TOKEN_STORAGE_KEY } from '../src/tracking/tracking-token-storage.mjs';

function makeRoot() {
  const listeners = new Map();
  return {
    isConnected: true,
    ownerDocument: null,
    innerHTML: '',
    addEventListener(type, handler) { listeners.set(type, handler); },
    fire(type, event) { return listeners.get(type)?.(event); },
    querySelector() { return null; },
  };
}

function clickAction(action) {
  const button = { dataset: { gurumediaAction: action } };
  return { target: { closest: selector => selector === '[data-gurumedia-action]' ? button : null } };
}

test('configurações do postback começam recolhidas e podem ser exibidas sem perder os valores', () => {
  const root = makeRoot();
  const controller = mount({
    root,
    getAccountRows: () => [],
    readActionSettings: () => ({ settings: [], invalid: false, available: true }),
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });

  try {
    assert.match(root.innerHTML, /data-gurumedia-action="toggle-postback-config"[^>]*aria-expanded="false">Exibir configurações/);
    assert.match(root.innerHTML, /id="guruMediaPostbackConfig" class="tracking-connection-config" hidden>/);

    root.fire('input', { target: { id: 'guruMediaOfferIdMacro', value: '{offerid}' } });
    root.fire('click', clickAction('toggle-postback-config'));

    assert.match(root.innerHTML, /data-gurumedia-action="toggle-postback-config"[^>]*aria-expanded="true">Recolher configurações/);
    assert.match(root.innerHTML, /id="guruMediaPostbackConfig" class="tracking-connection-config">/);
    assert.match(root.innerHTML, /id="guruMediaOfferIdMacro"[^>]*value="\{offerid\}"/);

    root.fire('click', clickAction('toggle-postback-config'));
    assert.match(root.innerHTML, /aria-expanded="false">Exibir configurações/);
    assert.match(root.innerHTML, /id="guruMediaPostbackConfig" class="tracking-connection-config" hidden>/);
  } finally {
    controller.destroy();
  }
});

test('normaliza diagnóstico de clique sem expor o GCLID completo', () => {
  const row = {
    received_at_utc: '2026-11-15T14:12:37.000Z',
    conversion_at_utc: '2026-11-15T14:12:37.000Z',
    product_key: 'power-heat-pro-conta-9827',
    product_label: 'Power Heat Pro - conta 9827',
    presell_host: 'getpowerheatpro-de.homeandlifeinsights.shop',
    offer_name: 'Power Heat Pro - German Page',
    currency: 'USD',
    payout_amount: '107.00',
    status: 'no_match',
    campaign_id: null,
    campaign_name: null,
    error_code: null,
    click_at_utc: '2026-11-15T14:01:22.123Z',
    gclid_masked: '…Ab1234',
  };
  const report = normalizeGuruMediaCampaignAttribution({
    ok: true,
    schema_version: 1,
    report_type: 'campaign_attribution',
    generated_at_utc: '2026-11-15T14:23:21Z',
    start_date: '2026-11-15',
    end_date: '2026-11-15',
    summary: { matched_count: 0, no_match_count: 1, missing_gclid_count: 0, ambiguous_count: 0, lookup_error_count: 0, not_queried_count: 0 },
    query_count: 2,
    account_timezone_query_count: 1,
    click_view_query_count: 1,
    truncated: false,
    rows: [row],
  }, { startDate: '2026-11-15', endDate: '2026-11-15' });

  assert.equal(report.rows[0].campaignAttribution.clickAtUtc, row.click_at_utc);
  assert.equal(report.rows[0].campaignAttribution.gclidMasked, row.gclid_masked);
  assert.equal(Object.hasOwn(report.rows[0].campaignAttribution, 'gclid'), false);
  assert.throws(() => normalizeGuruMediaCampaignAttribution({
    ok: true,
    schema_version: 1,
    report_type: 'campaign_attribution',
    generated_at_utc: '2026-11-15T14:23:21Z',
    start_date: '2026-11-15',
    end_date: '2026-11-15',
    summary: { matched_count: 0, no_match_count: 1, missing_gclid_count: 0, ambiguous_count: 0, lookup_error_count: 0, not_queried_count: 0 },
    query_count: 2,
    account_timezone_query_count: 1,
    click_view_query_count: 1,
    truncated: false,
    rows: [{ ...row, gclid_masked: 'FULL-GCLID-VALUE' }],
  }, { startDate: '2026-11-15', endDate: '2026-11-15' }));
});

test('atualizar vendas também renova o cache de Tracks que a Curadoria lê', async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map([[TRACKING_TOKEN_STORAGE_KEY, 'a'.repeat(64)]]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const root = makeRoot();
  let fetchedWith = '';
  let savedDomains = null;
  let savedReport = false;
  const controller = mount({
    root,
    fetchReport: async () => ({ startDate: '2026-11-01', endDate: '2026-11-15', generatedAtUtc: '2026-11-15T14:00:00Z', rows: [], saleDetails: [], summary: { salesCount: 0, unmatchedCallbacks: 0, ambiguousCallbacks: 0 } }),
    fetchTrafficReport: async () => ({ rows: [] }),
    readCache: async () => null,
    readCampaignAttributions: async () => new Map(),
    saveCache: async () => { savedReport = true; return { savedAtUtc: '2026-11-15T14:00:00.000Z' }; },
    readTrafficCache: async () => [],
    saveTrafficCache: async () => {},
    fetchDomains: async token => { fetchedWith = token; return [{ hostname: 'sample.example', productKey: 'sample-product', platform: 'gurumedia', offerId: 'offer-1' }]; },
    saveDomainCache: rows => { savedDomains = rows; return { saved: true, updatedAtUtc: '2026-11-15T14:00:00.000Z' }; },
    readDomainAdminToken: () => ({ token: 'b'.repeat(64) }),
    syncBilling: async () => ({ inserted: 0, updated: 0, unchanged: 0 }),
    getAccountRows: () => [],
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });

  try {
    root.fire('click', clickAction('refresh'));
    for (let attempt = 0; attempt < 20 && !root.innerHTML.includes('Lista de Tracks atualizada para a Curadoria'); attempt += 1) await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(fetchedWith, 'b'.repeat(64));
    assert.equal(savedDomains?.[0]?.hostname, 'sample.example');
    assert.equal(savedReport, true);
    assert.match(root.innerHTML, /Lista de Tracks atualizada para a Curadoria/);
    assert.match(root.innerHTML, /Faturamento local: 0 nova\(s\), 0 atualizada\(s\), 0 sem alteração\./);
    assert.doesNotMatch(root.innerHTML, /syncBilling is not a function/);
  } finally {
    controller.destroy();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('reaplica a atribuição ClickView salva ao abrir o relatório sem fazer nova consulta ClickView', async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map([[TRACKING_TOKEN_STORAGE_KEY, 'a'.repeat(64)]]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const root = makeRoot();
  const saleKey = '22313904-35a6-4f96-8abf-700b1a1595ea';
  const campaignAttribution = {
    status: 'matched',
    campaignId: '24464253560',
    campaignName: 'Power Heat Pro DE02 15 (GM-NBB-DE) 50% - U$ 107.00',
    errorCode: null,
    clickAtUtc: '2026-11-15T14:10:26.000Z',
    gclidMasked: '…Ab1234',
  };
  const controller = mount({
    root,
    nowFn: () => new Date('2026-11-16T14:00:00.000Z'),
    fetchReport: async () => ({
      startDate: '2026-11-16', endDate: '2026-11-16', generatedAtUtc: '2026-11-16T14:00:00.000Z',
      rows: [], saleDetails: [{
        saleKey, conversionAtUtc: '2026-11-15T14:12:37.000Z', receivedAtUtc: '2026-11-15T14:12:37.000Z',
        productKey: 'power-heat-pro-conta-9827', productLabel: 'Power Heat Pro - conta 9827',
        presellHost: 'getpowerheatpro-de.homeandlifeinsights.shop', offerName: 'Power Heat Pro - German Page',
        currency: 'USD', payoutAmount: '107.00', campaignAttribution: { status: 'not_checked' },
      }],
      summary: { salesCount: 1, unmatchedCallbacks: 0, ambiguousCallbacks: 0 },
    }),
    fetchTrafficReport: async () => ({ rows: [] }),
    readCache: async () => null,
    saveCache: async () => ({ savedAtUtc: '2026-11-16T14:00:00.000Z' }),
    readCampaignAttributions: async () => new Map([[saleKey, campaignAttribution]]),
    readTrafficCache: async () => [],
    saveTrafficCache: async () => {},
    fetchDomains: async () => [],
    readDomainAdminToken: () => ({ token: '' }),
    syncBilling: async () => ({ inserted: 0, updated: 0, unchanged: 0 }),
    getAccountRows: () => [],
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });

  try {
    controller.activate();
    for (let attempt = 0; attempt < 30 && !root.innerHTML.includes(campaignAttribution.campaignName); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    assert.match(root.innerHTML, /Power Heat Pro DE02 15 \(GM-NBB-DE\) 50% - U\$ 107\.00 · ID 24464253560/);
  } finally {
    controller.destroy();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('o build publica a tela GuruMedia com a versão de módulo atualizada', async () => {
  const [html, sourceIndex, sourceView, distView] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.template.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-gurumedia-view.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-gurumedia-view.mjs', import.meta.url), 'utf8'),
  ]);
  const moduleVersion = sourceIndex.match(/import\('\.\/tracking\/tracking-gurumedia-view\.mjs\?v=(\d+)'\)/)?.[1];
  assert.ok(moduleVersion, 'o template declara uma versão de cache para a tela GuruMedia');
  assert.ok(html.includes(`import('./tracking/tracking-gurumedia-view.mjs?v=${moduleVersion}')`));
  assert.ok(sourceView.includes('Clique Google (UTC) / GCLID mascarado'));
  assert.equal(distView, sourceView);
});
