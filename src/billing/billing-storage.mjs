import { makeAudit, makeId, mccConversionSaleId, normalizeMovement, normalizeSale, provisionalSaleToBilling } from './billing-domain.mjs';
import { ensurePersonalFinanceStores } from '../personal-finance/personal-finance-storage.mjs';

export const BILLING_DB_NAME = 'painel-campanhas';
export const BILLING_DB_VERSION = 5;
export const BILLING_STORES = Object.freeze({ sales: 'billing_sales', movements: 'billing_movements', audit: 'billing_audit', meta: 'billing_meta' });
export const BILLING_STORE_NAMES = Object.freeze(Object.values(BILLING_STORES));
export const BILLING_SEED_KEY = 'seed:legacy-faturamento:v1';
const schemas = Object.freeze({
  billing_sales: { keyPath: 'sale_id', indexes: { sale_date: 'sale_date', product: 'product', platform: 'platform', account: 'account', payment_status: 'payment_status', external_id: 'external_id' } },
  billing_movements: { keyPath: 'movement_id', indexes: { sale_id: 'sale_id', effective_date: 'effective_date', type: 'type' } },
  billing_audit: { keyPath: 'audit_id', indexes: { sale_id: 'entity_id', created_at: 'created_at', entity: 'entity' } },
  billing_meta: { keyPath: 'key', indexes: {} },
});

export function ensureBillingStores(db, transaction) {
  for (const [name, schema] of Object.entries(schemas)) {
    const store = db.objectStoreNames.contains(name)
      ? transaction.objectStore(name)
      : db.createObjectStore(name, { keyPath: schema.keyPath });
    for (const [indexName, keyPath] of Object.entries(schema.indexes)) if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, { unique: false });
  }
  ensurePersonalFinanceStores(db, transaction);
}

export function validateBillingBundle(bundle) {
  if (!bundle || bundle.schema !== 'billing_backup_v1') throw new Error('O backup não contém um módulo Faturamento compatível.');
  for (const field of ['sales', 'movements', 'audit', 'meta']) if (!Array.isArray(bundle[field])) throw new Error(`Backup de Faturamento inválido: lista ${field} ausente.`);
  const sales = bundle.sales.map(sale => normalizeSale(sale));
  const saleIds = new Set(sales.map(sale => sale.sale_id));
  if (saleIds.size !== sales.length) throw new Error('Backup de Faturamento contém IDs de venda duplicados.');
  const movements = bundle.movements.map(move => normalizeMovement(move));
  if (movements.some(move => !saleIds.has(move.sale_id))) throw new Error('Backup de Faturamento contém movimento sem venda correspondente.');
  const movementIds = new Set(movements.map(move => move.movement_id));
  if (movementIds.size !== movements.length) throw new Error('Backup de Faturamento contém IDs de movimento duplicados.');
  return { schema: 'billing_backup_v1', version: 1, exported_at: bundle.exported_at || new Date().toISOString(), sales, movements, audit: bundle.audit, meta: bundle.meta };
}

export function planSeedImport(seed, { installedVersion = 0, existingSales = [], existingMovements = [] } = {}) {
  if (Number(installedVersion) >= Number(seed.version)) return { alreadyApplied: true, sales: [], movements: [] };
  const salesIds = new Set(existingSales);
  const movementIds = new Set(existingMovements);
  return {
    alreadyApplied: false,
    sales: (seed.sales || []).filter(record => !salesIds.has(record.sale_id)),
    movements: (seed.movements || []).filter(record => !movementIds.has(record.movement_id)),
  };
}

export function writeBillingBundleToTransaction(transaction, bundle) {
  const normalized = validateBillingBundle(bundle);
  for (const name of BILLING_STORE_NAMES) transaction.objectStore(name).clear();
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const movements = transaction.objectStore(BILLING_STORES.movements);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  const meta = transaction.objectStore(BILLING_STORES.meta);
  for (const item of normalized.sales) sales.put(item);
  for (const item of normalized.movements) movements.put(item);
  for (const item of normalized.audit) audit.put(item);
  for (const item of normalized.meta) meta.put(item);
}

