export const BILLING_STATUSES = Object.freeze({
  pending: 'Pendente',
  paid: 'Paga',
  partially_paid: 'Parcialmente paga',
  unknown: 'Não informado',
});

export const BILLING_DIMENSIONS = Object.freeze({
  month: 'Mês', product: 'Produto', platform: 'Plataforma', account: 'Conta',
});

export function sumCurrency(rows, field) {
  let amount = 0;
  let known = 0;
  let missing = 0;
  for (const row of rows) {
    const value = row?.[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      amount += value;
      known += 1;
    } else missing += 1;
  }
  return { amount: known ? amount : null, known, missing, complete: missing === 0 };
}

export function normalizeSale(input, { now = new Date().toISOString(), id } = {}) {
  const text = value => String(value ?? '').trim();
  const saleDate = text(input.sale_date);
  if (!isIsoDate(saleDate)) {
    throw new Error('Informe a data da venda no formato dia/mês/ano.');
  }
  const status = Object.hasOwn(BILLING_STATUSES, input.payment_status) ? input.payment_status : 'unknown';
  const amount = (value, label) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} deve ser um valor igual ou maior que zero.`);
    return parsed;
  };
  return {
    sale_id: text(input.sale_id) || id || makeId('sale'),
    sale_date: saleDate,
    platform: text(input.platform),
    product: text(input.product),
    commission_type: text(input.commission_type),
    account: text(input.account),
    value_brl: amount(input.value_brl, 'Comissão em R$'),
    value_usd: amount(input.value_usd, 'Comissão em US$'),
    payment_status: status,
    observed_payment_status: input.observed_payment_status ?? status,
    confirmation_status: ['manual', 'provisional', 'confirmed', 'not_confirmed', 'represented_by_manual'].includes(input.confirmation_status) ? input.confirmation_status : null,
    confirmation_source: text(input.confirmation_source) || null,
    confirmed_at: input.confirmed_at || null,
    campaign_id: text(input.campaign_id) || null,
    country_code: /^[A-Z]{2}$/.test(text(input.country_code).toUpperCase()) ? text(input.country_code).toUpperCase() : null,
    sale_time: text(input.sale_time) || null,
    conversion_count: input.conversion_count == null ? 1 : Math.max(0, Number.isFinite(Number(input.conversion_count)) ? Number(input.conversion_count) : 1),
    notes: text(input.notes),
    source: text(input.source) || 'manual',
    source_ref: text(input.source_ref) || null,
    source_period: ['d0', 'd1'].includes(input.source_period) ? input.source_period : null,
    external_id: text(input.external_id) || null,
    active: input.active !== false,
    cancelled_at: input.cancelled_at || null,
    cancellation_reason: text(input.cancellation_reason),
    created_at: input.created_at || now,
    updated_at: input.updated_at || now,
  };
}

export function provisionalSaleToBilling(input, { now = new Date().toISOString() } = {}) {
  if (!input?.billing_sale_id || !input?.id || !input?.campanha_id) throw new Error('A venda manual não tem vínculo estável com a campanha.');
  const confirmed = input.status === 'conciliada';
  return normalizeSale({
    sale_id: input.billing_sale_id,
    sale_date: input.data,
    product: input.produto || 'Produto não identificado',
    platform: input.plataforma || input.origem || 'Não identificada',
    commission_type: 'Comissão por conversão',
    account: input.conta || '',
    value_brl: input.valor_brl,
    value_usd: null,
    payment_status: 'pending',
    observed_payment_status: 'pending',
    confirmation_status: confirmed ? 'confirmed' : 'manual',
    confirmation_source: confirmed ? (input.conciliacao_origem === 'excel_legacy' ? 'Histórico Excel' : 'MCC D−1') : null,
    confirmed_at: confirmed ? (input.conciliada_em || now) : null,
    campaign_id: input.campanha_id,
    country_code: input.pais_codigo || null,
    sale_time: input.hora || null,
    source: 'hub_manual_capture',
    source_ref: input.id,
    notes: input.identificador_mascarado ? `ID manual: ${input.identificador_mascarado}` : '',
    active: true,
  }, { now });
}

export function normalizeMovement(input, { now = new Date().toISOString(), id } = {}) {
  if (!input?.sale_id) throw new Error('O movimento precisa estar associado a uma venda.');
  if (!['receipt', 'refund'].includes(input.type)) throw new Error('Tipo de movimento inválido.');
  const date = input.effective_date == null || input.effective_date === '' ? null : String(input.effective_date);
  if (date && !isIsoDate(date)) {
    throw new Error('A data do movimento deve estar no formato dia/mês/ano.');
  }
  const amount = (value, label) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} deve ser um valor igual ou maior que zero.`);
    return parsed;
  };
  if (input.value_brl == null && input.value_usd == null) throw new Error('Informe pelo menos um valor em R$ ou US$.');
  return {
    movement_id: input.movement_id || id || makeId('movement'),
    sale_id: String(input.sale_id),
    type: input.type,
    effective_date: date,
    value_brl: amount(input.value_brl, 'Valor em R$'),
    value_usd: amount(input.value_usd, 'Valor em US$'),
    source: String(input.source || 'manual'),
    notes: String(input.notes || '').trim(),
    created_at: input.created_at || now,
  };
}

