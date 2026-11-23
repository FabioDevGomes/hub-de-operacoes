import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { configureGuruCentral, getAll, getByKey, openTopPerformanceDB, put, saveCollection, setTrendSearchTimestamp } from '../src/curadoria/top-performance/top-performance-storage.mjs';
import { configureClickBankCentral, openDB as openClickBankDB, getAll as getAllClickBank } from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs';
import { curationBridges } from '../src/curadoria/central-bridge-slot.mjs';
import { getAllAnalyses, saveAnalysis, openGlimpseDB } from '../src/curadoria/glimpse-storage.mjs';

afterEach(() => { configureGuruCentral(null); configureClickBankCentral(null); curationBridges.glimpse = null; });

test('modo central encaminha operações Guru Media e impede IndexedDB direto', async () => {
  const calls = [];
  const bridge = {
    listGuruRecords: async store => (calls.push(['list', store]), []),
    getGuruRecord: async (store, key) => (calls.push(['get', store, key]), null),
    putGuruRecord: async (store, value) => (calls.push(['put', store]), value),
    updateGuruRecord: async (store, key, change) => (calls.push(['update', store, key]), change({ offerId: key, extra: 'preservado' })),
    saveGuruCollection: async payload => calls.push(['collection', payload]),
  };
  configureGuruCentral(bridge);
  await assert.rejects(openTopPerformanceDB(), /IndexedDB direto/);
  await getAll('offers'); await getByKey('offers', '123'); await put('offers', { offerId: '123' });
  const updated = await setTrendSearchTimestamp('123', 'Produto', '2026-11-18T00:00:00Z', 'termo');
  assert.equal(updated.extra, 'preservado');
  await saveCollection({ offers: [], collection: {}, snapshots: [] });
  assert.deepEqual(calls.map(call => call[0]), ['list', 'get', 'put', 'update', 'collection']);
});

test('ponte indisponível informa falha sem recorrer ao armazenamento local', async () => {
  const fail = async () => { throw new Error('Serviço indisponível'); };
  configureGuruCentral({ listGuruRecords: fail, getGuruRecord: fail, putGuruRecord: fail, updateGuruRecord: fail, saveGuruCollection: fail });
  await assert.rejects(getAll('offers'), /Serviço indisponível/);
  await assert.rejects(put('offers', { offerId: '123' }), /Serviço indisponível/);
  assert.throws(() => configureGuruCentral({}), /incompleta/);
});

test('ClickBank e Glimpse usam ponte central explícita e recusam IndexedDB direto', async () => {
  configureClickBankCentral({ listClickBankRecords: async () => ['registro'], saveClickBankCapture: async () => {}, updateClickBankRecords: async () => [] });
  curationBridges.glimpse = { listGlimpseAnalyses: async () => [{ productKey: 'produto' }], saveGlimpseAnalysis: async value => value };
  assert.deepEqual(await getAllClickBank('captures'), ['registro']);
  assert.deepEqual(await getAllAnalyses(), [{ productKey: 'produto' }]);
  assert.deepEqual(await saveAnalysis({ analysisId: 'a' }), { analysisId: 'a' });
  await assert.rejects(openClickBankDB(), /IndexedDB direto/);
  await assert.rejects(openGlimpseDB(), /modo central/);
  await assert.rejects(saveAnalysis({}, { origin: 'manual', productId: 'p' }), /ainda não está conectado/);
});
