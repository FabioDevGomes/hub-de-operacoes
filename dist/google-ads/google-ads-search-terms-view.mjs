import { fetchGoogleAdsAccounts, fetchGoogleAdsSearchTermCampaigns } from './google-ads-service.mjs?v=10';
import { normalizeGoogleAdsAccounts } from './google-ads-domain.mjs?v=6';
import { normalizeGoogleAdsSearchTermCampaigns, validateGoogleAdsSearchTermsDateRange } from './google-ads-search-terms-domain.mjs?v=5';
import { queryGoogleAdsSearchTerms } from './google-ads-search-terms-controller.mjs?v=6';
import { renderGoogleAdsSearchTermsResults } from './google-ads-search-terms-results.mjs?v=6';
import { buildGoogleAdsSearchTermCampaignTargets, summarizeGoogleAdsSearchTerms } from './google-ads-search-terms-recommendations.mjs?v=1';
import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';
import { loadGoogleAdsAccountsCache, saveGoogleAdsAccountsCache } from './google-ads-accounts-cache.mjs?v=1';
import { loadGoogleAdsSearchTermsCampaignsCache, saveGoogleAdsSearchTermsCampaignsCache } from './google-ads-search-terms-campaigns-cache.mjs?v=1';

const mountedRoots = new WeakMap();
const PAGE_SIZE = 50;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function normalizeCampaignContext(value) {
  const managerCustomerId = String(value?.managerCustomerId || '').replace(/\D/g, '');
  const customerId = String(value?.customerId || '').replace(/\D/g, '');
  const campaignId = String(value?.campaignId || '');
  const campaignName = String(value?.campaignName || '').trim().slice(0, 240);
  if (!/^\d{10}$/.test(managerCustomerId) || !/^\d{10}$/.test(customerId) || !/^[1-9]\d{0,19}$/.test(campaignId) || !campaignName) return null;
  return { managerCustomerId, customerId, campaignId, campaignName };
}

function cachedAccountForContext(accounts, context) {
  if (!accounts || !context || !accounts.managers.some(manager => String(manager.customerId || '').replace(/\D/g, '') === context.managerCustomerId)) return null;
  return accounts.accounts.find(account => String(account.customerId).replace(/\D/g, '') === context.customerId && String(account.managerCustomerId).replace(/\D/g, '') === context.managerCustomerId) || null;
}

function isoDateInSaoPaulo(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
}

