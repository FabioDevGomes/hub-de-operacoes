import { fetchGoogleAdsSearchTerms } from './google-ads-service.mjs?v=10';
import { normalizeGoogleAdsSearchTerms, validateGoogleAdsSearchTermsDateRange } from './google-ads-search-terms-domain.mjs?v=4';

export async function queryGoogleAdsSearchTerms({ accounts, managers = [], dateFrom, dateTo, campaignId = null, onProgress = () => {} } = {}) {
  const range = validateGoogleAdsSearchTermsDateRange(dateFrom, dateTo);
  if (!range.valid) {
    throw new Error(range.reason === 'search_terms_date_range_too_large'
      ? 'A consulta de termos de pesquisa permite no máximo 31 dias. Reduza o período selecionado.'
      : 'Confira as datas: o início deve ser anterior ou igual ao fim.');
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('Selecione pelo menos uma conta Google Ads.');
  }

  const managerNames = new Map((Array.isArray(managers) ? managers : [])
    .map(manager => [manager.customerId == null ? 'direct' : String(manager.customerId), manager.name]));
  const reports = [];
  const failures = [];

  for (const [index, account] of accounts.entries()) {
    onProgress({ phase: 'started', account, index, total: accounts.length });
    try {
      const payload = await fetchGoogleAdsSearchTerms({
        managerCustomerId: account.managerCustomerId,
        customerId: account.customerId,
        dateFrom,
        dateTo,
        campaignId,
      });
      const report = {
        ...normalizeGoogleAdsSearchTerms(payload, {
        managerCustomerId: account.managerCustomerId,
        managerName: managerNames.get(account.managerCustomerId == null ? 'direct' : String(account.managerCustomerId)) || account.managerName,
        customerId: account.customerId,
        accountName: account.name,
        currencyCode: account.currencyCode,
        dateFrom,
        dateTo,
        campaignId,
        }),
        queryCompletedAtUtc: new Date().toISOString(),
      };
      reports.push(report);
      onProgress({ phase: 'completed', account, index, total: accounts.length, ok: true, report });
    } catch (error) {
      const failure = { accountName: account.name, message: error?.message || 'Falha ao consultar termos desta conta.' };
      failures.push(failure);
      onProgress({ phase: 'completed', account, index, total: accounts.length, ok: false, failure });
    }
  }

  return { reports, failures, totalAccounts: accounts.length };
}
