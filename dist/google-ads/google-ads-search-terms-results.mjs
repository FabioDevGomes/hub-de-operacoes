import { parseGoogleAdsCampaignName } from './google-ads-campaign-name-parser.mjs?v=6';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export const GOOGLE_ADS_SEARCH_TERM_DAILY_COLUMNS = Object.freeze([
  ['date', 'Data'], ['mcc', 'MCC'], ['account', 'Conta'], ['campaign', 'Campanha'], ['keyword', 'Palavra-chave'],
  ['searchTerm', 'Termo pesquisado'], ['matchType', 'Correspondência do termo'], ['impressions', 'Impressões'],
  ['clicks', 'Cliques'], ['cost', 'Custo'], ['conversions', 'Conversões'],
]);
export const GOOGLE_ADS_SEARCH_TERM_DAILY_PURCHASE_COLUMNS = Object.freeze([
  ...GOOGLE_ADS_SEARCH_TERM_DAILY_COLUMNS, ['purchaseConversions', 'Compras'], ['purchaseValue', 'Valor de compras'],
]);
export const GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_COLUMNS = Object.freeze([
  ['mcc', 'MCC'], ['account', 'Conta'], ['campaign', 'Campanha'], ['searchTerm', 'Termo pesquisado'],
  ['keywords', 'Palavras-chave acionadoras'], ['impressions', 'Impressões'], ['clicks', 'Cliques'], ['ctr', 'CTR'],
  ['cost', 'Custo'], ['conversions', 'Conversões'], ['cpa', 'CPA'], ['recommendation', 'Sugestão do Hub'],
  ['aiRecommendation', 'Avaliação IA'], ['negativeAction', 'Ação'],
]);
export const GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_PURCHASE_COLUMNS = Object.freeze([
  ...GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_COLUMNS.slice(0, -4),
  ['purchaseConversions', 'Compras'], ['purchaseValue', 'Valor de compras'], ['purchaseCpa', 'CPA de compra'],
  ...GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_COLUMNS.slice(-4),
]);
export const GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_DAILY_COLUMNS = Object.freeze([
  ['date', 'Data'], ...GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_COLUMNS.map(([key, label]) => [key, key === 'aiRecommendation' ? 'Avaliação IA · período' : label]),
]);
export const GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_DAILY_PURCHASE_COLUMNS = Object.freeze([
  ['date', 'Data'], ...GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_PURCHASE_COLUMNS.map(([key, label]) => [key, key === 'aiRecommendation' ? 'Avaliação IA · período' : label]),
]);
const NUMERIC_COLUMNS = new Set(['impressions', 'clicks', 'ctr', 'cost', 'conversions', 'purchaseConversions', 'purchaseValue', 'purchaseCpa', 'cpa']);

function tableHeader(columns) {
  return `<tr>${columns.map(([key, label]) => `<th${NUMERIC_COLUMNS.has(key) ? ' class="num"' : ''}>${label}</th>`).join('')}</tr>`;
}

function columnPickerMarkup(table, label) {
  return `<details class="hub-column-picker" data-google-ads-search-terms-column-picker="${table}"><summary class="btn">Colunas</summary><div class="hub-column-menu"><strong>Colunas ${label}</strong><p>O termo pesquisado permanece visível. A preferência fica salva somente nesta tela e neste navegador.</p><div data-column-options></div><button class="btn" data-column-reset type="button">Restaurar padrão</button><p data-column-message role="status" aria-live="polite"></p></div></details>`;
}

function normalizeMinimumImpressions(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(parsed)) : 0;
}

