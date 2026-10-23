import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readTrackingDomainList,
  saveTrackingDomainList,
  TRACKING_DOMAIN_LIST_STORAGE_KEY,
} from '../src/tracking/tracking-domain-list-storage.mjs';

function memoryStorage(initial = new Map()) {
  const values = initial;
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

const domainRows = [
  {
    hostname: 'metabo.zinvero.shop',
    origin: 'https://metabo.zinvero.shop',
    productKey: 'metabo-zinvero',
    productLabel: 'Metabo Drops - Zinvero',
    createdAtUtc: '2026-10-21T18:48:56Z',
  },
];

test('persiste domínio, chave técnica e nome do Track sem tokens, e restaura um snapshot válido', () => {
  const storage = memoryStorage();
  const updatedAt = new Date('2026-10-21T19:00:00.000Z');
  const result = saveTrackingDomainList([{
    ...domainRows[0],
    productLabel: 'Metabo Drops - Zinvero',
    adminToken: 'a'.repeat(64),
    clickbankToken: 'b'.repeat(64),
  }], storage, updatedAt);

  assert.deepEqual(result, { saved: true, updatedAtUtc: updatedAt.toISOString() });
  const serialized = storage.values.get(TRACKING_DOMAIN_LIST_STORAGE_KEY);
  assert.ok(serialized);
  assert.ok(serialized.includes('Metabo Drops - Zinvero'));
  assert.doesNotMatch(serialized, /adminToken|clickbankToken|[ab]{64}/);
  assert.deepEqual(readTrackingDomainList(storage), {
    available: true,
    loaded: true,
    rows: domainRows,
    updatedAtUtc: updatedAt.toISOString(),
  });
});

test('cache ausente é diferenciado de snapshot vazio já consultado', () => {
  const storage = memoryStorage();
  assert.deepEqual(readTrackingDomainList(storage), {
    available: true, loaded: false, rows: [], updatedAtUtc: '',
  });
  assert.equal(saveTrackingDomainList([], storage, new Date('2026-10-21T19:00:00.000Z')).saved, true);
  assert.deepEqual(readTrackingDomainList(storage), {
    available: true,
    loaded: true,
    rows: [],
    updatedAtUtc: '2026-10-21T19:00:00.000Z',
  });
});

test('rejeita cache malformado, timestamp inválido, duplicatas e snapshot excessivo', () => {
  const invalidValues = [
    '{',
    JSON.stringify({ schemaVersion: 2, updatedAtUtc: '2026-10-21T19:00:00.000Z', domains: [] }),
    JSON.stringify({ schemaVersion: 1, updatedAtUtc: 'ontem', domains: [] }),
    JSON.stringify({ schemaVersion: 1, updatedAtUtc: '2026-10-21T19:00:00.000Z', domains: [{ page_host: 'bad host' }] }),
    JSON.stringify({ schemaVersion: 1, updatedAtUtc: '2026-10-21T19:00:00.000Z', domains: [
      { page_host: 'metabo.zinvero.shop', origin: 'https://metabo.zinvero.shop', product_key: 'metabo-zinvero' },
      { page_host: 'metabo.zinvero.shop', origin: 'https://metabo.zinvero.shop', product_key: 'metabo-zinvero' },
    ] }),
    'x'.repeat(262145),
  ];
  for (const raw of invalidValues) {
    const result = readTrackingDomainList(memoryStorage(new Map([[TRACKING_DOMAIN_LIST_STORAGE_KEY, raw]])));
    assert.equal(result.available, true);
    assert.equal(result.invalid, true);
    assert.equal(result.loaded, false);
  }
});

test('falhas ou entradas inválidas de storage não apagam nem simulam um cache', () => {
  const deniedStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.deepEqual(readTrackingDomainList(deniedStorage), {
    available: false, loaded: false, rows: [], updatedAtUtc: '',
  });
  assert.deepEqual(saveTrackingDomainList(domainRows, deniedStorage), { saved: false });
  assert.deepEqual(saveTrackingDomainList(null, memoryStorage()), { saved: false });
  assert.deepEqual(saveTrackingDomainList(domainRows, memoryStorage(), new Date(Number.NaN)), { saved: false });
});

test('limita o número de domínios armazenados', () => {
  const tooMany = Array.from({ length: 1001 }, (_, index) => ({
    hostname: `site-${index}.example.com`,
    origin: `https://site-${index}.example.com`,
    productKey: 'product-a',
    createdAtUtc: '',
  }));
  assert.deepEqual(saveTrackingDomainList(tooMany, memoryStorage()), { saved: false });
});
