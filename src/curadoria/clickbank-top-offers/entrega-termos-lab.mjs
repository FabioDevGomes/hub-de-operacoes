// A ausência de fonte não autoriza limpar os termos da entrega existente.
export function termosNegativosParaEntrega(source) {
  if (!source || !Array.isArray(source.negativeKeywords)) return {};
  return { negativeKeywords: source.negativeKeywords, negativeKeywordCountries: Array.isArray(source.negativeKeywordCountries) ? source.negativeKeywordCountries : [] };
}
