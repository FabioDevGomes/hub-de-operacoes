import assert from 'node:assert/strict';
import {
  applyLunchDinnerBudgetFallback, canEditActualForEntry, canEditActualForMonth, canMarkQuickPayInFutureMonthlyView, consolidatedPeriod, createGlobalExpenseTotals, createMonthSnapshot, dailyBudgetPace, DEFAULT_CONSOLIDATED_MONTH_COUNT, hasMonthlyOccurrence, isLunchDinnerCategory, LUNCH_DINNER_MONTHLY_BUDGET, MIN_CONSOLIDATED_MONTH_COUNT, monthWeekRange, monthlyAmountRemaining, monthlyCategoryStatus, normalizeEntry, overlayCurrentCategoryNames, quarterPeriod, reserveMinusOpenExpenses, summarizeByCurrency, summarizeGlobalReserve, summarizeMonthlyPeriodTotals, summarizePeriodEntries, summarizeQuarterEntries, updateEntryAmount, validateBundle, yearRemainderPeriod,
} from '../src/personal-finance/personal-finance-domain.mjs';

assert.equal(DEFAULT_CONSOLIDATED_MONTH_COUNT, 8, 'o consolidado abre com oito meses por padrão');
assert.equal(MIN_CONSOLIDATED_MONTH_COUNT, 8, 'o consolidado não permite menos de oito meses');