function tableToolbarMarkup(table, label, { groupingMode = 'period', minimumImpressions = 0, showGroupingControl = false, disabled = false, showColumnPicker = true } = {}) {
  const groupingControl = showGroupingControl
    ? '<label class="google-ads-search-terms-grouping"><span>Agrupamento</span><select class="input" data-google-ads-search-terms-grouping ' + (disabled ? 'disabled' : '') + '><option value="period" ' + (groupingMode === 'period' ? 'selected' : '') + '>Por termo no período</option><option value="day" ' + (groupingMode === 'day' ? 'selected' : '') + '>Por dia e termo</option></select></label>'
    : '';
  const minimumImpressionsControl = showGroupingControl
    ? '<label class="google-ads-search-terms-min-impressions" title="Mostra linhas com esse total de impressões ou mais no agrupamento selecionado."><span>Mín. impressões</span><input class="input hub-input-white" type="number" min="0" step="1" inputmode="numeric" value="' + normalizeMinimumImpressions(minimumImpressions) + '" data-google-ads-search-terms-min-impressions aria-label="Mínimo de impressões para exibir" ' + (disabled ? 'disabled' : '') + '></label>'
    : '';
  const controls = groupingControl || minimumImpressionsControl
    ? '<div class="google-ads-search-terms-table-controls">' + groupingControl + minimumImpressionsControl + '</div>'
    : '';
  return '<div class="google-ads-search-terms-table-toolbar">' + controls + (showColumnPicker ? columnPickerMarkup(table, label) : '') + '</div>';
}

function integer(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function money(micros, currencyCode) {
  if (micros == null) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode || 'USD', maximumFractionDigits: 2 }).format(micros / 1_000_000);
  } catch {
    return `${(micros / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${currencyCode || ''}`.trim();
  }
}

