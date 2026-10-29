import { requestGoogleAdsEndpoint } from './google-ads-http-client.mjs?v=2';
import { GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT } from './google-ads-campaign-actions-service.mjs?v=1';

const errors = Object.freeze({
  campaign_duplication_unavailable: 'O serviço privado ainda não oferece duplicação. Publique a atualização do PHP antes de usar esta tela.',
  campaign_duplication_unsupported: 'A campanha tem recursos que não podem ser copiados para esta conta. Confira a lista de bloqueios da prévia.',
  campaign_duplication_plan_expired: 'A prévia expirou. Valide a cópia novamente antes de criar.',
  campaign_duplication_changed: 'A campanha de origem ou a lista de destinos mudou após a prévia. Atualize e valide novamente.',
  campaign_duplication_name_invalid: 'O nome da campanha não segue o padrão necessário para calcular a comissão e a sequência.',
  campaign_duplication_url_invalid: 'Informe uma URL HTTPS válida para a Pre-Sell de cada conta.',
  campaign_duplication_batch_too_large: 'Este lote ultrapassa o limite de 24 cópias validadas. Separe em lotes menores.',
  campaign_duplication_source_limit: 'A conta tem campanhas demais para montar uma lista segura nesta consulta.',
  campaign_duplication_sequence_unavailable: 'Não foi possível ler todas as campanhas para garantir a próxima numeração global.',
  campaign_duplication_sequence_too_large: 'O escopo da sequência ultrapassou a origem e as 20 contas de destino permitidas. Revise as contas marcadas.',
  campaign_duplication_resource_limit: 'A campanha tem recursos demais para uma cópia segura nesta versão.',
  campaign_duplication_plan_unavailable: 'Não foi possível guardar a prévia temporária no servidor.',
  campaign_duplication_entry_already_attempted: 'Esta cópia já foi tentada e não pode ser repetida com segurança. Faça uma nova prévia.',
  campaign_duplication_name_too_long: 'O nome calculado excede o limite aceito pelo Google Ads.',
  campaign_duplication_source_changed: 'A campanha de origem mudou. Faça a inspeção e a prévia novamente.',
  campaign_creation_disabled: 'A criação de campanhas está desativada no servidor. Nenhuma cópia foi criada.',
  campaign_account_not_allowed: 'A conta de origem ou destino não está ativa e vinculada a uma MCC autorizada para criação.',
  campaign_currency_mismatch: 'A moeda da conta de destino não corresponde à moeda da comissão da campanha.',
  campaign_name_already_exists: 'Já existe uma campanha com esse nome nesta conta. Valide novamente para atualizar a numeração global.',
  campaign_duplication_source_target: 'A conta de origem não pode ser marcada como destino da duplicação.',
  campaign_creation_unverified: 'A resposta não confirmou a cópia. Confira a conta antes de tentar novamente.',
});

function ids(managerCustomerId, customerId) {
  const manager = managerCustomerId == null ? null : String(managerCustomerId).replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  if ((manager !== null && !/^\d{10}$/.test(manager)) || !/^\d{10}$/.test(customer)) {
    throw new Error('Selecione uma MCC e uma conta Google Ads válidas.');
  }
  return { manager_customer_id: manager, customer_id: customer };
}

function request(operation, parameters, options) {
  return requestGoogleAdsEndpoint(GOOGLE_ADS_CAMPAIGN_ACTION_ENDPOINT, operation, parameters, {
    ...options,
    errorMessages: errors,
  });
}

