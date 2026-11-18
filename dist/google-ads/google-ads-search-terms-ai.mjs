export const GOOGLE_ADS_SEARCH_TERMS_AI_CONTRACT = 'hub.google_ads.search_terms_ai';
export const GOOGLE_ADS_SEARCH_TERMS_AI_VERSION = 1;
export const GOOGLE_ADS_SEARCH_TERMS_AI_STORAGE_PREFIX = 'hub:google-ads-search-terms:ai:v1:';

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeTerm(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('pt-BR');
}

function hashPair(value) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of String(value)) {
    const code = character.codePointAt(0);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

function termKey(group = {}) {
  return JSON.stringify([
    digits(group.managerCustomerId), digits(group.customerId), String(group.campaignId || ''),
    String(group.searchTermMatchType || 'UNKNOWN').toUpperCase(), normalizeTerm(group.searchTerm),
  ]);
}

export function googleAdsSearchTermId(group) {
  return `st1_${hashPair(termKey(group))}`;
}

export function googleAdsSearchTermsDatasetId({ reports = [], recommendations = [], dateFrom = '', dateTo = '' } = {}) {
  const reportParts = (Array.isArray(reports) ? reports : []).map(report => [
    digits(report.managerCustomerId), digits(report.customerId), String(report.queryCompletedAtUtc || ''),
    Number(report.rowCount) || 0, String(report.currencyCode || '').toUpperCase(),
  ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const terms = (Array.isArray(recommendations) ? recommendations : []).map(group => [
    googleAdsSearchTermId(group), Number(group.impressions) || 0, Number(group.clicks) || 0,
    Number(group.costMicros) || 0, Number(group.conversions) || 0,
    group.purchaseMetricsAvailable === true ? Number(group.purchaseConversions) || 0 : null,
    group.purchaseMetricsAvailable === true ? Number(group.purchaseValue) || 0 : null,
  ]).sort((left, right) => left[0].localeCompare(right[0]));
  return `std1_${hashPair(JSON.stringify([dateFrom, dateTo, reportParts, terms]))}`;
}

function safeText(value, maxLength = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function buildGoogleAdsSearchTermsAiContract({ reports = [], recommendations = [], dateFrom = '', dateTo = '' } = {}) {
  const safeRecommendations = Array.isArray(recommendations) ? recommendations : [];
  const datasetId = googleAdsSearchTermsDatasetId({ reports, recommendations: safeRecommendations, dateFrom, dateTo });
  return {
    contract: GOOGLE_ADS_SEARCH_TERMS_AI_CONTRACT,
    version: GOOGLE_ADS_SEARCH_TERMS_AI_VERSION,
    dataset_id: datasetId,
    date_from: dateFrom,
    date_to: dateTo,
    term_count: safeRecommendations.length,
    terms: safeRecommendations.map(group => ({
      term_id: googleAdsSearchTermId(group),
      manager_customer_id: digits(group.managerCustomerId),
      manager_name: safeText(group.managerName, 120),
      customer_id: digits(group.customerId),
      account_name: safeText(group.accountName, 160),
      currency_code: safeText(group.currencyCode, 8).toUpperCase(),
      campaign_id: String(group.campaignId || ''),
      campaign_name: safeText(group.campaignName, 240),
      search_term: safeText(group.searchTerm, 240),
      search_term_match_type: String(group.searchTermMatchType || 'UNKNOWN').toUpperCase(),
      triggered_keywords: (group.keywordTexts || []).map(value => safeText(value, 160)).filter(Boolean).slice(0, 30),
      impressions: Number(group.impressions) || 0,
      clicks: Number(group.clicks) || 0,
      ctr: Number(group.ctr) || 0,
      cost_micros: Number(group.costMicros) || 0,
      conversions: Number(group.conversions) || 0,
      purchase_conversions: group.purchaseMetricsAvailable === true ? Number(group.purchaseConversions) || 0 : null,
      purchase_value: group.purchaseMetricsAvailable === true ? Number(group.purchaseValue) || 0 : null,
      cpa_micros: group.cpaMicros == null ? null : Number(group.cpaMicros),
      target_cpa_micros: group.targetCpaMicros == null ? null : Number(group.targetCpaMicros),
      hub_suggestion: safeText(group.recommendation?.code, 80),
    })),
  };
}

export function parseGoogleAdsSearchTermsAiResponse(rawValue, { datasetId, knownTermIds } = {}) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) throw new Error('Cole a resposta JSON da IA.');
  if (raw.length > 1_000_000) throw new Error('A resposta excede o limite de 1 MB.');
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(unfenced); }
  catch { throw new Error('Não consegui ler o JSON. Remova comentários e confira as aspas e vírgulas.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || parsed.contract !== GOOGLE_ADS_SEARCH_TERMS_AI_CONTRACT || parsed.version !== GOOGLE_ADS_SEARCH_TERMS_AI_VERSION) {
    throw new Error('Contrato inválido. Use o contrato hub.google_ads.search_terms_ai versão 1 gerado para esta consulta.');
  }
  if (String(parsed.dataset_id || '') !== String(datasetId || '')) {
    throw new Error('Esta resposta pertence a outra consulta. Gere o pacote de IA novamente para os dados que estão abertos.');
  }
  if (!Array.isArray(parsed.recommendations) || parsed.recommendations.length < 1 || parsed.recommendations.length > 5000) {
    throw new Error('O JSON precisa incluir de 1 a 5.000 recomendações em "recommendations".');
  }
  const known = knownTermIds instanceof Set ? knownTermIds : new Set();
  const seen = new Set();
  const validDecisions = new Set(['KEEP', 'NEGATIVE_CANDIDATE', 'TEST', 'REVIEW']);
  const validMatchTypes = new Set(['EXACT', 'PHRASE', 'BROAD']);
  const recommendations = parsed.recommendations.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`A recomendação ${index + 1} não é um objeto JSON.`);
    const termId = String(item.term_id || '');
    const decision = String(item.decision || '').toUpperCase();
    const confidence = item.confidence;
    const rationale = safeText(item.rationale, 500);
    const rawMatch = item.negative_match_type == null || item.negative_match_type === '' ? '' : String(item.negative_match_type).toUpperCase();
    if (!/^st1_[a-f0-9]{16}$/.test(termId) || !known.has(termId)) throw new Error(`A recomendação ${index + 1} referencia um term_id que não existe nesta consulta.`);
    if (seen.has(termId)) throw new Error(`O term_id ${termId} aparece mais de uma vez.`);
    if (!validDecisions.has(decision) || !Number.isInteger(confidence) || confidence < 0 || confidence > 100 || !rationale) {
      throw new Error(`A recomendação ${index + 1} precisa de decisão válida, confiança de 0 a 100 e justificativa.`);
    }
    if (rawMatch && !validMatchTypes.has(rawMatch)) throw new Error(`A recomendação ${index + 1} tem correspondência inválida.`);
    if (rawMatch && decision !== 'NEGATIVE_CANDIDATE') throw new Error(`A recomendação ${index + 1} só pode sugerir tipo de negativa quando a decisão for NEGATIVE_CANDIDATE.`);
    seen.add(termId);
    return {
      term_id: termId,
      decision,
      confidence,
      rationale,
      negative_match_type: rawMatch || null,
    };
  });
  return {
    contract: GOOGLE_ADS_SEARCH_TERMS_AI_CONTRACT,
    version: GOOGLE_ADS_SEARCH_TERMS_AI_VERSION,
    dataset_id: datasetId,
    imported_at_utc: new Date().toISOString(),
    recommendations,
  };
}

