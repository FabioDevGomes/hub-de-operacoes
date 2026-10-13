import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as Domain from '../src/personal-finance/personal-finance-domain.mjs';

const now = new Date(2026, 9, 2);
const expense = (month, plan, actual = null, extra = {}) => ({ month_key:month, category_id:'budget', category_name:'Semana 1', currency:'BRL', planned_amount:plan, actual_amount:actual, ...extra });
const card = (month, invoice, paid = null, extra = {}) => expense(month, null, paid, { category_id:'card', category_name:'Cartão Nubank', card_debt_amount:invoice, ...extra });
function projection(entries, reserve = 1000) {
  const before = structuredClone(entries);
  const calculator = Domain.createGlobalExpenseTotals(now);
  entries.forEach(row => calculator.add(row));
  const global = calculator.result();
  const monthly = Domain.summarizeMonthlyOpenDebts(entries.filter(row => row.month_key === '2026-10'), [], global, now);
  const commitments = Domain.sumGlobalOpenCommitments(global.BRL, monthly.BRL);
  assert.deepEqual(entries, before, 'calcular não modifica faturas, pagamentos nem histórico');
  return { global, monthly, commitments, difference:Domain.reserveMinusOpenExpenses(commitments, reserve) };
}

test('faturas futuras entram uma vez, inclusive fora da janela e após fatura atual paga', () => {
  const result = projection([card('2026-09', 900), card('2026-10', 200, 200), card('2026-11', 150), card('2026-12', 250, 50), card('2028-01', 10)]);
  assert.equal(result.global.BRL.currentCardDebt, 0);
  assert.equal(result.global.BRL.futureCardDebt, 360);
  assert.equal(result.global.BRL.cardDebt, 360);
  assert.equal(result.monthly.BRL.total, 0, 'resumo mensal não recebe faturas futuras');
  assert.equal(result.commitments, 360);
  assert.equal(result.difference, 640);
});

test('consumir 100 do orçamento e reservar 100 na fatura futura não duplica a compra', () => {
  const before = projection([expense('2026-10', 300), card('2026-11', 0)]);
  const after = projection([expense('2026-10', 300, 100), card('2026-11', 100)]);
  assert.equal(before.commitments, 300);
  assert.equal(after.commitments, 300);
  assert.equal(after.difference, before.difference);
  assert.equal(projection([expense('2026-10', 300, 100), card('2026-11', 150)]).difference, before.difference - 50);
});

test('aumentar um planejamento futuro de 300 para 400 reduz a diferença em 100', () => {
  const before = projection([expense('2026-12', 300), card('2026-11', 150)]);
  const after = projection([expense('2026-12', 400), card('2026-11', 150)]);
  assert.equal(after.difference, before.difference - 100);
  assert.equal(after.commitments, 550);
});

test('pagamento parcial libera somente o pago; ajuste manual do saldo mantém a diferença', () => {
  const before = projection([card('2026-11', 150)], 1000);
  const payment = projection([card('2026-11', 150, 100)], 1000);
  const reconciled = projection([card('2026-11', 150, 100)], 900);
  assert.equal(payment.commitments, 50);
  assert.equal(payment.difference, before.difference + 100, 'não debitar saldo automaticamente');
  assert.equal(reconciled.difference, before.difference);
  assert.equal(projection([card('2026-11', 150, 150)]).commitments, 0);
});

test('BRL/USD, centavos, vazio/zero e formatos legados permanecem independentes', () => {
  const legacy = expense('2026-11', null, 75.25, { category_id:'legacy', category_name:'Cart nubank' });
  const result = projection([card('2026-10', 10.1, 0), card('2026-11', 0.2, 0), card('2026-12', null), legacy, card('2026-11', 90, 10, { currency:'USD', category_id:'usd-card' })]);
  assert.equal(result.global.BRL.cardDebt, 85.55);
  assert.equal(result.global.USD.cardDebt, 80);
  assert.equal(result.monthly.BRL.cardDebt, 10.1);
  assert.equal(result.commitments, 85.55);
  assert.equal(Domain.cardPaymentAmount(legacy), null, 'realizado legado sem planejado não significa pagamento');
});

test('fallback legado até o mês atual e ordem da leitura não duplicam snapshots antigos', () => {
  const entries = [card('2026-08', 900), card('2026-09', 100), card('2026-11', 50)];
  const forward = projection(entries);
  const reverse = projection([...entries].reverse());
  assert.deepEqual(reverse.global, forward.global);
  assert.equal(forward.global.BRL.currentCardDebt, 100);
  assert.equal(forward.global.BRL.futureCardDebt, 50);
  assert.equal(forward.commitments, 150);
});

test('resumo e cartões renderizados em ambos os modos incluem compromissos futuros', async () => {
  const source = await readFile(new URL('../src/personal-finance/personal-finance-view.mjs', import.meta.url), 'utf8');
  const renderers = source.slice(source.indexOf('  function reserveCoverage('), source.indexOf('  function renderPeriodKpis('));
  const result = projection([expense('2026-10', 300, 100), expense('2026-12', 400), card('2026-11', 150)]);
  const money = (value, currency) => new Intl.NumberFormat('pt-BR', { style:'currency', currency }).format(value);
  const state = { reserveSummary:{ balances:{ BRL:1000, USD:0 } }, globalExpenseTotals:result.global, monthlyOpenDebts:result.monthly, viewMode:'month', monthKey:'2026-11' };
  const context = { Domain, state, money, usdClass:() => '' };
  vm.runInNewContext(renderers, context);
  const monthCards = context.renderReserveDifferenceCard();
  const monthSummary = context.renderGlobalReserveSummary();
  assert.ok(monthCards.includes(money(250, 'BRL')));
  assert.ok(monthSummary.includes('Compromissos dos próximos meses'));
  assert.ok(monthSummary.includes(money(550, 'BRL')));
  assert.ok(monthSummary.includes('Faturas Nubank (incluídas no total)'));
  state.viewMode = 'consolidated';
  state.monthKey = '2026-10';
  assert.equal(context.renderReserveDifferenceCard(), monthCards, 'mês visível não limita a diferença');
  assert.equal(context.renderGlobalReserveSummary(), monthSummary);
  state.globalExpenseTotals = projection([expense('2026-10', 300, 100), expense('2026-12', 400), card('2026-11', 250)]).global;
  assert.ok(context.renderReserveDifferenceCard().includes(money(150, 'BRL')), 'nova leitura após edição atualiza cartão');
});
