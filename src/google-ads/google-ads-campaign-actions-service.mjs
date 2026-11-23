import { requestGoogleAdsEndpoint } from './google-ads-http-client.mjs?v=6';

export const GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT = 'https://track.travenzo.shop/google-ads-campaign-action.php';

const actionErrorMessages = Object.freeze({
  campaign_writes_disabled: 'A escrita de campanhas está bloqueada no servidor. Nenhuma campanha foi alterada.',
  negative_keywords_disabled: 'A negativação manual de termos ainda está desativada no serviço privado. Nenhuma campanha foi alterada.',
  negative_keyword_batch_disabled: 'A aplicação de palavras negativas por lote ainda está bloqueada no serviço privado. Nenhuma campanha foi alterada.',
  negative_keyword_preview_changed: 'O escopo, a lista de campanhas ou as negativas mudaram desde a prévia. Gere uma nova prévia antes de confirmar.',
  negative_keyword_source_unavailable: 'A campanha de origem não está mais disponível ou não segue o padrão do Hub para identificar o produto.',
  negative_keyword_targets_too_many: 'O produto tem campanhas demais para uma prévia segura. Nenhuma campanha foi alterada.',
  negative_keyword_apply_unverified: 'A solicitação foi enviada, mas o servidor não confirmou todas as negativas. Confira as campanhas no Google Ads antes de repetir.',
  negative_keyword_batch_too_large: 'O lote excede o limite de segurança para a combinação de campanhas e termos.',
  negative_keyword_batch_campaign_changed: 'Uma campanha mudou de nome, status ou deixou de ser uma campanha Search desde a prévia. Gere uma nova prévia para este lote.',
  negative_keyword_batch_scan_incomplete: 'O Google Ads não retornou uma leitura completa das negativas do lote. Nenhuma gravação foi confirmada; tente uma nova prévia.',
  negative_keyword_batch_preview_changed: 'As campanhas ou negativas existentes mudaram desde a prévia. Gere uma nova prévia antes de enviar.',
  positive_keyword_batch_disabled: 'A inclusão de palavras-chave positivas por lote ainda está bloqueada no serviço privado. Nenhuma campanha foi alterada.',
  positive_keyword_batch_too_large: 'O lote excede o limite de segurança para a combinação de grupos e palavras-chave.',
  positive_keyword_batch_campaign_changed: 'Uma campanha mudou desde a prévia. Gere uma nova prévia para este lote.',
  positive_keyword_batch_ad_group_changed: 'O grupo de anúncios não corresponde mais ao lote, ou a campanha não tem exatamente um grupo elegível. Confira no Google Ads antes de continuar.',
  positive_keyword_batch_scan_incomplete: 'O Google Ads não retornou uma leitura completa das palavras-chave positivas do lote. Nenhuma gravação foi confirmada; tente uma nova prévia.',
  positive_keyword_batch_preview_changed: 'As campanhas, grupos ou palavras-chave existentes mudaram desde a prévia. Gere uma nova prévia antes de enviar.',
  invalid_payload: 'Os dados da ação estão incompletos ou expiraram. Atualize a consulta e gere outra prévia.',
  campaign_account_not_allowed: 'Esta conta cliente não está ativa e vinculada à MCC autorizada para ações de campanha.',
  campaign_not_found: 'A campanha não foi encontrada nessa conta. Atualize a consulta e confira a seleção.',
  campaign_status_changed: 'O status da campanha mudou desde a consulta. Atualize a consulta antes de tentar novamente.',
  campaign_status_unverified: 'A solicitação pode ter sido enviada, mas o servidor não conseguiu confirmar o novo status. Consulte a campanha no Google Ads antes de repetir.',
  campaign_target_cpa_changed: 'O CPA da campanha mudou desde a última leitura. Atualize os dados do Google Ads antes de ajustar novamente.',
  campaign_target_cpa_strategy_unsupported: 'O ajuste está disponível somente para estratégias diretas de CPA desejado, sem estratégia de portfólio.',
  campaign_target_cpa_not_set: 'A campanha não tem um CPA desejado direto configurado para ajustar.',
  campaign_target_cpa_commission_changed: 'A comissão identificada no nome da campanha mudou. Atualize a campanha e confira o valor antes de ajustar.',
  campaign_target_cpa_currency_mismatch: 'A moeda da conta mudou desde a última leitura. Atualize os dados do Google Ads antes de ajustar.',
  campaign_target_cpa_adjustment_too_small: 'O passo selecionado resulta em menos de um centavo na moeda da conta; não foi feita alteração.',
  campaign_target_cpa_adjustment_unverified: 'A solicitação pode ter sido enviada, mas o Google Ads não confirmou o novo CPA. Confira a campanha antes de repetir.',
  campaign_budget_not_daily: 'O orçamento desta campanha não é diário. Nenhuma alteração foi feita.',
  campaign_budget_not_exclusive: 'O orçamento é compartilhado ou está associado a mais de uma campanha. Nenhuma alteração foi feita.',
  campaign_budget_changed: 'O orçamento mudou novamente no Google Ads antes da confirmação. Atualize a leitura e confira a nova prévia antes de tentar outra vez.',
  campaign_budget_currency_mismatch: 'A moeda da conta mudou desde a última leitura. Atualize os dados da campanha antes de ajustar.',
  campaign_budget_adjustment_too_small: 'A variação selecionada não altera o orçamento na menor unidade da moeda. Nenhuma alteração foi feita.',
  campaign_budget_adjustment_unverified: 'A solicitação pode ter sido enviada, mas o Google Ads não confirmou o novo orçamento. Confira a campanha antes de repetir.',
  campaign_sitelinks_campaign_unavailable: 'A campanha não está disponível para receber sitelinks nesta conta.',
  campaign_sitelinks_url_mismatch: 'A URL do sitelink não corresponde à URL final do anúncio desta campanha.',
  campaign_sitelinks_write_rejected: 'A gravação foi recusada ou o servidor não conseguiu confirmar todos os sitelinks. Confira a campanha no Google Ads antes de repetir.',
  campaign_destination_url_invalid: 'Informe uma URL HTTPS válida, sem credenciais nem fragmento.',
  campaign_destination_url_campaign_unavailable: 'A campanha não está disponível para alteração de URL neste lote.',
  campaign_destination_url_resource_limit: 'A campanha tem mais recursos de URL do que o serviço consegue processar com segurança em uma operação.',
  campaign_destination_url_update_rejected: 'O Google Ads recusou a alteração de URL. Nenhuma confirmação foi registrada; confira a campanha antes de tentar novamente.',
  campaign_destination_url_update_unverified: 'O Google Ads recebeu a alteração, mas o serviço não conseguiu confirmar todos os destinos. Confira a campanha antes de tentar novamente.',
  campaign_keyword_inventory_campaign_changed: 'A campanha mudou ou não é mais uma campanha Search disponível. Atualize o Diário antes de tentar novamente.',
  campaign_keyword_inventory_incomplete: 'O Google Ads não retornou a lista completa de palavras-chave. Nenhum resultado parcial foi exibido; tente novamente.',
});

