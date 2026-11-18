const GOOGLE_ADS_COUNTRY_CODE_ALIASES = Object.freeze({
  UK: 'GB',
});

export function normalizeGoogleAdsCountryCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return GOOGLE_ADS_COUNTRY_CODE_ALIASES[code] || code;
}

export function normalizeGoogleAdsCountryCodes(values) {
  return Array.isArray(values) ? values.map(normalizeGoogleAdsCountryCode) : [];
}

export function normalizeGoogleAdsCountryCodeInput(value) {
  const sourceCodes = String(value ?? '').trim().toUpperCase().split(/[\s,;]+/).filter(Boolean);
  const countryCodes = sourceCodes.map(normalizeGoogleAdsCountryCode);
  const aliases = [...new Set(sourceCodes
    .filter((code, index) => code !== countryCodes[index]))]
    .map(from => ({ from, to: normalizeGoogleAdsCountryCode(from) }));
  return { sourceCodes, countryCodes, aliases };
}
