import { normalizeGoogleAdsConversionActions } from './google-ads-conversion-actions-domain.mjs?v=1';
import { normalizeGoogleAdsGeographicReport } from './google-ads-geographic-domain.mjs?v=1';
import { requestGoogleAdsEndpoint } from './google-ads-http-client.mjs?v=6';

export const GOOGLE_ADS_READONLY_ENDPOINT = 'https://track.travenzo.shop/google-ads-readonly.php';

export async function fetchGoogleAdsGeographicDetailTest({managerCustomerId,customerId,campaignId,dateFrom,dateTo}, options) {
  if (!/^\d{10}$/.test(String(managerCustomerId)) || !/^\d{10}$/.test(String(customerId)) || !/^[1-9]\d{0,19}$/.test(String(campaignId)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateFrom)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateTo))) throw new Error('Campanha ou período inválido.');
  const payload=await request('geographic_detail_test',{manager_customer_id:managerCustomerId,customer_id:customerId,campaign_id:campaignId,date_from:dateFrom,date_to:dateTo},options);
  if(payload?.ok!==true||payload.operation!=='geographic_detail_test'||payload.query_complete!==true||payload.customer_id!==customerId||payload.manager_customer_id!==managerCustomerId||payload.campaign_id!==campaignId||payload.date_from!==dateFrom||payload.date_to!==dateTo||!Array.isArray(payload.baseline)||!Array.isArray(payload.details))throw new Error('Resposta geográfica incompleta ou de outra campanha.');
  return payload;
}

const errorMessages = Object.freeze({
  api_unavailable: 'O endpoint Google Ads ainda não foi publicado no servidor. Use o pacote local em Tracking MVP.',
  api_not_configured: 'A API ainda não está configurada no servidor. Confira o token compartilhado do Hub.',
  credentials_missing: 'A credencial privada da conta de serviço ainda não está instalada no servidor.',
  not_authorized: 'O servidor recusou o token do Hub. Confira Integrações → Configurações globais.',
  origin_not_allowed: 'A origem local deste Hub ainda não está autorizada no servidor.',
  method_not_allowed: 'O servidor recusou o método de consulta solicitado.',
  invalid_payload: 'Os parâmetros enviados para a consulta são inválidos.',
  conversion_actions_unavailable: 'O servidor ainda não oferece a consulta de ações de conversão. Publique a versão atualizada do serviço privado do Google Ads.',
  sao_paulo_day_report_unavailable: 'O serviço privado precisa ser atualizado para consultar ontem pelo dia completo de São Paulo.',
  sao_paulo_active_day_report_unavailable: 'O serviço privado ainda não aceita a consulta somente de campanhas ativas. Publique o PHP privado atualizado do Google Ads.',
  google_ads_timezone_unavailable: 'O servidor não conseguiu confirmar o fuso horário desta conta para montar o dia de São Paulo.',
  sao_paulo_day_timezone_unsupported: 'O fuso desta conta não permite dividir o dia de São Paulo em horas completas; nenhum horário aproximado foi usado.',
  sao_paulo_day_not_yesterday: 'O serviço privado ainda aceita somente ontem; publique a versão atualizada para recuperar D−1 pendente.',
  sao_paulo_day_outside_window: 'A data D−1 está fora da janela automática de recuperação de 14 dias.',
  invalid_date_range: 'Informe um intervalo de datas válido, com início anterior ao fim.',
  date_range_too_large: 'O período máximo por consulta é de 366 dias.',
  daily_date_range_too_large: 'A prévia diária permite no máximo 14 dias por consulta.',
  report_limit_exceeded: 'A consulta excedeu 1.000 campanhas. Reduza o período e tente novamente.',
  daily_report_limit_exceeded: 'A prévia excedeu 10.000 linhas. Reduza o período e tente novamente.',
  search_terms_unavailable: 'O serviço PHP privado precisa ser atualizado para consultar termos de pesquisa.',
  search_terms_date_range_too_large: 'A consulta de termos de pesquisa permite no máximo 31 dias.',
  search_terms_limit_exceeded: 'A consulta retornou mais de 1.000 linhas nesta conta. Reduza o período e tente novamente.',
  search_terms_campaign_filter_unavailable: 'O serviço PHP privado precisa ser atualizado para filtrar a consulta de termos pela campanha selecionada.',
  geographic_report_unavailable: 'O serviço PHP privado precisa ser atualizado para consultar localizações por país.',
  geographic_report_limit_exceeded: 'O relatório geográfico excedeu o limite de linhas. Nenhum resultado foi salvo.',
  geographic_date_range_too_large: 'O relatório geográfico permite no máximo 14 dias por consulta.',
  geographic_country_lookup_incomplete: 'O serviço não conseguiu identificar todos os países retornados. Nenhum resultado foi salvo.',
  search_term_campaigns_unavailable: 'O serviço PHP privado precisa ser atualizado para listar campanhas Search nesta tela.',
  search_term_campaigns_limit_exceeded: 'A conta excede o limite de 1.000 campanhas Search para montar o seletor.',
  final_url_hosts_unavailable: 'O serviço PHP privado ainda não consulta destinos finais dos anúncios. Publique a versão atualizada do serviço Google Ads.',
  final_url_hosts_limit_exceeded: 'A conta excede 5.000 anúncios ativos com destino final. O cache anterior foi preservado.',
  tracking_coverage_unavailable: 'O serviço PHP privado precisa ser atualizado para consultar a cobertura de rastreamento por campanha.',
  tracking_coverage_limit_exceeded: 'A conta excedeu o limite seguro de rotas para a auditoria de rastreamento. Nenhum resultado parcial foi tratado como cobertura completa.',
  google_ads_report_incomplete: 'O Google Ads devolveu uma resposta incompleta. Nenhum resultado incompleto foi considerado.',
  configuration_limit_exceeded: 'A configuração excedeu o limite de 1.000 campanhas ou estratégias. Nenhuma captura foi aplicada.',
  google_ads_auth_failed: 'A conta de serviço não conseguiu autenticar na Google Ads API. Confira a chave privada no servidor.',
  google_ads_access_denied: 'O Google Ads recusou o acesso. Confira o acesso da conta de serviço à MCC/conta e o nível de acesso do projeto.',
  google_ads_quota_exceeded: 'A cota da Google Ads API foi excedida. Tente novamente mais tarde ou reduza as consultas.',
  google_ads_request_rejected: 'O Google Ads recusou esta consulta. Confira a conta e o intervalo selecionados.',
  google_ads_unavailable: 'A Google Ads API está temporariamente indisponível. Tente novamente.',
  private_service_unavailable: 'O serviço privado do Google Ads não foi encontrado em private-tools.',
  server_error: 'O servidor não conseguiu concluir a consulta. Nenhuma campanha ou dado do Hub foi alterado.',
});