export async function fetchGoogleAdsCampaignsForDuplication({ managerCustomerId, customerId }, options) {
  const payload = await request('campaign_duplication_list', ids(managerCustomerId, customerId), options);
  if (payload?.schema_version !== 1 || payload.operation !== 'campaign_duplication_list'
      || !Array.isArray(payload.campaigns) || payload.campaigns.length > 1000) {
    throw new Error('O servidor retornou uma lista inválida de campanhas para duplicação.');
  }
  const campaigns = payload.campaigns.map(item => ({
    campaignId: String(item?.campaign_id ?? ''),
    campaignName: String(item?.campaign_name ?? ''),
    status: String(item?.status ?? '').toUpperCase(),
    channelType: String(item?.channel_type ?? '').toUpperCase(),
    currencyCode: String(item?.currency_code ?? '').toUpperCase(),
  }));
  if (campaigns.some(item => !/^[1-9]\d{0,19}$/.test(item.campaignId) || !item.campaignName || item.channelType !== 'SEARCH')) {
    throw new Error('A lista de campanhas contém dados incompletos ou que não são Search.');
  }
  return campaigns;
}

export async function verifyGoogleAdsCampaignsForAssociation({ managerCustomerId, customerId, campaigns = [] }, options) {
  if (!Array.isArray(campaigns) || campaigns.length < 1 || campaigns.length > 100
      || campaigns.some(item => !item || typeof item !== 'object'
        || !/^[1-9]\d{0,19}$/.test(String(item.campaignId ?? ''))
        || typeof item.campaignName !== 'string' || !item.campaignName.trim())) {
    throw new Error('Selecione de 1 a 100 campanhas identificadas por ID e nome exato.');
  }
  const expected = new Map(campaigns.map(item => [String(item.campaignId), String(item.campaignName)]));
  if (expected.size !== campaigns.length) throw new Error('A seleção contém campanhas duplicadas.');
  let payload;
  try {
    payload = await request('campaign_duplication_list', {
      ...ids(managerCustomerId, customerId),
      campaign_ids: [...expected.keys()],
    }, options);
  } catch (error) {
    if (error?.code === 'invalid_payload') {
      throw new Error('O serviço privado ainda não oferece a conferência de campanhas para associação. Publique a atualização indicada no pacote de deploy.');
    }
    throw error;
  }
  if (payload?.schema_version !== 1 || payload.operation !== 'campaign_duplication_list'
      || !Array.isArray(payload.campaigns) || payload.campaigns.length !== expected.size) {
    throw new Error('A lista mudou durante a associação. Busque novamente e confira as campanhas selecionadas.');
  }
  const verified = payload.campaigns.map(item => {
    const campaignId = String(item?.campaign_id ?? '');
    const campaignName = String(item?.campaign_name ?? '');
    if (!expected.has(campaignId) || expected.get(campaignId) !== campaignName
        || !['PAUSED', 'ENABLED'].includes(String(item?.status ?? '').toUpperCase())
        || String(item?.channel_type ?? '').toUpperCase() !== 'SEARCH'
        || typeof item?.audience_grouped !== 'boolean'
        || !Number.isInteger(Number(item?.ad_group_count)) || Number(item.ad_group_count) < 0) {
      throw new Error('A conta, o nome ou os pré-requisitos de uma campanha mudaram. Busque novamente antes de associar.');
    }
    const adGroupCount = Number(item.ad_group_count);
    const adGroupId = adGroupCount === 1 ? String(item.ad_group_id ?? '') : '';
    const adGroupStatus = adGroupCount === 1 ? String(item.ad_group_status ?? '').toUpperCase() : '';
    if (adGroupCount === 1 && (!/^[1-9]\d{0,19}$/.test(adGroupId) || !adGroupStatus)) {
      throw new Error('O servidor retornou informações incompletas do grupo de anúncios. Busque novamente.');
    }
    return {
      campaignId,
      campaignName,
      status: String(item.status).toUpperCase(),
      channelType: 'SEARCH',
      currencyCode: String(item?.currency_code ?? '').toUpperCase(),
      audienceGrouped: item.audience_grouped,
      adGroupCount,
      adGroupId,
      adGroupStatus,
    };
  });
  if (new Set(verified.map(item => item.campaignId)).size !== expected.size) {
    throw new Error('O servidor retornou campanhas repetidas. Nenhum lote foi salvo.');
  }
  return verified;
}

