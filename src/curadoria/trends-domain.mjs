export const VIEW_TYPES = Object.freeze({ CLASSIC: 'classic', MODERN: 'modern' });
export const RESULT_TYPES = Object.freeze({
  UP: 'up',
  STABLE: 'stable',
  DOWN: 'down',
  LOW_VOLUME: 'low_volume',
  NO_DATA: 'no_data',
  INCONCLUSIVE: 'inconclusive',
});

const RESULT_LABELS = Object.freeze({
  [RESULT_TYPES.UP]: 'Em alta',
  [RESULT_TYPES.STABLE]: 'Estável',
  [RESULT_TYPES.DOWN]: 'Em queda',
  [RESULT_TYPES.LOW_VOLUME]: 'Volume baixo',
  [RESULT_TYPES.NO_DATA]: 'Sem dados',
  [RESULT_TYPES.INCONCLUSIVE]: 'Inconclusivo',
});

const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const decodeEntities = value => String(value || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');

export function textLines(raw) {
  return decodeEntities(raw).replace(/\\_/g, '_').replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
}

function termFrom(lines) {
  const index = lines.findIndex(line => fold(line) === 'termo de pesquisa');
  return index > 0 ? lines[index - 1] : '';
}

function coverageFrom(lines) {
  const line = lines.find(item => /(?:mostrando\s+)?1\s*(?:[–-]\s*|a\s+)5\s+de\s+\d+/i.test(item));
  if (!line) return null;
  const numbers = line.match(/\d+/g)?.map(Number) || [];
  return numbers.length >= 3 ? { visible: numbers[1], total: numbers[2] } : null;
}

function section(lines, startLabel, endLabels) {
  const start = lines.findIndex(line => fold(line).includes(fold(startLabel)));
  if (start < 0) return [];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (endLabels.some(label => fold(lines[index]).includes(fold(label)))) { end = index; break; }
  }
  return lines.slice(start + 1, end);
}

function classicRegions(lines) {
  const block = section(lines, 'Interesse por região', ['Assuntos relacionados', 'Pesquisas relacionadas']);
  const regions = [];
  for (let index = 0; index < block.length - 1; index++) {
    if (!/^\d+$/.test(block[index])) continue;
    const rank = Number(block[index]);
    const match = block[index + 1].match(/^(.+?)(\d+)$/);
    if (match && !/^\d+$/.test(match[1].trim())) regions.push({ rank, region: match[1].trim(), interest: Number(match[2]) });
  }
  return regions.slice(0, 10);
}

function rankedNames(lines, startLabel, endLabels) {
  const block = section(lines, startLabel, endLabels), values = [];
  const ignored = /^(google trends|índice e região|interesse na pesquisa|região|file_download|code|share|help_outline)$/i;
  for (let index = 0; index < block.length - 1; index++) {
    const inline = block[index].match(/^(\d+)\s+(.+)$/);
    if (inline && !ignored.test(inline[2].trim())) {
      values.push({ rank: Number(inline[1]), name: inline[2].trim() });
      continue;
    }
    if (!/^\d+$/.test(block[index])) continue;
    const candidate = block[index + 1];
    if (!ignored.test(candidate) && !/^\d+$/.test(candidate)) values.push({ rank: Number(block[index]), name: candidate });
  }
  return values.slice(0, 10);
}

function percentageBefore(lines, phrase) {
  const index = lines.findIndex(line => fold(line).includes(fold(phrase)));
  if (index < 1) return null;
  const match = lines[index - 1].match(/([+-]?\d+(?:[.,]\d+)?)\s*%/);
  return match ? Number(match[1].replace(',', '.')) : null;
}

function common(lines) {
  return {
    term: termFrom(lines),
    scope: lines.find(line => fold(line) === 'mundo') || (lines.some(line => fold(line).includes('mundo')) ? 'Mundo' : ''),
    period: lines.find(line => /últimos 30 dias|último mês/i.test(line)) || '',
    category: lines.find(line => /todas as categorias/i.test(line)) || '',
    searchType: lines.find(line => /pesquisa na web/i.test(line)) || '',
  };
}

export function parseClassic(raw) {
  const lines = textLines(raw), base = common(lines), regions = classicRegions(lines);
  const relatedTopics = rankedNames(lines, 'Assuntos relacionados', ['Pesquisas relacionadas']);
  const relatedQueries = rankedNames(lines, 'Pesquisas relacionadas', ['Get Alerts', 'Google', 'Privacidade']);
  const result = { view: VIEW_TYPES.CLASSIC, ...base, regions, relatedTopics, relatedQueries, coverage: coverageFrom(lines), raw };
  result.valid = Boolean(result.term && (regions.length || relatedTopics.length || relatedQueries.length));
  result.limitations = ['A colagem não contém os pontos numéricos da série temporal.'];
  if (result.coverage && result.coverage.visible < result.coverage.total) result.limitations.push(`Apenas ${result.coverage.visible} de ${result.coverage.total} regiões estão visíveis.`);
  return result;
}

export function parseModern(raw) {
  const lines = textLines(raw), base = common(lines);
  const result = {
    view: VIEW_TYPES.MODERN,
    ...base,
    monthDelta: percentageBefore(lines, 'em comparação ao mês anterior'),
    yearDelta: percentageBefore(lines, 'em comparação ao mesmo período do ano anterior'),
    // A Visão Moderna repete "Google Trends" dentro do próprio bloco.
    // Por isso ele é ignorado por rankedNames, mas não encerra a seção.
    regions: rankedNames(lines, 'Interesse por região', ['Consultas mais pesquisadas', 'Privacidade', 'Termos', 'Enviar feedback']),
    coverage: coverageFrom(lines),
    raw,
  };
  result.valid = Boolean(result.term && (result.monthDelta !== null || result.yearDelta !== null || result.regions.length));
  result.limitations = ['A colagem não contém os pontos numéricos da série temporal nem os índices das regiões.'];
  if (result.coverage && result.coverage.visible < result.coverage.total) result.limitations.push(`Apenas ${result.coverage.visible} de ${result.coverage.total} regiões estão visíveis.`);
  return result;
}

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function upsertCollection(collections, collection) {
  const values = [...(collections || [])];
  const index = values.findIndex(item => item.date === collection.date && item.view === collection.view);
  if (index >= 0) values[index] = collection; else values.push(collection);
  return values.sort((a, b) => a.date.localeCompare(b.date) || a.view.localeCompare(b.view));
}

export function collectionsForDate(collections, date) {
  return (collections || []).filter(item => item.date === date);
}

export function resultLabel(status) {
  return RESULT_LABELS[status] || 'Não pesquisado';
}

export function upsertAssessment(assessments, assessment) {
  const values = [...(assessments || [])];
  const index = values.findIndex(item => item.date === assessment.date);
  if (index >= 0) values[index] = assessment; else values.push(assessment);
  return values.sort((a, b) => a.date.localeCompare(b.date) || a.capturedAt.localeCompare(b.capturedAt));
}

export function appendAssessment(assessments, assessment) {
  return [...(assessments || []), assessment]
    .sort((a, b) => a.date.localeCompare(b.date) || a.capturedAt.localeCompare(b.capturedAt));
}

export function latestAssessment(assessments) {
  return [...(assessments || [])].sort((a, b) => b.date.localeCompare(a.date) || b.capturedAt.localeCompare(a.capturedAt))[0] || null;
}

export function exploreUrl(term) {
  const query = encodeURIComponent(String(term || '').trim());
  return `https://trends.google.com/trends/explore?date=today%201-m&q=${query}&hl=pt&legacy`;
}
