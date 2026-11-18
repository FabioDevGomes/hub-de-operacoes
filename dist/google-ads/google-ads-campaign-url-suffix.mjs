export const GOOGLE_ADS_CAMPAIGN_ID_URL_PARAMETER = 'utm_campaign={campaignid}';

const FINAL_URL_SUFFIX_MAX_LENGTH = 1024;

export function ensureGoogleAdsCampaignIdUrlParameter(value) {
  const suffix = String(value ?? '').trim();
  if (suffix.startsWith('?')) {
    throw new Error('Informe o sufixo sem o ? inicial. O Hub inclui utm_campaign={campaignid} automaticamente.');
  }

  const parameters = suffix ? suffix.split('&') : [];
  const campaignParameters = parameters.filter(parameter => {
    const separator = parameter.indexOf('=');
    const name = separator < 0 ? parameter : parameter.slice(0, separator);
    return name.trim().toLowerCase() === 'utm_campaign';
  });

  if (campaignParameters.length > 1) {
    throw new Error('Use somente um parâmetro utm_campaign no sufixo da URL final.');
  }

  let normalized = suffix;
  if (campaignParameters.length === 1) {
    const parameter = campaignParameters[0];
    const separator = parameter.indexOf('=');
    const name = separator < 0 ? parameter : parameter.slice(0, separator);
    const valuePart = separator < 0 ? '' : parameter.slice(separator + 1);
    if (name.trim() !== 'utm_campaign' || valuePart !== '{campaignid}') {
      throw new Error('O parâmetro precisa ser exatamente utm_campaign={campaignid} para identificar a campanha.');
    }
  } else {
    const delimiter = suffix && !suffix.endsWith('&') ? '&' : '';
    normalized = suffix + delimiter + GOOGLE_ADS_CAMPAIGN_ID_URL_PARAMETER;
  }

  if (normalized.length > FINAL_URL_SUFFIX_MAX_LENGTH) {
    throw new Error('O sufixo da URL final excede 1.024 caracteres após incluir o ID dinâmico da campanha.');
  }
  return normalized;
}
