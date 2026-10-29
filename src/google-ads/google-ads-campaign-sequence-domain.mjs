import { parseGoogleAdsCampaignName } from './google-ads-campaign-name-parser.mjs?v=2';

export function normalizeCampaignSequenceProduct(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function latestGoogleAdsCampaignIteration({ product, campaignNames = [], reservations = [] } = {}) {
  const productKey = normalizeCampaignSequenceProduct(product);
  if (!productKey) return 0;
  let latest = 0;
  for (const name of Array.isArray(campaignNames) ? campaignNames : []) {
    const parsed = parseGoogleAdsCampaignName(name);
    if (parsed.ok && normalizeCampaignSequenceProduct(parsed.product) === productKey) {
      latest = Math.max(latest, Number(parsed.iteration) || 0);
    }
  }
  for (const reservation of Array.isArray(reservations) ? reservations : []) {
    if (normalizeCampaignSequenceProduct(reservation?.product) !== productKey) continue;
    const iteration = Number(reservation?.iteration);
    if (Number.isInteger(iteration) && iteration > 0 && iteration <= 999) latest = Math.max(latest, iteration);
  }
  return latest;
}

export function makeSequencedGoogleAdsCampaignName(baseName, iteration, percent) {
  const index = Number(iteration);
  const percentage = Number(percent);
  const match = String(baseName).match(/^(\d{1,2}\/\d{1,2}\s*-\s*.+?)\s+\d{1,3}(\s+\([^)]+\)\s+)\d{1,3}(?:[.,]\d+)?%(\s*-\s*(?:US\$|U\$|USD|R\$|BRL|C\$|CAD|A\$|AUD|€|EUR|£|GBP)\s*\d+(?:[.,]\d+)?)$/i);
  if (!match) throw new Error('O nome da campanha não está mais no padrão calculado. Recalcule as informações antes de criar o lote.');
  if (!Number.isInteger(index) || index < 1 || index > 999) throw new Error('A numeração deste produto ultrapassou 999 campanhas. Confira o histórico antes de continuar.');
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) throw new Error('O percentual de CPA da campanha não é válido.');
  const percentText = Number.isInteger(percentage) ? String(percentage) : String(percentage);
  const name = match[1] + ' ' + String(index).padStart(2, '0') + match[2] + percentText + '%' + match[3];
  if (Array.from(name).length > 128) throw new Error('O nome de uma campanha do lote excede o limite de 128 caracteres.');
  return name;
}
