import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as Storage from '../src/personal-finance/personal-finance-storage.mjs';
import { validateBundle } from '../src/personal-finance/personal-finance-domain.mjs';

for (const directory of ['src', 'dist']) {
  const view = await readFile(new URL(`../${directory}/personal-finance/personal-finance-view.mjs`, import.meta.url), 'utf8');
  const css = await readFile(new URL(`../${directory}/personal-finance/personal-finance.css`, import.meta.url), 'utf8');
  const storage = await readFile(new URL(`../${directory}/personal-finance/personal-finance-storage.mjs`, import.meta.url), 'utf8');
  assert.doesNotMatch(view, /Importar despesas|pfImport|pf-import|toggle-import|preview-import|execute-import|importPanel|importOpen|importText|importBundle|importPreview|expenseSourceToBundle|personal_finance_expenses_source_v1|mergeExpensesBundle/);
  assert.doesNotMatch(css, /pf-import/);
  assert.doesNotMatch(storage, /mergeExpensesBundle|personal_finance_expenses_source_v1/);
  assert.match(view, /data-action="create-month"/);
  assert.match(view, /data-action="new-category"/);
  assert.match(view, /Storage\.saveEntry\(/);
  assert.match(view, /<div class="pf-header-actions">\$\{viewToggle\}<\/div>/);
}
assert.equal(Object.hasOwn(Storage, 'mergeExpensesBundle'), false);
assert.equal(Object.hasOwn(Storage, 'mergeExpensesBundleToTransaction'), false);
for (const name of ['exportBundle', 'writeBundleToTransaction', 'hasData', 'countData', 'saveEntry', 'createMonth']) assert.equal(typeof Storage[name], 'function', `preserva ${name}`);

// IDs antigos de importação são dados válidos de backup, não um recurso a apagar.
const groupId = 'import:controle-2026-e:despesas', categoryId = `${groupId}:row:2`;
const base = {
  schema:'personal_finance_v1', version:1,
  groups:[{ group_id:groupId, name:'Grupo sintético', active:true }],
  categories:[{ category_id:categoryId, group_id:groupId, name:'Item sintético', currency:'BRL', active:true }],
  months:[{ month_key:'2026-10' }, { month_key:'2026-11' }],
  entries:[
    { entry_id:`2026-10:${categoryId}`, month_key:'2026-10', category_id:categoryId, category_name:'Item sintético', group_id:groupId, group_name:'Grupo sintético', currency:'BRL', planned_amount:100, actual_amount:null },
    { entry_id:`2026-11:${categoryId}`, month_key:'2026-11', category_id:categoryId, category_name:'Item sintético', group_id:groupId, group_name:'Grupo sintético', currency:'USD', planned_amount:25, actual_amount:0 },
  ], debts:[], funds:[], settings:[],
};
const restored = validateBundle(base);
assert.equal(restored.categories[0].category_id, categoryId);
assert.equal(restored.entries[0].actual_amount, null);
assert.equal(restored.entries[1].actual_amount, 0);
assert.equal(restored.entries[1].currency, 'USD');
assert.equal(restored.entries[0].entry_id, base.entries[0].entry_id);
const rows = new Map();
Storage.writeBundleToTransaction({ objectStore:name => ({
  clear() { rows.set(name, []); }, put(row) { rows.get(name).push(row); },
}) }, base);
assert.equal(rows.get(Storage.STORES.entries)[0].entry_id, base.entries[0].entry_id);
assert.equal(rows.get(Storage.STORES.entries)[1].actual_amount, 0);
console.log('controle de gastos sem importação de planilha; edição e backup preservados');
