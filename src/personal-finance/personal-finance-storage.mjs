import { cardDebtAmount, createGlobalExpenseTotals, createMonthSnapshot, DEFAULT_SETTINGS, hasMonthlyOccurrence, isLunchDinnerCategory, isNubankCardCategory, normalizeCategory, normalizeDebt, normalizeEntry, normalizeFund, normalizeGroup, normalizeMonth, snapshotNewCategory, validateBundle } from './personal-finance-domain.mjs?v=27';
import { publishPersonalFinanceUpdate } from './personal-finance-sync.mjs?v=1';

import { DB_NAME, DB_VERSION, ensureStores, openDatabase, PERSONAL_FINANCE_STORES } from '../storage/hub-database.mjs?v=1';
export { DB_NAME, DB_VERSION };
export const STORES = Object.freeze({
  groups: 'personal_finance_groups',
  categories: 'personal_finance_categories',
  months: 'personal_finance_months',
  entries: 'personal_finance_entries',
  debts: 'personal_finance_debts',
  funds: 'personal_finance_funds',
});
export const STORE_NAMES = Object.freeze(Object.values(STORES));

export function ensurePersonalFinanceStores(db, transaction) {
  ensureStores(db, transaction, PERSONAL_FINANCE_STORES);
}

export function openPersonalFinanceDatabase() { return openDatabase(); }

const only = key => IDBKeyRange.only(key);

function notifyWhenCommitted(transaction) {
  transaction.addEventListener?.('complete', () => publishPersonalFinanceUpdate(), { once:true });
}

export async function listGroups() {
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.groups, 'readonly');
      const request = tx.objectStore(STORES.groups).getAll();
      request.onsuccess = () => resolve((request.result || []).map(normalizeGroup).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR')));
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function listCategories() {
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.categories, 'readonly');
      const request = tx.objectStore(STORES.categories).getAll();
      request.onsuccess = () => resolve((request.result || []).map(normalizeCategory).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR')));
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function readMonth(monthKey) {
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.months, STORES.entries, STORES.debts, STORES.funds], 'readonly');
      const monthRequest = tx.objectStore(STORES.months).get(monthKey);
      const entriesRequest = tx.objectStore(STORES.entries).index('month_key').getAll(only(monthKey));
      const debtsRequest = tx.objectStore(STORES.debts).index('month_key').getAll(only(monthKey));
      const fundsRequest = tx.objectStore(STORES.funds).index('month_key').getAll(only(monthKey));
      const result = { month: null, entries: [], debts: [], funds: [] };
      monthRequest.onsuccess = () => { result.month = monthRequest.result ? normalizeMonth(monthRequest.result) : null; };
      entriesRequest.onsuccess = () => { result.entries = (entriesRequest.result || []).map(normalizeEntry); };
      debtsRequest.onsuccess = () => { result.debts = (debtsRequest.result || []).map(normalizeDebt); };
      fundsRequest.onsuccess = () => { result.funds = (fundsRequest.result || []).map(normalizeFund); };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function readReserveLedger(throughMonthKey, { includeFutureFunds = false } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(throughMonthKey || ''))) throw new Error('Mês inválido.');
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.entries, STORES.funds], 'readonly');
      const result = { entries:[], funds:[] };
      const fundsIndex = tx.objectStore(STORES.funds).index('month_key');
      const fundRequests = [fundsIndex.getAll(IDBKeyRange.upperBound(throughMonthKey))];
      if (includeFutureFunds) fundRequests.push(fundsIndex.getAll(IDBKeyRange.lowerBound(throughMonthKey, true)));
      let completedFundRequests = 0;
      const loadEntriesForReserve = () => {
        completedFundRequests += 1;
        if (completedFundRequests < fundRequests.length) return;
        result.funds = result.funds.filter(fund => fund.type === 'reserve' || fund.type === 'available').map(normalizeFund);
        const reserveFunds = result.funds.filter(fund => fund.type === 'reserve');
        if (!reserveFunds.length) return;
        const firstContributionMonth = reserveFunds.reduce((start, fund) => !start || fund.month_key < start ? fund.month_key : start, null);
        const entriesRequest = tx.objectStore(STORES.entries).index('month_key').getAll(IDBKeyRange.lowerBound(firstContributionMonth));
        entriesRequest.onsuccess = () => { result.entries = (entriesRequest.result || []).map(normalizeEntry); };
        entriesRequest.onerror = () => tx.abort();
      };
      fundRequests.forEach(fundsRequest => {
        fundsRequest.onsuccess = () => {
          result.funds.push(...(fundsRequest.result || []));
          loadEntriesForReserve();
        };
        fundsRequest.onerror = () => tx.abort();
      });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Não foi possível consultar o saldo global da reserva.'));
      tx.onabort = () => reject(tx.error || new Error('A consulta do saldo global da reserva foi cancelada.'));
    });
  } finally { db.close(); }
}

