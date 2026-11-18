import {
  buildTrackingPresellScriptTag,
  createTrackingDomainAdminToken,
  normalizeTrackingDomainInput,
  normalizeTrackingProductKey,
  normalizeTrackingProductLabel,
  trackingDomainAdminConfigPhp,
  TRACKING_DOMAIN_ADMIN_CONFIG_FILE,
} from './tracking-domain-admin.mjs?v=11';
import { addTrackingDomain, fetchTrackingDomains, fetchGuruMediaGoogleAdsStatus, setGuruMediaGoogleAdsEnabled, syncGuruMediaGoogleAdsRoutes } from './tracking-service.mjs?v=24';
import {
  clearTrackingDomainAdminToken,
  clearTrackingHubToken,
  readTrackingDomainAdminToken,
  readTrackingHubToken,
  saveTrackingDomainAdminToken,
  saveTrackingHubToken,
} from './tracking-token-storage.mjs?v=3';
import { readTrackingDomainList, saveTrackingDomainList } from './tracking-domain-list-storage.mjs?v=8';
import { readTrackingProductLabels } from './tracking-domain-label-storage.mjs?v=3';
import {
  normalizeTrackingEmailConfig,
  trackingEmailConfigPhp,
  TRACKING_EMAIL_CONFIG_FILE,
} from './tracking-email-config.mjs?v=2';
import { clearLegacyObservability, inspectLegacyObservability } from '../storage/legacy-observability-cleanup.mjs?v=1';
import { fetchGoogleAdsConversionActions } from '../google-ads/google-ads-service.mjs?v=16';
import { GOOGLE_ADS_ACCOUNTS_DIRECTORY_UPDATED_EVENT, refreshGoogleAdsAccountsDirectory } from '../google-ads/google-ads-accounts-directory-service.mjs?v=3';
import { loadGoogleAdsAccountsCache } from '../google-ads/google-ads-accounts-cache.mjs?v=4';
import { refreshHostingerSitesDirectory } from '../hostinger/hostinger-sites-directory-service.mjs?v=1';
import { isGoogleAdsPurchaseUploadAction } from '../google-ads/google-ads-conversion-actions-domain.mjs?v=1';
import { resolveTrackMcc } from '../accounts/accounts-presell-domain.mjs?v=4';
import {
  readGuruMediaConversionActionSettings,
  removeGuruMediaConversionActionSetting,
  saveGuruMediaConversionActionSetting,
} from './tracking-gurumedia-conversion-actions-storage.mjs?v=1';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const mountedRoots = new WeakMap();

function emptyEmailConfig() {
  return { toEmail: '', fromEmail: '', smtpHost: '', smtpPort: '465', smtpSecurity: 'ssl', smtpUsername: '', smtpPassword: '' };
}

function formatTrackRegistrationDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/.exec(String(value ?? '').trim());
  if (!match) return '—';
  const [, year, month, day] = match;
  const isoDate = `${year}-${month}-${day}`;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) return '—';
  return `${day}/${month}`;
}

