function normalizeHost(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.$/, '');
}
function productSlug(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function accountSuffix(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 4) return digits;
  if (digits.length === 10) return digits.slice(-4);
  return null;
}
function trackingIdentity(row) {
  for (const value of [row?.productLabel, row?.productKey]) {
    const match = productSlug(value).match(/^(.*)-conta-(\d{4})$/);
    if (match?.[1]) return match[1] + '-conta-' + match[2];
  }
  return null;
}
function campaignIdentity(row) {
  const status = String(row?.status ?? '').trim().toLowerCase();
  if (!['ativa', 'active', 'enabled'].includes(status)) return null;
  const product = productSlug(row?.product);
  const account = accountSuffix(row?.account);
  return product && account ? product + '-conta-' + account : null;
}
export function hostingerSubdomainParent(site, sites = []) {
  const hostname = normalizeHost(site?.domain);
  if (!hostname || !Array.isArray(sites)) return null;
  const declaredParent = normalizeHost(site?.parentDomain);
  const username = String(site?.username ?? '').trim();
  const candidates = sites.filter(parent => {
    const parentHost = normalizeHost(parent?.domain);
    const sameAccount = username && String(parent?.username ?? '').trim() === username;
    const suffixMatch = parentHost && hostname.endsWith('.' + parentHost);
    const parentType = String(parent?.websiteType ?? '').trim().toLowerCase();
    const parentDeclaration = normalizeHost(parent?.parentDomain);
    const parentIsNested = parentType === 'subdomain' || (parentDeclaration && parentHost.endsWith('.' + parentDeclaration));
    return parentHost && parentHost !== hostname && suffixMatch && sameAccount && !parentIsNested
      && (!declaredParent || parentHost === declaredParent);
  }).sort((left, right) => normalizeHost(right?.domain).length - normalizeHost(left?.domain).length);
  return candidates[0] ?? null;
}

export function isHostingerSubdomain(site, sites = []) {
  const hostname = normalizeHost(site?.domain);
  if (!hostname) return false;
  if (String(site?.websiteType ?? '').trim().toLowerCase() === 'subdomain') return true;
  const declaredParent = normalizeHost(site?.parentDomain);
  if (declaredParent && hostname.endsWith('.' + declaredParent)) return true;
  return Boolean(hostingerSubdomainParent(site, sites));
}

export function activeCampaignRootHostnames({ sites = [], campaignDomains = [] } = {}) {
  if (!Array.isArray(sites) || !Array.isArray(campaignDomains)) return new Set();
  const activeHosts = new Set(campaignDomains.map(normalizeHost).filter(Boolean));
  return new Set(sites.filter(site => {
    const hostname = normalizeHost(site?.domain);
    return hostname && activeHosts.has(hostname) && !isHostingerSubdomain(site, sites);
  }).map(site => normalizeHost(site?.domain)));
}

export function activePreSellSubdomainHostnames({ sites = [], trackingDomains = [], campaigns = [], googleAdsFinalUrlRows = [] } = {}) {
  return new Set(activeCampaignAccountSuffixesBySubdomain({ sites, trackingDomains, campaigns, googleAdsFinalUrlRows }).keys());
}

export function activeCampaignAccountSuffixesBySubdomain({ sites = [], trackingDomains = [], campaigns = [], googleAdsFinalUrlRows = [] } = {}) {
  if (!Array.isArray(sites) || !Array.isArray(trackingDomains) || !Array.isArray(campaigns)) return new Map();
  const activeIdentitySuffixes = new Map();
  for (const campaign of campaigns) {
    const identity = campaignIdentity(campaign);
    const suffix = accountSuffix(campaign?.account);
    if (!identity || !suffix) continue;
    const suffixes = activeIdentitySuffixes.get(identity) || new Set();
    suffixes.add(suffix);
    activeIdentitySuffixes.set(identity, suffixes);
  }
  const accountsByHost = new Map();
  const addAccount = (hostname, suffix) => {
    if (!hostname || !suffix) return;
    const suffixes = accountsByHost.get(hostname) || new Set();
    suffixes.add(suffix);
    accountsByHost.set(hostname, suffixes);
  };
  for (const row of trackingDomains) {
    const identity = trackingIdentity(row);
    const hostname = normalizeHost(row?.hostname);
    const suffixes = identity ? activeIdentitySuffixes.get(identity) : null;
    for (const suffix of suffixes || []) addAccount(hostname, suffix);
  }
  if (Array.isArray(googleAdsFinalUrlRows)) {
    for (const row of googleAdsFinalUrlRows) {
      if (row?.campaignStatus !== 'ENABLED' || row?.adStatus !== 'ENABLED') continue;
      const suffix = accountSuffix(row?.customerId);
      if (!suffix) continue;
      for (const value of Array.isArray(row.hostnames) ? row.hostnames : []) {
        const hostname = normalizeHost(value);
        addAccount(hostname, suffix);
      }
    }
  }
  const result = new Map();
  for (const site of sites) {
    const hostname = normalizeHost(site?.domain);
    const suffixes = hostname && isHostingerSubdomain(site, sites) ? accountsByHost.get(hostname) : null;
    if (suffixes?.size) result.set(hostname, new Set(suffixes));
  }
  return result;
}
