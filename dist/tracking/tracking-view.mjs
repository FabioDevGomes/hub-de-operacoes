import {
  MAX_TRACKING_CSV_BYTES,
  maskTrackingIdentifier,
  parseGoogleAdsCsv,
  trackingIssueLabel,
} from './tracking-domain.mjs?v=4';
import {
  addTrackingDomain,
  downloadClickBankInsV8Csv,
  downloadTrackingCsv,
  fetchClickBankInsV8Report,
  fetchTrackingClicksReport,
  fetchTrackingCheckoutsReport,
  fetchTrackingDomains,
  fetchTrackingReport,
  fetchTrackingSalesPage,
} from './tracking-service.mjs?v=18';
import {
  createTrackingDomainAdminToken,
  buildTrackingPresellScriptTag,
  normalizeTrackingDomainInput,
  normalizeTrackingProductKey,
  normalizeTrackingProductLabel,
  trackingDomainAdminConfigPhp,
  TRACKING_DOMAIN_ADMIN_CONFIG_FILE,
} from './tracking-domain-admin.mjs?v=11';
import {
  readTrackingProductLabels,
  saveTrackingProductLabel,
} from './tracking-domain-label-storage.mjs?v=2';
import {
  readTrackingDomainList,
  saveTrackingDomainList,
} from './tracking-domain-list-storage.mjs?v=8';
import {
  formatTrackingDatePtBr,
  parseTrackingDatePtBr,
  resolveTrackingClicksCache,
  summarizeTrackingClicks,
  trackingClicksDefaultDateRange,
  trackingClicksDateRangeForPreset,
  trackingClicksRate,
  validateTrackingClicksDateRange,
} from './tracking-clicks-domain.mjs?v=7';

const CLICKBANK_INS_V8_INSTANT_NOTIFICATION_URL = 'https://track.travenzo.shop/clickbank-ins-v8.php';
import {
  appendTrackingClicksSnapshot,
  readTrackingClicksSnapshots,
} from './tracking-clicks-storage.mjs?v=3';
import { summarizeTrackingSales, TRACKING_SALES_MAX_SYNC_PAGES, TRACKING_SALES_MAX_SYNC_RECORDS } from './tracking-sales-domain.mjs?v=1';
import { readTrackingSalesSnapshot, replaceTrackingSalesSnapshot } from './tracking-sales-storage.mjs?v=1';
import {
  clearTrackingHubToken,
  readTrackingHubToken,
  saveTrackingHubToken,
  clearTrackingDomainAdminToken,
  readTrackingDomainAdminToken,
  saveTrackingDomainAdminToken,
} from './tracking-token-storage.mjs?v=2';
import {
  newTrackingConversionProfileId,
  normalizeTrackingConversionProfile,
  readTrackingConversionProfiles,
  saveTrackingConversionProfiles,
} from './tracking-conversion-profiles-storage.mjs?v=1';

const mountedRoots = new WeakMap();
const PREVIEW_LIMIT = 100;
export const TRACKING_CLICKS_AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const TRACKING_SALES_AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function fileNameForDownload(value) {
  const name = String(value || '').split(/[\\/]/).pop() || 'clickbank-google-ads.csv';
  return name.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 120) || 'clickbank-google-ads.csv';
}

function profileCsvFilename(label) {
  const suffix = String(label || 'conta')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'conta';
  return `clickbank-ins-v8-${suffix}.csv`;
}

