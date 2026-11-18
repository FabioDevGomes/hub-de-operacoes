import { listGoogleAdsGeographicReports } from './google-ads-geographic-storage.mjs?v=1';
import { readGoogleAdsGeographicAutoUpdateStatus } from './google-ads-geographic-auto-update.mjs?v=1';
import { googleAdsGeographicReportDateRange } from './google-ads-geographic-domain.mjs?v=1';
import { buildGoogleAdsCampaignGeoTargetingIndex, googleAdsGeographicCountryTargetStatus } from './google-ads-campaign-geo-targeting.mjs?v=1';
import { GOOGLE_ADS_CAMPAIGN_BATCHES_STORAGE_KEY } from './google-ads-campaign-batches-storage.mjs?v=12';

const PAGE_SIZE = 100;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function timestamp(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
    : '—';
}

function dateLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function money(micros, currencyCode, maximumFractionDigits = 2) {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode || 'USD', maximumFractionDigits }).format(Number(micros) / 1_000_000); }
  catch { return `${(Number(micros) / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits })} ${currencyCode || ''}`.trim(); }
}

function averageCostPerClick(costMicros, clicks, currencyCode) {
  const cost = Number(costMicros);
  const count = Number(clicks);
  if (costMicros == null || costMicros === '' || clicks == null || clicks === ''
      || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(count) || count <= 0) return '—';
  return money(cost / count, currencyCode, 4);
}

function countryLabel(row) {
  try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(row.countryCode) || row.countryName; }
  catch { return row.countryName; }
}

function statusMessage(status, sourceMode, automaticEnabled) {
  if (sourceMode !== 'api') return 'O relatório automático fica pausado enquanto este perfil usa o manifesto MCC como fonte operacional.';
  if (!automaticEnabled) return 'A consulta geográfica acompanha a Atualização automática deste perfil e está pausada com ela.';
  if (status?.state === 'running') return `Consulta em andamento · iniciada em ${timestamp(status.lastStartedAtUtc)} (São Paulo).`;
  if (status?.lastCompletedAtUtc) {
    const outcome = status.lastOutcome === 'partial'
      ? ` · ${status.failedAccounts || 0} conta(s) com falha`
      : status.lastOutcome === 'failed' ? ' · consulta com falhas' : '';
    return `Última consulta: ${timestamp(status.lastCompletedAtUtc)} (São Paulo) · ${status.succeededAccounts || 0}/${status.accountCount || 0} conta(s) concluída(s)${outcome}. Próxima tentativa diária após 20h, enquanto o Hub estiver aberto.`;
  }
  if (status?.phase) return `${status.phase} A rotina consulta após 20h (São Paulo), enquanto o Hub estiver aberto.`;
  return 'A consulta roda diariamente após 20h (São Paulo), enquanto o Hub estiver aberto.';
}

