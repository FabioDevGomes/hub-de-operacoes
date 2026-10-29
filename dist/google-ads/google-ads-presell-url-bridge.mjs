import { readDraft } from '../copy-ficha/copy-ficha-draft.mjs?v=1';

function normalizeProduct(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function matchesGoogleAdsProductPhrase(value, product) {
  const text = normalizeProduct(value);
  const phrase = normalizeProduct(product);
  if (!text || !phrase) return false;
  return text === phrase || (` ${text} `).includes(` ${phrase} `);
}

function validHttpsUrl(value) {
  const text = String(value || '').trim();
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

/** Resolve a saved, selected Pre-Sell URL for the matching product and Google Ads account. */
export function resolveGoogleAdsPresellUrl({ draft = readDraft(), accountId, campaignProduct, offerName } = {}) {
  if (!draft || typeof draft !== 'object') return { ok: false, reason: 'no-ficha' };
  if (draft.trackingEnabled !== true) return { ok: false, reason: 'tracking-disabled' };

  const fichaProduct = String(draft.product || '').trim();
  if (!fichaProduct) return { ok: false, reason: 'no-product' };

  const product = String(campaignProduct || '').trim();
  const offer = String(offerName || '').trim();
  if (!product && !offer) return { ok: false, reason: 'no-campaign-product', product: fichaProduct };
  if (product && !matchesGoogleAdsProductPhrase(fichaProduct, product)) {
    return { ok: false, reason: 'product-mismatch', product: fichaProduct };
  }
  if (offer && !matchesGoogleAdsProductPhrase(offer, fichaProduct)) {
    return { ok: false, reason: 'offer-mismatch', product: fichaProduct };
  }

  const id = String(accountId || '').trim();
  if (!id) return { ok: false, reason: 'no-account', product: fichaProduct };
  const primaryAccountId = String(draft.trackingAccountId || '').trim();
  if (draft.trackingAllAccounts !== true && primaryAccountId !== id) {
    return { ok: false, reason: 'account-not-selected', product: fichaProduct };
  }
  if (draft.trackingAllAccounts === true && Array.isArray(draft.trackingSelectedAccountIds)) {
    const selectedIds = draft.trackingSelectedAccountIds.map(value => String(value));
    if (!selectedIds.includes(id) && primaryAccountId !== id) {
      return { ok: false, reason: 'account-not-selected', product: fichaProduct };
    }
  }

  const urls = draft.trackingAccountPreSellUrls && typeof draft.trackingAccountPreSellUrls === 'object'
    ? draft.trackingAccountPreSellUrls
    : {};
  const savedUrl = urls[id] || (primaryAccountId === id ? draft.trackingHostname : '');
  const url = validHttpsUrl(savedUrl);
  if (!url) return { ok: false, reason: savedUrl ? 'invalid-url' : 'no-url', product: fichaProduct };
  return { ok: true, url, product: fichaProduct, accountId: id };
}

/** Returns every account selected for the matching Ficha product, including missing URLs for explicit UI feedback. */
export function resolveGoogleAdsPresellTargets({ draft = readDraft(), campaignProduct, offerName } = {}) {
  if (!draft || typeof draft !== 'object') return { matched: false, reason: 'no-ficha', targets: [] };
  if (draft.trackingEnabled !== true) return { matched: false, reason: 'tracking-disabled', targets: [] };

  const fichaProduct = String(draft.product || '').trim();
  if (!fichaProduct) return { matched: false, reason: 'no-product', targets: [] };
  const product = String(campaignProduct || '').trim();
  const offer = String(offerName || '').trim();
  if (!product && !offer) return { matched: false, reason: 'no-campaign-product', targets: [] };
  if (product && !matchesGoogleAdsProductPhrase(fichaProduct, product)) {
    return { matched: false, reason: 'product-mismatch', product: fichaProduct, targets: [] };
  }
  if (offer && !matchesGoogleAdsProductPhrase(offer, fichaProduct)) {
    return { matched: false, reason: 'offer-mismatch', product: fichaProduct, targets: [] };
  }

  const primaryAccountId = String(draft.trackingAccountId || '').trim();
  const selectedIds = draft.trackingAllAccounts === true
    ? [...(Array.isArray(draft.trackingSelectedAccountIds) ? draft.trackingSelectedAccountIds : []), primaryAccountId]
    : [primaryAccountId];
  const accountIds = [...new Set(selectedIds.map(value => String(value || '').trim()).filter(Boolean))];
  return {
    matched: true,
    product: fichaProduct,
    targets: accountIds.map(accountId => ({
      accountId,
      ...resolveGoogleAdsPresellUrl({ draft, accountId, campaignProduct: product, offerName: offer }),
    })),
  };
}
