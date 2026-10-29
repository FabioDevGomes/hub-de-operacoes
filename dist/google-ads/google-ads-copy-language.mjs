const LANGUAGE_SIGNALS = [
  {
    code: 'en', name: 'English',
    strong: ['your', 'you', 'free', 'save', 'shop', 'buy', 'order', 'shipping', 'delivery', 'discover', 'learn', 'get', 'now', 'offer', 'sale', 'with', 'from', 'best', 'new', 'our'],
    common: ['the', 'and', 'for', 'this', 'that', 'are', 'is', 'to', 'of', 'in', 'on', 'at', 'all'],
  },
  {
    code: 'de', name: 'Deutsch',
    strong: ['ihre', 'ihr', 'jetzt', 'kostenlos', 'sparen', 'kaufen', 'bestellen', 'angebot', 'versand', 'entdecken', 'neu', 'rabatt', 'mit', 'für', 'exklusiv'],
    common: ['der', 'die', 'das', 'und', 'ein', 'eine', 'einen', 'nicht', 'auf', 'von', 'zu', 'ist', 'im'],
  },
  {
    code: 'fr', name: 'Français',
    strong: ['votre', 'vos', 'achetez', 'acheter', 'gratuit', 'gratuite', 'économisez', 'offre', 'livraison', 'découvrez', 'maintenant', 'nouveau', 'nouvelle', 'avec', 'profitez'],
    common: ['le', 'la', 'les', 'et', 'pour', 'des', 'une', 'sur', 'dans', 'est', 'vous', 'plus'],
  },
  {
    code: 'es', name: 'Español',
    strong: ['tu', 'tus', 'compra', 'comprar', 'gratis', 'ahorra', 'ahorre', 'oferta', 'envío', 'descubre', 'ahora', 'nuevo', 'nueva', 'descuento', 'aprovecha'],
    common: ['el', 'la', 'los', 'las', 'y', 'para', 'con', 'una', 'por', 'en', 'es', 'más'],
  },
  {
    code: 'it', name: 'Italiano',
    strong: ['tuo', 'tua', 'acquista', 'compra', 'gratis', 'risparmia', 'offerta', 'spedizione', 'scopri', 'ora', 'nuovo', 'nuova', 'sconto', 'approfitta', 'con'],
    common: ['il', 'lo', 'gli', 'le', 'e', 'per', 'una', 'non', 'in', 'da', 'è', 'più'],
  },
  {
    code: 'nl', name: 'Nederlands',
    strong: ['jouw', 'uw', 'koop', 'gratis', 'bespaar', 'aanbieding', 'verzending', 'ontdek', 'nu', 'nieuw', 'korting', 'bestel', 'met', 'voordeel'],
    common: ['de', 'het', 'een', 'en', 'voor', 'niet', 'van', 'op', 'is', 'in', 'je', 'meer'],
  },
  {
    code: 'pt', name: 'Português',
    strong: ['você', 'vocês', 'seu', 'sua', 'seus', 'suas', 'compre', 'comprar', 'grátis', 'economize', 'oferta', 'frete', 'entrega', 'desconto', 'aproveite', 'descubra', 'agora', 'promoção', 'garantia', 'produto'],
    common: ['não', 'para', 'com', 'mais', 'uma', 'por', 'sem', 'novo', 'nova', 'melhor', 'todos', 'todas'],
  },
];

function tokenize(text) {
  return String(text ?? '').toLocaleLowerCase().match(/\p{L}+/gu) || [];
}

/**
 * Detecta idiomas comuns em copy de anúncios sem enviar o texto a um serviço.
 * Retorna null quando a amostra é curta, ambígua ou não pertence aos idiomas cobertos.
 */
export function detectGoogleAdsCopyLanguage(texts) {
  const tokens = (Array.isArray(texts) ? texts : [texts]).flatMap(tokenize);
  if (tokens.length < 5) return null;

  const counts = new Map();
  for (const token of tokens) counts.set(token, Math.min(2, (counts.get(token) || 0) + 1));

  const ranked = LANGUAGE_SIGNALS.map(language => {
    let score = 0;
    let matches = 0;
    for (const word of language.strong) {
      const count = counts.get(word) || 0;
      if (count) { score += count * 2; matches += count; }
    }
    for (const word of language.common) {
      const count = counts.get(word) || 0;
      if (count) { score += count; matches += count; }
    }
    return { ...language, score, matches };
  }).sort((a, b) => b.score - a.score);

  const [best, runnerUp] = ranked;
  const combinedScore = ranked.reduce((sum, language) => sum + language.score, 0);
  if (best.score < 4 || best.matches < 2 || best.score - runnerUp.score < 2
      || best.score / combinedScore < 0.58) return null;

  return { languageCode: best.code, languageName: best.name };
}
