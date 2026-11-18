import { fetchGoogleAdsAccounts } from './google-ads-service.mjs?v=16';
import { normalizeGoogleAdsAccounts } from './google-ads-domain.mjs?v=7';
import { loadGoogleAdsAccountsCache, saveGoogleAdsAccountsCache } from './google-ads-accounts-cache.mjs?v=4';
import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';
import { listDrafts } from '../copy-ficha/copy-ficha-draft.mjs?v=4';
import { buildStructuredFicha } from '../copy-ficha/copy-ficha-structured.mjs?v=4';
import { preparePresellTrackingBatch } from '../copy-ficha/copy-ficha-tracking-service.mjs?v=3';
import { mountPresellDeployWorkflow, openPresellDeployWorkflow, queuePresellDeployJob, readPresellDeployJobs, PRESELL_DEPLOY_JOBS_UPDATED_EVENT } from '../copy-ficha/copy-ficha-deploy.mjs?v=48';
import { createPresellBatch } from '../presell/presell-service.mjs?v=8';
import { accountDomainUrl } from '../accounts/accounts-domain.mjs?v=13';
import {
  createGoogleAdsCampaignDuplicationEntry,
  fetchGoogleAdsCampaignsForDuplication,
  inspectGoogleAdsCampaignForDuplication,
  previewGoogleAdsCampaignDuplication,
} from './google-ads-campaign-duplication-service.mjs?v=7';
import { GOOGLE_ADS_DUPLICATION_B_TEST_NOTICE, GOOGLE_ADS_DUPLICATION_CPA_LEVELS } from './google-ads-campaign-duplication-domain.mjs?v=2';

const mountedRoots = new WeakMap();
const confirmedNoWriteErrors = new Set([
  'campaign_creation_disabled', 'campaign_account_not_allowed', 'campaign_currency_mismatch',
  'campaign_name_already_exists', 'campaign_duplication_unsupported', 'campaign_duplication_plan_expired',
  'campaign_duplication_changed', 'invalid_payload', 'api_unavailable', 'api_not_configured',
  'credentials_missing', 'not_authorized', 'google_ads_auth_failed', 'google_ads_access_denied',
  'campaign_duplication_source_target', 'google_ads_quota_exceeded', 'google_ads_request_rejected', 'private_service_unavailable',
]);
const retryableErrors = new Set(['google_ads_access_denied', 'google_ads_quota_exceeded', 'google_ads_request_rejected']);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function html(rootMarkup) {
  return `<div class="google-ads-duplication-page">
    <section class="google-ads-duplication-card">
      <header class="google-ads-duplication-header">
        <div><div class="google-ads-eyebrow">CRIAÇÃO DE OFERTAS</div><h2>Duplicar campanha</h2>
        <p>Escolha uma campanha Search, contas de destino e faixas de CPA. Cada conta usa uma URL própria de Pre-Sell, compartilhada por todas as cópias daquela conta. As novas campanhas são criadas pausadas.</p></div>
        <button class="btn" type="button" data-duplication-refresh>Atualizar MCCs e contas</button>
      </header>
      <div class="google-ads-duplication-content">
        <p class="google-ads-duplication-note">A cópia considera somente a campanha Search e os recursos vinculados a ela. Preferências gerais da conta não são copiadas. Se um recurso vinculado não puder ser recriado ou usado no destino, a prévia bloqueia a criação e explica o motivo.</p>
        <section class="google-ads-duplication-section"><h3>1. Campanha de origem</h3>
          <div class="google-ads-duplication-grid">
            <label class="google-ads-creation-field"><span>MCC de origem</span><select class="input" data-source-manager></select></label>
            <label class="google-ads-creation-field"><span>Conta de origem</span><select class="input" data-source-account></select></label>
          </div>
          <div class="google-ads-duplication-load-row"><label class="google-ads-creation-field"><span>Campanha Search</span><select class="input" data-source-campaign disabled><option value="">Carregue as campanhas da conta</option></select></label><button class="btn" type="button" data-load-campaigns disabled>Carregar campanhas</button><button class="btn" type="button" data-inspect-campaign disabled>Analisar recursos</button></div>
          <p class="google-ads-duplication-status" data-source-status role="status" aria-live="polite"></p>
          <div class="google-ads-duplication-inspection" data-source-inspection hidden></div>
        </section>
        <section class="google-ads-duplication-section"><h3>2. Contas de destino e Pre-Sell</h3>
          <p class="google-ads-duplication-help">Marque as contas que receberão as cópias. Você pode informar uma URL HTTPS por conta ou reutilizar uma Ficha salva para gerar as páginas em lote; todas as faixas enviadas à mesma conta usarão a mesma URL.</p>
          <div class="google-ads-duplication-presell-setup">
            <div class="google-ads-duplication-presell-controls"><label class="google-ads-creation-field"><span>Ficha salva para reutilizar</span><select class="input" data-ficha-draft><option value="">Carregando Fichas locais…</option></select></label><button class="btn" type="button" data-refresh-ficha-drafts>Atualizar Fichas</button><button class="btn" type="button" data-load-hostinger-sites>Atualizar sites Hostinger</button><button class="btn primary" type="button" data-generate-presells disabled>Gerar Pre-Sells para as contas marcadas</button></div>
            <p class="google-ads-duplication-status" data-presell-status role="status" aria-live="polite">Uma única Ficha e a pasta de assets dela serão reutilizadas; cada conta terá seu próprio subdomínio.</p>
          </div>
          <div class="google-ads-duplication-targets" data-targets></div>
          <section class="google-ads-duplication-presell-deploy" id="copyPresellDeployTask" hidden><p id="copyPresellDeployStatus" class="copy-ficha-deploy-status"></p><button id="copyPresellDeployOpen" class="copy-ficha-btn copy-ficha-deploy-button" type="button">Abrir hospedagem e publicação</button></section>
        </section>
        <section class="google-ads-duplication-section"><h3>3. Faixas de CPA</h3>
          <p class="google-ads-duplication-help">As faixas são calculadas pela comissão no nome da campanha. A sequência será global na conta de origem e nas contas de destino marcadas; nomes existentes não serão renumerados e outras contas não serão consultadas. O lote aceita até 24 cópias. Cada cópia é validada e criada em uma operação separada da Google Ads API.</p>
          <p class="google-ads-duplication-help">Ao validar, o Hub consulta os nomes de campanhas Search em <strong data-sequence-account-count>0</strong> conta(s) do escopo (origem + destinos marcados), uma chamada por conta, além das validações de cada cópia. Essa busca consome operações da API. Abrir a tela não consulta a API.</p>
          <div class="google-ads-duplication-cpas" data-cpa-options></div>
          <div class="google-ads-duplication-future" role="note">${escapeHtml(GOOGLE_ADS_DUPLICATION_B_TEST_NOTICE)}</div>
        </section>
        <p class="google-ads-duplication-status" data-main-status role="status" aria-live="polite"></p>
        <section class="google-ads-duplication-preview" data-preview hidden>
          <h3>Prévia validada</h3><p class="google-ads-duplication-help">Nenhuma campanha é criada durante a validação. Confira conta, URL, número, CPA e os recursos que serão copiados.</p>
          <div class="google-ads-duplication-preview-list" data-preview-list></div>
          <button class="btn primary" type="button" data-create disabled>Criar cópias pausadas</button>
        </section>
        <section class="google-ads-duplication-results" data-results hidden><h3>Resultado das cópias</h3><div data-result-list></div></section>
        <footer class="google-ads-duplication-actions"><button class="btn primary" type="button" data-preview-button disabled>Validar duplicações</button></footer>
      </div>
    </section>
  </div>`;
}

