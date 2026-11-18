// Read-only projections for Mapa por Conta. Rows are supplied by the Hub adapter;
// identity, cpa and zeroDays reuse the existing campaign parsers, never the database.
const compare = (a, b) => a.localeCompare(b, 'pt-BR', {numeric:true, sensitivity:'base'});

export function createAccountState() {
  return {status:'ativa', account:'all', product:'all', selected:null, sortKey:null, sortDir:'asc'};
}

function accountMccFilterKey(row) {
  const rawId = String(row?.mccId ?? '').trim();
  if (rawId) {
    const digits = rawId.replace(/\D/g, '');
    return `id:${/^\d{10}$/.test(digits) ? digits : rawId.toLocaleLowerCase('pt-BR')}`;
  }
  const name = String(row?.mccName ?? '').replace(/\s+/g, ' ').trim();
  return name ? `name:${name.toLocaleLowerCase('pt-BR')}` : 'unknown';
}

const customerDigits = value => String(value ?? '').replace(/\D/g, '');

function formatCustomerId(value) {
  const digits = customerDigits(value);
  return /^\d{10}$/.test(digits) ? `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}` : '';
}

export function projectAccountDirectory(rows, directoryAccounts = []) {
  const accountByCustomerId = new Map();
  for (const row of rows || []) {
    const customerId = customerDigits(row?.accountId || row?.account);
    if (/^\d{10}$/.test(customerId) && row?.account && row.account !== 'Sem conta' && !accountByCustomerId.has(customerId)) {
      accountByCustomerId.set(customerId, row.account);
    }
  }
  const seen = new Set();
  const accounts = [];
  for (const entry of Array.isArray(directoryAccounts) ? directoryAccounts : []) {
    const customerId = customerDigits(entry?.customerId);
    if (!/^\d{10}$/.test(customerId) || seen.has(customerId)) continue;
    seen.add(customerId);
    const managerCustomerId = customerDigits(entry?.managerCustomerId);
    const account = accountByCustomerId.get(customerId) || formatCustomerId(customerId);
    accounts.push({
      customerId,
      account,
      mccId:/^\d{10}$/.test(managerCustomerId) ? managerCustomerId : '',
      mccName:String(entry?.managerName || '').trim(),
      accountName:String(entry?.name || '').trim(),
    });
  }
  const accountsByCustomerId = new Map(accounts.map(account => [account.customerId, account]));
  const projectedRows = (rows || []).map(row => {
    const customerId = customerDigits(row?.accountId || row?.account);
    const directoryAccount = accountsByCustomerId.get(customerId);
    if (!directoryAccount) return row;
    const accountNames = [
      ...(Array.isArray(row.accountNames) ? row.accountNames : [row.accountName]),
      directoryAccount.accountName,
    ].filter(value => String(value || '').trim());
    return {
      ...row,
      account:row.account && row.account !== 'Sem conta' ? row.account : directoryAccount.account,
      mccId:directoryAccount.mccId,
      mccName:directoryAccount.mccName,
      accountNames,
    };
  });
  return {rows:projectedRows, accounts};
}

function formatAccountMccId(value) {
  const raw = String(value ?? '').trim(), digits = raw.replace(/\D/g, '');
  return /^\d{10}$/.test(digits) ? `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}` : raw;
}

export function accountMccFilterOptions(rows, directoryAccounts = []) {
  const groups = new Map();
  for (const row of [...(rows || []), ...(Array.isArray(directoryAccounts) ? directoryAccounts : [])]) {
    const key = accountMccFilterKey(row);
    const group = groups.get(key) || {names:new Set(), ids:new Set()};
    const name = String(row?.mccName ?? '').replace(/\s+/g, ' ').trim();
    const id = String(row?.mccId ?? '').trim();
    if (name) group.names.add(name);
    if (id) group.ids.add(id);
    groups.set(key, group);
  }
  return [...groups].map(([value, group]) => {
    const names = [...group.names].sort(compare), ids = [...group.ids].sort(compare);
    const idLabel = ids.length ? formatAccountMccId(ids[0]) : '';
    const label = value === 'unknown' ? 'MCC não identificada' :
      names.length ? `${names.join(' · ')}${idLabel ? ` · ${idLabel}` : ''}` : `MCC ${idLabel}`;
    return {value, label};
  }).sort((a, b) => compare(a.label, b.label));
}

