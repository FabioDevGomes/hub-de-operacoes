const CURRENCIES = Object.freeze({
  'U$': 'USD', 'US$': 'USD', USD: 'USD',
  'R$': 'BRL', BRL: 'BRL',
  'C$': 'CAD', CAD: 'CAD',
  'A$': 'AUD', AUD: 'AUD',
  '€': 'EUR', EUR: 'EUR',
  '£': 'GBP', GBP: 'GBP',
});

const PLATFORM_LABELS = Object.freeze({ CB: 'ClickBank', GM: 'Guru Media' });
const MODEL_LABELS = Object.freeze({ NBB: 'No Brainer Bidding', BB: 'Brand Bidding' });

function normalizeDecimal(value) {
  return String(value).trim().replace(',', '.');
}

export function parseGoogleAdsCampaignName(value) {
  const name = String(value ?? '').trim();
  const pattern = /^(\d{1,2}\/\d{1,2})\s*-\s*(.+?)\s+(\d{1,3})\s+\(([^)]+)\)\s+(\d{1,3}(?:[.,]\d+)?)%\s*-\s*(US\$|U\$|USD|R\$|BRL|C\$|CAD|A\$|AUD|€|EUR|£|GBP)\s*(\d+(?:[.,]\d+)?)$/i;
  const match = name.match(pattern);
  if (!match) return { ok: false, error: 'Formato não reconhecido. Exemplo: 27/10 - Lymph-Tonic 01 (CB-NBB-US/CA) 50% - U$ 177.' };

  const [, date, product, iteration, rawTags, rawPercent, rawCurrency, rawCommission] = match;
  const [day, month] = date.split('/').map(Number);
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return { ok: false, error: 'A data no nome precisa estar no formato dd/mm.' };
  }

  const tags = rawTags.split('-').map(item => item.trim()).filter(Boolean);
  if (tags.length < 3) return { ok: false, error: 'Inclua plataforma, modelo e pelo menos um GEO entre parênteses.' };
  const platformCode = tags[0].toUpperCase();
  const modelCode = tags[1].toUpperCase();
  const geoTags = tags.slice(2);
  const countries = [];
  const extraTags = [];
  for (const tag of geoTags) {
    const pieces = tag.split(/[\/,]/).map(item => item.trim().toUpperCase()).filter(Boolean);
    for (const piece of pieces) {
      if (/^[A-Z]{2}$/.test(piece)) countries.push(piece);
      else extraTags.push(piece);
    }
  }
  if (!countries.length || countries.length > 20 || new Set(countries).size !== countries.length) {
    return { ok: false, error: 'Os GEOs precisam ser códigos ISO de país com duas letras, sem repetição, por exemplo US/CA.' };
  }

  const commissionCurrency = CURRENCIES[rawCurrency.toUpperCase()] || CURRENCIES[rawCurrency];
  const commissionAmount = Number(normalizeDecimal(rawCommission));
  const percent = Number(normalizeDecimal(rawPercent));
  if (!commissionCurrency || !Number.isFinite(commissionAmount) || commissionAmount <= 0
      || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return { ok: false, error: 'Confira a moeda, a comissão e a porcentagem entre 1% e 100%.' };
  }
  const desiredCpa = (Math.round((commissionAmount * percent / 100 + Number.EPSILON) * 100) / 100).toFixed(2);
  const platform = PLATFORM_LABELS[platformCode] || platformCode;
  const biddingModel = MODEL_LABELS[modelCode] || modelCode;
  const destination = extraTags.find(tag => tag === 'SCA') || '';

  return {
    ok: true,
    campaignName: name,
    sourceDate: date,
    product: product.trim(),
    iteration,
    platformCode,
    platform,
    biddingModelCode: modelCode,
    biddingModel,
    countries,
    extraTags,
    destination,
    targetCpaPercent: String(percent),
    commissionAmount: normalizeDecimal(rawCommission),
    commissionCurrency,
    desiredCpa,
  };
}