function formatCurrencyTotals(summary) {
  const entries = Object.entries(summary.valueByCurrency);
  if (!entries.length) return '—';
  return entries.map(([currency, value]) => {
    const [whole, rawFraction = '00'] = value.split('.');
    let fraction = rawFraction;
    while (fraction.length > 2 && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
    const grouped = new Intl.NumberFormat('pt-BR').format(BigInt(whole));
    return `${escapeHtml(currency)} ${grouped},${fraction.padEnd(2, '0')}`;
  }).join(' · ');
}

export function mount({
  root,
  clipboard = globalThis.navigator?.clipboard,
  clicksStorage = { read: readTrackingClicksSnapshots, append: appendTrackingClicksSnapshot },
  salesStorage = { read: readTrackingSalesSnapshot, replace: replaceTrackingSalesSnapshot },
  setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
  scheduleAutoRefreshFn = globalThis.setTimeout?.bind(globalThis),
  clearAutoRefreshFn = globalThis.clearTimeout?.bind(globalThis),
  isTrackingViewVisibleFn = null,
  nowFn = () => new Date(),
}) {
  if (!root) throw new Error('A área da sessão Tracking não foi encontrada.');
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.render();
    return existing;
  }

  const savedToken = readTrackingHubToken();
  const savedDomainAdminToken = readTrackingDomainAdminToken();
  const savedConversionProfiles = readTrackingConversionProfiles();
  const initialConversionProfile = savedConversionProfiles.profiles.find(profile => profile.id === savedConversionProfiles.selectedProfileId) || null;
  const savedProductLabels = readTrackingProductLabels();
  const savedDomainList = readTrackingDomainList();
  const cachedDomainRows = savedDomainList.loaded
    ? savedDomainList.rows.map(row => ({
      ...row,
      productLabel: row.productLabel || savedProductLabels.labels.get(row.productKey) || row.productKey,
    }))
    : [];
  const defaultClicksRange = trackingClicksDefaultDateRange(nowFn());
  const state = {
    fileName: '', importedAt: '', report: null, source: '', apiToken: savedToken.token,
    rememberToken: true,
    clicksReport: null, clicksPending: false, clicksFeedback: '', clicksError: false,
    clicksLastServerRefreshAtUtc: null, clicksAutoOnlyData: false,
    clicksSnapshots: [], clicksCacheLoaded: false, clicksCacheLoading: true, clicksCacheAvailable: true, clicksCacheMeta: null,
    salesRows: [], salesCacheLoaded: false, salesCacheAvailable: true, salesSyncMeta: null,
    salesDataLoaded: false, salesLastServerRefreshAtUtc: null, salesAutoOnlyData: false,
    salesPending: false, salesFeedback: '', salesError: false,
    checkoutsReport: null, checkoutsCountsByTrack: new Map(), checkoutsPending: false,
    checkoutsFeedback: '', checkoutsError: false, checkoutsLastServerRefreshAtUtc: null,
    clicksStartDateInput: formatTrackingDatePtBr(defaultClicksRange.startDate),
    clicksEndDateInput: formatTrackingDatePtBr(defaultClicksRange.endDate),
    clicksDatePreset: 'today',
    clicksProductFilter: '', clicksHostFilter: '',
    tokenStorageStatus: !savedToken.available ? 'unavailable' : savedToken.invalid ? 'invalid' : savedToken.token ? 'saved' : 'empty',
    serverPending: false, feedback: '', feedbackError: false,
    connectionConfigExpanded: false,
    instructionsVisible: false,
    domainAdminToken: savedDomainAdminToken.token, domainAdminTokenVisible: false,
    rememberDomainAdminToken: true,
    domainTokenStorageStatus: !savedDomainAdminToken.available ? 'unavailable' : savedDomainAdminToken.invalid ? 'invalid' : savedDomainAdminToken.token ? 'saved' : 'empty',
    domainName: '', domainProductKey: '', domainIncludeWww: false,
    domainAdminConfigExpanded: false,
    productLabels: savedProductLabels.labels,
    tagDialogHost: '',
    domainRows: cachedDomainRows,
    highlightedDomainHosts: [],
    domainHighlightTimer: null,
    domainListLoaded: savedDomainList.loaded,
    domainListUpdatedAtUtc: savedDomainList.updatedAtUtc,
    domainListCacheStatus: !savedDomainList.available ? 'unavailable' : savedDomainList.invalid ? 'invalid' : savedDomainList.loaded ? 'saved' : 'empty',
    domainPending: false, domainAction: '',
    domainMessage: savedDomainList.loaded ? 'Lista restaurada do navegador; clique em Atualizar lista para verificar alterações no servidor.' : '',
    domainError: false,
    conversionProfiles: savedConversionProfiles.profiles,
    selectedConversionProfileId: savedConversionProfiles.selectedProfileId,
    editingConversionProfileId: initialConversionProfile?.id || '',
    conversionProfileLabelInput: initialConversionProfile?.label || '',
    conversionProfileActionInput: initialConversionProfile?.conversionName || '',
    conversionProfileStorageStatus: !savedConversionProfiles.available ? 'unavailable' : savedConversionProfiles.invalid ? 'invalid' : initialConversionProfile ? 'saved' : 'empty',
    conversionProfileMessage: savedConversionProfiles.invalid
      ? 'A configuração local dos perfis não pôde ser lida. Cadastre os perfis novamente.'
      : initialConversionProfile
        ? 'Perfil de exportação restaurado deste navegador.'
        : 'Cadastre um perfil para cada conta/MCC e informe o nome exato da ação de conversão.',
    conversionProfileError: Boolean(savedConversionProfiles.invalid),
  };

  const autoRefreshTimers = { clicks: null, sales: null };
  let autoRefreshActive = false;
  let autoRefreshRequested = false;
  let cacheReadyPromise = Promise.resolve();
  let trackingViewObserver = null;
  const trackingDocument = root.ownerDocument || globalThis.document || null;

  function hasValidHubToken() {
    return /^[a-f0-9]{64}$/i.test(state.apiToken);
  }

  function isTrackingRouteVisible() {
    if (typeof isTrackingViewVisibleFn === 'function') {
      try { return Boolean(isTrackingViewVisibleFn()); } catch { return false; }
    }
    const trackingSection = root.closest?.('#trackingView')
      || trackingDocument?.getElementById?.('trackingView')
      || null;
    if (trackingSection && (trackingSection.hidden || trackingSection.classList?.contains('hidden'))) return false;
    return true;
  }

  function isTrackingViewVisible() {
    if (!isTrackingRouteVisible()) return false;
    const doc = trackingDocument;
    return doc?.hidden !== true && doc?.visibilityState !== 'hidden';
  }

  function clearAutoRefreshTimer(kind) {
    const timer = autoRefreshTimers[kind];
    if (timer === null) return;
    clearAutoRefreshFn?.(timer);
    autoRefreshTimers[kind] = null;
  }

  function stopAutoRefresh({ preserveRequest = false } = {}) {
    autoRefreshActive = false;
    clearAutoRefreshTimer('clicks');
    clearAutoRefreshTimer('sales');
    if (!preserveRequest) autoRefreshRequested = false;
  }

  async function runAutomaticRefresh(kind) {
    if (!autoRefreshActive || !isTrackingViewVisible() || !hasValidHubToken()) return;
    if (kind === 'clicks') await refreshTrackingClicks({ automatic: true });
    else await Promise.all([
      refreshTrackSales({ automatic: true }),
      refreshTrackCheckouts({ automatic: true }),
    ]);
  }

  function scheduleAutoRefresh(kind, delay) {
    if (!autoRefreshActive || typeof scheduleAutoRefreshFn !== 'function') return;
    clearAutoRefreshTimer(kind);
    autoRefreshTimers[kind] = scheduleAutoRefreshFn(async () => {
      autoRefreshTimers[kind] = null;
      if (!autoRefreshActive) return;
      if (!isTrackingViewVisible()) {
        stopAutoRefresh({ preserveRequest: isTrackingRouteVisible() });
        return;
      }
      await runAutomaticRefresh(kind);
      scheduleAutoRefresh(kind, delay);
    }, delay);
    autoRefreshTimers[kind]?.unref?.();
  }

  function activateAutoRefresh() {
    if (!isTrackingViewVisible()) {
      stopAutoRefresh({ preserveRequest: isTrackingRouteVisible() });
      return cacheReadyPromise;
    }
    const latestToken = readTrackingHubToken();
    state.apiToken = latestToken.token;
    state.tokenStorageStatus = !latestToken.available ? 'unavailable' : latestToken.invalid ? 'invalid' : latestToken.token ? 'saved' : 'empty';
    const latestDomains = readTrackingDomainList();
    if (latestDomains.loaded) {
      state.domainRows = withProductLabels(latestDomains.rows);
      state.domainListLoaded = true;
    }
    autoRefreshRequested = true;
    if (autoRefreshActive) return cacheReadyPromise;
    autoRefreshActive = true;
    return cacheReadyPromise.then(async () => {
      if (!autoRefreshActive || !isTrackingViewVisible()) return;
      if (hasValidHubToken()) {
        await Promise.all([
          runAutomaticRefresh('clicks'),
          runAutomaticRefresh('sales'),
        ]);
      }
      scheduleAutoRefresh('clicks', TRACKING_CLICKS_AUTO_REFRESH_INTERVAL_MS);
      scheduleAutoRefresh('sales', TRACKING_SALES_AUTO_REFRESH_INTERVAL_MS);
    });
  }

  function handleAutoRefreshVisibility() {
    if (!isTrackingRouteVisible()) {
      stopAutoRefresh();
      return;
    }
    if (!isTrackingViewVisible()) {
      stopAutoRefresh({ preserveRequest: true });
      return;
    }
    void activateAutoRefresh();
  }

  function bindAutoRefreshLifecycle() {
    const trackingSection = root.closest?.('#trackingView')
      || trackingDocument?.getElementById?.('trackingView')
      || null;
    const MutationObserverImpl = trackingDocument?.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (trackingSection && typeof MutationObserverImpl === 'function') {
      trackingViewObserver = new MutationObserverImpl(handleAutoRefreshVisibility);
      trackingViewObserver.observe(trackingSection, { attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    trackingDocument?.addEventListener?.('visibilitychange', handleAutoRefreshVisibility);
    trackingDocument?.defaultView?.addEventListener?.('pagehide', stopAutoRefresh);
    trackingDocument?.defaultView?.addEventListener?.('pageshow', handleAutoRefreshVisibility);
  }

  function tokenStorageMessage() {
    if (state.tokenStorageStatus === 'saved') return 'Token lembrado neste navegador.';
    if (state.tokenStorageStatus === 'unavailable') return 'O navegador não permitiu salvar/apagar o token; ele só ficará nesta aba.';
    if (state.tokenStorageStatus === 'invalid') return 'O valor salvo não tem o formato esperado. Informe novamente o token do Hub.';
    if (state.tokenStorageStatus === 'disabled') return 'Opção desativada: o token fica somente nesta aba.';
    if (state.tokenStorageStatus === 'incomplete') return 'O token só será salvo depois de informar os 64 caracteres válidos.';
    return 'Informe um token válido para lembrá-lo neste navegador.';
  }

  function updateTokenStorageStatus() {
    const status = root.querySelector?.('#trackingTokenStorageStatus');
    if (!status) return;
    status.textContent = tokenStorageMessage();
    status.classList?.toggle('is-error', ['unavailable', 'invalid'].includes(state.tokenStorageStatus));
  }

  function syncTokenStorage() {
    if (!state.rememberToken) {
      const result = clearTrackingHubToken();
      state.tokenStorageStatus = result.removed ? 'disabled' : 'unavailable';
    } else if (!/^[a-f0-9]{64}$/i.test(state.apiToken)) {
      const result = clearTrackingHubToken();
      state.tokenStorageStatus = result.removed ? 'incomplete' : 'unavailable';
    } else {
      const result = saveTrackingHubToken(state.apiToken);
      state.tokenStorageStatus = result.saved ? 'saved' : result.available ? 'incomplete' : 'unavailable';
    }
    updateTokenStorageStatus();
  }

  function domainTokenStorageMessage() {
    if (state.domainTokenStorageStatus === 'saved') return 'Token administrativo lembrado neste navegador.';
    if (state.domainTokenStorageStatus === 'unavailable') return 'O navegador não permitiu salvar/apagar o token; ele só ficará nesta aba.';
    if (state.domainTokenStorageStatus === 'invalid') return 'O valor salvo não tem o formato esperado. Informe novamente o token administrativo.';
    if (state.domainTokenStorageStatus === 'disabled') return 'Opção desativada: o token administrativo fica somente nesta aba.';
    if (state.domainTokenStorageStatus === 'incomplete') return 'O token será lembrado depois que os 64 caracteres hexadecimais válidos forem informados.';
    return 'Informe o token administrativo; com a opção marcada, ele será lembrado neste navegador.';
  }

  function syncDomainAdminTokenStorage() {
    if (!state.rememberDomainAdminToken) {
      const result = clearTrackingDomainAdminToken();
      state.domainTokenStorageStatus = result.removed ? 'disabled' : 'unavailable';
    } else if (!/^[a-f0-9]{64}$/i.test(state.domainAdminToken)) {
      const result = clearTrackingDomainAdminToken();
      state.domainTokenStorageStatus = result.removed ? 'incomplete' : 'unavailable';
    } else {
      const result = saveTrackingDomainAdminToken(state.domainAdminToken);
      state.domainTokenStorageStatus = result.saved ? 'saved' : result.available ? 'incomplete' : 'unavailable';
    }
    const status = root.querySelector?.('#trackingDomainTokenStorageStatus');
    if (status) {
      status.textContent = domainTokenStorageMessage();
      status.classList?.toggle('is-error', ['unavailable', 'invalid'].includes(state.domainTokenStorageStatus));
    }
  }

  function statusMarkup() {
    if (state.feedback) return `<p class="tracking-message${state.feedbackError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.feedback)}</p>`;
    if (!state.report) return '<p class="tracking-message tracking-instruction" role="status" aria-live="polite">Nenhum CSV carregado. O arquivo fica somente nesta sessão do Hub; nada é gravado na base de campanhas.</p>';
    if (state.source === 'server') {
      const report = state.report;
      return `<p class="tracking-message" role="status" aria-live="polite">Servidor atualizado: ${report.candidateCount} postback(s) avaliados, ${report.eligibleCount} conversão(ões) elegível(is), ${report.ignoredCount} ignorado(s). Relatório UTC: <strong>${escapeHtml(report.generatedAtUtc)}</strong>.</p>`;
    }
    if (state.source === 'server-ins-v8') {
      const report = state.report;
      return `<p class="tracking-message" role="status" aria-live="polite">INS v8 atualizado: ${report.candidateCount} transação(ões) capturada(s), ${report.testCount} teste(s), ${report.saleCount} venda(s) de afiliado e ${report.eligibleCount} elegível(is) para CSV. Atualizado em <strong>${escapeHtml(report.generatedAtUtc)}</strong>.</p>`;
    }
    const summary = state.report.summary;
    const message = summary.invalidRows
      ? `${summary.totalRows} linha(s) lida(s); ${summary.invalidRows} com alerta. Revise os detalhes antes de baixar.`
      : `${summary.totalRows} linha(s) validadas. O CSV original está pronto para download.`;
    return `<p class="tracking-message" role="status" aria-live="polite">${message} Arquivo: <strong>${escapeHtml(state.fileName)}</strong> · leitura ${escapeHtml(state.importedAt)}.</p>`;
  }

  function rowMarkup(row) {
    const result = row.issues.length
      ? `<span class="tracking-row-status is-error">${row.issues.map(trackingIssueLabel).map(escapeHtml).join('; ')}</span>`
      : '<span class="tracking-row-status">Validada</span>';
    return `<tr>
      <td>${escapeHtml(row.conversionTime || '—')}</td>
      <td>${escapeHtml(row.conversionName || '—')}</td>
      <td class="tracking-number">${escapeHtml(row.conversionValue || '—')}</td>
      <td>${escapeHtml(row.currency || '—')}</td>
      <td><span title="GCLID mascarado; o arquivo original mantém o valor completo.">${escapeHtml(maskTrackingIdentifier(row.gclid))}</span></td>
      <td><span title="Order ID mascarado; o arquivo original mantém o valor completo.">${escapeHtml(maskTrackingIdentifier(row.orderId))}</span></td>
      <td>${result}</td>
    </tr>`;
  }

  function previewMarkup() {
    if (!state.report) {
      return `<div class="tracking-empty">
        <h2>Aguardando CSV</h2>
        <p class="tracking-instruction">Informe o token separado do postback e escolha <strong>Consultar vendas INS v8</strong>, ou importe um CSV já baixado. A leitura é somente para conferência e preparação; o Hub não envia dados ao Google Ads.</p>
      </div>`;
    }
    if (state.source === 'server-ins-v8') return insV8PreviewMarkup(state.report);
    if (state.source === 'server') return serverPreviewMarkup(state.report);
    const { rows, summary } = state.report;
    const visibleRows = rows.slice(0, PREVIEW_LIMIT);
    const names = summary.conversionNames.length ? summary.conversionNames.map(escapeHtml).join(', ') : '—';
    const omitted = rows.length > visibleRows.length
      ? `<p class="tracking-table-note tracking-instruction">Mostrando as primeiras ${visibleRows.length} de ${rows.length} linhas, na ordem do arquivo.</p>` : '';
    const skipped = Object.entries(summary.skippedByReason).map(([reason, count]) => `${count} ${escapeHtml(trackingIssueLabel(reason))}`).join(' · ');
    return `<div class="tracking-summary" aria-label="Resumo do CSV">
        <article class="tracking-kpi"><span>Registros no arquivo</span><strong>${summary.totalRows}</strong></article>
        <article class="tracking-kpi"><span>Linhas validadas</span><strong>${summary.validRows}</strong></article>
        <article class="tracking-kpi"><span>Linhas com alerta</span><strong class="${summary.invalidRows ? 'tracking-warning-value' : ''}">${summary.invalidRows}</strong></article>
        <article class="tracking-kpi"><span>Valor por moeda · linhas válidas</span><strong class="tracking-kpi-amount">${formatCurrencyTotals(summary)}</strong></article>
      </div>
      <div class="tracking-file-details"><span><strong>Ação(ões):</strong> ${names}</span><span><strong>Importado em:</strong> ${escapeHtml(state.importedAt)}</span></div>
      ${skipped ? `<p class="tracking-warning-note">Alertas encontrados: ${skipped}. O Hub não altera nem corrige o CSV.</p>` : ''}
      <div class="tracking-table-heading"><div><h2>Prévia das conversões</h2><p>GCLID e Order ID são mascarados na tela; o download conserva os valores integrais do arquivo.</p></div><span class="tracking-count">${summary.totalRows} linha(s)</span></div>
      <div class="tracking-table-wrap"><table class="tracking-table"><thead><tr><th>Data/hora</th><th>Ação de conversão</th><th>Valor</th><th>Moeda</th><th>GCLID</th><th>Order ID</th><th>Validação</th></tr></thead><tbody>${visibleRows.map(rowMarkup).join('')}</tbody></table></div>${omitted}`;
  }

  function serverPreviewMarkup(report) {
    const skipped = Object.entries(report.skippedByReason)
      .map(([reason, count]) => `${count} ${escapeHtml(trackingIssueLabel(reason))}`).join(' · ');
    const rows = report.preview.slice(0, PREVIEW_LIMIT);
    const omitted = report.eligibleCount > rows.length
      ? `<p class="tracking-table-note tracking-instruction">Mostrando as primeiras ${rows.length} de ${report.eligibleCount} conversões elegíveis.</p>` : '';
    return `<div class="tracking-summary" aria-label="Resumo do servidor">
        <article class="tracking-kpi"><span>Postbacks avaliados · 90 dias</span><strong>${report.candidateCount}</strong></article>
        <article class="tracking-kpi"><span>Conversões elegíveis</span><strong>${report.eligibleCount}</strong></article>
        <article class="tracking-kpi"><span>Ignorados pelo exportador</span><strong class="${report.ignoredCount ? 'tracking-warning-value' : ''}">${report.ignoredCount}</strong></article>
        <article class="tracking-kpi"><span>Comissão elegível por moeda</span><strong class="tracking-kpi-amount">${formatCurrencyTotals({ valueByCurrency: report.valueByCurrency })}</strong></article>
      </div>
      <div class="tracking-file-details"><span><strong>Ação:</strong> ${escapeHtml(report.conversionName)}</span><span><strong>Abrangência:</strong> todos os produtos rastreados</span><span><strong>Gerado em UTC:</strong> ${escapeHtml(report.generatedAtUtc)}</span></div>
      ${skipped ? `<p class="tracking-warning-note">Motivos ignorados: ${skipped}.</p>` : ''}
      <p class="tracking-scope-note tracking-instruction">A base atual não identifica o produto na tabela de postbacks; por isso esta prévia é agregada. O GCLID completo não é retornado pelo endpoint JSON.</p>
      <div class="tracking-table-heading"><div><h2>Prévia das conversões elegíveis</h2><p class="tracking-instruction">Identificadores mascarados. O download autenticado gera o CSV atual com GCLIDs integrais para o upload manual.</p></div><span class="tracking-count">${report.eligibleCount} conversão(ões)</span></div>
      ${rows.length ? `<div class="tracking-table-wrap"><table class="tracking-table"><thead><tr><th>Data/hora</th><th>Ação de conversão</th><th>Comissão</th><th>Moeda</th><th>GCLID</th><th>Order ID</th><th>Validação</th></tr></thead><tbody>${rows.map(row => `<tr>
        <td>${escapeHtml(row.conversionTime)}</td><td>${escapeHtml(row.conversionName)}</td><td class="tracking-number">${escapeHtml(row.conversionValue)}</td><td>${escapeHtml(row.currency)}</td>
        <td><span title="GCLID mascarado; o CSV autenticado contém o valor integral.">${escapeHtml(row.gclidMasked)}</span></td><td><span title="Order ID mascarado.">${escapeHtml(row.orderIdMasked)}</span></td><td><span class="tracking-row-status">Elegível</span></td>
      </tr>`).join('')}</tbody></table></div>${omitted}` : '<div class="tracking-empty"><p class="tracking-instruction">Nenhuma conversão elegível ainda. GCLIDs fictícios/de teste e postbacks sem clique correspondente são ignorados.</p></div>'}`;
  }

  function activeConversionProfile() {
    return state.conversionProfiles.find(profile => profile.id === state.selectedConversionProfileId) || null;
  }

  function insV8PreviewMarkup(report) {
    const skipped = Object.entries(report.skippedByReason)
      .map(([reason, count]) => `${count} ${escapeHtml(trackingIssueLabel(reason))}`).join(' · ');
    const rows = report.preview.slice(0, PREVIEW_LIMIT);
    const omitted = report.candidateCount > rows.length
      ? `<p class="tracking-table-note tracking-instruction">Mostrando as ${rows.length} transações mais recentes de ${report.candidateCount} capturadas.</p>` : '';
    const valueTotals = formatCurrencyTotals({ valueByCurrency: report.valueByCurrency });
    const body = rows.map(row => {
      const items = row.lineItems.length
        ? `<details class="tracking-product-details"><summary>${row.lineItems.length} ${row.lineItems.length === 1 ? 'item' : 'itens'}</summary><ul>${row.lineItems.map(item => {
          const name = item.title || item.itemNo || 'Item sem identificação';
          const parts = [];
          if (item.itemNo && item.title) parts.push(`SKU ${item.itemNo}`);
          if (item.type) parts.push(item.type);
          if (item.quantity !== null) parts.push(`qtd. ${item.quantity}`);
          if (item.commissionAmount !== null) parts.push(`comissão ${row.currency || 'USD'} ${item.commissionAmount.replace('.', ',')}`);
          return `<li><strong>${escapeHtml(name)}</strong>${parts.length ? `<small>${escapeHtml(parts.join(' · '))}</small>` : ''}</li>`;
        }).join('')}</ul></details>`
        : '<span class="tracking-muted-value">Sem itens de produto recebidos</span>';
      const rowStatus = row.eligible
        ? '<span class="tracking-row-status">Elegível para CSV</span>'
        : `<span class="tracking-row-status is-error">${escapeHtml(trackingIssueLabel(row.ineligibilityReason))}</span>`;
      const transactionTime = row.transactionTime || '—';
      const saleCountry = formatSaleCountry(row.customerCountry);
      const conversionName = row.eligible
        ? (activeConversionProfile()?.conversionName || 'Selecione um perfil')
        : '—';
      const commission = row.commissionTotal === null ? '—' : `${escapeHtml(row.currency || '—')} ${escapeHtml(row.commissionTotal.replace('.', ','))}`;
      const gross = row.saleGrossTotal === null ? '—' : `${escapeHtml(row.currency || '—')} ${escapeHtml(row.saleGrossTotal.replace('.', ','))}`;
      return `<tr>
        <td>${escapeHtml(transactionTime)}</td>
        <td>${escapeHtml(row.transactionType)}${row.isTest ? '<small class="tracking-test-tag">TEST IPN</small>' : ''}</td>
        <td>${escapeHtml(saleCountry)}</td>
        <td>${escapeHtml(conversionName)}</td>
        <td>${items}</td>
        <td class="tracking-number">${commission}</td>
        <td class="tracking-number">${gross}</td>
        <td>${escapeHtml(row.gclidSource)}</td>
        <td>${escapeHtml(row.reconciliationStatus)}</td>
        <td>${escapeHtml(row.receiptMasked)}</td>
        <td>${escapeHtml(row.gclidMasked)}</td>
        <td>${rowStatus}</td>
      </tr>`;
    }).join('');
    return `<div class="tracking-summary" aria-label="Resumo ClickBank INS v8">
        <article class="tracking-kpi"><span>Notificações capturadas</span><strong>${report.candidateCount}</strong></article>
        <article class="tracking-kpi"><span>Testes INS v8 · excluídos</span><strong class="${report.testCount ? 'tracking-warning-value' : ''}">${report.testCount}</strong></article>
        <article class="tracking-kpi"><span>Vendas afiliadas · sem teste</span><strong>${report.saleCount}</strong></article>
        <article class="tracking-kpi"><span>Elegíveis para CSV manual</span><strong>${report.eligibleCount}</strong></article>
      </div>
      <div class="tracking-file-details"><span><strong>Perfil para o próximo CSV:</strong> ${escapeHtml(activeConversionProfile() ? `${activeConversionProfile().label} · ${activeConversionProfile().conversionName}` : 'Nenhum selecionado')}</span><span><strong>Comissão elegível:</strong> ${valueTotals}</span><span><strong>Atualizado UTC:</strong> ${escapeHtml(report.generatedAtUtc)}</span></div>
      ${skipped ? `<p class="tracking-warning-note">Fora do CSV: ${skipped}.</p>` : ''}
      <p class="tracking-scope-note tracking-instruction">Cada transação SALE elegível gera uma linha com a comissão total do afiliado. Os itens permanecem detalhados abaixo. Testes, reembolsos, GCLIDs sem atribuição confirmada, recibos repetidos e comissões divergentes não entram no arquivo. O país é o informado no endereço de cobrança à ClickBank, não uma geolocalização. O perfil selecionado define o nome da ação somente no CSV gerado; essa escolha não é gravada na transação. Confira a conta/MCC correspondente antes de enviar manualmente.</p>
      <div class="tracking-table-heading"><div><h2>Transações recebidas pela INS v8</h2><p class="tracking-instruction">Recibo e GCLID ficam mascarados nesta tela. A lista também mostra eventos de teste e eventos não exportáveis para diagnóstico.</p></div><span class="tracking-count">${report.candidateCount} transação(ões)</span></div>
      ${body ? `<div class="tracking-table-wrap"><table class="tracking-table tracking-ins-v8-table"><thead><tr><th>Horário UTC</th><th>Evento</th><th>País (cobrança)</th><th>Ação de conversão</th><th>Produtos e comissão por item</th><th>Comissão total</th><th>Total bruto</th><th>Origem GCLID</th><th>Conciliação</th><th>Recibo</th><th>GCLID</th><th>CSV</th></tr></thead><tbody>${body}</tbody></table></div>${omitted}` : '<div class="tracking-empty"><h2>Nenhuma notificação recebida</h2><p class="tracking-instruction">Quando o endpoint v8 receber um evento, ele aparecerá aqui. O Test IPN também pode ser usado para confirmar a captura; eventos de teste nunca entram no CSV.</p></div>'}`;
  }

  function formatSaleCountry(countryCode) {
    if (!countryCode) return 'Não informado';
    try {
      const countryName = new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(countryCode);
      if (countryName && countryName !== countryCode) return `${countryName} (${countryCode})`;
    } catch {
      // Fall back to the safe two-letter code in older browsers without Intl.DisplayNames.
    }
    return countryCode;
  }

  function clickPercent(value) {
    return value === null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`;
  }

  function formatTrackingCacheTimestamp(value) {
    if (!value) return '';
    const timestamp = new Date(value);
    return Number.isFinite(timestamp.getTime())
      ? timestamp.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
      : String(value);
  }

  function selectedClicksRange() {
    const startDate = parseTrackingDatePtBr(state.clicksStartDateInput);
    const endDate = parseTrackingDatePtBr(state.clicksEndDateInput);
    if (!startDate || !endDate) return null;
    try { return validateTrackingClicksDateRange(startDate, endDate); } catch { return null; }
  }

  function setClicksCacheForSelectedRange() {
    const range = selectedClicksRange();
    if (!range || !state.clicksCacheLoaded || !state.clicksCacheAvailable) return false;
    const cached = resolveTrackingClicksCache(state.clicksSnapshots, range, 'clickbank');
    state.clicksReport = cached.report;
    state.clicksCacheMeta = cached.meta;
    state.clicksLastServerRefreshAtUtc = cached.meta.cacheUpdatedAtUtc;
    state.clicksAutoOnlyData = false;
    state.clicksProductFilter = '';
    state.clicksHostFilter = '';
    state.clicksError = false;
    if (!cached.report) {
      state.clicksFeedback = cached.meta.unsegmentedSnapshotCount
        ? `O cache antigo contém eventos sem separação por plataforma e foi preservado, mas não é exibido aqui. Atualize do servidor para carregar somente ClickBank para ${range.startDate} a ${range.endDate} UTC.`
        : `Nenhum cache local para ${range.startDate} a ${range.endDate} UTC. Clique em Atualizar do servidor para carregar esse período.`;
    } else if (cached.meta.coveredDays < cached.meta.totalDays) {
      state.clicksFeedback = `Cache local parcial: ${cached.meta.coveredDays} de ${cached.meta.totalDays} dias cobertos. Atualize do servidor para completar o período.`;
    } else {
      state.clicksFeedback = `Cache local carregado: ${cached.meta.snapshotCount} consulta(s) cobrem todo o período.`;
    }
    return true;
  }

  async function loadTrackingClicksCache() {
    try {
      const snapshots = await clicksStorage.read();
      state.clicksSnapshots = Array.isArray(snapshots) ? snapshots : [];
      state.clicksCacheAvailable = true;
      const range = selectedClicksRange();
      if (range) {
        const cached = resolveTrackingClicksCache(state.clicksSnapshots, range, 'clickbank');
        state.clicksLastServerRefreshAtUtc = cached.meta.cacheUpdatedAtUtc;
      }
    } catch (error) {
      state.clicksSnapshots = [];
      state.clicksCacheAvailable = false;
      state.clicksReport = null;
      state.clicksCacheMeta = null;
      state.clicksFeedback = `Não foi possível ler o cache local (${error instanceof Error ? error.message : 'erro de armazenamento'}). Você ainda pode consultar o servidor, mas talvez os dados não possam ser salvos neste navegador.`;
      state.clicksError = true;
    } finally {
      state.clicksCacheLoaded = true;
      state.clicksCacheLoading = false;
      if (state.clicksCacheAvailable) setClicksCacheForSelectedRange();
      render();
    }
  }

  async function loadTrackingSalesCache() {
    try {
      const cached = await salesStorage.read();
      state.salesRows = Array.isArray(cached?.sales) ? cached.sales : [];
      state.salesSyncMeta = cached?.metadata || null;
      state.salesDataLoaded = Boolean(cached?.metadata);
      state.salesLastServerRefreshAtUtc = cached?.metadata?.lastSyncedAtUtc || null;
      state.salesAutoOnlyData = false;
      state.salesCacheAvailable = true;
    } catch (error) {
      state.salesRows = [];
      state.salesSyncMeta = null;
      state.salesDataLoaded = false;
      state.salesLastServerRefreshAtUtc = null;
      state.salesAutoOnlyData = false;
      state.salesCacheAvailable = false;
      state.salesFeedback = `Não foi possível ler o cache local de vendas (${error instanceof Error ? error.message : 'erro de armazenamento'}).`;
      state.salesError = true;
    } finally {
      state.salesCacheLoaded = true;
      render();
    }
  }

  async function refreshTrackSales({ automatic = false } = {}) {
    if (!state.apiToken) {
      if (automatic) return;
      state.connectionConfigExpanded = true;
      state.salesFeedback = 'Configure o token compartilhado em Configurações globais para atualizar as vendas.';
      state.salesError = true;
      render();
      return;
    }
    if (state.salesPending) return;
    if (!automatic && state.rememberToken) syncTokenStorage();
    state.salesPending = true;
    state.salesFeedback = automatic
      ? 'Atualizando vendas automaticamente em lotes…'
      : 'Lendo as vendas INS v8 do servidor em lotes…';
    state.salesError = false;
    render();

    const allSales = [];
    const ids = new Set();
    let afterId = '0';
    let snapshotMaxId = null;
    let generatedAtUtc = '';
    try {
      let hasMore = true;
      let pageNumber = 0;
      while (hasMore) {
        pageNumber += 1;
        if (pageNumber > TRACKING_SALES_MAX_SYNC_PAGES) {
          throw new Error(`A base ultrapassa o limite desta sincronização (${TRACKING_SALES_MAX_SYNC_RECORDS.toLocaleString('pt-BR')} vendas). O cache anterior foi mantido.`);
        }
        const page = await fetchTrackingSalesPage(state.apiToken, { afterId, snapshotMaxId });
        if (snapshotMaxId === null) {
          snapshotMaxId = page.snapshotMaxId;
          generatedAtUtc = page.generatedAtUtc;
        } else if (snapshotMaxId !== page.snapshotMaxId) {
          throw new Error('O snapshot do servidor mudou no meio da leitura. O cache anterior foi mantido; atualize novamente.');
        }
        for (const sale of page.sales) {
          if (ids.has(sale.transactionId)) throw new Error('O servidor repetiu um ID de venda entre páginas. O cache anterior foi mantido.');
          ids.add(sale.transactionId);
          allSales.push(sale);
        }
        if (allSales.length > TRACKING_SALES_MAX_SYNC_RECORDS) {
          throw new Error(`A base ultrapassa o limite desta sincronização (${TRACKING_SALES_MAX_SYNC_RECORDS.toLocaleString('pt-BR')} vendas). O cache anterior foi mantido.`);
        }
        afterId = page.nextAfterId;
        hasMore = page.hasMore;
        if (hasMore) {
          state.salesFeedback = `Lendo vendas do servidor: ${allSales.length.toLocaleString('pt-BR')} registro(s) em ${pageNumber} lote(s)…`;
          render();
        }
      }

      if (automatic) {
        state.salesRows = allSales;
        state.salesDataLoaded = true;
        state.salesLastServerRefreshAtUtc = nowFn().toISOString();
        state.salesAutoOnlyData = true;
      } else {
        const saved = await salesStorage.replace(allSales, { snapshotMaxId, generatedAtUtc });
        state.salesRows = saved.sales;
        state.salesSyncMeta = saved.metadata;
        state.salesDataLoaded = true;
        state.salesLastServerRefreshAtUtc = saved.metadata.lastSyncedAtUtc;
        state.salesAutoOnlyData = false;
        state.salesCacheAvailable = true;
      }
      const summary = summarizeTrackingSales(state.salesRows, state.domainRows.filter(row => row.platform === 'clickbank'));
      state.salesFeedback = `${automatic ? 'Busca automática concluída' : 'Atualização concluída'}: ${summary.matchedCount.toLocaleString('pt-BR')} venda(s) associada(s) a uma Track; ${summary.unmatchedCount.toLocaleString('pt-BR')} sem clique correspondente e ${summary.ambiguousCount.toLocaleString('pt-BR')} com mais de uma Track possível. Atualizado em ${formatTrackingCacheTimestamp(state.salesLastServerRefreshAtUtc)}.${automatic ? ' Os dados desta consulta ficam nesta tela; use Atualizar vendas para salvar no cache local.' : ''}`;
      state.salesError = false;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Não foi possível sincronizar as vendas.';
      state.salesFeedback = state.salesDataLoaded
        ? automatic
          ? `A busca automática falhou: ${reason} Os dados exibidos anteriormente foram mantidos.`
          : `Falha ao atualizar: ${reason} O cache local anterior, de ${formatTrackingCacheTimestamp(state.salesSyncMeta?.lastSyncedAtUtc || state.salesLastServerRefreshAtUtc)}, foi mantido.`
        : reason;
      state.salesError = true;
    } finally {
      state.salesPending = false;
      render();
    }
  }

  async function refreshTrackCheckouts({ automatic = false } = {}) {
    if (!state.apiToken) {
      if (automatic) return;
      state.connectionConfigExpanded = true;
      state.checkoutsFeedback = 'Configure o token compartilhado em Configurações globais para consultar os checkouts.';
      state.checkoutsError = true;
      render();
      return;
    }
    if (state.checkoutsPending) return;
    if (!automatic && state.rememberToken) syncTokenStorage();
    state.checkoutsPending = true;
    state.checkoutsFeedback = automatic
      ? 'Consultando checkouts automaticamente…'
      : 'Consultando os checkouts registrados no servidor…';
    state.checkoutsError = false;
    render();
    try {
      const report = await fetchTrackingCheckoutsReport(state.apiToken);
      state.checkoutsReport = report;
      state.checkoutsCountsByTrack = new Map(report.counts.map(row => [
        JSON.stringify([row.hostname, row.productKey]),
        row.checkoutCount,
      ]));
      state.checkoutsLastServerRefreshAtUtc = report.generatedAtUtc;
      state.checkoutsFeedback = `${automatic ? 'Busca automática concluída' : 'Consulta concluída'}: ${report.matchedCount.toLocaleString('pt-BR')} checkout(s) associado(s) a uma única Track; ${report.unmatchedCount.toLocaleString('pt-BR')} sem Track identificada e ${report.ambiguousCount.toLocaleString('pt-BR')} com associação ambígua. Atualizado em ${formatTrackingCacheTimestamp(report.generatedAtUtc)}.`;
      state.checkoutsError = false;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Não foi possível consultar os checkouts.';
      state.checkoutsFeedback = state.checkoutsReport
        ? `A consulta de checkouts falhou: ${reason} A contagem anteriormente exibida foi mantida.`
        : reason;
      state.checkoutsError = true;
    } finally {
      state.checkoutsPending = false;
      render();
    }
  }

  function trackingClicksPreviewMarkup() {
    const report = state.clicksReport;
    if (!report) {
      return '<div class="tracking-empty"><h2>Relatório ainda não consultado</h2><p class="tracking-instruction">Sem dados locais para este período. Clique em Atualizar do servidor para consultar os totais agregados e salvá-los neste navegador. Isso não altera vendas, CSV ou campanhas.</p></div>';
    }
    const rows = report.rows.filter(row =>
      (!state.clicksProductFilter || (state.clicksProductFilter === 'p:unknown' ? !row.productKey : row.productKey === state.clicksProductFilter.slice(2)))
      && (!state.clicksHostFilter || (state.clicksHostFilter === 'h:unknown' ? !row.presellHost : row.presellHost === state.clicksHostFilter.slice(2))));
    const totals = summarizeTrackingClicks(rows);
    const products = [...new Set(report.rows.map(row => row.productKey))].sort((left, right) => String(left || '').localeCompare(String(right || '')));
    const hosts = [...new Set(report.rows.map(row => row.presellHost))].sort((left, right) => String(left || '').localeCompare(String(right || '')));
    const body = rows.map(row => `<tr>
      <td>${escapeHtml(row.dateUtc)}</td>
      <td>${escapeHtml(row.productKey ? productLabel(row.productKey) : 'Produto não identificado')}${row.productKey ? `<small class="tracking-muted-value"><code>${escapeHtml(row.productKey)}</code></small>` : ''}</td>
      <td>${row.presellHost
        ? `<a class="tracking-presell-link" href="https://${escapeHtml(row.presellHost)}/" target="_blank" rel="noopener noreferrer" title="Abrir a pre-sell em uma nova aba" aria-label="Abrir a pre-sell ${escapeHtml(row.presellHost)} em uma nova aba">${escapeHtml(row.presellHost)}</a>`
        : 'Domínio não identificado'}</td>
      <td class="tracking-number">${new Intl.NumberFormat('pt-BR').format(row.pageViews)}</td>
      <td class="tracking-number">${new Intl.NumberFormat('pt-BR').format(row.outboundClicks)}</td>
      <td class="tracking-number">${clickPercent(trackingClicksRate(row.outboundClicks, row.pageViews))}</td>
    </tr>`).join('');
    return `<div class="tracking-clicks-results">
      <div class="tracking-summary" aria-label="Resumo agregado de cliques">
        <article class="tracking-kpi"><span>Eventos de visita · page_view</span><strong>${new Intl.NumberFormat('pt-BR').format(totals.pageViews)}</strong></article>
        <article class="tracking-kpi"><span>Eventos de saída · outbound_click</span><strong>${new Intl.NumberFormat('pt-BR').format(totals.outboundClicks)}</strong></article>
        <article class="tracking-kpi"><span>Saídas ÷ visitas · taxa de eventos</span><strong>${clickPercent(trackingClicksRate(totals.outboundClicks, totals.pageViews))}</strong></article>
        <article class="tracking-kpi"><span>Combinações no recorte</span><strong>${rows.length}</strong></article>
      </div>
      <div class="tracking-file-details"><span><strong>Período UTC:</strong> ${escapeHtml(report.startDate)} a ${escapeHtml(report.endDate)}</span><span><strong>Relatório gerado UTC:</strong> ${escapeHtml(report.generatedAtUtc)}</span>${state.clicksCacheMeta?.cacheUpdatedAtUtc ? `<span><strong>Cache local atualizado:</strong> ${escapeHtml(formatTrackingCacheTimestamp(state.clicksCacheMeta.cacheUpdatedAtUtc))} · ${state.clicksCacheMeta.coveredDays}/${state.clicksCacheMeta.totalDays} dias cobertos</span><span><strong>Consultas usadas:</strong> ${state.clicksCacheMeta.snapshotCount}</span>` : ''}</div>
      <p class="tracking-scope-note tracking-instruction">São contados eventos, não visitantes únicos: recargas podem contar como novas visitas e um visitante pode clicar mais de uma vez. Os filtros abaixo só reorganizam os totais já consultados.</p>
      <div class="tracking-clicks-filters">
        <label class="tracking-token-field" for="trackingClicksProductFilter"><span>Produto</span><select id="trackingClicksProductFilter"><option value="">Todos os produtos</option>${products.map(key => `<option value="${key ? `p:${escapeHtml(key)}` : 'p:unknown'}"${state.clicksProductFilter === (key ? `p:${key}` : 'p:unknown') ? ' selected' : ''}>${escapeHtml(key ? `${productLabel(key)} (${key})` : 'Não identificado')}</option>`).join('')}</select></label>
        <label class="tracking-token-field" for="trackingClicksHostFilter"><span>Pre-sell</span><select id="trackingClicksHostFilter"><option value="">Todos os domínios</option>${hosts.map(host => `<option value="${host ? `h:${escapeHtml(host)}` : 'h:unknown'}"${state.clicksHostFilter === (host ? `h:${host}` : 'h:unknown') ? ' selected' : ''}>${escapeHtml(host || 'Não identificado')}</option>`).join('')}</select></label>
      </div>
      <div class="tracking-table-heading"><div><h3>Visitas e cliques por dia, produto e pre-sell</h3><p class="tracking-instruction">Taxa de eventos = outbound_click ÷ page_view; não é CTR de usuários únicos.</p></div><span class="tracking-count">${rows.length} linha(s)</span></div>
      ${body ? `<div class="tracking-table-wrap"><table class="tracking-table tracking-clicks-table"><thead><tr><th>Data UTC</th><th>Produto</th><th>Pre-sell</th><th>Visitas · page_view</th><th>Cliques de saída · outbound_click</th><th>Taxa de eventos</th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="tracking-empty"><p class="tracking-instruction">Não há eventos para os filtros selecionados neste período.</p></div>'}
    </div>`;
  }

  function render() {
    const report = state.report;
    const canDownload = state.source === 'server-ins-v8'
      ? Boolean(report?.downloadAvailable && activeConversionProfile())
      : state.source === 'server'
        ? Boolean(report?.downloadAvailable)
        : Boolean(report?.downloadable);
    const downloadTitle = ['server', 'server-ins-v8'].includes(state.source)
      ? 'Solicita ao servidor um CSV atualizado, sem salvar o arquivo no servidor.'
      : 'Baixa o CSV original sem alterar os valores.';
    const tokenStorageWarning = ['unavailable', 'invalid'].includes(state.tokenStorageStatus);
    const selectedProfile = activeConversionProfile();
    const tagDialogRow = state.domainRows.find(row => row.hostname === state.tagDialogHost) || null;
    const clickBankDomains = state.domainRows.filter(row => row.platform === 'clickbank');
    const salesSummary = summarizeTrackingSales(state.salesRows, clickBankDomains);
    const saleCountForTrack = row => salesSummary.countsByTrack.get(JSON.stringify([row.hostname, row.productKey])) || 0;
    const checkoutCountForTrack = row => state.checkoutsCountsByTrack.get(JSON.stringify([row.hostname, row.productKey])) || 0;
    const domainRows = `<div class="tracking-table-wrap"><table class="tracking-table tracking-domain-table" aria-label="Tracks cadastradas, checkouts e vendas ClickBank"><thead><tr><th>URL da pre-sell</th><th>Nome do Track</th><th class="tracking-checkout-count">Checkouts</th><th class="tracking-sales-count">Vendas (SALE)</th></tr></thead><tbody>${clickBankDomains.length
      ? clickBankDomains.map(row => `<tr${state.highlightedDomainHosts.includes(row.hostname) ? ' class="tracking-new-track-pulse"' : ''}><td><a class="tracking-presell-link" href="${escapeHtml(row.origin + '/')}" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(row.origin + '/')}</code></a></td><td>${escapeHtml(row.productLabel || productLabel(row.productKey))}</td><td class="tracking-number tracking-checkout-count"${state.checkoutsReport ? ` title="${checkoutCountForTrack(row)} checkout(s) ORDER_IMPRESSION associado(s) por extclid a esta combinação exata de domínio e produto"` : ' title="Aguardando a consulta de checkouts ao servidor"'}>${state.checkoutsReport ? new Intl.NumberFormat('pt-BR').format(checkoutCountForTrack(row)) : '—'}</td><td class="tracking-number tracking-sales-count"${state.salesDataLoaded ? ` title="${saleCountForTrack(row)} venda(s) associada(s) por extclid a esta combinação exata de domínio e produto"` : ' title="Sincronize as vendas para preencher esta contagem"'}>${state.salesDataLoaded ? new Intl.NumberFormat('pt-BR').format(saleCountForTrack(row)) : '—'}</td></tr>`).join('')
      : `<tr><td colspan="4" class="tracking-domain-empty">${state.domainListLoaded ? 'A lista não contém domínios cadastrados por esta tela.' : 'A lista de Tracks é gerenciada em Configurações globais.'}</td></tr>`}</tbody></table></div>`;
    const salesCacheSummary = state.salesDataLoaded
      ? `Dados de vendas: ${salesSummary.totalCount.toLocaleString('pt-BR')} SALE(s) real(is) de afiliado; ${salesSummary.matchedCount.toLocaleString('pt-BR')} associada(s) a uma única Track, ${salesSummary.unmatchedCount.toLocaleString('pt-BR')} sem clique correspondente e ${salesSummary.ambiguousCount.toLocaleString('pt-BR')} com associação ambígua. ${salesSummary.historicalCount ? `${salesSummary.historicalCount.toLocaleString('pt-BR')} pertence(m) a combinações históricas não presentes na lista atual. ` : ''}Última atualização: ${formatTrackingCacheTimestamp(state.salesLastServerRefreshAtUtc)}. ${state.salesAutoOnlyData ? 'O resultado automático está só nesta tela; Atualizar vendas salva a sincronização no cache local.' : 'A sincronização está salva no cache local deste navegador.'}`
      : state.salesCacheAvailable
        ? 'As vendas ainda não foram sincronizadas neste navegador. A busca automática tentará carregar o histórico; Atualizar vendas também inicia uma consulta e salva o resultado no cache local.'
        : 'O cache local das vendas não está disponível neste navegador; tente atualizar do servidor novamente.';
    const salesAutoRefreshStatus = `Busca automática de vendas e checkouts ao abrir Tracking e a cada 30 minutos enquanto esta tela estiver ativa. Vendas: ${state.salesLastServerRefreshAtUtc ? formatTrackingCacheTimestamp(state.salesLastServerRefreshAtUtc) : 'ainda não consultado'}; checkouts: ${state.checkoutsLastServerRefreshAtUtc ? formatTrackingCacheTimestamp(state.checkoutsLastServerRefreshAtUtc) : 'ainda não consultado'}${hasValidHubToken() ? '' : ' · configure o token nas Configurações globais para ativar'}.`;
    const clicksAutoRefreshStatus = `Busca automática ao abrir Tracking e a cada 5 minutos enquanto esta tela estiver ativa. Última consulta: ${state.clicksLastServerRefreshAtUtc ? formatTrackingCacheTimestamp(state.clicksLastServerRefreshAtUtc) : 'ainda não consultado'}${hasValidHubToken() ? '' : ' · configure o token nas Configurações globais para ativar'}. A busca automática atualiza esta tela; Atualizar do servidor salva no cache local.`;
    const tagDialog = tagDialogRow ? `<div class="tracking-tag-dialog-backdrop"><section id="trackingTagDialog" class="tracking-tag-dialog" role="dialog" aria-modal="true" aria-labelledby="trackingTagDialogTitle" tabindex="-1">
      <div class="tracking-tag-dialog-head"><div><h2 id="trackingTagDialogTitle">Tag da pre-sell</h2><p>${escapeHtml(tagDialogRow.hostname)} · ${escapeHtml(tagDialogRow.productLabel || productLabel(tagDialogRow.productKey))}</p></div><button type="button" class="btn" data-tracking-action="close-presell-tag" aria-label="Fechar">×</button></div>
      <label class="tracking-token-field" for="trackingPresellScript"><span>Tag de instalação</span><textarea id="trackingPresellScript" rows="3" readonly spellcheck="false" aria-label="Tag de instalação de ${escapeHtml(tagDialogRow.hostname)}">${escapeHtml(buildTrackingPresellScriptTag(tagDialogRow.productKey, tagDialogRow.hostname))}</textarea></label>
      <p class="tracking-connection-note tracking-instruction">Cole uma vez na página. Use o mesmo código quando várias pre-sells venderem o mesmo produto; o hostname separa as páginas. A tag não contém token, não usa <code>crossorigin</code> e preserva parâmetros dos HopLinks, inclusive <code>extclid</code>.</p>
      <div class="tracking-tag-dialog-actions"><button type="button" class="btn primary" data-tracking-action="copy-presell-script">Copiar tag</button><button type="button" class="btn" data-tracking-action="close-presell-tag">Fechar</button></div>
    </section></div>` : '';
    root.innerHTML = `<div id="trackingInstructionalText" class="tracking-session${state.instructionsVisible ? ' tracking-instructions-visible' : ' tracking-instructions-hidden'}">
      <section class="tracking-panel tracking-intro">
        <div class="tracking-intro-head">
          <div class="tracking-intro-copy"><h2>Conversões ClickBank → Google Ads</h2><p class="tracking-instruction">Consulte as vendas INS v8 recebidas pelo servidor ou confira um CSV já baixado antes do upload manual na MCC.</p></div>
          <div class="tracking-intro-head-actions"><button type="button" class="btn tracking-instruction-toggle" data-tracking-action="toggle-instructions" aria-label="${state.instructionsVisible ? 'Ocultar instruções' : 'Exibir instruções'}" aria-controls="trackingInstructionalText" aria-pressed="${state.instructionsVisible ? 'true' : 'false'}" title="${state.instructionsVisible ? 'Ocultar textos explicativos' : 'Exibir textos explicativos'}"><svg class="tracking-eye-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${state.instructionsVisible ? '<path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>' : '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17.4 17.4 0 0 1-3.1 3.8M6.2 6.2C3.8 7.7 2.5 12 2.5 12s3.5 7 9.5 7c1 0 1.9-.2 2.8-.5"/>'}</svg></button><button type="button" class="btn tracking-connection-config-toggle" data-tracking-action="toggle-connection-config" aria-controls="trackingConnectionConfig" aria-expanded="${state.connectionConfigExpanded ? 'true' : 'false'}" title="Mostrar ou recolher ações INS v8, perfil MCC e ferramentas de CSV">${state.connectionConfigExpanded ? 'Recolher opções' : 'Exibir opções'}</button></div>
        </div>
        <div id="trackingConnectionConfig" class="tracking-connection-config"${state.connectionConfigExpanded ? '' : ' hidden'}>
          <div class="tracking-connection-actions">
            <button type="button" class="btn primary" data-tracking-action="refresh-ins-v8"${state.serverPending ? ' disabled' : ''}>${state.serverPending ? 'Consultando INS v8…' : 'Consultar vendas INS v8'}</button>
            <button type="button" class="btn" data-tracking-action="refresh-server"${state.serverPending ? ' disabled' : ''}>${state.serverPending ? 'Atualizando…' : 'Atualizar do servidor · postbacks antigos'}</button>
            <a class="btn" href="/?view=tracking-settings">Configurações globais</a>
          </div>
          <p class="tracking-connection-note">${state.apiToken ? 'O token compartilhado está configurado neste navegador.' : 'Configure o token de acesso compartilhado em Configurações globais para consultar o servidor.'}</p>
        <section class="tracking-conversion-profile" aria-label="Perfil de ação de conversão para CSV">
          <div class="tracking-table-heading"><div><h3>Ação de conversão · vendas INS v8</h3><p>Cadastre um perfil para cada conta/MCC. O rótulo ajuda a identificar o destino; a ação deve corresponder exatamente ao nome no Google Ads. Isso se aplica somente ao CSV INS v8.</p></div></div>
          <div class="tracking-conversion-profile-grid">
            <label class="tracking-token-field" for="trackingConversionProfileSelect"><span>Perfil selecionado para exportação</span><select id="trackingConversionProfileSelect"><option value="">Selecione um perfil</option>${state.conversionProfiles.map(profile => `<option value="${escapeHtml(profile.id)}"${profile.id === state.selectedConversionProfileId ? ' selected' : ''}>${escapeHtml(profile.label)} · ${escapeHtml(profile.conversionName)}</option>`).join('')}</select></label>
            <label class="tracking-token-field" for="trackingConversionProfileLabel"><span>Conta/MCC · rótulo local</span><input id="trackingConversionProfileLabel" type="text" maxlength="120" autocomplete="off" spellcheck="false" placeholder="ex.: MCC principal"></label>
            <label class="tracking-token-field" for="trackingConversionActionName"><span>Nome exato da ação no Google Ads</span><input id="trackingConversionActionName" type="text" maxlength="255" autocomplete="off" spellcheck="false" placeholder="ex.: Compra ClickBank"></label>
            <div class="tracking-domain-actions">
              <button type="button" class="btn" data-tracking-action="new-conversion-profile">Novo perfil</button>
              <button type="button" class="btn primary" data-tracking-action="save-conversion-profile">Salvar perfil</button>
              <button type="button" class="btn" data-tracking-action="remove-conversion-profile"${selectedProfile ? '' : ' disabled'}>Remover selecionado</button>
            </div>
          </div>
          <p id="trackingConversionProfileMessage" class="tracking-conversion-profile-message${state.conversionProfileError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.conversionProfileMessage)}</p>
          <p class="tracking-connection-note tracking-instruction">Perfis e nomes de ações ficam no <code>localStorage</code> deste navegador/origem, sem criptografia e fora dos backups JSON do Hub; não são enviados em consultas, apenas o nome da ação selecionada segue no POST autenticado ao gerar o CSV. O rótulo da conta/MCC não é enviado. A seleção não escolhe a conta no Google Ads: confirme a MCC de destino antes do upload.</p>
        </section>
        <div class="tracking-actions">
          <label class="btn tracking-file-button" for="trackingCsvFile"><input id="trackingCsvFile" class="tracking-file-input" type="file" accept=".csv,text/csv"><span>Importar CSV já baixado</span></label>
          <button type="button" class="btn primary" data-tracking-action="download"${canDownload && !state.serverPending ? '' : ' disabled'} title="${downloadTitle}">${state.source === 'server-ins-v8' && !selectedProfile ? 'Selecione o perfil para baixar CSV' : 'Baixar CSV para Google Ads'}</button>
          <button type="button" class="btn" data-tracking-action="clear"${report ? '' : ' disabled'}>Limpar leitura</button>
        </div>
        </div>
        ${statusMarkup()}
        <p class="tracking-scope-note tracking-instruction">O Hub não grava a base operacional nem envia conversões ao Google Ads. O CSV INS v8 é somente preparado e baixado manualmente. Não reenvie linhas já aceitas.</p>
      </section>
      <section class="tracking-panel tracking-domain-panel" aria-label="Tracks cadastradas">
        <div class="tracking-table-heading tracking-domain-heading"><div><h2>Tracks ClickBank</h2><p>Contagem de checkouts ClickBank e vendas por domínio e Track; o cadastro global fica em Configurações globais.</p></div><div class="tracking-domain-heading-actions"><span class="tracking-count">${clickBankDomains.length} ${clickBankDomains.length === 1 ? 'Track' : 'Tracks'} na tabela</span><button type="button" class="btn" data-tracking-action="refresh-track-sales" title="Consulta vendas SALE reais de afiliado e eventos ORDER_IMPRESSION de checkout. Ambos são associados somente por extclid a uma única combinação de domínio e produto; a sincronização de vendas é salva no cache local, os checkouts são consultados ao vivo. Não envia conversões ao Google Ads."${state.salesPending || state.checkoutsPending ? ' disabled' : ''}>${state.salesPending || state.checkoutsPending ? 'Atualizando vendas e checkouts…' : 'Atualizar vendas e checkouts'}</button><a class="btn" href="/?view=tracking-settings">Configurações globais</a></div></div>
        <p class="tracking-auto-refresh-note">${escapeHtml(salesAutoRefreshStatus)}</p>
        ${domainRows}
        <p class="tracking-connection-note${state.salesCacheAvailable || state.salesAutoOnlyData ? '' : ' is-error'}">${escapeHtml(salesCacheSummary)}</p>
        ${state.salesFeedback ? `<p class="tracking-domain-message${state.salesError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.salesFeedback)}</p>` : ''}
        ${state.checkoutsFeedback ? `<p class="tracking-domain-message${state.checkoutsError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.checkoutsFeedback)}</p>` : ''}
        <p class="tracking-connection-note tracking-instruction">Checkouts contam eventos ClickBank <code>ORDER_IMPRESSION</code> e só são atribuídos quando o <code>extclid</code> corresponde a uma única Track ainda cadastrada. Checkouts sem correspondência ou ambíguos não entram na coluna; eles não representam vendas.</p>
        <p class="tracking-connection-note tracking-instruction">Para cadastrar ou atualizar domínios e copiar as tags, abra Configurações globais.</p>
      </section>
      <section class="tracking-panel tracking-clicks-panel" aria-label="Relatório de visitas e cliques da pre-sell">
        <div class="tracking-intro-head tracking-clicks-head">
          <div class="tracking-intro-copy"><h2>Tracking de visitas e cliques</h2><p>Veja o cache local ou atualize os eventos agregados por dia, produto e hostname no servidor. O relatório não retorna GCLID, extclid, URL completa ou identificadores de visitante.</p></div>
          <div class="tracking-connection-actions"><button type="button" class="btn primary" data-tracking-action="refresh-clicks"${state.clicksPending || state.clicksCacheLoading ? ' disabled' : ''}>${state.clicksCacheLoading ? 'Lendo cache local…' : state.clicksPending ? 'Atualizando…' : 'Atualizar do servidor'}</button></div>
        </div>
        <p class="tracking-auto-refresh-note">${escapeHtml(clicksAutoRefreshStatus)}</p>
        <div class="tracking-clicks-date-range">
          <label class="tracking-token-field" for="trackingClicksStartDate"><span>De · data UTC</span><input id="trackingClicksStartDate" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="10" placeholder="dd/mm/aaaa" aria-label="Data inicial em formato dd/mm/aaaa, considerada em UTC" value="${escapeHtml(state.clicksStartDateInput)}"${state.clicksPending ? ' disabled' : ''}></label>
          <label class="tracking-token-field" for="trackingClicksEndDate"><span>Até · data UTC</span><input id="trackingClicksEndDate" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="10" placeholder="dd/mm/aaaa" aria-label="Data final em formato dd/mm/aaaa, considerada em UTC" value="${escapeHtml(state.clicksEndDateInput)}"${state.clicksPending ? ' disabled' : ''}></label>
          <label class="tracking-token-field" for="trackingClicksDatePreset"><span>Período rápido</span><select id="trackingClicksDatePreset" aria-label="Selecionar período rápido para o relatório"${state.clicksPending ? ' disabled' : ''}>
            <option value="custom" hidden${state.clicksDatePreset === 'custom' ? ' selected' : ''}>Personalizado</option>
            <option value="today"${state.clicksDatePreset === 'today' ? ' selected' : ''}>Hoje</option>
            <option value="yesterday"${state.clicksDatePreset === 'yesterday' ? ' selected' : ''}>Ontem</option>
            <option value="7-days"${state.clicksDatePreset === '7-days' ? ' selected' : ''}>7 Dias</option>
            <option value="30-days"${state.clicksDatePreset === '30-days' ? ' selected' : ''}>30 Dias</option>
            <option value="this-month"${state.clicksDatePreset === 'this-month' ? ' selected' : ''}>Este Mês</option>
            <option value="last-month"${state.clicksDatePreset === 'last-month' ? ' selected' : ''}>Mês Passado</option>
            <option value="total"${state.clicksDatePreset === 'total' ? ' selected' : ''}>Total</option>
          </select></label>
        </div>
        <p class="tracking-date-format-note tracking-instruction">Formato brasileiro: <strong>dd/mm/aaaa</strong>. “Hoje” segue o calendário local do navegador; os relatórios continuam agrupados por data UTC. “Total” consulta os últimos 366 dias (limite por consulta do servidor). Selecionar um período faz uma busca automática para esta tela; o botão manual continua salvando no cache local.</p>
        ${state.clicksFeedback ? `<p class="tracking-message${state.clicksError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.clicksFeedback)}</p>` : ''}
      <p class="tracking-connection-note tracking-instruction">O botão manual salva o relatório no IndexedDB local deste navegador/origem; a busca automática atualiza somente esta tela e não grava snapshots. Somente contagens agregadas, produto, domínio e horários são salvos no cache. Token, GCLID, extclid, URL completa e dados de visitante não entram nele. O cache não faz parte do backup geral do Hub.</p>
        ${trackingClicksPreviewMarkup()}
      </section>
      <section class="tracking-panel tracking-results" aria-label="Dados do CSV">${previewMarkup()}</section>
    </div>`;
    const tokenField = root.querySelector?.('#trackingApiToken');
    if (tokenField) tokenField.value = state.apiToken;
    const rememberField = root.querySelector?.('#trackingRememberToken');
    if (rememberField) rememberField.checked = state.rememberToken;
    const domainTokenField = root.querySelector?.('#trackingDomainAdminToken');
    if (domainTokenField) domainTokenField.value = state.domainAdminToken;
    const rememberDomainTokenField = root.querySelector?.('#trackingRememberDomainAdminToken');
    if (rememberDomainTokenField) rememberDomainTokenField.checked = state.rememberDomainAdminToken;
    const domainNameField = root.querySelector?.('#trackingDomainName');
    if (domainNameField) domainNameField.value = state.domainName;
    const productKeyField = root.querySelector?.('#trackingDomainProductKey');
    if (productKeyField) productKeyField.value = state.domainProductKey;
    const domainIncludeWwwField = root.querySelector?.('#trackingDomainIncludeWww');
    if (domainIncludeWwwField) domainIncludeWwwField.checked = state.domainIncludeWww;
    const domainTokenVisibleField = root.querySelector?.('#trackingDomainAdminTokenVisible');
    if (domainTokenVisibleField) domainTokenVisibleField.checked = state.domainAdminTokenVisible;
    const clicksStartField = root.querySelector?.('#trackingClicksStartDate');
    if (clicksStartField) clicksStartField.value = state.clicksStartDateInput;
    const clicksEndField = root.querySelector?.('#trackingClicksEndDate');
    if (clicksEndField) clicksEndField.value = state.clicksEndDateInput;
    const clicksDatePresetField = root.querySelector?.('#trackingClicksDatePreset');
    if (clicksDatePresetField) clicksDatePresetField.value = state.clicksDatePreset;
    const clicksProductField = root.querySelector?.('#trackingClicksProductFilter');
    if (clicksProductField) clicksProductField.value = state.clicksProductFilter;
    const clicksHostField = root.querySelector?.('#trackingClicksHostFilter');
    if (clicksHostField) clicksHostField.value = state.clicksHostFilter;
    const conversionProfileSelect = root.querySelector?.('#trackingConversionProfileSelect');
    if (conversionProfileSelect) conversionProfileSelect.value = state.selectedConversionProfileId;
    const conversionProfileLabel = root.querySelector?.('#trackingConversionProfileLabel');
    if (conversionProfileLabel) conversionProfileLabel.value = state.conversionProfileLabelInput;
    const conversionActionName = root.querySelector?.('#trackingConversionActionName');
    if (conversionActionName) conversionActionName.value = state.conversionProfileActionInput;
    if (state.tagDialogNeedsFocus) {
      root.querySelector?.('#trackingTagDialog')?.focus?.();
      state.tagDialogNeedsFocus = false;
    }
    if (state.tagDialogRestoreFocus) {
      root.querySelector?.('[data-tracking-action="show-presell-tag"]')?.focus?.();
      state.tagDialogRestoreFocus = false;
    }
    updateTokenStorageStatus();
  }

  async function importFile(file) {
    if (!file) return;
    state.feedback = '';
    state.feedbackError = false;
    if (!/\.csv$/i.test(file.name || '')) {
      state.feedback = 'Selecione um arquivo com extensão .csv.';
      state.feedbackError = true;
      render();
      return;
    }
    if (file.size > MAX_TRACKING_CSV_BYTES) {
      state.feedback = 'O arquivo excede o limite local de 5 MB.';
      state.feedbackError = true;
      render();
      return;
    }
    try {
      const rawText = await file.text();
      const report = parseGoogleAdsCsv(rawText);
      state.report = report;
      state.source = 'file';
      state.fileName = file.name;
      state.importedAt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
      state.feedback = '';
      state.feedbackError = false;
    } catch (error) {
      state.feedback = error instanceof Error ? error.message : 'Não foi possível ler este CSV.';
      state.feedbackError = true;
    }
    render();
  }

  function downloadOriginal() {
    if (!state.report?.downloadable) return;
    const blob = new Blob([state.report.rawText], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileNameForDownload(state.fileName);
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    state.feedback = 'Download iniciado. O arquivo é uma cópia exata do CSV importado.';
    state.feedbackError = false;
    render();
  }

  function triggerBlobDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function refreshFromServer() {
    if (!state.apiToken) {
      state.feedback = 'Configure o token compartilhado do Hub em Configurações globais.';
      state.feedbackError = true;
      render();
      return;
    }
    if (state.rememberToken) syncTokenStorage();
    state.serverPending = true;
    state.feedback = 'Consultando o relatório agregado no servidor…';
    state.feedbackError = false;
    render();
    try {
      state.report = await fetchTrackingReport(state.apiToken);
      state.source = 'server';
      state.fileName = '';
      state.importedAt = '';
      state.feedback = '';
      state.feedbackError = false;
    } catch (error) {
      if (state.source === 'server') {
        state.report = null;
        state.source = '';
      }
      state.feedback = error instanceof Error ? error.message : 'Não foi possível atualizar do servidor.';
      state.feedbackError = true;
    } finally {
      state.serverPending = false;
      render();
    }
  }

  async function refreshInsV8FromServer() {
    if (!state.apiToken) {
      state.feedback = 'Configure o token compartilhado do Hub em Configurações globais.';
      state.feedbackError = true;
      render();
      return;
    }
    if (state.rememberToken) syncTokenStorage();
    state.serverPending = true;
    state.feedback = 'Consultando somente as transações armazenadas pelo receptor INS v8…';
    state.feedbackError = false;
    render();
    try {
      state.report = await fetchClickBankInsV8Report(state.apiToken);
      state.source = 'server-ins-v8';
      state.fileName = '';
      state.importedAt = '';
      state.feedback = '';
      state.feedbackError = false;
    } catch (error) {
      if (state.source === 'server-ins-v8') {
        state.report = null;
        state.source = '';
      }
      state.feedback = error instanceof Error ? error.message : 'Não foi possível consultar as vendas INS v8.';
      state.feedbackError = true;
    } finally {
      state.serverPending = false;
      render();
    }
  }

  async function refreshTrackingClicks({ automatic = false } = {}) {
    if (!state.apiToken) {
      if (automatic) return;
      state.clicksFeedback = 'Configure o token compartilhado do Hub em Configurações globais para consultar o relatório.';
      state.clicksError = true;
      render();
      return;
    }
    if (state.clicksPending) return;
    let range;
    try {
      const startDate = parseTrackingDatePtBr(state.clicksStartDateInput);
      const endDate = parseTrackingDatePtBr(state.clicksEndDateInput);
      if (!startDate || !endDate) throw new Error('Informe as duas datas válidas no formato dd/mm/aaaa.');
      range = validateTrackingClicksDateRange(startDate, endDate);
    } catch (error) {
      state.clicksFeedback = error instanceof Error ? error.message : 'Confira o período informado.';
      state.clicksError = true;
      render();
      return;
    }
    if (!automatic && state.rememberToken) syncTokenStorage();
    state.clicksPending = true;
    state.clicksFeedback = automatic
      ? 'Atualizando automaticamente somente os totais agregados…'
      : 'Atualizando no servidor somente os totais agregados…';
    state.clicksError = false;
    render();
    try {
      const serverReport = await fetchTrackingClicksReport(state.apiToken, range, { platform: 'clickbank' });
      state.clicksProductFilter = '';
      state.clicksHostFilter = '';
      state.clicksReport = serverReport;
      const refreshedAtUtc = nowFn().toISOString();
      state.clicksLastServerRefreshAtUtc = refreshedAtUtc;
      state.clicksAutoOnlyData = automatic;
      if (automatic) {
        state.clicksFeedback = `Busca automática concluída: ${serverReport.rows.length} combinação(ões) agregada(s). Os dados desta consulta ficam nesta tela; use Atualizar do servidor para salvar no cache local.`;
        state.clicksError = false;
        return;
      }
      try {
        await clicksStorage.append(serverReport);
        state.clicksSnapshots = await clicksStorage.read();
        state.clicksCacheAvailable = true;
        const cached = resolveTrackingClicksCache(state.clicksSnapshots, range, 'clickbank');
        state.clicksReport = cached.report || serverReport;
        state.clicksCacheMeta = cached.meta;
        state.clicksLastServerRefreshAtUtc = cached.meta.cacheUpdatedAtUtc || refreshedAtUtc;
        state.clicksFeedback = `Atualização salva no cache local: ${serverReport.rows.length} combinação(ões) agregada(s); ${cached.meta.coveredDays} de ${cached.meta.totalDays} dias cobertos.`;
        state.clicksError = false;
      } catch (error) {
        state.clicksCacheAvailable = false;
        state.clicksCacheMeta = null;
        state.clicksAutoOnlyData = true;
        state.clicksFeedback = `Consulta concluída, mas não foi possível salvar/ler o cache local (${error instanceof Error ? error.message : 'erro de armazenamento'}). O relatório ficará visível somente nesta aba.`;
        state.clicksError = true;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Não foi possível consultar os cliques.';
      state.clicksFeedback = state.clicksReport
        ? `${automatic ? 'A busca automática falhou' : 'Falha ao atualizar'}: ${reason} Os dados exibidos anteriormente foram mantidos.`
        : reason;
      state.clicksError = true;
    } finally {
      state.clicksPending = false;
      render();
    }
  }

  async function downloadFromServer() {
    if (!state.report?.downloadAvailable || !['server', 'server-ins-v8'].includes(state.source) || state.serverPending) return;
    const isInsV8 = state.source === 'server-ins-v8';
    const conversionProfile = isInsV8 ? activeConversionProfile() : null;
    if (isInsV8 && !conversionProfile) {
      state.feedback = 'Selecione e salve o perfil da conta/MCC antes de gerar o CSV.';
      state.feedbackError = true;
      render();
      return;
    }
    state.serverPending = true;
    state.feedback = isInsV8 ? 'Preparando o CSV com as vendas INS v8 elegíveis…' : 'Solicitando o CSV atualizado ao servidor…';
    state.feedbackError = false;
    render();
    try {
      const blob = isInsV8
        ? await downloadClickBankInsV8Csv(state.apiToken, { conversionName: conversionProfile.conversionName })
        : await downloadTrackingCsv(state.apiToken);
      triggerBlobDownload(blob, isInsV8 ? profileCsvFilename(conversionProfile.label) : 'clickbank-google-ads.csv');
      state.feedback = isInsV8
        ? `CSV preparado para “${conversionProfile.label}” com a ação “${conversionProfile.conversionName}”. Confira a MCC de destino; o arquivo não foi enviado ao Google Ads.`
        : 'Download iniciado. Revise o arquivo. Ele não foi enviado ao Google Ads; o envio manual fica a seu critério.';
      state.feedbackError = false;
    } catch (error) {
      state.feedback = error instanceof Error ? error.message : 'Não foi possível baixar o CSV do servidor.';
      state.feedbackError = true;
    } finally {
      state.serverPending = false;
      render();
    }
  }

  function setConversionProfileMessage(message, isError = false) {
    state.conversionProfileMessage = message;
    state.conversionProfileError = isError;
  }

  function selectConversionProfile(profileId) {
    const profile = state.conversionProfiles.find(item => item.id === profileId) || null;
    state.selectedConversionProfileId = profile?.id || '';
    state.editingConversionProfileId = profile?.id || '';
    state.conversionProfileLabelInput = profile?.label || '';
    state.conversionProfileActionInput = profile?.conversionName || '';
    const saved = saveTrackingConversionProfiles(state.conversionProfiles, state.selectedConversionProfileId);
    state.conversionProfileStorageStatus = saved.saved ? 'saved' : 'unavailable';
    setConversionProfileMessage(profile
      ? `Perfil “${profile.label}” selecionado para o próximo CSV.${saved.saved ? ' Seleção salva neste navegador.' : ' A seleção vale somente nesta aba.'}`
      : 'Nenhum perfil selecionado; o CSV INS v8 ficará desabilitado até escolher uma conta/MCC.', !saved.saved && state.conversionProfiles.length > 0);
    render();
  }

  function startNewConversionProfile() {
    if (state.conversionProfiles.length >= 20) {
      setConversionProfileMessage('Limite de 20 perfis atingido. Remova um perfil antes de criar outro.', true);
      render();
      return;
    }
    state.selectedConversionProfileId = '';
    const selectionSaved = saveTrackingConversionProfiles(state.conversionProfiles, '');
    state.conversionProfileStorageStatus = selectionSaved.saved ? 'saved' : 'unavailable';
    state.editingConversionProfileId = newTrackingConversionProfileId();
    state.conversionProfileLabelInput = '';
    state.conversionProfileActionInput = '';
    setConversionProfileMessage('Preencha o rótulo da conta/MCC e o nome exato da ação; depois clique em Salvar perfil.');
    render();
  }

  function saveConversionProfile() {
    try {
      const profile = normalizeTrackingConversionProfile({
        id: state.editingConversionProfileId || newTrackingConversionProfileId(),
        label: state.conversionProfileLabelInput,
        conversionName: state.conversionProfileActionInput,
      });
      const exists = state.conversionProfiles.some(item => item.id === profile.id);
      if (!exists && state.conversionProfiles.length >= 20) throw new Error('profile_limit');
      state.conversionProfiles = exists
        ? state.conversionProfiles.map(item => item.id === profile.id ? profile : item)
        : [...state.conversionProfiles, profile];
      state.selectedConversionProfileId = profile.id;
      state.editingConversionProfileId = profile.id;
      state.conversionProfileLabelInput = profile.label;
      state.conversionProfileActionInput = profile.conversionName;
      const saved = saveTrackingConversionProfiles(state.conversionProfiles, profile.id);
      state.conversionProfileStorageStatus = saved.saved ? 'saved' : 'unavailable';
      setConversionProfileMessage(saved.saved
        ? `Perfil “${profile.label}” salvo e selecionado neste navegador.`
        : `Perfil “${profile.label}” ativo somente nesta aba; o navegador não permitiu salvá-lo.`, !saved.saved);
    } catch (error) {
      const message = error?.message === 'profile_limit'
        ? 'Limite de 20 perfis atingido. Remova um perfil antes de criar outro.'
        : error?.message === 'invalid_profile_label'
          ? 'Informe um rótulo de conta/MCC de até 120 bytes, sem caracteres de controle.'
          : error?.message === 'invalid_conversion_name'
            ? 'Informe o nome exato da ação (até 255 bytes), sem caracteres de controle.'
            : 'Não foi possível validar o perfil de conversão.';
      setConversionProfileMessage(message, true);
    }
    render();
  }

  function removeConversionProfile() {
    const profile = activeConversionProfile();
    if (!profile) {
      setConversionProfileMessage('Selecione um perfil salvo para removê-lo.', true);
      render();
      return;
    }
    state.conversionProfiles = state.conversionProfiles.filter(item => item.id !== profile.id);
    const next = state.conversionProfiles[0] || null;
    state.selectedConversionProfileId = next?.id || '';
    state.editingConversionProfileId = next?.id || '';
    state.conversionProfileLabelInput = next?.label || '';
    state.conversionProfileActionInput = next?.conversionName || '';
    const saved = saveTrackingConversionProfiles(state.conversionProfiles, state.selectedConversionProfileId);
    state.conversionProfileStorageStatus = saved.saved ? 'saved' : 'unavailable';
    setConversionProfileMessage(saved.saved
      ? `Perfil “${profile.label}” removido deste navegador.${next ? ` “${next.label}” ficou selecionado.` : ' Cadastre o perfil da conta/MCC para habilitar o CSV.'}`
      : `Perfil “${profile.label}” removido apenas desta aba; não foi possível atualizar o armazenamento local.`, !saved.saved);
    render();
  }

  function setDomainMessage(message, isError = false) {
    state.domainMessage = message;
    state.domainError = isError;
  }

  function productLabel(productKey) {
    return state.productLabels.get(productKey) || productKey;
  }

  function trackCreatedAtTimestamp(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T00:00:00Z`
      : raw.replace(' ', 'T');
    const timestampValue = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
      ? normalized
      : `${normalized}Z`;
    const timestamp = Date.parse(timestampValue);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function recentTrackSuggestions() {
    const tracksByLabel = new Map();
    for (const row of state.domainRows) {
      const label = String(row.productLabel || productLabel(row.productKey) || '').trim();
      if (!label) continue;
      const key = label.toLocaleLowerCase('pt-BR');
      const createdAt = trackCreatedAtTimestamp(row.createdAtUtc);
      const current = tracksByLabel.get(key);
      if (!current || createdAt > current.createdAt) tracksByLabel.set(key, { label, createdAt });
    }
    return [...tracksByLabel.values()]
      .sort((left, right) => right.createdAt - left.createdAt || left.label.localeCompare(right.label, 'pt-BR'))
      .slice(0, 5)
      .map(track => track.label);
  }

  function trackSuggestionsMarkup() {
    const suggestions = recentTrackSuggestions();
    if (!suggestions.length) {
      return '<div class="tracking-track-suggestions-empty">Atualize a lista para carregar nomes de Track recentes.</div>';
    }
    return `<div class="tracking-track-suggestions" role="group" aria-label="Últimos nomes de Track cadastrados"><span>Recentes:</span>${suggestions.map(label => `<button type="button" class="tracking-track-suggestion" data-tracking-action="select-track-suggestion" data-track-label="${escapeHtml(label)}" title="Preencher Nome do Track com ${escapeHtml(label)}">${escapeHtml(label)}</button>`).join('')}</div>`;
  }

  function selectTrackSuggestion(label) {
    const value = String(label ?? '').trim();
    if (!value) return;
    state.domainProductKey = value;
    const field = root.querySelector?.('#trackingDomainProductKey');
    if (field) {
      field.value = value;
      field.focus?.();
      field.setSelectionRange?.(value.length, value.length);
    }
    updateProductIdentifierPreview();
  }

  function withProductLabels(rows) {
    return rows.map(row => ({ ...row, productLabel: row.productLabel || productLabel(row.productKey) }));
  }

  function domainListCacheMessage() {
    const savedAt = state.domainListUpdatedAtUtc
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(state.domainListUpdatedAtUtc))
      : '';
    if (state.domainListCacheStatus === 'saved' && savedAt) {
      return `Cache local atualizado em ${savedAt} (horário deste navegador). Clique em Atualizar lista para verificar mudanças no servidor. O cache contém domínios, códigos técnicos e nomes dos Tracks, sem token; fica no localStorage sem criptografia e fora dos backups.`;
    }
    if (state.domainListCacheStatus === 'write-failed') {
      return savedAt
        ? `Não foi possível salvar a atualização mais recente. O cache anterior é de ${savedAt}; a lista atual permanece nesta aba até recarregar.`
        : 'Não foi possível salvar a lista no navegador; ela permanece disponível somente nesta aba.';
    }
    if (state.domainListCacheStatus === 'invalid') {
      return 'O cache local da lista está inválido. Clique em Atualizar lista para carregar e substituir por uma cópia válida.';
    }
    if (state.domainListCacheStatus === 'unavailable') {
      return 'O armazenamento local não está disponível; a lista consultada ficará somente nesta aba. Nenhum token é incluído no cache.';
    }
    return 'Após Atualizar lista, os domínios e códigos de produto serão salvos neste navegador, sem token, para reaparecerem após recarregar a tela.';
  }

  function persistDomainListCache() {
    const result = saveTrackingDomainList(state.domainRows);
    if (result.saved) {
      state.domainListCacheStatus = 'saved';
      state.domainListUpdatedAtUtc = result.updatedAtUtc;
      return true;
    }
    state.domainListCacheStatus = 'write-failed';
    return false;
  }

  function productIdentifierPreview() {
    if (!state.domainProductKey) return 'Espaços serão convertidos em hífens no identificador técnico.';
    try { return `Identificador técnico: ${normalizeTrackingProductKey(state.domainProductKey)}`; }
    catch (error) { return error instanceof Error ? error.message : 'Confira o nome do produto.'; }
  }

  function updateProductIdentifierPreview() {
    const preview = root.querySelector?.('#trackingDomainProductKeyPreview');
    if (preview) preview.textContent = productIdentifierPreview();
  }

  async function copyPresellScript() {
    const field = root.querySelector?.('#trackingPresellScript');
    const selected = state.domainRows.find(row => row.hostname === state.tagDialogHost);
    if (!selected) {
      setDomainMessage('Abra a tag de uma pre-sell cadastrada antes de copiar.', true);
      const status = root.querySelector?.('#trackingDomainMessage');
      if (status) status.textContent = state.domainMessage;
      return;
    }
    const scriptTag = buildTrackingPresellScriptTag(selected.productKey, selected.hostname);
    try {
      if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('clipboard_unavailable');
      await clipboard.writeText(scriptTag);
      setDomainMessage(`Tag copiada para ${selected.productLabel || productLabel(selected.productKey)} (ID ${selected.productKey}). Cole-a uma vez em ${selected.hostname}.`);
    } catch {
      field?.focus?.();
      field?.select?.();
      setDomainMessage('Não foi possível copiar automaticamente. A tag foi selecionada; use Ctrl+C e cole-a uma vez na pre-sell.');
    }
    const status = root.querySelector?.('#trackingDomainMessage');
    if (status) {
      status.textContent = state.domainMessage;
      status.classList?.toggle('is-error', state.domainError);
    }
  }

  function closePresellTag({ restoreFocus = true, renderView = true } = {}) {
    if (!state.tagDialogHost) return;
    state.tagDialogHost = '';
    state.tagDialogRestoreFocus = restoreFocus;
    if (renderView) render();
  }

  function downloadDomainAdminConfig() {
    try {
      const content = trackingDomainAdminConfigPhp(state.domainAdminToken);
      triggerBlobDownload(new Blob([content], { type: 'application/x-php;charset=utf-8' }), TRACKING_DOMAIN_ADMIN_CONFIG_FILE);
      setDomainMessage(`Arquivo ${TRACKING_DOMAIN_ADMIN_CONFIG_FILE} baixado. Envie-o para a mesma pasta privada do tracking-config.php, fora de public_html.`);
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : 'Não foi possível gerar a configuração privada.', true);
    }
    render();
  }

  function generateDomainAdminToken() {
    try {
      state.domainAdminToken = createTrackingDomainAdminToken();
      state.domainAdminTokenVisible = false;
      syncDomainAdminTokenStorage();
      setDomainMessage('Novo token gerado. Para usá-lo, baixe e substitua a configuração privada no servidor. Não gere outro token ao cadastrar cada domínio.');
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : 'Não foi possível gerar o token.', true);
    }
    render();
  }

  async function loadDomainList() {
    if (!state.domainAdminToken) {
      state.domainAdminConfigExpanded = true;
      setDomainMessage('Informe o token administrativo separado do token de acesso às vendas.', true);
      render();
      return;
    }
    state.domainPending = true;
    state.domainAction = 'load';
    setDomainMessage('Consultando a lista autenticada de domínios…');
    render();
    try {
      state.domainRows = withProductLabels(await fetchTrackingDomains(state.domainAdminToken));
      state.domainListLoaded = true;
      persistDomainListCache();
      if (!state.domainRows.some(row => row.hostname === state.tagDialogHost)) closePresellTag({ restoreFocus: false, renderView: false });
      setDomainMessage(`${state.domainRows.length} domínio(s) cadastrado(s) nesta tabela. Domínios da allowlist legada permanecem autorizados, mas não são listados aqui.`);
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : 'Não foi possível consultar os domínios.', true);
    } finally {
      state.domainPending = false;
      state.domainAction = '';
      render();
    }
  }

  async function saveDomain() {
    if (!state.domainAdminToken) {
      state.domainAdminConfigExpanded = true;
      setDomainMessage('Informe o token administrativo separado do token de acesso às vendas.', true);
      render();
      return;
    }
    let hostname;
    let productKey;
    let displayLabel;
    try {
      hostname = normalizeTrackingDomainInput(state.domainName);
      displayLabel = normalizeTrackingProductLabel(state.domainProductKey);
      productKey = normalizeTrackingProductKey(state.domainProductKey);
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : 'Confira o domínio e o código de produto.', true);
      render();
      return;
    }
    state.domainPending = true;
    state.domainAction = 'add';
    setDomainMessage('Enviando autorização aditiva ao servidor…');
    render();
    try {
      const result = await addTrackingDomain(state.domainAdminToken, hostname, {
        includeWww: state.domainIncludeWww,
        productKey,
        productLabel: displayLabel,
      });
      const registeredProductKey = result.productKey || productKey;
      const registeredProductLabel = result.productLabel || displayLabel.trim();
      const addedAtUtc = nowFn().toISOString();
      const labelSave = saveTrackingProductLabel(registeredProductKey, registeredProductLabel);
      state.productLabels.set(registeredProductKey, registeredProductLabel);
      const affectedHosts = [...new Set([...result.added, ...result.updated, ...result.alreadyAllowed])];
      const rowsByHost = new Map(state.domainRows.map(row => [row.hostname, row]));
      for (const host of affectedHosts) {
        const previous = rowsByHost.get(host);
        rowsByHost.set(host, {
          hostname: host,
          origin: `https://${host}`,
          productKey: registeredProductKey,
          productLabel: registeredProductLabel,
          platform: result.platform || 'clickbank',
          createdAtUtc: previous?.createdAtUtc || (result.added.includes(host) ? addedAtUtc : ''),
        });
      }
      state.domainRows = [...rowsByHost.values()].sort((left, right) => left.hostname.localeCompare(right.hostname));
      if (affectedHosts.length) {
        if (state.domainHighlightTimer !== null) clearTimeoutFn?.(state.domainHighlightTimer);
        state.highlightedDomainHosts = affectedHosts;
        state.domainHighlightTimer = setTimeoutFn?.(() => {
          state.highlightedDomainHosts = [];
          state.domainHighlightTimer = null;
          render();
        }, 2250) ?? null;
      }
      state.tagDialogHost = '';
      if (state.domainListLoaded) persistDomainListCache();
      const parts = [];
      if (result.added.length) parts.push(`Liberado: ${result.added.join(', ')}.`);
      if (result.updated.length) parts.push(`Track atualizada: ${result.updated.join(', ')}.`);
      if (result.alreadyAllowed.length) parts.push(`Domínio/produto já estavam cadastrados: ${result.alreadyAllowed.join(', ')}.`);
      const labelNotice = labelSave.saved
        ? ` Nome do Track “${registeredProductLabel}” salvo no servidor e sincronizado neste navegador.`
        : ` Nome do Track “${registeredProductLabel}” salvo no servidor; será recuperado ao atualizar a lista.`;
      setDomainMessage((parts.join(' ') || 'A API não retornou domínios liberados.') + labelNotice, !parts.length);
      state.domainName = '';
      state.domainProductKey = '';
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : 'Não foi possível autorizar o domínio.', true);
    } finally {
      state.domainPending = false;
      state.domainAction = '';
      render();
    }
  }

  async function handleAction(action) {
    if (action === 'toggle-instructions') {
      state.instructionsVisible = !state.instructionsVisible;
      render();
      return;
    }
    if (action === 'new-conversion-profile') return startNewConversionProfile();
    if (action === 'save-conversion-profile') return saveConversionProfile();
    if (action === 'remove-conversion-profile') return removeConversionProfile();
    if (action === 'download') {
      if (['server', 'server-ins-v8'].includes(state.source)) return downloadFromServer();
      return downloadOriginal();
    }
    if (action === 'refresh-server') return refreshFromServer();
    if (action === 'refresh-ins-v8') return refreshInsV8FromServer();
    if (action === 'toggle-connection-config') {
      state.connectionConfigExpanded = !state.connectionConfigExpanded;
      render();
      return;
    }
    if (action === 'refresh-clicks') return refreshTrackingClicks();
    if (action === 'refresh-track-sales') return Promise.all([refreshTrackSales(), refreshTrackCheckouts()]);
    if (action === 'generate-domain-token') return generateDomainAdminToken();
    if (action === 'toggle-domain-config') {
      state.domainAdminConfigExpanded = !state.domainAdminConfigExpanded;
      render();
      return;
    }
    if (action === 'download-domain-config') return downloadDomainAdminConfig();
    if (action === 'clear-domain-token') {
      state.domainAdminToken = '';
      state.domainAdminTokenVisible = false;
      state.rememberDomainAdminToken = false;
      const removal = clearTrackingDomainAdminToken();
      state.domainTokenStorageStatus = removal.removed ? 'disabled' : 'unavailable';
      setDomainMessage(removal.removed
        ? 'Token administrativo removido desta aba e do armazenamento local deste navegador.'
        : 'Token removido desta aba, mas o navegador não permitiu apagar a cópia local.');
      render();
      return;
    }
    if (action === 'load-domains') return loadDomainList();
    if (action === 'add-domain') return saveDomain();
    if (action === 'copy-presell-script') return copyPresellScript();
    if (action === 'close-presell-tag') return closePresellTag();
    if (action === 'disconnect') {
      stopAutoRefresh({ preserveRequest: true });
      const removal = clearTrackingHubToken();
      state.apiToken = '';
      state.rememberToken = false;
      state.tokenStorageStatus = removal.removed ? 'empty' : 'unavailable';
      state.clicksReport = null;
      state.clicksCacheMeta = null;
      state.clicksFeedback = '';
      state.clicksError = false;
      if (['server', 'server-ins-v8'].includes(state.source)) {
        state.report = null;
        state.source = '';
      }
      state.feedback = removal.removed
        ? 'Token removido da memória e do armazenamento local deste navegador.'
        : 'Token removido da memória desta aba, mas não foi possível apagar a cópia local.';
      state.feedbackError = false;
      render();
      return;
    }
    if (action === 'clear') {
      state.fileName = '';
      state.importedAt = '';
      state.report = null;
      state.source = '';
      state.feedback = 'Leitura removida desta sessão; nenhum registro do Hub foi alterado.';
      state.feedbackError = false;
      render();
    }
  }

  root.addEventListener('input', event => {
    if (event.target?.id === 'trackingApiToken') {
      const hadValidToken = hasValidHubToken();
      state.apiToken = String(event.target.value ?? '').trim();
      syncTokenStorage();
      if (autoRefreshRequested && !hadValidToken && hasValidHubToken() && isTrackingViewVisible()) {
        stopAutoRefresh({ preserveRequest: true });
        void activateAutoRefresh();
      }
    }
    if (event.target?.id === 'trackingDomainAdminToken') {
      state.domainAdminToken = String(event.target.value ?? '').trim();
      syncDomainAdminTokenStorage();
    }
    if (event.target?.id === 'trackingDomainName') state.domainName = String(event.target.value ?? '');
    if (event.target?.id === 'trackingDomainProductKey') {
      state.domainProductKey = String(event.target.value ?? '');
      updateProductIdentifierPreview();
    }
    if (event.target?.id === 'trackingConversionProfileLabel') state.conversionProfileLabelInput = String(event.target.value ?? '');
    if (event.target?.id === 'trackingConversionActionName') state.conversionProfileActionInput = String(event.target.value ?? '');
    if (event.target?.id === 'trackingClicksStartDate' || event.target?.id === 'trackingClicksEndDate') {
      if (event.target.id === 'trackingClicksStartDate') state.clicksStartDateInput = String(event.target.value ?? '');
      else state.clicksEndDateInput = String(event.target.value ?? '');
      state.clicksDatePreset = 'custom';
      const clicksDatePresetField = root.querySelector?.('#trackingClicksDatePreset');
      if (clicksDatePresetField) clicksDatePresetField.value = 'custom';
    }
  });
  root.addEventListener('change', event => {
    if (event.target?.id === 'trackingCsvFile') return importFile(event.target.files?.[0]);
    if (event.target?.id === 'trackingClicksDatePreset') {
      const preset = String(event.target.value ?? '');
      if (preset === 'custom') {
        render();
        return;
      }
      try {
        const range = trackingClicksDateRangeForPreset(preset, nowFn());
        state.clicksDatePreset = preset;
        state.clicksStartDateInput = formatTrackingDatePtBr(range.startDate);
        state.clicksEndDateInput = formatTrackingDatePtBr(range.endDate);
        setClicksCacheForSelectedRange();
        render();
        return refreshTrackingClicks({ automatic: true });
      } catch {
        state.clicksDatePreset = 'custom';
        render();
      }
      return;
    }
    if (['trackingClicksStartDate', 'trackingClicksEndDate'].includes(event.target?.id)) {
      state.clicksDatePreset = 'custom';
      if (setClicksCacheForSelectedRange()) render();
      return;
    }
    if (event.target?.id === 'trackingClicksProductFilter') {
      state.clicksProductFilter = String(event.target.value ?? '');
      render();
    }
    if (event.target?.id === 'trackingClicksHostFilter') {
      state.clicksHostFilter = String(event.target.value ?? '');
      render();
    }
    if (event.target?.id === 'trackingRememberToken') {
      state.rememberToken = Boolean(event.target.checked);
      syncTokenStorage();
      render();
    }
    if (event.target?.id === 'trackingRememberDomainAdminToken') {
      state.rememberDomainAdminToken = Boolean(event.target.checked);
      syncDomainAdminTokenStorage();
      render();
    }
    if (event.target?.id === 'trackingDomainIncludeWww') state.domainIncludeWww = Boolean(event.target.checked);
    if (event.target?.id === 'trackingConversionProfileSelect') {
      selectConversionProfile(String(event.target.value ?? ''));
    }
    if (event.target?.id === 'trackingDomainAdminTokenVisible') {
      state.domainAdminTokenVisible = Boolean(event.target.checked);
      render();
    }
  });
  root.addEventListener('click', event => {
    const actionElement = event.target?.closest?.('[data-tracking-action]');
    const action = actionElement?.dataset?.trackingAction;
    if (action === 'show-presell-tag') {
      const host = String(actionElement?.dataset?.presellHost || '');
      if (state.domainRows.some(row => row.hostname === host)) {
        state.tagDialogHost = host;
        state.tagDialogNeedsFocus = true;
        render();
      }
      return;
    }
    if (action === 'select-track-suggestion') {
      selectTrackSuggestion(actionElement?.dataset?.trackLabel);
      return;
    }
    if (action) return handleAction(action);
  });
  root.addEventListener('keydown', event => {
    if (!state.tagDialogHost) return;
    if (event.key === 'Escape') {
      event.preventDefault?.();
      closePresellTag();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = root.querySelector?.('#trackingTagDialog');
    const focusable = [...(dialog?.querySelectorAll?.('button:not([disabled]), textarea, [href], [tabindex]:not([tabindex="-1"])') || [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = dialog?.ownerDocument?.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault?.();
      last.focus?.();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault?.();
      first.focus?.();
    }
  });

  cacheReadyPromise = Promise.all([loadTrackingClicksCache(), loadTrackingSalesCache()]);
  const controller = Object.freeze({ render, ready: cacheReadyPromise, activate: activateAutoRefresh });
  mountedRoots.set(root, controller);
  bindAutoRefreshLifecycle();
  render();
  return controller;
}
