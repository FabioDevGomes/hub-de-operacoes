const HEADER = ['id', 'oferta', 'paises', 'paises', 'categoria', 'pagamento', 'criado', 'pre visualizacao'];
const PAYMENT = /^\$\s*([\d,]+(?:\.\d+)?|\d+(?:,\d+)?)$/;
const SOURCE_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const PREVIEW_ACTIONS = new Set(['capturas de tela', 'previa ao vivo']);

export function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function decode(value = '') {
  return String(value).replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#x([0-9a-f]+);/gi, function (_, hex) {
    return String.fromCodePoint(parseInt(hex, 16));
  }).replace(/&#(\d+);/g, function (_, number) {
    return String.fromCodePoint(Number(number));
  }).trim();
}

export function offerKey(scope, offerId) {
  return String(scope || '') + ':' + String(offerId || '');
}

export function parseSourceDate(value = '') {
  const match = String(value).trim().match(SOURCE_DATE);
  if (!match) return null;
  const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function paymentValue(value = '') {
  const raw = String(value).trim();
  const match = raw.match(PAYMENT);
  if (!match) return {amount: null, currency: null, symbol: '', raw};
  const amount = Number(match[1].replace(/,/g, ''));
  return {amount: Number.isFinite(amount) ? amount : null, currency: null, symbol: '$', raw};
}

function countryData(value = '') {
  const countries = [], seen = new Set();
  let additionalCountryCount = 0;
  for (const part of String(value).split(',')) {
    const more = part.trim().match(/^\+(\d+)\s+more$/i);
    if (more) {
      additionalCountryCount = Number(more[1]);
      continue;
    }
    const code = part.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && !seen.has(code)) {
      seen.add(code);
      countries.push(code);
    }
  }
  return {countriesVisible: countries, additionalCountryCount};
}

function titleData(value = '') {
  const rawOfferTitle = decode(value);
  const hot = /^\s*\*\*HOT\*\*/i.test(rawOfferTitle) || /^\s*HOT\b/i.test(rawOfferTitle);
  const ctcMatch = rawOfferTitle.match(/\bCTC\s*\$\s*([\d.,]+)/i);
  const annotations = [
    ...Array.from(rawOfferTitle.matchAll(/\{([^}]*)\}/g), match => match[1]),
    ...Array.from(rawOfferTitle.matchAll(/\(([^)]*)\)/g), match => match[1]),
  ].filter(Boolean);
  const productName = rawOfferTitle
    .replace(/^\s*(?:\*\*HOT\*\*|HOT)\s*/i, '')
    .replace(/\*\*/g, '')
    .replace(/\s*\{[^}]*\}/g, '')
    .replace(/\s*\([^)]*(?:\bDTC\b|Alt-Landers|Advertorial|Event Tracking|\bQuiz\b|Multi-Lang)[^)]*\)/gi, '')
    .replace(/\s*~?\s*CTC\s*\$\s*[\d.,]+/gi, '')
    .replace(/\s*-\s*High CTC\b/gi, '')
    .trim();
  return {
    rawOfferTitle,
    productName,
    hot,
    annotations,
    ctc: ctcMatch ? {amount: Number(ctcMatch[1].replace(/,/g, '')), currency: null, raw: ctcMatch[0]} : null,
  };
}