assert.deepEqual(quarterPeriod('2026-09'), {
  year:2026, quarter:3, monthKeys:['2026-07', '2026-08', '2026-09'], startMonth:'2026-07', endMonth:'2026-09', label:'3º trimestre de 2026',
}, 'a visão trimestral inclui os meses corretos do calendário');
assert.deepEqual(quarterPeriod('2027-01').monthKeys, ['2027-01', '2027-02', '2027-03'], 'o primeiro trimestre não cruza o ano');
assert.throws(() => quarterPeriod('2026-13'), /Mês inválido/);
assert.deepEqual(yearRemainderPeriod('2026-09'), { year:2026, monthKeys:['2026-09', '2026-10', '2026-11', '2026-12'], startMonth:'2026-09', endMonth:'2026-12', label:'setembro–dezembro de 2026' }, 'a visão de setembro até o fim do ano inclui quatro colunas mensais');
assert.deepEqual(yearRemainderPeriod('2026-12').monthKeys, ['2026-12'], 'dezembro até o fim do ano não cria meses do ano seguinte');
assert.throws(() => yearRemainderPeriod('2026-00'), /Mês inválido/);
assert.deepEqual(consolidatedPeriod('2026-09', 4), { year:2026, monthKeys:['2026-09', '2026-10', '2026-11', '2026-12'], startMonth:'2026-09', endMonth:'2026-12', label:'setembro–dezembro de 2026' }, 'consolidado mostra a quantidade de meses selecionada');
assert.deepEqual(consolidatedPeriod('2026-11', 4), { year:2026, monthKeys:['2026-11', '2026-12', '2027-01', '2027-02'], startMonth:'2026-11', endMonth:'2027-02', label:'novembro de 2026–fevereiro de 2027' }, 'o consolidado pode atravessar o fim do ano');
assert.deepEqual(consolidatedPeriod('2026-12', 1).monthKeys, ['2026-12'], 'um mês pode ser exibido no consolidado');
assert.throws(() => consolidatedPeriod('2026-09', 0), /1 a 120 meses/);
assert.throws(() => consolidatedPeriod('2026-09', 121), /1 a 120 meses/);
assert.throws(() => consolidatedPeriod('2026-09', 1.5), /1 a 120 meses/);
assert.deepEqual(monthWeekRange('2026-09', 1), { week_number:1, start_date:'2026-08-30', end_date:'2026-09-05' }, 'a semana fiscal 1 começa no domingo que antecede o primeiro sábado do mês');
assert.deepEqual(monthWeekRange('2026-09', 4), { week_number:4, start_date:'2026-09-20', end_date:'2026-09-26' }, 'a última semana fiscal de setembro termina no sábado 26');
assert.equal(monthWeekRange('2026-09', 5), null, 'setembro não inclui a semana 5 porque ela terminaria depois do mês, sem encerrar no sábado');
assert.deepEqual(monthWeekRange('2026-10', 1), { week_number:1, start_date:'2026-09-27', end_date:'2026-10-03' }, 'a primeira semana fiscal de outubro começa no domingo 27 de setembro');
assert.deepEqual(monthWeekRange('2026-10', 5), { week_number:5, start_date:'2026-10-25', end_date:'2026-10-31' }, 'outubro inclui a semana 5 porque ela termina no sábado dentro do mês');
assert.deepEqual(monthWeekRange('2023-09', 5), { week_number:5, start_date:'2023-09-24', end_date:'2023-09-30' }, 'quando o mês termina no sábado, a semana acaba nesse sábado');
assert.equal(monthWeekRange('2026-02', 5), null, 'semana sem ocorrência no mês não inventa datas');
assert.equal(hasMonthlyOccurrence({ month_key:'2026-09', category_name:'laser / jantar fora / cerveja – semana 5' }), false, 'categoria da semana 5 não ocorre em setembro de 2026');
assert.equal(hasMonthlyOccurrence({ month_key:'2026-10', category_name:'laser / jantar fora / cerveja – semana 5' }), true, 'categoria da semana 5 ocorre em outubro de 2026');
assert.equal(hasMonthlyOccurrence({ month_key:'2026-09', category_name:'almoço/janta Cartão Nub' }), true, 'categorias não semanais continuam ocorrendo normalmente');
assert.throws(() => monthWeekRange('2026-13', 1), /Mês inválido/);
assert.throws(() => monthWeekRange('2026-09', 0), /semana de 1 a 6/);
assert.throws(() => monthWeekRange('2026-09', 1.5), /semana de 1 a 6/);
const today = new Date(2026, 8, 25);
assert.equal(canEditActualForMonth('2026-09', today), true, 'realizado pode ser editado no mês atual');
assert.equal(canEditActualForMonth('2026-08', today), false, 'realizado fica bloqueado em meses anteriores');
assert.equal(canEditActualForMonth('2026-10', today), false, 'realizado fica bloqueado em meses futuros');
const octoberWeekOne = { month_key:'2026-10', category_name:'laser / jantar fora / cerveja – semana 1' };
const octoberWeekTwo = { month_key:'2026-10', category_name:'laser / jantar fora / cerveja – semana 2' };
assert.equal(canEditActualForEntry(octoberWeekOne, new Date(2026, 8, 26)), false, 'semana 1 seguinte não abre antes do fim da semana fiscal atual');
assert.equal(canEditActualForEntry(octoberWeekOne, new Date(2026, 8, 27)), true, 'semana 1 seguinte abre no domingo fiscal, antes do início do mês calendário');
assert.equal(canEditActualForEntry(octoberWeekTwo, new Date(2026, 8, 27)), false, 'a liberação antecipada não abre semanas posteriores nem outras despesas do mês seguinte');
assert.equal(canEditActualForEntry({ month_key:'2026-10', category_name:'Aluguel' }, new Date(2026, 8, 27)), false, 'a liberação antecipada vale apenas para a primeira semana fiscal');
assert.equal(canMarkQuickPayInFutureMonthlyView({ month_key:'2026-10', category_name:'Academia' }, new Date(2026, 8, 26)), true, 'academia pode ser marcada como paga em competência futura na visão Mensal');
assert.equal(canMarkQuickPayInFutureMonthlyView({ month_key:'2026-10', category_name:'DAS' }, new Date(2026, 8, 26)), true, 'DAS mantém o pagamento futuro como referência na visão Mensal');
assert.equal(canMarkQuickPayInFutureMonthlyView({ month_key:'2026-10', category_name:'Água' }, new Date(2026, 8, 26)), false, 'a exceção de pagamento futuro no modo Mensal fica limitada a DAS e academia');
assert.equal(canMarkQuickPayInFutureMonthlyView({ month_key:'2026-09', category_name:'Academia' }, new Date(2026, 8, 26)), false, 'a exceção não libera pagamento de mês passado');
assert.equal(LUNCH_DINNER_MONTHLY_BUDGET, 1250, 'o orçamento mensal de almoço e janta é R$ 1.250');
assert.equal(isLunchDinnerCategory('Almoço/janta Cartão Nub'), true, 'o nome importado é reconhecido ignorando acentos');
assert.equal(isLunchDinnerCategory('Academia'), false, 'outras categorias não recebem o orçamento especial');
const renamedCategorySnapshot = { month_key:'2026-09', category_id:'meals', category_name:'almoço/janta Cartão Nub', group_id:'g-expenses', group_name:'Despesas', currency:'BRL', planned_amount:1250, actual_amount:500 };
const renamedCategoryEntry = overlayCurrentCategoryNames([renamedCategorySnapshot], [{ category_id:'meals', name:'almoço/janta' }])[0];
assert.equal(renamedCategoryEntry.category_name, 'almoço/janta', 'Mensal e Consolidado podem exibir o nome atual da categoria pelo identificador');
assert.equal(renamedCategorySnapshot.category_name, 'almoço/janta Cartão Nub', 'resolver o nome atual não regrava o retrato histórico do lançamento');
assert.equal(overlayCurrentCategoryNames([renamedCategorySnapshot], [])[0], renamedCategorySnapshot, 'sem categoria atual, preserva o retrato histórico');
const lunchPace = dailyBudgetPace({ category_name:'Almoço/janta Cartão Nub', currency:'BRL', planned_amount:1250, actual_amount:1008 }, '2026-09', today);
assert.equal(lunchPace.daysInMonth, 30);
assert.equal(lunchPace.elapsedDays, 25, 'o ritmo considera os dias corridos até hoje');
assert.equal(lunchPace.expectedToDate, 1041.67, 'a meta acumulada é proporcional ao orçamento e aos dias decorridos');
assert.equal(lunchPace.dailyBudget, 1250 / 30, 'o limite diário deriva do orçamento mensal');
assert.equal(lunchPace.actualDailyAverage, 40.32, 'a média diária usa o gasto acumulado dividido pelos dias decorridos');
assert.equal(lunchPace.status, 'near', 'gasto abaixo da meta acumulada, mas acima de 80%, fica perto do limite');
assert.equal(monthlyAmountRemaining(1250, 1041), 209, 'o restante mensal de almoço/janta usa o orçamento integral menos o gasto realizado');
assert.equal(monthlyAmountRemaining(100, 70), 30, 'o restante mensal mantém o cálculo usado por uma categoria comum como café da manhã');
assert.equal(monthlyAmountRemaining(1250, null), null, 'sem gasto informado, não inventa um saldo restante realizado');
assert.equal(monthlyAmountRemaining(1250, 0), 1250, 'zero explícito de gasto mantém todo o orçamento disponível');
assert.equal(monthlyAmountRemaining(1250, 1300), -50, 'gasto acima do orçamento é exibido como excedente negativo');
assert.equal(reserveMinusOpenExpenses(45850, 45125), -725, 'a diferença compara a reserva global com despesas em aberto, sem incluir saldo Nubank');
assert.equal(reserveMinusOpenExpenses(100, 80), -20, 'despesa em aberto acima da reserva fica negativa');
assert.equal(reserveMinusOpenExpenses(80, 100), 20, 'reserva acima das despesas em aberto fica positiva');
assert.equal(reserveMinusOpenExpenses(null, null), 0, 'valores globais ausentes são tratados como zero nessa diferença');
assert.equal(dailyBudgetPace({ category_name:'Almoço e janta', currency:'BRL', planned_amount:1250, actual_amount:1100 }, '2026-09', today).status, 'overspent', 'gasto maior que a meta acumulada é acima do ritmo planejado');
assert.equal(dailyBudgetPace({ category_name:'Almoço e janta', currency:'BRL', planned_amount:1250, actual_amount:null }, '2026-09', today).status, 'missing', 'gasto não lançado continua distinto de zero');
assert.equal(dailyBudgetPace({ category_name:'Almoço e janta', currency:'BRL', planned_amount:1250, actual_amount:1300 }, '2026-08', today).status, 'overspent', 'mês passado compara o realizado com o orçamento mensal completo');
assert.equal(dailyBudgetPace({ category_name:'Almoço e janta', currency:'BRL', planned_amount:1250, actual_amount:0 }, '2026-10', today), null, 'mês futuro não recebe ritmo de gasto');
const quarterEntries = summarizeQuarterEntries([
  { month_key:'2026-07', category_id:'c1', category_name:'Aluguel', group_id:'g1', group_name:'Casa', currency:'BRL', planned_amount:100, actual_amount:null },
  { month_key:'2026-08', category_id:'c1', category_name:'Aluguel', group_id:'g1', group_name:'Casa', currency:'BRL', planned_amount:100, actual_amount:80 },
  { month_key:'2026-09', category_id:'c1', category_name:'Aluguel', group_id:'g1', group_name:'Casa', currency:'BRL', planned_amount:0, actual_amount:0 },
  { month_key:'2026-09', category_id:'c1', category_name:'Aluguel', group_id:'g1', group_name:'Casa', currency:'USD', planned_amount:25, actual_amount:null },
  { month_key:'2026-10', category_id:'c1', category_name:'Aluguel', group_id:'g1', group_name:'Casa', currency:'BRL', planned_amount:999, actual_amount:999 },
], quarterPeriod('2026-09').monthKeys);
const quarterlyBRL = quarterEntries.find(entry => entry.currency === 'BRL');
const quarterlyUSD = quarterEntries.find(entry => entry.currency === 'USD');
assert.equal(quarterlyBRL.months['2026-07'].planned, 100, 'o planejado mensal aparece no mês correspondente');
assert.equal(quarterlyBRL.months['2026-07'].actual, null, 'vazio continua distinto de zero por mês');
assert.equal(quarterlyBRL.months['2026-09'].actual, 0, 'zero registrado continua distinguível por mês');
assert.equal(quarterlyBRL.planned_amount, 200, 'total trimestral soma apenas o trimestre selecionado');
assert.equal(quarterlyBRL.actual_amount, 80, 'total trimestral preserva somente realizados informados');
assert.equal(quarterlyUSD.planned_amount, 25, 'valores em moedas diferentes permanecem em linhas separadas');
const monthlyTotals = summarizeMonthlyPeriodTotals(quarterEntries, quarterPeriod('2026-09').monthKeys);
assert.deepEqual(monthlyTotals['2026-07'].BRL, { planned:100, actual:null, plannedCount:1, actualCount:0, categoryCount:1 }, 'mês futuro sem gasto mantém o planejado e distingue ausência de zero');
assert.equal(monthlyTotals['2026-08'].BRL.planned, 100);
assert.equal(monthlyTotals['2026-08'].BRL.actual, 80, 'gasto mensal soma os realizados registrados');
assert.equal(monthlyTotals['2026-09'].BRL.actual, 0, 'gasto zero explicitamente registrado não vira ausência');
assert.equal(monthlyTotals['2026-09'].USD.planned, 25, 'totais mensais preservam moedas separadas');

