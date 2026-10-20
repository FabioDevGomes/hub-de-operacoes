// Read-only projections for Mapa por Conta. Rows are supplied by the Hub adapter;
// identity, cpa and zeroDays reuse the existing campaign parsers, never the database.
const compare = (a, b) => a.localeCompare(b, 'pt-BR', {numeric:true, sensitivity:'base'});

export function createAccountState() {
  return {status:'ativa', account:'all', product:'all', selected:null, sortKey:null, sortDir:'asc'};
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
  if (['account','domain','status','zeroDays','roi'].includes(key)) return row[key] ?? null;
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

export function buildAccountReport(allRows, filters, accountStatuses = {}) {
  const activeAccounts = accountStatuses && typeof accountStatuses === 'object' && !Array.isArray(accountStatuses)
    ? [...new Set(Object.entries(accountStatuses)
      .filter(([, status]) => status === 'active')
      .map(([account]) => String(account ?? '').trim())
      .filter(account => account && account !== 'Sem conta'))]
    : [];
  const accountMccLabels = accountMccHeaderLabels(allRows);
  const accountMccIds = accountMccHeaderIds(allRows);
  for (const account of activeAccounts) if (!accountMccLabels.has(account)) accountMccLabels.set(account, 'MCC não identificada');
  const accountOptions = sortAccountsByMcc(new Set([...allRows.map(row => row.account), ...activeAccounts]), accountMccIds);
  const productOptions = [...new Set(allRows.map(row => row.product))].sort(compare);
  const account = accountOptions.includes(filters.account) ? filters.account : 'all';
  const product = productOptions.includes(filters.product) ? filters.product : 'all';
  const accountRows = filterAccountCpaCoverageRows(allRows, filters.status, account);
  const rows = accountRows.filter(row => product === 'all' || row.product === product);
  const activeAccountColumns = account === 'all' ? activeAccounts : activeAccounts.filter(value => value === account);
  const accounts = sortAccountsByMcc(new Set([...rows.map(row => row.account), ...activeAccountColumns]), accountMccIds);
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.productKey) || {key:row.productKey, name:row.product, rows:[]};
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
  const bars = products.map(item => ({
    key:item.key,
    name:item.name,
    count:new Set(item.rows.map(row => String(row.account ?? '').trim())
      .filter(account => account && account !== 'Sem conta')).size
  })).sort((a, b) => b.count - a.count || compare(a.name, b.name));
  return {
    accountOptions, productOptions, account, product, rows, accounts, products, selected,
    accountMccLabels,
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
