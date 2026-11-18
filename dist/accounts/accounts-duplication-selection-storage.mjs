export const ACCOUNT_MAP_DUPLICATION_SELECTION_KEY = 'hub:account-map:duplication-selection:v1';

const cleanText = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0,maxLength) : '';
const digits = value => String(value ?? '').replace(/\D/g,'');

function normalizeSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) return null;
  const normalizeItem = (item, {source = false} = {}) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const productKey = cleanText(item.productKey,200);
    const productName = cleanText(item.productName,200);
    const selectedAccountId = cleanText(item.selectedAccountId,120);
    const customerId = digits(item.customerId || selectedAccountId);
    if (!productKey || !productName || !selectedAccountId || !/^\d{10}$/.test(customerId)) return null;
    const result = {productKey,productName,selectedAccountId,customerId};
    if (source) {
      result.campaignName = cleanText(item.campaignName,400);
      result.campaignId = digits(item.campaignId);
      if (!result.campaignName || (result.campaignId && !/^\d+$/.test(result.campaignId))) return null;
    }
    return result;
  };

  const source = value.source == null ? null : normalizeItem(value.source,{source:true});
  if (value.source != null && !source) return null;
  if (!Array.isArray(value.destinations) || value.destinations.length > 100) return null;
  const destinations = [];
  const seenAccounts = new Set(source ? [source.customerId] : []);
  for (const item of value.destinations) {
    const destination = normalizeItem(item);
    if (!destination || seenAccounts.has(destination.customerId)) return null;
    seenAccounts.add(destination.customerId);
    destinations.push(destination);
  }
  return source || destinations.length ? {schemaVersion:1,source,destinations} : null;
}

export function createAccountDuplicationSelectionStorage(storage) {
  return {
    read() {
      if (!storage?.getItem) return null;
      try {
        const raw = storage.getItem(ACCOUNT_MAP_DUPLICATION_SELECTION_KEY);
        return raw ? normalizeSelection(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },
    write(value) {
      const selection = normalizeSelection(value);
      if (!selection || !storage?.setItem) return false;
      try {
        storage.setItem(ACCOUNT_MAP_DUPLICATION_SELECTION_KEY,JSON.stringify(selection));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      if (!storage?.removeItem) return false;
      try {
        storage.removeItem(ACCOUNT_MAP_DUPLICATION_SELECTION_KEY);
        return true;
      } catch {
        return false;
      }
    }
  };
}
