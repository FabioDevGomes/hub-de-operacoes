const SOURCE_FORMAT = 'smartadv-offers-v1';
const CHANNELS = Object.freeze(['Banner', 'Native', 'Social', 'Push', 'SEO', 'Search', 'PPC', 'Shopping']);
const HEADER = ['id', 'name', 'vertical'];
const PRODUCT_CHANNEL_WORDS = new Set(['banner', 'native', 'social', 'push', 'seo', 'search', 'ppc', 'shopping', 'brand', 'bidding']);

function clean(value = '') {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function normalizedHeader(value = '') {
  return clean(value).replace(/\*+/g, '').replace(/<[^>]*>/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tableCells(line) {
  if (line.includes('|')) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(clean);
  }
  if (line.includes('\t')) return line.split('\t').map(clean);
  return null;
}

function headerIndex(lines) {
  for (let index = 0; index < lines.length; index++) {
    const cells = tableCells(lines[index]);
    if (cells?.slice(0, 3).map(normalizedHeader).every((value, offset) => value === HEADER[offset])) {
      return {index, mode: lines[index].includes('|') ? 'markdown' : 'tsv'};
    }
  }
  for (let index = 0; index <= lines.length - HEADER.length; index++) {
    if (lines.slice(index, index + HEADER.length).map(normalizedHeader).every((value, offset) => value === HEADER[offset])) {
      return {index, mode: 'cells'};
    }
  }
  return null;
}

function isSeparatorRow(cells = []) {
  return cells.length >= 3 && cells.slice(0, 3).every(value => /^:?-{2,}:?$/.test(clean(value)));
}

function canonicalOfferUrl(id) {
  return `https://portal.smartadv.com/offers/${id}`;
}

export function productNameFromOfferName(value = '') {
  let name = clean(value)
    .replace(/^\s*!?\s*(?:HOT\s+OFFER|HOT)\s*[-:]\s*/i, '')
    .replace(/\s*\{[^}]*\}/g, '')
    .replace(/\s*\[(?:INTL|[A-Z]{2}(?:\s*,\s*[A-Z]{2})*)\]/gi, '');
  name = name.replace(/\(([^)]*)\)/g, (match, contents) => {
    const words = contents.toLowerCase().match(/[a-z]+/g) || [];
    return words.length && words.every(word => PRODUCT_CHANNEL_WORDS.has(word)) ? '' : match;
  });
  return name.replace(/\s*[-–—]\s*CPA\s*$/i, '').replace(/\s+/g, ' ').replace(/\s*[-–—]\s*$/g, '').trim();
}

function parseMarkdownLink(value = '') {
  const match = clean(value).match(/^\[([\s\S]*)\]\((https:\/\/[^)\s]+)\)$/i);
  if (!match) return {name: clean(value).replace(/\\([\[\]])/g, '$1'), sourceUrl: ''};
  return {name: clean(match[1]).replace(/\\([\[\]])/g, '$1'), sourceUrl: match[2]};
}

function safeOfferUrl(sourceUrl, id, issues, row) {
  if (!sourceUrl) return canonicalOfferUrl(id);
  try {
    const url = new URL(sourceUrl);
    if (url.protocol === 'https:' && url.hostname.toLowerCase() === 'portal.smartadv.com' && url.pathname.replace(/\/$/, '') === `/offers/${id}`) {
      return url.href;
    }
  } catch {
    // The source link is optional; the known offer route is rebuilt from the numeric ID.
  }
  issues.push({severity: 'warning', row, reason: `O link da oferta ${id} não corresponde ao domínio/ID esperado; foi usado o endereço da oferta pelo ID.`});
  return canonicalOfferUrl(id);
}

