import {keywordListError} from './google-ads-keyword-match.mjs?v=1';
import {normalizeGoogleAdsCountryCodes} from './google-ads-country-codes.mjs?v=1';
import { requestGoogleAdsEndpoint, requestGoogleAdsEndpointStream } from './google-ads-http-client.mjs?v=10';
import { GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT } from './google-ads-campaign-actions-service.mjs?v=2';

const creationErrorMessages = Object.freeze({
  campaign_creation_disabled: 'A criação de campanhas está desativada no servidor. Nenhuma campanha foi criada.',
  campaign_account_not_allowed: 'Esta conta não está ativa e vinculada a uma MCC autorizada para criação.',
  campaign_conversion_goal_unavailable: 'A conta de destino não tem a meta personalizada de compra ligada à conversão off-line esperada. Nenhuma campanha foi criada.',
  campaign_conversion_goal_ambiguous: 'A conta de destino tem mais de uma meta personalizada de compra compatível. Nenhuma campanha foi criada.',
  campaign_conversion_action_unavailable: 'A ação de conversão selecionada para esta MCC não está disponível em uma meta personalizada de compra ativa na conta de conversão da campanha. Nenhuma campanha foi criada.',
  campaign_conversion_action_ambiguous: 'A ação selecionada está em mais de uma meta personalizada ativa. Ajuste a configuração no Google Ads para deixar uma única meta compatível. Nenhuma campanha foi criada.',
  campaign_goal_configuration_unverified: 'A campanha pode ter sido criada pausada, mas o Hub não confirmou a meta personalizada. Confira no Google Ads antes de repetir.',
  campaign_delivery_settings_search_only: 'Essa correção está disponível somente para campanhas Search.',
  campaign_delivery_settings_unverified: 'O Hub não confirmou a configuração de presença e meta personalizada. Confira o resultado salvo antes de repetir.',
  campaign_eu_political_declaration_search_only: 'A declaração em lote está disponível somente para campanhas Search pausadas ou ativas.',
  campaign_eu_political_declaration_preflight_failed: 'Nenhuma declaração foi alterada nesta conta porque uma campanha não passou pela conferência de identidade.',
  campaign_eu_political_declaration_unverified: 'O Hub não confirmou a declaração de publicidade política da UE. Confira no Google Ads antes de repetir.',
  campaign_country_not_targetable: 'Um dos países informados não foi localizado como destino ativo na Google Ads API. Confira os códigos ISO de duas letras.',
  campaign_country_limit_exceeded: 'A consulta de países excedeu o limite de segurança. Reduza a quantidade de países.',
  campaign_currency_mismatch: 'A moeda do CPA calculado não corresponde à moeda real da conta. Nenhuma campanha foi criada; ajuste o valor manualmente ou selecione uma conta compatível.',
  campaign_name_already_exists: 'Já existe uma campanha com este nome nesta conta. Escolha outro nome.',
  campaign_name_conflict: 'A consulta de nome duplicado retornou resultados ambíguos. Atualize a conta antes de tentar novamente.',
  campaign_creation_unverified: 'A solicitação pode ter sido processada, mas o servidor não confirmou a campanha. Confira a conta no Google Ads antes de tentar novamente.',
  campaign_preview_context_expired: 'O contexto compartilhado da MCC expirou. Prepare a prévia novamente antes de continuar.',
  campaign_preview_context_invalid: 'O contexto compartilhado da MCC não corresponde a esta conta ou configuração. Prepare a prévia novamente.',
  campaign_name_lookup_context_expired: 'A busca agrupada de nomes expirou. Prepare a prévia novamente antes de continuar.',
  campaign_name_lookup_context_invalid: 'O resultado agrupado da busca de nomes não corresponde a esta campanha. Prepare a prévia novamente.',
  audience_exclusion_campaign_must_be_paused: 'A campanha precisa ser Search e continuar pausada para receber estas exclusões.',
  audience_exclusion_campaign_setting_incompatible: 'A configuração de grupos de público da campanha impede exclusões por segmento. Nenhuma exclusão foi aplicada.',
  audience_exclusion_target_mismatch: 'A campanha não corresponde à conta selecionada. Nenhuma exclusão foi aplicada.',
  audience_exclusion_target_unavailable: 'A campanha não foi encontrada nesta conta.',
  audience_exclusion_unverified: 'A API não confirmou as exclusões. Confira a campanha antes de repetir; critérios já ativos não serão duplicados.',
  audience_targeting_list_unavailable: 'A lista fixa de 918 públicos não está disponível ou não passou na validação do servidor.',
});

const HUB_PURCHASE_CUSTOM_GOAL = 'meta personalizada da ação compra';
const HUB_OFFLINE_PURCHASE_ACTION = 'Conversão compra off-line (upload)';
const HUB_POSITIVE_GEO_TARGET_TYPE = 'PRESENCE';

export function validateHubCampaignPositiveGeoTarget(payload) {
  if (payload?.positive_geo_target_type !== HUB_POSITIVE_GEO_TARGET_TYPE) {
    throw new Error('O servidor ainda não confirmou a segmentação por presença nos locais incluídos. Atualize o serviço privado antes de criar campanhas. Nenhuma criação foi solicitada nesta prévia.');
  }
  return {
    positiveGeoTargetType: HUB_POSITIVE_GEO_TARGET_TYPE,
    description: payload?.geo_targeting_mode === 'WORLD'
      ? 'Mundo (todas as regiões), sem critérios positivos de país'
      : 'Pessoas que estão nos locais incluídos ou que frequentam essas áreas',
  };
}

