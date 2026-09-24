export const AUTOMATIC_SIGNAL_VERSION = '1.0.0';
export const PILLAR_COUNT = 3;

const RESULT_LABELS = Object.freeze({
  positive: 'Positivo',
  mixed: 'Misto',
  weak: 'Fraco',
  inconclusive: 'Inconclusivo',
  no_data: 'Sem dados',
});

function timestamp(value) {
  return String(value?.capturedAt || value?.date || value?.updatedAt || '');
}

function latest(items) {
  return [...(Array.isArray(items) ? items : [])]
    .filter(Boolean)
    .sort((a, b) => timestamp(b).localeCompare(timestamp(a)))[0] || null;
}

function component({available, status = null, label, classification, capturedAt = null, ...extra}) {
  return {available, status, label, classification, capturedAt, ...extra};
}

function trendsComponent(record) {
  const assessment = record?.latestAssessment || latest(record?.assessments);
  if (!assessment) return component({available: false, label: 'Não avaliado', classification: 'missing'});
  const status = assessment.status;
  const map = {
    up: ['Em alta', 'favorable'],
    stable: ['Estável', 'favorable'],
    down: ['Em queda', 'caution'],
    low_volume: ['Volume baixo', 'caution'],
    no_data: ['Sem dados', 'insufficient'],
    inconclusive: ['Inconclusivo', 'insufficient'],
  };
  const [label, classification] = map[status] || ['Status não reconhecido', 'insufficient'];
  return component({available: true, status: status || null, label, classification, capturedAt: timestamp(assessment), searchTerm: assessment.searchTerm || null, countries: [...new Set([...(assessment.countries || []), assessment.country].filter(Boolean))]});
}

function imageAssessments(record) {
  if (Array.isArray(record)) return record;
  if (Array.isArray(record?.currentByCountry)) return record.currentByCountry;
  return record?.assessments || [];
}

function imagesComponent(record) {
  const assessment = latest(imageAssessments(record));
  if (!assessment) return component({available: false, label: 'Não avaliado', classification: 'missing'});
  const status = assessment.status;
  const map = {
    dominant: ['Dominante', 'favorable'],
    mixed: ['Mista', 'caution'],
    scarce: ['Escassa', 'caution'],
    absent: ['Ausente', 'unfavorable'],
    ambiguous: ['Ambígua', 'insufficient'],
    inconclusive: ['Inconclusiva', 'insufficient'],
  };
  const [label, classification] = map[status] || ['Status não reconhecido', 'insufficient'];
  const refinementOf = assessment.refinementOf || null;
  return component({available: true, status: status || null, label, classification, capturedAt: timestamp(assessment), country: assessment.country || null, searchTerm: assessment.searchTerm || null, refinementOf, dominanceContext: status === 'dominant' ? (refinementOf ? 'after_refinement' : 'not_recorded') : null});
}

function glimpseComponent(analysis) {
  if (!analysis) return component({available: false, label: 'Sem análise', classification: 'missing'});
  const status = analysis.signal?.level || null;
  const map = {
    strong: ['Forte', 'favorable'],
    medium: ['Médio', 'caution'],
    limited: ['Dados limitados', 'insufficient'],
  };
  const [label, classification] = map[status] || ['Sinal não reconhecido', 'insufficient'];
  return component({available: true, status, label, classification, capturedAt: timestamp(analysis), analysisId: analysis.analysisId || null, monthlyVolume: analysis.parsed?.volume?.display || null});
}

function aggregate(components) {
  const available = Object.values(components).filter(item => item.available);
  if (available.length === 0) return 'no_data';
  if (available.length === 1) return 'inconclusive';
  const favorable = available.filter(item => item.classification === 'favorable').length;
  const unfavorable = available.filter(item => item.classification === 'unfavorable').length;
  if (favorable === available.length) return 'positive';
  if (favorable > 0) return 'mixed';
  if (unfavorable > 0) return 'weak';
  return 'inconclusive';
}

export function computeAutomaticSignal({trends = null, images = null, glimpse = null} = {}) {
  const components = {
    trends: trendsComponent(trends),
    images: imagesComponent(images),
    glimpse: glimpseComponent(glimpse),
  };
  const available = Object.values(components).filter(item => item.available).length;
  const result = aggregate(components);
  return {
    result,
    label: RESULT_LABELS[result],
    coverage: {available, total: PILLAR_COUNT, label: `${available}/${PILLAR_COUNT}`},
    version: AUTOMATIC_SIGNAL_VERSION,
    components,
  };
}

export function signalSortValue(signal) {
  const rank = {positive: 5, mixed: 4, inconclusive: 3, weak: 2, no_data: 1};
  return (rank[signal?.result] || 0) * 10 + (signal?.coverage?.available || 0);
}