function actionRequest(operation, parameters, options) {
  return requestGoogleAdsEndpoint(GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT, operation, parameters, { ...options, errorMessages: actionErrorMessages });
}

export async function fetchGoogleAdsCampaignKeywordInventory({ managerCustomerId, customerId, campaignId }, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaign = String(campaignId ?? '');
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer) || !/^[1-9]\d{0,19}$/.test(campaign)) {
    throw new Error('Selecione uma MCC, conta e campanha Google Ads válidas para atualizar as palavras-chave.');
  }
  let payload;
  try {
    payload = await actionRequest('read_campaign_keyword_inventory', {
      manager_customer_id: manager, customer_id: customer, campaign_id: campaign,
    }, options);
  } catch (error) {
    if (error?.code === 'api_unavailable' || error?.code === 'private_service_unavailable') {
      throw new Error('A leitura de palavras-chave da campanha ainda não foi publicada no servidor.');
    }
    throw error;
  }
  const validStatus = value => ['ENABLED', 'PAUSED'].includes(value);
  const validRows = (rows, negative) => Array.isArray(rows) && rows.every(item => {
    if (!item || typeof item.term !== 'string' || !item.term.trim()
        || !['BROAD', 'PHRASE', 'EXACT'].includes(item.match_type)
        || typeof item.status !== 'string' || !item.status
        || !['AD_GROUP', 'CAMPAIGN'].includes(item.scope)) return false;
    if (item.scope === 'CAMPAIGN') return negative && item.ad_group_id === null;
    return /^[1-9]\d{0,19}$/.test(String(item.ad_group_id ?? ''));
  });
  const campaignInfo = payload?.campaign;
  if (payload?.schema_version !== 1 || payload.operation !== 'read_campaign_keyword_inventory'
      || !campaignInfo || String(campaignInfo.customer_id) !== customer || String(campaignInfo.campaign_id) !== campaign
      || typeof campaignInfo.campaign_name !== 'string' || !campaignInfo.campaign_name.trim()
      || !validStatus(campaignInfo.status) || campaignInfo.channel_type !== 'SEARCH'
      || payload.verified !== true || !Number.isFinite(Date.parse(payload.read_at_utc))
      || !validRows(payload.positive_keywords, false) || !validRows(payload.negative_keywords, true)) {
    throw new Error('O servidor retornou uma lista de palavras-chave incompleta ou incompatível com a campanha.');
  }
  return {
    campaign: { customerId: customer, campaignId: campaign, campaignName: campaignInfo.campaign_name,
      status: campaignInfo.status, channelType: campaignInfo.channel_type },
    verified: true,
    readAtUtc: payload.read_at_utc,
    positiveKeywords: payload.positive_keywords.map(item => ({ term: item.term, matchType: item.match_type,
      status: item.status, scope: item.scope, adGroupId: item.ad_group_id })),
    negativeKeywords: payload.negative_keywords.map(item => ({ term: item.term, matchType: item.match_type,
      status: item.status, scope: item.scope, adGroupId: item.ad_group_id })),
  };
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
  const automaticPauseContexts = [
    'automatic_negative_remaining',
    'automatic_product_performance',
    'automatic_minimum_product_performance',
    'automatic_reference_competitor',
    'automatic_campaign_age',
    'automatic_campaign_zero_impressions',
    'automatic_clicks_without_sale',
  ];
  if (notificationContext !== undefined
      && (!automaticPauseContexts.includes(notificationContext) || operation !== 'pause_campaign')) {
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

export async function adjustGoogleAdsCampaignTargetCpa({ managerCustomerId, customerId, campaignId, expectedTargetCpaMicros,
  expectedCurrencyCode, commissionCents, commissionCurrency, commissionTargetCents, exchangeRate, direction, stepPercentagePoints = 2 }, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaign = String(campaignId ?? '');
  const currentMicros = String(expectedTargetCpaMicros ?? '');
  const currency = String(expectedCurrencyCode ?? '').toUpperCase();
  const sourceCurrency = String(commissionCurrency ?? '').toUpperCase();
  const commission = Number(commissionCents);
  const convertedCommission = Number(commissionTargetCents);
  const rate = Number(exchangeRate);
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer) || !/^[1-9]\d{0,19}$/.test(campaign)
      || !/^[1-9]\d{0,17}$/.test(currentMicros) || !/^[A-Z]{3}$/.test(currency)
      || !['USD', 'BRL'].includes(sourceCurrency) || !Number.isSafeInteger(commission) || commission <= 0
      || !Number.isSafeInteger(convertedCommission) || convertedCommission <= 0
      || !Number.isFinite(rate) || rate <= 0 || rate > 100 || !['increase', 'decrease'].includes(direction)
      || ![2, 4].includes(stepPercentagePoints)) {
    throw new Error('A conta, campanha ou valores de CPA/comissão não são válidos para este ajuste.');
  }
  const deltaCents = Math.round(convertedCommission * stepPercentagePoints / 100);
  const expectedTargetMicros = BigInt(currentMicros) + BigInt(direction === 'increase' ? 1 : -1) * BigInt(deltaCents) * 10000n;
  if (deltaCents < 1 || expectedTargetMicros <= 0n || expectedTargetMicros > 999999999999999999n) {
    throw new Error('O ajuste selecionado não gera um CPA válido na precisão monetária da conta.');
  }
  let payload;
  try {
    const requestPayload = {
      manager_customer_id: manager,
      customer_id: customer,
      campaign_id: campaign,
      expected_target_cpa_micros: currentMicros,
      expected_currency_code: currency,
      commission_cents: String(commission),
      commission_currency: sourceCurrency,
      expected_commission_target_cents: String(convertedCommission),
      exchange_rate: String(rate.toFixed(8)),
      direction,
      confirm: true,
    };
    if (stepPercentagePoints !== 2) requestPayload.step_percentage_points = String(stepPercentagePoints);
    payload = await actionRequest('adjust_campaign_target_cpa', requestPayload, options);
  } catch (error) {
    if (error?.code === 'invalid_payload') throw new Error('O serviço privado ainda não reconhece o ajuste de CPA ou recebeu dados inválidos. Publique o pacote do endpoint na Hostinger e atualize os dados da campanha.');
    throw error;
  }
  if (payload?.schema_version !== 1 || payload.operation !== 'adjust_campaign_target_cpa'
      || String(payload.campaign_id) !== campaign || payload.verified !== true
      || String(payload.previous_target_cpa_micros) !== currentMicros
      || String(payload.target_cpa_micros) !== expectedTargetMicros.toString()
      || String(payload.currency_code) !== currency
      || (payload.step_percentage_points != null && Number(payload.step_percentage_points) !== stepPercentagePoints)
      || (stepPercentagePoints !== 2 && Number(payload.step_percentage_points) !== stepPercentagePoints)) {
    throw new Error('A resposta da API não confirmou o novo CPA previsto. Confira a campanha no Google Ads antes de repetir.');
  }
  return {
    campaignId: campaign,
    campaignName: typeof payload.campaign_name === 'string' ? payload.campaign_name : '',
    previousTargetCpaMicros: currentMicros,
    targetCpaMicros: String(payload.target_cpa_micros),
    stepPercentagePoints,
    currencyCode: currency,
    verified: true,
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
  };
}

