import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import * as Domain from '../src/personal-finance/personal-finance-domain.mjs';

const source = await readFile(new URL('../src/personal-finance/personal-finance-view.mjs', import.meta.url), 'utf8');
const monthly = source.slice(source.indexOf('  function categoryTable()'), source.indexOf('  function periodCategoryTable('));

// Synthetic presentation fixture only: no Storage, IndexedDB or financial records.
export function renderRowLayoutFixture() {
  const date = new Date();
  const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const names = ['Categoria simples', 'Semana 1', 'Categoria inativa'];
  const entries = names.map((category_name, index) => ({
    entry_id: `layout-entry-${index}`, category_id: `layout-category-${index}`,
    category_name, group_name: 'Grupo de teste', month_key: monthKey,
    currency: 'BRL', planned_amount: 100, actual_amount: index === 2 ? null : 25,
  }));
  const state = { monthKey, month: { month_key: monthKey }, entries,
    categories: entries.map((row, index) => ({ category_id: row.category_id, name: row.category_name, active: index !== 2 })),
  };
  const before = JSON.stringify(state);
  const context = {
    Domain, state, sortedEntries: () => entries,
    plannedAmountForEntry: row => row.planned_amount, actualAmountForEntry: row => row.actual_amount,
    categoryById: id => state.categories.find(category => category.category_id === id),
    esc: value => String(value ?? ''), usdClass: () => '', amount: value => Number(value).toFixed(2),
    money: (value, currency) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value),
    dailyBudgetTarget: () => '', monthlyDueDays: new Map(),
    normalizeExpenseCategoryName: value => value.toLowerCase(),
    weeklyCategoryPeriod: name => name.startsWith('Semana')
      ? '<small class="pf-week-range">Período: 04/10/2026–10/10/2026</small>' : '',
  };
  vm.runInNewContext(monthly, context);
  const html = context.categoryTable();
  assert.equal(JSON.stringify(state), before, 'Renderizar não altera registros');
  return html;
}

test('ações mensais mantêm a célula nativa e centralizam os botões em um wrapper interno', () => {
  const html = renderRowLayoutFixture();
  const rows = [...html.matchAll(/<tr class="pf-category-row[^\"]*">([\s\S]*?)<\/tr>/g)];
  assert.equal(rows.length, 3);
  for (const [, row] of rows) {
    assert.equal((row.match(/<td(?:\s|>)/g) ?? []).length, 7);
    assert.match(row, /<td><div class="pf-row-actions">[\s\S]*<\/div><\/td>$/);
    assert.doesNotMatch(row, /<td[^>]*class="pf-row-actions"/);
    assert.equal((row.match(/data-action="edit-category"/g) ?? []).length, 1);
    assert.equal((row.match(/data-action="move-category"/g) ?? []).length, 2);
  }
  assert.match(html, /pf-week-range/);
  assert.match(html, /Inativa para novos meses/);
  assert.doesNotMatch(html, /mark-expense-paid/);
});