export function upsertProvisionalSalesToTransaction(transaction, provisionalSales, { now = new Date().toISOString() } = {}) {
  const entries = (provisionalSales || []).map(item => {
    const legacyId = String(item?.id || '').match(/^sale_([a-z0-9]+)$/i)?.[1];
    const billingSaleId = String(item?.billing_sale_id || '').trim() || (legacyId ? `manual-sale:cmp_${legacyId}` : '');
    if (!billingSaleId || !item?.id || !item?.campanha_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.data||'')) || !Number.isFinite(Number(item.valor_brl)) || Number(item.valor_brl)<=0) return null;
    const source = { ...item, billing_sale_id:billingSaleId };
    return { source, sale:provisionalSaleToBilling(source, { now }) };
  }).filter(Boolean);
  if (!entries.length) return 0;
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const { source, sale: incoming } of entries) {
    const request = sales.get(incoming.sale_id);
    request.onsuccess = () => {
      const existing = request.result;
      if (!existing) {
        sales.add(incoming);
        audit.add(makeAudit('manual_sale_linked', 'sale', incoming.sale_id, Object.entries(incoming)
          .filter(([field]) => !['sale_id', 'created_at', 'updated_at'].includes(field))
          .map(([field, newValue]) => ({ field, old_value:null, new_value:newValue })), { now }));
        reconcileMccAggregateForManualSale(transaction, sales, audit, incoming, source, now);
        return;
      }
      if (existing.source_ref !== String(source.id)) return;
      const patch = {
        confirmation_status:incoming.confirmation_status,
        confirmation_source:incoming.confirmation_source,
        confirmed_at:incoming.confirmed_at,
        account:existing.account || incoming.account,
        campaign_id:existing.campaign_id || incoming.campaign_id,
      };
      const changed = Object.keys(patch).filter(field => !Object.is(existing[field] ?? null, patch[field] ?? null));
      if (!changed.length) return;
      const updated = normalizeSale({ ...existing, ...patch, updated_at:now }, { now });
      sales.put(updated);
      audit.add(makeAudit(incoming.confirmation_status === 'confirmed' ? 'sale_confirmed_by_mcc' : 'sale_confirmation_reverted_by_mcc', 'sale', incoming.sale_id,
        changed.map(field => ({ field, old_value:existing[field] ?? null, new_value:updated[field] ?? null })), { now }));
    };
    request.onerror = () => transaction.abort();
  }
  return entries.length;
}

export function correctProvisionalSaleValuesToTransaction(transaction, provisionalSales, { now = new Date().toISOString() } = {}) {
  const entries = (provisionalSales || []).map(source => {
    if (!source?.id || !source?.billing_sale_id || !Number.isFinite(Number(source.valor_brl)) || Number(source.valor_brl) <= 0) return null;
    return { source, incoming: provisionalSaleToBilling(source, { now }) };
  }).filter(Boolean);
  if (!entries.length) throw new Error('Nenhum lançamento manual válido foi informado para corrigir.');
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const { source, incoming } of entries) {
    const request = sales.get(incoming.sale_id);
    request.onsuccess = () => {
      const existing = request.result;
      if (!existing || existing.source !== 'hub_manual_capture' || existing.source_ref !== String(source.id)) {
        transaction.abort();
        return;
      }
      if (Object.is(Number(existing.value_brl), Number(incoming.value_brl))) return;
      const updated = normalizeSale({ ...existing, value_brl: incoming.value_brl, updated_at: now }, { now });
      sales.put(updated);
      audit.add(makeAudit('financial_value_corrected', 'sale', incoming.sale_id, [
        { field: 'value_brl', old_value: existing.value_brl ?? null, new_value: updated.value_brl },
      ], { now }));
    };
    request.onerror = () => transaction.abort();
  }
  return entries.length;
}