const mealCategoryEntries = [
  { month_key:'2027-04', category_id:'meals', category_name:'almoço/janta Cartão Nub', group_id:'g-expenses', group_name:'Despesas', currency:'BRL', planned_amount:1250, actual_amount:1041 },
  { month_key:'2027-05', category_id:'meals', category_name:'almoço/janta Cartão Nub', group_id:'g-expenses', group_name:'Despesas', currency:'USD', planned_amount:200, actual_amount:null },
];
const mealMonthKeys = ['2027-04', '2027-05', '2027-06'];
const mealRows = summarizePeriodEntries(mealCategoryEntries, mealMonthKeys);
applyLunchDinnerBudgetFallback(mealRows, mealCategoryEntries, mealMonthKeys);
const mealTotals = summarizeMonthlyPeriodTotals(mealRows, mealMonthKeys);
const brlMealRow = mealRows.find(row => row.category_id === 'meals' && row.currency === 'BRL');
assert.equal(brlMealRow.months['2027-04'].planned, 1250, 'orçamento padrão continua aplicado quando o mês está em reais');
assert.equal(brlMealRow.months['2027-05'].planned, null, 'não duplica o orçamento padrão em reais quando o lançamento do mês está em dólares');
assert.equal(mealTotals['2027-05'].BRL.planned, null, 'o consolidado não soma reais ocultos em mês cuja categoria está em dólares');
assert.equal(mealTotals['2027-05'].USD.planned, 200, 'o consolidado mantém o valor planejado em dólares');
assert.equal(brlMealRow.months['2027-06'].planned, 1250, 'o padrão continua disponível para mês ainda sem lançamento de moeda');

