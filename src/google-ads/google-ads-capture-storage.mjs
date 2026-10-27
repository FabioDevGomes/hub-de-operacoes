import { openDatabase } from '../storage/hub-database.mjs?v=1';
import { BILLING_STORE_NAMES, upsertMccConversionSalesToTransaction } from '../billing/billing-storage.mjs?v=15';
import { readGoogleAdsSourceMode } from './google-ads-source-preference.mjs?v=1';

export function previewDailyCaptures(base, reports, todayByAccount, exchangeRateQuote, database = globalThis.CampaignDatabase, dateFromByAccount = {}, { businessDayPreview = false, activeCampaignsOnly = false } = {}) {
  const result = database.saveGoogleAdsDailyCaptures(base, reports, { todayByAccount, dateFromByAccount, exchangeRateQuote, previewOnly: true, businessTimeZone: businessDayPreview ? 'America/Sao_Paulo' : null, activeCampaignsOnly });
  const billingCandidates = businessDayPreview ? [] : database.googleAdsApiBillingSales(result.base);
  return { ...result, billingCandidates };
}

export async function saveDailyCaptures(reports, todayByAccount, exchangeRateQuote, { database = globalThis.CampaignDatabase, openDb = openDatabase, sourceMode = readGoogleAdsSourceMode(), dateFromByAccount = {}, businessDayCapture = false, activeCampaignsOnly = false } = {}) {
  const db = await openDb();
  let result, failure;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['bases', ...(sourceMode === 'api' ? BILLING_STORE_NAMES : [])], 'readwrite');
      const store = tx.objectStore('bases'), request = store.get('atual');
      request.onsuccess = () => {
        try {
          if (!request.result || request.result.schema !== database.SCHEMA) throw new Error('A base atual não foi reconhecida; nenhuma captura foi gravada.');
          result = database.saveGoogleAdsDailyCaptures(request.result, reports, {
            todayByAccount,
            dateFromByAccount,
            exchangeRateQuote,
            previewOnly: false,
            businessTimeZone: businessDayCapture ? 'America/Sao_Paulo' : null,
            activeCampaignsOnly,
          });
          result.billingCandidates = sourceMode === 'api' ? database.googleAdsApiBillingSales(result.base) : [];
          store.put(result.base, 'atual');
          if (sourceMode === 'api') upsertMccConversionSalesToTransaction(tx, result.billingCandidates, { sourceMode, preserveExistingPlatform: true });
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(failure || tx.error);
      tx.onabort = () => reject(failure || tx.error || new Error('A captura e a atualização financeira foram canceladas.'));
    });
    return result;
  } finally { db.close(); }
}