function offerFromCells(cells, row, issues) {
  const id = clean(cells[0]);
  const linked = parseMarkdownLink(cells[1]);
  const name = linked.name;
  const vertical = clean(cells[2]);
  if (!/^\d{1,12}$/.test(id) || Number(id) < 1) {
    issues.push({severity: 'error', row, reason: 'ID da oferta inválido.'});
    return null;
  }
  if (!name) issues.push({severity: 'error', row, reason: `Nome ausente na oferta ${id}.`});
  if (!vertical) issues.push({severity: 'error', row, reason: `Vertical ausente na oferta ${id}.`});
  const geoTargets = [...new Set([...name.matchAll(/\[\s*(INTL|[A-Z]{2}(?:\s*,\s*[A-Z]{2})*)\s*\]/gi)]
    .flatMap(match => match[1].split(',').map(value => value.trim().toUpperCase())))];
  const channelText = [...name.matchAll(/\(([^)]+)\)/g)].map(match => match[1]).join(' ').toLowerCase().replace(/[^a-z]+/g, ' ');
  const allowedChannels = CHANNELS.filter(channel => new RegExp(`(?:^|[^a-z])${channel.toLowerCase()}(?:$|[^a-z])`, 'i').test(channelText));
  const noBrandBidding = /\bno\s*brand\s*bidding\b/i.test(name);
  const brandBidding = noBrandBidding ? 'no' : /\bbrand\s*bidding\b/i.test(name) ? 'yes' : 'unknown';
  return {
    offerId: id,
    offerName: name,
    vertical,
    offerUrl: safeOfferUrl(linked.sourceUrl, id, issues, row),
    geoTargets,
    allowedChannels,
    brandBidding,
  };
}

function rowsFromTable(lines, start, mode) {
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const cells = tableCells(line);
    if (!cells || isSeparatorRow(cells)) continue;
    if (mode === 'markdown' && !line.includes('|')) continue;
    if (mode === 'tsv' && !line.includes('\t')) continue;
    if (/^\d{1,12}$/.test(clean(cells[0]))) rows.push(cells.slice(0, 3));
  }
  return rows;
}

function rowsFromCellLines(lines, start) {
  const rows = [];
  let index = start + HEADER.length;
  while (index < lines.length) {
    while (index < lines.length && !clean(lines[index])) index++;
    if (!/^\d{1,12}$/.test(clean(lines[index]))) break;
    const id = clean(lines[index++]);
    while (index < lines.length && !clean(lines[index])) index++;
    const name = clean(lines[index++]);
    while (index < lines.length && !clean(lines[index])) index++;
    const vertical = clean(lines[index++]);
    if (!name || !vertical) break;
    rows.push([id, name, vertical]);
  }
  return rows;
}

export function parseSmartAdvOffersClipboard(raw = '') {
  const lines = String(raw).replace(/\r/g, '').split('\n');
  const header = headerIndex(lines);
  const issues = [];
  if (!header) {
    return {offers: [], parsedCount: 0, issues: [{severity: 'error', reason: 'Cabeçalho ID / Name / Vertical não encontrado.'}], valid: false, sourceFormat: SOURCE_FORMAT, coverage: 'unknown'};
  }
  const rows = header.mode === 'cells' ? rowsFromCellLines(lines, header.index) : rowsFromTable(lines, header.index, header.mode);
  const offers = [];
  const seen = new Set();
  rows.forEach((cells, index) => {
    const offer = offerFromCells(cells, index + 1, issues);
    if (!offer) return;
    if (seen.has(offer.offerId)) issues.push({severity: 'error', row: index + 1, reason: `ID duplicado na captura: ${offer.offerId}.`});
    seen.add(offer.offerId);
    offers.push(offer);
  });
  if (!offers.length) issues.push({severity: 'error', reason: 'Nenhuma oferta foi reconhecida após o cabeçalho.'});
  return {
    offers,
    parsedCount: offers.length,
    issues,
    valid: offers.length > 0 && !issues.some(issue => issue.severity === 'error'),
    sourceFormat: SOURCE_FORMAT,
    coverage: 'unknown',
  };
}

export function captureOfferHistory(capture, olderCaptures = []) {
  const knownIds = new Set(olderCaptures.flatMap(item => item.offers || []).map(offer => offer.offerId));
  return (capture?.offers || []).map(offer => ({...offer, historyState: knownIds.has(offer.offerId) ? 'known' : 'first-seen'}));
}

export function latestCaptureIndex(captures = []) {
  const index = new Map(), timestamps = new Map();
  for (const capture of captures) {
    if (capture?.captureId === 'smartadv-user-provided-initial') continue;
    const timestamp = Date.parse(capture?.capturedAt || '');
    if (!Number.isFinite(timestamp)) continue;
    for (const offer of capture.offers || []) {
      const offerId = String(offer?.offerId || '');
      if (!offerId || timestamp <= (timestamps.get(offerId) ?? -Infinity)) continue;
      timestamps.set(offerId, timestamp);
      index.set(offerId, capture.capturedAt);
    }
  }
  return index;
}

export function historyLabel(state) {
  return state === 'known' ? 'Já capturada' : 'Primeiro registro';
}
