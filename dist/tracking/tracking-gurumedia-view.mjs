import {
  buildGuruMediaPostbackMacroParams,
  formatGuruMediaPayout,
  GURUMEDIA_POSTBACK_ENDPOINT,
  GURUMEDIA_POSTBACK_MACRO_DEFAULTS,
  GURUMEDIA_SALES_DETAILS_LIMIT,
  inspectGuruMediaPostbackUrl,
  guruMediaTrackFilterKey,
  sumGuruMediaPayouts,
  validateGuruMediaSalesDateRange,
} from './tracking-gurumedia-domain.mjs?v=6';
import { fetchGuruMediaCampaignAttribution, fetchGuruMediaSalesReport, fetchTrackingClicksReport, fetchTrackingDomains, sendGuruMediaGoogleAdsSale, validateGuruMediaGoogleAdsSale } from './tracking-service.mjs?v=25';
import { syncGuruMediaSalesToBilling } from './tracking-billing-service.mjs?v=3';
import { readTrackingDomainAdminToken, readTrackingHubToken } from './tracking-token-storage.mjs?v=3';
import {
  mergeGuruMediaCampaignAttributions,
  readGuruMediaCampaignAttributions,
  readGuruMediaSalesSnapshot,
  saveGuruMediaSalesSnapshot,
} from './tracking-gurumedia-storage.mjs?v=3';
import { saveTrackingDomainList } from './tracking-domain-list-storage.mjs?v=8';
import {
  formatTrackingDatePtBr,
  parseTrackingDatePtBr,
  trackingClicksDateRangeForPreset,
  trackingClicksDefaultDateRange,
  resolveTrackingClicksCache,
  summarizeTrackingClicks,
  trackingClicksRate,
} from './tracking-clicks-domain.mjs?v=8';
import { appendTrackingClicksSnapshot, readTrackingClicksSnapshots } from './tracking-clicks-storage.mjs?v=4';
import { resolveTrackMcc } from '../accounts/accounts-presell-domain.mjs?v=4';

export const TRACKING_GURUMEDIA_AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const TRACKING_GURUMEDIA_POSTBACK_URL = GURUMEDIA_POSTBACK_ENDPOINT;
const GURUMEDIA_POSTBACK_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const GURUMEDIA_MACRO_PATTERN = /^\{[a-z][a-z0-9_]*\}$/i;
const mountedRoots = new WeakMap();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function formatCount(value) { return new Intl.NumberFormat('pt-BR').format(value); }
function formatUtcTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) + ' UTC';
}
function formatUtcSaleTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return 'Sem horário real';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(value)) + ' UTC';
}
function trackLabel(row) { return row.productLabel || row.productKey || row.offerName || 'Produto não identificado'; }
function currencyTotals(rows) {
  const totals = new Map();
  for (const row of rows) {
    const values = totals.get(row.currency) || [];
    values.push(row.payoutTotal);
    totals.set(row.currency, values);
  }
  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, values]) => formatGuruMediaPayout(sumGuruMediaPayouts(values), currency)).join(' · ') || '—';
}

