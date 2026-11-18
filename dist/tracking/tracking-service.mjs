import { normalizeClickBankInsV8Report, normalizeTrackingApiReport } from './tracking-domain.mjs?v=4';
import {
  normalizeTrackingDomainInput,
  normalizeTrackingDomainList,
  normalizeTrackingProductKey,
  normalizeTrackingProductLabel,
  normalizeTrackingDomainSave,
} from './tracking-domain-admin.mjs?v=11';
import { normalizeTrackingClicksReport, validateTrackingClicksDateRange } from './tracking-clicks-domain.mjs?v=7';
import { normalizeTrackingSalesPage } from './tracking-sales-domain.mjs?v=2';
import { normalizeTrackingCheckoutsReport } from './tracking-checkouts-domain.mjs?v=2';
import { normalizeGuruMediaBillingSalesPage, normalizeGuruMediaCampaignAttribution, normalizeGuruMediaSalesReport } from './tracking-gurumedia-domain.mjs?v=6';

export const TRACKING_API_ENDPOINTS = Object.freeze({
  report: 'https://track.travenzo.shop/google-ads-report.php',
  csv: 'https://track.travenzo.shop/google-ads-csv.php',
  insV8Report: 'https://track.travenzo.shop/clickbank-ins-v8-report.php',
  insV8Csv: 'https://track.travenzo.shop/clickbank-ins-v8-csv.php',
  clicksReport: 'https://track.travenzo.shop/tracking-clicks-report.php',
  sales: 'https://track.travenzo.shop/clickbank-ins-v8-sales.php',
  checkouts: 'https://track.travenzo.shop/clickbank-checkouts-report.php',
  domains: 'https://track.travenzo.shop/tracking-domains.php',
  guruMediaSales: 'https://track.travenzo.shop/gurumedia-sales-report.php',
});

