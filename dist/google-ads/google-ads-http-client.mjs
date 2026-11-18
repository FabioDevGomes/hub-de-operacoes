import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';
import { normalizeGoogleAdsQuotaServerCounts } from './google-ads-quota-observability-domain.mjs?v=5';
import { recordGoogleAdsQuotaExecution } from './google-ads-quota-observability-storage.mjs?v=5';

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
  const encodedSummary = read('X-Google-Ads-Error-Summary');
  let googleErrorSummary = '';
  try { googleErrorSummary = decodeURIComponent(encodedSummary).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 420); }
  catch { /* A mensagem detalhada é opcional e nunca substitui o código diagnóstico. */ }
  return {
    id,
    stage: read('X-Google-Ads-Diagnostic-Stage') || '',
    upstreamHttpStatus: upstreamStatus,
    googleStatus: read('X-Google-Ads-Status') || '',
    googleRequestId: read('X-Google-Ads-Request-ID') || '',
    googleErrorCodes: list('X-Google-Ads-Error-Codes'),
    fieldPaths: list('X-Google-Ads-Field-Paths'),
    apiVersion: /^v\d+$/.test(read('X-Google-Ads-API-Version')) ? read('X-Google-Ads-API-Version') : '',
    apiOperation: /^[A-Za-z][A-Za-z0-9:]{0,60}$/.test(read('X-Google-Ads-API-Operation')) ? read('X-Google-Ads-API-Operation') : '',
    gaqlResource: /^[a-z][a-z0-9_]{0,59}$/.test(read('X-Google-Ads-GAQL-Resource')) ? read('X-Google-Ads-GAQL-Resource') : '',
    googleErrorSummary,
    curlErrno,
    responseFormat: read('X-Google-Ads-Response-Format') || '',
    retryable: read('X-Google-Ads-Retryable') === 'true',
  };
}

function responseServerCounts(response) {
  const headers = response?.headers;
  const read = name => {
    try { return headers?.get?.(name) || ''; } catch { return ''; }
  };
  const version = read('X-Hub-Google-Ads-Quota-Version').trim();
  const requestsResponded = read('X-Hub-Google-Ads-Requests-Responded').trim();
  const requestsUnknown = read('X-Hub-Google-Ads-Requests-Unknown').trim();
  const quotaOperationsEstimated = read('X-Hub-Google-Ads-Quota-Operations-Estimated').trim();
  const quotaOperationsUnknown = read('X-Hub-Google-Ads-Quota-Operations-Unknown').trim();
  const counts = [version, requestsResponded, requestsUnknown, quotaOperationsEstimated, quotaOperationsUnknown];
  if (!counts.every(value => /^\d+$/.test(value))) return null;
  return normalizeGoogleAdsQuotaServerCounts({
    version: Number(version),
    requestsResponded: Number(requestsResponded),
    requestsUnknown: Number(requestsUnknown),
    quotaOperationsEstimated: Number(quotaOperationsEstimated),
    quotaOperationsUnknown: Number(quotaOperationsUnknown),
  });
}

