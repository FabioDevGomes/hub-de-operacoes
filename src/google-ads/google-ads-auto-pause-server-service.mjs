import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';
import { readGoogleAdsCaptureSnapshotRetention } from './google-ads-capture-snapshot-retention.mjs?v=1';

export const GOOGLE_ADS_AUTO_PAUSE_SERVER_ENDPOINT = 'https://track.travenzo.shop/google-ads-auto-pause.php';
export const GOOGLE_ADS_AUTO_PAUSE_SERVER_REVISION_KEY = 'hub:google-ads:auto-pause-server-policy-revision:v1';
export const GOOGLE_ADS_AUTO_PAUSE_SERVER_LAST_SNAPSHOT_KEY = 'hub:google-ads:auto-pause-server-last-snapshot:v1';
export const GOOGLE_ADS_AUTO_PAUSE_SERVER_SNAPSHOT_IDS_KEY = 'hub:google-ads:auto-pause-server-snapshot-ids:v1';
export const GOOGLE_ADS_AUTO_PAUSE_SERVER_RECEIVED_SNAPSHOTS_KEY = 'hub:google-ads:auto-pause-server-received-snapshots:v1';
const GOOGLE_ADS_AUTO_PAUSE_SERVER_EVALUATION_INPUTS_KEY = 'hub:google-ads:auto-pause-server-evaluation-inputs:v1';

const AUTO_UPDATE_INTERVAL_KEY = 'hub.google-ads-auto-update:interval-minutes:v1';
const AUTO_UPDATE_INTERVALS = new Set([30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 240, 360, 720, 1440]);
const DEFAULT_INTERVAL_MINUTES = 60;
const AUTO_PAUSE_RULE_CODES = new Set(['negative_remaining', 'product_performance', 'minimum_product_performance', 'reference_competitor', 'campaign_age', 'campaign_zero_impressions', 'clicks_without_sale']);
const SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024;
const SNAPSHOT_PART_BYTES = 640 * 1024;

function isoDate(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function identityStartDate(exactNameValue, inferredYear, accountDate) {
  const exactName = String(exactNameValue || '').trim();
  const match = exactName.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s*(?:[–—-]\s*)?/);
  if (!match) return null;
  const reference = isoDate(accountDate);
  const storedYear = Number(inferredYear);
  const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3])
    : Number.isInteger(storedYear) && storedYear >= 2000 && storedYear <= 2100 ? String(storedYear)
      : reference?.slice(0, 4);
  return year ? isoDate(`${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`) : null;
}

