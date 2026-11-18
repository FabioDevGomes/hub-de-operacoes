import { requestGoogleAdsEndpoint } from './google-ads-http-client.mjs?v=2';

export const GOOGLE_ADS_CAMPAIGN_URL_UPDATE_ENDPOINT = 'https://track.travenzo.shop/google-ads-campaign-action.php';

const errorMessages = Object.freeze({
  campaign_url_updates_disabled: 'A alteração de URLs está bloqueada no servidor. Nenhuma campanha foi alterada.',
  campaign_url_update_stale: 'As URLs ou recursos mudaram desde a prévia. Gere uma nova prévia antes de aplicar.',
  campaign_url_update_blocked: 'Há recursos fora do escopo seguro do lote. Confira os itens indicados antes de continuar.',
  campaign_url_update_unverified: 'A solicitação pode ter sido aplicada, mas o servidor não confirmou todos os destinos. Confira as campanhas no Google Ads antes de repetir.',
});

function request(operation, parameters, options) {
  return requestGoogleAdsEndpoint(GOOGLE_ADS_CAMPAIGN_URL_UPDATE_ENDPOINT, operation, parameters,
    { ...options, errorMessages });
}

function normalizedIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const ids = [...new Set(value.map(item => String(item ?? '')))];
  return ids.length === value.length && ids.every(id => /^[1-9]\d{0,19}$/.test(id)) ? ids : null;
}

function normalizedUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash) return '';
    return raw;
  } catch { return ''; }
}

function normalizedContext({ managerCustomerId, customerId, campaignIds, finalUrl }) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaigns = normalizedIds(campaignIds);
  const url = normalizedUrl(finalUrl);
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer) || !campaigns || !url) {
    throw new Error('Informe uma URL HTTPS válida e campanhas de uma única conta do lote.');
  }
  return { manager_customer_id: manager, customer_id: customer, campaign_ids: campaigns, final_url: url };
}

export async function previewGoogleAdsCampaignBatchUrlUpdate(input, options) {
  const context = normalizedContext(input || {});
  const payload = await request('campaign_url_update_preview', context, options);
  if (payload?.schema_version !== 1 || payload.operation !== 'campaign_url_update_preview'
      || payload.customer_id !== context.customer_id || !Array.isArray(payload.changes)
      || !Array.isArray(payload.blockers) || typeof payload.fingerprint !== 'string'
      || !payload.counts || typeof payload.counts !== 'object') {
    throw new Error('O servidor retornou uma prévia de URL inválida.');
  }
  return payload;
}

export async function applyGoogleAdsCampaignBatchUrlUpdate(input, options) {
  const context = normalizedContext(input || {});
  const fingerprint = String(input?.fingerprint || '');
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error('Gere novamente a prévia de URLs antes de aplicar.');
  const payload = await request('campaign_url_update_apply', {
    ...context,
    fingerprint,
    confirm: true,
  }, options);
  if (payload?.schema_version !== 1 || payload.operation !== 'campaign_url_update_apply'
      || payload.customer_id !== context.customer_id || payload.verified !== true
      || !payload.counts || typeof payload.counts !== 'object') {
    throw new Error(errorMessages.campaign_url_update_unverified);
  }
  return payload;
}
