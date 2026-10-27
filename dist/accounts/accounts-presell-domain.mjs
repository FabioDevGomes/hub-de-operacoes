// Read-only association: exact product identity plus an unambiguous account ID.
const productIdentity = value => String(value ?? '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const accountIdentity = value => {
  const text = String(value ?? '').trim();
  return /^(?:\d{10}|\d{3}-\d{3}-\d{4}|\d{4})$/.test(text) ? text.replace(/\D/g, '') : null;
};

function trackIdentity(track) {
  const label = String(track.productLabel || '').trim();
  const labelMatch = /^(.+?)[\s–—-]+conta[\s-]+(\d{3}-\d{3}-\d{4}|\d{10}|\d{4})(?:\s+(?:gm|gurumedia|cb|clickbank))?$/i.exec(label);
  if (labelMatch) return {product:productIdentity(labelMatch[1]),account:accountIdentity(labelMatch[2])};
  const key = String(track.productKey || '').trim();
  const keyMatch = /^(.+?)-conta-(\d{3}-\d{3}-\d{4}|\d{10}|\d{4})(?:-(?:gm|gurumedia|cb|clickbank))?$/i.exec(key);
  return keyMatch ? {product:productIdentity(keyMatch[1]),account:accountIdentity(keyMatch[2])} : null;
}

function rowProductIdentities(row) {
  return new Set([productIdentity(row.productKey),productIdentity(row.product)].filter(Boolean));
}

function rowProductLabelIdentity(row) {
  return productIdentity(row.product || row.productKey);
}

function resolveTrackProduct(rows, account, product) {
  const accountRows = rows.filter(row => accountIdentity(row.account) === account);
  if (accountRows.some(row => rowProductIdentities(row).has(product))) {
    return {product, matchType:'exact'};
  }
  // A shortened Track label is safe only when it uniquely identifies one
  // canonical product inside the already resolved account.
  if (product.length < 4) return null;
  const candidates = new Set(accountRows.map(rowProductLabelIdentity)
    .filter(label => label && label.startsWith(product)));
  return candidates.size === 1 ? {product:[...candidates][0],matchType:'unique-prefix'} : null;
}

function resolveTrackRows(rows, track) {
  const identity = trackIdentity(track);
  if (!identity?.product || !identity.account) return null;
  const accounts = [...new Set(rows.map(row => accountIdentity(row.account)).filter(Boolean))];
  const candidates = accounts.filter(account => identity.account.length === 10
    ? account === identity.account : account.endsWith(identity.account));
  if (candidates.length !== 1) return null;
  const account = candidates[0];
  const product = resolveTrackProduct(rows, account, identity.product);
  if (!product) return null;
  const accountRows = rows.filter(row => accountIdentity(row.account) === account);
  const matchedRows = accountRows.filter(row => product.matchType === 'exact'
    ? rowProductIdentities(row).has(product.product)
    : rowProductLabelIdentity(row) === product.product);
  return matchedRows.length ? {account, matchedRows} : null;
}

export function resolveTrackMcc(rows, track) {
  const match = resolveTrackRows(Array.isArray(rows) ? rows : [], track || {});
  if (!match) return {status:'unidentified',label:'Não identificada',mccId:null,mccName:'',account:null};
  const managers = new Map();
  for (const row of match.matchedRows) {
    const id = String(row.mccId ?? '').trim();
    const name = String(row.mccName ?? '').replace(/\s+/g, ' ').trim();
    if (!id && !name) return {status:'unidentified',label:'Não identificada',mccId:null,mccName:'',account:match.account};
    const key = id ? `id:${id}` : `name:${name.toLocaleLowerCase('pt-BR')}`;
    const existing = managers.get(key);
    managers.set(key, {id, name:name || existing?.name || ''});
  }
  if (managers.size !== 1) return {status:'ambiguous',label:'MCC ambígua',mccId:null,mccName:'',account:match.account};
  const [manager] = managers.values();
  return {
    status:'identified',
    label:manager.name || (manager.id ? `MCC ${manager.id}` : 'Não identificada'),
    mccId:manager.id || null,
    mccName:manager.name,
    account:match.account,
  };
}

function presellUrl(track) {
  try {
    const url = new URL(track.origin);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || url.hostname !== track.hostname) return null;
    return url.href;
  } catch { return null; }
}

export function attachAccountPresellUrls(rows, tracks = []) {
  const matches = (Array.isArray(tracks) ? tracks : []).flatMap(track => {
    const url = presellUrl(track), match = resolveTrackRows(rows,track);
    if (!url || !match) return [];
    return match.matchedRows.map(row => ({row,url}));
  });
  return rows.map(row => {
    const presellUrls = [...new Set(matches.filter(match => match.row === row).map(match => match.url))].sort();
    return {...row,presellUrls,presellUrl:presellUrls.join(' · ') || null};
  });
}
