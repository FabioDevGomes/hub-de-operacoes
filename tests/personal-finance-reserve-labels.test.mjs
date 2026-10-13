import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/personal-finance/personal-finance-view.mjs', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('  function positionList('), source.indexOf('  function modalMarkup('));

export function renderPositions(items, kind) {
  const before = JSON.stringify(items);
  const context = {
    esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    money: (value, currency) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value),
  };
  vm.runInNewContext(renderer, context);
  const html = context.positionList(items, kind);
  assert.equal(JSON.stringify(items), before, 'Remover o texto não altera os registros');
  return html;
}

const item = { item_id: 'synthetic-reserve', snapshot_id: 'synthetic-month', name: 'Aporte de teste',
  started_month_key: '2026-09', month_key: '2026-10', currency: 'BRL', amount: 100, notes: 'Nota de teste' };

test('Aportes mantém nome, valor e ações sem a linha descritiva secundária', () => {
  const html = renderPositions([item, { ...item, item_id: 'synthetic-usd', currency: 'USD', amount: 0 }], 'reserve');
  assert.doesNotMatch(html, /<small>|Reserva global · desde|2026-09|Nota de teste/);
  assert.match(html, /<strong>Aporte de teste<\/strong>/);
  assert.match(html, /data-action="edit-reserve" data-id="synthetic-reserve"/);
  assert.match(html, /data-action="delete-reserve" data-id="synthetic-reserve"/);
  assert.ok(html.includes(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(100)));
  assert.ok(html.includes(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(0)));
  assert.match(renderPositions([], 'reserve'), /Nenhum aporte da reserva até este mês/);
});

test('Disponibilidade e dívidas preservam descrições, notas e IDs mensais', () => {
  assert.match(renderPositions([item], 'fund'), /<small>Disponível · BRL · Nota de teste<\/small>/);
  assert.match(renderPositions([item], 'fund'), /data-action="delete-fund" data-id="synthetic-month"/);
  assert.match(renderPositions([{ ...item, status: 'paid' }], 'debt'), /<small>Paga · BRL · Nota de teste<\/small>/);
  assert.match(renderPositions([{ ...item, status: 'open' }], 'debt'), /<small>Em aberto · BRL · Nota de teste<\/small>/);
});

test('Aportes usa uma coluna numérica fixa e responsiva sem afetar outras listas', async () => {
  const css = await readFile(new URL('../src/personal-finance/personal-finance.css', import.meta.url), 'utf8');
  assert.match(renderPositions([item], 'reserve'), /class="pf-position-list pf-reserve-list"/);
  for (const kind of ['fund', 'debt']) assert.doesNotMatch(renderPositions([item], kind), /pf-reserve-list/);
  assert.ok(css.includes('.pf-reserve-list .pf-position-row{display:grid;grid-template-columns:minmax(0,1fr) 150px minmax(160px,1fr);align-items:center}'));
  assert.ok(css.includes('.pf-reserve-list .pf-position-row>b{text-align:right}'));
  assert.ok(css.includes('.pf-reserve-list .pf-position-row>.pf-actions{justify-self:end;width:auto}'));
  assert.ok(css.includes('@container(max-width:460px)'));
  assert.ok(css.includes('grid-column:1/-1'));
});
