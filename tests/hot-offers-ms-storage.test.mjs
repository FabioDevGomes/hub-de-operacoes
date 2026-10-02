import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as Storage from '../src/curadoria/hot-offers-ms/hot-offers-ms-storage.mjs';

test('Hot Offers MS usa banco e stores próprios com commit atômico da coleta', async () => {
  const source = await readFile(new URL('../src/curadoria/hot-offers-ms/hot-offers-ms-storage.mjs',import.meta.url),'utf8');
  assert.equal(Storage.DB_NAME,'radar-hot-offers-ms');
  assert.equal(Storage.DB_VERSION,1);
  assert.deepEqual(Object.values(Storage.STORES),['offers','collections','collection_offer_snapshots','decisions','trends','images']);
  assert.match(source,/transaction\(\[STORES\.offers,\s*STORES\.collections,\s*STORES\.snapshots\],\s*'readwrite'\)/);
  assert.match(source,/collectionId/);
  assert.doesNotMatch(source,/delete\(|clear\(/,'o storage novo não remove nem limpa registros');
});