const weeklyExpenses = [
  { month_key:'2026-09', category_id:'week4', category_name:'Lazer semana 4', group_id:'g1', group_name:'Despesas', currency:'BRL', planned_amount:300, actual_amount:250 },
  { month_key:'2026-09', category_id:'week5', category_name:'Lazer semana 5', group_id:'g1', group_name:'Despesas', currency:'BRL', planned_amount:300, actual_amount:200 },
  { month_key:'2026-10', category_id:'week5', category_name:'Lazer semana 5', group_id:'g1', group_name:'Despesas', currency:'BRL', planned_amount:300, actual_amount:null },
];
const septemberWeekly = summarizePeriodEntries(weeklyExpenses, ['2026-09']);
assert.equal(septemberWeekly.some(row => row.category_id === 'week5'), false, 'semana 5 não aparece nem soma no mês sem sábado de encerramento');
const octoberWeekly = summarizePeriodEntries(weeklyExpenses, ['2026-10']);
assert.equal(octoberWeekly.find(row => row.category_id === 'week5').months['2026-10'].planned, 300, 'semana 5 continua planejada no mês em que termina no sábado');
assert.equal(summarizeByCurrency(weeklyExpenses.filter(entry => entry.month_key === '2026-09')).BRL.actual, 250, 'resumo do mês exclui gasto lançado numa semana inexistente');

