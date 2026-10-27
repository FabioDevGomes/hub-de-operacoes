import { requestGoogleAdsEndpoint } from './google-ads-http-client.mjs?v=1';

export const GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT = 'https://track.travenzo.shop/google-ads-campaign-action.php';

const actionErrorMessages = Object.freeze({
  campaign_writes_disabled: 'A escrita de campanhas está bloqueada no servidor. Nenhuma campanha foi alterada.',
  campaign_account_not_allowed: 'Esta conta cliente não está ativa e vinculada à MCC autorizada para ações de campanha.',
  campaign_not_found: 'A campanha não foi encontrada nessa conta. Atualize a consulta e confira a seleção.',
  campaign_status_changed: 'O status da campanha mudou desde a consulta. Atualize a consulta antes de tentar novamente.',
  campaign_status_unverified: 'A solicitação pode ter sido enviada, mas o servidor não conseguiu confirmar o novo status. Consulte a campanha no Google Ads antes de repetir.',
});

function actionRequest(operation, parameters, options) {
  return requestGoogleAdsEndpoint(GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT, operation, parameters, { ...options, errorMessages: actionErrorMessages });
}

export async function fetchGoogleAdsCampaignActionCapabilities({ managerCustomerId, customerId }, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer)) throw new Error('Selecione uma MCC e conta Google Ads válidas para conferir as ações disponíveis.');
  let payload;
  try {
    payload = await actionRequest('capabilities', { manager_customer_id: manager, customer_id: customer }, options);
  } catch (error) {
    if (error?.code === 'api_unavailable' || error?.code === 'private_service_unavailable') {
      throw new Error('O serviço de ações de campanha ainda não foi publicado no servidor.');
    }
    throw error;
  }
  if (payload?.schema_version !== 1 || typeof payload.campaign_actions_enabled !== 'boolean'
      || !Array.isArray(payload.allowed_operations)) {
    throw new Error('O servidor retornou um estado de ações de campanha inválido.');
  }
  const allowedOperations = payload.allowed_operations.filter(operation => ['pause_campaign', 'enable_campaign'].includes(operation));
  return {
    enabled: payload.campaign_actions_enabled && allowedOperations.length > 0,
    allowedOperations: payload.campaign_actions_enabled ? allowedOperations : [],
  };
}

export async function changeGoogleAdsCampaignStatus({ managerCustomerId, customerId, campaignId, operation }, options) {
  const transitions = {
    pause_campaign: { expectedStatus: 'ENABLED', targetStatus: 'PAUSED', actionName: 'pausa' },
    enable_campaign: { expectedStatus: 'PAUSED', targetStatus: 'ENABLED', actionName: 'ativação' },
  };
  const transition = transitions[operation];
  const manager = managerCustomerId == null ? null : String(managerCustomerId).replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaign = String(campaignId ?? '');
  if ((manager !== null && !/^\d{10}$/.test(manager)) || !/^\d{10}$/.test(customer)
      || !/^[1-9]\d{0,19}$/.test(campaign) || !transition) {
    throw new Error('A conta, MCC, campanha ou ação selecionada não é válida para mudar o status.');
  }
  const payload = await actionRequest(operation, {
    manager_customer_id: manager,
    customer_id: customer,
    campaign_id: campaign,
    expected_status: transition.expectedStatus,
    confirm: true,
  }, options);
  if (payload?.schema_version !== 1 || payload.operation !== operation
      || String(payload.campaign_id) !== campaign || payload.status !== transition.targetStatus || payload.verified !== true) {
    throw new Error(`A resposta não confirmou a ${transition.actionName} da campanha. Atualize o status antes de repetir.`);
  }
  return {
    campaignId: campaign,
    campaignName: typeof payload.campaign_name === 'string' ? payload.campaign_name : '',
    changed: payload.changed === true,
    status: transition.targetStatus,
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
  };
}