function moneyAmount(value, currencyCode) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode || 'USD', maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${currencyCode || ''}`.trim();
  }
}

function decimalMetric(value) {
  return value == null || !Number.isFinite(Number(value))
    ? '—'
    : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function percentage(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function accountSuffix(customerId) {
  const suffix = String(customerId ?? '').replace(/\D/g, '').slice(-4);
  return suffix ? `Conta: ${suffix}` : 'Conta não identificada';
}

function displayCampaignName(value) {
  return String(value ?? '')
    .trim()
    .replace(/^\s*(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s*[-–—]\s*/u, '')
    .replace(/\s+\d{1,3}(?:[.,]\d+)?\s*%\s*[-–—]\s*(?:(?:US|U)\s*\$|USD\s*\$?|BRL\s*\$?|R\$)\s*[\d.,]+(?:\s*\/\s*(?:dia|day))?\s*$/iu, '')
    .replace(/\s+\d{1,3}(?:[.,]\d+)?\s*%\s*$/u, '')
    .replace(/\s*[-–—]\s*(?:(?:US|U)\s*\$|USD\s*\$?|BRL\s*\$?|R\$|\$)\s*[\d.,]+(?:\s*\/\s*(?:dia|day))?\s*$/iu, '')
    .trim();
}

function recommendationDetail(group) {
  const cost = money(group.costMicros, group.currencyCode);
  const cpa = group.cpaMicros == null ? '—' : money(group.cpaMicros, group.currencyCode);
  const target = group.targetCpaMicros == null ? 'meta indisponível' : money(group.targetCpaMicros, group.currencyCode);
  switch (group.recommendation?.code) {
    case 'cpa_within_target': return `CPA ${cpa} · meta ${target}.`;
    case 'cpa_above_target': return `CPA ${cpa} · meta ${target}. Revise intenção, anúncio e página antes de excluir o termo.`;
    case 'negative_candidate': return `0 conversões · ${integer(group.clicks)} cliques · gasto ${cost} (≥ 2× meta CPA). Confira atraso de conversões e relevância antes de negativar.`;
    case 'low_ctr': return `CTR ${percentage(group.ctr)}; menos da metade do CTR dos termos visíveis da campanha, com pelo menos 100 impressões. Revise anúncio e intenção; isso não indica negativa por si só.`;
    case 'conversion_without_target': return `${Number(group.conversions).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} conversão(ões) · CPA ${cpa}. Meta CPA não foi capturada ou configurada.`;
    case 'purchase_without_primary_conversion': return `${decimalMetric(group.purchaseConversions)} compra(s) atribuída(s) · valor ${moneyAmount(group.purchaseValue, group.currencyCode)}. A quantidade de conversões principais é zero; confira qual objetivo está sendo usado antes de decidir.`;
    case 'missing_target': return `${integer(group.clicks)} cliques · gasto ${cost} · sem conversão. Não há meta CPA capturada para comparar o gasto; avalie com seu limite de referência.`;
    case 'low_data': return '';
    default: return `${integer(group.impressions)} impressões · ${integer(group.clicks)} cliques · gasto ${cost} · sem conversão; amostra abaixo dos limites de revisão.`;
  }
}

function searchTermMatchLabel(value) {
  const labels = {
    EXACT: 'Exata',
    PHRASE: 'Frase',
    BROAD: 'Ampla',
    NEAR_EXACT: 'Próxima da exata',
    NEAR_PHRASE: 'Próxima da frase',
    UNKNOWN: 'Desconhecida',
  };
  return labels[value] || value || '—';
}

export function renderGoogleAdsSearchTermsResults({
  reports = [], failures = [], pending = false, progress = '', dateFrom = '', dateTo = '',
  visibleCount = 50, pageSize = 50, showTitle = true, showDiaryReturnButton = false, campaignFilterName = '', recommendations = [], aiRecommendations = new Map(),
  reviewStates = new Map(), reviewEnabled = false,
  groupingMode = 'period', minimumImpressions = 0, showGroupingControl = false, showPurchaseMetrics = false,
} = {}) {
  const safeReports = Array.isArray(reports) ? reports : [];
  const safeFailures = Array.isArray(failures) ? failures : [];
  const activeGroupingMode = groupingMode === 'day' ? 'day' : 'period';
  const recommendationColumns = activeGroupingMode === 'day'
    ? (showPurchaseMetrics ? GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_DAILY_PURCHASE_COLUMNS : GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_DAILY_COLUMNS)
    : (showPurchaseMetrics ? GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_PURCHASE_COLUMNS : GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_COLUMNS);
  const rows = (showGroupingControl ? [] : safeReports.flatMap(report => report.rows.map(row => ({ ...row, report }))))
    .sort((left, right) => right.date.localeCompare(left.date)
      || right.clicks - left.clicks
      || right.impressions - left.impressions
      || left.searchTerm.localeCompare(right.searchTerm));
  const visibleRows = rows.slice(0, visibleCount);
  const safeRecommendations = Array.isArray(recommendations) ? recommendations : [];
  const activeMinimumImpressions = showGroupingControl ? normalizeMinimumImpressions(minimumImpressions) : 0;
  const filteredRecommendations = activeMinimumImpressions > 0
    ? safeRecommendations.filter(group => Number(group.impressions || 0) >= activeMinimumImpressions)
    : safeRecommendations;
  const visibleRecommendations = filteredRecommendations.slice(0, visibleCount);
  const recommendationLoadMore = filteredRecommendations.length > visibleRecommendations.length
    ? '<button class="btn google-ads-search-terms-more" type="button" data-google-ads-search-terms-more>Carregar mais '
      + Math.min(pageSize, filteredRecommendations.length - visibleRecommendations.length)
      + ' · ' + integer(visibleRecommendations.length) + ' de ' + integer(filteredRecommendations.length) + '</button>'
    : '';

  const tableRows = visibleRows.map(({ report, ...row }) => {
    return `<tr>
    <td>${escapeHtml(row.date)}</td>
    <td>${escapeHtml(report.managerName)}</td>
    <td><strong>${escapeHtml(report.accountName)}</strong><small>${escapeHtml(report.customerId)}</small></td>
    <td><strong>${escapeHtml(displayCampaignName(row.campaignName))}</strong></td>
    <td>${escapeHtml(row.keywordText)}<small>${escapeHtml(searchTermMatchLabel(row.keywordMatchType))}</small></td>
    <td class="google-ads-search-term-text">${escapeHtml(row.searchTerm)}</td>
    <td>${escapeHtml(searchTermMatchLabel(row.searchTermMatchType))}</td>
    <td class="num">${integer(row.impressions)}</td>
    <td class="num">${integer(row.clicks)}</td>
    <td class="num">${escapeHtml(money(row.costMicros, report.currencyCode))}</td>
    <td class="num">${Number(row.conversions).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
    ${showPurchaseMetrics ? `<td class="num">${decimalMetric(row.purchaseConversions)}</td><td class="num">${escapeHtml(moneyAmount(row.purchaseValue, report.currencyCode))}</td>` : ''}
  </tr>`;
  }).join('');
  const progressPanel = pending
    ? `<div class="google-ads-search-terms-progress" role="status">${escapeHtml(progress || 'Consultando termos de pesquisa…')}</div>`
    : '';
  const totalRows = safeReports.reduce((sum, report) => sum + report.rowCount, 0);
  const rowsWithoutKeyword = safeReports.reduce((sum, report) => sum + report.rowsWithoutKeyword, 0);
  const counts = safeReports.length || safeFailures.length
    ? `<div class="google-ads-compare-summary"><span>${integer(totalRows)} linha(s) recebida(s) nas ${safeReports.length} conta(s) com resposta completa</span><span>${integer(rowsWithoutKeyword)} linha(s) sem palavra-chave associada foram omitidas</span></div>`
    : '';
  const failuresMarkup = safeFailures.length
    ? `<div class="google-ads-search-terms-errors"><strong>Contas sem resultado completo</strong><ul>${safeFailures.map(item => `<li><strong>${escapeHtml(item.accountName)}</strong>: ${escapeHtml(item.message)}</li>`).join('')}</ul></div>`
    : '';
  const exportToolbar = !pending && safeReports.some(report => Array.isArray(report.rows) && report.rows.length)
    ? `<section class="google-ads-search-terms-export" aria-label="Preparar dados para análise com IA"><div><strong>Preparar dados para análise com IA</strong><small>Usa esta consulta já carregada; a resposta colada fica salva localmente e não inicia outra leitura da API.</small></div><div class="google-ads-search-terms-export-actions">${showDiaryReturnButton ? '<button class="btn" type="button" data-google-ads-search-terms-return-to-diary>Voltar para diário da campanha</button>' : ''}<button class="btn" type="button" data-google-ads-search-terms-export="copy">Copiar pacote para IA</button><button class="btn primary" type="button" data-google-ads-search-terms-ai-import>Colar análise da IA</button><button class="btn" type="button" data-google-ads-search-terms-export="download">Baixar relatório completo (.md)</button></div></section>`
    : '';
  const loadMore = rows.length > visibleRows.length
    ? `<button class="btn google-ads-search-terms-more" type="button" data-google-ads-search-terms-more>Carregar mais ${Math.min(pageSize, rows.length - visibleRows.length)} · ${integer(visibleRows.length)} de ${integer(rows.length)}</button>`
    : '';
  const table = !showGroupingControl && visibleRows.length
    ? `${tableToolbarMarkup('daily', 'dos termos diários')}<div class="google-ads-table-wrap"><table class="google-ads-table google-ads-search-terms-table"><thead>${tableHeader(showPurchaseMetrics ? GOOGLE_ADS_SEARCH_TERM_DAILY_PURCHASE_COLUMNS : GOOGLE_ADS_SEARCH_TERM_DAILY_COLUMNS)}</thead><tbody>${tableRows}</tbody></table></div>${loadMore}`
    : !pending && (safeReports.length || safeFailures.length)
      ? showGroupingControl ? '' : '<div class="google-ads-no-rows">Nenhum termo de pesquisa com impressão e palavra-chave associada foi retornado para o período.</div>'
      : '';
  const recommendationRows = visibleRecommendations.map(group => {
    const keywords = group.keywordTexts || [];
    const keywordLabel = keywords.length > 3 ? `${keywords.slice(0, 3).join(' · ')} · +${keywords.length - 3}` : keywords.join(' · ');
    const keywordMatchDetails = Array.isArray(group.keywordMatchDetails) ? group.keywordMatchDetails : keywords.map(text => ({ text, matchTypes: [] }));
    const keywordMarkup = keywordMatchDetails.slice(0, 3).map(detail => {
      const matchTypeLabels = [...new Set((Array.isArray(detail.matchTypes) ? detail.matchTypes : []).map(searchTermMatchLabel))];
      return `<span class="google-ads-search-trigger-keyword">${escapeHtml(detail.text)}<small>${escapeHtml(matchTypeLabels.join(' · ') || 'Desconhecida')}</small></span>`;
    }).join('') + (keywordMatchDetails.length > 3 ? `<small class="google-ads-search-trigger-keyword-more">+${keywordMatchDetails.length - 3} outras palavras-chave</small>` : '');
    const cpa = group.cpaMicros == null ? '—' : money(group.cpaMicros, group.currencyCode);
    const recommendationDescription = recommendationDetail(group);
    const ai = aiRecommendations instanceof Map ? aiRecommendations.get(group.termId) : aiRecommendations?.[group.termId];
    const savedReview = reviewStates instanceof Map ? reviewStates.get(group.termId) : reviewStates?.[group.termId];
    const activeReview = savedReview?.status === 'monitor'
      && (!Number.isFinite(Date.parse(savedReview.expiresAtUtc || '')) || Date.parse(savedReview.expiresAtUtc) <= Date.now()) ? null : savedReview;
    const aiDecisionLabels = { KEEP: 'Manter', NEGATIVE_CANDIDATE: 'Candidata a negativa', TEST: 'Testar', REVIEW: 'Revisar' };
    const parsedCampaign = parseGoogleAdsCampaignName(group.campaignName);
    const managerId = String(group.managerCustomerId || '').replace(/\D/g, '');
    const actionDisabled = !parsedCampaign.ok || !/^\d{10}$/.test(managerId)
      || !/^\d{10}$/.test(String(group.customerId || '').replace(/\D/g, '')) || !/^[1-9]\d{0,19}$/.test(String(group.campaignId || ''));
    const actionTitle = actionDisabled
      ? parsedCampaign.ok ? 'Ação disponível somente para consultas via MCC autorizada.' : 'O nome da campanha não segue o padrão reconhecido pelo Hub; não é possível identificar o produto com segurança.'
      : `Preparar negativa para o produto ${parsedCampaign.product}; a aplicação exige prévia e confirmação.`;
    const reviewStatusText = activeReview?.status === 'monitor'
      ? `Monitorando · até ${new Date(activeReview.expiresAtUtc).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
      : activeReview?.status === 'keep' ? 'Revisado · Mantido'
        : activeReview?.status === 'negative' ? activeReview.reasonCode === 'manual_negative' ? 'Negativado manualmente' : 'Revisado · Negativado'
          : '';
    const aiDecisionLabel = ai
      ? `${escapeHtml(aiDecisionLabels[ai.decision] || ai.decision)} · ${integer(ai.confidence)}%`
      : 'Sem análise importada';
    const aiDecisionClass = ai ? `is-${escapeHtml(ai.decision.toLowerCase())}` : 'is-empty';
    const reviewAccessibleLabel = [
      ai ? `Avaliação da IA: ${aiDecisionLabel}.` : 'Sem análise importada da IA.',
      reviewStatusText ? `Estado da revisão: ${escapeHtml(reviewStatusText)}.` : '',
      'Abrir revisão do termo.',
    ].filter(Boolean).join(' ');
    const aiMarkup = reviewEnabled
      ? `<button class="google-ads-search-terms-ai-decision is-clickable ${aiDecisionClass}" type="button" data-google-ads-search-terms-review="${escapeHtml(group.termId)}" aria-haspopup="dialog" aria-label="${reviewAccessibleLabel}" title="Clique para abrir a revisão do termo${reviewStatusText ? ` · ${escapeHtml(reviewStatusText)}` : ''}">${aiDecisionLabel}</button>`
      : ai
        ? `<span class="google-ads-search-terms-ai-decision ${aiDecisionClass}">${aiDecisionLabel}</span>`
        : '<span class="google-ads-search-terms-ai-empty">Sem análise importada</span>';
    const actionMarkup = `<button class="btn google-ads-search-terms-negative-button" type="button" data-google-ads-search-terms-negative data-term-id="${escapeHtml(group.termId)}" data-term="${escapeHtml(group.searchTerm)}" data-manager-id="${escapeHtml(managerId)}" data-customer-id="${escapeHtml(group.customerId)}" data-campaign-id="${escapeHtml(group.campaignId)}" data-campaign-name="${escapeHtml(group.campaignName)}" data-product="${escapeHtml(parsedCampaign.ok ? parsedCampaign.product : '')}" data-suggested-match-type="${escapeHtml(ai?.negative_match_type || '')}" title="${escapeHtml(actionTitle)}" ${actionDisabled ? 'disabled' : ''}>Negativar</button>`;
    const reviewClass = activeReview ? ' class="google-ads-search-terms-reviewed-row"' : '';
    return `<tr${reviewClass}>
      ${activeGroupingMode === 'day' ? `<td>${escapeHtml(group.date || '—')}</td>` : ''}
      <td>${escapeHtml(group.managerName)}</td>
      <td><span class="google-ads-search-account-id">${escapeHtml(accountSuffix(group.customerId))}</span></td>
      <td><strong>${escapeHtml(displayCampaignName(group.campaignName))}</strong></td>
      <td class="google-ads-search-term-text">${escapeHtml(group.searchTerm)}<small>${escapeHtml(searchTermMatchLabel(group.searchTermMatchType))}</small></td>
      <td class="google-ads-search-triggered-keywords">${keywordMarkup || escapeHtml(keywordLabel || '—')}</td>
      <td class="num">${integer(group.impressions)}</td>
      <td class="num">${integer(group.clicks)}</td>
      <td class="num">${percentage(group.ctr)}</td>
      <td class="num">${escapeHtml(money(group.costMicros, group.currencyCode))}</td>
      <td class="num">${Number(group.conversions).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      ${showPurchaseMetrics ? `<td class="num">${decimalMetric(group.purchaseMetricsAvailable ? group.purchaseConversions : null)}</td><td class="num">${escapeHtml(moneyAmount(group.purchaseMetricsAvailable ? group.purchaseValue : null, group.currencyCode))}</td>` : ''}
      ${showPurchaseMetrics ? `<td class="num"${group.purchaseMetricsAvailable ? ' title="Sem compras atribuídas no agrupamento exibido."' : ' title="Métricas de compra indisponíveis para esta consulta."'}>${escapeHtml(!group.purchaseMetricsAvailable ? 'N/D' : group.purchaseCpaMicros == null ? '—' : money(group.purchaseCpaMicros, group.currencyCode))}</td>` : ''}
      <td class="num">${escapeHtml(cpa)}</td>
      <td><span class="google-ads-search-recommendation is-${escapeHtml(group.recommendation?.kind || 'low-data')}">${escapeHtml(group.recommendation?.label || 'Avaliação indisponível')}</span>${recommendationDescription ? `<small class="google-ads-search-recommendation-detail">${escapeHtml(recommendationDescription)}</small>` : ''}</td>
      <td class="google-ads-search-terms-ai-cell">${aiMarkup}</td>
      <td>${actionMarkup}</td>
    </tr>`;
  }).join('');
  const recommendationTableMarkup = recommendationRows
    ? '<div class="google-ads-table-wrap"><table class="google-ads-table google-ads-search-terms-table google-ads-search-terms-recommendation-table"><thead>'
      + tableHeader(recommendationColumns) + '</thead><tbody>' + recommendationRows + '</tbody></table></div>' + recommendationLoadMore
    : activeMinimumImpressions > 0 && safeRecommendations.length
      ? '<div class="google-ads-no-rows">Nenhum termo atingiu o mínimo de ' + integer(activeMinimumImpressions) + ' impressões no agrupamento selecionado.</div>'
      : '<div class="google-ads-no-rows">Nenhum termo de pesquisa com impressão e palavra-chave associada foi retornado para o período.</div>';

  const visibleReviewTerms = new Map();
  visibleRecommendations.forEach((group, index) => {
    const key = group.termId || `row:${index}`;
    if (visibleReviewTerms.has(key)) return;
    const item = reviewStates instanceof Map ? reviewStates.get(group.termId) : reviewStates?.[group.termId];
    visibleReviewTerms.set(key, item);
  });
  const reviewItems = [...visibleReviewTerms.values()].map(item => {
    return item?.status === 'monitor'
      && (!Number.isFinite(Date.parse(item.expiresAtUtc || '')) || Date.parse(item.expiresAtUtc) <= Date.now()) ? null : item;
  });
  const reviewedCount = reviewItems.filter(Boolean).length;
  const monitorCount = reviewItems.filter(item => item?.status === 'monitor').length;
  const reviewProgressMarkup = reviewEnabled && visibleRecommendations.length
    ? `<div class="google-ads-search-terms-review-progress" role="status"><div><strong>Progresso da revisão</strong><span>${integer(reviewedCount)} de ${integer(reviewItems.length)} termos exibidos concluídos · ${integer(reviewItems.length - reviewedCount)} pendentes${monitorCount ? ` · ${integer(monitorCount)} monitorando por 24h` : ''}</span></div><progress max="${reviewItems.length}" value="${reviewedCount}" aria-label="Progresso da revisão dos termos exibidos"></progress></div>`
    : '';
  const recommendationDescription = activeGroupingMode === 'day'
    ? `Cada linha soma o mesmo termo por dia, conta, campanha e correspondência; as sugestões do Hub são recalculadas com as métricas do dia. A Avaliação IA continua referente ao intervalo completo e abre a revisão do termo${safeFailures.length ? '; a avaliação cobre somente contas com resposta completa' : ''}.`
    : `Os dados do mesmo termo são somados no período, por conta, campanha e correspondência. A avaliação da IA abre a revisão do termo; a análise é importada manualmente por JSON e fica salva neste navegador${safeFailures.length ? '; a avaliação cobre somente contas com resposta completa' : ''}.`;
  const purchaseMetricsDescription = showPurchaseMetrics
    ? ' Compras são conversões atribuídas cuja categoria no Google Ads é Purchase; a quantidade pode ser fracionária. O CPA de compra divide o custo do agrupamento pelas compras atribuídas. Sem compras, ele aparece como traço; N/D indica métricas de compra indisponíveis nesta consulta/cache. Os valores usam a moeda da conta.'
    : '';
  const recommendationToolbar = tableToolbarMarkup('recommendation', activeGroupingMode === 'day' ? 'dos termos agrupados por dia' : 'da avaliação automática', {
    groupingMode: activeGroupingMode,
    minimumImpressions: activeMinimumImpressions,
    showGroupingControl,
    disabled: pending,
    showColumnPicker: Boolean(safeRecommendations.length),
  });
  const recommendationTable = showGroupingControl
    ? `<section class="google-ads-search-terms-recommendations"><div class="google-ads-search-terms-recommendation-heading"><div><h3>Avaliação automática por termo</h3><p>${recommendationDescription}${purchaseMetricsDescription} A negativação exige prévia e confirmação.</p></div>${recommendationToolbar}</div>${reviewProgressMarkup}${recommendationTableMarkup}<p class="google-ads-search-recommendation-note">Heurísticas iniciais: possível negativa exige pelo menos 20 cliques e gasto de 2× a meta CPA; CTR baixa compara com os termos visíveis da campanha após 100 impressões. Sem meta CPA, o gasto fica sem comparação automática. Conversões podem atrasar. Recomendações são apenas sugestões: não alteram campanhas.</p></section>`
    : recommendationRows
      ? `<section class="google-ads-search-terms-recommendations"><h3>Avaliação automática por termo</h3><p>Os dados do mesmo termo são somados no período, por conta, campanha e correspondência. A coluna Avaliação IA é importada manualmente por JSON e fica salva neste navegador. A negativação exige prévia e confirmação.${safeFailures.length ? ' Consulta parcial: a avaliação cobre somente contas com resposta completa.' : ''}</p>${recommendationToolbar}<div class="google-ads-table-wrap"><table class="google-ads-table google-ads-search-terms-table google-ads-search-terms-recommendation-table"><thead>${tableHeader(recommendationColumns)}</thead><tbody>${recommendationRows}</tbody></table></div>${recommendationLoadMore}<p class="google-ads-search-recommendation-note">Heurísticas iniciais: possível negativa exige pelo menos 20 cliques e gasto de 2× a meta CPA; CTR baixa compara com os termos visíveis da campanha após 100 impressões. Sem meta CPA, o gasto fica sem comparação automática. Conversões podem atrasar. Recomendações são apenas sugestões: não alteram campanhas.</p></section>`
      : '';
  const heading = showTitle ? '<h3>Termos de pesquisa</h3>' : '';
  const campaignFilter = campaignFilterName ? ` · campanha: ${escapeHtml(campaignFilterName)}` : ' · todas as campanhas';
  return `<div class="google-ads-search-terms-panel">${heading}<p>Período ${escapeHtml(dateFrom)} a ${escapeHtml(dateTo)}${campaignFilter} · somente campanhas de Pesquisa (Search) · consulta somente leitura, sem gravação.</p>${progressPanel}${counts}${exportToolbar}${failuresMarkup}${recommendationTable}${table}<p class="google-ads-search-terms-note">O Google pode omitir termos com pouco volume por privacidade. Performance Max não está incluída. Custos permanecem separados por moeda da conta.</p></div>`;
}
