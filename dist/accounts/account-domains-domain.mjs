const CUSTOMER_ID = /^\d{10}$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function normalizeCustomerId(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return CUSTOMER_ID.test(digits) ? digits : '';
}

export function normalizeAccountDomain(value) {
  const domain = String(value ?? '').trim().replace(/^\.+|\.+$/g, '').toLowerCase();
  return DOMAIN.test(domain) ? domain : '';
}

export function domainsFromAccountLabel(account) {
  const candidates = [account?.domain, account?.website, account?.name]
    .filter(value => typeof value === 'string')
    .flatMap(value => [...value.matchAll(/((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)/gi)].map(match => match[1].toLowerCase()))
    .filter(value => normalizeAccountDomain(value));
  return [...new Set(candidates)];
}

export function suggestedLegacyAccountDomain(account) {
  const domains = domainsFromAccountLabel(account);
  return domains.length === 1 ? domains[0] : '';
}

export function resolveAccountDomain(customerId, associations, legacyDomain = '') {
  const id = normalizeCustomerId(customerId);
  const entry = (Array.isArray(associations) ? associations : []).find(item => normalizeCustomerId(item?.customerId) === id);
  if (entry) return { found: true, domain: normalizeAccountDomain(entry.domain) || null, entry };
  return { found: false, domain: normalizeAccountDomain(legacyDomain) || null, entry: null };
}