export async function adjustGoogleAdsCampaignDailyBudget({ managerCustomerId, customerId, campaignId,
  expectedBudgetAmountMicros, expectedBudgetResource, expectedCurrencyCode, direction, percentage = 5 }, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaign = String(campaignId ?? '');
  const currentMicros = String(expectedBudgetAmountMicros ?? '');
  const resource = String(expectedBudgetResource ?? '');
  const currency = String(expectedCurrencyCode ?? '').toUpperCase();
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer) || !/^[1-9]\d{0,19}$/.test(campaign)
      || !/^[1-9]\d{0,15}$/.test(currentMicros) || !/^[A-Z]{3}$/.test(currency)
      || !new RegExp(`^customers/${customer}/campaignBudgets/[1-9]\\d{0,19}$`).test(resource)
      || ![5, 10].includes(percentage)
      || !['increase', 'decrease'].includes(direction)) {
    throw new Error('A conta, campanha ou orçamento diário não é válido para este ajuste.');
  }
  let payload;
  try {
    payload = await actionRequest('adjust_campaign_daily_budget', {
      manager_customer_id: manager,
      customer_id: customer,
      campaign_id: campaign,
      expected_budget_amount_micros: currentMicros,
      expected_budget_resource: resource,
      expected_currency_code: currency,
      direction,
      ...(percentage === 10 ? { percentage } : {}),
      confirm: true,
    }, options);
  } catch (error) {
    if (error?.code === 'invalid_payload') throw new Error(`O serviço privado ainda não reconhece o ajuste de ${percentage}% do orçamento diário ou recebeu dados inválidos. Publique o pacote do endpoint na Hostinger e atualize os dados da campanha.`);
    throw error;
  }
  if (payload?.schema_version === 1 && payload.operation === 'adjust_campaign_daily_budget'
      && payload.confirmation_required === true) {
    const freshAmount = String(payload.current_budget?.amount_micros ?? '');
    const freshResource = String(payload.current_budget?.resource_name ?? '');
    const freshCurrency = String(payload.current_budget?.currency_code ?? '').toUpperCase();
    if (String(payload.campaign_id) !== campaign || !/^[1-9]\d{0,15}$/.test(freshAmount)
        || !new RegExp(`^customers/${customer}/campaignBudgets/[1-9]\\d{0,19}$`).test(freshResource)
        || freshCurrency !== currency || (payload.percentage != null && Number(payload.percentage) !== percentage)
        || (percentage === 10 && Number(payload.percentage) !== percentage)) {
      throw new Error('A API identificou um orçamento diferente, mas não retornou uma configuração válida para atualizar a prévia. Nenhuma alteração foi aplicada.');
    }
    return {
      campaignId: campaign,
      confirmationRequired: true,
      currentBudgetAmountMicros: freshAmount,
      currentBudgetResource: freshResource,
      currencyCode: freshCurrency,
      verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
    };
  }
  if (payload?.schema_version !== 1 || payload.operation !== 'adjust_campaign_daily_budget'
      || String(payload.campaign_id) !== campaign || payload.verified !== true
      || String(payload.previous_budget_amount_micros) !== currentMicros
      || !/^[1-9]\d{0,15}$/.test(String(payload.budget_amount_micros ?? ''))
      || String(payload.budget_resource) !== resource || String(payload.currency_code) !== currency
      || (payload.percentage != null && Number(payload.percentage) !== percentage)
      || (percentage === 10 && Number(payload.percentage) !== percentage)) {
    throw new Error('A resposta da API não confirmou o novo orçamento diário previsto. Confira a campanha no Google Ads antes de repetir.');
  }
  return {
    campaignId: campaign,
    campaignName: typeof payload.campaign_name === 'string' ? payload.campaign_name : '',
    previousBudgetAmountMicros: currentMicros,
    budgetAmountMicros: String(payload.budget_amount_micros),
    budgetResource: resource,
    currencyCode: currency,
    direction,
    percentage,
    verified: true,
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
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

export async function applyGoogleAdsCampaignDestinationUrl({
  managerCustomerId, customerId, campaignId, batchCampaignIds, finalUrl, signature = '',
}, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaign = String(campaignId ?? '');
  const ids = Array.isArray(batchCampaignIds) ? [...new Set(batchCampaignIds.map(String))] : [];
  const url = String(finalUrl ?? '').trim();
  let validUrl = false;
  try {
    const parsed = new URL(url);
    validUrl = parsed.protocol === 'https:' && Boolean(parsed.hostname) && !parsed.username && !parsed.password && !parsed.hash;
  } catch { /* URL inválida será recusada abaixo. */ }
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer)
      || !/^[1-9]\d{0,19}$/.test(campaign) || ids.length < 1 || ids.length > 100
      || ids.some(id => !/^[1-9]\d{0,19}$/.test(id)) || !ids.includes(campaign) || !validUrl) {
    throw new Error('Selecione uma campanha, conta e URL HTTPS válidas para atualizar o lote.');
  }
  const payload = await actionRequest('apply_campaign_destination_url', {
    manager_customer_id: manager,
    customer_id: customer,
    campaign_id: campaign,
    batch_campaign_ids: ids,
    final_url: url,
    confirm: true,
  }, options);
  const countFields = [
    'ads_updated', 'criteria_updated', 'assets_updated', 'ads_already_current', 'criteria_already_current',
    'assets_already_current', 'assets_skipped_shared', 'assets_skipped_account_level', 'account_scoped_url_assets_not_changed',
  ];
  if (payload?.schema_version !== 1 || payload.operation !== 'apply_campaign_destination_url'
      || String(payload.campaign_id) !== campaign || payload.final_url !== url || payload.verified !== true
      || typeof payload.complete !== 'boolean' || countFields.some(field => !Number.isInteger(payload[field]) || payload[field] < 0)) {
    throw new Error('O servidor não confirmou os destinos finais da campanha. Confira a conta antes de repetir.');
  }
  return {
    campaignId: campaign,
    finalUrl: url,
    verified: true,
    complete: payload.complete,
    adsUpdated: payload.ads_updated,
    criteriaUpdated: payload.criteria_updated,
    assetsUpdated: payload.assets_updated,
    adsAlreadyCurrent: payload.ads_already_current,
    criteriaAlreadyCurrent: payload.criteria_already_current,
    assetsAlreadyCurrent: payload.assets_already_current,
    assetsSkippedShared: payload.assets_skipped_shared,
    assetsSkippedAccountLevel: payload.assets_skipped_account_level,
    accountScopedUrlAssetsNotChanged: payload.account_scoped_url_assets_not_changed,
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
    signature: String(signature || ''),
  };
}