export function syncEditedProvisionalSalesToTransaction(transaction, provisionalSales, { now = new Date().toISOString() } = {}) {
  const entries = (provisionalSales || []).map(source => {
    if (!source?.id || !source?.billing_sale_id || !source?.campanha_id || !Number.isFinite(Number(source.valor_brl)) || Number(source.valor_brl) <= 0) return null;
    return { source, incoming: provisionalSaleToBilling(source, { now }) };
  }).filter(Boolean);
  if (!entries.length) throw new Error('Nenhum lançamento provisório válido foi informado para sincronizar.');
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const { source, incoming } of entries) {
    const request = sales.get(incoming.sale_id);
    request.onsuccess = () => {
      const existing = request.result;
      if (!existing || existing.source !== 'hub_manual_capture' || existing.source_ref !== String(source.id)) {
        transaction.abort();
        return;
      }
      const patch = {
        sale_date:incoming.sale_date,
        product:incoming.product,
        platform:incoming.platform,
        account:incoming.account,
        value_brl:incoming.value_brl,
        campaign_id:incoming.campaign_id,
        country_code:incoming.country_code,
        sale_time:incoming.sale_time,
        confirmation_status:incoming.confirmation_status,
        confirmation_source:incoming.confirmation_source,
        confirmed_at:incoming.confirmed_at,
        notes:incoming.notes,
      };
      const changed = Object.keys(patch).filter(field => !Object.is(existing[field] ?? null, patch[field] ?? null));
      if (!changed.length) return;
      const updated = normalizeSale({ ...existing, ...patch, updated_at:now }, { now });
      sales.put(updated);
      const action = changed.length === 1 && changed[0] === 'value_brl' ? 'financial_value_corrected' : 'provisional_sale_updated';
      audit.add(makeAudit(action, 'sale', incoming.sale_id,
        changed.map(field => ({ field, old_value:existing[field] ?? null, new_value:updated[field] ?? null })), { now }));
    };
    request.onerror = () => transaction.abort();
  }
  return entries.length;
}

function reconcileMccAggregateForManualSale(transaction, sales, audit, manual, source, now) {
  if (!source?.campanha_id || !source?.data) return;
  const request = sales.get(mccConversionSaleId(source.campanha_id, source.data));
  request.onsuccess = () => {
    const existing = request.result;
    if (!existing || existing.source !== 'mcc_conversion_aggregate' || existing.active === false) return;
    const remaining = Math.max(0, Number(existing.conversion_count || 0) - 1);
    const patch = {
      conversion_count:remaining,
      active:remaining > 0,
      value_brl:null,
      value_usd:null,
      confirmation_status:remaining > 0 ? existing.confirmation_status : 'represented_by_manual',
      notes:remaining > 0
        ? `Restam ${remaining} conversão(ões) MCC sem vínculo individual. O valor agregado não foi dividido após associar uma conversão a lançamento manual.`
        : 'Conversões MCC cobertas por lançamento(s) manual(is); valor agregado removido do total para evitar duplicidade.',
      updated_at:now,
    };
    const changed = Object.keys(patch).filter(field => !Object.is(existing[field] ?? null, patch[field] ?? null));
    if (!changed.length) return;
    sales.put(normalizeSale({ ...existing, ...patch }, { now }));
    audit.add(makeAudit('mcc_aggregate_adjusted_for_manual_sale', 'sale', existing.sale_id,
      changed.map(field => ({ field, old_value:existing[field] ?? null, new_value:patch[field] ?? null })), { now }));
  };
  request.onerror = () => transaction.abort();
}

