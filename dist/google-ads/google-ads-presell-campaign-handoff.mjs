export const GOOGLE_ADS_PRESELL_HANDOFF_QUERY_PARAM = 'presell_handoff';
export const GOOGLE_ADS_PRESELL_HANDOFF_JOB_QUERY_PARAM = 'presell_handoff_job';
export const GOOGLE_ADS_PRESELL_HANDOFF_STORAGE_PREFIX = 'hub:google-ads:presell-campaign-handoff:v1:';
export const GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY = 'hub:google-ads:presell-campaign-handoff-ack:v1';
export const GOOGLE_ADS_PRESELL_HANDOFF_SELECTION_KEY = 'hub:presell-campaign-handoff-selected-job:v1';

const digits = value => String(value || '').replace(/\D/g, '');
const normalizedProduct = value => String(value || '').trim();
function browserStorage(name) {
  try { return globalThis[name] || null; } catch { return null; }
}

function publishedOrVerified(target) {
  if (!target || target.draftOnly === true || target.status === 'superseded' || target.deploymentState === 'superseded') return false;
  if (target.deploymentState === 'success' || target.status === 'published' || target.hasPublished === true) return true;
  const verification = target.manualVerification;
  if (target.status !== 'manual-verified' || verification?.status !== 'confirmed') return false;
  const parent = String(target.parentDomain || '').trim().toLowerCase();
  const prefix = String(target.prefix || '').trim().toLowerCase();
  const expectedDomain = String(target.domain || (parent && prefix ? `${prefix}.${parent}` : '')).trim().toLowerCase();
  return Boolean(expectedDomain && expectedDomain === String(verification.domain || '').trim().toLowerCase()
    && String(target.username || '') === String(verification.username || '')
    && String(target.directory || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
      === String(verification.directory || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''));
}

function safeTarget(target) {
  const accountId = digits(target?.accountId);
  const accountName = String(target?.accountName || '').trim().slice(0, 200);
  let url = '';
  try {
    const parsed = new URL(String(target?.publicUrl || target?.url || '').trim());
    if (parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password) url = parsed.href;
  } catch { /* URL inválida não atravessa a fronteira entre módulos. */ }
  if (!/^\d{10}$/.test(accountId)) return { error: 'Uma página concluída está sem ID de conta Google Ads válido.' };
  if (!url) return { error: `A URL HTTPS da conta ${accountId} não está publicada ou confirmada.` };
  return { target: { accountId, accountName: accountName || `Conta ${accountId}`, url } };
}

export function buildGoogleAdsPresellCampaignHandoff(job) {
  if (!job || job.draftOnly === true || !String(job.id || '').trim() || !Array.isArray(job.targets) || !job.targets.length) {
    return { ok: false, reason: 'Conclua a geração e a hospedagem da Pre-Sell antes de enviar os dados.' };
  }
  const product = normalizedProduct(job.product);
  if (!product) return { ok: false, reason: 'A Pre-Sell não tem um nome de produto para enviar.' };
  const targets = [];
  for (const target of job.targets) {
    if (!publishedOrVerified(target)) return { ok: false, reason: 'Todas as páginas desta Pre-Sell precisam estar publicadas ou confirmadas manualmente no HPanel.' };
    const safe = safeTarget(target);
    if (safe.error) return { ok: false, reason: safe.error };
    targets.push(safe.target);
  }
  const byAccount = new Map();
  for (const target of targets) {
    const previous = byAccount.get(target.accountId);
    if (previous && previous.url !== target.url) return { ok: false, reason: `A conta ${target.accountId} tem mais de uma URL nesta Pre-Sell.` };
    byAccount.set(target.accountId, target);
  }
  const uniqueTargets = [...byAccount.values()];
  if (!uniqueTargets.length) return { ok: false, reason: 'Nenhuma conta com URL publicada foi encontrada.' };
  const fingerprint = googleAdsPresellCampaignHandoffFingerprint({ product, targets: uniqueTargets });
  return {
    ok: true,
    fingerprint,
    payload: {
      schemaVersion: 1,
      id: '',
      sourceJobId: String(job.id || ''),
      product,
      createdAt: new Date().toISOString(),
      targets: uniqueTargets,
    },
  };
}

export function googleAdsPresellCampaignHandoffFingerprint(value) {
  const product = normalizedProduct(value?.product);
  const targets = Array.isArray(value?.targets) ? value.targets : [];
  return JSON.stringify({ product: product.toLocaleLowerCase(), targets: targets.map(target => [digits(target?.accountId), String(target?.url || '').trim()]) });
}

export function validateGoogleAdsPresellCampaignHandoff(value) {
  if (!value || value.schemaVersion !== 1 || typeof value !== 'object') return null;
  const product = normalizedProduct(value.product);
  if (!product || !Array.isArray(value.targets) || !value.targets.length) return null;
  const targets = [];
  for (const target of value.targets) {
    const safe = safeTarget(target);
    if (safe.error || targets.some(item => item.accountId === safe.target.accountId)) return null;
    targets.push(safe.target);
  }
  const id = String(value.id || '');
  if (!/^[a-zA-Z0-9-]{12,80}$/.test(id)) return null;
  return {
    schemaVersion: 1,
    id,
    sourceJobId: String(value.sourceJobId || '').slice(0, 120),
    product,
    createdAt: String(value.createdAt || ''),
    targets,
  };
}

function randomId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* Fallback abaixo. */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 16)}`;
}

export function writeGoogleAdsPresellCampaignHandoff(
  payload,
  storage = browserStorage('localStorage'),
  fallbackStorage = browserStorage('sessionStorage'),
) {
  const validated = validateGoogleAdsPresellCampaignHandoff({ ...payload, id: payload?.id || randomId() });
  if (!validated) return null;
  const key = GOOGLE_ADS_PRESELL_HANDOFF_STORAGE_PREFIX + validated.id;
  const serialized = JSON.stringify(validated);
  try {
    storage.setItem(key, serialized);
    return validated;
  } catch { /* Tente a sessão da aba atual antes de interromper a navegação. */ }
  try {
    fallbackStorage?.setItem(key, serialized);
    return fallbackStorage ? validated : null;
  } catch { return null; }
}

export function readGoogleAdsPresellCampaignHandoff(
  id,
  storage = browserStorage('localStorage'),
  fallbackStorage = browserStorage('sessionStorage'),
) {
  const key = String(id || '');
  if (!/^[a-zA-Z0-9-]{12,80}$/.test(key)) return null;
  const storageKey = GOOGLE_ADS_PRESELL_HANDOFF_STORAGE_PREFIX + key;
  for (const candidate of [storage, fallbackStorage]) {
    try {
      const parsed = JSON.parse(candidate?.getItem(storageKey) || 'null');
      const validated = validateGoogleAdsPresellCampaignHandoff(parsed);
      if (validated?.id === key) return validated;
    } catch { /* O próximo armazenamento disponível ainda pode conter a transferência. */ }
  }
  return null;
}

export function consumeGoogleAdsPresellCampaignHandoff(
  id,
  storage = browserStorage('localStorage'),
  fallbackStorage = browserStorage('sessionStorage'),
) {
  const storageKey = GOOGLE_ADS_PRESELL_HANDOFF_STORAGE_PREFIX + String(id || '');
  const candidates = [...new Set([storage, fallbackStorage].filter(Boolean))];
  if (!candidates.length) return false;
  let consumed = false;
  for (const candidate of candidates) {
    try { candidate.removeItem(storageKey); consumed = true; } catch { /* Tente remover da outra área. */ }
  }
  return consumed;
}

export function acknowledgeGoogleAdsPresellCampaignHandoff(payload, fingerprint, storage = globalThis.localStorage) {
  if (!payload?.sourceJobId || !fingerprint) return false;
  try {
    const current = JSON.parse(storage.getItem(GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY) || '{}');
    const next = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    next[payload.sourceJobId] = { fingerprint, acknowledgedAt: new Date().toISOString() };
    const entries = Object.entries(next).slice(-50);
    storage.setItem(GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY, JSON.stringify(Object.fromEntries(entries)));
    return true;
  } catch { return false; }
}

export function readGoogleAdsPresellCampaignHandoffAcknowledgement(sourceJobId, storage = globalThis.localStorage) {
  try {
    const entries = JSON.parse(storage.getItem(GOOGLE_ADS_PRESELL_HANDOFF_ACK_KEY) || '{}');
    return entries && typeof entries === 'object' && !Array.isArray(entries) ? entries[String(sourceJobId || '')] || null : null;
  } catch { return null; }
}
