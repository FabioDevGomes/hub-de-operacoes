import { fetchGoogleAdsConfiguration, fetchGoogleAdsDailyReport, fetchGoogleAdsSaoPauloDayReport, fetchGoogleAdsReport } from './google-ads-service.mjs?v=13';
import { normalizeGoogleAdsDailyReport, normalizeGoogleAdsReport, validateGoogleAdsDailyDateRange, validateGoogleAdsDateRange } from './google-ads-domain.mjs?v=6';
import { refreshGoogleAdsAccountsDirectory } from './google-ads-accounts-directory-service.mjs?v=1';
import { validateGoogleAdsSearchTermsDateRange } from './google-ads-search-terms-domain.mjs?v=4';
import { queryGoogleAdsSearchTerms } from './google-ads-search-terms-controller.mjs?v=4';
import { renderGoogleAdsSearchTermsResults } from './google-ads-search-terms-results.mjs?v=2';
import { normalizeGoogleAdsConfiguration, googleAdsQualification, googleAdsStrategy, googleAdsBudget, googleAdsStatusReason, googleAdsConfigurationIssues } from './google-ads-config-domain.mjs?v=1';
import { compareGoogleAdsDailyReports } from './google-ads-compare-domain.mjs?v=2';
import { buildGoogleAdsCaptureDiff } from './google-ads-capture-diff-domain.mjs?v=4';
import { compareGoogleAdsD0Snapshots } from './google-ads-d0-compare-domain.mjs?v=2';
import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';
import { loadGoogleAdsAccountsCache } from './google-ads-accounts-cache.mjs?v=2';
import { readGoogleAdsCaptureSnapshotRetention, writeGoogleAdsCaptureSnapshotRetention, normalizeGoogleAdsCaptureSnapshotRetention } from './google-ads-capture-snapshot-retention.mjs?v=1';
import { syncGoogleAdsFinalUrlHostCache } from './google-ads-final-url-host-cache.mjs?v=1';

const mountedRoots = new WeakMap();
const GOOGLE_ADS_INITIAL_RENDER_ROWS = 20;
const GOOGLE_ADS_RENDER_PAGE_SIZE = 20;
const GOOGLE_ADS_SEARCH_TERMS_PAGE_SIZE = 50;
const GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_KEY = 'hub:google-ads:change-history-display-limit:v1';
const GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_DEFAULT = 10;
const GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_MAX = 24;
// Two accounts at a time; metrics and inventory for each account are fetched together.
const GOOGLE_ADS_D0_QUERY_CONCURRENCY = 2;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function isoLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultDates(now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { dateFrom: isoLocalDate(start), dateTo: isoLocalDate(end) };
}

function todayInTimeZone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
  } catch {
    return isoLocalDate(new Date());
  }
}

function strictTodayInTimeZone(timeZone) {
  const zone = String(timeZone || '').trim();
  if (!zone) throw new Error('O fuso horário desta conta não foi informado pelo Google Ads.');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const date = `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Não foi possível determinar a data atual no fuso ${zone}.`);
  return date;
}

function managerKey(manager) {
  return manager.customerId ?? 'direct';
}

function money(micros, currencyCode) {
  if (micros == null) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode || 'USD', maximumFractionDigits: 2 }).format(micros / 1_000_000);
  } catch {
    return `${(micros / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${currencyCode || ''}`.trim();
  }
}

