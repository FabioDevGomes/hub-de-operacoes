export const BRAND_BIDDING_TYPES = Object.freeze(['brand_bidding','no_brand_bidding']);

export function isBrandBidding(value) {
  return value == null || BRAND_BIDDING_TYPES.includes(value);
}

export function brandBiddingLabel(value) {
  return value === 'brand_bidding' ? 'Brand bidding' : value === 'no_brand_bidding' ? 'No brand bidding' : 'Não definido';
}

export function withBrandBidding(existing, identity, brandBidding) {
  if (!isBrandBidding(brandBidding)) throw new Error('Classificação de brand bidding inválida.');
  return {...existing,...identity,brandBidding};
}