export async function readGlobalExpenseTotals() {
  const summary = createGlobalExpenseTotals();
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.entries, 'readonly');
      const request = tx.objectStore(STORES.entries).openCursor();
      let failure = null;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        try {
          summary.add(normalizeEntry(cursor.value));
          cursor.continue();
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      request.onerror = () => tx.abort();
      tx.oncomplete = () => resolve(summary.result());
      tx.onerror = () => reject(failure || tx.error || new Error('Não foi possível calcular as despesas globais.'));
      tx.onabort = () => reject(failure || tx.error || new Error('A leitura das despesas globais foi cancelada.'));
    });
  } finally { db.close(); }
}

export async function latestExpenseMonthWithValues() {
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.entries, 'readonly');
      const request = tx.objectStore(STORES.entries).index('month_key').openCursor(null, 'prev');
      let latestMonthKey = null;
      let failure = null;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        try {
          const entry = normalizeEntry(cursor.value);
          const hasValue = entry.planned_amount != null || entry.actual_amount != null || isNubankCardCategory(entry) && cardDebtAmount(entry) != null
            || entry.currency === 'BRL' && isLunchDinnerCategory(entry);
          if (hasValue && hasMonthlyOccurrence(entry)) {
            latestMonthKey = entry.month_key;
            return;
          }
          cursor.continue();
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      request.onerror = () => tx.abort();
      tx.oncomplete = () => resolve(latestMonthKey);
      tx.onerror = () => reject(failure || tx.error || new Error('Não foi possível localizar o último mês com despesas.'));
      tx.onabort = () => reject(failure || tx.error || new Error('A leitura do último mês com despesas foi cancelada.'));
    });
  } finally { db.close(); }
}

export async function createMonth({ monthKey, planSource = 'defaults' }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || ''))) throw new Error('Mês inválido.');
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const names = [STORES.groups, STORES.categories, STORES.months, STORES.entries, STORES.debts, STORES.funds];
      const tx = db.transaction(names, 'readwrite');
      const groupsStore = tx.objectStore(STORES.groups), categoriesStore = tx.objectStore(STORES.categories);
      const monthsStore = tx.objectStore(STORES.months), entriesStore = tx.objectStore(STORES.entries);
      const existingRequest = monthsStore.get(monthKey);
      let created = false;
      existingRequest.onsuccess = () => {
        if (existingRequest.result) return;
        const groupsRequest = groupsStore.getAll(), categoriesRequest = categoriesStore.getAll();
        const previousDate = new Date(`${monthKey}-01T00:00:00Z`);
        previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
        const previousKey = previousDate.toISOString().slice(0, 7);
        const previousEntriesRequest = entriesStore.index('month_key').getAll(only(previousKey));
        const previousDebtsRequest = tx.objectStore(STORES.debts).index('month_key').getAll(only(previousKey));
        const previousFundsRequest = tx.objectStore(STORES.funds).index('month_key').getAll(only(previousKey));
        let groups, categories, previousEntries, previousDebts, previousFunds;
        const maybeWrite = () => {
          if (!groups || !categories || !previousEntries || !previousDebts || !previousFunds) return;
          const { month, entries } = createMonthSnapshot({ monthKey, categories, groups, previousEntries, planSource });
          monthsStore.add(month);
          created = true;
          for (const entry of entries) entriesStore.add(entry);
          for (const debt of previousDebts.filter(item => item.status === 'open')) tx.objectStore(STORES.debts).add({ ...debt, month_key: monthKey, snapshot_id: `${monthKey}:${debt.item_id}` });
          for (const fund of previousFunds.filter(item => item.type === 'available')) tx.objectStore(STORES.funds).add({ ...fund, month_key: monthKey, snapshot_id: `${monthKey}:${fund.item_id}` });
        };
        groupsRequest.onsuccess = () => { groups = groupsRequest.result || []; maybeWrite(); };
        categoriesRequest.onsuccess = () => { categories = categoriesRequest.result || []; maybeWrite(); };
        previousEntriesRequest.onsuccess = () => { previousEntries = previousEntriesRequest.result || []; maybeWrite(); };
        previousDebtsRequest.onsuccess = () => { previousDebts = previousDebtsRequest.result || []; maybeWrite(); };
        previousFundsRequest.onsuccess = () => { previousFunds = previousFundsRequest.result || []; maybeWrite(); };
        for (const request of [groupsRequest, categoriesRequest, previousEntriesRequest, previousDebtsRequest, previousFundsRequest]) request.onerror = () => tx.abort();
      };
      existingRequest.onerror = () => tx.abort();
      tx.oncomplete = () => { if (created) publishPersonalFinanceUpdate(); resolve(); };
      tx.onerror = () => reject(tx.error || new Error('Não foi possível criar o mês.'));
      tx.onabort = () => reject(tx.error || new Error('A criação do mês foi cancelada.'));
    });
  } finally { db.close(); }
}

