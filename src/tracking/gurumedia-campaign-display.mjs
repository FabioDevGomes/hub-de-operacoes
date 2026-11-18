function normalizeCampaignName(value) {
  return String(value ?? '').trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
}

function validTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return value;
  } catch {
    return '';
  }
}

function campaignDate(timestamp, timeZone) {
  if (!timeZone || typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

function currencyTimeZoneIndex(directory) {
  const accounts = Array.isArray(directory?.accounts) ? directory.accounts : [];
  return new Map(accounts.map(account => [String(account?.customerId || '').replace(/\D/g, ''), validTimeZone(account?.timeZone)]));
}

function amountNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function currencyLabel(currency, amount) {
  const value = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount);
  return `${currency} ${value}`;
}

export function formatGuruMediaPayouts(sales = []) {
  const totals = new Map();
  for (const sale of Array.isArray(sales) ? sales : []) {
    const currency = String(sale?.currency || '').toUpperCase();
    const amount = amountNumber(sale?.payoutAmount);
    if (!/^[A-Z]{3}$/.test(currency) || amount === null) continue;
    totals.set(currency, (totals.get(currency) || 0) + amount);
  }
  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => currencyLabel(currency, amount)).join(' · ') || '—';
}

export function formatGuruMediaTimestamp(timestamp, timeZone = '') {
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) return 'Horário não registrado';
  const zone = validTimeZone(timeZone);
  const label = zone || 'UTC';
  try {
    const formatted = new Intl.DateTimeFormat('pt-BR', {
      timeZone: label, dateStyle: 'short', timeStyle: 'medium',
    }).format(new Date(timestamp));
    return zone ? `${formatted} (${zone})` : `${formatted} (UTC; fuso da conta indisponível)`;
  } catch {
    return `${timestamp} (UTC)`;
  }
}

export function buildGuruMediaCampaignDisplay({ report, savedAtUtc = '', campaignActions, accountDirectory, firstSaleSales = [] } = {}) {
  if (!report || typeof report !== 'object') return null;
  const candidatesByIdentity = new Map();
  for (const [internalId, action] of campaignActions instanceof Map ? campaignActions : []) {
    const campaignId = String(action?.campaignId || '');
    const campaignName = normalizeCampaignName(action?.campaignName);
    if (!/^[1-9]\d{0,19}$/.test(campaignId) || !campaignName) continue;
    const key = `${campaignId}\u0000${campaignName}`;
    const candidates = candidatesByIdentity.get(key) || [];
    candidates.push({
      internalCampaignId: String(internalId),
      customerId: String(action?.customerId || '').replace(/\D/g, ''),
    });
    candidatesByIdentity.set(key, candidates);
  }

  const timeZonesByCustomer = currencyTimeZoneIndex(accountDirectory);
  const byCampaignId = new Map();
  const firstSaleByCampaignId = new Map();
  let unmatchedLocalCampaignCount = 0;
  const projectSale = (sale, target, { countUnmatched = false } = {}) => {
    const attribution = sale?.campaignAttribution;
    if (attribution?.status !== 'matched') return;
    const key = `${String(attribution.campaignId || '')}\u0000${normalizeCampaignName(attribution.campaignName)}`;
    const candidates = candidatesByIdentity.get(key) || [];
    if (candidates.length !== 1) {
      if (countUnmatched) unmatchedLocalCampaignCount++;
      return;
    }
    const candidate = candidates[0];
    const timeZone = timeZonesByCustomer.get(candidate.customerId) || '';
    const conversionAtUtc = typeof sale.conversionAtUtc === 'string' ? sale.conversionAtUtc : null;
    const receivedAtUtc = typeof sale.receivedAtUtc === 'string' ? sale.receivedAtUtc : null;
    const entry = {
      saleKey: String(sale.saleKey || '').toLowerCase(),
      campaignId: attribution.campaignId,
      campaignName: attribution.campaignName,
      internalCampaignId: candidate.internalCampaignId,
      customerId: candidate.customerId,
      timeZone,
      campaignDate: campaignDate(conversionAtUtc, timeZone) || (conversionAtUtc ? conversionAtUtc.slice(0, 10) : null),
      campaignDateDisplay: (() => { const date = campaignDate(conversionAtUtc, timeZone) || (conversionAtUtc ? conversionAtUtc.slice(0, 10) : ''); return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : '—'; })(),
      timeZoneLabel: timeZone || 'UTC (fuso da conta indisponível)',
      conversionAtUtc,
      receivedAtUtc,
      conversionAtDisplay: formatGuruMediaTimestamp(conversionAtUtc, timeZone),
      receivedAtDisplay: formatGuruMediaTimestamp(receivedAtUtc, 'UTC'),
      productKey: sale.productKey || null,
      productLabel: sale.productLabel || '',
      presellHost: sale.presellHost || '',
      offerName: sale.offerName || '',
      currency: sale.currency || '',
      payoutAmount: sale.payoutAmount || '0',
    };
    entry.payoutDisplay = formatGuruMediaPayouts([entry]);
    const current = target.get(candidate.internalCampaignId) || { sales: [], byDate: new Map() };
    current.sales.push(entry);
    if (entry.campaignDate) {
      const daily = current.byDate.get(entry.campaignDate) || [];
      daily.push(entry);
      current.byDate.set(entry.campaignDate, daily);
    }
    target.set(candidate.internalCampaignId, current);
  };
  const visibleSales = Array.isArray(report.saleDetails) ? report.saleDetails : [];
  for (const sale of visibleSales) {
    projectSale(sale, byCampaignId, { countUnmatched: true });
    projectSale(sale, firstSaleByCampaignId);
  }
  const firstSaleKeys = new Set(visibleSales.map(sale => String(sale?.saleKey || '').toLowerCase()).filter(Boolean));
  for (const sale of Array.isArray(firstSaleSales) ? firstSaleSales : []) {
    const saleKey = String(sale?.saleKey || '').toLowerCase();
    if (saleKey && firstSaleKeys.has(saleKey)) continue;
    projectSale(sale, firstSaleByCampaignId);
  }
  for (const current of byCampaignId.values()) current.sales.sort((left, right) => String(right.conversionAtUtc || right.receivedAtUtc).localeCompare(String(left.conversionAtUtc || left.receivedAtUtc)));
  for (const current of firstSaleByCampaignId.values()) current.sales.sort((left, right) => String(right.conversionAtUtc || right.receivedAtUtc).localeCompare(String(left.conversionAtUtc || left.receivedAtUtc)));
  return {
    available: true,
    startDate: String(report.startDate || ''),
    endDate: String(report.endDate || ''),
    generatedAtUtc: String(report.generatedAtUtc || ''),
    savedAtUtc: String(savedAtUtc || ''),
    saleDetailsTruncated: report.saleDetailsTruncated === true,
    unattributedSales: (Array.isArray(report.saleDetails) ? report.saleDetails : []).filter(sale => sale?.campaignAttribution?.status !== 'matched').length,
    matchedSales: [...byCampaignId.values()].reduce((sum, item) => sum + item.sales.length, 0),
    unmatchedLocalCampaignCount,
    byCampaignId,
    firstSaleByCampaignId,
  };
}
