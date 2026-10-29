import { requestGoogleAdsEndpoint } from './google-ads-http-client.mjs?v=2';

export const GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT = 'https://track.travenzo.shop/google-ads-campaign-action.php';

const actionErrorMessages = Object.freeze({
  campaign_writes_disabled: 'A escrita de campanhas está bloqueada no servidor. Nenhuma campanha foi alterada.',
  campaign_account_not_allowed: 'Esta conta cliente não está ativa e vinculada à MCC autorizada para ações de campanha.',
  campaign_not_found: 'A campanha não foi encontrada nessa conta. Atualize a consulta e confira a seleção.',
  campaign_status_changed: 'O status da campanha mudou desde a consulta. Atualize a consulta antes de tentar novamente.',
  campaign_status_unverified: 'A solicitação pode ter sido enviada, mas o servidor não conseguiu confirmar o novo status. Consulte a campanha no Google Ads antes de repetir.',
  campaign_sitelinks_campaign_unavailable: 'A campanha não está disponível para receber sitelinks nesta conta.',
  campaign_sitelinks_url_mismatch: 'A URL do sitelink não corresponde à URL final do anúncio desta campanha.',
  campaign_sitelinks_write_rejected: 'A gravação foi recusada ou o servidor não conseguiu confirmar todos os sitelinks. Confira a campanha no Google Ads antes de repetir.',
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

export async function changeGoogleAdsCampaignStatus({ managerCustomerId, customerId, campaignId, operation, notificationContext }, options) {
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
  if (notificationContext !== undefined
      && (notificationContext !== 'automatic_negative_remaining' || operation !== 'pause_campaign')) {
    throw new Error('O contexto de notificação não é válido para esta ação.');
  }
  const request = {
    manager_customer_id: manager,
    customer_id: customer,
    campaign_id: campaign,
    expected_status: transition.expectedStatus,
    confirm: true,
  };
  if (notificationContext !== undefined) request.notification_context = notificationContext;
  const payload = await actionRequest(operation, request, options);
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
    emailNotificationStatus: typeof payload.email_notification_status === 'string' ? payload.email_notification_status : '',
  };
}

export async function applyGoogleAdsCampaignSitelinks({ managerCustomerId, customerId, campaignId, sitelinks, signature = '' }, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaign = String(campaignId ?? '');
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer)
      || !/^[1-9]\d{0,19}$/.test(campaign) || !Array.isArray(sitelinks)
      || sitelinks.length < 1 || sitelinks.length > 6) {
    throw new Error('Selecione uma campanha e de 1 a 6 sitelinks válidos para aplicar ao lote.');
  }
  const anchors = new Set();
  const normalized = sitelinks.map(item => {
    const anchor = Number(item?.anchor);
    const title = String(item?.title ?? '').trim();
    const description1 = String(item?.description1 ?? '').trim();
    const description2 = String(item?.description2 ?? '').trim();
    if (!Number.isInteger(anchor) || anchor < 1 || anchor > 6 || anchors.has(anchor)
        || !title || Boolean(description1) !== Boolean(description2) || Array.from(title).length > 25
        || Array.from(description1).length > 35
        || !description2 || Array.from(description2).length > 35) {
      throw new Error('Cada sitelink precisa de título (até 25 caracteres), uma seção única de 1 a 6 e, se usar descrições, preencha as duas (até 35 caracteres cada).');
    }
    anchors.add(anchor);
    return { title, description1, description2, anchor };
  });
  const payload = await actionRequest('apply_campaign_sitelinks', {
    manager_customer_id: manager,
    customer_id: customer,
    campaign_id: campaign,
    confirm: true,
    sitelinks: normalized,
  }, options);
  if (payload?.schema_version !== 1 || payload.operation !== 'apply_campaign_sitelinks'
      || String(payload.campaign_id) !== campaign || payload.verified !== true
      || !Number.isInteger(payload.submitted_count) || !Number.isInteger(payload.applied_count)
      || !Number.isInteger(payload.already_present_count) || !Number.isInteger(payload.reactivated_count)
      || payload.applied_count + payload.already_present_count + payload.reactivated_count !== payload.submitted_count) {
    throw new Error('O servidor não confirmou os sitelinks desta campanha. Confira o Google Ads antes de repetir.');
  }
  return {
    campaignId: campaign,
    verified: true,
    submittedCount: payload.submitted_count,
    appliedCount: payload.applied_count,
    alreadyPresentCount: payload.already_present_count,
    reactivatedCount: payload.reactivated_count,
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
    signature: String(signature || ''),
  };
}
