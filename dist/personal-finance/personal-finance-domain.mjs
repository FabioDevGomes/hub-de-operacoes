export const SCHEMA = 'personal_finance_v1';
export const CURRENCIES = Object.freeze(['BRL', 'USD']);
export const FUND_TYPES = Object.freeze(['available', 'reserve']);
export const DEBT_STATUSES = Object.freeze(['open', 'paid']);
export const DEFAULT_SETTINGS = Object.freeze({ key:'preferences', default_currency:'BRL', near_limit_percent:80 });
export const LUNCH_DINNER_MONTHLY_BUDGET = 1250;
export const MAX_CONSOLIDATED_MONTH_COUNT = 120;
export const MIN_CONSOLIDATED_MONTH_COUNT = 8;
export const DEFAULT_CONSOLIDATED_MONTH_COUNT = 8;

const isoMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
const localMonthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const localDateKey = date => `${localMonthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
const requiredText = (value, label) => {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
};
const amountOrNull = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} deve ser um valor maior ou igual a zero.`);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
};
const currency = value => {
  const result = String(value || '').toUpperCase();
  if (!CURRENCIES.includes(result)) throw new Error('Selecione BRL ou USD.');
  return result;
};
const id = (value, label) => requiredText(value, label);

export function normalizeGroup(group) {
  return {
    group_id: id(group?.group_id, 'Identificador do grupo'),
    name: requiredText(group?.name, 'Nome do grupo'),
    sort_order: Number.isFinite(Number(group?.sort_order)) ? Number(group.sort_order) : 0,
    active: group?.active !== false,
  };
}

export function normalizeCategory(category) {
  return {
    category_id: id(category?.category_id, 'Identificador da categoria'),
    name: requiredText(category?.name, 'Nome da categoria'),
    group_id: id(category?.group_id, 'Grupo'),
    currency: currency(category?.currency),
    default_plan: amountOrNull(category?.default_plan, 'Planejado padrão'),
    sort_order: Number.isFinite(Number(category?.sort_order)) ? Number(category.sort_order) : 0,
    active: category?.active !== false,
  };
}

export function normalizeEntry(entry) {
  const month_key = String(entry?.month_key || '');
  if (!isoMonth(month_key)) throw new Error('Mês inválido.');
  const normalized = {
    entry_id: id(entry?.entry_id || `${month_key}:${entry?.category_id || ''}`, 'Identificador do lançamento mensal'),
    month_key,
    category_id: id(entry?.category_id, 'Categoria'),
    category_name: requiredText(entry?.category_name, 'Nome da categoria'),
    group_id: id(entry?.group_id, 'Grupo'),
    group_name: requiredText(entry?.group_name, 'Nome do grupo'),
    currency: currency(entry?.currency),
    planned_amount: amountOrNull(entry?.planned_amount, 'Valor planejado'),
    actual_amount: amountOrNull(entry?.actual_amount, 'Valor realizado'),
  };
  if (Object.hasOwn(entry || {}, 'card_debt_amount')) {
    normalized.card_debt_amount = amountOrNull(entry.card_debt_amount, 'Dívida atual do cartão');
  }
  return normalized;
}

export function overlayCurrentCategoryNames(entries, categories = []) {
  const currentNames = new Map(categories.map(category => [category.category_id, category.name]));
  return entries.map(entry => {
    const currentName = currentNames.get(entry.category_id);
    return currentName && currentName !== entry.category_name
      ? { ...entry, category_name:currentName }
      : entry;
  });
}

export function normalizeDebt(debt) {
  const month_key = String(debt?.month_key || '');
  if (!isoMonth(month_key)) throw new Error('Mês inválido.');
  const status = DEBT_STATUSES.includes(debt?.status) ? debt.status : 'open';
  return {
    snapshot_id: id(debt?.snapshot_id || `${month_key}:${debt?.item_id || ''}`, 'Identificador da dívida'),
    month_key,
    item_id: id(debt?.item_id, 'Identificador da dívida'),
    name: requiredText(debt?.name, 'Nome da dívida'),
    amount: amountOrNull(debt?.amount, 'Valor da dívida') ?? 0,
    currency: currency(debt?.currency),
    status,
    notes: String(debt?.notes ?? '').trim(),
  };
}