function normalizeNegativeKeywordInput({ managerCustomerId, sourceCustomerId, sourceCampaignId, sourceCampaignName, term, matchType, scope = 'SOURCE_CAMPAIGN' }) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(sourceCustomerId ?? '').replace(/\D/g, '');
  const campaign = String(sourceCampaignId ?? '');
  const name = String(sourceCampaignName ?? '').trim();
  const keyword = String(term ?? '').trim().replace(/\s+/g, ' ');
  const match = String(matchType ?? '').toUpperCase();
  const targetScope = String(scope ?? 'SOURCE_CAMPAIGN').toUpperCase();
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer)
      || !/^[1-9]\d{0,19}$/.test(campaign) || !name || name.length > 255
      || !keyword || Array.from(keyword).length > 80 || keyword.split(/\s+/).length > 10
      || /[\u0000-\u001f\u007f]/.test(keyword) || !['EXACT', 'PHRASE', 'BROAD'].includes(match)
      || !['SOURCE_CAMPAIGN', 'PRODUCT'].includes(targetScope)) {
    throw new Error('Confira a MCC, campanha de origem, termo (até 80 caracteres e 10 palavras) e tipo de correspondência.');
  }
  return { manager, customer, campaign, name, keyword, match, scope: targetScope };
}

function validateNegativeKeywordPreview(payload, input) {
  if (payload?.schema_version !== 2 || payload.operation !== 'preview_product_negative_keyword'
      || payload.match_type !== input.match || payload.term !== input.keyword || payload.scope !== input.scope
      || !Array.isArray(payload.campaigns) || payload.campaigns.length > 100
      || payload.campaign_count !== payload.campaigns.length
      || !Number.isInteger(payload.to_create_count) || !Number.isInteger(payload.already_present_count)
      || payload.to_create_count < 0 || payload.already_present_count < 0
      || payload.to_create_count + payload.already_present_count !== payload.campaign_count
      || typeof payload.product !== 'string' || !payload.product
      || payload.already_present_count !== payload.campaigns.filter(item => item?.already_present === true).length
      || payload.to_create_count !== payload.campaigns.filter(item => item?.already_present === false).length) {
    throw new Error('O serviço retornou uma prévia inválida. Nenhuma alteração foi confirmada.');
  }
  const ids = new Set();
  const campaigns = payload.campaigns.map(item => {
    const customerId = String(item?.customer_id ?? '').replace(/\D/g, '');
    const campaignId = String(item?.campaign_id ?? '');
    if (!/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId)
        || item?.status !== 'ENABLED' || typeof item?.campaign_name !== 'string'
        || !item.campaign_name || item.campaign_name.length > 255 || typeof item?.already_present !== 'boolean') {
      throw new Error('A prévia contém uma campanha incompleta. Nenhuma alteração foi confirmada.');
    }
    const key = `${customerId}|${campaignId}`;
    if (ids.has(key)) throw new Error('A prévia contém campanhas duplicadas. Nenhuma alteração foi confirmada.');
    ids.add(key);
    return { customerId, campaignId, campaignName: item.campaign_name, status: item.status, alreadyPresent: item.already_present };
  });
  const sourceIsInPreview = campaigns.some(item => item.customerId === input.customer
    && item.campaignId === input.campaign && item.campaignName === input.name);
  if (input.scope === 'SOURCE_CAMPAIGN'
      && (!sourceIsInPreview || campaigns.length !== 1 || campaigns[0].customerId !== input.customer
        || campaigns[0].campaignId !== input.campaign || campaigns[0].campaignName !== input.name)) {
    throw new Error('A prévia não corresponde à campanha ou ao escopo escolhido. Nenhuma alteração foi confirmada.');
  }
  return {
    product: payload.product,
    term: input.keyword,
    matchType: input.match,
    scope: input.scope,
    campaigns,
    campaignCount: payload.campaign_count,
    toCreateCount: payload.to_create_count,
    alreadyPresentCount: payload.already_present_count,
    previewAtUtc: typeof payload.previewed_at_utc === 'string' ? payload.previewed_at_utc : '',
  };
}

export async function previewGoogleAdsProductNegativeKeyword({
  managerCustomerId, sourceCustomerId, sourceCampaignId, sourceCampaignName, term, matchType, scope,
}, options) {
  const input = normalizeNegativeKeywordInput({ managerCustomerId, sourceCustomerId, sourceCampaignId, sourceCampaignName, term, matchType, scope });
  const payload = await actionRequest('preview_product_negative_keyword', {
    manager_customer_id: input.manager,
    source_customer_id: input.customer,
    source_campaign_id: input.campaign,
    source_campaign_name: input.name,
    term: input.keyword,
    match_type: input.match,
    scope: input.scope,
  }, options);
  return validateNegativeKeywordPreview(payload, input);
}