export async function inspectGoogleAdsCampaignForDuplication({ managerCustomerId, customerId, campaignId }, options) {
  const campaign = String(campaignId ?? '');
  if (!/^[1-9]\d{0,19}$/.test(campaign)) throw new Error('Selecione uma campanha Search de origem.');
  const payload = await request('campaign_duplication_inspect', {
    ...ids(managerCustomerId, customerId), campaign_id: campaign,
  }, options);
  if (payload?.schema_version !== 1 || payload.operation !== 'campaign_duplication_inspect'
      || String(payload.campaign_id) !== campaign || !payload.source || !payload.resources
      || !Array.isArray(payload.blockers) || !Array.isArray(payload.sitelinks)) {
    throw new Error('O servidor retornou uma inspeção incompleta da campanha.');
  }
  return {
    campaignId: campaign,
    campaignName: String(payload.source.campaign_name ?? ''),
    status: String(payload.source.status ?? '').toUpperCase(),
    currencyCode: String(payload.source.currency_code ?? '').toUpperCase(),
    copyable: payload.copyable === true,
    resources: payload.resources,
    blockers: payload.blockers.map(value => String(value)),
    sitelinks: payload.sitelinks.map(item => ({
      text: String(item?.text ?? ''),
      sourceUrl: String(item?.source_url ?? ''),
      supported: item?.supported === true,
      reason: String(item?.reason ?? ''),
    })),
    sourceVersion: String(payload.source_version ?? ''),
  };
}