export function normalizeFund(fund) {
  const month_key = String(fund?.month_key || '');
  if (!isoMonth(month_key)) throw new Error('Mês inválido.');
  if (!FUND_TYPES.includes(fund?.type)) throw new Error('Tipo deve ser Disponível ou Reserva.');
  return {
    snapshot_id: id(fund?.snapshot_id || `${month_key}:${fund?.item_id || ''}`, 'Identificador financeiro'),
    month_key,
    item_id: id(fund?.item_id, 'Identificador financeiro'),
    name: requiredText(fund?.name, 'Nome'),
    amount: amountOrNull(fund?.amount, 'Valor') ?? 0,
    currency: currency(fund?.currency),
    type: fund.type,
    notes: String(fund?.notes ?? '').trim(),
  };
}

export function normalizeMonth(month) {
  const month_key = String(month?.month_key || '');
  if (!isoMonth(month_key)) throw new Error('Mês inválido.');
  return {
    month_key,
    created_at: String(month?.created_at || new Date().toISOString()),
    plan_source: month?.plan_source === 'previous' ? 'previous' : 'defaults',
    notes: String(month?.notes ?? '').trim(),
  };
}

export function quarterPeriod(monthKey) {
  if (!isoMonth(monthKey)) throw new Error('Mês inválido para montar o trimestre.');
  const [year, month] = monthKey.split('-').map(Number);
  const quarter = Math.floor((month - 1) / 3) + 1;
  const firstMonth = (quarter - 1) * 3 + 1;
  const monthKeys = Array.from({ length: 3 }, (_, index) => `${year}-${String(firstMonth + index).padStart(2, '0')}`);
  return { year, quarter, monthKeys, startMonth: monthKeys[0], endMonth: monthKeys[2], label: `${quarter}º trimestre de ${year}` };
}

export function yearRemainderPeriod(monthKey) {
  if (!isoMonth(monthKey)) throw new Error('Mês inválido para montar o período até dezembro.');
  const start = Number(monthKey.slice(5));
  return consolidatedPeriod(monthKey, 13 - start);
}

export function consolidatedPeriod(monthKey, monthCount = 4) {
  if (!isoMonth(monthKey)) throw new Error('Mês inválido para montar o consolidado.');
  if (!Number.isInteger(monthCount) || monthCount < 1 || monthCount > MAX_CONSOLIDATED_MONTH_COUNT) throw new Error(`Informe de 1 a ${MAX_CONSOLIDATED_MONTH_COUNT} meses para o consolidado.`);
  const [year, start] = monthKey.split('-').map(Number);
  const monthKeys = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(year, start - 1 + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  const monthLabel = key => new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
  const startName = monthLabel(monthKeys[0]);
  const endName = monthLabel(monthKeys.at(-1));
  const endYear = Number(monthKeys.at(-1).slice(0, 4));
  return {
    year,
    monthKeys,
    startMonth:monthKeys[0],
    endMonth:monthKeys.at(-1),
    label:monthCount === 1 ? `${startName} de ${year}` : year === endYear ? `${startName}–${endName} de ${year}` : `${startName} de ${year}–${endName} de ${endYear}`,
  };
}

export function monthWeekRange(monthKey, weekNumber) {
  if (!isoMonth(monthKey)) throw new Error('Mês inválido para calcular a semana.');
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 6) throw new Error('Informe uma semana de 1 a 6.');
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstSaturday = 1 + ((6 - firstWeekday + 7) % 7);
  const endDay = firstSaturday + (weekNumber - 1) * 7;
  if (endDay > daysInMonth) return null;
  const startDate = new Date(Date.UTC(year, month - 1, endDay - 6));
  const isoDate = date => date.toISOString().slice(0, 10);
  return { week_number:weekNumber, start_date:isoDate(startDate), end_date:`${monthKey}-${String(endDay).padStart(2, '0')}` };
}

export function hasMonthlyOccurrence(entry) {
  const match = String(entry?.category_name || entry?.name || '').match(/\bsemana\s*(\d+)\b/i);
  if (!match) return true;
  if (!isoMonth(entry?.month_key)) return false;
  const weekNumber = Number(match[1]);
  return Number.isInteger(weekNumber) && weekNumber >= 1 && weekNumber <= 6 && Boolean(monthWeekRange(entry.month_key, weekNumber));
}

export function canEditActualForMonth(monthKey, now = new Date()) {
  return isoMonth(monthKey) && monthKey <= localMonthKey(now);
}

