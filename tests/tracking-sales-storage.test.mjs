import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { normalizeTrackingSalesPage, resolveTrackingSaleCampaign } from '../src/tracking/tracking-sales-domain.mjs';
import {
  readTrackingSalesSnapshot,
  replaceTrackingSalesSnapshot,
  TRACKING_SALES_DB_NAME,
  TRACKING_SALES_DB_VERSION,
  TRACKING_SALES_META_KEY,
  TRACKING_SALES_META_STORE,
  TRACKING_SALES_STORE,
} from '../src/tracking/tracking-sales-storage.mjs';

function fakeIndexedDB() {
  const stores = new Map();
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name, options) {
      assert.deepEqual(options, { keyPath: name === TRACKING_SALES_STORE ? 'transactionId' : 'key' });
      stores.set(name, new Map());
      return {};
    },
    close() {},
    transaction(names, mode) {
      const storeNames = Array.isArray(names) ? names : [names];
      const transaction = {};
      transaction.objectStore = name => {
        assert.ok(storeNames.includes(name));
        const store = stores.get(name);
        return {
          clear() {
            assert.equal(mode, 'readwrite');
            const request = {};
            store.clear();
            queueMicrotask(() => request.onsuccess?.());
            setTimeout(() => transaction.oncomplete?.(), 0);
            return request;
          },
          put(value) {
            assert.equal(mode, 'readwrite');
            const request = {};
            const key = name === TRACKING_SALES_STORE ? value.transactionId : value.key;
            store.set(key, structuredClone(value));
            queueMicrotask(() => request.onsuccess?.());
            setTimeout(() => transaction.oncomplete?.(), 0);
            return request;
          },
          getAll() {
            const request = {};
            request.result = [...store.values()].map(value => structuredClone(value));
            queueMicrotask(() => request.onsuccess?.());
            setTimeout(() => transaction.oncomplete?.(), 0);
            return request;
          },
          get(key) {
            const request = {};
            request.result = structuredClone(store.get(key));
            queueMicrotask(() => request.onsuccess?.());
            setTimeout(() => transaction.oncomplete?.(), 0);
            return request;
          },
        };
      };
      return transaction;
    },
  };
  return {
    open(name, version) {
      assert.equal(name, TRACKING_SALES_DB_NAME);
      assert.equal(version, TRACKING_SALES_DB_VERSION);
      const request = { result: db };
      queueMicrotask(() => {
        request.onupgradeneeded?.({ target: request });
        queueMicrotask(() => request.onsuccess?.());
      });
      return request;
    },
  };
}

const sales = [
  { transactionId: '10', transactionTimeUtc: '2026-10-20T12:00:00.123Z', attributionStatus: 'matched', presellHost: 'buy.example.com', productKey: 'product-a' },
  { transactionId: '11', transactionTimeUtc: null, attributionStatus: 'unmatched', presellHost: null, productKey: null },
];

test('persiste e restaura vendas e horário em uma base IndexedDB dedicada, sem token ou extclid', async () => {
  const indexedDBImpl = fakeIndexedDB();
  const saved = await replaceTrackingSalesSnapshot(sales, {
    snapshotMaxId: '20', generatedAtUtc: '2026-10-20T12:02:00Z',
  }, { indexedDBImpl, now: () => new Date('2026-10-20T12:03:00.000Z') });
  const restored = await readTrackingSalesSnapshot({ indexedDBImpl });
  assert.equal(saved.metadata.totalCount, 2);
  assert.equal(restored.sales.length, 2);
  assert.equal(restored.sales[0].transactionId, '10');
  assert.equal(restored.sales[0].presellHost, 'buy.example.com');
  assert.equal(restored.metadata.lastSyncedAtUtc, '2026-10-20T12:03:00.000Z');
  assert.equal(restored.metadata.snapshotMaxId, '20');
  assert.equal(Object.hasOwn(restored.sales[0], 'extclid'), false);
  assert.equal(Object.hasOwn(restored.sales[0], 'gclid'), false);
  assert.equal(Object.hasOwn(restored.sales[0], 'receiptId'), false);
  assert.equal(Object.hasOwn(restored.metadata, 'token'), false);
  assert.equal(TRACKING_SALES_META_KEY, 'last_successful_sync');
  assert.notEqual(TRACKING_SALES_META_STORE, TRACKING_SALES_STORE);
});