function buildEvaluationInputs(snapshot, database, storage, remainingValues = new Map()) {
  if (!database || !Array.isArray(database.campanhas) || !Array.isArray(database.diario)
    || typeof globalThis.CampaignDatabase?.campaignTotalsMap !== 'function'
    || typeof globalThis.CampaignDatabase?.consecutiveZeroImpressionDays !== 'function') return null;
  const sourceId = String(snapshot?.id || '');
  let cached = {};
  try {
    const saved = JSON.parse(storage?.getItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_EVALUATION_INPUTS_KEY) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) cached = saved;
  } catch { /* Recalcula se o cache estiver indisponível ou inválido. */ }
  if (cached[sourceId]?.version === 2 && Array.isArray(cached[sourceId]?.campaigns)) return cached[sourceId];
  const campaignById = new Map(database.campanhas.map(campaign => [String(campaign.id), campaign]));
  const totalsById = globalThis.CampaignDatabase.campaignTotalsMap(database, true);
  const campaigns = [];
  for (const account of snapshot.accounts) {
    for (const campaign of account.campaigns) {
      const managerCustomerId = account.managerCustomerId ? String(account.managerCustomerId) : null;
      const customerId = String(account.customerId || '');
      const campaignId = String(campaign.campaignId || '');
      const internalId = String(campaign.campaignInternalId || '');
      const pauseInputs = internalId ? remainingValues.get(internalId) : null;
      const remainingRaw = pauseInputs?.remainingValue;
      const remainingValue = typeof remainingRaw === 'number' && Number.isFinite(remainingRaw) ? remainingRaw : null;
      const saleProtected = pauseInputs?.hasDiarySale === true;
      const stored = internalId ? campaignById.get(internalId) : null;
      const confirmed = isoDate(stored?.data_inicio_confirmada);
      const startDate = confirmed || identityStartDate(stored?.nome_mcc || campaign.campaignName, stored?.data_inicio_ano_inferido, account.date);
      const totals = internalId ? totalsById.get(`id:${internalId}`) : null;
      const impressions = Number.isSafeInteger(totals?.impressions) && totals.impressions >= 0 ? totals.impressions : null;
      const observedCount = Number.isSafeInteger(totals?.observed?.impressions) && totals.observed.impressions > 0 ? totals.observed.impressions : null;
      let zeroStreakDays = null;
      if (internalId && isoDate(account.date) && Number.isSafeInteger(campaign.impressions) && campaign.impressions >= 0) {
        zeroStreakDays = globalThis.CampaignDatabase.consecutiveZeroImpressionDays(database, internalId, account.date, [{ date: account.date, impressions: campaign.impressions }]);
        if (!Number.isSafeInteger(zeroStreakDays) || zeroStreakDays < 0) zeroStreakDays = null;
      }
      campaigns.push({
        managerCustomerId, customerId, campaignId, campaignInternalId: internalId || null, remainingValue, saleProtected,
        excludedAsHistorical: !stored || stored.apiSnapshotOnly === true || String(stored.status || '').toLowerCase() === 'historico' || String(stored._status || '').toLowerCase() === 'historico',
        startDate, startDateSource: confirmed ? 'confirmed' : (startDate ? 'identity' : null),
        ageReferenceDate: isoDate(account.date),
        lifetimeImpressions: observedCount === null ? null : impressions,
        lifetimeImpressionsObservedCount: observedCount,
        zeroImpressionStreakDays: zeroStreakDays,
        zeroImpressionReferenceDate: zeroStreakDays === null ? null : account.date,
      });
    }
  }
  const result = { version: 2, generatedAtUtc: new Date(snapshot.completedAtUtc).toISOString(), campaigns };
  delete cached[sourceId];
  cached[sourceId] = result;
  let entries = Object.entries(cached).slice(-20);
  let serialized = JSON.stringify(Object.fromEntries(entries));
  while (entries.length > 1 && serialized.length > 1_500_000) {
    entries.shift();
    serialized = JSON.stringify(Object.fromEntries(entries));
  }
  try {
    if (typeof storage?.setItem !== 'function') throw new Error('armazenamento local indisponível');
    storage.setItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_EVALUATION_INPUTS_KEY, serialized);
    const saved = JSON.parse(storage.getItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_EVALUATION_INPUTS_KEY) || '{}');
    if (JSON.stringify(saved?.[sourceId]) !== JSON.stringify(result)) throw new Error('não foi possível confirmar o cache dos dados da avaliação');
  } catch (error) {
    throw new Error(`Não foi possível preservar os dados para reenvio idempotente do snapshot. ${error?.message || ''}`.trim());
  }
  return result;
}

function normalizeGuruMediaSaleProtection(value = {}) {
  const allowedStatuses = new Set(['available', 'incomplete', 'unavailable']);
  let status = allowedStatuses.has(value?.status) ? value.status : 'unavailable';
  const campaigns = new Map();
  const sourceCampaigns = Array.isArray(value?.campaigns) ? value.campaigns : [];
  if (!Array.isArray(value?.campaigns) && status === 'available') status = 'incomplete';
  for (const item of sourceCampaigns) {
    const managerCustomerId = String(item?.managerCustomerId || '').replace(/\D/g, '');
    const customerId = String(item?.customerId || '').replace(/\D/g, '');
    const campaignId = String(item?.campaignId || '');
    if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId)) { status = 'incomplete'; continue; }
    campaigns.set(JSON.stringify([managerCustomerId, customerId, campaignId]), { managerCustomerId, customerId, campaignId });
  }
  if (campaigns.size > 5000) { status = 'incomplete'; campaigns.clear(); }
  const generatedAtUtc = typeof value?.generatedAtUtc === 'string' && Number.isFinite(Date.parse(value.generatedAtUtc))
    ? new Date(value.generatedAtUtc).toISOString() : null;
  if (status === 'available' && !generatedAtUtc) status = 'incomplete';
  return {
    status,
    generatedAtUtc,
    campaigns: [...campaigns.values()].sort((a, b) => a.managerCustomerId.localeCompare(b.managerCustomerId) || a.customerId.localeCompare(b.customerId) || a.campaignId.localeCompare(b.campaignId)),
  };
}

