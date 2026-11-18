const COUNTRY_PRESENTATION_DEFAULTS = Object.freeze({
  US: Object.freeze({ htmlLanguage: 'en-US', currency: 'USD' }),
  CA: Object.freeze({ htmlLanguage: 'en-CA', currency: 'CAD' }),
  AU: Object.freeze({ htmlLanguage: 'en-AU', currency: 'AUD' }),
  GB: Object.freeze({ htmlLanguage: 'en-GB', currency: 'GBP' }),
  NZ: Object.freeze({ htmlLanguage: 'en-NZ', currency: 'NZD' }),
  IE: Object.freeze({ htmlLanguage: 'en-IE', currency: 'EUR' }),
  BR: Object.freeze({ htmlLanguage: 'pt-BR', currency: 'BRL' }),
  PT: Object.freeze({ htmlLanguage: 'pt-PT', currency: 'EUR' }),
  MX: Object.freeze({ htmlLanguage: 'es-MX', currency: 'MXN' }),
  AR: Object.freeze({ htmlLanguage: 'es-AR', currency: 'ARS' }),
  ES: Object.freeze({ htmlLanguage: 'es-ES', currency: 'EUR' }),
  FR: Object.freeze({ htmlLanguage: 'fr-FR', currency: 'EUR' }),
  DE: Object.freeze({ htmlLanguage: 'de-DE', currency: 'EUR' }),
  AT: Object.freeze({ htmlLanguage: 'de-AT', currency: 'EUR' }),
  CH: Object.freeze({ htmlLanguage: 'de-CH', currency: 'CHF' }),
  IT: Object.freeze({ htmlLanguage: 'it-IT', currency: 'EUR' }),
  SE: Object.freeze({ htmlLanguage: 'sv-SE', currency: 'SEK' })
});

export function countryPresentationDefaults(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  return COUNTRY_PRESENTATION_DEFAULTS[code] || null;
}

