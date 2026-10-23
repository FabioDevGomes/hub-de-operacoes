import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ensurePersonalFinanceStores, recordReserveMovement, saveNubankReserveBalance, STORE_NAMES, STORES, writeBundleToTransaction } from '../src/personal-finance/personal-finance-storage.mjs';

class NameList {
  constructor() { this.values = new Set(); }
  contains(value) { return this.values.has(value); }
  add(value) { this.values.add(value); }
}
class FakeStore {
  constructor(keyPath) { this.keyPath = keyPath; this.indexNames = new NameList(); this.indexes = new Map(); this.rows = new Map(); }
  createIndex(name, keyPath) { this.indexNames.add(name); this.indexes.set(name, keyPath); }
  clear() { this.rows.clear(); }
  put(row) { this.rows.set(row[this.keyPath], row); }

}
class FakeDb {
  constructor() { this.objectStoreNames = new NameList(); this.stores = new Map(); }
  createObjectStore(name, { keyPath }) { const store = new FakeStore(keyPath); this.objectStoreNames.add(name); this.stores.set(name, store); return store; }
}

const db = new FakeDb(), transaction = { objectStore: name => db.stores.get(name) };
ensurePersonalFinanceStores(db, transaction);
assert.deepEqual([...db.objectStoreNames.values].sort(), [...STORE_NAMES].sort());
assert.equal(db.stores.get(STORES.groups).keyPath, 'group_id');
assert.equal(db.stores.get(STORES.categories).indexes.get('group_id'), 'group_id');
assert.deepEqual(db.stores.get(STORES.entries).indexes.get('month_category'), ['month_key', 'category_id']);
assert.equal(db.stores.get(STORES.debts).indexes.get('month_key'), 'month_key');
assert.equal(db.stores.get(STORES.funds).indexes.get('type'), 'type');
ensurePersonalFinanceStores(db, transaction);
assert.equal(db.stores.size, STORE_NAMES.length, 'upgrade é aditivo e repetível');

const bundle = {
  schema:'personal_finance_v1', version:1,
  groups:[{ group_id:'g1', name:'Casa', sort_order:0, active:true }],
  categories:[{ category_id:'c1', name:'Aluguel', group_id:'g1', currency:'BRL', default_plan:100, sort_order:0, active:true }],
  months:[{ month_key:'2026-09', plan_source:'defaults', daily_actual_targets_applied_on:'2026-09-06' }],
  entries:[{ entry_id:'2026-09:c1', month_key:'2026-09', category_id:'c1', category_name:'Aluguel', group_id:'g1', group_name:'Casa', currency:'BRL', planned_amount:100, actual_amount:null }],
  debts:[], funds:[],
};
db.stores.get(STORES.groups).put({ group_id:'obsolete', name:'Substituído', sort_order:1, active:true });
const counts = writeBundleToTransaction(transaction, bundle);
assert.equal(counts.groups, 1);
assert.equal(db.stores.get(STORES.groups).rows.has('obsolete'), false, 'restauração substitui somente quando há bundle validado');
assert.equal(db.stores.get(STORES.entries).rows.get('2026-09:c1').actual_amount, null, 'valor realizado em branco permanece em branco no backup');
assert.equal(db.stores.get(STORES.months).rows.get('2026-09').daily_actual_targets_applied_on, '2026-09-06', 'a restauração mantém o marcador que protege edições manuais durante o dia');
const movement = { movement_id:'withdraw-1', type:'withdrawal', amount:500, currency:'BRL', created_at:'2026-10-18T12:00:00.000Z' };
writeBundleToTransaction(transaction, { ...bundle, months:[...bundle.months, { month_key:'2026-10' }], funds:[{ snapshot_id:'2026-10:cdi', item_id:'cdi', month_key:'2026-10', name:'CDI', amount:16254, currency:'BRL', type:'reserve', reserve_movements:[movement] }] });
assert.deepEqual(db.stores.get(STORES.funds).rows.get('2026-10:cdi').reserve_movements, [movement], 'exportação/restauração do backup preserva o histórico dos resgates/impostos');

