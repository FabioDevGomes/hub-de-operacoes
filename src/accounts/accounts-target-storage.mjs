export const ACCOUNT_MAP_DUPLICATION_TARGET_KEY = 'hub:account-map:duplication-target:v1';
export const ACCOUNT_MAP_DUPLICATION_TARGET_UPDATED_EVENT = 'hub:account-map-duplication-target-updated';

const normalizeTarget = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const productKey = typeof value.productKey === 'string' ? value.productKey.trim() : '';
  const accountId = typeof value.accountId === 'string' ? value.accountId.trim() : '';
  const note = typeof value.note === 'string' ? value.note.trim() : '';
  if (!productKey || productKey.length > 200 || !accountId || accountId.length > 120 || note.length > 500) return null;
  const target = {productKey,accountId,note};
  if (Number.isSafeInteger(value.campaignCountAtMark) && value.campaignCountAtMark >= 0) target.campaignCountAtMark = value.campaignCountAtMark;
  return target;
};

export function createAccountDuplicationTargetStorage(storage) {
  return {
    read() {
      if (!storage?.getItem) return null;
      try {
        const raw = storage.getItem(ACCOUNT_MAP_DUPLICATION_TARGET_KEY);
        return raw ? normalizeTarget(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },
    write(value) {
      const target = normalizeTarget(value);
      if (!target || !storage?.setItem) return false;
      try {
        storage.setItem(ACCOUNT_MAP_DUPLICATION_TARGET_KEY,JSON.stringify(target));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      if (!storage?.removeItem) return false;
      try {
        storage.removeItem(ACCOUNT_MAP_DUPLICATION_TARGET_KEY);
        return true;
      } catch {
        return false;
      }
    }
  };
}
