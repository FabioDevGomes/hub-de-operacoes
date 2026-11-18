function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
}

function salesForCampaign(projection, campaignId) {
  return projection?.byCampaignId?.get(String(campaignId || ''))?.sales || [];
}

function guruMediaSalesCount(projection, campaignId, { mode = 'consolidated', dates = {} } = {}) {
  const sales = salesForCampaign(projection, campaignId);
  if (mode === 'd0' || mode === 'd1') {
    const targetDate = validDate(dates[mode]);
    return targetDate ? sales.filter(sale => validDate(sale?.campaignDate) === targetDate).length : 0;
  }
  return sales.length;
}

function addGuruMediaConversionsToOverviewRow(row, count) {
  const additions = Math.max(0, Math.floor(Number(count) || 0));
  if (!additions) return row;
  const totals = { ...(row?.totals || {}) };
  const current = Number(totals.conversions);
  totals.conversions = (Number.isFinite(current) ? current : 0) + additions;
  return { ...row, totals };
}

function saleTimeInTimeZone(timestamp, timeZone) {
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(new Date(timestamp));
  } catch {
    return timestamp.slice(11, 19);
  }
}

function guruMediaFirstSaleRecords(projection) {
  const sales = [];
  for (const [campaignId, group] of projection?.firstSaleByCampaignId || projection?.byCampaignId || []) {
    for (const sale of group?.sales || []) {
      const saleDate = validDate(sale?.campaignDate);
      const saleKey = String(sale?.saleKey || '').trim().toLowerCase();
      if (!saleDate || !saleKey) continue;
      sales.push({
        sale_id: `gurumedia_click_view:${saleKey}`,
        campaign_id: String(campaignId),
        sale_date: saleDate,
        sale_time: saleTimeInTimeZone(sale?.conversionAtUtc, sale?.timeZone),
        created_at: String(sale?.conversionAtUtc || sale?.receivedAtUtc || ''),
        active: true,
        source: 'gurumedia_click_view',
      });
    }
  }
  return sales;
}

function rowDate(row) {
  const value = String(row?.date || row?.data || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const raw = row?.cells?.A?.value;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const epoch = Math.round((raw - 25569) * 86400000);
    if (Number.isFinite(epoch) && Math.abs(epoch) <= 8.64e15) return new Date(epoch).toISOString().slice(0, 10);
  }
  const text = String(row?.cells?.A?.text ?? raw ?? '').trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const local = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return local ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}` : '';
}

function payoutInBrl(sale, exchangeRate) {
  const amount = Number(sale?.payoutAmount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const currency = String(sale?.currency || '').toUpperCase();
  if (currency === 'BRL') return amount;
  if (currency === 'USD' && Number.isFinite(Number(exchangeRate)) && Number(exchangeRate) > 0) return amount * Number(exchangeRate);
  return null;
}

function summarizeGuruMediaSalesByCampaignDate(projection, exchangeRate) {
  const result = new Map();
  for (const [campaignId, group] of projection?.byCampaignId || []) {
    const byDate = new Map();
    for (const sale of group?.sales || []) {
      const date = validDate(sale?.campaignDate);
      if (!date) continue;
      const current = byDate.get(date) || { count: 0, payoutCount: 0, commissionBrl: null };
      current.count++;
      const payout = payoutInBrl(sale, exchangeRate);
      if (payout != null) {
        current.payoutCount++;
        current.commissionBrl = (current.commissionBrl || 0) + payout;
      }
      byDate.set(date, current);
    }
    if (byDate.size) {
      for (const current of byDate.values()) {
        if (current.commissionBrl != null) current.commissionBrl = Math.round((current.commissionBrl + Number.EPSILON) * 100) / 100;
      }
      result.set(String(campaignId), byDate);
    }
  }
  return result;
}

function projectGuruMediaSalesIntoDiary(rows, sales, { exchangeRate, getRowDate = rowDate } = {}) {
  const grouped = new Map();
  for (const sale of Array.isArray(sales) ? sales : []) {
    const date = validDate(sale?.campaignDate);
    if (!date) continue;
    const group = grouped.get(date) || { count: 0, commission: 0, hasCommission: false };
    group.count++;
    const payout = payoutInBrl(sale, exchangeRate);
    if (payout != null) {
      group.commission += payout;
      group.hasCommission = true;
    }
    grouped.set(date, group);
  }
  if (!grouped.size) return Array.isArray(rows) ? rows : [];

  const result = (Array.isArray(rows) ? rows : []).map(row => ({ ...row, cells: { ...(row?.cells || {}) } }));
  const rowByDate = new Map();
  result.forEach((row, index) => {
    const date = getRowDate(row);
    if (date && !rowByDate.has(date)) rowByDate.set(date, index);
  });
  for (const [date, addition] of grouped) {
    let index = rowByDate.get(date);
    if (index == null) {
      const [year, month, day] = date.split('-');
      index = result.length;
      result.push({ date, cells: { A: { value: date, text: `${day}/${month}/${year}` }, F: { value: 0 }, P: { value: 0 } } });
      rowByDate.set(date, index);
    }
    const row = result[index];
    const cells = { ...row.cells };
    const oldConversions = cells.F?.value;
    if (oldConversions == null || oldConversions === '' || Number.isFinite(Number(oldConversions))) {
      const value = oldConversions == null || oldConversions === '' ? 0 : Number(oldConversions);
      cells.F = { ...(cells.F || {}), value: value + addition.count };
    }
    if (addition.hasCommission) {
      const oldCommission = cells.P?.value;
      if (oldCommission == null || oldCommission === '' || Number.isFinite(Number(oldCommission))) {
        const value = oldCommission == null || oldCommission === '' ? 0 : Number(oldCommission);
        cells.P = { ...(cells.P || {}), value: Math.round((value + addition.commission + Number.EPSILON) * 100) / 100 };
      }
    }
    result[index] = { ...row, cells };
  }
  return result.sort((left, right) => String(getRowDate(left)).localeCompare(String(getRowDate(right))));
}

export {
  addGuruMediaConversionsToOverviewRow,
  guruMediaFirstSaleRecords,
  guruMediaSalesCount,
  payoutInBrl,
  projectGuruMediaSalesIntoDiary,
  summarizeGuruMediaSalesByCampaignDate,
  salesForCampaign,
};