function normalizeCampaignExceptions(value = []) {
  if (!Array.isArray(value)) return [];
  const entries = new Map();
  for (const item of value) {
    const managerCustomerId = String(item?.managerCustomerId || '').replace(/\D/g, '');
    const customerId = String(item?.customerId || '').replace(/\D/g, '');
    const campaignId = String(item?.campaignId || '');
    if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId)) continue;
    const excludedRules = [...new Set((Array.isArray(item?.excludedRules) ? item.excludedRules : []).filter(rule => AUTO_PAUSE_RULE_CODES.has(rule)))].sort();
    if (!excludedRules.length) continue;
    const key = JSON.stringify([managerCustomerId, customerId, campaignId]);
    const existing = entries.get(key) || { managerCustomerId, customerId, campaignId, excludedRules: [] };
    existing.excludedRules = [...new Set([...existing.excludedRules, ...excludedRules])].sort();
    entries.set(key, existing);
  }
  return [...entries.values()].sort((a, b) => a.managerCustomerId.localeCompare(b.managerCustomerId) || a.customerId.localeCompare(b.customerId) || a.campaignId.localeCompare(b.campaignId));
}

function makeUuid(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') throw new Error('Este navegador não oferece geração segura de IDs para sincronizar a política.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildPolicy(input = {}, storage = globalThis.localStorage) {
  let interval = NaN;
  try { interval = Number(storage?.getItem(AUTO_UPDATE_INTERVAL_KEY)); } catch { /* Usa a frequência padrão. */ }
  const reference = input.referenceCompetitorSettings || {};
  const integer = (value, fallback, minimum = 0, maximum = 2147483647) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
  };
  return {
    version: 1,
    snapshotIntervalMinutes: AUTO_UPDATE_INTERVALS.has(interval) ? interval : DEFAULT_INTERVAL_MINUTES,
    additionalDelayMinutes: integer(input.additionalDelayMinutes, 15, 0, 1440),
    confirmationSeconds: integer(input.confirmationSeconds, 10, 1, 3600),
    maxRetainedSnapshots: readGoogleAdsCaptureSnapshotRetention(storage),
    campaignExceptions: normalizeCampaignExceptions(input.campaignExceptions),
    guruMediaSaleProtection: normalizeGuruMediaSaleProtection(input.guruMediaSaleProtection),
    rules: {
      negative_remaining: { enabled: input.negativeRemainingEnabled === true },
      product_performance: { enabled: input.productPerformanceEnabled === true, requireRedDot: input.productPerformanceSettings?.requireRedDot !== false, minimumCampaigns: integer(input.productPerformanceSettings?.minimumCampaigns, 2, 2, 100), minimumClicks: integer(input.productPerformanceSettings?.minimumClicks, 1, 1, 100000), impressionThreshold: integer(input.productPerformanceSettings?.impressionThreshold, 100, 1, 1000000), impressionWindowHours: integer(input.productPerformanceSettings?.impressionWindowHours, 24, 1, 24) }, campaign_age: { enabled: input.campaignAgeEnabled === true, thresholdDays: integer(input.campaignAgeSettings?.days, 30, 1, 3650), maxImpressions: integer(input.campaignAgeSettings?.maxImpressions, 0) }, clicks_without_sale: { enabled: input.clicksWithoutSaleEnabled === true, thresholdClicks: integer(input.clicksWithoutSaleSettings?.clicks, 15, 0, 99) }, campaign_zero_impressions: {
        enabled: input.campaignZeroImpressionsEnabled === true,
        thresholdDays: integer(input.campaignZeroImpressionsDays, 35, 1, 3650),
      },
      reference_competitor: {
        enabled: input.referenceCompetitorEnabled === true,
        referenceImpressions: integer(reference.referenceImpressions, 100),
        referenceClicks: integer(reference.referenceClicks, 1),
        competitorMinImpressions: integer(reference.competitorMinImpressions, 0),
        maxPausesPerProductPerSnapshot: integer(reference.maxPausesPerProductPerSnapshot, 1, 1, 100),
      },
    },
  };
}