const groups = [{ group_id:'g-home', name:'Casa', sort_order:0, active:true }];
const categories = [
  { category_id:'c-rent', name:'Aluguel', group_id:'g-home', currency:'BRL', default_plan:1200, sort_order:0, active:true },
  { category_id:'c-coffee', name:'Café', group_id:'g-home', currency:'BRL', default_plan:100, sort_order:1, active:true },
  { category_id:'c-software', name:'Software', group_id:'g-home', currency:'USD', default_plan:25, sort_order:2, active:true },
  { category_id:'c-paused', name:'Inativa', group_id:'g-home', currency:'BRL', default_plan:10, sort_order:3, active:false },
];

const first = createMonthSnapshot({ monthKey:'2026-08', categories, groups, planSource:'defaults', createdAt:'2026-08-01T00:00:00.000Z' });
assert.equal(first.entries.length, 3, 'categorias inativas não entram em um mês novo');
assert.deepEqual(first.entries.map(item => item.actual_amount), [null, null, null], 'realizados começam sem valor, não como zero');
assert.equal(first.entries[0].planned_amount, 1200);
assert.equal(first.entries[0].category_name, 'Aluguel');
assert.equal(first.month.plan_source, 'defaults');
assert.equal(createMonthSnapshot({ monthKey:'2026-08', categories, groups:[{ ...groups[0], active:false }] }).entries.length, 0, 'grupo inativo não recebe novas categorias em meses');

const augustEntries = [
  updateEntryAmount(first.entries[0], 'actual_amount', 0),
  updateEntryAmount(first.entries[1], 'actual_amount', 80),
  updateEntryAmount(first.entries[2], 'actual_amount', 50),
];
assert.equal(monthlyCategoryStatus(augustEntries[0]), 'under', 'zero realizado é valor válido distinto de ausente');
assert.equal(monthlyCategoryStatus(first.entries[0]), 'missing');
assert.equal(monthlyCategoryStatus(augustEntries[1]), 'near', '80% do plano sinaliza proximidade do limite');
assert.equal(monthlyCategoryStatus(augustEntries[2]), 'overspent');

const copied = createMonthSnapshot({ monthKey:'2026-09', categories, groups, previousEntries:augustEntries, planSource:'previous' });
assert.equal(copied.entries[0].planned_amount, 1200, 'o plano anterior é copiado');
assert.equal(copied.entries[1].planned_amount, 100);
assert.equal(copied.entries[1].actual_amount, null, 'realizado anterior não é copiado');
assert.equal(copied.month.plan_source, 'previous');
const defaults = createMonthSnapshot({ monthKey:'2026-10', categories, groups, previousEntries:augustEntries, planSource:'defaults' });
assert.equal(defaults.entries[1].planned_amount, 100, 'plano padrão pode ser usado em vez do mês anterior');
assert.equal(defaults.entries[1].actual_amount, null);
const lunchCategory = { category_id:'c-meals', name:'Almoço/janta Cartão Nub', group_id:'g-home', currency:'BRL', default_plan:null, sort_order:4, active:true };
const lunchDefaults = createMonthSnapshot({ monthKey:'2026-09', categories:[lunchCategory], groups, planSource:'defaults' });
assert.equal(lunchDefaults.entries[0].planned_amount, 1250, 'a categoria almoço e janta recebe o orçamento mensal padrão');
const lunchPrevious = createMonthSnapshot({ monthKey:'2026-10', categories:[lunchCategory], groups, previousEntries:[{ ...lunchDefaults.entries[0], planned_amount:null }], planSource:'previous' });
assert.equal(lunchPrevious.entries[0].planned_amount, 1250, 'o orçamento padrão de refeições não se perde se o plano anterior estiver em branco');