test('atualização completa substitui snapshot somente depois de receber o novo conjunto', async () => {
  const indexedDBImpl = fakeIndexedDB();
  const first = await replaceTrackingSalesSnapshot(sales, { snapshotMaxId: '20' }, {
    indexedDBImpl, now: () => new Date('2026-10-20T12:03:00.000Z'),
  });
  const second = await replaceTrackingSalesSnapshot([sales[0]], { snapshotMaxId: '21' }, {
    indexedDBImpl, now: () => new Date('2026-10-20T12:04:00.000Z'),
  });
  assert.equal(first.sales.length, 2);
  assert.equal(second.sales.length, 1);
  const restored = await readTrackingSalesSnapshot({ indexedDBImpl });
  assert.equal(restored.sales.length, 1);
  assert.equal(restored.metadata.snapshotMaxId, '21');
});

test('recusa duplicatas, metadados inválidos e mais de 50.000 vendas antes de abrir o banco', async () => {
  const indexedDBImpl = { open() { assert.fail('dados inválidos não devem abrir o IndexedDB'); } };
  await assert.rejects(replaceTrackingSalesSnapshot([sales[0], sales[0]], { snapshotMaxId: '20' }, { indexedDBImpl }), /duplicada/i);
  await assert.rejects(replaceTrackingSalesSnapshot(sales, { snapshotMaxId: 'invalid' }, { indexedDBImpl }), /cursor do snapshot/i);
  await assert.rejects(replaceTrackingSalesSnapshot(sales, { snapshotMaxId: '18446744073709551616' }, { indexedDBImpl }), /cursor do snapshot/i);
  await assert.rejects(replaceTrackingSalesSnapshot([sales[0]], { snapshotMaxId: '9' }, { indexedDBImpl }), /ultrapassa o snapshot/i);
  await assert.rejects(replaceTrackingSalesSnapshot(new Array(50001), { snapshotMaxId: '20' }, { indexedDBImpl }), /limite seguro/i);
});

