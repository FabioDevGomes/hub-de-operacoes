import { normalizeGoogleAdsConversionActions } from './google-ads-conversion-actions-domain.mjs?v=1';
import { requestGoogleAdsEndpoint } from './google-ads-http-client.mjs?v=2';

export const GOOGLE_ADS_READONLY_ENDPOINT = 'https://track.travenzo.shop/google-ads-readonly.php';

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
  search_term_campaigns_unavailable: 'O serviço PHP privado precisa ser atualizado para listar campanhas Search nesta tela.',
  search_term_campaigns_limit_exceeded: 'A conta excede o limite de 1.000 campanhas Search para montar o seletor.',
  final_url_hosts_unavailable: 'O serviço PHP privado ainda não consulta destinos finais dos anúncios. Publique a versão atualizada do serviço Google Ads.',
  final_url_hosts_limit_exceeded: 'A conta excede 5.000 anúncios ativos com destino final. O cache anterior foi preservado.',
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

export function fetchGoogleAdsAccounts(options) {
  return request('accounts', {}, options);
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

export async function fetchGoogleAdsConfiguration({ managerCustomerId, customerId }, options) {
  try { return await request('campaign_config', { manager_customer_id: managerCustomerId || null, customer_id: customerId }, options); }
  catch (error) {
    if (error.code === 'invalid_payload') throw new Error('Publique o serviço PHP privado atualizado para consultar status, orçamento e estratégia.');
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

export function fetchGoogleAdsDailyReport({ managerCustomerId, customerId, dateFrom, dateTo }, options) {
  return request('daily_report', {
    manager_customer_id: managerCustomerId || null,
    customer_id: customerId,
    date_from: dateFrom,
    date_to: dateTo,
  }, options);
}

export async function fetchGoogleAdsSearchTerms({ managerCustomerId, customerId, dateFrom, dateTo, campaignId = null }, options) {
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

