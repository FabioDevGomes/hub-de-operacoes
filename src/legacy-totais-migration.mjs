export const LEGACY_TOTAIS_VERSION = 1;
export const LEGACY_TOTAIS_SEED_SCHEMA = 'legacy_totais_migration_v1';

const clone = value => structuredClone(value);
const exactName = value => String(value ?? '').trim();
const accountText = value => String(value ?? '').trim();
const noAccountValues = new Set(['', '-', '–', '—', 'n/a', 'na']);
function legacyAccountLabel(value) {
  const text = accountText(value);
  return noAccountValues.has(text.toLocaleLowerCase('pt-BR')) ? null : text;
}
function accountKey(value) {
  const text = legacyAccountLabel(value);
  if (!text) return null;
  if (/^\d{3}-\d{3}-\d{4}$/.test(text)) return `customer:${text.replace(/\D/g, '').slice(-4)}`;
  if (/^\d{10}$/.test(text)) return `customer:${text.slice(-4)}`;
  if (/^\d{4}$/.test(text)) return `customer:${text}`;
  return `label:${text.toLocaleLowerCase('pt-BR')}`;
}
function accountSuffix(value) {
  const key = accountKey(value);
  return key?.startsWith('customer:') ? key.slice('customer:'.length) : null;
}
const metric = value => value?.state === 'observed' && value.value != null && value.value !== '' && Number.isFinite(Number(value.value))
  ? { value: Number(value.value), state: 'observed' }
  : { value: null, state: value?.state || 'unknown' };

