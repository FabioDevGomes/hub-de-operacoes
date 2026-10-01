import * as Domain from './personal-finance-domain.mjs?v=21';
import * as Storage from './personal-finance-storage.mjs?v=16';
import { subscribeToPersonalFinanceUpdates } from './personal-finance-sync.mjs?v=1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
const localMonth = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const isNubankCardCategory = Domain.isNubankCardCategory;
const shiftMonth = (monthKey, delta) => {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return localMonth(date);
};
const monthName = monthKey => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
};
const quarterMonthLabel = monthKey => {
  const [year, month] = monthKey.split('-').map(Number);
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][month - 1]}/${year}`;
};
const weeklyCategoryPeriod = (name, monthKeys) => {
  const match = String(name || '').match(/\bsemana\s*(\d+)\b/i);
  if (!match) return '';
  const weekNumber = Number(match[1]);
  const dateParts = isoDate => {
    const [, month, day] = isoDate.split('-');
    return { month, day };
  };
  const periods = monthKeys.map(monthKey => {
    const label = quarterMonthLabel(monthKey);
    const range = Domain.monthWeekRange(monthKey, weekNumber);
    if (!range) return `${label}: sem ocorrência`;
    const start = dateParts(range.start_date), end = dateParts(range.end_date);
    return `${label}: ${start.day}/${start.month}–${end.day}/${end.month}`;
  });
  if (monthKeys.length === 1) {
    const range = Domain.monthWeekRange(monthKeys[0], weekNumber);
    return range
      ? `<small class="pf-week-range">Período: ${range.start_date.split('-').reverse().join('/')}–${range.end_date.split('-').reverse().join('/')}</small>`
      : `<small class="pf-week-range is-empty">Semana ${weekNumber} sem ocorrência em ${esc(monthName(monthKeys[0]))}</small>`;
  }
  return `<small class="pf-week-range">Datas: ${periods.join(' · ')}</small>`;
};
const amount = value => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const money = (value, code) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code, minimumFractionDigits: 2 }).format(Number(value || 0));
const usdClass = code => code === 'USD' ? 'pf-money-usd' : '';
const quickPayCategoryNames = new Set(['das', 'agua', 'energia', 'internet', 'academia', 'aluguel']);
const normalizeExpenseCategoryName = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const monthlyDueDays = new Map([['aluguel', 24], ['internet', 10], ['energia', 16]]);
const isQuickPayCategory = value => quickPayCategoryNames.has(normalizeExpenseCategoryName(value));
const quickPayButtonMarkup = (entry, planned, editable) => {
  if (!entry || !isQuickPayCategory(entry.category_name)) return '';
  const isPayable = planned != null && planned > 0;
  const isPaid = isPayable && entry.actual_amount != null && entry.actual_amount >= planned;
  const title = isPaid ? 'Valor planejado já lançado como pago' : !editable ? 'Só é possível marcar despesas do mês atual como pagas' : !isPayable ? 'Informe um valor planejado maior que zero antes de marcar esta despesa como paga' : `Lançar ${money(planned, entry.currency)} como gasto pago`;
  const label = isPaid ? `Pagamento de ${entry.category_name} registrado` : `Marcar ${entry.category_name} como pago`;
  return `<button class="pf-icon-button pf-mark-paid${isPaid ? ' is-paid' : ''}" type="button" data-action="mark-expense-paid" data-id="${esc(entry.entry_id)}" title="${esc(title)}" aria-label="${esc(label)}" ${isPaid || !editable || !isPayable ? 'disabled' : ''}>${isPaid ? 'Pago' : 'Pagar'}</button>`;
};
const dailyBudgetTarget = pace => pace ? `<span class="pf-budget-target"><small>Meta de gasto até dia ${pace.elapsedDays} (${pace.elapsedDays}/${pace.daysInMonth} dias)</small><strong>${money(pace.expectedToDate, 'BRL')}</strong></span>` : '';
const newId = prefix => `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const parseAmount = value => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.includes(',') ? text.replaceAll('.', '').replace(',', '.') : text;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Informe um valor válido maior ou igual a zero.');
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

function expenseSourceToBundle(source) {
  if (source?.schema !== 'personal_finance_expenses_source_v1') return source;
  if (!Array.isArray(source.months) || !Array.isArray(source.categories) || !source.months.length) throw new Error('O pacote da planilha não contém meses e itens válidos.');
  const groupId = 'import:controle-2026-e:despesas';
  const groupName = String(source.group_name || 'Despesas').trim();
  const months = source.months.map(month_key => ({ month_key, plan_source:'defaults' }));
  const categories = source.categories.map((row, index) => {
    if (!Array.isArray(row.planned) || row.planned.length !== months.length) throw new Error(`A quantidade de meses não confere para ${row.name || `item ${index + 1}`}.`);
    if (row.usd_months != null && (!Array.isArray(row.usd_months) || row.usd_months.some(monthIndex => !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= months.length))) throw new Error(`Moeda inválida para ${row.name || `item ${index + 1}`}.`);
    return { category_id:`import:controle-2026-e:despesas:row:${row.source_row ?? index + 1}`, name:row.name, group_id:groupId, currency:'BRL', default_plan:Domain.isLunchDinnerCategory(row.name) ? Domain.LUNCH_DINNER_MONTHLY_BUDGET : null, sort_order:index, active:true };
  });
  const entries = source.categories.flatMap((row, categoryIndex) => {
    const category = categories[categoryIndex];
    return months.map((month, monthIndex) => ({
      entry_id:`${month.month_key}:${category.category_id}`,
      month_key:month.month_key,
      category_id:category.category_id,
      category_name:category.name,
      group_id:groupId,
      group_name:groupName,
      currency:row.usd_months?.includes(monthIndex) ? 'USD' : 'BRL',
      planned_amount:Domain.isLunchDinnerCategory(row.name) && month.month_key === localMonth(new Date())
        ? Domain.LUNCH_DINNER_MONTHLY_BUDGET
        : row.planned[monthIndex] == null ? null : Number(row.planned[monthIndex]),
      actual_amount:row.actuals?.[monthIndex] == null ? null : Number(row.actuals[monthIndex]),
    }));
  });
  return { schema:'personal_finance_v1', version:1, groups:[{ group_id:groupId, name:groupName, sort_order:0, active:true }], categories, months, entries, debts:[], funds:[], settings:[] };
}

