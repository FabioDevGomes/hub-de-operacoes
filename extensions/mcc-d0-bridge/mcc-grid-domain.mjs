// Esquema da leitura estrutural MCC. A extensão só valida e transporta células;
// parsing de negócio, manifesto e persistência continuam no Preparador.
export const D0_FIELDS = [
  'date', 'campaign', 'account', 'target_geo', 'campaign_state', 'status', 'currency',
  'impressions', 'clicks', 'conversions', 'conversion_value', 'avg_cost', 'abs_top_share',
  'top_share', 'budget', 'bid_strategy', 'target_cpa', 'cost'
];

export const REQUIRED_D0_FIELDS = [
  'campaign', 'account', 'status', 'currency', 'impressions', 'clicks', 'conversions',
  'avg_cost', 'abs_top_share', 'top_share', 'budget', 'bid_strategy', 'cost'
];

export const HEADER_ALIASES = {
  date: ['data', 'dia', 'day', 'date'],
  campaign: ['campanha', 'nome da campanha', 'campaign', 'campaign name'],
  account: ['conta', 'nome da conta', 'account', 'account name', 'cliente', 'nome do cliente'],
  target_geo: ['target geo', 'targeting geo', 'geo codes', 'codigos geo'],
  campaign_state: ['status da campanha', 'estado da campanha', 'campaign status', 'campaign state'],
  status: ['status', 'estado', 'status de qualificacao', 'qualification status'],
  currency: ['moeda', 'currency', 'codigo da moeda', 'currency code'],
  impressions: ['impressoes', 'impr', 'impressions', 'impr impressions'],
  clicks: ['cliques', 'clicks'],
  conversions: ['conversoes', 'conversions', 'todas as conversoes', 'all conv', 'all conversions'],
  conversion_value: ['valor conv', 'valor da conversao', 'conversion value', 'conv value'],
  avg_cost: ['custo medio', 'avg cost', 'average cost', 'custo med'],
  abs_top_share: ['porcentagem de impressao na primeira posicao', 'porcentagem de impressoes na primeira posicao', 'parcela de impr na 1a posicao na rede de pesquisa', 'search abs top is', 'search absolute top impression share', 'parc impr 1a posicao pesq', '% de impr 1a posicao'],
  top_share: ['porcentagem de impressao na parte superior', 'porcentagem de impressoes na parte superior', 'parcela de impr na parte superior da rede de pesquisa', 'search top is', 'search top impression share', 'parc impr parte sup pesq', '% de impr parte sup'],
  budget: ['orcamento', 'orcamento diario', 'budget', 'daily budget', 'budget amount'],
  bid_strategy: ['estrategia de lance', 'estrategia de lances', 'tipo de estrategia de lances', 'bid strategy', 'bid strategy type', 'bidding strategy type'],
  target_cpa: ['cpa desejado', 'target cpa', 'cpa alvo', 'meta de cpa'],
  cost: ['custo', 'cost', 'custo total', 'total cost']
};

export const NUMERIC_FIELDS = new Set([
  'impressions', 'clicks', 'conversions', 'conversion_value', 'avg_cost', 'abs_top_share',
  'top_share', 'budget', 'target_cpa', 'cost'
]);

export const normalizeHeader = value => String(value ?? '').replace(/1\s*ª/g, '1a')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[%]/g, ' ').replace(/1a/g, '1a').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

const ALIAS_LOOKUP = new Map(Object.entries(HEADER_ALIASES)
  .flatMap(([field, aliases]) => aliases.map(alias => [normalizeHeader(alias), field])));

export function mapHeaders(headers) {
  const mapping = {};
  const unknown = [];
  const duplicates = {};
  headers.forEach((header, index) => {
    const field = ALIAS_LOOKUP.get(normalizeHeader(header));
    if (!field) { unknown.push({ index, header: String(header ?? '') }); return; }
    if (mapping[field] == null) mapping[field] = index;
    else (duplicates[field] ||= [mapping[field]]).push(index);
  });
  return { mapping, unknown, duplicates };
}

const REQUIRED_GRID_FIELDS = [
  'campaign', 'account', 'status', 'impressions', 'clicks', 'conversions',
  'avg_cost', 'abs_top_share', 'top_share', 'budget', 'bid_strategy', 'cost'
];