function moneyAmount(amount, currencyCode) {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode || 'USD', maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${currencyCode || ''}`.trim();
  }
}

function captureHistoryTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Horário indisponível';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(date);
}

function captureHistoryBusinessDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short' }).format(date)
    : '';
}

function normalizeGoogleAdsCaptureHistoryDisplayLimit(value) {
  const number = Number(value);
  return Number.isInteger(number)
    ? Math.min(GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_MAX, Math.max(1, number))
    : GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_DEFAULT;
}

function readGoogleAdsCaptureHistoryDisplayLimit() {
  try {
    const value = localStorage.getItem(GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_KEY);
    return value == null ? GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_DEFAULT : normalizeGoogleAdsCaptureHistoryDisplayLimit(value);
  } catch {
    return GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_DEFAULT;
  }
}

function writeGoogleAdsCaptureHistoryDisplayLimit(value) {
  try {
    localStorage.setItem(GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_KEY, String(normalizeGoogleAdsCaptureHistoryDisplayLimit(value)));
    return true;
  } catch {
    return false;
  }
}

function integer(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function percentRatio(value) {
  return value == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(value);
}

function impressionShare(value) {
  if (value == null) return '—';
  if (value <= 0.0999) return '<10%*';
  return percentRatio(value);
}

function campaignStatus(value) {
  return ({ ENABLED: 'Ativa', PAUSED: 'Pausada', REMOVED: 'Removida', UNKNOWN: 'Desconhecida' })[value] || value || '—';
}

function channelType(value) {
  return ({ SEARCH: 'Pesquisa', DISPLAY: 'Display', SHOPPING: 'Shopping', VIDEO: 'Vídeo', PERFORMANCE_MAX: 'Performance Max', DEMAND_GEN: 'Demand Gen', MULTI_CHANNEL: 'Multicanal', LOCAL: 'Local', SMART: 'Smart' })[value] || value || '—';
}

export function mount({ root, onOpenSettings = () => {}, getComparisonSnapshot = () => null, getApiCapturesSnapshot = () => [], getApiCaptureHistorySnapshot = () => [], getApiCaptureSnapshotsSnapshot = () => [], onCaptureSnapshotRetentionChange = null, getOperationalSourceMode = () => 'manifest', onOperationalSourceModeChange = () => {}, onPreviewDailyCaptures = null, onSaveDailyCaptures = null, getApiCaptureDateRange = null, getGoogleAdsAutoUpdateStatus = () => null, onGoogleAdsAutoUpdateToggle = () => {}, onGoogleAdsAutoUpdateIntervalChange = () => {} } = {}) {
  if (!root) throw new Error('A área da integração Google Ads não foi encontrada.');
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.refreshCaptureHistory?.({ google_ads_api_change_history: getApiCaptureHistorySnapshot(), google_ads_api_capture_snapshots: getApiCaptureSnapshotsSnapshot() });
    return existing;
  }

  const tokenState = readTrackingHubToken();
  const dates = defaultDates();
  const cachedDirectory = loadGoogleAdsAccountsCache();
  const state = {
    tokenReady: Boolean(tokenState.token),
    accounts: cachedDirectory?.accounts || null,
    accountsCacheAt: cachedDirectory?.savedAtUtc || '',
    accountsCachePersisted: Boolean(cachedDirectory),
    report: null,
    dailyReport: null,
    dailyComparison: null,
    captureDiff: null,
    captureHistory: Array.isArray(getApiCaptureHistorySnapshot()) ? getApiCaptureHistorySnapshot() : [],
    captureSnapshots: Array.isArray(getApiCaptureSnapshotsSnapshot()) ? getApiCaptureSnapshotsSnapshot() : [],
    captureHistoryDisplayLimit: readGoogleAdsCaptureHistoryDisplayLimit(),
    captureHistoryPageLimits: new Map(),
    captureHistorySelectedId: null,
    captureSnapshotRetentionLimit: readGoogleAdsCaptureSnapshotRetention(),
    captureSnapshotRetentionDraft: String(readGoogleAdsCaptureSnapshotRetention()),
    captureSnapshotRetentionApplying: false,
    captureSnapshotRetentionMessage: '',
    d0Comparison: null,
    d0ComparisonPageLimit: GOOGLE_ADS_INITIAL_RENDER_ROWS,
    queryDiagnostics: null,
    queryDiagnosticsDismissed: false,
    pendingD0Capture: null,
    d0QueryMode: 'all',
    dailyMode: null,
    pendingClosure: null,
    closeoutDate: '',
    closeoutSavedAt: '',
    closeoutRunning: false,
    closeoutQueryMode: 'all',
    reportFailures: [],
    dailyFailures: [],
    searchTermsReports: null,
    searchTermsFailures: [],
    searchTermsPending: false,
    searchTermsProgress: '',
    searchTermsTotalAccounts: 0,
    searchTermsDateFrom: '',
    searchTermsDateTo: '',
    searchTermsVisibleCount: GOOGLE_ADS_SEARCH_TERMS_PAGE_SIZE,
    reportPageLimits: new Map(),
    capturePreviewDetailsOpen: false,
    operationalDiffOpen: false,
    selectedManagerKey: '',
    selectedCustomerIds: new Set(),
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    captureWindowDays: 1,
    accountsPending: false,
    reportPending: false,
    message: '',
    messageError: false,
    operationalSourceMode: getOperationalSourceMode() === 'api' ? 'api' : 'manifest',
  };

  root.innerHTML = `
    <div class="google-ads-view">
      <section class="google-ads-card">
        <div class="google-ads-heading">
          <div><div class="google-ads-eyebrow">RELATÓRIOS SOMENTE LEITURA</div><h2>Google Ads</h2></div>
          <div class="google-ads-source-actions" role="group" aria-label="Configurações da integração">
            <button id="googleAdsAutoUpdateSettings" class="btn" type="button">Abrir configurações</button>
          </div>
        </div>
        <dialog id="googleAdsAutoUpdateDialog" class="google-ads-auto-update-dialog" aria-labelledby="googleAdsAutoUpdateDialogTitle">
          <div class="google-ads-auto-update-dialog-content">
            <div><div class="google-ads-eyebrow">PREFERÊNCIAS DESTE PERFIL</div><h2 id="googleAdsAutoUpdateDialogTitle">Configurações da integração Google Ads</h2></div>
            <section class="google-ads-auto-update-source" aria-labelledby="googleAdsSourceModeTitle">
              <div><h3 id="googleAdsSourceModeTitle">Fonte operacional</h3><p id="googleAdsSourceModeStatus"></p></div>
              <span id="googleAdsSourceModeLabel" class="google-ads-visually-hidden"></span>
              <button id="googleAdsSourceModeToggle" class="btn" type="button" aria-describedby="googleAdsSourceModeLabel"></button>
              <p>A escolha vale somente neste perfil do navegador. Ela não apaga capturas nem altera o Diário MCC.</p>
            </section>
            <label for="googleAdsAutoUpdateInterval">Intervalo da captura D0</label>
            <select id="googleAdsAutoUpdateInterval" class="input">
              <option value="30">A cada 30 minutos</option>
              <option value="40">A cada 40 minutos</option>
              <option value="50">A cada 50 minutos</option>
              <option value="60">A cada 1 hora (padrão)</option>
              <option value="70">A cada 1 hora e 10 minutos</option>
              <option value="80">A cada 1 hora e 20 minutos</option>
              <option value="120">A cada 2 horas</option>
              <option value="240">A cada 4 horas</option>
              <option value="360">A cada 6 horas</option>
              <option value="720">A cada 12 horas</option>
              <option value="1440">A cada 24 horas</option>
            </select>
            <section class="google-ads-auto-update-controls" aria-labelledby="googleAdsAutoUpdateToggleHeading">
              <div><h3 id="googleAdsAutoUpdateToggleHeading">Atualização automática</h3><p>Ative ou pause as capturas automáticas D0 e o fechamento D−1 neste perfil.</p></div>
              <button id="googleAdsAutoUpdateToggle" class="btn" type="button" aria-describedby="googleAdsAutoUpdateStatus googleAdsAutoUpdateDetails"><span id="googleAdsAutoUpdateToggleTitle">Ativar atualização automática</span><span id="googleAdsAutoUpdateNextExecution" hidden></span></button>
              <span id="googleAdsAutoUpdateStatus" class="google-ads-visually-hidden" aria-live="polite"></span>
              <span id="googleAdsAutoUpdateDetails" class="google-ads-visually-hidden"></span>
            </section>
            <div id="googleAdsSnapshotRetentionArea"></div>
            <section class="google-ads-closeout google-ads-d0-closeout google-ads-d0-settings" aria-labelledby="googleAdsD0Title">
              <div><div class="google-ads-eyebrow">ACOMPANHAMENTO DO DIA</div><h3 id="googleAdsD0Title">Atualização de D0</h3><small>Ao consultar, esta janela fecha e a prévia aparece na página. Nada é gravado até você validar e clicar em Atualizar base.</small></div>
              <div class="google-ads-closeout-actions"><button id="googleAdsD0AllPreview" class="btn" type="button">Atualizar API Google manualmente · todas</button><button id="googleAdsD0ActivePreview" class="btn primary" type="button">Atualizar API Google manualmente · ativas</button></div>
            </section>
            <p id="googleAdsAutoUpdateSettingsMessage" class="google-ads-auto-update-dialog-message" role="status" aria-live="polite"></p>
            <div class="google-ads-auto-update-dialog-actions"><button id="googleAdsAutoUpdateSettingsCancel" class="btn" type="button">Cancelar</button><button id="googleAdsAutoUpdateSettingsSave" class="btn primary" type="button">Salvar intervalo</button></div>
          </div>
        </dialog>
        <section class="google-ads-closeout" aria-labelledby="googleAdsCloseoutTitle" hidden>
          <div><div class="google-ads-eyebrow">ATUALIZAÇÃO DIÁRIA</div><h3 id="googleAdsCloseoutTitle">Fechamento de D−1</h3><p id="googleAdsCloseoutDate"></p></div>
          <div class="google-ads-closeout-actions"><button id="googleAdsCloseoutPreview" class="btn" type="button">Ver diferenças · todas</button><button id="googleAdsCloseoutActivePreview" class="btn primary" type="button">Ver diferenças · ativas</button><button id="googleAdsCloseoutSave" class="btn" type="button" hidden>Atualizar base</button></div>
        </section>
        <section id="googleAdsQueryDiagnostics" class="google-ads-query-diagnostics" aria-live="polite" hidden></section>
        <section id="googleAdsD0ComparisonArea" class="google-ads-d0-comparison" aria-live="polite" hidden></section>
        <div id="googleAdsD0SaveActions" class="google-ads-d0-save-actions" role="group" aria-label="Confirmação da atualização D0" hidden>
          <p>Prévia pronta. Revise os dados e confirme para atualizar a base.</p>
          <button id="googleAdsD0Save" class="btn primary" type="button">Atualizar base</button>
        </div>
        <section id="googleAdsCaptureHistory" class="google-ads-capture-history" aria-labelledby="googleAdsCaptureHistoryTitle"></section>
        <section class="google-ads-directory" aria-labelledby="googleAdsDirectoryTitle">
          <div class="google-ads-directory-heading"><div><h3 id="googleAdsDirectoryTitle">MCCs e contas conectadas</h3><p id="googleAdsDirectoryStatus"></p></div><button id="googleAdsLoadAccounts" class="btn" type="button">Atualizar lista de MCCs e contas</button></div>
          <div id="googleAdsAccountDirectory" class="google-ads-directory-list"></div>
        </section>
        <details class="google-ads-advanced-tools">
          <summary>Consultas, filtros e capturas manuais</summary>
          <div class="google-ads-advanced-tools-body">
        <div class="google-ads-toolbar">
          <button id="googleAdsRunReport" class="btn primary" type="button">Consultar desempenho</button>
          <button id="googleAdsRunDailyReport" class="btn" type="button">Prévia diária para comparar</button>
          <button id="googleAdsRunSearchTerms" class="btn" type="button">Consultar termos de pesquisa</button>
          <label class="google-ads-capture-window">Período para prévia/captura<select id="googleAdsCaptureWindow" class="input"><option value="1" selected>Hoje</option><option value="yesterday">Ontem</option><option value="2">Últimos 2 dias</option><option value="7">Últimos 7 dias</option></select></label>
          <button id="googleAdsPreviewNormalized" class="btn" type="button">Prévia normalizada · Hoje</button>
          <button id="googleAdsFeedToday" class="btn" type="button">Alimentar API · Hoje</button>
          <button id="googleAdsFeedAllAccounts" class="btn primary" type="button">Alimentar todas as contas · Hoje</button>
          <button id="googleAdsLast7Days" class="btn" type="button">Últimos 7 dias fechados</button>
          <button id="googleAdsOpenSettings" class="btn" type="button">Configurações globais</button>
        </div>
        <div id="googleAdsMessage" class="google-ads-message" role="status" aria-live="polite"></div>
        <div class="google-ads-controls">
          <label>MCC<select id="googleAdsManager" class="input" disabled><option value="">Atualize a lista de contas</option></select></label>
          <div class="google-ads-account-field"><span>Contas Google Ads</span><details id="googleAdsAccountPicker" class="google-ads-account-picker" aria-disabled="true">
            <summary id="googleAdsAccountSummary">Atualize a lista de contas</summary>
            <div class="google-ads-account-menu"><div class="google-ads-account-actions"><button id="googleAdsSelectAllAccounts" class="btn" type="button">Selecionar todas</button><button id="googleAdsClearAccounts" class="btn" type="button">Limpar</button></div><div id="googleAdsAccountOptions" class="google-ads-account-options" role="group" aria-label="Contas Google Ads"></div></div>
          </details></div>
          <label>De · data da conta<input id="googleAdsDateFrom" class="input" type="date" value="${dates.dateFrom}"></label>
          <label>Até · data da conta<input id="googleAdsDateTo" class="input" type="date" value="${dates.dateTo}"></label>
        </div>
        <p class="google-ads-daily-note">A prévia normalizada e a alimentação de “Ontem” consultam o dia civil completo de São Paulo (00:00–23:59), agregando horas no fuso da conta. A captura alimenta D−1 no modo API. A prévia mostra status, qualificação e orçamento atuais apenas como referência; ao gravar D−1, só entra uma configuração anteriormente registrada naquela data. Hoje, 2 e 7 dias usam o fuso de cada conta; 2 e 7 dias incluem hoje e podem reconsultar dias anteriores para incorporar correções do Google. A API começa em 26/10/2026; a prévia não grava e o Diário MCC persistido não é regravado.</p>
          </div>
        </details>
        <div id="googleAdsReportArea" class="google-ads-report-area">
          <div class="google-ads-empty">Use “Atualizar API Google manualmente · todas” ou “Atualizar API Google manualmente · ativas” para consultar o D0. A captura só é salva após revisão e confirmação.</div>
        </div>
        <section id="googleAdsSearchTermsArea" class="google-ads-search-terms-area" aria-live="polite" hidden></section>
      </section>
    </div>`;

  const $ = selector => root.querySelector(selector);
  const managerSelect = $('#googleAdsManager');
  const accountPicker = $('#googleAdsAccountPicker');
  const accountSummary = $('#googleAdsAccountSummary');
  const accountOptions = $('#googleAdsAccountOptions');
  const selectAllAccountsButton = $('#googleAdsSelectAllAccounts');
  const clearAccountsButton = $('#googleAdsClearAccounts');
  const message = $('#googleAdsMessage');
  const reportArea = $('#googleAdsReportArea');
  const accountsButton = $('#googleAdsLoadAccounts');
  const feedAllAccountsButton = $('#googleAdsFeedAllAccounts');
  const accountDirectoryStatus = $('#googleAdsDirectoryStatus');
  const accountDirectory = $('#googleAdsAccountDirectory');
  const reportButton = $('#googleAdsRunReport');
  const dailyReportButton = $('#googleAdsRunDailyReport');
  const searchTermsButton = $('#googleAdsRunSearchTerms');
  const searchTermsArea = $('#googleAdsSearchTermsArea');
  const normalizedPreviewButton = $('#googleAdsPreviewNormalized');
  const feedTodayButton = $('#googleAdsFeedToday');
  const last7DaysButton = $('#googleAdsLast7Days');
  const settingsButton = $('#googleAdsOpenSettings');
  const sourceModeButton = $('#googleAdsSourceModeToggle');
  const sourceModeLabel = $('#googleAdsSourceModeLabel');
  const sourceModeStatus = $('#googleAdsSourceModeStatus');
  const sourceModeDialog = $('#googleAdsAutoUpdateDialog');
  const autoUpdateButton = $('#googleAdsAutoUpdateToggle');
  const autoUpdateButtonTitle = $('#googleAdsAutoUpdateToggleTitle');
  const autoUpdateNextExecution = $('#googleAdsAutoUpdateNextExecution');
  const autoUpdateSettingsButton = $('#googleAdsAutoUpdateSettings');
  const autoUpdateDialog = $('#googleAdsAutoUpdateDialog');
  const autoUpdateIntervalSelect = $('#googleAdsAutoUpdateInterval');
  const autoUpdateSettingsMessage = $('#googleAdsAutoUpdateSettingsMessage');
  const autoUpdateSettingsCancel = $('#googleAdsAutoUpdateSettingsCancel');
  const autoUpdateSettingsSave = $('#googleAdsAutoUpdateSettingsSave');
  const autoUpdateStatus = $('#googleAdsAutoUpdateStatus');
  const autoUpdateDetails = $('#googleAdsAutoUpdateDetails');
  const closeoutPreviewButton = $('#googleAdsCloseoutPreview');
  const closeoutActivePreviewButton = $('#googleAdsCloseoutActivePreview');
  const closeoutSaveButton = $('#googleAdsCloseoutSave');
  const d0AllPreviewButton = $('#googleAdsD0AllPreview');
  const d0ActivePreviewButton = $('#googleAdsD0ActivePreview');
  const d0SaveActionsArea = $('#googleAdsD0SaveActions');
  const d0SaveButton = $('#googleAdsD0Save');
  const d0ComparisonArea = $('#googleAdsD0ComparisonArea');
  const captureHistoryArea = $('#googleAdsCaptureHistory');
  const captureSnapshotRetentionArea = $('#googleAdsSnapshotRetentionArea');
  const queryDiagnosticsArea = $('#googleAdsQueryDiagnostics');
  const closeoutDateLabel = $('#googleAdsCloseoutDate');

  function autoUpdateTime(value) {
    const date = new Date(value || '');
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
      : '—';
  }

  function autoUpdateBusinessDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
      : '';
  }

  function renderAutoUpdateStatus() {
    const snapshot = getGoogleAdsAutoUpdateStatus() || {};
    const enabled = snapshot.enabled === true;
    autoUpdateButtonTitle.textContent = enabled ? 'Desativar atualização automática' : 'Ativar atualização automática';
    autoUpdateButton.setAttribute('aria-pressed', String(enabled));
    autoUpdateButton.disabled = snapshot.supported === false && !enabled;
    let nextExecutionText = '';
    if (enabled && snapshot.state === 'running') {
      const operation = snapshot.d1ReconciliationRunning ? 'Revisão D−1' : snapshot.operation === 'D-1' ? 'D−1' : snapshot.operation || 'Captura';
      const businessDate = operation === 'D−1' ? autoUpdateBusinessDate(snapshot.pendingD1Date) : '';
      const reconciliationDate = snapshot.d1ReconciliationRunning ? autoUpdateBusinessDate(snapshot.pendingD1Date) : '';
      nextExecutionText = `${operation} em andamento${businessDate ? ` · dados de ${businessDate}` : reconciliationDate ? ` · dados de ${reconciliationDate}` : ''}`;
    } else if (enabled && snapshot.state === 'unsupported') {
      nextExecutionText = 'Indisponível neste navegador';
    } else if (enabled && snapshot.state === 'paused') {
      nextExecutionText = 'Pausada no modo Manifesto MCC';
    } else if (enabled && snapshot.d1BackfillBlocked) {
      nextExecutionText = `D−1 pendente desde ${autoUpdateBusinessDate(snapshot.pendingD1Date) || snapshot.pendingD1Date} · fora da janela de 14 dias`;
    } else if (enabled && snapshot.pendingD1Date) {
      const pendingDate = autoUpdateBusinessDate(snapshot.pendingD1Date) || snapshot.pendingD1Date;
      const pendingCount = Math.max(1, Number(snapshot.pendingD1Count) || 1);
      nextExecutionText = `D−1 pendente desde ${pendingDate} · ${pendingCount} dia(s)${snapshot.nextD1AttemptAtUtc ? ` · próxima: ${autoUpdateTime(snapshot.nextD1AttemptAtUtc)}` : ''}`;
    } else if (enabled && snapshot.d1ReconciliationBlocked) {
      nextExecutionText = `Revisão D−1 pendente desde ${snapshot.d1ReconciliationBlockedDate || 'data indisponível'} · fora da janela de 14 dias`;
    } else if (enabled && snapshot.d1ReconciliationPendingDate) {
      const reconciliationDate = autoUpdateBusinessDate(snapshot.d1ReconciliationPendingDate) || snapshot.d1ReconciliationPendingDate;
      nextExecutionText = `Revisão D−1 de ${reconciliationDate} · prevista: ${autoUpdateTime(snapshot.d1ReconciliationNextAtUtc)}`;
    } else if (enabled && snapshot.nextD0AttemptAtUtc) {
      nextExecutionText = `Próxima D0: ${autoUpdateTime(snapshot.nextD0AttemptAtUtc)}`;
    } else if (enabled) {
      nextExecutionText = 'Próxima D0: aguardando agendamento';
    }
    autoUpdateNextExecution.textContent = nextExecutionText;
    autoUpdateNextExecution.hidden = !nextExecutionText;
    const duration = snapshot.startedAtUtc && snapshot.state === 'running'
      ? ` · ${Math.max(0, Math.round((Date.now() - Date.parse(snapshot.startedAtUtc)) / 1000))} s`
      : '';
    if (snapshot.state === 'running') autoUpdateStatus.textContent = `${snapshot.d1ReconciliationRunning ? 'Revisão D−1' : snapshot.operation || 'Captura'} · ${snapshot.phase || 'em andamento'}${snapshot.operation === 'D-1' && snapshot.pendingD1Date ? ` · dados de ${autoUpdateBusinessDate(snapshot.pendingD1Date) || snapshot.pendingD1Date}` : ''}${duration}`;
    else if (snapshot.state === 'paused') autoUpdateStatus.textContent = 'Pausada · fonte operacional no Manifesto MCC';
    else if (snapshot.state === 'unsupported') autoUpdateStatus.textContent = 'Indisponível neste navegador';
    else if (snapshot.d1BackfillBlocked) autoUpdateStatus.textContent = `Fechamento D−1 pendente fora da janela de 14 dias · ${snapshot.pendingD1Date || ''}`;
    else if (snapshot.state === 'failed' || snapshot.state === 'blocked') autoUpdateStatus.textContent = `Aguardando correção · ${String(snapshot.lastError || snapshot.phase || 'falha na última tentativa').slice(0, 220)}`;
    else autoUpdateStatus.textContent = enabled ? 'Ativa neste perfil · nenhuma consulta em andamento' : 'Desativada neste perfil';
    const d0 = snapshot.lastD0;
    const d1 = snapshot.lastD1;
    const d0Text = d0 ? `D0 ${autoUpdateTime(d0.completedAtUtc)} · ${integer(d0.diffRowCount || 0)} diferença(s)` : 'D0 ainda sem captura automática';
    const d1Text = d1 ? `D−1 ${d1.date || '—'} · ${autoUpdateTime(d1.completedAtUtc)} · ${integer(d1.diffRowCount || 0)} diferença(s)` : 'D−1 ainda sem fechamento automático';
    const nextText = snapshot.nextD0AttemptAtUtc && enabled ? ` · Próxima D0: ${autoUpdateTime(snapshot.nextD0AttemptAtUtc)}` : '';
    const intervalMinutes = Number(snapshot.intervalMinutes) || 60;
    const intervalLabel = intervalMinutes % 60 === 0 ? `${intervalMinutes / 60} h` : intervalMinutes < 60 ? `${intervalMinutes} min` : `${Math.floor(intervalMinutes / 60)} h ${intervalMinutes % 60} min`;
    const backfillText = snapshot.d1BackfillBlocked
      ? ` · D−1 pendente desde ${snapshot.pendingD1Date || 'data indisponível'}; a rotina não marcou esse dia como concluído`
      : snapshot.pendingD1Date ? ` · Recuperação D−1 a partir de ${snapshot.pendingD1Date} (${Number(snapshot.pendingD1Count) || 1} dia(s) pendentes)` : '';
    const reconciliationQueue = Array.isArray(snapshot.d1ReconciliationQueue) ? snapshot.d1ReconciliationQueue : [];
    const reconciliationText = snapshot.d1ReconciliationBlocked
      ? ` · Revisão D−1 pendente fora da janela desde ${snapshot.d1ReconciliationBlockedDate || 'data indisponível'}`
      : snapshot.d1ReconciliationPendingDate ? ` · Revisão D−1 de ${snapshot.d1ReconciliationPendingDate} prevista para ${autoUpdateTime(snapshot.d1ReconciliationNextAtUtc)}`
        : snapshot.lastD1Reconciliation ? ` · Última revisão D−1 dos dados de ${snapshot.lastD1Reconciliation.date || 'data indisponível'} às ${autoUpdateTime(snapshot.lastD1Reconciliation.completedAtUtc)}` : '';
    autoUpdateDetails.textContent = `D0 a cada ${intervalLabel} · ${d0Text} · ${d1Text}${backfillText}${reconciliationText}${reconciliationQueue.length > 1 ? ` (${reconciliationQueue.length} revisões pendentes)` : ''}${nextText}${snapshot.lastError && snapshot.state !== 'failed' && snapshot.state !== 'blocked' ? ` · ${snapshot.lastError}` : ''}`;
  }

  autoUpdateSettingsButton.addEventListener('click', () => {
    const snapshot = getGoogleAdsAutoUpdateStatus() || {};
    autoUpdateIntervalSelect.value = String(Number(snapshot.intervalMinutes) || 60);
    autoUpdateSettingsMessage.textContent = '';
    autoUpdateDialog.showModal();
  });
  autoUpdateSettingsCancel.addEventListener('click', () => autoUpdateDialog.close());
  autoUpdateSettingsSave.addEventListener('click', async () => {
    autoUpdateSettingsSave.disabled = true;
    autoUpdateSettingsMessage.textContent = '';
    try {
      await onGoogleAdsAutoUpdateIntervalChange(Number(autoUpdateIntervalSelect.value));
      renderAutoUpdateStatus();
      autoUpdateDialog.close();
    } catch (error) {
      autoUpdateSettingsMessage.textContent = error.message || 'Não foi possível salvar o intervalo.';
    } finally {
      autoUpdateSettingsSave.disabled = false;
    }
  });

  autoUpdateButton.addEventListener('click', async () => {
    autoUpdateButton.disabled = true;
    try {
      await onGoogleAdsAutoUpdateToggle(!(getGoogleAdsAutoUpdateStatus()?.enabled === true));
      renderAutoUpdateStatus();
    } catch (error) {
      setMessage(error.message || 'Não foi possível alterar a atualização automática.', true);
    } finally {
      renderAutoUpdateStatus();
    }
  });
  document.addEventListener('google-ads-auto-update-status', event => {
    if (!root.isConnected) return;
    renderAutoUpdateStatus(event.detail);
  });
  const dateFromInput = $('#googleAdsDateFrom');
  const dateToInput = $('#googleAdsDateTo');
  const captureWindowSelect = $('#googleAdsCaptureWindow');
  let queryDiagnosticsTimer = null;

  function formatQueryDuration(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
    if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
    const seconds = milliseconds / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)} s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min ${Math.round(seconds % 60)} s`;
  }

  function updateQueryDiagnosticsClock() {
    const diagnostics = state.queryDiagnostics;
    if (!diagnostics) return;
    const now = performance.now();
    const totalElapsed = (diagnostics.finishedAt ?? now) - diagnostics.startedAt;
    const stepElapsed = diagnostics.currentStageStartedAt == null ? null : now - diagnostics.currentStageStartedAt;
    const totalElement = queryDiagnosticsArea.querySelector('[data-query-diagnostics-total]');
    const stepElement = queryDiagnosticsArea.querySelector('[data-query-diagnostics-step-time]');
    if (totalElement) totalElement.textContent = formatQueryDuration(totalElapsed);
    if (stepElement) stepElement.textContent = stepElapsed == null ? '—' : formatQueryDuration(stepElapsed);
    for (const timingElement of queryDiagnosticsArea.querySelectorAll('[data-query-diagnostics-account-timing]')) {
      const account = diagnostics.accounts[Number(timingElement.dataset.queryDiagnosticsAccountTiming)];
      if (!account) continue;
      const apiTime = account.apiMs == null
        ? account.status === 'running' && account.phase === 'API' && account.apiStartedAt != null ? formatQueryDuration(now - account.apiStartedAt) : '—'
        : formatQueryDuration(account.apiMs);
      const validationTime = account.validationMs == null
        ? account.status === 'running' && account.phase === 'Validação' && account.validationStartedAt != null ? formatQueryDuration(now - account.validationStartedAt) : '—'
        : formatQueryDuration(account.validationMs);
      const accountTotal = account.totalMs == null && account.startedAt != null
        ? formatQueryDuration(now - account.startedAt)
        : formatQueryDuration(account.totalMs);
      timingElement.textContent = `API ${apiTime} · validação ${validationTime} · total ${accountTotal}`;
    }
  }

  function renderQueryDiagnostics() {
    const diagnostics = state.queryDiagnostics;
    if (!diagnostics) {
      queryDiagnosticsArea.hidden = true;
      queryDiagnosticsArea.innerHTML = '';
      return;
    }
    if (state.queryDiagnosticsDismissed) {
      queryDiagnosticsArea.hidden = true;
      return;
    }
    queryDiagnosticsArea.hidden = false;
    const statusLabels = { running: 'Em andamento', complete: 'Concluída', partial: 'Parcial', failed: 'Falhou' };
    const accountStatusLabels = { queued: 'Na fila', running: 'Consultando', complete: 'Concluída', failed: 'Falhou' };
    const stages = diagnostics.stages.length
      ? diagnostics.stages.map(stage => `<li><span>${escapeHtml(stage.label)}</span><strong>${formatQueryDuration(stage.elapsedMs)}</strong>${stage.samples > 1 ? `<small>${stage.samples} medições · tempo acumulado</small>` : `<small>${escapeHtml(stage.statusLabel || 'Concluída')}</small>`}</li>`).join('')
      : '<li><span>Etapas ainda não concluídas</span><strong>—</strong></li>';
    const accounts = diagnostics.accounts.map((account, index) => `<li class="google-ads-diagnostic-account ${escapeHtml(account.status)}"><div><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(accountStatusLabels[account.status] || account.status)}${account.phase ? ` · ${escapeHtml(account.phase)}` : ''}</small></div><span data-query-diagnostics-account-timing="${index}">API — · validação — · total —</span>${account.error ? `<small class="google-ads-diagnostic-error">${escapeHtml(account.error)}</small>` : ''}</li>`).join('');
    const currentStageLabel = diagnostics.currentStage || (diagnostics.status === 'complete' ? 'Consulta concluída' : diagnostics.status === 'failed' ? 'Consulta interrompida' : 'Aguardando etapa');
    const currentStageProgress = diagnostics.progressLabel ? ` · ${diagnostics.progressLabel}` : '';
    const statusSpinner = diagnostics.status === 'running' ? '<span class="google-ads-diagnostic-spinner" aria-hidden="true"></span>' : '';
    queryDiagnosticsArea.innerHTML = `<div class="google-ads-query-diagnostics-inner"><div class="google-ads-query-diagnostics-head"><strong>Diagnóstico da última consulta · ${escapeHtml(diagnostics.operation)}</strong><div class="google-ads-query-diagnostics-head-actions"><span class="google-ads-diagnostic-status ${escapeHtml(diagnostics.status)}">${statusSpinner}${escapeHtml(statusLabels[diagnostics.status] || diagnostics.status)}</span><button type="button" class="google-ads-diagnostic-close" data-google-ads-diagnostics-close aria-label="Fechar diagnóstico" title="Fechar diagnóstico">×</button></div></div><div class="google-ads-query-diagnostics-current"><div><small>Etapa atual</small><strong data-query-diagnostics-current>${escapeHtml(currentStageLabel + currentStageProgress)}</strong></div><div><small>Tempo total</small><strong data-query-diagnostics-total>—</strong></div><div><small>Tempo nesta etapa</small><strong data-query-diagnostics-step-time>—</strong></div></div><div class="google-ads-query-diagnostics-grid"><details class="google-ads-query-diagnostics-stages-details"><summary>Etapas concluídas (${diagnostics.stages.length})</summary><ul class="google-ads-query-diagnostics-stages">${stages}</ul></details><details class="google-ads-query-diagnostics-accounts"><summary>Tempo por conta (${diagnostics.accounts.length})</summary><ul>${accounts}</ul></details></div><p>Os tempos são desta sessão e não são gravados na base.</p></div>`;
    updateQueryDiagnosticsClock();
  }

  function startQueryDiagnostics(operation, accounts) {
    if (queryDiagnosticsTimer) clearInterval(queryDiagnosticsTimer);
    state.queryDiagnosticsDismissed = false;
    const startedAt = performance.now();
    state.queryDiagnostics = {
      operation,
      status: 'running',
      startedAt,
      finishedAt: null,
      currentStage: 'Preparando consulta',
      progressLabel: '',
      currentStageStartedAt: startedAt,
      stages: [],
      accounts: accounts.map(account => ({ name: account.name, status: 'queued', phase: '', apiMs: null, validationMs: null, totalMs: null, error: '' })),
    };
    renderQueryDiagnostics();
    queryDiagnosticsTimer = setInterval(updateQueryDiagnosticsClock, 1000);
  }

  function setQueryDiagnosticStage(label) {
    const diagnostics = state.queryDiagnostics;
    if (!diagnostics || diagnostics.status !== 'running') return;
    const now = performance.now();
    if (diagnostics.currentStage) {
      addQueryDiagnosticStage(diagnostics.currentStage, now - diagnostics.currentStageStartedAt, 'Concluída');
    }
    diagnostics.currentStage = label;
    diagnostics.progressLabel = '';
    diagnostics.currentStageStartedAt = now;
    renderQueryDiagnostics();
  }

  function updateQueryDiagnosticProgress(label) {
    const diagnostics = state.queryDiagnostics;
    if (!diagnostics || diagnostics.status !== 'running') return;
    diagnostics.progressLabel = label;
    renderQueryDiagnostics();
  }

  function recordQueryDiagnosticMeasurement(label, elapsedMs) {
    const diagnostics = state.queryDiagnostics;
    if (!diagnostics) return;
    addQueryDiagnosticStage(label, elapsedMs, 'Concluída');
    renderQueryDiagnostics();
  }

  function recordCaptureStorageTimings(timings = {}) {
    const labels = [
      ['databaseOpenMs', 'Abrir IndexedDB'],
      ['baseReadMs', 'Ler base operacional'],
      ['captureTransformMs', 'Calcular captura e histórico'],
      ['billingAggregationMs', 'Calcular Faturamento'],
      ['transactionCommitMs', 'Confirmar gravação no IndexedDB'],
      ['overviewRefreshMs', 'Atualizar Visão Geral'],
    ];
    let recorded = false;
    for (const [key, label] of labels) {
      const elapsedMs = Number(timings?.[key]);
      if (!Number.isFinite(elapsedMs) || (key === 'overviewRefreshMs' && elapsedMs <= 0)) continue;
      addQueryDiagnosticStage(label, elapsedMs, 'Concluída');
      recorded = true;
    }
    if (recorded) renderQueryDiagnostics();
  }

  function addQueryDiagnosticStage(label, elapsedMs, statusLabel) {
    const diagnostics = state.queryDiagnostics;
    if (!diagnostics) return;
    const existing = diagnostics.stages.find(stage => stage.label === label);
    if (existing) {
      existing.elapsedMs += Math.max(0, elapsedMs);
      existing.samples = (existing.samples || 1) + 1;
      existing.statusLabel = statusLabel;
    } else {
      diagnostics.stages.push({ label, elapsedMs: Math.max(0, elapsedMs), samples: 1, statusLabel });
    }
  }

  function startQueryDiagnosticAccount(index) {
    const account = state.queryDiagnostics?.accounts[index];
    if (!account) return performance.now();
    account.status = 'running';
    account.phase = 'Preparando';
    account.startedAt = performance.now();
    renderQueryDiagnostics();
    return account.startedAt;
  }

  function updateQueryDiagnosticAccount(index, changes) {
    const account = state.queryDiagnostics?.accounts[index];
    if (!account) return;
      Object.assign(account, changes);
    renderQueryDiagnostics();
  }

  function finishQueryDiagnostics(status = 'complete') {
    const diagnostics = state.queryDiagnostics;
    if (!diagnostics) return;
    const now = performance.now();
    if (diagnostics.currentStage) {
      addQueryDiagnosticStage(diagnostics.currentStage, now - diagnostics.currentStageStartedAt, status === 'failed' ? 'Interrompida' : status === 'partial' ? 'Parcial' : 'Concluída');
    }
    diagnostics.currentStage = '';
    diagnostics.progressLabel = '';
    diagnostics.currentStageStartedAt = null;
    diagnostics.status = status;
    diagnostics.finishedAt = now;
    if (queryDiagnosticsTimer) clearInterval(queryDiagnosticsTimer);
    queryDiagnosticsTimer = null;
    renderQueryDiagnostics();
  }

  function yieldToBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function captureWindowLabel(days = state.captureWindowDays) {
    if (String(days) === 'yesterday') return 'Ontem';
    return Number(days) === 1 ? 'Hoje' : `Últimos ${Number(days)} dias`;
  }

  function previousDate(date) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  }

  function updateCaptureWindowLabels() {
    const label = captureWindowLabel();
    const feedLabel = String(state.captureWindowDays) === 'yesterday' ? 'Ontem (São Paulo)' : label;
    const previewLabel = String(state.captureWindowDays) === 'yesterday' ? 'Ontem (São Paulo)' : label;
    feedTodayButton.textContent = `Alimentar API · ${feedLabel}`;
    normalizedPreviewButton.textContent = `Prévia normalizada · ${previewLabel}`;
    const accountCount = state.accounts?.accounts.length;
    feedAllAccountsButton.textContent = state.accounts
      ? accountCount ? `Alimentar todas as ${accountCount} contas · ${feedLabel}` : `Alimentar todas as contas · ${feedLabel}`
      : `Carregar e alimentar todas as contas · ${feedLabel}`;
  }

  function updateCloseoutDateLabel() {
    try {
      const date = previousDate(strictTodayInTimeZone('America/Sao_Paulo'));
      state.closeoutDate = date;
      closeoutDateLabel.textContent = `Data do fechamento: ${date}`;
    } catch (error) {
      state.closeoutDate = '';
      closeoutDateLabel.textContent = error.message || 'Não foi possível determinar D−1 em São Paulo.';
    }
  }

  function setMessage(value, isError = false) {
    state.message = value;
    state.messageError = isError;
    message.textContent = value;
    message.classList.toggle('error', isError);
    message.classList.toggle('success', Boolean(value) && !isError);
  }

  function renderSourceMode() {
    const useApi = state.operationalSourceMode === 'api';
    sourceModeLabel.textContent = `Fonte operacional atual: ${useApi ? 'Google Ads API' : 'Manifesto MCC'}`;
    sourceModeStatus.textContent = `Fonte operacional atual neste perfil: ${useApi ? 'Google Ads API' : 'Manifesto MCC'}.`;
    sourceModeButton.textContent = useApi ? 'Voltar para o manifesto MCC neste perfil' : 'Ativar API neste perfil';
    sourceModeButton.setAttribute('aria-pressed', String(useApi));
    sourceModeDialog.classList.toggle('is-api-active', useApi);
  }

  function directoryDateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'horário indisponível' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  function renderAccountDirectory() {
    const directory = state.accounts;
    if (!directory) {
      accountDirectoryStatus.textContent = 'A lista ainda não foi consultada neste perfil. Clique em “Atualizar lista de MCCs e contas” para montar e guardar a lista.';
      accountDirectory.innerHTML = '<div class="google-ads-directory-empty">Nenhuma MCC ou conta em cache local.</div>';
      updateCaptureWindowLabels();
      return;
    }
    const mccCount = directory.managers.filter(manager => manager.customerId != null).length;
    const accountCount = directory.accounts.length;
    const updatedAt = state.accountsCacheAt ? directoryDateLabel(state.accountsCacheAt) : '';
    const storageLabel = state.accountsCachePersisted ? `Atualizada em ${updatedAt}` : 'Lista carregada somente nesta sessão; não foi possível persistir o cache local.';
    accountDirectoryStatus.textContent = `${storageLabel} · ${mccCount} MCC(s) · ${accountCount} conta(s) cliente${directory.warningCount ? ` · ${directory.warningCount} aviso(s) na consulta` : ''}.`;
    updateCaptureWindowLabels();

    const groups = directory.managers.map(manager => ({
      manager,
      accounts: directory.accounts.filter(account => (account.managerCustomerId ?? 'direct') === managerKey(manager)),
    }));
    const directAccounts = directory.accounts.filter(account => account.managerCustomerId == null);
    if (!groups.some(group => managerKey(group.manager) === 'direct') && directAccounts.length) {
      groups.push({ manager: { customerId: null, name: 'Contas com acesso direto' }, accounts: directAccounts });
    }
    accountDirectory.innerHTML = groups.length ? groups.map(({ manager, accounts }, index) => `
      <details class="google-ads-directory-group">
        <summary><strong>${escapeHtml(manager.name)}</strong><span>${manager.customerId ? escapeHtml(manager.customerId) : 'Acesso direto'}</span><b>${accounts.length} conta(s)</b><span class="google-ads-directory-disclosure" aria-hidden="true"></span></summary>
        ${accounts.length ? `<div class="google-ads-table-wrap"><table class="google-ads-table google-ads-directory-table"><thead><tr><th>Conta Google Ads</th><th>ID da conta</th><th>Moeda</th><th>Fuso</th><th>Acesso</th></tr></thead><tbody>${accounts.map(account => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.customerId)}</td><td>${escapeHtml(account.currencyCode)}</td><td>${escapeHtml(account.timeZone || '—')}</td><td>${escapeHtml(account.status || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="google-ads-directory-empty">Nenhuma conta cliente listada nesta MCC.</div>'}
      </details>`).join('') : '<div class="google-ads-directory-empty">Nenhuma conta cliente foi encontrada nas MCCs acessíveis.</div>';
  }

  function visibleAccounts() {
    if (!state.accounts) return [];
    return state.accounts.accounts.filter(account => (account.managerCustomerId ?? 'direct') === state.selectedManagerKey);
  }

  function summarizeD0Comparison(comparison = state.d0Comparison) {
    const accounts = Array.isArray(comparison?.accounts) ? comparison.accounts : [];
    const changedCount = accounts.reduce((sum, account) => sum + (account.changes || []).filter(row => row.kind === 'changed').length, 0);
    const comparableCampaignCount = accounts.reduce((sum, account) => sum + (Number(account.unchangedRows) || 0) + (account.changes || []).filter(row => row.kind === 'changed').length, 0);
    const allBaselinesComparable = accounts.length > 0 && accounts.every(account => account.baselineStatus === 'available'
      && account.baselineComplete
      && account.currencyMatches
      && Number(account.currentOnlyRows || 0) === 0
      && Number(account.previousOnlyRows || 0) === 0);
    return {
      changedCount,
      comparableCampaignCount,
      noDifferences: allBaselinesComparable && comparableCampaignCount > 0 && changedCount === 0,
    };
  }

  function d0SaveActionLabel() {
    if (!state.pendingD0Capture) return 'Atualizar base';
    const summary = summarizeD0Comparison();
    if (summary.noDifferences) return 'Registrar execução sem diferenças';
    if (!summary.changedCount && !summary.comparableCampaignCount) return 'Registrar consulta';
    return 'Atualizar base';
  }

  function syncButtonAvailability() {
    const accounts = visibleAccounts();
    const selectedCount = selectedAccounts().length;
    const queryPending = state.accountsPending || state.reportPending || state.searchTermsPending;
    const available = state.tokenReady && selectedCount > 0;
    accountsButton.disabled = !state.tokenReady || state.accountsPending || state.reportPending || state.searchTermsPending;
    closeoutPreviewButton.disabled = !state.tokenReady || queryPending || typeof onPreviewDailyCaptures !== 'function';
    closeoutPreviewButton.textContent = state.closeoutRunning && state.closeoutQueryMode === 'all' ? 'Consultando todas…' : 'Ver diferenças · todas';
    closeoutActivePreviewButton.disabled = !state.tokenReady || queryPending || typeof onPreviewDailyCaptures !== 'function';
    closeoutActivePreviewButton.textContent = state.closeoutRunning && state.closeoutQueryMode === 'active' ? 'Consultando ativas…' : 'Ver diferenças · ativas';
    closeoutSaveButton.hidden = !state.pendingClosure;
    closeoutSaveButton.disabled = !state.pendingClosure || queryPending || typeof onSaveDailyCaptures !== 'function';
    d0AllPreviewButton.disabled = !state.tokenReady || queryPending || !state.accounts?.accounts?.length;
    d0AllPreviewButton.textContent = state.d0Comparison?.pending && state.d0QueryMode === 'all' ? 'Consultando API Google…' : 'Atualizar API Google manualmente · todas';
    d0ActivePreviewButton.disabled = !state.tokenReady || queryPending || !state.accounts?.accounts?.length;
    d0ActivePreviewButton.textContent = state.d0Comparison?.pending && state.d0QueryMode === 'active' ? 'Consultando campanhas ativas na API Google…' : 'Atualizar API Google manualmente · ativas';
    d0SaveActionsArea.hidden = !state.pendingD0Capture;
    d0SaveButton.textContent = d0SaveActionLabel();
    d0SaveButton.disabled = !state.pendingD0Capture || queryPending || typeof onSaveDailyCaptures !== 'function';
    feedAllAccountsButton.disabled = !state.tokenReady || queryPending || typeof onSaveDailyCaptures !== 'function';
    reportButton.disabled = !available || queryPending;
    dailyReportButton.disabled = !available || queryPending;
    searchTermsButton.disabled = !available || queryPending;
    searchTermsButton.textContent = state.searchTermsPending ? 'Consultando termos…' : 'Consultar termos de pesquisa';
    normalizedPreviewButton.disabled = !available || queryPending || typeof onPreviewDailyCaptures !== 'function';
    sourceModeButton.disabled = queryPending;
    feedTodayButton.disabled = !available || queryPending || typeof onSaveDailyCaptures !== 'function';
    last7DaysButton.disabled = queryPending;
    managerSelect.disabled = !state.accounts?.managers.length || queryPending;
    dateFromInput.disabled = queryPending;
    dateToInput.disabled = queryPending;
    captureWindowSelect.disabled = queryPending;
    accountOptions.querySelectorAll('input[type="checkbox"]').forEach(input => { input.disabled = queryPending; });
    const pickerDisabled = accounts.length === 0 || queryPending;
    accountPicker.classList.toggle('disabled', pickerDisabled);
    accountPicker.setAttribute('aria-disabled', String(pickerDisabled));
    accountSummary.tabIndex = pickerDisabled ? -1 : 0;
    if (pickerDisabled) accountPicker.open = false;
    selectAllAccountsButton.disabled = pickerDisabled || selectedCount === accounts.length;
    clearAccountsButton.disabled = selectedCount === 0 || queryPending;
  }

  function updateAccountOptions({ selectAll = false } = {}) {
    const accounts = visibleAccounts();
    const visibleIds = new Set(accounts.map(account => account.customerId));
    if (selectAll) state.selectedCustomerIds = new Set(visibleIds);
    else state.selectedCustomerIds = new Set([...state.selectedCustomerIds].filter(id => visibleIds.has(id)));
    accountOptions.innerHTML = accounts.length
      ? accounts.map(account => `<label class="google-ads-account-option"><input type="checkbox" value="${escapeHtml(account.customerId)}" ${state.selectedCustomerIds.has(account.customerId) ? 'checked' : ''} ${state.accountsPending || state.reportPending || state.searchTermsPending ? 'disabled' : ''}><span><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.customerId)} · ${escapeHtml(account.currencyCode)}</small></span></label>`).join('')
      : '<div class="google-ads-account-empty">Nenhuma conta disponível nesta MCC.</div>';
    const selectedCount = state.selectedCustomerIds.size;
    accountSummary.textContent = accounts.length
      ? selectedCount === accounts.length ? `Todas as ${accounts.length} contas selecionadas` : `${selectedCount} de ${accounts.length} contas selecionadas`
      : 'Nenhuma conta disponível';
    const queryPending = state.accountsPending || state.reportPending || state.searchTermsPending;
    const pickerDisabled = accounts.length === 0 || queryPending;
    accountPicker.classList.toggle('disabled', pickerDisabled);
    accountPicker.setAttribute('aria-disabled', String(pickerDisabled));
    accountSummary.tabIndex = pickerDisabled ? -1 : 0;
    if (pickerDisabled) accountPicker.open = false;
    selectAllAccountsButton.disabled = pickerDisabled || selectedCount === accounts.length;
    clearAccountsButton.disabled = selectedCount === 0 || queryPending;
  }

  function updateManagerOptions() {
    const managers = state.accounts?.managers || [];
    managerSelect.innerHTML = managers.length
      ? managers.map(manager => `<option value="${escapeHtml(managerKey(manager))}">${escapeHtml(manager.name)}${manager.customerId ? ` · ${escapeHtml(manager.customerId)}` : ''}</option>`).join('')
      : '<option value="">Nenhuma MCC acessível</option>';
    state.selectedManagerKey = managers.length ? managerKey(managers[0]) : '';
    managerSelect.value = state.selectedManagerKey;
    managerSelect.disabled = managers.length === 0 || state.accountsPending;
    updateAccountOptions({ selectAll: true });
    renderAccountDirectory();
  }

  function selectedAccounts() {
    return visibleAccounts().filter(account => state.selectedCustomerIds.has(account.customerId));
  }

  function clearReports() {
    state.report = null;
    state.dailyReport = null;
    state.dailyComparison = null;
    state.captureDiff = null;
    state.d0Comparison = null;
    state.pendingD0Capture = null;
    state.d0ComparisonPageLimit = GOOGLE_ADS_INITIAL_RENDER_ROWS;
    state.dailyMode = null;
    state.pendingClosure = null;
    state.closeoutSavedAt = '';
    state.reportFailures = [];
    state.dailyFailures = [];
    state.searchTermsReports = null;
    state.searchTermsFailures = [];
    state.searchTermsPending = false;
    state.searchTermsProgress = '';
    state.searchTermsTotalAccounts = 0;
    state.searchTermsDateFrom = '';
    state.searchTermsDateTo = '';
    state.searchTermsVisibleCount = GOOGLE_ADS_SEARCH_TERMS_PAGE_SIZE;
    searchTermsArea.hidden = true;
    searchTermsArea.innerHTML = '';
    state.reportPageLimits.clear();
    state.capturePreviewDetailsOpen = false;
    state.operationalDiffOpen = false;
    d0ComparisonArea.hidden = true;
    d0ComparisonArea.innerHTML = '';
  }

  function renderedRowCount(report, kind, total) {
    const limit = state.reportPageLimits.get(`${kind}:${report.customerId}`) || GOOGLE_ADS_INITIAL_RENDER_ROWS;
    return Math.min(total, limit);
  }

  function renderLoadMoreRows(report, kind, total, shown) {
    if (shown >= total) return '';
    const nextCount = Math.min(GOOGLE_ADS_RENDER_PAGE_SIZE, total - shown);
    return `<div class="google-ads-load-more-wrap"><button class="btn google-ads-load-more" type="button" data-google-ads-load-more="${escapeHtml(kind)}" data-customer-id="${escapeHtml(report.customerId)}">Carregar mais ${nextCount} · ${shown.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}</button></div>`;
  }

  function dailySummaryCards(report) {
    const summary = report.summary;
    const kpis = [
      ['Impressões', integer(summary.impressions)],
      ['Cliques', integer(summary.clicks)],
      ['CTR', percentRatio(summary.ctr)],
      ['CPC médio', money(summary.averageCpcMicros, report.currencyCode)],
      ['Custo', money(summary.costMicros, report.currencyCode)],
      ['Conversões', Number(summary.conversions || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })],
      ['CPA', money(summary.costPerConversionMicros, report.currencyCode)],
      ['Valor conv.', money(summary.conversionsValue * 1_000_000, report.currencyCode)],
    ];
    return `<div class="google-ads-kpis">${kpis.map(([label, value]) => `<div class="google-ads-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>`;
  }

  function comparisonMetricCell(metric, formatter, status) {
    if (!metric) return '<td class="google-ads-compare-metric">API —<br>MCC —<br>Δ —</td>';
    const apiValue = formatter(metric.api, false, 'api');
    const manifestValue = formatter(metric.manifest, false, 'manifest');
    const delta = metric.state === 'compared'
      ? formatter(metric.delta, true, 'delta')
      : metric.state === 'currency_mismatch' ? 'moedas diferentes'
        : metric.state === 'mcc_missing' ? 'sem par MCC'
          : metric.state === 'api_missing' ? 'sem linha API'
            : metric.state === 'manifest_not_observed' ? 'MCC sem observação' : 'sem comparação';
    const deltaClass = metric.state === 'compared' ? `google-ads-compare-delta ${status}` : 'google-ads-compare-delta unavailable';
    return `<td class="google-ads-compare-metric"><span>API ${escapeHtml(apiValue)}</span><span>MCC ${escapeHtml(manifestValue)}</span><strong class="${deltaClass}">Δ ${escapeHtml(delta)}</strong></td>`;
  }

  function comparisonStatus(status) {
    const labels = {
      match: 'Confere', difference: 'Diferença', partial: 'Parcial', inconclusive: 'Inconclusivo',
      ambiguous: 'Nome duplicado', api_only: 'Sem par MCC', mcc_only: 'Sem linha API', manifest_not_observed: 'MCC sem observação',
    };
    return `<span class="google-ads-compare-status ${escapeHtml(status)}">${escapeHtml(labels[status] || status)}</span>`;
  }

  function captureDiffValue(cell, type, report, isNew = false) {
    if (cell == null) return isNew ? 'Sem registro' : 'Sem dado';
    const value = cell && typeof cell === 'object' && Object.hasOwn(cell, 'value') ? cell.value : cell;
    if (value == null || value === '') return cell?.zeroEvidence ? 'Sem valor (zero inferido)' : 'Sem dado';
    if (type === 'integer') return integer(value);
    if (type === 'decimal') return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (type === 'percent') return percentRatio(Number(value));
    if (type === 'money-brl') return moneyAmount(Number(value), 'BRL');
    if (type === 'money-account') return moneyAmount(Number(value), cell?.currencyCode || report.currencyCode);
    if (type === 'status') return ({ ativa: 'Ativa', pausada: 'Pausada', historico: 'Histórica' })[String(value)] || campaignStatus(value);
    return String(value);
  }

  function renderCapturePreviewDiff(reports) {
    const diffs = state.captureDiff?.accounts || [];
    if (!diffs.length) return '<div class="google-ads-no-rows">Não consegui montar a comparação com os dados operacionais atuais. Nenhuma captura foi gravada.</div>';
    const reportByScope = new Map((reports || []).map(report => [`${report.managerCustomerId || 'direct'}|${report.customerId}`, report]));
    const scoped = diffs.map(diff => ({ diff, report: reportByScope.get(`${diff.managerCustomerId || 'direct'}|${diff.customerId}`) }))
      .filter(item => item.report);
    const changed = scoped.flatMap(({ diff, report }) => diff.changed.map(row => ({ ...row, report })))
      .sort((left, right) => left.date.localeCompare(right.date)
        || String(left.report.accountName || left.report.customerId).localeCompare(String(right.report.accountName || right.report.customerId), 'pt-BR')
        || left.campaignName.localeCompare(right.campaignName, 'pt-BR'));
    const total = diffs.reduce((sum, diff) => ({
      unchangedRows: sum.unchangedRows + diff.unchangedRows,
      uncoupledRows: sum.uncoupledRows + diff.unmappedRows + diff.ambiguousRows + diff.notProjectedRows,
      capturedRows: sum.capturedRows + diff.capturedRows,
    }), { unchangedRows: 0, uncoupledRows: 0, capturedRows: 0 });
    const newRows = changed.filter(row => row.isNew).length;
    const updatedRows = changed.length - newRows;
    const summary = [
      ['partial', 'Novos registros diários', newRows],
      ['difference', 'Registros atualizados', updatedRows],
      ['', 'Sem diferença', total.unchangedRows],
      ['partial', 'Fora da projeção segura', total.uncoupledRows],
    ].filter(([, , count]) => count > 0).map(([kind, label, count]) => `<span class="google-ads-compare-count ${kind}">${escapeHtml(label)}: ${integer(count)}</span>`).join('')
      || '<span class="google-ads-compare-count">Nenhuma linha retornada</span>';
    const limit = state.reportPageLimits.get('capture-diff-all') || GOOGLE_ADS_INITIAL_RENDER_ROWS;
    const shown = Math.min(changed.length, limit);
    const rows = state.capturePreviewDetailsOpen ? changed.slice(0, shown).map(row => {
      const report = row.report;
      return `<tr class="google-ads-capture-diff-row ${row.isNew ? 'new' : 'changed'}"><td>${escapeHtml(row.date)}</td><td class="google-ads-compare-campaign"><strong>${escapeHtml(report.accountName || `Conta ${report.customerId}`)}</strong><small>${escapeHtml(report.customerId)} · ${escapeHtml(report.currencyCode)}</small></td><td class="google-ads-compare-campaign"><strong>${escapeHtml(row.campaignName)}</strong><small>ID Google Ads ${escapeHtml(row.campaignId)}</small></td><td><span class="google-ads-compare-status ${row.isNew ? 'partial' : 'difference'}">${row.isNew ? 'Nova linha' : 'Atualização'}</span></td><td>${row.changes.map(change => `<div class="google-ads-capture-diff-field"><strong>${escapeHtml(change.label)}</strong><span>${escapeHtml(captureDiffValue(change.before, change.type, report, row.isNew))} <b aria-hidden="true">→</b> ${escapeHtml(captureDiffValue(change.after, change.type, report))}</span></div>`).join('')}</td></tr>`;
    }).join('') : '';
    const noChanges = total.capturedRows === 0
      ? '<div class="google-ads-no-rows">A consulta não retornou linhas diárias nesta janela. Isso não confirma que os valores sejam zero.</div>'
      : changed.length === 0 && total.unchangedRows === 0
        ? '<div class="google-ads-no-rows">As linhas consultadas não têm vínculo seguro para projetar mudanças.</div>'
        : '<div class="google-ads-no-rows">Nenhum valor projetado pela API difere da fonte operacional atual nas linhas comparáveis.</div>';
    const loadMore = state.capturePreviewDetailsOpen && shown < changed.length
      ? `<div class="google-ads-load-more-wrap"><button class="btn google-ads-load-more" type="button" data-google-ads-load-more="capture-diff-all">Carregar mais ${Math.min(GOOGLE_ADS_RENDER_PAGE_SIZE, changed.length - shown)} · ${shown.toLocaleString('pt-BR')} de ${changed.length.toLocaleString('pt-BR')}</button></div>`
      : '';
    const sourceMode = diffs[0]?.sourceMode || 'fonte operacional atual';
    const details = changed.length
      ? `<details class="google-ads-preview-details" data-google-ads-preview-details ${state.capturePreviewDetailsOpen ? 'open' : ''}><summary>Ver campos das ${integer(changed.length)} linhas propostas</summary>${state.capturePreviewDetailsOpen ? `<div class="google-ads-preview-detail-body"><div class="google-ads-table-wrap"><table class="google-ads-table google-ads-capture-diff-table"><thead><tr><th>Data</th><th>Conta</th><th>Campanha</th><th>Tipo</th><th>Campo · atual → com API</th></tr></thead><tbody>${rows}</tbody></table></div>${loadMore}<p class="google-ads-compare-footnote">Uma nova linha significa que ainda não havia registro diário para aquela campanha e data; não significa que a campanha foi criada agora. Campo ausente permanece sem alteração. Valores monetários são exibidos em reais.</p></div>` : ''}</details>`
      : noChanges;
    return `<p>Fonte atual: <strong>${escapeHtml(sourceMode)}</strong>. Prévia sem gravação.</p><div class="google-ads-compare-summary">${summary}</div>${changed.length ? '<p>“Novos registros diários” são linhas de campanha/data sem registro anterior.</p>' : ''}${details}`;
  }

  function numericCaptureCell(cell) {
    const value = cell && typeof cell === 'object' && Object.hasOwn(cell, 'value') ? cell.value : cell;
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function hasVisibleMetricChange(row) {
    return Object.values(row.metrics || {}).some(pair => {
      const before = numericCaptureCell(pair.before), after = numericCaptureCell(pair.after);
      if (before != null && after != null) return Math.abs(after - before) > 0.004;
      return before == null && after != null && after > 0;
    });
  }

  function renderCaptureMetric(pair, metric) {
    const before = numericCaptureCell(pair.before), after = numericCaptureCell(pair.after);
    const format = value => metric === 'cost' ? moneyAmount(value, 'BRL') : integer(value);
    if (before != null && after != null) {
      const delta = after - before;
      if (Math.abs(delta) <= 0.004) return '<span title="Sem diferença neste campo">—</span>';
      const displayed = metric === 'cost'
        ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${format(Math.abs(delta))}`
        : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${format(Math.abs(delta))}`;
      return `<span title="Antes: ${escapeHtml(format(before))} · API: ${escapeHtml(format(after))}">${escapeHtml(displayed)}</span>`;
    }
    if (before == null && after != null && after > 0) {
      return `<span title="Não havia valor anterior; este é o valor retornado pela API">— → ${escapeHtml(format(after))}</span>`;
    }
    return '<span title="Sem par anterior comparável">—</span>';
  }

  function renderApiMetricDiff(reports) {
    const diffs = state.captureDiff?.accounts || [];
    if (!diffs.length) return '<div class="google-ads-no-rows">Não consegui comparar a prévia com os dados operacionais. Nenhuma captura foi gravada.</div>';
    const reportByScope = new Map((reports || []).map(report => [`${report.managerCustomerId || 'direct'}|${report.customerId}`, report]));
    const scoped = diffs.map(diff => ({ diff, report: reportByScope.get(`${diff.managerCustomerId || 'direct'}|${diff.customerId}`) })).filter(item => item.report);
    const changed = scoped.flatMap(({ diff, report }) => diff.changed.map(row => ({ ...row, report })))
      .sort((left, right) => left.date.localeCompare(right.date)
        || String(left.report.accountName || left.report.customerId).localeCompare(String(right.report.accountName || right.report.customerId), 'pt-BR')
        || left.campaignName.localeCompare(right.campaignName, 'pt-BR'));
    const metricFieldKeys = new Set(['B', 'C', 'F', 'G', 'I', 'J', 'K', 'L', 'O', 'P', 'R']);
    const configurationFieldKeys = new Set(['M', 'N', 'Q', 'status']);
    const metricRows = changed.filter(row => row.changes.some(change => metricFieldKeys.has(change.key)));
    const otherRows = changed.filter(row => row.changes.some(change => configurationFieldKeys.has(change.key)));
    const visibleRows = changed;
    const unchanged = diffs.reduce((sum, diff) => sum + diff.unchangedRows, 0);
    const unmapped = diffs.reduce((sum, diff) => sum + diff.unmappedRows + diff.ambiguousRows + diff.notProjectedRows, 0);
    const summary = [
      ['difference', 'Linhas com diferença nas métricas', metricRows.length],
      ['partial', 'Linhas com configuração/status diferente', otherRows.length],
      ['', 'Sem mudança', unchanged],
      ['partial', 'Sem vínculo seguro', unmapped],
    ].filter(([, , count]) => count > 0).map(([kind, label, count]) => `<span class="google-ads-compare-count ${kind}">${escapeHtml(label)}: ${integer(count)}</span>`).join('')
      || '<span class="google-ads-compare-count">Nenhuma linha diária para comparar</span>';
    const limit = state.reportPageLimits.get('capture-metrics-all') || GOOGLE_ADS_INITIAL_RENDER_ROWS;
    const shown = Math.min(visibleRows.length, limit);
    const rows = visibleRows.slice(0, shown).map(row => {
      const report = row.report;
      const otherChanges = row.changes.filter(change => !['B', 'C', 'O'].includes(change.key));
      const otherContent = otherChanges.length ? otherChanges.map(change => `<div class="google-ads-api-other-change"><strong>${escapeHtml(change.label)}</strong><span>${escapeHtml(captureDiffValue(change.before, change.type, report, row.isNew))} <b aria-hidden="true">→</b> ${escapeHtml(captureDiffValue(change.after, change.type, report))}</span></div>`).join('') : '—';
      return `<tr class="google-ads-api-metric-row"><td>${escapeHtml(row.date)}</td><td class="google-ads-compare-campaign"><strong>${escapeHtml(row.campaignName)}</strong><small>${escapeHtml(report.accountName || `Conta ${report.customerId}`)} · ${escapeHtml(report.customerId)}</small></td><td>${renderCaptureMetric(row.metrics.impressions, 'impressions')}</td><td>${renderCaptureMetric(row.metrics.clicks, 'clicks')}</td><td>${renderCaptureMetric(row.metrics.cost, 'cost')}</td><td class="google-ads-api-other-changes">${otherContent}</td></tr>`;
    }).join('');
    const loadMore = shown < visibleRows.length
      ? `<div class="google-ads-load-more-wrap"><button class="btn google-ads-load-more" type="button" data-google-ads-load-more="capture-metrics-all">Carregar mais ${Math.min(GOOGLE_ADS_RENDER_PAGE_SIZE, visibleRows.length - shown)} · ${shown.toLocaleString('pt-BR')} de ${visibleRows.length.toLocaleString('pt-BR')}</button></div>`
      : '';
    const noChanges = diffs.every(diff => diff.capturedRows === 0)
      ? '<div class="google-ads-no-rows">A API não retornou linhas diárias para esse período. Isso não confirma que os indicadores sejam zero.</div>'
      : '<div class="google-ads-no-rows">Nenhuma diferença comparável foi encontrada. Ausência de linha não foi convertida automaticamente em zero.</div>';
    const periodNote = reports?.some(report => report.businessTimeZone === 'America/Sao_Paulo')
      ? 'Métricas cobrem o dia civil de São Paulo; em contas com outro fuso, a linha MCC de mesma data pode cobrir outro intervalo horário. Status, orçamento, estratégia e qualificação são fotografia atual, não histórico do dia.'
      : 'Status, orçamento, estratégia e qualificação são fotografia atual da configuração, não histórico do dia selecionado.';
    const closeoutSaved = Boolean(state.closeoutSavedAt);
    const writeNote = closeoutSaved ? `Fechamento salvo na base em ${escapeHtml(directoryDateLabel(state.closeoutSavedAt))}.` : 'A prévia não grava dados.';
    return `<p>A tabela reúne diferenças de métricas e dos demais campos entre a API e a fonte atual do Hub. Custo é comparado em reais quando há conversão válida.</p><div class="google-ads-compare-summary">${summary}</div>${visibleRows.length ? `<div class="google-ads-table-wrap"><table class="google-ads-table google-ads-api-metric-diff"><thead><tr><th>Data</th><th>Campanha / conta</th><th>Impressões</th><th>Cliques</th><th>Custo (R$)</th><th>Outras alterações · atual → API</th></tr></thead><tbody>${rows}</tbody></table></div>${loadMore}<p class="google-ads-compare-footnote">Valores de métricas exibem API − fonte atual; “— → valor” indica ausência de registro anterior, não zero. ${escapeHtml(periodNote)} ${writeNote}</p>` : noChanges}`;
  }

  function renderNormalizedPreview(reports) {
    const ranges = [...new Set(reports.map(report => `${report.dateFrom} a ${report.dateTo}`))];
    const isSaoPauloDay = reports.length > 0 && reports.every(report => report.businessTimeZone === 'America/Sao_Paulo' && report.businessDate === report.dateFrom && report.businessDate === report.dateTo);
    const period = isSaoPauloDay ? `Dia civil de São Paulo · ${reports[0].businessDate} · 00:00–23:59` : ranges.length === 1 ? `Período ${ranges[0]}` : 'Período conforme o fuso de cada conta';
    const sourceMode = state.captureDiff?.sourceMode || 'fonte operacional atual';
    const isCloseout = reports.length > 0 && reports.every(report => report.businessTimeZone === 'America/Sao_Paulo' && report.businessDate === report.dateFrom && report.businessDate === report.dateTo);
    const isSaved = Boolean(state.closeoutSavedAt);
    const title = isCloseout ? (isSaved ? 'Fechamento D−1 salvo' : 'Fechamento D−1 · prévia') : 'Alterações da captura API';
    const activeOnly = reports.length > 0 && reports.every(report => report.activeCampaignsOnly === true);
    const activeScopeNote = activeOnly ? '<p class="google-ads-active-filter-note">Filtro ENABLED aplicado pelo Google Ads no momento da consulta. Campanhas que não estão ENABLED agora preservam os dados anteriores; ativas sem linha receberam zero somente com consulta e inventário completos.</p>' : '';
    const displayTitle = activeOnly ? `${title} · somente ativas` : title;
    return `<section class="google-ads-account-result google-ads-normalized-preview"><h3>${displayTitle} <small>comparado com ${escapeHtml(sourceMode)}</small></h3><div class="google-ads-report-meta">${escapeHtml(period)} · ${reports.length.toLocaleString('pt-BR')} conta(s) consultada(s)</div>${activeScopeNote}${isSaved ? '<p class="google-ads-closeout-saved">A base foi atualizada. O Diário MCC e os dados anteriores foram preservados.</p>' : ''}<section class="google-ads-comparison"><h4>Diferenças por campanha</h4>${renderApiMetricDiff(reports)}</section><details class="google-ads-preview-details google-ads-operational-details" data-google-ads-operational-diff ${state.operationalDiffOpen ? 'open' : ''}><summary>Ver impacto completo no sistema, incluindo status e configurações</summary>${state.operationalDiffOpen ? `<div class="google-ads-preview-detail-body">${renderCapturePreviewDiff(reports)}</div>` : ''}</details></section>`;
  }

  function renderDailyComparison(report) {
    if (state.dailyMode === 'normalized-loading') return '<section class="google-ads-comparison"><p>Conferindo configuração, vínculo e agregados. A prévia não grava dados.</p></section>';
    if (state.dailyMode === 'preview-failed') return '<section class="google-ads-comparison"><h4>Prévia normalizada incompleta</h4><p>Pelo menos uma conta falhou durante a consulta. Nenhuma captura foi gravada; corrija o acesso ou a conexão e repita para conferir o lote completo.</p></section>';
    if (state.dailyMode === 'normalized-preview') return '';
    if (state.dailyMode === 'feed') {
      return '<section class="google-ads-comparison"><h4>Captura API · período selecionado</h4><p>Somente as datas da janela escolhida foram consultadas e atualizadas; D0 pode estar parcial. A captura fica separada do Diário MCC, que não foi regravado. A fotografia de status, qualificação e orçamento capturada em D0 é preservada para aquela data; a configuração atual não preenche datas antigas. Custo e valor de conversão ficam na moeda original da conta.</p></section>';
    }
    if (state.dailyMode === 'feed-preview') {
      return '<section class="google-ads-comparison"><h4>Prévia da captura paralela</h4><p>Os resultados abaixo não foram gravados porque pelo menos uma conta falhou ou não foi possível salvar a rodada completa. Corrija o problema e repita a consulta; nenhuma data passada foi alterada.</p></section>';
    }
    if (!state.dailyComparison) {
      return '<section class="google-ads-comparison"><h4>Comparação com o manifesto MCC</h4><p>A comparação será exibida após a consulta diária terminar.</p></section>';
    }
    if (state.dailyComparison.errorMessage) {
      return `<section class="google-ads-comparison"><h4>Comparação com o manifesto MCC</h4><p>Não foi possível montar a comparação: ${escapeHtml(state.dailyComparison.errorMessage)}</p></section>`;
    }
    const comparison = state.dailyComparison?.accounts?.find(item => item.customerId === report.customerId);
    if (!state.dailyComparison?.available) {
      return '<section class="google-ads-comparison"><h4>Comparação com o manifesto MCC</h4><p>Não encontrei dados diários MCC comparáveis nesta sessão do Hub. O período só poderá ser comparado nos dias que já foram importados da MCC.</p></section>';
    }
    if (!comparison?.rows.length) {
      const dates = (comparison?.capturedDates || []).filter(date => date >= report.dateFrom && date <= report.dateTo);
      const mixedSourceNote = comparison?.historyRowsExcluded ? ` ${comparison.historyRowsExcluded} linha(s) que também têm origem na planilha foram excluídas por segurança.` : '';
      const explanation = dates.length
        ? `Há capturas MCC em ${dates.join(', ')}, mas nenhuma campanha retornou linha de comparação para esta conta.${mixedSourceNote}`
        : comparison?.historyRowsExcluded
          ? `${comparison.historyRowsExcluded} linha(s) MCC deste período também têm origem na planilha e foram excluídas para não comparar valores de fonte incerta.`
          : 'Não localizei capturas MCC diárias seguras para esta conta nesse período. O comparativo só usa dias que já foram importados da MCC.';
      return `<section class="google-ads-comparison"><h4>Comparação com o manifesto MCC</h4><p>${escapeHtml(explanation)}</p></section>`;
    }
    const summary = comparison.summary;
    const counts = [
      ['match', 'Confere', summary.match], ['difference', 'Diferenças', summary.difference], ['partial', 'Parcial', summary.partial],
      ['api_only', 'Sem par MCC', summary.api_only], ['mcc_only', 'Sem linha API', summary.mcc_only], ['ambiguous', 'Ambíguo', summary.ambiguous],
      ['manifest_not_observed', 'Sem observação', summary.manifest_not_observed], ['inconclusive', 'Inconclusivo', summary.inconclusive],
    ].filter(([, , count]) => count > 0).map(([key, label, count]) => `<span class="google-ads-compare-count ${key}">${escapeHtml(label)}: ${count}</span>`).join('') || '<span class="google-ads-compare-count">Nenhuma linha comparável</span>';
    const shown = renderedRowCount(report, 'daily-comparison', comparison.rows.length);
    const rows = comparison.rows.slice(0, shown).map(row => `<tr class="google-ads-compare-row ${escapeHtml(row.status)}">
      <td>${escapeHtml(row.date)}</td><td class="google-ads-compare-campaign"><strong>${escapeHtml(row.campaignName)}</strong>${row.apiCampaignId ? `<small>ID API ${escapeHtml(row.apiCampaignId)}</small>` : ''}</td>
      <td>${comparisonStatus(row.status)}${row.reason ? `<small class="google-ads-compare-reason">${escapeHtml(row.reason)}</small>` : ''}</td>
      ${comparisonMetricCell(row.metrics.impressions, (value, signed = false) => value == null ? '—' : `${signed && value > 0 ? '+' : ''}${integer(value)}`, row.status)}
      ${comparisonMetricCell(row.metrics.clicks, (value, signed = false) => value == null ? '—' : `${signed && value > 0 ? '+' : ''}${integer(value)}`, row.status)}
      ${comparisonMetricCell(row.metrics.conversions, (value, signed = false) => value == null ? '—' : `${signed && value > 0 ? '+' : ''}${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`, row.status)}
      ${comparisonMetricCell(row.metrics.cost, (value, signed = false, side = 'api') => {
        if (value == null) return '—';
        const currencyCode = side === 'manifest' ? row.manifestCurrencyCode : row.apiCurrencyCode || report.currencyCode;
        if (!currencyCode) return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} (moeda não identificada)`;
        const amount = moneyAmount(signed ? Math.abs(value) : value, currencyCode);
        return signed && value !== 0 ? `${value > 0 ? '+' : '−'}${amount}` : amount;
      }, row.status)}
      ${comparisonMetricCell(row.metrics.conversionValue, (value, signed = false, side = 'api') => {
        if (value == null) return '—';
        const currencyCode = side === 'manifest' ? row.manifestCurrencyCode : row.apiCurrencyCode || report.currencyCode;
        if (!currencyCode) return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} (moeda não identificada)`;
        const amount = moneyAmount(signed ? Math.abs(value) : value, currencyCode);
        return signed && value !== 0 ? `${value > 0 ? '+' : '−'}${amount}` : amount;
      }, row.status)}
    </tr>`).join('');
    const dates = comparison.capturedDates.filter(date => date >= report.dateFrom && date <= report.dateTo);
    const excludedHistoryNote = comparison.historyRowsExcluded
      ? ` ${comparison.historyRowsExcluded} linha(s) MCC que também têm origem na planilha foram excluídas desta comparação.`
      : '';
    return `<section class="google-ads-comparison"><h4>Comparação com o manifesto MCC</h4>
      <p>Visão diária: cada linha representa uma campanha em uma data; a mesma campanha pode aparecer em dias diferentes sem ser duplicata. Dias MCC disponíveis no recorte: ${escapeHtml(dates.join(', '))}. Pareamento por ID completo da conta + nome completo exato da campanha + data. As métricas abaixo não são gravadas.${escapeHtml(excludedHistoryNote)}</p>
      <div class="google-ads-compare-summary">${counts}</div>
       <div class="google-ads-table-wrap"><table class="google-ads-table google-ads-compare-table"><thead><tr><th>Data</th><th>Campanha</th><th>Resultado</th><th>Impressões · API / MCC / Δ</th><th>Cliques · API / MCC / Δ</th><th>Conversões · API / MCC / Δ</th><th>Custo · API / MCC / Δ</th><th>Valor conv. · API / MCC / Δ</th></tr></thead><tbody>${rows}</tbody></table></div>
       ${renderLoadMoreRows(report, 'daily-comparison', comparison.rows.length, shown)}
      <p class="google-ads-compare-footnote">Linhas em vermelho têm diferença numérica; as demais categorias indicam pareamento incompleto ou valores não comparáveis, não uma diferença. Dados diários MCC misturados com a planilha são excluídos. Custo e valor de conversão só são comparados quando as moedas coincidem; o Diário histórico está em BRL e o snapshot MCC usa a moeda original. Linha ausente não é considerada zero.</p>
    </section>`;
  }

  function renderDailyReport(report) {
    const shown = renderedRowCount(report, 'daily', report.rows.length);
    const rows = report.rows.slice(0, shown).map(row => `<tr>
      <td>${escapeHtml(row.date)}</td>
      <td><strong>${escapeHtml(row.campaignName)}</strong><small>${escapeHtml(row.campaignId)}</small></td>
      <td>${escapeHtml(campaignStatus(row.campaignStatus))}</td>
      <td>${integer(row.impressions)}</td><td>${integer(row.clicks)}</td><td>${percentRatio(row.ctr)}</td>
      <td>${money(row.averageCpcMicros, report.currencyCode)}</td><td>${money(row.costMicros, report.currencyCode)}</td>
      <td>${Number(row.conversions || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      <td>${money(row.conversionsValue * 1_000_000, report.currencyCode)}</td>
      <td>${impressionShare(row.searchImpressionShare)}</td><td>${impressionShare(row.searchTopImpressionShare)}</td><td>${impressionShare(row.searchAbsoluteTopImpressionShare)}</td>
    </tr>`).join('');
    const generated = report.generatedAtUtc ? new Date(report.generatedAtUtc) : null;
    const generatedLabel = generated && !Number.isNaN(generated.getTime())
      ? generated.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : '—';
    return `<section class="google-ads-account-result">
      <h3>${escapeHtml(report.accountName || `Conta ${report.customerId}`)} <small>${escapeHtml(report.currencyCode)} · ${escapeHtml(report.customerId)}</small></h3>
      <div class="google-ads-report-meta">Prévia diária · <strong>${report.rows.length.toLocaleString('pt-BR')} linha(s)</strong> · Período: <strong>${escapeHtml(report.dateFrom)} a ${escapeHtml(report.dateTo)}</strong> · Fuso: <strong>${escapeHtml(report.timeZone || 'da conta Google Ads')}</strong> · Consulta: <strong>${escapeHtml(generatedLabel)} (São Paulo)</strong></div>
      ${dailySummaryCards(report)}
      ${renderConfiguration(report)}
      ${report.shareMetricsAvailable ? '<p class="google-ads-share-note">*Parcelas abaixo de 10% podem ser truncadas pela API e são exibidas como “&lt;10%”.</p>' : '<p class="google-ads-share-note">A API não retornou parcelas de impressão por dia para esta consulta; as métricas principais foram carregadas.</p>'}
      <p class="google-ads-share-note">O status nesta prévia é o estado atual retornado pela API, não um histórico diário. A captura operacional preserva a fotografia de status/orçamento/qualificação feita no próprio D0.</p>
       <div class="google-ads-table-wrap"><table class="google-ads-table google-ads-daily-table"><thead><tr><th>Data</th><th>Campanha</th><th>Status atual na consulta</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>CPC médio</th><th>Custo</th><th>Conversões</th><th>Valor conv.</th><th>Parc. pesquisa</th><th>Parc. topo</th><th>Parc. topo abs.</th></tr></thead><tbody>${rows || '<tr><td colspan="13" class="google-ads-no-rows">A API não retornou linhas diárias neste período. Isso não confirma, por si só, que todos os dias tiveram zero.</td></tr>'}</tbody></table></div>
       ${renderLoadMoreRows(report, 'daily', report.rows.length, shown)}
      ${renderDailyComparison(report)}</section>`;
  }

  function renderConfiguration(report) {
    if (!report.configuration) return '';
    const campaigns = report.configuration.campaigns;
    const shownCampaigns = renderedRowCount(report, 'configuration', campaigns.length);
    const configRows = campaigns.slice(0, shownCampaigns).map(row => `<tr><td><strong>${escapeHtml(row.campaignName)}</strong><small>${escapeHtml(row.campaignId)}</small></td><td>${escapeHtml(campaignStatus(row.campaignStatus))}</td><td>${escapeHtml(googleAdsQualification(row) || 'Não informada')}<small class="google-ads-config-reasons">${escapeHtml(row.primaryStatusReasons.map(googleAdsStatusReason).join(' · '))}</small></td><td>${escapeHtml(googleAdsBudget(row, report.currencyCode) || 'Não informado')}</td><td>${escapeHtml(googleAdsStrategy(row) || 'Não informada')}</td><td>${row.targetCpaResolution === 'unresolved_portfolio' ? 'Portfólio não resolvido' : row.targetCpaMicros == null ? (row.targetCpaResolution === 'not_set' ? 'Sem CPA definido' : 'Não disponível') : money(row.targetCpaMicros, report.currencyCode)}</td><td>${row.mappingStatus === 'mapped' ? 'Vinculada' : row.mappingStatus ? 'Sem vínculo seguro' : 'Aguardando normalização'}<small class="google-ads-config-reasons">${escapeHtml(googleAdsConfigurationIssues(row).join(' · '))}</small></td></tr>`).join('');
    const sales = (report.billingPreview || []).filter(sale => sale.active !== false);
    const shownSales = renderedRowCount(report, 'billing-preview', sales.length);
    const saleRows = sales.slice(0, shownSales).map(sale => `<tr><td>${escapeHtml(sale.sale_date)}</td><td>${escapeHtml(sale.product)}</td><td>${Number(sale.conversion_count).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td><td>${moneyAmount(sale.value_brl, 'BRL')}</td><td>${moneyAmount(sale.value_usd, 'USD')}</td><td>${sale.source_period === 'd1' ? 'API D−1 · atualizável' : 'Provisório · API D0'}</td></tr>`).join('');
    return `<details class="google-ads-comparison"><summary>Configuração atual · ${campaigns.length} campanha(s)</summary><p>Orçamento é o limite configurado; custo é o gasto realizado. Orçamentos compartilhados aparecem identificados e não são somados como receita. A qualificação mantém os motivos informados pelo Google.</p><div class="google-ads-table-wrap"><table class="google-ads-table"><thead><tr><th>Campanha</th><th>Status</th><th>Qualificação e motivos</th><th>Orçamento</th><th>Estratégia</th><th>CPA desejado</th><th>Vínculo na base</th></tr></thead><tbody>${configRows}</tbody></table></div>${renderLoadMoreRows(report, 'configuration', campaigns.length, shownCampaigns)}</details>
      <details class="google-ads-comparison"><summary>Prévia dos agregados para Faturamento · ${sales.length} registro(s)</summary><p>Uma linha por campanha/data, descontando os lançamentos manuais já vinculados. Valor de conversão mantém a moeda original e não confirma recebimento. Dias anteriores só são revisados quando incluídos na janela selecionada. Zeros completos só desativam agregados anteriores, sem criar vendas zeradas.</p><div class="google-ads-table-wrap"><table class="google-ads-table"><thead><tr><th>Data</th><th>Campanha</th><th>Conversões residuais</th><th>Valor R$</th><th>Valor US$</th><th>Situação</th></tr></thead><tbody>${saleRows || '<tr><td colspan="6" class="google-ads-no-rows">Nenhuma conversão residual com vínculo seguro para alimentar o Faturamento.</td></tr>'}</tbody></table></div>${renderLoadMoreRows(report, 'billing-preview', sales.length, shownSales)}</details>`;
  }

  function renderAggregateReport(report) {
    const summary = report.summary;
    const kpis = [
      ['Impressões', integer(summary.impressions)],
      ['Cliques', integer(summary.clicks)],
      ['CTR', percentRatio(summary.ctr)],
      ['CPC médio', money(summary.averageCpcMicros, report.currencyCode)],
      ['Custo', money(summary.costMicros, report.currencyCode)],
      ['Conversões', Number(summary.conversions || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })],
      ['CPA', money(summary.costPerConversionMicros, report.currencyCode)],
      ['Valor conv.', money(summary.conversionsValue * 1_000_000, report.currencyCode)],
    ];
    const shown = renderedRowCount(report, 'aggregate', report.rows.length);
    const rows = report.rows.slice(0, shown).map(row => `<tr>
      <td><strong>${escapeHtml(row.campaignName)}</strong><small>${escapeHtml(row.campaignId)}</small></td>
      <td>${escapeHtml(campaignStatus(row.campaignStatus))}</td>
      <td>${escapeHtml(channelType(row.channelType))}</td>
      <td>${integer(row.impressions)}</td><td>${integer(row.clicks)}</td><td>${percentRatio(row.ctr)}</td>
      <td>${money(row.averageCpcMicros, report.currencyCode)}</td><td>${money(row.costMicros, report.currencyCode)}</td>
      <td>${Number(row.conversions || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      <td>${money(row.costPerConversionMicros, report.currencyCode)}</td><td>${money(row.conversionsValue * 1_000_000, report.currencyCode)}</td>
      <td>${impressionShare(row.searchImpressionShare)}</td><td>${impressionShare(row.searchTopImpressionShare)}</td><td>${impressionShare(row.searchAbsoluteTopImpressionShare)}</td>
    </tr>`).join('');
    const generated = report.generatedAtUtc ? new Date(report.generatedAtUtc) : null;
    const generatedLabel = generated && !Number.isNaN(generated.getTime())
      ? generated.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : '—';
    return `<section class="google-ads-account-result">
      <h3>${escapeHtml(report.accountName || `Conta ${report.customerId}`)} <small>${escapeHtml(report.currencyCode)} · ${escapeHtml(report.customerId)}</small></h3>
      <div class="google-ads-report-meta">Período: <strong>${escapeHtml(report.dateFrom)} a ${escapeHtml(report.dateTo)}</strong> · Fuso: <strong>${escapeHtml(report.timeZone || 'da conta Google Ads')}</strong> · Consulta: <strong>${escapeHtml(generatedLabel)} (São Paulo)</strong></div>
      <div class="google-ads-kpis">${kpis.map(([label, value]) => `<div class="google-ads-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>
      ${report.shareMetricsAvailable ? '<p class="google-ads-share-note">*Parcelas abaixo de 10% podem ser truncadas pela API e são exibidas como “&lt;10%”.</p>' : '<p class="google-ads-share-note">A Google Ads API não retornou as métricas de parcela de impressão para esta consulta; as demais métricas foram carregadas.</p>'}
      <div class="google-ads-table-wrap"><table class="google-ads-table"><thead><tr><th>Campanha</th><th>Status</th><th>Tipo</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>CPC médio</th><th>Custo</th><th>Conversões</th><th>CPA</th><th>Valor conv.</th><th>Parc. pesquisa</th><th>Parc. topo</th><th>Parc. topo abs.</th></tr></thead><tbody>${rows || '<tr><td colspan="14" class="google-ads-no-rows">Nenhuma campanha com dados no período selecionado.</td></tr>'}</tbody></table></div>${renderLoadMoreRows(report, 'aggregate', report.rows.length, shown)}</section>`;
  }

  function renderFailures(failures) {
    if (!failures.length) return '';
    return `<div class="google-ads-account-failures"><strong>Contas que falharam nesta consulta:</strong><ul>${failures.map(item => `<li>${escapeHtml(item.accountName)}: ${escapeHtml(item.message)}</li>`).join('')}</ul></div>`;
  }

  function d0ChangeText(change, report) {
    const format = value => {
      if (change.kind === 'integer') return integer(value);
      if (change.kind === 'decimal') return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
      if (change.kind === 'money-micros') return moneyAmount(Number(value) / 1_000_000, report.currencyCode);
      if (change.kind === 'money') return moneyAmount(Number(value), report.currencyCode);
      if (change.kind === 'status') return campaignStatus(value);
      return String(value ?? '—');
    };
    const before = format(change.before);
    const after = format(change.after);
    if (change.kind === 'text' || change.kind === 'status') return `${change.label}: ${before} → ${after}`;
    const delta = change.kind === 'money-micros'
      ? moneyAmount(Math.abs(change.delta) / 1_000_000, report.currencyCode)
      : change.kind === 'money'
        ? moneyAmount(Math.abs(change.delta), report.currencyCode)
        : format(Math.abs(change.delta));
    const sign = change.delta > 0 ? '+' : change.delta < 0 ? '−' : '';
    return `${change.label}: ${before} → ${after} (${sign}${delta})`;
  }

  function d0MetricValue(metricKey, value, currencyCode) {
    if (value == null) return '—';
    return metricKey === 'costMicros'
      ? moneyAmount(Number(value) / 1_000_000, currencyCode)
      : integer(value);
  }

  function renderD0MetricCell(row, metricKey, account) {
    if (row.kind === 'changed') {
      const change = row.changes.find(item => item.key === metricKey);
      if (change) {
        const delta = metricKey === 'costMicros'
          ? moneyAmount(Math.abs(change.delta) / 1_000_000, account.currencyCode)
          : integer(Math.abs(change.delta));
        const direction = change.delta > 0 ? 'increase' : 'decrease';
        const signedDelta = `${change.delta > 0 ? '+' : '−'}${delta}`;
        const before = d0MetricValue(metricKey, change.before, account.baselineCurrencyCode || account.currencyCode);
        const after = d0MetricValue(metricKey, change.after, account.currencyCode);
        return `<div class="google-ads-d0-metric"><strong class="${direction}">${escapeHtml(signedDelta)}</strong><small>${escapeHtml(before)} → ${escapeHtml(after)}</small></div>`;
      }
      if (metricKey === 'costMicros' && account.baselineStatus === 'available' && !account.currencyMatches) {
        const reason = account.baselineCurrencyCode ? 'Moeda divergente' : 'Moeda anterior ausente';
        const pair = account.baselineCurrencyCode ? `${account.baselineCurrencyCode} → ${account.currencyCode}` : account.currencyCode;
        return `<div class="google-ads-d0-metric unavailable"><strong>${escapeHtml(reason)}</strong><small>${escapeHtml(pair)}</small></div>`;
      }
      return '<span class="google-ads-d0-dash">—</span>';
    }
    if (row.kind === 'current_only') {
      const current = d0MetricValue(metricKey, row.current?.[metricKey], account.currencyCode);
      return `<div class="google-ads-d0-metric context"><strong>Sem base</strong><small>Atual: ${escapeHtml(current)}</small></div>`;
    }
    const previousCurrency = account.baselineCurrencyCode || account.currencyCode;
    const previous = d0MetricValue(metricKey, row.previous?.[metricKey], previousCurrency);
    return `<div class="google-ads-d0-metric context"><strong>Sem leitura atual</strong><small>Anterior: ${escapeHtml(previous)}</small></div>`;
  }

  function renderD0OtherChanges(row, account) {
    if (row.kind === 'changed') {
      const changes = row.changes.filter(change => !['impressions', 'clicks', 'costMicros'].includes(change.key));
      return changes.length
        ? `<div class="google-ads-d0-other-changes">${changes.map(change => `<span>${escapeHtml(d0ChangeText(change, account))}</span>`).join('')}</div>`
        : '<span class="google-ads-d0-dash">—</span>';
    }
    if (row.kind === 'current_only') {
      return `<span class="google-ads-d0-context-note">${row.current?.inferredZero === true ? 'Zero confirmado pela consulta completa e inventário atual.' : 'Campanha sem linha na captura anterior; valor atual não é delta.'}</span>`;
    }
    return '<span class="google-ads-d0-context-note">Sem linha na consulta atual; ausência não confirma zero.</span>';
  }

  function renderD0Comparison() {
    const comparison = state.d0Comparison;
    d0ComparisonArea.hidden = !comparison;
    if (!comparison) {
      d0ComparisonArea.innerHTML = '';
      return;
    }
    if (comparison.pending) {
      d0ComparisonArea.innerHTML = `<div class="google-ads-d0-progress">Consultando D0 ${comparison.activeCampaignsOnly ? 'somente para campanhas ENABLED' : 'para todas as campanhas'}: ${integer(comparison.progress.completed)} de ${integer(comparison.progress.total)} conta(s). Esta etapa prepara a prévia; a base só muda ao clicar em Atualizar base.</div>`;
      return;
    }

    const accounts = comparison.accounts || [];
    const allRows = accounts.flatMap(account => account.changes.map(row => ({ account, row })));
    const changedRows = allRows.filter(item => item.row.kind === 'changed');
    const currentOnlyRows = allRows.filter(item => item.row.kind === 'current_only');
    const previousOnlyRows = allRows.filter(item => item.row.kind === 'previous_only');
    const noBaseline = accounts.filter(account => account.baselineStatus === 'missing');
    const timezoneMismatch = accounts.filter(account => account.baselineStatus === 'timezone_mismatch');
    const currencyMismatch = accounts.filter(account => account.baselineStatus === 'available' && account.baselineCurrencyCode && !account.currencyMatches);
    const currencyUnknown = accounts.filter(account => account.baselineStatus === 'available' && !account.baselineCurrencyCode);
    const activeOnlyBaseline = accounts.filter(account => account.baselineStatus === 'available' && account.baselineCampaignStatusFilter === 'ENABLED');
    const unchangedRows = accounts.reduce((sum, account) => sum + account.unchangedRows, 0);
    const baselineIncomplete = accounts.filter(account => account.baselineStatus === 'available' && !account.baselineComplete);
    const scopeLabel = comparison.activeCampaignsOnly ? 'somente campanhas ENABLED atuais' : 'todas as campanhas';
    const summary = [
      ['difference', 'Campanhas com diferença', changedRows.length],
      ['partial', 'Sem linha anterior', currentOnlyRows.length],
      ['partial', 'Sem linha na consulta atual', previousOnlyRows.length],
      ['', 'Sem diferença nas métricas comparáveis', unchangedRows],
      ['partial', 'Contas sem captura D0 anterior', noBaseline.length],
    ].filter(([, , count]) => count > 0).map(([kind, label, count]) => `<span class="google-ads-compare-count ${kind}">${escapeHtml(label)}: ${integer(count)}</span>`).join('')
      || '<span class="google-ads-compare-count">Nenhuma campanha retornada</span>';
    const visibleRows = [...changedRows, ...currentOnlyRows, ...previousOnlyRows]
      .sort((left, right) => String(left.account.accountName).localeCompare(String(right.account.accountName), 'pt-BR')
        || String(left.row.campaignName).localeCompare(String(right.row.campaignName), 'pt-BR'));
    const limit = state.d0ComparisonPageLimit;
    const shownRows = visibleRows.slice(0, limit).map(({ account, row }) => {
      const rowStatus = row.kind === 'current_only' ? 'Sem linha anterior'
        : row.kind === 'previous_only' ? 'Sem linha na consulta atual'
          : 'Diferença';
      const zeroConfirmed = row.current?.inferredZero === true;
      const managerCustomerId = String(account.managerCustomerId || '');
      const manager = (state.accounts?.managers || []).find(item => String(item.customerId || '') === managerCustomerId);
      const managerName = managerCustomerId ? (String(account.managerName || manager?.name || '').trim() || `MCC ${managerCustomerId}`) : 'Acesso direto';
      return `<tr class="google-ads-d0-row ${row.kind}"><td class="google-ads-d0-campaign"><strong>${escapeHtml(row.campaignName)}</strong><small>ID Google Ads ${escapeHtml(row.campaignId)}</small><span class="google-ads-compare-status ${row.kind === 'changed' ? 'difference' : 'partial'}">${escapeHtml(rowStatus)}${zeroConfirmed ? ' · zero confirmado' : ''}</span></td><td class="google-ads-d0-manager"><strong>${escapeHtml(managerName)}</strong><small>${escapeHtml(managerCustomerId || 'Conta cliente direta')}</small></td><td class="google-ads-d0-account"><strong>${escapeHtml(account.accountName)}</strong><small>${escapeHtml(account.customerId)} · ${escapeHtml(account.date)}</small></td><td class="num">${renderD0MetricCell(row, 'impressions', account)}</td><td class="num">${renderD0MetricCell(row, 'clicks', account)}</td><td class="num">${renderD0MetricCell(row, 'costMicros', account)}</td><td class="google-ads-d0-other-cell">${renderD0OtherChanges(row, account)}</td></tr>`;
    }).join('');
    const shownCount = Math.min(visibleRows.length, limit);
    const loadMore = shownCount < visibleRows.length
      ? `<div class="google-ads-load-more-wrap"><button class="btn google-ads-load-more" type="button" data-google-ads-d0-load-more>Carregar mais ${Math.min(GOOGLE_ADS_RENDER_PAGE_SIZE, visibleRows.length - shownCount)} · ${integer(shownCount)} de ${integer(visibleRows.length)}</button></div>`
      : '';
    const notices = [
      noBaseline.length ? `<p class="google-ads-d0-note">Sem captura anterior para D0 em: ${noBaseline.map(item => `${escapeHtml(item.accountName)} (${escapeHtml(item.date)})`).join('; ')}. A gravação desta prévia cria a primeira referência.</p>` : '',
      timezoneMismatch.length ? `<p class="google-ads-d0-note">Fuso diferente da captura anterior; comparação recusada em: ${timezoneMismatch.map(item => escapeHtml(item.accountName)).join(', ')}.</p>` : '',
      currencyMismatch.length ? `<p class="google-ads-d0-note">A moeda mudou em: ${currencyMismatch.map(item => `${escapeHtml(item.accountName)} (${escapeHtml(item.baselineCurrencyCode)} → ${escapeHtml(item.currencyCode)})`).join(', ')}. Impressões, cliques e conversões ainda são comparados; custo e valor de conversão não são subtraídos.</p>` : '',
      currencyUnknown.length ? `<p class="google-ads-d0-note">Moeda ausente na captura anterior em: ${currencyUnknown.map(item => escapeHtml(item.accountName)).join(', ')}. Custo e valor de conversão não são comparados nessas contas.</p>` : '',
      activeOnlyBaseline.length ? `<p class="google-ads-d0-note">A captura anterior foi somente de campanhas ENABLED em: ${activeOnlyBaseline.map(item => escapeHtml(item.accountName)).join(', ')}. Uma campanha sem linha anterior pode estar fora daquele escopo.</p>` : '',
      baselineIncomplete.length ? `<p class="google-ads-d0-note">A captura anterior não confirmou cobertura completa em: ${baselineIncomplete.map(item => escapeHtml(item.accountName)).join(', ')}. Ausências nessa referência podem ser parciais.</p>` : '',
      comparison.directoryWarningCount ? `<p class="google-ads-d0-note">O diretório tem ${integer(comparison.directoryWarningCount)} aviso(s); a consulta cobre as contas acessíveis listadas no cache.</p>` : '',
      comparison.failures?.length ? renderFailures(comparison.failures) : '',
      comparison.error ? `<div class="google-ads-account-failures">${escapeHtml(comparison.error)}</div>` : '',
    ].filter(Boolean).join('');
    const referenceRows = accounts.filter(account => account.baselineCapturedAtUtc).map(account => `<li><strong>${escapeHtml(account.accountName)}</strong> · ${escapeHtml(account.date)} · captura anterior ${escapeHtml(directoryDateLabel(account.baselineCapturedAtUtc))} (São Paulo)${account.baselineCampaignStatusFilter === 'ENABLED' ? ' · somente campanhas ativas' : ''}</li>`).join('');
    const emptyMessage = noBaseline.length === accounts.length && accounts.length
      ? 'Ainda não há capturas D0 salvas para comparar. Atualize a base para criar a primeira referência.'
      : 'Nenhuma diferença comparável foi encontrada nas contas com uma captura anterior compatível.';
    d0ComparisonArea.innerHTML = `<div class="google-ads-d0-panel"><h4>Resultado da prévia D0 <small>· ${escapeHtml(scopeLabel)}</small></h4><div class="google-ads-compare-summary">${summary}</div>${notices}${referenceRows ? `<details class="google-ads-d0-references"><summary>Horários das capturas anteriores usadas</summary><ul>${referenceRows}</ul></details>` : ''}${visibleRows.length ? `<div class="google-ads-table-wrap"><table class="google-ads-table google-ads-d0-table"><thead><tr><th>Campanha / produto</th><th>MCC</th><th>Conta / data</th><th class="num">Δ Impressões</th><th class="num">Δ Cliques</th><th class="num">Δ Custo</th><th>Outras alterações</th></tr></thead><tbody>${shownRows}</tbody></table></div>${loadMore}` : `<div class="google-ads-no-rows">${escapeHtml(emptyMessage)}</div>`}<p class="google-ads-d0-footnote">A tabela mostra a prévia da captura que será gravada. Uma falha ou aviso no diretório impede a gravação do lote completo. A captura salva contém todas as campanhas consultadas, mesmo quando a comparação está filtrada para ENABLED.</p></div>`;
  }

  function renderReport() {
    if (state.reportPending) {
      reportArea.innerHTML = '<div class="google-ads-empty google-ads-report-loading">Consulta em andamento. O resumo e as tabelas serão exibidos quando todas as contas terminarem.</div>';
      return;
    }
    const dailyReports = Array.isArray(state.dailyReport) ? state.dailyReport : null;
    const reports = Array.isArray(state.report) ? state.report : null;
    const normalizedPreview = state.dailyMode === 'normalized-preview' || state.dailyMode === 'normalized-preview-saved';
    const summaryNote = normalizedPreview
      ? ''
      : '<p class="google-ads-render-note">Os resumos consideram todos os dados consultados. Cada tabela começa com até 20 linhas; use “Carregar mais” para abrir o restante.</p>';
    if (dailyReports) {
      const content = normalizedPreview
        ? (dailyReports.length ? renderNormalizedPreview(dailyReports) : '<div class="google-ads-empty">Nenhuma conta selecionada retornou uma prévia diária.</div>')
        : (dailyReports.length ? `<div class="google-ads-account-results">${dailyReports.map(renderDailyReport).join('')}</div>` : '<div class="google-ads-empty">Nenhuma conta selecionada retornou uma prévia diária.</div>');
      reportArea.innerHTML = `${summaryNote}${renderFailures(state.dailyFailures)}${content}`;
      return;
    }
    if (reports) {
      reportArea.innerHTML = `${summaryNote}${renderFailures(state.reportFailures)}${reports.length ? `<div class="google-ads-account-results">${reports.map(renderAggregateReport).join('')}</div>` : '<div class="google-ads-empty">Nenhuma conta selecionada retornou um relatório.</div>'}`;
      return;
    }
    reportArea.innerHTML = '<div class="google-ads-empty">Escolha uma consulta para as contas selecionadas ou use <strong>Alimentar todas as contas</strong> para atualizar as MCCs conectadas em lote.</div>';
  }

  function renderSearchTermsResults() {
    const markup = renderGoogleAdsSearchTermsResults({
      reports: state.searchTermsReports || [],
      failures: state.searchTermsFailures,
      pending: state.searchTermsPending,
      progress: state.searchTermsProgress,
      dateFrom: state.searchTermsDateFrom || dateFromInput.value,
      dateTo: state.searchTermsDateTo || dateToInput.value,
      visibleCount: state.searchTermsVisibleCount,
      pageSize: GOOGLE_ADS_SEARCH_TERMS_PAGE_SIZE,
    });
    searchTermsArea.hidden = false;
    searchTermsArea.innerHTML = markup;
  }

  const historyFieldLabels = { impressions: 'Impressões', clicks: 'Cliques', costMicros: 'Custo', conversions: 'Conversões', conversionsValue: 'Valor de conversão', campaignName: 'Nome da campanha', campaignStatus: 'Status', primaryStatus: 'Qualificação', primaryStatusReasons: 'Motivo', biddingStrategyType: 'Estratégia', targetCpaMicros: 'CPA desejado', targetCpaResolution: 'Resolução do CPA', budgetPeriod: 'Período do orçamento', budgetAmountMicros: 'Orçamento diário', budgetTotalAmountMicros: 'Orçamento total', budgetShared: 'Orçamento compartilhado' };

  function captureHistoryValue(key, value, currencyCode) {
    if (value == null || value === '') return 'Sem registro';
    if (key === 'costMicros' || key === 'targetCpaMicros' || key === 'budgetAmountMicros' || key === 'budgetTotalAmountMicros') return money(value, currencyCode);
    if (key === 'campaignStatus') return campaignStatus(value);
    if (key === 'primaryStatus') return googleAdsQualification({ primaryStatus: value, primaryStatusReasons: [] }) || value;
    if (key === 'biddingStrategyType') return googleAdsStrategy({ biddingStrategyType: value }) || value;
    if (key === 'primaryStatusReasons') return Array.isArray(value) && value.length ? value.map(item => googleAdsStatusReason(item)).join(' · ') : 'Sem motivo registrado';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (Array.isArray(value)) return value.length ? value.join(' · ') : 'Sem registro';
    if (typeof value === 'number') return value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
    return String(value);
  }

  function captureHistoryDelta(field, currencyCode) {
    if (field.before == null || field.after == null || typeof field.before !== 'number' || typeof field.after !== 'number') return '';
    const delta = field.after - field.before;
    if (delta === 0) return '';
    if (['costMicros', 'targetCpaMicros', 'budgetAmountMicros', 'budgetTotalAmountMicros'].includes(field.key)) {
      const amount = moneyAmount(Math.abs(delta) / 1_000_000, currencyCode);
      return `${delta > 0 ? '+' : '−'}${amount}`;
    }
    return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`;
  }

  function googleAdsAccountCampaignsHref(customerId, campaignId) {
    const accountId = String(customerId || '').replace(/\D/g, '');
    const id = String(campaignId || '').trim();
    if (!/^\d{10}$/.test(accountId) || !/^[1-9]\d{0,19}$/.test(id)) return '';
    const parameters = new URLSearchParams({
      ocid: accountId,
      euid: '1595241083',
      __u: '7535994467',
      uscid: accountId,
      __c: '8442924178',
      authuser: '4',
      workspaceId: '0',
    });
    return `https://ads.google.com/aw/campaigns?${parameters.toString()}`;
  }
  function renderCaptureHistoryDetails(record) {
    if (record.status === 'failed') {
      const businessDate = record.periodType === 'D-1' ? captureHistoryBusinessDate(record.dateTo || record.dateFrom) : '';
      return `<p class="google-ads-history-empty google-ads-history-failure">Falha na execução automática${businessDate ? ` para os dados de ${escapeHtml(businessDate)}` : ''}. Esta tentativa não tem tabela de diferenças.</p>`;
    }
    const pageLimit = state.captureHistoryPageLimits.get(record.id) || 20;
    const changes = Array.isArray(record.changes) ? record.changes : [];
    if (!changes.length) {
      const comparableCampaignDateCount = Number(record.comparedCampaignDateCount) || 0;
      const missingBaselineCount = Number(record.captureDatesWithoutBaseline) || 0;
      const detail = comparableCampaignDateCount
        ? missingBaselineCount
          ? `Execução registrada sem diferenças nas campanhas comparáveis; ${integer(missingBaselineCount)} conta/data(s) não tinham captura anterior.`
          : 'Execução registrada sem diferenças nas campanhas comparáveis.'
        : missingBaselineCount
          ? `Captura de referência criada para ${integer(missingBaselineCount)} conta/data(s), sem uma gravação anterior para calcular diferenças.`
          : 'Consulta registrada sem campanhas comparáveis nesta execução.';
      return `<p class="google-ads-history-empty">${detail}</p>`;
    }
    const rows = changes.slice(0, pageLimit).map(change => {
      const fields = (change.fields || []).map(field => {
        const delta = captureHistoryDelta(field, change.currencyCode);
        return `<div class="google-ads-history-field"><strong>${escapeHtml(historyFieldLabels[field.key] || field.key)}</strong><span>${escapeHtml(captureHistoryValue(field.key, field.before, change.currencyCode))} <b aria-hidden="true">→</b> ${escapeHtml(captureHistoryValue(field.key, field.after, change.currencyCode))}${delta ? ` <em>(${escapeHtml(delta)})</em>` : ''}</span></div>`;
      }).join('');
      const campaignId = String(change.campaignId || '');
      const campaignHref = googleAdsAccountCampaignsHref(change.customerId, campaignId);
      const campaignIdLabel = campaignHref
        ? `<a class="google-ads-history-campaign-link" href="${escapeHtml(campaignHref)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir a lista de campanhas da conta Google Ads ${escapeHtml(change.customerId)} em nova aba">ID Google Ads ${escapeHtml(campaignId)}</a>`
        : `ID Google Ads ${escapeHtml(campaignId)}`;
      const reason = change.reason ? `<small class="google-ads-history-event-reason">Motivo: ${escapeHtml(change.reason)}</small>` : '';
      return `<tr><td>${escapeHtml(change.date)}<small>${escapeHtml(change.managerName || change.managerCustomerId || 'MCC não identificada')} · ${escapeHtml(change.managerCustomerId || '—')}</small><small>${escapeHtml(change.accountName || `Conta ${change.customerId}`)} · ${escapeHtml(change.customerId)}${change.currencyCode ? ` · ${escapeHtml(change.currencyCode)}` : ''}</small></td><td><strong>${escapeHtml(change.campaignName)}</strong><small>${campaignIdLabel}</small></td><td>${fields}${reason}</td></tr>`;
    }).join('');
    const more = pageLimit < changes.length ? `<div class="google-ads-load-more-wrap"><button class="btn google-ads-load-more" type="button" data-google-ads-history-more="${escapeHtml(record.id)}">Carregar mais ${integer(Math.min(20, changes.length - pageLimit))} · ${integer(pageLimit)} de ${integer(changes.length)}</button></div>` : '';
    return `<div class="google-ads-table-wrap"><table class="google-ads-table google-ads-history-table"><thead><tr><th>Data · MCC / conta</th><th>Campanha</th><th>Campos alterados · anterior → atual</th></tr></thead><tbody>${rows}</tbody></table></div>${more}`;
  }

  function renderCaptureHistory() {
    const records = [...(state.captureHistory || [])].filter(item => item && item.id && item.completedAtUtc).sort((a, b) => String(b.completedAtUtc).localeCompare(String(a.completedAtUtc)));
    const automaticPauses = records.filter(record => record.eventType === 'automatic_pause');
    const visibleCaptures = records.filter(record => record.eventType !== 'automatic_pause').slice(0, state.captureHistoryDisplayLimit);
    const visible = [...automaticPauses, ...visibleCaptures].sort((a, b) => String(b.completedAtUtc).localeCompare(String(a.completedAtUtc)));
    const historyById = new Map((state.captureHistory || []).filter(item => item?.id).map(item => [String(item.id), item]));
    const snapshots = [...(state.captureSnapshots || [])].filter(item => {
      if (!item?.id || !item.completedAtUtc) return false;
      const run = historyById.get(String(item.runId || item.id));
      const executionMode = item.executionMode || run?.executionMode || 'automatic';
      const periodType = item.periodType || run?.periodType || 'D0';
      return executionMode === 'automatic' && (periodType === 'D0' || periodType === 'D-1');
    }).sort((a, b) => String(b.completedAtUtc).localeCompare(String(a.completedAtUtc)));
    const campaignCount = snapshots.reduce((sum, item) => sum + (Number(item.campaignCount) || 0), 0);
    const retentionDraft = String(state.captureSnapshotRetentionDraft ?? state.captureSnapshotRetentionLimit);
    const requestedRetention = Number(retentionDraft);
    const validRetentionDraft = Number.isInteger(requestedRetention) && requestedRetention >= 1 && requestedRetention <= 100;
    const retentionDirty = validRetentionDraft && requestedRetention !== state.captureSnapshotRetentionLimit;
    const snapshotSection = `<section class="google-ads-snapshot-retention" aria-labelledby="googleAdsSnapshotRetentionTitle"><div class="google-ads-history-heading"><div><h3 id="googleAdsSnapshotRetentionTitle">Snapshots automáticos D0 e D−1</h3><p>${integer(snapshots.length)} snapshot(s) completo(s) guardado(s) · ${integer(campaignCount)} linha(s) de campanha somadas · limite compartilhado: ${integer(state.captureSnapshotRetentionLimit)} leitura(s).</p></div><div class="google-ads-history-limit-control"><label for="googleAdsCaptureSnapshotRetention">Reter <input id="googleAdsCaptureSnapshotRetention" class="google-ads-history-limit" type="number" min="1" max="100" step="1" value="${escapeHtml(retentionDraft)}" inputmode="numeric" aria-label="Quantidade de snapshots automáticos D0 e D-1 a reter"> <span>snapshots (máx. 100)</span></label><button class="btn google-ads-history-limit-apply" type="button" data-google-ads-retention-apply ${state.captureSnapshotRetentionApplying || !retentionDirty ? 'disabled' : ''}>${state.captureSnapshotRetentionApplying ? 'Aplicando…' : 'Aplicar'}</button></div></div><p class="google-ads-history-empty">O limite reúne snapshots automáticos D0 e D−1. A análise da pausa automática continua usando somente D0. Cada snapshot é uma leitura salva, não uma hora fixa. Reduzir a retenção remove os mais antigos; aumentar depois não recupera os que já foram descartados.${snapshots.length ? '' : ' A primeira captura automática completa criará o primeiro snapshot.'}</p><p id="googleAdsCaptureSnapshotRetentionMessage" class="google-ads-snapshot-retention-message" role="status" aria-live="polite">${escapeHtml(state.captureSnapshotRetentionMessage)}</p></section>`;
    if (captureSnapshotRetentionArea) captureSnapshotRetentionArea.innerHTML = snapshotSection;
    const heading = `<div class="google-ads-history-heading"><h3 id="googleAdsCaptureHistoryTitle">Histórico de capturas e pausas automáticas</h3><label class="google-ads-history-limit-control" for="googleAdsCaptureHistoryDisplayLimit">Capturas <input id="googleAdsCaptureHistoryDisplayLimit" class="google-ads-history-limit" type="number" min="1" max="${GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_MAX}" step="1" value="${state.captureHistoryDisplayLimit}" inputmode="numeric" aria-label="Quantidade de capturas a exibir"> <span>(máx. ${GOOGLE_ADS_CAPTURE_HISTORY_DISPLAY_MAX})</span></label></div>`;
    if (!records.length) {
      captureHistoryArea.innerHTML = `${heading}<div class="google-ads-history-empty">Ainda não há gravações registradas.</div>`;
      return;
    }
    const runs = visible.map(record => {
      const failed = record.status === 'failed';
      const comparableCampaignDateCount = Number(record.comparedCampaignDateCount) || 0;
      const missingBaselineCount = Number(record.captureDatesWithoutBaseline) || 0;
      const changes = Array.isArray(record.changes) ? record.changes : [];
      const changedCampaignCount = new Set(changes.map(change => {
        const accountKey = String(change?.customerId || change?.managerCustomerId || 'direct').trim();
        const campaignId = String(change?.campaignId || '').trim();
        const campaignInternalId = String(change?.campaignInternalId || '').trim();
        const campaignName = String(change?.campaignName || '').trim().toLowerCase();
        const campaignKey = campaignId ? `id:${campaignId}` : campaignInternalId ? `internal:${campaignInternalId}` : campaignName ? `name:${campaignName}` : '';
        return campaignKey ? `${accountKey}|${campaignKey}` : '';
      }).filter(Boolean)).size || Number(record.diffRowCount) || 0;
      const diffLabel = record.eventType === 'automatic_pause'
        ? 'Pausa automática confirmada · status alterado para pausada'
        : failed
        ? 'Falha · consulta não concluída'
        : changedCampaignCount
        ? `${integer(changedCampaignCount)} campanha(s) com diferença · ${integer(record.changedFieldCount)} campo(s)`
        : comparableCampaignDateCount
          ? missingBaselineCount ? 'Sem diferenças nas comparações disponíveis' : 'Sem diferenças'
          : missingBaselineCount ? 'Captura de referência · sem comparação anterior' : 'Consulta sem campanhas comparáveis';
      const scope = record.scope === 'ENABLED' ? ' · somente ativas' : '';
      const isSelected = state.captureHistorySelectedId === record.id;
      const execution = record.executionMode === 'automatic' ? ' · automática' : '';
      const periodType = record.periodType === 'D-1' ? 'D−1' : record.periodType || 'Captura API';
      const review = record.executionPass === 'reconciliation' ? ' · revisão' : '';
      const period = record.eventType === 'automatic_pause' ? 'Pausa automática' : failed ? `Falha · ${periodType}${review} · automática` : `${periodType}${review}${scope}${execution}`;
      const timestamp = captureHistoryTimestamp(record.completedAtUtc);
      const businessDate = record.periodType === 'D-1' ? captureHistoryBusinessDate(record.dateTo || record.dateFrom) : '';
      const cardDiffLabel = businessDate ? `Dados de ${businessDate} · ${diffLabel}` : diffLabel;
      const ariaLabel = record.eventType === 'automatic_pause' ? `Mostrar registro de pausa automática em ${timestamp}` : failed ? `Falha automática de ${periodType}${businessDate ? ` para os dados de ${businessDate}` : ''} em ${timestamp}` : `Mostrar diferenças de ${period}${businessDate ? ` para os dados de ${businessDate}` : ''} em ${timestamp}`;
      return `<button class="google-ads-history-button${failed ? ' is-failed' : ''}${isSelected ? ' is-selected' : ''}" type="button" data-google-ads-history-select="${escapeHtml(record.id)}" aria-pressed="${isSelected}" aria-label="${escapeHtml(ariaLabel)}"><span class="google-ads-history-button-title"><strong>${escapeHtml(period)}</strong></span><span class="google-ads-history-button-time">${escapeHtml(timestamp)}</span><span class="google-ads-history-button-diff">${escapeHtml(cardDiffLabel)}</span></button>`;
    }).join('');
    const historyColumns = Math.min(6, visible.length);
    const selectedRecord = records.find(record => String(record.id) === String(state.captureHistorySelectedId));
    if (state.captureHistorySelectedId && !selectedRecord) state.captureHistorySelectedId = null;
    const selectedDetails = selectedRecord
      ? `<div class="google-ads-history-selected" data-google-ads-history-selected-details="${escapeHtml(selectedRecord.id)}" aria-live="polite">${renderCaptureHistoryDetails(selectedRecord)}</div>`
      : '';
    captureHistoryArea.innerHTML = `${heading}<div class="google-ads-history-runs" style="--google-ads-history-columns:${historyColumns}">${runs}</div>${selectedDetails}`;
  }

  function refreshCaptureHistory(base) {
    const history = Array.isArray(base?.google_ads_api_change_history)
      ? base.google_ads_api_change_history
      : getApiCaptureHistorySnapshot();
    state.captureHistory = Array.isArray(history) ? history : [];
    const snapshots = Array.isArray(base?.google_ads_api_capture_snapshots) ? base.google_ads_api_capture_snapshots : getApiCaptureSnapshotsSnapshot();
    state.captureSnapshots = Array.isArray(snapshots) ? snapshots : [];
    const availableIds = new Set(state.captureHistory.map(record => record?.id).filter(Boolean));
    if (state.captureHistorySelectedId && !availableIds.has(state.captureHistorySelectedId)) state.captureHistorySelectedId = null;
    renderCaptureHistory();
  }

  function openCaptureHistorySnapshot(recordId) {
    const requestedId = String(recordId || '');
    const record = state.captureHistory.find(item => String(item?.id || '') === requestedId);
    if (!record) return false;
    state.captureHistorySelectedId = String(record.id);
    renderCaptureHistory();
    captureHistoryArea.querySelector('[data-google-ads-history-selected-details]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }

  document.addEventListener('google-ads-capture-history-pruned', event => {
    const history = event.detail?.history;
    if (!Array.isArray(history)) return;
    state.captureHistory = history;
    const availableIds = new Set(history.map(record => record?.id).filter(Boolean));
    if (state.captureHistorySelectedId && !availableIds.has(state.captureHistorySelectedId)) state.captureHistorySelectedId = null;
    renderCaptureHistory();
  });

  document.addEventListener('google-ads-capture-snapshots-updated', event => {
    const snapshots = event.detail?.snapshots;
    if (!Array.isArray(snapshots)) return;
    state.captureSnapshots = snapshots;
    if (Number.isInteger(Number(event.detail?.retentionLimit))) {
      state.captureSnapshotRetentionLimit = normalizeGoogleAdsCaptureSnapshotRetention(event.detail.retentionLimit);
      if (!state.captureSnapshotRetentionApplying) state.captureSnapshotRetentionDraft = String(state.captureSnapshotRetentionLimit);
    }
    renderCaptureHistory();
  });

  autoUpdateDialog.addEventListener('click', event => {
    const applyRetention = event.target.closest('[data-google-ads-retention-apply]');
    if (applyRetention) {
      const requested = Number(state.captureSnapshotRetentionDraft);
      if (!Number.isInteger(requested) || requested < 1 || requested > 100) {
        state.captureSnapshotRetentionMessage = 'Informe um número inteiro entre 1 e 100.';
        renderCaptureHistory();
        return;
      }
      void (async () => {
        const next = normalizeGoogleAdsCaptureSnapshotRetention(requested), previous = state.captureSnapshotRetentionLimit;
        state.captureSnapshotRetentionApplying = true;
        state.captureSnapshotRetentionMessage = 'Aplicando retenção e ajustando a base local…';
        renderCaptureHistory();
        try {
          if (typeof onCaptureSnapshotRetentionChange !== 'function') throw new Error('O ajuste da retenção real não está disponível nesta tela.');
          if (!writeGoogleAdsCaptureSnapshotRetention(next)) throw new Error('Não foi possível salvar a preferência neste perfil do navegador.');
          const result = await onCaptureSnapshotRetentionChange(next);
          state.captureSnapshotRetentionLimit = normalizeGoogleAdsCaptureSnapshotRetention(result?.retentionLimit ?? next);
          state.captureSnapshotRetentionDraft = String(state.captureSnapshotRetentionLimit);
          state.captureSnapshots = Array.isArray(result?.snapshots) ? result.snapshots : state.captureSnapshots;
          state.captureSnapshotRetentionMessage = `Retenção aplicada: ${state.captureSnapshotRetentionLimit} snapshot(s) automáticos D0/D−1. ${result?.changed ? 'Os snapshots excedentes mais antigos foram removidos da base local.' : 'A base já estava dentro desse limite.'}`;
        } catch (error) {
          state.captureSnapshotRetentionLimit = previous;
          state.captureSnapshotRetentionDraft = String(previous);
          writeGoogleAdsCaptureSnapshotRetention(previous);
          state.captureSnapshotRetentionMessage = `Não foi possível aplicar a retenção; a configuração anterior foi mantida. ${error?.message || ''}`;
        } finally {
          state.captureSnapshotRetentionApplying = false;
          renderCaptureHistory();
        }
      })();
    }
  });

  captureHistoryArea.addEventListener('click', event => {
    const select = event.target.closest('[data-google-ads-history-select]');
    if (select) {
      const recordId = select.dataset.googleAdsHistorySelect;
      state.captureHistorySelectedId = state.captureHistorySelectedId === recordId ? null : recordId;
      renderCaptureHistory();
      return;
    }
    const more = event.target.closest('[data-google-ads-history-more]');
    if (!more) return;
    const recordId = more.dataset.googleAdsHistoryMore;
    state.captureHistoryPageLimits.set(recordId, (state.captureHistoryPageLimits.get(recordId) || 20) + 20);
    const record = state.captureHistory.find(item => item.id === recordId);
    if (record && state.captureHistorySelectedId === recordId) renderCaptureHistory();
  });

  captureHistoryArea.addEventListener('change', event => {
    const historyLimitInput = event.target.closest('#googleAdsCaptureHistoryDisplayLimit');
    if (historyLimitInput) {
      if (!historyLimitInput.value.trim()) {
        historyLimitInput.value = String(state.captureHistoryDisplayLimit);
        return;
      }
      const requested = Number(historyLimitInput.value);
      if (!Number.isInteger(requested)) {
        historyLimitInput.value = String(state.captureHistoryDisplayLimit);
        return;
      }
      const next = normalizeGoogleAdsCaptureHistoryDisplayLimit(requested);
      if (!writeGoogleAdsCaptureHistoryDisplayLimit(next)) {
        historyLimitInput.value = String(state.captureHistoryDisplayLimit);
        return;
      }
      state.captureHistoryDisplayLimit = next;
      renderCaptureHistory();
      return;
    }
  });

  function updateCaptureSnapshotRetentionDraft(event) {
    const input = event.target.closest('#googleAdsCaptureSnapshotRetention');
    if (!input) return;
    state.captureSnapshotRetentionDraft = input.value;
    const requested = Number(input.value), valid = Number.isInteger(requested) && requested >= 1 && requested <= 100;
    const applyButton = captureSnapshotRetentionArea?.querySelector('[data-google-ads-retention-apply]');
    if (applyButton) applyButton.disabled = state.captureSnapshotRetentionApplying || !valid || requested === state.captureSnapshotRetentionLimit;
  }

  autoUpdateDialog.addEventListener('input', updateCaptureSnapshotRetentionDraft);
  autoUpdateDialog.addEventListener('change', updateCaptureSnapshotRetentionDraft);

  async function loadAccounts() {
    if (!state.tokenReady) {
      setMessage('Configure primeiro o token compartilhado em Configurações globais.', true);
      return false;
    }
    const previousAccounts = state.accounts;
    state.accountsPending = true;
    clearReports();
    syncButtonAvailability();
    accountsButton.textContent = 'Atualizando lista…';
    setMessage('Consultando as MCCs autorizadas no Google Ads…');
    renderReport();
    try {
      const refreshed = await refreshGoogleAdsAccountsDirectory();
      state.accounts = refreshed.accounts;
      state.accountsCacheAt = refreshed.savedAtUtc;
      state.accountsCachePersisted = refreshed.persisted;
      updateManagerOptions();
      if (state.accounts.warningCount) setMessage(`Lista atualizada com ${state.accounts.warningCount} aviso(s); algumas contas não responderam.${state.accountsCachePersisted ? ' A lista acessível ficou guardada neste perfil.' : ' O armazenamento local falhou; a lista fica disponível nesta sessão.'}`, false);
      else if (state.accounts.accounts.length) setMessage(`${state.accounts.accounts.length} conta(s) acessível(is) atualizada(s) e ${state.accountsCachePersisted ? 'guardada(s) neste perfil' : 'mantida(s) nesta sessão'}.`, false);
      else setMessage('Nenhuma conta de anúncios foi encontrada nas MCCs acessíveis.', true);
      renderReport();
      return true;
    } catch (error) {
      state.accounts = previousAccounts;
      clearReports();
      updateManagerOptions();
      renderReport();
      setMessage(previousAccounts
        ? `A atualização da lista falhou; mantive as ${previousAccounts.accounts.length} conta(s) já guardadas. ${error.message || ''}`
        : error.message || 'Não foi possível carregar as contas.', true);
      return false;
    } finally {
      state.accountsPending = false;
      syncButtonAvailability();
      accountsButton.textContent = 'Atualizar lista de MCCs e contas';
      updateAccountOptions();
    }
  }

  async function runReport() {
    if (!state.tokenReady) {
      setMessage('Configure primeiro o token compartilhado em Configurações globais.', true);
      return;
    }
    const accounts = selectedAccounts();
    if (!state.accounts || !accounts.length) {
      setMessage('Atualize a lista de MCCs e selecione pelo menos uma conta Google Ads.', true);
      return;
    }
    const dateRange = validateGoogleAdsDateRange(dateFromInput.value, dateToInput.value);
    if (!dateRange.valid) {
      setMessage(dateRange.reason === 'date_range_too_large' ? 'O período máximo por consulta é de 366 dias.' : 'Confira as datas: o início deve ser anterior ou igual ao fim.', true);
      return;
    }
    const dateFrom = dateFromInput.value;
    const dateTo = dateToInput.value;
    state.pendingClosure = null;
    state.closeoutSavedAt = '';
    state.reportPending = true;
    state.report = [];
    state.reportFailures = [];
    state.reportPageLimits.clear();
    state.dailyMode = null;
    syncButtonAvailability();
    accountsButton.textContent = 'Aguarde a consulta…';
    reportButton.textContent = 'Consultando…';
    state.dailyReport = null;
    renderReport();
    setMessage(`Consultando ${accounts.length} conta(s) em sequência, em modo somente leitura…`);
    try {
      for (const [index, account] of accounts.entries()) {
        try {
          const payload = await fetchGoogleAdsReport({
            managerCustomerId: account.managerCustomerId,
            customerId: account.customerId,
            dateFrom,
            dateTo,
          });
          state.report.push({
            ...normalizeGoogleAdsReport({
              ...payload,
              currency_code: payload.currency_code || account.currencyCode,
              time_zone: payload.time_zone || account.timeZone,
            }),
            accountName: account.name,
          });
        } catch (error) {
          state.reportFailures.push({ accountName: account.name, message: error.message || 'Falha ao consultar esta conta.' });
        }
        setMessage(`Consulta agregada: ${index + 1} de ${accounts.length} conta(s) processada(s)…`);
      }
      const succeeded = state.report.length;
      const failed = state.reportFailures.length;
      if (!succeeded) setMessage(`Nenhuma das ${accounts.length} conta(s) pôde ser consultada. Confira os erros listados.`, true);
      else if (failed) setMessage(`Consulta concluída parcialmente: ${succeeded} de ${accounts.length} conta(s) carregada(s); ${failed} falhou. Cada resultado permanece separado por conta e moeda.`);
      else setMessage(`Consulta concluída para ${succeeded} conta(s). Os resultados permanecem separados por conta e moeda, somente nesta tela.`);
    } finally {
      state.reportPending = false;
      syncButtonAvailability();
      accountsButton.textContent = 'Atualizar lista de MCCs e contas';
      reportButton.textContent = 'Consultar desempenho';
      renderReport();
    }
  }

  async function runSearchTermsReport() {
    if (!state.tokenReady) {
      setMessage('Configure primeiro o token compartilhado em Configurações globais.', true);
      return;
    }
    const accounts = selectedAccounts();
    if (!state.accounts || !accounts.length) {
      setMessage('Atualize a lista de MCCs e selecione pelo menos uma conta Google Ads.', true);
      return;
    }
    const dateFrom = dateFromInput.value;
    const dateTo = dateToInput.value;
    const range = validateGoogleAdsSearchTermsDateRange(dateFrom, dateTo);
    if (!range.valid) {
      setMessage(range.reason === 'search_terms_date_range_too_large'
        ? 'A consulta de termos de pesquisa permite no máximo 31 dias. Reduza o período selecionado.'
        : 'Confira as datas: o início deve ser anterior ou igual ao fim.', true);
      return;
    }

    state.searchTermsReports = [];
    state.searchTermsFailures = [];
    state.searchTermsPending = true;
    state.searchTermsProgress = `Preparando consulta para ${accounts.length} conta(s)…`;
    state.searchTermsTotalAccounts = accounts.length;
    state.searchTermsDateFrom = dateFrom;
    state.searchTermsDateTo = dateTo;
    state.searchTermsVisibleCount = GOOGLE_ADS_SEARCH_TERMS_PAGE_SIZE;
    searchTermsArea.hidden = false;
    syncButtonAvailability();
    renderSearchTermsResults();
    setMessage(`Consultando termos de pesquisa em ${accounts.length} conta(s), em sequência e somente para campanhas Search…`);
    try {
      const result = await queryGoogleAdsSearchTerms({
        accounts,
        managers: state.accounts?.managers || [],
        dateFrom,
        dateTo,
        onProgress: ({ phase, account, index, total, ok, report, failure }) => {
          state.searchTermsProgress = phase === 'started'
            ? `Consultando ${account.name} · ${index + 1} de ${total}…`
            : `${index + 1} de ${total} conta(s) processada(s)${ok ? '' : ' · houve falha'}…`;
          if (phase === 'completed') {
            if (ok) state.searchTermsReports.push(report);
            else state.searchTermsFailures.push(failure);
          }
          renderSearchTermsResults();
        },
      });
      state.searchTermsReports = result.reports;
      state.searchTermsFailures = result.failures;
      const succeeded = state.searchTermsReports.length;
      const failed = state.searchTermsFailures.length;
      if (!succeeded) setMessage(`Nenhuma das ${accounts.length} conta(s) retornou uma consulta completa. Confira os erros exibidos.`, true);
      else if (failed) setMessage(`Consulta parcial: ${succeeded} de ${accounts.length} conta(s) retornaram dados completos; ${failed} falhou. Nenhum resultado foi gravado.`);
      else setMessage(`Consulta concluída para ${succeeded} conta(s). Os termos aparecem somente nesta tela; nada foi gravado.`);
    } finally {
      state.searchTermsPending = false;
      state.searchTermsProgress = '';
      syncButtonAvailability();
      renderSearchTermsResults();
    }
  }

  async function runDailyReport() {
    if (!state.tokenReady) {
      setMessage('Configure primeiro o token compartilhado em Configurações globais.', true);
      return;
    }
    const accounts = selectedAccounts();
    if (!state.accounts || !accounts.length) {
      setMessage('Atualize a lista de MCCs e selecione pelo menos uma conta Google Ads.', true);
      return;
    }
    const dateRange = validateGoogleAdsDailyDateRange(dateFromInput.value, dateToInput.value);
    if (!dateRange.valid) {
      setMessage(dateRange.reason === 'daily_date_range_too_large' ? 'A prévia diária aceita no máximo 14 dias. Reduza o período.' : 'Confira as datas: o início deve ser anterior ou igual ao fim.', true);
      return;
    }
    const dateFrom = dateFromInput.value;
    const dateTo = dateToInput.value;
    state.pendingClosure = null;
    state.closeoutSavedAt = '';
    const accountWithOpenDay = accounts.find(account => dateTo >= todayInTimeZone(account.timeZone));
    if (accountWithOpenDay) {
      setMessage(`Para comparar com o manifesto, use dias fechados em todas as contas selecionadas. “${accountWithOpenDay.name}” ainda está no dia ${todayInTimeZone(accountWithOpenDay.timeZone)}; ajuste “Até” para D−1 ou antes.`, true);
      return;
    }
    let comparisonSnapshot = null;
    let comparisonSnapshotError = '';
    try {
      comparisonSnapshot = typeof getComparisonSnapshot === 'function' ? getComparisonSnapshot() : null;
    } catch (error) {
      comparisonSnapshotError = error.message || 'Os dados MCC não puderam ser lidos.';
    }
    state.reportPending = true;
    state.report = null;
    state.reportFailures = [];
    state.dailyReport = [];
    state.dailyFailures = [];
    state.dailyComparison = null;
    state.captureDiff = null;
    state.dailyMode = null;
    state.reportPageLimits.clear();
    syncButtonAvailability();
    accountsButton.textContent = 'Aguarde a consulta…';
    dailyReportButton.textContent = 'Consultando série diária…';
    renderReport();
    setMessage(`Consultando até 14 dias em sequência para ${accounts.length} conta(s), campanha e data. A prévia não grava dados no Hub…`);
    try {
      for (const [index, account] of accounts.entries()) {
        try {
          const payload = await fetchGoogleAdsDailyReport({
            managerCustomerId: account.managerCustomerId,
            customerId: account.customerId,
            dateFrom,
            dateTo,
          });
          state.dailyReport.push({
            ...normalizeGoogleAdsDailyReport({
              ...payload,
              currency_code: payload.currency_code || account.currencyCode,
              time_zone: payload.time_zone || account.timeZone,
            }),
            accountName: account.name,
            managerCustomerId: account.managerCustomerId,
          });
          if (comparisonSnapshotError) {
            state.dailyComparison = { available: false, accounts: [], errorMessage: comparisonSnapshotError };
          } else {
            try {
              state.dailyComparison = compareGoogleAdsDailyReports(state.dailyReport, comparisonSnapshot, { dateFrom, dateTo });
            } catch (error) {
              state.dailyComparison = { available: false, accounts: [], errorMessage: error.message || 'Erro ao processar os dados do manifesto.' };
            }
          }
        } catch (error) {
          state.dailyFailures.push({ accountName: account.name, message: error.message || 'Falha ao consultar esta conta.' });
        }
        const rowsLoaded = state.dailyReport.reduce((total, report) => total + report.rows.length, 0);
        setMessage(`Prévia diária: ${index + 1} de ${accounts.length} conta(s) processada(s), ${rowsLoaded.toLocaleString('pt-BR')} linha(s) carregada(s)…`);
      }
      const succeeded = state.dailyReport.length;
      const failed = state.dailyFailures.length;
      const rowsLoaded = state.dailyReport.reduce((total, report) => total + report.rows.length, 0);
      if (!succeeded) setMessage(`Nenhuma das ${accounts.length} conta(s) pôde ser consultada. Confira os erros listados.`, true);
      else if (failed) setMessage(`Prévia diária parcial: ${succeeded} de ${accounts.length} conta(s) carregada(s), ${failed} falhou; ${rowsLoaded.toLocaleString('pt-BR')} linha(s) nas contas concluídas. Os dados ficam somente nesta tela.`);
      else setMessage(`Prévia diária concluída para ${succeeded} conta(s): ${rowsLoaded.toLocaleString('pt-BR')} linha(s). Cada resultado fica separado por conta e moeda, somente nesta tela.`);
    } finally {
      state.reportPending = false;
      syncButtonAvailability();
      accountsButton.textContent = 'Atualizar lista de MCCs e contas';
      dailyReportButton.textContent = 'Prévia diária para comparar';
      renderReport();
    }
  }

  async function runCurrentDayFeed({ previewOnly = false, accountsOverride = null, closeoutMode = false, activeCampaignsOnly = false } = {}) {
    if (!state.tokenReady) {
      setMessage('Configure primeiro o token compartilhado em Configurações globais.', true);
      return;
    }
    const accounts = Array.isArray(accountsOverride) ? accountsOverride : selectedAccounts();
    if ((!state.accounts && !Array.isArray(accountsOverride)) || !accounts.length) {
      setMessage('Atualize a lista de MCCs e selecione pelo menos uma conta Google Ads.', true);
      return;
    }
    if (typeof (previewOnly ? onPreviewDailyCaptures : onSaveDailyCaptures) !== 'function') {
      setMessage('A gravação local da captura paralela não está disponível nesta tela.', true);
      return;
    }

    const reports = [];
    const failures = [];
    const activeOnlyQuery = closeoutMode && activeCampaignsOnly;
    const queryDates = {}, queryStartDates = {};
    state.closeoutQueryMode = activeOnlyQuery ? 'active' : 'all';
    state.pendingClosure = null;
    state.closeoutSavedAt = '';
    state.reportPending = true;
    state.report = null;
    state.reportFailures = [];
    state.dailyReport = [];
    state.dailyFailures = failures;
    state.dailyComparison = null;
    state.captureDiff = null;
    state.d0Comparison = null;
    state.pendingD0Capture = null;
    state.d0ComparisonPageLimit = GOOGLE_ADS_INITIAL_RENDER_ROWS;
    d0ComparisonArea.hidden = true;
    d0ComparisonArea.innerHTML = '';
    state.dailyMode = previewOnly ? 'normalized-loading' : 'feed-preview';
    state.reportPageLimits.clear();
    syncButtonAvailability();
    accountsButton.textContent = 'Aguarde a consulta…';
    if (previewOnly) normalizedPreviewButton.textContent = 'Conferindo os dados…';
    else if (Array.isArray(accountsOverride)) feedAllAccountsButton.textContent = 'Consultando todas as contas…';
    else feedTodayButton.textContent = 'Consultando e salvando…';
    renderReport();
    const captureWindowDays = closeoutMode ? 'yesterday' : state.captureWindowDays;
    const captureWindowText = captureWindowLabel(captureWindowDays);
    const businessDayCapture = String(captureWindowDays) === 'yesterday';
    const businessDayPreview = previewOnly && businessDayCapture;
    const businessDate = businessDayCapture
      ? previousDate(strictTodayInTimeZone('America/Sao_Paulo'))
      : null;
    const selectedManager = state.accounts?.managers.find(item => managerKey(item) === state.selectedManagerKey);
    const mccScope = !Array.isArray(accountsOverride) && selectedManager?.customerId
      ? ` da MCC ${selectedManager.name} (${selectedManager.customerId})`
      : Array.isArray(accountsOverride) ? ' de todas as MCCs conectadas' : '';
    const periodText = businessDayCapture
      ? `o dia civil de ontem em São Paulo (${businessDate}, 00:00–23:59)`
      : `${captureWindowText.toLowerCase()} no fuso de cada conta`;
    setMessage(`Consultando ${periodText} para ${accounts.length} conta(s)${mccScope}. Datas fora do período escolhido e o Diário MCC gravado não serão alterados…`);
    const diagnosticOperation = closeoutMode
      ? `Fechamento D−1 · ${activeOnlyQuery ? 'somente ENABLED' : 'todas as campanhas'}`
      : `${previewOnly ? 'Prévia normalizada' : 'Captura API'} · ${captureWindowText}`;
    startQueryDiagnostics(diagnosticOperation, accounts);
    setQueryDiagnosticStage('Consultando métricas e inventário via API');
    await yieldToBrowser();
    let diagnosticStatus = 'complete';
    let finalUrlCacheNote = '';

    try {
      for (const [index, account] of accounts.entries()) {
        const accountStartedAt = startQueryDiagnosticAccount(index);
        let apiMs = null;
        let validationMs = null;
        let accountError = '';
        let validationStartedAt = null;
        try {
          const date = strictTodayInTimeZone(account.timeZone);
          const queryDate = businessDayCapture ? businessDate : captureWindowDays === 'yesterday' ? previousDate(date) : date;
          const range = businessDayCapture
            ? { dateFrom: businessDate, dateTo: businessDate }
            : getApiCaptureDateRange?.(queryDate, captureWindowDays === 'yesterday' ? 1 : Number(captureWindowDays));
          if (!range || range.dateTo !== queryDate || !/^\d{4}-\d{2}-\d{2}$/.test(range.dateFrom) || range.dateFrom > queryDate) throw new Error('A janela segura de captura da API não está disponível nesta versão do Hub.');
          queryDates[account.customerId] = date;
          queryStartDates[account.customerId] = range.dateFrom;
          const apiStartedAt = performance.now();
          updateQueryDiagnosticAccount(index, { phase: 'API', apiStartedAt });
          const [payload, configPayload] = await Promise.all([
            businessDayCapture
              ? fetchGoogleAdsSaoPauloDayReport({ managerCustomerId: account.managerCustomerId, customerId: account.customerId, businessDate, campaignStatusFilter: activeOnlyQuery ? 'ENABLED' : 'ALL' })
              : fetchGoogleAdsDailyReport({ managerCustomerId: account.managerCustomerId, customerId: account.customerId, dateFrom: range.dateFrom, dateTo: queryDate }),
            fetchGoogleAdsConfiguration(account),
          ]).finally(() => {
            apiMs = performance.now() - apiStartedAt;
            updateQueryDiagnosticAccount(index, { apiMs });
          });
          validationStartedAt = performance.now();
          updateQueryDiagnosticAccount(index, { phase: 'Validação', validationStartedAt });
          const configuration = normalizeGoogleAdsConfiguration(configPayload);
          const report = normalizeGoogleAdsDailyReport({
            ...payload,
            currency_code: payload.currency_code || account.currencyCode,
            time_zone: payload.time_zone || account.timeZone,
          });
          if (report.dateFrom !== range.dateFrom || report.dateTo !== queryDate) {
            throw new Error(`O servidor não retornou exatamente a janela selecionada da conta (${range.dateFrom} a ${queryDate}).`);
          }
          if (report.timeZone !== account.timeZone) {
            throw new Error('O fuso horário devolvido pela API diverge do cadastro da conta; nada desta rodada será gravado.');
          }
          if (!report.queryComplete) throw new Error('O serviço PHP precisa ser atualizado para confirmar a cobertura completa da consulta diária.');
          if (businessDayCapture && (report.businessTimeZone !== 'America/Sao_Paulo'
              || report.businessDate !== businessDate
              || report.dateFrom !== businessDate || report.dateTo !== businessDate)) {
            throw new Error('O serviço não confirmou a cobertura completa de ontem no fuso de São Paulo; nenhum dado foi gravado.');
          }
          if (activeOnlyQuery) {
            if (report.campaignStatusFilter !== 'ENABLED') throw new Error('O serviço privado ainda não confirma o filtro de campanhas ENABLED. Publique o PHP privado atualizado antes de usar esta opção.');
            const enabledIds = new Set(configuration.campaigns.filter(item => item.campaignStatus === 'ENABLED').map(item => item.campaignId));
            if (report.rows.some(row => row.campaignStatus !== 'ENABLED' || !enabledIds.has(row.campaignId))) throw new Error('A lista de campanhas ativas mudou entre a consulta de métricas e a consulta de configuração. Gere uma nova prévia; nenhum dado foi gravado.');
          }
          reports.push({ ...report, configuration, activeCampaignsOnly: activeOnlyQuery, accountName: account.name, managerName: account.managerName, managerCustomerId: account.managerCustomerId });
        } catch (error) {
          accountError = error.message || 'Falha ao consultar esta conta.';
          failures.push({ accountName: account.name, message: accountError });
        } finally {
          if (validationStartedAt != null) validationMs = performance.now() - validationStartedAt;
          updateQueryDiagnosticAccount(index, {
            status: accountError ? 'failed' : 'complete',
            phase: accountError ? 'Falhou' : 'Concluída',
            apiMs,
            validationMs,
            totalMs: performance.now() - accountStartedAt,
            error: accountError,
          });
        }
        state.dailyReport = reports;
        updateQueryDiagnosticProgress(`conta ${index + 1}/${accounts.length} · ${account.name}`);
        setMessage(`Janela recente: ${index + 1} de ${accounts.length} conta(s) consultada(s); ${reports.reduce((total, report) => total + report.rows.length, 0).toLocaleString('pt-BR')} linha(s) recebida(s)…`);
      }

      if (!previewOnly) {
        setQueryDiagnosticStage('Atualizando cache local dos destinos finais');
        await yieldToBrowser();
        try {
          const cacheResult = await syncGoogleAdsFinalUrlHostCache(accounts);
          if (cacheResult.failures.length) finalUrlCacheNote = ` O cache de destinos finais falhou para ${cacheResult.failures.length} conta(s); as métricas continuam sendo processadas. ${cacheResult.failures.slice(0, 2).join(' · ')}`;
          else if (cacheResult.refreshedAccounts.length) finalUrlCacheNote = ` Destinos finais atualizados para ${cacheResult.refreshedAccounts.length} conta(s); o cache fica válido por 24 horas.`;
        } catch (error) {
          finalUrlCacheNote = ` O cache de destinos finais não foi atualizado; as métricas continuam sendo processadas. ${String(error?.message || '').slice(0, 220)}`;
        }
      }
      if (failures.length) {
        diagnosticStatus = 'partial';
        state.dailyMode = previewOnly ? 'preview-failed' : 'feed-preview';
        setMessage(`A rodada não foi gravada: ${failures.length} conta(s) falharam. Corrija e repita para salvar o lote completo; nenhuma captura parcial foi aplicada.${finalUrlCacheNote}`, true);
        return;
      }

      setQueryDiagnosticStage('Confirmando datas locais e cobertura da consulta');
      await yieldToBrowser();
      for (const account of accounts) {
        if (strictTodayInTimeZone(account.timeZone) !== queryDates[account.customerId]) {
          throw new Error(`O dia mudou durante a consulta da conta ${account.name}. Rode novamente para gravar o período selecionado com as datas locais consistentes.`);
        }
      }
      if (businessDayCapture && previousDate(strictTodayInTimeZone('America/Sao_Paulo')) !== businessDate) {
        throw new Error('Virou o dia em São Paulo durante a consulta. Atualize a prévia ou repita a captura para consultar o ontem correto; nenhum dado foi gravado.');
      }

      setQueryDiagnosticStage(previewOnly ? 'Calculando prévia local' : 'Gravando captura local');
      await yieldToBrowser();
      const localCaptureStartedAt = performance.now();
      const saved = await (previewOnly ? onPreviewDailyCaptures : onSaveDailyCaptures)(reports, queryDates, queryStartDates, { businessDayPreview, businessDayCapture, activeCampaignsOnly: activeOnlyQuery });
      if (!previewOnly) { refreshCaptureHistory(saved.base); recordCaptureStorageTimings(saved.timings); }
      recordQueryDiagnosticMeasurement(previewOnly ? 'Prévia local da captura' : 'Gravação local da captura', performance.now() - localCaptureStartedAt);
      state.dailyMode = previewOnly ? 'normalized-preview' : 'feed';
      if (previewOnly) {
        const diffStartedAt = performance.now();
        setQueryDiagnosticStage('Comparando com a captura anterior');
        await yieldToBrowser();
        state.captureDiff = buildGoogleAdsCaptureDiff(saved, reports, { activeCampaignsOnly: activeOnlyQuery });
        recordQueryDiagnosticMeasurement('Comparação com a captura anterior', performance.now() - diffStartedAt);
      } else {
        state.captureDiff = null;
      }
      if (previewOnly && closeoutMode) {
        state.pendingClosure = {
          date: businessDate,
          reports,
          queryDates: { ...queryDates },
          queryStartDates: { ...queryStartDates },
          preparedAtUtc: new Date().toISOString(),
          activeCampaignsOnly: activeOnlyQuery,
        };
        state.closeoutDate = businessDate;
      }
      const projectionStartedAt = performance.now();
      setQueryDiagnosticStage('Preparando resultados para a tela');
      await yieldToBrowser();
      state.dailyReport = reports.map(report => {
        const captures = saved.base.google_ads_api_daily_captures.filter(item => item.customerId === report.customerId && item.managerCustomerId === report.managerCustomerId && item.date >= report.dateFrom && item.date <= report.dateTo).sort((a, b) => a.date.localeCompare(b.date));
        const todayCapture = captures.find(item => item.date === report.dateTo);
        return { ...report, rows: captures.flatMap(item => item.rows || []), configuration: todayCapture?.configuration || null, billingPreview: (saved.billingCandidates || []).filter(sale => sale.account.replace(/\D/g, '') === report.customerId) };
      });
      recordQueryDiagnosticMeasurement('Preparação local dos resultados', performance.now() - projectionStartedAt);
      const rowsLoaded = reports.reduce((total, report) => total + report.rows.length, 0);
      const emptyAccounts = reports.filter(report => report.rows.length === 0).length;
      const batch = saved?.projection?.batch || { rows:rowsLoaded, mappedRows:0, unmappedRows:rowsLoaded, ambiguousRows:0 };
      const mappingNote = batch.unmappedRows || batch.ambiguousRows ? ` ${batch.unmappedRows + batch.ambiguousRows} linha(s) ficaram fora da projeção por falta ou ambiguidade de vínculo; elas continuam usando o dado MCC.` : '';
      const sourceNote = state.operationalSourceMode === 'api' ? 'As linhas pareadas entram nas leituras operacionais deste perfil.' : 'A fonte operacional deste perfil continua sendo o manifesto MCC; a API só foi armazenada.';
      const directoryWarningNote = Array.isArray(accountsOverride) && state.accounts?.warningCount ? ` A lista de acesso tinha ${state.accounts.warningCount} aviso(s); confirme se as MCCs e contas esperadas aparecem no diretório.` : '';
      const incompleteConfigurations = reports.reduce((total, report) => total + report.configuration.campaigns.filter(row => googleAdsConfigurationIssues(row).length).length, 0);
      setMessage(previewOnly
        ? `Prévia normalizada concluída para ${reports.length} conta(s)${mccScope}: ${batch.mappedRows} linha(s) com vínculo seguro. ${activeOnlyQuery ? 'Somente campanhas ENABLED no momento da consulta; linhas ausentes viraram zero apenas após confirmar consulta e inventário completos. Dados anteriores das demais campanhas são preservados.' : businessDayPreview ? `As métricas cobrem o dia civil de ontem em São Paulo (${businessDate}, até 23:59); status e demais configurações são a fotografia atual.` : 'Veja abaixo as diferenças que a API projetaria.'}${incompleteConfigurations ? ` ${incompleteConfigurations} campanha(s) têm campos de configuração indisponíveis.` : ''} Nenhum dado foi gravado e a fonte operacional não foi ativada.${mappingNote}`
         : `Captura API de ${businessDayCapture ? `ontem em São Paulo (${businessDate})` : captureWindowText.toLowerCase()} salva para ${reports.length} conta(s), ${saved.savedCaptures} conta/data: ${rowsLoaded.toLocaleString('pt-BR')} linha(s) recebida(s), ${batch.mappedRows} pareada(s), incluindo zeros sustentados por consulta completa e vínculo anterior. ${sourceNote}${mappingNote} ${emptyAccounts ? `${emptyAccounts} conta(s) não retornaram linhas de métricas; ausência sem vínculo prévio não foi convertida em zero.` : ''} Datas fora do período escolhido e o Diário MCC permanecem intactos.${directoryWarningNote}${finalUrlCacheNote}`);
    } catch (error) {
      diagnosticStatus = 'failed';
      state.dailyReport = reports;
      state.dailyMode = 'feed-preview';
      setMessage(error.message || 'Não foi possível gravar a captura paralela da API.', true);
    } finally {
      state.reportPending = false;
      state.closeoutRunning = false;
      syncButtonAvailability();
      accountsButton.textContent = 'Atualizar lista de MCCs e contas';
      renderAccountDirectory();
      updateCloseoutDateLabel();
      updateCaptureWindowLabels();
      setQueryDiagnosticStage('Renderizando resultados da consulta');
      await yieldToBrowser();
      const renderStartedAt = performance.now();
      renderReport();
      recordQueryDiagnosticMeasurement('Renderização final dos resultados', performance.now() - renderStartedAt);
      finishQueryDiagnostics(diagnosticStatus);
    }
  }

  function currentD0ComparisonReports(reports, proposedBase, activeCampaignsOnly) {
    return reports.map(report => {
      const capture = proposedBase?.google_ads_api_daily_captures?.find(item =>
        item.customerId === report.customerId
        && (item.managerCustomerId || null) === (report.managerCustomerId || null)
        && item.date === report.dateTo);
      const configurationById = new Map((report.configuration?.campaigns || []).map(item => [item.campaignId, item]));
      let rows = (capture?.rows || report.rows).map(row => {
        const configured = configurationById.get(String(row.campaignId));
        return configured ? { ...row, campaignName: configured.campaignName || row.campaignName, campaignStatus: configured.campaignStatus || row.campaignStatus } : row;
      });
      let activeCampaignIds;
      if (activeCampaignsOnly) {
        const active = (report.configuration?.campaigns || []).filter(item => item.campaignStatus === 'ENABLED');
        activeCampaignIds = active.map(item => item.campaignId);
        const byId = new Map(rows.map(row => [String(row.campaignId), row]));
        for (const item of active) {
          if (byId.has(item.campaignId)) continue;
          byId.set(item.campaignId, {
            date: report.dateTo,
            campaignId: item.campaignId,
            campaignName: item.campaignName,
            campaignStatus: 'ENABLED',
            impressions: 0,
            clicks: 0,
            costMicros: 0,
            conversions: 0,
            conversionsValue: 0,
            inferredZero: true,
          });
        }
        rows = [...byId.values()].filter(row => activeCampaignIds.includes(String(row.campaignId)));
      }
      return {
        ...report,
        rows,
        ...(activeCampaignsOnly ? { activeCampaignIds } : {}),
      };
    });
  }

  async function previewCurrentD0({ activeCampaignsOnly = false } = {}) {
    if (!state.tokenReady) {
      setMessage('Configure primeiro o token compartilhado em Configurações globais.', true);
      return;
    }
    const accounts = state.accounts?.accounts || [];
    if (!accounts.length) {
      setMessage('Atualize primeiro a lista de MCCs e contas conectadas para comparar D0.', true);
      return;
    }

    let savedCaptures;
    try {
      savedCaptures = typeof getApiCapturesSnapshot === 'function' ? [...getApiCapturesSnapshot()] : [];
      if (!Array.isArray(savedCaptures)) throw new Error('A fotografia local das capturas API está indisponível.');
    } catch (error) {
      setMessage(error.message || 'Não foi possível ler as capturas API anteriores.', true);
      return;
    }
    if (typeof onPreviewDailyCaptures !== 'function' || typeof onSaveDailyCaptures !== 'function') {
      setMessage('A prévia e a gravação local das capturas API não estão disponíveis nesta tela.', true);
      return;
    }

    let reports = [];
    let failures = [];
    const reportResults = new Array(accounts.length);
    const failureResults = new Array(accounts.length);
    const queryDates = {}, queryStartDates = {};
    state.pendingD0Capture = null;
    state.d0QueryMode = activeCampaignsOnly ? 'active' : 'all';
    state.reportPending = true;
    state.d0ComparisonPageLimit = GOOGLE_ADS_INITIAL_RENDER_ROWS;
    state.d0Comparison = { pending: true, activeCampaignsOnly, progress: { completed: 0, total: accounts.length }, accounts: [], failures: [] };
    syncButtonAvailability();
    renderD0Comparison();
    setMessage(`Consultando e preparando a prévia D0 ${activeCampaignsOnly ? 'somente para campanhas ENABLED' : 'de todas as campanhas'} em ${accounts.length} conta(s). Nada será gravado até você clicar em Atualizar base…`);
    startQueryDiagnostics(`Prévia D0 · ${activeCampaignsOnly ? 'somente ENABLED' : 'todas as campanhas'}`, accounts);
    setQueryDiagnosticStage(`Consultando API e inventário · até ${Math.min(GOOGLE_ADS_D0_QUERY_CONCURRENCY, accounts.length)} contas simultâneas`);
    await yieldToBrowser();
    let diagnosticStatus = 'complete';

    try {
      let nextAccountIndex = 0;
      let completed = 0;
      const queryAccount = async () => {
        while (nextAccountIndex < accounts.length) {
          const index = nextAccountIndex++;
          const account = accounts[index];
          const accountStartedAt = startQueryDiagnosticAccount(index);
          let apiMs = null;
          let validationMs = null;
          let accountError = '';
          let validationStartedAt = null;
          try {
            const date = strictTodayInTimeZone(account.timeZone);
            queryDates[account.customerId] = date;
            queryStartDates[account.customerId] = date;
            const apiStartedAt = performance.now();
            updateQueryDiagnosticAccount(index, { phase: 'API', apiStartedAt });
            const [payload, configPayload] = await Promise.all([
              fetchGoogleAdsDailyReport({
                managerCustomerId: account.managerCustomerId,
                customerId: account.customerId,
                dateFrom: date,
                dateTo: date,
              }),
              fetchGoogleAdsConfiguration(account),
            ]).finally(() => {
              apiMs = performance.now() - apiStartedAt;
              updateQueryDiagnosticAccount(index, { apiMs });
            });
            validationStartedAt = performance.now();
            updateQueryDiagnosticAccount(index, { phase: 'Validação', validationStartedAt });
            const report = normalizeGoogleAdsDailyReport({
              ...payload,
              currency_code: payload.currency_code || account.currencyCode,
              time_zone: payload.time_zone || account.timeZone,
            });
            const configuration = normalizeGoogleAdsConfiguration(configPayload);
            if (report.dateFrom !== date || report.dateTo !== date) {
              throw new Error(`A API não retornou exatamente o D0 local (${date}).`);
            }
            if (report.timeZone !== account.timeZone) {
              throw new Error('O fuso horário retornado pela API diverge do diretório conectado.');
            }
            if (!report.queryComplete) throw new Error('A API não confirmou que a consulta diária terminou completamente.');
            if (report.campaignStatusFilter === 'ENABLED') throw new Error('A API retornou somente campanhas ativas; uma comparação completa de D0 exige todas as campanhas.');
            if (configuration.complete !== true
                || configuration.customerId !== account.customerId
                || (configuration.managerCustomerId || null) !== (account.managerCustomerId || null)
                || configuration.currencyCode !== report.currencyCode
                || configuration.currencyCode !== account.currencyCode
                || configuration.timeZone !== report.timeZone
                || configuration.timeZone !== account.timeZone) {
              throw new Error('O inventário de campanhas não corresponde à conta, MCC, moeda e fuso consultados.');
            }
            if (activeCampaignsOnly) {
              const configuredById = new Map(configuration.campaigns.map(item => [item.campaignId, item]));
              const statusChangedDuringQuery = report.rows.some(row => row.campaignStatus
                && configuredById.has(row.campaignId)
                && row.campaignStatus !== configuredById.get(row.campaignId).campaignStatus);
              if (statusChangedDuringQuery) throw new Error('O status mudou entre a consulta de métricas e o inventário. Gere outra prévia para confirmar quais campanhas estão ENABLED.');
            }
            reportResults[index] = {
              ...report,
              customerId: account.customerId,
              configuration,
              accountName: account.name,
              managerName: account.managerName,
              managerCustomerId: account.managerCustomerId,
            };
          } catch (error) {
            accountError = error.message || 'Falha ao consultar esta conta.';
            failureResults[index] = { accountName: account.name, message: accountError };
          } finally {
            if (validationStartedAt != null) validationMs = performance.now() - validationStartedAt;
            updateQueryDiagnosticAccount(index, {
              status: accountError ? 'failed' : 'complete',
              phase: accountError ? 'Falhou' : 'Concluída',
              apiMs,
              validationMs,
              totalMs: performance.now() - accountStartedAt,
              error: accountError,
            });
          }
          completed += 1;
          updateQueryDiagnosticProgress(`${completed}/${accounts.length} conta(s) concluída(s)`);
          const completedReports = reportResults.filter(Boolean);
          const progressStartedAt = performance.now();
          state.d0Comparison = {
            pending: true,
            activeCampaignsOnly,
            progress: { completed, total: accounts.length },
            accounts: compareGoogleAdsD0Snapshots(currentD0ComparisonReports(completedReports, null, activeCampaignsOnly), savedCaptures),
            failures: failureResults.filter(Boolean),
            directoryWarningCount: state.accounts?.warningCount || 0,
          };
          renderD0Comparison();
          recordQueryDiagnosticMeasurement('Comparação progressiva e renderização', performance.now() - progressStartedAt);
          setMessage(`Prévia D0: ${completed} de ${accounts.length} conta(s) consultada(s)…`);
        }
      };
      const workerCount = Math.min(GOOGLE_ADS_D0_QUERY_CONCURRENCY, accounts.length);
      await Promise.all(Array.from({ length: workerCount }, () => queryAccount()));
      reports = reportResults.filter(Boolean);
      failures = failureResults.filter(Boolean);

      setQueryDiagnosticStage('Confirmando datas locais e cobertura completa');
      await yieldToBrowser();
      for (const account of accounts) {
        const queriedDate = queryDates[account.customerId];
        if (queriedDate && strictTodayInTimeZone(account.timeZone) !== queriedDate) {
          throw new Error(`O D0 mudou durante a consulta da conta ${account.name}. Gere outra prévia para usar datas locais consistentes.`);
        }
      }

      let proposedBase = null;
      if (reports.length) {
        setQueryDiagnosticStage('Calculando prévia local da captura');
        await yieldToBrowser();
        const localPreviewStartedAt = performance.now();
        const preview = await onPreviewDailyCaptures(reports, queryDates, queryStartDates, { skipOperationalDiff: true, skipBillingCandidates: true });
        recordQueryDiagnosticMeasurement('Prévia local da captura', performance.now() - localPreviewStartedAt);
        proposedBase = preview?.base || null;
        if (!proposedBase) throw new Error('A prévia local não retornou uma base proposta; nenhum dado foi gravado.');
      }
      const captureReady = failures.length === 0 && !state.accounts?.warningCount && reports.length === accounts.length;
      setQueryDiagnosticStage('Comparando com a última captura D0');
      await yieldToBrowser();
      const finalCompareStartedAt = performance.now();
      const finalComparisonAccounts = compareGoogleAdsD0Snapshots(currentD0ComparisonReports(reports, proposedBase, activeCampaignsOnly), savedCaptures);
      state.d0Comparison = {
        pending: false,
        activeCampaignsOnly,
        captureReady,
        completedAtUtc: new Date().toISOString(),
        accounts: finalComparisonAccounts,
        failures,
        directoryWarningCount: state.accounts?.warningCount || 0,
      };
      recordQueryDiagnosticMeasurement('Comparação final com a última captura', performance.now() - finalCompareStartedAt);
      if (captureReady) {
        state.pendingD0Capture = {
          dateByAccount: { ...queryDates },
          reports,
          queryDates: { ...queryDates },
          queryStartDates: { ...queryStartDates },
          activeCampaignsOnly,
          preparedAtUtc: new Date().toISOString(),
        };
      }
      const comparisonSummary = summarizeD0Comparison(state.d0Comparison);
      const changedCount = comparisonSummary.changedCount;
      if (failures.length) diagnosticStatus = 'partial';
      setMessage(failures.length
        ? `Prévia D0 parcial: ${reports.length} de ${accounts.length} conta(s) consultada(s); ${failures.length} falhou. O lote não pode ser gravado.`
        : state.accounts?.warningCount
          ? `Prévia D0 concluída para ${reports.length} conta(s), mas o diretório tem ${state.accounts.warningCount} aviso(s). Confira a lista antes de gravar; nenhum dado foi salvo.`
          : comparisonSummary.noDifferences
            ? 'Prévia D0 completa: nenhuma diferença encontrada nas campanhas comparáveis. Use “Registrar execução sem diferenças” para salvar a captura e congelar esse resultado no histórico.'
            : !changedCount && !comparisonSummary.comparableCampaignCount
              ? 'Prévia D0 completa, sem campanhas com referência comparável. Use “Registrar consulta” para salvar a captura e deixar esse resultado no histórico.'
              : changedCount
                ? `Prévia D0 pronta: ${changedCount} campanha(s) com diferenças comparáveis. Revise a tabela; clique em Atualizar base para salvar a consulta atual.`
                : 'Prévia D0 sem diferenças nas linhas comparáveis, mas a cobertura da referência não permite afirmar ausência global de mudanças. A gravação ficará identificada como comparação parcial.');
    } catch (error) {
      diagnosticStatus = 'failed';
      state.pendingD0Capture = null;
      state.d0Comparison = {
        pending: false,
        activeCampaignsOnly,
        completedAtUtc: new Date().toISOString(),
        accounts: compareGoogleAdsD0Snapshots(currentD0ComparisonReports(reports, null, activeCampaignsOnly), savedCaptures),
        failures,
        directoryWarningCount: state.accounts?.warningCount || 0,
        error: error.message || 'Não foi possível concluir a prévia D0.',
      };
      setMessage(error.message || 'Não foi possível concluir a prévia D0.', true);
    } finally {
      state.reportPending = false;
      syncButtonAvailability();
      setQueryDiagnosticStage('Renderizando diferenças D0');
      await yieldToBrowser();
      const renderStartedAt = performance.now();
      renderD0Comparison();
      recordQueryDiagnosticMeasurement('Renderização final da comparação D0', performance.now() - renderStartedAt);
      finishQueryDiagnostics(diagnosticStatus);
    }
  }

  async function savePendingD0Capture() {
    const pending = state.pendingD0Capture;
    if (!pending || typeof onSaveDailyCaptures !== 'function') {
      setMessage('Gere primeiro uma prévia D0 completa. Nenhuma captura foi gravada.', true);
      return;
    }
    const noDifferences = summarizeD0Comparison().noDifferences;
    for (const account of state.accounts?.accounts || []) {
      const queriedDate = pending.dateByAccount[account.customerId];
      if (!queriedDate || strictTodayInTimeZone(account.timeZone) !== queriedDate) {
        state.pendingD0Capture = null;
        state.d0Comparison = { ...state.d0Comparison, captureReady: false };
        syncButtonAvailability();
        renderD0Comparison();
        setMessage(`O dia local mudou para a conta ${account.name} desde a prévia. Gere uma nova prévia D0 antes de atualizar a base.`, true);
        return;
      }
    }
    startQueryDiagnostics(`Atualizar base D0 · ${pending.reports.length} conta(s)`, pending.reports.map(report => ({ name: report.accountName || report.customerId })));
    setQueryDiagnosticStage('Preparando atualização local');
    await yieldToBrowser();
    state.reportPending = true;
    syncButtonAvailability();
    d0SaveButton.textContent = 'Atualizando base D0…';
    const preparingRenderStartedAt = performance.now();
    renderReport();
    recordQueryDiagnosticMeasurement('Renderização antes da gravação', performance.now() - preparingRenderStartedAt);
    setQueryDiagnosticStage('Gravando captura e atualizando projeção local');
    await yieldToBrowser();
    let diagnosticStatus = 'complete';
    try {
      const saveStartedAt = performance.now();
      const result = await onSaveDailyCaptures(pending.reports, pending.queryDates, pending.queryStartDates, {});
      refreshCaptureHistory(result.base);
      recordCaptureStorageTimings(result.timings);
      recordQueryDiagnosticMeasurement('Gravação local da captura D0', performance.now() - saveStartedAt);
      let finalUrlCacheNote = '';
      try {
        const cacheResult = await syncGoogleAdsFinalUrlHostCache(pending.reports);
        if (cacheResult.failures.length) finalUrlCacheNote = ` O cache de destinos finais falhou para ${cacheResult.failures.length} conta(s); a captura D0 foi salva. ${cacheResult.failures.slice(0, 2).join(' · ')}`;
        else if (cacheResult.refreshedAccounts.length) finalUrlCacheNote = ` Destinos finais atualizados para ${cacheResult.refreshedAccounts.length} conta(s); o cache fica válido por 24 horas.`;
      } catch (error) { finalUrlCacheNote = ` O cache de destinos finais não foi atualizado; a captura D0 foi salva. ${String(error?.message || '').slice(0, 220)}`; }
      const savedAtUtc = new Date().toISOString();
      state.pendingD0Capture = null;
      state.d0Comparison = { ...state.d0Comparison, captureReady: false, savedAtUtc };
      const scopeNote = pending.activeCampaignsOnly
        ? 'A comparação mostra somente campanhas ENABLED; a captura completa preserva também as outras campanhas.'
        : 'A captura completa inclui as campanhas retornadas e os zeros confirmados pelo inventário.';
      const saveLabel = noDifferences ? 'Execução D0 registrada sem diferenças' : 'D0 salvo';
      setMessage(`${saveLabel}: ${result.savedCaptures} conta(s), ${result.savedRows} linha(s), data local de cada conta. ${scopeNote} O Diário MCC foi preservado.${finalUrlCacheNote}`);
    } catch (error) {
      diagnosticStatus = 'failed';
      setMessage(error.message || 'Não foi possível atualizar a base D0. A prévia continua disponível para tentar novamente.', true);
    } finally {
      state.reportPending = false;
      d0SaveButton.textContent = 'Atualizar base';
      syncButtonAvailability();
      setQueryDiagnosticStage('Renderizando confirmação da atualização');
      await yieldToBrowser();
      const renderStartedAt = performance.now();
      renderD0Comparison();
      renderReport();
      recordQueryDiagnosticMeasurement('Renderização final da atualização D0', performance.now() - renderStartedAt);
      finishQueryDiagnostics(diagnosticStatus);
    }
  }

  async function previewPendingD1Closure({ activeCampaignsOnly = false } = {}) {
    if (!state.accounts) {
      const loaded = await loadAccounts();
      if (!loaded) return;
    }
    if (state.accounts?.warningCount) {
      setMessage(`A lista de MCCs tem ${state.accounts.warningCount} aviso(s). Atualize e confira as contas antes de preparar um fechamento completo.`, true);
      return;
    }
    const accounts = state.accounts?.accounts || [];
    if (!accounts.length) {
      setMessage('Nenhuma conta cliente conectada foi encontrada. Atualize a lista de MCCs e contas e tente de novo.', true);
      return;
    }
    state.closeoutRunning = true;
    state.closeoutQueryMode = activeCampaignsOnly ? 'active' : 'all';
    syncButtonAvailability();
    try {
      await runCurrentDayFeed({ previewOnly: true, accountsOverride: accounts, closeoutMode: true, activeCampaignsOnly });
    } finally {
      state.closeoutRunning = false;
      syncButtonAvailability();
    }
  }

  async function savePendingD1Closure() {
    const pending = state.pendingClosure;
    if (!pending || typeof onSaveDailyCaptures !== 'function') {
      setMessage('Gere primeiro a prévia completa de D−1. Nenhuma captura foi gravada.', true);
      return;
    }
    const currentD1 = previousDate(strictTodayInTimeZone('America/Sao_Paulo'));
    if (pending.date !== currentD1) {
      state.pendingClosure = null;
      syncButtonAvailability();
      setMessage(`A prévia era de ${pending.date}, mas D−1 em São Paulo agora é ${currentD1}. Gere uma nova prévia antes de atualizar a base.`, true);
      return;
    }
    startQueryDiagnostics(`Atualizar base D−1 · ${pending.reports.length} conta(s)`, pending.reports.map(report => ({ name: report.accountName || report.customerId })));
    setQueryDiagnosticStage('Preparando atualização D−1');
    await yieldToBrowser();
    state.reportPending = true;
    syncButtonAvailability();
    closeoutSaveButton.textContent = 'Atualizando base…';
    const preparingRenderStartedAt = performance.now();
    renderReport();
    recordQueryDiagnosticMeasurement('Renderização antes da gravação', performance.now() - preparingRenderStartedAt);
    setQueryDiagnosticStage('Gravando captura e atualizando projeção local');
    await yieldToBrowser();
    let diagnosticStatus = 'complete';
    try {
      const saveStartedAt = performance.now();
      const result = await onSaveDailyCaptures(pending.reports, pending.queryDates, pending.queryStartDates, { businessDayCapture: true, activeCampaignsOnly: pending.activeCampaignsOnly === true });
      refreshCaptureHistory(result.base);
      recordCaptureStorageTimings(result.timings);
      recordQueryDiagnosticMeasurement('Gravação local da captura D−1', performance.now() - saveStartedAt);
      let finalUrlCacheNote = '';
      try {
        const cacheResult = await syncGoogleAdsFinalUrlHostCache(pending.reports);
        if (cacheResult.failures.length) finalUrlCacheNote = ` O cache de destinos finais falhou para ${cacheResult.failures.length} conta(s); a captura D−1 foi salva. ${cacheResult.failures.slice(0, 2).join(' · ')}`;
        else if (cacheResult.refreshedAccounts.length) finalUrlCacheNote = ` Destinos finais atualizados para ${cacheResult.refreshedAccounts.length} conta(s); o cache fica válido por 24 horas.`;
      } catch (error) { finalUrlCacheNote = ` O cache de destinos finais não foi atualizado; a captura D−1 foi salva. ${String(error?.message || '').slice(0, 220)}`; }
      state.closeoutSavedAt = new Date().toISOString();
      state.pendingClosure = null;
      state.d0Comparison = null;
      d0ComparisonArea.hidden = true;
      d0ComparisonArea.innerHTML = '';
      state.dailyMode = 'normalized-preview-saved';
      const sourceNote = state.operationalSourceMode === 'api'
        ? 'A fonte operacional API deste perfil foi atualizada.'
        : 'A fonte operacional deste perfil continua sendo o manifesto MCC.';
      const scopeNote = pending.activeCampaignsOnly ? 'Somente campanhas ENABLED no momento da consulta foram atualizadas; zeros foram incluídos após confirmar consulta e inventário completos, e os dados anteriores das demais foram preservados.' : 'Todas as campanhas foram consultadas.';
      setMessage(`Fechamento D−1 de ${pending.date} salvo para ${result.savedCaptures} conta(s). ${scopeNote} ${sourceNote} O Diário MCC foi preservado.${finalUrlCacheNote}`);
    } catch (error) {
      diagnosticStatus = 'failed';
      setMessage(error.message || 'Não foi possível atualizar a base com o fechamento D−1. A prévia continua disponível para tentar novamente.', true);
    } finally {
      state.reportPending = false;
      closeoutSaveButton.textContent = 'Atualizar base';
      updateCloseoutDateLabel();
      syncButtonAvailability();
      setQueryDiagnosticStage('Renderizando confirmação da atualização D−1');
      await yieldToBrowser();
      const renderStartedAt = performance.now();
      renderReport();
      recordQueryDiagnosticMeasurement('Renderização final da atualização D−1', performance.now() - renderStartedAt);
      finishQueryDiagnostics(diagnosticStatus);
    }
  }

  async function feedAllConnectedAccounts() {
    if (!state.accounts) {
      const loaded = await loadAccounts();
      if (!loaded) return;
    }
    if (state.accounts?.warningCount) {
      setMessage(`A lista local tem ${state.accounts.warningCount} aviso(s) de acesso. Não iniciei a captura em lote para evitar apresentar um conjunto incompleto como se cobrisse todas as contas. Atualize a lista e confira o resultado antes de tentar novamente.`, true);
      return;
    }
    const accounts = state.accounts?.accounts || [];
    if (!accounts.length) {
      setMessage('A lista guardada não tem contas cliente para capturar. Atualize o diretório e confira o acesso às MCCs.', true);
      return;
    }
    await runCurrentDayFeed({ accountsOverride: accounts });
  }

  sourceModeButton.addEventListener('click', () => {
    const next = state.operationalSourceMode === 'api' ? 'manifest' : 'api';
    try {
      onOperationalSourceModeChange(next);
      state.operationalSourceMode = next;
      clearReports();
      renderSourceMode();
      renderReport();
      setMessage(next === 'api'
        ? 'Google Ads API ativada como fonte operacional somente neste perfil do navegador. O manifesto MCC e os dados anteriores continuam guardados.'
        : 'Manifesto MCC definido como fonte operacional neste perfil. As capturas da API foram mantidas e não foram apagadas.');
    } catch (error) {
      setMessage(error.message || 'Não foi possível salvar a preferência de fonte neste perfil.', true);
    }
  });
  reportArea.addEventListener('click', event => {
    const button = event.target.closest('[data-google-ads-load-more]');
    if (!button) return;
    const kind = button.dataset.googleAdsLoadMore;
    if (kind === 'capture-diff-all' || kind === 'capture-metrics-all') {
      const current = state.reportPageLimits.get(kind) || GOOGLE_ADS_INITIAL_RENDER_ROWS;
      state.reportPageLimits.set(kind, current + GOOGLE_ADS_RENDER_PAGE_SIZE);
      renderReport();
      return;
    }
    const customerId = button.dataset.customerId;
    if (!kind || !/^\d{10}$/.test(customerId || '')) return;
    const key = `${kind}:${customerId}`;
    const current = state.reportPageLimits.get(key) || GOOGLE_ADS_INITIAL_RENDER_ROWS;
    state.reportPageLimits.set(key, current + GOOGLE_ADS_RENDER_PAGE_SIZE);
    renderReport();
  });
  searchTermsButton.addEventListener('click', runSearchTermsReport);
  searchTermsArea.addEventListener('click', event => {
    const button = event.target.closest('[data-google-ads-search-terms-more]');
    if (!button || state.searchTermsPending) return;
    state.searchTermsVisibleCount += GOOGLE_ADS_SEARCH_TERMS_PAGE_SIZE;
    renderSearchTermsResults();
  });
  d0ComparisonArea.addEventListener('click', event => {
    const button = event.target.closest('[data-google-ads-d0-load-more]');
    if (!button || !state.d0Comparison || state.d0Comparison.pending) return;
    state.d0ComparisonPageLimit += GOOGLE_ADS_RENDER_PAGE_SIZE;
    renderD0Comparison();
  });
  queryDiagnosticsArea.addEventListener('click', event => {
    const button = event.target.closest('[data-google-ads-diagnostics-close]');
    if (!button) return;
    state.queryDiagnosticsDismissed = true;
    queryDiagnosticsArea.hidden = true;
  });
  reportArea.addEventListener('toggle', event => {
    const details = event.target;
    if (details?.matches?.('[data-google-ads-operational-diff]')) {
      if (details.open && !state.operationalDiffOpen) {
        state.operationalDiffOpen = true;
        renderReport();
      } else if (!details.open) state.operationalDiffOpen = false;
      return;
    }
    if (!details?.matches?.('[data-google-ads-preview-details]') || !details.open || state.capturePreviewDetailsOpen) return;
    state.capturePreviewDetailsOpen = true;
    renderReport();
  }, true);
  closeoutPreviewButton.addEventListener('click', () => previewPendingD1Closure());
  closeoutActivePreviewButton.addEventListener('click', () => previewPendingD1Closure({ activeCampaignsOnly: true }));
  closeoutSaveButton.addEventListener('click', savePendingD1Closure);
  d0AllPreviewButton.addEventListener('click', () => {
    autoUpdateDialog.close();
    void previewCurrentD0();
  });
  d0ActivePreviewButton.addEventListener('click', () => {
    autoUpdateDialog.close();
    void previewCurrentD0({ activeCampaignsOnly: true });
  });
  d0SaveButton.addEventListener('click', savePendingD0Capture);
  document.addEventListener('google-ads-capture-history-updated', event => {
    if (!root.isConnected || !Array.isArray(event.detail?.history)) return;
    refreshCaptureHistory({ google_ads_api_change_history: event.detail.history });
  });
  renderSourceMode();
  renderAutoUpdateStatus();
  updateCloseoutDateLabel();
  syncButtonAvailability();
  accountsButton.addEventListener('click', loadAccounts);
  reportButton.addEventListener('click', runReport);
  dailyReportButton.addEventListener('click', runDailyReport);
  feedTodayButton.addEventListener('click', () => runCurrentDayFeed());
  feedAllAccountsButton.addEventListener('click', feedAllConnectedAccounts);
  normalizedPreviewButton.addEventListener('click', () => runCurrentDayFeed({ previewOnly: true }));
  captureWindowSelect.addEventListener('change', () => {
    const nextWindowValue = captureWindowSelect.value;
    const nextWindowDays = nextWindowValue === 'yesterday' ? 'yesterday' : Number(nextWindowValue);
    if (nextWindowDays !== 'yesterday' && ![1, 2, 7].includes(nextWindowDays)) {
      captureWindowSelect.value = String(state.captureWindowDays);
      return;
    }
    state.captureWindowDays = nextWindowDays;
    updateCaptureWindowLabels();
    clearReports();
    renderReport();
    setMessage(`Período ajustado para ${captureWindowLabel(nextWindowDays).toLowerCase()}. Nenhuma consulta ou alteração foi feita.`);
  });
  last7DaysButton.addEventListener('click', () => {
    const range = defaultDates();
    state.dateFrom = range.dateFrom;
    state.dateTo = range.dateTo;
    dateFromInput.value = range.dateFrom;
    dateToInput.value = range.dateTo;
    clearReports();
    renderReport();
    setMessage('Período ajustado para os últimos 7 dias fechados. Clique em Prévia diária para comparar para consultar a API e comparar os dias MCC disponíveis.');
  });
  settingsButton.addEventListener('click', () => onOpenSettings());
  managerSelect.addEventListener('change', () => {
    state.selectedManagerKey = managerSelect.value;
    updateAccountOptions({ selectAll: true });
    clearReports();
    syncButtonAvailability();
    renderReport();
  });
  accountOptions.addEventListener('change', event => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    if (input.checked) state.selectedCustomerIds.add(input.value);
    else state.selectedCustomerIds.delete(input.value);
    clearReports();
    updateAccountOptions();
    syncButtonAvailability();
    renderReport();
  });
  selectAllAccountsButton.addEventListener('click', () => {
    updateAccountOptions({ selectAll: true });
    clearReports();
    syncButtonAvailability();
    renderReport();
  });
  clearAccountsButton.addEventListener('click', () => {
    state.selectedCustomerIds = new Set();
    updateAccountOptions();
    clearReports();
    syncButtonAvailability();
    renderReport();
  });
  dateFromInput.addEventListener('change', () => { state.dateFrom = dateFromInput.value; clearReports(); renderReport(); });
  dateToInput.addEventListener('change', () => { state.dateTo = dateToInput.value; clearReports(); renderReport(); });

  renderCaptureHistory();
  if (state.accounts) updateManagerOptions();
  else renderAccountDirectory();
  if (!state.tokenReady) {
    setMessage('O token compartilhado do Hub não está configurado neste navegador.', true);
  } else if (cachedDirectory) {
    setMessage(`Diretório local recuperado: ${state.accounts.managers.filter(manager => manager.customerId != null).length} MCC(s) e ${state.accounts.accounts.length} conta(s). Não foi feita uma nova consulta de acesso.`);
  }
  syncButtonAvailability();
  const controller = { loadAccounts, runReport, runSearchTermsReport, runDailyReport, previewCurrentD0, savePendingD0Capture, renderReport, refreshCaptureHistory, openCaptureHistorySnapshot, feedAllConnectedAccounts };
  mountedRoots.set(root, controller);
  return controller;
}
