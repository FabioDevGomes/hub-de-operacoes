const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

function isEligibleProductName(value) {
  const words = value.split(' ').filter(Boolean);
  return words.length === 1 ? value.length >= 6 : value.length >= 8 && words.length >= 2;
}

function checkoutProductNameFocus(value) {
  const fullName = normalize(value);
  const firstNamePart = normalize(String(value || '').split(/\s+[-–—]\s+/)[0]);
  return isEligibleProductName(firstNamePart) ? firstNamePart : fullName;
}

// Comparação apenas: nunca reescreve título, identidade ou proveniência da captura.
// Grupos desconhecidos (variante, fórmula, dose etc.) continuam fazendo parte do nome.
function withoutKnownPromotionalGroups(value) {
  return String(value || '').replace(/\([^()]*\)|\[[^\[\]]*\]/g, group => {
    const text = group.slice(1,-1).trim();
    const guarantee = /^(?:\d{1,3}\s*%\s+)?money[\s-]+back[\s-]+guarantee[!.]*$/i.test(text);
    const newOffer = /^(?:killer\s+)?(?:brand[\s-]+)?new(?:\s+[a-z]+){0,4}\s+offer[!.]*$/i.test(text);
    return guarantee || newOffer ? ' ' : group;
  }).replace(/\s+/g,' ').trim();
}

function promotionalComparisonName(value) {
  return normalize(withoutKnownPromotionalGroups(value).split(/\s+[-–—]\s+/)[0])
    .replace(/^(?:new|hot offer|top offer)\s+/, '');
}

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
  const focusedName = checkoutProductNameFocus(productName);
  const promotionalName = promotionalComparisonName(productName);
  const words = focusedName.split(' ').filter(Boolean);
  if (!isEligibleProductName(focusedName) || !Array.isArray(offers)) return {status:'none', matches:[]};
  const matches = new Map();
  for (const offer of offers) {
    if (!offer || typeof offer.offerKey !== 'string' || typeof offer.offerName !== 'string') continue;
    const title = normalize(offer.offerName);
    const titleWithoutMarketplaceLabel = title.replace(/^(?:new|hot offer|top offer)\s+/, '');
    const leadingName = normalize(offer.offerName.split(/\s+[-–—]\s+/)[0]).replace(/^(?:new|hot offer|top offer)\s+/, '');
    const fullNameMatch = words.length >= 2 && query.length >= 8 && ` ${title} `.includes(` ${query} `);
    // Uma palavra exige o segmento inicial completo, nunca um prefixo ou ocorrência no slogan.
    const productNameMatch = words.length === 1 ? leadingName === focusedName
      : title === focusedName || title.startsWith(`${focusedName} `)
      || titleWithoutMarketplaceLabel === focusedName
      || titleWithoutMarketplaceLabel.startsWith(`${focusedName} `);
    // O fallback novo exige igualdade do segmento inicial inteiro, não um prefixo.
    const promotionalNameMatch = isEligibleProductName(promotionalName)
      && (withoutKnownPromotionalGroups(productName) !== String(productName || '').trim()
        || withoutKnownPromotionalGroups(offer.offerName) !== offer.offerName.trim())
      && promotionalComparisonName(offer.offerName) === promotionalName;
    if (fullNameMatch || productNameMatch || promotionalNameMatch) matches.set(offer.offerKey, offer);
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
