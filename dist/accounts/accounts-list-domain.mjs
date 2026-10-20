const compare = (a, b) => String(a).localeCompare(String(b), 'pt-BR', {numeric:true, sensitivity:'base'});
const valueOf = value => value && typeof value === 'object' && Object.hasOwn(value, 'valor') ? value.valor : value;

function validDate(value) {
  const text = String(valueOf(value) ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
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
    if (!account || account === 'Sem conta') return;
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
  }
  return {byAccount, add};
}

export function buildAccountDirectory({campaigns=[], managers=[], manifest=null, snapshots=[], accountIdentities={}, manualAccounts=[]}={}) {
  const directory = createDirectory(), {add} = directory;
  const campaignByAlias = new Map();
  for (const campaign of campaigns) {
    for (const alias of campaignAliases(campaign)) campaignByAlias.set(alias, campaign);
    add(campaign.conta_id || campaign.conta_sufixo, managerFor(campaign, null, null, managers), null);
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
    const manager = managerFor(campaign, source, manifest, managerCatalog);
    const metrics = [source?.metricas_D_zero, source?.metricas_D_menos_1];
    const dates = metrics.map(item => valueOf(item?.data)).filter(Boolean);
    if (!dates.length) dates.push(...(manifest?.separacao_temporal?.D_zero?.datas_detectadas || []), ...(manifest?.separacao_temporal?.D_menos_1?.datas_detectadas || []));
    if (!dates.length) add(account, manager, null);
    else for (const date of dates) add(account, manager, date);
  }

  return [...directory.byAccount.values()].map(row => {
    const managerLabels = [...row.managers.values()].map(({id, name}) => name && id ? `${name} · ${id}` : name || id)
      .sort(compare);
    return {
      account:row.account,
      mcc:managerLabels.length ? managerLabels.join(' · ') : 'Não identificada',
      startDate:row.dates.length ? row.dates.sort()[0] : null
    };
  }).sort((a, b) => compare(a.mcc, b.mcc) || compare(a.account, b.account));
}
