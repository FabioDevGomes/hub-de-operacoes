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

export function buildAccountReport(allRows, filters) {
  const accountOptions = [...new Set(allRows.map(row => row.account))].sort(compare);
  const productOptions = [...new Set(allRows.map(row => row.product))].sort(compare);
  const account = accountOptions.includes(filters.account) ? filters.account : 'all';
  const product = productOptions.includes(filters.product) ? filters.product : 'all';
  const accountRows = filterAccountCpaCoverageRows(allRows, filters.status, account);
  const rows = accountRows.filter(row => product === 'all' || row.product === product);
  const accounts = [...new Set(rows.map(row => row.account))].sort((a, b) =>
    a === 'Sem conta' ? 1 : b === 'Sem conta' ? -1 : a.localeCompare(b, 'pt-BR', {numeric:true}));
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
  const bars = [...products].sort((a, b) =>
    new Set(b.rows.map(row => row.account)).size - new Set(a.rows.map(row => row.account)).size ||
    a.name.localeCompare(b.name, 'pt-BR')).slice(0, 8);
  return {
    accountOptions, productOptions, account, product, rows, accounts, products, selected,
    selectedProduct, detail, bars, ranges, coverage, cpaBars:accountProductsByCpaRange(rows),
    missingTotal:coverage.reduce((sum, item) => sum + item.missing.length, 0),
    kpis:{
      products:products.length, campaigns:rows.length, active:rows.length - paused, paused,
      accounts:accounts.filter(value => value !== 'Sem conta').length,
      multiAccount:products.filter(item => new Set(item.rows.map(row => row.account)).size > 1).length,
      missing:rows.filter(row => row.account === 'Sem conta').length
    }
  };
}