const source = await readFile(new URL('../src/personal-finance/personal-finance-storage.mjs', import.meta.url), 'utf8');
const readMonthBlock = source.match(/export async function readMonth\([\s\S]*?\n\}/)?.[0] || '';
assert.match(readMonthBlock, /\.index\('month_key'\)\.getAll\(only\(monthKey\)\)/, 'leituras mensais filtram por índice em vez de carregar o histórico completo');
const dailyTargetsBlock = source.match(/export async function applyDailyActualTargets\([\s\S]*?\n\}/)?.[0] || '';
assert.match(dailyTargetsBlock, /db\.transaction\(\[STORES\.months, STORES\.entries\], 'readwrite'\)/, 'metas do dia e lançamentos são gravados na mesma transação');
assert.match(dailyTargetsBlock, /daily_actual_targets_applied_on === dayKey/, 'a gravação idempotente impede que uma atualização no mesmo dia sobrescreva a edição manual');
const reserveReadBlock = source.match(/export async function readReserveLedger\([\s\S]*?\n\}/)?.[0] || '';
assert.match(reserveReadBlock, /fundsIndex\.getAll\(IDBKeyRange\.upperBound\(throughMonthKey\)\)/, 'o histórico da reserva consulta snapshots até o mês solicitado');
assert.match(reserveReadBlock, /fund\.type === 'reserve' \|\| fund\.type === 'available'/, 'a consulta global também carrega os saldos disponíveis usados no cálculo Nubank');
assert.match(reserveReadBlock, /fundsIndex\.getAll\(IDBKeyRange\.lowerBound\(throughMonthKey, true\)\)/, 'a consulta global pode carregar aportes registrados em meses futuros');
assert.doesNotMatch(reserveReadBlock, /fundsIndex\.getAll\(\)/, 'a consulta de aportes futuros usa intervalo indexado, sem leitura irrestrita da store');
assert.match(reserveReadBlock, /IDBKeyRange\.lowerBound\(firstContributionMonth\)/, 'gastos de meses futuros continuam disponíveis para o total informativo de gastos');
const createMonthBlock = source.match(/export async function createMonth\([\s\S]*?\n\}/)?.[0] || '';
assert.match(createMonthBlock, /previousFunds\.filter\(item => item\.type === 'available'\)/, 'a reserva global não é duplicada em snapshots de novos meses');
const deleteReserveBlock = source.match(/export async function deleteReserveContribution\([\s\S]*?\n\}/)?.[0] || '';
assert.match(deleteReserveBlock, /index\('item_id'\)\.openCursor\(only\(itemId\)\)/, 'remover um aporte afeta somente as cópias daquele item, não varre a store inteira');
assert.match(source, /export async function countData\(\)[\s\S]*?\.count\(\)/, 'a confirmação de sobrescrita usa contagens e não leitura integral');
assert.match(source, /export async function exportBundle\(\)[\s\S]*?\.getAll\(\)/, 'leitura integral fica restrita à exportação explícita de backup');
assert.doesNotMatch(source, /mergeExpensesBundle/, 'o fluxo de importação de despesas da planilha foi removido');
const originalIndexedDB = globalThis.indexedDB, originalIDBKeyRange = globalThis.IDBKeyRange;
const reserveRows = new Map([
  ['2026-08:cdi', { snapshot_id:'2026-08:cdi', item_id:'cdi', month_key:'2026-08', name:'CDI', amount:16254, currency:'BRL', type:'reserve' }],
  ['2026-09:cdi', { snapshot_id:'2026-09:cdi', item_id:'cdi', month_key:'2026-09', name:'CDI', amount:16254, currency:'BRL', type:'reserve' }],
  ['2026-08:nubank', { snapshot_id:'2026-08:nubank', item_id:'nubank', month_key:'2026-08', name:'Saldo Nubank', amount:689, currency:'BRL', type:'reserve' }],
  ['2026-09:nubank', { snapshot_id:'2026-09:nubank', item_id:'nubank', month_key:'2026-09', name:'Saldo Nubank', amount:689, currency:'BRL', type:'reserve' }],
]);
const reserveStore = {
  index() { return { openCursor(range) {
    const request = {}, matching = [...reserveRows.values()].filter(row => row.item_id === range.value).sort((a, b) => a.snapshot_id.localeCompare(b.snapshot_id));
    let index = 0;
    const next = () => queueMicrotask(() => {
      if (activeTransaction.aborted) return;
      const row = matching[index];
      request.result = row ? { value:row, continue() { index += 1; next(); } } : null;
      request.onsuccess?.();
      if (!row) queueMicrotask(() => { if (!activeTransaction.aborted) activeTransaction.oncomplete?.(); });
    });
    next();
    return request;
  } }; },
  put(row) { reserveRows.set(row.snapshot_id, row); },
};
let activeTransaction;
const fakeFinanceDb = {
  close() {},
  transaction() {
    activeTransaction = { aborted:false, objectStore() { return reserveStore; }, abort() { this.aborted = true; queueMicrotask(() => this.onabort?.()); } };
    return activeTransaction;
  },
};
globalThis.IDBKeyRange = { only:value => ({ value }) };
globalThis.indexedDB = { open() { const request = {}; queueMicrotask(() => { request.result = fakeFinanceDb; request.onsuccess?.(); }); return request; } };
try {
  await recordReserveMovement('cdi', 'withdrawal', 500, '2026-10-18T12:00:00.000Z');
  await recordReserveMovement('cdi', 'tax', 100, '2026-10-18T12:30:00.000Z');
  const latestCdi = reserveRows.get('2026-09:cdi');
  assert.deepEqual(latestCdi.reserve_movements.map(movement => movement.type), ['withdrawal', 'tax'], 'resgates e impostos são anexados ao snapshot mais recente como histórico');
  const { summarizeGlobalReserve } = await import('../src/personal-finance/personal-finance-domain.mjs');
  const reserveSummary = summarizeGlobalReserve([], [...reserveRows.values()], '2026-09');
  assert.equal(reserveSummary.balances.BRL, 16343, 'os movimentos persistidos diminuem a reserva geral sem duplicar snapshots e incluem a reserva Nubank ainda sem ajuste');
  await assert.rejects(recordReserveMovement('cdi', 'withdrawal', 20000, '2026-10-18T13:00:00.000Z'), /excede o saldo disponível/);
  assert.equal(reserveRows.get('2026-09:cdi').reserve_movements.length, 2, 'uma tentativa acima do saldo aborta sem registrar histórico parcial');
  await saveNubankReserveBalance({ snapshot_id:'2026-09:nubank', item_id:'nubank', month_key:'2026-09', name:'Saldo Nubank', amount:600, currency:'BRL', type:'reserve' }, '2026-10-22T12:00:00.000Z');
  const latestNubank = reserveRows.get('2026-09:nubank');
  assert.equal(reserveRows.get('2026-08:nubank').amount, 689, 'o saldo bruto consolidado permanece consistente nos snapshots anteriores');
  assert.deepEqual(latestNubank.reserve_movements.map(({ type, amount }) => ({ type, amount })), [{ type:'expense', amount:89 }], 'reduzir R$ 689 para R$ 600 grava R$ 89 como gasto no histórico do snapshot mais recente');
  const afterNubankReduction = summarizeGlobalReserve([], [...reserveRows.values()], '2026-09');
  assert.equal(afterNubankReduction.contributions.find(item => item.item_id === 'nubank').amount, 600, 'o saldo Nubank líquido após a gravação é R$ 600');
  assert.deepEqual(afterNubankReduction.expenses, { BRL:89, USD:0 }, 'o gasto fica contabilizado na moeda da reserva');
  assert.equal(afterNubankReduction.balances.BRL, 16254, 'o total da reserva considera R$ 600 do Nubank e as demais deduções');
  await saveNubankReserveBalance({ snapshot_id:'2026-09:nubank', item_id:'nubank', month_key:'2026-09', name:'Saldo Nubank', amount:700, currency:'BRL', type:'reserve' }, '2026-10-22T13:00:00.000Z');
  assert.equal(reserveRows.get('2026-09:nubank').reserve_movements.length, 1, 'aumentar o saldo não cria gasto nem apaga o histórico anterior');
  assert.equal(summarizeGlobalReserve([], [...reserveRows.values()], '2026-09').contributions.find(item => item.item_id === 'nubank').amount, 700, 'o aumento atualiza corretamente o saldo líquido Nubank');
} finally {
  if (originalIndexedDB === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = originalIndexedDB;
  if (originalIDBKeyRange === undefined) delete globalThis.IDBKeyRange; else globalThis.IDBKeyRange = originalIDBKeyRange;
}
const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
assert.match(template, /HubDatabase\.openDatabase\(\)/, 'a tela usa o acesso compartilhado sem schema duplicado');
assert.match(template, /function loadBase\(file\)[\s\S]*?Object\.hasOwn\(parsed,'personal_finance'\)/, 'backup legado sem o domínio pessoal preserva as stores locais');
assert.match(template, /payload\.personal_finance=await personalFinance\.exportBundle\(\)/, 'backup completo inclui as stores do módulo pessoal');
const preparer = await readFile(new URL('../dist/preparador-MCC/index.html', import.meta.url), 'utf8');
assert.match(preparer, /const PANEL_DB_VERSION = HubDatabase.DB_VERSION/);
assert.match(preparer, /HubDatabase\.openDatabase\(\)/);
const infrastructure=await readFile(new URL('../src/storage/hub-database.js',import.meta.url),'utf8');
assert.match(infrastructure, /DB_VERSION = 5/);
assert.match(infrastructure, /personal_finance_entries/);
console.log('personal finance storage and backup ok');