export async function saveEntry(entry) {
  const normalized = normalizeEntry(entry);
  const db = await openPersonalFinanceDatabase();
  try {
    await writeOne(db, STORES.entries, normalized);
    return normalized;
  } finally { db.close(); }
}

export async function applyDailyActualTargets({ monthKey, dayKey, entries = [] }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || '')) || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(dayKey || '')) || !dayKey.startsWith(`${monthKey}-`) || new Date(`${dayKey}T00:00:00Z`).toISOString().slice(0, 10) !== dayKey) {
    throw new Error('Data inválida para atualizar as metas diárias.');
  }
  const normalizedEntries = entries.map(entry => {
    const normalized = normalizeEntry(entry);
    if (normalized.month_key !== monthKey) throw new Error('O lançamento não pertence ao mês da meta diária.');
    return normalized;
  });
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.months, STORES.entries], 'readwrite');
      let failure = null, result = null;
      const monthRequest = tx.objectStore(STORES.months).get(monthKey);
      monthRequest.onsuccess = () => {
        if (!monthRequest.result) { failure = new Error('O mês atual ainda não foi criado.'); tx.abort(); return; }
        const month = normalizeMonth(monthRequest.result);
        if (month.daily_actual_targets_applied_on === dayKey) {
          result = { applied:false, month, entries:[] };
          return;
        }
        const updatedMonth = normalizeMonth({ ...month, daily_actual_targets_applied_on:dayKey });
        tx.objectStore(STORES.months).put(updatedMonth);
        for (const entry of normalizedEntries) tx.objectStore(STORES.entries).put(entry);
        result = { applied:true, month:updatedMonth, entries:normalizedEntries };
      };
      monthRequest.onerror = () => tx.abort();
      tx.oncomplete = () => { if (result?.applied) publishPersonalFinanceUpdate(); resolve(result); };
      tx.onerror = () => reject(failure || tx.error || new Error('Não foi possível atualizar as metas diárias.'));
      tx.onabort = () => reject(failure || tx.error || new Error('A atualização das metas diárias foi cancelada.'));
    });
  } finally { db.close(); }
}

export async function createGroup(group) {
  const normalized = normalizeGroup(group);
  const db = await openPersonalFinanceDatabase();
  try { await writeOne(db, STORES.groups, normalized, true); return normalized; }
  finally { db.close(); }
}

export async function saveGroup(group) {
  const normalized = normalizeGroup(group);
  const db = await openPersonalFinanceDatabase();
  try { await writeOne(db, STORES.groups, normalized); return normalized; }
  finally { db.close(); }
}

export async function createCategory(category, { monthKey = null } = {}) {
  return writeCategory(category, { monthKey, add: true });
}

export async function saveCategory(category) {
  return writeCategory(category, { add: false });
}

async function writeCategory(category, { monthKey = null, add = false } = {}) {
  const normalized = normalizeCategory(category);
  if (monthKey && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey))) throw new Error('Mês inválido.');
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const names = [STORES.categories, STORES.groups, ...(monthKey ? [STORES.months, STORES.entries] : [])];
      const tx = db.transaction(names, 'readwrite');
      let failure = null;
      const groupRequest = tx.objectStore(STORES.groups).get(normalized.group_id);
      groupRequest.onsuccess = () => {
        const group = groupRequest.result;
        if (!group) { failure = new Error('A categoria precisa estar vinculada a um grupo existente.'); tx.abort(); return; }
        tx.objectStore(STORES.categories)[add ? 'add' : 'put'](normalized);
        if (!monthKey) return;
        const monthRequest = tx.objectStore(STORES.months).get(monthKey);
        monthRequest.onsuccess = () => {
          if (monthRequest.result && add) tx.objectStore(STORES.entries).put(snapshotNewCategory(normalized, group, monthKey));
        };
        monthRequest.onerror = () => tx.abort();
      };
      groupRequest.onerror = () => tx.abort();
      tx.oncomplete = () => { publishPersonalFinanceUpdate(); resolve(normalized); };
      tx.onerror = () => reject(failure || tx.error || new Error('Não foi possível salvar a categoria.'));
      tx.onabort = () => reject(failure || tx.error || new Error('A gravação da categoria foi cancelada.'));
    });
  } finally { db.close(); }
}