export function filterAccountRowsByMcc(rows, mcc = 'all') {
  return mcc === 'all' ? rows : rows.filter(row => accountMccFilterKey(row) === mcc);
}

export function filterAccountDirectoryByMcc(accounts, mcc = 'all') {
  return mcc === 'all' ? (accounts || []) : (accounts || []).filter(account => accountMccFilterKey(account) === mcc);
}

export function filterAccountCpaCoverageRows(rows, status, account) {
  return rows.filter(row => (status === 'all' || row.status === status) &&
    (account === 'all' || row.account === account));
}

export function accountDomainUrl(domain) {
  const host = String(domain ?? '').trim().replace(/^\./, '');
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) return null;
  return `https://hpanel.hostinger.com/websites/${encodeURIComponent(host)}`;
}

export function accountDetailSortValue(row, key) {
  if (key === 'campaign') return row.identity.name;
  if (key === 'campaignDate') return row.identity.dateSort;
  if (['account','domain','presellUrl','status','zeroDays','roi'].includes(key)) return row[key] ?? null;
  return row.totals?.[key] ?? null;
}

export function sortAccountDetailRows(input, key, direction = 'asc') {
  const rows = [...input];
  if (!key) return rows;
  return rows.sort((a, b) => {
    const left = accountDetailSortValue(a, key), right = accountDetailSortValue(b, key);
    // Missing values stay last in BOTH directions; zero is a valid observation.
    if (left == null || right == null) return left == null ? (right == null ? 0 : 1) : -1;
    const order = typeof left === 'string' ? compare(left, right) : left - right;
    return order * (direction === 'desc' ? -1 : 1);
  });
}

export function accountProductsByCpaRange(rows) {
  const groups = new Map();
  for (const row of rows) {
    const range = row.cpa.range, key = range == null ? 'other' : String(range);
    const group = groups.get(key) || {key, range, productKeys:new Set()};
    group.productKeys.add(row.productKey);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({...group, count:group.productKeys.size}))
    .sort((a, b) => (a.range ?? Infinity) - (b.range ?? Infinity));
}

export function accountCpaCoverage(rows, ranges) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.productKey) || {
      key:row.productKey, name:row.product, ranges:new Map(), commissions:new Set()
    };
    const title = row.cpa, range = title.range;
    if (range != null) {
      const counts = group.ranges.get(range) || {active:0, paused:0};
      counts[row.status === 'pausada' ? 'paused' : 'active']++;
      group.ranges.set(range, counts);
    }
    if (title.payout != null && title.payoutCurrency === 'USD') group.commissions.add(title.payout);
    groups.set(row.productKey, group);
  }
  return [...groups.values()].map(group => ({
    ...group, missing:ranges.filter(range => !group.ranges.has(range))
  })).sort((a, b) => compare(a.name, b.name));
}

