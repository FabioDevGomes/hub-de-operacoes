import { fetchGoogleAdsAccounts } from './google-ads-service.mjs?v=10';
import { normalizeGoogleAdsAccounts } from './google-ads-domain.mjs?v=6';
import { loadGoogleAdsAccountsCache, saveGoogleAdsAccountsCache } from './google-ads-accounts-cache.mjs?v=2';
import { readTrackingHubToken } from '../tracking/tracking-token-storage.mjs?v=2';
import {
  createGoogleAdsCampaignDuplicationEntry,
  fetchGoogleAdsCampaignsForDuplication,
  inspectGoogleAdsCampaignForDuplication,
  previewGoogleAdsCampaignDuplication,
} from './google-ads-campaign-duplication-service.mjs?v=2';
import { GOOGLE_ADS_DUPLICATION_B_TEST_NOTICE, GOOGLE_ADS_DUPLICATION_CPA_LEVELS } from './google-ads-campaign-duplication-domain.mjs?v=1';

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
          <p class="google-ads-duplication-help">Marque as contas que receberão as cópias. Informe uma URL HTTPS por conta; todas as faixas de CPA enviadas à mesma conta usarão essa URL.</p>
          <div class="google-ads-duplication-targets" data-targets></div>
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

  let directory = loadGoogleAdsAccountsCache()?.accounts || null;
  let campaigns = [];
  let inspection = null;
  let plan = null;
  let busy = false;
  let created = false;
  let sourceCampaignPrefill = null;
  const selectedTargetKeys = new Set();

  const selectedManagerId = () => sourceManager.value === 'direct' ? null : sourceManager.value || null;
  const selectedAccount = () => directory?.accounts.find(item => String(item.customerId) === String(sourceAccount.value)
    && String(item.managerCustomerId ?? 'direct') === String(selectedManagerId() ?? 'direct')) || null;
  const selectedSourceCampaign = () => campaigns.find(item => item.campaignId === sourceCampaign.value) || null;
  const accountKey = account => `${account?.managerCustomerId ?? 'direct'}:${account?.customerId ?? ''}`;

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
      return;
    }
    targetArea.innerHTML = accounts.map(account => `<label class="google-ads-duplication-target${selectedTargetKeys.has(accountKey(account))?' is-selected':''}" data-target-card="${escapeHtml(account.customerId)}">
      <span class="google-ads-duplication-target-check"><input type="checkbox" data-target-check="${escapeHtml(account.customerId)}" data-target-manager="${escapeHtml(account.managerCustomerId || '')}"${selectedTargetKeys.has(accountKey(account))?' checked':''}><span><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.managerName)} · ${escapeHtml(account.currencyCode)} · ${escapeHtml(account.customerId)}</small></span></span>
      <span class="google-ads-creation-field"><span>URL da Pre-Sell desta conta</span><input class="input" type="url" inputmode="url" placeholder="https://dominio-da-presell.com" data-target-url="${escapeHtml(account.customerId)}"${selectedTargetKeys.has(accountKey(account))?'':' disabled'}></span>
    </label>`).join('');
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
    }));
    targetArea.querySelectorAll('[data-target-url]').forEach(input => input.addEventListener('input', invalidatePlan));
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
    if (sourceAvailable && managerAssociationChanged) {
      message(sourceStatus, 'A MCC do Mapa difere do diretório compartilhado. A origem foi preenchida conforme o vínculo atual da conta no cache; confira antes de carregar as campanhas.', true);
    }
    renderTargets();
    if (campaigns.length && sourceAlreadySelected) applySourceCampaignPrefill();
    updateSequenceAccountCount();
  }

  function selectedTargets() {
    return [...targetArea.querySelectorAll('[data-target-check]:checked')].map(check => {
      const account = (directory?.accounts || []).find(item => item.customerId === check.dataset.targetCheck);
      const preSellUrl = targetArea.querySelector(`[data-target-url="${CSS.escape(check.dataset.targetCheck)}"]`)?.value.trim() || '';
      if (!account) throw new Error('Uma conta selecionada deixou de estar no diretório local. Atualize MCCs e contas.');
      return { ...account, preSellUrl };
    });
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
  previewButton.addEventListener('click', validatePlan);
  createButton.addEventListener('click', () => runEntries(plan?.entries.map(item => item.entryId) || []));
  renderCpaOptions();
  renderManagers();
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
