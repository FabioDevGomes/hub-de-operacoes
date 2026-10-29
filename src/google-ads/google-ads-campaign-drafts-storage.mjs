export const GOOGLE_ADS_CAMPAIGN_DRAFTS_STORAGE_KEY = 'hub.google-ads.campaign-creation.drafts:v1';

function emptyStore() {
  return { schemaVersion: 1, activeDraftId: '', drafts: [] };
}

function validStore(value) {
  return Boolean(value && value.schemaVersion === 1 && Array.isArray(value.drafts)
    && value.drafts.every(draft => draft && typeof draft.id === 'string' && draft.id
      && typeof draft.values === 'object' && draft.values && !Array.isArray(draft.values)
      && typeof draft.createdAt === 'string' && typeof draft.updatedAt === 'string'));
}

export function loadGoogleAdsCampaignDrafts({ storage = null } = {}) {
  let target;
  try { target = storage || globalThis.localStorage; }
  catch { throw new Error('O armazenamento local deste perfil não está disponível.'); }
  if (!target) throw new Error('O armazenamento local deste perfil não está disponível.');
  let raw;
  try { raw = target.getItem(GOOGLE_ADS_CAMPAIGN_DRAFTS_STORAGE_KEY); }
  catch { throw new Error('Não foi possível ler os rascunhos salvos neste navegador.'); }
  if (!raw) return emptyStore();
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Os rascunhos salvos neste navegador estão ilegíveis. Eles foram preservados.'); }
  if (!validStore(value)) throw new Error('O formato dos rascunhos salvos não é reconhecido. Eles foram preservados.');
  return {
    schemaVersion: 1,
    activeDraftId: typeof value.activeDraftId === 'string' ? value.activeDraftId : '',
    drafts: value.drafts.map(draft => ({
      id: draft.id,
      label: typeof draft.label === 'string' ? draft.label : '',
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      values: draft.values,
    })),
  };
}

export function saveGoogleAdsCampaignDrafts(value, { storage = null } = {}) {
  let target;
  try { target = storage || globalThis.localStorage; }
  catch { throw new Error('O armazenamento local deste perfil não está disponível.'); }
  if (!target) throw new Error('O armazenamento local deste perfil não está disponível.');
  if (!validStore(value)) throw new Error('Os rascunhos não passaram pela validação local.');
  try { target.setItem(GOOGLE_ADS_CAMPAIGN_DRAFTS_STORAGE_KEY, JSON.stringify(value)); }
  catch { throw new Error('Não foi possível salvar os rascunhos. Verifique o espaço disponível no navegador.'); }
}