function stableId(sequence, name) {
  let hash = 2166136261;
  for (const char of name) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy_totais_v1_${String(sequence).padStart(3, '0')}_${(hash >>> 0).toString(36)}`;
}

function legacySummary(row) {
  const investment = metric(row.metrics?.investment_brl);
  const clicks = metric(row.metrics?.clicks);
  const conversions = metric(row.metrics?.conversions);
  const commission = metric(row.metrics?.commission_brl);
  const profit = investment.state === 'observed' && commission.state === 'observed'
    ? { value: commission.value - investment.value, state: 'derived' }
    : { value: null, state: 'unknown' };
  const roi = investment.state === 'observed' && investment.value > 0 && commission.state === 'observed'
    ? { value: (commission.value - investment.value) / investment.value * 100, state: 'derived' }
    : { value: null, state: 'unknown' };
  const reported = row.reported_roi_percent == null || row.reported_roi_percent === '' ? NaN : Number(row.reported_roi_percent);
  return {
    schema: 'legacy_totais_summary_v1',
    origin: 'legacy_totais',
    historical_number: Number(row.historical_number),
    end_date: row.end_date || null,
    account_legacy: legacyAccountLabel(row.account_legacy),
    account_suffix: accountSuffix(row.account_legacy),
    metrics: { investment_brl: investment, clicks, conversions, commission_brl: commission },
    profit_brl: profit,
    roi_percent: roi,
    reported_roi_percent: Number.isFinite(reported) ? reported : null,
  };
}

function addTotal(totals, field, value) {
  if (value?.state !== 'observed' || !Number.isFinite(value.value)) return;
  const total = totals[field];
  total.count += 1;
  total.sum += value.value;
}

function sourceTotals(rows) {
  const totals = {
    investment_brl: { count: 0, sum: 0 },
    clicks: { count: 0, sum: 0 },
    conversions: { count: 0, sum: 0 },
    commission_brl: { count: 0, sum: 0 },
    derived_profit_brl: { count: 0, sum: 0 },
  };
  for (const row of rows) {
    const summary = legacySummary(row);
    for (const field of ['investment_brl', 'clicks', 'conversions', 'commission_brl']) {
      addTotal(totals, field, summary.metrics[field]);
    }
    if (summary.profit_brl?.state === 'derived' && Number.isFinite(summary.profit_brl.value)) {
      totals.derived_profit_brl.count += 1;
      totals.derived_profit_brl.sum += summary.profit_brl.value;
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([key, total]) => [key, {
    count: total.count,
    sum: Number(total.sum.toFixed(4)),
  }]));
}

function persistedSummaryTotals(campaigns) {
  const totals = {
    investment_brl: { count: 0, sum: 0 },
    clicks: { count: 0, sum: 0 },
    conversions: { count: 0, sum: 0 },
    commission_brl: { count: 0, sum: 0 },
    derived_profit_brl: { count: 0, sum: 0 },
  };
  for (const campaign of campaigns || []) {
    const summary = campaign?.legacy_totais;
    if (!summary) continue;
    for (const field of ['investment_brl', 'clicks', 'conversions', 'commission_brl']) {
      addTotal(totals, field, summary.metrics?.[field]);
    }
    const profit = summary.profit_brl;
    if (profit?.state === 'derived' && Number.isFinite(profit.value)) {
      totals.derived_profit_brl.count += 1;
      totals.derived_profit_brl.sum += profit.value;
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([key, total]) => [key, {
    count: total.count,
    sum: Number(total.sum.toFixed(4)),
  }]));
}

function nativeIndexes(base) {
  const directByName = new Map();
  const displayByName = new Map();
  const accountsByName = new Map();
  const accountKeys = new Set();
  const byId = new Map();
  const campaignsById = new Map((base.campanhas || []).map(item => [item.id, item]));
  const addName = (map, name, campaign) => {
    if (!name) return;
    const list = map.get(name) || [];
    list.push(campaign);
    map.set(name, list);
  };
  for (const campaign of base.campanhas || []) {
    addName(directByName, exactName(campaign.nome_mcc), campaign);
    addName(displayByName, exactName(campaign.nome_exibicao), campaign);
    const accounts = new Set([campaign.conta_sufixo, campaign.conta, campaign.account].map(accountText).filter(Boolean));
    for (const value of accounts) {
      const key = accountKey(value);
      if (key) accountKeys.add(key);
    }
    if (accounts.size) accountsByName.set(campaign.id, accounts);
  }
  for (const source of base.manifesto_atual?.campanhas || []) {
    for (const campaign of directByName.get(exactName(source.nome_campanha_exato)) || []) {
      const accounts = accountsByName.get(campaign.id) || new Set();
      for (const period of [source.metricas_D_zero, source.metricas_D_menos_1]) {
        const raw = period?.conta?.valor ?? period?.conta;
        const text = accountText(raw);
        if (text) {
          accounts.add(text);
          const key = accountKey(text);
          if (key) accountKeys.add(key);
        }
      }
      if (accounts.size) accountsByName.set(campaign.id, accounts);
    }
  }
  for (const row of base.diario || []) {
    if (!campaignsById.has(row.campanha_id)) continue;
    const total = byId.get(row.campanha_id) || {
      investment_brl: { count: 0, sum: 0 }, clicks: { count: 0, sum: 0 },
      conversions: { count: 0, sum: 0 }, commission_brl: { count: 0, sum: 0 },
    };
    for (const [field, column] of Object.entries({ investment_brl: 'O', clicks: 'C', conversions: 'F', commission_brl: 'P' })) {
      const raw = row.celulas?.[column]?.value;
      if (raw == null || raw === '' || !Number.isFinite(Number(raw))) continue;
      total[field].count += 1;
      total[field].sum += Number(raw);
    }
    byId.set(row.campanha_id, total);
  }
  return { directByName, displayByName, accountsByName, accountKeys, totalsById: byId };
}

function comparableDifference(field, nativeValue, legacyValue) {
  if (legacyValue?.state !== 'observed' || !nativeValue?.count) return false;
  const tolerance = field === 'investment_brl' || field === 'commission_brl' ? 0.005 : 0;
  return Math.abs(nativeValue.sum - legacyValue.value) > tolerance;
}

function sameSummary(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateSeed(seed) {
  const errors = [];
  if (seed?.schema !== LEGACY_TOTAIS_SEED_SCHEMA || !Array.isArray(seed.campaigns)) {
    return ['O payload local de migração não tem o formato esperado.'];
  }
  const seenNames = new Set();
  for (const [index, row] of seed.campaigns.entries()) {
    const name = exactName(row?.name);
    if (!name) errors.push(`Linha ${index + 1}: nome de campanha vazio.`);
    if (!Number.isInteger(Number(row?.historical_number)) || Number(row.historical_number) < 1) {
      errors.push(`Linha ${index + 1}: número histórico inválido.`);
    }
    if (seenNames.has(name)) errors.push(`Nome exato duplicado no payload: ${name}.`);
    seenNames.add(name);
    if (row?.end_date != null) {
      const validDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.end_date)
        && !Number.isNaN(Date.parse(`${row.end_date}T00:00:00Z`))
        && new Date(`${row.end_date}T00:00:00Z`).toISOString().slice(0, 10) === row.end_date;
      if (!validDate) errors.push(`Linha ${index + 1}: data de encerramento inválida.`);
    }
  }
  if (seed.campaigns.length && seed.campaigns.some((row, index) => Number(row.historical_number) !== index + 1)) {
    errors.push('A numeração histórica não está sequencial.');
  }
  return errors;
}

export function planLegacyTotaisMigration(baseInput, seed, { appliedAt = new Date().toISOString() } = {}) {
  const base = clone(baseInput || {});
  base.campanhas ||= [];
  base.diario ||= [];
  if (migrationAlreadyApplied(base)) {
    return { status: 'already_applied', base, report: clone(base.legacy_totais_migration.report || {}) };
  }
  const report = {
    version: LEGACY_TOTAIS_VERSION,
    rows_analyzed: Array.isArray(seed?.campaigns) ? seed.campaigns.length : 0,
    campaigns_valid: 0,
    existing_account_rows_excluded: 0,
    existing_accounts_excluded: 0,
    rows_without_account: 0,
    created_legacy: 0,
    existing_in_hub: 0,
    linked_safely: 0,
    not_linked: 0,
    duplicates_avoided: 0,
    ambiguities: [],
    not_linked_reasons: [],
    campaigns_without_end_date: 0,
    summary_rows_ignored: Number(seed?.summary_rows_ignored || 0),
    divergences: [],
    source_totals: sourceTotals([]),
    persisted_legacy_totals: null,
  };
  const seedErrors = validateSeed(seed);
  if (seedErrors.length) {
    report.ambiguities = seedErrors.map(reason => ({ reason }));
    return { status: 'blocked', base: baseInput, report };
  }
  const actions = [];
  const indexes = nativeIndexes(base);
  const excludedAccountKeys = new Set();
  const candidates = [];
  for (const row of seed.campaigns) {
    const key = accountKey(row.account_legacy);
    if (key && indexes.accountKeys.has(key)) {
      report.existing_account_rows_excluded += 1;
      excludedAccountKeys.add(key);
      continue;
    }
    if (!legacyAccountLabel(row.account_legacy)) report.rows_without_account += 1;
    candidates.push(row);
  }
  report.existing_accounts_excluded = excludedAccountKeys.size;
  report.campaigns_valid = candidates.length;
  report.campaigns_without_end_date = candidates.filter(row => !row.end_date).length;
  report.source_totals = sourceTotals(candidates);
  const usedIds = new Map(base.campanhas.map(item => [item.id, item]));
  for (const row of candidates) {
    const name = exactName(row.name);
    const directMatches = indexes.directByName.get(name) || [];
    const displayMatches = directMatches.length ? [] : (indexes.displayByName.get(name) || []).filter(item => exactName(item.nome_mcc) !== name);
    if (directMatches.length > 1) {
      report.not_linked_reasons.push({ name, reason: 'Mais de uma campanha nativa possui o mesmo nome exato; o resumo foi mantido como registro legado separado.' });
    }
    if (!directMatches.length && displayMatches.length) {
      report.not_linked_reasons.push({ name, reason: 'Há campanha com o mesmo nome de exibição, sem identidade MCC exata; o resumo foi mantido como registro legado separado.' });
    }

    const legacy = legacySummary(row);
    if (directMatches.length === 1) {
      const match = directMatches[0];
      if (!match.id) {
        report.ambiguities.push({ name, reason: 'A campanha nativa não possui ID estável.' });
        continue;
      }
      const account = accountKey(row.account_legacy);
      const nativeAccounts = indexes.accountsByName.get(match.id) || new Set();
      const nativeAccountKeys = new Set([...nativeAccounts].map(accountKey).filter(Boolean));
      if (account && nativeAccountKeys.size && !nativeAccountKeys.has(account)) {
        report.not_linked_reasons.push({ name, reason: 'A conta da planilha diverge da conta nativa; o resumo foi mantido como registro legado separado.' });
      } else {
        if (match.legacy_totais && !sameSummary(match.legacy_totais, legacy)) {
          report.ambiguities.push({ name, reason: 'Já existe um resumo legado diferente associado à campanha.' });
          continue;
        }
        report.existing_in_hub += 1;
        report.linked_safely += 1;
        report.duplicates_avoided += 1;
        const totals = indexes.totalsById.get(match.id) || null;
        if (totals) {
          for (const field of ['investment_brl', 'clicks', 'conversions', 'commission_brl']) {
            if (comparableDifference(field, totals[field], legacy.metrics[field])) {
              report.divergences.push({ name, field, native: totals[field].sum, legacy: legacy.metrics[field].value });
            }
          }
        }
        actions.push({ kind: 'link', id: match.id, legacy });
        continue;
      }
    }

    const id = stableId(row.historical_number, name);
    const collision = usedIds.get(id);
    if (collision && (exactName(collision.nome_mcc) !== name || collision.registro_origem !== 'legacy_totais' || !sameSummary(collision.legacy_totais, legacy))) {
      report.ambiguities.push({ name, reason: 'Colisão de ID com outra campanha existente.' });
      continue;
    }
    if (collision) {
      report.duplicates_avoided += 1;
      continue;
    }
    report.created_legacy += 1;
    report.not_linked += 1;
    actions.push({ kind: 'create', id, name, legacy });
  }

  if (report.ambiguities.length) return { status: 'blocked', base: baseInput, report };

  const migrated = clone(base);
  migrated.campanhas ||= [];
  for (const action of actions) {
    if (action.kind === 'link') {
      const campaign = migrated.campanhas.find(item => item.id === action.id);
      if (!campaign.legacy_totais) campaign.legacy_totais = action.legacy;
      campaign.registro_origem ||= 'native';
      if (!campaign.conta_sufixo && action.legacy.account_suffix) campaign.conta_sufixo = action.legacy.account_suffix;
      continue;
    }
    migrated.campanhas.push({
      id: action.id,
      nome_mcc: action.name,
      nome_exibicao: action.name,
      status: 'historico',
      ...(action.legacy.account_suffix ? { conta_sufixo: action.legacy.account_suffix } : {}),
      registro_origem: 'legacy_totais',
      legacy_totais: action.legacy,
    });
  }
  migrated.legacy_totais_migration = {
    version: LEGACY_TOTAIS_VERSION,
    source: 'totais',
    applied_at: appliedAt,
    report,
  };
  migrated.atualizado_em = appliedAt;
  report.persisted_legacy_totals = sourceTotals(candidates);
  report.persisted_summary_reconciled = true;
  return { status: 'ready', base: migrated, report };
}

export function migrationAlreadyApplied(base) {
  return Number(base?.legacy_totais_migration?.version || 0) >= LEGACY_TOTAIS_VERSION;
}

export function refreshLegacyTotalsReport(baseInput) {
  if (!migrationAlreadyApplied(baseInput)) return { base: baseInput, changed: false };
  const report = baseInput.legacy_totais_migration?.report || {};
  if (report.persisted_summary_reconciled === true) return { base: baseInput, changed: false };
  const totals = persistedSummaryTotals(baseInput.campanhas);
  if (JSON.stringify(report.source_totals) === JSON.stringify(totals)
    && JSON.stringify(report.persisted_legacy_totals) === JSON.stringify(totals)) {
    const base = clone(baseInput);
    base.legacy_totais_migration.report.persisted_summary_reconciled = true;
    return { base, changed: true };
  }
  const base = clone(baseInput);
  base.legacy_totais_migration.report ||= {};
  base.legacy_totais_migration.report.source_totals = totals;
  base.legacy_totais_migration.report.persisted_legacy_totals = totals;
  base.legacy_totais_migration.report.persisted_summary_reconciled = true;
  return { base, changed: true };
}
