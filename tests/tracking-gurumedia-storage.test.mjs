import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE,
  GURUMEDIA_SALES_DB_VERSION,
  mergeGuruMediaCampaignAttributions,
  readGuruMediaCampaignAttributions,
  readGuruMediaSalesSnapshot,
  saveGuruMediaSalesSnapshot,
} from '../src/tracking/tracking-gurumedia-storage.mjs';
import { memoryIndexedDB } from './helpers/manual-memory-idb.mjs';

const saleKey = '22313904-35a6-4f96-8abf-700b1a1595ea';
const matchedAttribution = {
  status: 'matched',
  campaignId: '24464253560',
  campaignName: 'Power Heat Pro DE02 15 (GM-NBB-DE) 50% - U$ 107.00',
  errorCode: null,
  clickAtUtc: '2026-11-15T14:10:26.000Z',
  gclidMasked: '…Ab1234',
};

function report(startDate, endDate, campaignAttribution, { includeSale = true } = {}) {
  return {
    startDate,
    endDate,
    generatedAtUtc: `${endDate}T14:30:00.000Z`,
    rows: [],
    saleDetails: includeSale ? [{
      saleKey,
      conversionAtUtc: '2026-11-15T14:12:37.000Z',
      receivedAtUtc: '2026-11-15T14:12:37.000Z',
      productKey: 'power-heat-pro-conta-9827',
      productLabel: 'Power Heat Pro - conta 9827',
      presellHost: 'getpowerheatpro-de.homeandlifeinsights.shop',
      offerName: 'Power Heat Pro - German Page',
      currency: 'USD',
      payoutAmount: '107.00',
      campaignAttribution,
    }] : [],
    summary: { salesCount: 1 },
  };
}

function legacyVersionOneIndexedDB(snapshot) {
  const stores = new Map([["report_snapshots", new Map([["latest_report", structuredClone(snapshot)]])]]);
  const keyPaths = new Map([["report_snapshots", "key"]]);
  let version = 1;
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    close() {},
    createObjectStore(name, { keyPath }) {
      stores.set(name, new Map());
      keyPaths.set(name, keyPath);
      return {};
    },
    transaction(names) {
      const tx = { error: null };
      const request = read => {
        const result = {};
        setImmediate(() => {
          try {
            result.result = structuredClone(read());
            result.onsuccess?.();
            setImmediate(() => tx.oncomplete?.());
          } catch (error) {
            result.error = error;
            tx.error = error;
            result.onerror?.();
            tx.onerror?.();
          }
        });
        return result;
      };
      tx.objectStore = name => {
        if (!stores.has(name) || !(Array.isArray(names) ? names : [names]).includes(name)) throw new Error(`store outside transaction: ${name}`);
        const store = stores.get(name);
        return {
          get: key => request(() => store.get(key)),
          getAll: () => request(() => [...store.values()]),
        };
      };
      return tx;
    },
  };
  const upgradeTransaction = {
    objectStore(name) {
      const store = stores.get(name);
      if (!store) throw new Error(`missing upgrade store: ${name}`);
      return {
        get: key => {
          const result = {};
          setImmediate(() => {
            result.result = structuredClone(store.get(key));
            result.onsuccess?.();
          });
          return result;
        },
        put: value => {
          store.set(value[keyPaths.get(name)], structuredClone(value));
          return {};
        },
      };
    },
  };
  return {
    open(_name, requestedVersion) {
      const request = {};
      setImmediate(() => {
        request.result = db;
        if (requestedVersion > version) {
          request.transaction = upgradeTransaction;
          request.onupgradeneeded?.({ oldVersion: version });
          version = requestedVersion;
          setImmediate(() => setImmediate(() => request.onsuccess?.()));
        } else request.onsuccess?.();
      });
      return request;
    },
  };
}