const ERROR_MESSAGES = Object.freeze({
  api_not_configured: 'A API ainda não está configurada no servidor. Confira as chaves privadas de integração.',
  api_unavailable: 'A API de vendas por Track ainda não está instalada no servidor. O pacote local precisa ser publicado manualmente na Hostinger.',
  checkouts_api_unavailable: 'A API de checkouts por Track ainda não está instalada no servidor. Publique manualmente o pacote clickbank-checkouts-report na Hostinger.',
  conversion_action_not_configured: 'O nome da ação de conversão ainda não está configurado no servidor.',
  invalid_conversion_name: 'Informe o nome exato da ação de conversão cadastrada no Google Ads.',
  unsupported_content_type: 'O servidor esperava o nome da ação em JSON.',
  invalid_payload: 'O servidor não aceitou os dados do perfil de conversão.',
  payload_too_large: 'A configuração da ação excedeu o limite permitido.',
  not_authorized: 'Token não autorizado. Confira o token separado do postback ClickBank.',
  origin_not_allowed: 'O servidor ainda não autorizou a origem local http://127.0.0.1:8765.',
  method_not_allowed: 'Método não permitido pela API de Tracking.',
  no_eligible_conversions: 'Nenhuma conversão elegível no momento. O servidor não criou CSV vazio.',
  transaction_limit_exceeded: 'A consulta encontrou mais de 5.000 transações INS v8 e foi interrompida por segurança.',
  query_not_supported: 'A API não aceita parâmetros na URL; recarregue o Hub e tente novamente.',
  private_service_unavailable: 'O serviço privado do Tracking não foi encontrado ao lado da pasta pública.',
  server_error: 'O servidor não conseguiu concluir a leitura. Nenhum evento foi alterado.',
  domain_registry_unavailable: 'A tabela de domínios ainda não está disponível. Confirme a migração SQL e tente novamente.',
  invalid_domain: 'Informe um domínio HTTPS válido, sem caminho ou parâmetros.',
  invalid_product_label: 'Informe um nome de Track válido, com até 253 caracteres.',
  unsupported_content_type: 'A API de domínios aceita somente JSON.',
  invalid_payload: 'Os dados enviados para o cadastro de domínio são inválidos.',
  payload_too_large: 'A solicitação de domínio excedeu o limite permitido.',
  invalid_date_range: 'Informe um intervalo de datas UTC válido.',
  date_range_too_large: 'O período máximo por consulta é de 366 dias.',
  report_limit_exceeded: 'Há muitas combinações de data, produto e domínio. Reduza o período e tente novamente.',
  gurumedia_api_unavailable: 'A consulta de vendas GuruMedia ainda não está instalada no servidor. Publique o pacote manual correspondente.',
  service_unavailable: 'O servidor não conseguiu concluir a consulta de vendas GuruMedia. Confira a instalação e tente novamente.',
  invalid_report_type: 'O serviço privado GuruMedia ainda não oferece esta consulta. Atualize o pacote incremental correspondente.',
  invalid_cursor: 'A paginação de vendas GuruMedia expirou. Atualize novamente para reiniciar a sincronização.',
  invalid_track_accounts: 'O servidor rejeitou os IDs Google Ads enviados pelo manifesto. Confira se a conta filha e a MCC têm IDs numéricos completos de 10 dígitos.',
  admin_not_authorized: 'O token administrativo do Tracking está ausente ou inválido.',
  invalid_routes: 'Uma ou mais rotas GuruMedia não têm Track, MCC ou ação de conversão compatível.',
  mcc_not_allowed: 'A MCC da rota não está na lista autorizada no tracking-config.php do servidor.',
  duplicate_route: 'Há Tracks duplicadas na lista enviada ao servidor.',
  track_not_registered: 'Uma rota enviada não corresponde a uma Track GuruMedia cadastrada no servidor.',
  routes_not_configured: 'Sincronize pelo menos uma rota GuruMedia antes de ativar o envio automático.',
  sale_not_found: 'A venda selecionada não existe mais no servidor.',
  route_not_configured: 'A venda ainda não tem uma rota de MCC e ação de conversão sincronizada.',
  conversion_time_missing: 'A venda não tem horário real; ela não pode ser enviada sem inventar uma data.',
  click_identifier_missing: 'O clique associado não contém GCLID, GBRAID nem WBRAID.',
  click_identifier_ambiguous: 'O clique tem mais de um identificador Google; o envio foi bloqueado por segurança.',
  validation_required: 'Valide a venda com o Data Manager antes do envio real.',
  validation_stale: 'A venda ou a ação de conversão mudou depois da validação. Valide novamente antes de enviar.',
  click_missing: 'A venda não está ligada a um clique de saída único do Hub.',
  click_ambiguous: 'A venda está ligada a mais de um clique de saída; o envio foi bloqueado.',
  conversion_time_invalid: 'O horário real da venda não pôde ser interpretado com segurança.',
  value_invalid: 'O valor ou a moeda da comissão não são válidos para envio.',
  permission_denied: 'A Data Manager API recusou a permissão da conta de serviço para esta MCC ou ação.',
  google_ads_access_denied: 'O Google Ads recusou a consulta ClickView. Confira o acesso da conta de serviço à MCC e à conta filha.',
  google_ads_auth_failed: 'A conta de serviço não conseguiu autenticar no Google Ads para consultar ClickView.',
  google_ads_quota_exceeded: 'A cota da Google Ads API foi excedida durante a consulta ClickView. Tente novamente depois ou reduza o período.',
  google_ads_unavailable: 'A Google Ads API está temporariamente indisponível durante a consulta ClickView.',
  google_ads_request_rejected: 'O Google Ads recusou a consulta ClickView. Confira a conta filha e o vínculo com a MCC.',
});

function readToken(token) {
  const value = String(token ?? '').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Informe o token de 64 caracteres configurado para o Hub.');
  return value;
}

async function withTrackingRequest(path, token, fetchImpl, expectCsv, normalizeReport = normalizeTrackingApiReport, request = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A conexão com o servidor não está disponível neste navegador.');
  const controller = new AbortController();
  const timeoutMs = Number.isSafeInteger(request.timeoutMs) && request.timeoutMs > 0 ? Math.min(request.timeoutMs, 120000) : 15000;
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Accept: request.accept || (expectCsv ? 'text/csv' : 'application/json'),
      Authorization: `Bearer ${readToken(token)}`,
    };
    if (request.adminToken !== undefined) headers['X-Tracking-Admin'] = `Bearer ${readToken(request.adminToken)}`;
    if (request.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(path, {
      method: request.method || 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers,
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: controller.signal,
    });
    if (!response?.ok) {
      let code = '';
      try { code = (await response.json())?.error || ''; } catch {}
      const error = new Error(ERROR_MESSAGES[code] || `O servidor respondeu com erro HTTP ${Number(response?.status) || 'desconhecido'}.`);
      error.httpStatus = Number(response?.status) || 0;
      error.serverCode = code;
      throw error;
    }
    if (expectCsv) {
      const contentType = response.headers?.get?.('content-type') || '';
      if (!/^text\/csv(?:\s*;|$)/i.test(contentType)) throw new Error('O servidor não retornou um arquivo CSV.');
      return response.blob();
    }
    let payload;
    try { payload = await response.json(); } catch { throw new Error('O servidor retornou um relatório ilegível.'); }
    return normalizeReport(payload);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`A consulta ao servidor excedeu ${Math.ceil(timeoutMs / 1000)} segundos. Tente novamente.`);
    if (error instanceof TypeError) throw new Error('Não foi possível conectar. Confira internet, HTTPS e a configuração CORS do servidor.');
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function fetchTrackingReport(token, { fetchImpl = globalThis.fetch } = {}) {
  return withTrackingRequest(TRACKING_API_ENDPOINTS.report, token, fetchImpl, false);
}

