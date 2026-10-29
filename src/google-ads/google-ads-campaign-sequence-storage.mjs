import { normalizeCampaignSequenceProduct } from './google-ads-campaign-sequence-domain.mjs?v=1';

export const GOOGLE_ADS_CAMPAIGN_SEQUENCE_STORAGE_KEY = 'hub:google-ads:campaign-sequence-reservations:v1';

export function readGoogleAdsCampaignSequenceReservations(storage) {
  try {
    storage ??= globalThis.localStorage;
    const saved = storage.getItem(GOOGLE_ADS_CAMPAIGN_SEQUENCE_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.reservations)) {
      throw new Error('O registro local da numeração está inválido. Nenhuma campanha será enviada até que ele seja recuperado.');
    }
    const valid = parsed.reservations.every(item => item && typeof item.product === 'string' && item.product.trim()
      && Number.isInteger(Number(item.iteration)) && Number(item.iteration) > 0 && Number(item.iteration) <= 999
      && typeof item.campaignName === 'string' && item.campaignName.trim());
    if (!valid) throw new Error('O registro local da numeração contém uma reserva inválida. Nenhuma campanha será enviada.');
    return parsed.reservations;
  } catch (error) {
    if (error?.message?.includes('registro local')) throw error;
    throw new Error('Não foi possível ler a numeração salva neste navegador. Nenhuma campanha será enviada. ' + (error?.message || 'Confira o armazenamento local.'));
  }
}

export async function reserveGoogleAdsCampaignSequence(entries, storage) {
  const rows = Array.isArray(entries) ? entries : [];
  const reserve = () => {
    try {
      storage ??= globalThis.localStorage;
      const current = readGoogleAdsCampaignSequenceReservations(storage);
      const currentByNumber = new Map(current.map(item => [
        normalizeCampaignSequenceProduct(item.product) + ':' + Number(item.iteration), item,
      ]));
      const seenInBatch = new Set();
      const next = [...current];
      for (const entry of rows) {
        const product = String(entry?.product || '').trim();
        const iteration = Number(entry?.iteration);
        const campaignName = String(entry?.campaignName || '').trim();
        const productKey = normalizeCampaignSequenceProduct(product);
        if (!productKey || !Number.isInteger(iteration) || iteration < 1 || iteration > 999 || !campaignName) {
          throw new Error('O lote contém uma numeração incompleta. Nenhuma campanha foi enviada.');
        }
        const key = productKey + ':' + iteration;
        if (seenInBatch.has(key)) throw new Error('O lote repetiu o número ' + String(iteration).padStart(2, '0') + ' para o produto ' + product + '. Nenhuma campanha foi enviada.');
        seenInBatch.add(key);
        const existing = currentByNumber.get(key);
        if (existing) throw new Error('A campanha ' + String(iteration).padStart(2, '0') + ' de ' + product + ' já está reservada neste navegador. Revalide o lote para gerar a próxima sequência.');
        next.push({ product, iteration, campaignName, customerId: String(entry.customerId || ''), reservedAtUtc: new Date().toISOString() });
      }
      storage.setItem(GOOGLE_ADS_CAMPAIGN_SEQUENCE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, reservations: next }));
      return next;
    } catch (error) {
      if (error?.message?.includes('reservada') || error?.message?.includes('repetiu') || error?.message?.includes('incompleta')) throw error;
      throw new Error('Não foi possível reservar a numeração deste produto neste navegador. Nenhuma campanha foi enviada. ' + (error?.message || 'Confira o armazenamento local.'));
    }
  };

  if (typeof globalThis.navigator?.locks?.request === 'function') {
    return globalThis.navigator.locks.request('hub-google-ads-campaign-sequence-v1', reserve);
  }
  return reserve();
}
