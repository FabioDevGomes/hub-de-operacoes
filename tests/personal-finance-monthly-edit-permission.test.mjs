import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canEditActualForView, canEditActualForEntry } from '../src/personal-finance/personal-finance-domain.mjs';

for (const now of [new Date(2026, 9, 7), new Date(2026, 11, 20)]) {
  const month = delta => {
    const date = new Date(now.getFullYear(), now.getMonth() + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };
  for (const category_name of ['Aluguel', 'Semana 1', 'Semana 2', 'Cartão Nubank']) {
    for (const delta of [-1, 0, 1, 2]) {
      const entry = { month_key:month(delta), category_name, actual_amount:null };
      const before = structuredClone(entry);
      assert.equal(canEditActualForView(entry, 'month', now), delta <= 1);
      assert.equal(canEditActualForView(entry, 'consolidated', now), false);
      assert.equal(canEditActualForView(entry, 'quarter', now), canEditActualForEntry(entry, now));
      assert.deepEqual(entry, before);
    }
  }
}
assert.equal(canEditActualForView({ month_key:'2026-13' }, 'month', new Date(2026, 9, 7)), false);
const view = await readFile(new URL('../src/personal-finance/personal-finance-view.mjs', import.meta.url), 'utf8');
assert.ok(view.includes("Domain.canEditActualForView(row, 'month', now)"));
assert.ok(view.includes('Domain.canEditActualForView(existing, state.viewMode, new Date())'));
assert.ok(view.includes('actualEditable && !consolidated'));
assert.ok(view.includes('pf-difference-card--single'));
assert.ok(view.includes('reserveCoverage(code).globalDifference'));
console.log('Monthly-only next-month editing and separate reserve cards ok');
