function addTextElement(document, parent, tagName, text, className = '') {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function savedList(snapshot, key) {
  const value = snapshot?.[key];
  return (Array.isArray(value) ? value : value == null ? [] : [value])
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
}

const promotionOccasionLabels = new Map([
  ['BACK_TO_SCHOOL', 'Volta às aulas'], ['BLACK_FRIDAY', 'Black Friday'], ['BOXING_DAY', 'Boxing Day'],
  ['CARNIVAL', 'Carnaval'], ['CHINESE_NEW_YEAR', 'Ano Novo Chinês'], ['CHRISTMAS', 'Natal'],
  ['CYBER_MONDAY', 'Cyber Monday'], ['DIWALI', 'Diwali'], ['EASTER', 'Páscoa'], ['EID_AL_ADHA', 'Eid al-Adha'],
  ['EID_AL_FITR', 'Eid al-Fitr'], ['END_OF_SEASON', 'Fim de temporada'], ['EPIPHANY', 'Epifania'],
  ['FALL_SALE', 'Liquidação de outono'], ['FATHERS_DAY', 'Dia dos Pais'], ['HALLOWEEN', 'Halloween'],
  ['HANUKKAH', 'Hanukkah'], ['HOLI', 'Holi'], ['INDEPENDENCE_DAY', 'Dia da Independência'],
  ['LABOR_DAY', 'Dia do Trabalho'], ['MOTHERS_DAY', 'Dia das Mães'], ['NATIONAL_DAY', 'Dia Nacional'],
  ['NAVRATRI', 'Navratri'], ['NEW_YEARS', 'Ano Novo'], ['PARENTS_DAY', 'Dia dos Pais e das Mães'],
  ['PASSOVER', 'Pessach'], ['RAMADAN', 'Ramadã'], ['ROSH_HASHANAH', 'Rosh Hashaná'],
  ['SINGLES_DAY', 'Dia dos Solteiros'], ['SONGKRAN', 'Songkran'], ['SPRING_SALE', 'Liquidação de primavera'],
  ['ST_NICHOLAS_DAY', 'Dia de São Nicolau'], ['SUMMER_SALE', 'Liquidação de verão'],
  ['VALENTINES_DAY', 'Dia dos Namorados'], ['WINTER_SALE', 'Liquidação de inverno'],
  ['WOMENS_DAY', 'Dia da Mulher'], ['YEAR_END_GIFT', 'Presentes de fim de ano'],
]);

export function renderGoogleAdsCampaignCopySummary({ document, container, snapshot }) {
  if (!document || !container || !snapshot || typeof snapshot !== 'object') return null;

  const section = document.createElement('section');
  section.className = 'google-ads-campaign-copy-summary';
  addTextElement(document, section, 'h4', 'Copy e promoção salvas no lote');

  const headlines = savedList(snapshot, 'headline');
  const descriptions = savedList(snapshot, 'description');
  const copyDetails = document.createElement('details');
  copyDetails.className = 'google-ads-campaign-copy-summary-details';
  addTextElement(document, copyDetails, 'summary', 'Títulos e descrições · ' + headlines.length + ' título(s) · ' + descriptions.length + ' descrição(ões)');
  if (headlines.length) {
    addTextElement(document, copyDetails, 'h5', 'Títulos');
    const list = document.createElement('ol');
    for (const headline of headlines) addTextElement(document, list, 'li', headline);
    copyDetails.append(list);
  } else addTextElement(document, copyDetails, 'p', 'O snapshot deste lote não contém títulos salvos.');
  if (descriptions.length) {
    addTextElement(document, copyDetails, 'h5', 'Descrições');
    const list = document.createElement('ol');
    for (const description of descriptions) addTextElement(document, list, 'li', description);
    copyDetails.append(list);
  } else addTextElement(document, copyDetails, 'p', 'O snapshot deste lote não contém descrições salvas.');
  section.append(copyDetails);

  const promotionDetails = document.createElement('details');
  promotionDetails.className = 'google-ads-campaign-copy-summary-details';
  addTextElement(document, promotionDetails, 'summary', 'Recurso de promoção');
  const promotionFields = [
    ['Item', snapshot.promotion_target],
    ['Ocasião', promotionOccasionLabels.get(snapshot.promotion_occasion) || snapshot.promotion_occasion || 'Nenhuma'],
    ['Tipo de desconto', snapshot.discount_type === 'percent_off' ? 'Percentual' : snapshot.discount_type === 'amount_off' ? 'Valor fixo' : snapshot.discount_type],
    [snapshot.discount_type === 'percent_off' ? 'Desconto percentual' : 'Valor do desconto', snapshot.discount_value],
    ['Detalhes', snapshot.trigger_type === 'promotion_code' ? 'Código promocional' : snapshot.trigger_type === 'orders_over_amount' ? 'Pedido mínimo' : 'Nenhum'],
    ['Valor do detalhe', snapshot.trigger_type && snapshot.trigger_type !== 'none' ? snapshot.trigger_value : ''],
    ['Idioma', snapshot.language_code],
    ['URL final', snapshot.final_url],
    ['Data de início', snapshot.start_date],
    ['Data de término', snapshot.end_date],
  ].filter(([, value]) => String(value ?? '').trim());
  if (promotionFields.length) {
    const list = document.createElement('dl');
    for (const [label, value] of promotionFields) {
      addTextElement(document, list, 'dt', label);
      addTextElement(document, list, 'dd', String(value));
    }
    promotionDetails.append(list);
  } else addTextElement(document, promotionDetails, 'p', 'Nenhum dado de promoção foi salvo neste lote.');
  section.append(promotionDetails);
  container.append(section);
  return section;
}
