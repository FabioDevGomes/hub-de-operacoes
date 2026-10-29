import { parseGoogleAdsCampaignName } from './google-ads-campaign-name-parser.mjs?v=2';

export const GOOGLE_ADS_DUPLICATION_CPA_LEVELS = Object.freeze([30, 40, 50, 60, 70, 80]);
export const GOOGLE_ADS_DUPLICATION_B_TEST_NOTICE = 'Evolução futura: permitir sufixo B (por exemplo, 03 e 03B) e mapear a variação de 50% do teste B por campanha.';

const CAMPAIGN_ID = /^[1-9]\d{0,19}$/;
const CUSTOMER_ID = /^\d{10}$/;

function normalizeHttpsUrl(value) {
  const text = String(value ?? '').trim();
  let parsed;
  try { parsed = new URL(text); } catch { throw new Error('Informe uma URL HTTPS válida para a Pre-Sell.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw new Error('A Pre-Sell precisa usar HTTPS e não pode conter credenciais nem fragmento.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.toString().replace(/\/$/, '');
}

function campaignIdentity(parsed) {
  return [parsed.sourceDate, parsed.product.toLocaleLowerCase('pt-BR'), parsed.platformCode,
    parsed.biddingModelCode, parsed.commissionCurrency, parsed.commissionAmount].join('|');
}

function campaignParts(name) {
  const text = String(name ?? '').trim();
  const parsed = parseGoogleAdsCampaignName(text);
  if (!parsed.ok) return null;
  const match = text.match(/^(\d{1,2}\/\d{1,2})\s*-\s*(.+?)\s+(\d{1,3})\s+\(([^)]+)\)\s+(\d{1,3}(?:[.,]\d+)?)%\s*-\s*(US\$|U\$|USD|R\$|BRL|C\$|CAD|A\$|AUD|€|EUR|£|GBP)\s*(\d+(?:[.,]\d+)?)$/i);
  if (!match) return null;
  return { parsed, match };
}

function formatIteration(number, width) {
  return String(number).padStart(Math.max(2, width), '0');
}

function makeCampaignName(source, iteration, percent) {
  const [, date, product, oldIteration, tags, , currency, commission] = source.match;
  const width = oldIteration.length;
  const cleanPercent = Number(percent).toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false });
  return `${date} - ${product} ${formatIteration(iteration, width)} (${tags}) ${cleanPercent}% - ${currency} ${commission}`;
}

export function buildGoogleAdsCampaignDuplicationPlan({ sourceCampaign, targets, cpaPercents, existingCampaignNames = [] } = {}) {
  const campaignId = String(sourceCampaign?.campaignId ?? '');
  const sourceName = String(sourceCampaign?.campaignName ?? '').trim();
  if (!CAMPAIGN_ID.test(campaignId) || !sourceName) throw new Error('Selecione uma campanha Search de origem.');
  const source = campaignParts(sourceName);
  if (!source) throw new Error('A campanha precisa seguir o padrão de nomenclatura com produto, número, comissão e percentual para calcular os níveis de CPA.');
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 20) throw new Error('Selecione de 1 a 20 contas de destino.');
  if (!Array.isArray(cpaPercents) || cpaPercents.length < 1 || cpaPercents.some(value => !GOOGLE_ADS_DUPLICATION_CPA_LEVELS.includes(Number(value)))) {
    throw new Error('Selecione ao menos uma faixa de CPA entre 30% e 80%, em passos de 10%.');
  }
  const percents = [...new Set(cpaPercents.map(Number))].sort((a, b) => a - b);
  const targetIds = new Set();
  const normalizedTargets = targets.map((target, index) => {
    const managerCustomerId = target?.managerCustomerId == null ? null : String(target.managerCustomerId);
    const customerId = String(target?.customerId ?? '');
    const key = `${managerCustomerId ?? 'direct'}:${customerId}`;
    if (!CUSTOMER_ID.test(customerId) || (managerCustomerId !== null && !CUSTOMER_ID.test(managerCustomerId)) || targetIds.has(key)) {
      throw new Error('A lista de contas de destino contém uma conta inválida ou repetida.');
    }
    targetIds.add(key);
    return {
      managerCustomerId,
      customerId,
      name: String(target?.name ?? `Conta ${customerId}`).trim(),
      currencyCode: String(target?.currencyCode ?? '').toUpperCase(),
      preSellUrl: normalizeHttpsUrl(target?.preSellUrl),
      order: index,
    };
  });

  const identity = campaignIdentity(source.parsed);
  let highestIteration = Number(source.match[3]);
  for (const name of existingCampaignNames) {
    const candidate = campaignParts(name);
    if (!candidate || campaignIdentity(candidate.parsed) !== identity) continue;
    highestIteration = Math.max(highestIteration, Number(candidate.match[3]));
  }
  const entries = [];
  let iteration = highestIteration + 1;
  for (const target of normalizedTargets) {
    if (target.currencyCode && target.currencyCode !== source.parsed.commissionCurrency) {
      throw new Error(`A conta ${target.name} usa ${target.currencyCode}; a comissão do nome usa ${source.parsed.commissionCurrency}. Não há conversão automática.`);
    }
    for (const percent of percents) {
      const desiredCpa = (Math.round((Number(source.parsed.commissionAmount) * percent / 100 + Number.EPSILON) * 100) / 100).toFixed(2);
      entries.push({
        customerId: target.customerId,
        managerCustomerId: target.managerCustomerId,
        accountName: target.name,
        currencyCode: target.currencyCode || source.parsed.commissionCurrency,
        preSellUrl: target.preSellUrl,
        percent,
        desiredCpa,
        iteration: formatIteration(iteration, source.match[3].length),
        campaignName: makeCampaignName(source, iteration, percent),
      });
      iteration += 1;
    }
  }
  return {
    source: { campaignId, campaignName: sourceName, product: source.parsed.product, commissionAmount: source.parsed.commissionAmount, commissionCurrency: source.parsed.commissionCurrency },
    entries,
    firstIteration: formatIteration(highestIteration + 1, source.match[3].length),
    lastIteration: formatIteration(iteration - 1, source.match[3].length),
    bTestNotice: GOOGLE_ADS_DUPLICATION_B_TEST_NOTICE,
  };
}

export function resolveGoogleAdsDuplicateSitelinkUrl(sourceUrl, preSellUrl) {
  const match = String(sourceUrl ?? '').trim().match(/#([1-6])$/);
  if (!match) return { supported: false, sourceUrl: String(sourceUrl ?? ''), reason: 'O sitelink não termina em #1 a #6.' };
  return { supported: true, url: `${normalizeHttpsUrl(preSellUrl)}#${match[1]}`, fragment: `#${match[1]}` };
}

export function isGoogleAdsDuplicationCampaignId(value) {
  return CAMPAIGN_ID.test(String(value ?? ''));
}
