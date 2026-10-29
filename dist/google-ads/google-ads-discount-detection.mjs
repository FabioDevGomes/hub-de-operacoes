const DISCOUNT_CUE = /(?<!\p{L})(?:off|discount(?:s|ed)?|save(?:s|d|ing)?|savings?|sale|offer|desconto(?:s)?|economize|economia|descuento(?:s)?|ahorr(?:a|e|o|an|en)|rebaja(?:s)?|reduction|réduction|remise|rabais?|économisez|rabatt|sparen|sconto|sconti|risparmia|risparmio|korting|bespaar|oferta|offre)(?!\p{L})/iu;

/** Identifica percentuais que aparecem em contexto explícito de desconto na copy. */
export function detectGoogleAdsCopyDiscount(entries) {
  const items = Array.isArray(entries) ? entries : [entries];
  const matches = [];
  const percentPattern = /(?<![\p{L}\d.,])(\d{1,3})(?![\d.,])\s*%/gu;

  for (const [index, item] of items.entries()) {
    const text = item && typeof item === 'object' ? String(item.text ?? '') : String(item ?? '');
    const label = item && typeof item === 'object' && item.label ? String(item.label) : 'Texto ' + (index + 1);
    percentPattern.lastIndex = 0;
    let match;
    while ((match = percentPattern.exec(text))) {
      const value = Number(match[1]);
      if (value < 1 || value > 100) continue;
      const context = text.slice(Math.max(0, match.index - 24), Math.min(text.length, percentPattern.lastIndex + 24));
      if (!DISCOUNT_CUE.test(context)) continue;
      matches.push({ value: String(value), label });
    }
  }

  const values = [...new Set(matches.map(match => match.value))].sort((left, right) => Number(left) - Number(right));
  if (!values.length) return { status: 'none', value: '', values: [], matches: [] };
  if (values.length > 1) return { status: 'ambiguous', value: '', values, matches };
  return { status: 'found', value: values[0], values, matches };
}