export async function applyGoogleAdsProductNegativeKeyword({
  managerCustomerId, sourceCustomerId, sourceCampaignId, sourceCampaignName, term, matchType, scope, expectedCampaigns,
}, options) {
  const input = normalizeNegativeKeywordInput({ managerCustomerId, sourceCustomerId, sourceCampaignId, sourceCampaignName, term, matchType, scope });
  const campaigns = Array.isArray(expectedCampaigns) ? expectedCampaigns : [];
  if (!campaigns.length || campaigns.length > 100) throw new Error('Gere uma prévia válida com até 100 campanhas antes de confirmar.');
  const normalizedCampaigns = campaigns.map(item => {
    const customerId = String(item?.customerId ?? '').replace(/\D/g, '');
    const campaignId = String(item?.campaignId ?? '');
    const campaignName = String(item?.campaignName ?? '').trim();
    const status = String(item?.status ?? '');
    const alreadyPresent = item?.alreadyPresent === true;
    if (!/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId)
        || !campaignName || campaignName.length > 255 || status !== 'ENABLED') {
      throw new Error('A lista da prévia expirou ou está incompleta. Gere uma nova prévia.');
    }
    return { customer_id: customerId, campaign_id: campaignId, campaign_name: campaignName, status, already_present: alreadyPresent };
  });
  const sourceIncluded = normalizedCampaigns.some(item => item.customer_id === input.customer
    && item.campaign_id === input.campaign && item.campaign_name === input.name);
  if (input.scope === 'SOURCE_CAMPAIGN'
      && (!sourceIncluded || normalizedCampaigns.length !== 1 || normalizedCampaigns[0].customer_id !== input.customer
        || normalizedCampaigns[0].campaign_id !== input.campaign || normalizedCampaigns[0].campaign_name !== input.name)) {
    throw new Error('A lista de aplicação não corresponde à campanha e ao escopo pré-visualizados. Gere uma nova prévia.');
  }
  const payload = await actionRequest('apply_product_negative_keyword', {
    manager_customer_id: input.manager,
    source_customer_id: input.customer,
    source_campaign_id: input.campaign,
    source_campaign_name: input.name,
    term: input.keyword,
    match_type: input.match,
    scope: input.scope,
    expected_campaigns: normalizedCampaigns,
    confirm: true,
  }, options);
  if (payload?.schema_version !== 2 || payload.operation !== 'apply_product_negative_keyword'
      || payload.term !== input.keyword || payload.match_type !== input.match || payload.scope !== input.scope
      || payload.campaign_count !== normalizedCampaigns.length || typeof payload.complete !== 'boolean'
      || typeof payload.verified !== 'boolean' || !Array.isArray(payload.results)
      || payload.results.length !== normalizedCampaigns.length
      || !Number.isInteger(payload.created_count) || !Number.isInteger(payload.already_present_count)
      || !Number.isInteger(payload.unverified_count) || !Number.isInteger(payload.failed_count)
      || payload.created_count < 0 || payload.already_present_count < 0 || payload.unverified_count < 0 || payload.failed_count < 0
      || payload.created_count + payload.already_present_count + payload.unverified_count + payload.failed_count !== normalizedCampaigns.length
      || payload.complete !== (payload.unverified_count === 0 && payload.failed_count === 0)
      || payload.verified !== payload.complete
      || payload.results.some((item, index) => {
        const expected = normalizedCampaigns[index];
        return !item || item.customer_id !== expected.customer_id || item.campaign_id !== expected.campaign_id
          || !['already_present', 'created_verified', 'write_unverified', 'failed'].includes(item.result);
      })
      || payload.created_count !== payload.results.filter(item => item.result === 'created_verified').length
      || payload.already_present_count !== payload.results.filter(item => item.result === 'already_present').length
      || payload.unverified_count !== payload.results.filter(item => item.result === 'write_unverified').length
      || payload.failed_count !== payload.results.filter(item => item.result === 'failed').length) {
    throw new Error('O serviço não confirmou a lista completa de negativas. Confira as campanhas no Google Ads antes de repetir.');
  }
  return {
    product: typeof payload.product === 'string' ? payload.product : '',
    term: input.keyword,
    matchType: input.match,
    scope: input.scope,
    campaignCount: payload.campaign_count,
    createdCount: payload.created_count,
    alreadyPresentCount: payload.already_present_count,
    unverifiedCount: payload.unverified_count,
    failedCount: payload.failed_count,
    complete: payload.complete,
    verified: payload.verified,
    results: payload.results,
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
  };
}

function normalizeBatchNegativeKeywordInput({ managerCustomerId, campaigns, terms }) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(manager) || !Array.isArray(campaigns) || campaigns.length < 1 || campaigns.length > 100
      || !Array.isArray(terms) || terms.length < 1 || terms.length > 100 || campaigns.length * terms.length > 10000) {
    throw new Error('Selecione um lote salvo com até 100 campanhas e informe de 1 a 100 negativas.');
  }
  const campaignKeys = new Set();
  const normalizedCampaigns = campaigns.map(item => {
    const customerId = String(item?.customerId ?? '').replace(/\D/g, '');
    const campaignId = String(item?.campaignId ?? '');
    const campaignName = String(item?.campaignName ?? '').trim();
    const status = String(item?.status ?? '');
    const itemManager = String(item?.managerCustomerId ?? manager).replace(/\D/g, '');
    if (itemManager !== manager || !/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId)
        || !campaignName || campaignName.length > 255 || !['ENABLED', 'PAUSED'].includes(status)) {
      throw new Error('O lote contém campanha sem MCC, conta, ID, nome ou status válido. Reabra o lote e confira as campanhas.');
    }
    const key = customerId + '|' + campaignId;
    if (campaignKeys.has(key)) throw new Error('O lote contém uma campanha duplicada. Nenhuma alteração foi enviada.');
    campaignKeys.add(key);
    return { customerId, campaignId, campaignName, status };
  });
  const termKeys = new Set();
  const normalizedTerms = terms.map(item => {
    const text = String(item?.text ?? '').trim().replace(/\s+/g, ' ');
    const matchType = String(item?.matchType ?? '').toUpperCase();
    if (!text || Array.from(text).length > 80 || text.split(/\s+/).length > 10
        || /[\u0000-\u001f\u007f]/.test(text) || !['BROAD', 'PHRASE', 'EXACT'].includes(matchType)) {
      throw new Error('Uma negativa não atende ao limite de 80 caracteres, 10 palavras ou formato de correspondência.');
    }
    const key = matchType + '|' + text.toLocaleLowerCase('pt-BR');
    if (termKeys.has(key)) throw new Error('A lista contém negativas repetidas com a mesma correspondência.');
    termKeys.add(key);
    return { text, matchType };
  });
  return { manager, campaigns: normalizedCampaigns, terms: normalizedTerms };
}