function request(operation, parameters, options) {
  return requestGoogleAdsEndpoint(GOOGLE_ADS_READONLY_ENDPOINT, operation, parameters, { ...options, errorMessages });
}

const ACCOUNT_METADATA_CONTEXT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_METADATA_CONTEXT_TOKEN = /^[A-Za-z0-9_-]{1,1800}\.[A-Za-z0-9_-]{43}$/;

function accountMetadataContextFields(date, token) {
  if (typeof date !== 'string' || !ACCOUNT_METADATA_CONTEXT_DATE.test(date)) return {};
  const fields = { account_metadata_context_date: date };
  if (typeof token === 'string' && token.length <= 2048 && ACCOUNT_METADATA_CONTEXT_TOKEN.test(token)) {
    fields.account_metadata_context_token = token;
  }
  return fields;
}

async function requestWithAccountMetadataContextFallback(operation, parameters, contextFields, options) {
  if (!Object.keys(contextFields).length) return request(operation, parameters, options);
  try {
    return await request(operation, { ...parameters, ...contextFields }, options);
  } catch (error) {
    if (error?.code !== 'invalid_payload') throw error;
    return request(operation, parameters, options);
  }
}

export function fetchGoogleAdsAccounts(options) {
  return request('accounts', {}, options);
}

export async function fetchGoogleAdsCampaignPolicyFindings({managerCustomerId,customerId,campaignIds},options) {
  const manager=managerCustomerId==null||managerCustomerId===''?null:String(managerCustomerId).replace(/\D/g,''),customer=String(customerId??'').replace(/\D/g,'');
  const ids=Array.isArray(campaignIds)?campaignIds.map(String):[];
  if(!/^\d{10}$/.test(customer)||(manager!==null&&!/^\d{10}$/.test(manager))||!ids.length||ids.length>1000||new Set(ids).size!==ids.length||ids.some(id=>!/^[1-9]\d{0,19}$/.test(id)))throw new Error('Conta ou campanhas inválidas para consultar políticas.');
  const payload=await request('campaign_policy_findings',{manager_customer_id:manager,customer_id:customer,campaign_ids:ids},options);
  if(payload?.ok!==true||payload.schema_version!==1||payload.complete!==true||payload.customer_id!==customer||(payload.manager_customer_id||null)!==manager||!Number.isFinite(Date.parse(payload.read_at_utc))||!Array.isArray(payload.campaign_ids)||payload.campaign_ids.length!==ids.length||ids.some(id=>!payload.campaign_ids.includes(id))||!Array.isArray(payload.ads)||payload.ads.length>10000)throw new Error('A resposta de políticas está incompleta ou pertence a outra conta.');
  const allowed=new Set(ids);
  for(const ad of payload.ads){if(!allowed.has(ad?.campaign_id)||!/^[1-9]\d{0,19}$/.test(String(ad.ad_group_id||''))||!/^[1-9]\d{0,19}$/.test(String(ad.ad_id||''))||typeof ad.approval_status!=='string'||!Array.isArray(ad.topics)||ad.topics.some(topic=>typeof topic?.topic!=='string'||!topic.topic||typeof topic.type!=='string'))throw new Error('A resposta de políticas contém anúncios inválidos.');}
  return payload;
}