export function currencyFromVisibleText(...values) {
  const text = values.filter(value => value != null).map(String).join(' ').toUpperCase();
  if (/\bUSD\b|US\$|U\$/.test(text)) return 'USD';
  if (/\bBRL\b|R\$/.test(text)) return 'BRL';
  if (/\bEUR\b|€/.test(text)) return 'EUR';
  if (/\bGBP\b|£/.test(text)) return 'GBP';
  if (/\bCAD\b|CA\$|C\$/.test(text)) return 'CAD';
  if (/\bAUD\b|A\$/.test(text)) return 'AUD';
  if (/\bMXN\b|MX\$/.test(text)) return 'MXN';
  return null;
}

export function validateMccD0Capture(snapshot) {
  const errors = [];
  if (!snapshot?.ok) return { ok: false, errors: [{ code: 'grid', message: snapshot?.error || 'Grade MCC não encontrada.' }] };
  const page = snapshot.pagination;
  const total = Number(page?.total);
  const duplicateCampaigns = snapshot.duplicateCampaigns || [];
  // Duplicidade já tem um bloqueio próprio; não a descreva como falta de linhas.
  if (!page || !Number.isFinite(total) || page.first !== 1 || page.last !== total || snapshot.rowsCaptured !== total || (!duplicateCampaigns.length && snapshot.uniqueCampaignCount !== total) || snapshot.virtualized || snapshot.truncatedByCap) {
    errors.push({ code: 'incomplete', message: `Captura incompleta ou não verificável: ${snapshot.rowsCaptured ?? 0} campanhas capturadas de ${Number.isFinite(total) ? total : 'total não confirmado'}. Na MCC, role a grade até o final para carregar todas as campanhas e tente novamente; é necessário usar a primeira e única página completa.` });
  }
  if (!snapshot.records?.length) errors.push({ code: 'empty', message: 'Nenhuma campanha foi capturada da grade MCC.' });
  if (duplicateCampaigns.length) errors.push({ code: 'duplicates', campaigns: [...duplicateCampaigns], message: `Captura bloqueada por campanha duplicada: ${duplicateCampaigns.join(', ')}. O mesmo nome aparece em mais de uma linha da MCC.` });
  for (const field of REQUIRED_GRID_FIELDS) {
    const info = snapshot.fields?.[field];
    if (!info?.found || info.hidden || info.ambiguous) {
      errors.push({ code: 'required_header', field, message: `Cabeçalho obrigatório ausente, oculto ou ambíguo: ${field}.` });
    }
  }
  if (!snapshot.reportDate?.value || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.reportDate.value)) {
    errors.push({ code: 'date', message: snapshot.reportDate?.reason || 'Não foi possível ler uma única data explícita do período da MCC. Selecione um dia D0 específico; a data não será inferida.' });
  }
  const records = (snapshot.records || []).map(record => ({
    ...record,
    currency: record.currency || currencyFromVisibleText(record.cost, record.avg_cost, record.budget)
  }));
  const campaignStateHeader = snapshot.fields?.campaign_state;
  if (campaignStateHeader?.found || campaignStateHeader?.hidden || campaignStateHeader?.ambiguous) {
    const missingStates = records.filter(record => !String(record.campaign_state || '').trim());
    if (campaignStateHeader.hidden || campaignStateHeader.ambiguous || missingStates.length) {
      errors.push({ code:'campaign_state', field:'campaign_state', message:'A coluna Status da campanha está presente, mas seus ícones não puderam ser lidos sem ambiguidade em todas as linhas. Confira a coluna de estado e tente novamente.' });
    }
  }
  const currencyMissing = records.filter(record => !record.currency).map(record => record.campaign);
  if (currencyMissing.length) errors.push({ code: 'currency', message: `Moeda não identificável por código/símbolo explícito em ${currencyMissing.length} campanha(s): ${currencyMissing.slice(0, 5).join(', ')}. Símbolo $ sem código é ambíguo.` });
  const accountMissing = records.filter(record => !String(record.account || '').trim()).map(record => record.campaign);
  if (accountMissing.length) errors.push({ code: 'account', message: `Conta ausente em ${accountMissing.length} campanha(s): ${accountMissing.slice(0, 5).join(', ')}.` });
  const accountIdsMissing = records.filter(record => !/^\d{3}-\d{3}-\d{4}$/.test(String(record.account_id || ''))).map(record => record.campaign);
  if (accountIdsMissing.length) errors.push({ code: 'account_id', message: `Número completo da conta ausente ou ambíguo em ${accountIdsMissing.length} campanha(s): ${accountIdsMissing.slice(0, 5).join(', ')}. Confira se o número aparece abaixo do nome da conta na grade MCC.` });
  return errors.length ? { ok: false, errors } : {
    ok: true,
    capture: {
      schema: 'mcc-d0-grid-v2',
      source: 'mcc_chrome_extension',
      reportDate: snapshot.reportDate.value,
      locale: snapshot.locale || 'en-US',
      pagination: snapshot.pagination,
      campaignCount: records.length,
      headers: snapshot.headers,
      fields: snapshot.fields,
      records
    }
  };
}

