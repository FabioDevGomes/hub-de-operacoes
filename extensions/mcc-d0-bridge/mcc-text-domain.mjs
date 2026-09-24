import { D0_FIELDS, HEADER_ALIASES, comparableValue, normalizeHeader, parseCsvForComparison } from './mcc-grid-domain.mjs';

const CAMPAIGN_LINE = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+-\s+\S.+$/;
const ACCOUNT_LABEL = /^\d{3,4}\s+-\s+.+$/;
const ACCOUNT_ID = /^\d{3}-\d{3}-\d{4}$/;
const BUDGET_LINE = /^(.+?)\s*\/\s*(?:dia|day)$/i;
const QUALIFICATION_LINE = /^(?:(?:não|nao)\s+)?qualificad[oa](?:\s*\([^\r\n]*\))?$|^(?:qualified|not eligible|eligible)(?:\s*\([^\r\n]*\))?$/i;
const STRATEGY_LINE = /^(?:cpa desejado|maximizar conversões|maximizar conversoes|maximize conversions|target cpa)$/i;
const SUMMARY_LINE = /^(?:total\s*:|mostrar linhas\s*:|show rows\s*:)/i;
const DIRECTIONAL_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const POSITIONAL_METRIC_FIELDS = ['target_cpa', 'impressions', 'clicks', 'avg_cost', 'abs_top_share', 'top_share', 'conversions', 'cost', 'conversion_value'];

const FIELD_DESCRIPTIONS = {
  date: ['C', 'A data da campanha no título não é a data do relatório D0.'],
  campaign: ['A', 'Nome completo aparece em linha própria antes dos dados da campanha.'],
  account: ['B', 'Nome e ID da conta são recuperados pelo par de linhas identificável; a coluna do CSV ainda precisa ser comparada.'],
  target_geo: ['C', 'Não há campo GEO próprio; não é inferido do nome da campanha.'],
  campaign_state: ['C', 'A visualização informa campanhas ativadas, mas não traz o estado individual em cada bloco.'],
  status: ['B', 'Qualificação aparece como texto no bloco; variantes de gênero são reconhecidas.'],
  currency: ['B', 'Pode ser reconhecida por símbolo explícito no orçamento; símbolo genérico $ permanece ambíguo.'],
  impressions: ['D', 'O cabeçalho pode estar visível, mas os valores do bloco ainda não foram vinculados à coluna com segurança.'],
  clicks: ['D', 'O cabeçalho pode estar visível, mas os valores do bloco ainda não foram vinculados à coluna com segurança.'],
  conversions: ['D', 'O cabeçalho pode estar visível, mas os valores do bloco ainda não foram vinculados à coluna com segurança.'],
  conversion_value: ['D', 'Há valores monetários, mas ainda não é seguro distingui-los por coluna no bloco de texto.'],
  avg_cost: ['D', 'Há valores monetários, mas ainda não é seguro distingui-los por coluna no bloco de texto.'],
  abs_top_share: ['D', 'Há percentuais, mas ainda não é seguro vinculá-los à coluna no bloco de texto.'],
  top_share: ['D', 'Há percentuais, mas ainda não é seguro vinculá-los à coluna no bloco de texto.'],
  budget: ['B', 'Orçamento é identificável pelo formato monetário terminado em “/dia”.'],
  bid_strategy: ['B', 'Estratégia aparece como texto próprio no bloco, sem cabeçalho de coluna.'],
  target_cpa: ['D', 'O cabeçalho pode estar visível, mas o valor ainda não foi vinculado à coluna com segurança.'],
  cost: ['D', 'Há valores monetários, mas ainda não é seguro distingui-los por coluna no bloco de texto.']
};

