import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';

const commonErrorMessages = Object.freeze({
  api_unavailable: 'O endpoint Google Ads ainda não foi publicado no servidor. Use o pacote local em Tracking MVP.',
  api_not_configured: 'A API ainda não está configurada no servidor. Confira o token compartilhado do Hub.',
  credentials_missing: 'A credencial privada da conta de serviço ainda não está instalada no servidor.',
  not_authorized: 'O servidor recusou o token do Hub. Confira Integrações → Configurações globais.',
  origin_not_allowed: 'A origem local deste Hub ainda não está autorizada no servidor.',
  method_not_allowed: 'O servidor recusou o método solicitado.',
  invalid_payload: 'Os parâmetros enviados para a operação são inválidos.',
  google_ads_auth_failed: 'A conta de serviço não conseguiu autenticar na Google Ads API. Confira a chave privada no servidor.',
  google_ads_access_denied: 'O Google Ads recusou o acesso. Confira o acesso da conta de serviço à MCC/conta e o nível de acesso do projeto.',
  google_ads_quota_exceeded: 'A cota da Google Ads API foi excedida. Tente novamente mais tarde ou reduza as consultas.',
  google_ads_request_rejected: 'O Google Ads recusou a solicitação. Confira a conta e os parâmetros selecionados.',
  google_ads_unavailable: 'A Google Ads API está temporariamente indisponível. Tente novamente.',
  private_service_unavailable: 'O serviço privado do Google Ads não foi encontrado em private-tools.',
  server_error: 'O servidor não conseguiu concluir a solicitação.',
});

function hubToken() {
  const saved = readTrackingHubToken();
  if (!saved.token) throw new Error('Configure o token compartilhado em Integrações → Configurações globais antes de consultar.');
  return saved.token;
}

export async function requestGoogleAdsEndpoint(endpoint, operation, parameters, { fetchImpl = globalThis.fetch, token, errorMessages = {} } = {}) {
  const bearerToken = token === undefined ? hubToken() : token;
  if (!bearerToken) throw new Error('Configure o token compartilhado em Integrações → Configurações globais antes de consultar.');
  if (typeof fetchImpl !== 'function') throw new Error('Este navegador não disponibiliza a conexão necessária.');
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operation, ...parameters }),
      signal: controller.signal,
    });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('O servidor retornou uma resposta ilegível.'); }
    if (!response.ok || payload?.ok !== true) {
      const code = String(payload?.error || 'server_error');
      const message = errorMessages[code] || commonErrorMessages[code] || `O servidor respondeu com erro HTTP ${Number(response.status) || 'desconhecido'}.`;
      const error = new Error(message);
      error.code = code;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('A consulta excedeu 45 segundos. Tente novamente.');
    if (error instanceof TypeError) throw new Error('Não foi possível conectar ao servidor. Confira internet, HTTPS e CORS.');
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
