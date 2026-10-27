import {
  normalizeTrackingEmailConfig,
  trackingEmailConfigPhp,
  TRACKING_EMAIL_CONFIG_FILE,
} from './tracking-email-config.mjs?v=2';

const mountedRoots = new WeakMap();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const emptyConfig = () => ({
  toEmail: '',
  fromEmail: '',
  smtpHost: '',
  smtpPort: '465',
  smtpSecurity: 'ssl',
  smtpUsername: '',
  smtpPassword: '',
});

function downloadPrivateConfig(config) {
  const blobUrl = URL.createObjectURL(new Blob([trackingEmailConfigPhp(config)], { type: 'application/x-php;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = TRACKING_EMAIL_CONFIG_FILE;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}

export function mount({ root }) {
  if (!root) throw new Error('A área de configuração de e-mail não foi encontrada.');
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.render();
    return existing;
  }

  const state = {
    config: emptyConfig(),
    message: 'Preencha a caixa remetente e os dados do SMTP para gerar o arquivo privado compartilhado.',
    error: false,
  };

  function render() {
    if (!root.isConnected) return;
    root.innerHTML = `<div class="tracking-session tracking-email-settings-session">
      <section class="tracking-panel tracking-email-panel" aria-label="Configuração global de e-mail">
        <div class="tracking-intro-head tracking-clicks-head">
          <div class="tracking-intro-copy"><h2>Configuração global de e-mail</h2><p>Uma caixa e um destinatário para os avisos de venda do Hub, incluindo ClickBank e GuruMedia.</p></div>
        </div>
        <p class="tracking-connection-note">O SMTP e o destinatário são compartilhados por todas as Tracks. Novas vendas GuruMedia associadas a uma Track geram um aviso pelo worker de e-mail já agendado; esta tela não cria outro Cron.</p>
        <div class="tracking-email-config-body">
          <div class="tracking-email-grid">
            <label class="tracking-token-field" for="trackingEmailRecipient"><span>Destinatário</span><input id="trackingEmailRecipient" type="email" maxlength="254" autocomplete="email" placeholder="e-mail para receber os avisos" value="${escapeHtml(state.config.toEmail)}"></label>
            <label class="tracking-token-field" for="trackingEmailSender"><span>Remetente</span><input id="trackingEmailSender" type="email" maxlength="254" autocomplete="email" placeholder="ex.: alertas@seu-dominio.com" value="${escapeHtml(state.config.fromEmail)}"></label>
            <label class="tracking-token-field" for="trackingEmailSmtpHost"><span>Servidor SMTP</span><input id="trackingEmailSmtpHost" type="text" maxlength="253" autocomplete="off" placeholder="ex.: smtp.hostinger.com" value="${escapeHtml(state.config.smtpHost)}"></label>
            <label class="tracking-token-field" for="trackingEmailSmtpPort"><span>Porta</span><input id="trackingEmailSmtpPort" type="text" inputmode="numeric" maxlength="5" autocomplete="off" value="${escapeHtml(state.config.smtpPort)}"></label>
            <label class="tracking-token-field" for="trackingEmailSmtpSecurity"><span>Segurança</span><select id="trackingEmailSmtpSecurity"><option value="ssl"${state.config.smtpSecurity === 'ssl' ? ' selected' : ''}>SSL/TLS</option><option value="starttls"${state.config.smtpSecurity === 'starttls' ? ' selected' : ''}>STARTTLS</option></select></label>
            <label class="tracking-token-field" for="trackingEmailSmtpUsername"><span>Usuário SMTP</span><input id="trackingEmailSmtpUsername" type="text" maxlength="320" autocomplete="off" placeholder="normalmente o e-mail remetente" value="${escapeHtml(state.config.smtpUsername)}"></label>
            <label class="tracking-token-field" for="trackingEmailSmtpPassword"><span>Senha SMTP</span><input id="trackingEmailSmtpPassword" type="password" maxlength="1024" autocomplete="new-password" spellcheck="false" placeholder="não será salva no navegador"></label>
            <div class="tracking-domain-actions">
              <button type="button" class="btn primary" data-email-action="download">Baixar configuração privada</button>
              <button type="button" class="btn" data-email-action="clear">Limpar campos</button>
            </div>
          </div>
          <p class="tracking-conversion-profile-message${state.error ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.message)}</p>
          <p class="tracking-connection-note">Os campos ficam somente na memória desta aba. O arquivo <code>${TRACKING_EMAIL_CONFIG_FILE}</code> contém a senha SMTP: mantenha-o em <code>private-tools</code>, fora de <code>public_html</code>, do Git e de backups compartilhados. Após baixá-lo, a senha é removida dos campos.</p>
          <p class="tracking-connection-note">O token de leitura do Hub continua compartilhado com Tracking ClickBank. O segredo do postback GuruMedia fica no <code>tracking-config.php</code> privado e na URL do postback; não deve ser inserido nesta tela.</p>
        </div>
      </section>
    </div>`;
  }

  root.addEventListener('input', event => {
    const fields = {
      trackingEmailRecipient: 'toEmail',
      trackingEmailSender: 'fromEmail',
      trackingEmailSmtpHost: 'smtpHost',
      trackingEmailSmtpPort: 'smtpPort',
      trackingEmailSmtpUsername: 'smtpUsername',
      trackingEmailSmtpPassword: 'smtpPassword',
    };
    const key = fields[event.target?.id];
    if (key) state.config[key] = String(event.target.value ?? '');
  });
  root.addEventListener('change', event => {
    if (event.target?.id === 'trackingEmailSmtpSecurity') {
      state.config.smtpSecurity = String(event.target.value ?? '');
    }
  });

  root.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-email-action]')?.dataset?.emailAction;
    if (action === 'download') {
      try {
        normalizeTrackingEmailConfig(state.config);
        downloadPrivateConfig(state.config);
        state.config.smtpPassword = '';
        state.message = `${TRACKING_EMAIL_CONFIG_FILE} baixado. Envie-o à pasta privada do servidor para a mesma configuração de e-mail atender ClickBank e GuruMedia.`;
        state.error = false;
      } catch (error) {
        state.message = error instanceof Error ? error.message : 'Não foi possível validar a configuração de e-mail.';
        state.error = true;
      }
      render();
    } else if (action === 'clear') {
      state.config = emptyConfig();
      state.message = 'Campos limpos desta aba; nenhum valor foi salvo pelo Hub.';
      state.error = false;
      render();
    }
  });

  const controller = { render };
  mountedRoots.set(root, controller);
  render();
  return controller;
}