export function accountHeaderNames(rows) {
  const namesByAccount = new Map();
  const verifiedAccountNameFallbacks = new Map([
    ['1074733248', '6ª CNPJ']
  ]);
  for (const row of rows) {
    if (!row.account || row.account === 'Sem conta') continue;
    const candidates = Array.isArray(row.accountNames) ? row.accountNames : [row.accountName];
    for (const candidate of candidates) {
      const name = String(candidate ?? '')
        .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
        .replace(/(?:https?:\/\/)?(?:www\.)?\.?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?(?:\/[^\s]*)?/gi, '')
        .replace(/^(?:conta\s+)?(?:\d{3}-\d{3}-\d{4}|\d{10}|\d{4})(?=$|[\s–—-])\s*[–—-]?\s*/i, '')
        .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '')
        .replace(/^[\s|;:,–—-]+|[\s|;:,–—-]+$/g, '').replace(/\s+/g, ' ').trim();
      if (!name || /^(?:conta|sem conta|não identificad[ao]|nao identificad[ao])$/i.test(name)) continue;
      const names = namesByAccount.get(row.account) || new Set();
      names.add(name);
      namesByAccount.set(row.account, names);
    }
  }
  for (const row of rows) {
    if (!row.account || row.account === 'Sem conta' || namesByAccount.has(row.account)) continue;
    const digits = String(row.account).replace(/\D/g, '');
    const fallback = verifiedAccountNameFallbacks.get(digits);
    if (fallback) namesByAccount.set(row.account, new Set([fallback]));
  }
  return new Map([...namesByAccount].map(([account,names]) => [account,[...names].sort(compare).join(' · ')]));
}

export function accountMccHeaderLabels(rows) {
  const namesByAccount = new Map();
  for (const row of rows) {
    if (!row.account || row.account === 'Sem conta') continue;
    const names = namesByAccount.get(row.account) || new Set();
    const name = String(row.mccName ?? '').trim();
    if (name) names.add(name);
    namesByAccount.set(row.account, names);
  }
  return new Map([...namesByAccount].map(([account, names]) => [
    account,
    names.size ? [...names].sort(compare).join(' · ') : 'MCC não identificada'
  ]));
}

function accountMccHeaderIds(rows) {
  const idsByAccount = new Map();
  for (const row of rows) {
    if (!row.account || row.account === 'Sem conta') continue;
    const rawId = String(row.mccId ?? '').trim();
    if (!rawId) continue;
    const digits = rawId.replace(/\D/g, '');
    const id = /^\d{10}$/.test(digits) ? digits : rawId.toLocaleLowerCase('pt-BR');
    const ids = idsByAccount.get(row.account) || new Set();
    ids.add(id);
    idsByAccount.set(row.account, ids);
  }
  return new Map([...idsByAccount].map(([account, ids]) => [
    account,
    [...ids].sort(compare)
  ]));
}

function sortAccountsByMcc(accounts, idsByAccount) {
  const group = account => {
    if (account === 'Sem conta') return {priority:2, id:''};
    // An account linked to multiple managers uses the first normalized MCC ID
    // as its stable primary group; its displayed labels still include all MCCs.
    const id = idsByAccount.get(account)?.[0];
    return id ? {priority:0, id} : {priority:1, id:''};
  };
  return [...accounts].sort((a, b) => {
    const left = group(a), right = group(b);
    return left.priority - right.priority ||
      (left.priority === 0 ? compare(left.id, right.id) : 0) || compare(a, b);
  });
}

