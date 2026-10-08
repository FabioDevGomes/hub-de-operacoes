export function isClickBankDtcCheckout(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'orders.clickbank.net';
  } catch { return false; }
}

// Executado apenas depois do clique explícito no popup e restrito ao checkout.
// Lê o nome do produto e países comuns ou uma lista simples de até 10 países; não percorre os campos
// de pagamento nem coleta dados do cliente.
export function collectClickBankDtcCommonCountries() {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (location.protocol !== 'https:' || location.hostname !== 'orders.clickbank.net') {
    return { ok:false, message:'Abra o checkout da DTC em orders.clickbank.net na aba ativa. Nada foi lido.' };
  }

  const countrySelectors = [
    'select[name="billing.countryCode"]', 'select[id="billing.countryCode"]',
    'select[name="shipping.countryCode"]', 'select[id="shipping.countryCode"]'
  ];
  const countrySelects = [...new Set(countrySelectors.map(selector => document.querySelector(selector)).filter(Boolean))];
  if (!countrySelects.length) return { ok:false, message:'Não encontrei o seletor de países deste checkout. Nada foi salvo.' };
  const countryLists = countrySelects.map(select => ({select, groups:[...select.querySelectorAll('optgroup')]}));
  const commonGroup = countryLists.flatMap(({groups}) => groups).find(group =>
    ['paises comuns', 'common countries'].includes(normalize(group.getAttribute('label'))));
  const countryCodes = container => [...new Set([...container.querySelectorAll('option')]
    .filter(option => !option.disabled)
    .map(option => String(option.value || '').trim().toUpperCase())
    .filter(code => /^[A-Z]{2}$/.test(code)))];
  const countries = commonGroup ? countryCodes(commonGroup) : countryLists
    .filter(({groups}) => groups.length === 0)
    .map(({select}) => countryCodes(select))
    .find(codes => codes.length >= 1 && codes.length <= 10);
  if (!countries?.length) return { ok:false, message:commonGroup
    ? 'O grupo “Países Comuns” não contém códigos de país válidos. Nada foi salvo.'
    : 'Não encontrei “Países Comuns” nem uma lista sem grupos com até 10 países válidos. Nada foi salvo.' };

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"]')];
  const summaryIndex = headings.findIndex(heading =>
    ['cart summary', 'resumo do carrinho', 'resumo do pedido'].includes(normalize(heading.textContent)));
  if (summaryIndex < 0) return { ok:false, message:'Não consegui localizar o resumo do pedido para identificar a oferta. Nada foi salvo.' };
  const productHeading = headings.slice(summaryIndex + 1).find(heading => {
    const text = String(heading.textContent || '').trim();
    return text.length >= 5 && text.length <= 200 && !['cart summary', 'resumo do carrinho', 'resumo do pedido'].includes(normalize(text));
  });
  const productName = String(productHeading?.textContent || '').replace(/\s+/g, ' ').trim();
  if (!productName) return { ok:false, message:'Não consegui ler o nome do produto no resumo do checkout. Nada foi salvo.' };

  return { ok:true, productName, countries, capturedAt:new Date().toISOString() };
}