export const MCC_OPERATIONAL_TIME_ZONE = 'America/Sao_Paulo';

export function expectedMccD1Date(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MCC_OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
  return new Date(today - 86400000).toISOString().slice(0, 10);
}

export function validateMccD1Capture(snapshot, { now = new Date() } = {}) {
  const validation = validateMccD0Capture(snapshot);
  if (!validation.ok) {
    const errors = validation.errors.map(error => error.code === 'date'
      ? { ...error, message: snapshot?.reportDate?.reason || 'D−1 exige uma única data explícita no controle de período; intervalos ou texto relativo não são aceitos.' }
      : error);
    return { ok: false, errors };
  }

  const expectedDate = expectedMccD1Date(now);
  const actualDate = validation.capture.reportDate;
  if (actualDate !== expectedDate) {
    return {
      ok: false,
      errors: [{
        code: 'date_expected',
        message: `A MCC está em ${actualDate}, mas D−1 esperado para hoje é ${expectedDate} (${MCC_OPERATIONAL_TIME_ZONE}). Selecione o dia correto; nenhum dado foi enviado.`
      }]
    };
  }

  return {
    ok: true,
    capture: {
      ...validation.capture,
      schema: 'mcc-d1-grid-v2',
      periodRole: 'd1'
    }
  };
}

const ABSENT = new Set(['', '--', '—', '-', 'n/a', 'na', 'n.a.', 'não disponível', 'nao disponivel']);

export function comparableValue(field, raw) {
  if (raw == null || ABSENT.has(String(raw).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
    return { state: 'absent', value: null };
  }
  const text = String(raw).trim().replace(/\u00a0/g, ' ');
  if (!NUMERIC_FIELDS.has(field)) return { state: 'value', value: text.replace(/\s+/g, ' ') };
  let numberText = text.replace(/\s/g, '').replace(/R\$|US\$|USD|BRL|EUR|GBP|CAD|AUD|MXN/gi, '').replace('%', '');
  if (numberText.startsWith('(') && numberText.endsWith(')')) numberText = `-${numberText.slice(1, -1)}`;
  if (numberText.includes(',') && numberText.includes('.')) {
    numberText = numberText.lastIndexOf(',') > numberText.lastIndexOf('.')
      ? numberText.replace(/\./g, '').replace(',', '.') : numberText.replace(/,/g, '');
  } else if (numberText.includes(',')) {
    const parts = numberText.split(',');
    numberText = parts.length === 2 && parts[1].length <= 6 ? parts.join('.') : parts.join('');
  } else if ((numberText.match(/\./g) || []).length > 1) numberText = numberText.replace(/\./g, '');
  const number = Number(numberText);
  return Number.isFinite(number) ? { state: number === 0 ? 'zero' : 'value', value: Math.round(number * 1e8) / 1e8 }
    : { state: 'invalid', value: text };
}

export function decodeCsvBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  try { return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding }; }
  catch { return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' }; }
}

export function parseDelimited(text) {
  const candidates = [',', ';', '\t'];
  const scores = candidates.map(delimiter => {
    let count = 0, quoted = false;
    for (const char of text.slice(0, 3000)) {
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === delimiter) count++;
    }
    return { delimiter, count };
  }).sort((a, b) => b.count - a.count);
  const delimiter = scores[0].count ? scores[0].delimiter : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return { delimiter, rows };
}

