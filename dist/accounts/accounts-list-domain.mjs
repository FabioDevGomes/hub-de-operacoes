const compare = (a, b) => String(a).localeCompare(String(b), 'pt-BR', {numeric:true, sensitivity:'base'});
const valueOf = value => value && typeof value === 'object' && Object.hasOwn(value, 'valor') ? value.valor : value;

function validDate(value) {
  const text = String(valueOf(value) ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

function metricCellValue(cell) {
  const raw = cell && typeof cell === 'object' && Object.hasOwn(cell, 'value') ? cell.value : valueOf(cell);
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return null;
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

const accountDirectorySortKeys = new Set(['account','email','paymentProfile','mcc','startDate','impressions','clicks','campaignCount','status']);
const accountDirectoryNumericSortKeys = new Set(['impressions','clicks','campaignCount']);

function accountDirectorySortValue(value, key) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  if (accountDirectoryNumericSortKeys.has(key)) {
    const number = typeof value === 'number' ? value : Number(String(value).trim());
    return Number.isFinite(number) ? number : null;
  }
  if (key === 'startDate') return validDate(value);
  return String(value).trim();
}

export function sortAccountDirectoryRows(input, key, direction = 'asc', getValue = row => row?.[key]) {
  const rows = Array.isArray(input) ? input : [];
  if (!accountDirectorySortKeys.has(key)) return [...rows];
  const sorted = rows.map((row,index)=>({row,index,value:accountDirectorySortValue(getValue(row),key)}));
  const multiplier = direction === 'desc' ? -1 : 1;
  return sorted.sort((a,b)=>{
    if (a.value == null || b.value == null) return a.value == null ? (b.value == null ? a.index-b.index : 1) : -1;
    const order = typeof a.value === 'number' ? a.value-b.value : compare(a.value,b.value);
    return order ? order*multiplier : a.index-b.index;
  }).map(item=>item.row);
}

export function normalizeAccountDirectoryId(value) {
  const raw = String(value ?? '').trim();
  if (/^\d{3}-\d{3}-\d{4}$/.test(raw)) return raw;
  if (/^\d{10}$/.test(raw)) return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6)}`;
  return null;
}

function accountFromMetrics(source, campaign) {
  const metrics = [source?.metricas_D_zero, source?.metricas_D_menos_1];
  const fullId = metrics.map(item => valueOf(item?.conta_id)).find(value => value != null && String(value).trim());
  if (fullId) return String(fullId).trim();
  const storedId = campaign?.conta_id;
  if (storedId) return String(storedId).trim();
  const suffix = campaign?.conta_sufixo;
  if (suffix) return String(suffix).trim();
  const accountName = metrics.map(item => valueOf(item?.conta)).find(value => value != null && String(value).trim());
  return String(accountName ?? '').trim().match(/^(\d{4})(?!\d)/)?.[1] ?? null;
}

function campaignAliases(campaign) {
  return [campaign?.nome_mcc, campaign?.nome_mcc_anterior, ...(campaign?.nome_mcc_anteriores || [])]
    .map(name => String(name ?? '').trim().toLocaleLowerCase('pt-BR')).filter(Boolean);
}

function managerFor(campaign, source, manifest, managers) {
  const catalog = Array.isArray(managers) ? managers : [];
  const manifestManager = manifest?.identificacao_mcc || {};
  const id = String(source?.mcc_id || campaign?.mcc_id || manifestManager.id || '').trim();
  const registered = catalog.find(manager => String(manager?.id ?? '') === id);
  const name = String(source?.mcc_nome || registered?.nome || (id === String(manifestManager.id || '').trim() ? manifestManager.nome : '') || '').trim();
  return {id, name};
}

function createDirectory() {
  const byAccount = new Map();
  function add(accountValue, manager, dateValue) {
    const rawAccount = String(accountValue ?? '').trim();
    const account = normalizeAccountDirectoryId(rawAccount) || rawAccount;
    if (!account || account === 'Sem conta') return null;
    const row = byAccount.get(account) || {account, managers:new Map(), dates:[]};
    const id = String(manager?.id ?? '').trim(), name = String(manager?.name ?? '').trim();
    if (id || name) {
      if (id && name) for (const [key, existing] of row.managers) {
        if (!existing.id && existing.name === name) row.managers.delete(key);
      }
      const existing = row.managers.get(id || name);
      row.managers.set(id || name, {id, name:name || existing?.name || ''});
    }
    const date = validDate(dateValue);
    if (date) row.dates.push(date);
    byAccount.set(account, row);
    return account;
  }
  return {byAccount, add};
}

export function buildAccountDirectory({campaigns=[], managers=[], manifest=null, snapshots=[], diario=[], accountIdentities={}, manualAccounts=[]}={}) {
  const directory = createDirectory(), {add} = directory;
  const campaignByAlias = new Map();
  const accountByCampaignId = new Map();
  const accountByCampaignName = new Map();
  for (const campaign of campaigns) {
    for (const alias of campaignAliases(campaign)) {
      campaignByAlias.set(alias, campaign);
      accountByCampaignName.set(alias, normalizeAccountDirectoryId(campaign.conta_id || campaign.conta_sufixo) || campaign.conta_id || campaign.conta_sufixo || null);
    }
    const account = add(campaign.conta_id || campaign.conta_sufixo, managerFor(campaign, null, null, managers), null);
    if (campaign.id && account) accountByCampaignId.set(String(campaign.id), account);
  }
  for (const [suffix, id] of Object.entries(accountIdentities || {})) add(id || suffix, {}, null);
  for (const account of manualAccounts || []) add(normalizeAccountDirectoryId(account), {}, null);

  for (const snapshot of snapshots || []) {
    const date = validDate(snapshot?.data);
    if (!date) continue;
    for (const name of snapshot?.campanhas || []) {
      const campaign = campaignByAlias.get(String(name ?? '').trim().toLocaleLowerCase('pt-BR'));
      if (!campaign) continue;
      add(campaign.conta_id || campaign.conta_sufixo, managerFor(campaign, null, null, managers), date);
    }
  }

  const managerCatalog = Array.isArray(managers) ? managers : [];
  const manifestCampaigns = manifest?.campanhas || [];
  for (const source of manifestCampaigns) {
    const campaign = campaignByAlias.get(String(source?.nome_campanha_exato ?? '').trim().toLocaleLowerCase('pt-BR'));
    const account = accountFromMetrics(source, campaign);
    if (!account) continue;
    const canonicalAccount = normalizeAccountDirectoryId(account) || account;
    if (campaign?.id) accountByCampaignId.set(String(campaign.id), canonicalAccount);
    if (campaign) for (const alias of campaignAliases(campaign)) accountByCampaignName.set(alias, canonicalAccount);
    const manager = managerFor(campaign, source, manifest, managerCatalog);
    const metrics = [source?.metricas_D_zero, source?.metricas_D_menos_1];
    const dates = metrics.map(item => valueOf(item?.data)).filter(Boolean);
    if (!dates.length) dates.push(...(manifest?.separacao_temporal?.D_zero?.datas_detectadas || []), ...(manifest?.separacao_temporal?.D_menos_1?.datas_detectadas || []));
    if (!dates.length) add(account, manager, null);
    else for (const date of dates) add(account, manager, date);
  }

  const impressionsByAccount = new Map();
  const clicksByAccount = new Map();
  const campaignsByAccount = new Map();
  for (const campaign of campaigns || []) {
    const aliases = campaignAliases(campaign);
    const account = (campaign?.id ? accountByCampaignId.get(String(campaign.id)) : null)
      || aliases.map(alias => accountByCampaignName.get(alias)).find(Boolean)
      || normalizeAccountDirectoryId(campaign?.conta_id || campaign?.conta_sufixo)
      || campaign?.conta_id || campaign?.conta_sufixo;
    const identity = campaign?.id != null && String(campaign.id).trim()
      ? `id:${String(campaign.id).trim()}`
      : aliases[0] ? `name:${aliases[0]}` : null;
    if (!account || !identity) continue;
    const canonicalAccount = normalizeAccountDirectoryId(account) || String(account).trim();
    const identities = campaignsByAccount.get(canonicalAccount) || new Set();
    identities.add(identity);
    campaignsByAccount.set(canonicalAccount, identities);
  }
  for (const row of diario || []) {
    const account = accountByCampaignId.get(String(row?.campanha_id ?? ''));
    if (!account) continue;
    const impressions = metricCellValue(row?.celulas?.B);
    const clicks = metricCellValue(row?.celulas?.C);
    if (impressions != null) impressionsByAccount.set(account, (impressionsByAccount.get(account) || 0) + impressions);
    if (clicks != null) clicksByAccount.set(account, (clicksByAccount.get(account) || 0) + clicks);
  }

  return [...directory.byAccount.values()].map(row => {
    const managerLabels = [...row.managers.values()].map(({id, name}) => name && id ? `${name} · ${id}` : name || id)
      .sort(compare);
    return {
      account:row.account,
      mcc:managerLabels.length ? managerLabels.join(' · ') : 'Não identificada',
      startDate:row.dates.length ? row.dates.sort()[0] : null,
      impressions:impressionsByAccount.get(row.account) ?? null,
      clicks:clicksByAccount.get(row.account) ?? null,
      campaignCount:campaignsByAccount.get(row.account)?.size ?? 0
    };
  }).sort((a, b) => compare(a.mcc, b.mcc) || compare(a.account, b.account));
}