export function validateHubCampaignConversionGoal(payload, { requireVerified = false, input = null } = {}) {
  const selectedActionName = String(input?.conversionActionName ?? '').trim();
  const selectedActionResourceName = String(input?.conversionActionResourceName ?? '').trim();
  const hasSelectedAction = Boolean(selectedActionName || selectedActionResourceName);
  const goalName = String(payload?.custom_conversion_goal_name ?? '');
  const actionName = hasSelectedAction ? selectedActionName : HUB_OFFLINE_PURCHASE_ACTION;
  const actionResourceName = hasSelectedAction ? selectedActionResourceName : '';
  if (payload?.goal_config_level !== 'CAMPAIGN'
      || (!hasSelectedAction && goalName !== HUB_PURCHASE_CUSTOM_GOAL)
      || (hasSelectedAction && (!selectedActionName || !/^customers\/\d{10}\/conversionActions\/[1-9]\d{0,19}$/.test(selectedActionResourceName)
        || payload?.conversion_action_resource_name !== selectedActionResourceName || !goalName))
      || payload?.conversion_action_name !== actionName
      || (requireVerified && payload?.conversion_goal_verified !== true)) {
    throw new Error(hasSelectedAction
      ? 'A prévia não confirmou a ação de conversão escolhida nas Configurações globais para esta MCC. Confira a conta de conversão e a meta personalizada no Google Ads. Nenhuma criação foi solicitada.'
      : 'A prévia não confirmou a meta personalizada de compra off-line do Hub. Nenhuma criação foi solicitada.');
  }
  return {
    customConversionGoalName: goalName,
    conversionActionName: actionName,
    ...(hasSelectedAction ? { conversionActionResourceName: selectedActionResourceName } : {}),
  };
}

function accountIds({ managerCustomerId, customerId } = {}) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer)) {
    throw new Error('Selecione uma MCC e uma conta Google Ads cliente válidas.');
  }
  return { manager_customer_id: manager, customer_id: customer };
}

function campaignParameters(input = {}) {
  const ids = accountIds(input);
  const conversionActionName = String(input.conversionActionName ?? '').trim();
  const conversionActionResourceName = String(input.conversionActionResourceName ?? '').trim();
  if (Boolean(conversionActionName) !== Boolean(conversionActionResourceName)
      || (conversionActionResourceName && !new RegExp('^customers/' + ids.manager_customer_id + '/conversionActions/[1-9]\\d{0,19}$').test(conversionActionResourceName))) {
    throw new Error('A ação de conversão selecionada para a MCC está incompleta ou pertence a outra conta. Revise Configurações globais.');
  }
  const campaignName = String(input.campaignName ?? '').trim();
  const finalUrl = String(input.finalUrl ?? '').trim();
  const dailyBudget = String(input.dailyBudget ?? '').trim().replace(',', '.');
  const maxCpcBid = String(input.maxCpcBid ?? '').trim().replace(',', '.');
  const biddingStrategy = String(input.biddingStrategy ?? 'TARGET_CPA');
  const targetCpa = String(input.targetCpa ?? '').trim().replace(',', '.');
  const targetCpaCurrency = String(input.targetCpaCurrency ?? '').trim().toUpperCase();
  const targetRoasPercent = String(input.targetRoasPercent ?? '').trim().replace(',', '.');
  const impressionShareLocation = String(input.impressionShareLocation ?? '');
  const impressionSharePercent = String(input.impressionSharePercent ?? '').trim();
  const geoTargetingMode = input.geoTargetingMode == null ? 'COUNTRIES' : String(input.geoTargetingMode).trim().toUpperCase();
  const countryCodes = Array.isArray(input.geoTargetCountryCodes)
    ? normalizeGoogleAdsCountryCodes(input.geoTargetCountryCodes) : [];
  const keywords = Array.isArray(input.keywords) ? input.keywords.map(value => String(value ?? '').trim()) : [];
  const negativeKeywords = Array.isArray(input.negativeKeywords) ? input.negativeKeywords.map(value => String(value ?? '').trim()) : [];
  const individualKeywordMatch = input.individualKeywordMatch === true;
  const positiveKeywordError = individualKeywordMatch ? keywordListError(keywords.join('\n'), {required:true}) : '';
  const negativeKeywordError = individualKeywordMatch ? keywordListError(negativeKeywords.join('\n')) : '';
  const headlines = Array.isArray(input.headlines) ? input.headlines.map(value => String(value ?? '').trim()) : [];
  const descriptions = Array.isArray(input.descriptions) ? input.descriptions.map(value => String(value ?? '').trim()) : [];
  const decimalPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/;
  const biddingStrategies = ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS', 'TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE', 'MAXIMIZE_CLICKS', 'TARGET_IMPRESSION_SHARE', 'MANUAL_CPC'];
  const usesCpa = ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(biddingStrategy);
  const needsCpa = biddingStrategy === 'TARGET_CPA';
  const usesRoas = ['TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE'].includes(biddingStrategy);
  const needsRoas = biddingStrategy === 'TARGET_ROAS';
  const usesMaxCpc = ['MANUAL_CPC', 'MAXIMIZE_CLICKS', 'TARGET_IMPRESSION_SHARE'].includes(biddingStrategy);
  const needsMaxCpc = ['MANUAL_CPC', 'TARGET_IMPRESSION_SHARE'].includes(biddingStrategy);
  const usesImpressionShare = biddingStrategy === 'TARGET_IMPRESSION_SHARE';
  if (!campaignName || Array.from(campaignName).length > 128
      || !/^https:\/\//i.test(finalUrl) || !decimalPattern.test(dailyBudget) || Number(dailyBudget) <= 0
      || !biddingStrategies.includes(biddingStrategy)
      || (needsCpa && (!decimalPattern.test(targetCpa) || Number(targetCpa) <= 0))
      || (usesCpa && targetCpa && (!decimalPattern.test(targetCpa) || Number(targetCpa) <= 0))
      || (targetCpaCurrency && (!usesCpa || !/^[A-Z]{3}$/.test(targetCpaCurrency)))
      || (needsRoas && (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(targetRoasPercent) || Number(targetRoasPercent) <= 0))
      || (usesRoas && targetRoasPercent && (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(targetRoasPercent) || Number(targetRoasPercent) <= 0))
      || (needsMaxCpc && (!decimalPattern.test(maxCpcBid) || Number(maxCpcBid) <= 0))
      || (usesMaxCpc && maxCpcBid && (!decimalPattern.test(maxCpcBid) || Number(maxCpcBid) <= 0))
      || (usesImpressionShare && !['ANYWHERE_ON_PAGE', 'TOP_OF_PAGE', 'ABSOLUTE_TOP_OF_PAGE'].includes(impressionShareLocation))
      || (usesImpressionShare && !/^(?:[1-9]|[1-9]\d|100)$/.test(impressionSharePercent))
      || (!usesImpressionShare && (impressionShareLocation || impressionSharePercent))
      || !['COUNTRIES', 'WORLD'].includes(geoTargetingMode)
      || (geoTargetingMode === 'WORLD'
        ? countryCodes.length !== 0
        : (countryCodes.length < 1 || countryCodes.some(code => !/^[A-Z]{2}$/.test(code))))
      || new Set(countryCodes).size !== countryCodes.length
      || !['EXACT', 'PHRASE', 'BROAD'].includes(input.keywordMatchType)
      || !['EXACT', 'PHRASE', 'BROAD'].includes(input.negativeKeywordMatchType)
      || keywords.length < 1 || keywords.length > 100 || positiveKeywordError || (!individualKeywordMatch && keywords.some(value => !value || Array.from(value).length > 80))
      || new Set(keywords.map(value => value.toLocaleLowerCase())).size !== keywords.length
      || negativeKeywords.length > 100 || negativeKeywordError || (!individualKeywordMatch && negativeKeywords.some(value => !value || Array.from(value).length > 80))
      || new Set(negativeKeywords.map(value => value.toLocaleLowerCase())).size !== negativeKeywords.length
      || typeof input.targetSearchNetwork !== 'boolean' || typeof input.targetContentNetwork !== 'boolean'
      || !['DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING', 'CONTAINS_EU_POLITICAL_ADVERTISING'].includes(input.containsEuPoliticalAdvertising)
      || typeof input.trackingUrlTemplate !== 'string' || typeof input.finalUrlSuffix !== 'string'
      || headlines.length !== 10 || descriptions.length !== 3
      || headlines.some(value => !value || Array.from(value).length > 30)
      || descriptions.some(value => !value || Array.from(value).length > 90)) {
    throw new Error('Revise nome, URL, orçamento, estratégia de lances, destino geográfico, palavras-chave, redes, declaração política, 10 títulos e 3 descrições.');
  }
  const promotion = input.promotion;
  const expectedPromotionKeys = ['discount_type', 'discount_value', 'end_date', 'language_code', 'occasion', 'start_date', 'target', 'trigger_type', 'trigger_value'];
  if (!promotion || typeof promotion !== 'object'
      || Object.keys(promotion).sort().join('|') !== expectedPromotionKeys.sort().join('|')) {
    throw new Error('Preencha todos os campos da promoção.');
  }
  return {
    ...ids,
    ...(conversionActionName ? {
      conversion_action_name: conversionActionName,
      conversion_action_resource_name: conversionActionResourceName,
    } : {}),
    campaign_name: campaignName,
    final_url: finalUrl,
    daily_budget: dailyBudget,
    max_cpc_bid: maxCpcBid,
    bidding_strategy: biddingStrategy,
    bidding_settings: {
      target_cpa: usesCpa ? targetCpa : '',
      target_cpa_currency: usesCpa ? targetCpaCurrency : '',
      target_roas_percent: usesRoas ? targetRoasPercent : '',
      impression_share_location: usesImpressionShare ? impressionShareLocation : '',
      impression_share_percent: usesImpressionShare ? impressionSharePercent : '',
    },
    geo_target_country_codes: countryCodes,
    ...(geoTargetingMode === 'WORLD' ? { geo_targeting_mode: 'WORLD' } : {}),
    keywords,
    keyword_match_type: input.keywordMatchType,
    ...(individualKeywordMatch ? {keyword_individual_match:true} : {}),
    negative_keywords: negativeKeywords,
    negative_keyword_match_type: input.negativeKeywordMatchType,
    network_settings: {
      target_search_network: input.targetSearchNetwork,
      target_content_network: input.targetContentNetwork,
    },
    contains_eu_political_advertising: input.containsEuPoliticalAdvertising,
    tracking_url_template: input.trackingUrlTemplate.trim(),
    final_url_suffix: input.finalUrlSuffix.trim(),
    headlines,
    descriptions,
    promotion,
  };
}

