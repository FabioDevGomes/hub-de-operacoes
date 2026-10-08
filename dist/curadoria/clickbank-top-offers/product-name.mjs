// Presentation only: never use the inferred name as an offer/storage identity.
const promotional = /(?:\b(?:epc|cpa|vsl|tsl|dtc|rebill|conversions?|converting|converts|commission|affiliate|breakthrough|updated|brand[ -]+new|offers?)\b|\b(?:best|high)[ -]+converting\b|\b(?:diamond|platinum)\s+(?:seller|vendor)\b|\bdoctor[ -]+endorsed\b|[$%]|^\s*(?:the|top|unique|killer|now open|new monster)\b)/i;
const productCategory = /\b(?:sketch|system|formula|supplement|course|program|protocol|solution|kit)\b/i;
const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function productNameFromOfferTitle(title, seller = '') {
  const original = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (!original) return '';
  let name = original.replace(/^(?:(?:new|hot|top|best|featured)(?:\s+[a-z]+){0,3}\s+offer\s*[:|–—-]\s*|(?:new|brand[ -]+new|hot offer|top offer)\s*[:!–—-]\s*)/i, '');
  // Uppercase NEW followed by a title-cased name is a launch marker, not the
  // ordinary word in names such as New Balance or NewEra.
  name = name.replace(/^NEW\s+(?=[A-Z][a-z])/, '');
  name = name.replace(/\([^()]*\)|\[[^\[\]]*\]/g, group => {
    const inside = group.slice(1, -1).trim();
    return promotional.test(inside) || /^(?:new[!\s]*|20\d{2})$/i.test(inside) ? '' : group;
  }).replace(/\s+/g, ' ').trim();

  const parts = name.split(/\s+[-–—]\s*|\s*[|:]\s*|(?<!brand)-(?=\d+(?:\.\d+)?\s*%|(?:new|hot|killer|crazy)\b)/iu).map(part => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    // A creator-labelled offer can put the product after a pipe. Require both
    // the seller prefix and a product-category cue; don't guess from capitals.
    const firstWord = parts[0].split(' ')[0];
    const creatorPrefix = name.includes('|') && parts[0].split(' ').length >= 2
      && fold(firstWord).length >= 3 && fold(seller).startsWith(fold(firstWord))
      && !productCategory.test(parts[0]) && productCategory.test(parts[1]) && !promotional.test(parts[1]);
    if (creatorPrefix) name = parts[1];
    else if (parts.slice(1).some(part => promotional.test(part))) {
      const cutoff = parts.findIndex((part, index) => index > 0 && promotional.test(part));
      // Preserve meaningful variants before the first promotional segment.
      name = parts.slice(0, cutoff).join(' - ');
    }
  }
  name = name.replace(/\s+(?:new|brand[ -]+new)\s+[^|:]*\boffer\b.*$/i, '')
    .replace(/\s+(?:brand[ -]+new|now\s+live)[!\s]*$/i, '')
    .replace(/\s*[!|:–—-]+\s*$/g, '').trim();
  return name || original;
}