function affiliationData(value = '') {
  const raw = String(value).trim();
  const folded = normalize(raw);
  const status = folded === 'aprovado' || folded === 'aprovada' ? 'approved'
    : folded === 'aplicar' || folded === 'apply' || folded === 'solicitar' ? 'request'
      : 'unknown';
  return {status, raw};
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function parseRow(lines, scope, sourceOrder, issues) {
  const first = lines[0].split('\t').map(value => decode(value));
  const id = (first[0] || '').trim();
  if (!/^\d+$/.test(id)) {
    issues.push({severity: 'error', reason: 'Uma linha de oferta não tem ID numérico válido.'});
    return null;
  }
  const parsedTitle = titleData(first[1] || '');
  const countriesRaw = first[2] || '';
  const affiliation = affiliationData(first[3] || '');
  const countries = countryData(countriesRaw);
  const categoryParts = [first[4] || ''], continuationFields = [], previewActions = [];
  let payment = {amount: null, currency: null, symbol: '', raw: ''}, createdRaw = '', createdAt = null, afterPayment = false, afterDate = false;
  const hasPaymentInFirstLine = first.slice(5).some(value => PAYMENT.test(String(value).trim()));
  for (const line of lines.slice(1)) {
    const cells = line.split('\t').map(value => decode(value));
    const paymentIndex = cells.findIndex(value => PAYMENT.test(String(value).trim()));
    if (paymentIndex === 1 && cells[0]?.trim()) {
      categoryParts.push(cells[0]);
      continuationFields.push(...cells.slice(1));
    } else if (paymentIndex === 5 && cells[4]?.trim()) {
      categoryParts.push(cells[4]);
      continuationFields.push(...cells.slice(5));
    } else if (hasPaymentInFirstLine && cells[4]?.trim() && !PAYMENT.test(cells[4].trim())) {
      categoryParts.push(cells[4]);
    } else {
      continuationFields.push(...cells);
    }
  }
  const tails = first.slice(5).concat(continuationFields);
  for (const value of tails) {
    const part = String(value || '').trim();
    if (!part) continue;
    const paid = part.match(PAYMENT);
    if (!afterPayment && paid) {
      payment = paymentValue(part);
      afterPayment = true;
      continue;
    }
    if (!afterPayment) {
      if (!PREVIEW_ACTIONS.has(normalize(part))) categoryParts.push(part);
      continue;
    }
    const parsedDate = parseSourceDate(part);
    if (!afterDate && parsedDate) {
      createdRaw = part;
      createdAt = parsedDate;
      afterDate = true;
      continue;
    }
    if (afterDate || PREVIEW_ACTIONS.has(normalize(part))) previewActions.push(part);
  }
  const category = categoryParts.join(' ').replace(/\s+/g, ' ').trim();
  const missing = [];
  if (!parsedTitle.productName) missing.push('oferta');
  if (!countriesRaw) missing.push('países');
  if (!affiliation.raw) missing.push('afiliação');
  if (!category) missing.push('categoria');
  if (!payment.raw) missing.push('pagamento');
  if (!createdAt) missing.push('data de criação');
  if (missing.length) issues.push({severity: 'warning', offerId: id, reason: 'Campos não identificados: ' + missing.join(', ') + '.'});
  return {
    offerId: id,
    offerKey: offerKey(scope, id),
    productName: parsedTitle.productName,
    rawOfferTitle: parsedTitle.rawOfferTitle,
    productKey: normalize(parsedTitle.productName),
    hot: parsedTitle.hot,
    annotations: parsedTitle.annotations,
    ctc: parsedTitle.ctc,
    countriesRaw,
    countriesVisible: countries.countriesVisible,
    additionalCountryCount: countries.additionalCountryCount,
    affiliationStatus: affiliation.status,
    affiliationRaw: affiliation.raw,
    category,
    payment,
    createdRaw,
    createdAt,
    previewActions: [...new Set(previewActions)],
    sourceOrder,
    scope,
    sourceFormat: 'hot-offers-ms-tabular',
    availableFields: {
      productName: Boolean(parsedTitle.productName),
      hot: true,
      countries: Boolean(countriesRaw),
      affiliation: Boolean(affiliation.raw),
      category: Boolean(category),
      payment: Boolean(payment.raw),
      createdAt: Boolean(createdAt),
      ctc: Boolean(parsedTitle.ctc),
      previewActions: previewActions.length > 0,
    },
  };
}

export function parseHotOffersText(raw = '', {scope = ''} = {}) {
  const lines = String(raw).replace(/\r/g, '').split('\n').map(line => line.trimEnd());
  const headerIndex = lines.findIndex(line => {
    const cells = line.split('\t').map(normalize);
    return cells.length >= HEADER.length && HEADER.every((name, index) => cells[index] === name);
  });
  const issues = [];
  if (headerIndex < 0) {
    return {offers: [], declaredCount: null, parsedCount: 0, issues: [{severity: 'error', reason: 'Cabeçalho da lista Hot Offers MS não encontrado.'}], valid: false, sourceFormat: 'hot-offers-ms-tabular'};
  }
  if (!['bottom', 'top'].includes(scope)) {
    issues.push({severity: 'error', reason: 'Selecione se esta coleta é do Fundo quente ou do Topo quente do funil.'});
  }
  const blocks = [];
  let current = null;
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const firstCell = line.split('\t')[0].trim();
    if (/^\d+$/.test(firstCell) && line.includes('\t')) {
      if (current) blocks.push(current);
      current = [line];
    } else if (current) current.push(line);
  }
  if (current) blocks.push(current);
  const offers = [], seen = new Set();
  blocks.forEach((block, index) => {
    const firstId = (block[0].split('\t')[0] || '').trim();
    if (seen.has(firstId)) {
      issues.push({severity: 'error', offerId: firstId, reason: 'ID repetido nesta captura.'});
      return;
    }
    seen.add(firstId);
    const offer = parseRow(block, scope, index + 1, issues);
    if (offer) offers.push(offer);
  });
  if (!offers.length) issues.push({severity: 'error', reason: 'Nenhuma oferta foi interpretada.'});
  return {
    offers,
    declaredCount: null,
    parsedCount: offers.length,
    issues,
    valid: offers.length > 0 && ['bottom', 'top'].includes(scope) && !issues.some(issue => issue.severity === 'error'),
    sourceFormat: 'hot-offers-ms-tabular',
    scope,
  };
}

