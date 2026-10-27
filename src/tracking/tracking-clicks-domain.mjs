export const TRACKING_CLICKS_MAX_DAYS = 366;
export const TRACKING_CLICKS_MAX_ROWS = 5000;

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatTrackingDatePtBr(value) {
  if (!isDate(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function parseTrackingDatePtBr(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  return isDate(isoDate) ? isoDate : null;
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function dateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function trackingClicksDefaultDateRange(now = new Date(), timeZone = browserTimeZone()) {
  const end = dateInTimeZone(now, timeZone);
  return { startDate: end, endDate: end };
}

export function trackingClicksDateRangeForPreset(preset, now = new Date(), timeZone = browserTimeZone()) {
  const [year, month, day] = dateInTimeZone(now, timeZone).split('-').map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  const start = new Date(today);
  let end = today;

  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      start.setUTCDate(start.getUTCDate() - 1);
      end = new Date(start);
      break;
    case '7-days':
      start.setUTCDate(start.getUTCDate() - 6);
      break;
    case '30-days':
      start.setUTCDate(start.getUTCDate() - 29);
      break;
    case 'this-month':
      start.setUTCDate(1);
      break;
    case 'last-month':
      start.setUTCDate(1);
      start.setUTCMonth(start.getUTCMonth() - 1);
      end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      break;
    case 'total':
      start.setUTCDate(start.getUTCDate() - (TRACKING_CLICKS_MAX_DAYS - 1));
      break;
    default:
      throw new Error('Selecione um período rápido válido.');
  }

  return validateTrackingClicksDateRange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
}

export function validateTrackingClicksDateRange(startDate, endDate) {
  if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) {
    throw new Error('Informe um intervalo de datas UTC válido.');
  }
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000 + 1;
  if (days > TRACKING_CLICKS_MAX_DAYS) throw new Error('O período máximo por consulta é de 366 dias.');
  return { startDate, endDate };
}

function optionalSafeText(value, pattern, label) {
  if (value === null) return null;
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`O relatório retornou ${label} inválido.`);
  return value;
}

export function normalizeTrackingClicksReport(payload, requestedRange = null, requestedPlatform = null) {
  if (!payload || payload.ok !== true || payload.schema_version !== 2 || !Array.isArray(payload.rows)) {
    throw new Error('O servidor retornou um relatório de cliques ilegível.');
  }
  const platform = payload.platform;
  if (!['clickbank', 'gurumedia', 'unsegmented'].includes(platform)
      || (requestedPlatform && platform !== requestedPlatform)) {
    throw new Error('O servidor retornou métricas de outra plataforma ou sem classificação. Atualize os arquivos do servidor.');
  }
  const allowedReportFields = ['ok', 'schema_version', 'platform', 'generated_at_utc', 'start_date', 'end_date', 'count_semantics', 'rows'];
  if (Object.keys(payload).some(key => !allowedReportFields.includes(key))) throw new Error('O relatório contém campos não permitidos.');
  const startDate = payload.start_date;
  const endDate = payload.end_date;
  validateTrackingClicksDateRange(startDate, endDate);
  if (requestedRange && (startDate !== requestedRange.startDate || endDate !== requestedRange.endDate)) {
    throw new Error('O servidor retornou um período diferente do solicitado.');
  }
  if (payload.count_semantics !== 'events_not_unique_visitors') throw new Error('O relatório não informou como os cliques são contados.');
  if (payload.rows.length > TRACKING_CLICKS_MAX_ROWS) throw new Error('O relatório excedeu o limite de linhas.');
  if (typeof payload.generated_at_utc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload.generated_at_utc)) {
    throw new Error('O relatório retornou um horário de geração inválido.');
  }
  const seen = new Set();
  const rows = payload.rows.map(row => {
    const allowedRowFields = ['date_utc', 'product_key', 'product_label', 'presell_host', 'page_views', 'outbound_clicks'];
    if (!row || Object.keys(row).some(key => !allowedRowFields.includes(key))) throw new Error('O relatório contém campos não permitidos.');
    if (!isDate(row.date_utc) || row.date_utc < startDate || row.date_utc > endDate) {
      throw new Error('O relatório contém uma data fora do período solicitado.');
    }
    const productKey = optionalSafeText(row.product_key, /^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/, 'identificador de produto');
    const productLabel = optionalSafeText(row.product_label, /^[^\x00-\x1f\x7f]{1,253}$/, 'nome de Track');
    const presellHost = optionalSafeText(row.presell_host, /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'domínio');
    const pageViews = row.page_views;
    const outboundClicks = row.outbound_clicks;
    if (!Number.isSafeInteger(pageViews) || pageViews < 0 || !Number.isSafeInteger(outboundClicks) || outboundClicks < 0
        || pageViews + outboundClicks < 1) {
      throw new Error('O relatório contém contagens inválidas.');
    }
    const identity = `${row.date_utc}\0${productKey ?? ''}\0${presellHost ?? ''}`;
    if (seen.has(identity)) throw new Error('O relatório contém uma linha agregada duplicada.');
    seen.add(identity);
    return { dateUtc: row.date_utc, productKey, productLabel, presellHost, pageViews, outboundClicks };
  });
  return { startDate, endDate, platform, generatedAtUtc: payload.generated_at_utc, rows };
}