const summary = summarizeByCurrency(augustEntries, [
  { currency:'BRL', amount:300, status:'open' },
  { currency:'BRL', amount:50, status:'paid' },
  { currency:'USD', amount:10, status:'open' },
], [
  { currency:'BRL', amount:500, type:'available' },
  { currency:'BRL', amount:200, type:'reserve' },
  { currency:'USD', amount:25, type:'available' },
]);
assert.deepEqual(Object.keys(summary).sort(), ['BRL', 'USD']);
assert.equal(summary.BRL.planned, 1300);
assert.equal(summary.BRL.actual, 80);
assert.equal(summary.BRL.remaining, 1220);
assert.equal(summary.BRL.debts, 300, 'dívida paga não entra no saldo devedor');
assert.equal(summary.BRL.netPosition, 400, 'posição líquida é calculada somente em BRL');
assert.equal(summary.USD.planned, 25);
assert.equal(summary.USD.actual, 50);
assert.equal(summary.USD.netPosition, 15, 'posição em USD permanece separada de BRL');

const reserveLedger = summarizeGlobalReserve([
  { month_key:'2026-07', currency:'BRL', actual_amount:900, category_id:'before' },
  { month_key:'2026-08', currency:'BRL', actual_amount:100, category_id:'rent' },
  { month_key:'2026-09', currency:'BRL', actual_amount:75, category_id:'food' },
  { month_key:'2026-09', currency:'USD', actual_amount:10, category_id:'software' },
  { month_key:'2026-10', currency:'BRL', actual_amount:999, category_id:'future' },
], [
  { item_id:'reserve-brl', month_key:'2026-08', name:'Poupança', amount:500, currency:'BRL', type:'reserve' },
  { item_id:'reserve-brl', month_key:'2026-09', name:'Poupança', amount:500, currency:'BRL', type:'reserve' },
  { item_id:'reserve-usd', month_key:'2026-09', name:'Dólares', amount:100, currency:'USD', type:'reserve' },
  { item_id:'available', month_key:'2026-09', name:'Disponível', amount:700, currency:'BRL', type:'available' },
  { item_id:'nubank-brl', month_key:'2026-08', name:'Nubank', amount:683, currency:'BRL', type:'available' },
  { item_id:'nubank-brl', month_key:'2026-09', name:'Nubank', amount:615, currency:'BRL', type:'available' },
  { item_id:'nubank-brl', month_key:'2026-10', name:'Nubank', amount:999, currency:'BRL', type:'available' },
  { item_id:'nubank-usd', month_key:'2026-09', name:'Nubank USD', amount:20, currency:'USD', type:'available' },
], '2026-09');
assert.equal(reserveLedger.firstContributionMonth, '2026-08');
assert.deepEqual(reserveLedger.contributed, { BRL:500, USD:100 }, 'snapshots mensais repetidos contam como um único aporte global');
assert.deepEqual(reserveLedger.spent, { BRL:175, USD:10 }, 'os gastos realizados continuam totalizados separadamente por moeda');
assert.deepEqual(reserveLedger.balances, { BRL:500, USD:100 }, 'a disponibilidade global corresponde aos aportes e não é abatida pelos gastos');
assert.deepEqual(reserveLedger.nubankBalances, { BRL:615, USD:20 }, 'somente o snapshot mais recente de cada item Nubank entra, mantendo moedas separadas');
assert.equal(reserveLedger.contributions.length, 2, 'disponibilidades não são tratadas como aportes da reserva');
const reserveAfterFuturePayment = summarizeGlobalReserve([
  { month_key:'2026-08', currency:'BRL', actual_amount:100 },
  { month_key:'2026-09', currency:'BRL', actual_amount:75 },
  { month_key:'2026-10', currency:'BRL', actual_amount:86.05 },
], [
  { item_id:'reserve-brl', month_key:'2026-08', amount:500, currency:'BRL', type:'reserve' },
], '2026-09', { includeFutureActual:true });
assert.equal(reserveAfterFuturePayment.spent.BRL, 261.05, 'pagamentos adiantados em colunas futuras continuam contabilizados como gastos');
assert.equal(reserveAfterFuturePayment.balances.BRL, 500, 'gastos futuros também não alteram a disponibilidade global');
const reserveWithNonexistentWeek = summarizeGlobalReserve([
  { month_key:'2026-09', currency:'BRL', category_name:'Lazer semana 5', actual_amount:200 },
], [{ item_id:'reserve-september', month_key:'2026-09', amount:500, currency:'BRL', type:'reserve' }], '2026-09');
assert.equal(reserveWithNonexistentWeek.balances.BRL, 500, 'gasto de semana sem ocorrência não reduz a reserva nem o total mensal');
const reserveAtAugust = summarizeGlobalReserve([
  { month_key:'2026-08', currency:'BRL', actual_amount:100 },
  { month_key:'2026-09', currency:'BRL', actual_amount:75 },
], [
  { item_id:'reserve-brl', month_key:'2026-08', amount:500, currency:'BRL', type:'reserve' },
  { item_id:'reserve-brl', month_key:'2026-09', amount:500, currency:'BRL', type:'reserve' },
], '2026-08');
assert.deepEqual(reserveAtAugust.balances, { BRL:500, USD:0 }, 'meses posteriores ao período consultado não alteram os aportes visíveis nessa data');
const futureReserveContribution = summarizeGlobalReserve([], [
  { item_id:'reserve-future', month_key:'2026-08', name:'Reserva nova', amount:500, currency:'BRL', type:'reserve' },
  { item_id:'reserve-future', month_key:'2026-10', name:'Reserva nova', amount:800, currency:'BRL', type:'reserve' },
  { item_id:'reserve-future-new', month_key:'2026-11', name:'Aporte futuro', amount:250, currency:'BRL', type:'reserve' },
  { item_id:'nubank-future', month_key:'2026-10', name:'Nubank', amount:999, currency:'BRL', type:'available' },
], '2026-09', { includeFutureContributions:true });
assert.equal(futureReserveContribution.balances.BRL, 1050, 'aporte e atualização cadastrados em meses futuros entram no saldo global sem duplicar snapshots');
assert.equal(futureReserveContribution.nubankBalances.BRL, 0, 'saldo disponível Nubank futuro não antecipa o saldo corrente');
const correctedContribution = summarizeGlobalReserve([
  { month_key:'2026-08', currency:'BRL', actual_amount:100 },
  { month_key:'2026-09', currency:'BRL', actual_amount:75 },
], [
  { item_id:'reserve-brl', month_key:'2026-08', amount:500, currency:'BRL', type:'reserve' },
  { item_id:'reserve-brl', month_key:'2026-09', amount:650, currency:'BRL', type:'reserve' },
], '2026-09');
assert.equal(correctedContribution.balances.BRL, 650, 'um snapshot mais recente atualiza o valor bruto do aporte sem somar a cópia');
const reserveKpis = summarizeByCurrency([
  { currency:'BRL', planned_amount:100, actual_amount:75 },
], [], [
  { currency:'BRL', amount:500, type:'available' },
  { currency:'BRL', amount:500, type:'reserve' },
], undefined, reserveLedger.balances);
assert.equal(reserveKpis.BRL.reserves, 500, 'o resumo financeiro usa a disponibilidade global igual aos aportes brutos');
assert.equal(reserveKpis.BRL.netPosition, 1000, 'a posição líquida combina disponibilidade mensal e reserva sem abatimento de gastos');
const globalAsOf = new Date(2026, 8, 26);
const globalExpensesAfterFuturePayment = createGlobalExpenseTotals(globalAsOf);
globalExpensesAfterFuturePayment.add({ month_key:'2026-09', category_id:'das', category_name:'DAS', currency:'BRL', planned_amount:86.05, actual_amount:null });
globalExpensesAfterFuturePayment.add({ month_key:'2026-10', category_id:'das', category_name:'DAS', currency:'BRL', planned_amount:86.05, actual_amount:86.05 });
globalExpensesAfterFuturePayment.add({ month_key:'2026-11', category_id:'nubank', category_name:'Cart nubank', currency:'BRL', planned_amount:169, actual_amount:null });
assert.deepEqual(globalExpensesAfterFuturePayment.result().BRL, { planned:341.1, actual:86.05, remaining:255.05 }, 'o consolidado global inclui todo valor mensal planejado, inclusive Cart nubank em meses além da próxima fatura');

