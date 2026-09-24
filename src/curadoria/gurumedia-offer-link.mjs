const GURUMEDIA_OFFER_BASE_URL = 'https://stats.gurumedia.com/offers/';

export function guruMediaOfferUrl(offerId) {
  const id = String(offerId ?? '').trim();
  if (!/^\d+$/.test(id)) return null;
  return `${GURUMEDIA_OFFER_BASE_URL}${id}`;
}