export async function fetchGoogleAdsConversionActions({ managerCustomerId, customerId = managerCustomerId }, options) {
  const manager = String(managerCustomerId ?? '').replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer)) {
    throw new Error('Selecione uma MCC válida antes de carregar as ações de conversão.');
  }
  try {
    const payload = await request('conversion_actions', {
      manager_customer_id: manager,
      customer_id: customer,
    }, options);
    return normalizeGoogleAdsConversionActions(payload, { managerCustomerId: manager, customerId: customer });
  } catch (error) {
    if (error?.code === 'invalid_payload' || error?.code === 'conversion_actions_unavailable') {
      throw new Error(errorMessages.conversion_actions_unavailable);
    }
    throw error;
  }
}

export async function fetchGoogleAdsConfiguration({ managerCustomerId, customerId, accountMetadataContextToken = null, accountMetadataContextDate = null }, options) {
  const parameters = { manager_customer_id: managerCustomerId || null, customer_id: customerId };
  const contextFields = accountMetadataContextFields(accountMetadataContextDate, accountMetadataContextToken);
  try { return await requestWithAccountMetadataContextFallback('campaign_config', parameters, contextFields, options); }
  catch (error) {
    if (error.code === 'invalid_payload') throw new Error('Publique o serviço PHP privado atualizado para consultar status, orçamento e estratégia.');
    throw error;
  }
}

export async function fetchGoogleAdsCampaignTrackingCoverage({ managerCustomerId, customerId }, options) {
  const manager = managerCustomerId == null || managerCustomerId === '' ? null : String(managerCustomerId).replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(customer) || (manager != null && !/^\d{10}$/.test(manager))) {
    throw new Error('Selecione uma conta Google Ads válida antes de consultar a cobertura do rastreamento.');
  }
  try {
    return await request('campaign_tracking_coverage', {
      manager_customer_id: manager,
      customer_id: customer,
    }, options);
  } catch (error) {
    if (error?.code === 'invalid_payload') throw new Error(errorMessages.tracking_coverage_unavailable);
    throw error;
  }
}

export async function fetchGoogleAdsFinalUrlHosts({ managerCustomerId, customerId }, options) {
  const manager = managerCustomerId == null || managerCustomerId === '' ? null : String(managerCustomerId).replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(customer) || (manager != null && !/^\d{10}$/.test(manager))) {
    throw new Error('Selecione uma conta Google Ads válida antes de atualizar os domínios dos anúncios.');
  }
  try {
    return await request('final_url_hosts', { manager_customer_id: manager, customer_id: customer }, options);
  } catch (error) {
    if (error?.code === 'invalid_payload') throw new Error(errorMessages.final_url_hosts_unavailable);
    throw error;
  }
}

