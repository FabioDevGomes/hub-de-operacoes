import assert from 'node:assert/strict';
import test from 'node:test';
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