function previewContextKey(managerCustomerId, customerId, geoTargetingMode, countryCodes, conversionActionResourceName = '') {
  return [managerCustomerId, customerId, geoTargetingMode, countryCodes.join(','), conversionActionResourceName].join('|');
}

function campaignNameLookupKey(managerCustomerId, customerId, campaignName) {
  return JSON.stringify([managerCustomerId, customerId, campaignName]);
}

/** Prepare reusable, short-lived server contexts for one selected set of campaign previews. */
export async function prepareGoogleAdsSearchCampaignPreviewContexts(inputs, options) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 500) {
    throw new Error('Não foi possível preparar o contexto da prévia para as contas selecionadas.');
  }
  const specsByManager = new Map();
  const namesByManager = new Map();
  const entryKeys = new Set();
  const accountKeys = new Set();
  let hasSelectedConversionAction = false;
  for (const input of inputs) {
    const params = campaignParameters(input);
    const geoTargetingMode = params.geo_targeting_mode || 'COUNTRIES';
    const countries = params.geo_target_country_codes;
    const actionResourceName = params.conversion_action_resource_name || '';
    const key = previewContextKey(params.manager_customer_id, params.customer_id, geoTargetingMode, countries, actionResourceName);
    entryKeys.add(key);
    if (actionResourceName) hasSelectedConversionAction = true;
    accountKeys.add(params.manager_customer_id + '|' + params.customer_id);
    if (!specsByManager.has(params.manager_customer_id)) specsByManager.set(params.manager_customer_id, new Map());
    specsByManager.get(params.manager_customer_id).set(key, {
      customer_id: params.customer_id,
      geo_targeting_mode: geoTargetingMode,
      geo_target_country_codes: countries,
      ...(actionResourceName ? {
        conversion_action_name: params.conversion_action_name,
        conversion_action_resource_name: actionResourceName,
      } : {}),
    });
    if (!namesByManager.has(params.manager_customer_id)) namesByManager.set(params.manager_customer_id, new Map());
    const namesByCustomer = namesByManager.get(params.manager_customer_id);
    if (!namesByCustomer.has(params.customer_id)) namesByCustomer.set(params.customer_id, new Set());
    namesByCustomer.get(params.customer_id).add(params.campaign_name);
  }

  const contexts = new Map();
  const nameLookupContexts = new Map();
  const conversionAccounts = new Set();
  let nameLookupQueryCount = 0;
  for (const [managerCustomerId, specs] of specsByManager) {
    const requested = [...specs.values()];
    if (requested.length > 100) throw new Error('Prepare a prévia em grupos de até 100 combinações de conta e destino por MCC.');
    const campaignNamesByCustomer = [...(namesByManager.get(managerCustomerId) || new Map())]
      .map(([customerId, names]) => ({ customer_id: customerId, campaign_names: [...names] }));
    const requestParameters = { manager_customer_id: managerCustomerId, contexts: requested };
    if (campaignNamesByCustomer.length) requestParameters.campaign_names_by_customer = campaignNamesByCustomer;
    let payload;
    try {
      payload = await creationRequest('prepare_search_campaign_preview_contexts', requestParameters, options);
    } catch (error) {
      // An older private service rejects the optional field before making Ads API calls.
      // Retry with its established contract; previews then use the per-name lookup.
      if (error?.code !== 'invalid_payload' || !campaignNamesByCustomer.length || hasSelectedConversionAction) throw error;
      payload = await creationRequest('prepare_search_campaign_preview_contexts', {
        manager_customer_id: managerCustomerId,
        contexts: requested,
      }, options);
    }
    if (payload?.schema_version !== 1 || payload.operation !== 'prepare_search_campaign_preview_contexts'
        || payload.context_count !== requested.length || !Number.isInteger(payload.conversion_customer_count)
        || payload.conversion_customer_count < 1 || !Array.isArray(payload.contexts)
        || payload.contexts.length !== requested.length) {
      throw new Error('O servidor não confirmou todos os contextos compartilhados de MCC. Nenhuma prévia de campanha foi iniciada.');
    }
    const expected = new Map(requested.map(spec => [previewContextKey(managerCustomerId, spec.customer_id, spec.geo_targeting_mode, spec.geo_target_country_codes, spec.conversion_action_resource_name || ''), spec]));
    const expectedNameLookups = new Map();
    for (const item of campaignNamesByCustomer) {
      for (const campaignName of item.campaign_names) {
        expectedNameLookups.set(campaignNameLookupKey(managerCustomerId, item.customer_id, campaignName), {
          customer_id: item.customer_id,
          campaign_name: campaignName,
        });
      }
    }
    if (Object.hasOwn(payload, 'campaign_name_lookup_query_count')) {
      if (payload.campaign_name_lookup_count !== expectedNameLookups.size
          || !Number.isInteger(payload.campaign_name_lookup_query_count)
          || payload.campaign_name_lookup_query_count < 0
          || payload.campaign_name_lookup_query_count > expectedNameLookups.size
          || !Array.isArray(payload.campaign_name_lookups)
          || payload.campaign_name_lookups.length !== expectedNameLookups.size) {
        throw new Error('O servidor não confirmou as buscas agrupadas de nome. Nenhuma prévia individual foi iniciada.');
      }
      const lookupItems = new Set();
      for (const item of payload.campaign_name_lookups) {
        const customerId = String(item?.customer_id ?? '');
        const campaignName = String(item?.campaign_name ?? '');
        const key = campaignNameLookupKey(managerCustomerId, customerId, campaignName);
        if (!expectedNameLookups.has(key) || lookupItems.has(key)
            || typeof item.lookup_context !== 'string' || item.lookup_context.length < 40) {
          throw new Error('O servidor retornou um resultado agrupado de nome incompatível. Nenhuma prévia individual foi iniciada.');
        }
        lookupItems.add(key);
        nameLookupContexts.set(key, item.lookup_context);
      }
      if (lookupItems.size !== expectedNameLookups.size) throw new Error('O servidor não cobriu todos os nomes da prévia.');
      nameLookupQueryCount += payload.campaign_name_lookup_query_count;
    }
    for (const item of payload.contexts) {
      const itemActionResourceName = String(item?.conversion_action_resource_name ?? '');
      const key = previewContextKey(managerCustomerId, String(item?.customer_id ?? ''), String(item?.geo_targeting_mode ?? ''), Array.isArray(item?.geo_target_country_codes) ? item.geo_target_country_codes : [], itemActionResourceName);
      const spec = expected.get(key);
      const selectedAction = Boolean(spec?.conversion_action_resource_name);
      if (!spec || contexts.has(key) || typeof item.preview_context !== 'string' || item.preview_context.length < 40
          || !/^\d{10}$/.test(String(item.conversion_customer_id ?? ''))
          || !/^[A-Z]{3}$/.test(String(item.account_currency ?? ''))
          || (!selectedAction && (item.custom_conversion_goal_name !== HUB_PURCHASE_CUSTOM_GOAL
            || item.conversion_action_name !== HUB_OFFLINE_PURCHASE_ACTION))
          || (selectedAction && (item.conversion_action_resource_name !== spec.conversion_action_resource_name
            || item.conversion_action_name !== spec.conversion_action_name || !String(item.custom_conversion_goal_name ?? '')))) {
        throw new Error('O servidor retornou um contexto de MCC incompatível. Nenhuma prévia de campanha foi iniciada.');
      }
      contexts.set(key, item.preview_context);
      conversionAccounts.add(managerCustomerId + '|' + item.conversion_customer_id);
      expected.delete(key);
    }
    if (expected.size) throw new Error('O servidor não confirmou todas as contas selecionadas para a prévia.');
  }
  if (contexts.size !== entryKeys.size) throw new Error('O contexto da prévia não cobre todas as contas e destinos selecionados.');
  return {
    contexts,
    accountCount: accountKeys.size,
    conversionAccountCount: conversionAccounts.size,
    nameLookupQueryCount,
    getContext(input) {
      const params = campaignParameters(input);
      const key = previewContextKey(params.manager_customer_id, params.customer_id,
        params.geo_targeting_mode || 'COUNTRIES', params.geo_target_country_codes, params.conversion_action_resource_name || '');
      return contexts.get(key) || '';
    },
    getCampaignNameLookupContext(input) {
      const params = campaignParameters(input);
      return nameLookupContexts.get(campaignNameLookupKey(
        params.manager_customer_id, params.customer_id, params.campaign_name,
      )) || '';
    },
  };
}

