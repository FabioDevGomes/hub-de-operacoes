import { buildGoogleAdsPresellCampaignHandoff } from './google-ads-presell-campaign-handoff.mjs?v=4';
import { normalizeCampaignSequenceProduct } from './google-ads-campaign-sequence-domain.mjs?v=1';

// Only explicitly linked, published pages can authorize a destination.
export function resolveCpaExpansionTargets({ deliveryId, product, jobs, accounts, legacyJobIds = [] }) {
  if (!deliveryId || !product || !Array.isArray(jobs) || !Array.isArray(accounts)) throw new Error('Não foi possível conferir as páginas vinculadas à entrega.');
  const byAccount = new Map();
  const linkedLegacyIds = new Set(legacyJobIds);
  for (const job of jobs) {
    const linked = String(job?.campaignDeliveryId || '') === deliveryId || (!job?.campaignDeliveryId && linkedLegacyIds.has(job?.id));
    if (!linked || normalizeCampaignSequenceProduct(job.product) !== normalizeCampaignSequenceProduct(product)) continue;
    for (const target of Array.isArray(job.targets) ? job.targets : []) {
      const resolved = buildGoogleAdsPresellCampaignHandoff({ ...job, targets: [target] });
      if (!resolved.ok) continue;
      const page = resolved.payload.targets[0];
      if (!byAccount.has(page.accountId)) byAccount.set(page.accountId, new Set());
      byAccount.get(page.accountId).add(page.url);
    }
  }
  return [...byAccount].map(([accountId, urls]) => {
    const matches = accounts.filter(account => String(account.customerId || '').replace(/\D/g, '') === accountId);
    const account = matches.length === 1 ? matches[0] : null;
    return {
      accountId, account, managerCustomerId: String(account?.managerCustomerId || '').replace(/\D/g, ''),
      currencyCode: String(account?.currencyCode || '').toUpperCase(),
      finalUrl: urls.size === 1 ? [...urls][0] : '',
      reason: urls.size !== 1 ? 'Há mais de uma URL publicada para esta conta na entrega.' : !account ? 'Conta ausente ou ambígua no diretório local.' : '',
    };
  });
}