export function mount({
  root,
  fetchReport = fetchGuruMediaSalesReport,
  fetchTrafficReport = fetchTrackingClicksReport,
  readCache = readGuruMediaSalesSnapshot,
  saveCache = saveGuruMediaSalesSnapshot,
  readCampaignAttributions = readGuruMediaCampaignAttributions,
  readTrafficCache = readTrackingClicksSnapshots,
  saveTrafficCache = appendTrackingClicksSnapshot,
  fetchDomains = fetchTrackingDomains,
  saveDomainCache = saveTrackingDomainList,
  readDomainAdminToken = readTrackingDomainAdminToken,
  syncBilling = syncGuruMediaSalesToBilling,
  nowFn = () => new Date(),
  setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
  clipboard = globalThis.navigator?.clipboard,
  getAccountRows = () => [],
} = {}) {
  if (!root) throw new Error('A área da sessão Tracking GuruMedia não foi encontrada.');
  const existing = mountedRoots.get(root);
  if (existing) { existing.render(); existing.activate(); return existing; }
  const tokenState = readTrackingHubToken();
  const initialRange = trackingClicksDefaultDateRange(nowFn(), 'UTC');
  const state = {
    report: null,
    trafficReport: null,
    trafficPage: 1,
    trafficSnapshots: [],
    trafficFeedback: '',
    trafficError: false,
    trafficLastRefreshAtUtc: '',
    trafficCacheSavedAtUtc: '',
    trafficCacheWarning: '',
    domainRows: [],
    apiToken: tokenState.token,
    tokenInvalid: tokenState.invalid,
    googleAdsSaleActions: {},
    startDateInput: formatTrackingDatePtBr(initialRange.startDate),
    endDateInput: formatTrackingDatePtBr(initialRange.endDate),
    datePreset: 'today',
    productFilter: 'all',
    domainFilter: 'all',
    pending: false,
    feedback: '',
    feedbackError: false,
    campaignFeedback: '',
    campaignError: false,
    billingSyncFeedback: '',
    billingSyncError: false,
    lastRefreshAtUtc: '',
    cacheSavedAtUtc: '',
    cacheWarning: '',
    domainCacheWarning: '',
    postbackConfigExpanded: false,
    postbackToken: '',
    activePostbackUrl: '',
    postbackMacros: {
      ...GURUMEDIA_POSTBACK_MACRO_DEFAULTS,
    },
    postbackMessage: '',
    postbackError: false,
  };
  let active = false;
  let hasStarted = false;
  let refreshTimer = null;
  let observer = null;
  const documentImpl = root.ownerDocument || globalThis.document;
  const section = root.closest?.('#trackingGuruMediaView') || documentImpl?.getElementById?.('trackingGuruMediaView');
  const isVisible = () => !documentImpl?.hidden && !section?.classList.contains('hidden');

  function dateRangeFromInputs() {
    const startDate = parseTrackingDatePtBr(state.startDateInput);
    const endDate = parseTrackingDatePtBr(state.endDateInput);
    if (!startDate || !endDate) throw new Error('Informe datas válidas no formato dd/mm/aaaa.');
    return validateGuruMediaSalesDateRange(startDate, endDate);
  }

  function filteredRows() {
    const rows = state.report?.rows || [];
    return rows.filter(row => (state.productFilter === 'all' || guruMediaTrackFilterKey(row) === state.productFilter)
      && (state.domainFilter === 'all' || row.presellHost === state.domainFilter));
  }

  function renderSummary(rows) {
    const totalCount = rows.reduce((sum, row) => sum + row.salesCount, 0);
    const trackedCount = new Set(rows.map(guruMediaTrackFilterKey)).size;
    const payout = currencyTotals(rows);
    const unmatched = state.report?.summary.unmatchedCallbacks ?? 0;
    const ambiguous = state.report?.summary.ambiguousCallbacks ?? 0;
    return `<div class="tracking-summary" aria-label="Resumo de vendas GuruMedia">
      <div class="tracking-kpi"><span>Vendas associadas à Track</span><strong>${formatCount(totalCount)}</strong></div>
      <div class="tracking-kpi"><span>Payout enviado pela GuruMedia</span><strong class="tracking-kpi-amount">${escapeHtml(payout)}</strong></div>
      <div class="tracking-kpi"><span>Tracks com vendas no recorte</span><strong>${formatCount(trackedCount)}</strong></div>
      <div class="tracking-kpi"><span>Postbacks sem vínculo</span><strong>${formatCount(unmatched + ambiguous)}</strong></div>
    </div>`;
  }

  function renderFilterOptions(rows) {
    const tracks = new Map();
    const domains = new Set();
    for (const row of rows) {
      tracks.set(guruMediaTrackFilterKey(row), `${trackLabel(row)} · ${row.presellHost}`);
      domains.add(row.presellHost);
    }
    const trackOptions = [...tracks.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    const domainOptions = [...domains].sort((a, b) => a.localeCompare(b));
    return `<div class="tracking-clicks-filters tracking-gurumedia-filters">
      <label class="tracking-token-field" for="guruMediaProductFilter"><span>Produto / Track</span><select id="guruMediaProductFilter"><option value="all">Todos os produtos</option>${trackOptions.map(([key, label]) => `<option value="${escapeHtml(key)}"${state.productFilter === key ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
      <label class="tracking-token-field" for="guruMediaDomainFilter"><span>Pre-sell</span><select id="guruMediaDomainFilter"><option value="all">Todos os domínios</option>${domainOptions.map(domain => `<option value="${escapeHtml(domain)}"${state.domainFilter === domain ? ' selected' : ''}>${escapeHtml(domain)}</option>`).join('')}</select></label>
    </div>`;
  }

  function renderTable(rows) {
    const accountRows = safeAccountRows();
    const body = rows.map(row => {
      const mcc = resolveTrackMcc(accountRows,row);
      return `<tr>
      <td>${escapeHtml(formatTrackingDatePtBr(row.dateUtc))}</td>
      <td>${escapeHtml(trackLabel(row))}${row.offerName ? `<span class="tracking-muted-value">Oferta: ${escapeHtml(row.offerName)}</span>` : ''}</td>
      <td><a class="tracking-presell-link" href="https://${encodeURIComponent(row.presellHost)}/" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(row.presellHost)}</code></a></td>
      <td title="${escapeHtml(mccDescription(mcc))}">${escapeHtml(mcc.label)}</td>
      <td class="tracking-number">${formatCount(row.salesCount)}</td>
      <td class="tracking-number">${escapeHtml(formatGuruMediaPayout(row.payoutTotal, row.currency))}</td>
    </tr>`;
    }).join('');
    return `<div class="tracking-table-heading"><div><h3>Vendas por dia, Track e pre-sell</h3><p>O payout é o valor de comissão recebido da GuruMedia, separado por moeda.</p></div><span class="tracking-count">${formatCount(rows.length)} linha(s)</span></div>
      ${body ? `<div class="tracking-table-wrap"><table class="tracking-table tracking-gurumedia-table"><thead><tr><th>Data UTC de recebimento</th><th>Track / oferta</th><th>Pre-sell</th><th>MCC Ads</th><th>Vendas</th><th>Payout</th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="tracking-empty"><p class="tracking-instruction">Não há vendas associadas às Tracks para estes filtros e período.</p></div>'}`;
  }

  function filteredSaleDetails() {
    const sales = state.report?.saleDetails;
    if (!Array.isArray(sales)) return null;
    return sales.filter(sale => (state.productFilter === 'all' || guruMediaTrackFilterKey(sale) === state.productFilter)
      && (state.domainFilter === 'all' || sale.presellHost === state.domainFilter));
  }

  function saleDetailIdentity(sale) {
    return JSON.stringify([
      sale.receivedAtUtc, sale.conversionAtUtc, sale.productKey, sale.presellHost,
      sale.offerName, sale.currency, sale.payoutAmount,
    ]);
  }

  function takeByIdentity(rows) {
    const matches = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = saleDetailIdentity(row);
      const values = matches.get(key) || [];
      values.push(row);
      matches.set(key, values);
    }
    return matches;
  }

  function campaignStatusText(attribution) {
    if (!attribution || attribution.status === 'not_checked') return 'Ainda não consultada';
    if (attribution.status === 'matched') return `${attribution.campaignName} · ID ${attribution.campaignId}`;
    const labels = {
      no_match: 'GCLID sem correspondência no ClickView',
      gclid_invalid: 'O identificador Google capturado não tem formato válido para ClickView',
      gclid_missing: 'O clique não contém GCLID',
      gclid_missing_braid_present: 'Clique sem GCLID; só há GBRAID/WBRAID',
      click_ambiguous: 'O clique associado tem dados ambíguos',
      ambiguous_campaign: 'O ClickView apontou mais de uma campanha',
      lookup_error: `Consulta ClickView falhou${attribution.errorCode ? ` · ${attribution.errorCode}` : ''}`,
      lookup_limit: 'Limite de consulta atingido; reduza o período',
      outside_click_view_window: 'Clique fora da janela histórica do ClickView',
      click_date_future: 'A data do clique ainda não está disponível no ClickView',
      track_mapping_missing: 'Track sem associação a uma conta Google Ads',
      click_missing: 'Não foi encontrado o clique associado à venda',
      click_time_invalid: 'Horário do clique inválido',
      mcc_ambiguous: 'MCC ambígua no manifesto',
      mcc_unidentified: 'MCC não identificada no manifesto',
      google_ads_account_unidentified: 'ID completo da conta Google Ads não identificado no manifesto',
      google_ads_account_ambiguous: 'IDs de conta Google Ads conflitantes no manifesto',
      google_ads_mcc_id_unidentified: 'ID numérico completo da MCC não identificado no manifesto',
    };
    return labels[attribution.status] || 'Campanha não identificada';
  }

  function campaignTrackAccounts(sales) {
    const accountRows = safeAccountRows();
    const tracks = new Map();
    const saleStatuses = new Map();
    for (const sale of sales) {
      const identity = saleDetailIdentity(sale);
      const mcc = resolveTrackMcc(accountRows, sale);
      if (mcc.status !== 'identified' || !mcc.account) {
        saleStatuses.set(identity, { status: mcc.status === 'ambiguous' ? 'mcc_ambiguous' : 'mcc_unidentified' });
        continue;
      }
      if (!mcc.customerId) {
        saleStatuses.set(identity, { status: mcc.customerIdAmbiguous ? 'google_ads_account_ambiguous' : 'google_ads_account_unidentified' });
        continue;
      }
      if (!mcc.managerCustomerId) {
        saleStatuses.set(identity, { status: 'google_ads_mcc_id_unidentified' });
        continue;
      }
      const key = JSON.stringify([sale.productKey, sale.presellHost]);
      if (!tracks.has(key)) tracks.set(key, {
        product_key: sale.productKey,
        presell_host: sale.presellHost,
        customer_id: mcc.customerId,
        manager_customer_id: mcc.managerCustomerId,
      });
      saleStatuses.set(identity, { status: 'not_checked' });
    }
    return { tracks: [...tracks.values()], saleStatuses };
  }

  function retainCampaignAttributions(report, previousReport) {
    if (!Array.isArray(report?.saleDetails)) return report;
    const previous = takeByIdentity(previousReport?.saleDetails);
    return {
      ...report,
      saleDetails: report.saleDetails.map(sale => {
        const old = previous.get(saleDetailIdentity(sale))?.shift();
        return { ...sale, ...(old?.campaignAttribution ? { campaignAttribution: old.campaignAttribution } : {}) };
      }),
    };
  }

  function applyCampaignAttributions(report, resolution, fallbackStatuses) {
    if (!Array.isArray(report?.saleDetails)) return report;
    const resolved = takeByIdentity(resolution?.rows);
    return {
      ...report,
      saleDetails: report.saleDetails.map(sale => {
        const key = saleDetailIdentity(sale);
        const match = resolved.get(key)?.shift();
        const fallback = fallbackStatuses.get(key);
        if (fallback && fallback.status !== 'not_checked') return { ...sale, campaignAttribution: fallback };
        if (match?.campaignAttribution) return { ...sale, campaignAttribution: match.campaignAttribution };
        return { ...sale, campaignAttribution: fallback || { status: 'lookup_limit' } };
      }),
    };
  }

  function campaignFeedbackText(result, fallbackStatuses = new Map()) {
    const summary = result.summary;
    const parts = [`ClickView: ${formatCount(summary.matched_count)} campanha(s) identificada(s)`];
    if (summary.no_match_count) parts.push(`${formatCount(summary.no_match_count)} sem correspondência`);
    if (summary.missing_gclid_count) parts.push(`${formatCount(summary.missing_gclid_count)} sem GCLID`);
    if (summary.ambiguous_count) parts.push(`${formatCount(summary.ambiguous_count)} ambígua(s)`);
    if (summary.lookup_error_count) parts.push(`${formatCount(summary.lookup_error_count)} com erro`);
    if (summary.not_queried_count) parts.push(`${formatCount(summary.not_queried_count)} não consultada(s)`);
    const fallbackCounts = {
      mcc_ambiguous: 0,
      mcc_unidentified: 0,
      google_ads_account_unidentified: 0,
      google_ads_account_ambiguous: 0,
      google_ads_mcc_id_unidentified: 0,
    };
    for (const value of fallbackStatuses.values()) {
      if (Object.hasOwn(fallbackCounts, value?.status)) fallbackCounts[value.status]++;
    }
    if (fallbackCounts.mcc_ambiguous) parts.push(`${formatCount(fallbackCounts.mcc_ambiguous)} MCC ambígua(s)`);
    if (fallbackCounts.mcc_unidentified) parts.push(`${formatCount(fallbackCounts.mcc_unidentified)} MCC não identificada(s)`);
    if (fallbackCounts.google_ads_account_unidentified) parts.push(`${formatCount(fallbackCounts.google_ads_account_unidentified)} sem ID completo da conta Google Ads`);
    if (fallbackCounts.google_ads_account_ambiguous) parts.push(`${formatCount(fallbackCounts.google_ads_account_ambiguous)} com IDs de conta Google Ads conflitantes`);
    if (fallbackCounts.google_ads_mcc_id_unidentified) parts.push(`${formatCount(fallbackCounts.google_ads_mcc_id_unidentified)} sem ID numérico completo da MCC`);
    parts.push(`${formatCount(result.queryCount)} consulta(s) Google Ads (${formatCount(result.clickViewQueryCount)} ClickView + ${formatCount(result.accountTimeZoneQueryCount)} fuso de conta)`);
    if (result.truncated) parts.push('limite de 500 vendas atingido; reduza o período');
    return `${parts.join(' · ')}. Esta consulta ClickView é somente leitura.`;
  }

  function googleAdsSaleStatusLabel(status) {
    return ({
      not_sent: 'Ainda não enviada',
      validated: 'Payload validado · não enviado',
      pending: 'Na fila de envio',
      processing: 'Envio em andamento',
      accepted: 'API aceitou · aguardando processamento',
      processed: 'Processada pelo Data Manager',
      partial_success: 'Processamento parcial no Google',
      rejected: 'Rejeitada pelo Google',
      blocked: 'Bloqueada por dados ausentes ou ambíguos',
      unknown: 'Resultado incerto · reenvio bloqueado',
    })[status] || 'Estado ainda não consultado';
  }

  async function validateSaleWithGoogleAds(sale) {
    const saleKey = sale?.saleKey;
    if (!saleKey || !state.apiToken) return;
    const adminToken = readTrackingDomainAdminToken().token;
    if (!adminToken) {
      state.googleAdsSaleActions = { ...state.googleAdsSaleActions, [saleKey]: { error: 'Configure o token administrativo em Configurações globais.' } };
      render();
      return;
    }
    state.googleAdsSaleActions = { ...state.googleAdsSaleActions, [saleKey]: { pending: true, message: 'Enviando validateOnly; a conversão não será registrada.' } };
    render();
    try {
      const result = await validateGuruMediaGoogleAdsSale(state.apiToken, adminToken, saleKey);
      const manualSendAvailable = result.manual_send_available === true;
      state.googleAdsSaleActions = {
        ...state.googleAdsSaleActions,
        [saleKey]: {
          status: result.validated && manualSendAvailable ? 'validated' : sale.googleAdsStatus,
          validated: result.validated === true && manualSendAvailable,
          manualSendAvailable,
          fieldWarnings: Number(result.field_warnings || 0),
          requestId: result.request_id || '',
          message: result.validated && manualSendAvailable
            ? `Validada sem enviar${result.field_warnings ? ` · ${Number(result.field_warnings)} aviso(s)` : ''}.`
            : result.validated
              ? 'Payload válido; esta venda já está em fila ou teve envio anterior. Não envie novamente por aqui.'
            : `Google não validou o payload${result.error_code ? ` · ${result.error_code}` : ''}.`,
        },
      };
    } catch (error) {
      state.googleAdsSaleActions = { ...state.googleAdsSaleActions, [saleKey]: { error: error instanceof Error ? error.message : 'Não foi possível validar a venda.' } };
    }
    render();
  }

  async function sendSaleToGoogleAds(sale) {
    const saleKey = sale?.saleKey;
    const previous = state.googleAdsSaleActions[saleKey];
    if (!saleKey || previous?.validated !== true) return;
    const warningLine = previous.fieldWarnings > 0
      ? `\nA validação retornou ${previous.fieldWarnings} aviso(s); confira o resultado antes de continuar.`
      : '';
    const confirmation = `Enviar esta venda real ao Google Ads agora?\n\nComissão: ${formatGuruMediaPayout(sale.payoutAmount, sale.currency)}\nVenda ocorrida: ${formatUtcSaleTimestamp(sale.conversionAtUtc)}${warningLine}\n\nConfirme antes que a Flow ou outro sistema não esteja enviando esta mesma venda para a mesma ação. Isso pode contar a compra duas vezes. O envio usa a ação configurada para a MCC e não pode ser desfeito por esta tela.`;
    if (!globalThis.confirm?.(confirmation)) return;
    const adminToken = readTrackingDomainAdminToken().token;
    if (!adminToken) {
      state.googleAdsSaleActions = { ...state.googleAdsSaleActions, [saleKey]: { ...previous, error: 'Configure o token administrativo em Configurações globais.' } };
      render();
      return;
    }
    state.googleAdsSaleActions = { ...state.googleAdsSaleActions, [saleKey]: { ...previous, pending: true, message: 'Enviando conversão real ao Data Manager…', error: '' } };
    render();
    try {
      const result = await sendGuruMediaGoogleAdsSale(state.apiToken, adminToken, saleKey);
      state.googleAdsSaleActions = {
        ...state.googleAdsSaleActions,
        [saleKey]: {
          ...previous,
          pending: false,
          status: result.accepted ? 'accepted' : 'rejected',
          accepted: result.accepted === true,
          requestId: result.request_id || '',
          message: result.accepted
            ? `A API aceitou a solicitação${result.request_id ? ` · ${result.request_id}` : ''}; falta o processamento assíncrono.`
            : `A API recusou o envio${result.error_code ? ` · ${result.error_code}` : ''}.`,
          error: '',
        },
      };
    } catch (error) {
      state.googleAdsSaleActions = { ...state.googleAdsSaleActions, [saleKey]: { ...previous, pending: false, error: error instanceof Error ? error.message : 'Não foi possível enviar a conversão.' } };
    }
    render();
  }

  function renderSaleDetails(report, sales) {
    if (!Array.isArray(report.saleDetails)) {
      return `<section class="tracking-gurumedia-sale-details" aria-label="Horários individuais das vendas">
        <h3>Horários individuais das vendas</h3>
        <p class="tracking-instruction">O serviço do servidor ainda não inclui os horários de cada venda. Atualize <code>gurumedia-sales-service.php</code> para disponibilizar esses detalhes.</p>
      </section>`;
    }
    if (!sales.length) {
      return `<section class="tracking-gurumedia-sale-details" aria-label="Horários individuais das vendas">
        <h3>Horários individuais das vendas</h3>
        <p class="tracking-instruction">Não há vendas individuais para estes filtros e período.</p>
      </section>`;
    }
    const body = sales.map(sale => {
      const localAction = sale.saleKey ? state.googleAdsSaleActions[sale.saleKey] || {} : {};
      const status = localAction.status || sale.googleAdsStatus;
      const busy = localAction.pending === true;
      const hasServerKey = typeof sale.saleKey === 'string';
      const canValidate = ['not_sent', 'blocked', 'rejected'].includes(status)
        || (status === 'validated' && localAction.manualSendAvailable !== false);
      const validationButton = hasServerKey && sale.conversionAtUtc && !localAction.validated && canValidate
        ? `<button type="button" class="btn" data-gurumedia-action="validate-google-ads-sale" data-sale-key="${escapeHtml(sale.saleKey)}"${busy ? ' disabled' : ''}>${busy ? 'Validando…' : status === 'validated' ? 'Verificar envio' : 'Validar sem enviar'}</button>`
        : '';
      const sendButton = hasServerKey && localAction.validated === true && localAction.manualSendAvailable === true && status === 'validated'
        ? `<button type="button" class="btn primary" data-gurumedia-action="send-google-ads-sale" data-sale-key="${escapeHtml(sale.saleKey)}"${busy ? ' disabled' : ''}>${busy ? 'Enviando…' : 'Enviar conversão'}</button>`
        : '';
      const actionMessage = localAction.error || localAction.message || (localAction.fieldWarnings ? `${localAction.fieldWarnings} aviso(s) de validação.` : '');
      const attribution = sale.campaignAttribution;
      const clickDiagnostics = attribution?.clickAtUtc || attribution?.gclidMasked
        ? `${attribution.clickAtUtc ? escapeHtml(formatUtcSaleTimestamp(attribution.clickAtUtc)) : '<span class="tracking-muted-value">Horário indisponível</span>'}${attribution.gclidMasked ? `<span class="tracking-muted-value" title="Identificador mascarado; seis caracteres finais">GCLID ${escapeHtml(attribution.gclidMasked)}</span>` : '<span class="tracking-muted-value">GCLID indisponível</span>'}`
        : '<span class="tracking-muted-value">Diagnóstico indisponível</span>';
      const adsCell = !hasServerKey
        ? 'Atualize o serviço privado para habilitar as ações.'
        : `${escapeHtml(googleAdsSaleStatusLabel(status))}${sale.googleAdsErrorCode ? `<span class="tracking-muted-value">${escapeHtml(sale.googleAdsErrorCode)}</span>` : ''}${validationButton || sendButton ? `<div class="tracking-conversion-action-buttons">${validationButton}${sendButton}</div>` : ''}${actionMessage ? `<span class="tracking-muted-value${localAction.error ? ' is-error' : ''}" role="status">${escapeHtml(actionMessage)}</span>` : ''}`;
      return `<tr>
        <td>${escapeHtml(formatUtcSaleTimestamp(sale.conversionAtUtc))}</td>
        <td>${escapeHtml(formatUtcSaleTimestamp(sale.receivedAtUtc))}</td>
        <td>${escapeHtml(trackLabel(sale))}${sale.offerName ? `<span class="tracking-muted-value">Oferta: ${escapeHtml(sale.offerName)}</span>` : ''}</td>
        <td><a class="tracking-presell-link" href="https://${encodeURIComponent(sale.presellHost)}/" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(sale.presellHost)}</code></a></td>
        <td>${clickDiagnostics}</td>
        <td>${escapeHtml(campaignStatusText(sale.campaignAttribution))}</td>
        <td class="tracking-number">${escapeHtml(formatGuruMediaPayout(sale.payoutAmount, sale.currency))}</td>
        <td>${adsCell}</td>
      </tr>`;
    }).join('');
    const truncationNote = report.saleDetailsTruncated
      ? `<p class="tracking-connection-note">Mostrando as ${formatCount(GURUMEDIA_SALES_DETAILS_LIMIT)} vendas mais recentes no período. Reduza o período para consultar as demais.</p>`
      : '';
    return `<section class="tracking-gurumedia-sale-details" aria-label="Horários individuais das vendas">
      <div class="tracking-table-heading"><div><h3>Horários individuais das vendas</h3><p>O período é definido pela data de recebimento do postback. O horário real pode ser anterior se o postback chegou depois.</p></div><span class="tracking-count">${formatCount(sales.length)} venda(s)</span></div>
      ${truncationNote}
      <div class="tracking-table-wrap"><table class="tracking-table tracking-gurumedia-table"><thead><tr><th>Venda ocorreu (UTC)</th><th>Postback recebido (UTC)</th><th>Track / oferta</th><th>Pre-sell</th><th>Clique Google (UTC) / GCLID mascarado</th><th>Campanha Google Ads · ClickView</th><th>Comissão</th><th>Envio ao Google Ads</th></tr></thead><tbody>${body}</tbody></table></div>
    </section>`;
  }

  function safeAccountRows() {
    try {
      const rows = getAccountRows?.();
      return Array.isArray(rows) ? rows : [];
    }
    catch { return []; }
  }

  function mccDescription(mcc) {
    if (mcc.status === 'identified') return `MCC associada à conta ${mcc.account}.`;
    if (mcc.status === 'ambiguous') return 'O produto/conta aparece associado a mais de uma MCC.';
    return 'Não foi possível associar o produto e a conta do Track a uma MCC do manifesto.';
  }

  function trafficTrackLabel(row) { return row.productLabel || row.productKey || 'Produto não identificado'; }

  function renderTraffic() {
    const pageSize = 20;
    const report = state.trafficReport;
    const rows = report?.rows || [];
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    state.trafficPage = Math.min(pageCount, Math.max(1, Number(state.trafficPage) || 1));
    const firstRowIndex = (state.trafficPage - 1) * pageSize;
    const visibleRows = rows.slice(firstRowIndex, firstRowIndex + pageSize);
    const summary = summarizeTrackingClicks(rows);
    const trackCount = new Set(rows.map(row => JSON.stringify([row.productKey, row.presellHost]))).size;
    const rate = trackingClicksRate(summary.outboundClicks, summary.pageViews);
    const last = state.trafficLastRefreshAtUtc ? formatUtcTimestamp(state.trafficLastRefreshAtUtc) : 'ainda não consultado';
    const autoStatus = `Métricas atualizadas ao abrir e a cada 5 minutos enquanto esta tela estiver ativa. Última consulta: ${last}.`;
    const accountRows = safeAccountRows();
    const body = visibleRows.map(row => {
      const rowRate = trackingClicksRate(row.outboundClicks, row.pageViews);
      const mcc = resolveTrackMcc(accountRows,row);
      const hostCell = row.presellHost
        ? `<a class="tracking-presell-link" href="https://${encodeURIComponent(row.presellHost)}/" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(row.presellHost)}</code></a>`
        : '<span>Domínio não identificado</span>';
      return `<tr><td>${escapeHtml(formatTrackingDatePtBr(row.dateUtc))}</td><td>${escapeHtml(trafficTrackLabel(row))}${row.productKey ? `<span class="tracking-muted-value">${escapeHtml(row.productKey)}</span>` : ''}</td><td>${hostCell}</td><td title="${escapeHtml(mccDescription(mcc))}">${escapeHtml(mcc.label)}</td><td>${escapeHtml(row.trafficSource || 'Origem não informada')}</td><td class="tracking-number">${formatCount(row.pageViews)}</td><td class="tracking-number">${formatCount(row.outboundClicks)}</td><td class="tracking-number">${rowRate === null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(rowRate)}%`}</td></tr>`;
    }).join('');
    const pagination = rows.length > pageSize
      ? `<nav class="tracking-pagination tracking-gurumedia-pagination" aria-label="Paginação das visitas e cliques GuruMedia"><span>Linhas ${formatCount(firstRowIndex + 1)}–${formatCount(Math.min(firstRowIndex + pageSize, rows.length))} de ${formatCount(rows.length)} · Página ${formatCount(state.trafficPage)} de ${formatCount(pageCount)}</span><div><button type="button" class="btn" data-gurumedia-traffic-page="${state.trafficPage - 1}"${state.trafficPage <= 1 ? ' disabled' : ''}>Anterior</button><button type="button" class="btn" data-gurumedia-traffic-page="${state.trafficPage + 1}"${state.trafficPage >= pageCount ? ' disabled' : ''}>Próxima</button></div></nav>`
      : '';
    const feedback = state.trafficFeedback
      ? `<p class="tracking-message${state.trafficError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.trafficFeedback)}</p>` : '';
    return `<section class="tracking-panel tracking-clicks-panel tracking-gurumedia-results" aria-label="Visitas e cliques GuruMedia">
      <div class="tracking-table-heading"><div><h2>Visitas e cliques GuruMedia</h2><p>Contagem dos domínios classificados como GuruMedia no Tracker Global.</p></div><span class="tracking-count">${formatCount(rows.length)} linha(s)</span></div>
      <p class="tracking-auto-refresh-note">${escapeHtml(autoStatus)}</p>
      <p class="tracking-connection-note">A MCC Ads é associada pelo produto e pela conta do nome da Track com o vínculo MCC do manifesto. “Não identificada” ou “MCC ambígua” indica que não há uma associação única; esta informação é apenas consultiva e não configura nem envia conversões.</p>
      <div class="tracking-summary" aria-label="Resumo de visitas e cliques GuruMedia">
        <div class="tracking-kpi"><span>Visitas · page_view</span><strong>${formatCount(summary.pageViews)}</strong></div>
        <div class="tracking-kpi"><span>Cliques de saída · outbound_click</span><strong>${formatCount(summary.outboundClicks)}</strong></div>
        <div class="tracking-kpi"><span>Cliques ÷ visitas</span><strong>${rate === null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(rate)}%`}</strong></div>
        <div class="tracking-kpi"><span>Tracks no período</span><strong>${formatCount(trackCount)}</strong></div>
      </div>
      ${report ? `<div class="tracking-file-details"><span><strong>Período UTC:</strong> ${escapeHtml(report.startDate)} a ${escapeHtml(report.endDate)}</span><span><strong>Relatório gerado UTC:</strong> ${escapeHtml(report.generatedAtUtc)}</span><span><strong>Cache local atualizado:</strong> ${escapeHtml(formatUtcTimestamp(state.trafficCacheSavedAtUtc))}</span></div>${body ? `<div class="tracking-table-wrap"><table class="tracking-table tracking-gurumedia-table"><thead><tr><th>Data UTC</th><th>Track</th><th>Pre-sell</th><th>MCC Ads</th><th>Origem do tráfego</th><th>Visitas · page_view</th><th>Cliques de saída · outbound_click</th><th>Taxa de eventos</th></tr></thead><tbody>${body}</tbody></table></div>${pagination}` : '<div class="tracking-empty"><p class="tracking-instruction">Não há visitas ou cliques GuruMedia para este período e filtros.</p></div>'}` : '<div class="tracking-empty"><p class="tracking-instruction">A consulta de visitas e cliques ainda não foi executada.</p></div>'}
      ${feedback}${state.trafficCacheWarning ? `<p class="tracking-connection-note is-error">${escapeHtml(state.trafficCacheWarning)}</p>` : ''}
    </section>`;
  }

  function postbackUrl() {
    if (!GURUMEDIA_POSTBACK_TOKEN_PATTERN.test(state.postbackToken)) return '';
    const mappings = buildGuruMediaPostbackMacroParams(state.postbackMacros);
    if (!mappings) return '';
    const params = [
      `token=${encodeURIComponent(state.postbackToken)}`,
      ...mappings,
    ];
    return `${TRACKING_GURUMEDIA_POSTBACK_URL}?${params.join('&')}`;
  }

  function postbackUrlPreview() {
    const generated = postbackUrl();
    if (generated) return generated.replace(/([?&]token=)[^&]*/, '$1••••••••');
    const requiredMappings = [state.postbackMacros.transactionId, state.postbackMacros.offerId,
      state.postbackMacros.payoutAmount, state.postbackMacros.currency, state.postbackMacros.conversionTime];
    if (requiredMappings.some(macro => !GURUMEDIA_MACRO_PATTERN.test(macro))) {
      return 'Preencha os macros obrigatórios, incluindo ID da oferta e horário da conversão, com os valores entre chaves do seletor Add Macro da GuruMedia.';
    }
    const mappings = buildGuruMediaPostbackMacroParams(state.postbackMacros);
    if (!mappings) return 'Revise os campos de macro: use os valores entre chaves mostrados pelo seletor Add Macro da GuruMedia.';
    return `${TRACKING_GURUMEDIA_POSTBACK_URL}?token=SEU_SEGREDO_DE_64_CARACTERES&${mappings.join('&')}`;
  }

  function updatePostbackPreview() {
    const preview = root.querySelector('#guruMediaPostbackUrl');
    if (preview) preview.value = postbackUrlPreview();
    const copyUrl = root.querySelector('[data-gurumedia-action="copy-postback-url"]');
    if (copyUrl) copyUrl.disabled = !postbackUrl();
    const copySnippet = root.querySelector('[data-gurumedia-action="copy-postback-config"]');
    if (copySnippet) copySnippet.disabled = !GURUMEDIA_POSTBACK_TOKEN_PATTERN.test(state.postbackToken);
  }

  function postbackCheckSummaryHtml() {
    if (!state.activePostbackUrl) return '<p class="tracking-gurumedia-check-status">Cole a URL ativa para conferir seus parâmetros. A tela não consulta a conta GuruMedia.</p>';
    const result = inspectGuruMediaPostbackUrl(state.activePostbackUrl);
    const status = result.valid
      ? 'Endpoint e macros conferem com o padrão desta tela.'
      : 'Há diferenças entre a URL ativa e o padrão esperado.';
    const endpoint = result.endpointMatches ? 'Endpoint do Hub: confere' : 'Endpoint do Hub: diferente';
    const token = result.tokenPresent ? 'Segredo: presente (valor oculto)' : 'Segredo: ausente ou repetido';
    const checkRows = result.checks.map(({ parameter, expectedMacro, status: checkStatus, required }) => {
      const label = checkStatus === 'ok'
        ? `${parameter} = ${expectedMacro}`
        : checkStatus === 'optional-missing'
          ? `${parameter}: ausente (opcional)`
          : `${parameter}: corrigir para ${expectedMacro}${required ? ' · obrigatório' : ''}`;
      const className = checkStatus === 'ok' || checkStatus === 'optional-missing' ? 'is-ok' : 'is-error';
      return `<li class="${className}">${escapeHtml(label)}</li>`;
    }).join('');
    return `<p class="tracking-gurumedia-check-status${result.valid ? ' is-ok' : ' is-error'}" role="status" aria-live="polite">${escapeHtml(status)}</p><ul><li class="${result.endpointMatches ? 'is-ok' : 'is-error'}">${escapeHtml(endpoint)}</li><li class="${result.tokenPresent ? 'is-ok' : 'is-error'}">${escapeHtml(token)}</li>${checkRows}</ul>`;
  }

  function updatePostbackCheck() {
    const result = root.querySelector('#guruMediaPostbackCheckResult');
    if (result) result.innerHTML = postbackCheckSummaryHtml();
  }

  async function copyPostbackValue(value, successMessage) {
    if (!clipboard?.writeText) {
      state.postbackMessage = 'A área de transferência não está disponível neste navegador.';
      state.postbackError = true;
    } else {
      try {
        await clipboard.writeText(value);
        state.postbackMessage = successMessage;
        state.postbackError = false;
      } catch {
        state.postbackMessage = 'Não foi possível copiar; selecione o valor e copie manualmente.';
        state.postbackError = true;
      }
    }
    const message = root.querySelector('#guruMediaPostbackMessage');
    if (message) {
      message.textContent = state.postbackMessage;
      message.classList.toggle('is-error', state.postbackError);
    }
  }

  function handlePostbackAction(action) {
    if (action === 'generate-postback-token') {
      try {
        const cryptoImpl = root.ownerDocument?.defaultView?.crypto || globalThis.crypto;
        if (typeof cryptoImpl?.getRandomValues !== 'function') throw new Error('Geração segura não está disponível neste navegador.');
        const bytes = cryptoImpl.getRandomValues(new Uint8Array(32));
        state.postbackToken = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
        const field = root.querySelector('#guruMediaPostbackToken');
        if (field) field.value = state.postbackToken;
        state.postbackMessage = 'Segredo gerado nesta aba. Copie o trecho para o tracking-config.php e use a URL correspondente no postback GuruMedia.';
        state.postbackError = false;
      } catch (error) {
        state.postbackMessage = error instanceof Error ? error.message : 'Não foi possível gerar um segredo seguro.';
        state.postbackError = true;
      }
      updatePostbackPreview();
      const message = root.querySelector('#guruMediaPostbackMessage');
      if (message) {
        message.textContent = state.postbackMessage;
        message.classList.toggle('is-error', state.postbackError);
      }
    } else if (action === 'copy-postback-url') {
      const url = postbackUrl();
      if (url) void copyPostbackValue(url, 'URL completa copiada. Ela contém o segredo do postback; cole no painel da GuruMedia e mantenha-a privada.');
    } else if (action === 'copy-postback-config') {
      if (GURUMEDIA_POSTBACK_TOKEN_PATTERN.test(state.postbackToken)) {
        void copyPostbackValue(`'gurumedia_postback_token' => '${state.postbackToken}',`, 'Trecho copiado. Acrescente-o ao array existente em tracking-config.php, sem substituir o restante do arquivo.');
      }
    }
  }

  function render() {
    if (!root.isConnected) return;
    let rangeLabel = 'período inválido';
    try {
      const range = dateRangeFromInputs();
      rangeLabel = `${range.startDate} a ${range.endDate} UTC`;
    } catch {}
    const rows = filteredRows();
    const lastRefresh = state.lastRefreshAtUtc ? formatUtcTimestamp(state.lastRefreshAtUtc) : 'ainda não consultado';
    const timeCoverage = state.report?.summary.conversionTimeCoverage;
    const timeCoverageDetails = timeCoverage
      ? `<span><strong>Cobertura do período:</strong> ${formatCount(timeCoverage.salesWithConversionTime)} de ${formatCount(timeCoverage.salesCount)} venda(s) com horário real · ${formatCount(timeCoverage.salesMissingConversionTime)} sem horário</span>`
      : '';
    const tokenMessage = state.apiToken
      ? `Token do Hub compartilhado com Tracking ClickBank${state.tokenInvalid ? ' · há um valor lembrado inválido' : ''}.`
      : 'Configure o token de leitura compartilhado do Hub em Configurações globais para consultar vendas e métricas.';
    const autoStatus = `Visitas e cliques atualizam ao abrir e a cada 5 minutos; vendas atualizam ao abrir e a cada 30 minutos. Última consulta de vendas: ${lastRefresh}. Período: ${rangeLabel}.`;
    const reportDetails = state.report
      ? `<div class="tracking-file-details"><span><strong>Período UTC:</strong> ${escapeHtml(state.report.startDate)} a ${escapeHtml(state.report.endDate)}</span><span><strong>Relatório gerado UTC:</strong> ${escapeHtml(state.report.generatedAtUtc)}</span>${timeCoverageDetails}<span><strong>Cache local atualizado:</strong> ${escapeHtml(formatUtcTimestamp(state.cacheSavedAtUtc))}</span><span><strong>Postbacks não associados:</strong> ${formatCount(state.report.summary.unmatchedCallbacks + state.report.summary.ambiguousCallbacks)}</span></div>`
      : '';
    const feedback = state.feedback
      ? `<p class="tracking-message${state.feedbackError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.feedback)}</p>` : '';
    root.innerHTML = `<div class="tracking-session tracking-gurumedia-session">
      <section class="tracking-panel tracking-gurumedia-postback-panel" aria-label="Configuração do postback GuruMedia">
        <div class="tracking-intro-head tracking-gurumedia-postback-heading">
          <div class="tracking-intro-copy"><h2>Configuração do postback GuruMedia</h2><p>O postback é configurado uma vez na conta GuruMedia e pode atender várias Tracks; o <code>sub6</code> do clique identifica a Pre-Sell.</p></div>
          <div class="tracking-intro-head-actions"><button type="button" class="btn tracking-connection-config-toggle" data-gurumedia-action="toggle-postback-config" aria-controls="guruMediaPostbackConfig" aria-expanded="${state.postbackConfigExpanded ? 'true' : 'false'}">${state.postbackConfigExpanded ? 'Recolher configurações' : 'Exibir configurações'}</button></div>
        </div>
        <div id="guruMediaPostbackConfig" class="tracking-connection-config"${state.postbackConfigExpanded ? '' : ' hidden'}>
        <div class="tracking-domain-token-grid tracking-gurumedia-token-grid">
          <label class="tracking-token-field" for="guruMediaPostbackToken"><span>Segredo em tracking-config.php</span><input id="guruMediaPostbackToken" type="password" inputmode="text" autocomplete="new-password" spellcheck="false" maxlength="64" placeholder="64 caracteres hexadecimais; mesmo valor no servidor" value="${escapeHtml(state.postbackToken)}"></label>
          <div class="tracking-domain-actions"><button type="button" class="btn" data-gurumedia-action="generate-postback-token">Gerar segredo</button><button type="button" class="btn" data-gurumedia-action="copy-postback-config"${GURUMEDIA_POSTBACK_TOKEN_PATTERN.test(state.postbackToken) ? '' : ' disabled'}>Copiar trecho para o servidor</button></div>
        </div>
        <p class="tracking-connection-note">O segredo fica somente na memória desta aba. Use o mesmo valor em <code>tracking-config.php</code> e na URL abaixo. O trecho copiado contém apenas a chave a acrescentar ao array existente; não substitua o arquivo privado inteiro.</p>
        <div class="tracking-email-grid tracking-gurumedia-macro-grid">
          <label class="tracking-token-field" for="guruMediaTransactionMacro"><span>ID único da venda · obrigatório</span><input id="guruMediaTransactionMacro" type="text" autocomplete="off" spellcheck="false" maxlength="64" value="${escapeHtml(state.postbackMacros.transactionId)}"></label>
          <label class="tracking-token-field" for="guruMediaClickMacro"><span>ID do clique do Hub · obrigatório</span><input id="guruMediaClickMacro" type="text" readonly value="{sub6}"><small>O script envia o ID do clique em <code>sub6</code>.</small></label>
          <label class="tracking-token-field" for="guruMediaOfferIdMacro"><span>ID da oferta · necessário para identificação automática</span><input id="guruMediaOfferIdMacro" type="text" autocomplete="off" spellcheck="false" maxlength="64" value="${escapeHtml(state.postbackMacros.offerId)}"></label>
          <label class="tracking-token-field" for="guruMediaOfferNameMacro"><span>Nome da oferta · opcional</span><input id="guruMediaOfferNameMacro" type="text" autocomplete="off" spellcheck="false" maxlength="64" value="${escapeHtml(state.postbackMacros.offerName)}"></label>
          <label class="tracking-token-field" for="guruMediaPayoutMacro"><span>Payout · obrigatório</span><input id="guruMediaPayoutMacro" type="text" autocomplete="off" spellcheck="false" maxlength="64" value="${escapeHtml(state.postbackMacros.payoutAmount)}"></label>
          <label class="tracking-token-field" for="guruMediaCurrencyMacro"><span>Moeda do payout · obrigatória</span><input id="guruMediaCurrencyMacro" type="text" autocomplete="off" spellcheck="false" maxlength="64" value="${escapeHtml(state.postbackMacros.currency)}"></label>
          <label class="tracking-token-field" for="guruMediaConversionTimeMacro"><span>Horário real da conversão · obrigatório</span><input id="guruMediaConversionTimeMacro" type="text" autocomplete="off" spellcheck="false" maxlength="64" value="${escapeHtml(state.postbackMacros.conversionTime)}"><small>Envia <code>{timestamp}</code> para gravar <code>conversion_at_utc</code>.</small></label>
        </div>
        <p class="tracking-connection-note">O padrão inclui os parâmetros ativos que você mostrou: <code>conversion_time={timestamp}</code> e <code>offer_id={offer_id}</code>. O ID da oferta permite o aprendizado automático; o horário preserva o momento real da conversão. Use os nomes exatos do menu <strong>Add Macro</strong> da GuruMedia.</p>
        <label class="tracking-token-field" for="guruMediaPostbackUrl"><span>URL para cadastrar em GuruMedia → Postbacks</span><textarea id="guruMediaPostbackUrl" rows="3" readonly spellcheck="false">${escapeHtml(postbackUrlPreview())}</textarea></label>
        <div class="tracking-domain-actions"><button type="button" class="btn primary" data-gurumedia-action="copy-postback-url"${postbackUrl() ? '' : ' disabled'}>Copiar URL completa</button></div>
        <section class="tracking-gurumedia-postback-check" aria-label="Conferência da URL ativa na GuruMedia">
          <div><h3>Conferir URL ativa</h3><p>Cole a URL copiada de GuruMedia → Postbacks. A conferência roda só nesta aba; a URL e o token não são enviados nem salvos pelo Hub.</p></div>
          <label class="tracking-token-field" for="guruMediaActivePostbackUrl"><span>URL ativa da GuruMedia · mascarada</span><input id="guruMediaActivePostbackUrl" type="password" autocomplete="off" spellcheck="false" maxlength="4096" value="${escapeHtml(state.activePostbackUrl)}" placeholder="Cole aqui a URL ativa do postback"></label>
          <div id="guruMediaPostbackCheckResult">${postbackCheckSummaryHtml()}</div>
          <p class="tracking-connection-note">A conferência valida endpoint, presença do segredo e parâmetros/macros. Ela não confirma se o postback está Active, se usa Conversion/Postback, nem se a GuruMedia já disparou uma venda.</p>
        </section>
        <p id="guruMediaPostbackMessage" class="tracking-message${state.postbackError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.postbackMessage || 'Na GuruMedia, escolha Conversion, Postback e Global se puder coexistir com a Flow. Se não permitir outro Global, use Specific para a oferta de validação; não altere o postback da Flow.')}</p>
        <p class="tracking-connection-note">Este painel monta os dados localmente e não consulta nem grava configuração na GuruMedia. Para o postback realmente registrar vendas, publique o pacote do servidor e execute a migração SQL antes de ativá-lo.</p>
        </div>
      </section>
      <section class="tracking-panel tracking-clicks-panel" aria-label="Relatório de vendas GuruMedia">
        <div class="tracking-intro-head tracking-clicks-head"><div class="tracking-intro-copy"><h2>Vendas GuruMedia</h2><p>Consulta os postbacks de conversão associados às Tracks. O clique atualiza também o Faturamento local deste navegador; a conciliação com agregados MCC e o envio ao Google Ads ficam fora desta etapa.</p></div>
          <div class="tracking-connection-actions"><button type="button" class="btn primary" data-gurumedia-action="refresh"${state.pending ? ' disabled' : ''}>${state.pending ? 'Atualizando…' : 'Atualizar vendas e cliques'}</button></div></div>
        <p class="tracking-connection-note">Ao clicar em atualizar, o Hub também tenta identificar a campanha de cada venda elegível usando o GCLID do clique e o ClickView da conta associada. A consulta é somente leitura e não envia conversões ao Google Ads.</p>
        <p class="tracking-auto-refresh-note">${escapeHtml(autoStatus)}</p>
        <p class="tracking-connection-note">${escapeHtml(tokenMessage)} A consulta automática atualiza esta tela; as vendas e as métricas de cliques são agregadas e armazenadas separadamente.</p>
        ${!state.apiToken ? '<p class="tracking-connection-note is-error"><a class="tracking-presell-link" href="/?view=tracking-settings">Abrir Configurações globais para informar o token</a></p>' : ''}
        <div class="tracking-clicks-date-range">
          <label class="tracking-token-field" for="guruMediaStartDate"><span>De · data UTC</span><input id="guruMediaStartDate" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="10" placeholder="dd/mm/aaaa" value="${escapeHtml(state.startDateInput)}"${state.pending ? ' disabled' : ''}></label>
          <label class="tracking-token-field" for="guruMediaEndDate"><span>Até · data UTC</span><input id="guruMediaEndDate" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="10" placeholder="dd/mm/aaaa" value="${escapeHtml(state.endDateInput)}"${state.pending ? ' disabled' : ''}></label>
          <label class="tracking-token-field" for="guruMediaDatePreset"><span>Período rápido</span><select id="guruMediaDatePreset"${state.pending ? ' disabled' : ''}>
            <option value="today"${state.datePreset === 'today' ? ' selected' : ''}>Hoje UTC</option><option value="yesterday"${state.datePreset === 'yesterday' ? ' selected' : ''}>Ontem UTC</option><option value="7-days"${state.datePreset === '7-days' ? ' selected' : ''}>7 Dias UTC</option><option value="30-days"${state.datePreset === '30-days' ? ' selected' : ''}>30 Dias UTC</option><option value="this-month"${state.datePreset === 'this-month' ? ' selected' : ''}>Este Mês UTC</option><option value="last-month"${state.datePreset === 'last-month' ? ' selected' : ''}>Mês Passado UTC</option>
          </select></label>
        </div>
        <p class="tracking-date-format-note tracking-instruction">Formato brasileiro: <strong>dd/mm/aaaa</strong>. O período inicial, as opções rápidas e as datas informadas usam o calendário UTC. No horário de Brasília, a data UTC pode avançar no começo da noite.</p>
        ${feedback}
        ${state.campaignFeedback ? `<p class="tracking-connection-note${state.campaignError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.campaignFeedback)}</p>` : ''}
        ${state.billingSyncFeedback ? `<p class="tracking-connection-note${state.billingSyncError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.billingSyncFeedback)}</p>` : ''}
        ${state.domainCacheWarning ? `<p class="tracking-connection-note${state.domainCacheWarning.startsWith('Lista de Tracks atualizada') ? '' : ' is-error'}" role="status" aria-live="polite">${escapeHtml(state.domainCacheWarning)}</p>` : ''}
      </section>
      ${renderTraffic()}
      <section class="tracking-panel tracking-clicks-panel tracking-gurumedia-results" aria-label="Vendas registradas">
        ${state.report ? `${renderSummary(rows)}${reportDetails}${renderFilterOptions(state.report.rows)}${renderTable(rows)}${renderSaleDetails(state.report, filteredSaleDetails())}` : '<div class="tracking-empty"><h2>Relatório ainda não consultado</h2><p class="tracking-instruction">Abra esta tela com o token do Hub configurado para carregar as vendas associadas às Tracks.</p></div>'}
        ${state.cacheWarning ? `<p class="tracking-connection-note is-error">${escapeHtml(state.cacheWarning)}</p>` : ''}
      </section>
    </div>`;
  }

  async function loadCacheForRange(range) {
    try {
      const snapshot = await readCache();
      if (snapshot && snapshot.report?.startDate === range.startDate && snapshot.report?.endDate === range.endDate) {
        state.report = snapshot.report;
        state.cacheSavedAtUtc = snapshot.savedAtUtc;
        state.feedback = 'Dados carregados do cache local. Use Atualizar do servidor para buscar os dados mais recentes.';
        state.feedbackError = false;
      }
    } catch (error) {
      state.cacheWarning = error instanceof Error ? error.message : 'Não foi possível ler o cache local GuruMedia.';
    }
    try {
      const snapshots = await readTrafficCache();
      state.trafficSnapshots = Array.isArray(snapshots) ? snapshots : [];
      const cached = resolveTrackingClicksCache(state.trafficSnapshots, range, 'gurumedia');
      state.trafficReport = cached.report;
      state.trafficCacheSavedAtUtc = cached.meta.cacheUpdatedAtUtc || '';
      if (!cached.report && cached.meta.unsegmentedSnapshotCount) {
        state.trafficFeedback = 'O cache antigo contém eventos sem separação por plataforma e foi preservado, mas não é exibido aqui. Atualize do servidor para carregar somente GuruMedia.';
      }
    } catch (error) {
      state.trafficCacheWarning = error instanceof Error ? error.message : 'Não foi possível ler o cache local de cliques.';
    }
    render();
  }

  async function refreshCampaignAttribution(report, range) {
    if (!Array.isArray(report?.saleDetails)) {
      state.campaignFeedback = 'Campanhas não consultadas: publique o serviço GuruMedia atualizado para habilitar ClickView.';
      state.campaignError = true;
      return report;
    }
    if (!report.saleDetails.length) {
      state.campaignFeedback = 'ClickView: não há vendas individuais no período para associar a campanhas.';
      state.campaignError = false;
      return report;
    }
    const { tracks, saleStatuses } = campaignTrackAccounts(report.saleDetails);
    if (!tracks.length) {
      state.campaignFeedback = 'ClickView não consultado: nenhuma venda tem IDs completos e únicos de conta Google Ads e MCC no manifesto. Confira os IDs numéricos de 10 dígitos em Contas ou no Mapa por Conta.';
      state.campaignError = false;
      return applyCampaignAttributions(report, { rows: [] }, saleStatuses);
    }
    try {
      const result = await fetchGuruMediaCampaignAttribution(state.apiToken, range, tracks);
      state.campaignFeedback = campaignFeedbackText(result, saleStatuses);
      state.campaignError = result.summary.lookup_error_count > 0;
      return applyCampaignAttributions(report, result, saleStatuses);
    } catch (error) {
      state.campaignFeedback = `Vendas atualizadas, mas a consulta ClickView falhou: ${error instanceof Error ? error.message : 'erro inesperado'}`;
      state.campaignError = true;
      const errorStatuses = new Map(saleStatuses);
      for (const sale of report.saleDetails) {
        const key = saleDetailIdentity(sale);
        if (saleStatuses.get(key)?.status === 'not_checked') errorStatuses.set(key, { status: 'lookup_error' });
      }
      const previous = takeByIdentity(state.report?.saleDetails);
      const merged = {
        ...report,
        saleDetails: report.saleDetails.map(sale => {
          const key = saleDetailIdentity(sale);
          const old = previous.get(key)?.shift();
          return { ...sale, campaignAttribution: old?.campaignAttribution || errorStatuses.get(key) || { status: 'lookup_error' } };
        }),
      };
      return merged;
    }
  }

  async function refresh({ automatic = false, syncBilling: requestBillingSync = false, resolveCampaigns = false } = {}) {
    if (state.pending) return;
    let range;
    try { range = dateRangeFromInputs(); }
    catch (error) { state.feedback = error.message; state.feedbackError = true; render(); return; }
    if (!state.apiToken) {
      state.feedback = 'Configure o token de leitura compartilhado do Hub em Configurações globais para consultar vendas GuruMedia.';
      state.feedbackError = true;
      render();
      return;
    }
    state.pending = true;
    if (resolveCampaigns) {
      state.campaignFeedback = '';
      state.campaignError = false;
    }
    const shouldRefreshSales = !automatic || !state.lastRefreshAtUtc
      || nowFn().getTime() - Date.parse(state.lastRefreshAtUtc) >= 30 * 60 * 1000;
    const shouldSyncBilling = requestBillingSync || (automatic && shouldRefreshSales);
    if (shouldSyncBilling) {
      state.billingSyncFeedback = '';
      state.billingSyncError = false;
    }
    state.feedback = automatic
      ? shouldRefreshSales ? 'Atualizando vendas e métricas GuruMedia automaticamente…' : 'Atualizando métricas GuruMedia automaticamente…'
      : 'Consultando vendas e métricas GuruMedia no servidor…';
    state.feedbackError = false;
    render();
    const domainAdminToken = !automatic ? readDomainAdminToken().token : '';
    const domainRequest = automatic
      ? Promise.resolve(null)
      : domainAdminToken
        ? fetchDomains(domainAdminToken).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }))
        : Promise.resolve({ status: 'skipped', reason: 'Configure o token administrativo em Integrações → Configurações globais.' });
    const [salesResult, trafficResult, domainsResult] = await Promise.all([
      shouldRefreshSales
        ? fetchReport(state.apiToken, range).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }))
        : Promise.resolve(null),
      fetchTrafficReport(state.apiToken, range, { platform: 'gurumedia', includeTrafficSource: true })
        .then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })),
      domainRequest,
    ]);
    if (domainsResult) {
      if (domainsResult.status === 'fulfilled') {
        try {
          const saved = saveDomainCache(domainsResult.value);
          state.domainCacheWarning = saved?.saved
            ? `Lista de Tracks atualizada para a Curadoria em ${formatUtcTimestamp(saved.updatedAtUtc)}.`
            : 'Lista de Tracks consultada, mas não foi possível atualizar o cache local usado pela Curadoria.';
        } catch (error) {
          state.domainCacheWarning = `Lista de Tracks consultada, mas não foi possível atualizar o cache local usado pela Curadoria: ${error instanceof Error ? error.message : 'erro de armazenamento'}.`;
        }
      } else if (domainsResult.status === 'skipped') {
        state.domainCacheWarning = `Lista de Tracks não atualizada para a Curadoria: ${domainsResult.reason}`;
      } else {
        const reason = domainsResult.reason;
        state.domainCacheWarning = `Lista de Tracks não atualizada para a Curadoria: ${reason instanceof Error ? reason.message : 'falha na consulta administrativa'}. O último cache local foi preservado.`;
      }
    }
    if (salesResult?.status === 'fulfilled') {
      state.report = retainCampaignAttributions(salesResult.value, state.report);
      try {
        state.report = mergeGuruMediaCampaignAttributions(state.report, await readCampaignAttributions());
      } catch (error) {
        state.campaignFeedback = `Atribuições ClickView já salvas não puderam ser carregadas: ${error instanceof Error ? error.message : 'erro de armazenamento local'}.`;
        state.campaignError = true;
      }
      if (resolveCampaigns) state.report = await refreshCampaignAttribution(state.report, range);
      const refreshedAt = nowFn();
      state.lastRefreshAtUtc = refreshedAt.toISOString();
      state.feedback = `Consulta concluída: ${formatCount(state.report.summary.salesCount)} venda(s) associada(s) no período.`;
      state.feedbackError = false;
      state.cacheWarning = '';
      if (!automatic) {
        try {
          const snapshot = await saveCache(state.report, { now: nowFn });
          state.cacheSavedAtUtc = snapshot.savedAtUtc;
        } catch (error) {
          state.cacheWarning = error instanceof Error ? `Consulta concluída, mas não foi possível salvar o cache local de vendas: ${error.message}` : 'Consulta concluída, mas não foi possível salvar o cache local de vendas.';
        }
      }
      if (shouldSyncBilling) {
        try {
          const billing = await syncBilling(state.apiToken, { nowFn, scope:automatic ? 'incremental' : 'full' });
          const prefix = automatic ? 'Faturamento local sincronizado automaticamente' : 'Faturamento local';
          const pieces = [`${prefix}: ${formatCount(billing.inserted)} nova(s), ${formatCount(billing.updated)} atualizada(s), ${formatCount(billing.unchanged)} sem alteração.`];
          if (billing.receivedTimeFallback) pieces.push(`${formatCount(billing.receivedTimeFallback)} venda(s) ficaram com data do recebimento porque não tinham horário real de conversão.`);
          if (billing.missingCommission) pieces.push(`${formatCount(billing.missingCommission)} venda(s) sem comissão válida foram ignoradas.`);
          if (billing.unsupportedCurrency) pieces.push(`${formatCount(billing.unsupportedCurrency)} venda(s) em moeda não suportada foram ignoradas, sem conversão cambial.`);
          if (billing.missingTime) pieces.push(`${formatCount(billing.missingTime)} venda(s) sem horário utilizável foram ignoradas.`);
          if (billing.conflicts) pieces.push(`${formatCount(billing.conflicts)} conflito(s) de origem/ID precisam de revisão.`);
          if (billing.mccReconciliationPending) pieces.push('Possíveis sobreposições com agregados MCC ficam para a Fase 3 de conciliação.');
          state.billingSyncFeedback = pieces.join(' ');
          state.billingSyncError = Boolean(billing.missingCommission || billing.unsupportedCurrency || billing.missingTime || billing.conflicts);
        } catch (error) {
          const retry = automatic ? 'A próxima atualização automática tentará novamente.' : 'Clique novamente para repetir com segurança.';
          state.billingSyncFeedback = `Tracking atualizado, mas a sincronização do Faturamento local falhou: ${error instanceof Error ? error.message : 'erro de armazenamento'}. ${retry}`;
          state.billingSyncError = true;
        }
      }
    } else if (salesResult?.status === 'rejected') {
      const error = salesResult.reason;
      state.feedback = error instanceof Error ? error.message : 'Não foi possível consultar as vendas GuruMedia.';
      state.feedbackError = true;
      if (resolveCampaigns) {
        state.campaignFeedback = 'ClickView não foi consultado porque a atualização de vendas falhou.';
        state.campaignError = true;
      }
    }
    if (trafficResult.status === 'fulfilled') {
      const trafficReport = trafficResult.value;
      state.trafficReport = trafficReport;
      state.trafficLastRefreshAtUtc = nowFn().toISOString();
      state.trafficFeedback = automatic
        ? `Busca automática concluída: ${formatCount(trafficReport.rows.length)} combinação(ões) agregada(s).`
        : `Consulta concluída: ${formatCount(trafficReport.rows.length)} combinação(ões) agregada(s) de visitas e cliques GuruMedia.`;
      state.trafficError = false;
      state.trafficCacheWarning = '';
      if (!automatic) {
        try {
          await saveTrafficCache(trafficReport);
          state.trafficSnapshots = await readTrafficCache();
          const cached = resolveTrackingClicksCache(state.trafficSnapshots, range, 'gurumedia');
          state.trafficReport = cached.report || trafficReport;
          state.trafficCacheSavedAtUtc = cached.meta.cacheUpdatedAtUtc || nowFn().toISOString();
        } catch (error) {
          state.trafficCacheWarning = error instanceof Error ? `Consulta concluída, mas não foi possível salvar o cache local de métricas: ${error.message}` : 'Consulta concluída, mas não foi possível salvar o cache local de métricas.';
        }
      }
    } else {
      const error = trafficResult.reason;
      state.trafficFeedback = error instanceof Error ? error.message : 'Não foi possível consultar as métricas de cliques GuruMedia.';
      state.trafficError = true;
    }
    try {
      if (salesResult?.status === 'rejected' && trafficResult.status === 'rejected') {
        state.feedback = 'Não foi possível atualizar vendas nem métricas GuruMedia. Confira a API e o token do Hub.';
        state.feedbackError = true;
      }
    } finally {
      state.pending = false;
      render();
      scheduleAutoRefresh();
    }
  }

  async function loadCurrentRange({ syncBilling = false } = {}) {
    state.report = null;
    state.trafficReport = null;
    state.cacheSavedAtUtc = '';
    state.trafficCacheSavedAtUtc = '';
    state.feedback = '';
    state.trafficFeedback = '';
    state.trafficError = false;
    state.productFilter = 'all';
    state.domainFilter = 'all';
    render();
    try { await loadCacheForRange(dateRangeFromInputs()); }
    catch (error) { state.feedback = error.message; state.feedbackError = true; render(); return; }
    await refresh({ syncBilling });
  }

  function clearTimer() {
    if (refreshTimer !== null) clearTimeoutFn?.(refreshTimer);
    refreshTimer = null;
  }

  function scheduleAutoRefresh() {
    clearTimer();
    if (!active || !isVisible() || !setTimeoutFn) return;
    refreshTimer = setTimeoutFn(() => { refresh({ automatic: true }); }, TRACKING_GURUMEDIA_AUTO_REFRESH_INTERVAL_MS);
  }

  function activate() {
    active = true;
    const latestToken = readTrackingHubToken();
    state.apiToken = latestToken.token;
    state.tokenInvalid = latestToken.invalid;
    if (!hasStarted) {
      hasStarted = true;
      void loadCurrentRange({ syncBilling: true });
      return;
    }
    if (isVisible() && !state.lastRefreshAtUtc) void refresh();
    else if (isVisible()) scheduleAutoRefresh();
  }

  function handleDateInputChange() {
    state.startDateInput = root.querySelector('#guruMediaStartDate')?.value || state.startDateInput;
    state.endDateInput = root.querySelector('#guruMediaEndDate')?.value || state.endDateInput;
    state.datePreset = 'custom';
    render();
    void loadCurrentRange();
  }

  root.addEventListener('click', event => {
    const trafficPageButton = event.target.closest?.('[data-gurumedia-traffic-page]');
    if (trafficPageButton) {
      const requestedPage = Number(trafficPageButton.dataset.gurumediaTrafficPage);
      if (Number.isSafeInteger(requestedPage) && requestedPage >= 1) {
        state.trafficPage = requestedPage;
        render();
      }
      return;
    }
    const action = event.target.closest?.('[data-gurumedia-action]')?.dataset.gurumediaAction;
    if (action === 'toggle-postback-config') {
      state.postbackConfigExpanded = !state.postbackConfigExpanded;
      render();
    } else if (action === 'validate-google-ads-sale' || action === 'send-google-ads-sale') {
      const saleKey = event.target.closest?.('[data-gurumedia-action]')?.dataset.saleKey;
      const sale = state.report?.saleDetails?.find(item => item.saleKey === saleKey);
      if (action === 'validate-google-ads-sale') void validateSaleWithGoogleAds(sale);
      else void sendSaleToGoogleAds(sale);
    } else if (action === 'refresh') void refresh({ syncBilling: true, resolveCampaigns: true });
    else if (action) handlePostbackAction(action);
  });
  root.addEventListener('input', event => {
    const values = {
      guruMediaPostbackToken: token => { state.postbackToken = token.trim(); },
      guruMediaTransactionMacro: value => { state.postbackMacros.transactionId = value.trim(); },
      guruMediaOfferIdMacro: value => { state.postbackMacros.offerId = value.trim(); },
      guruMediaOfferNameMacro: value => { state.postbackMacros.offerName = value.trim(); },
      guruMediaPayoutMacro: value => { state.postbackMacros.payoutAmount = value.trim(); },
      guruMediaCurrencyMacro: value => { state.postbackMacros.currency = value.trim(); },
      guruMediaConversionTimeMacro: value => { state.postbackMacros.conversionTime = value.trim(); },
    };
    if (event.target?.id === 'guruMediaActivePostbackUrl') {
      state.activePostbackUrl = String(event.target.value ?? '').trim();
      updatePostbackCheck();
      return;
    }
    const update = values[event.target?.id];
    if (update) {
      update(String(event.target.value ?? ''));
      updatePostbackPreview();
    }
  });
  root.addEventListener('change', event => {
    if (event.target.id === 'guruMediaDatePreset') {
      state.datePreset = event.target.value;
      const range = trackingClicksDateRangeForPreset(state.datePreset, nowFn(), 'UTC');
      state.startDateInput = formatTrackingDatePtBr(range.startDate);
      state.endDateInput = formatTrackingDatePtBr(range.endDate);
      void loadCurrentRange();
    } else if (event.target.id === 'guruMediaStartDate' || event.target.id === 'guruMediaEndDate') {
      handleDateInputChange();
    } else if (event.target.id === 'guruMediaProductFilter') {
      state.productFilter = event.target.value;
      render();
    } else if (event.target.id === 'guruMediaDomainFilter') {
      state.domainFilter = event.target.value;
      render();
    }
  });
  const onVisibilityChange = () => scheduleAutoRefresh();
  documentImpl?.addEventListener?.('visibilitychange', onVisibilityChange);
  if (typeof MutationObserver === 'function' && section) {
    observer = new MutationObserver(() => {
      if (!isVisible()) clearTimer();
      else if (active) scheduleAutoRefresh();
    });
    observer.observe(section, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }
  const controller = {
    render,
    activate,
    deactivate() { active = false; clearTimer(); },
    destroy() {
      active = false;
      clearTimer();
      observer?.disconnect();
      documentImpl?.removeEventListener?.('visibilitychange', onVisibilityChange);
      mountedRoots.delete(root);
    },
  };
  mountedRoots.set(root, controller);
  render();
  return controller;
}
