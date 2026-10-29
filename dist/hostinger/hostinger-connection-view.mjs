import { activeCampaignAccountSuffixesBySubdomain, activeCampaignRootHostnames, isHostingerSubdomain, hostingerSubdomainParent } from './hostinger-site-filter.mjs?v=6';
import { readGoogleAdsFinalUrlHostRows } from '../google-ads/google-ads-final-url-host-cache.mjs?v=1';
import { accountDomainUrl } from '../accounts/accounts-domain.mjs?v=13';
import { hostingerFileManagerUrl } from './hostinger-file-manager-link.mjs?v=1';
import { mountColumnWidths } from '../curadoria/column-widths.mjs?v=1';

const mountedRoots = new WeakMap();

const API = Object.freeze({
  status: '/api/hostinger/status',
  connect: '/api/hostinger/connect',
  expiration: '/api/hostinger/expiration',
  sitesCache: '/api/hostinger/sites-cache',
  websites: '/api/hostinger/websites',
  createSubdomain: '/api/hostinger/subdomains',
  deleteSubdomain: '/api/hostinger/subdomains/delete',
  verifySubdomainDeletion: '/api/hostinger/subdomains/verify-deletion',
  publishPreflight: '/api/hostinger/publish/preflight',
  publish: '/api/hostinger/publish',
  disconnect: '/api/hostinger/connection',
});
const HIDDEN_DOMAINS_STORAGE_KEY = 'hub:hostinger:hidden-domains:v1';
const FILE_MANAGER_DOMAIN = 'travenzo.shop';
const PROTECTED_APP_SUBDOMAIN = 'track.travenzo.shop';

function subdomainDeletionKey(domain, username) {
  return `${String(username || '').trim()}\u0000${String(domain || '').trim().toLowerCase()}`;
}