export function makeAudit(action, entity, entityId, fields = [], { now = new Date().toISOString(), id } = {}) {
  return {
    audit_id: id || makeId('audit'),
    action,
    entity,
    entity_id: String(entityId),
    created_at: now,
    changes: fields.map(change => ({ field: String(change.field), old_value: change.old_value ?? null, new_value: change.new_value ?? null })),
  };
}

export function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function mccConversionSaleId(campaignId, saleDate) {
  return `mcc-conversion:${String(campaignId || '').trim()}:${String(saleDate || '').trim()}`;
}

export function summarizeCompetence(sales, movements) {
  const active = sales.filter(sale => sale.active !== false);
  const activeIds = new Set(active.map(sale => sale.sale_id));
  const related = movements.filter(move => activeIds.has(move.sale_id));
  const refunds = related.filter(move => move.type === 'refund');
  const receipts = related.filter(move => move.type === 'receipt');
  const grossBrl = sumCurrency(active, 'value_brl');
  const grossUsd = sumCurrency(active, 'value_usd');
  const refundBrl = sumCurrency(refunds, 'value_brl');
  const refundUsd = sumCurrency(refunds, 'value_usd');
  const receiptBrl = sumCurrency(receipts, 'value_brl');
  const receiptUsd = sumCurrency(receipts, 'value_usd');
  const activeConversions = active.reduce((sum, sale) => sum + conversionCount(sale), 0);
  const refundConversions = refunds.reduce((sum, sale) => sum + conversionCount(sale), 0);
  const netBrl = netCurrency(grossBrl, refundBrl, activeConversions, refundConversions);
  const netUsd = netCurrency(grossUsd, refundUsd, activeConversions, refundConversions);
  const pendingSales = active.filter(sale => ['pending', 'partially_paid'].includes(sale.payment_status));
  const paidWithoutDate = active.filter(sale => sale.payment_status === 'paid' && !receipts.some(move => move.sale_id === sale.sale_id && move.effective_date));
  const pendingBrl = remainingByCurrency(pendingSales, receipts, 'value_brl');
  const pendingUsd = remainingByCurrency(pendingSales, receipts, 'value_usd');
  const knownBrlCount = active.filter(sale => typeof sale.value_brl === 'number').reduce((sum, sale) => sum + conversionCount(sale), 0);
  const knownUsdCount = active.filter(sale => typeof sale.value_usd === 'number').reduce((sum, sale) => sum + conversionCount(sale), 0);
  const commissionBrl = knownBrlCount ? grossBrl.amount / knownBrlCount : null;
  const commissionUsd = knownUsdCount ? grossUsd.amount / knownUsdCount : null;
  return {
    salesCount: activeConversions,
    grossBrl, grossUsd, refundBrl, refundUsd, netBrl, netUsd, receiptBrl, receiptUsd, pendingBrl, pendingUsd,
    pendingCount: pendingSales.reduce((sum, sale) => sum + conversionCount(sale), 0),
    paidWithoutDateCount: paidWithoutDate.reduce((sum, sale) => sum + conversionCount(sale), 0),
    paidWithoutDateBrl: sumCurrency(paidWithoutDate, 'value_brl'),
    paidWithoutDateUsd: sumCurrency(paidWithoutDate, 'value_usd'),
    averageBrl: commissionBrl, averageUsd: commissionUsd,
    missingBrlCount: active.reduce((sum, sale) => sum + (typeof sale.value_brl === 'number' ? 0 : conversionCount(sale)), 0),
    missingUsdCount: active.reduce((sum, sale) => sum + (typeof sale.value_usd === 'number' ? 0 : conversionCount(sale)), 0),
  };
}