export function snapshotFromOffer(offer, {collectionId, capturedAt}) {
  return {
    snapshotId: offer.scope + '::' + collectionId + '::' + offer.offerId,
    collectionId,
    capturedAt,
    scope: offer.scope,
    offerKey: offer.offerKey,
    offerId: offer.offerId,
    sourceOrder: offer.sourceOrder,
    productName: offer.productName,
    rawOfferTitle: offer.rawOfferTitle,
    productKey: offer.productKey,
    hot: offer.hot,
    annotations: [...offer.annotations],
    ctc: offer.ctc ? {...offer.ctc} : null,
    countriesRaw: offer.countriesRaw,
    countriesVisible: [...offer.countriesVisible],
    additionalCountryCount: offer.additionalCountryCount,
    affiliationStatus: offer.affiliationStatus,
    affiliationRaw: offer.affiliationRaw,
    category: offer.category,
    payment: {...offer.payment},
    createdRaw: offer.createdRaw,
    createdAt: offer.createdAt,
    previewActions: [...offer.previewActions],
    availableFields: {...offer.availableFields},
  };
}

const TRACKED_FIELDS = ['productName', 'hot', 'countriesVisible', 'additionalCountryCount', 'affiliationStatus', 'affiliationRaw', 'category', 'payment', 'createdAt', 'ctc'];

export function compareCollections(current = [], previous = [], knownOfferKeys = []) {
  const previousByKey = new Map(previous.map(item => [item.offerKey, item]));
  const currentByKey = new Map(current.map(item => [item.offerKey, item]));
  const known = new Set(knownOfferKeys);
  const entries = [], changes = [];
  for (const item of current) {
    const before = previousByKey.get(item.offerKey);
    const movement = before ? (before.sourceOrder > item.sourceOrder ? 'up' : before.sourceOrder < item.sourceOrder ? 'down' : 'same') : known.has(item.offerKey) ? 'returned' : 'new';
    const itemChanges = [];
    if (before) for (const field of TRACKED_FIELDS) {
      if (item.availableFields?.[field] === false) continue;
      if (!same(before[field], item[field])) {
        const change = {offerKey: item.offerKey, offerId: item.offerId, field, oldValue: before[field] ?? null, newValue: item[field] ?? null, collectionId: item.collectionId, capturedAt: item.capturedAt};
        itemChanges.push(change);
        changes.push(change);
      }
    }
    entries.push({offerKey: item.offerKey, offerId: item.offerId, movement, previousOrder: before?.sourceOrder ?? null, currentOrder: item.sourceOrder, positionDelta: before ? before.sourceOrder - item.sourceOrder : null, changes: itemChanges});
  }
  for (const item of previous) if (!currentByKey.has(item.offerKey)) entries.push({offerKey: item.offerKey, offerId: item.offerId, movement: 'exited', previousOrder: item.sourceOrder, currentOrder: null, positionDelta: null, changes: []});
  const count = function (value) { return entries.filter(item => item.movement === value).length; };
  const changed = function (field) { return changes.filter(item => item.field === field).length; };
  return {
    entries,
    changes,
    summary: {
      new: count('new'), remained: count('up') + count('down') + count('same'),
      up: count('up'), down: count('down'), same: count('same'),
      returned: count('returned'), exited: count('exited'),
      affiliationChanges: changed('affiliationStatus'),
      categoryChanges: changed('category'),
      paymentChanges: changed('payment'),
      countryChanges: changed('countriesVisible') + changed('additionalCountryCount'),
    },
  };
}

export function mergeOffer(existing, offer, {collectionId, capturedAt, movement, positionDelta = null}) {
  const merged = {
    ...(existing || {}),
    ...offer,
    firstSeenAt: existing?.firstSeenAt || capturedAt,
    lastSeenAt: capturedAt,
    presentInLatestCollection: true,
    latestCollectionId: collectionId,
    latestSourceOrder: offer.sourceOrder,
    latestMovement: movement || 'new',
    positionDelta,
  };
  if (existing) {
    const preservedFields = {
      productName: ['productName', 'rawOfferTitle', 'productKey'],
      countries: ['countriesRaw', 'countriesVisible', 'additionalCountryCount'],
      affiliation: ['affiliationStatus', 'affiliationRaw'],
      category: ['category'],
      payment: ['payment'],
      createdAt: ['createdRaw', 'createdAt'],
      ctc: ['ctc'],
      previewActions: ['previewActions'],
    };
    for (const [availability, fields] of Object.entries(preservedFields)) {
      if (offer.availableFields?.[availability] !== false) continue;
      for (const field of fields) merged[field] = existing[field];
    }
  }
  if (existing?.manualCountries) merged.manualCountries = [...existing.manualCountries];
  return merged;
}