async function creationRequest(operation, parameters, options) {
  return requestGoogleAdsEndpoint(GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT, operation, parameters, {
    ...options,
    errorMessages: creationErrorMessages,
  });
}

async function creationStreamRequest(operation, parameters, options) {
  return requestGoogleAdsEndpointStream(GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT, operation, parameters, {
    ...options,
    errorMessages: creationErrorMessages,
  });
}

export async function temporaryValidateCampaignGoal(input, options) {
  const result = await creationRequest('temporary_validate_campaign_goal', {manager_customer_id: input.managerCustomerId, customer_id: input.customerId, campaign_name: input.campaignName}, options);
  if (result?.schema_version !== 1 || result.operation !== 'temporary_validate_campaign_goal' || typeof result.validated !== 'boolean' || !Number.isInteger(result.google_http_status) || !Array.isArray(result.google_error_codes)) throw new Error('O servidor não confirmou o teste temporário.');
  return result;
}

export async function applyExistingCampaignCustomGoal(input, options) {
  const result = await creationRequest('apply_existing_campaign_custom_goal', {manager_customer_id: input.managerCustomerId, customer_id: input.customerId, campaign_id: input.campaignId, campaign_name: input.campaignName, confirm: true}, options);
  if (result?.schema_version !== 1 || result.operation !== 'apply_existing_campaign_custom_goal' || result.verified !== true || result.status !== 'PAUSED' || String(result.campaign_id) !== String(input.campaignId) || result.campaign_name !== input.campaignName || result.goal_name !== 'meta personalizada da ação compra' || result.conversion_action_name !== 'Conversão compra off-line (upload)') throw new Error('O servidor não confirmou a configuração. Verifique antes de repetir.');
  return result;
}