export function downloadTrackingCsv(token, { fetchImpl = globalThis.fetch } = {}) {
  return withTrackingRequest(TRACKING_API_ENDPOINTS.csv, token, fetchImpl, true);
}

export function fetchClickBankInsV8Report(token, { fetchImpl = globalThis.fetch } = {}) {
  return withTrackingRequest(TRACKING_API_ENDPOINTS.insV8Report, token, fetchImpl, false, normalizeClickBankInsV8Report);
}

export function fetchTrackingClicksReport(token, dateRange, { platform = 'clickbank', includeTrafficSource = false, fetchImpl = globalThis.fetch } = {}) {
  const range = validateTrackingClicksDateRange(dateRange?.startDate, dateRange?.endDate);
  const normalizedPlatform = String(platform ?? '').trim().toLowerCase();
  if (!['clickbank', 'gurumedia'].includes(normalizedPlatform)) throw new Error('Selecione uma plataforma de Tracking válida.');
  const fetchReport = includeTrafficSource => withTrackingRequest(
      TRACKING_API_ENDPOINTS.clicksReport,
      token,
      fetchImpl,
      false,
      payload => normalizeTrackingClicksReport(payload, range, normalizedPlatform),
      {
        method: 'POST',
        body: {
          start_date: range.startDate,
          end_date: range.endDate,
          platform: normalizedPlatform,
          ...(includeTrafficSource ? { include_traffic_source: true } : {}),
        },
      },
    );
  if (normalizedPlatform !== 'gurumedia' || includeTrafficSource !== true) return fetchReport(false);
  return fetchReport(true).catch(error => {
    // Older report services reject the optional field; retry with the compatible legacy payload.
    if (error?.httpStatus !== 400 || error?.serverCode !== 'invalid_payload') throw error;
    return fetchReport(false);
  });
}

export function fetchTrackingSalesPage(token, { afterId, snapshotMaxId = null, fetchImpl = globalThis.fetch } = {}) {
  const isValidId = value => typeof value === 'string'
    && /^(?:0|[1-9]\d{0,19})$/.test(value)
    && (value.length < 20 || value <= '18446744073709551615');
  if (!isValidId(afterId)) {
    throw new Error('O cursor de vendas local é inválido.');
  }
  if (snapshotMaxId !== null && !isValidId(snapshotMaxId)) {
    throw new Error('O cursor máximo de vendas local é inválido.');
  }
  return withTrackingRequest(
    TRACKING_API_ENDPOINTS.sales,
    token,
    fetchImpl,
    false,
    payload => normalizeTrackingSalesPage(payload, { afterId, snapshotMaxId }),
    { method: 'POST', body: { after_id: afterId, snapshot_max_id: snapshotMaxId } },
  );
}

export function fetchTrackingCheckoutsReport(token, { fetchImpl = globalThis.fetch } = {}) {
  return withTrackingRequest(
    TRACKING_API_ENDPOINTS.checkouts,
    token,
    fetchImpl,
    false,
    normalizeTrackingCheckoutsReport,
    { accept: 'application/vnd.hub.clickbank-checkouts-v2+json' },
  );
}

export function fetchGuruMediaSalesReport(token, dateRange, { fetchImpl = globalThis.fetch } = {}) {
  const range = validateTrackingClicksDateRange(dateRange?.startDate, dateRange?.endDate);
  return withTrackingRequest(
    TRACKING_API_ENDPOINTS.guruMediaSales,
    token,
    fetchImpl,
    false,
    payload => normalizeGuruMediaSalesReport(payload, range),
    { method: 'POST', body: { start_date: range.startDate, end_date: range.endDate } },
  );
}