function conversionCount(sale) {
  const count = Number(sale?.conversion_count);
  return Number.isFinite(count) && count >= 0 ? count : 1;
}

function netCurrency(gross, refund, salesCount, refundCount) {
  const missing = gross.missing + refund.missing;
  const knownAmount = (gross.amount ?? 0) - (refund.amount ?? 0);
  return { amount: gross.known || refund.known ? knownAmount : null, known: gross.known + refund.known, missing, complete: missing === 0 && (salesCount === 0 || gross.missing === 0) && (refundCount === 0 || refund.missing === 0) };
}

function remainingByCurrency(sales, receipts, field) {
  const receiptBySale = new Map();
  for (const movement of receipts) if (typeof movement[field] === 'number') receiptBySale.set(movement.sale_id, (receiptBySale.get(movement.sale_id) || 0) + movement[field]);
  let amount = 0, known = 0, missing = 0;
  for (const sale of sales) {
    if (typeof sale[field] !== 'number') { missing += 1; continue; }
    const remaining = Math.max(0, sale[field] - (receiptBySale.get(sale.sale_id) || 0));
    amount += remaining;
    known += 1;
  }
  return { amount: known ? amount : null, known, missing, complete: missing === 0 };
}

export function summarizeCash(movements) {
  const receipts = movements.filter(move => move.type === 'receipt');
  const refunds = movements.filter(move => move.type === 'refund');
  const receiptsBrl = sumCurrency(receipts, 'value_brl');
  const receiptsUsd = sumCurrency(receipts, 'value_usd');
  const refundsBrl = sumCurrency(refunds, 'value_brl');
  const refundsUsd = sumCurrency(refunds, 'value_usd');
  return {
    movementCount: movements.length,
    receiptCount: receipts.length,
    refundCount: refunds.length,
    receiptsBrl, receiptsUsd, refundsBrl, refundsUsd,
    netBrl: netCurrency(receiptsBrl, refundsBrl, receipts.length, refunds.length),
    netUsd: netCurrency(receiptsUsd, refundsUsd, receipts.length, refunds.length),
  };
}

export function filterRows(rows, filters = {}) {
  const contains = (value, query) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(String(query ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'));
  return rows.filter(row => {
    const sale = row.sale || row;
    return (filters.platform === 'all' || !filters.platform || sale.platform === filters.platform)
      && (filters.product === 'all' || !filters.product || sale.product === filters.product)
      && (filters.account === 'all' || !filters.account || sale.account === filters.account)
      && (filters.status === 'all' || !filters.status || sale.payment_status === filters.status)
      && (!filters.search || [sale.product, sale.platform, sale.account, sale.commission_type, sale.notes, sale.external_id].some(value => contains(value, filters.search)));
  });
}

export function aggregateBy(sales, movements, dimension = 'month') {
  const validDimension = Object.hasOwn(BILLING_DIMENSIONS, dimension) ? dimension : 'month';
  const groups = new Map();
  for (const sale of sales.filter(item => item.active !== false)) {
    const key = validDimension === 'month' ? String(sale.sale_date || '').slice(0, 7) : String(sale[validDimension] || 'Não informado');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sale);
  }
  return [...groups.entries()].map(([key, groupSales]) => {
    const ids = new Set(groupSales.map(sale => sale.sale_id));
    const summary = summarizeCompetence(groupSales, movements.filter(move => ids.has(move.sale_id)));
    return { key, sales: groupSales.length, grossBrl: summary.grossBrl, grossUsd: summary.grossUsd, netBrl: summary.netBrl, netUsd: summary.netUsd };
  }).sort((a, b) => validDimension === 'month' ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key));
}