export function loadGoogleAdsSearchTermsAiResponse(datasetId, storage = globalThis.localStorage) {
  if (!datasetId || !storage) return null;
  try {
    const raw = storage.getItem(`${GOOGLE_ADS_SEARCH_TERMS_AI_STORAGE_PREFIX}${datasetId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.dataset_id === datasetId && Array.isArray(parsed.recommendations) ? parsed : null;
  } catch { return null; }
}

export function saveGoogleAdsSearchTermsAiResponse(response, storage = globalThis.localStorage) {
  if (!storage || !response?.dataset_id) throw new Error('Armazenamento local indisponível.');
  const key = `${GOOGLE_ADS_SEARCH_TERMS_AI_STORAGE_PREFIX}${response.dataset_id}`;
  storage.setItem(key, JSON.stringify(response));
  const keys = [];
  for (let index = 0; index < storage.length; index++) {
    const candidate = storage.key(index);
    if (candidate?.startsWith(GOOGLE_ADS_SEARCH_TERMS_AI_STORAGE_PREFIX)) keys.push(candidate);
  }
  const excess = keys.filter(candidate => candidate !== key).slice(0, Math.max(0, keys.length - 12));
  for (const candidate of excess) storage.removeItem(candidate);
  return response;
}

export function indexGoogleAdsSearchTermsAiRecommendations(response) {
  return new Map((response?.recommendations || []).map(item => [item.term_id, item]));
}