export function upsertMccConversionSalesToTransaction(transaction, mccSales, { now = new Date().toISOString(), onlyIfMissing = false } = {}) {
  const entries = (mccSales || []).map(item => normalizeSale({ ...item, updated_at:now }, { now }));
  if (!entries.length) return 0;
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const incoming of entries) {
    const request = sales.get(incoming.sale_id);
    request.onsuccess = () => {
      const existing = request.result;
      if (existing && onlyIfMissing && !(existing.source === 'mcc_conversion_aggregate' && existing.source_period !== 'd1' && incoming.source_period === 'd1')) return;
      if (!existing && incoming.active === false) return;
      if (existing && existing.source !== 'mcc_conversion_aggregate') return;
      if (existing?.source_period === 'd1' && incoming.source_period === 'd0') return;
      const paymentFields = existing ? {
        payment_status:existing.payment_status,
        observed_payment_status:existing.observed_payment_status,
        created_at:existing.created_at,
      } : {};
      const updated = normalizeSale({ ...existing, ...incoming, ...paymentFields, updated_at:now }, { now });
      const fields = existing
        ? Object.keys(updated).filter(field => !['sale_id', 'created_at', 'updated_at'].includes(field) && !Object.is(existing[field] ?? null, updated[field] ?? null))
        : Object.keys(updated).filter(field => !['sale_id', 'created_at', 'updated_at'].includes(field));
      if (!fields.length) return;
      if (existing) sales.put(updated); else sales.add(updated);
      const action = incoming.confirmation_status === 'confirmed'
        ? 'mcc_conversion_confirmed_d1'
        : incoming.confirmation_status === 'provisional'
          ? 'mcc_conversion_provisional_d0'
          : incoming.confirmation_status === 'represented_by_manual'
            ? 'mcc_conversion_covered_by_manual_sale'
            : 'mcc_conversion_not_confirmed';
      audit.add(makeAudit(action, 'sale', incoming.sale_id,
        fields.map(field => ({ field, old_value:existing?.[field] ?? null, new_value:updated[field] ?? null })), { now }));
    };
    request.onerror = () => transaction.abort();
  }
  return entries.length;
}

export function openBillingDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BILLING_DB_NAME, BILLING_DB_VERSION);
    request.onupgradeneeded = () => ensureBillingStores(request.result, request.transaction);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Feche outras abas antigas do Hub e tente novamente para concluir a atualização do banco local.'));
  });
}

export async function installBillingSeed(seed) {
  if (!seed || seed.schema !== 'billing_seed_v1' || !Number.isInteger(seed.version)) throw new Error('Carga inicial do Faturamento inválida.');
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORE_NAMES, 'readwrite');
    const metaStore = tx.objectStore(BILLING_STORES.meta);
    const salesStore = tx.objectStore(BILLING_STORES.sales);
    const movementsStore = tx.objectStore(BILLING_STORES.movements);
    let result = { applied: false, alreadyApplied: false, salesAdded: 0, movementsAdded: 0 };
    const metaRequest = metaStore.get(BILLING_SEED_KEY);
    metaRequest.onsuccess = () => {
      const existing = metaRequest.result;
      if (existing && Number(existing.version) >= seed.version) {
        result = { ...result, alreadyApplied: true };
        return;
      }
      const existingSales = [], existingMovements = [];
      const remaining = seed.sales.length + seed.movements.length;
      if (!remaining) return finishSeed([], []);
      let waiting = remaining;
      const done = () => { waiting -= 1; if (waiting === 0) finishSeed(existingSales, existingMovements); };
      for (const sale of seed.sales) {
        const request = salesStore.get(sale.sale_id);
        request.onsuccess = () => { if (request.result) existingSales.push(sale.sale_id); done(); };
        request.onerror = () => tx.abort();
      }
      for (const movement of seed.movements) {
        const request = movementsStore.get(movement.movement_id);
        request.onsuccess = () => { if (request.result) existingMovements.push(movement.movement_id); done(); };
        request.onerror = () => tx.abort();
      }
      function finishSeed(foundSales, foundMovements) {
        const plan = planSeedImport(seed, { existingSales: foundSales, existingMovements: foundMovements });
        for (const item of plan.sales) salesStore.add(item);
        for (const item of plan.movements) movementsStore.add(item);
        const meta = { key: BILLING_SEED_KEY, version: seed.version, applied_at: new Date().toISOString(), sales_total: seed.sales.length, sales_inserted: plan.sales.length, movements_total: seed.movements.length, movements_inserted: plan.movements.length, source: seed.source };
        metaStore.put(meta);
        result = { applied: true, alreadyApplied: false, salesAdded: plan.sales.length, movementsAdded: plan.movements.length, meta };
      }
    };
    metaRequest.onerror = () => tx.abort();
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Não foi possível instalar a carga histórica do Faturamento.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('A carga histórica do Faturamento foi cancelada.')); };
  });
}

