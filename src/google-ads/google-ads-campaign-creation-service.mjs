import { requestGoogleAdsEndpoint, requestGoogleAdsEndpointStream } from './google-ads-http-client.mjs?v=3';
import { GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT } from './google-ads-campaign-actions-service.mjs?v=1';

const creationErrorMessages = Object.freeze({
  campaign_creation_disabled: 'A criação de campanhas está desativada no servidor. Nenhuma campanha foi criada.',
  campaign_account_not_allowed: 'Esta conta não está ativa e vinculada a uma MCC autorizada para criação.',
  campaign_country_not_targetable: 'Um dos países informados não foi localizado como destino ativo na Google Ads API. Confira os códigos ISO de duas letras.',
  campaign_country_limit_exceeded: 'A consulta de países excedeu o limite de segurança. Reduza a quantidade de países.',
  campaign_currency_mismatch: 'A moeda do CPA calculado não corresponde à moeda real da conta. Nenhuma campanha foi criada; ajuste o valor manualmente ou selecione uma conta compatível.',
  campaign_name_already_exists: 'Já existe uma campanha com este nome nesta conta. Escolha outro nome.',
  campaign_name_conflict: 'A consulta de nome duplicado retornou resultados ambíguos. Atualize a conta antes de tentar novamente.',
  campaign_creation_unverified: 'A solicitação pode ter sido processada, mas o servidor não confirmou a campanha. Confira a conta no Google Ads antes de tentar novamente.',
  audience_exclusion_campaign_must_be_paused: 'A campanha precisa ser Search e continuar pausada para receber estas exclusões.',
  audience_exclusion_campaign_setting_incompatible: 'A configuração de grupos de público da campanha impede exclusões por segmento. Nenhuma exclusão foi aplicada.',
  audience_exclusion_target_mismatch: 'A campanha não corresponde à conta selecionada. Nenhuma exclusão foi aplicada.',
  audience_exclusion_target_unavailable: 'A campanha não foi encontrada nesta conta.',
  audience_exclusion_unverified: 'A API não confirmou as exclusões. Confira a campanha antes de repetir; critérios já ativos não serão duplicados.',
  audience_targeting_list_unavailable: 'A lista fixa de 918 públicos não está disponível ou não passou na validação do servidor.',
});

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
  const countryCodes = Array.isArray(input.geoTargetCountryCodes)
    ? input.geoTargetCountryCodes.map(value => String(value ?? '').trim().toUpperCase()) : [];
  const keywords = Array.isArray(input.keywords) ? input.keywords.map(value => String(value ?? '').trim()) : [];
  const negativeKeywords = Array.isArray(input.negativeKeywords) ? input.negativeKeywords.map(value => String(value ?? '').trim()) : [];
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
      || countryCodes.length < 1 || countryCodes.length > 20 || countryCodes.some(code => !/^[A-Z]{2}$/.test(code))
      || new Set(countryCodes).size !== countryCodes.length
      || !['EXACT', 'PHRASE', 'BROAD'].includes(input.keywordMatchType)
      || !['EXACT', 'PHRASE', 'BROAD'].includes(input.negativeKeywordMatchType)
      || keywords.length < 1 || keywords.length > 100 || keywords.some(value => !value || Array.from(value).length > 80)
      || new Set(keywords.map(value => value.toLocaleLowerCase())).size !== keywords.length
      || negativeKeywords.length > 100 || negativeKeywords.some(value => !value || Array.from(value).length > 80)
      || new Set(negativeKeywords.map(value => value.toLocaleLowerCase())).size !== negativeKeywords.length
      || typeof input.targetSearchNetwork !== 'boolean' || typeof input.targetContentNetwork !== 'boolean'
      || !['DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING', 'CONTAINS_EU_POLITICAL_ADVERTISING'].includes(input.containsEuPoliticalAdvertising)
      || typeof input.trackingUrlTemplate !== 'string' || typeof input.finalUrlSuffix !== 'string'
      || headlines.length !== 10 || descriptions.length !== 3
      || headlines.some(value => !value || Array.from(value).length > 30)
      || descriptions.some(value => !value || Array.from(value).length > 90)) {
    throw new Error('Revise nome, URL, orçamento, estratégia de lances, países, palavras-chave, redes, declaração política, 10 títulos e 3 descrições.');
  }
  const promotion = input.promotion;
  const expectedPromotionKeys = ['discount_type', 'discount_value', 'end_date', 'language_code', 'occasion', 'start_date', 'target', 'trigger_type', 'trigger_value'];
  if (!promotion || typeof promotion !== 'object'
      || Object.keys(promotion).sort().join('|') !== expectedPromotionKeys.sort().join('|')) {
    throw new Error('Preencha todos os campos da promoção.');
  }
  return {
    ...ids,
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
    keywords,
    keyword_match_type: input.keywordMatchType,
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

export async function previewGoogleAdsSearchCampaign(input, options) {
  const payload = await creationRequest('preview_search_campaign', campaignParameters(input), options);
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
  if (payload?.schema_version !== 1 || payload.operation !== 'preview_search_campaign'
      || payload.validated_only !== true || payload.campaign_status !== 'PAUSED'
      || payload.will_create_paused !== true || !/^[A-Z]{3}$/.test(String(payload.account_currency ?? ''))
      || String(payload.campaign_name ?? '') !== String(input.campaignName ?? '')
      || payload.bidding_strategy !== input.biddingStrategy
      || !Array.isArray(payload.target_countries) || payload.target_countries.length !== input.geoTargetCountryCodes.length
      || !/^\d+$/.test(String(payload.daily_budget_micros ?? ''))
      || (['MANUAL_CPC', 'TARGET_IMPRESSION_SHARE'].includes(input.biddingStrategy) && !/^\d+$/.test(String(payload.max_cpc_bid_micros ?? '')))
      || (input.biddingStrategy === 'MAXIMIZE_CLICKS' && input.maxCpcBid && !/^\d+$/.test(String(payload.max_cpc_bid_micros ?? '')))
      || (input.biddingStrategy === 'TARGET_CPA' && !/^\d+$/.test(String(payload.target_cpa_micros ?? '')))
      || (input.biddingStrategy === 'TARGET_ROAS' && !(Number(payload.target_roas) > 0))) {
    throw new Error('A API não confirmou a prévia sem gravação. Nenhuma criação foi solicitada.');
  }
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
      || !/^[1-9]\d{0,19}$/.test(String(payload.campaign_id ?? ''))
      || !adGroupMatch || String(payload.campaign_name) !== String(input.campaignName).trim()) {
    const error = new Error('O servidor não confirmou a criação pausada. Confira a conta no Google Ads antes de repetir.');
    error.code = 'campaign_creation_unverified';
    throw error;
  }
  return {
    campaignId: String(payload.campaign_id),
    adGroupId: adGroupMatch[1],
    campaignName: payload.campaign_name,
    status: payload.status,
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
