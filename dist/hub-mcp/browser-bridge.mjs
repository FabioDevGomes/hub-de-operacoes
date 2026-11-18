import { CampaignAnalysisDomain } from './campaign-analysis-domain.mjs';

const HUB_ORIGIN = 'http://127.0.0.1:8765';
const DATABASE_NAME = 'painel-campanhas';
const HEALTH_URL = '/api/presell/health';
const POLL_URL = '/api/mcp/bridge/poll';
const RESPOND_URL = '/api/mcp/bridge/respond';
const bridgeId = globalThis.crypto?.randomUUID?.();
const MAX_RETRY_DELAY_MS = 60_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readBaseSnapshot() {
  if (!globalThis.indexedDB?.databases) throw new Error('Este navegador não oferece inventário de IndexedDB para a leitura segura.');
  const databases = await indexedDB.databases();
  if (!databases.some(item => item.name === DATABASE_NAME)) throw new Error('A base local do Hub não está disponível nesta origem.');
  const { base } = await CampaignBaseReader.read({ openDatabase: openExistingDatabaseReadOnly });
  if (!base || !Array.isArray(base.campanhas) || !Array.isArray(base.diario)) throw new Error('A base local não contém o Diário de campanha esperado.');
  return base;
}

function openExistingDatabaseReadOnly() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME);
    request.onupgradeneeded = () => {
      request.transaction.abort();
      reject(new Error('A base do Hub mudou durante a consulta; tente novamente.'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('bases')) {
        database.close();
        reject(new Error('A base local do Hub não contém a store operacional esperada.'));
        return;
      }
      resolve(database);
    };
    request.onerror = () => reject(new Error('Não foi possível abrir a base local sem alteração de schema.'));
  });
}

function executeReadOnlyQuery(base, request) {
  if (request?.tool === 'find_campaigns') return CampaignAnalysisDomain.searchCampaigns(base, request.arguments || {});
  if (request?.tool === 'get_campaign_daily_history') return CampaignAnalysisDomain.getCampaignDailyHistory(base, request.arguments || {});
  throw new Error('Ferramenta de consulta não reconhecida.');
}

async function respond(request, result, error = null) {
  await fetch(RESPOND_URL, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bridge_id: bridgeId, request_id: request.request_id, result, error }),
  });
}

async function serviceRequest(request) {
  try {
    const base = await readBaseSnapshot();
    await respond(request, executeReadOnlyQuery(base, request));
  } catch (error) {
    await respond(request, null, String(error?.message || 'Falha na consulta somente leitura.').slice(0, 400));
  }
}

async function poll() {
  let retryDelay = 1500;
  while (true) {
    try {
      const response = await fetch(POLL_URL, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ bridge_id: bridgeId }),
      });
      if (response.status === 204) {
        retryDelay = 1500;
        await sleep(retryDelay);
        continue;
      }
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          console.warn(`[Hub MCP] Polling encerrado após resposta HTTP ${response.status}; esta versão do servidor não oferece a ponte MCP.`);
          return;
        }
        await sleep(retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
        continue;
      }
      retryDelay = 1500;
      const payload = await response.json();
      if (payload.request) await serviceRequest(payload.request);
    } catch {
      await sleep(retryDelay);
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
    }
  }
}

async function startBridgeIfSupported() {
  if (location.origin !== HUB_ORIGIN || !bridgeId || !globalThis.CampaignBaseReader) return;
  try {
    const response = await fetch(HEALTH_URL, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const health = await response.json();
    if (health?.mcpBridgeApi === true) void poll();
  } catch {
    // Health checks are a single read; an unavailable bridge must not create a retry loop.
  }
}

void startBridgeIfSupported();