function policyRevision(policy, storage, cryptoApi) {
  const serialized = JSON.stringify(policy);
  try {
    const saved = JSON.parse(storage?.getItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_REVISION_KEY) || 'null');
    if (saved?.policy === serialized && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.revision || '')) return saved.revision;
  } catch { /* Cria revisão nova quando a preferência não puder ser lida. */ }
  const revision = makeUuid(cryptoApi);
  try { storage?.setItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_REVISION_KEY, JSON.stringify({ policy: serialized, revision })); } catch { /* A chamada ainda pode seguir nesta sessão. */ }
  return revision;
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function serverSnapshotId(snapshotId, storage, cryptoApi) {
  const source = String(snapshotId || '').trim();
  if (!source) throw new Error('A captura D0 não tem um ID para sincronização.');
  if (validUuid(source)) return source;
  let ids = {};
  try {
    const parsed = JSON.parse(storage?.getItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_SNAPSHOT_IDS_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ids = parsed;
  } catch { /* Recria o mapa se a preferência estiver inválida. */ }
  if (validUuid(ids[source])) return ids[source];
  const mapped = makeUuid(cryptoApi);
  ids[source] = mapped;
  const entries = Object.entries(ids).filter(([, value]) => validUuid(value)).slice(-200);
  try {
    if (typeof storage?.setItem !== 'function') throw new Error('armazenamento local indisponível');
    storage.setItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_SNAPSHOT_IDS_KEY, JSON.stringify(Object.fromEntries(entries)));
    const saved = JSON.parse(storage.getItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_SNAPSHOT_IDS_KEY) || '{}');
    if (saved?.[source] !== mapped) throw new Error('não foi possível confirmar o ID local da captura');
  } catch (error) {
    throw new Error(`Não foi possível guardar a associação estável da captura para o servidor. ${error?.message || ''}`.trim());
  }
  return mapped;
}

async function request(operation, parameters = {}, { fetchImpl = globalThis.fetch, storage = globalThis.localStorage, endpoint = GOOGLE_ADS_AUTO_PAUSE_SERVER_ENDPOINT } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A conexão com o serviço de pausas automáticas não está disponível neste navegador.');
  const auth = readTrackingHubToken({ storage });
  if (!auth.token) throw new Error(auth.invalid ? 'O token compartilhado do Hub está inválido.' : 'Configure o token compartilhado do Hub antes de sincronizar as pausas automáticas.');
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ operation, ...parameters }),
  });
  let body = null;
  try { body = await response.json(); } catch { /* A resposta pode estar vazia quando o endpoint falhar. */ }
  if (!response.ok || body?.ok !== true) {
    const detail = String(body?.error || `HTTP ${response.status}`);
    throw new Error(`O serviço de pausas automáticas recusou a operação (${detail}).`);
  }
  return body;
}

function sha256Hex(bytes, cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.subtle?.digest !== 'function') throw new Error('Este navegador não oferece assinatura segura para enviar o snapshot.');
  return cryptoApi.subtle.digest('SHA-256', bytes).then(hash => [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join(''));
}

function encodeBase64(bytes, btoaImpl = globalThis.btoa) {
  if (typeof btoaImpl !== 'function') throw new Error('Este navegador não oferece codificação segura para enviar o snapshot.');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoaImpl(binary);
}

