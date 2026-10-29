const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

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

function percentage(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function accountSuffix(customerId) {
  const suffix = String(customerId ?? '').replace(/\D/g, '').slice(-4);
  return suffix ? `Conta: ${suffix}` : 'Conta não identificada';
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
    case 'missing_target': return `${integer(group.clicks)} cliques · gasto ${cost} · sem conversão. Não há meta CPA capturada para comparar o gasto; avalie com seu limite de referência.`;
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
  visibleCount = 50, pageSize = 50, showTitle = true, campaignFilterName = '', recommendations = [],
} = {}) {
  const safeReports = Array.isArray(reports) ? reports : [];
  const safeFailures = Array.isArray(failures) ? failures : [];
  const rows = safeReports.flatMap(report => report.rows.map(row => ({ ...row, report })))
    .sort((left, right) => right.date.localeCompare(left.date)
      || right.clicks - left.clicks
      || right.impressions - left.impressions
      || left.searchTerm.localeCompare(right.searchTerm));
  const visibleRows = rows.slice(0, visibleCount);
  const safeRecommendations = Array.isArray(recommendations) ? recommendations : [];
  const visibleRecommendations = safeRecommendations.slice(0, visibleCount);
  const tableRows = visibleRows.map(({ report, ...row }) => {
    return `<tr>
    <td>${escapeHtml(row.date)}</td>
    <td>${escapeHtml(report.managerName)}</td>
    <td><strong>${escapeHtml(report.accountName)}</strong><small>${escapeHtml(report.customerId)}</small></td>
    <td><strong>${escapeHtml(row.campaignName)}</strong></td>
    <td>${escapeHtml(row.keywordText)}<small>${escapeHtml(searchTermMatchLabel(row.keywordMatchType))}</small></td>
    <td class="google-ads-search-term-text">${escapeHtml(row.searchTerm)}</td>
    <td>${escapeHtml(searchTermMatchLabel(row.searchTermMatchType))}</td>
    <td class="num">${integer(row.impressions)}</td>
    <td class="num">${integer(row.clicks)}</td>
    <td class="num">${escapeHtml(money(row.costMicros, report.currencyCode))}<small>${escapeHtml(report.currencyCode || '')}</small></td>
    <td class="num">${Number(row.conversions).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
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
  const loadMore = rows.length > visibleRows.length
    ? `<button class="btn google-ads-search-terms-more" type="button" data-google-ads-search-terms-more>Carregar mais ${Math.min(pageSize, rows.length - visibleRows.length)} · ${integer(visibleRows.length)} de ${integer(rows.length)}</button>`
    : '';
  const table = visibleRows.length
    ? `<div class="google-ads-table-wrap"><table class="google-ads-table google-ads-search-terms-table"><thead><tr><th>Data</th><th>MCC</th><th>Conta</th><th>Campanha</th><th>Palavra-chave</th><th>Termo pesquisado</th><th>Correspondência do termo</th><th class="num">Impressões</th><th class="num">Cliques</th><th class="num">Custo</th><th class="num">Conversões</th></tr></thead><tbody>${tableRows}</tbody></table></div>${loadMore}`
    : !pending && (safeReports.length || safeFailures.length)
      ? '<div class="google-ads-no-rows">Nenhum termo de pesquisa com impressão e palavra-chave associada foi retornado para o período.</div>'
      : '';
  const recommendationRows = visibleRecommendations.map(group => {
    const keywords = group.keywordTexts || [];
    const keywordLabel = keywords.length > 3 ? `${keywords.slice(0, 3).join(' · ')} · +${keywords.length - 3}` : keywords.join(' · ');
    const cpa = group.cpaMicros == null ? '—' : money(group.cpaMicros, group.currencyCode);
    return `<tr>
      <td>${escapeHtml(group.managerName)}</td>
      <td><strong>${escapeHtml(group.accountName)}</strong><small>${escapeHtml(accountSuffix(group.customerId))}</small></td>
      <td><strong>${escapeHtml(group.campaignName)}</strong></td>
      <td class="google-ads-search-term-text">${escapeHtml(group.searchTerm)}<small>${escapeHtml(searchTermMatchLabel(group.searchTermMatchType))}</small></td>
      <td>${escapeHtml(keywordLabel || '—')}</td>
      <td class="num">${integer(group.impressions)}</td>
      <td class="num">${integer(group.clicks)}</td>
      <td class="num">${percentage(group.ctr)}</td>
      <td class="num">${escapeHtml(money(group.costMicros, group.currencyCode))}<small>${escapeHtml(group.currencyCode || '')}</small></td>
      <td class="num">${Number(group.conversions).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      <td class="num">${escapeHtml(cpa)}</td>
      <td><span class="google-ads-search-recommendation is-${escapeHtml(group.recommendation?.kind || 'low-data')}">${escapeHtml(group.recommendation?.label || 'Avaliação indisponível')}</span><small class="google-ads-search-recommendation-detail">${escapeHtml(recommendationDetail(group))}</small></td>
    </tr>`;
  }).join('');
  const recommendationTable = recommendationRows
    ? `<section class="google-ads-search-terms-recommendations"><h3>Avaliação automática por termo</h3><p>Os dados do mesmo termo são somados no período, por conta, campanha e correspondência. A tabela diária continua abaixo para conferência.${safeFailures.length ? ' Consulta parcial: a avaliação inclui somente as contas com resposta completa.' : ''}</p><div class="google-ads-table-wrap"><table class="google-ads-table google-ads-search-terms-table google-ads-search-terms-recommendation-table"><thead><tr><th>MCC</th><th>Conta</th><th>Campanha</th><th>Termo pesquisado</th><th>Palavras-chave acionadoras</th><th class="num">Impressões</th><th class="num">Cliques</th><th class="num">CTR</th><th class="num">Custo</th><th class="num">Conversões</th><th class="num">CPA</th><th>Recomendação</th></tr></thead><tbody>${recommendationRows}</tbody></table></div><p class="google-ads-search-recommendation-note">Heurísticas iniciais: possível negativa exige pelo menos 20 cliques e gasto de 2× a meta CPA; CTR baixa compara com os termos visíveis da campanha após 100 impressões. Sem meta CPA, o gasto fica sem comparação automática. Conversões podem atrasar. Recomendações são apenas sugestões: não alteram campanhas.</p></section>`
    : '';
  const heading = showTitle ? '<h3>Termos de pesquisa</h3>' : '';
  const campaignFilter = campaignFilterName ? ` · campanha: ${escapeHtml(campaignFilterName)}` : ' · todas as campanhas';
  return `<div class="google-ads-search-terms-panel">${heading}<p>Período ${escapeHtml(dateFrom)} a ${escapeHtml(dateTo)}${campaignFilter} · somente campanhas de Pesquisa (Search) · consulta somente leitura, sem gravação.</p>${progressPanel}${counts}${failuresMarkup}${recommendationTable}${table}<p class="google-ads-search-terms-note">O Google pode omitir termos com pouco volume por privacidade. Performance Max não está incluída. Custos permanecem separados por moeda da conta.</p></div>`;
}
