import './hub-database.js?v=1';
// The same implementation serves classic pages and ES modules; no duplicate schema.
export const {DB_NAME,DB_VERSION,openDatabase,ensureStores,BILLING_STORES,PERSONAL_FINANCE_STORES}=globalThis.HubDatabase;
