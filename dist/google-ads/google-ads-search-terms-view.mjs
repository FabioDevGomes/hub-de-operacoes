import { fetchGoogleAdsAccounts, fetchGoogleAdsSearchTermCampaigns } from './google-ads-service.mjs?v=17';
import { normalizeGoogleAdsAccounts } from './google-ads-domain.mjs?v=7';
import { parseGoogleAdsCampaignName } from './google-ads-campaign-name-parser.mjs?v=6';
import { normalizeGoogleAdsSearchTermCampaigns, validateGoogleAdsSearchTermsDateRange } from './google-ads-search-terms-domain.mjs?v=6';
import { queryGoogleAdsSearchTerms } from './google-ads-search-terms-controller.mjs?v=8';
import { mountColumnPicker } from '../table-columns.mjs?v=1';
import { mountColumnWidths } from '../curadoria/column-widths.mjs?v=1';
import { GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_PURCHASE_COLUMNS, GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_DAILY_PURCHASE_COLUMNS, renderGoogleAdsSearchTermsResults } from './google-ads-search-terms-results.mjs?v=26';
import { buildGoogleAdsSearchTermsAnalysisPackage } from './google-ads-search-terms-export.mjs?v=3';
import { buildGoogleAdsSearchTermCampaignTargets, summarizeGoogleAdsSearchTerms } from './google-ads-search-terms-recommendations.mjs?v=6';
import {
  googleAdsSearchTermsDatasetId, indexGoogleAdsSearchTermsAiRecommendations,
  loadGoogleAdsSearchTermsAiResponse, parseGoogleAdsSearchTermsAiResponse, saveGoogleAdsSearchTermsAiResponse,
} from './google-ads-search-terms-ai.mjs?v=2';
import { applyGoogleAdsProductNegativeKeyword, previewGoogleAdsProductNegativeKeyword } from './google-ads-campaign-actions-service.mjs?v=7';
import { reconcileGoogleAdsNegativeKeywordApplyResult } from './google-ads-negative-keyword-reconciliation.mjs?v=1';
import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';
import { loadGoogleAdsAccountsCache, saveGoogleAdsAccountsCache } from './google-ads-accounts-cache.mjs?v=4';
import { loadGoogleAdsSearchTermsCampaignsCache, saveGoogleAdsSearchTermsCampaignsCache } from './google-ads-search-terms-campaigns-cache.mjs?v=1';
import { loadGoogleAdsSearchTermsCache, saveGoogleAdsSearchTermsCache } from './google-ads-search-terms-cache.mjs?v=3';
import { createGoogleAdsSearchTermsConsultationId, loadGoogleAdsSearchTermsSnapshot, saveGoogleAdsSearchTermsSnapshot } from './google-ads-search-terms-snapshots.mjs?v=3';
import { loadGoogleAdsCampaignBookmarks, matchGoogleAdsCampaignBookmark, saveGoogleAdsCampaignBookmarks } from './google-ads-campaign-bookmarks.mjs?v=2';
import { openGoogleAdsResourcesViaExtension, readGoogleAdsResourceBookmarksViaExtension } from './google-ads-resources-bridge.mjs?v=2';

const mountedRoots = new WeakMap();
const PAGE_SIZE = 50;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function normalizeCampaignContext(value) {
  const managerCustomerId = String(value?.managerCustomerId || '').replace(/\D/g, '');
  const customerId = String(value?.customerId || '').replace(/\D/g, '');
  const campaignId = String(value?.campaignId || '');
  const campaignName = String(value?.campaignName || '').trim().slice(0, 240);
  if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId) || !campaignName) return null;
  const returnCampaignName = String(value?.returnToDiary?.campaignName || '').trim().slice(0, 240);
  const returnSource = String(value?.returnToDiary?.source || '').trim().slice(0, 40);
  const returnCampaignId = String(value?.returnToDiary?.campaignId || '').trim().slice(0, 160);
  const returnToDiary = returnCampaignName && /^[a-z][a-z0-9_-]{0,39}$/i.test(returnSource) && returnCampaignId
    ? { campaignName: returnCampaignName, source: returnSource, campaignId: returnCampaignId }
    : null;
  return {
    managerCustomerId,
    customerId,
    campaignId,
    campaignName,
    autoQuery: value?.autoQuery === true,
    includeToday: value?.includeToday === true,
    returnToDiary,
  };
}

function campaignFiltersAppliedMessage(context, dateFrom, dateTo, tokenReady) {
  const nextStep = tokenReady
    ? 'Clique em “Consultar termos” para iniciar a busca.'
    : 'Configure o token compartilhado do Hub para poder consultar.';
  return `Filtros aplicados com sucesso: MCC ${context.managerCustomerId}, conta ${context.customerId}, campanha ${context.campaignName} e período ${dateFrom} a ${dateTo}. ${nextStep} Nenhuma consulta foi iniciada.`;
}

function cachedAccountForContext(accounts, context) {
  if (!accounts || !context || !accounts.managers.some(manager => String(manager.customerId || '').replace(/\D/g, '') === context.managerCustomerId)) return null;
  return accounts.accounts.find(account => String(account.customerId).replace(/\D/g, '') === context.customerId && String(account.managerCustomerId).replace(/\D/g, '') === context.managerCustomerId) || null;
}

function isoDateInTimeZone(timeZone, date = new Date()) {
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }); }
  const parts = formatter.formatToParts(date);
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
}