function validateBatchNegativeKeywordPreview(payload, input) {
  const campaignMap = new Map(input.campaigns.map(item => [item.customerId + '|' + item.campaignId, item]));
  const termMap = new Map(input.terms.map(item => [item.matchType + '|' + item.text.toLocaleLowerCase('pt-BR'), item]));
  if (payload?.schema_version !== 1 || payload.operation !== 'preview_batch_negative_keywords'
      || String(payload.manager_customer_id) !== input.manager || payload.campaign_count !== input.campaigns.length
      || payload.term_count !== input.terms.length || payload.pair_count !== input.campaigns.length * input.terms.length
      || !Number.isInteger(payload.already_present_count) || !Number.isInteger(payload.to_create_count)
      || payload.already_present_count < 0 || payload.to_create_count < 0
      || payload.already_present_count + payload.to_create_count !== payload.pair_count
      || !/^[a-f0-9]{64}$/.test(String(payload.fingerprint || ''))
      || !Array.isArray(payload.campaigns) || payload.campaigns.length !== input.campaigns.length
      || !Array.isArray(payload.terms) || payload.terms.length !== input.terms.length
      || !Array.isArray(payload.pairs) || payload.pairs.length !== payload.pair_count) {
    throw new Error('O serviço retornou uma prévia inválida para este lote. Nenhuma alteração foi confirmada.');
  }
  const seenCampaigns = new Set();
  for (const item of payload.campaigns) {
    const key = String(item?.customer_id ?? '') + '|' + String(item?.campaign_id ?? '');
    const expected = campaignMap.get(key);
    if (!expected || seenCampaigns.has(key) || item.campaign_name !== expected.campaignName || item.status !== expected.status) {
      throw new Error('A prévia retornou campanhas diferentes das salvas no lote. Nenhuma alteração foi confirmada.');
    }
    seenCampaigns.add(key);
  }
  const seenTerms = new Set();
  for (const item of payload.terms) {
    const key = String(item?.match_type ?? '') + '|' + String(item?.text ?? '').toLocaleLowerCase('pt-BR');
    const expected = termMap.get(key);
    if (!expected || seenTerms.has(key) || item.text !== expected.text) {
      throw new Error('A prévia retornou termos diferentes dos informados. Nenhuma alteração foi confirmada.');
    }
    seenTerms.add(key);
  }
  const seenPairs = new Set();
  let alreadyPresentCount = 0;
  for (const pair of payload.pairs) {
    const campaignKey = String(pair?.customer_id ?? '') + '|' + String(pair?.campaign_id ?? '');
    const termKey = String(pair?.match_type ?? '') + '|' + String(pair?.term ?? '').toLocaleLowerCase('pt-BR');
    if (!campaignMap.has(campaignKey) || !termMap.has(termKey) || typeof pair.already_present !== 'boolean') {
      throw new Error('A matriz da prévia contém uma combinação fora do lote. Nenhuma alteração foi confirmada.');
    }
    const key = campaignKey + '|' + termKey;
    if (seenPairs.has(key)) throw new Error('A matriz da prévia contém combinações duplicadas.');
    seenPairs.add(key);
    if (pair.already_present) alreadyPresentCount++;
  }
  if (alreadyPresentCount !== payload.already_present_count) throw new Error('Os totais da prévia não correspondem às combinações retornadas.');
  return {
    managerCustomerId: input.manager,
    campaignCount: payload.campaign_count,
    termCount: payload.term_count,
    pairCount: payload.pair_count,
    alreadyPresentCount: payload.already_present_count,
    toCreateCount: payload.to_create_count,
    fingerprint: payload.fingerprint,
    campaigns: payload.campaigns.map(item => ({
      customerId: item.customer_id,
      campaignId: item.campaign_id,
      campaignName: item.campaign_name,
      status: item.status,
    })),
    terms: payload.terms.map(item => ({ text: item.text, matchType: item.match_type })),
    pairs: payload.pairs.map(item => ({ customerId: item.customer_id, campaignId: item.campaign_id,
      term: item.term, matchType: item.match_type, alreadyPresent: item.already_present })),
    previewAtUtc: typeof payload.previewed_at_utc === 'string' ? payload.previewed_at_utc : '',
  };
}

export async function previewGoogleAdsBatchNegativeKeywords({ managerCustomerId, campaigns, terms }, options) {
  const input = normalizeBatchNegativeKeywordInput({ managerCustomerId, campaigns, terms });
  const payload = await actionRequest('preview_batch_negative_keywords', {
    manager_customer_id: input.manager,
    campaigns: input.campaigns.map(item => ({ customer_id: item.customerId, campaign_id: item.campaignId,
      campaign_name: item.campaignName, status: item.status })),
    terms: input.terms.map(item => ({ text: item.text, match_type: item.matchType })),
  }, options);
  return validateBatchNegativeKeywordPreview(payload, input);
}

export async function applyGoogleAdsBatchNegativeKeywords({ managerCustomerId, preview, confirm = false }, options) {
  if (confirm !== true || !preview || !Array.isArray(preview.campaigns) || !Array.isArray(preview.terms)) {
    throw new Error('Gere a prévia do lote e confirme explicitamente antes de enviar as negativas.');
  }
  const input = normalizeBatchNegativeKeywordInput({ managerCustomerId, campaigns: preview.campaigns, terms: preview.terms });
  const fingerprint = String(preview.fingerprint || '');
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('A prévia do lote expirou. Gere uma nova prévia.');
  const payload = await actionRequest('apply_batch_negative_keywords', {
    manager_customer_id: input.manager,
    campaigns: input.campaigns.map(item => ({ customer_id: item.customerId, campaign_id: item.campaignId,
      campaign_name: item.campaignName, status: item.status })),
    terms: input.terms.map(item => ({ text: item.text, match_type: item.matchType })),
    fingerprint,
    confirm: true,
  }, options);
  const resultTypes = ['already_present', 'created_verified', 'write_unverified', 'failed'];
  const pairKeys = new Set(preview.pairs.map(pair => pair.customerId + '|' + pair.campaignId + '|'
    + pair.matchType + '|' + pair.term.toLocaleLowerCase('pt-BR')));
  if (payload?.schema_version !== 1 || payload.operation !== 'apply_batch_negative_keywords'
      || String(payload.manager_customer_id) !== input.manager || payload.campaign_count !== input.campaigns.length
      || payload.term_count !== input.terms.length || payload.pair_count !== input.campaigns.length * input.terms.length
      || !Array.isArray(payload.results) || payload.results.length !== payload.pair_count
      || ['created_count', 'already_present_count', 'unverified_count', 'failed_count'].some(field => !Number.isInteger(payload[field]) || payload[field] < 0)
      || payload.created_count + payload.already_present_count + payload.unverified_count + payload.failed_count !== payload.pair_count
      || typeof payload.complete !== 'boolean' || payload.complete !== (payload.unverified_count === 0 && payload.failed_count === 0)
      || payload.verified !== payload.complete
      || payload.results.some(item => {
        const key = String(item?.customer_id ?? '') + '|' + String(item?.campaign_id ?? '') + '|'
          + String(item?.match_type ?? '') + '|' + String(item?.term ?? '').toLocaleLowerCase('pt-BR');
        if (!pairKeys.has(key) || !resultTypes.includes(item?.result)) return true;
        pairKeys.delete(key);
        return false;
      }) || pairKeys.size > 0
      || payload.created_count !== payload.results.filter(item => item.result === 'created_verified').length
      || payload.already_present_count !== payload.results.filter(item => item.result === 'already_present').length
      || payload.unverified_count !== payload.results.filter(item => item.result === 'write_unverified').length
      || payload.failed_count !== payload.results.filter(item => item.result === 'failed').length) {
    throw new Error('A resposta do serviço não confirma a operação do lote. Confira as campanhas no Google Ads antes de tentar novamente.');
  }
  return {
    complete: payload.complete,
    verified: payload.verified,
    campaignCount: payload.campaign_count,
    termCount: payload.term_count,
    pairCount: payload.pair_count,
    createdCount: payload.created_count,
    alreadyPresentCount: payload.already_present_count,
    unverifiedCount: payload.unverified_count,
    failedCount: payload.failed_count,
    results: payload.results.map(item => ({ customerId: item.customer_id, campaignId: item.campaign_id,
      term: item.term, matchType: item.match_type, result: item.result })),
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
  };
}