export async function publishGoogleAdsAutoPauseServerSnapshot(snapshotValue, options = {}) {
  if (!snapshotValue || typeof snapshotValue !== 'object' || Array.isArray(snapshotValue)
    || snapshotValue.periodType !== 'D0' || snapshotValue.executionMode !== 'automatic'
    || typeof snapshotValue.id !== 'string' || !snapshotValue.id.trim()
    || !Number.isFinite(Date.parse(snapshotValue.completedAtUtc || ''))
    || snapshotValue.scope !== 'ALL' || !Array.isArray(snapshotValue.accounts) || !snapshotValue.accounts.length
    || Number(snapshotValue.accountCount) !== snapshotValue.accounts.length
    || !snapshotValue.accounts.every(account => account?.scope === 'ALL' && account.queryComplete === true && account.configurationComplete === true)) {
    throw new Error('Somente snapshots D0 automáticos completos podem ser enviados ao servidor.');
  }
  const sourceId = snapshotValue.id.trim(), snapshotId = serverSnapshotId(sourceId, options.storage ?? globalThis.localStorage, options.cryptoApi ?? globalThis.crypto);
  let remainingValues = new Map();
  try { const provided = options.getCampaignPauseInputsByInternalId?.(); if (provided instanceof Map) remainingValues = provided; } catch { /* Sem valor confiável, o servidor registra a regra como não avaliável. */ }
  const evaluationInputs = buildEvaluationInputs(snapshotValue, options.database, options.storage ?? globalThis.localStorage, remainingValues);
  const payload = evaluationInputs ? { ...snapshotValue, evaluationInputs } : snapshotValue;
  const encoder = options.textEncoder ?? new TextEncoder(), bytes = encoder.encode(JSON.stringify(payload));
  if (bytes.length > SNAPSHOT_MAX_BYTES) throw new Error('O snapshot excede o limite de 8 MiB aceito nesta etapa.');
  const payloadSha256 = await sha256Hex(bytes, options.cryptoApi ?? globalThis.crypto);
  const partCount = Math.ceil(bytes.length / SNAPSHOT_PART_BYTES);
  const begin = await request('begin_snapshot_upload', {
    snapshot_id: snapshotId,
    source_snapshot_id: sourceId,
    completed_at_utc: new Date(snapshotValue.completedAtUtc).toISOString(),
    schema_version: payload.evaluationInputs?.version === 2 ? 3 : payload.evaluationInputs ? 2 : 1,
    payload_bytes: bytes.length,
    payload_sha256: payloadSha256,
    part_count: partCount,
  }, options);
  if (begin?.snapshot_id !== snapshotId) throw new Error('O servidor confirmou um identificador diferente para o snapshot.');
  if (begin.already_received === true) return { ok: true, duplicate: true, snapshotId, payloadSha256 };
  for (let partIndex = 0; partIndex < partCount; partIndex++) {
    const part = bytes.subarray(partIndex * SNAPSHOT_PART_BYTES, Math.min(bytes.length, (partIndex + 1) * SNAPSHOT_PART_BYTES));
    await request('put_snapshot_part', {
      snapshot_id: snapshotId,
      part_index: partIndex,
      part_base64: encodeBase64(part, options.btoaImpl),
      part_sha256: await sha256Hex(part, options.cryptoApi ?? globalThis.crypto),
    }, options);
  }
  const finalized = await request('finalize_snapshot_upload', { snapshot_id: snapshotId }, options);
  if (finalized?.snapshot_id !== snapshotId || finalized?.stored !== true || finalized?.payload_sha256 !== payloadSha256) {
    throw new Error('O servidor não confirmou o armazenamento integral do snapshot.');
  }
  return { ok: true, duplicate: finalized.duplicate === true, snapshotId, payloadSha256 };
}