function dateOffset(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function defaultDates(rangeDays = 7, timeZone = 'America/Sao_Paulo', { includeToday = false } = {}) {
  const today = isoDateInTimeZone(timeZone);
  const yesterday = dateOffset(today, -1);
  const days = Math.min(31, Math.max(1, Math.trunc(Number(rangeDays) || 7)));
  return { dateFrom: dateOffset(yesterday, -(days - 1)), dateTo: includeToday ? today : yesterday };
}

function yesterdayAndTodayDates(timeZone = 'America/Sao_Paulo') {
  const today = isoDateInTimeZone(timeZone);
  return { dateFrom: dateOffset(today, -1), dateTo: today };
}

function managerKey(manager) {
  return manager?.customerId == null ? 'direct' : String(manager.customerId).replace(/\D/g, '');
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'horário indisponível' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function mountGoogleAdsSearchTerms({ root, campaignContext: rawCampaignContext = null, snapshotId = '', apiCaptures = [], onReturnToDiary = null, onRecordKeywordAdditions = null } = {}) {
  if (!root) throw new Error('A área da tela Termos de Pesquisa não foi encontrada.');
  const campaignContext = normalizeCampaignContext(rawCampaignContext);
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.setApiCaptures(apiCaptures);
    existing.setReturnToDiaryHandler(onReturnToDiary);
    existing.setKeywordAdditionRecorder(onRecordKeywordAdditions);
    if (campaignContext) {
      existing.applyCampaignContext(campaignContext);
      if (snapshotId) void existing.openSnapshot(snapshotId);
    }
    else {
      existing.setReturnToDiaryContext(null);
      if (snapshotId) void existing.openSnapshot(snapshotId);
      else void existing.openSnapshot('');
    }
    return existing;
  }

  const tokenState = readTrackingHubToken();
  const cached = loadGoogleAdsAccountsCache();
  const latestCachedQuery = loadGoogleAdsSearchTermsCache();
  const cachedQuery = campaignContext ? null : latestCachedQuery;
  const cachedQueryMatchesDirectory = Boolean(cachedQuery && cached?.accounts
    && cached.accounts.managers.some(manager => managerKey(manager) === cachedQuery.managerKey)
    && cachedQuery.selectedCustomerIds.every(customerId => cached.accounts.accounts.some(account => account.customerId === customerId
      && managerKey({ customerId: account.managerCustomerId }) === cachedQuery.managerKey)));
  const initialContextAccount = cachedAccountForContext(cached?.accounts, campaignContext);
  const dates = cachedQuery
    ? { dateFrom: cachedQuery.dateFrom, dateTo: cachedQuery.dateTo }
    : campaignContext?.autoQuery ? yesterdayAndTodayDates(initialContextAccount?.timeZone)
      : defaultDates(7, initialContextAccount?.timeZone, { includeToday: campaignContext?.includeToday });
  const state = {
    tokenReady: Boolean(tokenState.token),
    accounts: cached?.accounts || null,
    accountsCacheAt: cached?.refreshedAtUtc || cached?.savedAtUtc || '',
    apiCaptures: Array.isArray(apiCaptures) ? apiCaptures : [],
    campaignTargets: buildGoogleAdsSearchTermCampaignTargets(apiCaptures),
    accountsPending: false,
    queryPending: false,
    snapshotMode: false,
    campaignCatalogPendingCustomerId: '',
    campaignCatalogError: '',
    campaignCatalogs: new Map(),
    campaignCatalogSavedAt: new Map(),
    campaignCatalogFreshness: new Map(),
    campaignId: initialContextAccount ? campaignContext.campaignId : cachedQueryMatchesDirectory ? cachedQuery.campaignId || '' : '',
    campaignPrefill: initialContextAccount ? campaignContext : cachedQueryMatchesDirectory && cachedQuery.campaignId
      ? {
        managerCustomerId: cached.accounts.accounts.find(account => account.customerId === cachedQuery.selectedCustomerIds[0])?.managerCustomerId ?? null,
        customerId: cachedQuery.selectedCustomerIds[0],
        campaignId: cachedQuery.campaignId,
        campaignName: cachedQuery.campaignName,
        autoQuery: false,
      }
      : null,
    returnToDiary: campaignContext?.returnToDiary || null,
    onReturnToDiary,
    onRecordKeywordAdditions,
    pendingCampaignContext: campaignContext && !initialContextAccount ? campaignContext : null,
    queuedCampaignContext: null,
    selectedManagerKey: campaignContext?.managerCustomerId || (cachedQueryMatchesDirectory ? cachedQuery.managerKey : '') || (cached?.accounts?.managers?.length ? managerKey(cached.accounts.managers[0]) : ''),
    selectedCustomerIds: new Set(),
    reports: cachedQuery?.reports || null,
    recommendations: [],
    dailyRecommendations: null,
    groupingMode: 'period',
    minimumImpressions: 0,
    aiDatasetId: '',
    aiResponse: null,
    aiRecommendations: new Map(),
    reviewStates: new Map(),
    failures: cachedQuery?.failures || [],
    queryCacheAtUtc: cachedQuery?.savedAtUtc || '',
    progress: '',
    visibleCount: PAGE_SIZE,
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    message: '',
    messageError: false,
  };
  if (state.accounts) {
    state.selectedCustomerIds = initialContextAccount
      ? new Set([initialContextAccount.customerId])
      : state.pendingCampaignContext
        ? new Set()
        : cachedQueryMatchesDirectory
          ? new Set(cachedQuery.selectedCustomerIds)
          : new Set(state.accounts.accounts
            .filter(account => managerKey({ customerId: account.managerCustomerId }) === state.selectedManagerKey)
            .map(account => account.customerId));
  }
  if (cachedQuery) {
    state.recommendations = summarizeGoogleAdsSearchTerms(cachedQuery.reports, state.campaignTargets);
    state.aiDatasetId = googleAdsSearchTermsDatasetId({ reports: cachedQuery.reports, recommendations: state.recommendations, dateFrom: cachedQuery.dateFrom, dateTo: cachedQuery.dateTo });
    state.aiResponse = loadGoogleAdsSearchTermsAiResponse(state.aiDatasetId);
    state.aiRecommendations = indexGoogleAdsSearchTermsAiRecommendations(state.aiResponse);
    state.reviewStates = loadReviewStates(state.aiDatasetId);
  }

  root.innerHTML = `<div class="google-ads-search-terms-page">
    <div class="google-ads-search-directory-head"><p id="googleAdsSearchTermsDirectoryStatus"></p><button id="googleAdsSearchTermsRefreshAccounts" class="btn" type="button">Atualizar MCCs e contas</button></div>
    <div class="google-ads-search-terms-controls">
      <label class="google-ads-search-field">MCC<select id="googleAdsSearchTermsManager" class="input"></select></label>
      <label class="google-ads-search-field">De · data da conta<input id="googleAdsSearchTermsDateFrom" class="input" type="date" value="${dates.dateFrom}"></label>
      <label class="google-ads-search-field">Até · data da conta<input id="googleAdsSearchTermsDateTo" class="input" type="date" value="${dates.dateTo}"></label>
      <label class="google-ads-search-field">Campanha<select id="googleAdsSearchTermsCampaign" class="input"><option value="">Todas as campanhas</option></select></label>
      <button id="googleAdsSearchTermsRun" class="btn primary google-ads-search-terms-run" type="button">Consultar termos</button>
      <div class="google-ads-search-account-picker"><div class="google-ads-search-account-heading"><strong>Contas Google Ads</strong><div><button id="googleAdsSearchTermsSelectAll" class="btn" type="button">Selecionar todas</button><button id="googleAdsSearchTermsClearAccounts" class="btn" type="button">Limpar</button></div></div><div id="googleAdsSearchTermsAccounts" class="google-ads-search-account-list" role="group" aria-label="Contas Google Ads"></div></div>
    </div>
    <p id="googleAdsSearchTermsCampaignHint" class="google-ads-search-terms-help">Todas as campanhas é a opção padrão. Para filtrar uma campanha, marque somente uma conta.</p>
    <p class="google-ads-search-terms-help">Consulta manual, somente leitura, para campanhas Search. Selecione até 31 dias; a tabela começa com 50 linhas. Custos são exibidos por moeda da conta. Performance Max fica fora.</p>
    <p id="googleAdsSearchTermsMessage" class="google-ads-message" role="status" aria-live="polite"></p>
    <section id="googleAdsSearchTermsResults" class="google-ads-search-terms-area" aria-live="polite" hidden></section>
    <dialog id="googleAdsSearchTermsAiImportDialog" class="google-ads-search-terms-dialog"><div class="google-ads-search-terms-dialog-panel"><header><div><span class="eyebrow">IMPORTAÇÃO LOCAL</span><h2>Colar análise da IA</h2></div><button class="btn" type="button" data-close-ai-import aria-label="Fechar">×</button></header><p>Ao abrir, tento carregar o texto da área de transferência. Valido o contrato e os IDs desta consulta antes de salvar. A resposta fica apenas neste navegador; recomendações não aplicam mudanças.</p><label for="googleAdsSearchTermsAiJson">Resposta JSON</label><textarea id="googleAdsSearchTermsAiJson" class="input" rows="12" spellcheck="false" placeholder="Se não carregar automaticamente, cole aqui o JSON"></textarea><p id="googleAdsSearchTermsAiImportStatus" class="google-ads-search-terms-dialog-status" role="status" aria-live="polite"></p><footer><button class="btn" type="button" data-close-ai-import>Cancelar</button><button id="googleAdsSearchTermsAiImportApply" class="btn primary" type="button">Validar e importar</button></footer></div></dialog>
    <dialog id="googleAdsSearchTermsReviewDialog" class="google-ads-search-terms-dialog google-ads-search-terms-review-dialog"><div class="google-ads-search-terms-dialog-panel"><header><div><span class="eyebrow">REVISÃO DO TERMO</span><h2 id="googleAdsSearchTermsReviewTitle">Revisar termo</h2></div><button class="btn" type="button" data-close-review aria-label="Fechar">×</button></header><div id="googleAdsSearchTermsReviewSummary" class="google-ads-search-terms-review-summary"></div><section id="googleAdsSearchTermsReviewAi" class="google-ads-search-terms-review-ai" aria-labelledby="googleAdsSearchTermsReviewAiHeading"><div class="google-ads-search-terms-review-ai-heading"><strong id="googleAdsSearchTermsReviewAiHeading">Avaliação da IA</strong><span id="googleAdsSearchTermsReviewAiDecision"></span></div><div class="google-ads-search-terms-review-ai-rationale"><strong>Justificativa</strong><p id="googleAdsSearchTermsReviewAiRationale"></p></div></section><div id="googleAdsSearchTermsReviewActions" class="google-ads-search-terms-review-actions"><button class="btn" type="button" data-review-keep>Manter</button><button class="btn" type="button" data-review-negate>Negativar</button><button class="btn" type="button" data-review-manual-negative title="Registra apenas a conclusão local; não consulta nem altera o Google Ads.">Marcar como negativado manualmente</button><button class="btn" type="button" data-review-monitor>Monitorar por 24 horas</button></div><small class="google-ads-search-terms-review-manual-help">Se você já negativou esse termo no Google Ads, use esta opção para concluir a revisão no Hub sem enviar outra alteração.</small><div id="googleAdsSearchTermsReviewReasons" class="google-ads-search-terms-review-reasons" hidden><strong>Qual motivo se aplica?</strong><div><button class="btn" type="button" data-review-reason="offer_relevant">Relevante ou relacionado à oferta</button><button class="btn" type="button" data-review-reason="purchase_intent">Intenção de compra</button><button class="btn" type="button" data-review-reason="brand_or_product">Marca ou produto</button><button class="btn" type="button" data-review-reason="acceptable_variant">Variação aceitável</button><button class="btn" type="button" data-review-reason="other_relevant">Outro motivo relevante</button></div></div><p id="googleAdsSearchTermsReviewStatus" class="google-ads-search-terms-dialog-status" role="status" aria-live="polite"></p><footer><button class="btn" type="button" data-close-review>Fechar</button></footer></div></dialog>
    <dialog id="googleAdsSearchTermsNegativeDialog" class="google-ads-search-terms-dialog"><div class="google-ads-search-terms-dialog-panel"><header><div><span class="eyebrow">AÇÃO COM PRÉVIA</span><h2>Negativar termo de pesquisa</h2></div><button class="btn" type="button" data-close-negative aria-label="Fechar">×</button></header><p id="googleAdsSearchTermsNegativeContext"></p><label for="googleAdsSearchTermsNegativeTerm">Termo a negativar</label><input id="googleAdsSearchTermsNegativeTerm" class="input" type="text" maxlength="80" autocomplete="off" spellcheck="false" aria-describedby="googleAdsSearchTermsNegativeTermHint"><small id="googleAdsSearchTermsNegativeTermHint" class="google-ads-search-terms-negative-term-help">Edite o termo antes da prévia, se quiser. Limite: 80 caracteres e 10 palavras. Qualquer edição depois da prévia exige uma nova conferência.</small><label for="googleAdsSearchTermsNegativeMatch">Correspondência da negativa</label><select id="googleAdsSearchTermsNegativeMatch" class="input"><option value="">Escolha uma opção</option><option value="EXACT">Exata</option><option value="PHRASE">Frase</option><option value="BROAD">Ampla</option></select><small id="googleAdsSearchTermsNegativeMatchSuggestion" class="google-ads-search-terms-negative-term-help" hidden></small><div id="googleAdsSearchTermsNegativeScopeSummary" class="google-ads-search-terms-negative-scope"></div><label class="google-ads-search-terms-negative-scope-toggle"><input id="googleAdsSearchTermsNegativeAllCampaigns" type="checkbox" aria-describedby="googleAdsSearchTermsNegativeScopeHelp"><span>Incluir todas as campanhas Search ativas do produto nesta MCC</span></label><small id="googleAdsSearchTermsNegativeScopeHelp" class="google-ads-search-terms-negative-term-help">Desmarcado, a prévia e a aplicação ficam somente na campanha pré-selecionada acima, se ela estiver ativa. Marcado, a prévia e a aplicação incluem somente campanhas Search ativas do produto na MCC; campanhas pausadas são excluídas.</small><div class="google-ads-search-terms-negative-actions"><button id="googleAdsSearchTermsNegativePreview" class="btn primary" type="button" disabled>Pré-visualizar campanhas</button></div><div id="googleAdsSearchTermsNegativePreviewResult" class="google-ads-search-terms-negative-preview"></div><label id="googleAdsSearchTermsNegativeConfirmLabel" class="google-ads-search-terms-negative-confirm" hidden><input id="googleAdsSearchTermsNegativeConfirm" type="checkbox" disabled><span>Confirmo a aplicação no escopo listado.</span></label><p id="googleAdsSearchTermsNegativeStatus" class="google-ads-search-terms-dialog-status" role="status" aria-live="polite"></p><footer><button class="btn" type="button" data-close-negative>Fechar</button><button id="googleAdsSearchTermsNegativeApply" class="btn primary" type="button" disabled>Confirmar e aplicar</button></footer></div></dialog>
  </div>`;

  const $ = selector => root.querySelector(selector);
  const managerSelect = $('#googleAdsSearchTermsManager');
  const accountOptions = $('#googleAdsSearchTermsAccounts');
  const directoryStatus = $('#googleAdsSearchTermsDirectoryStatus');
  const refreshButton = $('#googleAdsSearchTermsRefreshAccounts');
  const selectAllButton = $('#googleAdsSearchTermsSelectAll');
  const clearAccountsButton = $('#googleAdsSearchTermsClearAccounts');
  const runButton = $('#googleAdsSearchTermsRun');
  const campaignSelect = $('#googleAdsSearchTermsCampaign');
  const campaignHint = $('#googleAdsSearchTermsCampaignHint');
  const dateFromInput = $('#googleAdsSearchTermsDateFrom');
  const dateToInput = $('#googleAdsSearchTermsDateTo');
  const message = $('#googleAdsSearchTermsMessage');
  const resultsArea = $('#googleAdsSearchTermsResults');
  const reviewDialog = $('#googleAdsSearchTermsReviewDialog');
  const reviewNegateButton = $('#googleAdsSearchTermsReviewDialog [data-review-negate]');
  const reviewTitle = $('#googleAdsSearchTermsReviewTitle');
  const reviewSummary = $('#googleAdsSearchTermsReviewSummary');
  const reviewAiDecision = $('#googleAdsSearchTermsReviewAiDecision');
  const reviewAiRationale = $('#googleAdsSearchTermsReviewAiRationale');
  const reviewActions = $('#googleAdsSearchTermsReviewActions');
  const reviewReasons = $('#googleAdsSearchTermsReviewReasons');
  const reviewStatus = $('#googleAdsSearchTermsReviewStatus');
  const aiImportDialog = $('#googleAdsSearchTermsAiImportDialog');
  const aiJsonInput = $('#googleAdsSearchTermsAiJson');
  const aiImportStatus = $('#googleAdsSearchTermsAiImportStatus');
  const aiImportApplyButton = $('#googleAdsSearchTermsAiImportApply');
  let aiImportClipboardReadId = 0;
  let aiImportClipboardEdited = false;
  const negativeDialog = $('#googleAdsSearchTermsNegativeDialog');
  const negativeContext = $('#googleAdsSearchTermsNegativeContext');
  const negativeTermInput = $('#googleAdsSearchTermsNegativeTerm');
  const negativeMatchSelect = $('#googleAdsSearchTermsNegativeMatch');
  const negativeMatchSuggestion = $('#googleAdsSearchTermsNegativeMatchSuggestion');
  const negativeAllCampaignsInput = $('#googleAdsSearchTermsNegativeAllCampaigns');
  const negativeScopeSummary = $('#googleAdsSearchTermsNegativeScopeSummary');
  const negativePreviewButton = $('#googleAdsSearchTermsNegativePreview');
  const negativePreviewResult = $('#googleAdsSearchTermsNegativePreviewResult');
  const negativeConfirmLabel = $('#googleAdsSearchTermsNegativeConfirmLabel');
  const negativeConfirmCheckbox = $('#googleAdsSearchTermsNegativeConfirm');
  const negativeStatus = $('#googleAdsSearchTermsNegativeStatus');
  const negativeApplyButton = $('#googleAdsSearchTermsNegativeApply');
  let negativeDraft = null;
  let negativePreview = null;
  const negativeBookmarkDocument = root.ownerDocument || globalThis.document;
  const negativeBookmarkWindow = negativeBookmarkDocument?.defaultView || globalThis.window;
  function negativeCampaignBookmarkStorage() {
    try { return negativeBookmarkWindow?.localStorage || null; }
    catch { return null; }
  }
  let negativeCampaignBookmarks = loadGoogleAdsCampaignBookmarks(negativeCampaignBookmarkStorage());
  let negativeCampaignBookmarksSyncPending = false;
  let negativeCampaignBookmarksSyncPromise = null;
  let negativeCampaignBookmarkNotice = '';
  let reviewDraft = null;
  let reviewNegativeOpening = false;
  let reviewExpiryTimer = null;
  let resultsColumnControllers = [];
  const columnPreferences = {
    getItem(key) { return globalThis.localStorage?.getItem(key) ?? null; },
    setItem(key, value) {
      if (!globalThis.localStorage) throw new Error('Armazenamento local indisponível.');
      globalThis.localStorage.setItem(key, value);
    },
    removeItem(key) {
      if (!globalThis.localStorage) throw new Error('Armazenamento local indisponível.');
      globalThis.localStorage.removeItem(key);
    },
  };

  function clearResultsColumnPickers() {
    resultsColumnControllers.forEach(controller => controller.destroy());
    resultsColumnControllers = [];
  }

  function mountResultsColumnPickers() {
    const dailyGrouping = state.groupingMode === 'day';
    const preferenceKey = 'hub:google-ads-search-terms:recommendation-columns:v1';
    const migrationKey = 'hub:google-ads-search-terms:purchase-columns-migrated:v1';
    const purchaseCpaMigrationKey = 'hub:google-ads-search-terms:purchase-cpa-column-migrated:v1';
    try {
      if (globalThis.localStorage?.getItem(migrationKey) !== '1') {
        const savedColumns = JSON.parse(globalThis.localStorage?.getItem(preferenceKey) || 'null');
        if (Array.isArray(savedColumns)) {
          for (const key of ['purchaseConversions', 'purchaseValue']) {
            if (!savedColumns.includes(key)) savedColumns.push(key);
          }
          globalThis.localStorage.setItem(preferenceKey, JSON.stringify(savedColumns));
        }
        globalThis.localStorage?.setItem(migrationKey, '1');
      }
    } catch {}
    try {
      if (globalThis.localStorage?.getItem(purchaseCpaMigrationKey) !== '1') {
        const savedColumns = JSON.parse(globalThis.localStorage?.getItem(preferenceKey) || 'null');
        if (Array.isArray(savedColumns) && !savedColumns.includes('purchaseCpa')) {
          savedColumns.push('purchaseCpa');
          globalThis.localStorage.setItem(preferenceKey, JSON.stringify(savedColumns));
        }
        globalThis.localStorage?.setItem(purchaseCpaMigrationKey, '1');
      }
    } catch {}
    const tables = [
      {
        name: 'recommendation',
        selector: '.google-ads-search-terms-recommendation-table',
        columns: dailyGrouping ? GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_DAILY_PURCHASE_COLUMNS : GOOGLE_ADS_SEARCH_TERM_RECOMMENDATION_PURCHASE_COLUMNS,
        required: dailyGrouping ? ['searchTerm', 'date'] : ['searchTerm'],
        preferenceKey,
        widthsPreferenceKey: dailyGrouping
          ? 'hub:google-ads-search-terms:recommendation-day-column-widths:v1'
          : 'hub:google-ads-search-terms:recommendation-column-widths:v1',
      },
    ];
    for (const definition of tables) {
      const picker = resultsArea.querySelector(`[data-google-ads-search-terms-column-picker="${definition.name}"]`);
      const table = resultsArea.querySelector(definition.selector);
      if (!picker || !table) continue;
      const pickerController = mountColumnPicker({
        picker,
        table,
        columns: definition.columns,
        required: definition.required,
        preferences: columnPreferences,
        preferenceKey: definition.preferenceKey,
      });
      let notice = null;
      const widthController = mountColumnWidths({
        table,
        preferences: columnPreferences,
        preferenceKey: definition.widthsPreferenceKey,
        onError(value) {
          if (!notice && value) {
            notice = table.ownerDocument.createElement('p');
            notice.className = 'hub-widths-message';
            notice.setAttribute('role', 'status');
            table.closest('.google-ads-table-wrap')?.before(notice);
          }
          if (notice) {
            notice.textContent = value;
            notice.hidden = !value;
          }
        },
      });
      const refreshWidths = event => {
        if (event.type === 'change' && event.target.matches?.('[data-column-choice]')) widthController.refresh();
        if (event.type === 'click' && event.target.closest?.('[data-column-reset]')) widthController.refresh();
      };
      picker.addEventListener('change', refreshWidths);
      picker.addEventListener('click', refreshWidths);
      resultsColumnControllers.push({
        destroy() {
          picker.removeEventListener('change', refreshWidths);
          picker.removeEventListener('click', refreshWidths);
          widthController.destroy();
          pickerController.destroy();
        },
      });
    }
  }

  function setMessage(value, isError = false) {
    state.message = value;
    state.messageError = isError;
    message.textContent = value;
    message.classList.toggle('error', isError);
    message.classList.toggle('success', Boolean(value) && !isError);
  }

  function syncAiRecommendations() {
    if (!state.reports?.length || !state.recommendations.length) {
      state.aiDatasetId = '';
      state.aiResponse = null;
      state.aiRecommendations = new Map();
      state.reviewStates = new Map();
      return;
    }
    const datasetId = googleAdsSearchTermsDatasetId({
      reports: state.reports,
      recommendations: state.recommendations,
      dateFrom: state.dateFrom,
      dateTo: state.dateTo,
    });
    if (datasetId === state.aiDatasetId) return;
    state.aiDatasetId = datasetId;
    state.aiResponse = loadGoogleAdsSearchTermsAiResponse(datasetId);
    state.aiRecommendations = indexGoogleAdsSearchTermsAiRecommendations(state.aiResponse);
    state.reviewStates = loadReviewStates(datasetId);
  }

  function reviewStorageKey(datasetId = state.aiDatasetId) {
    return datasetId ? `hub:google-ads-search-terms:review:v1:${datasetId}` : '';
  }

  function loadReviewStates(datasetId) {
    if (!datasetId) return new Map();
    try {
      const raw = globalThis.localStorage?.getItem(reviewStorageKey(datasetId));
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.schema_version !== 1 || parsed.dataset_id !== datasetId || !parsed.items || typeof parsed.items !== 'object') return new Map();
      return new Map(Object.entries(parsed.items).filter(([, item]) => ['keep', 'negative', 'monitor'].includes(item?.status)
        && Number.isFinite(Date.parse(item.completedAtUtc || ''))
        && (item.status !== 'monitor' || Number.isFinite(Date.parse(item.expiresAtUtc || '')))));
    } catch { return new Map(); }
  }

  function currentReviewState(termId, now = Date.now()) {
    const item = state.reviewStates.get(termId);
    if (!item) return null;
    if (item.status === 'monitor' && (!Number.isFinite(Date.parse(item.expiresAtUtc || '')) || Date.parse(item.expiresAtUtc) <= now)) return null;
    return item;
  }

  function saveReviewDecision(termId, item) {
    if (!state.aiDatasetId || !termId) return false;
    const next = new Map(state.reviewStates);
    next.set(termId, item);
    try {
      if (!globalThis.localStorage) throw new Error('Armazenamento local indisponível.');
      globalThis.localStorage.setItem(reviewStorageKey(), JSON.stringify({
        schema_version: 1,
        dataset_id: state.aiDatasetId,
        items: Object.fromEntries(next),
      }));
    } catch {
      setMessage('A revisão não foi salva neste navegador. Libere espaço no armazenamento local e tente novamente.', true);
      return false;
    }
    state.reviewStates = next;
    renderResults();
    return true;
  }

  function reviewStatusLabel(item) {
    if (item?.status === 'keep') return 'Revisado · Mantido';
    if (item?.status === 'negative') return item.reasonCode === 'manual_negative' ? 'Negativado manualmente' : 'Revisado · Negativado';
    if (item?.status === 'monitor') {
      const expiresAt = new Date(item.expiresAtUtc);
      return `Monitorando · até ${expiresAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
    }
    return '';
  }

  function openReview(termId) {
    const group = state.recommendations.find(item => item.termId === termId);
    if (!group || !state.aiDatasetId) return;
    reviewDraft = group;
    const ai = state.aiRecommendations.get(termId);
    const current = currentReviewState(termId);
    const decisionLabels = { KEEP: 'Manter', NEGATIVE_CANDIDATE: 'Candidata a negativa', TEST: 'Testar', REVIEW: 'Revisar' };
    reviewTitle.textContent = group.searchTerm;
    reviewSummary.textContent = `${group.campaignName} · Conta ${String(group.customerId || '').replace(/\D/g, '').slice(-4)} · ${Number(group.clicks || 0).toLocaleString('pt-BR')} clique(s) · ${Number(group.impressions || 0).toLocaleString('pt-BR')} impressão(ões)`;
    reviewAiDecision.className = 'google-ads-search-terms-ai-decision';
    if (ai) reviewAiDecision.classList.add(`is-${ai.decision.toLowerCase()}`);
    reviewAiDecision.textContent = ai
      ? `${decisionLabels[ai.decision] || ai.decision} · ${Number(ai.confidence || 0).toLocaleString('pt-BR')}%`
      : 'Sem análise importada';
    reviewAiRationale.textContent = ai?.rationale || 'Esta consulta ainda não tem uma avaliação importada da IA. Você pode registrar sua decisão mesmo assim.';
    reviewReasons.hidden = true;
    reviewActions.hidden = false;
    const reasonLabel = current ? reviewReasonLabels[current.reasonCode] : '';
    reviewStatus.textContent = current ? `${reviewStatusLabel(current)}${reasonLabel ? ` · ${reasonLabel}` : ''}` : '';
    reviewDialog.showModal();
  }

  const reviewReasonLabels = {
    offer_relevant: 'Relevante ou relacionado à oferta',
    purchase_intent: 'Intenção de compra',
    brand_or_product: 'Marca ou produto',
    acceptable_variant: 'Variação aceitável',
    other_relevant: 'Outro motivo relevante',
  };

  function normalizedNegativeTerm(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  function isValidNegativeTerm(value) {
    const term = normalizedNegativeTerm(value);
    return Boolean(term)
      && Array.from(term).length <= 80
      && term.split(/\s+/).length <= 10
      && !/[\u0000-\u001f\u007f]/.test(term);
  }

  function currentNegativeCampaignBookmarkMatch() {
    const manager = (state.accounts?.managers || []).find(item => String(item.customerId || '').replace(/\D/g, '') === negativeDraft?.managerCustomerId);
    return matchGoogleAdsCampaignBookmark(negativeCampaignBookmarks, {
      accountId: negativeDraft?.managerCustomerId,
      accountName: manager?.name || '',
    });
  }

  function updateNegativeContext() {
    if (!negativeDraft) return;
    negativeDraft.term = normalizedNegativeTerm(negativeTermInput.value);
    negativeDraft.scope = negativeAllCampaignsInput.checked ? 'PRODUCT' : 'SOURCE_CAMPAIGN';
    negativeContext.textContent = `Produto identificado: ${negativeDraft.product}. Termo a negativar: “${negativeDraft.term || '—'}”.`;
    const bookmarkMatch = currentNegativeCampaignBookmarkMatch();
    const accountSuffix = negativeDraft.sourceCustomerId.slice(-4);
    let campaignLink = '';
    if (bookmarkMatch.status === 'matched') {
      campaignLink = `<a class="google-ads-campaign-bookmark-link" href="#" data-negative-open-campaign-list aria-label="Abrir campanhas da conta terminada em ${escapeHtml(accountSuffix)}" title="Abre a listagem salva pela extensão Hub 2.0 e seleciona esta conta">Abrir campanhas da conta ···${escapeHtml(accountSuffix)} ↗</a><small class="google-ads-search-terms-negative-bookmark-status" data-negative-campaign-link-status role="status" aria-live="polite"></small>`;
    } else if (bookmarkMatch.status === 'ambiguous') {
      campaignLink = '<small class="google-ads-search-terms-negative-bookmark-note" role="status">Encontrei mais de um link de Campanhas para esta MCC. Ajuste os favoritos do Chrome para que a extensão identifique um único link.</small>';
    } else if (negativeCampaignBookmarksSyncPending) {
      campaignLink = '<small class="google-ads-search-terms-negative-bookmark-note" role="status">Verificando o link de Campanhas salvo para esta MCC…</small>';
    } else {
      const notice = negativeCampaignBookmarkNotice || 'Link de Campanhas não salvo para esta MCC. Cadastre um favorito de Campanhas no Chrome, na pasta Contas ou em Contas > pag recursos, para a extensão detectá-lo.';
      campaignLink = `<small class="google-ads-search-terms-negative-bookmark-note" role="status">${escapeHtml(notice)}</small>`;
    }
    negativeScopeSummary.innerHTML = `<strong>Campanha pré-selecionada:</strong> ${escapeHtml(negativeDraft.sourceCampaignName)} <span>Conta ···${escapeHtml(accountSuffix)}</span>${campaignLink}`;
  }

  function syncNegativeCampaignBookmarks() {
    if (negativeCampaignBookmarksSyncPromise) return negativeCampaignBookmarksSyncPromise;
    negativeCampaignBookmarksSyncPending = true;
    negativeCampaignBookmarkNotice = '';
    updateNegativeContext();
    negativeCampaignBookmarksSyncPromise = readGoogleAdsResourceBookmarksViaExtension({
      document: negativeBookmarkDocument,
      window: negativeBookmarkWindow,
    }).then(snapshot => {
      if (snapshot?.ok === true && snapshot.folderFound === true) {
        const saved = saveGoogleAdsCampaignBookmarks(snapshot.campaignBookmarks, negativeCampaignBookmarkStorage());
        negativeCampaignBookmarks = saved.bookmarks;
        if (!saved.ok) negativeCampaignBookmarkNotice = 'O favorito foi detectado nesta sessão, mas não pôde ser salvo no navegador.';
      } else if (snapshot?.permissionRequired) {
        negativeCampaignBookmarkNotice = 'Autorize “Ler favoritos do Chrome” no popup da extensão Hub 2.0 para detectar o link de Campanhas.';
      } else if (snapshot?.ok === true) {
        negativeCampaignBookmarks = [];
        saveGoogleAdsCampaignBookmarks([], negativeCampaignBookmarkStorage());
        negativeCampaignBookmarkNotice = 'A pasta de favoritos Contas não foi encontrada. Cadastre nela o link Campanhas para a extensão detectá-lo.';
      } else {
        negativeCampaignBookmarkNotice = snapshot?.message || 'Não consegui verificar o link de Campanhas pela extensão Hub 2.0.';
      }
    }).catch(error => {
      negativeCampaignBookmarkNotice = error?.message || 'Não consegui verificar o link de Campanhas pela extensão Hub 2.0.';
    }).finally(() => {
      negativeCampaignBookmarksSyncPending = false;
      negativeCampaignBookmarksSyncPromise = null;
      updateNegativeContext();
    });
    return negativeCampaignBookmarksSyncPromise;
  }

  function updateNegativePreviewButton(label = 'Pré-visualizar campanhas') {
    negativePreviewButton.textContent = label;
    negativePreviewButton.disabled = !negativeMatchSelect.value || !isValidNegativeTerm(negativeTermInput.value);
  }

  function updateNegativeMatchSuggestion() {
    const labels = { EXACT: 'Exata', PHRASE: 'Frase', BROAD: 'Ampla' };
    const suggested = negativeDraft?.suggestedMatchType;
    if (!labels[suggested]) {
      negativeMatchSuggestion.textContent = '';
      negativeMatchSuggestion.hidden = true;
      return;
    }
    const selected = labels[negativeMatchSelect.value] || 'nenhuma';
    negativeMatchSuggestion.textContent = `Sugestão da Avaliação IA: ${labels[suggested]}. Correspondência selecionada: ${selected}. Você pode alterar antes da prévia.`;
    negativeMatchSuggestion.hidden = false;
  }

  function openNegativeFlow(source, reviewTermId = '') {
    negativeDraft = {
      managerCustomerId: String(source.managerCustomerId || '').replace(/\D/g, ''),
      sourceCustomerId: String(source.customerId || '').replace(/\D/g, ''),
      sourceCampaignId: String(source.campaignId || ''),
      sourceCampaignName: String(source.campaignName || ''),
      term: String(source.searchTerm || ''),
      product: String(source.product || ''),
      scope: 'SOURCE_CAMPAIGN',
      reviewTermId,
      suggestedMatchType: ['EXACT', 'PHRASE', 'BROAD'].includes(source.suggestedMatchType) ? source.suggestedMatchType : '',
      matchType: ['EXACT', 'PHRASE', 'BROAD'].includes(source.suggestedMatchType) ? source.suggestedMatchType : '',
    };
    negativeTermInput.value = negativeDraft.term;
    negativeTermInput.disabled = false;
    negativeAllCampaignsInput.checked = false;
    updateNegativeContext();
    negativeMatchSelect.value = negativeDraft.matchType;
    negativeMatchSelect.disabled = false;
    updateNegativeMatchSuggestion();
    updateNegativePreviewButton();
    negativePreviewResult.innerHTML = '';
    negativeConfirmLabel.hidden = true;
    negativeConfirmCheckbox.checked = false;
    negativeConfirmCheckbox.disabled = true;
    negativeApplyButton.disabled = true;
    negativeApplyButton.textContent = 'Confirmar e aplicar';
    setNegativeStatus('');
    negativeCampaignBookmarkNotice = '';
    negativeCampaignBookmarksSyncPending = true;
    updateNegativeContext();
    negativeDialog.showModal();
    void syncNegativeCampaignBookmarks();
  }

  function clearNegativePreview() {
    negativePreview = null;
    negativePreviewResult.innerHTML = '';
    negativeConfirmLabel.hidden = true;
    negativeConfirmCheckbox.checked = false;
    negativeConfirmCheckbox.disabled = true;
    updateNegativeApplyButton();
  }

  function updateNegativeApplyButton() {
    if (negativePreview && negativePreview.toCreateCount < 1) {
      negativeApplyButton.textContent = 'Negativa já existe';
      negativeApplyButton.disabled = true;
      return;
    }
    if (negativePreview?.toCreateCount > 0 && !negativeConfirmCheckbox.checked) {
      negativeApplyButton.textContent = 'Marque a confirmação acima';
      negativeApplyButton.disabled = true;
      return;
    }
    negativeApplyButton.textContent = 'Confirmar e aplicar';
    negativeApplyButton.disabled = !negativePreview || !negativeConfirmCheckbox.checked;
  }

  function setNegativeStatus(value, isError = false) {
    negativeStatus.textContent = value;
    negativeStatus.classList.toggle('is-error', isError);
    negativeStatus.classList.toggle('is-success', Boolean(value) && !isError);
  }

  function renderNegativePreview(preview) {
    const rows = preview.campaigns.map(campaign => `<tr><td>${escapeHtml(campaign.customerId)}</td><td><strong>${escapeHtml(campaign.campaignName)}</strong></td><td>${campaign.status === 'ENABLED' ? 'Ativa' : 'Pausada'}</td><td>${campaign.alreadyPresent ? '<span class="is-present">Já existe</span>' : '<span class="is-pending">Será criada</span>'}</td></tr>`).join('');
    const scopeLabel = preview.scope === 'PRODUCT' ? 'Campanhas Search ativas do produto nesta MCC' : 'Somente a campanha pré-selecionada';
    negativePreviewResult.innerHTML = `<div class="google-ads-search-terms-negative-summary"><strong>${escapeHtml(preview.product)}</strong><span>${escapeHtml(scopeLabel)} · ${preview.campaignCount} campanha(s) · ${preview.toCreateCount} nova(s) · ${preview.alreadyPresentCount} já existente(s)</span></div><div class="google-ads-search-terms-negative-table-wrap"><table><thead><tr><th>Conta</th><th>Campanha</th><th>Status</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    if (preview.toCreateCount > 0) {
      negativeConfirmLabel.hidden = false;
      negativeConfirmCheckbox.disabled = false;
      const matchLabel = negativeDraft.matchType === 'EXACT' ? 'exata' : negativeDraft.matchType === 'PHRASE' ? 'frase' : 'ampla';
      const confirmationText = preview.scope === 'PRODUCT'
        ? `Confirmo aplicar “${negativeDraft.term}” como negativa ${matchLabel} nas ${preview.toCreateCount} campanhas pendentes listadas acima.`
        : `Confirmo aplicar “${negativeDraft.term}” como negativa ${matchLabel} somente na campanha “${negativeDraft.sourceCampaignName}”.`;
      negativeConfirmLabel.querySelector('span').textContent = confirmationText;
    } else {
      negativeConfirmLabel.hidden = true;
      negativeConfirmCheckbox.checked = false;
      negativeConfirmCheckbox.disabled = true;
    }
    updateNegativeApplyButton();
  }

  async function previewNegativeKeyword() {
    if (!negativeDraft || !negativeMatchSelect.value || !isValidNegativeTerm(negativeTermInput.value)) {
      setNegativeStatus('Informe um termo com até 80 caracteres e 10 palavras antes de gerar a prévia.', true);
      return;
    }
    updateNegativeContext();
    negativeTermInput.value = negativeDraft.term;
    negativeDraft.matchType = negativeMatchSelect.value;
    negativeDraft.scope = negativeAllCampaignsInput.checked ? 'PRODUCT' : 'SOURCE_CAMPAIGN';
    clearNegativePreview();
    negativePreviewButton.disabled = true;
    negativeTermInput.disabled = true;
    negativeMatchSelect.disabled = true;
    negativeAllCampaignsInput.disabled = true;
    negativePreviewButton.textContent = 'Consultando campanhas…';
    setNegativeStatus(negativeDraft.scope === 'PRODUCT'
      ? 'Lendo campanhas Search ativas do produto nesta MCC; pausadas são excluídas. Nenhuma alteração será feita nesta etapa.'
      : 'Lendo somente a campanha pré-selecionada e suas negativas existentes. Nenhuma alteração será feita nesta etapa.');
    try {
      negativePreview = await previewGoogleAdsProductNegativeKeyword(negativeDraft);
      renderNegativePreview(negativePreview);
      setNegativeStatus(negativePreview.toCreateCount
        ? 'Confira a lista completa e marque a confirmação para habilitar a aplicação.'
        : 'A negativa já existe em todas as campanhas listadas; nenhuma gravação é necessária.');
      if (!negativePreview.toCreateCount && negativeDraft.reviewTermId) {
        const completedAtUtc = new Date().toISOString();
        const saved = saveReviewDecision(negativeDraft.reviewTermId, {
          status: 'negative', reasonCode: 'already_present', completedAtUtc,
          negativeTerm: negativeDraft.term, matchType: negativeDraft.matchType, scope: negativeDraft.scope,
        });
        if (saved) setMessage('A negativa já existia em todas as campanhas da prévia; revisão concluída sem nova gravação.');
      }
    } catch (error) {
      setNegativeStatus(error.message || 'Não foi possível gerar a prévia. Nenhuma campanha foi alterada.', true);
    } finally {
      negativeTermInput.disabled = false;
      negativeMatchSelect.disabled = false;
      negativeAllCampaignsInput.disabled = false;
      updateNegativePreviewButton(negativePreview ? 'Atualizar prévia' : 'Pré-visualizar campanhas');
    }
  }

  async function applyNegativeKeyword() {
    if (!negativeDraft || !negativePreview || negativePreview.term !== negativeDraft.term
        || negativePreview.matchType !== negativeDraft.matchType || negativePreview.scope !== negativeDraft.scope || !negativeConfirmCheckbox.checked
        || negativePreview.toCreateCount < 1) return;
    negativePreviewButton.disabled = true;
    negativeTermInput.disabled = true;
    negativeMatchSelect.disabled = true;
    negativeAllCampaignsInput.disabled = true;
    negativeConfirmCheckbox.disabled = true;
    negativeApplyButton.disabled = true;
    negativeApplyButton.textContent = 'Aplicando e verificando…';
    setNegativeStatus('O servidor está conferindo se a lista ainda corresponde à prévia antes de gravar.');
    const appliedPreview = negativePreview;
    let refreshedPreviewAvailable = false;
    try {
      let result = await applyGoogleAdsProductNegativeKeyword({
        ...negativeDraft,
        expectedCampaigns: appliedPreview.campaigns,
      });
      if (result.unverifiedCount > 0) {
        setNegativeStatus('O envio terminou sem confirmação imediata. Vou fazer uma nova leitura das campanhas; nenhuma gravação será repetida.');
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
          const refreshedPreview = await previewGoogleAdsProductNegativeKeyword(negativeDraft);
          const reconciled = reconcileGoogleAdsNegativeKeywordApplyResult({ applyResult: result, initialPreview: appliedPreview, refreshedPreview });
          if (reconciled) {
            result = reconciled;
            negativePreview = refreshedPreview;
            refreshedPreviewAvailable = true;
            renderNegativePreview(refreshedPreview);
          }
        } catch { /* Preserve the inconclusive apply result; the user can request a fresh preview. */ }
      }
      const added = result.results.filter(item => item.result === 'created_verified');
      let localKeywordHistoryRecorded = true;
      let localKeywordHistoryMessage = '';
      if (added.length) {
        if (typeof state.onRecordKeywordAdditions !== 'function') {
          localKeywordHistoryRecorded = false;
        } else {
          try {
            const historyResult = await state.onRecordKeywordAdditions({ managerCustomerId: String(state.campaignPrefill?.managerCustomerId || state.selectedManagerKey || ''), term: result.term, matchType: result.matchType, occurredAtUtc: result.verifiedAtUtc || new Date().toISOString(), results: added });
            localKeywordHistoryRecorded = historyResult?.recorded === true;
            localKeywordHistoryMessage = String(historyResult?.reason || '');
          } catch (error) {
            localKeywordHistoryRecorded = false;
            localKeywordHistoryMessage = String(error?.message || '');
          }
        }
      }
      const resultLabels = { created_verified: 'Negativa criada e confirmada', already_present: 'Já existia', write_unverified: 'Envio sem confirmação', failed: 'Não aplicada' };
      const detail = result.results.map(item => `<li><strong>${escapeHtml(item.campaign_name || item.campaignName || item.campaign_id || '')}</strong> · ${escapeHtml(resultLabels[item.result] || 'Resultado indisponível')}</li>`).join('');
      negativePreviewResult.insertAdjacentHTML('beforeend', `<details class="google-ads-search-terms-negative-outcomes"><summary>Resultado por campanha (${result.results.length})</summary><ul>${detail}</ul></details>`);
      setNegativeStatus((result.verified
        ? `${result.createdCount} negativa(s) criada(s) e confirmada(s); ${result.alreadyPresentCount} já existia(m). Nenhum status de campanha foi alterado.`
        : `Resultado parcial: ${result.createdCount} criada(s), ${result.alreadyPresentCount} já existia(m), ${result.unverifiedCount} sem confirmação e ${result.failedCount} falha(s). Confira no Google Ads; a prévia foi consumida. Clique em “Pré-visualizar campanhas” para consultar o estado atual antes de qualquer nova tentativa.`)
        + (localKeywordHistoryRecorded ? '' : ` A negativa foi aplicada, mas não entrou no Diário local${localKeywordHistoryMessage ? `: ${localKeywordHistoryMessage}` : '.'} Não repita a alteração; confira a campanha no Google Ads.`), !result.verified || !localKeywordHistoryRecorded);
      const completedCount = result.createdCount + result.alreadyPresentCount;
      const completedScope = result.scope === 'PRODUCT' ? 'produto nesta MCC' : 'somente a campanha selecionada';
      let reviewRecorded = true;
      if (result.verified && negativeDraft.reviewTermId) {
        const completedAtUtc = new Date().toISOString();
        reviewRecorded = saveReviewDecision(negativeDraft.reviewTermId, {
          status: 'negative', reasonCode: 'verified', completedAtUtc,
          negativeTerm: negativeDraft.term, matchType: negativeDraft.matchType, scope: negativeDraft.scope,
        });
      }
      setMessage(result.verified
        ? `Negativa confirmada em ${completedCount} ${completedCount === 1 ? 'campanha' : 'campanhas'} — ${completedScope}: ${result.product}.${reviewRecorded ? ' Revisão concluída.' : ' A revisão não foi salva localmente.'}`
        : 'A negativação teve resultado parcial. Confira a notificação da janela e o estado das campanhas antes de tentar novamente.', !result.verified || !reviewRecorded);
    } catch (error) {
      const reason = error.message || 'Não foi possível confirmar a negativação. Confira as campanhas no Google Ads antes de repetir.';
      setNegativeStatus(`${reason} A prévia foi consumida; clique em “Pré-visualizar campanhas” para conferir o estado atual antes de tentar novamente.`, true);
    } finally {
      // A successful reconciliation is itself a fresh read-only preview; otherwise, the attempted preview stays consumed.
      if (!refreshedPreviewAvailable) negativePreview = null;
      negativeTermInput.disabled = false;
      negativeMatchSelect.disabled = false;
      negativeAllCampaignsInput.disabled = false;
      negativeConfirmCheckbox.checked = false;
      if (refreshedPreviewAvailable && negativePreview) {
        negativeConfirmCheckbox.disabled = negativePreview.toCreateCount < 1;
        updateNegativePreviewButton('Atualizar prévia');
        updateNegativeApplyButton();
      } else {
        negativeConfirmCheckbox.disabled = true;
        negativeConfirmLabel.hidden = true;
        updateNegativePreviewButton('Pré-visualizar campanhas');
        negativeApplyButton.textContent = 'Prévia consumida';
        negativeApplyButton.disabled = true;
      }
    }
  }

  function currentAccounts() {
    return state.accounts?.accounts.filter(account => managerKey({ customerId: account.managerCustomerId }) === state.selectedManagerKey) || [];
  }

  function selectedAccounts() {
    return currentAccounts().filter(account => state.selectedCustomerIds.has(account.customerId));
  }

  function selectedCampaign() {
    const account = selectedAccounts()[0];
    const catalog = account ? state.campaignCatalogs.get(account.customerId) : null;
    return catalog?.campaigns.find(campaign => campaign.campaignId === state.campaignId)
      || (state.campaignPrefill?.campaignId === state.campaignId && account
        && account.customerId === state.campaignPrefill.customerId
        && account.managerCustomerId === state.campaignPrefill.managerCustomerId
        ? { campaignId: state.campaignPrefill.campaignId, campaignName: state.campaignPrefill.campaignName }
        : null);
  }

  function updateCampaignOptions() {
    const accounts = selectedAccounts();
    const account = accounts.length === 1 ? accounts[0] : null;
    const catalog = account ? state.campaignCatalogs.get(account.customerId) : null;
    const prefill = account && state.campaignPrefill?.campaignId === state.campaignId
      && account.customerId === state.campaignPrefill.customerId
      && account.managerCustomerId === state.campaignPrefill.managerCustomerId
      ? state.campaignPrefill : null;
    const loading = Boolean(account && state.campaignCatalogPendingCustomerId === account.customerId);
    const savedAt = account ? state.campaignCatalogSavedAt.get(account.customerId) : '';
    const selectedCampaignExists = catalog?.campaigns.some(item => item.campaignId === state.campaignId) || Boolean(prefill);
    if (!selectedCampaignExists) state.campaignId = '';

    const placeholder = loading && !catalog
      ? '<option value="" selected>Carregando campanhas…</option>'
      : '<option value="">Todas as campanhas</option>';
    const campaigns = catalog?.campaigns || [];
    const hasCatalogEntry = campaigns.some(item => item.campaignId === state.campaignId);
    const prefillOption = prefill && !hasCatalogEntry
      ? `<option value="${escapeHtml(prefill.campaignId)}" selected>${escapeHtml(prefill.campaignName)}</option>`
      : '';
    campaignSelect.innerHTML = placeholder + prefillOption + campaigns.map(item => `<option value="${escapeHtml(item.campaignId)}" ${item.campaignId === state.campaignId ? 'selected' : ''}>${escapeHtml(item.campaignName)}</option>`).join('');
    campaignSelect.disabled = state.accountsPending || state.queryPending || accounts.length !== 1 || (!prefill && (!catalog || !campaigns.length));

    campaignHint.hidden = Boolean(prefill && !state.pendingCampaignContext);
    if (state.pendingCampaignContext) campaignHint.textContent = 'A campanha foi identificada, mas esta MCC/conta não está na lista local. Atualize MCCs e contas para confirmar o vínculo; nenhuma busca foi iniciada.';
    else if (prefill) campaignHint.textContent = '';
    else if (accounts.length === 0) campaignHint.textContent = 'Marque uma conta para consultar; para filtrar uma campanha, deixe somente uma conta marcada.';
    else if (accounts.length > 1) campaignHint.textContent = 'Todas as campanhas consultará as contas marcadas. Para escolher uma campanha, marque somente uma conta.';
    else if (loading && catalog) campaignHint.textContent = `Usando a lista local (${catalog.campaignCount.toLocaleString('pt-BR')} campanhas). Atualizando em segundo plano${savedAt ? ` · cache de ${dateLabel(savedAt)}` : ''}.`;
    else if (loading) campaignHint.textContent = 'Carregando a lista de campanhas Search desta conta…';
    else if (catalog && state.campaignCatalogError) campaignHint.textContent = `${catalog.campaignCount.toLocaleString('pt-BR')} campanhas Search disponíveis no cache local${savedAt ? ` de ${dateLabel(savedAt)}` : ''}; não foi possível atualizar agora.`;
    else if (state.campaignCatalogError) campaignHint.textContent = state.campaignCatalogError;
    else if (!catalog) campaignHint.textContent = 'A lista de campanhas será carregada para esta conta.';
    else campaignHint.textContent = campaigns.length
      ? `${campaigns.length.toLocaleString('pt-BR')} campanha(s) Search encontrada(s). Todas é a opção padrão${savedAt ? ` · cache de ${dateLabel(savedAt)}` : ''}.`
      : 'Esta conta não tem campanhas Search disponíveis.';
  }

  async function loadCampaignCatalogForSelectedAccount() {
    const accounts = selectedAccounts();
    if (accounts.length !== 1 || !state.tokenReady) {
      updateCampaignOptions();
      return false;
    }
    const account = accounts[0];
    let catalog = state.campaignCatalogs.get(account.customerId) || null;
    let savedAtUtc = state.campaignCatalogSavedAt.get(account.customerId) || '';
    let isFresh = state.campaignCatalogFreshness.get(account.customerId) === true;
    if (!catalog) {
      const cached = loadGoogleAdsSearchTermsCampaignsCache(account.managerCustomerId, account.customerId);
      if (cached) {
        catalog = cached.catalog;
        savedAtUtc = cached.savedAtUtc;
        isFresh = cached.isFresh;
        state.campaignCatalogs.set(account.customerId, catalog);
        state.campaignCatalogSavedAt.set(account.customerId, savedAtUtc);
        state.campaignCatalogFreshness.set(account.customerId, isFresh);
        updateCampaignOptions();
      }
    }
    if (catalog && isFresh) {
      state.campaignCatalogError = '';
      updateCampaignOptions();
      return true;
    }
    if (state.campaignCatalogPendingCustomerId) return false;

    state.campaignCatalogError = '';
    state.campaignCatalogPendingCustomerId = account.customerId;
    syncControls();
    setMessage(`Carregando a lista de campanhas Search de ${account.name}…`);
    try {
      const payload = await fetchGoogleAdsSearchTermCampaigns({
        managerCustomerId: account.managerCustomerId,
        customerId: account.customerId,
      });
      const catalog = normalizeGoogleAdsSearchTermCampaigns(payload, {
        managerCustomerId: account.managerCustomerId,
        customerId: account.customerId,
      });
      state.campaignCatalogs.set(account.customerId, catalog);
      const refreshedAtUtc = new Date().toISOString();
      state.campaignCatalogSavedAt.set(account.customerId, refreshedAtUtc);
      state.campaignCatalogFreshness.set(account.customerId, true);
      try { saveGoogleAdsSearchTermsCampaignsCache(catalog, { savedAtUtc: refreshedAtUtc }); }
      catch { /* Keep the fresh campaign catalog available in memory. */ }
      setMessage(`${catalog.campaignCount.toLocaleString('pt-BR')} campanha(s) Search carregada(s) para ${account.name}.`);
      return true;
    } catch (error) {
      state.campaignCatalogError = error?.message || 'Não foi possível carregar as campanhas desta conta.';
      setMessage(catalog
        ? `Não foi possível atualizar as campanhas de ${account.name}; mantendo a lista local disponível. ${state.campaignCatalogError}`
        : state.campaignCatalogError, true);
      return Boolean(catalog);
    } finally {
      state.campaignCatalogPendingCustomerId = '';
      syncControls();
    }
  }

  function resetResults() {
    clearResultsColumnPickers();
    if (reviewExpiryTimer) window.clearTimeout(reviewExpiryTimer);
    reviewExpiryTimer = null;
    state.snapshotMode = false;
    state.reports = null;
    state.recommendations = [];
    state.dailyRecommendations = null;
    state.aiDatasetId = '';
    state.aiResponse = null;
    state.aiRecommendations = new Map();
    state.reviewStates = new Map();
    state.failures = [];
    state.progress = '';
    state.visibleCount = PAGE_SIZE;
    resultsArea.hidden = true;
    resultsArea.innerHTML = '';
  }

  function clearCampaignContext() {
    state.campaignPrefill = null;
    state.pendingCampaignContext = null;
    state.queuedCampaignContext = null;
  }

  function renderResults() {
    clearResultsColumnPickers();
    if (reviewExpiryTimer) window.clearTimeout(reviewExpiryTimer);
    reviewExpiryTimer = null;
    syncAiRecommendations();
    if (state.reports === null && !state.queryPending) {
      resultsArea.hidden = true;
      resultsArea.innerHTML = '';
      return;
    }
    resultsArea.hidden = false;
    if (state.groupingMode === 'day' && !state.queryPending && Array.isArray(state.reports) && state.dailyRecommendations === null) {
      state.dailyRecommendations = summarizeGoogleAdsSearchTerms(state.reports, state.campaignTargets, { groupByDate: true });
    }
    const visibleRecommendations = state.groupingMode === 'day' ? state.dailyRecommendations || [] : state.recommendations;
    resultsArea.innerHTML = renderGoogleAdsSearchTermsResults({
      reports: state.reports || [],
      failures: state.failures,
      pending: state.queryPending,
      progress: state.progress,
      dateFrom: state.dateFrom,
      dateTo: state.dateTo,
      visibleCount: state.visibleCount,
      pageSize: PAGE_SIZE,
      showTitle: false,
      showDiaryReturnButton: Boolean(state.returnToDiary && typeof state.onReturnToDiary === 'function'),
      campaignFilterName: selectedCampaign()?.campaignName || '',
      recommendations: visibleRecommendations,
      aiRecommendations: state.aiRecommendations,
      reviewStates: state.reviewStates,
      reviewEnabled: Boolean(state.aiDatasetId),
      groupingMode: state.groupingMode,
      minimumImpressions: state.minimumImpressions,
      showGroupingControl: true,
      showPurchaseMetrics: true,
    });
    mountResultsColumnPickers();
    const nextReviewExpiry = [...state.reviewStates.values()]
      .filter(item => item.status === 'monitor')
      .map(item => Date.parse(item.expiresAtUtc || ''))
      .filter(value => Number.isFinite(value) && value > Date.now())
      .sort((a, b) => a - b)[0];
    if (nextReviewExpiry) reviewExpiryTimer = window.setTimeout(() => renderResults(), Math.min(2_147_000_000, Math.max(0, nextReviewExpiry - Date.now() + 50)));
  }

  function setApiCaptures(captures) {
    if (captures === state.apiCaptures) return false;
    state.apiCaptures = Array.isArray(captures) ? captures : [];
    state.campaignTargets = buildGoogleAdsSearchTermCampaignTargets(state.apiCaptures);
    if (state.reports && !state.queryPending) {
      state.recommendations = summarizeGoogleAdsSearchTerms(state.reports, state.campaignTargets);
      state.dailyRecommendations = null;
      renderResults();
    }
    return true;
  }

  function updateAccountOptions({ selectAll = false } = {}) {
    const accounts = currentAccounts();
    const availableIds = new Set(accounts.map(account => account.customerId));
    state.selectedCustomerIds = new Set([...state.selectedCustomerIds].filter(id => availableIds.has(id)));
    if (selectAll) state.selectedCustomerIds = new Set(availableIds);
    accountOptions.innerHTML = accounts.length
      ? accounts.map(account => `<label class="google-ads-search-account-option"><input type="checkbox" value="${escapeHtml(account.customerId)}" ${state.selectedCustomerIds.has(account.customerId) ? 'checked' : ''} ${state.queryPending || state.accountsPending ? 'disabled' : ''}><span><strong>${escapeHtml(account.name)}</strong><small>Conta: ${escapeHtml(String(account.customerId).replace(/\D/g, '').slice(-4))} · ${escapeHtml(account.currencyCode)}</small></span></label>`).join('')
      : '<div class="google-ads-search-account-empty">Nenhuma conta disponível nesta MCC. Atualize a lista de MCCs e contas.</div>';
    const busy = state.queryPending || state.accountsPending || Boolean(state.campaignCatalogPendingCustomerId);
    selectAllButton.disabled = !accounts.length || state.selectedCustomerIds.size === accounts.length || busy;
    clearAccountsButton.disabled = state.selectedCustomerIds.size === 0 || busy;
  }

  function updateManagers({ selectFirst = false } = {}) {
    const managers = state.accounts?.managers || [];
    const selectedStillExists = managers.some(manager => managerKey(manager) === state.selectedManagerKey);
    const preservePendingContext = Boolean(state.pendingCampaignContext);
    if (!preservePendingContext && (selectFirst || !selectedStillExists)) state.selectedManagerKey = managers.length ? managerKey(managers[0]) : '';
    managerSelect.innerHTML = managers.length
      ? managers.map(manager => `<option value="${escapeHtml(managerKey(manager))}">${escapeHtml(manager.name)}${manager.customerId ? ` · ${escapeHtml(manager.customerId)}` : ''}</option>`).join('')
      : '<option value="">Atualize a lista de MCCs e contas</option>';
    managerSelect.value = state.selectedManagerKey;
    updateAccountOptions({ selectAll: !preservePendingContext && (selectFirst || !selectedStillExists) });
    if (!state.accounts) {
      directoryStatus.textContent = 'Ainda não há lista local. Atualize as MCCs e contas para escolher onde consultar.';
      return;
    }
    const managerCount = managers.filter(manager => manager.customerId != null).length;
    const count = state.accounts.accounts.length;
    const savedAt = state.accountsCacheAt ? ` · lista atualizada em ${dateLabel(state.accountsCacheAt)} (São Paulo)` : '';
    directoryStatus.textContent = `${managerCount} MCC(s) · ${count} conta(s) cliente${savedAt}${state.accounts.warningCount ? ` · ${state.accounts.warningCount} aviso(s)` : ''}`;
  }

  function applyCampaignContext(rawContext) {
    const context = normalizeCampaignContext(rawContext);
    if (!context) return false;
    state.returnToDiary = context.returnToDiary;
    if (state.queryPending) {
      state.queuedCampaignContext = context;
      setMessage('Uma consulta anterior ainda está terminando. O filtro desta campanha será aplicado assim que ela concluir; nenhuma consulta nova foi iniciada.');
      return true;
    }
    const account = cachedAccountForContext(state.accounts, context);
    resetResults();
    if (context.autoQuery) {
      const dates = yesterdayAndTodayDates(account?.timeZone);
      state.dateFrom = dates.dateFrom;
      state.dateTo = dates.dateTo;
      dateFromInput.value = dates.dateFrom;
      dateToInput.value = dates.dateTo;
    } else if (context.includeToday) {
      const dates = defaultDates(7, account?.timeZone, { includeToday: true });
      state.dateFrom = dates.dateFrom;
      state.dateTo = dates.dateTo;
      dateFromInput.value = dates.dateFrom;
      dateToInput.value = dates.dateTo;
    }
    state.campaignCatalogError = '';
    state.queuedCampaignContext = null;
    if (!account) {
      state.pendingCampaignContext = context;
      state.campaignPrefill = null;
      state.campaignId = '';
      state.selectedManagerKey = context.managerCustomerId;
      state.selectedCustomerIds = new Set();
      updateManagers();
      syncControls();
      setMessage(context.autoQuery
        ? `Não encontrei localmente a conta vinculada à campanha ${context.campaignName}. Atualize MCCs e contas para confirmar o vínculo; a consulta não foi iniciada.`
        : `Não encontrei localmente a conta vinculada à campanha ${context.campaignName}. Atualize MCCs e contas para confirmar o vínculo antes de consultar.`, true);
      return false;
    }
    state.pendingCampaignContext = null;
    state.campaignPrefill = context;
    state.campaignId = context.campaignId;
    state.selectedManagerKey = context.managerCustomerId;
    state.selectedCustomerIds = new Set([account.customerId]);
    updateManagers();
    syncControls();
    if (context.autoQuery && state.tokenReady) {
      setMessage(`Campanha ${context.campaignName} selecionada. Iniciando a consulta de ontem e hoje, inclusive (${state.dateFrom} a ${state.dateTo}, fuso da conta). O dia de hoje ainda pode estar incompleto.`);
      void runQuery();
    } else if (context.autoQuery) {
      setMessage(`Campanha ${context.campaignName} selecionada para ${state.dateFrom} a ${state.dateTo}, mas o token compartilhado do Hub não está configurado. A consulta não foi iniciada.`, true);
    } else {
      setMessage(campaignFiltersAppliedMessage(context, state.dateFrom, state.dateTo, state.tokenReady), !state.tokenReady);
    }
    return true;
  }

  function setReturnToDiaryContext(context) {
    state.returnToDiary = context || null;
    if (state.reports !== null || state.queryPending) renderResults();
  }

  function setReturnToDiaryHandler(handler) {
    state.onReturnToDiary = typeof handler === 'function' ? handler : null;
    if (state.reports !== null || state.queryPending) renderResults();
  }

  function setKeywordAdditionRecorder(handler) { state.onRecordKeywordAdditions = typeof handler === 'function' ? handler : null; }

  function syncControls() {
    const busy = state.accountsPending || state.queryPending || Boolean(state.campaignCatalogPendingCustomerId);
    refreshButton.disabled = !state.tokenReady || busy;
    refreshButton.textContent = state.accountsPending ? 'Atualizando lista…' : 'Atualizar MCCs e contas';
    managerSelect.disabled = !state.accounts?.managers.length || busy;
    dateFromInput.disabled = busy;
    dateToInput.disabled = busy;
    runButton.disabled = !state.tokenReady || selectedAccounts().length === 0 || busy;
    runButton.textContent = state.queryPending ? 'Consultando termos…' : 'Consultar termos';
    updateAccountOptions();
    updateCampaignOptions();
  }

  async function refreshAccounts() {
    if (!state.tokenReady) {
      setMessage('Configure primeiro o token compartilhado em Configurações globais.', true);
      return false;
    }
    const previousAccounts = state.accounts;
    state.accountsPending = true;
    resetResults();
    syncControls();
    setMessage('Consultando as MCCs acessíveis e atualizando a lista local…');
    try {
      const requestedContext = state.campaignPrefill || state.pendingCampaignContext;
      state.accounts = normalizeGoogleAdsAccounts(await fetchGoogleAdsAccounts());
      state.campaignCatalogs.clear();
      state.campaignCatalogSavedAt.clear();
      state.campaignCatalogFreshness.clear();
      state.campaignCatalogError = '';
      state.accountsCacheAt = new Date().toISOString();
      try { saveGoogleAdsAccountsCache(state.accounts, { savedAtUtc: state.accountsCacheAt }); }
      catch { /* Keep the fresh directory in memory if browser storage is unavailable. */ }
      if (requestedContext) {
        state.pendingCampaignContext = requestedContext;
        state.campaignPrefill = null;
        state.campaignId = '';
        state.selectedManagerKey = requestedContext.managerCustomerId;
        state.selectedCustomerIds = new Set();
        updateManagers();
        applyCampaignContext(requestedContext);
      } else {
        state.campaignId = '';
        state.campaignPrefill = null;
        state.pendingCampaignContext = null;
        updateManagers({ selectFirst: true });
        setMessage(state.accounts.warningCount
          ? `Lista carregada com ${state.accounts.warningCount} aviso(s); confira as contas sem acesso completo.`
          : `${state.accounts.accounts.length} conta(s) cliente encontrada(s) e disponíveis para seleção.`);
      }
      return true;
    } catch (error) {
      state.accounts = previousAccounts;
      updateManagers();
      setMessage(previousAccounts
        ? `Não consegui atualizar a lista; mantive o diretório local existente. ${error.message || ''}`
        : error.message || 'Não foi possível carregar as MCCs e contas.', true);
      return false;
    } finally {
      state.accountsPending = false;
      syncControls();
      updateManagers();
      if (selectedAccounts().length === 1 && !state.campaignPrefill && !state.pendingCampaignContext) void loadCampaignCatalogForSelectedAccount();
    }
  }

  async function runQuery() {
    if (state.queryPending) return;
    if (!state.tokenReady) {
      setMessage('Configure primeiro o token compartilhado em Configurações globais.', true);
      return;
    }
    const accounts = selectedAccounts();
    if (!accounts.length) {
      setMessage('Selecione pelo menos uma conta Google Ads.', true);
      return;
    }
    const dateFrom = dateFromInput.value;
    const dateTo = dateToInput.value;
    const range = validateGoogleAdsSearchTermsDateRange(dateFrom, dateTo);
    if (!range.valid) {
      setMessage(range.reason === 'search_terms_date_range_too_large'
        ? 'O intervalo máximo é de 31 dias. Reduza as datas e tente novamente.'
        : 'Confira as datas: o início deve ser anterior ou igual ao fim.', true);
      return;
    }

    state.dateFrom = dateFrom;
    state.dateTo = dateTo;
    const campaignId = campaignSelect.value || null;
    state.campaignId = campaignId || '';
    if (campaignId && accounts.length !== 1) {
      setMessage('Para filtrar por campanha, marque somente a conta em que ela está.', true);
      return;
    }
    const consultationId = createGoogleAdsSearchTermsConsultationId();
    state.snapshotMode = false;
    state.reports = [];
    state.recommendations = [];
    state.dailyRecommendations = null;
    state.failures = [];
    state.progress = `Preparando consulta para ${accounts.length} conta(s)…`;
    state.visibleCount = PAGE_SIZE;
    state.queryPending = true;
    syncControls();
    renderResults();
    setMessage(campaignId
      ? `Consultando a campanha selecionada em ${accounts[0].name}. A consulta não grava dados nem altera campanhas.`
      : `Consultando ${accounts.length} conta(s) em sequência. A consulta não grava dados nem altera campanhas.`);
    try {
      const result = await queryGoogleAdsSearchTerms({
        accounts,
        managers: state.accounts?.managers || [],
        dateFrom,
        dateTo,
        campaignId,
        includePurchaseMetrics: true,
        onProgress: ({ phase, account, index, total, ok, report, failure }) => {
          if (phase === 'completed') {
            if (ok) {
              state.reports.push(report);
              state.dailyRecommendations = null;
            }
            else state.failures.push(failure);
          }
          state.progress = phase === 'started'
            ? `Consultando ${account.name} · ${index + 1} de ${total}…`
            : `${index + 1} de ${total} conta(s) processada(s)${ok ? '' : ' · houve falha'}…`;
          renderResults();
        },
      });
      const completedAtUtc = new Date().toISOString();
      state.reports = result.reports;
      state.failures = result.failures;
      state.recommendations = summarizeGoogleAdsSearchTerms(state.reports, state.campaignTargets);
      state.dailyRecommendations = null;
      if (!result.reports.length) setMessage(`Nenhuma das ${accounts.length} conta(s) retornou uma consulta completa. Confira os erros abaixo.`, true);
      else {
        let snapshotStatus = '';
        try {
          const snapshot = await saveGoogleAdsSearchTermsSnapshot({
            consultationId,
            managerKey: state.selectedManagerKey,
            selectedCustomerIds: accounts.map(account => account.customerId),
            dateFrom,
            dateTo,
            campaignId,
            campaignName: campaignId ? String(selectedCampaign()?.campaignName || '').slice(0, 240) : '',
            reports: result.reports,
            failures: result.failures,
          }, { completedAtUtc, consultationId });
          snapshotStatus = snapshot.alreadySaved
            ? ` Snapshot desta consulta já estava salvo (${dateLabel(snapshot.snapshot.completedAtUtc)}); nenhuma cópia foi criada.`
            : ` Snapshot local salvo (${dateLabel(snapshot.snapshot.completedAtUtc)}).`;
        } catch (error) {
          snapshotStatus = ` Não foi possível salvar o snapshot: ${error.message || 'armazenamento indisponível'}.`;
        }
        try {
          const saved = saveGoogleAdsSearchTermsCache({
            consultationId,
            managerKey: state.selectedManagerKey,
            selectedCustomerIds: accounts.map(account => account.customerId),
            dateFrom,
            dateTo,
            campaignId,
            campaignName: campaignId ? String(selectedCampaign()?.campaignName || '').slice(0, 240) : '',
            reports: result.reports,
            failures: result.failures,
          });
          state.queryCacheAtUtc = saved.savedAtUtc;
          setMessage(result.failures.length
            ? `Consulta parcial: ${result.reports.length} conta(s) concluída(s); ${result.failures.length} falhou. O resultado foi salvo no cache local (${dateLabel(saved.savedAtUtc)}). Reabrir a tela não fará nova consulta.${snapshotStatus}`
            : `Consulta concluída para ${result.reports.length} conta(s) e salva no cache local (${dateLabel(saved.savedAtUtc)}). Reabrir a tela não fará nova consulta.${snapshotStatus}`);
        } catch (error) {
          state.queryCacheAtUtc = '';
          setMessage(`Consulta concluída, mas não foi possível salvá-la no cache local: ${error.message || 'armazenamento indisponível'}. Os resultados ficam visíveis enquanto esta tela estiver aberta.${snapshotStatus}`, true);
        }
      }
    } catch (error) {
      state.failures.push({ accountName: 'Consulta', message: error.message || 'Não foi possível concluir a consulta.' });
      state.recommendations = summarizeGoogleAdsSearchTerms(state.reports || [], state.campaignTargets);
      state.dailyRecommendations = null;
      setMessage(error.message || 'Não foi possível concluir a consulta.', true);
    } finally {
      state.queryPending = false;
      state.progress = '';
      syncControls();
      renderResults();
      if (state.queuedCampaignContext) {
        const queuedContext = state.queuedCampaignContext;
        state.queuedCampaignContext = null;
        applyCampaignContext(queuedContext);
      }
    }
  }

  refreshButton.addEventListener('click', refreshAccounts);
  runButton.addEventListener('click', runQuery);
  managerSelect.addEventListener('change', () => {
    clearCampaignContext();
    state.selectedManagerKey = managerSelect.value;
    state.selectedCustomerIds = new Set();
    state.campaignId = '';
    state.campaignCatalogError = '';
    updateAccountOptions({ selectAll: true });
    resetResults();
    syncControls();
    void loadCampaignCatalogForSelectedAccount();
  });
  accountOptions.addEventListener('change', event => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    clearCampaignContext();
    if (input.checked) state.selectedCustomerIds.add(input.value);
    else state.selectedCustomerIds.delete(input.value);
    state.campaignId = '';
    state.campaignCatalogError = '';
    resetResults();
    syncControls();
    void loadCampaignCatalogForSelectedAccount();
  });
  selectAllButton.addEventListener('click', () => {
    clearCampaignContext();
    state.selectedCustomerIds = new Set(currentAccounts().map(account => account.customerId));
    state.campaignId = '';
    state.campaignCatalogError = '';
    resetResults();
    syncControls();
  });
  clearAccountsButton.addEventListener('click', () => {
    clearCampaignContext();
    state.selectedCustomerIds = new Set();
    state.campaignId = '';
    state.campaignCatalogError = '';
    resetResults();
    syncControls();
  });
  campaignSelect.addEventListener('change', () => {
    clearCampaignContext();
    state.campaignId = campaignSelect.value;
    resetResults();
    syncControls();
  });
  dateFromInput.addEventListener('change', () => { state.dateFrom = dateFromInput.value; resetResults(); });
  dateToInput.addEventListener('change', () => { state.dateTo = dateToInput.value; resetResults(); });
  aiImportApplyButton.addEventListener('click', () => {
    try {
      if (!state.reports?.length || !state.recommendations.length || !state.aiDatasetId) {
        throw new Error('Consulte os termos e aguarde a consulta terminar antes de importar uma análise.');
      }
      const response = parseGoogleAdsSearchTermsAiResponse(aiJsonInput.value, {
        datasetId: state.aiDatasetId,
        knownTermIds: new Set(state.recommendations.map(item => item.termId)),
      });
      saveGoogleAdsSearchTermsAiResponse(response);
      state.aiResponse = response;
      state.aiRecommendations = indexGoogleAdsSearchTermsAiRecommendations(response);
      aiImportStatus.textContent = `${response.recommendations.length} recomendação(ões) validadas e salvas neste navegador.`;
      aiImportStatus.classList.remove('is-error');
      aiImportStatus.classList.add('is-success');
      renderResults();
      aiImportDialog.close();
      setMessage(`${response.recommendations.length} avaliação(ões) da IA importadas para esta consulta. Nenhuma campanha foi alterada.`);
    } catch (error) {
      aiImportStatus.textContent = error.message || 'Não foi possível validar a resposta JSON.';
      aiImportStatus.classList.add('is-error');
      aiImportStatus.classList.remove('is-success');
    }
  });
  aiJsonInput.addEventListener('input', () => {
    aiImportClipboardEdited = true;
    if (aiImportApplyButton.disabled) {
      aiImportStatus.textContent = 'Conteúdo digitado será mantido enquanto a leitura da área de transferência termina.';
      aiImportStatus.classList.remove('is-error', 'is-success');
    }
  });
  aiImportDialog.addEventListener('close', () => {
    aiImportClipboardReadId += 1;
    aiImportApplyButton.disabled = false;
  });
  aiImportDialog.addEventListener('click', event => {
    if (event.target === aiImportDialog || event.target.closest('[data-close-ai-import]')) aiImportDialog.close();
  });
  reviewDialog.addEventListener('click', event => {
    if (event.target === reviewDialog || event.target.closest('[data-close-review]')) {
      reviewDialog.close();
      return;
    }
    if (!reviewDraft) return;
    if (event.target.closest('[data-review-keep]')) {
      reviewActions.hidden = true;
      reviewReasons.hidden = false;
      reviewStatus.textContent = 'Escolha um motivo para registrar por que o termo será mantido.';
      return;
    }
    const reasonButton = event.target.closest('[data-review-reason]');
    if (reasonButton) {
      const code = reasonButton.dataset.reviewReason;
      const completedAtUtc = new Date().toISOString();
      if (saveReviewDecision(reviewDraft.termId, { status: 'keep', reasonCode: code, completedAtUtc })) {
        reviewDialog.close();
        setMessage(`Revisão concluída: “${reviewDraft.searchTerm}” mantido · ${reviewReasonLabels[code] || 'motivo selecionado'}.`);
      }
      return;
    }
    if (event.target.closest('[data-review-monitor]')) {
      const completedAt = Date.now();
      const completedAtUtc = new Date(completedAt).toISOString();
      const expiresAtUtc = new Date(completedAt + 24 * 60 * 60 * 1000).toISOString();
      if (saveReviewDecision(reviewDraft.termId, { status: 'monitor', reasonCode: 'monitor_24h', completedAtUtc, expiresAtUtc })) {
        reviewDialog.close();
        setMessage(`“${reviewDraft.searchTerm}” está monitorado por 24 horas; a revisão volta a ficar pendente após esse prazo.`);
      }
      return;
    }
    if (event.target.closest('[data-review-manual-negative]')) {
      const completedAtUtc = new Date().toISOString();
      if (saveReviewDecision(reviewDraft.termId, {
        status: 'negative', reasonCode: 'manual_negative', completedAtUtc,
        negativeTerm: reviewDraft.searchTerm,
      })) {
        reviewDialog.close();
        setMessage(`“${reviewDraft.searchTerm}” marcado como negativado manualmente. A revisão foi concluída neste navegador; nenhuma alteração foi enviada ao Google Ads.`);
      }
      return;
    }
  });
  reviewNegateButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (reviewNegativeOpening) return;
    const group = reviewDraft;
    if (!group) {
      reviewStatus.textContent = 'Não foi possível identificar o termo desta revisão. Feche e abra a revisão novamente.';
      return;
    }
    const parsedCampaign = parseGoogleAdsCampaignName(group.campaignName);
    const ai = state.aiRecommendations.get(group.termId);
    const source = {
      managerCustomerId: group.managerCustomerId,
      customerId: group.customerId,
      campaignId: group.campaignId,
      campaignName: group.campaignName,
      searchTerm: group.searchTerm,
      product: parsedCampaign.ok ? parsedCampaign.product : '',
      suggestedMatchType: ai?.negative_match_type || '',
    };
    const reviewTermId = group.termId;
    reviewNegativeOpening = true;
    reviewNegateButton.disabled = true;
    reviewDialog.close();
    window.setTimeout(() => {
      try {
        openNegativeFlow(source, reviewTermId);
      } catch (error) {
        reviewNegativeOpening = false;
        reviewNegateButton.disabled = false;
        setMessage(`Não foi possível abrir a negativação: ${error.message || 'erro inesperado'}`, true);
      }
    }, 0);
  });
  negativeDialog.addEventListener('click', event => {
    if (event.target === negativeDialog || event.target.closest('[data-close-negative]')) negativeDialog.close();
  });
  negativeScopeSummary.addEventListener('click', event => {
    const link = event.target.closest?.('[data-negative-open-campaign-list]');
    if (!link || !negativeDraft) return;
    event.preventDefault();
    if (link.getAttribute('aria-busy') === 'true') return;
    const match = currentNegativeCampaignBookmarkMatch();
    if (match.status !== 'matched' || !match.bookmark?.url) {
      void syncNegativeCampaignBookmarks();
      return;
    }
    const status = negativeScopeSummary.querySelector('[data-negative-campaign-link-status]');
    link.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'Abrindo Campanhas do Google Ads pela extensão…';
    void openGoogleAdsResourcesViaExtension({
      document: negativeBookmarkDocument,
      window: negativeBookmarkWindow,
      accountId: negativeDraft.sourceCustomerId,
      resourceUrl: match.bookmark.url,
    }).then(result => {
      if (result?.ok !== true) throw new Error(result?.message || 'Não foi possível abrir Campanhas pela extensão Hub 2.0.');
      if (status) status.textContent = result.message || 'A listagem de Campanhas foi aberta pela extensão Hub 2.0.';
    }).catch(error => {
      if (status) status.textContent = error?.message || 'Não foi possível abrir Campanhas pela extensão Hub 2.0.';
    }).finally(() => link.removeAttribute('aria-busy'));
  });
  negativeDialog.addEventListener('close', () => {
    reviewNegativeOpening = false;
    reviewNegateButton.disabled = false;
    negativeDraft = null;
    negativePreview = null;
    negativeTermInput.value = '';
    negativeTermInput.disabled = false;
    negativeMatchSelect.value = '';
    negativeMatchSelect.disabled = false;
    negativeMatchSuggestion.hidden = true;
    negativeMatchSuggestion.textContent = '';
    negativeAllCampaignsInput.checked = false;
    negativeAllCampaignsInput.disabled = false;
    negativePreviewButton.disabled = true;
    negativePreviewButton.textContent = 'Pré-visualizar campanhas';
    negativeApplyButton.disabled = true;
    negativeApplyButton.textContent = 'Confirmar e aplicar';
    negativePreviewResult.innerHTML = '';
    negativeConfirmLabel.hidden = true;
    negativeConfirmCheckbox.checked = false;
    negativeConfirmCheckbox.disabled = true;
    setNegativeStatus('');
  });
  negativeMatchSelect.addEventListener('change', () => {
    if (!negativeDraft) return;
    negativeDraft.matchType = negativeMatchSelect.value;
    clearNegativePreview();
    updateNegativeMatchSuggestion();
    updateNegativePreviewButton();
    setNegativeStatus('');
  });
  negativeAllCampaignsInput.addEventListener('change', () => {
    if (!negativeDraft) return;
    updateNegativeContext();
    clearNegativePreview();
    updateNegativePreviewButton();
    setNegativeStatus(negativeAllCampaignsInput.checked
      ? 'Escopo ampliado para todas as campanhas Search do produto nesta MCC. Gere uma nova prévia.'
      : 'Escopo padrão: somente a campanha pré-selecionada acima. Gere uma nova prévia.');
  });
  negativeTermInput.addEventListener('input', () => {
    if (!negativeDraft) return;
    updateNegativeContext();
    clearNegativePreview();
    updateNegativePreviewButton();
    setNegativeStatus(isValidNegativeTerm(negativeTermInput.value)
      ? 'Termo atualizado. Gere uma nova prévia para conferir o texto e as campanhas.'
      : 'Informe um termo com até 80 caracteres e 10 palavras.', !isValidNegativeTerm(negativeTermInput.value));
  });
  negativePreviewButton.addEventListener('click', previewNegativeKeyword);
  negativeConfirmCheckbox.addEventListener('change', updateNegativeApplyButton);
  negativeApplyButton.addEventListener('click', applyNegativeKeyword);
  resultsArea.addEventListener('change', event => {
    const minimumInput = event.target.closest('[data-google-ads-search-terms-min-impressions]');
    if (minimumInput) {
      if (state.queryPending) return;
      const requested = Number(minimumInput.value);
      state.minimumImpressions = Number.isFinite(requested) && requested > 0
        ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(requested)) : 0;
      const restoreFocus = document.activeElement === minimumInput;
      renderResults();
      if (restoreFocus) resultsArea.querySelector('[data-google-ads-search-terms-min-impressions]')?.focus();
      return;
    }
    const groupingSelect = event.target.closest('[data-google-ads-search-terms-grouping]');
    if (!groupingSelect || state.queryPending) return;
    const nextMode = groupingSelect.value === 'day' ? 'day' : 'period';
    if (nextMode === state.groupingMode) return;
    state.groupingMode = nextMode;
    renderResults();
    resultsArea.querySelector('[data-google-ads-search-terms-grouping]')?.focus();
  });
  resultsArea.addEventListener('click', async event => {
    const returnToDiaryButton = event.target.closest('[data-google-ads-search-terms-return-to-diary]');
    if (returnToDiaryButton) {
      if (!state.returnToDiary || typeof state.onReturnToDiary !== 'function') return;
      try { state.onReturnToDiary({ ...state.returnToDiary }); }
      catch { setMessage('Não foi possível retornar ao Diário da campanha.', true); }
      return;
    }
    const aiImportButton = event.target.closest('[data-google-ads-search-terms-ai-import]');
    if (aiImportButton) {
      if (!state.reports?.length || !state.recommendations.length) {
        setMessage('A consulta atual não contém termos para analisar. Consulte termos de pesquisa primeiro.', true);
        return;
      }
      const clipboardReadId = ++aiImportClipboardReadId;
      aiImportClipboardEdited = false;
      aiJsonInput.value = '';
      aiImportStatus.textContent = 'Lendo a área de transferência…';
      aiImportStatus.classList.remove('is-error', 'is-success');
      aiImportApplyButton.disabled = true;
      let clipboardRead;
      try {
        if (typeof navigator.clipboard?.readText !== 'function') throw new Error('clipboard-unavailable');
        clipboardRead = navigator.clipboard.readText();
      } catch {
        clipboardRead = Promise.reject(new Error('clipboard-unavailable'));
      }
      aiImportDialog.showModal();
      aiJsonInput.focus();
      Promise.resolve(clipboardRead).then(text => {
        if (clipboardReadId !== aiImportClipboardReadId || !aiImportDialog.open) return;
        aiImportApplyButton.disabled = false;
        if (aiImportClipboardEdited) return;
        if (typeof text !== 'string' || !text.trim()) {
          aiImportStatus.textContent = 'A área de transferência está vazia. Cole o JSON aqui ou copie a resposta da IA antes de abrir.';
          aiImportStatus.classList.add('is-error');
          aiImportStatus.classList.remove('is-success');
          aiJsonInput.focus();
          return;
        }
        aiJsonInput.value = text;
        aiImportStatus.textContent = 'Texto carregado da área de transferência. Confira e clique em Validar e importar.';
        aiImportStatus.classList.remove('is-error');
        aiImportStatus.classList.add('is-success');
        aiJsonInput.focus();
        aiJsonInput.setSelectionRange(text.length, text.length);
      }).catch(() => {
        if (clipboardReadId !== aiImportClipboardReadId || !aiImportDialog.open) return;
        aiImportApplyButton.disabled = false;
        if (aiImportClipboardEdited) return;
        aiImportStatus.textContent = 'Não foi possível ler a área de transferência. Permita o acesso no navegador ou cole o JSON manualmente.';
        aiImportStatus.classList.add('is-error');
        aiImportStatus.classList.remove('is-success');
        aiJsonInput.focus();
      });
      return;
    }
    const reviewButton = event.target.closest('[data-google-ads-search-terms-review]');
    if (reviewButton) {
      openReview(reviewButton.dataset.googleAdsSearchTermsReview);
      return;
    }
    const negativeButton = event.target.closest('[data-google-ads-search-terms-negative]');
    if (negativeButton && !negativeButton.disabled) {
      openNegativeFlow({
        managerCustomerId: negativeButton.dataset.managerId,
        customerId: negativeButton.dataset.customerId,
        campaignId: negativeButton.dataset.campaignId,
        campaignName: negativeButton.dataset.campaignName,
        searchTerm: negativeButton.dataset.term,
        product: negativeButton.dataset.product,
        suggestedMatchType: negativeButton.dataset.suggestedMatchType,
      }, negativeButton.dataset.termId || '');
      return;
    }
    const exportButton = event.target.closest('[data-google-ads-search-terms-export]');
    if (exportButton) {
      if (state.queryPending || !state.reports?.length) return;
      const analysis = buildGoogleAdsSearchTermsAnalysisPackage({
        reports: state.reports,
        failures: state.failures,
        recommendations: state.recommendations,
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        campaignFilterName: selectedCampaign()?.campaignName || '',
        campaignId: state.campaignId,
        queryCacheAtUtc: state.queryCacheAtUtc,
      });
      if (exportButton.dataset.googleAdsSearchTermsExport === 'copy') {
        try {
          const clipboard = globalThis.navigator?.clipboard;
          if (!clipboard?.writeText) throw new Error('Área de transferência indisponível neste contexto.');
          await clipboard.writeText(analysis.copyText);
          setMessage(`Pacote de análise copiado para a área de transferência: ${analysis.summaryRowCount} termo(s) agregado(s). O relatório completo também inclui ${analysis.dailyRowCount} linha(s) diárias.`);
        } catch (error) {
          setMessage(`Não foi possível copiar o pacote: ${error.message || 'permissão da área de transferência indisponível'}. Use o botão para baixar o relatório completo.`, true);
        }
      } else if (exportButton.dataset.googleAdsSearchTermsExport === 'download') {
        const blob = new Blob([analysis.fullReport], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = analysis.fileName;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage(`Relatório completo baixado: ${analysis.summaryRowCount} termo(s) agregado(s) e ${analysis.dailyRowCount} linha(s) diárias. Nenhuma nova consulta à API foi feita.`);
      }
      return;
    }
    const button = event.target.closest('[data-google-ads-search-terms-more]');
    if (!button || state.queryPending) return;
    state.visibleCount += PAGE_SIZE;
    renderResults();
  });

  async function backfillCurrentCacheSnapshot() {
    if (!latestCachedQuery) return;
    try {
      await saveGoogleAdsSearchTermsSnapshot(latestCachedQuery, {
        completedAtUtc: latestCachedQuery.savedAtUtc,
        consultationId: latestCachedQuery.consultationId || "",
      });
    } catch { /* A falha de snapshot não invalida o cache nem os resultados carregados. */ }
  }

  async function openSnapshot(id) {
    if (!id) {
      if (latestCachedQuery) {
        state.selectedManagerKey = latestCachedQuery.managerKey;
        state.selectedCustomerIds = new Set(latestCachedQuery.selectedCustomerIds);
        state.dateFrom = latestCachedQuery.dateFrom;
        state.dateTo = latestCachedQuery.dateTo;
        state.campaignId = latestCachedQuery.campaignId || '';
        state.campaignPrefill = latestCachedQuery.campaignId ? { managerCustomerId: latestCachedQuery.managerKey === 'direct' ? null : latestCachedQuery.managerKey, customerId: latestCachedQuery.selectedCustomerIds[0], campaignId: latestCachedQuery.campaignId, campaignName: latestCachedQuery.campaignName, autoQuery: false } : null;
        state.pendingCampaignContext = null;
        state.reports = latestCachedQuery.reports;
        state.failures = latestCachedQuery.failures;
        state.queryCacheAtUtc = latestCachedQuery.savedAtUtc;
        state.recommendations = summarizeGoogleAdsSearchTerms(state.reports, state.campaignTargets);
        state.dailyRecommendations = null;
        state.snapshotMode = false;
        dateFromInput.value = state.dateFrom;
        dateToInput.value = state.dateTo;
        updateManagers();
        syncControls();
        renderResults();
        setMessage(`Última consulta restaurada do cache local (${dateLabel(latestCachedQuery.savedAtUtc)}). Nenhuma chamada à API foi iniciada.`);
      } else {
        resetResults();
        state.snapshotMode = false;
        state.campaignPrefill = null;
        state.pendingCampaignContext = null;
        state.campaignId = '';
        updateManagers();
        syncControls();
        renderResults();
        setMessage('Nenhum snapshot selecionado. Nenhuma chamada à API foi iniciada.');
      }
      return true;
    }
    try {
      const snapshot = await loadGoogleAdsSearchTermsSnapshot(id);
      if (!snapshot) {
        setMessage('Este snapshot não está mais entre os três resultados salvos neste navegador.', true);
        return false;
      }
      state.selectedManagerKey = snapshot.managerKey;
      state.selectedCustomerIds = new Set(snapshot.selectedCustomerIds);
      state.dateFrom = snapshot.dateFrom;
      state.dateTo = snapshot.dateTo;
      state.campaignId = snapshot.campaignId || '';
      state.campaignPrefill = snapshot.campaignId ? { managerCustomerId: snapshot.managerKey === 'direct' ? null : snapshot.managerKey, customerId: snapshot.selectedCustomerIds[0], campaignId: snapshot.campaignId, campaignName: snapshot.campaignName, autoQuery: false } : null;
      state.pendingCampaignContext = null;
      state.reports = snapshot.reports;
      state.failures = snapshot.failures || [];
      state.queryCacheAtUtc = snapshot.completedAtUtc || snapshot.savedAtUtc;
      state.recommendations = summarizeGoogleAdsSearchTerms(state.reports, state.campaignTargets);
      state.dailyRecommendations = null;
      state.snapshotMode = true;
      state.visibleCount = PAGE_SIZE;
      dateFromInput.value = state.dateFrom;
      dateToInput.value = state.dateTo;
      updateManagers();
      syncControls();
      renderResults();
      setMessage(`Snapshot da consulta de ${dateLabel(state.queryCacheAtUtc)} carregado. Os resultados são locais e nenhuma chamada à API foi feita.`);
      return true;
    } catch (error) {
      setMessage(`Não foi possível abrir o snapshot: ${error.message || 'armazenamento indisponível'}.`, true);
      return false;
    }
  }

  updateManagers();
  syncControls();
  renderResults();
  if (snapshotId) void openSnapshot(snapshotId);
  else { void backfillCurrentCacheSnapshot(); }
  if (!snapshotId && !state.tokenReady && cachedQuery) setMessage(`Última consulta restaurada do cache local (${dateLabel(cachedQuery.savedAtUtc)}). Nenhuma chamada à API foi iniciada. Configure o token em Configurações globais para fazer uma nova consulta.`, true);
  else if (!snapshotId && state.pendingCampaignContext) setMessage(state.pendingCampaignContext.autoQuery
    ? `Não encontrei localmente a conta vinculada à campanha ${state.pendingCampaignContext.campaignName}. Atualize MCCs e contas para confirmar o vínculo; a consulta não foi iniciada.`
    : `Não encontrei localmente a conta vinculada à campanha ${state.pendingCampaignContext.campaignName}. Atualize MCCs e contas para confirmar o vínculo antes de consultar.`, true);
  else if (!snapshotId && state.campaignPrefill) setMessage(campaignFiltersAppliedMessage(state.campaignPrefill, state.dateFrom, state.dateTo, state.tokenReady), !state.tokenReady);
  else if (!snapshotId && !state.tokenReady) setMessage('O token compartilhado do Hub não está configurado neste navegador. Configure-o em Configurações globais.', true);
  else if (!snapshotId && cachedQuery) setMessage(`Última consulta restaurada do cache local (${dateLabel(cachedQuery.savedAtUtc)}). Nenhuma chamada à API foi iniciada.`);
  else if (!snapshotId && state.accounts) setMessage('Diretório salvo neste perfil carregado. Nenhuma consulta nova foi feita.');
  else if (!snapshotId) setMessage('Atualize a lista de MCCs e contas para começar; não farei essa consulta automaticamente.');
  if (!snapshotId && campaignContext?.autoQuery && initialContextAccount && state.tokenReady) void runQuery();
  if (!snapshotId && state.tokenReady && !cachedQuery && selectedAccounts().length === 1 && !state.campaignPrefill && !state.pendingCampaignContext) void loadCampaignCatalogForSelectedAccount();

  const controller = { refreshAccounts, runQuery, applyCampaignContext, setApiCaptures, openSnapshot, setReturnToDiaryContext, setReturnToDiaryHandler, setKeywordAdditionRecorder };
  mountedRoots.set(root, controller);
  return controller;
}
