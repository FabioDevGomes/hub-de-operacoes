import { fetchGoogleAdsAccounts, fetchGoogleAdsDailyReport } from '../google-ads/google-ads-service.mjs?v=13';
import { normalizeGoogleAdsAccounts, normalizeGoogleAdsDailyReport } from '../google-ads/google-ads-domain.mjs?v=6';

const MAX_ACCOUNT_CONCURRENCY = 3;

function normalizedId(value) { return String(value ?? '').replace(/\D/g, ''); }
function validDate(value) {
  const date = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
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
function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function accountLabel(account) { return `${account.name} (${account.customerId})`; }

function rateForUsdAccount(account, date, captures, quote) {
  const previous = [...(captures || [])].reverse().find(capture =>
    String(capture?.date ?? '') === date
    && normalizedId(capture?.customerId) === account.customerId
    && String(capture?.currencyCode || '').toUpperCase() === 'USD'
    && finitePositive(capture?.exchangeRateUsdBrl));
  if (previous) return { rate: finitePositive(previous.exchangeRateUsdBrl), source: 'captura API existente' };
  const rate = finitePositive(quote?.rate);
  if (rate) return { rate, source: quote?.isStale ? 'cotação local disponível (desatualizada)' : 'cotação local disponível' };
  throw new Error(`Não há cotação USD/BRL disponível para converter o custo de ${accountLabel(account)}.`);
}

function validateReport(payload, account, date) {
  const report = normalizeGoogleAdsDailyReport({
    ...payload,
    currency_code: payload?.currency_code || account.currencyCode,
    time_zone: payload?.time_zone || account.timeZone,
  });
  if (!Array.isArray(payload?.rows) || payload.rows.length !== report.rows.length) {
    throw new Error('A API retornou linhas diárias inválidas; o lote completo foi descartado.');
  }
  if (report.customerId !== account.customerId
      || normalizedId(report.managerCustomerId) !== normalizedId(account.managerCustomerId)
      || report.currencyCode !== account.currencyCode
      || report.timeZone !== account.timeZone) {
    throw new Error('A resposta não corresponde à conta, MCC, moeda e fuso informados no diretório.');
  }
  if (report.dateFrom !== date || report.dateTo !== date || report.queryComplete !== true || report.campaignStatusFilter !== 'ALL') {
    throw new Error(`A API não confirmou uma consulta completa de todas as campanhas em ${date}.`);
  }
  if (report.rows.some(row => row.date !== date)) throw new Error('A API retornou uma linha fora do dia selecionado.');
  for (const row of report.rows) {
    if (![row.costMicros, row.clicks, row.conversions].every(value => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('A resposta diária contém métricas ausentes. O lote completo foi descartado.');
    }
  }
  return report;
}

export async function fetchMacroDateFromGoogleAds({ date, exchangeRateQuote, database, now = () => new Date() } = {}) {
  if (!validDate(date)) throw new Error('A data selecionada não é válida.');
  const accountsPayload = await fetchGoogleAdsAccounts();
  const { accounts } = normalizeGoogleAdsAccounts(accountsPayload);
  if (!accounts.length) throw new Error('O diretório Google Ads não contém contas de cliente conectadas.');
  const expectedAccounts = new Set((accountsPayload.accounts || [])
    .filter(item => item?.manager !== true && /^\d{10}$/.test(String(item?.customer_id ?? '')))
    .map(item => String(item.customer_id)));
  if (expectedAccounts.size !== accounts.length) throw new Error('O diretório possui contas incompletas ou inconsistentes; atualize a lista de MCCs antes de sincronizar.');
  for (const account of accounts) {
    if (!account.timeZone) throw new Error(`O diretório não informa o fuso de ${accountLabel(account)}.`);
    let localToday;
    try { localToday = dateInTimeZone(now(), account.timeZone); }
    catch { throw new Error(`O fuso horário de ${accountLabel(account)} é inválido.`); }
    if (date >= localToday) throw new Error(`O dia ${date} ainda não está fechado no fuso de ${accountLabel(account)}.`);
  }

  const reports = new Array(accounts.length);
  const failures = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < accounts.length) {
      const index = nextIndex++;
      const account = accounts[index];
      try {
        const payload = await fetchGoogleAdsDailyReport({
          managerCustomerId: account.managerCustomerId,
          customerId: account.customerId,
          dateFrom: date,
          dateTo: date,
        });
        reports[index] = validateReport(payload, account, date);
      } catch (error) {
        failures.push(`${accountLabel(account)}: ${error?.message || 'falha na consulta'}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_ACCOUNT_CONCURRENCY, accounts.length) }, () => worker()));
  if (failures.length) throw new Error(`${failures.length} conta(s) não foram consultadas; nada foi salvo. ${failures.slice(0, 3).join(' · ')}`);
  if (reports.some(report => !report)) throw new Error('A consulta não cobriu todas as contas conectadas; nada foi salvo.');

  const captures = database?.google_ads_api_daily_captures || [];
  let investment = 0;
  let clicks = 0;
  let sales = 0;
  let usdInvestment = 0;
  let usdInvestmentBrl = 0;
  const usdRateSources = new Set();
  const accountSummaries = reports.map((report, index) => {
    const account = accounts[index];
    const costMicros = report.rows.reduce((sum, row) => sum + row.costMicros, 0);
    const accountClicks = report.rows.reduce((sum, row) => sum + row.clicks, 0);
    const accountSales = report.rows.reduce((sum, row) => sum + row.conversions, 0);
    const nativeCost = costMicros / 1_000_000;
    let accountInvestment = nativeCost;
    let exchangeRateUsdBrl = null;
    let exchangeRateSource = null;
    if (account.currencyCode === 'USD' && nativeCost > 0) {
      const quote = rateForUsdAccount(account, date, captures, exchangeRateQuote);
      exchangeRateUsdBrl = quote.rate;
      exchangeRateSource = quote.source;
      accountInvestment *= exchangeRateUsdBrl;
      usdInvestment += nativeCost;
      usdInvestmentBrl += accountInvestment;
      usdRateSources.add(exchangeRateSource);
    } else if (!['BRL', 'USD'].includes(account.currencyCode)) {
      throw new Error(`A moeda ${account.currencyCode} de ${accountLabel(account)} não possui conversão configurada para o Controle Macro.`);
    }
    investment += accountInvestment;
    clicks += accountClicks;
    sales += accountSales;
    return {
      customerId: account.customerId,
      managerCustomerId: account.managerCustomerId,
      name: account.name,
      currencyCode: account.currencyCode,
      timeZone: account.timeZone,
      nativeInvestment: Number(nativeCost.toFixed(2)),
      investmentBrl: Number(accountInvestment.toFixed(2)),
      clicks: accountClicks,
      conversions: Number(accountSales.toFixed(4)),
      ...(exchangeRateUsdBrl ? { exchangeRateUsdBrl, exchangeRateSource } : {}),
    };
  });

  const syncedAt = now().toISOString();
  const sync = {
    id: `macro-api-${date}-${syncedAt.replace(/\D/g, '').slice(0, 17)}`,
    date,
    syncedAt,
    source: 'google_ads_api',
    investment: Number(investment.toFixed(2)),
    clicks,
    sales: Number(sales.toFixed(4)),
    accountCount: accounts.length,
    accounts: accountSummaries,
    ...(usdInvestment ? {
      usdInvestment: Number(usdInvestment.toFixed(2)),
      exchangeRateUsdBrl: usdInvestment ? Number((usdInvestmentBrl / usdInvestment).toFixed(6)) : null,
      exchangeRateSource: usdRateSources.size === 1 ? [...usdRateSources][0] : 'taxas por conta; consulte o detalhe de cada conta no backup',
    } : {}),
  };
  return sync;
}