function normalizeBatchPositiveKeywordInput({ managerCustomerId, campaigns, terms }) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(manager) || !Array.isArray(campaigns) || campaigns.length < 1 || campaigns.length > 100
      || !Array.isArray(terms) || terms.length < 1 || terms.length > 100 || campaigns.length * terms.length > 10000) {
    throw new Error('Selecione um lote salvo com até 100 campanhas e informe de 1 a 100 palavras-chave positivas.');
  }
  const campaignKeys = new Set();
  const normalizedCampaigns = campaigns.map(item => {
    const customerId = String(item?.customerId ?? '').replace(/\D/g, '');
    const campaignId = String(item?.campaignId ?? '');
    const campaignName = String(item?.campaignName ?? '').trim();
    const status = String(item?.status ?? '');
    const adGroupId = String(item?.adGroupId ?? '');
    const adGroupStatus = String(item?.adGroupStatus ?? '');
    const itemManager = String(item?.managerCustomerId ?? manager).replace(/\D/g, '');
    if (itemManager !== manager || !/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId)
        || !campaignName || campaignName.length > 255 || !['ENABLED', 'PAUSED'].includes(status)
        || !/^[1-9]\d{0,19}$/.test(adGroupId) || !['ENABLED', 'PAUSED'].includes(adGroupStatus)) {
      throw new Error('Cada campanha precisa ter MCC, conta, ID, nome e status válidos, além de exatamente um grupo de anúncios identificado. Reassocie ou confira o lote.');
    }
    const key = customerId + '|' + campaignId;
    if (campaignKeys.has(key)) throw new Error('O lote contém uma campanha duplicada. Nenhuma alteração foi enviada.');
    campaignKeys.add(key);
    return { customerId, campaignId, campaignName, status, adGroupId, adGroupStatus };
  });
  const termKeys = new Set();
  const normalizedTerms = terms.map(item => {
    const text = String(item?.text ?? '').trim().replace(/\s+/g, ' ');
    const matchType = String(item?.matchType ?? '').toUpperCase();
    if (!text || Array.from(text).length > 80 || text.split(/\s+/).length > 10
        || /[\u0000-\u001f\u007f]/.test(text) || !['BROAD', 'PHRASE', 'EXACT'].includes(matchType)) {
      throw new Error('Uma palavra-chave não atende ao limite de 80 caracteres, 10 palavras ou formato de correspondência.');
    }
    const key = matchType + '|' + text.toLocaleLowerCase('pt-BR');
    if (termKeys.has(key)) throw new Error('A lista contém palavras-chave repetidas com a mesma correspondência.');
    termKeys.add(key);
    return { text, matchType };
  });
  return { manager, campaigns: normalizedCampaigns, terms: normalizedTerms };
}

function validateBatchPositiveKeywordPreview(payload, input) {
  const campaignMap = new Map(input.campaigns.map(item => [item.customerId + '|' + item.campaignId, item]));
  const termMap = new Map(input.terms.map(item => [item.matchType + '|' + item.text.toLocaleLowerCase('pt-BR'), item]));
  if (payload?.schema_version !== 1 || payload.operation !== 'preview_batch_positive_keywords'
      || String(payload.manager_customer_id) !== input.manager || payload.campaign_count !== input.campaigns.length
      || payload.term_count !== input.terms.length || payload.pair_count !== input.campaigns.length * input.terms.length
      || !Number.isInteger(payload.already_present_count) || !Number.isInteger(payload.to_create_count)
      || payload.already_present_count < 0 || payload.to_create_count < 0
      || payload.already_present_count + payload.to_create_count !== payload.pair_count
      || !/^[a-f0-9]{64}$/.test(String(payload.fingerprint || ''))
      || !Array.isArray(payload.campaigns) || payload.campaigns.length !== input.campaigns.length
      || !Array.isArray(payload.terms) || payload.terms.length !== input.terms.length
      || !Array.isArray(payload.pairs) || payload.pairs.length !== payload.pair_count) {
    throw new Error('O serviço retornou uma prévia inválida para este lote. Nenhuma alteração foi confirmada.');
  }
  const seenCampaigns = new Set();
  for (const item of payload.campaigns) {
    const key = String(item?.customer_id ?? '') + '|' + String(item?.campaign_id ?? '');
    const expected = campaignMap.get(key);
    if (!expected || seenCampaigns.has(key) || item.campaign_name !== expected.campaignName || item.status !== expected.status
        || String(item.ad_group_id ?? '') !== expected.adGroupId || item.ad_group_status !== expected.adGroupStatus) {
      throw new Error('A prévia retornou campanhas ou grupos diferentes dos salvos no lote. Nenhuma alteração foi confirmada.');
    }
    seenCampaigns.add(key);
  }
  const seenTerms = new Set();
  for (const item of payload.terms) {
    const key = String(item?.match_type ?? '') + '|' + String(item?.text ?? '').toLocaleLowerCase('pt-BR');
    const expected = termMap.get(key);
    if (!expected || seenTerms.has(key) || item.text !== expected.text) {
      throw new Error('A prévia retornou termos diferentes dos informados. Nenhuma alteração foi confirmada.');
    }
    seenTerms.add(key);
  }
  const seenPairs = new Set();
  let alreadyPresentCount = 0;
  for (const pair of payload.pairs) {
    const campaignKey = String(pair?.customer_id ?? '') + '|' + String(pair?.campaign_id ?? '');
    const expectedCampaign = campaignMap.get(campaignKey);
    const termKey = String(pair?.match_type ?? '') + '|' + String(pair?.term ?? '').toLocaleLowerCase('pt-BR');
    if (!expectedCampaign || String(pair?.ad_group_id ?? '') !== expectedCampaign.adGroupId
        || !termMap.has(termKey) || typeof pair.already_present !== 'boolean') {
      throw new Error('A matriz da prévia contém uma combinação fora do lote ou do grupo esperado. Nenhuma alteração foi confirmada.');
    }
    const key = campaignKey + '|' + termKey;
    if (seenPairs.has(key)) throw new Error('A matriz da prévia contém combinações duplicadas.');
    seenPairs.add(key);
    if (pair.already_present) alreadyPresentCount++;
  }
  if (alreadyPresentCount !== payload.already_present_count) throw new Error('Os totais da prévia não correspondem às combinações retornadas.');
  return {
    managerCustomerId: input.manager,
    campaignCount: payload.campaign_count,
    termCount: payload.term_count,
    pairCount: payload.pair_count,
    alreadyPresentCount: payload.already_present_count,
    toCreateCount: payload.to_create_count,
    fingerprint: payload.fingerprint,
    campaigns: payload.campaigns.map(item => ({ customerId: item.customer_id, campaignId: item.campaign_id,
      campaignName: item.campaign_name, status: item.status, adGroupId: item.ad_group_id, adGroupStatus: item.ad_group_status })),
    terms: payload.terms.map(item => ({ text: item.text, matchType: item.match_type })),
    pairs: payload.pairs.map(item => ({ customerId: item.customer_id, campaignId: item.campaign_id,
      adGroupId: item.ad_group_id, term: item.term, matchType: item.match_type, alreadyPresent: item.already_present })),
    previewAtUtc: typeof payload.previewed_at_utc === 'string' ? payload.previewed_at_utc : '',
  };
}