export async function createDebt(debt) {
  const normalized = normalizeDebt(debt);
  const db = await openPersonalFinanceDatabase();
  try { await writeOne(db, STORES.debts, normalized, true); return normalized; }
  finally { db.close(); }
}

export async function saveDebt(debt) {
  const normalized = normalizeDebt(debt);
  const db = await openPersonalFinanceDatabase();
  try { await writeOne(db, STORES.debts, normalized); return normalized; }
  finally { db.close(); }
}

export async function deleteDebt(snapshotId) { return deleteOne(STORES.debts, snapshotId); }

export async function createFund(fund) {
  const normalized = normalizeFund(fund);
  const db = await openPersonalFinanceDatabase();
  try { await writeOne(db, STORES.funds, normalized, true); return normalized; }
  finally { db.close(); }
}

export async function saveFund(fund) {
  const normalized = normalizeFund(fund);
  const db = await openPersonalFinanceDatabase();
  try { await writeOne(db, STORES.funds, normalized); return normalized; }
  finally { db.close(); }
}

export async function deleteFund(snapshotId) { return deleteOne(STORES.funds, snapshotId); }

export async function saveReserveContribution(fund) {
  const normalized = normalizeFund({ ...fund, type:'reserve' });
  const db = await openPersonalFinanceDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.funds, 'readwrite');
      const store = tx.objectStore(STORES.funds);
      const request = store.index('item_id').openCursor(only(normalized.item_id));
      let updated = false;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.value.type === 'reserve') {
          cursor.update({ ...cursor.value, name:normalized.name, amount:normalized.amount, currency:normalized.currency, notes:normalized.notes });
          updated = true;
        }
        cursor.continue();
      };
      request.onerror = () => tx.abort();
      tx.oncomplete = () => {
        if (!updated) { reject(new Error('A contribuição global da reserva não foi encontrada.')); return; }
        publishPersonalFinanceUpdate();
        resolve();
      };
      tx.onerror = () => reject(tx.error || new Error('Não foi possível atualizar a reserva global.'));
      tx.onabort = () => reject(tx.error || new Error('A atualização da reserva global foi cancelada.'));
    });
    return normalized;
  } finally { db.close(); }
}

export async function deleteReserveContribution(itemId) {
  const db = await openPersonalFinanceDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.funds, 'readwrite');
      const request = tx.objectStore(STORES.funds).index('item_id').openCursor(only(itemId));
      let deleted = false;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.value.type === 'reserve') { cursor.delete(); deleted = true; }
        cursor.continue();
      };
      request.onerror = () => tx.abort();
      tx.oncomplete = () => {
        if (!deleted) { reject(new Error('A contribuição global da reserva não foi encontrada.')); return; }
        publishPersonalFinanceUpdate();
        resolve();
      };
      tx.onerror = () => reject(tx.error || new Error('Não foi possível remover a reserva global.'));
      tx.onabort = () => reject(tx.error || new Error('A remoção da reserva global foi cancelada.'));
    });
  } finally { db.close(); }
}

async function writeOne(db, storeName, value, add = false) {
  await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName)[add ? 'add' : 'put'](value);
    tx.oncomplete = () => { publishPersonalFinanceUpdate(); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('A gravação foi cancelada.'));
  });
}

async function deleteOne(storeName, key) {
  const db = await openPersonalFinanceDatabase();
  try { await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => { publishPersonalFinanceUpdate(); resolve(); };
    tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}

export async function exportBundle() {
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES, 'readonly');
      const bundle = { schema: 'personal_finance_v1', version: 1, exported_at: new Date().toISOString(), settings: [{ ...DEFAULT_SETTINGS }] };
      for (const [key, storeName] of Object.entries(STORES)) {
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => { bundle[key] = request.result || []; };
      }
      tx.oncomplete = () => resolve(bundle);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function writeBundleToTransaction(transaction, input) {
  const bundle = validateBundle(input);
  notifyWhenCommitted(transaction);
  const properties = { groups: 'group_id', categories: 'category_id', months: 'month_key', entries: 'entry_id', debts: 'snapshot_id', funds: 'snapshot_id' };
  for (const [key, storeName] of Object.entries(STORES)) {
    const store = transaction.objectStore(storeName);
    store.clear();
    for (const item of bundle[key]) store.put(item);
  }
  return Object.fromEntries(Object.entries(properties).map(([key]) => [key, bundle[key].length]));
}

export async function countData() {
  const db = await openPersonalFinanceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES, 'readonly');
      const counts = {};
      for (const [key, storeName] of Object.entries(STORES)) {
        const request = tx.objectStore(storeName).count();
        request.onsuccess = () => { counts[key] = request.result; };
      }
      tx.oncomplete = () => resolve(counts);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function hasData() {
  return Object.values(await countData()).some(Number);
}