export function buildAccountReport(allRows, filters, accountStatuses = {}, directoryAccounts = []) {
  const activeAccounts = accountStatuses && typeof accountStatuses === 'object' && !Array.isArray(accountStatuses)
    ? [...new Set(Object.entries(accountStatuses)
      .filter(([, status]) => status === 'active')
      .map(([account]) => String(account ?? '').trim())
      .filter(account => account && account !== 'Sem conta'))]
    : [];
  const accountMccLabels = accountMccHeaderLabels(allRows);
  const accountNames = accountHeaderNames(allRows);
  const accountMccIds = accountMccHeaderIds(allRows);
  for (const entry of Array.isArray(directoryAccounts) ? directoryAccounts : []) {
    const account = String(entry?.account || '').trim();
    if (!account || account === 'Sem conta') continue;
    accountMccLabels.set(account, String(entry.mccName || '').trim() || 'MCC não identificada');
    const name = String(entry.accountName || '').trim();
    if (name) {
      const names = new Set([...(accountNames.get(account) || '').split(' · ').filter(Boolean), name]);
      accountNames.set(account, [...names].sort(compare).join(' · '));
    }
    const digits = customerDigits(entry.mccId);
    if (/^\d{10}$/.test(digits)) accountMccIds.set(account, [digits]);
  }
  for (const account of activeAccounts) if (!accountMccLabels.has(account)) accountMccLabels.set(account, 'MCC não identificada');
  const directoryAccountKeys = (Array.isArray(directoryAccounts) ? directoryAccounts : []).map(entry => String(entry?.account || '').trim()).filter(Boolean);
  const accountOptions = sortAccountsByMcc(new Set([...allRows.map(row => row.account), ...activeAccounts, ...directoryAccountKeys]), accountMccIds);
  const productOptions = [...new Set(allRows.map(row => row.product))].sort(compare);
  const account = accountOptions.includes(filters.account) ? filters.account : 'all';
  const product = productOptions.includes(filters.product) ? filters.product : 'all';
  const accountRows = filterAccountCpaCoverageRows(allRows, filters.status, account);
  const rows = accountRows.filter(row => product === 'all' || row.product === product);
  const activeAccountColumns = account === 'all' ? activeAccounts : activeAccounts.filter(value => value === account);
  const directoryAccountColumns = account === 'all' ? directoryAccountKeys : directoryAccountKeys.filter(value => value === account);
  const accounts = sortAccountsByMcc(new Set([...rows.map(row => row.account), ...activeAccountColumns, ...directoryAccountColumns]), accountMccIds);
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.productKey) || {key:row.productKey, name:row.product, firstRecordDate:row.productFirstRecordDate ?? null, rows:[]};
    if (row.productFirstRecordDate && (!group.firstRecordDate || row.productFirstRecordDate < group.firstRecordDate)) group.firstRecordDate = row.productFirstRecordDate;
    group.rows.push(row);
    groups.set(row.productKey, group);
  }
  const products = [...groups.values()];
  const selected = groups.has(filters.selected) ? filters.selected : products[0]?.key ?? null;
  const selectedProduct = allRows.find(row => row.productKey === selected);
  const detail = sortAccountDetailRows(rows.filter(row => row.productKey === selected), filters.sortKey, filters.sortDir);
  // Product limits displayed rows, NOT the universe of CPA columns.
  const ranges = [...new Set(accountRows.map(row => row.cpa.range).filter(range => range != null))].sort((a, b) => a - b);
  const coverage = accountCpaCoverage(rows, ranges);
  const paused = rows.filter(row => row.status === 'pausada').length;
  const productKeys = new Set(products.map(item => item.key));
  const historicalRowsByProduct = new Map();
  for (const row of allRows) {
    if (!productKeys.has(row.productKey) || (account !== 'all' && row.account !== account)) continue;
    const history = historicalRowsByProduct.get(row.productKey) || [];
    history.push(row);
    historicalRowsByProduct.set(row.productKey, history);
  }
  const bars = products.map(item => {
    const history = historicalRowsByProduct.get(item.key) || [];
    const identifiedAccounts = rows => new Set(rows.map(row => String(row.account ?? '').trim())
      .filter(value => value && value !== 'Sem conta'));
    const activeAccountCount = identifiedAccounts(history.filter(row => row.status === 'ativa')).size;
    const totalAccountsTested = identifiedAccounts(history).size;
    return {key:item.key,name:item.name,activeAccountCount,totalAccountsTested};
  }).sort((a, b) => b.totalAccountsTested - a.totalAccountsTested || compare(a.name, b.name));
  return {
    accountOptions, productOptions, account, product, rows, accounts, products, selected,
    accountMccLabels, accountNames,
    selectedProduct, detail, bars, ranges, coverage, cpaBars:accountProductsByCpaRange(rows),
    missingTotal:coverage.reduce((sum, item) => sum + item.missing.length, 0),
    kpis:{
      products:products.length, campaigns:rows.length, active:rows.length - paused, paused,
      accounts:new Set(rows.map(row => row.account).filter(value => value !== 'Sem conta')).size,
      multiAccount:products.filter(item => new Set(item.rows.map(row => row.account)).size > 1).length,
      missing:rows.filter(row => row.account === 'Sem conta').length
    }
  };
}
