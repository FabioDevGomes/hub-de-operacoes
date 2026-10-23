import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendTrackingClicksSnapshot,
  readTrackingClicksSnapshots,
  TRACKING_CLICKS_DB_NAME,
  TRACKING_CLICKS_DB_VERSION,
  TRACKING_CLICKS_SNAPSHOT_STORE,
} from '../src/tracking/tracking-clicks-storage.mjs';

function fakeIndexedDB() {
  const stores = new Map();
  let nextId = 1;
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name, options) {
      assert.deepEqual(options, { keyPath: 'id', autoIncrement: true });
      stores.set(name, []);
      return {};
    },
    close() {},
    transaction(name, mode) {
      assert.equal(name, TRACKING_CLICKS_SNAPSHOT_STORE);
      assert.ok(['readonly', 'readwrite'].includes(mode));
      const transaction = {};
      transaction.objectStore = () => ({
        add(value) {
          assert.equal(mode, 'readwrite');
          const request = {};
          queueMicrotask(() => {
            const id = nextId++;
            stores.get(name).push(structuredClone({ ...value, id }));
            request.result = id;
            request.onsuccess?.();
            queueMicrotask(() => transaction.oncomplete?.());
          });
          return request;
        },
        getAll() {
          const request = {};
          queueMicrotask(() => {
            request.result = structuredClone(stores.get(name));
            request.onsuccess?.();
            queueMicrotask(() => transaction.oncomplete?.());
          });
          return request;
        },
      });
      return transaction;
    },
  };
  return {
    open(name, version) {
      assert.equal(name, TRACKING_CLICKS_DB_NAME);
      assert.equal(version, TRACKING_CLICKS_DB_VERSION);
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        request.onupgradeneeded?.({ target: request });
        queueMicrotask(() => request.onsuccess?.());
      });
      return request;
    },
  };
}

const report = {
  startDate: '2026-10-01',
  endDate: '2026-10-02',
  generatedAtUtc: '2026-10-02T12:00:00Z',
  rows: [{ dateUtc: '2026-10-01', productKey: 'product-a', presellHost: 'a.example.com', pageViews: 4, outboundClicks: 1 }],
};

test('armazena snapshots agregados em IndexedDB separado, somente por inclusão e sem token', async () => {
  const indexedDBImpl = fakeIndexedDB();
  const first = await appendTrackingClicksSnapshot(report, {
    indexedDBImpl,
    now: () => new Date('2026-10-02T12:01:00.000Z'),
  });
  const second = await appendTrackingClicksSnapshot({ ...report, rows: [{ ...report.rows[0], pageViews: 5 }] }, {
    indexedDBImpl,
    now: () => new Date('2026-10-02T12:02:00.000Z'),
  });
  const snapshots = await readTrackingClicksSnapshots({ indexedDBImpl });

  assert.equal(first.id, 1);
  assert.equal(second.id, 2);
  assert.equal(snapshots.length, 2, 'uma nova consulta não sobrescreve a anterior');
  assert.equal(snapshots[0].rows[0].pageViews, 4);
  assert.equal(snapshots[1].rows[0].pageViews, 5);
  assert.equal(snapshots[0].savedAtUtc, '2026-10-02T12:01:00.000Z');
  assert.equal(Object.hasOwn(snapshots[0], 'token'), false);
  assert.equal(Object.hasOwn(snapshots[0], 'visitorId'), false);
});

test('recusa gravar payload agregado inválido antes de abrir o banco', async () => {
  const indexedDBImpl = { open() { assert.fail('um relatório inválido não deve criar/abrir o cache'); } };
  await assert.rejects(
    appendTrackingClicksSnapshot({ ...report, rows: [{ ...report.rows[0], outboundClicks: -1 }] }, { indexedDBImpl }),
    /contagens inválidas/i,
  );
});
