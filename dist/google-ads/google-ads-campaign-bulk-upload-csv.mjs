import { ensureGoogleAdsCampaignIdUrlParameter } from './google-ads-campaign-url-suffix.mjs?v=1';

const CAMPAIGN_UPLOAD_COLUMNS = Object.freeze([
  'Action',
  'Campaign status',
  'EU political ads',
  'Customer ID',
  'Campaign',
  'Campaign type',
  'Networks',
  'Budget',
  'Budget type',
  'Bid strategy type',
  'Target CPA',
  'Target ROAS',
  'Target Impression Share',
  'Max CPC Bid Limit for Target IS',
  'Location Goal for Target IS',
  'Language',
  'Location',
  'Tracking template',
  'Final URL suffix',
]);

const UPLOAD_BIDDING_STRATEGIES = Object.freeze({
  TARGET_CPA: 'Maximize Conversions',
  MAXIMIZE_CONVERSIONS: 'Maximize Conversions',
  TARGET_ROAS: 'Target ROAS',
  MAXIMIZE_CLICKS: 'Maximize clicks',
  MANUAL_CPC: 'Manual CPC',
  TARGET_IMPRESSION_SHARE: 'Target Impression Share',
});

const EU_POLITICAL_ADS_UPLOAD_VALUES = Object.freeze({
  DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING: 'No',
  CONTAINS_EU_POLITICAL_ADVERTISING: 'Yes',
});

const IMPRESSION_SHARE_LOCATIONS = Object.freeze({
  ANYWHERE_ON_PAGE: 'Anywhere on results page',
  TOP_OF_PAGE: 'Top of results page',
  ABSOLUTE_TOP_OF_PAGE: 'Absolute top of results page',
});

function decimal(value, label) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(normalized) || Number(normalized) <= 0) {
    throw new Error(label + ' precisa ser um número positivo para o upload em massa.');
  }
  return normalized;
}

function customerIdForUpload(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits)) throw new Error('Uma conta cliente tem ID inválido para o CSV.');
  return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
}

function countryLabel(code) {
  const normalized = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw new Error('Há um código de país inválido no destino da campanha.');
  if (typeof Intl?.DisplayNames !== 'function') {
    throw new Error('Este navegador não consegue converter códigos para nomes de países exigidos pelo modelo do Google Ads.');
  }
  const label = new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized);
  if (!label || label === normalized) throw new Error('Não reconheci o código de país ' + normalized + ' para o CSV do Google Ads.');
  return label;
}