const globalOpenExpenses = createGlobalExpenseTotals(globalAsOf);
globalOpenExpenses.add({ month_key:'2026-09', category_id:'planned', category_name:'Planejada', currency:'BRL', planned_amount:1000, actual_amount:100 });
globalOpenExpenses.add({ month_key:'2026-09', category_id:'unplanned', category_name:'Sem plano', currency:'BRL', planned_amount:null, actual_amount:200 });
globalOpenExpenses.add({ month_key:'2026-10', category_id:'overpaid', category_name:'Pago acima', currency:'BRL', planned_amount:50, actual_amount:75 });
globalOpenExpenses.add({ month_key:'2026-09', category_id:'usd', category_name:'Despesa USD', currency:'USD', planned_amount:100, actual_amount:25 });
assert.deepEqual(globalOpenExpenses.result().BRL, { planned:1050, actual:375, remaining:925 }, 'o saldo global soma o aberto item a item e inclui somente excedentes das linhas com planejamento; gastos sem planejado ficam fora');
assert.deepEqual(globalOpenExpenses.result().USD, { planned:100, actual:25, remaining:75 }, 'o saldo global em dólares mantém a moeda separada e subtrai somente o realizado dentro do planejamento daquela linha');
const globalOpenWithUncoveredSpending = createGlobalExpenseTotals(globalAsOf);
globalOpenWithUncoveredSpending.add({ month_key:'2026-09', category_id:'lunch', category_name:'Almoço', currency:'BRL', planned_amount:100, actual_amount:110 });
globalOpenWithUncoveredSpending.add({ month_key:'2026-09', category_id:'unplanned', category_name:'Sem plano', currency:'BRL', planned_amount:null, actual_amount:10 });
globalOpenWithUncoveredSpending.add({ month_key:'2026-09', category_id:'within-plan', category_name:'Dentro do plano', currency:'BRL', planned_amount:100, actual_amount:10 });
assert.equal(globalOpenWithUncoveredSpending.result().BRL.remaining, 100, 'R$ 110 realizados em uma linha planejada em R$ 100 adicionam R$ 10; gasto sem planejado fica fora e gasto dentro do plano reduz o aberto');