function dateOffset(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function defaultDates() {
  const yesterday = dateOffset(isoDateInSaoPaulo(), -1);
  return { dateFrom: dateOffset(yesterday, -6), dateTo: yesterday };
}

function managerKey(manager) {
  return manager?.customerId == null ? 'direct' : String(manager.customerId).replace(/\D/g, '');
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'horário indisponível' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function mountGoogleAdsSearchTerms({ root, campaignContext: rawCampaignContext = null, apiCaptures = [] } = {}) {
  if (!root) throw new Error('A área da tela Termos de Pesquisa não foi encontrada.');
  const campaignContext = normalizeCampaignContext(rawCampaignContext);
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.setApiCaptures(apiCaptures);
    if (campaignContext) existing.applyCampaignContext(campaignContext);
    return existing;
  }

  const tokenState = readTrackingHubToken();
  const cached = loadGoogleAdsAccountsCache();
  const initialContextAccount = cachedAccountForContext(cached?.accounts, campaignContext);
  const dates = defaultDates();
  const state = {
    tokenReady: Boolean(tokenState.token),
    accounts: cached?.accounts || null,
    accountsCacheAt: cached?.savedAtUtc || '',
    apiCaptures: Array.isArray(apiCaptures) ? apiCaptures : [],
    campaignTargets: buildGoogleAdsSearchTermCampaignTargets(apiCaptures),
    accountsPending: false,
    queryPending: false,
    campaignCatalogPendingCustomerId: '',
    campaignCatalogError: '',
    campaignCatalogs: new Map(),
    campaignCatalogSavedAt: new Map(),
    campaignCatalogFreshness: new Map(),
    campaignId: initialContextAccount ? campaignContext.campaignId : '',
    campaignPrefill: initialContextAccount ? campaignContext : null,
    pendingCampaignContext: campaignContext && !initialContextAccount ? campaignContext : null,
    queuedCampaignContext: null,
    selectedManagerKey: campaignContext?.managerCustomerId || (cached?.accounts?.managers?.length ? managerKey(cached.accounts.managers[0]) : ''),
    selectedCustomerIds: new Set(),
    reports: null,
    recommendations: [],
    failures: [],
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
        : new Set(state.accounts.accounts
          .filter(account => managerKey({ customerId: account.managerCustomerId }) === state.selectedManagerKey)
          .map(account => account.customerId));
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

  function setMessage(value, isError = false) {
    state.message = value;
    state.messageError = isError;
    message.textContent = value;
    message.classList.toggle('error', isError);
    message.classList.toggle('success', Boolean(value) && !isError);
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

    if (state.pendingCampaignContext) campaignHint.textContent = 'A campanha foi identificada, mas esta MCC/conta não está na lista local. Atualize MCCs e contas para confirmar o vínculo; nenhuma busca foi iniciada.';
    else if (prefill) campaignHint.textContent = `Campanha vinculada: ${prefill.campaignName}. A consulta ainda não foi iniciada; revise o período e clique em “Consultar termos”.`;
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
    state.reports = null;
    state.recommendations = [];
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
    if (state.reports === null && !state.queryPending) {
      resultsArea.hidden = true;
      resultsArea.innerHTML = '';
      return;
    }
    resultsArea.hidden = false;
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
      campaignFilterName: selectedCampaign()?.campaignName || '',
      recommendations: state.recommendations,
    });
  }

  function setApiCaptures(captures) {
    if (captures === state.apiCaptures) return false;
    state.apiCaptures = Array.isArray(captures) ? captures : [];
    state.campaignTargets = buildGoogleAdsSearchTermCampaignTargets(state.apiCaptures);
    if (state.reports && !state.queryPending) {
      state.recommendations = summarizeGoogleAdsSearchTerms(state.reports, state.campaignTargets);
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
    if (state.queryPending) {
      state.queuedCampaignContext = context;
      setMessage('Uma consulta anterior ainda está terminando. O filtro desta campanha será aplicado assim que ela concluir; nenhuma consulta nova foi iniciada.');
      return true;
    }
    const account = cachedAccountForContext(state.accounts, context);
    resetResults();
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
      setMessage(`Não encontrei localmente a conta vinculada à campanha ${context.campaignName}. Atualize MCCs e contas para confirmar o vínculo antes de consultar.`, true);
      return false;
    }
    state.pendingCampaignContext = null;
    state.campaignPrefill = context;
    state.campaignId = context.campaignId;
    state.selectedManagerKey = context.managerCustomerId;
    state.selectedCustomerIds = new Set([account.customerId]);
    updateManagers();
    syncControls();
    setMessage(`Campanha ${context.campaignName} selecionada. Confira o período padrão de ${state.dateFrom} a ${state.dateTo}; clique em “Consultar termos” quando quiser iniciar a busca. Nenhuma consulta foi iniciada.`);
    return true;
  }

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
    state.reports = [];
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
        onProgress: ({ phase, account, index, total, ok, report, failure }) => {
          if (phase === 'completed') {
            if (ok) state.reports.push(report);
            else state.failures.push(failure);
          }
          state.progress = phase === 'started'
            ? `Consultando ${account.name} · ${index + 1} de ${total}…`
            : `${index + 1} de ${total} conta(s) processada(s)${ok ? '' : ' · houve falha'}…`;
          renderResults();
        },
      });
      state.reports = result.reports;
      state.failures = result.failures;
      state.recommendations = summarizeGoogleAdsSearchTerms(state.reports, state.campaignTargets);
      if (!result.reports.length) setMessage(`Nenhuma das ${accounts.length} conta(s) retornou uma consulta completa. Confira os erros abaixo.`, true);
      else if (result.failures.length) setMessage(`Consulta parcial: ${result.reports.length} conta(s) concluída(s); ${result.failures.length} falhou. Os resultados não foram gravados.`);
      else setMessage(`Consulta concluída para ${result.reports.length} conta(s). Os resultados aparecem somente nesta tela.`);
    } catch (error) {
      state.failures.push({ accountName: 'Consulta', message: error.message || 'Não foi possível concluir a consulta.' });
      state.recommendations = summarizeGoogleAdsSearchTerms(state.reports || [], state.campaignTargets);
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
  resultsArea.addEventListener('click', event => {
    const button = event.target.closest('[data-google-ads-search-terms-more]');
    if (!button || state.queryPending) return;
    state.visibleCount += PAGE_SIZE;
    renderResults();
  });

  updateManagers();
  syncControls();
  if (!state.tokenReady) setMessage('O token compartilhado do Hub não está configurado neste navegador. Configure-o em Configurações globais.', true);
  else if (state.pendingCampaignContext) setMessage(`Não encontrei localmente a conta vinculada à campanha ${state.pendingCampaignContext.campaignName}. Atualize MCCs e contas para confirmar o vínculo antes de consultar.`, true);
  else if (state.campaignPrefill) setMessage(`Campanha ${state.campaignPrefill.campaignName} selecionada. Confira o período padrão de ${state.dateFrom} a ${state.dateTo}; clique em “Consultar termos” quando quiser iniciar a busca. Nenhuma consulta foi iniciada.`);
  else if (state.accounts) setMessage('Diretório salvo neste perfil carregado. Nenhuma consulta nova foi feita.');
  else setMessage('Atualize a lista de MCCs e contas para começar; não farei essa consulta automaticamente.');
  if (state.tokenReady && selectedAccounts().length === 1 && !state.campaignPrefill && !state.pendingCampaignContext) void loadCampaignCatalogForSelectedAccount();

  const controller = { refreshAccounts, runQuery, applyCampaignContext, setApiCaptures };
  mountedRoots.set(root, controller);
  return controller;
}
