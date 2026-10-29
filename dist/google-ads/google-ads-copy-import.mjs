const OPEN_MARKER = '[HUB_COPY_IMPORT_V1]';
const CLOSE_MARKER = '[/HUB_COPY_IMPORT_V1]';

const LIMITS = Object.freeze({ headline: 30, description: 90, callout: 25, snippet: 25, sitelinkTitle: 25, sitelinkDescription: 35 });

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' precisa ser um objeto.');
  return value;
}

function text(value, label, { optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === '')) return '';
  if (typeof value !== 'string') throw new Error(label + ' precisa ser texto.');
  return value.trim();
}

function textAsset(value, kind, index, group = '') {
  const item = record(value, kind + ' ' + (index + 1));
  const assetText = text(item.text, kind + ' ' + (index + 1));
  if (!assetText) throw new Error(kind + ' ' + (index + 1) + ' está vazio.');
  return {
    id: kind + '-' + index,
    kind,
    text: assetText,
    translationPt: text(item.translation_pt, 'Tradução de ' + kind + ' ' + (index + 1), { optional: true }),
    group: text(group || item.group || '', 'Grupo de ' + kind, { optional: true }),
    limit: LIMITS[kind],
  };
}

function assetArray(value, kind, max, label) {
  if (!Array.isArray(value) || value.length > max) throw new Error(label + ' deve ser uma lista com até ' + max + ' itens.');
  return value.map((item, index) => textAsset(item, kind, index, item?.group || ''));
}

function normalizePromotion(value) {
  if (value === null || value === undefined) return null;
  const promotion = record(value, 'Promoção');
  const discountType = text(promotion.discount_type, 'Tipo de desconto', { optional: true });
  const discountValue = text(promotion.discount_value, 'Valor do desconto', { optional: true });
  const target = text(promotion.target, 'Item da promoção', { optional: true });
  const languageCode = text(promotion.language_code, 'Idioma da promoção', { optional: true });
  const triggerType = text(promotion.trigger_type, 'Detalhe da promoção', { optional: true }) || 'none';
  const triggerValue = text(promotion.trigger_value, 'Valor do detalhe da promoção', { optional: true });
  const occasion = text(promotion.occasion, 'Ocasião da promoção', { optional: true });
  if (discountType && !['percent_off', 'amount_off'].includes(discountType)) throw new Error('Tipo de desconto inválido no bloco do Hub.');
  if (triggerType && !['none', 'promotion_code', 'orders_over_amount'].includes(triggerType)) throw new Error('Detalhe de promoção inválido no bloco do Hub.');
  if (languageCode && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(languageCode)) throw new Error('O idioma da promoção não está em formato BCP 47 válido.');
  return { target, discountType, discountValue, languageCode, triggerType, triggerValue, occasion };
}

function normalizeSnippetGroups(value) {
  if (!Array.isArray(value) || value.length > 20) throw new Error('Snippets estruturados devem ser uma lista com até 20 grupos.');
  return value.map((rawGroup, groupIndex) => {
    const group = record(rawGroup, 'Grupo de snippet ' + (groupIndex + 1));
    if (!Array.isArray(group.values) || group.values.length > 20) throw new Error('Os valores do snippet ' + (groupIndex + 1) + ' devem ser uma lista com até 20 itens.');
    return {
      id: 'snippet-' + groupIndex,
      header: text(group.header, 'Cabeçalho do snippet ' + (groupIndex + 1)),
      headerTranslationPt: text(group.header_translation_pt, 'Tradução do cabeçalho do snippet ' + (groupIndex + 1), { optional: true }),
      values: group.values.map((item, index) => textAsset(item, 'snippet', index, '')),
    };
  });
}

function normalizeSitelinks(value) {
  if (!Array.isArray(value) || value.length > 30) throw new Error('Sitelinks devem ser uma lista com até 30 itens.');
  return value.map((rawLink, index) => {
    const link = record(rawLink, 'Sitelink ' + (index + 1));
    const title = textAsset(link.title, 'sitelinkTitle', index);
    const descriptions = Array.isArray(link.descriptions) ? link.descriptions : [link.description_1, link.description_2];
    if (descriptions.length !== 2) throw new Error('Cada sitelink deve conter exatamente duas descrições.');
    return {
      id: 'sitelink-' + index,
      title,
      descriptions: descriptions.map((item, descriptionIndex) => textAsset(item, 'sitelinkDescription', descriptionIndex, '')),
    };
  });
}

export function parseGoogleAdsCopyImport(input) {
  const source = String(input ?? '');
  if (!source.trim()) throw new Error('Cole a resposta completa do Gemini.');
  if (source.length > 300_000) throw new Error('A copy passou do limite de 300 mil caracteres.');
  const first = source.indexOf(OPEN_MARKER);
  const lastOpen = source.lastIndexOf(OPEN_MARKER);
  const close = source.indexOf(CLOSE_MARKER, first + OPEN_MARKER.length);
  if (first < 0 || lastOpen !== first || close < 0 || source.indexOf(CLOSE_MARKER, close + CLOSE_MARKER.length) >= 0) {
    throw new Error('Não encontrei um único bloco [HUB_COPY_IMPORT_V1]. Atualize as regras do Gemini com o formato de integração do Hub e cole a resposta completa.');
  }
  const jsonText = source.slice(first + OPEN_MARKER.length, close).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let data;
  try { data = JSON.parse(jsonText); }
  catch { throw new Error('O bloco do Hub foi encontrado, mas o JSON está inválido. Peça ao Gemini para repetir somente o bloco estruturado sem alterar as demais seções.'); }
  record(data, 'Bloco do Hub');
  if (data.schema !== 'hub_google_ads_copy_v1') throw new Error('Versão do bloco incompatível. O Hub espera hub_google_ads_copy_v1.');

  const headlines = assetArray(data.headlines, 'headline', 60, 'Títulos');
  const descriptions = assetArray(data.descriptions, 'description', 30, 'Descrições');
  const callouts = assetArray(data.callouts ?? [], 'callout', 60, 'Frases de destaque');
  const structuredSnippets = normalizeSnippetGroups(data.structured_snippets ?? []);
  const sitelinks = normalizeSitelinks(data.sitelinks ?? []);
  const languageCode = text(data.language_code, 'Idioma principal', { optional: true });
  if (languageCode && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(languageCode)) throw new Error('O idioma principal não está em formato BCP 47 válido.');
  if (!headlines.length || !descriptions.length) throw new Error('O bloco precisa trazer pelo menos um título e uma descrição.');
  return {
    languageCode,
    headlines,
    descriptions,
    callouts,
    structuredSnippets,
    sitelinks,
    promotion: normalizePromotion(data.promotion),
  };
}

export function googleAdsCopyAssetLimit(kind) { return LIMITS[kind] || 0; }
