const FIELD_NAMES = ['Offer', 'Affiliate ID', 'Page', 'First Seen', 'Last Seen', 'Days running'];

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function cleanLines(raw = '') {
  return decodeEntities(raw).replace(/\\_/g, '_').replace(/\r/g, '').split('\n').map(line => line.trim());
}

function isRangeStart(line = '') {
  return /^(?:\d{1,2}\s+[A-Za-z]{3}(?:\s+\d{4})?|\d{1,2})\s*[-–]\s*\d{1,2}\s+[A-Za-z]{3}(?:\s+\d{4})?$/.test(line);
}

function fieldValue(lines, name) {
  const line = lines.find(value => value === name || value.startsWith(`${name}\t`));
  if (!line) return '';
  if (line.includes('\t')) return line.slice(line.indexOf('\t') + 1).trim();
  const index = lines.indexOf(line);
  return lines[index + 1] && !FIELD_NAMES.includes(lines[index + 1]) ? lines[index + 1].trim() : '';
}

export function parseOffer(value = '') {
  const match = String(value).trim().match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return { name: (match?.[1] || value).trim(), network: (match?.[2] || '').trim() };
}

export function normalizeKey(value = '') {
  return String(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function parseLandingPages(raw = '') {
  const lines = cleanLines(raw);
  const starts = lines.map((line, index) => isRangeStart(line) ? index : -1).filter(index => index >= 0);
  const items = [];
  for (let cursor = 0; cursor < starts.length; cursor++) {
    const block = lines.slice(starts[cursor], starts[cursor + 1] ?? lines.length).filter(Boolean);
    const urlIndex = block.findIndex(line => /^https?:\/\//i.test(line));
    if (urlIndex < 0) continue;
    const url = block[urlIndex];
    const offerRaw = fieldValue(block, 'Offer');
    const offer = parseOffer(offerRaw);
    items.push({
      id: normalizeKey(url),
      rangeLabel: block[0],
      title: block.slice(1, urlIndex).join(' ').trim(),
      url,
      offerRaw,
      offerName: offer.name,
      network: offer.network,
      affiliateId: fieldValue(block, 'Affiliate ID'),
      pageName: fieldValue(block, 'Page'),
      firstSeen: fieldValue(block, 'First Seen'),
      lastSeen: fieldValue(block, 'Last Seen'),
      daysRunning: Number(fieldValue(block, 'Days running').replace(/\D/g, '')) || 0
    });
  }
  const reportedMatch = decodeEntities(raw).match(/Showing\s+\d+\s+to\s+(\d+)\s+of/i);
  const totalMatch = decodeEntities(raw).match(/Total Results:\s*([\d,.]+)/i);
  const unique = new Map(items.map(item => [item.id, item]));
  const parsedItems = [...unique.values()];
  return {
    items: parsedItems,
    parsedCount: parsedItems.length,
    duplicateCount: items.length - parsedItems.length,
    reportedCount: reportedMatch ? Number(reportedMatch[1]) : null,
    totalResults: totalMatch ? Number(totalMatch[1].replace(/\D/g, '')) : null,
    limitations: [
      'A colagem contém apenas os blocos carregados no navegador.',
      'Dias em circulação e última aparição são sinais de persistência, não comprovação de vendas.'
    ]
  };
}

export function upsertObservation(history = [], observation) {
  const values = [...history];
  const index = values.findIndex(item => item.capturedDate === observation.capturedDate);
  if (index >= 0) values[index] = observation;
  else values.push(observation);
  return values.sort((a, b) => String(a.capturedDate).localeCompare(String(b.capturedDate)));
}

export function summarizeProduct(items = [], productId) {
  const linked = items.filter(item => item.productId === productId);
  return {
    count: linked.length,
    maxDays: linked.reduce((maximum, item) => Math.max(maximum, item.daysRunning || 0), 0),
    affiliates: new Set(linked.map(item => item.affiliateId).filter(Boolean)).size
  };
}