export async function applyExistingCampaignDeliverySettings(input, options) {
  const result = await creationRequest('apply_existing_campaign_delivery_settings', {
    manager_customer_id: input.managerCustomerId,
    customer_id: input.customerId,
    campaign_id: input.campaignId,
    campaign_name: input.campaignName,
    confirm: true,
  }, options);
  if (result?.schema_version !== 1 || result.operation !== 'apply_existing_campaign_delivery_settings'
      || String(result.campaign_id) !== String(input.campaignId) || result.campaign_name !== input.campaignName
      || !['PAUSED', 'ENABLED'].includes(String(result.status ?? '')) || result.channel_type !== 'SEARCH'
      || typeof result.presence_verified !== 'boolean' || typeof result.presence_changed !== 'boolean'
      || typeof result.goal_verified !== 'boolean' || typeof result.goal_changed !== 'boolean'
      || typeof result.verified !== 'boolean'
      || (result.presence_verified && result.positive_geo_target_type !== HUB_POSITIVE_GEO_TARGET_TYPE)
      || (result.goal_verified && (result.goal_name !== HUB_PURCHASE_CUSTOM_GOAL
        || result.conversion_action_name !== HUB_OFFLINE_PURCHASE_ACTION))
      || (result.verified && (result.status !== 'PAUSED' || !result.presence_verified || !result.goal_verified))) {
    throw new Error('O servidor não confirmou o estado da campanha e suas configurações. Confira no Google Ads antes de repetir.');
  }
  const failureCode = String(result.failure_code || 'campaign_delivery_settings_unverified');
  return {
    verified: result.verified,
    presenceVerified: result.presence_verified,
    presenceChanged: result.presence_changed,
    positiveGeoTargetType: String(result.positive_geo_target_type || ''),
    goalVerified: result.goal_verified,
    goalChanged: result.goal_changed,
    goalName: String(result.goal_name || ''),
    conversionActionName: String(result.conversion_action_name || ''),
    status: String(result.status || ''),
    verifiedAtUtc: String(result.verified_at_utc || ''),
    failureCode,
    errorMessage: result.verified ? '' : (creationErrorMessages[failureCode]
      || 'A correção pode ter sido aplicada parcialmente. Consulte novamente o lote antes de tentar outra vez.'),
  };
}

export async function applyExistingCampaignEuPoliticalAdvertisingDeclarationBatch(input, options) {
  const targetDeclaration = 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING';
  const campaigns = Array.isArray(input?.campaigns) ? input.campaigns : [];
  if (!/^\d{10}$/.test(String(input?.managerCustomerId || '')) || !/^\d{10}$/.test(String(input?.customerId || ''))
      || campaigns.length < 1 || campaigns.length > 100
      || campaigns.some(campaign => !/^[1-9]\d{0,19}$/.test(String(campaign?.campaignId || ''))
        || typeof campaign?.campaignName !== 'string' || !campaign.campaignName.trim())) {
    throw new Error('O lote da declaração da UE não tem uma conta ou campanhas válidas.');
  }
  const expected = new Map(campaigns.map(campaign => [String(campaign.campaignId), campaign.campaignName]));
  if (expected.size !== campaigns.length) throw new Error('O lote contém IDs de campanha duplicados nesta conta.');
  const result = await creationRequest('apply_existing_campaign_eu_political_advertising_declaration_batch', {
    manager_customer_id: input.managerCustomerId,
    customer_id: input.customerId,
    campaigns: campaigns.map(campaign => ({ campaign_id: String(campaign.campaignId), campaign_name: campaign.campaignName })),
    confirm: true,
  }, options);
  if (result?.schema_version !== 1
      || result.operation !== 'apply_existing_campaign_eu_political_advertising_declaration_batch'
      || String(result.customer_id) !== String(input.customerId)
      || result.target_declaration !== targetDeclaration || typeof result.complete !== 'boolean'
      || !Array.isArray(result.campaigns) || result.campaigns.length !== campaigns.length) {
    throw new Error('O servidor não confirmou a aplicação em lote da declaração da UE. Confira no Google Ads antes de repetir.');
  }
  const seen = new Set();
  const rows = result.campaigns.map(item => {
    const campaignId = String(item?.campaign_id || '');
    const campaignName = item?.campaign_name;
    if (!expected.has(campaignId) || seen.has(campaignId) || campaignName !== expected.get(campaignId)
        || typeof item.declaration_verified !== 'boolean' || typeof item.declaration_changed !== 'boolean'
        || typeof item.declaration !== 'string' || item.declaration.length > 80
        || typeof item.status !== 'string' || item.status.length > 40
        || typeof item.channel_type !== 'string' || item.channel_type.length > 40
        || typeof item.failure_code !== 'string' || (item.declaration_verified && (item.declaration !== targetDeclaration
          || item.channel_type !== 'SEARCH' || !['PAUSED', 'ENABLED'].includes(item.status)))
        || (item.declaration_changed && !item.declaration_verified)) {
      throw new Error('A resposta da declaração da UE não corresponde às campanhas selecionadas. Confira no Google Ads antes de repetir.');
    }
    seen.add(campaignId);
    const failureCode = item.failure_code || '';
    return {
      campaignId,
      campaignName,
      status: ['PAUSED', 'ENABLED'].includes(item.status) ? item.status : '',
      channelType: item.channel_type === 'SEARCH' ? item.channel_type : '',
      declaration: item.declaration,
      targetDeclaration,
      verified: item.declaration_verified,
      changed: item.declaration_changed,
      failureCode,
      errorMessage: item.declaration_verified ? '' : (creationErrorMessages[failureCode]
        || 'A API não confirmou a declaração desta campanha. Confira no Google Ads antes de repetir.'),
      verifiedAtUtc: item.declaration_verified ? String(result.verified_at_utc || '') : '',
    };
  });
  if (seen.size !== expected.size) throw new Error('A resposta não incluiu todas as campanhas selecionadas. Confira no Google Ads antes de repetir.');
  return {
    complete: result.complete,
    campaignCount: rows.length,
    confirmedCount: Number.isInteger(result.confirmed_count) ? result.confirmed_count : rows.filter(item => item.verified).length,
    changedCount: Number.isInteger(result.changed_count) ? result.changed_count : rows.filter(item => item.changed).length,
    alreadyCorrectCount: Number.isInteger(result.already_correct_count) ? result.already_correct_count : 0,
    results: rows,
    verifiedAtUtc: String(result.verified_at_utc || ''),
  };
}