export async function publishPendingGoogleAdsAutoPauseServerSnapshots(snapshots = [], options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const source = (Array.isArray(snapshots) ? snapshots : []).filter(item => item?.periodType === 'D0' && item?.executionMode === 'automatic');
  const eligible = source.filter(item => item?.scope === 'ALL' && Array.isArray(item?.accounts) && item.accounts.length
    && Number(item.accountCount) === item.accounts.length
    && item.accounts.every(account => account?.scope === 'ALL' && account.queryComplete === true && account.configurationComplete === true));
  let received = [];
  try {
    const saved = JSON.parse(storage?.getItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_RECEIVED_SNAPSHOTS_KEY) || '[]');
    if (Array.isArray(saved)) received = saved.filter(item => typeof item === 'string');
  } catch { /* O servidor ainda protege reenvios idempotentes pelo ID e hash. */ }
  const receivedSet = new Set(received), pending = eligible.filter(item => !receivedSet.has(String(item.id || '')));
  let sent = 0, lastError = '';
  for (const snapshot of pending) {
    try {
      await publishGoogleAdsAutoPauseServerSnapshot(snapshot, options);
      receivedSet.add(String(snapshot.id)); sent++;
      try { storage?.setItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_RECEIVED_SNAPSHOTS_KEY, JSON.stringify([...receivedSet].slice(-200))); }
      catch { /* A próxima captura pode reenviar; o endpoint trata duplicidade. */ }
    } catch (error) {
      lastError = String(error?.message || 'Falha ao enviar snapshot ao servidor.').slice(0, 240);
      break;
    }
  }
  return { ok: !lastError, attempted: Math.min(pending.length, sent + (lastError ? 1 : 0)), sent, pending: eligible.filter(item => !receivedSet.has(String(item.id || ''))).length, deferredIncomplete: source.length - eligible.length, error: lastError || null };
}

export async function syncGoogleAdsAutoPauseServerConfiguration(input, options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const policy = buildPolicy(input, storage);
  const revision = policyRevision(policy, storage, options.cryptoApi ?? globalThis.crypto);
  const result = await request('sync_config', { revision, policy }, options);
  return { ...result, policy, revision };
}

export async function publishGoogleAdsAutoPauseServerEvaluation({ snapshotId, completedAtUtc, jobs = [], ...configuration } = {}, options = {}) {
  const storage = options.storage ?? globalThis.localStorage;
  const sourceSnapshot = String(snapshotId || '');
  const snapshot = serverSnapshotId(sourceSnapshot, storage, options.cryptoApi ?? globalThis.crypto);
  if (!Number.isFinite(Date.parse(completedAtUtc || ''))) throw new Error('A captura D0 não tem horário de conclusão válido.');
  if (!Array.isArray(jobs) || jobs.length > 500) throw new Error('A avaliação excede o limite de campanhas aceito pelo servidor.');
  let previousSnapshot = '';
  try { previousSnapshot = String(storage?.getItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_LAST_SNAPSHOT_KEY) || ''); } catch { /* Sem deduplicação local, o servidor mantém idempotência pelo ID da captura. */ }
  if (previousSnapshot === sourceSnapshot) return { ok: true, skipped: true, reason: 'snapshot_already_published', snapshot_id: snapshot };
  const { revision, policy } = await syncGoogleAdsAutoPauseServerConfiguration(configuration, options);
  if (!previousSnapshot) {
    try { storage?.setItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_LAST_SNAPSHOT_KEY, sourceSnapshot); } catch { /* Continua tratando a captura como baseline nesta sessão. */ }
    return { ok: true, skipped: true, reason: 'initial_snapshot_baseline', snapshot_id: snapshot, policy, revision };
  }
  const result = await request('publish_evaluation', {
    snapshot_id: snapshot,
    completed_at_utc: new Date(completedAtUtc).toISOString(),
    revision,
    jobs,
  }, options);
  try { storage?.setItem(GOOGLE_ADS_AUTO_PAUSE_SERVER_LAST_SNAPSHOT_KEY, sourceSnapshot); } catch { /* O endpoint idempotente ainda protege retries. */ }
  return { ...result, policy, revision };
}

export async function listPendingGoogleAdsAutoPauseServerJobs(options = {}) {
  return request('pending', {}, options);
}

export async function getGoogleAdsAutoPauseServerCutoverPreflight(options = {}) {
  const result = await request('cutover_preflight', {}, options);
  if (typeof result?.ready !== 'boolean' || typeof result?.transfer_supported !== 'boolean'
    || !['hub', 'server'].includes(result?.authority) || !Array.isArray(result?.blockers)) {
    throw new Error('O servidor retornou um estado de transferência inválido.');
  }
  return result;
}

export async function getGoogleAdsAutoPauseExecutionAuthority(options = {}) {
  const result = await request('authority_status', {}, options);
  if (!['hub', 'server'].includes(result?.authority) || !Number.isSafeInteger(Number(result?.revision))) {
    throw new Error('O servidor não confirmou quem tem autoridade para executar as pausas.');
  }
  return { authority: result.authority, revision: Number(result.revision) };
}