export function fetchGuruMediaCampaignAttribution(token, dateRange, trackAccounts, { fetchImpl = globalThis.fetch } = {}) {
  const range = validateTrackingClicksDateRange(dateRange?.startDate, dateRange?.endDate);
  if (!Array.isArray(trackAccounts) || trackAccounts.length > 100) {
    throw new Error('O número de Tracks selecionadas para ClickView excede o limite permitido.');
  }
  return withTrackingRequest(
    TRACKING_API_ENDPOINTS.guruMediaSales,
    token,
    fetchImpl,
    false,
    payload => normalizeGuruMediaCampaignAttribution(payload, range),
    {
      method: 'POST',
      timeoutMs: 120000,
      body: {
        start_date: range.startDate,
        end_date: range.endDate,
        report_type: 'campaign_attribution',
        track_accounts: trackAccounts,
      },
    },
  );
}

function normalizeGuruMediaAdsResponse(payload, expectedType) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || payload.ok !== true || payload.report_type !== expectedType) {
    throw new Error('O servidor retornou uma resposta inválida para a integração GuruMedia → Google Ads.');
  }
  return payload;
}

function guruMediaAdsAdminRequest(token, adminToken, payload, expectedType, { fetchImpl = globalThis.fetch } = {}) {
  return withTrackingRequest(
    TRACKING_API_ENDPOINTS.guruMediaSales,
    token,
    fetchImpl,
    false,
    response => normalizeGuruMediaAdsResponse(response, expectedType),
    { method: 'POST', body: payload, adminToken },
  );
}

export function syncGuruMediaGoogleAdsRoutes(token, adminToken, routes, options) {
  if (!Array.isArray(routes) || routes.length > 500) throw new Error('O número de rotas GuruMedia excede o limite permitido.');
  return guruMediaAdsAdminRequest(token, adminToken, { report_type: 'google_ads_sync_routes', routes }, 'google_ads_sync_routes', options);
}

export function fetchGuruMediaGoogleAdsStatus(token, adminToken, options) {
  return guruMediaAdsAdminRequest(token, adminToken, { report_type: 'google_ads_status' }, 'google_ads_status', options);
}

export function setGuruMediaGoogleAdsEnabled(token, adminToken, liveEnabled, options) {
  if (typeof liveEnabled !== 'boolean') throw new Error('O estado do envio automático é inválido.');
  return guruMediaAdsAdminRequest(token, adminToken, { report_type: 'google_ads_set_enabled', live_enabled: liveEnabled }, 'google_ads_set_enabled', options);
}

function validateGuruMediaSaleKey(saleKey) {
  if (typeof saleKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saleKey)) {
    throw new Error('O identificador local da venda GuruMedia é inválido.');
  }
  return saleKey.toLowerCase();
}

export function validateGuruMediaGoogleAdsSale(token, adminToken, saleKey, options) {
  return guruMediaAdsAdminRequest(token, adminToken, {
    report_type: 'google_ads_validate_sale', sale_key: validateGuruMediaSaleKey(saleKey),
  }, 'google_ads_validate_sale', options);
}

export function sendGuruMediaGoogleAdsSale(token, adminToken, saleKey, options) {
  return guruMediaAdsAdminRequest(token, adminToken, {
    report_type: 'google_ads_send_sale', sale_key: validateGuruMediaSaleKey(saleKey),
  }, 'google_ads_send_sale', options);
}

export function fetchGuruMediaBillingSalesPage(token, dateRange, { pageSize = 500, afterSaleKey = null, fetchImpl = globalThis.fetch } = {}) {
  const range = validateTrackingClicksDateRange(dateRange?.startDate, dateRange?.endDate);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('O tamanho da página GuruMedia está fora do limite permitido.');
  if (afterSaleKey !== null && (typeof afterSaleKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(afterSaleKey))) {
    throw new Error('O cursor local da GuruMedia é inválido.');
  }
  return withTrackingRequest(
    TRACKING_API_ENDPOINTS.guruMediaSales,
    token,
    fetchImpl,
    false,
    payload => {
      const page = normalizeGuruMediaBillingSalesPage(payload, range);
      if (page.pageSize !== pageSize || (afterSaleKey !== null && page.nextCursor === afterSaleKey)) {
        throw new Error('A paginação GuruMedia não avançou conforme solicitado.');
      }
      return page;
    },
    { method: 'POST', body: { start_date: range.startDate, end_date: range.endDate, report_type: 'billing_sales', page_size: pageSize, after_sale_key: afterSaleKey } },
  );
}