export async function inspectGoogleAdsCampaignGoal(input, options) {
  const payload = await creationRequest('inspect_campaign_goal', {manager_customer_id: input.managerCustomerId, customer_id: input.customerId, campaign_name: input.campaignName}, options);
  if (payload?.schema_version !== 1 || payload.operation !== 'inspect_campaign_goal' || typeof payload.found !== 'boolean' || !Array.isArray(payload.actions)) throw new Error('O servidor não confirmou o resultado da consulta.');
  if (payload.found && (payload.standard_goals_checked !== true || !Array.isArray(payload.standard_goals) || payload.standard_goals.some(goal => typeof goal?.biddable !== 'boolean' || typeof goal?.category !== 'string' || typeof goal?.origin !== 'string'))) throw new Error('A API não confirmou as metas padrão para lances.');
  if (payload.found && (payload.result?.campaign?.name !== input.campaignName || !/^[1-9]\d{0,19}$/.test(String(payload.result?.campaign?.id || '')))) throw new Error('A identificação da campanha não foi confirmada.');
  return payload;
}

export async function previewGoogleAdsSearchCampaign(input, options) {
  const parameters = campaignParameters(input);
  if (typeof input.previewContext === 'string' && input.previewContext !== '') parameters.preview_context = input.previewContext;
  if (typeof input.campaignNameLookupContext === 'string' && input.campaignNameLookupContext !== '') {
    parameters.campaign_name_lookup_context = input.campaignNameLookupContext;
  }
  const payload = await creationRequest('preview_search_campaign', parameters, options);
  if (payload?.existing_campaign === true) {
    const campaignId = String(payload.campaign_id ?? '');
    const adGroupId = String(payload.ad_group_id ?? '');
    const adGroupStatus = String(payload.ad_group_status ?? '');
    const adGroupCount = payload.ad_group_count;
    const channelType = String(payload.campaign_channel_type ?? '');
    if (payload?.schema_version !== 1 || payload.operation !== 'preview_search_campaign'
        || payload.validated_only !== false || payload.will_create_paused !== false
        || String(payload.campaign_name ?? '') !== String(input.campaignName ?? '')
        || !/^[1-9]\d{0,19}$/.test(campaignId)
        || !['PAUSED', 'ENABLED'].includes(String(payload.campaign_status ?? ''))
        || !/^[A-Z][A-Z_]{1,63}$/.test(channelType)
        || typeof payload.audience_grouped !== 'boolean'
        || !Number.isInteger(adGroupCount) || adGroupCount < 0 || adGroupCount > 2
        || (adGroupCount === 1 && (!/^[1-9]\d{0,19}$/.test(adGroupId) || !['ENABLED', 'PAUSED'].includes(adGroupStatus)))
        || (adGroupCount !== 1 && (adGroupId !== '' || adGroupStatus !== ''))) {
      throw new Error('A API encontrou uma campanha, mas não confirmou seus dados de identificação. Nenhuma ação foi liberada.');
    }
    return payload;
  }
  const worldMode = input.geoTargetingMode === 'WORLD';
  const responseModeMatches = worldMode
    ? payload.geo_targeting_mode === 'WORLD'
    : [undefined, 'COUNTRIES'].includes(payload.geo_targeting_mode);
  if (payload?.schema_version !== 1 || payload.operation !== 'preview_search_campaign'
      || payload.validated_only !== true || payload.campaign_status !== 'PAUSED'
      || payload.will_create_paused !== true || !/^[A-Z]{3}$/.test(String(payload.account_currency ?? ''))
      || String(payload.campaign_name ?? '') !== String(input.campaignName ?? '')
      || payload.bidding_strategy !== input.biddingStrategy
      || !responseModeMatches
      || !Array.isArray(payload.target_countries) || payload.target_countries.length !== input.geoTargetCountryCodes.length
      || !/^\d+$/.test(String(payload.daily_budget_micros ?? ''))
      || (['MANUAL_CPC', 'TARGET_IMPRESSION_SHARE'].includes(input.biddingStrategy) && !/^\d+$/.test(String(payload.max_cpc_bid_micros ?? '')))
      || (input.biddingStrategy === 'MAXIMIZE_CLICKS' && input.maxCpcBid && !/^\d+$/.test(String(payload.max_cpc_bid_micros ?? '')))
      || (input.biddingStrategy === 'TARGET_CPA' && !/^\d+$/.test(String(payload.target_cpa_micros ?? '')))
      || (input.biddingStrategy === 'TARGET_ROAS' && !(Number(payload.target_roas) > 0))) {
    throw new Error('A API não confirmou a prévia sem gravação. Nenhuma criação foi solicitada.');
  }
  validateHubCampaignPositiveGeoTarget(payload);
  validateHubCampaignConversionGoal(payload, { input });
  return payload;
}