export async function requestGoogleAdsEndpoint(endpoint, operation, parameters, { fetchImpl = globalThis.fetch, token, errorMessages = {}, signal: externalSignal = null, timeoutMs = 45000, onQuotaTelemetry = null } = {}) {
  const bearerToken = token === undefined ? hubToken() : token;
  if (!bearerToken) throw new Error('Configure o token compartilhado em Integrações → Configurações globais antes de consultar.');
  if (typeof fetchImpl !== 'function') throw new Error('Este navegador não disponibiliza a conexão necessária.');
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener?.('abort', abortFromCaller, { once: true });
  const normalizedTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(180000, Math.floor(timeoutMs))) : 45000;
  const timeout = globalThis.setTimeout(() => controller.abort(), normalizedTimeoutMs);
  const startedAtUtc = new Date().toISOString();
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  let attemptStarted = false;
  let outcome = 'failed';
  let serverCounts = null;
  try {
    attemptStarted = true;
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
    serverCounts = responseServerCounts(response);
    let payload;
    try { payload = await response.json(); } catch { throw new Error('O servidor retornou uma resposta ilegível.'); }
    if (!response.ok || payload?.ok !== true) {
      const code = String(payload?.error || 'server_error');
      const message = errorMessages[code] || commonErrorMessages[code] || `O servidor respondeu com erro HTTP ${Number(response.status) || 'desconhecido'}.`;
      const error = new Error(message);
      error.code = code;
      const failure = payload?.failure;
      if (code === 'server_error' && failure && ['Error', 'TypeError', 'Exception'].includes(failure.type) && /^(?:google-ads-[a-z0-9-]+\.php|outro-arquivo)$/.test(failure.file || '') && Number.isSafeInteger(failure.line) && failure.line >= 0) {
        error.safeFailure = { type: failure.type, file: failure.file, line: failure.line, missingFunction: /^hub_google_ads_[a-z0-9_]+$/.test(failure.missing_function || '') ? failure.missing_function : '' };
      }
      error.httpStatus = Number(response.status) || null;
      error.diagnostic = responseDiagnostic(response);
      throw error;
    }
    outcome = 'success';
    return payload;
  } catch (error) {
    if (externalSignal?.aborted) {
      outcome = 'cancelled';
      throw new DOMException('A consulta foi interrompida pela rotina automática.', 'AbortError');
    }
    if (error?.name === 'AbortError') throw new Error('A consulta excedeu ' + Math.ceil(normalizedTimeoutMs / 1000) + ' segundos. Tente novamente.');
    if (error instanceof TypeError) {
      const transportError = new Error('O navegador não disponibilizou uma resposta HTTP para o Hub. A causa exata não ficou acessível; pode ser conexão/rede ou bloqueio de HTTPS/CORS.');
      transportError.code = 'browser_no_response';
      throw transportError;
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener?.('abort', abortFromCaller);
    if (attemptStarted) {
      try { recordGoogleAdsQuotaExecution({ operation, outcome, atUtc: startedAtUtc, durationMs: (globalThis.performance?.now?.() ?? Date.now()) - startedAt, serverCounts }); }
      catch { /* Local quota telemetry must never block the API operation. */ }
      try { onQuotaTelemetry?.({ operation, outcome, serverCounts }); }
      catch { /* Execution-specific quota display must never block the API operation. */ }
    }
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
  const startedAtUtc = new Date().toISOString();
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  let attemptStarted = false;
  let outcome = 'failed';
  let serverCounts = null;
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
    attemptStarted = true;
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
    serverCounts = responseServerCounts(response);
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
    outcome = 'success';
    return completion;
  } catch (error) {
    try { await reader?.cancel?.(); } catch { /* no-op: preserve the original error */ }
    if (externalSignal?.aborted) {
      outcome = 'cancelled';
      throw new DOMException('A consulta foi interrompida pela rotina automática.', 'AbortError');
    }
    if (error?.name === 'AbortError') throw new Error(`A geração excedeu ${Math.ceil(timeoutMs / 1000)} segundos. Tente novamente.`);
    if (error instanceof TypeError) {
      const transportError = new Error('O navegador não disponibilizou uma resposta HTTP para o Hub. A causa exata não ficou acessível; pode ser conexão/rede ou bloqueio de HTTPS/CORS.');
      transportError.code = 'browser_no_response';
      throw transportError;
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener?.('abort', abortFromCaller);
    if (attemptStarted) {
      try { recordGoogleAdsQuotaExecution({ operation, outcome, atUtc: startedAtUtc, durationMs: (globalThis.performance?.now?.() ?? Date.now()) - startedAt, serverCounts }); }
      catch { /* Local quota telemetry must never block the API operation. */ }
    }
  }
}