export function canEditActualForEntry(entry, now = new Date()) {
  if (!isoMonth(entry?.month_key)) return false;
  if (canEditActualForMonth(entry.month_key, now)) return true;
  const nextMonthKey = localMonthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const categoryName = String(entry.category_name || entry.name || '');
  const match = categoryName.match(/\bsemana\s*(\d+)\b/i);
  if (entry.month_key !== nextMonthKey || Number(match?.[1]) !== 1) return false;
  const firstWeek = monthWeekRange(entry.month_key, 1);
  return Boolean(firstWeek && localDateKey(now) >= firstWeek.start_date);
}

export function canMarkQuickPayInFutureMonthlyView(entry, now = new Date()) {
  if (!isoMonth(entry?.month_key) || entry.month_key <= localMonthKey(now)) return false;
  const categoryName = String(entry.category_name || entry.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return categoryName === 'das' || categoryName === 'academia';
}

export function isLunchDinnerCategory(value) {
  const name = typeof value === 'string' ? value : value?.category_name || value?.name || '';
  const normalized = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /almoco\s*(?:\/|e)\s*janta/.test(normalized);
}

export function isBreakfastCategory(value) {
  const name = typeof value === 'string' ? value : value?.category_name || value?.name || '';
  const normalized = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  return /\bcafe da manha\b/.test(normalized);
}

export function isNubankCardCategory(value) {
  const name = typeof value === 'string' ? value : value?.category_name || value?.name || '';
  const normalized = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /^(?:cartao|cart)\s+nub(?:ank)?$/.test(normalized);
}

export function cardDebtAmount(entry) {
  if (!isNubankCardCategory(entry)) return null;
  if (Object.hasOwn(entry || {}, 'card_debt_amount')) return amountOrNull(entry.card_debt_amount, 'Dívida atual do cartão');
  return amountOrNull(entry?.planned_amount, 'Valor planejado') ?? amountOrNull(entry?.actual_amount, 'Valor realizado');
}

export function cardPaymentAmount(entry) {
  if (!isNubankCardCategory(entry)) return null;
  const hasInvoiceField = Object.hasOwn(entry || {}, 'card_debt_amount') || entry?.planned_amount != null;
  return hasInvoiceField ? amountOrNull(entry?.actual_amount, 'Valor realizado') : null;
}

export function openCardDebtAmount(entry) {
  const invoice = cardDebtAmount(entry);
  if (invoice == null) return null;
  const paid = cardPaymentAmount(entry) ?? 0;
  return Math.max(0, Math.round((invoice - paid + Number.EPSILON) * 100) / 100);
}

export function monthlyAmountRemaining(plannedAmount, actualAmount) {
  const planned = amountOrNull(plannedAmount, 'Valor planejado');
  const actual = amountOrNull(actualAmount, 'Valor realizado');
  if (planned == null || actual == null) return null;
  return Math.round((planned - actual + Number.EPSILON) * 100) / 100;
}

export function reserveMinusOpenExpenses(openExpenses, reserveBalance) {
  const open = amountOrNull(openExpenses, 'Despesas previstas em aberto') ?? 0;
  const reserve = amountOrNull(reserveBalance, 'Reserva global') ?? 0;
  return Math.round((reserve - open + Number.EPSILON) * 100) / 100;
}

export function summarizeMonthlyOpenDebts(entries = [], debts = [], cardDebtTotals = {}, now = new Date()) {
  const totals = Object.fromEntries(CURRENCIES.map(code => [code, { plannedRemaining:0, currentGlobalPlannedRemaining:0, cardDebt:0, registeredDebts:0, total:0 }]));
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  for (const entry of entries) {
    if (!entry || !CURRENCIES.includes(entry.currency) || !hasMonthlyOccurrence(entry)) continue;
    if (isNubankCardCategory(entry)) continue;
    const planned = amountOrNull(entry.planned_amount, 'Valor planejado');
    if (planned == null) continue;
    const actual = amountOrNull(entry.actual_amount, 'Valor realizado') ?? 0;
    const remaining = Math.max(0, round(planned - actual));
    totals[entry.currency].plannedRemaining += remaining;
    if (entry.month_key === localMonthKey(now) && isGlobalExpenseInScope(entry, now)) {
      totals[entry.currency].currentGlobalPlannedRemaining += remaining;
    }
  }
  for (const code of CURRENCIES) {
    const cardDebt = cardDebtTotals?.[code]?.cardDebt ?? cardDebtTotals?.[code];
    totals[code].cardDebt = amountOrNull(cardDebt, 'Fatura em aberto do cartão') ?? 0;
  }
  for (const debt of debts) {
    if (!debt || debt.status === 'paid' || !CURRENCIES.includes(debt.currency)) continue;
    totals[debt.currency].registeredDebts += amountOrNull(debt.amount, 'Valor da dívida') ?? 0;
  }
  for (const code of CURRENCIES) {
    const total = totals[code];
    total.plannedRemaining = round(total.plannedRemaining);
    total.currentGlobalPlannedRemaining = round(total.currentGlobalPlannedRemaining);
    total.registeredDebts = round(total.registeredDebts);
    total.total = round(total.plannedRemaining + total.cardDebt + total.registeredDebts);
  }
  return totals;
}

export function sumGlobalOpenCommitments(expenseTotals = {}, monthlyOpenDebt = null) {
  const plannedRemaining = amountOrNull(expenseTotals?.remaining, 'Saldo do planejamento') ?? 0;
  if (monthlyOpenDebt) {
    const currentMonthPlan = amountOrNull(monthlyOpenDebt.currentGlobalPlannedRemaining, 'Saldo planejado do mês') ?? 0;
    const currentMonthDebt = amountOrNull(monthlyOpenDebt.total, 'Dívidas em aberto do mês') ?? 0;
    return Math.round((Math.max(0, plannedRemaining - currentMonthPlan) + currentMonthDebt + Number.EPSILON) * 100) / 100;
  }
  const cardDebt = amountOrNull(expenseTotals?.cardDebt, 'Fatura em aberto do cartão') ?? 0;
  return Math.round((plannedRemaining + cardDebt + Number.EPSILON) * 100) / 100;
}

function isGlobalExpenseInScope(entry, now) {
  if (!isoMonth(entry?.month_key)) return false;
  const currentMonthKey = localMonthKey(now);
  if (entry.month_key < currentMonthKey) return false;
  if (entry.month_key > currentMonthKey) return true;
  const weekMatch = String(entry.category_name || entry.name || '').match(/\bsemana\s*(\d+)\b/i);
  if (!weekMatch) return true;
  const weekRange = monthWeekRange(entry.month_key, Number(weekMatch[1]));
  return Boolean(weekRange && weekRange.end_date > localDateKey(now));
}

export function createGlobalExpenseTotals(now = new Date()) {
  const totals = Object.fromEntries(CURRENCIES.map(code => [code, { plannedCents:0, actualCents:0, remainingCents:0 }]));
  const cardDebtByCategory = new Map();
  const cents = value => Math.round((Number(value) + Number.EPSILON) * 100);
  return {
    add(entry) {
      if (!entry || !CURRENCIES.includes(entry.currency) || !hasMonthlyOccurrence(entry)) return;
      if (isNubankCardCategory(entry)) {
        if (entry.month_key <= localMonthKey(now)) {
          const previous = cardDebtByCategory.get(entry.category_id);
          if (!previous || previous.month_key < entry.month_key) {
            cardDebtByCategory.set(entry.category_id, { month_key:entry.month_key, currency:entry.currency, amount:openCardDebtAmount(entry) });
          }
        }
        return;
      }
      if (!isGlobalExpenseInScope(entry, now)) return;
      const total = totals[entry.currency];
      const planned = entry.planned_amount;
      const actual = entry.actual_amount;
      const actualCents = actual == null ? 0 : cents(actual);
      if (planned != null) {
        const plannedCents = cents(planned);
        total.plannedCents += plannedCents;
        total.remainingCents += Math.max(0, plannedCents - actualCents);
      }
      if (actual != null) total.actualCents += actualCents;
    },
    result() {
      const result = Object.fromEntries(CURRENCIES.map(code => {
        const planned = totals[code].plannedCents / 100;
        const actual = totals[code].actualCents / 100;
        return [code, { planned, actual, remaining:totals[code].remainingCents / 100, cardDebt:0 }];
      }));
      for (const debt of cardDebtByCategory.values()) {
        if (debt.amount != null && CURRENCIES.includes(debt.currency)) result[debt.currency].cardDebt += debt.amount;
      }
      for (const code of CURRENCIES) result[code].cardDebt = Math.round((result[code].cardDebt + Number.EPSILON) * 100) / 100;
      return result;
    },
  };
}

export function dailyBudgetPace(entry, monthKey, now = new Date()) {
  const isLunchDinner = isLunchDinnerCategory(entry);
  const isBreakfast = isBreakfastCategory(entry);
  if ((!isLunchDinner && !isBreakfast) || entry?.currency !== 'BRL' || !isoMonth(monthKey) || monthKey > localMonthKey(now)) return null;
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const elapsedDays = monthKey < localMonthKey(now) ? daysInMonth : Math.max(1, Math.min(daysInMonth, now.getDate()));
  const plannedBudget = amountOrNull(entry.planned_amount, 'Orçamento mensal');
  if (isBreakfast && plannedBudget == null) return null;
  const monthlyBudget = plannedBudget ?? LUNCH_DINNER_MONTHLY_BUDGET;
  const dailyBudget = monthlyBudget / daysInMonth;
  const expectedToDate = Math.round((dailyBudget * elapsedDays + Number.EPSILON) * 100) / 100;
  const actual = amountOrNull(entry.actual_amount, 'Gasto realizado');
  const remaining = actual == null ? null : Math.round((expectedToDate - actual + Number.EPSILON) * 100) / 100;
  const status = monthlyCategoryStatus({ planned_amount:expectedToDate, actual_amount:actual });
  return {
    monthlyBudget,
    daysInMonth,
    elapsedDays,
    dailyBudget,
    expectedToDate,
    actualDailyAverage:actual == null ? null : actual / elapsedDays,
    remaining,
    status,
  };
}

export function summarizePeriodEntries(entries = [], monthKeys = []) {
  const includedMonths = new Set(monthKeys);
  const rows = new Map();
  for (const entry of entries) {
    if (!includedMonths.has(entry.month_key) || !hasMonthlyOccurrence(entry)) continue;
    const key = `${entry.category_id}::${entry.currency}`;
    const row = rows.get(key) || {
      category_id:entry.category_id,
      category_name:entry.category_name,
      group_id:entry.group_id,
      group_name:entry.group_name,
      currency:entry.currency,
      planned_amount:null,
      actual_amount:null,
      months:Object.fromEntries(monthKeys.map(monthKey => [monthKey, { planned:null, actual:null }])),
    };
    const month = row.months[entry.month_key];
    const isCard = isNubankCardCategory(entry);
    const planned = isCard ? cardDebtAmount(entry) : entry.planned_amount;
    const actual = isCard ? cardPaymentAmount(entry) : entry.actual_amount;
    if (planned != null) {
      row.planned_amount = (row.planned_amount ?? 0) + planned;
      month.planned = (month.planned ?? 0) + planned;
    }
    if (actual != null) {
      row.actual_amount = (row.actual_amount ?? 0) + actual;
      month.actual = (month.actual ?? 0) + actual;
    }
    rows.set(key, row);
  }
  return [...rows.values()];
}

export function applyLunchDinnerBudgetFallback(rows = [], entries = [], monthKeys = [], { excludeRow = () => false } = {}) {
  const entryByMonthCategory = new Map(entries.map(entry => [`${entry.month_key}::${entry.category_id}`, entry]));
  for (const row of rows) {
    if (!isLunchDinnerCategory(row) || row.currency !== 'BRL' || excludeRow(row)) continue;
    for (const monthKey of monthKeys) {
      const monthValues = row.months?.[monthKey];
      if (!monthValues || monthValues.planned != null) continue;
      const monthEntry = entryByMonthCategory.get(`${monthKey}::${row.category_id}`);
      if (monthEntry && monthEntry.currency !== 'BRL') continue;
      monthValues.planned = LUNCH_DINNER_MONTHLY_BUDGET;
      row.planned_amount = (row.planned_amount ?? 0) + LUNCH_DINNER_MONTHLY_BUDGET;
    }
  }
  return rows;
}

export function summarizeMonthlyPeriodTotals(rows = [], monthKeys = []) {
  const totals = Object.fromEntries(monthKeys.map(monthKey => [monthKey, Object.fromEntries(CURRENCIES.map(code => [code, { planned:null, actual:null, plannedCount:0, actualCount:0, categoryCount:0 }]))]));
  const addAmount = (current, value) => Math.round(((current ?? 0) + Number(value) + Number.EPSILON) * 100) / 100;
  for (const row of rows) {
    if (!CURRENCIES.includes(row.currency)) continue;
    for (const monthKey of monthKeys) {
      const values = row.months?.[monthKey];
      if (!values) continue;
      const total = totals[monthKey][row.currency];
      total.categoryCount += 1;
      if (values.planned != null) {
        total.planned = addAmount(total.planned, values.planned);
        total.plannedCount += 1;
      }
      if (values.actual != null) {
        total.actual = addAmount(total.actual, values.actual);
        total.actualCount += 1;
      }
    }
  }
  return totals;
}

export function summarizeQuarterEntries(entries = [], monthKeys = []) {
  return summarizePeriodEntries(entries, monthKeys);
}

export function normalizeSettings(settings = {}) {
  const default_currency = currency(settings.default_currency || DEFAULT_SETTINGS.default_currency);
  const near_limit_percent = Number(settings.near_limit_percent ?? DEFAULT_SETTINGS.near_limit_percent);
  if (!Number.isFinite(near_limit_percent) || near_limit_percent < 1 || near_limit_percent > 99) throw new Error('O limite de proximidade deve ficar entre 1% e 99%.');
  return { key:'preferences', default_currency, near_limit_percent:Math.round(near_limit_percent) };
}

export function createMonthSnapshot({ monthKey, categories = [], groups = [], previousEntries = [], planSource = 'defaults', createdAt = new Date().toISOString() }) {
  if (!isoMonth(monthKey)) throw new Error('Mês inválido.');
  const categoryRows = categories.map(normalizeCategory);
  const normalizedGroups = groups.map(normalizeGroup);
  const groupNames = new Map(normalizedGroups.map(group => [group.group_id, group.name]));
  const activeGroupIds = new Set(normalizedGroups.filter(group => group.active).map(group => group.group_id));
  const prior = new Map(previousEntries.map(normalizeEntry).map(entry => [entry.category_id, entry]));
  const copyPrevious = planSource === 'previous';
  const entries = categoryRows.filter(category => category.active && activeGroupIds.has(category.group_id)).map(category => {
    const old = prior.get(category.category_id);
    const isLunchDinner = isLunchDinnerCategory(category);
    const isCard = isNubankCardCategory(category);
    const planned = isCard ? null : copyPrevious && old
      ? old.planned_amount ?? (isLunchDinner ? LUNCH_DINNER_MONTHLY_BUDGET : null)
      : category.default_plan ?? (isLunchDinner ? LUNCH_DINNER_MONTHLY_BUDGET : null);
    const entry = {
      entry_id: `${monthKey}:${category.category_id}`,
      month_key: monthKey,
      category_id: category.category_id,
      category_name: category.name,
      group_id: category.group_id,
      group_name: groupNames.get(category.group_id) || category.group_id,
      currency: category.currency,
      planned_amount: planned,
      actual_amount: null,
    };
    if (isCard) entry.card_debt_amount = old ? openCardDebtAmount(old) : null;
    return normalizeEntry(entry);
  });
  return { month: normalizeMonth({ month_key: monthKey, plan_source: copyPrevious ? 'previous' : 'defaults', created_at: createdAt }), entries };
}

export function snapshotNewCategory(category, group, monthKey) {
  const normalized = normalizeCategory(category);
  return normalizeEntry({
    entry_id: `${monthKey}:${normalized.category_id}`,
    month_key: monthKey,
    category_id: normalized.category_id,
    category_name: normalized.name,
    group_id: normalized.group_id,
    group_name: group?.name || normalized.group_id,
    currency: normalized.currency,
    planned_amount: isNubankCardCategory(normalized) ? null : normalized.default_plan,
    actual_amount: null,
    ...(isNubankCardCategory(normalized) ? { card_debt_amount:null } : {}),
  });
}

export function updateEntryAmount(entry, field, value) {
  if (!['planned_amount', 'actual_amount', 'card_debt_amount'].includes(field)) throw new Error('Campo mensal inválido.');
  const label = field === 'planned_amount' ? 'Valor planejado' : field === 'actual_amount' ? 'Valor realizado' : 'Dívida atual do cartão';
  const updated = { ...(entry || {}) };
  const isCard = isNubankCardCategory(entry);
  const legacyActualOnlyCard = isCard && !Object.hasOwn(entry || {}, 'card_debt_amount') && entry?.planned_amount == null && entry?.actual_amount != null;
  if (isCard && (field === 'planned_amount' || field === 'card_debt_amount')) {
    if (legacyActualOnlyCard) updated.actual_amount = null;
    updated.planned_amount = entry?.planned_amount ?? null;
    updated.card_debt_amount = amountOrNull(value, 'Fatura do Cartão Nubank');
  } else {
    if (legacyActualOnlyCard && field === 'actual_amount') updated.card_debt_amount = cardDebtAmount(entry);
    updated[field] = amountOrNull(value, label);
  }
  return normalizeEntry(updated);
}

export function monthlyCategoryStatus(entry, settings = DEFAULT_SETTINGS) {
  const planned = entry?.planned_amount;
  const actual = entry?.actual_amount;
  if (actual === null || actual === undefined) return 'missing';
  if (planned === null || planned === undefined) return 'unplanned';
  if (planned === 0) return actual > 0 ? 'overspent' : 'under';
  const utilization = actual / planned;
  return utilization > 1 ? 'overspent' : utilization >= normalizeSettings(settings).near_limit_percent / 100 ? 'near' : 'under';
}

export function summarizeGlobalReserve(entries = [], funds = [], throughMonthKey, { includeFutureActual = false, includeFutureContributions = false } = {}) {
  if (!isoMonth(throughMonthKey)) throw new Error('Mês inválido para calcular a reserva.');
  const reserveByItem = new Map();
  const nubankByItem = new Map();
  for (const fund of funds) {
    if (!isoMonth(fund?.month_key)) continue;
    if (fund.type === 'available' && /nubank/i.test(String(fund.name || ''))) {
      if (fund.month_key > throughMonthKey) continue;
      const current = nubankByItem.get(fund.item_id);
      if (!current || current.month_key < fund.month_key) nubankByItem.set(fund.item_id, fund);
      continue;
    }
    if (fund.type !== 'reserve') continue;
    if (fund.month_key > throughMonthKey && !includeFutureContributions) continue;
    const current = reserveByItem.get(fund.item_id);
    if (!current) {
      reserveByItem.set(fund.item_id, { ...fund, started_month_key:fund.month_key });
      continue;
    }
    const started_month_key = current.started_month_key < fund.month_key ? current.started_month_key : fund.month_key;
    const latest = current.month_key < fund.month_key ? fund : current;
    reserveByItem.set(fund.item_id, { ...latest, started_month_key });
  }
  const contributions = [...reserveByItem.values()].sort((a, b) => a.started_month_key.localeCompare(b.started_month_key) || a.item_id.localeCompare(b.item_id));
  const firstContributionMonth = contributions.reduce((start, fund) => !start || fund.started_month_key < start ? fund.started_month_key : start, null);
  const contributed = Object.fromEntries(CURRENCIES.map(code => [code, 0]));
  const nubankBalances = Object.fromEntries(CURRENCIES.map(code => [code, 0]));
  const spent = Object.fromEntries(CURRENCIES.map(code => [code, 0]));
  for (const fund of contributions) {
    if (CURRENCIES.includes(fund.currency)) contributed[fund.currency] += Number(fund.amount) || 0;
  }
  for (const fund of nubankByItem.values()) {
    if (CURRENCIES.includes(fund.currency)) nubankBalances[fund.currency] += Number(fund.amount) || 0;
  }
  if (firstContributionMonth) {
    for (const entry of entries) {
      if (entry?.month_key < firstContributionMonth || (!includeFutureActual && entry?.month_key > throughMonthKey) || entry?.actual_amount == null || !CURRENCIES.includes(entry.currency) || !hasMonthlyOccurrence(entry) || isNubankCardCategory(entry)) continue;
      spent[entry.currency] += Number(entry.actual_amount) || 0;
    }
  }
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  // O saldo bruto da reserva preserva os aportes; gastos e dívida são
  // abatidos separadamente ao calcular o saldo disponível global.
  const balances = Object.fromEntries(CURRENCIES.map(code => [code, round(contributed[code])]));
  return {
    contributions,
    firstContributionMonth,
    contributed:Object.fromEntries(CURRENCIES.map(code => [code, round(contributed[code])])),
    nubankBalances:Object.fromEntries(CURRENCIES.map(code => [code, round(nubankBalances[code])])),
    spent:Object.fromEntries(CURRENCIES.map(code => [code, round(spent[code])])),
    balances,
  };
}

export function summarizeByCurrency(entries = [], debts = [], funds = [], settings = DEFAULT_SETTINGS, reserveBalances = null) {
  const currencies = new Set([
    ...entries.map(item => item.currency),
    ...debts.map(item => item.currency),
    ...funds.map(item => item.currency),
    ...Object.keys(reserveBalances || {}),
  ]);
  return Object.fromEntries([...currencies].filter(value => CURRENCIES.includes(value)).sort().map(code => {
    const categoryRows = entries.filter(item => item.currency === code && hasMonthlyOccurrence(item)).map(item => isNubankCardCategory(item)
      ? { ...item, planned_amount:cardDebtAmount(item), actual_amount:cardPaymentAmount(item) }
      : item);
    const selectedDebts = debts.filter(item => item.currency === code && item.status !== 'paid');
    const availableRows = funds.filter(item => item.currency === code && item.type === 'available');
    const reserveRows = funds.filter(item => item.currency === code && item.type === 'reserve');
    const sum = (items, field) => items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
    const planned = sum(categoryRows.filter(item => item.planned_amount != null), 'planned_amount');
    const trackedActualRows = categoryRows.filter(item => item.actual_amount != null);
    const actual = sum(trackedActualRows, 'actual_amount');
    return [code, {
      planned,
      actual,
      remaining: planned - actual,
      utilization: planned > 0 ? actual / planned * 100 : null,
      overspentCount: categoryRows.filter(item => monthlyCategoryStatus(item, settings) === 'overspent').length,
      nearLimitCount: categoryRows.filter(item => monthlyCategoryStatus(item, settings) === 'near').length,
      missingActualCount: categoryRows.filter(item => item.actual_amount == null).length,
      trackedActualCount: trackedActualRows.length,
      debts: sum(selectedDebts, 'amount'),
      available: sum(availableRows, 'amount'),
      reserves: reserveBalances && Object.hasOwn(reserveBalances, code) ? Number(reserveBalances[code]) || 0 : sum(reserveRows, 'amount'),
      netPosition: sum(availableRows, 'amount') + (reserveBalances && Object.hasOwn(reserveBalances, code) ? Number(reserveBalances[code]) || 0 : sum(reserveRows, 'amount')) - sum(selectedDebts, 'amount'),
    }];
  }));
}

export function validateBundle(bundle) {
  if (!bundle || bundle.schema !== SCHEMA) throw new Error('Backup de Controle de gastos incompatível.');
  const arrays = ['groups', 'categories', 'months', 'entries', 'debts', 'funds'];
  for (const key of arrays) if (!Array.isArray(bundle[key])) throw new Error(`Backup financeiro inválido: lista ${key} ausente.`);
  if (bundle.settings != null && !Array.isArray(bundle.settings)) throw new Error('Backup financeiro inválido: lista settings ausente.');
  const normalized = Object.fromEntries([...arrays.map(key => [key, bundle[key].map(normalizerFor(key))]), ['settings', (bundle.settings?.length ? bundle.settings : [DEFAULT_SETTINGS]).map(normalizeSettings)]]);
  for (const [items, key] of [[normalized.groups, 'group_id'], [normalized.categories, 'category_id'], [normalized.months, 'month_key'], [normalized.entries, 'entry_id'], [normalized.debts, 'snapshot_id'], [normalized.funds, 'snapshot_id'], [normalized.settings, 'key']]) {
    if (new Set(items.map(item => item[key])).size !== items.length) throw new Error(`Backup financeiro contém identificadores duplicados (${key}).`);
  }
  const categoryIds = new Set(normalized.categories.map(item => item.category_id));
  const groupIds = new Set(normalized.groups.map(item => item.group_id));
  const monthIds = new Set(normalized.months.map(item => item.month_key));
  if (normalized.categories.some(item => !groupIds.has(item.group_id))) throw new Error('Há categoria vinculada a um grupo inexistente.');
  if (normalized.entries.some(item => !categoryIds.has(item.category_id))) throw new Error('Há valor mensal vinculado a uma categoria inexistente.');
  if ([...normalized.entries, ...normalized.debts, ...normalized.funds].some(item => !monthIds.has(item.month_key))) throw new Error('Há registro financeiro vinculado a um mês inexistente.');
  if (!normalized.settings.length) normalized.settings.push({ ...DEFAULT_SETTINGS });
  if (normalized.settings.length !== 1 || normalized.settings[0].key !== 'preferences') throw new Error('Backup financeiro deve conter uma única configuração de preferências.');
  return { schema: SCHEMA, version: 1, exported_at: bundle.exported_at || new Date().toISOString(), ...normalized };
}

function normalizerFor(key) {
  return ({ groups: normalizeGroup, categories: normalizeCategory, months: normalizeMonth, entries: normalizeEntry, debts: normalizeDebt, funds: normalizeFund, settings: normalizeSettings })[key];
}