export function summarizeTrackingClicks(rows) {
  return rows.reduce((summary, row) => ({
    pageViews: summary.pageViews + row.pageViews,
    outboundClicks: summary.outboundClicks + row.outboundClicks,
  }), { pageViews: 0, outboundClicks: 0 });
}

export function trackingClicksRate(outboundClicks, pageViews) {
  return pageViews > 0 ? (outboundClicks / pageViews) * 100 : null;
}

function isUtcTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

export function normalizeTrackingClicksSnapshot(value) {
  if (!value || !Number.isSafeInteger(value.id) || value.id < 1 || !isUtcTimestamp(value.savedAtUtc)) {
    throw new Error('O cache local contém uma consulta inválida.');
  }
  const startDate = value.startDate;
  const endDate = value.endDate;
  const report = normalizeTrackingClicksReport({
    ok: true,
    schema_version: 2,
    platform: value.platform ?? 'unsegmented',
    generated_at_utc: value.generatedAtUtc,
    start_date: startDate,
    end_date: endDate,
    count_semantics: 'events_not_unique_visitors',
    rows: Array.isArray(value.rows) ? value.rows.map(row => ({
      date_utc: row?.dateUtc,
      product_key: row?.productKey ?? null,
      product_label: row?.productLabel ?? null,
      presell_host: row?.presellHost ?? null,
      page_views: row?.pageViews,
      outbound_clicks: row?.outboundClicks,
    })) : value.rows,
  }, { startDate, endDate });
  return {
    id: value.id,
    savedAtUtc: value.savedAtUtc,
    ...report,
  };
}

function compareSnapshotRecency(left, right) {
  return left.id - right.id;
}

function compareTrackingRows(left, right) {
  if (left.dateUtc !== right.dateUtc) return left.dateUtc < right.dateUtc ? 1 : -1;
  const productOrder = String(left.productKey ?? '').localeCompare(String(right.productKey ?? ''));
  if (productOrder) return productOrder;
  return String(left.presellHost ?? '').localeCompare(String(right.presellHost ?? ''));
}

export function resolveTrackingClicksCache(snapshots, dateRange, platform = 'clickbank') {
  const range = validateTrackingClicksDateRange(dateRange?.startDate, dateRange?.endDate);
  if (!['clickbank', 'gurumedia'].includes(platform)) throw new Error('Selecione uma plataforma de cache válida.');
  if (!Array.isArray(snapshots)) throw new Error('O histórico local de consultas está inválido.');
  const totalDays = (Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86400000 + 1;
  const latestByDay = new Map();
  let invalidSnapshotCount = 0;
  let unsegmentedSnapshotCount = 0;

  for (const rawSnapshot of snapshots) {
    let snapshot;
    try {
      snapshot = normalizeTrackingClicksSnapshot(rawSnapshot);
    } catch {
      invalidSnapshotCount += 1;
      continue;
    }
    if (snapshot.platform === 'unsegmented') {
      unsegmentedSnapshotCount += 1;
      continue;
    }
    if (snapshot.platform !== platform) continue;
    const firstDay = snapshot.startDate > range.startDate ? snapshot.startDate : range.startDate;
    const lastDay = snapshot.endDate < range.endDate ? snapshot.endDate : range.endDate;
    if (firstDay > lastDay) continue;
    const cursor = new Date(`${firstDay}T00:00:00.000Z`);
    const last = new Date(`${lastDay}T00:00:00.000Z`);
    while (cursor <= last) {
      const dateUtc = cursor.toISOString().slice(0, 10);
      const existing = latestByDay.get(dateUtc);
      if (!existing || compareSnapshotRecency(existing, snapshot) < 0) latestByDay.set(dateUtc, snapshot);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const snapshotsUsed = [...new Map([...latestByDay.values()].map(snapshot => [snapshot.id, snapshot])).values()]
    .sort(compareSnapshotRecency);
  const rows = [];
  for (const [dateUtc, snapshot] of latestByDay) {
    rows.push(...snapshot.rows.filter(row => row.dateUtc === dateUtc));
  }
  rows.sort(compareTrackingRows);
  const latestSnapshot = snapshotsUsed.at(-1) || null;
  const cacheUpdatedAtUtc = latestSnapshot?.savedAtUtc || null;

  return {
    report: latestSnapshot ? {
      startDate: range.startDate,
      endDate: range.endDate,
      generatedAtUtc: latestSnapshot.generatedAtUtc,
      rows,
    } : null,
    meta: {
      cacheUpdatedAtUtc,
      coveredDays: latestByDay.size,
      totalDays,
      snapshotCount: snapshotsUsed.length,
      invalidSnapshotCount,
      unsegmentedSnapshotCount,
    },
  };
}
