import { TRACKING_CLICKS_MAX_DAYS } from './tracking-clicks-domain.mjs?v=5';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,4})?$/;
const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function isDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function safeText(value, field, maxLength = 253) {
  if (value === null) return null;
  if (typeof value !== 'string' || !value || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`O relatório contém ${field} inválido.`);
  }
  return value;
}

function moneyUnits(value, field = 'payout') {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) throw new Error(`O relatório contém ${field} inválido.`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}

function normalizeCurrency(value) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) throw new Error('O relatório contém uma moeda inválida.');
  return value;
}

export function validateGuruMediaSalesDateRange(startDate, endDate) {
  if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) throw new Error('invalid_date_range');
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days > TRACKING_CLICKS_MAX_DAYS) throw new Error('date_range_too_large');
  return { startDate, endDate };
}

export function normalizeGuruMediaSalesReport(payload, expectedRange) {
  const range = validateGuruMediaSalesDateRange(expectedRange?.startDate, expectedRange?.endDate);
  const allowedFields = ['ok', 'schema_version', 'generated_at_utc', 'start_date', 'end_date', 'count_semantics', 'summary', 'rows'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).some(key => !allowedFields.includes(key))
      || payload.ok !== true || payload.schema_version !== 1
      || payload.start_date !== range.startDate || payload.end_date !== range.endDate
      || payload.count_semantics !== 'matched_sales_only'
      || typeof payload.generated_at_utc !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload.generated_at_utc)
      || !Number.isFinite(Date.parse(payload.generated_at_utc))
      || !payload.summary || typeof payload.summary !== 'object' || Array.isArray(payload.summary)
      || !Array.isArray(payload.summary.payout_by_currency) || !Array.isArray(payload.rows)) {
    throw new Error('O servidor retornou um relatório GuruMedia inválido.');
  }
  const summaryFields = ['sales_count', 'payout_by_currency', 'unmatched_callbacks', 'ambiguous_callbacks'];
  if (Object.keys(payload.summary).some(key => !summaryFields.includes(key))
      || !Number.isSafeInteger(payload.summary.sales_count) || payload.summary.sales_count < 0
      || !Number.isSafeInteger(payload.summary.unmatched_callbacks) || payload.summary.unmatched_callbacks < 0
      || !Number.isSafeInteger(payload.summary.ambiguous_callbacks) || payload.summary.ambiguous_callbacks < 0) {
    throw new Error('O servidor retornou totais GuruMedia inválidos.');
  }
  if (payload.rows.length > 5000 || payload.summary.payout_by_currency.length > 20) {
    throw new Error('O relatório GuruMedia excedeu o limite de linhas ou moedas.');
  }

  const rowTotals = new Map();
  const seen = new Set();
  const rows = payload.rows.map(row => {
    const fields = ['date_utc', 'product_key', 'product_label', 'presell_host', 'offer_name', 'currency', 'sales_count', 'payout_total'];
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !fields.includes(key))) {
      throw new Error('O servidor retornou uma linha GuruMedia inválida.');
    }
    if (!isDate(row.date_utc) || row.date_utc < range.startDate || row.date_utc > range.endDate) {
      throw new Error('O relatório GuruMedia contém uma data fora do período consultado.');
    }
    const productKey = row.product_key === null ? null : safeText(row.product_key, 'identificador do produto', 253);
    if (productKey !== null && !/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/.test(productKey)) {
      throw new Error('O relatório GuruMedia contém um identificador de produto inválido.');
    }
    const productLabel = safeText(row.product_label, 'nome do Track');
    const offerName = safeText(row.offer_name, 'nome da oferta');
    if (typeof row.presell_host !== 'string' || !HOST_PATTERN.test(row.presell_host)) {
      throw new Error('O relatório GuruMedia contém um domínio inválido.');
    }
    const currency = normalizeCurrency(row.currency);
    if (!Number.isSafeInteger(row.sales_count) || row.sales_count < 1) throw new Error('O relatório GuruMedia contém uma contagem inválida.');
    const payoutTotal = row.payout_total;
    const units = moneyUnits(payoutTotal);
    const identity = [row.date_utc, productKey ?? '', productLabel ?? '', row.presell_host, offerName ?? '', currency].join('\0');
    if (seen.has(identity)) throw new Error('O relatório GuruMedia contém uma linha agregada duplicada.');
    seen.add(identity);
    const current = rowTotals.get(currency) || { count: 0, units: 0n };
    current.count += row.sales_count;
    current.units += units;
    rowTotals.set(currency, current);
    return {
      dateUtc: row.date_utc,
      productKey,
      productLabel,
      presellHost: row.presell_host,
      offerName,
      currency,
      salesCount: row.sales_count,
      payoutTotal,
    };
  });

  const payoutByCurrency = payload.summary.payout_by_currency.map(item => {
    const fields = ['currency', 'sales_count', 'payout_total'];
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !fields.includes(key))) {
      throw new Error('O servidor retornou um resumo GuruMedia inválido.');
    }
    const currency = normalizeCurrency(item.currency);
    if (!Number.isSafeInteger(item.sales_count) || item.sales_count < 0) throw new Error('O relatório GuruMedia contém um total inválido.');
    const payoutTotal = item.payout_total;
    const units = moneyUnits(payoutTotal, 'payout total');
    const rowTotal = rowTotals.get(currency) || { count: 0, units: 0n };
    if (item.sales_count !== rowTotal.count || units !== rowTotal.units) throw new Error('Os totais GuruMedia não correspondem às linhas do relatório.');
    rowTotals.delete(currency);
    return { currency, salesCount: item.sales_count, payoutTotal };
  });
  if (rowTotals.size || payoutByCurrency.reduce((sum, item) => sum + item.salesCount, 0) !== payload.summary.sales_count) {
    throw new Error('Os totais GuruMedia não correspondem às linhas do relatório.');
  }
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    generatedAtUtc: payload.generated_at_utc,
    summary: {
      salesCount: payload.summary.sales_count,
      payoutByCurrency,
      unmatchedCallbacks: payload.summary.unmatched_callbacks,
      ambiguousCallbacks: payload.summary.ambiguous_callbacks,
    },
    rows,
  };
}

export function sumGuruMediaPayouts(values) {
  const units = values.reduce((sum, value) => sum + moneyUnits(value), 0n);
  const whole = units / 10000n;
  const fraction = String(units % 10000n).padStart(4, '0');
  return `${whole}.${fraction}`;
}

export function formatGuruMediaPayout(value, currency) {
  const units = moneyUnits(value);
  const whole = new Intl.NumberFormat('pt-BR').format(units / 10000n);
  let fraction = String(units % 10000n).padStart(4, '0');
  while (fraction.length > 2 && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return `${currency} ${whole},${fraction.padEnd(2, '0')}`;
}

export function guruMediaTrackFilterKey(row) {
  return `${row.productKey ?? ''}\0${row.presellHost}`;
}
