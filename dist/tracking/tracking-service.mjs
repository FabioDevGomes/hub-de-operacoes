import { normalizeClickBankInsV8Report, normalizeTrackingApiReport } from './tracking-domain.mjs?v=4';
import {
  normalizeTrackingDomainInput,
  normalizeTrackingDomainList,
  normalizeTrackingProductKey,
  normalizeTrackingProductLabel,
  normalizeTrackingDomainSave,
} from './tracking-domain-admin.mjs?v=7';
import { normalizeTrackingClicksReport, validateTrackingClicksDateRange } from './tracking-clicks-domain.mjs?v=1';
import { normalizeTrackingSalesPage } from './tracking-sales-domain.mjs?v=1';

export const TRACKING_API_ENDPOINTS = Object.freeze({
  report: 'https://track.travenzo.shop/google-ads-report.php',
  csv: 'https://track.travenzo.shop/google-ads-csv.php',
  insV8Report: 'https://track.travenzo.shop/clickbank-ins-v8-report.php',
  insV8Csv: 'https://track.travenzo.shop/clickbank-ins-v8-csv.php',
  clicksReport: 'https://track.travenzo.shop/tracking-clicks-report.php',
  sales: 'https://track.travenzo.shop/clickbank-ins-v8-sales.php',
  domains: 'https://track.travenzo.shop/tracking-domains.php',
});

const ERROR_MESSAGES = Object.freeze({
  api_not_configured: 'A API ainda não está configurada no servidor. Confira as chaves privadas de integração.',
  api_unavailable: 'A API de vendas por Track ainda não está instalada no servidor. O pacote local precisa ser publicado manualmente na Hostinger.',
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
});

function readToken(token) {
  const value = String(token ?? '').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Informe o token de 64 caracteres configurado para o Hub.');
  return value;
}

async function withTrackingRequest(path, token, fetchImpl, expectCsv, normalizeReport = normalizeTrackingApiReport, request = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A conexão com o servidor não está disponível neste navegador.');
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000);
  try {
    const headers = {
      Accept: expectCsv ? 'text/csv' : 'application/json',
      Authorization: `Bearer ${readToken(token)}`,
    };
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
      throw new Error(ERROR_MESSAGES[code] || `O servidor respondeu com erro HTTP ${Number(response?.status) || 'desconhecido'}.`);
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
    if (error?.name === 'AbortError') throw new Error('A consulta ao servidor excedeu 15 segundos. Tente novamente.');
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

export function fetchTrackingClicksReport(token, dateRange, { fetchImpl = globalThis.fetch } = {}) {
  const range = validateTrackingClicksDateRange(dateRange?.startDate, dateRange?.endDate);
  return withTrackingRequest(
    TRACKING_API_ENDPOINTS.clicksReport,
    token,
    fetchImpl,
    false,
    payload => normalizeTrackingClicksReport(payload, range),
    { method: 'POST', body: { start_date: range.startDate, end_date: range.endDate } },
  );
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

export function addTrackingDomain(token, domain, { includeWww = false, productKey, productLabel, fetchImpl = globalThis.fetch } = {}) {
  const normalizedDomain = normalizeTrackingDomainInput(domain);
  const normalizedProductKey = normalizeTrackingProductKey(productKey);
  const body = { domain: normalizedDomain, include_www: Boolean(includeWww), product_key: normalizedProductKey };
  if (productLabel !== undefined) body.product_label = normalizeTrackingProductLabel(productLabel).trim();
  return withDomainRequest(token, {
    method: 'POST',
    body,
    fetchImpl,
  });
}
