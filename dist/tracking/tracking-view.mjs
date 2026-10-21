import {
  MAX_TRACKING_CSV_BYTES,
  maskTrackingIdentifier,
  parseGoogleAdsCsv,
  trackingIssueLabel,
} from './tracking-domain.mjs?v=3';
import {
  addTrackingDomain,
  downloadClickBankInsV8Csv,
  downloadTrackingCsv,
  fetchClickBankInsV8Report,
  fetchTrackingDomains,
  fetchTrackingReport,
} from './tracking-service.mjs?v=4';
import {
  createTrackingDomainAdminToken,
  normalizeTrackingDomainInput,
  trackingDomainAdminConfigPhp,
  TRACKING_DOMAIN_ADMIN_CONFIG_FILE,
} from './tracking-domain-admin.mjs?v=1';
import {
  clearTrackingHubToken,
  readTrackingHubToken,
  saveTrackingHubToken,
} from './tracking-token-storage.mjs?v=1';

const mountedRoots = new WeakMap();
const PREVIEW_LIMIT = 100;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function fileNameForDownload(value) {
  const name = String(value || '').split(/[\\/]/).pop() || 'clickbank-google-ads.csv';
  return name.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 120) || 'clickbank-google-ads.csv';
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

export function mount({ root }) {
  if (!root) throw new Error('A área da sessão Tracking não foi encontrada.');
  const existing = mountedRoots.get(root);
  if (existing) {
    existing.render();
    return existing;
  }

  const savedToken = readTrackingHubToken();
  const state = {
    fileName: '', importedAt: '', report: null, source: '', apiToken: savedToken.token,
    rememberToken: true,
    tokenStorageStatus: !savedToken.available ? 'unavailable' : savedToken.invalid ? 'invalid' : savedToken.token ? 'saved' : 'empty',
    serverPending: false, feedback: '', feedbackError: false,
    domainAdminToken: '', domainAdminTokenVisible: false, domainName: '', domainIncludeWww: false,
    domainRows: [], domainPending: false, domainAction: '', domainMessage: '', domainError: false,
  };

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

  function statusMarkup() {
    if (state.feedback) return `<p class="tracking-message${state.feedbackError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.feedback)}</p>`;
    if (!state.report) return '<p class="tracking-message" role="status" aria-live="polite">Nenhum CSV carregado. O arquivo fica somente nesta sessão do Hub; nada é gravado na base de campanhas.</p>';
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
        <p>Informe o token separado do postback e escolha <strong>Consultar vendas INS v8</strong>, ou importe um CSV já baixado. A leitura é somente para conferência e preparação; a Flow Tracking continua intacta e o Hub não envia dados ao Google Ads.</p>
      </div>`;
    }
    if (state.source === 'server-ins-v8') return insV8PreviewMarkup(state.report);
    if (state.source === 'server') return serverPreviewMarkup(state.report);
    const { rows, summary } = state.report;
    const visibleRows = rows.slice(0, PREVIEW_LIMIT);
    const names = summary.conversionNames.length ? summary.conversionNames.map(escapeHtml).join(', ') : '—';
    const omitted = rows.length > visibleRows.length
      ? `<p class="tracking-table-note">Mostrando as primeiras ${visibleRows.length} de ${rows.length} linhas, na ordem do arquivo.</p>` : '';
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
      ? `<p class="tracking-table-note">Mostrando as primeiras ${rows.length} de ${report.eligibleCount} conversões elegíveis.</p>` : '';
    return `<div class="tracking-summary" aria-label="Resumo do servidor">
        <article class="tracking-kpi"><span>Postbacks avaliados · 90 dias</span><strong>${report.candidateCount}</strong></article>
        <article class="tracking-kpi"><span>Conversões elegíveis</span><strong>${report.eligibleCount}</strong></article>
        <article class="tracking-kpi"><span>Ignorados pelo exportador</span><strong class="${report.ignoredCount ? 'tracking-warning-value' : ''}">${report.ignoredCount}</strong></article>
        <article class="tracking-kpi"><span>Comissão elegível por moeda</span><strong class="tracking-kpi-amount">${formatCurrencyTotals({ valueByCurrency: report.valueByCurrency })}</strong></article>
      </div>
      <div class="tracking-file-details"><span><strong>Ação:</strong> ${escapeHtml(report.conversionName)}</span><span><strong>Abrangência:</strong> todos os produtos rastreados</span><span><strong>Gerado em UTC:</strong> ${escapeHtml(report.generatedAtUtc)}</span></div>
      ${skipped ? `<p class="tracking-warning-note">Motivos ignorados: ${skipped}.</p>` : ''}
      <p class="tracking-scope-note">A base atual não identifica o produto na tabela de postbacks; por isso esta prévia é agregada. O GCLID completo não é retornado pelo endpoint JSON.</p>
      <div class="tracking-table-heading"><div><h2>Prévia das conversões elegíveis</h2><p>Identificadores mascarados. O download autenticado gera o CSV atual com GCLIDs integrais para o upload manual.</p></div><span class="tracking-count">${report.eligibleCount} conversão(ões)</span></div>
      ${rows.length ? `<div class="tracking-table-wrap"><table class="tracking-table"><thead><tr><th>Data/hora</th><th>Ação de conversão</th><th>Comissão</th><th>Moeda</th><th>GCLID</th><th>Order ID</th><th>Validação</th></tr></thead><tbody>${rows.map(row => `<tr>
        <td>${escapeHtml(row.conversionTime)}</td><td>${escapeHtml(row.conversionName)}</td><td class="tracking-number">${escapeHtml(row.conversionValue)}</td><td>${escapeHtml(row.currency)}</td>
        <td><span title="GCLID mascarado; o CSV autenticado contém o valor integral.">${escapeHtml(row.gclidMasked)}</span></td><td><span title="Order ID mascarado.">${escapeHtml(row.orderIdMasked)}</span></td><td><span class="tracking-row-status">Elegível</span></td>
      </tr>`).join('')}</tbody></table></div>${omitted}` : '<div class="tracking-empty"><p>Nenhuma conversão elegível ainda. GCLIDs fictícios/de teste e postbacks sem clique correspondente são ignorados.</p></div>'}`;
  }

  function insV8PreviewMarkup(report) {
    const skipped = Object.entries(report.skippedByReason)
      .map(([reason, count]) => `${count} ${escapeHtml(trackingIssueLabel(reason))}`).join(' · ');
    const rows = report.preview.slice(0, PREVIEW_LIMIT);
    const omitted = report.candidateCount > rows.length
      ? `<p class="tracking-table-note">Mostrando as ${rows.length} transações mais recentes de ${report.candidateCount} capturadas.</p>` : '';
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
      const commission = row.commissionTotal === null ? '—' : `${escapeHtml(row.currency || '—')} ${escapeHtml(row.commissionTotal.replace('.', ','))}`;
      const gross = row.saleGrossTotal === null ? '—' : `${escapeHtml(row.currency || '—')} ${escapeHtml(row.saleGrossTotal.replace('.', ','))}`;
      return `<tr>
        <td>${escapeHtml(transactionTime)}</td>
        <td>${escapeHtml(row.transactionType)}${row.isTest ? '<small class="tracking-test-tag">TEST IPN</small>' : ''}</td>
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
      <div class="tracking-file-details"><span><strong>Ação:</strong> ${escapeHtml(report.conversionName)}</span><span><strong>Comissão elegível:</strong> ${valueTotals}</span><span><strong>Atualizado UTC:</strong> ${escapeHtml(report.generatedAtUtc)}</span></div>
      ${skipped ? `<p class="tracking-warning-note">Fora do CSV: ${skipped}.</p>` : ''}
      <p class="tracking-scope-note">Cada transação SALE elegível gera uma linha com a comissão total do afiliado. Os itens permanecem detalhados abaixo. Testes, reembolsos, GCLIDs sem atribuição confirmada, recibos repetidos e comissões divergentes não entram no arquivo. A Flow Tracking permanece como remetente atual; este Hub apenas consulta e prepara o CSV.</p>
      <div class="tracking-table-heading"><div><h2>Transações recebidas pela INS v8</h2><p>Recibo e GCLID ficam mascarados nesta tela. A lista também mostra eventos de teste e eventos não exportáveis para diagnóstico.</p></div><span class="tracking-count">${report.candidateCount} transação(ões)</span></div>
      ${body ? `<div class="tracking-table-wrap"><table class="tracking-table tracking-ins-v8-table"><thead><tr><th>Horário UTC</th><th>Evento</th><th>Produtos e comissão por item</th><th>Comissão total</th><th>Total bruto</th><th>Origem GCLID</th><th>Conciliação</th><th>Recibo</th><th>GCLID</th><th>CSV</th></tr></thead><tbody>${body}</tbody></table></div>${omitted}` : '<div class="tracking-empty"><h2>Nenhuma notificação recebida</h2><p>Quando o endpoint v8 receber um evento, ele aparecerá aqui. O Test IPN também pode ser usado para confirmar a captura; eventos de teste nunca entram no CSV.</p></div>'}`;
  }

  function render() {
    const report = state.report;
    const canDownload = ['server', 'server-ins-v8'].includes(state.source) ? Boolean(report?.downloadAvailable) : Boolean(report?.downloadable);
    const downloadTitle = ['server', 'server-ins-v8'].includes(state.source)
      ? 'Solicita ao servidor um CSV atualizado, sem salvar o arquivo no servidor.'
      : 'Baixa o CSV original sem alterar os valores.';
    const tokenStorageWarning = ['unavailable', 'invalid'].includes(state.tokenStorageStatus);
    const domainRows = state.domainRows.length
      ? `<ul class="tracking-domain-list">${state.domainRows.map(row => `<li><code>${escapeHtml(row.hostname)}</code><span>${escapeHtml(row.origin)}</span></li>`).join('')}</ul>`
      : '<p class="tracking-domain-empty">A lista ainda não foi carregada ou não há domínios cadastrados por esta tela. Domínios legados da configuração privada não aparecem aqui.</p>';
    root.innerHTML = `<div class="tracking-session">
      <section class="tracking-panel tracking-intro">
        <div class="tracking-intro-head">
          <div class="tracking-intro-copy"><h2>Conversões ClickBank → Google Ads</h2><p>Consulte vendas INS v8 capturadas em paralelo à Flow Tracking, ou confira um CSV já baixado antes do upload manual na MCC.</p></div>
          <div class="tracking-connection-actions">
            <button type="button" class="btn primary" data-tracking-action="refresh-ins-v8"${state.serverPending ? ' disabled' : ''}>${state.serverPending ? 'Consultando INS v8…' : 'Consultar vendas INS v8'}</button>
            <button type="button" class="btn" data-tracking-action="refresh-server"${state.serverPending ? ' disabled' : ''}>${state.serverPending ? 'Atualizando…' : 'Atualizar do servidor · postbacks antigos'}</button>
            <button type="button" class="btn" data-tracking-action="disconnect"${state.apiToken ? '' : ' disabled'}>Desconectar</button>
          </div>
        </div>
        <div class="tracking-connection">
          <div class="tracking-token-entry">
            <label class="tracking-token-field" for="trackingApiToken"><span>Token de acesso do Hub</span><input id="trackingApiToken" type="password" autocomplete="new-password" spellcheck="false" inputmode="text" aria-describedby="trackingTokenNote trackingTokenStorageStatus" placeholder="64 caracteres hexadecimais"></label>
            <label class="tracking-remember-token"><input id="trackingRememberToken" type="checkbox"${state.rememberToken ? ' checked' : ''}><span>Lembrar token neste navegador</span></label>
          </div>
          <p id="trackingTokenNote" class="tracking-connection-note">No servidor: <code>~/tracking-config.php</code> (na raiz da conta, fora de <code>public_html</code>), campo <code>tracking_hub_api_token</code>. É diferente do token de postback do ClickBank. Quando marcado, fica no armazenamento local deste perfil do navegador, sem criptografia; não entra na IndexedDB nem no backup JSON do Hub. A requisição usa HTTPS e envia o token somente no cabeçalho Authorization. Origem autorizada: <code>http://127.0.0.1:8765</code>.</p>
          <p id="trackingTokenStorageStatus" class="tracking-token-storage-status${tokenStorageWarning ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(tokenStorageMessage())}</p>
        </div>
        <div class="tracking-actions">
          <label class="btn tracking-file-button" for="trackingCsvFile"><input id="trackingCsvFile" class="tracking-file-input" type="file" accept=".csv,text/csv"><span>Importar CSV já baixado</span></label>
          <button type="button" class="btn primary" data-tracking-action="download"${canDownload && !state.serverPending ? '' : ' disabled'} title="${downloadTitle}">Baixar CSV para Google Ads</button>
          <button type="button" class="btn" data-tracking-action="clear"${report ? '' : ' disabled'}>Limpar leitura</button>
        </div>
        ${statusMarkup()}
        <p class="tracking-scope-note">O Hub não grava a base operacional nem envia conversões ao Google Ads. A Flow Tracking continua intacta; o CSV INS v8 é somente preparado e baixado manualmente. Não reenvie linhas já aceitas.</p>
      </section>
      <section class="tracking-panel tracking-domain-panel" aria-label="Domínios autorizados de pre-sell">
        <div class="tracking-table-heading tracking-domain-heading"><div><h2>Domínios de pre-sell</h2><p>Autorize um hostname para o coletor atual sem alterar manualmente a allowlist antiga. Cada domínio fica explícito; curingas não são aceitos.</p></div><span class="tracking-count">${state.domainRows.length} domínio(s) na tabela</span></div>
        <div class="tracking-domain-token-grid">
          <label class="tracking-token-field" for="trackingDomainAdminToken"><span>Token administrativo de domínios · separado do token de vendas</span><input id="trackingDomainAdminToken" type="${state.domainAdminTokenVisible ? 'text' : 'password'}" autocomplete="off" spellcheck="false" inputmode="text" placeholder="64 caracteres hexadecimais"></label>
          <div class="tracking-domain-token-actions">
            <button type="button" class="btn" data-tracking-action="generate-domain-token"${state.domainPending ? ' disabled' : ''}>Gerar token seguro</button>
            <button type="button" class="btn" data-tracking-action="download-domain-config"${state.domainPending ? ' disabled' : ''}>Baixar configuração privada</button>
            <button type="button" class="btn" data-tracking-action="clear-domain-token"${state.domainAdminToken ? '' : ' disabled'}>Esquecer token</button>
          </div>
          <label class="tracking-remember-token"><input id="trackingDomainAdminTokenVisible" type="checkbox"${state.domainAdminTokenVisible ? ' checked' : ''}><span>Mostrar token nesta tela</span></label>
          <p class="tracking-connection-note">O token fica somente nesta aba e é enviado no cabeçalho Authorization por HTTPS. Para configurar o servidor uma vez, gere o token, baixe o PHP e envie <code>${TRACKING_DOMAIN_ADMIN_CONFIG_FILE}</code> para a mesma pasta privada do <code>tracking-config.php</code>, fora de <code>public_html</code>. Não coloque esse arquivo na pasta pública nem o compartilhe.</p>
        </div>
        <div class="tracking-domain-form">
          <label class="tracking-token-field" for="trackingDomainName"><span>Domínio HTTPS da pre-sell</span><input id="trackingDomainName" type="text" autocomplete="url" spellcheck="false" placeholder="exemplo.com ou https://exemplo.com/"></label>
          <label class="tracking-remember-token"><input id="trackingDomainIncludeWww" type="checkbox"${state.domainIncludeWww ? ' checked' : ''}><span>Autorizar também a variante www</span></label>
          <div class="tracking-domain-actions">
            <button type="button" class="btn" data-tracking-action="load-domains"${state.domainPending ? ' disabled' : ''}>${state.domainPending && state.domainAction === 'load' ? 'Consultando…' : 'Atualizar lista'}</button>
            <button type="button" class="btn primary" data-tracking-action="add-domain"${state.domainPending ? ' disabled' : ''}>${state.domainPending && state.domainAction === 'add' ? 'Autorizando…' : 'Autorizar domínio'}</button>
          </div>
        </div>
        <p class="tracking-domain-message${state.domainError ? ' is-error' : ''}" role="status" aria-live="polite">${escapeHtml(state.domainMessage || 'A API administrativa precisa estar instalada e configurada no servidor antes de cadastrar domínios.')}</p>
        ${domainRows}
      </section>
      <section class="tracking-panel tracking-results" aria-label="Dados do CSV">${previewMarkup()}</section>
    </div>`;
    const tokenField = root.querySelector?.('#trackingApiToken');
    if (tokenField) tokenField.value = state.apiToken;
    const rememberField = root.querySelector?.('#trackingRememberToken');
    if (rememberField) rememberField.checked = state.rememberToken;
    const domainTokenField = root.querySelector?.('#trackingDomainAdminToken');
    if (domainTokenField) domainTokenField.value = state.domainAdminToken;
    const domainNameField = root.querySelector?.('#trackingDomainName');
    if (domainNameField) domainNameField.value = state.domainName;
    const domainIncludeWwwField = root.querySelector?.('#trackingDomainIncludeWww');
    if (domainIncludeWwwField) domainIncludeWwwField.checked = state.domainIncludeWww;
    const domainTokenVisibleField = root.querySelector?.('#trackingDomainAdminTokenVisible');
    if (domainTokenVisibleField) domainTokenVisibleField.checked = state.domainAdminTokenVisible;
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
      state.feedback = 'Informe o token de acesso separado do postback ClickBank.';
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
      state.feedback = 'Informe o token de acesso separado do postback ClickBank.';
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

  async function downloadFromServer() {
    if (!state.report?.downloadAvailable || !['server', 'server-ins-v8'].includes(state.source) || state.serverPending) return;
    const isInsV8 = state.source === 'server-ins-v8';
    state.serverPending = true;
    state.feedback = isInsV8 ? 'Preparando o CSV com as vendas INS v8 elegíveis…' : 'Solicitando o CSV atualizado ao servidor…';
    state.feedbackError = false;
    render();
    try {
      const blob = isInsV8
        ? await downloadClickBankInsV8Csv(state.apiToken)
        : await downloadTrackingCsv(state.apiToken);
      triggerBlobDownload(blob, isInsV8 ? 'clickbank-ins-v8-google-ads.csv' : 'clickbank-google-ads.csv');
      state.feedback = 'Download iniciado. Revise o arquivo. Ele não foi enviado ao Google Ads; faça upload manual somente quando decidir interromper a Flow Tracking.';
      state.feedbackError = false;
    } catch (error) {
      state.feedback = error instanceof Error ? error.message : 'Não foi possível baixar o CSV do servidor.';
      state.feedbackError = true;
    } finally {
      state.serverPending = false;
      render();
    }
  }

  function setDomainMessage(message, isError = false) {
    state.domainMessage = message;
    state.domainError = isError;
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
      setDomainMessage('Token seguro gerado nesta aba. Baixe a configuração privada e envie-a ao servidor antes de usar o cadastro. Guarde o token para digitá-lo novamente se recarregar a tela.');
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : 'Não foi possível gerar o token.', true);
    }
    render();
  }

  async function loadDomainList() {
    if (!state.domainAdminToken) {
      setDomainMessage('Informe o token administrativo separado do token de acesso às vendas.', true);
      render();
      return;
    }
    state.domainPending = true;
    state.domainAction = 'load';
    setDomainMessage('Consultando a lista autenticada de domínios…');
    render();
    try {
      state.domainRows = await fetchTrackingDomains(state.domainAdminToken);
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
      setDomainMessage('Informe o token administrativo separado do token de acesso às vendas.', true);
      render();
      return;
    }
    let hostname;
    try {
      hostname = normalizeTrackingDomainInput(state.domainName);
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : 'Informe um domínio HTTPS válido.', true);
      render();
      return;
    }
    state.domainPending = true;
    state.domainAction = 'add';
    setDomainMessage('Enviando autorização aditiva ao servidor…');
    render();
    try {
      const result = await addTrackingDomain(state.domainAdminToken, hostname, { includeWww: state.domainIncludeWww });
      const affectedHosts = [...result.added, ...result.alreadyAllowed];
      const existingHosts = new Set(state.domainRows.map(row => row.hostname));
      state.domainRows = [...state.domainRows, ...affectedHosts
        .filter(host => !existingHosts.has(host))
        .map(host => ({ hostname: host, origin: `https://${host}`, createdAtUtc: '' }))]
        .sort((left, right) => left.hostname.localeCompare(right.hostname));
      const parts = [];
      if (result.added.length) parts.push(`Liberado: ${result.added.join(', ')}.`);
      if (result.alreadyAllowed.length) parts.push(`Já estava liberado: ${result.alreadyAllowed.join(', ')}.`);
      setDomainMessage(parts.join(' ') || 'A API não retornou domínios liberados.', !parts.length);
      state.domainName = '';
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : 'Não foi possível autorizar o domínio.', true);
    } finally {
      state.domainPending = false;
      state.domainAction = '';
      render();
    }
  }

  async function handleAction(action) {
    if (action === 'download') {
      if (['server', 'server-ins-v8'].includes(state.source)) return downloadFromServer();
      return downloadOriginal();
    }
    if (action === 'refresh-server') return refreshFromServer();
    if (action === 'refresh-ins-v8') return refreshInsV8FromServer();
    if (action === 'generate-domain-token') return generateDomainAdminToken();
    if (action === 'download-domain-config') return downloadDomainAdminConfig();
    if (action === 'clear-domain-token') {
      state.domainAdminToken = '';
      state.domainAdminTokenVisible = false;
      setDomainMessage('Token administrativo removido somente desta aba.');
      render();
      return;
    }
    if (action === 'load-domains') return loadDomainList();
    if (action === 'add-domain') return saveDomain();
    if (action === 'disconnect') {
      const removal = clearTrackingHubToken();
      state.apiToken = '';
      state.rememberToken = false;
      state.tokenStorageStatus = removal.removed ? 'empty' : 'unavailable';
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
      state.apiToken = String(event.target.value ?? '').trim();
      syncTokenStorage();
    }
    if (event.target?.id === 'trackingDomainAdminToken') state.domainAdminToken = String(event.target.value ?? '').trim();
    if (event.target?.id === 'trackingDomainName') state.domainName = String(event.target.value ?? '');
  });
  root.addEventListener('change', event => {
    if (event.target?.id === 'trackingCsvFile') return importFile(event.target.files?.[0]);
    if (event.target?.id === 'trackingRememberToken') {
      state.rememberToken = Boolean(event.target.checked);
      syncTokenStorage();
      render();
    }
    if (event.target?.id === 'trackingDomainIncludeWww') state.domainIncludeWww = Boolean(event.target.checked);
    if (event.target?.id === 'trackingDomainAdminTokenVisible') {
      state.domainAdminTokenVisible = Boolean(event.target.checked);
      render();
    }
  });
  root.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-tracking-action]')?.dataset?.trackingAction;
    if (action) return handleAction(action);
  });

  const controller = Object.freeze({ render });
  mountedRoots.set(root, controller);
  render();
  return controller;
}
