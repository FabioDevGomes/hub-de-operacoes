export const ACCOUNT_MAP_HIDDEN_PRODUCTS_KEY = 'hub:account-map:hidden-product-keys:v1';

export function createAccountVisibilityStorage(storage) {
  return {
    read() {
      try {
        const values = JSON.parse(storage?.getItem(ACCOUNT_MAP_HIDDEN_PRODUCTS_KEY) || '[]');
        return new Set(Array.isArray(values) ? values.map(value => String(value)).filter(Boolean) : []);
      } catch {
        return new Set();
      }
    },
    write(keys) {
      try {
        if (!storage?.setItem) return false;
        storage.setItem(ACCOUNT_MAP_HIDDEN_PRODUCTS_KEY, JSON.stringify([...new Set(keys)].map(String)));
        return true;
      } catch {
        return false;
      }
    }
  };
}
