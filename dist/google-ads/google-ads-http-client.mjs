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

function responseDiagnostic(response) {
  const headers = response?.headers;
  const read = name => {
    try { return headers?.get?.(name) || ''; } catch { return ''; }
  };
  const id = read('X-Google-Ads-Diagnostic-ID');
  if (!id) return null;
  const upstreamStatus = Number(read('X-Google-Ads-Upstream-HTTP')) || null;
  const curlErrno = Number(read('X-Google-Ads-Curl-Errno')) || null;
  const list = name => read(name).split(',').map(value => value.trim()).filter(Boolean).slice(0, 3);
  return {
    id,
    stage: read('X-Google-Ads-Diagnostic-Stage') || '',
    upstreamHttpStatus: upstreamStatus,
    googleStatus: read('X-Google-Ads-Status') || '',
    googleRequestId: read('X-Google-Ads-Request-ID') || '',
    googleErrorCodes: list('X-Google-Ads-Error-Codes'),
    fieldPaths: list('X-Google-Ads-Field-Paths'),
    curlErrno,
    responseFormat: read('X-Google-Ads-Response-Format') || '',
    retryable: read('X-Google-Ads-Retryable') === 'true',
  };
}

export async function requestGoogleAdsEndpoint(endpoint, operation, parameters, { fetchImpl = globalThis.fetch, token, errorMessages = {}, signal: externalSignal = null } = {}) {
  const bearerToken = token === undefined ? hubToken() : token;
  if (!bearerToken) throw new Error('Configure o token compartilhado em Integrações → Configurações globais antes de consultar.');
  if (typeof fetchImpl !== 'function') throw new Error('Este navegador não disponibiliza a conexão necessária.');
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener?.('abort', abortFromCaller, { once: true });
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
      error.httpStatus = Number(response.status) || null;
      error.diagnostic = responseDiagnostic(response);
      throw error;
    }
    return payload;
  } catch (error) {
    if (externalSignal?.aborted) throw new DOMException('A consulta foi interrompida pela rotina automática.', 'AbortError');
    if (error?.name === 'AbortError') throw new Error('A consulta excedeu 45 segundos. Tente novamente.');
    if (error instanceof TypeError) throw new Error('Não foi possível conectar ao servidor. Confira internet, HTTPS e CORS.');
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener?.('abort', abortFromCaller);
  }
}

export async function requestGoogleAdsEndpointStream(endpoint, operation, parameters, {
  fetchImpl = globalThis.fetch,
  token,
  errorMessages = {},
  signal: externalSignal = null,
  onMessage = () => {},
  timeoutMs = 45000,
} = {}) {
  const bearerToken = token === undefined ? hubToken() : token;
  if (!bearerToken) throw new Error('Configure o token compartilhado em Integrações → Configurações globais antes de consultar.');
  if (typeof fetchImpl !== 'function') throw new Error('Este navegador não disponibiliza a conexão necessária.');
  if (typeof onMessage !== 'function') throw new Error('O leitor do progresso da operação está indisponível.');
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener?.('abort', abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const throwResponseError = (response, payload) => {
    const code = String(payload?.error || 'server_error');
    const message = errorMessages[code] || commonErrorMessages[code] || `O servidor respondeu com erro HTTP ${Number(response.status) || 'desconhecido'}.`;
    const error = new Error(message);
    error.code = code;
    error.httpStatus = Number(response.status) || null;
    error.diagnostic = responseDiagnostic(response);
    throw error;
  };
  let reader = null;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Accept: 'application/x-ndjson, application/json',
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operation, ...parameters }),
      signal: controller.signal,
    });
    const contentType = String(response.headers?.get?.('Content-Type') || '').toLowerCase();
    if (!response.ok || !contentType.includes('application/x-ndjson')) {
      let payload = null;
      try { payload = JSON.parse(await response.text()); } catch { /* handled below */ }
      if (!response.ok || payload?.ok !== true) throwResponseError(response, payload);
      throw new Error('O serviço não retornou o fluxo de progresso esperado. Atualize o serviço privado do Hub.');
    }

    const decoder = new TextDecoder();
    let pending = '';
    let completion = null;
    const consumeLine = line => {
      const normalized = line.trim();
      if (!normalized) return;
      let message;
      try { message = JSON.parse(normalized); } catch { throw new Error('O serviço retornou um evento de progresso ilegível.'); }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        throw new Error('O serviço retornou um evento de progresso inválido.');
      }
      if (message.ok === false) throwResponseError(response, message);
      if (message.ok !== true) throw new Error('O serviço retornou um evento de progresso inválido.');
      onMessage(message);
      if (message.type === 'complete') completion = message;
    };

    if (response.body?.getReader) {
      reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let newline = pending.indexOf('\n');
        while (newline >= 0) {
          consumeLine(pending.slice(0, newline));
          pending = pending.slice(newline + 1);
          newline = pending.indexOf('\n');
        }
      }
      pending += decoder.decode();
    } else {
      pending = await response.text();
    }
    if (pending.trim()) consumeLine(pending);
    if (!completion) throw new Error('O serviço encerrou a geração sem confirmar o CSV completo.');
    return completion;
  } catch (error) {
    try { await reader?.cancel?.(); } catch { /* no-op: preserve the original error */ }
    if (externalSignal?.aborted) throw new DOMException('A consulta foi interrompida pela rotina automática.', 'AbortError');
    if (error?.name === 'AbortError') throw new Error(`A geração excedeu ${Math.ceil(timeoutMs / 1000)} segundos. Tente novamente.`);
    if (error instanceof TypeError) throw new Error('Não foi possível conectar ao servidor. Confira internet, HTTPS e CORS.');
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener?.('abort', abortFromCaller);
  }
}