export function fetchGoogleAdsReport({ managerCustomerId, customerId, dateFrom, dateTo }, options) {
  return request('report', {
    manager_customer_id: managerCustomerId || null,
    customer_id: customerId,
    date_from: dateFrom,
    date_to: dateTo,
  }, options);
}

export function fetchGoogleAdsDailyReport({ managerCustomerId, customerId, dateFrom, dateTo, accountMetadataContextToken = null, accountMetadataContextDate = null }, options) {
  const parameters = {
    manager_customer_id: managerCustomerId || null,
    customer_id: customerId,
    date_from: dateFrom,
    date_to: dateTo,
  };
  return requestWithAccountMetadataContextFallback(
    'daily_report',
    parameters,
    accountMetadataContextFields(accountMetadataContextDate, accountMetadataContextToken),
    options
  );
}

export async function fetchGoogleAdsSearchTerms({ managerCustomerId, customerId, dateFrom, dateTo, campaignId = null, includePurchaseMetrics = false }, options) {
  try {
    const parameters = {
      manager_customer_id: managerCustomerId || null,
      customer_id: customerId,
      date_from: dateFrom,
      date_to: dateTo,
    };
    if (campaignId != null && campaignId !== '') {
      const normalizedCampaignId = String(campaignId);
      if (!/^[1-9]\d{0,19}$/.test(normalizedCampaignId)) throw new Error('O ID da campanha selecionada é inválido.');
      parameters.campaign_id = normalizedCampaignId;
    }
    if (includePurchaseMetrics === true) parameters.include_purchase_metrics = true;
    return await request('search_terms', parameters, options);
  } catch (error) {
    if (error?.code === 'invalid_payload' && campaignId != null && campaignId !== '') {
      throw new Error(errorMessages.search_terms_campaign_filter_unavailable);
    }
    if (error?.code === 'invalid_payload') throw new Error(errorMessages.search_terms_unavailable);
    throw error;
  }
}

export async function fetchGoogleAdsSearchTermCampaigns({ managerCustomerId, customerId }, options) {
  try {
    return await request('search_term_campaigns', {
      manager_customer_id: managerCustomerId || null,
      customer_id: customerId,
    }, options);
  } catch (error) {
    if (error?.code === 'invalid_payload') throw new Error(errorMessages.search_term_campaigns_unavailable);
    throw error;
  }
}

export async function fetchGoogleAdsSaoPauloDayReport({ managerCustomerId, customerId, businessDate, campaignStatusFilter = 'ALL' }, options) {
  try {
    const parameters = {
      manager_customer_id: managerCustomerId || null,
      customer_id: customerId,
      business_date: businessDate,
    };
    if (campaignStatusFilter === 'ENABLED') parameters.campaign_status_filter = 'ENABLED';
    else if (campaignStatusFilter !== 'ALL') throw new Error('Filtro de status de campanha inválido.');
    return await request('sao_paulo_day_report', parameters, options);
  } catch (error) {
    if (error?.code === 'invalid_payload') throw new Error(errorMessages[campaignStatusFilter === 'ENABLED' ? 'sao_paulo_active_day_report_unavailable' : 'sao_paulo_day_report_unavailable']);
    throw error;
  }
}

export async function fetchGoogleAdsGeographicReport({ managerCustomerId, customerId, dateFrom, dateTo }, options) {
  const manager = managerCustomerId == null || managerCustomerId === '' ? null : String(managerCustomerId).replace(/\D/g, '');
  const customer = String(customerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(customer) || (manager != null && !/^\d{10}$/.test(manager))) {
    throw new Error('Selecione uma conta Google Ads válida antes de consultar localizações.');
  }
  try {
    const payload = await request('geographic_report', {
      manager_customer_id: manager,
      customer_id: customer,
      date_from: dateFrom,
      date_to: dateTo,
    }, options);
    return normalizeGoogleAdsGeographicReport(payload, { managerCustomerId: manager, customerId: customer, dateFrom, dateTo });
  } catch (error) {
    if (error?.code === 'invalid_payload') throw new Error(errorMessages.geographic_report_unavailable);
    throw error;
  }
}