function csvField(value) {
  const text = String(value ?? '');
  return '"' + text.replace(/"/g, '""') + '"';
}

function campaignUploadRow(entry, { geoTargetingMode = 'COUNTRIES' } = {}) {
  const payload = entry?.payload || {};
  const strategy = String(payload.biddingStrategy || '').trim().toUpperCase();
  const uploadStrategy = UPLOAD_BIDDING_STRATEGIES[strategy];
  if (!uploadStrategy) {
    throw new Error('A estratégia “' + (strategy || 'não selecionada') + '” não está disponível no modelo online de criação de campanhas. Use a criação atual do Hub para essa estratégia.');
  }

  const euPoliticalDeclaration = String(payload.containsEuPoliticalAdvertising
    || 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING').trim().toUpperCase();
  const euPoliticalAds = EU_POLITICAL_ADS_UPLOAD_VALUES[euPoliticalDeclaration];
  if (!euPoliticalAds) throw new Error('A declaração de publicidade política da UE não é válida para o CSV.');

  const accountCurrency = String(entry?.accountCurrency || payload.accountCurrency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(accountCurrency)) throw new Error('A moeda da conta não foi identificada para uma linha do CSV.');
  if (String(payload.dailyBudgetCurrency || '').trim().toUpperCase() !== accountCurrency) {
    throw new Error('O orçamento da campanha não está na moeda da conta destino. Recalcule o lote antes de exportar.');
  }
  if (payload.maxCpcBid && String(payload.maxCpcBidCurrency || '').trim().toUpperCase() !== accountCurrency) {
    throw new Error('O CPC máximo não está na moeda da conta destino. Recalcule o lote antes de exportar.');
  }
  if (['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'].includes(strategy) && payload.targetCpa
      && String(payload.targetCpaCurrency || '').trim().toUpperCase() !== accountCurrency) {
    throw new Error('O CPA desejado não está na moeda da conta destino. Recalcule o lote antes de exportar.');
  }

  const budget = decimal(payload.dailyBudget, 'O orçamento diário');
  const row = {
    'Action': 'Add',
    'Campaign status': 'Paused',
    'EU political ads': euPoliticalAds,
    'Customer ID': customerIdForUpload(payload.customerId),
    'Campaign': String(payload.campaignName ?? '').trim(),
    'Campaign type': 'Search',
    'Networks': [
      'Google search',
      ...(payload.targetSearchNetwork ? ['Search partners'] : []),
      ...(payload.targetContentNetwork ? ['Display Network'] : []),
    ].join('; '),
    'Budget': budget,
    'Budget type': 'Daily',
    'Bid strategy type': uploadStrategy,
    'Target CPA': '',
    'Target ROAS': '',
    'Target Impression Share': '',
    'Max CPC Bid Limit for Target IS': '',
    'Location Goal for Target IS': '',
    'Language': '',
    'Location': '',
    'Tracking template': String(payload.trackingUrlTemplate ?? '').trim(),
    'Final URL suffix': ensureGoogleAdsCampaignIdUrlParameter(payload.finalUrlSuffix),
  };

  if (strategy === 'TARGET_CPA') row['Target CPA'] = decimal(payload.targetCpa, 'O CPA desejado');
  if (strategy === 'MAXIMIZE_CONVERSIONS' && payload.targetCpa) row['Target CPA'] = decimal(payload.targetCpa, 'O CPA desejado');
  if (strategy === 'TARGET_ROAS') {
    const roas = String(payload.targetRoasPercent ?? '').trim().replace(',', '.');
    if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(roas) || Number(roas) <= 0) {
      throw new Error('O ROAS desejado precisa ser positivo e estar expresso em percentual.');
    }
    row['Target ROAS'] = roas + '%';
  }
  if (strategy === 'TARGET_IMPRESSION_SHARE') {
    const percent = String(payload.impressionSharePercent ?? '').trim();
    if (!/^(?:[1-9]|[1-9]\d|100)$/.test(percent)) throw new Error('A parcela de impressões precisa estar entre 1 e 100%.');
    row['Target Impression Share'] = percent + '%';
    row['Max CPC Bid Limit for Target IS'] = decimal(payload.maxCpcBid, 'O limite máximo de CPC');
    row['Location Goal for Target IS'] = IMPRESSION_SHARE_LOCATIONS[payload.impressionShareLocation] || '';
    if (!row['Location Goal for Target IS']) throw new Error('Selecione uma posição válida para a estratégia de parcela de impressões.');
  }
  if (strategy === 'MAXIMIZE_CLICKS' && payload.maxCpcBid) {
    throw new Error('O modelo de campanha online não possui coluna para o limite de CPC de “Maximize clicks”. Use a criação atual do Hub para preservar esse limite.');
  }

  if (!row.Campaign || row.Campaign.length > 128) throw new Error('O nome da campanha está ausente ou excede 128 caracteres.');
  if (!/^\d{10}$/.test(String(payload.managerCustomerId ?? '').replace(/\D/g, ''))) {
    throw new Error('Uma MCC de destino tem ID inválido para o CSV.');
  }

  if (geoTargetingMode === 'WORLD') {
    row.Location = '';
  } else {
    const countries = Array.isArray(payload.geoTargetCountryCodes) ? payload.geoTargetCountryCodes : [];
    if (!countries.length) throw new Error('Informe ao menos um país antes de gerar o CSV.');
    row.Location = countries.map(countryLabel).join(' ; ');
  }
  return row;
}

export function buildGoogleAdsCampaignBulkUploadCsv({ entries, managerCustomerId, geoTargetingMode = 'COUNTRIES' } = {}) {
  const managerDigits = String(managerCustomerId ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(managerDigits)) throw new Error('Selecione uma MCC válida para gerar o CSV.');
  const managerEntries = (Array.isArray(entries) ? entries : []).filter(entry =>
    String(entry?.payload?.managerCustomerId ?? '').replace(/\D/g, '') === managerDigits);
  if (!managerEntries.length) throw new Error('Não há campanhas preparadas para esta MCC.');

  const rows = managerEntries.map(entry => campaignUploadRow(entry, { geoTargetingMode }));
  const lines = [
    CAMPAIGN_UPLOAD_COLUMNS.map(csvField).join(','),
    ...rows.map(row => CAMPAIGN_UPLOAD_COLUMNS.map(column => csvField(row[column])).join(',')),
  ];
  return {
    csvContent: lines.join('\r\n') + '\r\n',
    campaignCount: rows.length,
    accountCount: new Set(managerEntries.map(entry => String(entry.payload.customerId).replace(/\D/g, ''))).size,
    managerCustomerId: managerDigits,
    campaignNames: managerEntries.map(entry => String(entry.payload.campaignName ?? '').trim()),
    accountCurrencies: [...new Set(managerEntries.map(entry => String(entry.accountCurrency || entry.payload.accountCurrency || '').trim().toUpperCase()))],
    geoTargetingMode: geoTargetingMode === 'WORLD' ? 'WORLD' : 'COUNTRIES',
  };
}