test('fluxo sintético PHP schema 4 → cache do Hub → identidade local exata e estável em repetição', async t => {
  const servicePath = resolve(import.meta.dirname, '../tracking-mvp/tools/clickbank-ins-v8-sales-api-service.php');
  const bridgePath = resolve(import.meta.dirname, '../tracking-mvp/tests/clickbank-ins-v8-sales-api-bridge.php');
  if (!existsSync(servicePath) || !existsSync(bridgePath)) {
    t.skip('Checkout local do tracking-mvp não está disponível para o teste cruzado.');
    return;
  }
  const transactions = [
    { id: '1', transaction_time_utc: '2026-11-15 12:00:00.000', received_at_utc: '2026-11-15 12:01:00.000', commission_total: '90.00', commission_currency: 'USD', extclid: 'synthetic-sale-click-1' },
    { id: '2', transaction_time_utc: '2026-11-15 12:02:00.000', received_at_utc: '2026-11-15 12:03:00.000', commission_total: '0.00', commission_currency: 'USD', extclid: 'synthetic-sale-no-click' },
    { id: '3', transaction_time_utc: '2026-11-15 12:04:00.000', received_at_utc: '2026-11-15 12:05:00.000', commission_total: '90.00', commission_currency: 'USD', extclid: 'synthetic-sale-ambiguous' },
    { id: '4', transaction_time_utc: '2026-11-15 12:06:00.000', received_at_utc: '2026-11-15 12:07:00.000', commission_total: '90.00', commission_currency: 'USD', extclid: 'synthetic-sale-invalid-campaign' },
  ];
  const clickRows = [
    { event_type: 'outbound_click', clickbank_extclid: 'synthetic-sale-click-1', click_id: 'synthetic-click-1a', presell_host: 'buy.example.test', product_key: 'product-test', utm_campaign: '987654321' },
    { event_type: 'outbound_click', clickbank_extclid: 'synthetic-sale-click-1', click_id: 'synthetic-click-1b', presell_host: 'buy.example.test', product_key: 'product-test', utm_campaign: '987654321' },
    { event_type: 'outbound_click', clickbank_extclid: 'synthetic-sale-ambiguous', click_id: 'synthetic-click-3a', presell_host: 'buy.example.test', product_key: 'product-test', utm_campaign: '123456789' },
    { event_type: 'outbound_click', clickbank_extclid: 'synthetic-sale-ambiguous', click_id: 'synthetic-click-3b', presell_host: 'other.example.test', product_key: 'product-test', utm_campaign: '234567891' },
    { event_type: 'outbound_click', clickbank_extclid: 'synthetic-sale-invalid-campaign', click_id: 'synthetic-click-4', presell_host: 'buy.example.test', product_key: 'product-test', utm_campaign: 'Product Test' },
  ];
  const php = spawnSync('php', [bridgePath], {
    input: JSON.stringify({ transactions, clicks: clickRows }),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (php.error?.code === 'ENOENT') {
    t.skip('PHP CLI não está disponível para o teste cruzado.');
    return;
  }
  assert.equal(php.status, 0, php.stderr || 'O handler HTTP sintético PHP falhou.');
  const httpResult = JSON.parse(php.stdout);
  assert.equal(httpResult.status, 200);
  assert.equal(httpResult.headers['Access-Control-Allow-Origin'], 'https://hub.example.test');
  const rawPage = httpResult.body;
  assert.equal(rawPage.schema_version, 4);
  assert.doesNotMatch(php.stdout, /synthetic-sale-click|synthetic-click|gclid|receipt|buyer|Bearer /i);

  const page = normalizeTrackingSalesPage(rawPage, { afterId: '0' });
  const indexedDBImpl = fakeIndexedDB();
  const first = await replaceTrackingSalesSnapshot(page.sales, {
    snapshotMaxId: page.snapshotMaxId,
    generatedAtUtc: page.generatedAtUtc,
  }, { indexedDBImpl, now: () => new Date('2026-11-17T12:01:00.000Z') });
  const retry = await replaceTrackingSalesSnapshot(page.sales, {
    snapshotMaxId: page.snapshotMaxId,
    generatedAtUtc: page.generatedAtUtc,
  }, { indexedDBImpl, now: () => new Date('2026-11-17T12:02:00.000Z') });
  const restored = await readTrackingSalesSnapshot({ indexedDBImpl });
  assert.equal(first.sales.length, 4);
  assert.equal(retry.sales.length, 4);
  assert.equal(restored.sales.length, 4, 'repetir o snapshot não duplica transações');
  assert.equal(restored.sales[0].clickLinkDiagnosticStatus, 'track_matched');
  assert.deepEqual(restored.sales[0].clickCampaignCandidate, {
    status: 'candidate', source: 'utm_campaign_campaignid', campaignId: '987654321',
  });
  assert.equal(Object.hasOwn(restored.sales[0], 'campaignAttribution'), false, 'a resolução derivada não é persistida no cache');
  assert.equal(Object.hasOwn(restored.sales[0], 'extclid'), false);

  const trustedCampaigns = [{
    google_ads_campaign_id: '987654321',
    google_ads_campaign_origem: 'google_ads_api_snapshot',
    mcc_id: '1234567890',
    conta_id: '9876543210',
  }];
  const resolved = restored.sales.map(sale => resolveTrackingSaleCampaign(sale, trustedCampaigns));
  assert.deepEqual(resolved[0], {
    status: 'matched', managerCustomerId: '1234567890', customerId: '9876543210', campaignId: '987654321',
  });
  assert.equal(resolved[1].status, 'click_not_found');
  assert.equal(restored.sales[1].clickLinkDiagnosticStatus, 'exact_click_not_found');
  assert.equal(restored.sales[2].attributionStatus, 'ambiguous');
  assert.equal(restored.sales[2].clickCampaignCandidate.status, 'campaign_ambiguous');
  assert.equal(resolved[2].status, 'campaign_ambiguous');
  assert.equal(restored.sales[3].clickCampaignCandidate.status, 'campaign_id_invalid');
  assert.equal(resolved[3].status, 'campaign_id_invalid');
  assert.equal(resolveTrackingSaleCampaign(restored.sales[0], [
    ...trustedCampaigns,
    { ...trustedCampaigns[0], conta_id: '9876543211' },
  ]).status, 'campaign_ambiguous', 'ID igual em contas distintas não deve selecionar uma conta');
  assert.equal(resolveTrackingSaleCampaign(restored.sales[0], [
    { ...trustedCampaigns[0], google_ads_campaign_origem: 'legacy' },
  ]).status, 'campaign_source_unverified');
});