const futureOnlyExpenses = createGlobalExpenseTotals(globalAsOf);
for (const [week, actual] of [[1, 700], [2, 299], [3, 784], [4, 410]]) {
  futureOnlyExpenses.add({ month_key:'2026-09', category_id:`week${week}`, category_name:`Lazer semana ${week}`, currency:'BRL', planned_amount:300, actual_amount:actual });
}
futureOnlyExpenses.add({ month_key:'2026-08', category_id:'past-month', category_name:'Conta passada', currency:'BRL', planned_amount:500, actual_amount:null });
futureOnlyExpenses.add({ month_key:'2026-09', category_id:'current-month', category_name:'Conta mensal', currency:'BRL', planned_amount:300, actual_amount:200 });
futureOnlyExpenses.add({ month_key:'2026-10', category_id:'future-week1', category_name:'Lazer semana 1', currency:'BRL', planned_amount:300, actual_amount:null });
assert.deepEqual(futureOnlyExpenses.result().BRL, { planned:600, actual:200, remaining:400 }, 'o total global exclui competências passadas e semanas atuais encerradas, preservando o saldo do mês e as competências futuras');
assert.equal(reserveMinusOpenExpenses(45850, 45740), -110, 'com as semanas históricas excluídas, R$ 45.740 de reserva menos R$ 45.850 de despesas futuras resulta em -R$ 110');

const cleanBundle = validateBundle({ schema:'personal_finance_v1', groups, categories, months:[first.month], entries:first.entries, debts:[], funds:[] });
assert.equal(cleanBundle.categories.length, 4);
assert.throws(() => validateBundle({ schema:'personal_finance_v1', groups, categories, months:[first.month], entries:[{ ...first.entries[0], entry_id:'bad', category_id:'missing' }], debts:[], funds:[] }), /categoria inexistente/);
assert.throws(() => normalizeEntry({ ...first.entries[0], actual_amount:-1 }), /maior ou igual a zero/);
console.log('personal finance domain ok');