export async function countBillingData() {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORE_NAMES, 'readonly');
    const names = Object.entries(BILLING_STORES).map(([key, store]) => [key, tx.objectStore(store).count()]);
    const result = {};
    for (const [key, request] of names) request.onsuccess = () => { result[key] = request.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function hasBillingData() {
  const counts = await countBillingData();
  return Object.values(counts).some(Number);
}

export async function exportBillingBundle() {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORE_NAMES, 'readonly');
    const result = { schema: 'billing_backup_v1', version: 1, exported_at: new Date().toISOString(), sales: [], movements: [], audit: [], meta: [] };
    for (const [key, storeName] of Object.entries(BILLING_STORES)) {
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => { result[key] = request.result || []; };
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function queryByDate(storeName, indexName, start, end) {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const range = IDBKeyRange.bound(start, end);
    const request = tx.objectStore(storeName).index(indexName).getAll(range);
    request.onsuccess = () => resolve(request.result || []);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function querySalesByDate(start, end) {
  return queryByDate(BILLING_STORES.sales, 'sale_date', start, end);
}

export async function queryAllSales() {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORES.sales, 'readonly');
    const request = tx.objectStore(BILLING_STORES.sales).getAll();
    request.onsuccess = () => resolve(request.result || []);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function queryMovementsByDate(start, end) {
  return queryByDate(BILLING_STORES.movements, 'effective_date', start, end);
}

export async function adjacentRecordedMonth(mode, month, direction) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || '')) || !['previous', 'next'].includes(direction)) return null;
  const cash = mode === 'cash';
  const storeName = cash ? BILLING_STORES.movements : BILLING_STORES.sales;
  const indexName = cash ? 'effective_date' : 'sale_date';
  const range = direction === 'previous'
    ? IDBKeyRange.upperBound(`${month}-01`, true)
    : IDBKeyRange.lowerBound(`${month}-31`, true);
  const cursorDirection = direction === 'previous' ? 'prev' : 'next';
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).index(indexName).openCursor(range, cursorDirection);
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    request.onsuccess = () => {
      const cursor = request.result;
      finish(resolve, cursor ? String(cursor.key).slice(0, 7) : null);
    };
    request.onerror = () => finish(reject, request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); finish(reject, tx.error); };
  });
}

export async function movementsForSales(saleIds) {
  const ids = [...new Set(saleIds)];
  if (!ids.length) return [];
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORES.movements, 'readonly');
    const index = tx.objectStore(BILLING_STORES.movements).index('sale_id');
    const result = [];
    let pending = ids.length;
    for (const id of ids) {
      const request = index.getAll(IDBKeyRange.only(id));
      request.onsuccess = () => { result.push(...request.result); pending -= 1; if (!pending) result.sort((a, b) => String(a.effective_date || '').localeCompare(String(b.effective_date || ''))); };
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function salesByIds(saleIds) {
  const ids = [...new Set(saleIds)];
  if (!ids.length) return [];
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORES.sales, 'readonly');
    const store = tx.objectStore(BILLING_STORES.sales);
    const result = [];
    for (const id of ids) {
      const request = store.get(id);
      request.onsuccess = () => { if (request.result) result.push(request.result); };
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listAudit(saleId, { limit = 50 } = {}) {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORES.audit, 'readonly');
    const request = tx.objectStore(BILLING_STORES.audit).index('sale_id').getAll(IDBKeyRange.only(saleId));
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function createSale(input) {
  const now = new Date().toISOString();
  const sale = normalizeSale(input, { now });
  const audit = makeAudit('sale_created', 'sale', sale.sale_id, Object.entries(sale).filter(([key]) => !['sale_id', 'created_at', 'updated_at'].includes(key)).map(([field, newValue]) => ({ field, old_value: null, new_value: newValue })), { now });
  const db = await openBillingDatabase();
  return writeSaleTransaction(db, sale, audit, 'add');
}

export async function updateSale(saleId, patch, action = 'sale_updated') {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.audit], 'readwrite');
    const sales = tx.objectStore(BILLING_STORES.sales);
    const request = sales.get(saleId);
    let updated = null;
    request.onsuccess = () => {
      const prior = request.result;
      if (!prior) { tx.abort(); return; }
      const now = new Date().toISOString();
      updated = normalizeSale({ ...prior, ...patch, sale_id: prior.sale_id, created_at: prior.created_at, updated_at: now }, { now });
      const changes = Object.keys(patch).filter(key => !Object.is(prior[key] ?? null, updated[key] ?? null)).map(field => ({ field, old_value: prior[field] ?? null, new_value: updated[field] ?? null }));
      if (!changes.length) return;
      sales.put(updated);
      tx.objectStore(BILLING_STORES.audit).add(makeAudit(action, 'sale', saleId, changes, { now }));
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => { db.close(); resolve(updated); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('A venda não foi encontrada ou não pôde ser atualizada.')); };
  });
}