test('mantém a atribuição ClickView por venda quando o snapshot muda de período', async () => {
  const indexedDBImpl = memoryIndexedDB();
  assert.equal(GURUMEDIA_SALES_DB_VERSION, 3);
  await saveGuruMediaSalesSnapshot(report('2026-05-16', '2026-11-16', matchedAttribution), {
    indexedDBImpl,
    now: () => new Date('2026-11-16T14:31:00.000Z'),
  });

  await saveGuruMediaSalesSnapshot(report('2026-11-16', '2026-11-16', { status: 'not_checked' }, { includeSale: false }), {
    indexedDBImpl,
    now: () => new Date('2026-11-16T15:00:00.000Z'),
  });

  const snapshot = await readGuruMediaSalesSnapshot({ indexedDBImpl });
  const attributions = await readGuruMediaCampaignAttributions({ indexedDBImpl });
  assert.equal(snapshot.report.startDate, '2026-11-16');
  assert.equal(snapshot.report.saleDetails.length, 0, 'a consulta atual continua respeitando seu período');
  assert.deepEqual(snapshot.firstSaleSales.map(sale => [sale.saleKey, sale.conversionAtUtc, sale.receivedAtUtc, sale.campaignAttribution.campaignId]), [
    [saleKey, '2026-11-15T14:12:37.000Z', '2026-11-15T14:12:37.000Z', matchedAttribution.campaignId],
  ], 'a atribuição persistida também retém somente os horários necessários à primeira venda');
  assert.equal(attributions.get(saleKey).clickAtUtc, matchedAttribution.clickAtUtc);
  assert.equal(attributions.get(saleKey).gclidMasked, matchedAttribution.gclidMasked);
  assert.equal(Object.hasOwn(attributions.get(saleKey), 'gclid'), false);
  assert.equal(indexedDBImpl.databases.get('hub-tracking-gurumedia-sales').stores.has(GURUMEDIA_CAMPAIGN_ATTRIBUTION_STORE), true);
});

test('migra a atribuição já salva no relatório v1 para o armazenamento permanente por venda', async () => {
  const oldSnapshot = {
    key: 'latest_report',
    schemaVersion: 1,
    savedAtUtc: '2026-11-16T14:31:00.000Z',
    report: report('2026-05-16', '2026-11-16', matchedAttribution),
  };
  const indexedDBImpl = legacyVersionOneIndexedDB(oldSnapshot);

  const attributions = await readGuruMediaCampaignAttributions({ indexedDBImpl });
  const migratedSnapshot = await readGuruMediaSalesSnapshot({ indexedDBImpl });

  assert.equal(attributions.get(saleKey).campaignId, matchedAttribution.campaignId);
  assert.equal(migratedSnapshot.report.saleDetails[0].campaignAttribution.campaignName, matchedAttribution.campaignName);
});

test('só persiste correspondências válidas e faz merge no relatório recém-consultado', async () => {
  const indexedDBImpl = memoryIndexedDB();
  await saveGuruMediaSalesSnapshot(report('2026-11-15', '2026-11-16', {
    ...matchedAttribution,
    gclid: 'gclid-completo-nao-deve-ser-persistido',
  }), {
    indexedDBImpl,
    now: () => new Date('2026-11-16T14:31:00.000Z'),
  });
  await saveGuruMediaSalesSnapshot(report('2026-11-16', '2026-11-16', { status: 'lookup_error', campaignId: null, campaignName: null }), {
    indexedDBImpl,
    now: () => new Date('2026-11-16T15:00:00.000Z'),
  });

  const saved = await readGuruMediaCampaignAttributions({ indexedDBImpl });
  const freshReport = report('2026-11-16', '2026-11-16', { status: 'not_checked' });
  const merged = mergeGuruMediaCampaignAttributions(freshReport, saved);
  assert.equal(merged.saleDetails[0].campaignAttribution.campaignId, matchedAttribution.campaignId);
  assert.equal(Object.hasOwn(merged.saleDetails[0].campaignAttribution, 'gclid'), false);
  assert.equal(saved.size, 1, 'uma consulta posterior sem correspondência não apaga a identificação confirmada');
});