export async function createGoogleAdsSearchCampaign(input, options) {
  const parameters = campaignParameters(input);
  const payload = await creationRequest('create_search_campaign', {
    ...parameters,
    confirm: true,
  }, options);
  const adGroupMatch = String(payload?.ad_group_resource_name ?? '').match(new RegExp('^customers/' + parameters.customer_id + '/adGroups/([1-9]\\d{0,19})$'));
  if (payload?.schema_version !== 1 || payload.operation !== 'create_search_campaign'
      || payload.created !== true || payload.verified !== true || payload.status !== 'PAUSED'
      || payload.positive_geo_target_type !== HUB_POSITIVE_GEO_TARGET_TYPE
      || (input.geoTargetingMode === 'WORLD' && payload.geo_targeting_mode !== 'WORLD')
      || (input.geoTargetingMode !== 'WORLD' && ![undefined, 'COUNTRIES'].includes(payload.geo_targeting_mode))
      || !/^[1-9]\d{0,19}$/.test(String(payload.campaign_id ?? ''))
      || !adGroupMatch || String(payload.campaign_name) !== String(input.campaignName).trim()) {
    const error = new Error('O servidor não confirmou a criação pausada. Confira a conta no Google Ads antes de repetir.');
    error.code = 'campaign_creation_unverified';
    throw error;
  }
  let goal;
  try { goal = validateHubCampaignConversionGoal(payload, { requireVerified: true, input }); }
  catch (error) {
    error.code = 'campaign_goal_configuration_unverified';
    throw error;
  }
  return {
    campaignId: String(payload.campaign_id),
    adGroupId: adGroupMatch[1],
    campaignName: payload.campaign_name,
    status: payload.status,
    geoTargetingMode: payload.geo_targeting_mode === 'WORLD' ? 'WORLD' : 'COUNTRIES',
    positiveGeoTargetType: HUB_POSITIVE_GEO_TARGET_TYPE,
    customConversionGoalName: goal.customConversionGoalName,
    conversionActionName: goal.conversionActionName,
    conversionActionResourceName: goal.conversionActionResourceName,
    verifiedAtUtc: typeof payload.verified_at_utc === 'string' ? payload.verified_at_utc : '',
  };
}

export async function applyGoogleAdsAudienceExclusions({ managerCustomerId, customerId, campaignId } = {}, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaign = String(campaignId ?? '');
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer) || !/^[1-9]\d{0,19}$/.test(campaign)) {
    throw new Error('Selecione uma MCC, uma conta Google Ads e uma campanha válida para aplicar as exclusões.');
  }
  const payload = await creationRequest('apply_audience_exclusions', {
    manager_customer_id: manager,
    customer_id: customer,
    campaign_id: campaign,
    confirm: true,
  }, options);
  const countFields = [
    'submitted_count', 'resolved_count', 'added_count', 'reactivated_count', 'already_present_count',
    'verified_count', 'unresolved_count', 'ambiguous_count', 'unsupported_count', 'conflict_count', 'failed_count',
  ];
  const nameFields = ['unresolved_names', 'ambiguous_names', 'unsupported_names', 'conflict_names'];
  const validNameLists = nameFields.every(field => Array.isArray(payload?.[field])
    && payload[field].every(value => typeof value === 'string' && value.length > 0));
  const validResolvedSegments = Array.isArray(payload?.resolved_segments) && payload.resolved_segments.every(segment =>
    segment && typeof segment === 'object'
      && typeof segment.name === 'string' && segment.name.length > 0
      && typeof segment.api_name === 'string' && segment.api_name.length > 0
      && /^[1-9]\d{0,19}$/.test(String(segment.id ?? ''))
      && String(segment.resource_name ?? '') === `customers/${customer}/userInterests/${segment.id}`
      && ['id', 'name'].includes(segment.resolution_source));
  if (payload?.schema_version !== 1 || payload.operation !== 'apply_audience_exclusions'
      || String(payload.campaign_id) !== campaign || payload.target_level !== 'CAMPAIGN'
      || typeof payload.verified !== 'boolean' || typeof payload.verification_available !== 'boolean'
      || !validNameLists || !validResolvedSegments
      || countFields.some(field => !Number.isInteger(payload[field]) || payload[field] < 0)
      || payload.submitted_count !== 13 || payload.resolved_count > payload.submitted_count
      || payload.resolved_segments.length !== payload.resolved_count
      || payload.verified_count > payload.resolved_count
      || payload.added_count + payload.reactivated_count + payload.already_present_count > payload.resolved_count
      || payload.unresolved_names.length !== payload.unresolved_count
      || payload.ambiguous_names.length !== payload.ambiguous_count
      || payload.unsupported_names.length !== payload.unsupported_count
      || payload.conflict_names.length !== payload.conflict_count) {
    throw new Error('O servidor não devolveu um resumo válido das exclusões. Confira a campanha antes de tentar novamente.');
  }
  return {
    campaignId: campaign,
    submittedCount: payload.submitted_count,
    resolvedCount: payload.resolved_count,
    addedCount: payload.added_count,
    reactivatedCount: payload.reactivated_count,
    alreadyPresentCount: payload.already_present_count,
    verifiedCount: payload.verified_count,
    unresolvedCount: payload.unresolved_count,
    ambiguousCount: payload.ambiguous_count,
    unsupportedCount: payload.unsupported_count,
    conflictCount: payload.conflict_count,
    failedCount: payload.failed_count,
    unresolvedNames: payload.unresolved_names,
    ambiguousNames: payload.ambiguous_names,
    unsupportedNames: payload.unsupported_names,
    conflictNames: payload.conflict_names,
    resolvedSegments: payload.resolved_segments.map(segment => ({
      name: segment.name,
      id: String(segment.id),
      apiName: segment.api_name,
      resolutionSource: segment.resolution_source,
    })),
    verificationAvailable: payload.verification_available,
    verified: payload.verified,
  };
}

