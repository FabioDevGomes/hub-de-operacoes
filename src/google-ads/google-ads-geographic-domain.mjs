const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOMER_PATTERN = /^\d{10}$/;
const CAMPAIGN_PATTERN = /^[1-9]\d{0,19}$/;

function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function finiteCount(value, { minimum = 0 } = {}) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
}

export function normalizeGoogleAdsGeographicReport(payload, { managerCustomerId = null, customerId, dateFrom, dateTo } = {}) {
  const manager = managerCustomerId == null || managerCustomerId === '' ? null : String(managerCustomerId).replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  if (!CUSTOMER_PATTERN.test(customer) || (manager != null && !CUSTOMER_PATTERN.test(manager))
      || !validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo
      || payload?.ok !== true || payload?.schema_version !== 1 || payload?.query_complete !== true
      || String(payload.customer_id ?? '') !== customer
      || (payload.manager_customer_id == null ? null : String(payload.manager_customer_id)) !== manager
      || payload.date_from !== dateFrom || payload.date_to !== dateTo
      || !Array.isArray(payload.rows)) {
    throw new Error('A resposta geográfica não confirmou conta, período e consulta completos. Nenhum resultado foi salvo.');
  }

  const rows = [];
  const seen = new Set();
  for (const item of payload.rows) {
    const date = item?.date;
    const campaignId = String(item?.campaign_id ?? '');
    const countryCriterionId = String(item?.country_criterion_id ?? '');
    const countryCode = String(item?.country_code ?? '').trim().toUpperCase();
    const campaignName = String(item?.campaign_name ?? '').trim();
    const countryName = String(item?.country_name ?? '').trim();
    const clicks = finiteCount(item?.clicks, { minimum: 1 });
    const impressions = finiteCount(item?.impressions);
    const costMicros = finiteCount(item?.cost_micros);
    if (!validDate(date) || date < dateFrom || date > dateTo || !CAMPAIGN_PATTERN.test(campaignId)
        || !/^\d{1,20}$/.test(countryCriterionId) || !/^[A-Z]{2}$/.test(countryCode)
        || !campaignName || !countryName || clicks == null || impressions == null || costMicros == null) {
      throw new Error('Uma linha geográfica está incompleta ou inválida. Nenhum resultado foi salvo.');
    }
    const key = `${date}|${campaignId}|${countryCriterionId}`;
    if (seen.has(key)) throw new Error('A resposta geográfica repetiu uma campanha e país. Nenhum resultado foi salvo.');
    seen.add(key);
    rows.push({ date, campaignId, campaignName, countryCriterionId, countryCode, countryName, clicks, impressions, costMicros });
  }
  const generatedAtUtc = Date.parse(payload.generated_at_utc || '') ? new Date(payload.generated_at_utc).toISOString() : null;
  if (!generatedAtUtc) throw new Error('A resposta geográfica não informou um horário válido. Nenhum resultado foi salvo.');
  return { schemaVersion: 1, managerCustomerId: manager, customerId: customer, dateFrom, dateTo, generatedAtUtc, queryComplete: true, rows };
}

export function googleAdsGeographicReportDateRange(now, timeZone, windowDays = 14) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = `${value.year}-${value.month}-${value.day}`;
  const toDate = new Date(`${today}T00:00:00.000Z`);
  toDate.setUTCDate(toDate.getUTCDate() - 1);
  const dateTo = toDate.toISOString().slice(0, 10);
  const fromDate = new Date(`${dateTo}T00:00:00.000Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - Math.max(1, Math.trunc(Number(windowDays) || 14)) + 1);
  return { dateFrom: fromDate.toISOString().slice(0, 10), dateTo };
}