export async function previewGoogleAdsBatchPositiveKeywords({ managerCustomerId, campaigns, terms }, options) {
  const input = normalizeBatchPositiveKeywordInput({ managerCustomerId, campaigns, terms });
  const payload = await actionRequest('preview_batch_positive_keywords', {
    manager_customer_id: input.manager,
    campaigns: input.campaigns.map(item => ({ customer_id: item.customerId, campaign_id: item.campaignId,
      campaign_name: item.campaignName, status: item.status, ad_group_id: item.adGroupId, ad_group_status: item.adGroupStatus })),
    terms: input.terms.map(item => ({ text: item.text, match_type: item.matchType })),
  }, options);
  return validateBatchPositiveKeywordPreview(payload, input);
}

export async function applyGoogleAdsBatchPositiveKeywords({ managerCustomerId, preview, confirm = false }, options) {
  if (confirm !== true || !preview || !Array.isArray(preview.campaigns) || !Array.isArray(preview.terms)) {
    throw new Error('Gere a prévia do lote e confirme explicitamente antes de incluir as palavras-chave positivas.');
  }
  const input = normalizeBatchPositiveKeywordInput({ managerCustomerId, campaigns: preview.campaigns, terms: preview.terms });
  const fingerprint = String(preview.fingerprint || '');
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('A prévia do lote expirou. Gere uma nova prévia.');
  const payload = await actionRequest('apply_batch_positive_keywords', {
    manager_customer_id: input.manager,
    campaigns: input.campaigns.map(item => ({ customer_id: item.customerId, campaign_id: item.campaignId,
      campaign_name: item.campaignName, status: item.status, ad_group_id: item.adGroupId, ad_group_status: item.adGroupStatus })),
    terms: input.terms.map(item => ({ text: item.text, match_type: item.matchType })),
    fingerprint,
    confirm: true,
  }, options);
  const resultTypes = ['already_present', 'created_verified', 'write_unverified', 'failed'];
  const pairKeys = new Set(preview.pairs.map(pair => pair.customerId + '|' + pair.campaignId + '|' + pair.adGroupId
    + '|' + pair.matchType + '|' + pair.term.toLocaleLowerCase('pt-BR')));
  if (payload?.schema_version !== 1 || payload.operation !== 'apply_batch_positive_keywords'
      || String(payload.manager_customer_id) !== input.manager || payload.campaign_count !== input.campaigns.length
      || payload.term_count !== input.terms.length || payload.pair_count !== input.campaigns.length * input.terms.length
      || !Array.isArray(payload.results) || payload.results.length !== payload.pair_count
      || ['created_count', 'already_present_count', 'unverified_count', 'failed_count'].some(field => !Number.isInteger(payload[field]) || payload[field] < 0)
      || payload.created_count + payload.already_present_count + payload.unverified_count + payload.failed_count !== payload.pair_count
      || typeof payload.complete !== 'boolean' || payload.complete !== (payload.unverified_count === 0 && payload.failed_count === 0)
      || payload.verified !== payload.complete
      || payload.results.some(item => {
        const key = String(item?.customer_id ?? '') + '|' + String(item?.campaign_id ?? '') + '|' + String(item?.ad_group_id ?? '') + '|'
          + String(item?.match_type ?? '') + '|' + String(item?.term ?? '').toLocaleLowerCase('pt-BR');
        if (!pairKeys.has(key) || !resultTypes.includes(item?.result)) return true;
        pairKeys.delete(key);
        return false;
      }) || pairKeys.size > 0
      || payload.created_count !== payload.results.filter(item => item.result === 'created_verified').length
      || payload.already_present_count !== payload.results.filter(item => item.result === 'already_present').length
      || payload.unverified_count !== payload.results.filter(item => item.result === 'write_unverified').length
      || payload.failed_count !== payload.results.filter(item => item.result === 'failed').length) {
    throw new Error('A resposta do serviço não confirma a operação do lote. Confira as campanhas no Google Ads antes de tentar novamente.');
  }
  return {
    complete: payload.complete,
    verified: payload.verified,
    campaignCount: payload.campaign_count,
    termCount: payload.term_count,
    pairCount: payload.pair_count,
    createdCount: payload.created_count,
    alreadyPresentCount: payload.already_present_count,
    unverifiedCount: payload.unverified_count,
    failedCount: payload.failed_count,
    results: payload.results.map(item => ({ customerId: item.customer_id, campaignId: item.campaign_id,
      adGroupId: item.ad_group_id, term: item.term, matchType: item.match_type, result: item.result })),
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
  };
}