export async function fetchGoogleAdsAudienceExclusionUploadCatalog({ managerCustomerId, customerId, campaignIds } = {}, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  const campaigns = Array.isArray(campaignIds) ? campaignIds.map(value => String(value ?? '')) : [];
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer)
      || campaigns.length < 1 || campaigns.length > 100
      || campaigns.some(value => !/^[1-9]\d{0,19}$/.test(value))
      || new Set(campaigns).size !== campaigns.length) {
    throw new Error('Selecione uma conta válida e campanhas identificadas para gerar a planilha de exclusões.');
  }
  const payload = await creationRequest('audience_exclusion_upload_catalog', {
    manager_customer_id: manager,
    customer_id: customer,
    campaign_ids: campaigns,
  }, options);
  const validAudiences = Array.isArray(payload?.audiences) && payload.audiences.every(audience =>
    audience && typeof audience === 'object'
      && ((typeof audience.id === 'string' && /^[1-9]\d{0,19}$/.test(audience.id) && audience.name === '')
        || (audience.id === '' && typeof audience.name === 'string' && audience.name.trim() !== '')));
  const audienceKeys = validAudiences
    ? payload.audiences.map(audience => audience.id ? 'id:' + audience.id : 'name:' + audience.name.trim().toLocaleLowerCase()) : [];
  if (payload?.schema_version !== 1 || payload.operation !== 'audience_exclusion_upload_catalog'
      || String(payload.customer_id) !== customer || payload.campaign_count !== campaigns.length
      || payload.exclusion_count_per_campaign !== 13 || !validAudiences || payload.audiences.length !== 13
      || new Set(audienceKeys).size !== 13
      || payload.audiences.filter(audience => audience.id).length + payload.audiences.filter(audience => audience.name).length !== 13) {
    throw new Error('O serviço não confirmou as 13 exclusões por campanha para a planilha.');
  }
  return {
    customerId: customer,
    campaignCount: payload.campaign_count,
    audiences: payload.audiences.map(audience => ({ id: audience.id, name: audience.name })),
  };
}

export async function fetchGoogleAdsAudienceTargetingUploadCsv({ managerCustomerId, groups } = {}, options = {}) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const targets = Array.isArray(groups) ? groups.map(group => ({
    customer_id: String(group?.customerId ?? '').replace(/\D/g, ''),
    campaign_id: String(group?.campaignId ?? ''),
    ad_group_id: String(group?.adGroupId ?? ''),
  })) : [];
  const keys = targets.map(group => group.customer_id + ':' + group.ad_group_id);
  if (!/^\d{10}$/.test(manager) || targets.length < 1 || targets.length > 1000
      || targets.length * 918 > 1000000
      || targets.some(group => !/^\d{10}$/.test(group.customer_id)
        || !/^[1-9]\d{0,19}$/.test(group.campaign_id)
        || !/^[1-9]\d{0,19}$/.test(group.ad_group_id))
      || new Set(keys).size !== targets.length) {
    throw new Error('A planilha exige uma MCC autorizada e grupos de anúncios únicos com IDs válidos.');
  }

  const expectedHeader = 'Action,Customer ID,Campaign,Campaign ID,Ad group,Ad group ID,Audience status,Audience,Audience ID,Type,Level,Bid adj.';
  const expectedRows = targets.length * 918;
  const totalGroups = targets.length;
  const csvChunks = [];
  let receivedInitialProgress = false;
  let completedGroups = 0;
  let completedRows = 0;
  let completion = null;
  const { onProgress, ...requestOptions } = options || {};
  const payload = await creationStreamRequest('audience_targeting_upload_csv_stream', {
    manager_customer_id: manager,
    groups: targets,
  }, {
    ...requestOptions,
    onMessage(event) {
      const validMetadata = event?.schema_version === 1
        && event.operation === 'audience_targeting_upload_csv_stream'
        && String(event.manager_customer_id) === manager
        && event.audience_count === 918
        && event.group_count === totalGroups
        && event.total_row_count === expectedRows;
      if (!validMetadata) throw new Error('O serviço retornou progresso incompatível com este lote.');
      if (event.type === 'progress') {
        const nextGroups = event.completed_groups;
        const nextRows = event.completed_rows;
        if (!Number.isInteger(nextGroups) || !Number.isInteger(nextRows)
            || nextGroups !== completedGroups && nextGroups !== completedGroups + 1
            || nextRows !== nextGroups * 918
            || typeof event.csv_chunk !== 'string' || !event.csv_chunk) {
          throw new Error('O serviço retornou uma contagem de grupos ou linhas inválida.');
        }
        let csvChunk = event.csv_chunk;
        if (nextGroups === 0) {
          const rawHeader = event.csv_chunk.replace(/^\uFEFF/, '').replace(/\r?\n$/, '');
          const normalizedHeader = rawHeader.split(',').map(field => {
            const trimmed = field.trim();
            return trimmed.startsWith('"') && trimmed.endsWith('"')
              ? trimmed.slice(1, -1).replace(/""/g, '"')
              : trimmed;
          }).join(',');
          if (receivedInitialProgress || csvChunks.length || normalizedHeader !== expectedHeader) {
            throw new Error('O serviço retornou um cabeçalho CSV incompatível: ' + JSON.stringify(event.csv_chunk.slice(0, 180)));
          }
          receivedInitialProgress = true;
          csvChunk = expectedHeader + '\r\n';
        } else {
          if (!receivedInitialProgress || nextGroups !== completedGroups + 1
              || (event.csv_chunk.match(/\r?\n/g) || []).length !== 918) {
            throw new Error('O serviço retornou um grupo CSV incompleto ou fora de ordem.');
          }
        }
        csvChunks.push(csvChunk);
        completedGroups = nextGroups;
        completedRows = nextRows;
        if (typeof onProgress === 'function') onProgress({
          completedGroups,
          totalGroups,
          completedRows,
          totalRows: expectedRows,
        });
        return;
      }
      if (event.type === 'complete') {
        if (!receivedInitialProgress || completedGroups !== totalGroups || completedRows !== expectedRows
            || event.completed_groups !== totalGroups || event.completed_rows !== expectedRows
            || Object.hasOwn(event, 'csv_chunk')) {
          throw new Error('O serviço encerrou antes de confirmar todos os grupos e linhas do CSV.');
        }
        completion = event;
        return;
      }
      throw new Error('O serviço retornou uma etapa de geração desconhecida.');
    },
  });
  const csvContent = csvChunks.join('');
  const lines = csvContent.trimEnd().split(/\r?\n/);
  if (!completion || payload !== completion || completion.audience_count !== 918
      || completion.group_count !== targets.length || completion.total_row_count !== expectedRows
      || lines.length !== expectedRows + 1 || lines[0] !== expectedHeader) {
    throw new Error('O serviço não confirmou os 918 públicos por grupo nem o formato da planilha.');
  }
  return {
    csvContent,
    audienceCount: completion.audience_count,
    groupCount: completion.group_count,
    rowCount: completion.total_row_count,
  };
}
