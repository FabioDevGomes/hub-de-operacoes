import { normalizeClickBankInsV8Report, normalizeTrackingApiReport } from './tracking-domain.mjs?v=3';

export const TRACKING_API_ENDPOINTS = Object.freeze({
  report: 'https://track.travenzo.shop/google-ads-report.php',
  csv: 'https://track.travenzo.shop/google-ads-csv.php',
  insV8Report: 'https://track.travenzo.shop/clickbank-ins-v8-report.php',
  insV8Csv: 'https://track.travenzo.shop/clickbank-ins-v8-csv.php',
});

const ERROR_MESSAGES = Object.freeze({
  api_not_configured: 'A API ainda não está configurada no servidor. Confira as chaves privadas de integração.',
  conversion_action_not_configured: 'O nome da ação de conversão ainda não está configurado no servidor.',
  not_authorized: 'Token não autorizado. Confira o token separado do postback ClickBank.',
  origin_not_allowed: 'O servidor ainda não autorizou a origem local http://127.0.0.1:8765.',
  method_not_allowed: 'Método não permitido pela API de Tracking.',
  no_eligible_conversions: 'Nenhuma conversão elegível no momento. O servidor não criou CSV vazio.',
  transaction_limit_exceeded: 'A consulta encontrou mais de 5.000 transações INS v8 e foi interrompida por segurança.',
  query_not_supported: 'A API não aceita parâmetros na URL; recarregue o Hub e tente novamente.',
  private_service_unavailable: 'O serviço privado do Tracking não foi encontrado ao lado da pasta pública.',
  server_error: 'O servidor não conseguiu concluir a leitura. Nenhum evento foi alterado.',
});

function readToken(token) {
  const value = String(token ?? '').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Informe o token de 64 caracteres configurado para o Hub.');
  return value;
}

async function withTrackingRequest(path, token, fetchImpl, expectCsv, normalizeReport = normalizeTrackingApiReport) {
  if (typeof fetchImpl !== 'function') throw new Error('A conexão com o servidor não está disponível neste navegador.');
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(path, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Accept: expectCsv ? 'text/csv' : 'application/json',
        Authorization: `Bearer ${readToken(token)}`,
      },
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

export function downloadClickBankInsV8Csv(token, { fetchImpl = globalThis.fetch } = {}) {
  return withTrackingRequest(TRACKING_API_ENDPOINTS.insV8Csv, token, fetchImpl, true);
}
