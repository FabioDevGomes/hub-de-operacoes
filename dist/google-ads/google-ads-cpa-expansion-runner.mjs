import { readCpaExpansion, transitionCpaExpansion, markCpaExpansionIntegrated } from './google-ads-cpa-expansion-store.mjs?v=2';

// The caller supplies the Google Ads and batch functions; this module owns ordering.
export async function runCpaExpansion({ batchId, storage, preview, create, merge, preparePreviewContexts = null, beforeSend = async () => {}, isDefinitiveFailure = () => false, onProgress = () => {}, withLock = globalThis.navigator?.locks?.request?.bind(globalThis.navigator.locks) }) {
  if (![preview, create, merge].every(fn => typeof fn === 'function')) throw new Error('Serviços incompletos para ampliar o lote.');
  if (typeof withLock !== 'function') throw new Error('Este navegador não oferece o bloqueio necessário para evitar envios simultâneos.');
  return withLock('hub-google-ads-cpa-expansion:' + batchId, async () => {
  let record = readCpaExpansion(batchId, storage);
  if (!record) throw new Error('Nenhuma ampliação foi registrada para este lote.');
  const plannedEntries = record.entries.filter(entry => entry.state === 'planned');
  const previewContexts = plannedEntries.length && typeof preparePreviewContexts === 'function'
    ? await preparePreviewContexts(plannedEntries.map(entry => entry.payload)) : null;
  for (const original of record.entries) {
    let entry = readCpaExpansion(batchId, storage).entries.find(item => item.id === original.id);
    if (entry.state === 'confirmed') {
      if (!entry.integrated) {
        if (await merge(entry.result, entry) !== true) throw new Error('A campanha foi confirmada, mas ainda não foi incorporada ao lote.');
        markCpaExpansionIntegrated(batchId, entry.id, storage);
      }
      continue;
    }
    // An interrupted request is never sent again automatically.
    if (entry.state === 'sending' || entry.state === 'uncertain' || entry.state === 'failed') break;
    if (entry.state === 'planned') {
      onProgress({ entry, phase: 'preview' });
      const result = await preview(entry.payload, previewContexts);
      if (result?.existing_campaign === true && result.campaign_name === entry.payload.campaignName
          && /^[1-9]\d{0,19}$/.test(String(result.campaign_id || ''))) {
        transitionCpaExpansion(batchId, entry.id, 'uncertain', { verified: true,
          message: 'A prévia encontrou uma campanha com este nome. Confira a identificação antes de incorporá-la.' }, storage);
        break;
      }
      if (!result || result.existing_campaign === true || result.validated_only !== true || result.will_create_paused !== true || result.campaign_status !== 'PAUSED' || result.campaign_name !== entry.payload.campaignName) throw new Error('A prévia encontrou uma campanha existente ou não confirmou a validação. Nenhuma nova criação foi enviada para este item.');
      record = transitionCpaExpansion(batchId, entry.id, 'validated', {}, storage);
      entry = record.entries.find(item => item.id === entry.id);
    }
    // Recheck local destinations and duplicates immediately before recording the send.
    await beforeSend(entry);
    // Persist before the network call; failure to save must prevent submission.
    transitionCpaExpansion(batchId, entry.id, 'sending', {}, storage);
    onProgress({ entry, phase: 'creating' });
    let result;
    try { result = await create(entry.payload); }
    catch (error) {
      const definitive = isDefinitiveFailure(error) === true;
      transitionCpaExpansion(batchId, entry.id, definitive ? 'failed' : 'uncertain', { definitive, message: error?.message }, storage);
      break;
    }
    if (!result || !/^[1-9]\d{0,19}$/.test(String(result.campaignId || '')) || String(result.status || '').toUpperCase() !== 'PAUSED' || result.campaignName !== entry.payload.campaignName) {
      transitionCpaExpansion(batchId, entry.id, 'uncertain', { message: 'O Google não confirmou uma campanha pausada com ID válido.' }, storage);
      break;
    }
    // Save the response before updating the batch so a failed merge can be resumed.
    transitionCpaExpansion(batchId, entry.id, 'confirmed', { result, verified: true }, storage);
    if (await merge(result, entry) !== true) throw new Error('A campanha foi confirmada, mas ainda não foi incorporada ao lote.');
    markCpaExpansionIntegrated(batchId, entry.id, storage);
  }
  return readCpaExpansion(batchId, storage);
  });
}