function clickDownload(filename, content, contentType) {
  const blobUrl = URL.createObjectURL(new Blob([content], { type: contentType }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}

function initialDomainRows() {
  const cached = readTrackingDomainList();
  const labels = readTrackingProductLabels();
  return {
    rows: cached.rows.map(row => ({ ...row, productLabel: row.productLabel || labels.labels.get(row.productKey) || row.productKey })),
    loaded: cached.loaded,
    cacheAvailable: cached.available,
    cacheUpdatedAtUtc: cached.updatedAtUtc,
  };
}

export function mount({ root, scope = 'all', clipboard = globalThis.navigator?.clipboard, onBaseUpdated = async () => {}, invalidateBaseCache = () => {}, getAccountRows = () => [], fetchConversionActions = fetchGoogleAdsConversionActions, readActionSettings = readGuruMediaConversionActionSettings, saveActionSetting = saveGuruMediaConversionActionSetting, removeActionSetting = removeGuruMediaConversionActionSetting, nowFn = () => new Date() }) {
  if (!root) throw new Error('A área de Tracking solicitada não foi encontrada.');
  const panelScope = scope === 'tracker' || scope === 'settings' ? scope : 'all';
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.render();
    return existing;
  }
  const savedHubToken = readTrackingHubToken();
  const savedAdminToken = readTrackingDomainAdminToken();
  const cachedGoogleAdsDirectory = loadGoogleAdsAccountsCache();
  const cachedDomains = initialDomainRows();
  const conversionActionSettingsState = readActionSettings();
  const state = {
    hubToken: savedHubToken.token,
    googleAdsDirectory: cachedGoogleAdsDirectory?.accounts || null,
    googleAdsDirectoryUpdatedAtUtc: cachedGoogleAdsDirectory?.refreshedAtUtc || cachedGoogleAdsDirectory?.savedAtUtc || '',
    googleAdsDirectoryPersisted: Boolean(cachedGoogleAdsDirectory),
    googleAdsDirectoryPending: false,
    googleAdsDirectoryMessage: cachedGoogleAdsDirectory ? '' : 'A lista ainda não foi consultada neste perfil.',
    googleAdsDirectoryError: false,
    rememberHubToken: true,
    hubTokenStatus: !savedHubToken.available ? 'unavailable' : savedHubToken.invalid ? 'invalid' : savedHubToken.token ? 'saved' : 'empty',
    adminToken: savedAdminToken.token,
    rememberAdminToken: true,
    showAdminToken: false,
    adminTokenStatus: !savedAdminToken.available ? 'unavailable' : savedAdminToken.invalid ? 'invalid' : savedAdminToken.token ? 'saved' : 'empty',
    domain: '',
    productLabel: '',
    platform: 'clickbank',
    editingHost: '',
    includeWww: false,
    domainRows: cachedDomains.rows,
    domainsLoaded: cachedDomains.loaded,
    domainCacheAvailable: cachedDomains.cacheAvailable,
    domainCacheUpdatedAtUtc: cachedDomains.cacheUpdatedAtUtc,
    domainPending: false,
    domainMessage: cachedDomains.loaded ? 'Lista restaurada do cache deste navegador.' : 'Atualize a lista para consultar as Tracks cadastradas no servidor.',
    domainError: false,
    domainCacheMessage: cachedDomains.cacheAvailable ? '' : 'O cache local de Tracks não está disponível; os dados consultados continuarão visíveis nesta aba.',
    selectedTagHost: '',
    tagDialogNeedsFocus: false,
    tagDialogReturnHost: '',
    tagMessage: '',
    tagError: false,
    emailConfig: emptyEmailConfig(),
    emailMessage: 'Preencha o destinatário e os dados SMTP para gerar a configuração privada compartilhada.',
    emailError: false,
    conversionActionSettings: conversionActionSettingsState.settings || [],
    conversionActionsByMcc: {},
    conversionActionSelections: {},
    conversionActionBusy: {},
    conversionActionMessages: {},
    conversionActionErrors: {},
    guruMediaAdsStatus: null,
    guruMediaAdsMessage: 'Consulte o estado no servidor para ver as rotas configuradas e o envio automático.',
    guruMediaAdsError: false,
    guruMediaAdsPending: false,
    conversionActionSettingsInvalid: conversionActionSettingsState.invalid === true,
    conversionActionStorageAvailable: conversionActionSettingsState.available !== false,
    legacyCleanup: {
      pending: false,
      preview: null,
      dialogOpen: false,
      dialogNeedsFocus: false,
      returnFocus: false,
      message: '',
      error: false,
    },
  };

  function hubTokenMessage() {
    if (state.hubTokenStatus === 'saved') return 'Token de acesso lembrado neste navegador e compartilhado entre as telas de Tracking.';
    if (state.hubTokenStatus === 'unavailable') return 'O navegador não permitiu salvar o token; ele não estará disponível para as outras telas depois que esta página fechar.';
    if (state.hubTokenStatus === 'invalid') return 'O valor salvo tem formato inválido. Informe novamente o token de 64 caracteres hexadecimais.';
    if (state.hubTokenStatus === 'disabled') return 'Token removido do armazenamento local.';
    if (state.hubTokenStatus === 'incomplete') return 'Informe os 64 caracteres válidos para salvar o token.';
    return 'Informe o token de leitura do Hub para consultar Tracking ClickBank, GuruMedia e métricas de cliques.';
  }

  function adminTokenMessage() {
    if (state.adminTokenStatus === 'saved') return 'Token administrativo lembrado neste navegador.';
    if (state.adminTokenStatus === 'unavailable') return 'O navegador não permitiu salvar o token; ele ficará disponível somente nesta aba.';
    if (state.adminTokenStatus === 'invalid') return 'O valor salvo tem formato inválido. Informe novamente o token administrativo.';
    if (state.adminTokenStatus === 'disabled') return 'Token administrativo removido do armazenamento local.';
    if (state.adminTokenStatus === 'incomplete') return 'Informe os 64 caracteres válidos para salvar o token.';
    return 'Informe o token administrativo separado do token de leitura do Hub.';
  }

  function safeAccountRows() {
    try {
      const rows = getAccountRows?.();
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }

  function googleAdsDirectoryDateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'horário indisponível' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  function renderGoogleAdsAccountsDirectory() {
    const directory = state.googleAdsDirectory;
    const buttonDisabled = state.googleAdsDirectoryPending || state.hubTokenStatus !== 'saved';
    const managerCount = directory?.managers?.filter(manager => manager.customerId != null).length || 0;
    const accountCount = directory?.accounts?.length || 0;
    const cacheStatus = directory
      ? `${state.googleAdsDirectoryPersisted ? `Atualizada em ${googleAdsDirectoryDateLabel(state.googleAdsDirectoryUpdatedAtUtc)}` : 'Lista carregada somente nesta sessão; não foi possível persistir o cache local.'} · ${managerCount} MCC(s) · ${accountCount} conta(s) cliente${directory.warningCount ? ` · ${directory.warningCount} aviso(s) na consulta` : ''}`
      : 'Nenhuma MCC ou conta em cache local.';
    const groups = directory ? directory.managers.map(manager => ({
      manager,
      accounts: directory.accounts.filter(account => (account.managerCustomerId ?? 'direct') === (manager.customerId ?? 'direct')),
    })) : [];
    const directAccounts = directory?.accounts?.filter(account => account.managerCustomerId == null) || [];
    if (!groups.some(group => group.manager.customerId == null) && directAccounts.length) {
      groups.push({ manager: { customerId: null, name: 'Contas com acesso direto' }, accounts: directAccounts });
    }
    const rows = groups.length ? groups.map(({ manager, accounts }) => `
      <details class="google-ads-directory-group">
        <summary><strong>${escapeHtml(manager.name)}</strong><span>${manager.customerId ? escapeHtml(manager.customerId) : 'Acesso direto'}</span><b>${accounts.length} conta(s)</b><span class="google-ads-directory-disclosure" aria-hidden="true"></span></summary>
        ${accounts.length ? `<div class="google-ads-table-wrap"><table class="google-ads-table google-ads-directory-table"><thead><tr><th>Conta Google Ads</th><th>ID da conta</th><th>Moeda</th><th>Fuso</th><th>Acesso</th></tr></thead><tbody>${accounts.map(account => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.customerId)}</td><td>${escapeHtml(account.currencyCode)}</td><td>${escapeHtml(account.timeZone || '—')}</td><td>${escapeHtml(account.status || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="google-ads-directory-empty">Nenhuma conta cliente listada nesta MCC.</div>'}
      </details>`).join('') : '<div class="google-ads-directory-empty">Nenhuma MCC ou conta em cache local.</div>';
    const message = state.googleAdsDirectoryMessage || cacheStatus;
    return `<section class="tracking-panel google-ads-directory" aria-labelledby="globalGoogleAdsDirectoryTitle">
      <div class="google-ads-directory-heading"><div><h3 id="globalGoogleAdsDirectoryTitle">MCCs e contas conectadas</h3><p class="tracking-connection-note${state.googleAdsDirectoryError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(message)}</p></div><button data-global-action="refresh-google-ads-directory" class="btn" type="button" title="Atualiza MCCs e contas Google Ads e a lista de sites Hostinger."${buttonDisabled ? ' disabled' : ''}>${state.googleAdsDirectoryPending ? 'Atualizando integrações…' : 'Atualizar MCCs, contas e sites'}</button></div>
      <div class="google-ads-directory-list">${rows}</div>
    </section>`;
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

  function guruMediaGoogleAdsRoutes() {
    const candidates = new Map();
    let omitted = 0;
    const accounts = safeAccountRows();
    for (const track of state.domainRows.filter(row => row.platform === 'gurumedia')) {
      const host = typeof track.hostname === 'string' ? track.hostname : '';
      const productKey = typeof track.productKey === 'string' ? track.productKey : '';
      if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(host)
          || !/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/.test(productKey)) {
        omitted++;
        continue;
      }
      const mcc = resolveTrackMcc(accounts, track);
      const mccId = mcc.managerCustomerId;
      const setting = mccId ? savedActionForMcc(mccId) : null;
      if (mcc.status !== 'identified' || !mccId || !mcc.customerId || mcc.customerIdAmbiguous
          || !setting || !isGoogleAdsPurchaseUploadAction(setting)
          || !new RegExp(`^customers/${mccId}/conversionActions/[1-9][0-9]{0,19}$`).test(setting.resourceName)) {
        omitted++;
        continue;
      }
      const key = `${host}\u0000${productKey}`;
      const matches = candidates.get(key) || [];
      matches.push({
        presell_host: host,
        product_key: productKey,
        customer_id: mcc.customerId,
        mcc_customer_id: mccId,
        conversion_action_resource_name: setting.resourceName,
      });
      candidates.set(key, matches);
    }
    const routes = [];
    for (const matches of candidates.values()) {
      if (matches.length === 1) routes.push(matches[0]);
      else omitted += matches.length;
    }
    return { routes, omitted };
  }

  function guruMediaGoogleAdsStatusText() {
    if (state.guruMediaAdsPending) return 'Consultando ou salvando a configuração no servidor…';
    if (!state.guruMediaAdsStatus) return state.guruMediaAdsMessage;
    const status = state.guruMediaAdsStatus;
    const counts = status.outbox_counts || {};
    const pending = Number(counts.pending || 0) + Number(counts.processing || 0);
    const accepted = Number(counts.accepted || 0);
    const processed = Number(counts.processed || 0);
    const failures = Number(counts.rejected || 0) + Number(counts.partial_success || 0)
      + Number(counts.blocked || 0) + Number(counts.unknown || 0);
    return `Servidor: ${Number(status.route_count || 0)} rota(s) · envio automático ${status.live_enabled ? 'ATIVADO' : 'desativado'} · ${pending} pendente(s) · ${accepted} aguardando processamento do Google · ${processed} processada(s) · ${failures} com erro.`;
  }

  async function loadGuruMediaGoogleAdsStatus() {
    if (!TOKEN_PATTERN.test(state.hubToken) || !TOKEN_PATTERN.test(state.adminToken)) {
      state.guruMediaAdsMessage = 'Informe os tokens do Hub e administrativo para consultar o servidor.';
      state.guruMediaAdsError = true;
      render();
      return;
    }
    state.guruMediaAdsPending = true;
    state.guruMediaAdsError = false;
    render();
    try {
      const result = await fetchGuruMediaGoogleAdsStatus(state.hubToken, state.adminToken);
      state.guruMediaAdsStatus = result;
      state.guruMediaAdsMessage = guruMediaGoogleAdsStatusText();
      state.guruMediaAdsError = false;
    } catch (error) {
      state.guruMediaAdsMessage = error instanceof Error ? error.message : 'Não foi possível consultar a configuração de conversões GuruMedia.';
      state.guruMediaAdsError = true;
    } finally {
      state.guruMediaAdsPending = false;
      render();
    }
  }

  async function syncGuruMediaGoogleAdsConfig() {
    if (!TOKEN_PATTERN.test(state.hubToken) || !TOKEN_PATTERN.test(state.adminToken)) {
      state.guruMediaAdsMessage = 'Informe os tokens do Hub e administrativo antes de sincronizar as rotas.';
      state.guruMediaAdsError = true;
      render();
      return;
    }
    state.guruMediaAdsPending = true;
    state.guruMediaAdsError = false;
    state.guruMediaAdsMessage = 'Atualizando Tracks no servidor e associando cada rota à MCC e ação salvas…';
    render();
    try {
      state.domainRows = await fetchTrackingDomains(state.adminToken);
      state.domainsLoaded = true;
      const cache = saveTrackingDomainList(state.domainRows);
      state.domainCacheAvailable = cache.saved;
      state.domainCacheUpdatedAtUtc = cache.updatedAtUtc || '';
      const { routes, omitted } = guruMediaGoogleAdsRoutes();
      if (!routes.length) throw new Error('Nenhuma rota GuruMedia tem associação única no manifesto e ação Purchase / Upload Clicks salva.');
      const result = await syncGuruMediaGoogleAdsRoutes(state.hubToken, state.adminToken, routes);
      state.guruMediaAdsStatus = { live_enabled: result.live_enabled, route_count: result.route_count, outbox_counts: {} };
      state.guruMediaAdsMessage = `Sincronizadas ${Number(result.route_count)} rota(s). ${omitted} Track(s) foram omitidas por ausência de associação única ou ação elegível. O envio automático ficou desativado para revisão.`;
      state.guruMediaAdsError = false;
    } catch (error) {
      state.guruMediaAdsMessage = error instanceof Error ? error.message : 'Não foi possível sincronizar as rotas GuruMedia.';
      state.guruMediaAdsError = true;
    } finally {
      state.guruMediaAdsPending = false;
      render();
    }
  }

  async function toggleGuruMediaGoogleAdsSending() {
    if (!state.guruMediaAdsStatus) {
      await loadGuruMediaGoogleAdsStatus();
      return;
    }
    const enable = !state.guruMediaAdsStatus.live_enabled;
    if (enable && !globalThis.confirm?.('Ativar o envio automático? Apenas novas vendas recebidas depois da ativação serão enfileiradas. Conversões reais serão enviadas ao Google Ads pelo serviço do servidor.\n\nConfirme antes que a Flow ou outro sistema não esteja enviando essas mesmas vendas para as mesmas ações, para evitar duplicidade.')) return;
    if (!TOKEN_PATTERN.test(state.hubToken) || !TOKEN_PATTERN.test(state.adminToken)) {
      state.guruMediaAdsMessage = 'Informe os tokens do Hub e administrativo antes de alterar o envio automático.';
      state.guruMediaAdsError = true;
      render();
      return;
    }
    state.guruMediaAdsPending = true;
    state.guruMediaAdsError = false;
    render();
    try {
      const result = await setGuruMediaGoogleAdsEnabled(state.hubToken, state.adminToken, enable);
      state.guruMediaAdsStatus = result;
      state.guruMediaAdsMessage = guruMediaGoogleAdsStatusText();
      state.guruMediaAdsError = false;
    } catch (error) {
      state.guruMediaAdsMessage = error instanceof Error ? error.message : 'Não foi possível alterar o envio automático.';
      state.guruMediaAdsError = true;
    } finally {
      state.guruMediaAdsPending = false;
      render();
    }
  }

  function savedActionForMcc(mccCustomerId) {
    return state.conversionActionSettings.find(item => item.mccCustomerId === mccCustomerId) || null;
  }

  function formatConversionActionTimestamp(value) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '—';
    return `${new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))} UTC`;
  }

  function renderConversionActionSettings() {
    const mccRows = conversionMccRows();
    const body = mccRows.map(mcc => {
      const saved = savedActionForMcc(mcc.mccCustomerId);
      const actions = state.conversionActionsByMcc[mcc.mccCustomerId] || null;
      const selection = Object.hasOwn(state.conversionActionSelections, mcc.mccCustomerId)
        ? state.conversionActionSelections[mcc.mccCustomerId]
        : saved?.resourceName || '';
      const inventoryLoaded = Array.isArray(actions);
      const currentActionExists = inventoryLoaded && actions.some(action => action.resourceName === saved?.resourceName);
      const selectedAction = actions?.find(action => action.resourceName === selection) || null;
      const busy = state.conversionActionBusy[mcc.mccCustomerId] === true;
      const options = actions === null
        ? saved
          ? `<option value="${escapeHtml(saved.resourceName)}" selected>${escapeHtml(saved.name)} · salva localmente · consulta pendente</option>`
          : '<option value="">Carregue as ações desta MCC</option>'
        : `<option value="">Selecione uma ação</option>${saved && !currentActionExists && selection === saved.resourceName ? `<option value="${escapeHtml(saved.resourceName)}" selected disabled>${escapeHtml(saved.name)} · não consta na consulta atual</option>` : ''}${actions.map(action => {
          const eligible = isGoogleAdsPurchaseUploadAction(action);
          const selected = action.resourceName === selection ? ' selected' : '';
          return `<option value="${escapeHtml(action.resourceName)}"${selected}${eligible ? '' : ' disabled'}>${escapeHtml(action.name)} · ${escapeHtml(action.status)} · ${escapeHtml(action.type)} · ${escapeHtml(action.category)}${eligible ? '' : ' · incompatível'}</option>`;
        }).join('')}`;
      const detail = state.conversionActionMessages[mcc.mccCustomerId]
        || (saved ? `Salva neste navegador em ${formatConversionActionTimestamp(saved.savedAtUtc)}.` : 'Nenhuma ação associada a esta MCC.');
      const error = state.conversionActionErrors[mcc.mccCustomerId];
      const selectId = `globalGuruMediaConversionAction-${mcc.mccCustomerId}`;
      return `<tr>
        <td>${escapeHtml(mcc.name)}</td>
        <td><code>${escapeHtml(mcc.mccCustomerId)}</code></td>
        <td><label class="tracking-token-field tracking-conversion-action-field" for="${selectId}"><span>Ação de compra · importação de cliques</span><select id="${selectId}" data-conversion-action-mcc="${mcc.mccCustomerId}"${actions === null || busy ? ' disabled' : ''}>${options}</select>${saved && inventoryLoaded && !currentActionExists ? '<small class="tracking-conversion-action-warning">A ação salva não apareceu na consulta atual desta MCC. Confira se ela ainda existe e está ativa antes de substituí-la.</small>' : ''}</label></td>
        <td class="tracking-conversion-resource"><code>${escapeHtml(selectedAction?.resourceName || saved?.resourceName || '—')}</code></td>
        <td>${escapeHtml(selectedAction?.status || saved?.status || '—')}</td>
        <td><div class="tracking-conversion-action-buttons"><button type="button" class="btn" data-global-action="load-conversion-actions" data-conversion-mcc="${mcc.mccCustomerId}"${busy ? ' disabled' : ''}>${busy ? 'Consultando…' : actions === null ? 'Carregar ações' : 'Atualizar ações'}</button><button type="button" class="btn primary" data-global-action="save-conversion-action" data-conversion-mcc="${mcc.mccCustomerId}"${!isGoogleAdsPurchaseUploadAction(selectedAction) || busy ? ' disabled' : ''}>Salvar</button>${saved ? `<button type="button" class="btn" data-global-action="remove-conversion-action" data-conversion-mcc="${mcc.mccCustomerId}"${busy ? ' disabled' : ''}>Remover</button>` : ''}</div><small class="tracking-conversion-action-message${error ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(error || detail)}</small></td>
      </tr>`;
    }).join('');
    const storageMessage = state.conversionActionSettingsInvalid
      ? '<p class="tracking-connection-note is-error">A configuração local salva não pôde ser lida. Ela foi preservada; não grave uma nova escolha até conferir o armazenamento do navegador.</p>'
      : !state.conversionActionStorageAvailable
        ? '<p class="tracking-connection-note is-error">O navegador não permite gravar a associação local nesta origem.</p>'
        : '';
    const adsEnabled = state.guruMediaAdsStatus?.live_enabled === true;
    return `<section class="tracking-panel tracking-clicks-panel tracking-conversion-actions" aria-label="Ações de conversão Google Ads por MCC">
      <div class="tracking-table-heading"><div><h2>Ação de conversão Google Ads por MCC</h2><p>A seleção continua salva neste navegador. Sincronize as Tracks GuruMedia com o servidor para preparar o destino de cada venda.</p></div></div>
      ${storageMessage}
      ${mccRows.length ? `<div class="tracking-table-wrap"><table class="tracking-table tracking-conversion-action-table"><thead><tr><th>MCC do manifesto</th><th>ID da MCC</th><th>Ação selecionada</th><th>Resource name</th><th>Status</th><th>Ações</th></tr></thead><tbody>${body}</tbody></table></div>` : '<div class="tracking-empty"><p>Não há MCCs com ID completo no manifesto carregado. Carregue a base MCC antes de configurar uma ação.</p></div>'}
      <p class="tracking-connection-note">A consulta lista ações existentes. Só ficam selecionáveis as ações ativas do tipo <code>UPLOAD_CLICKS</code> e categoria <code>PURCHASE</code>. A seleção não cria nem altera ações no Google Ads.</p>
      <div class="tracking-domain-actions tracking-gurumedia-ads-actions">
        <button type="button" class="btn" data-global-action="sync-gurumedia-google-ads-routes"${state.guruMediaAdsPending ? ' disabled' : ''}>${state.guruMediaAdsPending ? 'Aguarde…' : 'Sincronizar rotas com servidor'}</button>
        <button type="button" class="btn" data-global-action="refresh-gurumedia-google-ads-status"${state.guruMediaAdsPending ? ' disabled' : ''}>Atualizar estado</button>
        <button type="button" class="btn ${adsEnabled ? '' : 'primary'}" data-global-action="toggle-gurumedia-google-ads-sending"${state.guruMediaAdsPending || !state.guruMediaAdsStatus ? ' disabled' : ''}>${adsEnabled ? 'Pausar envio automático' : 'Ativar envio automático'}</button>
      </div>
      <p class="tracking-domain-message${state.guruMediaAdsError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(guruMediaGoogleAdsStatusText())}</p>
      <p class="tracking-connection-note">Sincronizar rotas nunca envia conversões e desativa o envio automático para revisão. Ao ativá-lo, somente vendas novas recebidas depois da ativação entram na fila; vendas existentes não são enviadas em lote. Cada venda individual pode ser validada com <code>validateOnly</code> e enviada separadamente pela tela Tracking GuruMedia. Antes de enviar ou ativar, confirme que a Flow ou outro sistema não envia a mesma venda para a mesma ação.</p>
    </section>`;
  }

  async function loadConversionActions(mccCustomerId) {
    const id = String(mccCustomerId ?? '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(id)) return;
    if (!state.hubToken) {
      state.conversionActionErrors[id] = 'Configure o token do Hub em Configurações globais antes de consultar as ações.';
      render();
      return;
    }
    state.conversionActionBusy = { ...state.conversionActionBusy, [id]: true };
    state.conversionActionErrors = { ...state.conversionActionErrors, [id]: '' };
    state.conversionActionMessages = { ...state.conversionActionMessages, [id]: 'Consultando ações de conversão na MCC…' };
    render();
    try {
      const result = await fetchConversionActions({ managerCustomerId: id, customerId: id }, { token: state.hubToken });
      state.conversionActionsByMcc = { ...state.conversionActionsByMcc, [id]: result.actions };
      state.conversionActionMessages = { ...state.conversionActionMessages, [id]: `${new Intl.NumberFormat('pt-BR').format(result.actions.length)} ação(ões) consultada(s) · ${formatConversionActionTimestamp(result.generatedAtUtc)}.` };
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: '' };
    } catch (error) {
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: error instanceof Error ? error.message : 'Não foi possível consultar as ações desta MCC.' };
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
      ?? root.querySelector(`[data-conversion-action-mcc="${id}"]`)?.value
      ?? '';
    const selected = (state.conversionActionsByMcc[id] || []).find(action => action.resourceName === resourceName);
    if (!isGoogleAdsPurchaseUploadAction(selected)) {
      state.conversionActionErrors = { ...state.conversionActionErrors, [id]: 'Escolha uma ação ativa de compra do tipo importação de cliques.' };
      render();
      return;
    }
    try {
      const result = saveActionSetting({ mccCustomerId: id, managerCustomerId: id, customerId: id, ...selected }, { now: nowFn });
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

  function syncHubToken() {
    if (!state.rememberHubToken) {
      const result = clearTrackingHubToken();
      state.hubTokenStatus = result.removed ? 'disabled' : 'unavailable';
    } else if (!TOKEN_PATTERN.test(state.hubToken)) {
      const result = clearTrackingHubToken();
      state.hubTokenStatus = result.removed ? 'incomplete' : 'unavailable';
    } else {
      const result = saveTrackingHubToken(state.hubToken);
      state.hubTokenStatus = result.saved ? 'saved' : result.available ? 'incomplete' : 'unavailable';
    }
    const status = root.querySelector('#globalHubTokenStatus');
    if (status) {
      status.textContent = hubTokenMessage();
      status.classList.toggle('is-error', ['unavailable', 'invalid'].includes(state.hubTokenStatus));
    }
    const forget = root.querySelector('[data-global-action="clear-hub-token"]');
    if (forget) forget.disabled = !state.hubToken && state.hubTokenStatus !== 'invalid';
    const refreshDirectory = root.querySelector('[data-global-action="refresh-google-ads-directory"]');
    if (refreshDirectory) refreshDirectory.disabled = state.googleAdsDirectoryPending || state.hubTokenStatus !== 'saved';
  }

  function syncAdminToken() {
    if (!state.rememberAdminToken) {
      const result = clearTrackingDomainAdminToken();
      state.adminTokenStatus = result.removed ? 'disabled' : 'unavailable';
    } else if (!TOKEN_PATTERN.test(state.adminToken)) {
      const result = clearTrackingDomainAdminToken();
      state.adminTokenStatus = result.removed ? 'incomplete' : 'unavailable';
    } else {
      const result = saveTrackingDomainAdminToken(state.adminToken);
      state.adminTokenStatus = result.saved ? 'saved' : result.available ? 'incomplete' : 'unavailable';
    }
    const status = root.querySelector('#globalAdminTokenStatus');
    if (status) {
      status.textContent = adminTokenMessage();
      status.classList.toggle('is-error', ['unavailable', 'invalid'].includes(state.adminTokenStatus));
    }
    const forget = root.querySelector('[data-global-action="clear-domain-token"]');
    if (forget) forget.disabled = !state.adminToken && state.adminTokenStatus !== 'invalid';
  }

  function productKeyPreview() {
    try { return normalizeTrackingProductKey(state.productLabel); }
    catch { return 'o identificador do Track aparecerá aqui'; }
  }

  function trackNameOptions() {
    const labels = new Map();
    for (const row of state.domainRows) {
      const label = String(row.productLabel || row.productKey || '').trim();
      const key = label.toLocaleLowerCase('pt-BR');
      if (label && !labels.has(key)) labels.set(key, label);
    }
    return [...labels.values()].map(label => `<option value="${escapeHtml(label)}"></option>`).join('');
  }

  function cacheStatus() {
    if (state.domainCacheMessage) return state.domainCacheMessage;
    if (state.domainCacheUpdatedAtUtc) return `Lista atualizada no servidor e guardada neste navegador em ${state.domainCacheUpdatedAtUtc}.`;
    return 'A lista consultada fica em cache local sem tokens; não entra no backup geral do Hub.';
  }

  function legacyCleanupHasData(preview = state.legacyCleanup.preview) {
    if (!preview) return false;
    return preview.hub.eventsCount > 0
      || preview.hub.eventLogPresent
      || preview.legacy.eventsCount > 0;
  }

  function renderLegacyCleanup() {
    const cleanup = state.legacyCleanup;
    const preview = cleanup.preview;
    const status = cleanup.message
      ? `<p class="tracking-connection-note${cleanup.error ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(cleanup.message)}</p>`
      : '';
    const dialog = !cleanup.dialogOpen || !preview ? '' : (() => {
      const extraStores = preview.legacy.stores.filter(name => name !== 'events');
      const hasData = legacyCleanupHasData(preview);
      const legacySummary = !preview.legacy.exists
        ? 'Banco antigo de Observabilidade: não encontrado.'
        : preview.legacy.hasEventsStore
          ? `Banco antigo de Observabilidade: ${preview.legacy.eventsCount} registro(s) na store events.`
          : 'Banco antigo encontrado, mas sem a store events; ele será preservado.';
      const extraStoreNote = extraStores.length
        ? `<p class="tracking-connection-note">Outras stores serão preservadas: <code>${escapeHtml(extraStores.join(', '))}</code>.</p>`
        : '';
      return `<div class="tracking-tag-dialog-backdrop" data-legacy-cleanup-backdrop><section id="legacyObservabilityCleanupDialog" class="tracking-tag-dialog" role="dialog" aria-modal="true" aria-labelledby="legacyObservabilityCleanupTitle" tabindex="-1">
        <div class="tracking-tag-dialog-head"><div><h2 id="legacyObservabilityCleanupTitle">Prévia da limpeza local</h2><p>A prévia mostra contagens e a presença do campo legado; o conteúdo dos eventos não é exibido.</p></div><button type="button" class="btn" data-global-action="cancel-legacy-observability-cleanup" aria-label="Fechar"${cleanup.pending ? ' disabled' : ''}>×</button></div>
        <ul class="tracking-legacy-cleanup-list"><li>Banco do Hub · store events: <strong>${preview.hub.eventsCount}</strong> registro(s).</li><li>Base atual do Hub · campo event_log: <strong>${preview.hub.eventLogPresent ? 'presente' : 'ausente'}</strong>.</li><li>${escapeHtml(legacySummary)}</li></ul>
        ${extraStoreNote}
        <p class="tracking-connection-note">Ao confirmar, serão limpos apenas os registros de Observabilidade identificados. Campanhas, diário, métricas e outras stores serão preservados. Arquivos de backup JSON não serão alterados.</p>
        ${!legacyCleanupHasData(preview) ? '<p class="tracking-domain-message">Nenhum registro legado foi encontrado. Nada será excluído.</p>' : ''}
        <div class="tracking-tag-dialog-actions"><button type="button" class="btn" data-global-action="cancel-legacy-observability-cleanup"${cleanup.pending ? ' disabled' : ''}>Cancelar</button>${hasData ? `<button type="button" class="btn primary" data-global-action="confirm-legacy-observability-cleanup"${cleanup.pending ? ' disabled' : ''}>${cleanup.pending ? 'Limpando…' : 'Excluir dados identificados'}</button>` : ''}</div>
      </section></div>`;
    })();
    return `<section class="tracking-panel tracking-email-panel" aria-label="Limpeza dos dados legados de Observabilidade">
      <div class="tracking-table-heading"><div><h2>Dados locais de telas removidas</h2><p>Verifique e, se desejar, limpe os registros antigos de Observabilidade deste navegador.</p></div></div>
      <p class="tracking-connection-note">A prévia mostra apenas contagens e a presença de campos legados. A limpeza não altera campanhas, métricas ou backups.</p>
      <div class="tracking-domain-actions"><button type="button" class="btn" data-global-action="inspect-legacy-observability"${cleanup.pending ? ' disabled' : ''}>${cleanup.pending ? 'Verificando…' : 'Verificar dados locais'}</button></div>
      ${status}
    </section>${dialog}`;
  }

  function renderTag(row) {
    if (!row || state.selectedTagHost !== row.hostname) return '';
    const tag = buildTrackingPresellScriptTag(row.productKey, row.hostname);
    const message = state.tagMessage
      ? `<p class="tracking-domain-message${state.tagError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.tagMessage)}</p>`
      : '';
    return `<div class="tracking-tag-dialog-backdrop" data-global-tag-backdrop><section id="trackingGlobalTagDialog" class="tracking-tag-dialog" role="dialog" aria-modal="true" aria-labelledby="trackingGlobalTagDialogTitle" tabindex="-1">
      <div class="tracking-tag-dialog-head"><div><h2 id="trackingGlobalTagDialogTitle">Tag da pre-sell</h2><p>${escapeHtml(row.hostname)} · ${escapeHtml(row.productLabel || row.productKey)}</p></div><button type="button" class="btn" data-global-action="close-tag" aria-label="Fechar">×</button></div>
      <label class="tracking-token-field" for="trackingGlobalPresellScript"><span>Tag de instalação</span><textarea id="trackingGlobalPresellScript" rows="3" readonly spellcheck="false" aria-label="Tag de instalação de ${escapeHtml(row.hostname)}">${escapeHtml(tag)}</textarea></label>
      <p class="tracking-connection-note">A tag não contém token. Recarregue a Pre-Sell após publicar <code>track.js</code>; não é necessário colar uma nova tag quando o arquivo externo for atualizado.</p>
      ${message}<div class="tracking-tag-dialog-actions"><button type="button" class="btn primary" data-global-action="copy-tag" data-host="${escapeHtml(row.hostname)}">Copiar tag</button><button type="button" class="btn" data-global-action="close-tag">Fechar</button></div>
    </section></div>`;
  }

  function render() {
    if (!root.isConnected) return;
    const selectedTag = state.domainRows.find(row => row.hostname === state.selectedTagHost) || null;
    const domainRows = state.domainRows.length
      ? state.domainRows.map(row => `<tr><td><a class="tracking-presell-link" href="${escapeHtml(row.origin + '/')}" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(row.hostname)}</code></a></td><td>${escapeHtml(row.productLabel || row.productKey)}</td><td>${row.platform === 'gurumedia' ? 'GuruMedia' : row.platform === 'clickbank' ? 'ClickBank' : 'Definir plataforma'}</td><td><code>${escapeHtml(row.platform === 'gurumedia' ? row.offerId || 'Aguardando venda' : '—')}</code></td><td class="tracking-registration-date">${formatTrackRegistrationDate(row.createdAtUtc)}</td><td><div class="tracking-domain-row-actions"><button type="button" class="btn" data-global-action="edit-domain" data-host="${escapeHtml(row.hostname)}">Editar</button><button type="button" class="btn" data-global-action="show-tag" data-host="${escapeHtml(row.hostname)}">${state.selectedTagHost === row.hostname ? 'Tag selecionada' : 'Exibir tag'}</button></div></td></tr>`).join('')
        : `<tr><td colspan="6" class="tracking-domain-empty">${state.domainsLoaded ? 'Nenhum domínio cadastrado nesta lista.' : 'A lista ainda não foi consultada.'}</td></tr>`;
    const hubTokenPanel = `<section class="tracking-panel tracking-email-panel" aria-label="Token de acesso do Hub">
        <div class="tracking-table-heading"><div><h2>Token de acesso do Hub</h2><p>Um token de leitura compartilhado pelas telas de Tracking.</p></div></div>
        <div class="tracking-email-grid">
          <label class="tracking-token-field" for="globalHubToken"><span>Token de leitura</span><input id="globalHubToken" name="tracking_api_token" type="text" class="tracking-token-input is-masked" autocomplete="off" spellcheck="false" inputmode="text" maxlength="64" placeholder="64 caracteres hexadecimais" value="${escapeHtml(state.hubToken)}"></label>
          <label class="tracking-remember-token"><input id="globalRememberHubToken" type="checkbox"${state.rememberHubToken ? ' checked' : ''}><span>Lembrar neste navegador</span></label>
          <div class="tracking-domain-actions"><button type="button" class="btn" data-global-action="clear-hub-token"${state.hubToken || state.hubTokenStatus === 'invalid' ? '' : ' disabled'}>Esquecer token</button></div>
        </div>
        <p id="globalHubTokenStatus" class="tracking-token-storage-status${['unavailable', 'invalid'].includes(state.hubTokenStatus) ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(hubTokenMessage())}</p>
        <p class="tracking-connection-note">Este é o token de acesso às APIs do Hub. Ele não é o segredo do postback GuruMedia; esse segredo permanece no arquivo privado <code>tracking-config.php</code> e na configuração do postback da plataforma.</p>
      </section>`;
    root.innerHTML = `<div class="tracking-session tracking-global-settings-session">
      <section class="tracking-panel tracking-intro"><div class="tracking-intro-head"><div class="tracking-intro-copy"><h2>${panelScope === 'tracker' ? 'Tracker Global' : panelScope === 'settings' ? 'Configurações globais do Hub' : 'Configurações globais do Tracking'}</h2><p>${panelScope === 'tracker' ? 'Cadastre e gerencie os domínios e Tracks permitidos pelas integrações de Tracking.' : panelScope === 'settings' ? 'Acesso compartilhado, MCCs e contas Google Ads, e notificações por e-mail para as integrações do Hub.' : 'Acesso compartilhado, cadastro de Tracks e notificações por e-mail para ClickBank, GuruMedia e as demais integrações do Hub.'}</p></div></div></section>

      ${panelScope === 'settings' ? '' : `
      <section class="tracking-panel tracking-domain-panel" aria-label="Cadastro global de Tracks">
        <div class="tracking-table-heading tracking-domain-heading"><div><h2>Tracks e domínios permitidos</h2><p>Cadastro global usado para associar cliques e vendas às Pre-Sells.</p></div><div class="tracking-domain-heading-actions"><button type="button" class="btn" data-global-action="refresh-domains"${state.domainPending ? ' disabled' : ''}>${state.domainPending && state.domainAction === 'refresh' ? 'Consultando…' : 'Atualizar lista'}</button></div></div>
        <div class="tracking-domain-admin-config">
          <div class="tracking-domain-token-grid">
            <label class="tracking-token-field" for="globalDomainAdminToken"><span>Token administrativo de domínios</span><input id="globalDomainAdminToken" name="tracking_domain_admin_token" type="text" class="tracking-token-input${state.showAdminToken ? '' : ' is-masked'}" autocomplete="off" spellcheck="false" inputmode="text" maxlength="64" placeholder="64 caracteres hexadecimais" value="${escapeHtml(state.adminToken)}"></label>
            <div class="tracking-domain-token-actions"><button type="button" class="btn" data-global-action="generate-domain-token">Gerar / trocar token</button><button type="button" class="btn" data-global-action="download-domain-config">Baixar configuração privada</button><button type="button" class="btn" data-global-action="clear-domain-token"${state.adminToken || state.adminTokenStatus === 'invalid' ? '' : ' disabled'}>Esquecer token</button></div>
            <label class="tracking-remember-token"><input id="globalShowAdminToken" type="checkbox"${state.showAdminToken ? ' checked' : ''}><span>Mostrar token</span></label>
            <label class="tracking-remember-token"><input id="globalRememberAdminToken" type="checkbox"${state.rememberAdminToken ? ' checked' : ''}><span>Lembrar neste navegador</span></label>
            <p id="globalAdminTokenStatus" class="tracking-token-storage-status${['unavailable', 'invalid'].includes(state.adminTokenStatus) ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(adminTokenMessage())}</p>
          </div>
          <p class="tracking-connection-note">O token administrativo é separado do token de leitura. Se gerar/trocar, baixe e publique <code>${TRACKING_DOMAIN_ADMIN_CONFIG_FILE}</code> na pasta privada do servidor. Não o gere novamente para cada Track.</p>
        </div>
        <div class="tracking-domain-form">
          <label class="tracking-token-field" for="globalDomainName"><span>Domínio HTTPS da Pre-Sell</span><input id="globalDomainName" type="text" autocomplete="url" spellcheck="false" placeholder="exemplo.com ou https://exemplo.com/" value="${escapeHtml(state.domain)}"${state.editingHost ? ' readonly' : ''}></label>
          <label class="tracking-token-field" for="globalTrackName"><span>Nome do Track</span><input id="globalTrackName" list="globalTrackNameSuggestions" type="text" autocomplete="off" spellcheck="false" maxlength="253" placeholder="ex.: Dentabiome - conta 8568" value="${escapeHtml(state.productLabel)}"><datalist id="globalTrackNameSuggestions">${trackNameOptions()}</datalist><small class="tracking-domain-product-preview">${escapeHtml(productKeyPreview())}</small></label>
          <label class="tracking-token-field" for="globalTrackPlatform"><span>Plataforma do Track</span><select id="globalTrackPlatform">${state.platform === 'unclassified' ? '<option value="unclassified" selected>Selecione a plataforma</option>' : ''}<option value="clickbank"${state.platform === 'clickbank' ? ' selected' : ''}>ClickBank</option><option value="gurumedia"${state.platform === 'gurumedia' ? ' selected' : ''}>GuruMedia</option></select></label>
          <label class="tracking-remember-token"><input id="globalIncludeWww" type="checkbox"${state.includeWww ? ' checked' : ''}><span>Autorizar também a variante www</span></label>
          <div class="tracking-domain-actions">${state.editingHost ? '<button type="button" class="btn" data-global-action="cancel-edit-domain">Cancelar edição</button>' : ''}<button type="button" class="btn primary" data-global-action="save-domain"${state.domainPending ? ' disabled' : ''}>${state.domainPending && state.domainAction === 'save' ? 'Salvando…' : state.editingHost ? 'Salvar alterações' : 'Salvar domínio e Track'}</button></div>
        </div>
        <p class="tracking-connection-note">Para GuruMedia, o ID da oferta é aprendido automaticamente no primeiro postback cuja saída esteja associada a uma Track única. Não precisa copiar o ID. Até esse vínculo, um postback sem clique não pode ser identificado com segurança.</p>
        <div class="tracking-table-wrap"><table class="tracking-table tracking-domain-table" aria-label="Tracks cadastradas"><thead><tr><th>Domínio</th><th>Nome do Track</th><th>Plataforma</th><th>ID da oferta (automático)</th><th class="tracking-registration-date">Data de cadastro</th><th>Ações</th></tr></thead><tbody>${domainRows}</tbody></table></div>
        <p class="tracking-domain-message${state.domainError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.domainMessage)}</p>
        <p class="tracking-connection-note" role="status" aria-live="polite">${escapeHtml(cacheStatus())}</p>
      </section>
      `}

      ${panelScope === 'tracker' ? '' : `${hubTokenPanel}
      ${panelScope === 'settings' ? renderGoogleAdsAccountsDirectory() : ''}
      ${panelScope === 'settings' ? renderConversionActionSettings() : ''}

      <section class="tracking-panel tracking-email-panel" aria-label="Notificações globais por e-mail">
        <div class="tracking-table-heading"><div><h2>Notificações por e-mail</h2><p>Uma caixa e um destinatário para os avisos de venda de todas as plataformas configuradas.</p></div></div>
        <p class="tracking-connection-note">Vendas GuruMedia associadas a uma Track entram na fila e são enviadas pelo worker do Cron existente. ClickBank mantém os avisos já configurados. Esta configuração não envia conversões ao Google Ads.</p>
        <div class="tracking-email-grid">
          <label class="tracking-token-field" for="trackingEmailRecipient"><span>Destinatário</span><input id="trackingEmailRecipient" type="email" maxlength="254" autocomplete="email" placeholder="e-mail para receber os avisos" value="${escapeHtml(state.emailConfig.toEmail)}"></label>
          <label class="tracking-token-field" for="trackingEmailSender"><span>Remetente</span><input id="trackingEmailSender" type="email" maxlength="254" autocomplete="email" placeholder="ex.: alertas@seu-dominio.com" value="${escapeHtml(state.emailConfig.fromEmail)}"></label>
          <label class="tracking-token-field" for="trackingEmailSmtpHost"><span>Servidor SMTP</span><input id="trackingEmailSmtpHost" type="text" maxlength="253" autocomplete="off" placeholder="ex.: smtp.hostinger.com" value="${escapeHtml(state.emailConfig.smtpHost)}"></label>
          <label class="tracking-token-field" for="trackingEmailSmtpPort"><span>Porta</span><input id="trackingEmailSmtpPort" type="text" inputmode="numeric" maxlength="5" autocomplete="off" value="${escapeHtml(state.emailConfig.smtpPort)}"></label>
          <label class="tracking-token-field" for="trackingEmailSmtpSecurity"><span>Segurança</span><select id="trackingEmailSmtpSecurity"><option value="ssl"${state.emailConfig.smtpSecurity === 'ssl' ? ' selected' : ''}>SSL/TLS</option><option value="starttls"${state.emailConfig.smtpSecurity === 'starttls' ? ' selected' : ''}>STARTTLS</option></select></label>
          <label class="tracking-token-field" for="trackingEmailSmtpUsername"><span>Usuário SMTP</span><input id="trackingEmailSmtpUsername" type="text" maxlength="320" autocomplete="off" placeholder="normalmente o e-mail remetente" value="${escapeHtml(state.emailConfig.smtpUsername)}"></label>
          <label class="tracking-token-field" for="trackingEmailSmtpPassword"><span>Senha SMTP</span><input id="trackingEmailSmtpPassword" type="password" maxlength="1024" autocomplete="new-password" spellcheck="false" placeholder="não será salva no navegador"></label>
          <div class="tracking-domain-actions"><button type="button" class="btn primary" data-global-action="download-email-config">Baixar configuração privada</button><button type="button" class="btn" data-global-action="clear-email-config">Limpar campos</button></div>
        </div>
        <p class="tracking-conversion-profile-message${state.emailError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.emailMessage)}</p>
        <p class="tracking-connection-note">Os campos ficam somente na memória desta aba. O arquivo <code>${TRACKING_EMAIL_CONFIG_FILE}</code> contém a senha SMTP; mantenha-o em <code>private-tools</code>, fora de <code>public_html</code>, do Git e de backups compartilhados. Após baixar, a senha é removida dos campos.</p>
      </section>
      ${renderLegacyCleanup()}`}
      ${panelScope === 'settings' ? '' : selectedTag ? renderTag(selectedTag) : ''}
    </div>`;
    if (state.legacyCleanup.dialogNeedsFocus) {
      root.querySelector?.('#legacyObservabilityCleanupDialog')?.focus?.();
      state.legacyCleanup.dialogNeedsFocus = false;
    }
    if (state.legacyCleanup.returnFocus) {
      root.querySelector?.('[data-global-action="inspect-legacy-observability"]')?.focus?.();
      state.legacyCleanup.returnFocus = false;
    }
    if (state.tagDialogNeedsFocus) {
      root.querySelector?.('#trackingGlobalTagDialog')?.focus?.();
      state.tagDialogNeedsFocus = false;
    }
    if (state.tagDialogReturnHost) {
      const returnHost = state.tagDialogReturnHost;
      const returnButton = [...(root.querySelectorAll?.('[data-global-action="show-tag"]') || [])]
        .find(button => button.dataset?.host === returnHost);
      returnButton?.focus?.();
      state.tagDialogReturnHost = '';
    }
  }

  async function refreshDomains() {
    if (!TOKEN_PATTERN.test(state.adminToken)) {
      state.domainMessage = 'Informe um token administrativo válido para consultar os domínios.';
      state.domainError = true;
      render();
      return;
    }
    state.domainPending = true;
    state.domainAction = 'refresh';
    state.domainError = false;
    state.domainMessage = 'Consultando os domínios e Tracks no servidor…';
    render();
    try {
      state.domainRows = await fetchTrackingDomains(state.adminToken);
      state.domainsLoaded = true;
      const saved = saveTrackingDomainList(state.domainRows);
      state.domainCacheAvailable = saved.saved;
      state.domainCacheUpdatedAtUtc = saved.updatedAtUtc || '';
      state.domainCacheMessage = saved.saved
        ? `Lista consultada e salva no cache local em ${saved.updatedAtUtc}.`
        : 'Lista atualizada nesta aba, mas o navegador não conseguiu salvar o cache local.';
      state.domainMessage = `${state.domainRows.length} domínio(s) e Track(s) carregados.`;
      state.domainError = false;
    } catch (error) {
      state.domainMessage = error instanceof Error ? error.message : 'Não foi possível consultar os domínios.';
      state.domainError = true;
    } finally {
      state.domainPending = false;
      state.domainAction = '';
      render();
    }
  }

  async function refreshGoogleAdsAccountDirectory() {
    if (!readTrackingHubToken().token) {
      state.googleAdsDirectoryMessage = 'Configure e lembre o token compartilhado em Configurações globais para atualizar as MCCs.';
      state.googleAdsDirectoryError = true;
      render();
      return;
    }
    state.googleAdsDirectoryPending = true;
    state.googleAdsDirectoryError = false;
    state.googleAdsDirectoryMessage = 'Consultando as MCCs do Google Ads e atualizando os sites Hostinger…';
    render();
    try {
      const [googleResult, hostingerResult] = await Promise.allSettled([
        refreshGoogleAdsAccountsDirectory(),
        refreshHostingerSitesDirectory(),
      ]);
      const messages = [];
      let hasError = false;
      if (googleResult.status === 'fulfilled') {
        const refreshed = googleResult.value;
        state.googleAdsDirectory = refreshed.accounts;
        state.googleAdsDirectoryUpdatedAtUtc = refreshed.refreshedAtUtc || refreshed.savedAtUtc;
        state.googleAdsDirectoryPersisted = refreshed.persisted;
        if (refreshed.accounts.accounts.length) {
          messages.push(`Google Ads: ${refreshed.accounts.accounts.length} conta(s) cliente atualizada(s)${refreshed.accounts.warningCount ? ` com ${refreshed.accounts.warningCount} aviso(s)` : ''}${refreshed.persisted ? ' e guardada(s) neste perfil' : '; não foi possível persistir o cache local'}.`);
          if (refreshed.accounts.warningCount || !refreshed.persisted) hasError = true;
        } else {
          messages.push('Google Ads: nenhuma conta de anúncios foi encontrada nas MCCs acessíveis.');
          hasError = true;
        }
      } else {
        const cachedCount = state.googleAdsDirectory?.accounts?.length || 0;
        messages.push(`Google Ads: a atualização falhou; mantive as ${cachedCount} conta(s) já guardadas. ${googleResult.reason?.message || ''}`.trim());
        hasError = true;
      }
      if (hostingerResult.status === 'fulfilled') {
        const refreshed = hostingerResult.value;
        messages.push(`Hostinger: ${refreshed.sites.length} site(s), atualizado(s) ${refreshed.checkedAtUtc ? `às ${googleAdsDirectoryDateLabel(refreshed.checkedAtUtc)}` : 'agora'}; cache local renovado.`);
      } else {
        messages.push(`Hostinger: não foi possível atualizar os sites; o cache anterior foi mantido. ${hostingerResult.reason?.message || ''}`.trim());
        hasError = true;
      }
      state.googleAdsDirectoryMessage = messages.join(' ');
      state.googleAdsDirectoryError = hasError;
    } catch (error) {
      state.googleAdsDirectoryMessage = error instanceof Error ? error.message : 'Não foi possível atualizar as MCCs e contas Google Ads.';
      state.googleAdsDirectoryError = true;
    } finally {
      state.googleAdsDirectoryPending = false;
      render();
    }
  }

  async function saveDomain() {
    if (!TOKEN_PATTERN.test(state.adminToken)) {
      state.domainMessage = 'Informe um token administrativo válido para cadastrar uma Track.';
      state.domainError = true;
      render();
      return;
    }
    state.domainPending = true;
    state.domainAction = 'save';
    state.domainError = false;
    state.domainMessage = 'Salvando domínio e Track no servidor…';
    render();
    try {
      const hostname = normalizeTrackingDomainInput(state.domain);
      const productLabel = normalizeTrackingProductLabel(state.productLabel).trim();
      const productKey = normalizeTrackingProductKey(productLabel);
      const result = await addTrackingDomain(state.adminToken, hostname, {
        includeWww: state.includeWww,
        productKey,
        productLabel,
        platform: state.platform,
      });
      state.domainMessage = `Track ${productLabel} (${state.platform === 'gurumedia' ? 'GuruMedia' : 'ClickBank'}) salva. ${result.added.length} domínio(s) adicionado(s), ${result.updated.length} atualizado(s) e ${result.alreadyAllowed.length} já autorizado(s).`;
      state.domain = '';
      state.productLabel = '';
      state.platform = 'clickbank';
      state.editingHost = '';
      await refreshDomains();
    } catch (error) {
      state.domainMessage = error instanceof Error ? error.message : 'Não foi possível salvar a Track.';
      state.domainError = true;
    } finally {
      state.domainPending = false;
      state.domainAction = '';
      render();
    }
  }

  async function inspectLegacyCleanup() {
    const cleanup = state.legacyCleanup;
    if (cleanup.pending) return;
    cleanup.pending = true;
    cleanup.dialogOpen = false;
    cleanup.preview = null;
    cleanup.message = '';
    cleanup.error = false;
    render();
    try {
      cleanup.preview = await inspectLegacyObservability();
      cleanup.dialogOpen = true;
      cleanup.dialogNeedsFocus = true;
    } catch (error) {
      cleanup.message = error instanceof Error ? error.message : 'Não foi possível verificar os dados locais.';
      cleanup.error = true;
    } finally {
      cleanup.pending = false;
      render();
    }
  }

  async function confirmLegacyCleanup() {
    const cleanup = state.legacyCleanup;
    if (cleanup.pending || !cleanup.preview || !legacyCleanupHasData()) return;
    cleanup.pending = true;
    cleanup.error = false;
    cleanup.message = '';
    render();
    try {
      const result = await clearLegacyObservability(cleanup.preview, { invalidateCache: invalidateBaseCache });
      let refreshWarning = '';
      if (result.hub.eventLogRemoved) {
        try {
          await onBaseUpdated({ updatedAt: result.hub.baseUpdatedAt });
        } catch (error) {
          refreshWarning = error instanceof Error ? error.message : 'Não foi possível atualizar as outras telas.';
        }
      }
      const details = [
        `${result.hub.eventsRemoved} registro(s) da store events do Hub`,
        result.hub.eventLogRemoved ? 'campo event_log removido da base atual' : '',
        `${result.legacy.eventsRemoved} registro(s) da base antiga`,
      ].filter(Boolean).join('; ');
      const notices = [];
      if (result.partial) notices.push(`A limpeza da base do Hub foi concluída, mas a base antiga não pôde ser limpa: ${result.legacy.reason || 'ela mudou após a prévia.'}`);
      if (refreshWarning) notices.push(`Os dados foram limpos, mas a atualização das outras telas falhou: ${refreshWarning}`);
      notices.push('Os backups JSON não foram alterados.');
      cleanup.message = `Limpeza concluída: ${details}. ${notices.join(' ')}`;
      cleanup.error = result.partial || Boolean(refreshWarning);
      cleanup.dialogOpen = false;
      cleanup.preview = null;
      cleanup.returnFocus = true;
    } catch (error) {
      cleanup.message = error instanceof Error ? error.message : 'A limpeza foi interrompida; verifique os dados novamente antes de tentar de novo.';
      cleanup.error = true;
      cleanup.dialogOpen = false;
      cleanup.preview = null;
      cleanup.returnFocus = true;
    } finally {
      cleanup.pending = false;
      render();
    }
  }

  function cancelLegacyCleanup() {
    const cleanup = state.legacyCleanup;
    if (cleanup.pending) return;
    cleanup.dialogOpen = false;
    cleanup.preview = null;
    cleanup.returnFocus = true;
    render();
  }

  function handleAction(action, target) {
    if (action === 'refresh-google-ads-directory') {
      void refreshGoogleAdsAccountDirectory();
    } else if (action === 'sync-gurumedia-google-ads-routes') {
      void syncGuruMediaGoogleAdsConfig();
    } else if (action === 'refresh-gurumedia-google-ads-status') {
      void loadGuruMediaGoogleAdsStatus();
    } else if (action === 'toggle-gurumedia-google-ads-sending') {
      void toggleGuruMediaGoogleAdsSending();
    } else if (action === 'load-conversion-actions') {
      void loadConversionActions(target?.dataset?.conversionMcc);
    } else if (action === 'save-conversion-action') {
      saveConversionAction(target?.dataset?.conversionMcc);
    } else if (action === 'remove-conversion-action') {
      removeConversionAction(target?.dataset?.conversionMcc);
    } else if (action === 'inspect-legacy-observability') {
      void inspectLegacyCleanup();
    } else if (action === 'confirm-legacy-observability-cleanup') {
      void confirmLegacyCleanup();
    } else if (action === 'cancel-legacy-observability-cleanup') {
      cancelLegacyCleanup();
    } else if (action === 'clear-hub-token') {
      state.hubToken = '';
      state.rememberHubToken = false;
      const result = clearTrackingHubToken();
      state.hubTokenStatus = result.removed ? 'disabled' : 'unavailable';
      render();
    } else if (action === 'generate-domain-token') {
      try {
        state.adminToken = createTrackingDomainAdminToken();
        state.showAdminToken = false;
        syncAdminToken();
        state.domainMessage = 'Novo token gerado. Baixe e publique a configuração privada no servidor antes de usar o token.';
        state.domainError = false;
      } catch (error) {
        state.domainMessage = error instanceof Error ? error.message : 'Não foi possível gerar o token administrativo.';
        state.domainError = true;
      }
      render();
    } else if (action === 'download-domain-config') {
      try {
        const content = trackingDomainAdminConfigPhp(state.adminToken);
        clickDownload(TRACKING_DOMAIN_ADMIN_CONFIG_FILE, content, 'application/x-php;charset=utf-8');
        state.domainMessage = `${TRACKING_DOMAIN_ADMIN_CONFIG_FILE} baixado. Mantenha-o na pasta privada do servidor.`;
        state.domainError = false;
      } catch (error) {
        state.domainMessage = error instanceof Error ? error.message : 'Gere um token administrativo válido antes do download.';
        state.domainError = true;
      }
      render();
    } else if (action === 'clear-domain-token') {
      state.adminToken = '';
      state.rememberAdminToken = false;
      const result = clearTrackingDomainAdminToken();
      state.adminTokenStatus = result.removed ? 'disabled' : 'unavailable';
      state.domainMessage = 'Token removido do armazenamento local. O servidor continua com a configuração atual até ser alterado.';
      state.domainError = false;
      render();
    } else if (action === 'refresh-domains') {
      void refreshDomains();
    } else if (action === 'save-domain') {
      void saveDomain();
    } else if (action === 'edit-domain') {
      const row = state.domainRows.find(item => item.hostname === String(target?.dataset?.host || ''));
      if (!row) return;
      state.domain = row.hostname;
      state.productLabel = row.productLabel || row.productKey;
      state.platform = row.platform || 'unclassified';
      state.editingHost = row.hostname;
      state.includeWww = false;
      state.domainMessage = `Edite a plataforma ou o nome de ${row.hostname} e salve para atualizar a classificação usada pelos relatórios.`;
      state.domainError = false;
      render();
       root.querySelector('#globalTrackName')?.focus?.();
    } else if (action === 'cancel-edit-domain') {
      state.domain = '';
      state.productLabel = '';
      state.platform = 'clickbank';
      state.editingHost = '';
      state.includeWww = false;
      state.domainMessage = 'Edição cancelada.';
      state.domainError = false;
      render();
    } else if (action === 'show-tag') {
      state.selectedTagHost = String(target?.dataset?.host || '');
      state.tagMessage = '';
      state.tagError = false;
      state.tagDialogNeedsFocus = true;
      render();
    } else if (action === 'close-tag') {
      state.tagDialogReturnHost = state.selectedTagHost;
      state.selectedTagHost = '';
      state.tagMessage = '';
      state.tagError = false;
      render();
    } else if (action === 'copy-tag') {
      const row = state.domainRows.find(item => item.hostname === String(target?.dataset?.host || ''));
      if (!row) return;
      const tag = buildTrackingPresellScriptTag(row.productKey, row.hostname);
      if (!clipboard?.writeText) {
        state.tagMessage = 'A área de transferência não está disponível neste navegador. Selecione a tag e copie manualmente.';
        state.tagError = true;
        state.domainMessage = state.tagMessage;
        state.domainError = true;
        state.tagDialogNeedsFocus = true;
        render();
        return;
      }
      clipboard.writeText(tag).then(() => {
        state.tagMessage = 'Tag copiada.';
        state.tagError = false;
        state.domainMessage = state.tagMessage;
        state.domainError = false;
        state.tagDialogNeedsFocus = true;
        render();
      }).catch(() => {
        state.tagMessage = 'Não foi possível copiar a tag. Selecione o texto e copie manualmente.';
        state.tagError = true;
        state.domainMessage = state.tagMessage;
        state.domainError = true;
        state.tagDialogNeedsFocus = true;
        render();
      });
    } else if (action === 'download-email-config') {
      try {
        normalizeTrackingEmailConfig(state.emailConfig);
        clickDownload(TRACKING_EMAIL_CONFIG_FILE, trackingEmailConfigPhp(state.emailConfig), 'application/x-php;charset=utf-8');
        state.emailConfig.smtpPassword = '';
        state.emailMessage = `${TRACKING_EMAIL_CONFIG_FILE} baixado. Envie-o à pasta privada do servidor para compartilhar SMTP e destinatário entre as plataformas.`;
        state.emailError = false;
      } catch (error) {
        state.emailMessage = error instanceof Error ? error.message : 'Não foi possível validar a configuração de e-mail.';
        state.emailError = true;
      }
      render();
    } else if (action === 'clear-email-config') {
      state.emailConfig = emptyEmailConfig();
      state.emailMessage = 'Campos limpos desta aba; nenhum valor foi salvo pelo Hub.';
      state.emailError = false;
      render();
    }
  }

  root.addEventListener('input', event => {
    const id = event.target?.id;
    if (id === 'globalHubToken') {
      state.hubToken = String(event.target.value ?? '').trim();
      syncHubToken();
    } else if (id === 'globalDomainAdminToken') {
      state.adminToken = String(event.target.value ?? '').trim();
      syncAdminToken();
    } else if (id === 'globalDomainName') {
      state.domain = String(event.target.value ?? '');
    } else if (id === 'globalTrackName') {
      state.productLabel = String(event.target.value ?? '');
      const preview = root.querySelector('.tracking-domain-product-preview');
      if (preview) preview.textContent = productKeyPreview();
    } else {
      const emailKeys = {
        trackingEmailRecipient: 'toEmail',
        trackingEmailSender: 'fromEmail',
        trackingEmailSmtpHost: 'smtpHost',
        trackingEmailSmtpPort: 'smtpPort',
        trackingEmailSmtpUsername: 'smtpUsername',
        trackingEmailSmtpPassword: 'smtpPassword',
      };
      const key = emailKeys[id];
      if (key) state.emailConfig[key] = String(event.target.value ?? '');
    }
  });
  root.addEventListener('change', event => {
    const id = event.target?.id;
    if (event.target?.matches?.('[data-conversion-action-mcc]')) {
      const mccId = event.target.dataset.conversionActionMcc;
      state.conversionActionSelections = { ...state.conversionActionSelections, [mccId]: event.target.value };
      state.conversionActionErrors = { ...state.conversionActionErrors, [mccId]: '' };
      render();
    } else if (id === 'globalRememberHubToken') {
      state.rememberHubToken = Boolean(event.target.checked);
      syncHubToken();
    } else if (id === 'globalRememberAdminToken') {
      state.rememberAdminToken = Boolean(event.target.checked);
      syncAdminToken();
    } else if (id === 'globalShowAdminToken') {
      state.showAdminToken = Boolean(event.target.checked);
      render();
    } else if (id === 'globalIncludeWww') {
      state.includeWww = Boolean(event.target.checked);
    } else if (id === 'globalTrackPlatform') {
      state.platform = String(event.target.value ?? 'unclassified');
      render();
    } else if (id === 'trackingEmailSmtpSecurity') {
      state.emailConfig.smtpSecurity = String(event.target.value ?? '');
    }
  });
  root.addEventListener('click', event => {
    if (event.target?.matches?.('[data-legacy-cleanup-backdrop]')) {
      cancelLegacyCleanup();
      return;
    }
    if (event.target?.matches?.('[data-global-tag-backdrop]')) {
      handleAction('close-tag');
      return;
    }
    const target = event.target?.closest?.('[data-global-action]');
    if (target) handleAction(target.dataset.globalAction, target);
  });
  if (panelScope === 'settings') {
    globalThis.window?.addEventListener?.(GOOGLE_ADS_ACCOUNTS_DIRECTORY_UPDATED_EVENT, event => {
      if (!root.isConnected || !event.detail?.accounts) return;
      const directory = event.detail;
      state.googleAdsDirectory = directory.accounts;
      state.googleAdsDirectoryUpdatedAtUtc = directory.refreshedAtUtc || directory.savedAtUtc || '';
      state.googleAdsDirectoryPersisted = directory.persisted !== false;
      state.googleAdsDirectoryMessage = '';
      state.googleAdsDirectoryError = false;
      render();
    });
  }
  root.addEventListener('keydown', event => {
    const cleanupOpen = state.legacyCleanup.dialogOpen;
    if (!cleanupOpen && !state.selectedTagHost) return;
    if (event.key === 'Escape') {
      event.preventDefault?.();
      if (cleanupOpen) handleAction('cancel-legacy-observability-cleanup');
      else handleAction('close-tag');
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = cleanupOpen
      ? root.querySelector?.('#legacyObservabilityCleanupDialog')
      : root.querySelector?.('#trackingGlobalTagDialog');
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

  const controller = { render, refreshDomains };
  mountedRoots.set(root, controller);
  render();
  if (panelScope === 'settings') void loadGuruMediaGoogleAdsStatus();
  return controller;
}