export function mountGoogleAdsGeographicReportsView({ root, getSourceMode = () => 'api', getAutomaticEnabled = () => true, getCampaignBatchSnapshot = () => ({ batches: [] }) } = {}) {
  if (!root) return { refresh: async () => {} };
  root.innerHTML = `
    <section class="google-ads-geographic-reports" aria-labelledby="googleAdsGeographicTitle">
      <header class="google-ads-geographic-heading">
        <div><h3 id="googleAdsGeographicTitle">Localização dos cliques</h3>
          <p id="googleAdsGeographicStatus" role="status" aria-live="polite">Carregando relatórios locais…</p></div>
      </header>
      <p class="google-ads-geographic-note">Relatório agregado por campanha, país e dia (localização física estimada pelo Google; não identifica o país de cada clique individual). A coluna GEO compara o país observado com a lista salva no lote do Hub; ela não confirma a configuração atual no Google Ads. “Sem GEO salvo” significa que o lote não tem esse registro. A consulta reprocessa os últimos 14 dias fechados para incorporar atrasos. “Sem linhas” não significa zero; se uma consulta vier vazia ou falhar, o último resultado com dados é preservado.</p>
      <div id="googleAdsGeographicOutcome" class="google-ads-geographic-outcome"></div>
      <div class="google-ads-geographic-table-wrap">
        <table class="google-ads-geographic-table"><thead><tr><th>Data</th><th>Conta</th><th>Campanha</th><th>País</th><th>GEO salvo no lote</th><th>Cliques</th><th>Impressões</th><th>Custo</th><th>Custo médio por clique</th></tr></thead><tbody id="googleAdsGeographicRows"><tr><td colspan="9">Carregando…</td></tr></tbody></table>
      </div>
      <div class="google-ads-geographic-footer"><span id="googleAdsGeographicCount"></span><button id="googleAdsGeographicMore" class="btn" type="button" hidden>Carregar mais</button></div>
    </section>`;
  const statusArea = root.querySelector('#googleAdsGeographicStatus');
  const outcomeArea = root.querySelector('#googleAdsGeographicOutcome');
  const rowsArea = root.querySelector('#googleAdsGeographicRows');
  const countArea = root.querySelector('#googleAdsGeographicCount');
  const moreButton = root.querySelector('#googleAdsGeographicMore');
  let rows = [];
  let records = [];
  let visibleCount = PAGE_SIZE;
  let errorMessage = '';
  let campaignGeoIndex = new Map();

  function refreshCampaignGeoIndex() {
    try { campaignGeoIndex = buildGoogleAdsCampaignGeoTargetingIndex(getCampaignBatchSnapshot()?.batches); }
    catch { campaignGeoIndex = new Map(); }
  }

  function render() {
    const status = readGoogleAdsGeographicAutoUpdateStatus();
    statusArea.textContent = statusMessage(status, getSourceMode(), getAutomaticEnabled());
    const recentAttempts = records.filter(record => Date.now() - Date.parse(record.lastAttemptAtUtc || '') <= 48 * 60 * 60 * 1000);
    const failures = recentAttempts.filter(record => record.lastAttemptStatus === 'failed').length;
    const empty = recentAttempts.filter(record => record.lastAttemptStatus === 'complete_no_rows' && !(record.rows || []).length).length;
    outcomeArea.innerHTML = errorMessage
      ? `<p class="google-ads-geographic-warning">${escapeHtml(errorMessage)}</p>`
      : [failures ? `<p class="google-ads-geographic-warning">${failures} combinação(ões) de conta/data tiveram falha na última tentativa; os dados anteriores foram mantidos.</p>` : '',
        empty ? `<p class="google-ads-geographic-muted">${empty} combinação(ões) de conta/data tiveram resposta completa sem linhas de localização. Isso não confirma zero cliques.</p>` : ''].filter(Boolean).join('');
    const shown = rows.slice(0, visibleCount);
    rowsArea.innerHTML = shown.length ? shown.map(row => {
      const targetStatus = googleAdsGeographicCountryTargetStatus(campaignGeoIndex, row);
      return `<tr>
      <td>${escapeHtml(dateLabel(row.date))}</td>
      <td>${escapeHtml(row.managerName ? `${row.managerName} · ` : '')}${escapeHtml(row.accountName || 'Conta')} <span class="google-ads-geographic-account-suffix">••••${escapeHtml(String(row.customerId).slice(-4))}</span></td>
      <td>${escapeHtml(row.campaignName)}</td><td>${escapeHtml(countryLabel(row))}</td>
      <td><span class="google-ads-geographic-target is-${escapeHtml(targetStatus.state)}" title="${escapeHtml(targetStatus.title)}">${escapeHtml(targetStatus.label)}</span></td>
      <td>${Number(row.clicks).toLocaleString('pt-BR')}</td><td>${Number(row.impressions).toLocaleString('pt-BR')}</td>
      <td>${escapeHtml(money(row.costMicros, row.currencyCode))}</td>
      <td>${escapeHtml(averageCostPerClick(row.costMicros, row.clicks, row.currencyCode))}</td></tr>`;
    }).join('')
      : `<tr><td colspan="9">${errorMessage ? 'Os relatórios salvos não puderam ser lidos.' : 'Nenhum resultado geográfico com cliques no período carregado. Isso não confirma zero.'}</td></tr>`;
    countArea.textContent = rows.length ? `Exibindo ${Math.min(visibleCount, rows.length)} de ${rows.length} linha(s) · últimos 20 dias` : '';
    moreButton.hidden = visibleCount >= rows.length;
  }

  async function refresh() {
    refreshCampaignGeoIndex();
    try {
      const range = googleAdsGeographicReportDateRange(new Date(), 'America/Sao_Paulo', 20);
      records = await listGoogleAdsGeographicReports({ dateFrom: range.dateFrom, dateTo: range.dateTo });
      rows = records.flatMap(record => (record.rows || []).map(row => ({ ...row, ...record })))
        .sort((left, right) => right.date.localeCompare(left.date) || right.clicks - left.clicks || left.campaignName.localeCompare(right.campaignName, 'pt-BR'));
      errorMessage = '';
    } catch {
      records = [];
      rows = [];
      errorMessage = 'Não foi possível ler o armazenamento local de localizações. Os dados da base operacional não foram alterados.';
    }
    render();
  }

  moreButton.addEventListener('click', () => { visibleCount += PAGE_SIZE; render(); });
  const onUpdated = () => { void refresh(); };
  document.addEventListener('google-ads-geographic-reports-updated', onUpdated);
  document.addEventListener('google-ads-geographic-auto-update-status', onUpdated);
  document.addEventListener('google-ads-auto-update-status', onUpdated);
  document.addEventListener('google-ads-source-mode-changed', onUpdated);
  const onStorage = event => { if (event.key === GOOGLE_ADS_CAMPAIGN_BATCHES_STORAGE_KEY) void refresh(); };
  globalThis.addEventListener?.('storage', onStorage);
  void refresh();
  return { refresh, destroy: () => {
    document.removeEventListener('google-ads-geographic-reports-updated', onUpdated);
    document.removeEventListener('google-ads-geographic-auto-update-status', onUpdated);
    document.removeEventListener('google-ads-auto-update-status', onUpdated);
    document.removeEventListener('google-ads-source-mode-changed', onUpdated);
    globalThis.removeEventListener?.('storage', onStorage);
  } };
}