export async function mount({ root, toast = () => {}, now = new Date() }) {
  if (!root) throw new Error('Raiz do Controle de gastos não encontrada.');
  const state = { monthKey: localMonth(now), viewMode: 'consolidated', periodMonthCount:Domain.DEFAULT_CONSOLIDATED_MONTH_COUNT, month: null, periodMonths: [], entries: [], debts: [], funds: [], reserveSummary:null, globalExpenseTotals:null, latestExpenseMonthKey:null, groups: [], categories: [], busy: false, refreshPending:false, importOpen: false, importText: '', importBundle: null, importPreview: '' };

  async function initializeLunchDinnerBudget(periodMonths, categories) {
    const now = new Date();
    const currentMonthKey = localMonth(now);
    const currentMonth = periodMonths.find(period => period.month?.month_key === currentMonthKey);
    if (!currentMonth) return false;
    const categoryIndex = categories.findIndex(Domain.isLunchDinnerCategory);
    const category = categories[categoryIndex];
    if (!category || category.default_plan === Domain.LUNCH_DINNER_MONTHLY_BUDGET) return false;
    const entry = currentMonth?.entries.find(row => row.category_id === category.category_id);
    if (entry && entry.planned_amount !== Domain.LUNCH_DINNER_MONTHLY_BUDGET) {
      const updatedEntry = { ...entry, planned_amount:Domain.LUNCH_DINNER_MONTHLY_BUDGET };
      await Storage.saveEntry(updatedEntry);
      currentMonth.entries = currentMonth.entries.map(row => row.entry_id === entry.entry_id ? updatedEntry : row);
    }
    const updatedCategory = { ...category, default_plan:Domain.LUNCH_DINNER_MONTHLY_BUDGET };
    await Storage.saveCategory(updatedCategory);
    categories[categoryIndex] = updatedCategory;
    return true;
  }

  async function loadMonth({ createCurrent = false } = {}) {
    state.busy = true;
    try {
      if (createCurrent && !(await Storage.readMonth(state.monthKey)).month) await Storage.createMonth({ monthKey: state.monthKey, planSource: 'defaults' });
      const monthKeys = state.viewMode === 'quarter'
        ? Domain.quarterPeriod(state.monthKey).monthKeys
        : state.viewMode === 'consolidated' ? Domain.consolidatedPeriod(state.monthKey, state.periodMonthCount).monthKeys : [state.monthKey];
      const reserveThroughMonthKey = state.viewMode === 'consolidated' ? localMonth(new Date()) : state.monthKey;
      const shouldLoadReserve = state.viewMode === 'month' || state.viewMode === 'consolidated';
      const currentMonthKey = localMonth(new Date());
      const [periodMonths, groups, categories, reserveLedger, globalExpenseTotals, latestExpenseMonthKey] = await Promise.all([
        Promise.all(monthKeys.map(key => Storage.readMonth(key))),
        Storage.listGroups(),
        Storage.listCategories(),
        shouldLoadReserve ? Storage.readReserveLedger(reserveThroughMonthKey, { includeFutureFunds:true }) : Promise.resolve({ entries:[], funds:[] }),
        shouldLoadReserve ? Storage.readGlobalExpenseTotals() : Promise.resolve(null),
        state.viewMode === 'consolidated' ? Storage.latestExpenseMonthWithValues() : Promise.resolve(null),
      ]);
      const lunchBudgetInitialized = await initializeLunchDinnerBudget(periodMonths, categories);
      state.periodMonths = periodMonths;
      state.month = state.viewMode === 'month' ? periodMonths[0]?.month || null : null;
      state.entries = periodMonths.flatMap(period => period.entries);
      state.debts = state.viewMode === 'month' ? periodMonths[0]?.debts || [] : [];
      state.reserveSummary = shouldLoadReserve
        ? Domain.summarizeGlobalReserve(reserveLedger.entries, reserveLedger.funds, reserveThroughMonthKey, { includeFutureActual:reserveThroughMonthKey === currentMonthKey, includeFutureContributions:true })
        : null;
      state.globalExpenseTotals = globalExpenseTotals;
      state.latestExpenseMonthKey = latestExpenseMonthKey;
      const monthFunds = state.viewMode === 'month' ? periodMonths[0]?.funds || [] : [];
      state.funds = state.viewMode === 'month'
        ? [...monthFunds.filter(fund => fund.type === 'available'), ...(state.reserveSummary?.contributions || [])]
        : [];
      Object.assign(state, { groups, categories });
      render();
      if (lunchBudgetInitialized) toast(`Orçamento mensal de almoço e janta definido em ${money(Domain.LUNCH_DINNER_MONTHLY_BUDGET, 'BRL')}. O acompanhamento considera o ritmo diário.`);
    } finally {
      state.busy = false;
      scheduleExternalRefresh();
    }
  }

  let externalRefreshTimer = null;
  function scheduleExternalRefresh() {
    if (!state.refreshPending || !root.isConnected) return;
    if (state.busy || root.querySelector('[data-entry-id][data-entry-field]:focus')) return;
    state.refreshPending = false;
    if (externalRefreshTimer != null) clearTimeout(externalRefreshTimer);
    externalRefreshTimer = setTimeout(() => {
      externalRefreshTimer = null;
      loadMonth().catch(error => toast(error.message || 'Não foi possível atualizar esta aba com os lançamentos mais recentes.', true));
    }, 60);
  }
  const unsubscribeFinanceUpdates = subscribeToPersonalFinanceUpdates(() => {
    state.refreshPending = true;
    scheduleExternalRefresh();
  });
  root.addEventListener('focusout', event => {
    if (event.target.matches?.('[data-entry-id][data-entry-field]')) scheduleExternalRefresh();
  });

  function consolidatedMonthLimit() {
    const latest = state.latestExpenseMonthKey;
    if (!latest || latest < state.monthKey) return 12;
    const [startYear, startMonth] = state.monthKey.split('-').map(Number);
    const [endYear, endMonth] = latest.split('-').map(Number);
    const span = (endYear - startYear) * 12 + endMonth - startMonth + 1;
    return Math.max(12, Math.min(Domain.MAX_CONSOLIDATED_MONTH_COUNT, span));
  }

  function startConsolidatedAtCurrentMonth() {
    state.monthKey = localMonth(new Date());
    state.periodMonthCount = Math.max(Domain.MIN_CONSOLIDATED_MONTH_COUNT, state.periodMonthCount);
  }

  function groupName(id) { return state.groups.find(group => group.group_id === id)?.name || id; }
  function categoryById(id) { return state.categories.find(category => category.category_id === id); }
  function sortedEntries() {
    const order = new Map(state.categories.map(category => [category.category_id, category.sort_order]));
    return Domain.overlayCurrentCategoryNames(state.entries, state.categories).sort((a, b) => a.group_name.localeCompare(b.group_name, 'pt-BR') || (order.get(a.category_id) ?? 9999) - (order.get(b.category_id) ?? 9999) || a.category_name.localeCompare(b.category_name, 'pt-BR'));
  }
  function renderKpis(summary) {
    return Domain.CURRENCIES.map(code => {
      const values = summary[code] || { planned: 0, actual: 0, remaining: 0, utilization: null, overspentCount: 0, nearLimitCount: 0, missingActualCount: 0, debts: 0, available: 0, reserves: 0, netPosition: 0 };
      return `<article class="pf-currency-card ${usdClass(code)}"><div class="pf-currency-head"><span>${code === 'BRL' ? 'Real brasileiro' : 'Dólar americano'}</span><b>${code}</b></div><div class="pf-kpi-grid"><div><small>Planejado</small><strong>${money(values.planned, code)}</strong></div><div><small>Gasto no mês</small><strong>${money(values.actual, code)}</strong></div><div class="${values.remaining < 0 ? 'is-negative' : 'is-positive'}"><small>${values.remaining < 0 ? 'Acima do planejado' : 'Restante'}</small><strong>${money(Math.abs(values.remaining), code)}</strong></div><div><small>Uso do planejado</small><strong>${values.utilization == null ? '—' : `${amount(values.utilization)}%`}</strong></div></div><p class="pf-kpi-note">${values.missingActualCount} sem realizado · ${values.nearLimitCount} perto do limite · ${values.overspentCount} acima</p></article>`;
    }).join('');
  }
  function reserveCoverage(code) {
    const reserveBalance = Number(state.reserveSummary?.balances?.[code]) || 0;
    const globalRemaining = Number(state.globalExpenseTotals?.[code]?.remaining) || 0;
    const remainingToCover = Math.max(0, globalRemaining);
    return { reserveBalance, remainingToCover, globalDifference:Domain.reserveMinusOpenExpenses(remainingToCover, reserveBalance) };
  }
  function renderGlobalReserveSummary() {
    const metrics = [
      { label:'Reserva global (inclui aportes futuros)', value:code => reserveCoverage(code).reserveBalance },
      { label:'Despesas futuras (saldo + excedentes)', value:code => reserveCoverage(code).remainingToCover },
      { label:'Diferença: reserva − despesas futuras', value:code => reserveCoverage(code).globalDifference, tone:value => value < 0 ? 'is-negative' : 'is-positive' }
    ];
    return `<section class="pf-month-global-summary" aria-label="Resumo global da reserva"><div class="pf-month-global-grid">${metrics.map(metric => `<div class="pf-month-global-metric"><small>${metric.label}</small><div class="pf-month-global-values">${Domain.CURRENCIES.map(code => { const value = metric.value(code); return `<span class="${usdClass(code)} ${metric.tone?.(value) || ''}"><b>${code}</b><strong>${money(value, code)}</strong></span>`; }).join('')}</div></div>`).join('')}</div><p>O total inclui apenas meses atuais e futuros, e semanas da competência atual ainda não encerradas; saldo não consumido e excedentes entram por linha. Sem planejamento, a despesa fica fora. A diferença compara a reserva global com este total. BRL e USD são calculados separadamente.</p></section>`;
  }
  function renderPeriodKpis(period, { compareReserve = false } = {}) {
    const visibleEntries = state.entries.filter(Domain.hasMonthlyOccurrence);
    const summary = Domain.summarizeByCurrency(visibleEntries);
    return Domain.CURRENCIES.map(code => {
      const values = summary[code] || { planned:0, actual:0, remaining:0, utilization:null };
      const actualMonths = new Set(visibleEntries.filter(entry => entry.currency === code && entry.actual_amount != null).map(entry => entry.month_key)).size;
      return `<article class="pf-currency-card ${usdClass(code)}"><div class="pf-currency-head"><span>Despesas de ${esc(period.label)}</span><b>${code}</b></div><div class="pf-kpi-grid"><div><small>${compareReserve ? 'Planejado total' : 'Planejado'}</small><strong>${money(values.planned, code)}</strong></div><div><small>Realizado</small><strong>${money(values.actual, code)}</strong></div><div class="${values.remaining < 0 ? 'is-negative' : 'is-positive'}"><small>${values.remaining < 0 ? 'Acima do planejado' : compareReserve ? 'Restante dos meses' : 'Restante'}</small><strong>${money(Math.abs(values.remaining), code)}</strong></div><div><small>Uso do planejado</small><strong>${values.utilization == null ? '—' : `${amount(values.utilization)}%`}</strong></div></div><p class="pf-kpi-note">Realizado informado em ${actualMonths} de ${period.monthKeys.length} meses · moeda mantida separada</p></article>`;
    }).join('');
  }
  function categoryTable() {
    if (!state.month) return `<div class="pf-empty"><strong>Este mês ainda não foi criado.</strong><span>Crie o mês com o plano do mês anterior ou com os valores padrão das categorias. Os realizados começam em branco.</span><button class="btn primary" type="button" data-action="toggle-create-month">Criar mês</button></div>`;
    if (!state.entries.length) return `<div class="pf-empty"><strong>Este mês ainda não tem categorias.</strong><span>Crie uma categoria para começar. O valor realizado fica vazio até você informar; zero é um valor registrado diferente de “sem lançamento”.</span><button class="btn primary" type="button" data-action="new-category">Nova categoria</button></div>`;
    const rows = sortedEntries().filter(Domain.hasMonthlyOccurrence);
    if (!rows.length) return `<div class="pf-empty"><strong>Nenhuma semana termina em sábado neste mês.</strong><span>As categorias semanais sem ocorrência neste mês não são exibidas nem entram nos totais.</span></div>`;
    const groups = [...new Set(rows.map(row => row.group_name))];
    const rowMarkup = row => {
      const actualEditable = Domain.canEditActualForEntry(row, new Date());
      const pace = Domain.dailyBudgetPace(row, state.monthKey, new Date());
      const status = pace?.status || Domain.monthlyCategoryStatus(row), statusLabel = pace
        ? ({ missing:'Sem realizado', unplanned:'Sem planejamento', under:'Dentro do ritmo', near:'Perto do limite diário', overspent:'Acima do ritmo' })[status]
        : ({ missing:'Sem realizado', unplanned:'Sem planejamento', under:'Dentro do planejado', near:'Perto do limite', overspent:'Acima do planejado' })[status];
      const planned = row.planned_amount ?? (Domain.isLunchDinnerCategory(row) ? Domain.LUNCH_DINNER_MONTHLY_BUDGET : null);
      const diff = Domain.monthlyAmountRemaining(planned, row.actual_amount);
      const paceInfoText = pace ? `Limite ${money(pace.dailyBudget, row.currency)}/dia${pace.actualDailyAverage == null ? '' : ` · média gasta ${money(pace.actualDailyAverage, row.currency)}/dia`}` : '';
      const paceNote = paceInfoText ? `<button class="pf-budget-info" type="button" title="${esc(paceInfoText)}" aria-label="Informações: ${esc(paceInfoText)}"><span aria-hidden="true">i</span></button>` : '';
      const dueDay = monthlyDueDays.get(normalizeExpenseCategoryName(row.category_name));
      const dueDateNote = dueDay == null ? '' : `<span class="pf-due-date" title="Vencimento mensal: dia ${dueDay}">Vence dia ${dueDay}</span>`;
      const weekPeriod = weeklyCategoryPeriod(row.category_name, [state.monthKey]);
      const category = categoryById(row.category_id);
      const order = state.categories.findIndex(item => item.category_id === row.category_id);
      const quickPayButton = quickPayButtonMarkup(row, planned, actualEditable || Domain.canMarkQuickPayInFutureMonthlyView(row, new Date()));
      return `<tr class="pf-category-row status-${status}"><td class="pf-category-name"><div class="pf-category-heading"><strong>${esc(row.category_name)}</strong>${dueDateNote}${dailyBudgetTarget(pace)}${paceNote}</div>${weekPeriod}${category?.active === false ? '<small>Inativa para novos meses</small>' : ''}</td><td><span class="pf-currency-badge">${row.currency}</span></td><td><label class="pf-visually-hidden" for="plan-${esc(row.entry_id)}">Planejado para ${esc(row.category_name)}</label><input id="plan-${esc(row.entry_id)}" class="pf-amount-input ${usdClass(row.currency)}" type="text" inputmode="decimal" data-entry-id="${esc(row.entry_id)}" data-entry-field="planned_amount" value="${planned == null ? '' : amount(planned)}" placeholder="—" aria-label="Planejado ${esc(row.category_name)}" ${Domain.isLunchDinnerCategory(row) && row.planned_amount == null ? `title="Orçamento mensal padrão: ${money(Domain.LUNCH_DINNER_MONTHLY_BUDGET, 'BRL')}"` : ''}></td><td><label class="pf-visually-hidden" for="actual-${esc(row.entry_id)}">Realizado para ${esc(row.category_name)}</label><input id="actual-${esc(row.entry_id)}" class="pf-amount-input ${usdClass(row.currency)}" type="text" inputmode="decimal" data-entry-id="${esc(row.entry_id)}" data-entry-field="actual_amount" value="${row.actual_amount == null ? '' : amount(row.actual_amount)}" placeholder="Não lançado" aria-label="Realizado ${esc(row.category_name)}" ${actualEditable ? '' : 'disabled title="O realizado só pode ser editado no mês atual, exceto a semana 1 a partir do domingo fiscal."'}></td><td class="${diff == null ? 'muted' : diff < 0 ? 'negative' : 'positive'}">${diff == null ? '—' : money(diff, row.currency)}</td><td><span class="pf-status ${status}">${statusLabel}</span></td><td class="pf-row-actions">${quickPayButton}${category ? `<button class="pf-icon-button" type="button" title="Editar categoria" aria-label="Editar ${esc(category.name)}" data-action="edit-category" data-id="${esc(category.category_id)}">Editar</button>` : ''}<button class="pf-icon-button" type="button" title="Subir categoria" aria-label="Subir ${esc(row.category_name)}" data-action="move-category" data-id="${esc(row.category_id)}" data-direction="-1" ${order <= 0 ? 'disabled' : ''}>↑</button><button class="pf-icon-button" type="button" title="Descer categoria" aria-label="Descer ${esc(row.category_name)}" data-action="move-category" data-id="${esc(row.category_id)}" data-direction="1" ${order < 0 || order >= state.categories.length - 1 ? 'disabled' : ''}>↓</button></td></tr>`;
    };
    const monthlyTotals = Domain.CURRENCIES.map(code => {
      const currencyRows = rows.filter(row => row.currency === code);
      const plannedAmounts = currencyRows.map(row => row.planned_amount ?? (Domain.isLunchDinnerCategory(row) ? Domain.LUNCH_DINNER_MONTHLY_BUDGET : null)).filter(value => value != null);
      const actualAmounts = currencyRows.map(row => row.actual_amount).filter(value => value != null);
      const remainingAmounts = currencyRows.map(row => Domain.monthlyAmountRemaining(row.planned_amount ?? (Domain.isLunchDinnerCategory(row) ? Domain.LUNCH_DINNER_MONTHLY_BUDGET : null), row.actual_amount)).filter(value => value != null);
      if (!plannedAmounts.length && !actualAmounts.length) return '';
      const sum = values => Math.round((values.reduce((total, value) => total + value, 0) + Number.EPSILON) * 100) / 100;
      const planned = sum(plannedAmounts), actual = sum(actualAmounts), remaining = sum(remainingAmounts);
      return `<tr class="pf-category-total-row ${usdClass(code)}"><th scope="row">Total</th><td><span class="pf-currency-badge">${code}</span></td><td>${plannedAmounts.length ? money(planned, code) : '—'}</td><td>${actualAmounts.length ? money(actual, code) : '—'}</td><td class="${remaining < 0 ? 'negative' : 'positive'}">${remainingAmounts.length ? money(remaining, code) : '—'}</td><td class="muted">—</td><td class="muted">—</td></tr>`;
    }).join('');
    return `<div class="pf-table-scroll"><table class="pf-table pf-month-table"><thead><tr><th>Categoria</th><th>Moeda</th><th>Planejado</th><th>Realizado</th><th>Saldo do planejado</th><th>Situação</th><th>Ação</th></tr></thead><tbody>${groups.map(group => `<tr class="pf-group-row"><th colspan="7">${esc(group)}</th></tr>${rows.filter(row => row.group_name === group).map(rowMarkup).join('')}`).join('')}</tbody><tfoot class="pf-month-totals">${monthlyTotals}</tfoot></table></div>`;
  }
  function periodCategoryTable(period, { consolidated = false } = {}) {
    if (!state.entries.length) return `<div class="pf-empty"><strong>Sem despesas cadastradas para ${esc(period.label)}.</strong><span>Esta visão mostra os meses separadamente, sem criar ou alterar lançamentos automaticamente.</span></div>`;
    const currentMonthKey = localMonth(new Date());
    const nextMonthKey = shiftMonth(currentMonthKey, 1);
    const periodEntries = Domain.overlayCurrentCategoryNames(state.entries, state.categories).filter(Domain.hasMonthlyOccurrence);
    const entriesForTotals = periodEntries;
    const entryByMonthCategory = new Map(periodEntries.map(entry => [`${entry.month_key}::${entry.category_id}`, entry]));
    const entryByMonthCategoryCurrency = new Map(periodEntries.map(entry => [`${entry.month_key}::${entry.category_id}::${entry.currency}`, entry]));
    const order = new Map(state.categories.map(category => [category.category_id, category.sort_order]));
    const sortRows = values => values.sort((a, b) => a.group_name.localeCompare(b.group_name, 'pt-BR') || (order.get(a.category_id) ?? 9999) - (order.get(b.category_id) ?? 9999) || a.category_name.localeCompare(b.category_name, 'pt-BR'));
    const currencyRows = sortRows(Domain.summarizePeriodEntries(entriesForTotals, period.monthKeys));
    if (!currencyRows.length) return `<div class="pf-empty"><strong>Nenhuma semana termina em sábado neste período.</strong><span>As categorias semanais sem ocorrência nos meses selecionados não entram nos totais.</span></div>`;
    Domain.applyLunchDinnerBudgetFallback(currencyRows, periodEntries, period.monthKeys);
    const monthlyTotals = consolidated ? Domain.summarizeMonthlyPeriodTotals(currencyRows, period.monthKeys) : null;
    const monthlyOpenTotals = consolidated ? new Map(period.monthKeys.map(monthKey => [monthKey, Object.fromEntries(Domain.CURRENCIES.map(code => [code, null]))])) : null;
    if (consolidated) {
      for (const row of currencyRows) {
        for (const monthKey of period.monthKeys) {
          const values = row.months?.[monthKey];
          if (values?.planned == null) continue;
          const totals = monthlyOpenTotals.get(monthKey);
          const remaining = Math.max(0, values.planned - (values.actual ?? 0));
          totals[row.currency] = (totals[row.currency] ?? 0) + remaining;
        }
      }
    }
    const rows = consolidated ? (() => {
      const byCategory = new Map();
      const sumNullable = (current, value) => value == null ? current : (current ?? 0) + value;
      for (const source of currencyRows) {
        const key = `${source.group_id}::${source.category_id}`;
        let row = byCategory.get(key);
        if (!row) {
          row = {
            ...source,
            currencyRows:true,
            currencies:[],
            currencyByMonth:{},
            plannedByCurrency:{},
            actualByCurrency:{},
            months:Object.fromEntries(period.monthKeys.map(monthKey => [monthKey, {}])),
          };
          byCategory.set(key, row);
        }
        if (!row.currencies.includes(source.currency)) row.currencies.push(source.currency);
        row.plannedByCurrency[source.currency] = sumNullable(row.plannedByCurrency[source.currency], source.planned_amount);
        row.actualByCurrency[source.currency] = sumNullable(row.actualByCurrency[source.currency], source.actual_amount);
        for (const monthKey of period.monthKeys) {
          const entry = entryByMonthCategory.get(`${monthKey}::${source.category_id}`);
          if (entry?.currency !== source.currency) continue;
          row.currencyByMonth[monthKey] = source.currency;
          row.months[monthKey][source.currency] = source.months[monthKey];
        }
      }
      return sortRows([...byCategory.values()].map(row => {
        row.currencies.sort((a, b) => Domain.CURRENCIES.indexOf(a) - Domain.CURRENCIES.indexOf(b));
        row.currency = row.currencies[0] || row.currency;
        row.planned_amount = row.plannedByCurrency[row.currency] ?? null;
        row.actual_amount = row.actualByCurrency[row.currency] ?? null;
        return row;
      }));
    })() : currencyRows;
    const groups = [...new Set(rows.map(row => row.group_name))];
    const monthlyTotalsCell = monthKey => Domain.CURRENCIES.map(code => {
      const values = monthlyTotals?.[monthKey]?.[code];
      if (!values?.categoryCount) return '';
      const plannedOpen = monthlyOpenTotals?.get(monthKey)?.[code] ?? null;
      const hasTotals = plannedOpen != null || values.actual != null;
      return `<div class="pf-month-total-currency ${usdClass(code)}"><strong>${code}</strong><span title="Despesas previstas em aberto"><b>${plannedOpen == null ? '—' : money(plannedOpen, code)}</b></span><span title="Gasto no mês"><b>${values.actual == null ? '—' : money(values.actual, code)}</b></span>${hasTotals ? '' : '<small class="pf-month-total-empty">Sem valores lançados</small>'}</div>`;
    }).filter(Boolean).join('') || '<span class="muted">—</span>';
    const monthlyTotalsFooter = consolidated
      ? `<tfoot class="pf-month-totals"><tr><th scope="row"><div class="pf-month-total-labels"><span>Despesas previstas em aberto</span><span>Gasto no mês</span></div></th>${period.monthKeys.map(monthKey => `<td class="pf-quarter-month ${monthKey === currentMonthKey ? 'pf-quarter-current-month' : ''}" data-month="${monthKey}">${monthlyTotalsCell(monthKey)}</td>`).join('')}</tr></tfoot>`
      : '';
    const rowMarkup = row => {
      const isNubankCard = consolidated && isNubankCardCategory(row);
      const statusText = status => isNubankCard ? 'Gasto acumulado' : ({ missing:'Sem realizado', unplanned:'Sem planejamento', under:'Dentro do planejado', near:'Perto do limite', overspent:'Acima do planejado' })[status];
      const categoryStatuses = row.currencyRows
        ? row.currencies.map(currency => ({ currency, status:isNubankCard ? 'unplanned' : Domain.monthlyCategoryStatus({ planned_amount:row.plannedByCurrency[currency], actual_amount:row.actualByCurrency[currency] }) }))
        : [{ currency:row.currency, status:isNubankCard ? 'unplanned' : Domain.monthlyCategoryStatus(row) }];
      const statusPriority = { missing:0, unplanned:1, under:2, near:3, overspent:4 };
      const status = categoryStatuses.reduce((worst, item) => statusPriority[item.status] > statusPriority[worst] ? item.status : worst, 'missing');
      const statusMarkup = row.currencyRows
        ? categoryStatuses.map(item => `<span class="pf-status ${item.status}">${row.currencies.length > 1 ? `${item.currency}: ` : ''}${statusText(item.status)}</span>`).join(' ')
        : `<span class="pf-status ${status}">${statusText(status)}</span>`;
      const valuesForMonth = monthKey => row.currencyRows
        ? row.months[monthKey]?.[row.currencyByMonth[monthKey] || row.currency] || { planned:null, actual:null }
        : row.months[monthKey];
      const currencyForMonth = monthKey => row.currencyRows ? row.currencyByMonth[monthKey] || row.currency : row.currency;
      const currentMonthValues = valuesForMonth(currentMonthKey);
      const currentCurrency = currencyForMonth(currentMonthKey);
      const currentPace = !isNubankCard && period.monthKeys.includes(currentMonthKey) && currentMonthValues
        ? Domain.dailyBudgetPace({ ...row, currency:currentCurrency, planned_amount:currentMonthValues.planned, actual_amount:currentMonthValues.actual }, currentMonthKey, new Date())
        : null;
      const currentPaceLabel = currentPace ? ({ missing:'Sem realizado', under:'No ritmo', near:'Perto do limite diário', overspent:'Acima do ritmo', unplanned:'Sem planejamento' })[currentPace.status] : '';
      const hideProductPaceNote = normalizeExpenseCategoryName(row.category_name).replace(/\s+/g, ' ') === 'almoco/janta cartao nub';
      const productPaceNote = !consolidated && currentPace && !hideProductPaceNote ? `<small class="pf-quarter-pace-note ${currentPace.status}">${currentPaceLabel}${currentPace.actualDailyAverage == null ? ` · limite ${money(currentPace.dailyBudget, currentCurrency)}/dia` : ` · média ${money(currentPace.actualDailyAverage, currentCurrency)}/dia vs. ${money(currentPace.dailyBudget, currentCurrency)}/dia`}</small>` : '';
      const weekPeriod = consolidated ? '' : weeklyCategoryPeriod(row.category_name, period.monthKeys);
      const monthCells = period.monthKeys.map(monthKey => {
        const values = valuesForMonth(monthKey);
        const monthCurrency = currencyForMonth(monthKey);
        const monthEntry = consolidated
          ? entryByMonthCategory.get(`${monthKey}::${row.category_id}`)
          : entryByMonthCategoryCurrency.get(`${monthKey}::${row.category_id}::${row.currency}`);
        const isCurrentMonth = monthKey === currentMonthKey;
        const isFutureMonth = monthKey > currentMonthKey;
        const actualEditable = Boolean(monthEntry && Domain.canEditActualForEntry(monthEntry, now));
        const isFutureWeekOneBeforeStart = isFutureMonth && /\bsemana\s*1\b/i.test(row.category_name) && !actualEditable;
        if (isNubankCard) {
          if (monthKey === nextMonthKey) {
            return `<td class="pf-quarter-month pf-card-invoice-month ${isCurrentMonth ? 'pf-quarter-current-month' : ''}" data-month="${monthKey}"><span class="pf-card-invoice pf-card-invoice-readonly" title="Somente leitura no Consolidado; edite pela visão Mensal."><small>Fatura prevista</small><b class="${usdClass(monthCurrency)}">${values.planned == null ? '—' : money(values.planned, monthCurrency)}</b></span></td>`;
          }
          if (isFutureMonth) return `<td class="pf-quarter-month ${isCurrentMonth ? 'pf-quarter-current-month' : ''}" data-month="${monthKey}"><span><small>Plan.</small><b class="${usdClass(monthCurrency)}">${values.planned == null ? '—' : money(values.planned, monthCurrency)}</b></span></td>`;
          const actualMarkup = !consolidated && isCurrentMonth && monthEntry && Domain.canEditActualForMonth(monthKey, new Date())
            ? `<span><small>Real.</small><label class="pf-visually-hidden" for="actual-${esc(monthEntry.entry_id)}">Gasto acumulado no Cartão Nub em ${quarterMonthLabel(monthKey)}</label><input id="actual-${esc(monthEntry.entry_id)}" class="pf-amount-input ${usdClass(monthCurrency)}" type="text" inputmode="decimal" data-entry-id="${esc(monthEntry.entry_id)}" data-entry-field="actual_amount" value="${monthEntry.actual_amount == null ? '' : amount(monthEntry.actual_amount)}" placeholder="Adicionar" aria-label="Gasto acumulado no Cartão Nub em ${quarterMonthLabel(monthKey)}"></span>`
            : `<span><small>Real.</small><b class="${usdClass(monthCurrency)}">${values.actual == null ? '—' : money(values.actual, monthCurrency)}</b></span>`;
          const plannedMarkup = `<span><small>Plan.</small><b class="${usdClass(monthCurrency)}">${values.planned == null ? '—' : money(values.planned, monthCurrency)}</b></span>`;
          const cellContent = consolidated && isCurrentMonth
            ? `<div class="pf-consolidated-current-values pf-nubank-current-values">${plannedMarkup}<span class="pf-current-value-separator" aria-hidden="true">·</span>${actualMarkup}</div>`
            : `${plannedMarkup}${actualMarkup}`;
          return `<td class="pf-quarter-month ${isCurrentMonth ? 'pf-quarter-current-month' : ''}" data-month="${monthKey}">${cellContent}</td>`;
        }
        const periodQuickPayButton = monthEntry && values.planned != null && !isFutureWeekOneBeforeStart
          ? quickPayButtonMarkup(monthEntry, values.planned, true)
          : '';
        const planPayButton = isFutureMonth && !actualEditable && monthEntry?.actual_amount == null ? periodQuickPayButton : '';
        const actualMarkup = isFutureMonth && !actualEditable && monthEntry?.actual_amount == null ? '' : actualEditable && !consolidated
          ? `<span><small>Real.</small><label class="pf-visually-hidden" for="actual-${esc(monthEntry.entry_id)}">Realizado ${esc(row.category_name)} em ${quarterMonthLabel(monthKey)}</label><input id="actual-${esc(monthEntry.entry_id)}" class="pf-amount-input ${usdClass(monthCurrency)}" type="text" inputmode="decimal" data-entry-id="${esc(monthEntry.entry_id)}" data-entry-field="actual_amount" value="${monthEntry.actual_amount == null ? '' : amount(monthEntry.actual_amount)}" placeholder="Adicionar" aria-label="Realizado ${esc(row.category_name)} em ${quarterMonthLabel(monthKey)}">${periodQuickPayButton}</span>`
          : `<span><small>Real.</small><b class="${usdClass(monthCurrency)}">${values.actual == null ? '—' : money(values.actual, monthCurrency)}</b>${periodQuickPayButton}</span>`;
        const plannedMarkup = `<span><small>Plan.</small><b class="${usdClass(monthCurrency)}">${values.planned == null ? '—' : money(values.planned, monthCurrency)}</b>${planPayButton}</span>`;
        const cellContent = consolidated && isCurrentMonth
          ? `<div class="pf-consolidated-current-values">${plannedMarkup}${actualMarkup}</div>`
          : `${plannedMarkup}${actualMarkup}`;
        return `<td class="pf-quarter-month ${isCurrentMonth ? 'pf-quarter-current-month' : ''}" data-month="${monthKey}">${cellContent}</td>`;
      }).join('');
      const periodTotalLabel = consolidated ? 'período' : 'tri.';
      const totalMarkup = isNubankCard
        ? `<span><small>Fatura prevista</small><b class="${usdClass(row.currency)}">${row.planned_amount == null ? '—' : money(row.planned_amount, row.currency)}</b></span><span><small>Gasto acumulado</small><b class="${usdClass(row.currency)}">${row.actual_amount == null ? '—' : money(row.actual_amount, row.currency)}</b></span>`
        : row.currencyRows
          ? row.currencies.map(currency => `<span><small>Plan. ${periodTotalLabel}${row.currencies.length > 1 ? ` · ${currency}` : ''}</small><b class="${usdClass(currency)}">${row.plannedByCurrency[currency] == null ? '—' : money(row.plannedByCurrency[currency], currency)}</b></span><span><small>Real. ${periodTotalLabel}${row.currencies.length > 1 ? ` · ${currency}` : ''}</small><b class="${usdClass(currency)}">${row.actualByCurrency[currency] == null ? '—' : money(row.actualByCurrency[currency], currency)}</b></span>`).join('')
          : `<span><small>Plan. ${periodTotalLabel}</small><b class="${usdClass(row.currency)}">${row.planned_amount == null ? '—' : money(row.planned_amount, row.currency)}</b></span><span><small>Real. ${periodTotalLabel}</small><b class="${usdClass(row.currency)}">${row.actual_amount == null ? '—' : money(row.actual_amount, row.currency)}</b></span>`;
      const diffMarkup = isNubankCard ? '—' : row.currencyRows
        ? row.currencies.map(currency => {
          const planned = row.plannedByCurrency[currency], actual = row.actualByCurrency[currency];
          const diff = planned == null || actual == null ? null : planned - actual;
          return `<span class="pf-mixed-currency-diff ${diff == null ? 'muted' : diff < 0 ? 'negative' : 'positive'}"><small>${row.currencies.length > 1 ? `${currency} ` : ''}</small>${diff == null ? '—' : money(diff, currency)}</span>`;
        }).join('')
        : row.planned_amount == null || row.actual_amount == null ? '—' : money(row.planned_amount - row.actual_amount, row.currency);
      const currencyLabel = row.currencyRows ? row.currencies.join(' / ') : row.currency;
      const currencyCell = consolidated ? '' : `<td><span class="pf-currency-badge">${currencyLabel}</span></td>`;
      const paceTarget = consolidated && Domain.isLunchDinnerCategory(row) ? '' : dailyBudgetTarget(currentPace);
      return `<tr class="pf-category-row status-${status}${isNubankCard ? ' pf-nubank-card-row' : ''}"><td class="pf-category-name"><strong>${esc(row.category_name)}</strong>${weekPeriod}${paceTarget}${productPaceNote}</td>${currencyCell}${monthCells}${consolidated ? '' : `<td class="pf-quarter-total">${totalMarkup}</td><td class="pf-quarter-remaining">${diffMarkup}</td><td class="pf-status-list">${statusMarkup}</td>`}</tr>`;
    };
    const totalTitle = consolidated ? 'Total do consolidado' : 'Total do trimestre';
    const groupColumnCount = period.monthKeys.length + (consolidated ? 1 : 5);
    const groupRows = groups.map(group => `<tr class="pf-group-row"><th colspan="${groupColumnCount}">${esc(group)}</th></tr>${rows.filter(row => row.group_name === group).map(rowMarkup).join('')}`).join('');
    const currencyHeader = consolidated ? '' : '<th>Moeda</th>';
    return `<div class="pf-table-scroll"><table class="pf-table pf-quarter-table ${consolidated ? 'pf-consolidated-table' : ''}"><thead><tr><th>Categoria</th>${currencyHeader}${period.monthKeys.map(monthKey => `<th class="${monthKey === currentMonthKey ? 'pf-quarter-current-month' : ''}">${quarterMonthLabel(monthKey)}<small class="pf-quarter-month-count">${monthKey > currentMonthKey ? (Domain.canEditActualForEntry({ month_key:monthKey, category_name:'semana 1' }, now) ? 'Semana 1 liberada' : 'Só planejado') : 'Planejado · realizado'}</small></th>`).join('')}${consolidated ? '' : `<th>${totalTitle}</th><th>Saldo do planejado</th><th>Situação</th>`}</tr></thead><tbody>${groupRows}</tbody>${monthlyTotalsFooter}</table></div>`;
  }
  function managementMarkup() {
    const reserveRows = state.funds.filter(item => item.type === 'reserve');
    const availableRows = state.funds.filter(item => item.type === 'available');
    const reserveBalance = Domain.CURRENCIES.map(code => {
      const summary = state.reserveSummary;
      return `<div class="pf-reserve-balance"><b>${code}</b><span>Disponibilidade ${money(summary?.balances?.[code] || 0, code)}</span><small>Aportes ${money(summary?.contributed?.[code] || 0, code)} · gastos registrados ${money(summary?.spent?.[code] || 0, code)} (não descontados)</small></div>`;
    }).join('');
    const categoryGroups = state.groups.length
      ? state.groups.map(group => `<div class="pf-catalog-row"><div><strong>${esc(group.name)}</strong><small>${state.categories.filter(category => category.group_id === group.group_id).length} categoria(s) vinculada(s)${group.active ? '' : ' · inativo'}</small></div><div class="pf-actions"><button class="pf-icon-button" type="button" data-action="edit-group" data-id="${esc(group.group_id)}">Editar</button><button class="pf-icon-button" type="button" data-action="toggle-group" data-id="${esc(group.group_id)}">${group.active ? 'Inativar' : 'Ativar'}</button></div></div>`).join('')
      : '<p class="pf-empty-inline">Nenhum grupo cadastrado.</p>';
    const categories = state.categories.map((category, index) => `<div class="pf-catalog-row pf-category-catalog"><div><strong>${esc(category.name)}</strong><small>${esc(groupName(category.group_id))} · ${category.currency} · padrão ${category.default_plan == null ? 'não definido' : money(category.default_plan, category.currency)}${category.active ? '' : ' · inativa'}</small></div><div class="pf-actions"><button class="pf-icon-button" type="button" data-action="edit-category" data-id="${esc(category.category_id)}">Editar</button><button class="pf-icon-button" type="button" data-action="toggle-category" data-id="${esc(category.category_id)}">${category.active ? 'Inativar' : 'Ativar'}</button>${index > 0 ? `<button class="pf-icon-button" type="button" aria-label="Subir ${esc(category.name)}" data-action="move-category" data-id="${esc(category.category_id)}" data-direction="-1">↑</button>` : ''}${index < state.categories.length - 1 ? `<button class="pf-icon-button" type="button" aria-label="Descer ${esc(category.name)}" data-action="move-category" data-id="${esc(category.category_id)}" data-direction="1">↓</button>` : ''}</div></div>`).join('');
    const categoryPanel = `<section class="card panel pf-subpanel"><div class="panel-head"><div><h2>Categorias e grupos</h2><p>Os padrões valem para novos meses; alterar o cadastro não reescreve meses anteriores.</p></div><div class="pf-actions"><button class="btn" type="button" data-action="new-group">Novo grupo</button><button class="btn primary" type="button" data-action="new-category">Nova categoria</button></div></div><div class="pf-catalog-list">${categoryGroups}${categories}</div></section>`;
    const reservePanel = `<section class="card panel pf-subpanel"><div class="panel-head"><div><h2>Disponibilidade e reserva global</h2><p>A disponibilidade global é a soma dos aportes. Os gastos realizados ficam registrados à parte; você acompanha o abatimento nas despesas previstas em aberto. BRL e USD permanecem separados.</p></div><div class="pf-actions"><button class="btn" type="button" data-action="new-fund" ${state.month ? '' : 'disabled'}>Adicionar disponível</button><button class="btn primary" type="button" data-action="new-reserve" ${state.month ? '' : 'disabled'}>Adicionar à reserva</button></div></div><div class="pf-reserve-balances">${reserveBalance}</div><h3 class="pf-position-heading">Saldos disponíveis deste mês</h3>${positionList(availableRows, 'fund')}<h3 class="pf-position-heading">Aportes da reserva global</h3>${positionList(reserveRows, 'reserve')}</section>`;
    const debtPanel = `<section class="card panel pf-subpanel"><div class="panel-head"><div><h2>Dívidas do mês</h2><p>Fotografia mensal independente por moeda; marcar uma dívida como paga preserva os meses anteriores.</p></div><button class="btn primary" type="button" data-action="new-debt" ${state.month ? '' : 'disabled'}>Adicionar dívida</button></div>${positionList(state.debts, 'debt')}</section>`;
    return `<div class="pf-management-grid">${categoryPanel}<div class="pf-management-stack">${reservePanel}${debtPanel}</div></div>`;
  }
  function positionList(items, kind) {
    const isReserve = kind === 'reserve';
    if (!items.length) return `<p class="pf-empty-inline">${isReserve ? 'Nenhum aporte da reserva até este mês.' : 'Nenhum registro neste mês.'}</p>`;
    const editAction = isReserve ? 'edit-reserve' : `edit-${kind}`;
    const deleteAction = isReserve ? 'delete-reserve' : `delete-${kind}`;
    const deleteId = isReserve ? item => item.item_id : item => item.snapshot_id;
    return `<div class="pf-position-list">${items.map(item => `<div class="pf-position-row"><div><strong>${esc(item.name)}</strong><small>${kind === 'debt' ? item.status === 'paid' ? 'Paga' : 'Em aberto' : isReserve ? `Reserva global · desde ${item.started_month_key || item.month_key}` : 'Disponível'} · ${item.currency}${item.notes ? ` · ${esc(item.notes)}` : ''}</small></div><b>${money(item.amount, item.currency)}</b><div class="pf-actions"><button class="pf-icon-button" type="button" data-action="${editAction}" data-id="${esc(item.item_id)}">Editar</button><button class="pf-icon-button danger" type="button" data-action="${deleteAction}" data-id="${esc(deleteId(item))}">${isReserve ? 'Remover aporte global' : 'Remover deste mês'}</button></div></div>`).join('')}</div>`;
  }
  function importPanel() {
    if (!state.importOpen) return '';
    return `<section class="card panel pf-import-panel"><div class="panel-head"><div><h2>Importar despesas da planilha</h2><p>Importação aditiva, restrita ao Controle de gastos. Não altera MCC, Faturamento, dívidas ou reservas; valores em branco continuam sem lançamento.</p></div></div><label for="pfImportJson">Dados preparados da aba Despesas (JSON)</label><textarea id="pfImportJson" rows="7" spellcheck="false" placeholder="Cole aqui o pacote de importação preparado a partir da planilha">${esc(state.importText)}</textarea><div class="pf-actions"><button class="btn" type="button" data-action="preview-import">Validar prévia</button><button class="btn primary" type="button" data-action="execute-import" ${state.importBundle ? '' : 'disabled'}>Importar sem substituir</button></div><p id="pfImportPreview" class="pf-import-preview">${esc(state.importPreview || 'A prévia validará o período, os itens, os valores e as moedas antes de gravar.')}</p></section>`;
  }
  function modalMarkup() {
    return state.modal ? `<div class="pf-modal-backdrop" data-action="close-modal"><section class="pf-modal" role="dialog" aria-modal="true" aria-labelledby="pfModalTitle"><div class="pf-modal-head"><h2 id="pfModalTitle">${esc(state.modal.title)}</h2><button class="pf-icon-button" type="button" aria-label="Fechar" data-action="close-modal">×</button></div><form data-form="${esc(state.modal.type)}" data-id="${esc(state.modal.id || '')}">${state.modal.body}<div class="pf-actions pf-modal-actions"><button class="btn" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form></section></div>` : '';
  }
  function render() {
    const isMonth = state.viewMode === 'month';
    const isQuarter = state.viewMode === 'quarter';
    const isConsolidated = state.viewMode === 'consolidated';
    const isPeriodView = isQuarter || isConsolidated;
    const period = isQuarter ? Domain.quarterPeriod(state.monthKey) : isConsolidated ? Domain.consolidatedPeriod(state.monthKey, state.periodMonthCount) : null;
    const financeEntries = isMonth ? state.entries.filter(Domain.hasMonthlyOccurrence) : state.entries;
    const summary = Domain.summarizeByCurrency(financeEntries, state.debts, state.funds, Domain.DEFAULT_SETTINGS, isMonth ? state.reserveSummary?.balances : null);
    const periodLabel = isPeriodView ? period.label : monthName(state.monthKey);
    const hasMonth = !!state.month;
    const now = new Date();
    const currentMonth = Domain.canEditActualForMonth(state.monthKey, now);
    const fiscalWeekOpen = isMonth && !currentMonth && state.entries.some(entry => Domain.canEditActualForEntry(entry, now));
    const helpText = isPeriodView
      ? ''
      : hasMonth
        ? currentMonth ? 'Edite os valores diretamente. O realizado pode ser lançado no mês atual; zero é diferente de vazio.' : fiscalWeekOpen ? 'A semana fiscal 1 deste mês já está aberta: o realizado pode ser lançado desde o domingo que inicia o período.' : 'O realizado fica bloqueado fora do mês atual, exceto a semana fiscal 1 a partir do domingo que inicia seu período. Planejamentos anteriores continuam visíveis e editáveis.'
        : `O mês ${esc(monthName(state.monthKey))} não foi criado.`;
    const mainTable = isPeriodView ? periodCategoryTable(period, { consolidated:isConsolidated }) : categoryTable();
    const monthlyActions = isMonth && hasMonth
      ? '<button class="btn" type="button" data-action="toggle-create-month">Criar outro mês</button><button class="btn primary" type="button" data-action="new-category">Nova categoria</button>'
      : isMonth && !hasMonth ? '<button class="btn primary" type="button" data-action="new-category" disabled>Nova categoria</button>' : '';
    const viewToggle = `<div class="pf-view-toggle" role="group" aria-label="Visão do Controle de gastos"><button class="${isMonth ? 'active' : ''}" type="button" data-action="set-view" data-view="month" aria-pressed="${isMonth}">Mensal</button><button class="${isConsolidated ? 'active' : ''}" type="button" data-action="set-view" data-view="consolidated" aria-pressed="${isConsolidated}">Consolidado</button></div>`;
    const periodNavigationLabel = isQuarter ? 'trimestre' : isConsolidated ? 'mês inicial do consolidado' : 'mês';
    const currentPeriodLabel = isQuarter ? 'Trimestre atual' : isConsolidated ? 'Começar no mês atual' : 'Mês atual';
    const periodShiftLabel = isQuarter ? 'Trimestre' : isConsolidated ? 'Mês inicial' : 'Mês';
    const monthCountLimit = consolidatedMonthLimit();
    const monthCountControl = isConsolidated ? `<label class="pf-period-length" title="O consolidado exibe no mínimo 8 meses; o limite acompanha os meses cadastrados.">Meses <input type="number" min="${Domain.MIN_CONSOLIDATED_MONTH_COUNT}" max="${monthCountLimit}" step="1" inputmode="numeric" data-action="set-period-length" aria-label="Quantidade de meses no consolidado" value="${state.periodMonthCount}"></label>` : '';
    const monthNavigation = `<div class="pf-month-nav" role="group" aria-label="Navegação por ${periodNavigationLabel}"><button class="btn" type="button" data-action="period-shift" data-delta="-1" aria-label="${periodShiftLabel} anterior">‹</button><strong>${esc(periodLabel)}</strong><button class="btn" type="button" data-action="period-shift" data-delta="1" aria-label="Próximo ${periodShiftLabel.toLowerCase()}">›</button><button class="btn" type="button" data-action="current-period">${currentPeriodLabel}</button></div>`;
    const panelActions = `<div class="pf-main-controls">${monthCountControl}${monthNavigation}${monthlyActions}</div>`;
    root.innerHTML = `<section class="pf-shell"><header class="pf-page-head pf-page-head-actions-only"><div class="pf-header-actions">${viewToggle}<button class="btn" type="button" data-action="toggle-import">${state.importOpen ? 'Fechar importação' : 'Importar despesas'}</button></div></header>${importPanel()}<section class="pf-kpis" aria-label="Resumo por moeda">${isPeriodView ? renderPeriodKpis(period, { compareReserve:isConsolidated }) : renderKpis(summary)}</section><section class="card panel pf-main-panel"><div class="panel-head"><div><h2>${isPeriodView ? `Despesas por ${esc(period.label)}` : 'Planejado × realizado'}</h2>${helpText ? `<p>${helpText}</p>` : ''}</div>${panelActions}</div>${isMonth ? `<div class="pf-create-month ${state.createMonthOpen ? '' : 'hidden'}"><label for="pfPlanSource">Plano para ${esc(monthName(state.monthKey))}</label><select id="pfPlanSource" class="search"><option value="previous">Copiar somente o planejado do mês anterior</option><option value="defaults">Usar os valores padrão das categorias</option></select><span>Realizados ficam em branco. Dívidas em aberto, disponibilidade e reservas são trazidas como ponto de partida mensal, sem alterar o mês anterior.</span><button class="btn primary" type="button" data-action="create-month">Criar mês</button><button class="btn" type="button" data-action="toggle-create-month">Cancelar</button></div>` : ''}${mainTable}</section>${isPeriodView ? '' : managementMarkup()}${modalMarkup()}<p class="pf-footnote">Dados armazenados localmente neste navegador. Valores de BRL e USD são calculados em separado; a moeda do lançamento mensal preserva a fonte.</p></section>`;
    root.innerHTML = root.innerHTML.replace('Realizados ficam em branco. Dívidas em aberto, disponibilidade e reservas são trazidas como ponto de partida mensal, sem alterar o mês anterior.', 'Realizados ficam em branco. Dívidas em aberto e saldos disponíveis são trazidos; a reserva global permanece igual à soma dos aportes, e os gastos são acompanhados nas despesas.');
    root.querySelector('.pf-kpis')?.insertAdjacentHTML('afterend', renderGlobalReserveSummary());
    const periodLengthField = root.querySelector('.pf-period-length');
    if (periodLengthField) periodLengthField.insertAdjacentHTML('afterend', `<span class="pf-period-adjust"><button class="pf-period-adjust-button" type="button" data-action="adjust-period-length" data-delta="1" aria-label="Aumentar em um mês" title="Adicionar um mês" ${state.periodMonthCount >= monthCountLimit ? 'disabled' : ''}>↑</button><button class="pf-period-adjust-button" type="button" data-action="adjust-period-length" data-delta="-1" aria-label="Diminuir em um mês" title="Remover um mês" ${state.periodMonthCount <= Domain.MIN_CONSOLIDATED_MONTH_COUNT ? 'disabled' : ''}>↓</button></span>`);
  }

  function openModal(type, id = '') {
    if (type === 'category' && !id && !state.groups.some(group => group.active)) { toast('Cadastre um grupo ativo antes de criar categorias.', true); return; }
    state.modal = { type, id, title: '', body: '' };
    if (type === 'category') {
      const item = id ? categoryById(id) : null;
      state.modal.title = item ? 'Editar categoria' : 'Nova categoria';
      const selectableGroups = state.groups.filter(group => group.active || group.group_id === item?.group_id);
      state.modal.body = `<label>Nome<input name="name" required maxlength="80" value="${esc(item?.name || '')}"></label><label>Grupo<select name="group_id" required>${selectableGroups.map(group => `<option value="${esc(group.group_id)}" ${group.group_id === (item?.group_id || selectableGroups[0]?.group_id) ? 'selected' : ''}>${esc(group.name)}${group.active ? '' : ' (inativo)'}</option>`).join('')}</select></label><div class="pf-form-row"><label>Moeda<select name="currency"><option value="BRL" ${item?.currency !== 'USD' ? 'selected' : ''}>BRL · Real</option><option value="USD" ${item?.currency === 'USD' ? 'selected' : ''}>USD · Dólar</option></select></label><label>Planejado padrão<input name="default_plan" inputmode="decimal" placeholder="Opcional" value="${item?.default_plan == null ? '' : amount(item.default_plan)}"></label></div>`;
    } else if (type === 'group') {
      const item = id ? state.groups.find(group => group.group_id === id) : null;
      state.modal.title = item ? 'Renomear grupo' : 'Novo grupo';
      state.modal.body = `<label>Nome do grupo<input name="name" required maxlength="80" value="${esc(item?.name || '')}"></label>${item ? `<label>Situação<select name="active"><option value="true" ${item.active ? 'selected' : ''}>Ativo</option><option value="false" ${item.active ? '' : 'selected'}>Inativo</option></select></label>` : ''}`;
    } else if (type === 'debt' || type === 'fund' || type === 'reserve') {
      const collection = type === 'debt' ? state.debts : type === 'reserve' ? state.funds.filter(value => value.type === 'reserve') : state.funds.filter(value => value.type === 'available');
      const item = id ? collection.find(value => value.item_id === id) : null;
      state.modal.title = type === 'debt'
        ? item ? 'Editar dívida do mês' : 'Adicionar dívida'
        : type === 'reserve' ? item ? 'Editar aporte da reserva global' : 'Adicionar à reserva global'
          : item ? 'Editar saldo disponível do mês' : 'Adicionar saldo disponível';
      state.modal.body = `<label>Nome<input name="name" required maxlength="100" value="${esc(item?.name || '')}"></label><div class="pf-form-row"><label>Valor<input name="amount" inputmode="decimal" required value="${item ? amount(item.amount) : ''}"></label><label>Moeda<select name="currency"><option value="BRL" ${item?.currency !== 'USD' ? 'selected' : ''}>BRL · Real</option><option value="USD" ${item?.currency === 'USD' ? 'selected' : ''}>USD · Dólar</option></select></label></div>${type === 'debt' ? `<label>Situação<select name="status"><option value="open" ${item?.status !== 'paid' ? 'selected' : ''}>Em aberto</option><option value="paid" ${item?.status === 'paid' ? 'selected' : ''}>Paga</option></select></label>` : type === 'reserve' ? '<p class="pf-form-note">O aporte aumenta a disponibilidade global. Gastos realizados não são descontados da reserva; eles reduzem as despesas previstas em aberto na tabela.</p>' : '<input type="hidden" name="type" value="available">'}<label>Observações<textarea name="notes" rows="2" maxlength="300">${esc(item?.notes || '')}</textarea></label>`;
    }
    render();
    root.querySelector('.pf-modal input')?.focus();
  }
  state.modal = null;

  async function createMonthFromDialog() {
    const select = root.querySelector('#pfPlanSource');
    await Storage.createMonth({ monthKey: state.monthKey, planSource: select?.value || 'defaults' });
    state.createMonthOpen = false;
    await loadMonth();
    toast(`Mês ${monthName(state.monthKey)} criado; realizados não foram copiados e a reserva global foi mantida.`);
  }
  async function moveCategory(id, direction) {
    const ordered = [...state.categories].sort((a, b) => a.sort_order - b.sort_order);
    const index = ordered.findIndex(category => category.category_id === id), target = index + Number(direction);
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    for (let position = 0; position < ordered.length; position += 1) await Storage.saveCategory({ ...ordered[position], sort_order: position });
    await loadMonth();
  }

  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id, delta, direction } = button.dataset;
    try {
      if (action === 'toggle-import') { state.importOpen = !state.importOpen; state.importPreview = ''; state.importBundle = null; render(); }
      else if (action === 'preview-import') {
        const bundle = Domain.validateBundle(expenseSourceToBundle(JSON.parse(state.importText)));
        if (bundle.debts.length || bundle.funds.length) throw new Error('O pacote contém dívidas ou reservas; esta importação aceita apenas despesas.');
        if (bundle.months.some(month => month.month_key < '2026-09')) throw new Error('O pacote contém meses anteriores a setembro de 2026. Nenhum dado foi gravado.');
        const monthKeys = bundle.months.map(month => month.month_key).sort();
        if (!monthKeys.length) throw new Error('O pacote não contém meses para importar.');
        const plannedCount = bundle.entries.filter(entry => entry.planned_amount != null).length;
        const actualCount = bundle.entries.filter(entry => entry.actual_amount != null).length;
        const usdCount = bundle.entries.filter(entry => entry.currency === 'USD' && (entry.planned_amount != null || entry.actual_amount != null)).length;
        state.importBundle = bundle;
        state.importPreview = `${bundle.categories.length} itens · ${monthKeys.length} meses (${monthKeys[0]} a ${monthKeys.at(-1)}) · ${plannedCount} valores planejados · ${actualCount} realizados · ${usdCount} lançamentos em USD. Meses existentes serão preservados; conflitos interrompem a operação sem substituir dados.`;
        render();
      }
      else if (action === 'execute-import') {
        if (!state.importBundle) throw new Error('Valide a prévia atual antes de importar.');
        const counts = await Storage.mergeExpensesBundle(state.importBundle);
        state.importOpen = false; state.importText = ''; state.importBundle = null; state.importPreview = '';
        await loadMonth();
        toast(`Importação concluída: ${counts.inserted} registros novos; ${counts.unchanged} preservados.`);
      }
      else if (action === 'set-view') { if (['month', 'quarter', 'consolidated'].includes(button.dataset.view) && state.viewMode !== button.dataset.view) { state.viewMode = button.dataset.view; if (state.viewMode === 'consolidated') startConsolidatedAtCurrentMonth(); state.createMonthOpen = false; await loadMonth(); } }
      else if (action === 'adjust-period-length') {
        const monthCount = state.periodMonthCount + Number(delta);
        if (monthCount < Domain.MIN_CONSOLIDATED_MONTH_COUNT || monthCount > consolidatedMonthLimit()) return;
        const previousMonthCount = state.periodMonthCount;
        state.periodMonthCount = monthCount;
        try { await loadMonth(); }
        catch (error) { state.periodMonthCount = previousMonthCount; toast(error.message || 'Não foi possível atualizar o consolidado.', true); render(); }
      }
      else if (action === 'period-shift') { state.monthKey = shiftMonth(state.monthKey, Number(delta) * (state.viewMode === 'quarter' ? 3 : 1)); state.createMonthOpen = false; await loadMonth(); }
      else if (action === 'current-period') { state.monthKey = localMonth(new Date()); state.createMonthOpen = false; await loadMonth(); }
      else if (action === 'toggle-create-month') { state.createMonthOpen = !state.createMonthOpen; render(); }
      else if (action === 'create-month') await createMonthFromDialog();
      else if (action === 'mark-expense-paid') {
        const entry = state.entries.find(item => item.entry_id === id);
        if (!entry || !isQuickPayCategory(entry.category_name)) throw new Error('Não encontrei esta despesa para marcar como paga.');
        if (entry.planned_amount == null || entry.planned_amount <= 0) throw new Error('Informe um valor planejado maior que zero antes de marcar esta despesa como paga.');
        await Storage.saveEntry(Domain.updateEntryAmount(entry, 'actual_amount', entry.planned_amount));
        await loadMonth();
        toast(`${entry.category_name}: ${money(entry.planned_amount, entry.currency)} lançado como pago e considerado no orçamento e na reserva global.`);
      }
      else if (action === 'new-category') openModal('category');
      else if (action === 'edit-category') openModal('category', id);
      else if (action === 'new-group') openModal('group');
      else if (action === 'edit-group') openModal('group', id);
      else if (action === 'toggle-group') { const item = state.groups.find(group => group.group_id === id); if (item) { await Storage.saveGroup({ ...item, active: !item.active }); await loadMonth(); } }
      else if (action === 'new-debt') openModal('debt');
      else if (action === 'edit-debt') openModal('debt', id);
      else if (action === 'new-fund') openModal('fund');
      else if (action === 'edit-fund') openModal('fund', id);
      else if (action === 'new-reserve') openModal('reserve');
      else if (action === 'edit-reserve') openModal('reserve', id);
      else if (action === 'close-modal') { if (event.target === button || event.target === button.closest('.pf-modal-backdrop')) { state.modal = null; render(); } }
      else if (action === 'move-category') await moveCategory(id, direction);
      else if (action === 'toggle-category') { const item = categoryById(id); if (item) { await Storage.saveCategory({ ...item, active: !item.active }); await loadMonth(); } }
      else if (action === 'delete-debt' && confirm('Remover esta dívida somente do mês atual? Os outros meses não serão alterados.')) { await Storage.deleteDebt(id); await loadMonth(); }
      else if (action === 'delete-fund' && confirm('Remover este saldo disponível somente do mês atual?')) { await Storage.deleteFund(id); await loadMonth(); }
      else if (action === 'delete-reserve' && confirm('Remover este aporte da reserva global? O saldo e os meses futuros serão recalculados; os gastos lançados serão preservados.')) { await Storage.deleteReserveContribution(id); await loadMonth(); }
    } catch (error) { toast(error.message || 'Não foi possível concluir a ação.', true); }
  });

  root.addEventListener('change', async event => {
    const monthCountControl = event.target.closest('[data-action="set-period-length"]');
    if (monthCountControl) {
      const monthCount = Number(monthCountControl.value);
      const monthCountLimit = consolidatedMonthLimit();
      if (!Number.isInteger(monthCount) || monthCount < Domain.MIN_CONSOLIDATED_MONTH_COUNT || monthCount > monthCountLimit) {
        monthCountControl.value = String(state.periodMonthCount);
        toast(`O consolidado pode mostrar de ${Domain.MIN_CONSOLIDATED_MONTH_COUNT} a ${monthCountLimit} meses neste intervalo.`, true);
        return;
      }
      if (monthCount === state.periodMonthCount) return;
      state.periodMonthCount = monthCount;
      try { await loadMonth(); }
      catch (error) { toast(error.message || 'Não foi possível atualizar o consolidado.', true); render(); }
      return;
    }
    const input = event.target.closest('[data-entry-id][data-entry-field]');
    if (!input) return;
    try {
      const value = parseAmount(input.value);
      let existing = state.entries.find(entry => entry.entry_id === input.dataset.entryId);
      if (!existing && input.dataset.entryRole === 'nubank-next-invoice' && value != null) {
        const monthKey = input.dataset.monthKey, category = categoryById(input.dataset.categoryId);
        if (!category) throw new Error('A categoria do Cartão Nub não foi encontrada.');
        let targetMonth = await Storage.readMonth(monthKey);
        if (!targetMonth.month) {
          await Storage.createMonth({ monthKey, planSource:'defaults' });
          targetMonth = await Storage.readMonth(monthKey);
        }
        existing = targetMonth.entries.find(entry => entry.category_id === category.category_id) || Domain.normalizeEntry({
          entry_id:`${monthKey}:${category.category_id}`, month_key:monthKey, category_id:category.category_id,
          category_name:category.name, group_id:category.group_id, group_name:groupName(category.group_id),
          currency:category.currency, planned_amount:category.default_plan, actual_amount:null,
        });
      }
      if (!existing) return;
      if (input.dataset.entryField === 'actual_amount' && !Domain.canEditActualForEntry(existing, new Date())) {
        toast('O realizado só pode ser alterado no mês atual, exceto na semana fiscal 1 a partir do domingo que inicia o período.', true);
        await loadMonth();
        return;
      }
      await Storage.saveEntry(Domain.updateEntryAmount(existing, input.dataset.entryField, value));
      await loadMonth();
    } catch (error) { toast(error.message, true); render(); }
  });

  root.addEventListener('input', event => {
    if (event.target.id !== 'pfImportJson') return;
    state.importText = event.target.value;
    state.importBundle = null;
    state.importPreview = '';
    const preview = root.querySelector('#pfImportPreview');
    if (preview) preview.textContent = 'Conteúdo alterado. Valide novamente antes de importar.';
    const button = root.querySelector('[data-action="execute-import"]');
    if (button) button.disabled = true;
  });

  root.addEventListener('submit', async event => {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.saving === 'true') return;
    form.dataset.saving = 'true';
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    const values = Object.fromEntries(new FormData(form).entries()), type = form.dataset.form, id = form.dataset.id;
    try {
      if (type === 'group') {
        const existing = state.groups.find(item => item.group_id === id);
        const group = { group_id: existing?.group_id || newId('group'), name: values.name, sort_order: existing?.sort_order ?? state.groups.length, active: values.active == null ? existing?.active ?? true : values.active === 'true' };
        if (existing) await Storage.saveGroup(group); else await Storage.createGroup(group);
      } else if (type === 'category') {
        const existing = categoryById(id);
        const category = { category_id: existing?.category_id || newId('category'), name: values.name, group_id: values.group_id, currency: values.currency, default_plan: parseAmount(values.default_plan), sort_order: existing?.sort_order ?? state.categories.length, active: existing?.active ?? true };
        if (existing) await Storage.saveCategory(category); else await Storage.createCategory(category, { monthKey: state.month?.month_key || null });
      } else if (type === 'debt') {
        const existing = state.debts.find(item => item.item_id === id), itemId = existing?.item_id || newId('debt');
        const debt = { snapshot_id: `${state.monthKey}:${itemId}`, month_key: state.monthKey, item_id: itemId, name: values.name, amount: parseAmount(values.amount), currency: values.currency, status: values.status || 'open', notes: values.notes };
        if (existing) await Storage.saveDebt(debt); else await Storage.createDebt(debt);
      } else if (type === 'fund') {
        const existing = state.funds.find(item => item.item_id === id && item.type === 'available'), itemId = existing?.item_id || newId('fund');
        const fund = { snapshot_id: `${state.monthKey}:${itemId}`, month_key: state.monthKey, item_id: itemId, name: values.name, amount: parseAmount(values.amount), currency: values.currency, type:'available', notes: values.notes };
        if (existing) await Storage.saveFund(fund); else await Storage.createFund(fund);
      } else if (type === 'reserve') {
        const existing = state.funds.find(item => item.item_id === id && item.type === 'reserve'), itemId = existing?.item_id || newId('fund');
        const fund = { snapshot_id: existing?.snapshot_id || `${state.monthKey}:${itemId}`, month_key: existing?.month_key || state.monthKey, item_id: itemId, name: values.name, amount: parseAmount(values.amount), currency: values.currency, type:'reserve', notes: values.notes };
        if (existing) await Storage.saveReserveContribution(fund); else await Storage.createFund(fund);
      } else throw new Error('Formulário de lançamento não reconhecido.');
      state.modal = null;
      await loadMonth();
      toast(type === 'reserve' ? 'Aporte global da reserva salvo.' : 'Alterações salvas neste mês.');
    } catch (error) {
      form.dataset.saving = 'false';
      if (submitButton) submitButton.disabled = false;
      toast(error.message || 'Não foi possível salvar.', true);
    }
  });

  await loadMonth({ createCurrent: true });
  async function refresh() {
    if (state.viewMode === 'consolidated') startConsolidatedAtCurrentMonth();
    await loadMonth();
  }
  return { unmount() { unsubscribeFinanceUpdates(); if (externalRefreshTimer != null) clearTimeout(externalRefreshTimer); root.replaceChildren(); }, refresh, get state() { return state; } };
}