function readHiddenDomains(storageImpl) {
  try {
    const storage = storageImpl ?? globalThis.localStorage;
    const values = JSON.parse(storage.getItem(HIDDEN_DOMAINS_STORAGE_KEY) || '[]');
    if (!Array.isArray(values)) return new Set();
    return new Set(values.filter(value => typeof value === 'string').map(value => value.trim().toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function saveHiddenDomains(domains, storageImpl) {
  try {
    const storage = storageImpl ?? globalThis.localStorage;
    storage.setItem(HIDDEN_DOMAINS_STORAGE_KEY, JSON.stringify([...domains].sort()));
    return true;
  } catch {
    return false;
  }
}

async function request(path, { method = 'GET', body, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('O servidor local do Hub não está disponível.');
  let response;
  try {
    response = await fetchImpl(path, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Não foi possível acessar a API local do Hub. Confira se o painel está aberto pelo iniciar-painel.cmd.');
  }
  let payload;
  try { payload = await response.json(); } catch { throw new Error('O servidor local retornou uma resposta ilegível.'); }
  if (!response.ok) throw new Error(String(payload?.error || `A conexão respondeu com erro HTTP ${response.status}.`));
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatTimestamp(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
    : '';
}

function formatCreationDate(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date)
    : '—';
}

function creationDateDiagnosticsText(diagnostics, sites, refreshCompletedWithoutDiagnostics = false) {
  if (!diagnostics || !Number.isFinite(Number(diagnostics.websiteCount))) {
    return refreshCompletedWithoutDiagnostics
      ? 'A lista foi atualizada, mas o servidor local não enviou o diagnóstico das datas. Clique em Reiniciar servidor no menu lateral e depois em Atualizar sites.'
      : 'Diagnóstico das datas disponível após clicar em Atualizar sites.';
  }
  const websiteCount = Math.max(0, Number(diagnostics.websiteCount));
  const fieldCount = Math.max(0, Number(diagnostics.fieldCount) || 0);
  const normalizedCount = Math.max(0, Number(diagnostics.normalizedCount) || 0);
  const browserReadableCount = (Array.isArray(sites) ? sites : []).filter(site => Number.isFinite(Date.parse(String(site.createdAt || '')))).length;
  return `Diagnóstico da última consulta: o campo de data veio preenchido em ${fieldCount}/${websiteCount} sites retornados pela API; o servidor normalizou ${normalizedCount}/${websiteCount}; o navegador reconhece ${browserReadableCount} datas nas linhas exibidas (pode incluir subdomínios registrados localmente).`;
}

const EXPIRATION_OPTIONS = Object.freeze([
  ['1_month', '1 mês'],
  ['3_months', '3 meses'],
  ['6_months', '6 meses'],
  ['1_year', '1 ano'],
  ['never', 'Nunca expira'],
]);

function expirationOptionLabel(value) {
  return EXPIRATION_OPTIONS.find(([term]) => term === value)?.[1] || 'Prazo não informado';
}

function renderExpirationSelect(id, value, disabled = false) {
  return `<select id="${id}" class="input hostinger-expiration-select" ${disabled ? 'disabled' : ''}>${EXPIRATION_OPTIONS.map(([term, label]) => `<option value="${term}" ${term === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}

function expirationReminder(metadata) {
  if (!metadata?.expirationTerm) return 'Prazo de expiração ainda não informado.';
  if (metadata.expirationTerm === 'never') return `Nunca expira, conforme o prazo selecionado. Lembrete registrado em ${formatTimestamp(metadata.registeredAtUtc)}.`;
  const expiry = new Date(metadata.expiresAtUtc || '');
  if (!Number.isFinite(expiry.getTime())) return 'A data do lembrete não está disponível.';
  const days = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
  const expiryDate = formatTimestamp(metadata.expiresAtUtc);
  if (days < 0) return `Prazo informado: ${expirationOptionLabel(metadata.expirationTerm)}. Data estimada já passou em ${expiryDate} (há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}).`;
  if (days === 0) return `Prazo informado: ${expirationOptionLabel(metadata.expirationTerm)}. Expira hoje (${expiryDate}).`;
  return `Prazo informado: ${expirationOptionLabel(metadata.expirationTerm)}. Expiração estimada em ${expiryDate} (faltam ${days} ${days === 1 ? 'dia' : 'dias'}).`;
}

function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export async function mountHostingerConnection({ root, fetchImpl = globalThis.fetch, confirmFn = globalThis.confirm?.bind(globalThis), storageImpl, getActiveCampaignDomains = () => [], getActiveCampaigns = () => [], getTrackingDomainList = () => ({ loaded: false, rows: [] }) } = {}) {
  if (!root) throw new Error('A área da integração Hostinger não foi encontrada.');
  mountedRoots.get(root)?.destroy?.();
  let hostingerSitesWidthsController = null;
  let hostingerSitesWidthsPreferences = storageImpl;
  if (!hostingerSitesWidthsPreferences) {
    try { hostingerSitesWidthsPreferences = globalThis.localStorage; } catch { hostingerSitesWidthsPreferences = null; }
  }
  const state = { connected: false, verified: false, sites: null, checkedAtUtc: '', creationDateDiagnostics: null, refreshCompletedWithoutDiagnostics: false, googleAdsFinalUrlRows: [], hiddenDomains: readHiddenDomains(storageImpl), unconfirmedSubdomainDeletions: new Set(), selectedSubdomains: new Set(), bulkDeleting: false, siteFilter: 'visible', expiration: null, busy: false, showTokenForm: true, message: '', messageType: 'info', publishForm: { domain: '', username: '', sourceDirectory: '', targetDirectory: '.' }, subdomainForm: { parentDomain: '', username: '', prefix: '', directory: '' }, publishPlan: null, publishPlanForm: null, publishResult: null };
  const doc = root.ownerDocument;
  const globalErrorNotice = doc.createElement('section');
  globalErrorNotice.className = 'hostinger-error-toast';
  globalErrorNotice.setAttribute('role', 'alert');
  globalErrorNotice.setAttribute('aria-atomic', 'true');
  globalErrorNotice.hidden = true;
  const errorNoticeHeading = doc.createElement('div');
  errorNoticeHeading.className = 'hostinger-error-toast-heading';
  const errorNoticeTitle = doc.createElement('strong');
  errorNoticeTitle.textContent = 'Erro na Hostinger';
  const dismissErrorNotice = doc.createElement('button');
  dismissErrorNotice.className = 'hostinger-error-toast-dismiss';
  dismissErrorNotice.type = 'button';
  dismissErrorNotice.setAttribute('aria-label', 'Dispensar aviso flutuante; o detalhe continua no painel');
  dismissErrorNotice.title = 'Dispensar aviso flutuante';
  dismissErrorNotice.textContent = '×';
  const errorNoticeText = doc.createElement('p');
  errorNoticeHeading.append(errorNoticeTitle, dismissErrorNotice);
  globalErrorNotice.append(errorNoticeHeading, errorNoticeText);
  doc.body.append(globalErrorNotice);
  let currentErrorNoticeMessage = '';
  let errorNoticeDismissed = false;
  const onDismissErrorNotice = () => {
    errorNoticeDismissed = true;
    globalErrorNotice.hidden = true;
  };
  dismissErrorNotice.addEventListener('click', onDismissErrorNotice);
  function syncGlobalErrorNotice() {
    const errorText = state.messageType === 'error' ? String(state.message || '').trim() : '';
    if (errorText !== currentErrorNoticeMessage) {
      currentErrorNoticeMessage = errorText;
      errorNoticeDismissed = false;
    }
    errorNoticeText.textContent = errorText;
    globalErrorNotice.hidden = !errorText || errorNoticeDismissed;
  }
  try { state.googleAdsFinalUrlRows = await readGoogleAdsFinalUrlHostRows(); } catch { /* The local tracking filter remains available without this cache. */ }

  function activeCampaignDomains() {
    try {
      const values = getActiveCampaignDomains?.();
      return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.$/, '')).filter(Boolean))];
    } catch {
      return [];
    }
  }

  function currentActiveCampaignRows() {
    try {
      const rows = getActiveCampaigns?.();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function currentTrackingDomainList() {
    try {
      const value = getTrackingDomainList?.();
      return value && typeof value === 'object' ? { ...value, rows: Array.isArray(value.rows) ? value.rows : [] } : { loaded: false, rows: [] };
    } catch {
      return { loaded: false, rows: [] };
    }
  }

  function hasActiveCampaignForSite(site, activeDomains) {
    const hostname = String(site?.domain || '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.$/, '');
    return Boolean(hostname && activeDomains.includes(hostname));
  }

  function subdomainDeletionDetails(site, siteIndex) {
    if (!site || !Array.isArray(state.sites) || !isHostingerSubdomain(site, state.sites)) return null;
    const index = Number.isInteger(siteIndex) ? siteIndex : state.sites.indexOf(site);
    const parent = hostingerSubdomainParent(site, state.sites);
    const domain = String(site.domain || '').trim().toLowerCase();
    const parentDomain = String(parent?.domain || site.parentDomain || '').trim().toLowerCase();
    const username = String(site.username || '').trim();
    if (domain === PROTECTED_APP_SUBDOMAIN) return null;
    const prefix = parentDomain && domain.endsWith('.' + parentDomain)
      ? domain.slice(0, -(parentDomain.length + 1))
      : '';
    if (index < 0 || !domain || !parent || !parentDomain || !username || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix)) return null;
    return { site, siteIndex: index, parent, domain, parentDomain, username, prefix, key: subdomainDeletionKey(domain, username), directory: String(site.rootDirectory || 'não informado no inventário') };
  }

  function selectedSubdomainTargets() {
    if (!Array.isArray(state.sites)) return [];
    return state.sites.flatMap((site, index) => {
      const details = subdomainDeletionDetails(site, index);
      return details && state.selectedSubdomains.has(details.key) && !state.unconfirmedSubdomainDeletions.has(details.key)
        ? [details]
        : [];
    });
  }

  function syncBulkDeleteButton() {
    const button = root.querySelector('[data-hostinger-action="delete-selected-subdomains"]');
    if (!button) return;
    const count = selectedSubdomainTargets().length;
    button.disabled = state.busy || count === 0;
    button.textContent = state.bulkDeleting ? 'Excluindo selecionados…' : `Excluir selecionados${count ? ` (${count})` : ''}`;
  }

  const renderSites = (filteredSites, trackingDomains, activeCampaignAccountsBySubdomain) => {
    if (state.sites === null) return '<div class="hostinger-empty">Use “Atualizar sites” para consultar seus domínios na Hostinger.</div>';
    if (!state.sites.length) return '<div class="hostinger-empty">A API respondeu, mas não encontrou sites acessíveis a este token.</div>';
    if (!filteredSites.length && state.siteFilter === 'hidden') return '<div class="hostinger-empty">Não há domínios ocultos para mostrar.</div>';
    if (!filteredSites.length && state.siteFilter === 'active-campaigns') return '<div class="hostinger-empty">Nenhum domínio visível está associado a contas com campanhas ativas nos registros locais do Hub.</div>';
    if (!filteredSites.length && state.siteFilter === 'active-presell-subdomains') {
      if (trackingDomains?.invalid && !state.googleAdsFinalUrlRows.length) return '<div class="hostinger-empty">A lista local de Tracks está inválida e o cache de destinos Google Ads está vazio. Atualize as Tracks; os destinos de anúncios serão importados na próxima atualização manual ou automática. Esta tela não faz consulta extra.</div>';
      if (!trackingDomains?.loaded && !state.googleAdsFinalUrlRows.length) return '<div class="hostinger-empty">A lista de Tracks ainda não foi carregada e o cache de destinos Google Ads está vazio. Os destinos serão importados na próxima atualização manual ou automática; esta tela não faz consulta extra.</div>';
      return '<div class="hostinger-empty">Nenhum subdomínio Hostinger corresponde a uma Track ativa ou a um destino final ENABLED armazenado no cache local.</div>';
    }
    if (!filteredSites.length) return '<div class="hostinger-empty">Todos os domínios estão ocultos. Altere o filtro para “Mostrar todas” ou “Mostrar ocultos” para restaurar algum.</div>';
    const sortedSites = [...filteredSites].sort((left, right) => {
      const leftCreatedAt = Date.parse(String(left.createdAt || ''));
      const rightCreatedAt = Date.parse(String(right.createdAt || ''));
      const leftHasDate = Number.isFinite(leftCreatedAt);
      const rightHasDate = Number.isFinite(rightCreatedAt);
      if (leftHasDate && rightHasDate) return rightCreatedAt - leftCreatedAt;
      if (leftHasDate) return -1;
      if (rightHasDate) return 1;
      return 0;
    });
    const rows = sortedSites.map(site => {
      const domain = String(site.domain || '').trim().toLowerCase();
      const hidden = state.hiddenDomains.has(domain);
      const action = hidden ? 'show-site' : 'hide-site';
      const label = hidden ? 'Mostrar' : 'Ocultar';
      const siteIndex = state.sites.indexOf(site);
      const subdomain = isHostingerSubdomain(site, state.sites);
      const parent = subdomain ? hostingerSubdomainParent(site, state.sites) : null;
      const hpanelDomain = subdomain
        ? String(parent?.domain || site.parentDomain || '').trim().toLowerCase()
        : domain;
      const hpanelUrl = accountDomainUrl(hpanelDomain);
      const hpanelLink = hpanelUrl
        ? `<a class="hostinger-hpanel-link" href="${escapeHtml(hpanelUrl)}" target="_blank" rel="noopener noreferrer" title="Abrir HPanel do domínio ${escapeHtml(hpanelDomain)}" aria-label="Abrir HPanel do domínio ${escapeHtml(hpanelDomain)}">Abrir HPanel</a>`
        : '—';
      const activeAccountSuffixes = subdomain ? [...(activeCampaignAccountsBySubdomain.get(domain) || [])].sort() : [];
      const activeCampaignAccountsCell = activeAccountSuffixes.length
        ? `<span title="Conta(s) Google Ads com campanha/anúncio ENABLED e hostname final correspondente">${activeAccountSuffixes.map(suffix => escapeHtml(suffix)).join(', ')}</span>`
        : '<span class="hostinger-campaign-account-empty" title="Nenhuma correspondência exata encontrada no cache local de destinos finais ativos">—</span>';
      const creationDate = formatCreationDate(site.createdAt);
      const creationDateCell = creationDate === '—'
        ? '<span title="Data não informada ou inválida na lista da Hostinger.">—</span>'
        : `<time datetime="${escapeHtml(site.createdAt)}" title="Data de criação na hospedagem Hostinger">${escapeHtml(creationDate)}</time>`;
      const protectedAppSubdomain = domain === PROTECTED_APP_SUBDOMAIN;
      let subdomainCell = '<span class="hostinger-subdomain-kind">Domínio principal</span>';
      if (subdomain) {
        const parentDomain = String(parent?.domain || site.parentDomain || '').trim().toLowerCase();
        const prefix = parentDomain && domain.endsWith('.' + parentDomain) ? domain.slice(0, -(parentDomain.length + 1)) : '';
        const canDelete = !protectedAppSubdomain && Boolean(parent && parentDomain && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix));
        const deletionKey = subdomainDeletionKey(domain, site.username);
        const deletionVerificationPending = state.unconfirmedSubdomainDeletions.has(deletionKey);
        const selectedForBulkDelete = state.selectedSubdomains.has(deletionKey);
        const parentLabel = 'Subdomínio';
        const deleteButton = protectedAppSubdomain
          ? '<span class="hostinger-subdomain-protected-label" title="Este subdomínio contém os dados do servidor da aplicação do Hub e está protegido contra exclusão.">Servidor do Hub · protegido</span>'
          : canDelete
            ? deletionVerificationPending
            ? `<button class="btn hostinger-site-verify-deletion" type="button" data-hostinger-action="verify-subdomain-deletion" data-site-index="${siteIndex}" ${state.busy ? 'disabled' : ''} aria-label="Verificar exclusão não confirmada de ${escapeHtml(site.domain || '')}">Verificar exclusão não confirmada</button>`
            : `<button class="btn danger hostinger-site-delete-subdomain" type="button" data-hostinger-action="delete-subdomain" data-site-index="${siteIndex}" ${state.busy ? 'disabled' : ''} aria-label="Excluir subdomínio ${escapeHtml(site.domain || '')}">Excluir subdomínio</button>`
          : '<span class="hostinger-subdomain-unavailable" title="Atualize os sites e confirme o domínio principal antes de excluir.">Exclusão não identificada</span>';
        const selectionCheckbox = canDelete && !deletionVerificationPending
          ? `<label class="hostinger-subdomain-select" title="Selecionar ${escapeHtml(site.domain || '')} para exclusão em lote"><input type="checkbox" data-subdomain-selection data-domain="${escapeHtml(domain)}" data-username="${escapeHtml(site.username || '')}" aria-label="Selecionar subdomínio ${escapeHtml(site.domain || '')} para exclusão em lote" ${selectedForBulkDelete ? 'checked' : ''} ${state.busy ? 'disabled' : ''}></label>`
          : '';
        subdomainCell = `<div class="hostinger-subdomain-cell"><span class="hostinger-subdomain-kind">${parentLabel}</span><div class="hostinger-subdomain-controls">${deleteButton}${selectionCheckbox}</div></div>`;
      }
      return `<tr${protectedAppSubdomain ? ' class="hostinger-site-protected" title="Subdomínio protegido: contém dados do servidor da aplicação do Hub."' : ''} data-hostinger-site-index="${siteIndex}"><td>${creationDateCell}</td><td class="hostinger-domain">${escapeHtml(site.domain || '—')}</td><td>${escapeHtml(site.username || '—')}</td><td>${escapeHtml(site.websiteType || '—')}</td><td>${escapeHtml(site.status || 'Não informado')}</td><td>${hpanelLink}</td><td><button class="btn hostinger-site-visibility" type="button" data-hostinger-action="${action}" data-domain="${escapeHtml(domain)}" aria-label="${label} ${escapeHtml(site.domain || 'domínio')}">${label}</button></td><td>${activeCampaignAccountsCell}</td><td class="hostinger-subdomain-action-cell">${subdomainCell}</td></tr>`;
    }).join('');
    return `<div class="hostinger-table-wrap"><p id="hostingerSitesWidthsMessage" class="hub-widths-message" role="status" aria-live="polite"></p><table class="hostinger-sites"><thead><tr><th data-column="createdAt" title="Criação do site na hospedagem Hostinger">Data de criação</th><th data-column="domain">Domínio</th><th data-column="hostingAccount">Conta Hostinger</th><th data-column="type">Tipo</th><th data-column="status">Situação</th><th data-column="hpanel">HPanel</th><th data-column="visibility">Visibilidade</th><th data-column="adsAccounts">Conta(s) Ads ativa(s)</th><th data-column="subdomain">Subdomínio</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };

  const renderPublishPanel = () => {
    if (!state.connected) return '';
    const sites = Array.isArray(state.sites) ? state.sites : [];
    const options = sites.map(site => {
      const selected = site.domain === state.publishForm.domain && site.username === state.publishForm.username;
      return `<option value="${escapeHtml(site.domain)}" data-username="${escapeHtml(site.username)}" ${selected ? 'selected' : ''}>${escapeHtml(site.domain)} · ${escapeHtml(site.username || 'conta não informada')}</option>`;
    }).join('');
    const activeParentHosts = activeCampaignRootHostnames({ sites, campaignDomains: activeCampaignDomains() });
    const parentSites = sites.filter(site => {
      const hostname = String(site.domain || '').trim().toLowerCase().replace(/^\.+/, '').replace(/\.$/, '');
      return activeParentHosts.has(hostname) && !state.hiddenDomains.has(hostname);
    });
    const parentOptions = parentSites.map(site => {
      const selected = site.domain === state.subdomainForm.parentDomain && site.username === state.subdomainForm.username;
      return `<option value="${escapeHtml(site.domain)}" data-username="${escapeHtml(site.username)}" ${selected ? 'selected' : ''}>${escapeHtml(site.domain)} · ${escapeHtml(site.username || 'conta não informada')}</option>`;
    }).join('');
    const subdomainName = state.subdomainForm.prefix.trim().toLowerCase();
    const subdomainParent = state.subdomainForm.parentDomain || 'seu-dominio.com';
    const subdomainPreview = subdomainName ? `${subdomainName}.${subdomainParent}` : `prefixo.${subdomainParent}`;
    const plan = state.publishPlan;
    let preview = '<div class="hostinger-publish-empty">A prévia consulta a pasta local e confere o destino na Hostinger; nenhum arquivo é enviado nessa etapa.</div>';
    if (plan) {
      const conflicts = (plan.conflicts || []).map(item => `<li>${escapeHtml(item.path)}</li>`).join('');
      const missing = (plan.missingDirectories || []).map(path => `<li>${escapeHtml(path)}</li>`).join('');
      const linked = (plan.linkedDirectories || []).map(path => `<li>${escapeHtml(path)}</li>`).join('');
      const rows = (plan.files || []).map(file => `<tr><td>${escapeHtml(file.relativePath)}</td><td>${formatFileSize(file.sizeBytes)}</td><td>${escapeHtml(file.remotePath)}</td></tr>`).join('');
      preview = `<div class="hostinger-publish-summary ${plan.ready ? 'is-ready' : 'is-blocked'}"><strong>${plan.ready ? 'Pronto para revisar' : 'Prévia bloqueada'}</strong><span>${Number(plan.fileCount) || 0} arquivos · ${formatFileSize(plan.totalBytes)} · ${escapeHtml(plan.domain)} · public_html/${escapeHtml(plan.targetDirectory || '')}</span></div>
        ${conflicts ? `<div class="hostinger-publish-warning"><strong>Arquivos já existentes — serão preservados:</strong><ul>${conflicts}</ul></div>` : ''}
        ${missing ? `<div class="hostinger-publish-warning"><strong>Crie estas pastas no hPanel antes de publicar:</strong><ul>${missing}</ul></div>` : ''}
        ${linked ? `<div class="hostinger-publish-warning"><strong>O destino atravessa links remotos e foi bloqueado:</strong><ul>${linked}</ul></div>` : ''}
        <div class="hostinger-publish-table-wrap"><table class="hostinger-publish-table"><thead><tr><th>Arquivo local</th><th>Tamanho</th><th>Destino dentro de public_html</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="hostinger-publish-actions"><button class="btn primary" type="button" data-hostinger-action="publish" ${!plan.ready || state.busy ? 'disabled' : ''}>Publicar ${Number(plan.fileCount) || 0} arquivos</button><span>O Hub não substitui arquivos existentes.</span></div>`;
    }
    if (state.publishResult) {
      const results = (state.publishResult.results || []).map(item => `<li class="${item.uploaded ? 'is-uploaded' : 'is-failed'}">${escapeHtml(item.path)} — ${item.uploaded ? 'enviado' : escapeHtml(item.error || 'falhou')}</li>`).join('');
      preview = `<div class="hostinger-publish-summary ${state.publishResult.complete ? 'is-ready' : 'is-blocked'}"><strong>${state.publishResult.complete ? 'Publicação concluída' : 'Publicação parcial'}</strong><span>${Number(state.publishResult.uploadedCount) || 0} de ${Number(state.publishResult.totalCount) || 0} arquivos enviados para ${escapeHtml(state.publishResult.domain)} · public_html/${escapeHtml(state.publishResult.targetDirectory || '')}</span></div>${state.publishResult.error ? `<p class="hostinger-publish-error">${escapeHtml(state.publishResult.error)}</p>` : ''}<ul class="hostinger-publish-results">${results}</ul>`;
    }
    return `<section class="hostinger-panel hostinger-publish-panel" aria-labelledby="hostingerPublishTitle">
      <div class="hostinger-section-heading"><div><h3 id="hostingerPublishTitle">Publicar arquivos de uma Pre-Sell</h3><p>Selecione uma pasta local e um site carregado acima. O envio acontece somente depois da prévia e da sua confirmação.</p></div></div>
      <section class="hostinger-subdomain-box" aria-labelledby="hostingerSubdomainTitle">
        <div><h4 id="hostingerSubdomainTitle">Criar subdomínio</h4><p>Escolha o site principal e informe apenas o prefixo. O Hub cria o endereço e o adiciona à lista de destinos.</p></div>
        <div class="hostinger-subdomain-form">
          <label>Site principal<select class="input" data-subdomain-field="parentDomain" ${!parentSites.length || state.busy ? 'disabled' : ''}><option value="">${parentSites.length ? 'Selecione o site principal' : sites.length ? 'Nenhum domínio principal com campanhas ativas' : 'Atualize os sites para carregar a lista'}</option>${parentOptions}</select></label>
          <label>Prefixo do subdomínio<input class="input" type="text" data-subdomain-field="prefix" value="${escapeHtml(state.subdomainForm.prefix)}" placeholder="teste" autocomplete="off" spellcheck="false" ${state.busy ? 'disabled' : ''}></label>
          <label>Diretório raiz do subdomínio<input class="input" type="text" data-subdomain-field="directory" value="${escapeHtml(state.subdomainForm.directory || state.subdomainForm.prefix)}" placeholder="teste" ${state.busy ? 'disabled' : ''}></label>
        </div>
        <div class="hostinger-subdomain-actions"><span>Endereço: <strong data-subdomain-preview>${escapeHtml(subdomainPreview)}</strong></span><button class="btn primary" type="button" data-hostinger-action="create-subdomain" ${!parentSites.length || state.busy ? 'disabled' : ''}>${state.busy && state.message.includes('subdomínio') ? 'Criando…' : 'Criar subdomínio'}</button></div>
        <p class="hostinger-subdomain-help">O diretório é relativo à raiz do site principal; por padrão, usamos uma pasta com o mesmo nome do prefixo. A confirmação final mostra o endereço e a pasta antes de chamar a Hostinger. O DNS pode levar até 24 horas; se os nameservers forem externos, configure o registro DNS no provedor responsável.</p>
      </section>
      <div class="hostinger-publish-form">
        <label>Site Hostinger<select class="input" data-publish-field="site" ${!sites.length || state.busy ? 'disabled' : ''}><option value="">${sites.length ? 'Selecione um site' : 'Clique em Atualizar sites para carregar a lista'}</option>${options}</select></label>
        <label class="hostinger-publish-source">Pasta local da Pre-Sell<input class="input" type="text" data-publish-field="sourceDirectory" value="${escapeHtml(state.publishForm.sourceDirectory)}" placeholder="C:\\...\\produtos\\Produto\\pag01" ${state.busy ? 'disabled' : ''}></label>
        <label>Pasta dentro de public_html<input class="input" type="text" data-publish-field="targetDirectory" value="${escapeHtml(state.publishForm.targetDirectory)}" placeholder=". = raiz do site" ${state.busy ? 'disabled' : ''}></label>
      </div>
      <p class="hostinger-publish-help">A pasta local precisa estar dentro da pasta Produtos configurada no Hub. São enviados arquivos estáticos comuns (HTML, CSS, JS e imagens); arquivos de servidor, ocultos ou desconhecidos são bloqueados. O destino e as subpastas usadas pelos assets já precisam existir no hPanel. A prévia faz uma consulta de leitura à Hostinger. O envio usa arquivos novos e não substitui os existentes.</p>
      <div class="hostinger-publish-top-actions"><button class="btn" type="button" data-hostinger-action="preflight" ${!sites.length || state.busy ? 'disabled' : ''}>${state.busy && state.message.includes('prévia') ? 'Analisando…' : 'Analisar publicação'}</button></div>
      <div id="hostingerPublishPreview" class="hostinger-publish-preview">${preview}</div>
    </section>`;
  };

  const render = () => {
    hostingerSitesWidthsController?.destroy();
    hostingerSitesWidthsController = null;
    const statusLabel = state.connected
      ? (state.verified ? 'Conexão verificada' : 'Token protegido neste computador')
      : 'Não conectado';
    const statusClass = state.connected ? (state.verified ? 'is-connected' : 'is-configured') : 'is-disconnected';
    const message = state.message ? `<p class="hostinger-message is-${escapeHtml(state.messageType)}" role="status" aria-live="polite">${escapeHtml(state.message)}</p>` : '';
    const expiryTerm = state.expiration?.expirationTerm || '1_month';
    const expirationPanel = state.connected ? `
      <section class="hostinger-expiration" aria-labelledby="hostingerExpirationTitle">
        <div class="hostinger-expiration-copy"><h4 id="hostingerExpirationTitle">Lembrete de expiração</h4><p>${escapeHtml(expirationReminder(state.expiration))}</p><small>Este lembrete usa o prazo escolhido e a data de conexão registrada no Hub. A Hostinger não informa aqui a data real de expiração do token.</small></div>
        <div class="hostinger-expiration-control">${renderExpirationSelect('hostingerSavedExpiration', expiryTerm, state.busy)}<button class="btn" type="button" data-hostinger-action="save-expiration" ${state.busy ? 'disabled' : ''}>Salvar prazo</button></div>
      </section>` : '';
    const tokenForm = (!state.connected || state.showTokenForm) ? `
      <form class="hostinger-token-form" data-hostinger-form novalidate>
        <label for="hostingerApiToken">Token da API Hostinger</label>
        <div class="hostinger-token-row">
          <input id="hostingerApiToken" name="token" type="password" class="input" autocomplete="new-password" spellcheck="false" placeholder="Cole o token criado no hPanel" aria-describedby="hostingerTokenHelp" ${state.busy ? 'disabled' : ''}>
          <button class="btn primary" type="submit" data-hostinger-action="connect" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Validando…' : (state.connected ? 'Validar e trocar token' : 'Conectar e testar')}</button>
        </div>
        <label for="hostingerNewTokenExpiration">Validade configurada no hPanel</label>
        ${renderExpirationSelect('hostingerNewTokenExpiration', expiryTerm, state.busy)}
        <small id="hostingerTokenHelp">O Hub valida o token e o protege pelo Windows. Ele não fica salvo no navegador. Se você já conectou, o token anterior permanece se a troca falhar.</small>
        <small>O Hub conta esse prazo a partir da conexão. Escolha a mesma validade definida ao criar o token no hPanel.</small>
      </form>` : '';
    const connectionActions = state.connected && !state.showTokenForm ? `
      <div class="hostinger-actions">
        <button class="btn primary" type="button" data-hostinger-action="refresh" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Consultando…' : 'Atualizar sites'}</button>
        <button class="btn" type="button" data-hostinger-action="replace" ${state.busy ? 'disabled' : ''}>Trocar token</button>
        <button class="btn" type="button" data-hostinger-action="disconnect" ${state.busy ? 'disabled' : ''}>Desconectar</button>
      </div>` : '';
    const loadedSites = Array.isArray(state.sites) ? state.sites : [];
    const hiddenSiteCount = loadedSites.filter(site => state.hiddenDomains.has(String(site.domain || '').trim().toLowerCase())).length;
    const subdomainCount = loadedSites.filter(site => isHostingerSubdomain(site, loadedSites)).length;
    const activeDomains = activeCampaignDomains();
    const activeCampaigns = currentActiveCampaignRows();
    const trackingDomains = currentTrackingDomainList();
    const activeCampaignAccountsBySubdomain = activeCampaignAccountSuffixesBySubdomain({ sites: loadedSites, trackingDomains: trackingDomains.rows, campaigns: activeCampaigns, googleAdsFinalUrlRows: state.googleAdsFinalUrlRows });
    const activePreSellHosts = new Set(activeCampaignAccountsBySubdomain.keys());
    const filteredSites = loadedSites.filter(site => {
      const hidden = state.hiddenDomains.has(String(site.domain || '').trim().toLowerCase());
      if (state.siteFilter === 'hidden') return hidden;
      if (hidden && state.siteFilter !== 'all') return false;
      if (state.siteFilter === 'active-campaigns') return hasActiveCampaignForSite(site, activeDomains);
      if (state.siteFilter === 'active-presell-subdomains') return activePreSellHosts.has(String(site.domain || '').trim().toLowerCase());
      return true;
    });
    const filteredSiteCount = filteredSites.length;
    const selectedSubdomainCount = selectedSubdomainTargets().length;
    const bulkDeleteButton = state.sites === null ? '' : `<button class="btn danger hostinger-bulk-delete" type="button" data-hostinger-action="delete-selected-subdomains" ${state.busy || selectedSubdomainCount === 0 ? 'disabled' : ''}>${state.bulkDeleting ? 'Excluindo selecionados…' : `Excluir selecionados${selectedSubdomainCount ? ` (${selectedSubdomainCount})` : ''}`}</button>`;
    const siteFilter = state.sites === null ? '' : `<label class="hostinger-site-filter">Filtrar domínios<select class="input" data-hostinger-site-filter aria-label="Filtrar domínios Hostinger"><option value="all" ${state.siteFilter === 'all' ? 'selected' : ''}>Mostrar todas</option><option value="visible" ${state.siteFilter === 'visible' ? 'selected' : ''}>Mostrar todas menos ocultos</option><option value="active-campaigns" ${state.siteFilter === 'active-campaigns' ? 'selected' : ''}>Domínios com campanhas ativas</option><option value="active-presell-subdomains" ${state.siteFilter === 'active-presell-subdomains' ? 'selected' : ''}>Somente subdomínios com campanhas ativas</option><option value="hidden" ${state.siteFilter === 'hidden' ? 'selected' : ''}>Mostrar ocultos${hiddenSiteCount ? ` (${hiddenSiteCount})` : ''}</option></select></label>`;
    const fileShortcuts = `
      <section class="hostinger-panel hostinger-file-shortcuts" aria-labelledby="hostingerFileShortcutsTitle">
        <div class="hostinger-section-heading"><div><h3 id="hostingerFileShortcutsTitle">Deploy de arquivos</h3><p>Atalhos para abrir as pastas da hospedagem no File Manager.</p></div></div>
        <div class="hostinger-file-shortcut-links">
          <a class="btn" href="${escapeHtml(accountDomainUrl(FILE_MANAGER_DOMAIN) || 'https://hpanel.hostinger.com/')}" target="_blank" rel="noopener noreferrer">Abrir HPanel · ${escapeHtml(FILE_MANAGER_DOMAIN)}</a>
          <a class="btn" href="${escapeHtml(hostingerFileManagerUrl('public_html/track'))}" target="_blank" rel="noopener noreferrer">Abrir Track · public_html/track</a>
          <a class="btn" href="${escapeHtml(hostingerFileManagerUrl(`domains/${FILE_MANAGER_DOMAIN}/private-tools`))}" target="_blank" rel="noopener noreferrer">Abrir Private Tools</a>
        </div>
        <p class="hostinger-file-shortcut-note">Links manuais, sem envio de arquivos. A sessão do File Manager pode expirar; abra uma pasta por vez e, se necessário, inicie uma nova pelo HPanel.</p>
      </section>`;

    const sites = state.connected ? `
      <section class="hostinger-panel hostinger-sites-panel" aria-labelledby="hostingerSitesTitle">
        <div class="hostinger-section-heading"><div><h3 id="hostingerSitesTitle">Sites disponíveis</h3><p>Os domínios Hostinger só são consultados ao clicar em atualizar. O filtro de Pre-Sells combina Tracks e destinos finais ENABLED guardados localmente; a API Google Ads atualiza esse cache durante a atualização manual ou automática quando ele passa de 24 horas.</p><p>A coluna de contas Ads mostra os quatro últimos dígitos quando uma Track ativa ou um destino final ENABLED coincide exatamente com o subdomínio. “—” significa que o cache local não identificou correspondência; não confirma ausência de campanhas. A tela não faz consulta extra à Google Ads API.</p><p class="hostinger-subdomain-limit-note">Referência Hostinger: até 100 subdomínios em hospedagem Web e até 300 em Cloud. O limite aplicável depende do plano e da versão; confirme no hPanel. <a href="https://www.hostinger.com/pt/tutoriais/o-que-sao-subdominios/" target="_blank" rel="noopener noreferrer">Ver referência de subdomínios</a> · <a href="https://support.hostinger.com/en/articles/10717644-new-web-and-cloud-hosting-limits" target="_blank" rel="noopener noreferrer">Limites por plano</a>.</p></div><div class="hostinger-sites-heading-actions">${bulkDeleteButton}${siteFilter}${state.sites === null ? '' : `<span class="hostinger-count">${filteredSiteCount} de ${loadedSites.length} sites · ${subdomainCount} subdomínio${subdomainCount === 1 ? '' : 's'} no total${state.siteFilter !== 'hidden' && hiddenSiteCount ? ` · ${hiddenSiteCount} ocultos` : ''}${state.checkedAtUtc ? ` · ${escapeHtml(formatTimestamp(state.checkedAtUtc))}` : ''}</span>`}</div></div>
        ${state.sites?.length ? `<p class="hostinger-column-width-help">Ordenação pela data de criação na hospedagem, da mais recente para a mais antiga; datas ausentes (“—”) ficam no fim. Não é necessariamente a data de registro do domínio. Arraste as divisórias entre os títulos para ajustar as larguras; o ajuste fica salvo neste navegador. ${escapeHtml(creationDateDiagnosticsText(state.creationDateDiagnostics, filteredSites, state.refreshCompletedWithoutDiagnostics))}</p>` : ''}
        ${renderSites(filteredSites, trackingDomains, activeCampaignAccountsBySubdomain)}
      </section>` : '';

    root.innerHTML = `
      <main class="hostinger-page">
        <header class="hostinger-page-header">
          <div><div class="hostinger-eyebrow">INTEGRAÇÕES</div><h2>Hostinger</h2></div>
          <span class="hostinger-status ${statusClass}" aria-live="polite"><span class="hostinger-status-dot"></span>${statusLabel}</span>
        </header>
        <section class="hostinger-panel hostinger-connection-panel" aria-labelledby="hostingerConnectionTitle">
          <div class="hostinger-section-heading"><div><h3 id="hostingerConnectionTitle">Conexão da API</h3></div></div>
          <div class="hostinger-steps">
            <div class="hostinger-step"><span>1</span><p>No hPanel, abra <strong>API</strong> e crie um token.</p></div>
            <div class="hostinger-step"><span>2</span><p>Cole o token abaixo e clique em <strong>Conectar e testar</strong>.</p></div>
          </div>
          ${tokenForm}
          ${expirationPanel}
          ${connectionActions}
          ${message}
        </section>
        ${fileShortcuts}
        ${sites}
      </main>`;
    const sitesTable = root.querySelector('.hostinger-sites');
    if (sitesTable) {
      const widthsMessage = root.querySelector('#hostingerSitesWidthsMessage');
      hostingerSitesWidthsController = mountColumnWidths({
        table: sitesTable,
        preferences: hostingerSitesWidthsPreferences,
        preferenceKey: 'hub:hostinger:sites-column-widths:v1',
        onError: text => { if (widthsMessage) widthsMessage.textContent = text; },
      });
    }
    syncGlobalErrorNotice();
  };

  function currentPublishForm() {
    const siteSelect = root.querySelector('[data-publish-field="site"]');
    const selected = siteSelect?.selectedOptions?.[0];
    const sourceInput = root.querySelector('[data-publish-field="sourceDirectory"]');
    const targetInput = root.querySelector('[data-publish-field="targetDirectory"]');
    const domain = String(siteSelect ? siteSelect.value : state.publishForm.domain || '').trim();
    return {
      domain,
      username: String(domain ? (selected?.dataset?.username || state.publishForm.username || '') : '').trim(),
      sourceDirectory: String(sourceInput ? sourceInput.value : state.publishForm.sourceDirectory || '').trim(),
      targetDirectory: String(targetInput ? targetInput.value : state.publishForm.targetDirectory ?? '.').trim(),
    };
  }

  function currentSubdomainForm() {
    const parentSelect = root.querySelector('[data-subdomain-field="parentDomain"]');
    const selected = parentSelect?.selectedOptions?.[0];
    const prefixInput = root.querySelector('[data-subdomain-field="prefix"]');
    const directoryInput = root.querySelector('[data-subdomain-field="directory"]');
    return {
      parentDomain: String(parentSelect ? parentSelect.value : state.subdomainForm.parentDomain || '').trim().toLowerCase(),
      username: String(parentSelect ? (selected?.dataset?.username || '') : state.subdomainForm.username || '').trim(),
      prefix: String(prefixInput ? prefixInput.value : state.subdomainForm.prefix || '').trim().toLowerCase(),
      directory: String(directoryInput ? directoryInput.value : state.subdomainForm.directory || '').trim(),
    };
  }

  async function createSubdomain() {
    const form = currentSubdomainForm();
    if (!form.parentDomain || !form.username) {
      state.message = 'Selecione o site principal onde o subdomínio será criado.';
      state.messageType = 'error';
      render();
      return;
    }
    const allowedParentHosts = activeCampaignRootHostnames({
      sites: Array.isArray(state.sites) ? state.sites : [],
      campaignDomains: activeCampaignDomains(),
    });
    if (!allowedParentHosts.has(form.parentDomain) || state.hiddenDomains.has(form.parentDomain)) {
      state.message = 'Selecione um domínio principal visível associado a uma campanha ativa.';
      state.messageType = 'error';
      render();
      return;
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(form.prefix)) {
      state.message = 'Informe um prefixo simples, como “teste”, sem pontos, espaços ou acentos.';
      state.messageType = 'error';
      render();
      return;
    }
    if (!form.directory) form.directory = form.prefix;
    const domain = `${form.prefix}.${form.parentDomain}`;
    const confirmed = typeof confirmFn === 'function' && confirmFn(`Criar o subdomínio ${domain} na Hostinger?\n\nSite principal: ${form.parentDomain}\nDiretório raiz: ${form.directory}\n\nIsso altera a configuração da sua conta Hostinger. O DNS pode levar algum tempo para propagar.`);
    if (!confirmed) return;
    state.subdomainForm = form;
    state.busy = true;
    state.message = `Criando o subdomínio ${domain}…`;
    state.messageType = 'info';
    render();
    try {
      const result = await request(API.createSubdomain, { method: 'POST', body: { ...form, confirmed: true }, fetchImpl });
      state.sites = Array.isArray(result.sites) ? result.sites : [...(state.sites || []), result.site].filter(Boolean);
      state.checkedAtUtc = String(result.checkedAtUtc || state.checkedAtUtc || '');
      state.publishForm.domain = String(result.site?.domain || domain);
      state.publishForm.username = String(result.site?.username || form.username);
      state.publishForm.targetDirectory = '.';
      state.publishPlan = null;
      state.publishPlanForm = null;
      state.publishResult = null;
      state.message = `Subdomínio ${domain} criado. Ele já está selecionado como destino da publicação.`;
      state.messageType = 'success';
    } catch (error) {
      state.message = error.message;
      state.messageType = 'error';
    } finally {
      state.busy = false;
      render();
    }
  }

  function invalidatePublishPreview() {
    state.publishPlan = null;
    state.publishPlanForm = null;
    state.publishResult = null;
    const preview = root.querySelector('#hostingerPublishPreview');
    if (preview) preview.innerHTML = '<div class="hostinger-publish-empty">Os dados mudaram. Gere uma nova prévia antes de publicar.</div>';
  }

  async function analyzePublish() {
    const form = currentPublishForm();
    if (!form.domain || !form.username) {
      state.message = 'Selecione um site da lista Hostinger.';
      state.messageType = 'error';
      render();
      return;
    }
    if (!form.sourceDirectory) {
      state.message = 'Informe a pasta local da Pre-Sell.';
      state.messageType = 'error';
      render();
      return;
    }
    state.publishForm = form;
    state.publishPlan = null;
    state.publishPlanForm = null;
    state.publishResult = null;
    state.busy = true;
    state.message = 'Gerando prévia e conferindo o destino na Hostinger…';
    state.messageType = 'info';
    render();
    try {
      const plan = await request(API.publishPreflight, { method: 'POST', body: form, fetchImpl });
      state.publishPlan = plan;
      state.publishPlanForm = form;
      state.message = plan.ready
        ? `Prévia pronta: ${Number(plan.fileCount) || 0} arquivos. Nenhum arquivo foi enviado.`
        : 'A prévia encontrou bloqueios. Resolva os itens destacados antes de publicar.';
      state.messageType = plan.ready ? 'success' : 'error';
    } catch (error) {
      state.message = error.message;
      state.messageType = 'error';
    } finally {
      state.busy = false;
      render();
    }
  }

  async function publishFiles() {
    const plan = state.publishPlan;
    if (!plan?.ready || !state.publishPlanForm) {
      state.message = 'Gere uma prévia válida antes de publicar.';
      state.messageType = 'error';
      render();
      return;
    }
    const current = currentPublishForm();
    const planned = state.publishPlanForm;
    if (current.domain !== planned.domain || current.username !== planned.username || current.sourceDirectory !== planned.sourceDirectory || current.targetDirectory !== planned.targetDirectory) {
      invalidatePublishPreview();
      state.message = 'Os dados mudaram. Gere outra prévia antes de publicar.';
      state.messageType = 'error';
      render();
      return;
    }
    const label = plan.targetDirectory ? `public_html/${plan.targetDirectory}` : 'raiz de public_html';
    const confirmation = typeof confirmFn === 'function' && confirmFn(`Enviar ${Number(plan.fileCount) || 0} arquivos (${formatFileSize(plan.totalBytes)}) de ${plan.domain} para ${label}? O Hub não substituirá arquivos existentes. Se a conexão falhar no meio, alguns arquivos poderão já ter sido enviados.`);
    if (!confirmation) return;
    state.busy = true;
    state.message = `Publicando ${Number(plan.fileCount) || 0} arquivos em ${plan.domain}…`;
    state.messageType = 'info';
    render();
    try {
      const result = await request(API.publish, { method: 'POST', body: { ...planned, fingerprint: plan.fingerprint, confirmed: true }, fetchImpl });
      state.publishResult = result;
      state.publishPlan = null;
      state.publishPlanForm = null;
      state.message = result.complete
        ? `Publicação concluída: ${Number(result.uploadedCount) || 0} arquivos enviados.`
        : `Publicação parcial: ${Number(result.uploadedCount) || 0} de ${Number(result.totalCount) || 0} arquivos enviados. Confira o relatório antes de tentar novamente.`;
      state.messageType = result.complete ? 'success' : 'error';
    } catch (error) {
      state.message = error.message;
      state.messageType = 'error';
    } finally {
      state.busy = false;
      render();
    }
  }

  async function refreshSites() {
    state.busy = true;
    state.message = '';
    render();
    try {
      const result = await request(API.websites, { fetchImpl });
      state.connected = true;
      state.verified = true;
      state.sites = Array.isArray(result.sites) ? result.sites : [];
      state.creationDateDiagnostics = result.creationDateDiagnostics && typeof result.creationDateDiagnostics === 'object' ? result.creationDateDiagnostics : null;
      state.refreshCompletedWithoutDiagnostics = !state.creationDateDiagnostics || !Number.isFinite(Number(state.creationDateDiagnostics.websiteCount));
      state.selectedSubdomains.clear();
      state.checkedAtUtc = String(result.checkedAtUtc || '');
      state.publishPlan = null;
      state.publishPlanForm = null;
      state.publishResult = null;
      state.showTokenForm = false;
      state.message = 'Lista de sites atualizada pela Hostinger.';
      state.messageType = 'success';
    } catch (error) {
      state.verified = false;
      state.message = error.message;
      state.messageType = 'error';
    } finally {
      state.busy = false;
      render();
    }
  }

  function animateDeletedSubdomainRow(siteIndex) {
    const row = [...root.querySelectorAll('.hostinger-sites tbody tr[data-hostinger-site-index]')]
      .find(candidate => Number(candidate.dataset.hostingerSiteIndex) === siteIndex);
    if (!row || doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        row.removeEventListener('animationend', onAnimationEnd);
        resolve();
      };
      const onAnimationEnd = event => {
        if (event.animationName === 'hostinger-subdomain-row-exit') finish();
      };
      const fallbackTimer = setTimeout(finish, 1400);
      row.addEventListener('animationend', onAnimationEnd);
      row.classList.add('hostinger-site-removing');
    });
  }

  async function deleteSelectedSubdomains() {
    const targets = selectedSubdomainTargets();
    if (!targets.length) return;
    if (typeof confirmFn !== 'function') {
      state.message = 'Não foi possível abrir a confirmação de exclusão neste navegador. Nenhum subdomínio foi removido.';
      state.messageType = 'error';
      render();
      return;
    }
    const targetList = targets.map((target, index) =>
      `${index + 1}. ${target.domain}\n   Site principal: ${target.parentDomain} · Conta: ${target.username}\n   Diretório: ${target.directory}`
    ).join('\n');
    const confirmed = confirmFn(`Excluir os ${targets.length} subdomínio(s) selecionado(s), um por vez?\n\n${targetList}\n\nA Hostinger pode remover permanentemente arquivos, bancos de dados e e-mails associados a cada subdomínio. Esta ação não pode ser desfeita. Se uma exclusão falhar ou ficar sem confirmação, a linha será mantida para verificação.\n\nContinuar?`);
    if (!confirmed) return;

    for (const target of targets) state.selectedSubdomains.delete(target.key);
    state.busy = true;
    state.bulkDeleting = true;
    state.message = `Excluindo ${targets.length} subdomínio(s), um por vez…`;
    state.messageType = 'info';
    render();

    const deleted = [];
    const alreadyAbsent = [];
    const failed = [];
    let checkedAtUtc = '';
    try {
      for (const target of targets) {
        try {
          const result = await request(API.deleteSubdomain, {
            method: 'POST',
            body: { parentDomain: target.parentDomain, username: target.username, prefix: target.prefix, confirmed: true },
            fetchImpl,
          });
          if (result?.alreadyAbsent === true) {
            state.unconfirmedSubdomainDeletions.delete(target.key);
            deleted.push(target);
            alreadyAbsent.push(target);
            checkedAtUtc = String(result.checkedAtUtc || checkedAtUtc);
            continue;
          }
          if (result?.deleted !== true) {
            state.unconfirmedSubdomainDeletions.add(target.key);
            throw new Error('A Hostinger não confirmou a exclusão. Use “Verificar exclusão não confirmada” nesta linha.');
          }
          state.unconfirmedSubdomainDeletions.delete(target.key);
          deleted.push(target);
          checkedAtUtc = String(result.checkedAtUtc || checkedAtUtc);
        } catch (error) {
          state.unconfirmedSubdomainDeletions.add(target.key);
          failed.push({ target, reason: String(error?.message || error) });
        }
      }

      if (deleted.length) {
        await Promise.all(deleted.map(target => animateDeletedSubdomainRow(target.siteIndex)));
        const deletedKeys = new Set(deleted.map(target => target.key));
        state.sites = state.sites.filter(site => !deletedKeys.has(subdomainDeletionKey(site?.domain, site?.username)));
        state.checkedAtUtc = checkedAtUtc || state.checkedAtUtc;
        if (deleted.some(target => state.publishForm.domain.trim().toLowerCase() === target.domain && state.publishForm.username === target.username)) {
          state.publishPlan = null;
          state.publishPlanForm = null;
          state.publishResult = null;
        }
      }

      if (!failed.length) {
        state.message = alreadyAbsent.length
          ? `Lote concluído: ${deleted.length - alreadyAbsent.length} exclusão(ões) confirmada(s) pela Hostinger; ${alreadyAbsent.length} subdomínio(s) já estavam ausentes e foram removidos do inventário local.`
          : `Lote concluído: a Hostinger confirmou a exclusão de ${deleted.length} subdomínio(s).`;
        state.messageType = 'success';
      } else {
        const failures = failed.map(({ target, reason }) => `${target.domain}: ${reason}`).join(' · ');
        state.message = `Lote parcialmente concluído: ${deleted.length - alreadyAbsent.length} exclusão(ões) confirmada(s), ${alreadyAbsent.length} destino(s) já ausente(s) reconciliado(s) localmente e ${failed.length} pendente(s). Verifique as linhas mantidas antes de tentar novamente. ${failures}`;
        state.messageType = 'error';
      }
    } catch (error) {
      state.message = `O lote foi interrompido depois de ${deleted.length} exclusão(ões) confirmada(s). Confira as linhas e verifique qualquer resultado não confirmado antes de repetir. ${error?.message || error}`;
      state.messageType = 'error';
    } finally {
      state.bulkDeleting = false;
      state.busy = false;
      render();
    }
  }

  async function deleteSubdomain(siteIndex) {
    const index = Number(siteIndex);
    const site = Number.isInteger(index) && Array.isArray(state.sites) ? state.sites[index] : null;
    if (!site || !isHostingerSubdomain(site, state.sites)) return;
    const parent = hostingerSubdomainParent(site, state.sites);
    const domain = String(site.domain || '').trim().toLowerCase();
    if (domain === PROTECTED_APP_SUBDOMAIN) {
      state.message = `${domain} é o subdomínio do servidor da aplicação do Hub e está protegido contra exclusão.`;
      state.messageType = 'error';
      render();
      return;
    }
    const parentDomain = String(parent?.domain || '').trim().toLowerCase();
    const username = String(site.username || '').trim();
    const prefix = parentDomain && domain.endsWith('.' + parentDomain)
      ? domain.slice(0, -(parentDomain.length + 1))
      : '';
    if (!domain || !parentDomain || !username || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix)) {
      state.message = `O Hub identificou ${domain || 'este site'} como subdomínio, mas não confirmou o domínio principal, a conta e o prefixo necessários para excluí-lo. Atualize os sites Hostinger antes de continuar.`;
      state.messageType = 'error';
      render();
      return;
    }
    if (typeof confirmFn !== 'function') {
      state.message = 'Não foi possível abrir a confirmação de exclusão neste navegador. Nenhum subdomínio foi removido.';
      state.messageType = 'error';
      render();
      return;
    }
    const directory = String(site.rootDirectory || 'não informado no inventário');
    const confirmed = confirmFn(`Excluir o subdomínio ${domain}?\n\nSite principal: ${parentDomain}\nConta Hostinger: ${username}\nDiretório informado: ${directory}\n\nA Hostinger pode remover permanentemente arquivos, bancos de dados e e-mails associados. Esta ação não pode ser desfeita.\n\nContinuar?`);
    if (!confirmed) return;

    state.selectedSubdomains.delete(subdomainDeletionKey(domain, username));
    state.busy = true;
    state.message = `Solicitando à Hostinger a exclusão de ${domain}...`;
    state.messageType = 'info';
    render();
    const verificationKey = subdomainDeletionKey(domain, username);
    let deletionConfirmed = false;
    try {
      const result = await request(API.deleteSubdomain, {
        method: 'POST',
        body: { parentDomain, username, prefix, confirmed: true },
        fetchImpl,
      });
      if (result?.alreadyAbsent === true) {
        deletionConfirmed = true;
        state.unconfirmedSubdomainDeletions.delete(verificationKey);
        await animateDeletedSubdomainRow(index);
        state.sites = state.sites.filter(candidate => !(
          String(candidate?.domain || '').trim().toLowerCase() === domain
          && String(candidate?.username || '').trim() === username
        ));
        if (state.publishForm.domain.trim().toLowerCase() === domain && state.publishForm.username === username) {
          state.publishPlan = null;
          state.publishPlanForm = null;
          state.publishResult = null;
        }
        state.checkedAtUtc = String(result.checkedAtUtc || state.checkedAtUtc);
        state.message = `${domain} já não constava na lista específica de subdomínios da Hostinger. O Hub removeu o registro local; nenhuma exclusão remota adicional foi enviada.`;
        state.messageType = 'success';
        return;
      }
      if (result?.deleted !== true) {
        state.unconfirmedSubdomainDeletions.add(verificationKey);
        throw new Error('A Hostinger não confirmou a exclusão. Use “Verificar exclusão não confirmada” para consultar o inventário antes de tentar novamente.');
      }
      deletionConfirmed = true;
      state.unconfirmedSubdomainDeletions.delete(verificationKey);
      await animateDeletedSubdomainRow(index);
      state.sites = state.sites.filter(candidate => !(
        String(candidate?.domain || '').trim().toLowerCase() === domain
        && String(candidate?.username || '').trim() === username
      ));
      if (state.publishForm.domain.trim().toLowerCase() === domain && state.publishForm.username === username) {
        state.publishPlan = null;
        state.publishPlanForm = null;
        state.publishResult = null;
      }
      state.checkedAtUtc = String(result.checkedAtUtc || state.checkedAtUtc);
      state.message = result.cacheWarning || `A Hostinger confirmou a exclusão de ${domain}.`;
      state.messageType = result.cacheWarning ? 'error' : 'success';
    } catch (error) {
      if (!deletionConfirmed) state.unconfirmedSubdomainDeletions.add(verificationKey);
      state.message = error.message;
      state.messageType = 'error';
    } finally {
      state.busy = false;
      render();
    }
  }

  async function verifySubdomainDeletion(siteIndex) {
    const index = Number(siteIndex);
    const site = Number.isInteger(index) && Array.isArray(state.sites) ? state.sites[index] : null;
    if (!site || !isHostingerSubdomain(site, state.sites)) return;
    const domain = String(site.domain || '').trim().toLowerCase();
    const username = String(site.username || '').trim();
    const verificationKey = subdomainDeletionKey(domain, username);
    if (!state.unconfirmedSubdomainDeletions.has(verificationKey)) return;

    const parent = hostingerSubdomainParent(site, state.sites);
    const parentDomain = String(parent?.domain || site.parentDomain || '').trim().toLowerCase();
    const prefix = parentDomain && domain.endsWith('.' + parentDomain)
      ? domain.slice(0, -(parentDomain.length + 1))
      : '';
    if (!parentDomain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix)) {
      state.message = `Não foi possível identificar o domínio principal de ${domain}; a linha foi mantida. Atualize os sites Hostinger e tente verificar novamente.`;
      state.messageType = 'error';
      render();
      return;
    }

    state.busy = true;
    state.message = `Consultando a lista específica de subdomínios da Hostinger para verificar ${domain}…`;
    state.messageType = 'info';
    render();
    try {
      const result = await request(API.verifySubdomainDeletion, {
        method: 'POST',
        body: { parentDomain, username, prefix },
        fetchImpl,
      });
      state.checkedAtUtc = String(result.checkedAtUtc || state.checkedAtUtc);
      state.connected = true;
      state.verified = true;
      state.showTokenForm = false;
      if (result.exists === true) {
        state.unconfirmedSubdomainDeletions.delete(verificationKey);
        state.message = `Verificação concluída: a lista específica da Hostinger confirma que ${domain} ainda existe. A linha foi mantida; você pode solicitar a exclusão novamente.`;
        state.messageType = 'error';
      } else if (result.exists === false && result.reconciled === true) {
        await animateDeletedSubdomainRow(index);
        state.sites = state.sites.filter(candidate => !(
          String(candidate?.domain || '').trim().toLowerCase() === domain
          && String(candidate?.username || '').trim() === username
        ));
        state.unconfirmedSubdomainDeletions.delete(verificationKey);
        if (state.publishForm.domain.trim().toLowerCase() === domain && state.publishForm.username === username) {
          state.publishPlan = null;
          state.publishPlanForm = null;
          state.publishResult = null;
        }
        state.message = `Verificação concluída: a lista específica da Hostinger confirmou que ${domain} não existe. O Hub removeu a entrada antiga do inventário local; nenhuma exclusão remota adicional foi enviada.`;
        state.messageType = 'success';
      } else {
        throw new Error('A Hostinger não retornou uma confirmação válida sobre a existência do subdomínio.');
      }
    } catch (error) {
      state.message = `Não foi possível verificar a exclusão de ${domain}. A linha foi mantida. ${error.message}`;
      state.messageType = 'error';
    } finally {
      state.busy = false;
      render();
    }
  }

  root.onclick = async event => {
    const button = event.target?.closest?.('[data-hostinger-action]');
    if (!button || state.busy) return;
    const action = button.dataset.hostingerAction;
    if (action === 'hide-site' || action === 'show-site') {
      const domain = String(button.dataset.domain || '').trim().toLowerCase();
      if (!domain) return;
      if (action === 'hide-site') state.hiddenDomains.add(domain);
      else {
        state.hiddenDomains.delete(domain);
        state.siteFilter = 'visible';
      }
      const saved = saveHiddenDomains(state.hiddenDomains, storageImpl);
      state.message = action === 'hide-site' ? 'Domínio ocultado da lista.' : 'Domínio restaurado na lista.';
      if (!saved) state.message += ' A preferência vale apenas nesta sessão porque o armazenamento do navegador não está disponível.';
      state.messageType = saved ? 'success' : 'info';
      render();
      return;
    }
    if (action === 'delete-subdomain') return deleteSubdomain(button.dataset.siteIndex);
    if (action === 'delete-selected-subdomains') return deleteSelectedSubdomains();
    if (action === 'verify-subdomain-deletion') return verifySubdomainDeletion(button.dataset.siteIndex);
    if (action === 'refresh') return refreshSites();
    if (action === 'create-subdomain') return createSubdomain();
    if (action === 'preflight') return analyzePublish();
    if (action === 'publish') return publishFiles();
    if (action === 'save-expiration') {
      const expirationTerm = String(root.querySelector('#hostingerSavedExpiration')?.value || '');
      state.busy = true;
      state.message = '';
      render();
      try {
        const result = await request(API.expiration, { method: 'POST', body: { expirationTerm }, fetchImpl });
        state.expiration = result.expiration || null;
        state.message = 'Lembrete de expiração atualizado neste computador.';
        state.messageType = 'success';
      } catch (error) {
        state.message = error.message;
        state.messageType = 'error';
      } finally {
        state.busy = false;
        render();
      }
      return;
    }
    if (action === 'replace') {
      state.showTokenForm = true;
      state.message = '';
      render();
      root.querySelector('#hostingerApiToken')?.focus();
      return;
    }
    if (action === 'disconnect') {
      const confirmed = typeof confirmFn === 'function' && confirmFn('Desconectar remove do computador o token salvo da Hostinger. Continuar?');
      if (!confirmed) return;
      state.busy = true;
      render();
      try {
        await request(API.disconnect, { method: 'DELETE', fetchImpl });
        state.connected = false;
        state.verified = false;
        state.sites = null;
        state.selectedSubdomains.clear();
        state.checkedAtUtc = '';
        state.expiration = null;
        state.publishPlan = null;
        state.publishPlanForm = null;
        state.publishResult = null;
        state.message = 'Token removido deste computador.';
        state.messageType = 'success';
      } catch (error) {
        state.message = error.message;
        state.messageType = 'error';
      } finally {
        state.busy = false;
        render();
      }
    }
  };

  root.oninput = event => {
    const selection = event.target?.closest?.('[data-subdomain-selection]');
    if (selection) {
      if (event.type !== 'change') return;
      const key = subdomainDeletionKey(selection.dataset.domain, selection.dataset.username);
      if (selection.checked) state.selectedSubdomains.add(key);
      else state.selectedSubdomains.delete(key);
      syncBulkDeleteButton();
      return;
    }
    const siteFilter = event.target?.closest?.('[data-hostinger-site-filter]');
    if (siteFilter) {
      state.siteFilter = ['all', 'visible', 'active-campaigns', 'active-presell-subdomains', 'hidden'].includes(siteFilter.value) ? siteFilter.value : 'visible';
      render();
      root.querySelector('[data-hostinger-site-filter]')?.focus();
      return;
    }
    const input = event.target?.closest?.('[data-publish-field]');
    if (!input) {
      const subdomainInput = event.target?.closest?.('[data-subdomain-field]');
      if (!subdomainInput) return;
      const previousPrefix = state.subdomainForm.prefix;
      if (subdomainInput.dataset.subdomainField === 'parentDomain') {
        const option = subdomainInput.selectedOptions?.[0];
        state.subdomainForm.parentDomain = String(subdomainInput.value || '').toLowerCase();
        state.subdomainForm.username = String(option?.dataset?.username || '');
      } else {
        state.subdomainForm[subdomainInput.dataset.subdomainField] = String(subdomainInput.value || '').trim();
        if (subdomainInput.dataset.subdomainField === 'prefix') {
          state.subdomainForm.prefix = state.subdomainForm.prefix.toLowerCase();
          const directoryInput = root.querySelector('[data-subdomain-field="directory"]');
          if (directoryInput && (!directoryInput.value || directoryInput.value === previousPrefix)) {
            directoryInput.value = String(subdomainInput.value || '').trim().toLowerCase();
            state.subdomainForm.directory = directoryInput.value;
          }
        }
      }
      const parent = state.subdomainForm.parentDomain || 'seu-dominio.com';
      const prefix = state.subdomainForm.prefix || 'prefixo';
      const preview = root.querySelector('[data-subdomain-preview]');
      if (preview) preview.textContent = `${prefix}.${parent}`;
      return;
    }
    if (input.dataset.publishField === 'site') {
      const option = input.selectedOptions?.[0];
      state.publishForm.domain = String(input.value || '');
      state.publishForm.username = String(option?.dataset?.username || '');
    } else {
      state.publishForm[input.dataset.publishField] = String(input.value || '');
    }
    invalidatePublishPreview();
  };
  root.onchange = root.oninput;

  root.onsubmit = async event => {
    if (!event.target?.matches?.('[data-hostinger-form]')) return;
    event.preventDefault();
    if (state.busy) return;
    const tokenInput = root.querySelector('#hostingerApiToken');
    const token = String(tokenInput?.value || '').trim();
    const expirationTerm = String(root.querySelector('#hostingerNewTokenExpiration')?.value || '1_month');
    if (!token) {
      state.message = 'Cole o token da API Hostinger para continuar.';
      state.messageType = 'error';
      render();
      return;
    }
    if (tokenInput) tokenInput.value = '';
    state.busy = true;
    state.message = 'Validando o token com a Hostinger…';
    state.messageType = 'info';
    render();
    try {
      const result = await request(API.connect, { method: 'POST', body: { token, expirationTerm }, fetchImpl });
      state.connected = true;
      state.verified = true;
      state.sites = Array.isArray(result.sites) ? result.sites : [];
      state.selectedSubdomains.clear();
      state.checkedAtUtc = String(result.checkedAtUtc || '');
      state.expiration = result.expiration || null;
      state.showTokenForm = false;
      state.message = 'Conexão validada. O token foi protegido no computador.';
      state.messageType = 'success';
    } catch (error) {
      state.message = error.message;
      state.messageType = 'error';
    } finally {
      state.busy = false;
      render();
    }
  };

  const onGoogleAdsFinalUrlCacheUpdated = event => {
    if (!Array.isArray(event.detail?.rows)) return;
    state.googleAdsFinalUrlRows = event.detail.rows;
    render();
  };
  document.addEventListener('google-ads-final-url-host-cache-updated', onGoogleAdsFinalUrlCacheUpdated);
  render();
  try {
    const status = await request(API.status, { fetchImpl });
    state.connected = status.configured === true;
    state.expiration = status.expiration || null;
    state.verified = false;
    state.showTokenForm = !state.connected;
    if (state.connected) {
      try {
        const cachedSites = await request(API.sitesCache, { fetchImpl });
        state.sites = Array.isArray(cachedSites.sites) ? cachedSites.sites : [];
        state.creationDateDiagnostics = cachedSites.creationDateDiagnostics && typeof cachedSites.creationDateDiagnostics === 'object' ? cachedSites.creationDateDiagnostics : null;
        state.checkedAtUtc = String(cachedSites.checkedAtUtc || '');
      } catch {
        state.sites = [];
        state.creationDateDiagnostics = null;
        state.checkedAtUtc = '';
      }
    }
  } catch (error) {
    state.message = error.message;
    state.messageType = 'error';
    state.showTokenForm = true;
  }
  render();
  const controller = { refresh: refreshSites, render, destroy: () => { hostingerSitesWidthsController?.destroy(); hostingerSitesWidthsController = null; dismissErrorNotice.removeEventListener('click', onDismissErrorNotice); globalErrorNotice.remove(); document.removeEventListener('google-ads-final-url-host-cache-updated', onGoogleAdsFinalUrlCacheUpdated); } };
  mountedRoots.set(root, controller);
  return controller;
}