function cleanLine(value) {
  return String(value ?? '').replace(DIRECTIONAL_MARKS, '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function pageInteger(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

function currencyCode(value) {
  const text = cleanLine(value).toUpperCase();
  if (/\bUS\$/.test(text)) return 'USD';
  if (/\bR\$/.test(text)) return 'BRL';
  if (/\bC\$/.test(text)) return 'CAD';
  if (/\bA\$/.test(text)) return 'AUD';
  if (/€/.test(text)) return 'EUR';
  if (/£/.test(text)) return 'GBP';
  if (/\$/.test(text)) return null;
  return null;
}

function findPagination(text) {
  const matches = [...text.matchAll(/\b([\d.,]+)\s*[-–]\s*([\d.,]+)\s+(?:de|of)\s+([\d.,]+)\b/gi)];
  const match = matches.at(-1);
  if (!match) return null;
  return {
    first: pageInteger(match[1]), last: pageInteger(match[2]), total: pageInteger(match[3]),
    text: cleanLine(match[0])
  };
}

function accountIn(lines) {
  for (let index = 0; index < lines.length - 1; index++) {
    if (ACCOUNT_LABEL.test(lines[index]) && ACCOUNT_ID.test(lines[index + 1])) {
      return { label: lines[index], id: lines[index + 1] };
    }
  }
  return null;
}

function extractCampaign(lines) {
  const campaign = lines[0];
  const budgetLine = lines.find(line => BUDGET_LINE.test(line)) || '';
  const budgetParts = budgetLine.match(BUDGET_LINE);
  const budgetRaw = budgetParts ? cleanLine(budgetParts[1]) : null;
  const qualification = lines.find(line => QUALIFICATION_LINE.test(line)) || null;
  const strategy = lines.find(line => STRATEGY_LINE.test(line)) || null;
  const account = accountIn(lines);

  const recognized = new Set([campaign, budgetLine, qualification, strategy, ...(account ? [account.label, account.id] : [])].filter(Boolean));
  const candidateTokens = [];
  const unmappedValues = { numeric: 0, zeroNumeric: 0, money: 0, zeroMoney: 0, percent: 0, zeroPercent: 0, dash: 0 };
  for (const line of lines) {
    if (recognized.has(line) || SUMMARY_LINE.test(line) || /^(?:seu site não tem|estratégia de lances com aprendizado)/i.test(line) || /^limitada pela meta$/i.test(line)) continue;
    if (/^[—–-]+$/.test(line)) { unmappedValues.dash++; candidateTokens.push({ kind: 'dash', value: line }); }
    else if (/\d\s*%$/.test(line)) {
      unmappedValues.percent++;
      candidateTokens.push({ kind: 'percent', value: line });
      if (/^[-+]?0+(?:[.,]0+)?\s*%$/.test(line)) unmappedValues.zeroPercent++;
    }
    else if (/^(?:(?:R|US|U|C|A)\$|[$€£])\s*[-\d.,]+/i.test(line)) {
      unmappedValues.money++;
      candidateTokens.push({ kind: 'money', value: line });
      if (/^(?:(?:R|US|U|C|A)\$|[$€£])\s*[-+]?0+(?:[.,]0+)?$/i.test(line)) unmappedValues.zeroMoney++;
    }
    else if (/^[+-]?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?)$/.test(line)) {
      unmappedValues.numeric++;
      candidateTokens.push({ kind: 'number', value: line });
      if (/^[-+]?0+(?:[.,]0+)?$/.test(line)) unmappedValues.zeroNumeric++;
    }
  }

  const record = { campaign, textCandidateTokens: candidateTokens };
  if (budgetRaw != null && comparableValue('budget', budgetRaw).state !== 'invalid') record.budget = budgetRaw;
  if (qualification) record.status = qualification;
  if (strategy) record.bid_strategy = strategy;
  if (account) {
    record.account_id = account.id;
    record.account_label = account.label;
  }
  const currency = currencyCode(budgetRaw || '');
  if (currency) record.currency = currency;
  return { record, unmappedValues, hasExplicitGenericCurrency: Boolean(budgetRaw && /\$/.test(budgetRaw) && !currency) };
}

function fieldMatrix(records, aggregateUnmapped, genericCurrencyCount) {
  const result = {};
  for (const field of D0_FIELDS) {
    const [classification, reason] = FIELD_DESCRIPTIONS[field];
    let detected = records.filter(record => Object.hasOwn(record, field)).length;
    if (field === 'account') detected = records.filter(record => record.account_id || record.account_label).length;
    if (field === 'currency' && genericCurrencyCount) {
      result[field] = {
        classification: 'D', label: 'Ambíguo', detected,
        reason: `${genericCurrencyCount} orçamento(s) usam apenas “$”; a moeda não é inferida.`
      };
      continue;
    }
    const adjustedClass = ['impressions','clicks','conversions','conversion_value','avg_cost','abs_top_share','top_share','target_cpa','cost'].includes(field)
      && !Object.values(aggregateUnmapped).some(Boolean) ? 'C' : classification;
    result[field] = {
      classification: adjustedClass,
      label: { A: 'Explícito', B: 'Recuperável por contexto', C: 'Ausente', D: 'Ambíguo' }[adjustedClass],
      detected,
      reason: adjustedClass === 'C' && classification === 'D' ? 'Não há valor correspondente identificável nos blocos.' : reason
    };
  }
  return result;
}

export function parseMccSelectableText(input) {
  const text = String(input ?? '');
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(cleanLine);
  const anchorIndices = [];
  for (let index = 0; index < lines.length; index++) if (CAMPAIGN_LINE.test(lines[index])) anchorIndices.push(index);

  const declaredMatch = text.match(/\bCampanhas\s*\(\s*([\d.,]+)\s*\)/i);
  const declaredCampaigns = declaredMatch ? pageInteger(declaredMatch[1]) : null;
  const pagination = findPagination(text);
  const records = [];
  const unmappedValues = { numeric: 0, zeroNumeric: 0, money: 0, zeroMoney: 0, percent: 0, zeroPercent: 0, dash: 0 };
  let genericCurrencyCount = 0;
  const headersBeforeRows = anchorIndices.length ? lines.slice(0, anchorIndices[0]) : lines;
  const aliases = new Map(Object.entries(HEADER_ALIASES).flatMap(([field, values]) => values.map(value => [normalizeHeader(value), field])));
  const recognizedHeaders = [...new Set(headersBeforeRows.map(line => aliases.get(normalizeHeader(line))).filter(Boolean))];

  for (let position = 0; position < anchorIndices.length; position++) {
    const start = anchorIndices[position];
    let end = position + 1 < anchorIndices.length ? anchorIndices[position + 1] : lines.length;
    for (let index = start + 1; index < end; index++) {
      if (SUMMARY_LINE.test(lines[index]) || /^\d+\s*[-–]\s*\d+\s+(?:de|of)\s+\d+/i.test(lines[index])) { end = index; break; }
    }
    const block = lines.slice(start, end).filter(Boolean);
    if (!block.length) continue;
    const parsed = extractCampaign(block);
    records.push(parsed.record);
    genericCurrencyCount += parsed.hasExplicitGenericCurrency ? 1 : 0;
    for (const key of Object.keys(unmappedValues)) unmappedValues[key] += parsed.unmappedValues[key];
  }

  const pageMatchesDeclaration = Boolean(pagination && declaredCampaigns != null && pagination.total === declaredCampaigns);
  const pageFullyVisible = Boolean(pagination && pagination.first === 1 && pagination.last === pagination.total);
  const complete = Boolean(records.length && pagination && pageMatchesDeclaration && pageFullyVisible
    && records.length === declaredCampaigns && records.length === pagination.total);
  const duplicateCampaigns = records.map(record => record.campaign).filter((name, index, all) => all.indexOf(name) !== index);
  const campaignFields = records.reduce((count, record) => count + (record.campaign ? 1 : 0), 0);

  return {
    ok: true,
    source: 'document.body.innerText',
    textLength: text.length,
    records,
    campaignCount: records.length,
    uniqueCampaignCount: new Set(records.map(record => record.campaign)).size,
    declaredCampaigns,
    pagination,
    complete,
    pageFullyVisible,
    pageMatchesDeclaration,
    completeness: complete ? 'complete' : pagination && pagination.last < pagination.total ? 'partial' : pagination ? 'inconsistent' : 'unverified',
    duplicateCampaigns,
    sampleCampaigns: records.slice(0, 5).map(record => record.campaign),
    recognizedHeaders,
    recognizedHeaderCount: recognizedHeaders.length,
    fieldMatrix: fieldMatrix(records, unmappedValues, genericCurrencyCount),
    fieldCoverage: {
      campaign: campaignFields,
      account: records.filter(record => record.account_id || record.account_label).length,
      budget: records.filter(record => Object.hasOwn(record, 'budget')).length,
      status: records.filter(record => Object.hasOwn(record, 'status')).length,
      currency: records.filter(record => Object.hasOwn(record, 'currency')).length,
      bid_strategy: records.filter(record => Object.hasOwn(record, 'bid_strategy')).length
    },
    unmappedValues,
    limitations: [
    'A leitura usa innerText; não usa clipboard, não seleciona a página, não envia e não armazena o texto bruto.',
      'Cabeçalhos podem ser reconhecidos no topo, mas só são ligados a valores quando a sequência de valores da linha é validada sem ambiguidade.',
      'A completude só é confirmada quando contagem detectada, total declarado, faixa paginada e quantidade de campanhas coincidem.'
    ]
  };
}

function normalizeText(value) {
  return cleanLine(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function canonicalTextValue(field, value) {
  const normalized = normalizeText(value);
  if (field === 'status') {
    return normalized
      .replace(/\bqualificada\b/g, 'qualificado')
      .replace(/\blimitada\b/g, 'limitado');
  }
  if (field === 'bid_strategy') {
    return normalized.replace(/\bmaximizar\s+as?\s+conversoes\b/g, 'maximizar conversoes');
  }
  return normalized;
}

function isPlaceholderCampaign(value) {
  return ['-', '--', '–', '—'].includes(cleanLine(value));
}

function comparisonValue(field, raw) {
  if (field === 'budget') return comparableValue(field, String(raw ?? '').replace(/\s*\/\s*(?:dia|day)$/i, ''));
  if (field === 'currency') {
    const value = currencyCode(raw) || String(raw ?? '').trim().toUpperCase();
    return { state: value ? 'value' : 'absent', value: value || null };
  }
  return comparableValue(field, canonicalTextValue(field, raw));
}

function positionalMetricDiagnostics(snapshot, csv, csvByCampaign, unambiguousNames, screenByCampaign) {
  const metricHeaders = (snapshot.recognizedHeaders || []).filter(field =>
    POSITIONAL_METRIC_FIELDS.includes(field) && csv.mapping[field] != null);
  if (!metricHeaders.length) return [];

  return metricHeaders.map(field => {
    const headerPosition = metricHeaders.indexOf(field);
    const rows = unambiguousNames.map(name => ({
      screen: screenByCampaign.get(name)[0],
      csv: csvByCampaign.get(name)[0]
    })).filter(pair => {
      const value = comparableValue(field, pair.csv[field]);
      return value.state !== 'absent' && value.state !== 'invalid';
    });
    const maxTokens = rows.reduce((max, pair) => Math.max(max, pair.screen.textCandidateTokens?.length || 0), 0);
    const scores = Array.from({ length: maxTokens }, (_, position) => {
      let matches = 0, covered = 0;
      for (const pair of rows) {
        const token = pair.screen.textCandidateTokens?.[position];
        if (!token) continue;
        covered++;
        const left = comparableValue(field, token.value);
        const right = comparableValue(field, pair.csv[field]);
        if (left.state === right.state && left.value === right.value) matches++;
      }
      return { position, matches, covered };
    });
    const expected = scores[headerPosition] || { position: headerPosition, matches: 0, covered: 0 };
    const bestMatches = Math.max(0, ...scores.map(score => score.matches));
    const best = scores.filter(score => score.matches === bestMatches && score.covered > 0);
    const fullMatches = scores.filter(score => rows.length > 0 && score.matches === rows.length && score.covered === rows.length);
    const minimumValidationRows = Math.min(snapshot.campaignCount || unambiguousNames.length, Math.max(5, Math.ceil((snapshot.campaignCount || unambiguousNames.length) * 0.75)));
    let status = 'sem correspondência segura';
    if (!rows.length) status = 'CSV sem valores comparáveis';
    else if (fullMatches.length > 1) status = 'ambíguo: mais de uma posição coincide';
    else if (fullMatches.length === 1 && rows.length < minimumValidationRows) status = 'amostra insuficiente para confirmar';
    else if (fullMatches.length === 1 && fullMatches[0].position === headerPosition) status = 'ordem do cabeçalho coincide neste CSV';
    else if (fullMatches.length === 1) status = 'posição alternativa coincide; ordem não confirmada';
    else if (bestMatches > 0) status = 'correspondência parcial';
    return {
      field,
      headerPosition: headerPosition + 1,
      expectedMatches: expected.matches,
      expectedCoverage: expected.covered,
      csvValues: rows.length,
      bestPosition: best.length === 1 ? best[0].position + 1 : null,
      bestMatches,
      bestCoverage: best.length === 1 ? best[0].covered : null,
      minimumValidationRows,
      status
    };
  });
}

export function compareMccTextToCsv(snapshot, csvText) {
  const csv = parseCsvForComparison(csvText);
  // O comparador textual ignora tokens-placeholder do CSV sem mudar o parser
  // compartilhado pelo experimento da grade ou pelo fluxo de produção.
  const csvRecords = csv.records.filter(record => !isPlaceholderCampaign(record.campaign));
  const screenRecords = snapshot.records || [];
  const byName = records => {
    const map = new Map();
    for (const record of records) {
      if (!record.campaign) continue;
      const group = map.get(record.campaign) || [];
      group.push(record); map.set(record.campaign, group);
    }
    return map;
  };
  const screenByCampaign = byName(screenRecords), csvByCampaign = byName(csvRecords);
  const screenNames = new Set(screenByCampaign.keys()), csvNames = new Set(csvByCampaign.keys());
  const commonNames = [...screenNames].filter(name => csvNames.has(name));
  // Nomes repetidos podem existir em contas diferentes; sem chave estável da
  // linha, não escolhemos arbitrariamente um registro para comparar métricas.
  const unambiguousCommonNames = commonNames.filter(name =>
    screenByCampaign.get(name).length === 1 && csvByCampaign.get(name).length === 1);
  const positionalMetricAlignment = positionalMetricDiagnostics(
    snapshot, csv, csvByCampaign, unambiguousCommonNames, screenByCampaign
  );
  const candidates = ['budget', 'status', 'currency', 'bid_strategy'];
  const comparableFields = ['campaign', ...candidates.filter(field =>
    csv.mapping[field] != null && snapshot.fieldCoverage?.[field] === screenRecords.length && screenRecords.length > 0)];
  const compareAccount = csv.mapping.account != null && snapshot.fieldCoverage?.account === screenRecords.length && screenRecords.length > 0;
  if (compareAccount) comparableFields.push('account');
  const divergences = [];
  const divergenceByField = {};
  const normalizedEquivalentByField = {};
  let normalizedEquivalentCount = 0;
  let valuesCompared = 0, accountUnresolved = 0;

  for (const name of unambiguousCommonNames) {
    const screen = screenByCampaign.get(name)[0], fromCsv = csvByCampaign.get(name)?.[0];
    if (!fromCsv) continue;
    for (const field of comparableFields.filter(item => item !== 'campaign' && item !== 'account')) {
      const left = comparisonValue(field, screen[field]);
      const right = comparisonValue(field, fromCsv[field]);
      if (left.state === 'absent' || right.state === 'absent') continue;
      valuesCompared++;
      if (left.state !== right.state || left.value !== right.value) {
        divergenceByField[field] = (divergenceByField[field] || 0) + 1;
        divergences.push({ campaign: name, field, screen: left, csv: right });
      } else if (['status', 'bid_strategy'].includes(field) && normalizeText(screen[field]) !== normalizeText(fromCsv[field])) {
        normalizedEquivalentCount++;
        normalizedEquivalentByField[field] = (normalizedEquivalentByField[field] || 0) + 1;
      }
    }
    if (compareAccount) {
      const csvAccount = normalizeText(fromCsv.account);
      const candidatesForAccount = [screen.account_id, screen.account_label].map(normalizeText).filter(Boolean);
      if (candidatesForAccount.includes(csvAccount)) valuesCompared++;
      else accountUnresolved++;
    }
  }

  const duplicateScreen = [...screenByCampaign].filter(([, items]) => items.length > 1).map(([name]) => name);
  const duplicateCsv = [...csvByCampaign].filter(([, items]) => items.length > 1).map(([name]) => name);
  return {
    textCampaigns: screenRecords.length,
    csvRows: csv.records.length,
    csvPlaceholderCount: csv.records.length - csvRecords.length,
    csvCampaigns: csvRecords.length,
    textUniqueCampaigns: screenNames.size,
    csvUniqueCampaigns: csvNames.size,
    onlyText: [...screenNames].filter(name => !csvNames.has(name)).sort(),
    onlyCsv: [...csvNames].filter(name => !screenNames.has(name)).sort(),
    duplicateScreen, duplicateCsv, comparableFields,
    textMissingFields: D0_FIELDS.filter(field => !comparableFields.includes(field)),
    csvMissingFields: D0_FIELDS.filter(field => csv.mapping[field] == null),
    accountUnresolved,
    valuesCompared,
    divergenceCount: divergences.length,
    divergenceByField,
    normalizedEquivalentCount,
    normalizedEquivalentByField,
    positionalMetricAlignment,
    divergences: divergences.slice(0, 200),
    textCompleteness: snapshot.completeness,
    csv: { delimiter: csv.delimiter, headerRow: csv.headerRow, headers: csv.headers, unknownHeaders: csv.unknownHeaders, duplicateHeaders: csv.duplicateHeaders }
  };
}
