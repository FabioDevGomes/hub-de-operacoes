export const SALES_PAGE_TYPES = Object.freeze(['dtc','vsl','tsl','quiz']);

export function isSalesPageType(value) {
  return value == null || SALES_PAGE_TYPES.includes(value);
}

export function salesPageTypeLabel(value) {
  return SALES_PAGE_TYPES.includes(value) ? value.toUpperCase() : '—';
}

export function withSalesPageType(existing, identity, salesPageType) {
  if (!isSalesPageType(salesPageType)) throw new Error('Tipo de página de venda inválido.');
  return {...existing,...identity,salesPageType};
}