export function mountGoogleAdsCampaignDuplication({ root, initialSelection = null } = {}) {
  if (!root) throw new Error('A área de duplicação de campanhas Google Ads não foi encontrada.');
  const existing = mountedRoots.get(root);
  if (existing) {
    if (initialSelection) existing.setInitialSelection(initialSelection);
    else existing.syncDirectory();
    return existing;
  }
  root.innerHTML = html();
  const page = root.querySelector('.google-ads-duplication-page');
  const sourceManager = page.querySelector('[data-source-manager]');
  const sourceAccount = page.querySelector('[data-source-account]');
  const sourceCampaign = page.querySelector('[data-source-campaign]');
  const loadCampaignsButton = page.querySelector('[data-load-campaigns]');
  const inspectButton = page.querySelector('[data-inspect-campaign]');
  const refreshButton = page.querySelector('[data-duplication-refresh]');
  const sourceStatus = page.querySelector('[data-source-status]');
  const inspectionArea = page.querySelector('[data-source-inspection]');
  const targetArea = page.querySelector('[data-targets]');
  const cpaArea = page.querySelector('[data-cpa-options]');
  const sequenceAccountCount = page.querySelector('[data-sequence-account-count]');
  const mainStatus = page.querySelector('[data-main-status]');
  const previewButton = page.querySelector('[data-preview-button]');
  const previewArea = page.querySelector('[data-preview]');
  const previewList = page.querySelector('[data-preview-list]');
  const createButton = page.querySelector('[data-create]');
  const resultsArea = page.querySelector('[data-results]');
  const resultList = page.querySelector('[data-result-list]');
  const fichaDraftSelect = page.querySelector('[data-ficha-draft]');
  const refreshFichaDraftsButton = page.querySelector('[data-refresh-ficha-drafts]');
  const loadHostingerSitesButton = page.querySelector('[data-load-hostinger-sites]');
  const generatePresellsButton = page.querySelector('[data-generate-presells]');
  const presellStatus = page.querySelector('[data-presell-status]');
  const deployOpenButton = page.querySelector('#copyPresellDeployOpen');

  let directory = loadGoogleAdsAccountsCache()?.accounts || null;
  let campaigns = [];
  let inspection = null;
  let plan = null;
  let busy = false;
  let created = false;
  let sourceCampaignPrefill = null;
  let fichaDrafts = [];
  let hostingerSites = [];
  let activePresellJobId = '';
  const targetUrlValues = new Map();
  const presellTargetConfig = new Map();
  const selectedTargetKeys = new Set();

  const selectedManagerId = () => sourceManager.value === 'direct' ? null : sourceManager.value || null;
  const selectedAccount = () => directory?.accounts.find(item => String(item.customerId) === String(sourceAccount.value)
    && String(item.managerCustomerId ?? 'direct') === String(selectedManagerId() ?? 'direct')) || null;
  const selectedSourceCampaign = () => campaigns.find(item => item.campaignId === sourceCampaign.value) || null;
  const accountKey = account => `${account?.managerCustomerId ?? 'direct'}:${account?.customerId ?? ''}`;
  const selectedFichaDraft = () => fichaDrafts.find(item => item.key === fichaDraftSelect.value) || null;
  const rootHostingerSites = () => hostingerSites.filter(site => site?.domain && site?.username
    && String(site.websiteType || '').toLowerCase() !== 'subdomain'
    && !/^(disabled|desabilitado|inativo)$/i.test(String(site.status || '')));
  const FICHA_SELECTION_KEY = 'hub:google-ads-campaign-duplication:ficha-draft:v1';
  const FICHA_CONFIG_KEY = 'hub:google-ads-campaign-duplication:presell-config:v1';
  try {
    const saved = JSON.parse(localStorage.getItem(FICHA_CONFIG_KEY) || '{}');
    if (saved && typeof saved === 'object') {
      for (const [key, value] of Object.entries(saved)) if (value && typeof value === 'object') presellTargetConfig.set(key, { site: String(value.site || ''), prefix: String(value.prefix || '') });
    }
  } catch {}

  function setPresellMessage(text, error = false) { message(presellStatus, text, error); }

  function defaultPrefix(draft, account) {
    const product = String(draft?.product || draft?.structuredFicha?.match(/^\s*\[PRODUTO\]\s*(.+)$/m)?.[1] || 'presell');
    const slug = product.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'presell';
    const suffix = String(account?.customerId || '').replace(/\D/g, '').slice(-6);
    return `${slug.slice(0, Math.max(1, 62 - (suffix ? suffix.length : 0))).replace(/-+$/g, '')}${suffix ? `-${suffix}` : ''}`;
  }

  function loadFichaDraftChoices({ keepSelection = true } = {}) {
    const previous = keepSelection ? fichaDraftSelect.value : '';
    fichaDrafts = listDrafts();
    fichaDraftSelect.replaceChildren(new Option(fichaDrafts.length ? 'Selecione uma Ficha salva' : 'Nenhuma Ficha local com pasta de assets', ''));
    for (const item of fichaDrafts) {
      const draft = item.draft;
      const scope = item.key.includes(':delivery:') ? 'Entrega' : 'Manual';
      const label = [draft.product || draft.pageTitle || 'Ficha sem nome', draft.countryCode, scope].filter(Boolean).join(' · ');
      fichaDraftSelect.add(new Option(label, item.key));
    }
    let stored = '';
    try { stored = localStorage.getItem(FICHA_SELECTION_KEY) || ''; } catch {}
    fichaDraftSelect.value = fichaDrafts.some(item => item.key === previous) ? previous
      : fichaDrafts.some(item => item.key === stored) ? stored : (fichaDrafts[0]?.key || '');
    updatePresellControls();
    renderTargets();
  }

  function configFor(account, draft = selectedFichaDraft()?.draft) {
    const key = accountKey(account);
    const saved = presellTargetConfig.get(key) || {};
    return { site: String(saved.site || ''), prefix: String(saved.prefix || defaultPrefix(draft, account)) };
  }

  function hostingerSiteByKey(key) {
    return rootHostingerSites().find(site => `${site.domain}|${site.username}` === String(key || '')) || null;
  }

  function updateConfiguredUrl(account) {
    const config = configFor(account);
    const site = hostingerSiteByKey(config.site);
    const prefix = String(config.prefix || '').trim().toLowerCase();
    const url = site && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix) ? `https://${prefix}.${String(site.domain).toLowerCase()}` : '';
    const key = accountKey(account);
    if (!url) {
      targetUrlValues.set(key, '');
      const field = targetArea.querySelector(`[data-target-url="${CSS.escape(key)}"]`);
      if (field) field.value = '';
      invalidatePlan();
      return;
    }
    targetUrlValues.set(key, url);
    const field = targetArea.querySelector(`[data-target-url="${CSS.escape(key)}"]`);
    if (field) field.value = url;
    invalidatePlan();
  }

  function updatePresellControls() {
    const chosen = selectedFichaDraft();
    const selectedCount = targetArea.querySelectorAll('[data-target-check]:checked').length;
    const hostingerReady = rootHostingerSites().length > 0;
    generatePresellsButton.disabled = busy || !chosen || !selectedCount || !hostingerReady;
    loadHostingerSitesButton.disabled = busy;
    refreshFichaDraftsButton.disabled = busy;
    fichaDraftSelect.disabled = busy || !fichaDrafts.length;
  }

  function persistFichaConfiguration() {
    try {
      localStorage.setItem(FICHA_SELECTION_KEY, fichaDraftSelect.value || '');
      localStorage.setItem(FICHA_CONFIG_KEY, JSON.stringify(Object.fromEntries(presellTargetConfig)));
    } catch {}
  }

  function message(node, text, error = false) {
    node.textContent = text;
    node.classList.toggle('is-error', error);
    node.classList.toggle('is-success', !error && Boolean(text));
  }

  function invalidatePlan() {
    plan = null;
    previewArea.hidden = true;
    createButton.disabled = true;
    previewButton.disabled = busy || !inspection?.copyable;
  }

  function renderManagers(keepValue = sourceManager.value) {
    sourceManager.replaceChildren();
    const managers = (directory?.managers || []).filter(manager => manager.customerId == null
      || /^\d{10}$/.test(String(manager.customerId)));
    for (const manager of managers) {
      const option = document.createElement('option');
      option.value = manager.customerId == null ? 'direct' : String(manager.customerId);
      option.textContent = manager.name + (manager.customerId ? ` · ${manager.customerId}` : '');
      sourceManager.append(option);
    }
    if (managers.some(item => String(item.customerId ?? 'direct') === String(keepValue))) sourceManager.value = String(keepValue);
    renderSourceAccounts();
    renderTargets();
    updateSequenceAccountCount();
  }

  function renderSourceAccounts(keepValue = sourceAccount.value) {
    sourceAccount.replaceChildren();
    const managerId = selectedManagerId();
    const accounts = (directory?.accounts || []).filter(item => String(item.managerCustomerId ?? 'direct') === String(managerId ?? 'direct') && item.status === 'ENABLED');
    for (const account of accounts) {
      const option = document.createElement('option');
      option.value = String(account.customerId);
      option.textContent = `${account.name} · ${account.customerId} · ${account.currencyCode}`;
      sourceAccount.append(option);
    }
    if (accounts.some(item => String(item.customerId) === String(keepValue))) sourceAccount.value = String(keepValue);
    const available = Boolean(accounts.length && readTrackingHubToken().token);
    loadCampaignsButton.disabled = busy || !available;
    sourceCampaign.disabled = !campaigns.length || busy;
    inspectButton.disabled = busy || !selectedSourceCampaign();
    resetSourceAndPlan();
  }

  function renderTargets() {
    const accounts = (directory?.accounts || []).filter(account => /^\d{10}$/.test(String(account.managerCustomerId ?? ''))
      && account.status === 'ENABLED'
      && !(String(account.customerId) === String(sourceAccount.value)
        && String(account.managerCustomerId ?? 'direct') === String(selectedManagerId() ?? 'direct')));
    if (!accounts.length) {
      targetArea.innerHTML = '<p class="google-ads-duplication-empty">Não há contas de destino disponíveis neste diretório. Atualize MCCs e contas.</p>';
      previewButton.disabled = true;
      updateSequenceAccountCount();
      updatePresellControls();
      return;
    }
    const ficha = selectedFichaDraft()?.draft;
    const sites = rootHostingerSites();
    targetArea.innerHTML = accounts.map(account => {
      const key = accountKey(account), config = configFor(account, ficha), site = hostingerSiteByKey(config.site);
      const selected = selectedTargetKeys.has(key), publicUrl = targetUrlValues.get(key) || '';
      const siteOptions = `<option value="">Selecione o site principal</option>${sites.map(item => `<option value="${escapeHtml(`${item.domain}|${item.username}`)}"${`${item.domain}|${item.username}`===config.site?' selected':''}>${escapeHtml(item.domain)}</option>`).join('')}`;
      const hostingerControls = ficha ? `<div class="google-ads-duplication-presell-target"><label class="google-ads-creation-field"><span>Site principal Hostinger</span><select class="input" data-target-hostinger-site="${escapeHtml(key)}"${selected&&sites.length?'':' disabled'}>${siteOptions}</select></label><label class="google-ads-creation-field"><span>Prefixo do subdomínio</span><input class="input" type="text" maxlength="63" data-target-hostinger-prefix="${escapeHtml(key)}" value="${escapeHtml(config.prefix)}" placeholder="ex.: nome-do-produto"${selected?'':' disabled'}></label><small>${site&&config.prefix?`Endereço previsto: https://${escapeHtml(config.prefix)}.${escapeHtml(site.domain)}`:sites.length?'Escolha o site principal para definir a URL.':'Atualize a lista de sites da Hostinger.'}</small></div>` : '';
      return `<article class="google-ads-duplication-target${selected?' is-selected':''}" data-target-card="${escapeHtml(key)}">
        <label class="google-ads-duplication-target-check"><input type="checkbox" data-target-check="${escapeHtml(account.customerId)}" data-target-manager="${escapeHtml(account.managerCustomerId || '')}"${selected?' checked':''}><span><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.managerName)} · ${escapeHtml(account.currencyCode)} · ${escapeHtml(account.customerId)}</small></span></label>
        <label class="google-ads-creation-field"><span>URL da Pre-Sell desta conta</span><input class="input" type="url" inputmode="url" placeholder="https://dominio-da-presell.com" data-target-url="${escapeHtml(key)}" value="${escapeHtml(publicUrl)}"${selected?'':' disabled'}></label>${hostingerControls}
      </article>`;
    }).join('');
    targetArea.querySelectorAll('[data-target-check]').forEach(input => input.addEventListener('change', () => {
      const card = input.closest('[data-target-card]');
      const url = card.querySelector('[data-target-url]');
      url.disabled = !input.checked;
      card.classList.toggle('is-selected', input.checked);
      const account = (directory?.accounts || []).find(item => String(item.customerId) === String(input.dataset.targetCheck)
        && String(item.managerCustomerId || '') === String(input.dataset.targetManager || ''));
      if (account) {
        if (input.checked) selectedTargetKeys.add(accountKey(account));
        else selectedTargetKeys.delete(accountKey(account));
      }
      invalidatePlan();
      updateSequenceAccountCount();
      updatePresellControls();
    }));
    targetArea.querySelectorAll('[data-target-url]').forEach(input => input.addEventListener('input', () => { targetUrlValues.set(input.dataset.targetUrl, input.value); invalidatePlan(); }));
    targetArea.querySelectorAll('[data-target-hostinger-site]').forEach(input => input.addEventListener('change', () => {
      const key = input.dataset.targetHostingerSite, account = accounts.find(item => accountKey(item) === key);
      if (!account) return;
      const config = configFor(account); config.site = input.value; presellTargetConfig.set(key, config); updateConfiguredUrl(account);
      const preview = input.closest('.google-ads-duplication-presell-target')?.querySelector('small'), site = hostingerSiteByKey(config.site);
      if (preview) preview.textContent = site && config.prefix ? `Endereço previsto: https://${config.prefix}.${site.domain}` : 'Informe um prefixo válido para definir a URL.';
    }));
    targetArea.querySelectorAll('[data-target-hostinger-prefix]').forEach(input => input.addEventListener('input', () => {
      const key = input.dataset.targetHostingerPrefix, account = accounts.find(item => accountKey(item) === key);
      if (!account) return;
      const config = configFor(account); config.prefix = input.value; presellTargetConfig.set(key, config); updateConfiguredUrl(account);
      const preview = input.closest('.google-ads-duplication-presell-target')?.querySelector('small'), site = hostingerSiteByKey(config.site);
      if (preview) preview.textContent = site ? `Endereço previsto: https://${input.value.trim().toLowerCase()}.${site.domain}` : 'Escolha o site principal para definir a URL.';
    }));
    updatePresellControls();
  }

  function renderCpaOptions() {
    cpaArea.innerHTML = GOOGLE_ADS_DUPLICATION_CPA_LEVELS.map(percent => `<label class="google-ads-duplication-cpa"><input type="checkbox" data-cpa="${percent}"><span>${percent}%</span></label>`).join('');
    cpaArea.querySelectorAll('[data-cpa]').forEach(input => input.addEventListener('change', invalidatePlan));
  }

  function resetSourceAndPlan() {
    campaigns = [];
    inspection = null;
    sourceCampaign.replaceChildren(new Option('Carregue as campanhas da conta', ''));
    sourceCampaign.disabled = true;
    inspectButton.disabled = true;
    inspectionArea.hidden = true;
    message(sourceStatus, '');
    invalidatePlan();
  }

  function syncDirectory() {
    const cache = loadGoogleAdsAccountsCache();
    if (cache?.accounts) { directory = cache.accounts; renderManagers(); }
  }

  function applySourceCampaignPrefill() {
    const prefill = sourceCampaignPrefill;
    const account = selectedAccount();
    if (!prefill || !account || String(account.customerId) !== String(prefill.customerId)
      || String(account.managerCustomerId ?? '') !== String(prefill.managerCustomerId ?? '')) return false;
    const matches = campaigns.filter(item => item.campaignName === prefill.campaignName
      && (!prefill.campaignId || String(item.campaignId) === String(prefill.campaignId)));
    if (matches.length === 1) {
      sourceCampaign.value = matches[0].campaignId;
      sourceCampaign.disabled = false;
      inspectButton.disabled = busy;
      message(sourceStatus, `Campanha modelo localizada: ${matches[0].campaignName}. Confira e analise os recursos antes de validar.`);
      return true;
    }
    sourceCampaign.value = '';
    inspection = null;
    inspectionArea.hidden = true;
    inspectButton.disabled = true;
    invalidatePlan();
    if (matches.length > 1) {
      message(sourceStatus, 'Há mais de uma campanha com esse nome. Selecione manualmente a campanha modelo correta na lista.', true);
    } else {
      message(sourceStatus, 'A campanha marcada no Mapa por Conta não foi encontrada exatamente nesta conta. Escolha uma campanha Search na lista.', true);
    }
    return false;
  }

  function setInitialSelection(selection = {}) {
    const source = selection.source || {};
    const customerId = String(source.customerId || '');
    const requestedManagerCustomerId = String(source.managerCustomerId || '');
    // Resolve the source account against the shared directory by its unique
    // customer ID. The account map can carry an older manager association.
    const cachedSourceAccount = (directory?.accounts || []).find(item => String(item.customerId) === customerId) || null;
    const managerCustomerId = cachedSourceAccount
      ? String(cachedSourceAccount.managerCustomerId ?? '')
      : requestedManagerCustomerId;
    const managerKey = managerCustomerId || 'direct';
    const managerAssociationChanged = Boolean(cachedSourceAccount && requestedManagerCustomerId !== managerCustomerId);
    const targetAccounts = Array.isArray(selection.targets) ? selection.targets : [];
    const nextSourceKey = `${managerKey}:${customerId}`;
    const currentSource = selectedAccount();
    const sourceAlreadySelected = currentSource && accountKey(currentSource) === nextSourceKey;
    selectedTargetKeys.clear();
    for (const target of targetAccounts) {
      const managerId = String(target.managerCustomerId || '');
      const targetId = String(target.customerId || '');
      const account = (directory?.accounts || []).find(item => String(item.customerId) === targetId
        && String(item.managerCustomerId || '') === managerId && item.status === 'ENABLED');
      if (account && accountKey(account) !== nextSourceKey) selectedTargetKeys.add(accountKey(account));
    }
    sourceCampaignPrefill = {
      managerCustomerId,
      customerId,
      campaignName:String(source.campaignName || ''),
      campaignId:String(source.campaignId || ''),
    };
    let sourceAvailable = Boolean(sourceAlreadySelected);
    if (!sourceAlreadySelected) {
      renderManagers(managerKey);
      const managerAvailable = [...sourceManager.options].some(option => option.value === managerKey);
      const sourceAccountAvailable = [...sourceAccount.options].some(option => option.value === customerId);
      if (!managerAvailable || !sourceAccountAvailable) {
        sourceManager.insertBefore(new Option('Selecione a MCC de origem', ''), sourceManager.firstChild);
        sourceManager.value = '';
        sourceAccount.replaceChildren(new Option('Selecione uma conta de origem', ''));
        sourceAccount.disabled = true;
        loadCampaignsButton.disabled = true;
        resetSourceAndPlan();
        message(sourceStatus, cachedSourceAccount
          ? 'A conta de origem não está disponível sob a MCC atual do cache compartilhado. Atualize MCCs e contas ou selecione a origem manualmente.'
          : 'A conta de origem marcada no Mapa não está no cache compartilhado. Atualize MCCs e contas ou selecione a origem manualmente.', true);
      } else {
        sourceManager.value = managerKey;
        renderSourceAccounts(customerId);
        sourceAvailable = true;
      }
    }
    renderTargets();
    if (campaigns.length && sourceAlreadySelected) {
      applySourceCampaignPrefill();
    } else if (sourceAvailable && sourceCampaignPrefill.campaignName) {
      const pendingValue = sourceCampaignPrefill.campaignId || 'map-model-pending';
      sourceCampaign.replaceChildren(new Option(`${sourceCampaignPrefill.campaignName} · pendente de confirmação Search`, pendingValue));
      sourceCampaign.value = pendingValue;
      sourceCampaign.disabled = true;
      inspectButton.disabled = true;
      if (managerAssociationChanged) {
        message(sourceStatus, 'A MCC do Mapa difere do diretório compartilhado. A origem foi associada pelo ID atual; o modelo selecionado será confirmado como Search quando você carregar as campanhas.', true);
      } else {
        message(sourceStatus, 'Modelo preenchido a partir do Mapa por Conta. Clique em Carregar campanhas para confirmar que ele está disponível como campanha Search nesta conta.', false);
      }
    } else if (sourceAvailable && managerAssociationChanged) {
      message(sourceStatus, 'A MCC do Mapa difere do diretório compartilhado. A origem foi preenchida conforme o vínculo atual da conta no cache; confira antes de carregar as campanhas.', true);
    }
    updateSequenceAccountCount();
  }

  function selectedTargets() {
    return [...targetArea.querySelectorAll('[data-target-check]:checked')].map(check => {
      const account = (directory?.accounts || []).find(item => String(item.customerId) === check.dataset.targetCheck
        && String(item.managerCustomerId || '') === String(check.dataset.targetManager || ''));
      const key = account ? accountKey(account) : '';
      const preSellUrl = key ? targetArea.querySelector(`[data-target-url="${CSS.escape(key)}"]`)?.value.trim() || '' : '';
      if (!account) throw new Error('Uma conta selecionada deixou de estar no diretório local. Atualize MCCs e contas.');
      return { ...account, preSellUrl };
    });
  }

  function pageDestination(source, pageNumber, domain) {
    const clean = String(source || '').trim().replace(/[\\/]+$/g, '');
    const separator = Math.max(clean.lastIndexOf('\\'), clean.lastIndexOf('/'));
    if (separator < 0) throw new Error('A pasta da Ficha precisa estar dentro da pasta de um produto.');
    const delimiter = clean[separator], parent = clean.slice(0, separator);
    return `${parent}${delimiter}pag${String(pageNumber).padStart(2, '0')} ${domain}`;
  }

  function deployJobForDuplication(jobId = activePresellJobId) {
    return readPresellDeployJobs().find(job => job.id === jobId && job.campaignDuplication === true) || null;
  }

  function syncPublishedPresellUrls() {
    const jobs = readPresellDeployJobs().filter(job => job.campaignDuplication === true);
    if (!activePresellJobId || !jobs.some(job => job.id === activePresellJobId)) {
      activePresellJobId = jobs.slice().sort((left, right) => Date.parse(left.createdAtUtc || '') - Date.parse(right.createdAtUtc || '')).at(-1)?.id || '';
    }
    const job = deployJobForDuplication();
    if (!job) return;
    for (const target of job.targets || []) {
      const account = (directory?.accounts || []).find(item => String(item.customerId) === String(target.accountId));
      if (!account) continue;
      const key = accountKey(account), url = String(target.publicUrl || '');
      const field = targetArea.querySelector(`[data-target-url="${CSS.escape(key)}"]`);
      if (!url) continue;
      if (field && (!field.value || field.value === url)) field.value = url;
      if (!targetUrlValues.get(key) || targetUrlValues.get(key) === url) targetUrlValues.set(key, url);
    }
  }

  function unpublishedManagedTarget(targets) {
    const jobs = readPresellDeployJobs().filter(job => job.campaignDuplication === true);
    for (const account of targets) {
      const url = String(account.preSellUrl || '').replace(/\/$/, '');
      const matches = jobs.flatMap(job => job.targets || []).filter(item => String(item.accountId) === String(account.customerId)
        && String(item.publicUrl || '').replace(/\/$/, '') === url);
      const confirmed = matches.some(item => item.deploymentState === 'success' || item.status === 'published'
        || (item.status === 'manual-verified' && item.manualVerification?.status === 'confirmed'));
      if (matches.length && !confirmed) return matches[0];
    }
    return null;
  }

  async function refreshHostingerSites() {
    if (busy) return;
    busy = true; updateControls(); setPresellMessage('Consultando sites Hostinger conectados…');
    try {
      const response = await fetch('/api/hostinger/websites', { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'A Hostinger não retornou a lista de sites.');
      hostingerSites = Array.isArray(result.sites) ? result.sites : [];
      renderTargets();
      setPresellMessage(rootHostingerSites().length
        ? `Lista atualizada: ${rootHostingerSites().length} site(s) principal(is) disponível(is). Configure um para cada conta destino.`
        : 'A conexão Hostinger não retornou sites principais ativos. Confira a Integração Hostinger.');
    } catch (error) {
      setPresellMessage(error.message || 'Não foi possível atualizar os sites Hostinger.', true);
    } finally { busy = false; updateControls(); }
  }

  async function generatePresellsFromSavedFicha() {
    if (busy) return;
    const saved = selectedFichaDraft();
    let accounts;
    try { accounts = selectedTargets(); } catch (error) { setPresellMessage(error.message, true); return; }
    if (!saved) { setPresellMessage('Escolha uma Ficha local salva para reutilizar.', true); return; }
    if (!accounts.length) { setPresellMessage('Marque ao menos uma conta destino.', true); return; }
    if (accounts.length > 50) { setPresellMessage('A geração da Ficha aceita até 50 contas por lote.', true); return; }
    const draft = saved.draft, source = String(draft.destination || '').trim();
    if (!source) { setPresellMessage('A Ficha salva não tem uma pasta local para copiar os assets.', true); return; }
    let targets;
    try {
      const accountDomains = new Set();
      targets = accounts.map((account, index) => {
        const config = configFor(account, draft), site = hostingerSiteByKey(config.site);
        const prefix = String(config.prefix || '').trim().toLowerCase();
        if (!site) throw new Error(`Selecione um site principal Hostinger para ${account.name || account.customerId}.`);
        if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix)) throw new Error(`Informe um prefixo de subdomínio válido para ${account.name || account.customerId}.`);
        const address = `${prefix}.${String(site.domain).trim().toLowerCase()}`;
        const uniqueKey = `${site.username}|${address}`;
        if (accountDomains.has(uniqueKey)) throw new Error(`O endereço ${address} foi atribuído a mais de uma conta destino.`);
        accountDomains.add(uniqueKey);
        const publicUrl = `https://${address}`;
        const destination = pageDestination(source, index + 1, String(site.domain).trim().toLowerCase());
        const { ficha } = buildStructuredFicha(draft.structuredFicha, {
          htmlLanguage: draft.htmlLanguage, countryCode: String(draft.countryCode || '').toUpperCase(),
          destination, assetFolder: draft.assetFolder || 'assets', skipFavicon: draft.skipFavicon === true,
          affiliateUrl: draft.affiliateUrl, pageTitle: draft.pageTitle,
          trackingEnabled: draft.trackingEnabled !== false,
          trackingHostname: address, trackingPlatform: draft.trackingPlatform,
          trackingAccountId: account.customerId,
        });
        return { pageNumber: index + 1, accountId: String(account.customerId), accountName: String(account.name || ''), hpanelDomain: String(site.domain).toLowerCase(), publicUrl, destination, ficha, hostinger: { parentDomain: String(site.domain).toLowerCase(), username: String(site.username), prefix, directory: prefix } };
      });
    } catch (error) { setPresellMessage(error.message || 'Revise a Ficha e os destinos Hostinger.', true); return; }

    busy = true; updateControls(); setPresellMessage(`Validando a mesma Ficha e os assets para ${targets.length} conta(s)…`);
    try {
      const result = await createPresellBatch(targets, {
        sourceDirectory: source,
        assetFolder: draft.assetFolder || 'assets',
        beforeConfirm: batchTargets => preparePresellTrackingBatch(batchTargets.map(target => target.ficha.tracking).filter(tracking => tracking.enabled)),
        afterConfirm: (_batchTargets, preparation) => preparation?.commit() || null,
        confirmationMessage: batchTargets => {
          const paths = batchTargets.map(target => `• ${target.accountName || target.accountId} → ${target.publicUrl} · pasta local ${target.destination}`).join('\n');
          return `Uma única Ficha será reutilizada para ${batchTargets.length} conta(s), com os assets de ${source}. O Hub vai validar e criar páginas locais sem sobrescrever destinos existentes. Depois, a tela Hostinger fará análise e publicação em uma etapa separada; as campanhas não serão validadas até o deploy ser confirmado.\n\n${paths}\n\nCriar as páginas locais?`;
        },
      });
      if (result.cancelled) { setPresellMessage('Geração cancelada. Nenhuma página foi criada.'); return; }
      const productionTargets = Array.isArray(result.production?.targets) ? result.production.targets : [];
      const generationSummary = targets.map(target => {
        const page = productionTargets.find(item => Number(item.pageNumber) === Number(target.pageNumber));
        const checks = page?.report?.phases?.flatMap(phase => phase.report?.checks || []) || [];
        const trackingOk = !target.ficha.tracking?.enabled || page?.trackingConfigured === true || checks.some(check => check.name === 'tracking-script' && check.status === 'PASS');
        const ready = page?.created === true && ['PASS', 'PASS_WITH_WARNINGS'].includes(String(page.report?.overall || '')) && trackingOk;
        return { pageNumber: target.pageNumber, accountId: target.accountId, accountName: target.accountName, hpanelDomain: target.hpanelDomain, publicUrl: target.publicUrl, sourceDirectory: target.destination, status: ready ? 'ready' : 'generation-blocked', detail: ready ? 'Ficha gerada e validada localmente; aguardando hospedagem e publicação.' : String(page?.error || 'A geração local não confirmou esta página como pronta.') };
      });
      const readyTargets = targets.filter(target => generationSummary.some(summary => summary.pageNumber === target.pageNumber && summary.status === 'ready'));
      if (!readyTargets.length) { setPresellMessage('A geração não liberou nenhuma página para deploy. Consulte a Ficha e corrija os bloqueios antes de tentar novamente.', true); return; }
      const job = queuePresellDeployJob({
        campaignDuplication: true,
        product: String(draft.product || draft.pageTitle || 'Pre-Sell'),
        generationSummary,
        targets: readyTargets.map(target => ({
          pageNumber: target.pageNumber, accountId: target.accountId, accountName: target.accountName,
          hpanelDomain: target.hpanelDomain, sourceDirectory: target.destination, publicUrl: target.publicUrl,
          parentDomain: target.hostinger.parentDomain, username: target.hostinger.username,
          prefix: target.hostinger.prefix, directory: target.hostinger.directory,
        })),
      });
      if (!job) { setPresellMessage('As páginas foram geradas, mas o Hub não conseguiu salvar o lote de hospedagem localmente. Abra Ficha e Pre-Sell para recuperar o deploy.', true); return; }
      activePresellJobId = job.id;
      for (const target of readyTargets) {
        const account = accounts.find(item => String(item.customerId) === target.accountId);
        if (account) targetUrlValues.set(accountKey(account), target.publicUrl);
      }
      renderTargets(); syncPublishedPresellUrls();
      const blockedCount = targets.length - readyTargets.length;
      setPresellMessage(`${readyTargets.length} de ${targets.length} Pre-Sell(s) pronta(s) localmente${blockedCount ? `; ${blockedCount} página(s) ficaram bloqueada(s) pela validação` : ''}. Conclua a análise e a publicação na Hostinger antes de validar a duplicação.`);
      openPresellDeployWorkflow(job.id);
    } catch (error) {
      const committed = Array.isArray(error?.afterConfirmation?.registrations) ? error.afterConfirmation.registrations.length : 0;
      setPresellMessage(`${error.message || 'Não foi possível gerar as Pre-Sells.'}${committed ? ` ${committed} Track(s) foram confirmadas; confira o relatório antes de repetir.` : ''}`, true);
    } finally { busy = false; updateControls(); }
  }

  function sequenceAccountsFromSelection(targets = null) {
    const selected = Array.isArray(targets) ? targets : [...targetArea.querySelectorAll('[data-target-check]:checked')]
      .map(check => (directory?.accounts || []).find(account => String(account.customerId) === String(check.dataset.targetCheck)))
      .filter(Boolean);
    const source = selectedAccount();
    const rows = [source, ...selected].filter(account => account
      && account.status === 'ENABLED'
      && /^\d{10}$/.test(String(account.managerCustomerId ?? ''))
      && /^\d{10}$/.test(String(account.customerId ?? '')))
      .map(account => ({ managerCustomerId: String(account.managerCustomerId), customerId: String(account.customerId) }));
    const unique = new Map(rows.map(account => [`${account.managerCustomerId}:${account.customerId}`, account]));
    return [...unique.values()];
  }

  function updateSequenceAccountCount() {
    sequenceAccountCount.textContent = String(sequenceAccountsFromSelection().length);
  }

  function selectedPercents() {
    return [...cpaArea.querySelectorAll('[data-cpa]:checked')].map(input => Number(input.dataset.cpa));
  }

  function renderInspection() {
    const resourceRows = Object.entries(inspection.resources || {}).map(([key, count]) => `<li><span>${escapeHtml(key.replaceAll('_', ' '))}</span><strong>${escapeHtml(count)}</strong></li>`).join('');
    const blockers = inspection.blockers.length
      ? `<div class="google-ads-duplication-blockers"><strong>Não pode ser copiada integralmente ainda:</strong><ul>${inspection.blockers.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`
      : '<p class="google-ads-duplication-ok">A inspeção não encontrou bloqueios. A prévia ainda validará todos os recursos e destinos.</p>';
    const sitelinks = inspection.sitelinks.length
      ? `<div class="google-ads-duplication-sitelinks"><strong>Sitelinks da origem</strong><ul>${inspection.sitelinks.map(item => `<li class="${item.supported ? 'is-supported' : 'is-blocked'}"><span>${escapeHtml(item.text || 'Sitelink')}</span><code>${escapeHtml(item.sourceUrl || 'URL ausente')}</code><small>${escapeHtml(item.supported ? 'Âncora preservada' : item.reason)}</small></li>`).join('')}</ul></div>`
      : '<p class="google-ads-duplication-help">A campanha não tem sitelinks vinculados.</p>';
    inspectionArea.innerHTML = `<div class="google-ads-duplication-summary"><strong>${escapeHtml(inspection.campaignName)}</strong><span>${escapeHtml(inspection.status)} · ${escapeHtml(inspection.currencyCode)}</span><ul>${resourceRows}</ul></div>${blockers}${sitelinks}`;
    inspectionArea.hidden = false;
    previewButton.disabled = busy || !inspection.copyable;
  }

  function renderPreview() {
    const sequenceRange = `${String(plan.sequenceStart).padStart(2, '0')}–${String(plan.sequenceEnd).padStart(2, '0')}`;
    const reservationNotice = plan.sequenceReserved
      ? `A faixa ${sequenceRange} está reservada por até 30 minutos para evitar números repetidos entre prévias. Se você não criar as cópias, a reserva expira automaticamente.`
      : `A faixa ${sequenceRange} não foi reservada porque a prévia encontrou bloqueios.`;
    previewList.innerHTML = `<p>${escapeHtml(plan.entries.length)} cópia(s) · sequência global pesquisada em ${escapeHtml(plan.sequenceAccountsChecked)} conta(s) · primeiro nome ${escapeHtml(plan.entries[0]?.campaignName || '')}</p>
      <p class="google-ads-duplication-help">${escapeHtml(reservationNotice)}</p>
      <div class="google-ads-duplication-table-wrap"><table class="google-ads-duplication-table"><thead><tr><th>Destino</th><th>Campanha</th><th>CPA</th><th>Pre-Sell</th><th>Estado</th></tr></thead><tbody>${plan.entries.map(entry => `<tr class="${entry.validated ? 'is-ready' : 'is-blocked'}"><td>${escapeHtml(entry.accountName)}</td><td>${escapeHtml(entry.campaignName)}</td><td>${escapeHtml(entry.cpa)} ${escapeHtml(entry.currencyCode)} · ${entry.percent}%</td><td><code>${escapeHtml(entry.preSellUrl)}</code></td><td>${entry.validated ? 'Validada · pausada' : escapeHtml(entry.blockers.join(' · ') || 'Bloqueada')}</td></tr>`).join('')}</tbody></table></div>
      ${plan.blockers.length ? `<div class="google-ads-duplication-blockers"><strong>A criação está bloqueada:</strong><ul>${plan.blockers.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
      <p class="google-ads-duplication-help">A consulta e validação ocorrem somente após este clique. Cada cópia validada será criada separadamente; falhas com confirmação podem ser repetidas individualmente. Respostas incertas exigem conferência na conta antes de repetir.</p>`;
    previewArea.hidden = false;
    createButton.disabled = busy || !plan.allValidated;
    previewButton.disabled = busy;
    message(mainStatus, plan.allValidated
      ? `Prévia concluída: ${plan.entries.length} cópia(s) validadas. Nenhuma campanha foi criada.`
      : 'A prévia encontrou recursos ou contas que precisam de correção. Nenhuma campanha foi criada.', !plan.allValidated);
  }

  function renderResults() {
    resultList.innerHTML = (plan?.results || []).map(result => `<article class="google-ads-duplication-result ${escapeHtml(result.state)}"><div><strong>${escapeHtml(result.campaignName)}</strong><span>${escapeHtml(result.accountName)} · ${escapeHtml(result.stateLabel)}</span>${result.error ? `<small>${escapeHtml(result.error)}</small>` : ''}</div>${result.state === 'failed' ? `<button class="btn" type="button" data-retry-entry="${escapeHtml(result.entryId)}" ${busy ? 'disabled' : ''}>Tentar novamente</button>` : result.state === 'uncertain' ? '<small>Confira o Google Ads antes de qualquer nova tentativa.</small>' : ''}</article>`).join('');
    resultsArea.hidden = !(plan?.results?.length);
    resultList.querySelectorAll('[data-retry-entry]').forEach(button => button.addEventListener('click', () => runEntries([button.dataset.retryEntry])));
  }

  function updateControls() {
    page.dataset.busy = String(busy);
    refreshButton.disabled = busy;
    sourceManager.disabled = busy || !directory?.managers?.length;
    sourceAccount.disabled = busy || !sourceAccount.options.length;
    loadCampaignsButton.disabled = busy || !selectedAccount() || !readTrackingHubToken().token;
    sourceCampaign.disabled = busy || !campaigns.length;
    inspectButton.disabled = busy || !selectedSourceCampaign();
    createButton.disabled = busy || !plan?.allValidated || created;
    previewButton.disabled = busy || !inspection?.copyable || !selectedSourceCampaign();
    targetArea.querySelectorAll('input').forEach(input => { input.disabled = busy || (input.matches('[data-target-url]') && !input.closest('[data-target-card]').querySelector('[data-target-check]').checked); });
    targetArea.querySelectorAll('select[data-target-hostinger-site]').forEach(input => { input.disabled = busy || !input.closest('[data-target-card]').querySelector('[data-target-check]').checked || !rootHostingerSites().length; });
    targetArea.querySelectorAll('input[data-target-hostinger-prefix]').forEach(input => { input.disabled = busy || !input.closest('[data-target-card]').querySelector('[data-target-check]').checked; });
    updatePresellControls();
    cpaArea.querySelectorAll('input').forEach(input => { input.disabled = busy; });
  }

  async function refreshDirectory() {
    if (busy) return;
    busy = true; updateControls(); message(sourceStatus, 'Atualizando MCCs e contas pelo servidor…');
    try {
      const payload = await fetchGoogleAdsAccounts();
      directory = normalizeGoogleAdsAccounts(payload);
      saveGoogleAdsAccountsCache(directory, { savedAtUtc: new Date().toISOString() });
      renderManagers('');
      message(sourceStatus, 'Lista de MCCs e contas atualizada.');
    } catch (error) { message(sourceStatus, error.message || 'Não foi possível atualizar MCCs e contas.', true); }
    finally { busy = false; updateControls(); }
  }

  async function loadCampaigns() {
    const account = selectedAccount();
    if (!account || busy) return;
    busy = true; updateControls(); resetSourceAndPlan(); message(sourceStatus, 'Consultando campanhas Search da conta…');
    try {
      campaigns = await fetchGoogleAdsCampaignsForDuplication({ managerCustomerId: account.managerCustomerId, customerId: account.customerId });
      sourceCampaign.replaceChildren(new Option(campaigns.length ? 'Selecione uma campanha Search' : 'Nenhuma campanha Search encontrada', ''));
      for (const campaign of campaigns) {
        const option = new Option(`${campaign.campaignName} · ${campaign.status}`, campaign.campaignId);
        sourceCampaign.append(option);
      }
      sourceCampaign.disabled = !campaigns.length;
      if (!applySourceCampaignPrefill()) message(sourceStatus, `${campaigns.length} campanha(s) Search carregada(s).`);
    } catch (error) { message(sourceStatus, error.message || 'Falha ao carregar campanhas.', true); }
    finally { busy = false; updateControls(); }
  }

  async function inspectCampaign() {
    const account = selectedAccount();
    const campaign = selectedSourceCampaign();
    if (!account || !campaign || busy) return;
    busy = true; updateControls(); inspectionArea.hidden = true; invalidatePlan();
    message(sourceStatus, 'Lendo a campanha e os recursos vinculados…');
    try {
      inspection = await inspectGoogleAdsCampaignForDuplication({ managerCustomerId: account.managerCustomerId, customerId: account.customerId, campaignId: campaign.campaignId });
      renderInspection();
      message(sourceStatus, inspection.copyable ? 'Inspeção concluída. A validação vai conferir os destinos e as permissões.' : 'A cópia está bloqueada até que os recursos listados possam ser preservados.', !inspection.copyable);
    } catch (error) { inspection = null; message(sourceStatus, error.message || 'Falha ao analisar os recursos da campanha.', true); }
    finally { busy = false; updateControls(); }
  }

  async function validatePlan() {
    if (busy) return;
    const sourceAccount = selectedAccount();
    const campaign = selectedSourceCampaign();
    if (!sourceAccount || !campaign || !inspection?.copyable) { message(mainStatus, 'Analise uma campanha Search compatível antes de validar.', true); return; }
    let targets;
    try { targets = selectedTargets(); } catch (error) { message(mainStatus, error.message, true); return; }
    if (!targets.length || targets.some(item => !item.preSellUrl)) { message(mainStatus, 'Selecione as contas de destino e informe uma URL HTTPS para cada uma.', true); return; }
    const unpublishedTarget = unpublishedManagedTarget(targets);
    if (unpublishedTarget) {
      const account = targets.find(item => String(item.customerId) === String(unpublishedTarget.accountId));
      message(mainStatus, `A Pre-Sell de ${account?.name || unpublishedTarget.accountName || unpublishedTarget.accountId} ainda não tem publicação confirmada na Hostinger. Conclua o deploy antes de validar as campanhas.`, true);
      return;
    }
    const percents = selectedPercents();
    if (!percents.length) { message(mainStatus, 'Marque ao menos uma faixa de CPA entre 30% e 80%.', true); return; }
    const sequenceAccounts = sequenceAccountsFromSelection(targets);
    if (sequenceAccounts.length !== targets.length + 1 || sequenceAccounts.length > 21) { message(mainStatus, 'Não foi possível montar o escopo da sequência com a origem e todos os destinos marcados. Atualize MCCs e contas e tente novamente.', true); return; }
    if (targets.length * percents.length > 24) { message(mainStatus, 'Este lote ultrapassa 24 cópias. Reduza contas ou faixas de CPA antes de validar.', true); return; }
    busy = true; invalidatePlan(); updateControls(); message(mainStatus, 'Validando recursos e pesquisando a sequência em ' + sequenceAccounts.length + ' contas selecionadas (origem + destinos)…');
    try {
      plan = await previewGoogleAdsCampaignDuplication({
        source: { managerCustomerId: sourceAccount.managerCustomerId, customerId: sourceAccount.customerId, campaignId: campaign.campaignId },
        targets,
        sequenceAccounts,
        cpaPercents: percents,
      });
      plan.results = [];
      renderPreview();
    } catch (error) { plan = null; previewArea.hidden = true; message(mainStatus, error.message || 'Não foi possível validar a duplicação.', true); }
    finally { busy = false; updateControls(); }
  }

  async function runEntries(entryIds) {
    if (!plan || busy) return;
    const entries = plan.entries.filter(entry => entryIds.includes(entry.entryId));
    if (!entries.length) return;
    if (!window.confirm(`Criar ${entries.length} cópia(s) pausada(s) no Google Ads? Cada cópia será verificada antes de aparecer como concluída.`)) return;
    busy = true; updateControls();
    plan.results ||= [];
    for (const entry of entries) {
      const previous = plan.results.find(item => item.entryId === entry.entryId);
      if (previous) previous.state = 'creating';
      else plan.results.push({ entryId: entry.entryId, campaignName: entry.campaignName, accountName: entry.accountName, state: 'creating', stateLabel: 'Criando…', error: '' });
      renderResults();
      message(mainStatus, `Criando ${entry.campaignName} em ${entry.accountName}…`);
      try {
        const result = await createGoogleAdsCampaignDuplicationEntry({ planToken: plan.planToken, entryId: entry.entryId });
        const row = plan.results.find(item => item.entryId === entry.entryId);
        Object.assign(row, { state: 'created', stateLabel: 'Criada e confirmada · pausada', error: '', campaignId: result.campaignId });
      } catch (error) {
        const row = plan.results.find(item => item.entryId === entry.entryId);
        const retryableFailure = error?.code && retryableErrors.has(error.code);
        const confirmedNoWrite = error?.code && confirmedNoWriteErrors.has(error.code);
        Object.assign(row, { state: retryableFailure ? 'failed' : confirmedNoWrite ? 'blocked' : 'uncertain',
          stateLabel: retryableFailure ? 'Falha confirmada · pode tentar novamente' : confirmedNoWrite ? 'Bloqueada · sem criação' : 'Confirmação incerta',
          error: error.message || 'A API não confirmou o resultado.' });
      }
      renderResults();
    }
    created = plan.results.some(item => item.state === 'created');
    const failed = plan.results.filter(item => item.state === 'failed').length;
    const blocked = plan.results.filter(item => item.state === 'blocked').length;
    const uncertain = plan.results.filter(item => item.state === 'uncertain').length;
    message(mainStatus, `${plan.results.filter(item => item.state === 'created').length} cópia(s) confirmada(s); ${failed} falha(s) que podem ser repetidas; ${blocked} bloqueio(s) sem criação; ${uncertain} confirmação(ões) incerta(s).`, failed + blocked + uncertain > 0);
    createButton.hidden = true;
    busy = false; updateControls(); renderResults();
  }

  sourceManager.addEventListener('change', () => { sourceCampaignPrefill = null; renderSourceAccounts(''); renderTargets(); updateSequenceAccountCount(); });
  sourceAccount.addEventListener('change', () => { sourceCampaignPrefill = null; resetSourceAndPlan(); renderTargets(); updateSequenceAccountCount(); loadCampaignsButton.disabled = busy || !selectedAccount(); });
  sourceCampaign.addEventListener('change', () => { inspection = null; inspectionArea.hidden = true; inspectButton.disabled = busy || !selectedSourceCampaign(); invalidatePlan(); });
  loadCampaignsButton.addEventListener('click', loadCampaigns);
  inspectButton.addEventListener('click', inspectCampaign);
  refreshButton.addEventListener('click', refreshDirectory);
  fichaDraftSelect.addEventListener('change', () => {
    try { localStorage.setItem(FICHA_SELECTION_KEY, fichaDraftSelect.value || ''); } catch {}
    renderTargets(); invalidatePlan();
    setPresellMessage(fichaDraftSelect.value ? 'A mesma Ficha salva será usada para todas as contas selecionadas.' : 'Selecione uma Ficha salva para gerar as páginas.');
  });
  refreshFichaDraftsButton.addEventListener('click', () => loadFichaDraftChoices());
  loadHostingerSitesButton.addEventListener('click', refreshHostingerSites);
  generatePresellsButton.addEventListener('click', generatePresellsFromSavedFicha);
  deployOpenButton.addEventListener('click', event => {
    const job = deployJobForDuplication();
    if (!job) return;
    event.preventDefault(); event.stopImmediatePropagation(); openPresellDeployWorkflow(job.id);
  }, true);
  targetArea.addEventListener('change', event => {
    if (!event.target.matches('[data-target-hostinger-site]')) return;
    persistFichaConfiguration();
  });
  targetArea.addEventListener('input', event => {
    if (!event.target.matches('[data-target-hostinger-prefix]')) return;
    persistFichaConfiguration();
  });
  previewButton.addEventListener('click', validatePlan);
  createButton.addEventListener('click', () => runEntries(plan?.entries.map(item => item.entryId) || []));
  mountPresellDeployWorkflow({ root, getDraftTargets: () => null, hpanelUrlForDomain: (domain, parentDomain) => accountDomainUrl(parentDomain) || accountDomainUrl(domain) });
  loadFichaDraftChoices({ keepSelection: false });
  renderCpaOptions();
  renderManagers();
  syncPublishedPresellUrls();
  globalThis.addEventListener?.(PRESELL_DEPLOY_JOBS_UPDATED_EVENT, () => {
    if (!page.isConnected) return;
    syncPublishedPresellUrls();
    const job = deployJobForDuplication();
    if (job?.targets?.length) {
      const published = job.targets.filter(target => target.deploymentState === 'success' || target.status === 'published'
        || (target.status === 'manual-verified' && target.manualVerification?.status === 'confirmed')).length;
      if (published === job.targets.length) setPresellMessage('Deploy ou verificação manual confirmados para todas as Pre-Sells deste lote. Já é possível validar a duplicação.');
      else if (published) setPresellMessage(`${published} de ${job.targets.length} Pre-Sell(s) deste lote já foram confirmadas. A validação libera cada URL após o deploy ou a verificação manual do respectivo destino.`);
    }
  });
  message(sourceStatus, directory ? 'Lista reutilizada do cache local do Hub; abrir a tela não consulta a API.' : 'Atualize MCCs e contas para selecionar a origem e os destinos.');
  window.addEventListener('storage', event => {
    if (event.key === 'hub.google-ads-account-directory:v1') syncDirectory();
  });

  const controller = Object.freeze({ syncDirectory, setInitialSelection });
  mountedRoots.set(root, controller);
  updateControls();
  if (initialSelection) setInitialSelection(initialSelection);
  return controller;
}
