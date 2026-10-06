const HEADER = ['rank', 'offer name', 'seller', 'avg', 'initial', 'future', 'epc', 'cvr', 'gravity'];
const DASH = /^(?:-|–|—|−)$/;
const LEGACY_SOURCE_FORMAT = 'clickbank-top-offers-v1';
const OFFER_ID_SOURCE_FORMAT = 'clickbank-top-offers-v2';

export function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clean(value = '') {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function headerValue(value = '') {
  return clean(value).toLowerCase().replace(/\s*\$\s*/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseMetric(value, {currency = false, percent = false} = {}) {
  const raw = clean(value);
  if (!raw || DASH.test(raw)) return {value: null, symbol: '', raw};
  const symbol = currency && raw.includes('$') ? '$' : '';
  const numberText = raw.replace(/[$,%\s]/g, '').replace(/,/g, '');
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(numberText)) return {value: null, symbol, raw};
  const number = Number(numberText);
  return {value: Number.isFinite(number) ? number : null, symbol, raw, ...(percent ? {unit: '%'} : {})};
}

function rankValue(value) {
  const raw = clean(value);
  return /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

function offerKey(seller, offerName) {
  return `${normalize(seller)}::${normalize(offerName)}`;
}

function buildOffer(cells, index, issues) {
  const rank = rankValue(cells[0]);
  const offerName = clean(cells[1]);
  const seller = clean(cells[2]);
  const rawOfferId = clean(cells[9]);
  let offerId = null;
  if (rank === null) issues.push({severity: 'error', row: index, reason: 'Posição inválida.'});
  if (!offerName) issues.push({severity: 'error', row: index, reason: 'Nome da oferta ausente.'});
  if (!seller) issues.push({severity: 'error', row: index, reason: 'Vendedor ausente.'});
  if (rawOfferId && !DASH.test(rawOfferId)) {
    if (/^[A-Za-z0-9_-]{1,64}$/.test(rawOfferId)) offerId = rawOfferId;
    else issues.push({severity: 'warning', row: index, field: 'offerId', reason: 'Código da oferta inválido; o link não foi criado.'});
  }
  const metrics = {
    average: parseMetric(cells[3], {currency: true}),
    initial: parseMetric(cells[4], {currency: true}),
    future: parseMetric(cells[5], {currency: true}),
    epc: parseMetric(cells[6], {currency: true}),
    cvr: parseMetric(cells[7], {percent: true}),
    gravity: parseMetric(cells[8]),
  };
  for (const [field, metric] of Object.entries(metrics)) {
    if (metric.raw && metric.value === null && !DASH.test(metric.raw)) {
      issues.push({severity: 'warning', row: index, field, reason: `Valor de ${field} não reconhecido; o texto original foi preservado.`});
    }
  }
  return {
    offerKey: offerKey(seller, offerName),
    identitySource: 'seller+normalized-title',
    rank,
    offerId,
    offerName,
    seller,
    ...metrics,
  };
}

function parseTabularRows(lines, headerIndex, hasOfferId = false) {
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = line.split('\t').map(clean);
    if (!rankValue(cells[0]) || cells.length < 9) continue;
    rows.push([...cells.slice(0, 9), ...(hasOfferId ? [cells[9] || ''] : [])]);
  }
  return rows;
}

function parseCellLines(lines, headerIndex, headerLength, hasOfferId = false) {
  const rows = [];
  let current = null;
  for (const line of lines.slice(headerIndex + headerLength)) {
    const value = clean(line);
    if (!value) continue;
    if (/^results\s+per\s+page$/i.test(value) || /^\d[\d,]*\s*(?:-|–|—)\s*\d[\d,]*\s+(?:of|de)\s+\d[\d,]*$/i.test(value) || /^turn off ad blockers$/i.test(value)) {
      if (current) rows.push([String(current.rank), ...current.cells.slice(0, 9)]);
      current = null;
      break;
    }
    const candidateRank = rankValue(value);
    if (candidateRank !== null && (!current || current.cells.length >= (hasOfferId ? 9 : 8))) {
      if (current) rows.push([String(current.rank), ...current.cells.slice(0, 9)]);
      current = {rank: candidateRank, cells: []};
      continue;
    }
    if (current) current.cells.push(value);
  }
  if (current) rows.push([String(current.rank), ...current.cells.slice(0, 9)]);
  return rows;
}

function headerLocation(lines) {
  const tabular = lines.findIndex(line => {
    const cells = line.split('\t').map(headerValue);
    return HEADER.every((name, index) => cells[index] === headerValue(name));
  });
  if (tabular >= 0) {
    const cells = lines[tabular].split('\t').map(headerValue);
    return {index: tabular, length: 1, mode: 'tabular', hasOfferId: cells[HEADER.length] === headerValue('Offer ID')};
  }
  const content = lines.map((line, lineIndex) => ({value: headerValue(line), lineIndex})).filter(item => item.value);
  for (let index = 0; index <= content.length - HEADER.length; index++) {
    if (HEADER.every((name, offset) => content[index + offset].value === headerValue(name))) {
      const lastHeader = content[index + HEADER.length - 1];
      const offerIdHeader = content[index + HEADER.length]?.value === headerValue('Offer ID') ? content[index + HEADER.length] : null;
      const actions = content[index + HEADER.length + (offerIdHeader ? 1 : 0)]?.value === 'actions'
        ? content[index + HEADER.length + (offerIdHeader ? 1 : 0)] : null;
      const endLineIndex = actions?.lineIndex ?? offerIdHeader?.lineIndex ?? lastHeader.lineIndex;
      return {index: content[index].lineIndex, length: endLineIndex - content[index].lineIndex + 1, mode: 'cells', hasOfferId: Boolean(offerIdHeader)};
    }
  }
  return null;
}

function countFrom(text, expression) {
  const match = String(text).match(expression);
  if (!match) return null;
  const number = Number(match[1].replace(/,/g, ''));
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function pageMetadata(text, offers) {
  const rangeMatch = String(text).match(/\b(\d[\d,]*)\s*(?:-|–|—)\s*(\d[\d,]*)\s+(?:of|de)\s+(\d[\d,]*)\b/i);
  const range = rangeMatch ? rangeMatch.slice(1).map(value => Number(value.replace(/,/g, ''))) : null;
  const pageSize = countFrom(text, /results\s+per\s+page\s*\n+\s*(\d[\d,]*)/i);
  const declaredTotal = countFrom(text, /\b(\d[\d,]*)\s+results?\b/i) ?? range?.[2] ?? null;
  return {
    start: range?.[0] ?? (offers.length ? Math.min(...offers.map(item => item.rank)) : null),
    end: range?.[1] ?? (offers.length ? Math.max(...offers.map(item => item.rank)) : null),
    total: declaredTotal,
    pageSize,
    expectedOnPage: range && range[1] >= range[0] ? range[1] - range[0] + 1 : null,
    completeUniverse: declaredTotal !== null && offers.length === declaredTotal && (!range || (range[0] === 1 && range[1] === declaredTotal)),
  };
}

export function parseTopOffersClipboard(raw = '') {
  const text = String(raw).replace(/\r/g, '');
  const lines = text.split('\n');
  const header = headerLocation(lines);
  const issues = [];
  if (!header) {
    return {offers: [], parsedCount: 0, page: pageMetadata(text, []), issues: [{severity: 'error', reason: 'Cabeçalho da tabela Rank / Offer Name / Seller não encontrado.'}], valid: false, sourceFormat: 'clickbank-top-offers-v1'};
  }
  const cellsByRow = header.mode === 'tabular'
    ? parseTabularRows(lines, header.index, header.hasOfferId)
    : parseCellLines(lines, header.index, header.length, header.hasOfferId);
  const offers = [];
  const seenRanks = new Set();
  const seenKeys = new Set();
  cellsByRow.forEach((cells, index) => {
    const offer = buildOffer(cells, index + 1, issues);
    if (offer.rank !== null && seenRanks.has(offer.rank)) issues.push({severity: 'error', row: index + 1, reason: `Posição repetida: ${offer.rank}.`});
    if (offer.rank !== null) seenRanks.add(offer.rank);
    if (offer.offerKey !== '::' && seenKeys.has(offer.offerKey)) issues.push({severity: 'error', row: index + 1, reason: 'A mesma combinação de vendedor e nome aparece mais de uma vez; a identidade não é segura.'});
    if (offer.offerKey !== '::') seenKeys.add(offer.offerKey);
    offers.push(offer);
  });
  if (!offers.length) issues.push({severity: 'error', reason: 'Nenhuma linha de oferta foi interpretada.'});
  const page = pageMetadata(text, offers);
  if (page.expectedOnPage !== null && page.expectedOnPage !== offers.length) {
    issues.push({severity: 'error', reason: `A paginação indica ${page.expectedOnPage} linhas nesta página, mas ${offers.length} foram interpretadas.`});
  }
  if (page.expectedOnPage !== null && page.start !== null) {
    const ranks = offers.map(item => item.rank).filter(Number.isSafeInteger).sort((a,b) => a - b);
    if (ranks.length === offers.length && ranks.some((rank, index) => rank !== page.start + index)) {
      issues.push({severity: 'error', reason: 'As posições copiadas não correspondem à faixa indicada pela paginação.'});
    }
  }
  if (page.total !== null && page.start !== null && page.end !== null && page.total < page.end) {
    issues.push({severity: 'error', reason: 'A faixa copiada excede o total declarado pela fonte.'});
  }
  return {
    offers,
    parsedCount: offers.length,
    page,
    listName: /\bTop Offers\b/i.test(text) ? 'Top Offers' : 'Marketplace ClickBank',
    sourceFormat: header.hasOfferId ? OFFER_ID_SOURCE_FORMAT : LEGACY_SOURCE_FORMAT,
    issues,
    valid: offers.length > 0 && !issues.some(issue => issue.severity === 'error'),
  };
}

export function clickBankOfferDetailsUrl(offerId) {
  const code = clean(offerId);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) return null;
  return `https://accounts.clickbank.com/master/dashboard/affiliate-marketplace#/offer-details?offer=${encodeURIComponent(code)}&clickUrl=undefined`;
}

export function compareCapturedOffers(current = [], previous = []) {
  const priorByKey = new Map(previous.map(item => [item.offerKey, item]));
  return current.map(item => {
    const prior = priorByKey.get(item.offerKey);
    if (!prior) return {...item, priorRank: null, rankDelta: null, movement: 'uncompared'};
    const rankDelta = prior.rank - item.rank;
    return {...item, priorRank: prior.rank, rankDelta, movement: rankDelta > 0 ? 'up' : rankDelta < 0 ? 'down' : 'same'};
  });
}

export function movementLabel(item = {}) {
  if (item.movement === 'up') return `↑ ${item.rankDelta}`;
  if (item.movement === 'down') return `↓ ${Math.abs(item.rankDelta)}`;
  if (item.movement === 'same') return '= 0';
  return '—';
}