export function markExited(existing, {collectionId, capturedAt}) {
  return {...existing, presentInLatestCollection: false, latestCollectionId: collectionId, latestMovement: 'exited', lastMovementAt: capturedAt};
}

export function appendDecision(current, status, notes, capturedAt = new Date().toISOString()) {
  const history = [...(current?.history || []), {status, notes, capturedAt}];
  return {offerKey: current?.offerKey, offerId: current?.offerId, currentStatus: status, notes, updatedAt: capturedAt, history};
}

export function movementLabel(value, delta) {
  if (value === 'new') return 'Nova';
  if (value === 'returned') return 'Retornou';
  if (value === 'exited') return 'Saiu';
  if (value === 'up') return '↑ ' + Math.abs(delta || 0);
  if (value === 'down') return '↓ ' + Math.abs(delta || 0);
  return value ? '= 0' : '—';
}

export function affiliationLabel(status) {
  return status === 'approved' ? 'Aprovado' : status === 'request' ? 'Aplicar' : '—';
}

export function offerCountryCodes(offer = {}) {
  return [...new Set([...(offer.countriesVisible || []), ...(offer.manualCountries || [])]
    .map(value => String(value || '').trim().toUpperCase()).filter(value => /^[A-Z]{2}$/.test(value)))];
}

export function filterOffers(offers = [], filters = {}, decisions = new Map()) {
  const query = normalize(filters.query || ''), id = String(filters.id || '').trim().toLowerCase();
  const minimum = filters.paymentMin === '' || filters.paymentMin == null ? null : Number(filters.paymentMin);
  return offers.filter(item => {
    if (filters.presence === 'present' && item.presentInLatestCollection === false) return false;
    if (filters.presence === 'absent' && item.presentInLatestCollection !== false) return false;
    if (filters.visibility === 'visible' && decisions.get(item.offerKey)?.currentStatus === 'Ocultar') return false;
    if (filters.visibility === 'hidden' && decisions.get(item.offerKey)?.currentStatus !== 'Ocultar') return false;
    if (id && !String(item.offerId).toLowerCase().includes(id)) return false;
    if (query && !normalize([item.productName, item.rawOfferTitle, item.category, item.affiliationRaw, item.countriesVisible?.join(' '), item.offerId].join(' ')).includes(query)) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.affiliation && item.affiliationStatus !== filters.affiliation) return false;
    const amount = item.payment?.amount;
    if (minimum !== null && (amount === null || amount < minimum)) return false;
    if (filters.decision && (decisions.get(item.offerKey)?.currentStatus || 'Não definido') !== filters.decision) return false;
    if (filters.movement && item.latestMovement !== filters.movement) return false;
    return true;
  });
}

export function sortOffers(offers = [], key = 'sourceOrder', direction = 'asc', extra = {}) {
  const values = {
    id: item => Number(item.offerId) || 0,
    product: item => item.productName || '',
    category: item => item.category || '',
    affiliation: item => item.affiliationStatus || '',
    countries: item => offerCountryCodes(item).join(','),
    payment: item => item.payment?.amount ?? -Infinity,
    created: item => item.createdAt || '',
    trends: item => extra.trendsRank?.(item) ?? 0,
    images: item => extra.imagesRank?.(item) ?? 0,
    glimpse: item => extra.glimpseRank?.(item) ?? 0,
    signal: item => extra.signalRank?.(item) ?? 0,
    movement: item => ({new: 6, returned: 5, up: 4, same: 3, down: 2, exited: 1}[item.latestMovement] || 0),
    decision: item => extra.decisions?.get(item.offerKey)?.currentStatus || '',
    lastSeen: item => item.lastSeenAt || '',
    sourceOrder: item => item.latestSourceOrder ?? item.sourceOrder ?? 999999,
  };
  const get = values[key] || values.sourceOrder;
  const sign = direction === 'desc' ? -1 : 1;
  return [...offers].sort((a, b) => {
    const left = get(a), right = get(b);
    const result = typeof left === 'number' && typeof right === 'number'
      ? left - right : String(left).localeCompare(String(right), 'pt-BR', {numeric: true});
    return sign * result || String(a.productName || '').localeCompare(String(b.productName || ''), 'pt-BR');
  });
}
