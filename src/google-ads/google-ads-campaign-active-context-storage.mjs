export const GOOGLE_ADS_CAMPAIGN_ACTIVE_CONTEXT_STORAGE_KEY = 'hub.google-ads.campaign-creation.active-context:v1';

function normalizeContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) return null;
  if (value.type === 'new') return { schemaVersion: 1, type: 'new' };
  if (!['draft', 'batch'].includes(value.type) || typeof value.id !== 'string'
      || !value.id.trim() || value.id.length > 200) return null;
  return { schemaVersion: 1, type: value.type, id: value.id };
}

function resolveStorage(storage) {
  let target;
  try { target = storage || globalThis.localStorage; }
  catch { throw new Error('O armazenamento local deste perfil não está disponível.'); }
  if (!target) throw new Error('O armazenamento local deste perfil não está disponível.');
  return target;
}

export function loadGoogleAdsCampaignActiveContext({ storage = null } = {}) {
  const target = resolveStorage(storage);
  let raw;
  try { raw = target.getItem(GOOGLE_ADS_CAMPAIGN_ACTIVE_CONTEXT_STORAGE_KEY); }
  catch { throw new Error('Não foi possível ler o último contexto de campanha salvo neste navegador.'); }
  if (!raw) return null;
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('O último contexto de campanha salvo neste navegador está ilegível.'); }
  const normalized = normalizeContext(value);
  if (!normalized) throw new Error('O último contexto de campanha salvo neste navegador não é reconhecido.');
  return normalized;
}

export function saveGoogleAdsCampaignActiveContext(value, { storage = null } = {}) {
  const target = resolveStorage(storage);
  const normalized = normalizeContext({ schemaVersion: 1, ...value });
  if (!normalized) throw new Error('O contexto de campanha não passou pela validação local.');
  try { target.setItem(GOOGLE_ADS_CAMPAIGN_ACTIVE_CONTEXT_STORAGE_KEY, JSON.stringify(normalized)); }
  catch { throw new Error('Não foi possível salvar o último contexto de campanha neste navegador.'); }
  return normalized;
}
