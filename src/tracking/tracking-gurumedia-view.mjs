import {
  buildGuruMediaPostbackMacroParams,
  formatGuruMediaPayout,
  GURUMEDIA_POSTBACK_ENDPOINT,
  GURUMEDIA_POSTBACK_MACRO_DEFAULTS,
  inspectGuruMediaPostbackUrl,
  guruMediaTrackFilterKey,
  sumGuruMediaPayouts,
  validateGuruMediaSalesDateRange,
} from './tracking-gurumedia-domain.mjs?v=2';
import { fetchGuruMediaSalesReport, fetchTrackingClicksReport, fetchTrackingDomains } from './tracking-service.mjs?v=18';
import { readTrackingHubToken } from './tracking-token-storage.mjs?v=2';
import { readGuruMediaSalesSnapshot, saveGuruMediaSalesSnapshot } from './tracking-gurumedia-storage.mjs?v=1';
import {
  formatTrackingDatePtBr,
  parseTrackingDatePtBr,
  trackingClicksDateRangeForPreset,
  trackingClicksDefaultDateRange,
  resolveTrackingClicksCache,
  summarizeTrackingClicks,
  trackingClicksRate,
} from './tracking-clicks-domain.mjs?v=7';
import { appendTrackingClicksSnapshot, readTrackingClicksSnapshots } from './tracking-clicks-storage.mjs?v=3';
import { resolveTrackMcc } from '../accounts/accounts-presell-domain.mjs?v=3';
import { fetchGoogleAdsConversionActions } from '../google-ads/google-ads-service.mjs?v=7';
import { isGoogleAdsPurchaseUploadAction } from '../google-ads/google-ads-conversion-actions-domain.mjs?v=1';
import {
  readGuruMediaConversionActionSettings,
  removeGuruMediaConversionActionSetting,
  saveGuruMediaConversionActionSetting,
} from './tracking-gurumedia-conversion-actions-storage.mjs?v=1';

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
  readTrafficCache = readTrackingClicksSnapshots,
  saveTrafficCache = appendTrackingClicksSnapshot,
  fetchDomains = fetchTrackingDomains,
  nowFn = () => new Date(),
  setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
  clipboard = globalThis.navigator?.clipboard,
  getAccountRows = () => [],
  fetchConversionActions = fetchGoogleAdsConversionActions,
  readActionSettings = readGuruMediaConversionActionSettings,
  saveActionSetting = saveGuruMediaConversionActionSetting,
  removeActionSetting = removeGuruMediaConversionActionSetting,
} = {}) {
  if (!root) throw new Error('A área da sessão Tracking GuruMedia não foi encontrada.');
  const existing = mountedRoots.get(root);
  if (existing) { existing.render(); existing.activate(); return existing; }
  const tokenState = readTrackingHubToken();
  const actionSettingsState = readActionSettings();
  const initialRange = trackingClicksDefaultDateRange(nowFn());
  const state = {
    report: null,
    trafficReport: null,
    trafficSnapshots: [],
    trafficFeedback: '',
    trafficError: false,
    trafficLastRefreshAtUtc: '',
    trafficCacheSavedAtUtc: '',
    trafficCacheWarning: '',
    domainRows: [],
    apiToken: tokenState.token,
    tokenInvalid: tokenState.invalid,
    startDateInput: formatTrackingDatePtBr(initialRange.startDate),
    endDateInput: formatTrackingDatePtBr(initialRange.endDate),
    datePreset: 'today',
    productFilter: 'all',
    domainFilter: 'all',
    pending: false,
    feedback: '',
    feedbackError: false,
    lastRefreshAtUtc: '',
    cacheSavedAtUtc: '',
    cacheWarning: '',
    postbackConfigExpanded: false,
    postbackToken: '',
    activePostbackUrl: '',
    postbackMacros: {
      ...GURUMEDIA_POSTBACK_MACRO_DEFAULTS,
    },
    postbackMessage: '',
    postbackError: false,
    conversionActionSettings: actionSettingsState.settings || [],
    conversionActionsByMcc: {},
    conversionActionSelections: {},
    conversionActionBusy: {},
    conversionActionMessages: {},
    conversionActionErrors: {},
    conversionActionSettingsInvalid: actionSettingsState.invalid === true,
    conversionActionStorageAvailable: actionSettingsState.available !== false,
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

  function safeAccountRows() {
    try {
      const rows = getAccountRows?.();
      return Array.isArray(rows) ? rows : [];
    }
    catch { return []; }
  }

  function conversionMccRows() {
    const byId = new Map();
    for (const row of safeAccountRows()) {
      const mccCustomerId = String(row?.mccId ?? '').replace(/\D/g, '');
      if (!/^\d{10}$/.test(mccCustomerId)) continue;
      const name = String(row?.mccName ?? '').replace(/\s+/g, ' ').trim() || `MCC ${mccCustomerId}`;
      if (!byId.has(mccCustomerId)) byId.set(mccCustomerId, { mccCustomerId, name });
    }
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name) || left.mccCustomerId.localeCompare(right.mccCustomerId));
  }

  function savedActionForMcc(mccCustomerId) {
    return state.conversionActionSettings.find(item => item.mccCustomerId === mccCustomerId) || null;
  }

  function renderConversionActions() {
    const mccRows = conversionMccRows();
    const body = mccRows.map(mcc => {
      const saved = savedActionForMcc(mcc.mccCustomerId);
      const actions = state.conversionActionsByMcc[mcc.mccCustomerId] || null;
      const selection = Object.hasOwn(state.conversionActionSelections, mcc.mccCustomerId)
        ? state.conversionActionSelections[mcc.mccCustomerId]
        : saved?.resourceName || '';
      const currentActionExists = actions?.some(action => action.resourceName === saved?.resourceName) === true;
      const selectedAction = actions?.find(action => action.resourceName === selection) || null;
      const busy = state.conversionActionBusy[mcc.mccCustomerId] === true;
      const options = actions === null
        ? '<option value="">Carregue as ações desta MCC</option>'
        : `<option value="">Selecione uma ação</option>${saved && !currentActionExists && selection === saved.resourceName ? `<option value="${escapeHtml(saved.resourceName)}" selected disabled>${escapeHtml(saved.name)} · não consta na consulta atual</option>` : ''}${actions.map(action => {
          const eligible = isGoogleAdsPurchaseUploadAction(action);
          const selected = action.resourceName === selection ? ' selected' : '';
          const disabled = eligible ? '' : ' disabled';
          return `<option value="${escapeHtml(action.resourceName)}"${selected}${disabled}>${escapeHtml(action.name)} · ${escapeHtml(action.status)} · ${escapeHtml(action.type)} · ${escapeHtml(action.category)}${eligible ? '' : ' · incompatível'}</option>`;
        }).join('')}`;
      const detail = state.conversionActionMessages[mcc.mccCustomerId]
        || (saved ? `Salva neste navegador em ${formatUtcTimestamp(saved.savedAtUtc)}.` : 'Nenhuma ação associada a esta MCC.');
      const error = state.conversionActionErrors[mcc.mccCustomerId];
      const selectId = `guruMediaConversionAction-${mcc.mccCustomerId}`;
      return `<tr>
        <td>${escapeHtml(mcc.name)}</td>
        <td><code>${escapeHtml(mcc.mccCustomerId)}</code></td>
        <td><label class="tracking-token-field tracking-gurumedia-action-field" for="${selectId}"><span>Ação de compra · importação de cliques</span><select id="${selectId}" data-gurumedia-conversion-mcc="${mcc.mccCustomerId}"${actions === null || busy ? ' disabled' : ''}>${options}</select>${saved && !currentActionExists ? `<small class="tracking-gurumedia-action-warning">A ação salva não apareceu no inventário atual. Consulte a lista antes de reutilizá-la.</small>` : ''}</label></td>
        <td class="tracking-gurumedia-resource">${escapeHtml(selectedAction?.resourceName || saved?.resourceName || '—')}</td>
        <td>${escapeHtml(selectedAction?.status || saved?.status || '—')}</td>
        <td><div class="tracking-gurumedia-action-buttons"><button type="button" class="btn" data-gurumedia-action="load-conversion-actions" data-gurumedia-mcc="${mcc.mccCustomerId}"${busy ? ' disabled' : ''}>${busy ? 'Consultando…' : actions === null ? 'Carregar ações' : 'Atualizar ações'}</button><button type="button" class="btn primary" data-gurumedia-action="save-conversion-action" data-gurumedia-mcc="${mcc.mccCustomerId}"${!isGoogleAdsPurchaseUploadAction(selectedAction) || busy ? ' disabled' : ''}>Salvar</button>${saved ? `<button type="button" class="btn" data-gurumedia-action="remove-conversion-action" data-gurumedia-mcc="${mcc.mccCustomerId}"${busy ? ' disabled' : ''}>Remover</button>` : ''}</div><small class="tracking-gurumedia-action-message${error ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(error || detail)}</small></td>
      </tr>`;
    }).join('');
    const storageMessage = state.conversionActionSettingsInvalid
      ? '<p class="tracking-connection-note is-error">A configuração local salva não pôde ser lida. Ela foi preservada; não grave uma nova escolha até conferir o armazenamento do navegador.</p>'
      : !state.conversionActionStorageAvailable
        ? '<p class="tracking-connection-note is-error">O navegador não permite gravar a associação local nesta origem.</p>'
        : '';
    return `<section class="tracking-panel tracking-clicks-panel tracking-gurumedia-conversion-actions" aria-label="Ações de conversão Google Ads por MCC">
      <div class="tracking-table-heading"><div><h2>Ação de conversão Google Ads por MCC</h2><p>As Tracks GuruMedia herdam a ação pela MCC identificada no manifesto. A escolha fica neste navegador; esta tela ainda não envia conversões ao Google Ads.</p></div></div>
      ${storageMessage}
      ${mccRows.length ? `<div class="tracking-table-wrap"><table class="tracking-table tracking-gurumedia-action-table"><thead><tr><th>MCC do manifesto</th><th>ID da MCC</th><th>Ação selecionada</th><th>Resource name</th><th>Status</th><th>Ações</th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="tracking-empty"><p>Não há MCCs com ID completo no manifesto carregado. Carregue a base MCC antes de configurar uma ação.</p></div>'}
      <p class="tracking-connection-note">A consulta lista ações existentes. Só ficam selecionáveis as ações ativas do tipo <code>UPLOAD_CLICKS</code> e categoria <code>PURCHASE</code>. A seleção não cria nem altera ações no Google Ads e não inicia envio.</p>
    </section>`;
  }

  function mccDescription(mcc) {
    if (mcc.status === 'identified') return `MCC associada à conta ${mcc.account}.`;
    if (mcc.status === 'ambiguous') return 'O produto/conta aparece associado a mais de uma MCC.';
    return 'Não foi possível associar o produto e a conta do Track a uma MCC do manifesto.';
  }

  function trafficTrackLabel(row) { return row.productLabel || row.productKey || 'Produto não identificado'; }

  function renderTraffic() {
    const report = state.trafficReport;
    const rows = report?.rows || [];
    const summary = summarizeTrackingClicks(rows);
    const trackCount = new Set(rows.map(row => JSON.stringify([row.productKey, row.presellHost]))).size;
    const rate = trackingClicksRate(summary.outboundClicks, summary.pageViews);
    const last = state.trafficLastRefreshAtUtc ? formatUtcTimestamp(state.trafficLastRefreshAtUtc) : 'ainda não consultado';
    const autoStatus = `Métricas atualizadas ao abrir e a cada 5 minutos enquanto esta tela estiver ativa. Última consulta: ${last}.`;
    const accountRows = safeAccountRows();
    const body = rows.map(row => {
      const rowRate = trackingClicksRate(row.outboundClicks, row.pageViews);
      const mcc = resolveTrackMcc(accountRows,row);
      const hostCell = row.presellHost
        ? `<a class="tracking-presell-link" href="https://${encodeURIComponent(row.presellHost)}/" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(row.presellHost)}</code></a>`
        : '<span>Domínio não identificado</span>';
      return `<tr><td>${escapeHtml(formatTrackingDatePtBr(row.dateUtc))}</td><td>${escapeHtml(trafficTrackLabel(row))}${row.productKey ? `<span class="tracking-muted-value">${escapeHtml(row.productKey)}</span>` : ''}</td><td>${hostCell}</td><td title="${escapeHtml(mccDescription(mcc))}">${escapeHtml(mcc.label)}</td><td class="tracking-number">${formatCount(row.pageViews)}</td><td class="tracking-number">${formatCount(row.outboundClicks)}</td><td class="tracking-number">${rowRate === null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(rowRate)}%`}</td></tr>`;
    }).join('');
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
      ${report ? `<div class="tracking-file-details"><span><strong>Período UTC:</strong> ${escapeHtml(report.startDate)} a ${escapeHtml(report.endDate)}</span><span><strong>Relatório gerado UTC:</strong> ${escapeHtml(report.generatedAtUtc)}</span><span><strong>Cache local atualizado:</strong> ${escapeHtml(formatUtcTimestamp(state.trafficCacheSavedAtUtc))}</span></div>${body ? `<div class="tracking-table-wrap"><table class="tracking-table tracking-gurumedia-table"><thead><tr><th>Data UTC</th><th>Track</th><th>Pre-sell</th><th>MCC Ads</th><th>Visitas · page_view</th><th>Cliques de saída · outbound_click</th><th>Taxa de eventos</th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="tracking-empty"><p class="tracking-instruction">Não há visitas ou cliques GuruMedia para este período e filtros.</p></div>'}` : '<div class="tracking-empty"><p class="tracking-instruction">A consulta de visitas e cliques ainda não foi executada.</p></div>'}
      ${feedback}${state.trafficCacheWarning ? `<p class="tracking-connection-note is-error">${escapeHtml(state.trafficCacheWarning)}</p>` : ''}
    </section>`;
  }

  async function loadConversionActions(mccCustomerId) {
    const id = String(mccCustomerId ?? '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(id)) return;
    if (!state.apiToken) {
      state.conversionActionErrors[id] = 'Configure o token do Hub em Configurações globais antes de consultar as ações.';
      render();
      return;
    }
    state.conversionActionBusy = { ...state.conversionActionBusy, [id]: true };
    state.conversionActionErrors = { ...state.conversionActionErrors, [id]: '' };
    state.conversionActionMessages = { ...state.conversionActionMessages, [id]: 'Consultando ações de conversão na MCC…' };
    render();
    try {
      const result = await fetchConversionActions({ managerCustomerId: id, customerId: id }, { token: state.apiToken });
      state.conversionActionsByMcc = { ...state.conversionActionsByMcc, [id]: result.actions };
      state.conversionActionMessages = {
        ...state.conversionActionMessages,
        [id]: `${formatCount(result.actions.length)} ação(ões) consultada(s) · ${formatUtcTimestamp(result.generatedAtUtc)}.`,
      };
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: '' };
    } catch (error) {
      state.conversionActionErrors = {
        ...state.conversionActionErrors,
        [id]: error instanceof Error ? error.message : 'Não foi possível consultar as ações desta MCC.',
      };
    } finally {
      state.conversionActionBusy = { ...state.conversionActionBusy, [id]: false };
      render();
    }
  }

  function saveConversionAction(mccCustomerId) {
    const id = String(mccCustomerId ?? '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(id)) return;
    if (state.conversionActionSettingsInvalid || !state.conversionActionStorageAvailable) {
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: 'O armazenamento local está indisponível ou inválido; nenhuma associação foi alterada.' };
      render();
      return;
    }
    const resourceName = state.conversionActionSelections[id]
      ?? root.querySelector(`[data-gurumedia-conversion-mcc="${id}"]`)?.value
      ?? '';
    const selected = (state.conversionActionsByMcc[id] || []).find(action => action.resourceName === resourceName);
    if (!isGoogleAdsPurchaseUploadAction(selected)) {
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: 'Escolha uma ação ativa de compra do tipo importação de cliques.' };
      render();
      return;
    }
    try {
      const result = saveActionSetting({
        mccCustomerId: id,
        managerCustomerId: id,
        customerId: id,
        ...selected,
      }, { now: nowFn });
      if (!result?.saved) {
        const message = result?.limitExceeded
          ? 'O armazenamento local atingiu o limite; nenhuma associação foi alterada.'
          : 'O navegador não conseguiu salvar a associação local.';
        state.conversionActionErrors = { ...state.conversionActionErrors, [id]: message };
      } else {
        state.conversionActionSettings = result.settings;
        state.conversionActionSelections = { ...state.conversionActionSelections, [id]: selected.resourceName };
        state.conversionActionSettingsInvalid = false;
        state.conversionActionStorageAvailable = true;
        state.conversionActionMessages = { ...state.conversionActionMessages, [id]: 'Associação salva neste navegador. O envio ao Google Ads continua desativado.' };
        state.conversionActionErrors = { ...state.conversionActionErrors, [id]: '' };
      }
    } catch (error) {
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: error instanceof Error ? error.message : 'Não foi possível salvar a associação.' };
    }
    render();
  }

  function removeConversionAction(mccCustomerId) {
    const id = String(mccCustomerId ?? '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(id)) return;
    if (state.conversionActionSettingsInvalid || !state.conversionActionStorageAvailable) {
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: 'O armazenamento local está indisponível ou inválido; nenhuma associação foi removida.' };
      render();
      return;
    }
    const result = removeActionSetting(id);
    if (!result?.removed) {
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: 'O navegador não conseguiu remover a associação local.' };
    } else {
      state.conversionActionSettings = result.settings;
      const selections = { ...state.conversionActionSelections };
      delete selections[id];
      state.conversionActionSelections = selections;
      state.conversionActionMessages = { ...state.conversionActionMessages, [id]: 'Associação local removida. Nenhuma configuração do Google Ads foi alterada.' };
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: '' };
    }
    render();
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
    const tokenMessage = state.apiToken
      ? `Token do Hub compartilhado com Tracking ClickBank${state.tokenInvalid ? ' · há um valor lembrado inválido' : ''}.`
      : 'Configure o token de leitura compartilhado do Hub em Configurações globais para consultar vendas e métricas.';
    const autoStatus = `Visitas e cliques atualizam ao abrir e a cada 5 minutos; vendas atualizam ao abrir e a cada 30 minutos. Última consulta de vendas: ${lastRefresh}. Período: ${rangeLabel}.`;
    const reportDetails = state.report
      ? `<div class="tracking-file-details"><span><strong>Período UTC:</strong> ${escapeHtml(state.report.startDate)} a ${escapeHtml(state.report.endDate)}</span><span><strong>Relatório gerado UTC:</strong> ${escapeHtml(state.report.generatedAtUtc)}</span><span><strong>Cache local atualizado:</strong> ${escapeHtml(formatUtcTimestamp(state.cacheSavedAtUtc))}</span><span><strong>Postbacks não associados:</strong> ${formatCount(state.report.summary.unmatchedCallbacks + state.report.summary.ambiguousCallbacks)}</span></div>`
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
        <div class="tracking-intro-head tracking-clicks-head"><div class="tracking-intro-copy"><h2>Vendas GuruMedia</h2><p>Consulta postbacks de conversão associados a cliques de saída e Tracks cadastradas no Hub. Checkout e envio de conversões ao Google Ads não fazem parte desta tela.</p></div>
          <div class="tracking-connection-actions"><button type="button" class="btn primary" data-gurumedia-action="refresh"${state.pending ? ' disabled' : ''}>${state.pending ? 'Atualizando…' : 'Atualizar vendas e cliques'}</button></div></div>
        <p class="tracking-auto-refresh-note">${escapeHtml(autoStatus)}</p>
        <p class="tracking-connection-note">${escapeHtml(tokenMessage)} A consulta automática atualiza esta tela; as vendas e as métricas de cliques são agregadas e armazenadas separadamente.</p>
        ${!state.apiToken ? '<p class="tracking-connection-note is-error"><a class="tracking-presell-link" href="/?view=tracking-settings">Abrir Configurações globais para informar o token</a></p>' : ''}
        <div class="tracking-clicks-date-range">
          <label class="tracking-token-field" for="guruMediaStartDate"><span>De · data UTC</span><input id="guruMediaStartDate" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="10" placeholder="dd/mm/aaaa" value="${escapeHtml(state.startDateInput)}"${state.pending ? ' disabled' : ''}></label>
          <label class="tracking-token-field" for="guruMediaEndDate"><span>Até · data UTC</span><input id="guruMediaEndDate" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="10" placeholder="dd/mm/aaaa" value="${escapeHtml(state.endDateInput)}"${state.pending ? ' disabled' : ''}></label>
          <label class="tracking-token-field" for="guruMediaDatePreset"><span>Período rápido</span><select id="guruMediaDatePreset"${state.pending ? ' disabled' : ''}>
            <option value="today"${state.datePreset === 'today' ? ' selected' : ''}>Hoje</option><option value="yesterday"${state.datePreset === 'yesterday' ? ' selected' : ''}>Ontem</option><option value="7-days"${state.datePreset === '7-days' ? ' selected' : ''}>7 Dias</option><option value="30-days"${state.datePreset === '30-days' ? ' selected' : ''}>30 Dias</option><option value="this-month"${state.datePreset === 'this-month' ? ' selected' : ''}>Este Mês</option><option value="last-month"${state.datePreset === 'last-month' ? ' selected' : ''}>Mês Passado</option>
          </select></label>
        </div>
        <p class="tracking-date-format-note tracking-instruction">Formato brasileiro: <strong>dd/mm/aaaa</strong>. “Hoje” segue o calendário local do navegador; os relatórios continuam agrupados por data UTC.</p>
        ${feedback}
      </section>
      ${renderTraffic()}
      ${renderConversionActions()}
      <section class="tracking-panel tracking-clicks-panel tracking-gurumedia-results" aria-label="Vendas registradas">
        ${state.report ? `${renderSummary(rows)}${reportDetails}${renderFilterOptions(state.report.rows)}${renderTable(rows)}` : '<div class="tracking-empty"><h2>Relatório ainda não consultado</h2><p class="tracking-instruction">Abra esta tela com o token do Hub configurado para carregar as vendas associadas às Tracks.</p></div>'}
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

  async function refresh({ automatic = false } = {}) {
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
    const shouldRefreshSales = !automatic || !state.lastRefreshAtUtc
      || nowFn().getTime() - Date.parse(state.lastRefreshAtUtc) >= 30 * 60 * 1000;
    state.feedback = automatic
      ? shouldRefreshSales ? 'Atualizando vendas e métricas GuruMedia automaticamente…' : 'Atualizando métricas GuruMedia automaticamente…'
      : 'Consultando vendas e métricas GuruMedia no servidor…';
    state.feedbackError = false;
    render();
    const [salesResult, trafficResult] = await Promise.all([
      shouldRefreshSales
        ? fetchReport(state.apiToken, range).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }))
        : Promise.resolve(null),
      fetchTrafficReport(state.apiToken, range, { platform: 'gurumedia' })
        .then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason })),
    ]);
    if (salesResult?.status === 'fulfilled') {
      state.report = salesResult.value;
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
    } else if (salesResult?.status === 'rejected') {
      const error = salesResult.reason;
      state.feedback = error instanceof Error ? error.message : 'Não foi possível consultar as vendas GuruMedia.';
      state.feedbackError = true;
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

  async function loadCurrentRange() {
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
    await refresh();
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
      void loadCurrentRange();
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
    const action = event.target.closest?.('[data-gurumedia-action]')?.dataset.gurumediaAction;
    if (action === 'toggle-postback-config') {
      state.postbackConfigExpanded = !state.postbackConfigExpanded;
      render();
    } else if (action === 'refresh') void refresh();
    else if (action === 'load-conversion-actions') void loadConversionActions(event.target.closest('[data-gurumedia-action]')?.dataset.gurumediaMcc);
    else if (action === 'save-conversion-action') saveConversionAction(event.target.closest('[data-gurumedia-action]')?.dataset.gurumediaMcc);
    else if (action === 'remove-conversion-action') removeConversionAction(event.target.closest('[data-gurumedia-action]')?.dataset.gurumediaMcc);
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
    if (event.target?.matches?.('[data-gurumedia-conversion-mcc]')) {
      const id = event.target.dataset.gurumediaConversionMcc;
      state.conversionActionSelections = { ...state.conversionActionSelections, [id]: event.target.value };
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: '' };
      render();
    } else if (event.target.id === 'guruMediaDatePreset') {
      state.datePreset = event.target.value;
      const range = trackingClicksDateRangeForPreset(state.datePreset, nowFn());
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
