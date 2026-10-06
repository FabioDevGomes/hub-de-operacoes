const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export function validateDtcCountryCapture(payload) {
  if (payload?.schema !== 'clickbank-dtc-country-capture-v1' || payload.source !== 'clickbank_dtc_checkout'
    || typeof payload.productName !== 'string' || payload.productName.trim().length < 5 || payload.productName.length > 200
    || !Array.isArray(payload.countries) || payload.countries.length < 1 || payload.countries.length > 50
    || !payload.countries.every(code => typeof code === 'string' && /^[A-Z]{2}$/.test(code))
    || typeof payload.capturedAt !== 'string' || !Number.isFinite(Date.parse(payload.capturedAt))) {
    return {ok:false, message:'A lista de países da DTC está inválida ou incompleta. Nenhum dado foi salvo.'};
  }
  return {ok:true, productName:payload.productName.trim(), countries:[...new Set(payload.countries)], capturedAt:payload.capturedAt};
}

export function matchDtcCheckoutOffer(productName, offers) {
  const query = normalize(productName);
  const words = query.split(' ').filter(Boolean);
  if (query.length < 8 || words.length < 2 || !Array.isArray(offers)) return {status:'none', matches:[]};
  const matches = new Map();
  for (const offer of offers) {
    if (!offer || typeof offer.offerKey !== 'string' || typeof offer.offerName !== 'string') continue;
    const title = ` ${normalize(offer.offerName)} `;
    if (title.includes(` ${query} `)) matches.set(offer.offerKey, offer);
  }
  const result = [...matches.values()];
  return {status:result.length === 1 ? 'unique' : result.length ? 'ambiguous' : 'none', matches:result};
}

export function mergeDtcCountries(existing, identity, capture) {
  const previous = Array.isArray(existing?.manualCountries) ? existing.manualCountries : [];
  const countries = [...new Set([...previous.filter(code => /^[A-Z]{2}$/.test(code)), ...capture.countries])];
  if (countries.length > 250) return {ok:false, message:'A lista excede o limite de 250 países; nada foi salvo.'};
  const previousDtc = existing?.dtcCountryCapture;
  const dtcCountries = [...new Set([...(Array.isArray(previousDtc?.countries) ? previousDtc.countries : []), ...capture.countries])];
  const record = {
    ...existing,
    ...identity,
    manualCountries:countries,
    dtcCountryCapture:{
      source:'clickbank-dtc-checkout',
      capturedAt:capture.capturedAt,
      productName:capture.productName,
      countries:dtcCountries,
    },
  };
  return {ok:true, record, addedCount:capture.countries.filter(code => !previous.includes(code)).length, existingCount:previous.length};
}