export function aggregateCashBy(movements, salesById, dimension = 'month') {
  const validDimension = Object.hasOwn(BILLING_DIMENSIONS, dimension) ? dimension : 'month';
  const groups = new Map();
  for (const movement of movements) {
    const sale = salesById.get(movement.sale_id) || {};
    const key = validDimension === 'month' ? String(movement.effective_date || '').slice(0, 7) : String(sale[validDimension] || 'Não informado');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(movement);
  }
  return [...groups.entries()].map(([key, items]) => {
    const summary = summarizeCash(items);
    return { key, movements: items.length, receiptsBrl: summary.receiptsBrl, receiptsUsd: summary.receiptsUsd, refundsBrl: summary.refundsBrl, refundsUsd: summary.refundsUsd, netBrl: summary.netBrl, netUsd: summary.netUsd };
  }).sort((a, b) => validDimension === 'month' ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key));
}

export function monthlyFinancialSeries({ sales = [], movements = [], salesById = new Map(), start, end, mode = 'competence' } = {}) {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) return [];
  const aggregates = mode === 'cash'
    ? aggregateCashBy(movements, salesById, 'month')
    : aggregateBy(sales, movements, 'month');
  const byMonth = new Map(aggregates.map(item => [item.key, item]));
  const manualByMonth = new Map();
  if (mode !== 'cash') {
    for (const sale of sales) {
      if (sale.active === false || !(sale.confirmation_status === 'manual' || sale.source === 'hub_manual_capture')) continue;
      const key = String(sale.sale_date || '').slice(0, 7);
      if (!manualByMonth.has(key)) manualByMonth.set(key, { amount:0, records:0, missing:0 });
      const manual = manualByMonth.get(key);
      manual.records += 1;
      if (typeof sale.value_brl === 'number' && Number.isFinite(sale.value_brl)) manual.amount += sale.value_brl;
      else manual.missing += 1;
    }
  }
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const last = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  const series = [];

  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 7);
    const item = byMonth.get(key);
    const manual = manualByMonth.get(key);
    const amount = mode === 'cash' ? item?.netBrl : item?.grossBrl;
    series.push({
      key,
      value: item ? amount?.amount ?? null : 0,
      complete: item ? amount?.complete ?? false : true,
      records: mode === 'cash' ? item?.movements ?? 0 : item?.sales ?? 0,
      manualBrl: manual ? { amount:manual.records > manual.missing ? manual.amount : null, records:manual.records, missing:manual.missing } : null,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return series;
}

export function paginate(rows, page = 1, pageSize = 50) {
  const size = Math.max(1, Number(pageSize) || 50);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(pages, Math.max(1, Number(page) || 1));
  return { page: current, pageSize: size, pages, total: rows.length, rows: rows.slice((current - 1) * size, current * size) };
}

export function compareRows(a, b, key, direction = 'desc') {
  const sign = direction === 'asc' ? 1 : -1;
  const left = a.sale || a, right = b.sale || b;
  const av = key === 'date' ? (a.effective_date || left.sale_date || '') : key === 'value_brl' || key === 'value_usd' ? (a[key] ?? left[key] ?? null) : (a[key] ?? left[key] ?? '');
  const bv = key === 'date' ? (b.effective_date || right.sale_date || '') : key === 'value_brl' || key === 'value_usd' ? (b[key] ?? right[key] ?? null) : (b[key] ?? right[key] ?? '');
  if (av == null || bv == null) return av == null ? bv == null ? 0 : 1 : -1;
  return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' })) * sign;
}

export function dateRangeFor(preset, now = new Date()) {
  const today = localIsoDate(now);
  if (preset === 'today') return { start: today, end: today };
  if (preset === 'last7') {
    const startDate = new Date(`${today}T00:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - 6);
    return { start: startDate.toISOString().slice(0, 10), end: today };
  }
  const month = today.slice(0, 7);
  if (preset === 'previous') {
    const first = new Date(`${month}-01T00:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() - 1);
    const start = first.toISOString().slice(0, 7);
    const last = new Date(`${month}-01T00:00:00Z`);
    last.setUTCDate(0);
    return { start: `${start}-01`, end: last.toISOString().slice(0, 10) };
  }
  const last = new Date(`${month}-01T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  return { start: `${month}-01`, end: last.toISOString().slice(0, 10) };
}

export function dateRangeForMonth(month) {
  const match = String(month ?? '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const start = `${match[1]}-${match[2]}-01`;
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function parseBrazilianDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatBrazilianDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : '—';
}

function localIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
