export const CLICKBANK_COMMISSION_CURRENCY = 'USD';
const MAX_COMMISSION_USD = 99999999.99;

export function parseCommissionUsd(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replace(',', '.'));
  if (!isCommissionUsd(amount)) return null;
  return Math.round(amount * 100) / 100;
}

export function isCommissionUsd(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.01 || value > MAX_COMMISSION_USD) return false;
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
}

export function formatCommissionUsd(value) {
  if (!isCommissionUsd(value)) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: CLICKBANK_COMMISSION_CURRENCY }).format(value);
}

// Compatibility aliases for existing ClickBank screens and stored drafts.
export const parseClickBankCommissionUsd = parseCommissionUsd;
export const isClickBankCommissionUsd = isCommissionUsd;
export const formatClickBankCommissionUsd = formatCommissionUsd;