export async function previewGoogleAdsCampaignDuplication({ source, targets, sequenceAccounts, cpaPercents }, options) {
  const sourceIds = ids(source?.managerCustomerId, source?.customerId);
  const campaignId = String(source?.campaignId ?? '');
  const levels = [...new Set((Array.isArray(cpaPercents) ? cpaPercents : []).map(Number))].sort((a, b) => a - b);
  if (!/^[1-9]\d{0,19}$/.test(campaignId) || levels.length < 1 || levels.some(value => ![30, 40, 50, 60, 70, 80].includes(value))) {
    throw new Error('Selecione a campanha de origem e ao menos uma faixa de CPA entre 30% e 80%.');
  }
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 20) throw new Error('Selecione de 1 a 20 contas de destino.');
  const targetAccounts = targets.map(target => ({
    ...ids(target?.managerCustomerId, target?.customerId),
    name: String(target?.name ?? ''),
    currency_code: String(target?.currencyCode ?? '').toUpperCase(),
    pre_sell_url: String(target?.preSellUrl ?? '').trim(),
  }));
  if (!Array.isArray(sequenceAccounts) || sequenceAccounts.length < 1 || sequenceAccounts.length > 21) {
    throw new Error('A numeração global consulta somente a conta de origem e até 20 destinos marcados.');
  }
  const sequenceAccountRows = sequenceAccounts.map(account => ids(account?.managerCustomerId, account?.customerId));
  const sequenceKeys = sequenceAccountRows.map(account => account.manager_customer_id + ':' + account.customer_id);
  const expectedSequenceKeys = new Set([
    sourceIds.manager_customer_id + ':' + sourceIds.customer_id,
    ...targetAccounts.map(account => account.manager_customer_id + ':' + account.customer_id),
  ]);
  if (new Set(sequenceKeys).size !== sequenceKeys.length
      || expectedSequenceKeys.size !== sequenceKeys.length
      || sequenceKeys.some(key => !expectedSequenceKeys.has(key))) {
    throw new Error('A consulta da numeração deve conter exatamente a origem e as contas destino marcadas. Atualize MCCs e contas.');
  }
  const payload = await request('campaign_duplication_preview', {
    ...sourceIds,
    source_campaign_id: campaignId,
    target_accounts: targetAccounts,
    sequence_accounts: sequenceAccountRows,
    cpa_percents: levels,
  }, options);
  if (payload?.schema_version !== 1 || payload.operation !== 'campaign_duplication_preview'
      || payload.validated_only !== true || payload.will_create_paused !== true
      || typeof payload.plan_token !== 'string' || payload.plan_token.length < 32
      || !Array.isArray(payload.entries) || payload.entries.length !== targetAccounts.length * levels.length
      || !Array.isArray(payload.blockers) || typeof payload.source_version !== 'string'
      || !Number.isInteger(payload.sequence_accounts_checked) || payload.sequence_accounts_checked !== sequenceAccountRows.length || payload.sequence_accounts_checked > 21
      || typeof payload.sequence_reserved !== 'boolean' || !Number.isInteger(payload.sequence_start) || !Number.isInteger(payload.sequence_end)
      || payload.sequence_start < 1 || payload.sequence_end < payload.sequence_start || payload.sequence_end - payload.sequence_start + 1 !== targetAccounts.length * levels.length) {
    throw new Error('O servidor não confirmou uma prévia completa e sem gravação.');
  }
  const entries = payload.entries.map(item => ({
    entryId: String(item?.entry_id ?? ''),
    customerId: String(item?.customer_id ?? ''),
    accountName: String(item?.account_name ?? ''),
    campaignName: String(item?.campaign_name ?? ''),
    percent: Number(item?.percent),
    cpa: String(item?.cpa ?? ''),
    currencyCode: String(item?.currency_code ?? '').toUpperCase(),
    preSellUrl: String(item?.pre_sell_url ?? ''),
    validated: item?.validated === true,
    blockers: Array.isArray(item?.blockers) ? item.blockers.map(String) : [],
  }));
  if (entries.some(item => !item.entryId || !/^\d{10}$/.test(item.customerId)
      || !item.campaignName || ![30, 40, 50, 60, 70, 80].includes(item.percent)
      || !/^[A-Z]{3}$/.test(item.currencyCode))) {
    throw new Error('A prévia contém cópias inválidas ou incompletas.');
  }
  return {
    planToken: payload.plan_token,
    sourceVersion: payload.source_version,
    sourceName: String(payload.source_campaign_name ?? ''),
    existingSequenceMax: Number(payload.existing_sequence_max) || 0,
    sequenceAccountsChecked: Number(payload.sequence_accounts_checked),
    sequenceReserved: payload.sequence_reserved,
    sequenceStart: Number(payload.sequence_start),
    sequenceEnd: Number(payload.sequence_end),
    resources: payload.resources || {},
    sitelinks: Array.isArray(payload.sitelinks) ? payload.sitelinks : [],
    blockers: payload.blockers.map(String),
    entries,
    allValidated: entries.every(item => item.validated && item.blockers.length === 0) && payload.blockers.length === 0,
    willCreatePaused: true,
  };
}

export async function createGoogleAdsCampaignDuplicationEntry({ planToken, entryId }, options) {
  const token = String(planToken ?? '');
  const entry = String(entryId ?? '');
  if (token.length < 32 || !/^[a-zA-Z0-9_-]{1,80}$/.test(entry)) throw new Error('A prévia desta cópia não é válida. Valide novamente.');
  const payload = await request('campaign_duplication_create', {
    plan_token: token,
    entry_id: entry,
    confirm: true,
  }, options);
  if (payload?.schema_version !== 1 || payload.operation !== 'campaign_duplication_create'
      || payload.created !== true || payload.verified !== true || payload.status !== 'PAUSED'
      || String(payload.entry_id) !== entry || !/^[1-9]\d{0,19}$/.test(String(payload.campaign_id ?? ''))) {
    const error = new Error('A API não confirmou a cópia pausada. Confira a conta antes de repetir.');
    error.code = 'campaign_creation_unverified';
    throw error;
  }
  return {
    entryId: entry,
    campaignId: String(payload.campaign_id),
    campaignName: String(payload.campaign_name ?? ''),
    status: 'PAUSED',
    verifiedAtUtc: String(payload.verified_at_utc ?? ''),
  };
}