export function downloadClickBankInsV8Csv(token, { conversionName, fetchImpl = globalThis.fetch } = {}) {
  const actionName = String(conversionName ?? '').trim();
  if (!actionName || new TextEncoder().encode(actionName).length > 255 || /[\u0000-\u001f\u007f]/u.test(actionName)) {
    throw new Error('Informe o nome exato da ação de conversão do perfil selecionado.');
  }
  return withTrackingRequest(
    TRACKING_API_ENDPOINTS.insV8Csv,
    token,
    fetchImpl,
    true,
    normalizeTrackingApiReport,
    { method: 'POST', body: { conversion_name: actionName } },
  );
}

async function withDomainRequest(token, { method, body, fetchImpl }) {
  if (typeof fetchImpl !== 'function') throw new Error('A conexão com o servidor não está disponível neste navegador.');
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000);
  try {
    const options = {
      method,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${readToken(token)}`,
      },
      signal: controller.signal,
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetchImpl(TRACKING_API_ENDPOINTS.domains, options);
    let payload = null;
    try { payload = await response?.json?.(); } catch {}
    if (!response?.ok) {
      const code = payload?.error || '';
      if (code === 'api_not_configured') {
        throw new Error('O endpoint de domínios ainda não está instalado ou o token administrativo ainda não foi configurado.');
      }
      if (code === 'origin_not_allowed') {
        throw new Error('A origem local do Hub não está autorizada na API administrativa.');
      }
      if (code === 'not_authorized') throw new Error('Token administrativo inválido. Confira o token separado do acesso às vendas.');
      throw new Error(ERROR_MESSAGES[code] || `O servidor respondeu com erro HTTP ${Number(response?.status) || 'desconhecido'}.`);
    }
    return method === 'GET' ? normalizeTrackingDomainList(payload) : normalizeTrackingDomainSave(payload);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A operação de domínios excedeu 15 segundos. Tente novamente.');
    if (error instanceof TypeError) throw new Error('Não foi possível conectar. Confira internet, HTTPS e o CORS da API administrativa.');
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function fetchTrackingDomains(token, { fetchImpl = globalThis.fetch } = {}) {
  return withDomainRequest(token, { method: 'GET', fetchImpl });
}

export function addTrackingDomain(token, domain, { includeWww = false, productKey, productLabel, platform = 'clickbank', offerId = null, fetchImpl = globalThis.fetch } = {}) {
  const normalizedDomain = normalizeTrackingDomainInput(domain);
  const normalizedProductKey = normalizeTrackingProductKey(productKey);
  const normalizedPlatform = String(platform ?? '').trim().toLowerCase();
  if (!['clickbank', 'gurumedia'].includes(normalizedPlatform)) throw new Error('Selecione ClickBank ou GuruMedia para esta Track.');
  const normalizedOfferId = normalizedPlatform === 'gurumedia'
    ? String(offerId ?? '').trim() || null
    : null;
  if (normalizedOfferId !== null && (!/^[A-Za-z0-9._-]{1,64}$/.test(normalizedOfferId))) {
    throw new Error('Informe um ID de oferta GuruMedia válido.');
  }
  const body = { domain: normalizedDomain, include_www: Boolean(includeWww), product_key: normalizedProductKey, platform: normalizedPlatform };
  if (normalizedOfferId !== null) body.offer_id = normalizedOfferId;
  if (productLabel !== undefined) body.product_label = normalizeTrackingProductLabel(productLabel).trim();
  return withDomainRequest(token, {
    method: 'POST',
    body,
    fetchImpl,
  }).then(result => {
    if (result.platform !== normalizedPlatform) throw new Error('O servidor não confirmou a plataforma desta Track. Publique a API de domínios e a migração de classificação antes de salvar.');
    if (normalizedOfferId !== null && result.offerId !== normalizedOfferId) throw new Error('O servidor não confirmou o ID da oferta. Publique a API de domínios e a migração de postbacks GuruMedia antes de salvar.');
    return result;
  });
}
