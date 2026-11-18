import { readBillingMetaRecord, upsertExternalSalesToBilling, writeBillingMetaRecord } from '../billing/billing-storage.mjs?v=21';
import { publishAutomaticBillingUpdate } from '../billing/billing-sync.mjs?v=1';
import { fetchGuruMediaBillingSalesPage } from './tracking-service.mjs?v=19';

const SUPPORTED_CURRENCIES = new Set(['BRL', 'USD']);
const GURUMEDIA_PAGE_SIZE = 500;
const MAX_BILLING_SALES_SYNC = 50000;
const GURUMEDIA_BILLING_SYNC_CURSOR_KEY = 'gurumedia-billing-sync-cursor:v1';
const GURUMEDIA_BILLING_SYNC_OVERLAP_DAYS = 1;

function shiftUtcDate(dateValue, days) {
  if (typeof dateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validUtcCheckpoint(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function timestampPartsInTimeZone(value, timeZone) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23',
    }).formatToParts(new Date(value));
    const part = type => parts.find(item => item.type === type)?.value || '';
    return { date:`${part('year')}-${part('month')}-${part('day')}`, time:`${part('hour')}:${part('minute')}:${part('second')}` };
  } catch { return null; }
}

function supportedAmount(amount, currency) {
  if (!SUPPORTED_CURRENCIES.has(currency) || typeof amount !== 'string' || !/^\d{1,10}(?:\.\d{1,4})?$/.test(amount)) return null;
  const value = Number(amount);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function billingRecord({ source, externalId, dateTime, conversionAtUtc, receivedAtUtc, dateBasis, product, currency, amount, notes }) {
  const parts = timestampPartsInTimeZone(dateTime, source === 'gurumedia_postback' ? 'America/Sao_Paulo' : 'UTC');
  if (!parts) return null;
  return {
    sale_id: `external:${externalId}`,
    sale_date: parts.date,
    sale_time: parts.time,
    platform: source === 'gurumedia_postback' ? 'GuruMedia' : 'ClickBank',
    product: product || (source === 'gurumedia_postback' ? 'Produto GuruMedia não identificado' : 'Venda ClickBank sem Track'),
    commission_type: 'Comissão de afiliado',
    account: '',
    value_brl: currency === 'BRL' ? amount : null,
    value_usd: currency === 'USD' ? amount : null,
    payment_status: 'pending',
    observed_payment_status: 'pending',
    confirmation_status: null,
    conversion_count: 1,
    notes,
    source,
    source_ref: externalId,
    external_id: externalId,
    source_conversion_at_utc: conversionAtUtc,
    source_received_at_utc: receivedAtUtc,
    source_date_basis: dateBasis,
    source_overrides: [],
    active: true,
  };
}

async function persistMappedSales(records) {
  const totals = { inserted: 0, updated: 0, unchanged: 0, conflicts: 0 };
  for (let offset = 0; offset < records.length; offset += 500) {
    const result = await upsertExternalSalesToBilling(records.slice(offset, offset + 500));
    for (const key of Object.keys(totals)) totals[key] += result[key] || 0;
    if (result.inserted || result.updated) publishAutomaticBillingUpdate();
  }
  return totals;
}

function finishResult(totals, skipped) {
  return Object.freeze({
    ...totals,
    ...skipped,
    imported: totals.inserted + totals.updated,
    skipped: skipped.missingTime + skipped.missingCommission + skipped.unsupportedCurrency + totals.conflicts,
    mccReconciliationPending: totals.inserted + totals.updated > 0,
  });
}

export async function syncClickBankSalesToBilling(sales, domains = []) {
  if (!Array.isArray(sales)) throw new Error('A leitura ClickBank não contém uma lista de vendas válida.');
  const records = [];
  const skipped = { missingTime: 0, missingCommission: 0, unsupportedCurrency: 0, receivedTimeFallback: 0 };
  const domainByTrack = new Map((domains || []).map(row => [JSON.stringify([row.hostname, row.productKey]), row]));
  for (const sale of sales) {
    const actualTime = sale.transactionTimeUtc || null;
    const receivedTime = sale.receivedAtUtc || null;
    const billingTime = actualTime || receivedTime;
    const dateBasis = actualTime ? 'conversion_time' : receivedTime ? 'received_time_fallback' : null;
    if (!billingTime) { skipped.missingTime += 1; continue; }
    if (!actualTime) skipped.receivedTimeFallback += 1;
    if (sale.commissionTotal === null || sale.commissionTotal === undefined || sale.commissionCurrency === null || sale.commissionCurrency === undefined) {
      skipped.missingCommission += 1;
      continue;
    }
    if (!SUPPORTED_CURRENCIES.has(sale.commissionCurrency)) { skipped.unsupportedCurrency += 1; continue; }
    const amount = supportedAmount(sale.commissionTotal, sale.commissionCurrency);
    if (amount === null) { skipped.missingCommission += 1; continue; }
    const track = sale.presellHost && sale.productKey
      ? domainByTrack.get(JSON.stringify([sale.presellHost, sale.productKey])) : null;
    const product = track?.productLabel || sale.productKey || 'Venda ClickBank sem Track';
    const notes = sale.attributionStatus === 'matched' ? ''
      : sale.attributionStatus === 'ambiguous' ? 'Venda real ClickBank sem Track única; atribuição ambígua.'
        : 'Venda real ClickBank sem clique/Track correspondente.';
    const externalId = `clickbank_ins_v8:${sale.transactionId}`;
    const record = billingRecord({
      source: 'clickbank_ins_v8', externalId, dateTime: billingTime,
      conversionAtUtc: actualTime, receivedAtUtc: receivedTime, dateBasis,
      product, currency: sale.commissionCurrency, amount, notes,
    });
    if (record) records.push(record); else skipped.missingTime += 1;
  }
  const totals = await persistMappedSales(records);
  return finishResult(totals, skipped);
}

export async function syncGuruMediaSalesToBilling(token, { nowFn = () => new Date(), scope = 'full' } = {}) {
  if (!['full', 'incremental'].includes(scope)) throw new Error('O escopo da sincronização GuruMedia é inválido.');
  const now = nowFn();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('O horário UTC para a carga GuruMedia é inválido.');
  const endDate = now.toISOString().slice(0, 10);
  const earliestStartDate = shiftUtcDate(endDate, -365);
  let startDate = earliestStartDate;
  if (scope === 'incremental') {
    const checkpoint = await readBillingMetaRecord(GURUMEDIA_BILLING_SYNC_CURSOR_KEY);
    const checkpointAt = checkpoint?.last_successful_sync_at_utc;
    if (validUtcCheckpoint(checkpointAt) && checkpointAt.slice(0, 10) <= endDate) {
      const overlapStartDate = shiftUtcDate(checkpointAt.slice(0, 10), -GURUMEDIA_BILLING_SYNC_OVERLAP_DAYS);
      if (overlapStartDate && overlapStartDate > earliestStartDate) startDate = overlapStartDate;
    }
  }
  const range = { startDate, endDate };
  const totals = { inserted: 0, updated: 0, unchanged: 0, conflicts: 0 };
  const skipped = { missingTime: 0, missingCommission: 0, unsupportedCurrency: 0, receivedTimeFallback: 0 };
  const seenKeys = new Set();
  let afterSaleKey = null;
  let count = 0;
  let pages = 0;
  let hasMore = true;
  while (hasMore) {
    pages += 1;
    if (pages > Math.ceil(MAX_BILLING_SALES_SYNC / GURUMEDIA_PAGE_SIZE) + 1) throw new Error('A carga histórica GuruMedia excedeu o limite de 50.000 vendas; nenhuma nova consulta será iniciada.');
    const page = await fetchGuruMediaBillingSalesPage(token, range, { pageSize: GURUMEDIA_PAGE_SIZE, afterSaleKey });
    const records = [];
    for (const sale of page.sales) {
      if (seenKeys.has(sale.saleKey)) throw new Error('A consulta GuruMedia repetiu uma venda entre páginas; interrompi a carga para evitar duplicidade.');
      seenKeys.add(sale.saleKey);
      count += 1;
      if (count > MAX_BILLING_SALES_SYNC) throw new Error('A carga histórica GuruMedia ultrapassou 50.000 vendas; interrompi para revisão.');
      if (!SUPPORTED_CURRENCIES.has(sale.currency)) { skipped.unsupportedCurrency += 1; continue; }
      const amount = supportedAmount(sale.payoutAmount, sale.currency);
      if (amount === null) { skipped.missingCommission += 1; continue; }
      if (!sale.conversionAtUtc) skipped.receivedTimeFallback += 1;
      const externalId = `gurumedia_postback:${sale.saleKey}`;
      const notes = sale.conversionAtUtc ? '' : 'Horário real da conversão ausente; data baseada no recebimento do postback.';
      const record = billingRecord({
        source: 'gurumedia_postback', externalId, dateTime: sale.billingAtUtc,
        conversionAtUtc: sale.conversionAtUtc, receivedAtUtc: sale.receivedAtUtc,
        dateBasis: sale.billingDateSource,
        product: sale.productLabel || sale.offerName || sale.productKey || sale.presellHost,
        currency: sale.currency, amount, notes,
      });
      if (record) records.push(record); else skipped.missingTime += 1;
    }
    const pageTotals = await persistMappedSales(records);
    for (const key of Object.keys(totals)) totals[key] += pageTotals[key] || 0;
    hasMore = page.hasMore;
    if (hasMore) {
      if (!page.nextCursor || page.nextCursor === afterSaleKey) throw new Error('A paginação GuruMedia não avançou; parei para evitar repetir vendas.');
      afterSaleKey = page.nextCursor;
    }
  }
  await writeBillingMetaRecord({
    key: GURUMEDIA_BILLING_SYNC_CURSOR_KEY,
    source: 'gurumedia_postback',
    last_successful_sync_at_utc: now.toISOString(),
    last_successful_range_start_utc: `${range.startDate}T00:00:00.000Z`,
    last_successful_range_end_utc: `${range.endDate}T23:59:59.999Z`,
  });
  return finishResult(totals, skipped);
}