function uniqueCampaignRecords(records) {
  const grouped = new Map();
  for (const record of records) {
    if (!record.campaign || /^total\b/i.test(record.campaign.trim())) continue;
    const list = grouped.get(record.campaign) || [];
    list.push(record); grouped.set(record.campaign, list);
  }
  return grouped;
}

export function parseCsvForComparison(text) {
  const { delimiter, rows } = parseDelimited(text);
  const candidates = rows.slice(0, 40).map((row, index) => ({ row, index, ...mapHeaders(row) }))
    .filter(item => item.mapping.campaign != null)
    .sort((a, b) => Object.keys(b.mapping).length - Object.keys(a.mapping).length);
  const header = candidates[0];
  if (!header || Object.keys(header.mapping).length < 2) throw new Error('Não encontrei um cabeçalho CSV reconhecível com coluna de campanha.');
  const records = rows.slice(header.index + 1).map(row => {
    const record = {};
    for (const field of D0_FIELDS) {
      const index = header.mapping[field];
      if (index != null) record[field] = String(row[index] ?? '').trim();
    }
    record.campaign = record.campaign || '';
    return record;
  }).filter(record => record.campaign && !/^total\b/i.test(record.campaign.trim()));
  return {
    delimiter, headers: header.row.map(value => String(value ?? '').trim()), headerRow: header.index + 1,
    mapping: header.mapping, unknownHeaders: header.unknown, duplicateHeaders: header.duplicates,
    records, byCampaign: uniqueCampaignRecords(records)
  };
}

export function compareMccSnapshotToCsv(snapshot, csvText) {
  const csv = parseCsvForComparison(csvText);
  const screen = snapshot.records || [];
  const screenByCampaign = uniqueCampaignRecords(screen);
  const duplicateScreen = [...screenByCampaign].filter(([, records]) => records.length > 1).map(([name]) => name);
  const duplicateCsv = [...csv.byCampaign].filter(([, records]) => records.length > 1).map(([name]) => name);
  const screenNames = new Set(screenByCampaign.keys());
  const csvNames = new Set(csv.byCampaign.keys());
  const onlyScreen = [...screenNames].filter(name => !csvNames.has(name)).sort();
  const onlyCsv = [...csvNames].filter(name => !screenNames.has(name)).sort();
  const commonNames = [...screenNames].filter(name => csvNames.has(name));
  const comparableFields = D0_FIELDS.filter(field =>
    field !== 'date' && snapshot.fields?.[field]?.found && csv.mapping[field] != null &&
    !snapshot.fields[field].ambiguous && !csv.duplicateHeaders[field]);
  const divergences = [];
  let absentZeroDifferences = 0;
  for (const name of commonNames) {
    const left = screenByCampaign.get(name)[0], right = csv.byCampaign.get(name)[0];
    for (const field of comparableFields) {
      const a = comparableValue(field, left[field]), b = comparableValue(field, right[field]);
      if (a.state === 'absent' && b.state === 'zero' || b.state === 'absent' && a.state === 'zero') absentZeroDifferences++;
      if (a.state !== b.state || a.value !== b.value) {
        divergences.push({ campaign: name, field, screen: a, csv: b });
      }
    }
  }
  return {
    screenCampaigns: screen.length, csvCampaigns: csv.records.length,
    screenUniqueCampaigns: screenNames.size, csvUniqueCampaigns: csvNames.size,
    onlyScreen, onlyCsv, duplicateScreen, duplicateCsv, comparableFields,
    screenMissingFields: D0_FIELDS.filter(field => !snapshot.fields?.[field]?.found),
    csvMissingFields: D0_FIELDS.filter(field => csv.mapping[field] == null),
    dateComparison: snapshot.fields?.date?.found && csv.mapping.date != null ? 'comparavel_por_campanha' : 'nao_comparavel_por_campanha',
    absentZeroDifferences,
    divergenceCount: divergences.length,
    divergences: divergences.slice(0, 200),
    csv: { delimiter: csv.delimiter, headerRow: csv.headerRow, headers: csv.headers, unknownHeaders: csv.unknownHeaders, duplicateHeaders: csv.duplicateHeaders }
  };
}