export async function createMovement(input) {
  const movement = normalizeMovement(input);
  const audit = makeAudit(input.type === 'refund' ? 'refund_created' : 'receipt_created', 'sale', movement.sale_id, [
    { field: 'movement_id', old_value: null, new_value: movement.movement_id },
    { field: 'type', old_value: null, new_value: movement.type },
    { field: 'effective_date', old_value: null, new_value: movement.effective_date },
    { field: 'value_brl', old_value: null, new_value: movement.value_brl },
    { field: 'value_usd', old_value: null, new_value: movement.value_usd },
  ]);
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.movements, BILLING_STORES.audit], 'readwrite');
    const sales = tx.objectStore(BILLING_STORES.sales), movementStore = tx.objectStore(BILLING_STORES.movements), auditStore = tx.objectStore(BILLING_STORES.audit);
    const request = sales.get(movement.sale_id);
    request.onsuccess = () => {
      const sale = request.result;
      if (!sale) { tx.abort(); return; }
      movementStore.add(movement);
      if (movement.type === 'receipt') {
        const receipts = movementStore.index('sale_id').getAll(IDBKeyRange.only(movement.sale_id));
        receipts.onsuccess = () => {
          const receiptRows = receipts.result.filter(row => row.type === 'receipt');
          const knownFields = ['value_brl', 'value_usd'].filter(field => typeof sale[field] === 'number');
          const complete = knownFields.length > 0 && knownFields.every(field => receiptRows.reduce((sum, row) => sum + (typeof row[field] === 'number' ? row[field] : 0), 0) >= sale[field]);
          const hasReceiptValue = receiptRows.some(row => knownFields.some(field => typeof row[field] === 'number' && row[field] > 0));
          const nextStatus = complete ? 'paid' : hasReceiptValue ? 'partially_paid' : sale.payment_status;
          if (nextStatus !== sale.payment_status) {
            sales.put({ ...sale, payment_status: nextStatus, updated_at: new Date().toISOString() });
            auditStore.add(makeAudit('payment_status_changed', 'sale', movement.sale_id, [{ field: 'payment_status', old_value: sale.payment_status, new_value: nextStatus }]));
          }
          auditStore.add(audit);
        };
        receipts.onerror = () => tx.abort();
      } else auditStore.add(audit);
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => { db.close(); resolve(movement); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('A venda associada ao movimento não foi encontrada.')); };
  });
}

export async function cancelSale(saleId, reason) {
  const why = String(reason || '').trim();
  if (!why) throw new Error('Informe o motivo do cancelamento.');
  return updateSale(saleId, { active: false, cancelled_at: new Date().toISOString(), cancellation_reason: why }, 'sale_cancelled');
}

function writeSaleTransaction(db, sale, audit, mode) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.audit], 'readwrite');
    tx.objectStore(BILLING_STORES.sales)[mode](sale);
    tx.objectStore(BILLING_STORES.audit).add(audit);
    tx.oncomplete = () => { db.close(); resolve(sale); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Não foi possível salvar a venda.')); };
  });
}
