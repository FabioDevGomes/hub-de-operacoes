import {
  buildTrackingPresellScriptTag,
  createTrackingDomainAdminToken,
  normalizeTrackingDomainInput,
  normalizeTrackingProductKey,
  normalizeTrackingProductLabel,
  trackingDomainAdminConfigPhp,
  TRACKING_DOMAIN_ADMIN_CONFIG_FILE,
} from './tracking-domain-admin.mjs?v=11';
import { addTrackingDomain, fetchTrackingDomains } from './tracking-service.mjs?v=19';
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

export function mount({ root, scope = 'all', clipboard = globalThis.navigator?.clipboard, onBaseUpdated = async () => {}, invalidateBaseCache = () => {} }) {
  if (!root) throw new Error('A área de Tracking solicitada não foi encontrada.');
  const panelScope = scope === 'tracker' || scope === 'settings' ? scope : 'all';
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.render();
    return existing;
  }
  const savedHubToken = readTrackingHubToken();
  const savedAdminToken = readTrackingDomainAdminToken();
  const cachedDomains = initialDomainRows();
  const state = {
    hubToken: savedHubToken.token,
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
      <section class="tracking-panel tracking-intro"><div class="tracking-intro-head"><div class="tracking-intro-copy"><h2>${panelScope === 'tracker' ? 'Tracker Global' : panelScope === 'settings' ? 'Configurações globais do Hub' : 'Configurações globais do Tracking'}</h2><p>${panelScope === 'tracker' ? 'Cadastre e gerencie os domínios e Tracks permitidos pelas integrações de Tracking.' : panelScope === 'settings' ? 'Acesso compartilhado e notificações por e-mail para as integrações do Hub.' : 'Acesso compartilhado, cadastro de Tracks e notificações por e-mail para ClickBank, GuruMedia e as demais integrações do Hub.'}</p></div></div></section>

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
    if (action === 'inspect-legacy-observability') {
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
    if (id === 'globalRememberHubToken') {
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
  return controller;
}
