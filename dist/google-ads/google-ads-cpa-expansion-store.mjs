// Recovery journal for an existing batch; never issues Google Ads requests.
export const CPA_EXPANSION_PREFIX = 'hub:google-ads:cpa-expansion:v1:';
const STATES = new Set(['planned', 'validated', 'sending', 'confirmed', 'failed', 'uncertain']);
const TRANSITIONS = {
  planned: new Set(['validated', 'uncertain']),
  validated: new Set(['sending']),
  sending: new Set(['confirmed', 'failed', 'uncertain']),
  failed: new Set(['validated']),
  uncertain: new Set(['confirmed']),
  confirmed: new Set(),
};

function keyFor(batchId) {
  const id = String(batchId || '').trim();
  if (!id || id.length > 200) throw new Error('Lote inválido.');
  return CPA_EXPANSION_PREFIX + id;
}

function checked(raw, batchId) {
  if (!raw || raw.schemaVersion !== 1 || raw.batchId !== batchId || !Array.isArray(raw.entries) || !raw.entries.length) throw new Error('O registro da ampliação está inválido.');
  const ids = new Set();
  for (const item of raw.entries) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !STATES.has(item.state)
      || !item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload)
      || !/^\d{10}$/.test(String(item.payload.customerId || '')) || !String(item.payload.campaignName || '').trim()) {
      throw new Error('O registro da ampliação contém uma campanha inválida.');
    }
    if (item.state === 'confirmed' && (!item.result || !/^[1-9]\d{0,19}$/.test(String(item.result.campaignId || '')))) throw new Error('Uma campanha confirmada não possui identificação válida.');
    ids.add(item.id);
  }
  return raw;
}

export function readCpaExpansion(batchId, storage = globalThis.localStorage) {
  const value = storage.getItem(keyFor(batchId));
  if (value === null) return null;
  try { return checked(JSON.parse(value), batchId); }
  catch { throw new Error('Não foi possível recuperar a ampliação deste lote com segurança. Nenhuma campanha será enviada.'); }
}

export function createCpaExpansion(batchId, entries, storage = globalThis.localStorage) {
  const key = keyFor(batchId);
  const previous = readCpaExpansion(batchId, storage);
  if (previous && cpaExpansionBlocksSharedSteps(previous)) throw new Error('Já existe uma ampliação registrada para este lote que ainda precisa ser concluída.');
  const record = checked({ schemaVersion: 1, batchId, entries: [...(previous?.entries || []), ...entries.map(entry => ({ ...entry, state: 'planned' }))] }, batchId);
  storage.setItem(key, JSON.stringify(record));
  return record;
}

export function transitionCpaExpansion(batchId, entryId, state, details = {}, storage = globalThis.localStorage) {
  const record = readCpaExpansion(batchId, storage);
  const entry = record?.entries.find(item => item.id === entryId);
  if (!entry || !TRANSITIONS[entry.state]?.has(state)) throw new Error('Transição inválida na ampliação do lote.');
  if (state === 'confirmed' && (!details.result || !/^[1-9]\d{0,19}$/.test(String(details.result.campaignId || '')))) throw new Error('A campanha confirmada precisa ter um ID válido.');
  if (entry.state === 'sending' && state === 'failed' && details.definitive !== true) throw new Error('Uma tentativa sem falha definitiva precisa permanecer incerta.');
  if (entry.state === 'planned' && state === 'uncertain' && details.verified !== true) throw new Error('A campanha existente precisa ser identificada na prévia.');
  if (['sending', 'uncertain'].includes(entry.state) && state === 'confirmed' && details.verified !== true) throw new Error('Confirme a campanha existente antes de concluir uma tentativa incerta.');
  entry.state = state;
  if (state === 'confirmed') { entry.result = details.result; entry.integrated = false; }
  if (details.message) entry.message = String(details.message).slice(0, 1000);
  storage.setItem(keyFor(batchId), JSON.stringify(checked(record, batchId)));
  return record;
}

export function markCpaExpansionIntegrated(batchId, entryId, storage = globalThis.localStorage) {
  const record = readCpaExpansion(batchId, storage);
  const entry = record?.entries.find(item => item.id === entryId);
  if (!entry || entry.state !== 'confirmed') throw new Error('A campanha ainda não foi confirmada para integrar o lote.');
  entry.integrated = true;
  storage.setItem(keyFor(batchId), JSON.stringify(checked(record, batchId)));
  return record;
}

export function cpaExpansionBlocksSharedSteps(record) {
  return Boolean(record && record.entries.some(entry => entry.state !== 'confirmed' || entry.integrated !== true));
}