export async function setGoogleAdsAutoPauseExecutionAuthority(authority, options = {}) {
  if (!['hub', 'server'].includes(authority)) throw new Error('A autoridade solicitada é inválida.');
  const result = await request('cutover_set_authority', { authority }, options);
  if (typeof result?.changed !== 'boolean' || !['hub', 'server'].includes(result?.authority) || !Array.isArray(result?.blockers)) {
    throw new Error('O servidor não confirmou a troca de autoridade.');
  }
  return result;
}

export async function beginGoogleAdsAutoPauseHubExecution(leaseToken, options = {}) {
  if (!validUuid(leaseToken)) throw new Error('O identificador da execução local é inválido.');
  return request('hub_execution_begin', { lease_token: leaseToken }, options);
}

export async function heartbeatGoogleAdsAutoPauseHubExecution(leaseToken, options = {}) {
  if (!validUuid(leaseToken)) throw new Error('O identificador da execução local é inválido.');
  const result = await request('hub_execution_heartbeat', { lease_token: leaseToken }, options);
  if (result?.acquired === true) return true;
  const renewed = await request('hub_execution_begin', { lease_token: leaseToken }, options);
  return renewed?.acquired === true;
}

export async function endGoogleAdsAutoPauseHubExecution(leaseToken, options = {}) {
  if (!validUuid(leaseToken)) return { ok: false };
  return request('hub_execution_end', { lease_token: leaseToken }, options);
}

export async function cancelGoogleAdsAutoPauseServerProduct({ snapshotId, productKey } = {}, options = {}) {
  const storage = options.storage ?? globalThis.localStorage, product = String(productKey || '').trim();
  if (!String(snapshotId || '').trim() || !product || product.length > 190) {
    throw new Error('Não foi possível cancelar o item do servidor: produto ou captura inválidos.');
  }
  const snapshot = serverSnapshotId(snapshotId, storage, options.cryptoApi ?? globalThis.crypto);
  return request('cancel_product', { snapshot_id: snapshot, product_key: product }, options);
}

export async function enqueueGoogleAdsAutoPauseServerSimulation({ testId } = {}, options = {}) {
  const id = testId ? String(testId) : makeUuid(options.cryptoApi ?? globalThis.crypto);
  if (!validUuid(id)) throw new Error('Não foi possível criar um identificador seguro para a simulação da fila.');
  const result = await request('simulate_enqueue', { test_id: id }, options);
  if (result?.simulation?.job_id !== id) throw new Error('O servidor não confirmou o identificador da simulação.');
  return { ...result, testId: id };
}

export async function getGoogleAdsAutoPauseServerSimulation({ testId } = {}, options = {}) {
  const id = String(testId || '');
  if (!validUuid(id)) throw new Error('O identificador da simulação da fila é inválido.');
  const result = await request('simulation_status', { test_id: id }, options);
  if (result?.simulation?.job_id !== id) throw new Error('O servidor retornou um teste diferente do solicitado.');
  return result;
}

export async function syncGoogleAdsAutoPauseServerCampaignExceptions({ managerCustomerId, customerId, campaignId, excludedRules = [] } = {}, options = {}) {
  const manager = String(managerCustomerId || '').replace(/\D/g, ''), customer = String(customerId || '').replace(/\D/g, ''), campaign = String(campaignId || '');
  if (!/^\d{10}$/.test(manager) || !/^\d{10}$/.test(customer) || !/^[1-9]\d{0,19}$/.test(campaign)) {
    throw new Error('Não foi possível sincronizar a exceção: vínculo da campanha com o Google Ads inválido.');
  }
  const excluded = [...new Set((Array.isArray(excludedRules) ? excludedRules : []).filter(rule => AUTO_PAUSE_RULE_CODES.has(rule)))].sort();
  return request('update_campaign_exceptions', {
    manager_customer_id: manager,
    customer_id: customer,
    campaign_id: campaign,
    excluded_rules: excluded,
  }, options);
}
