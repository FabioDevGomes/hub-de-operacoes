import { summarizeGoogleAdsQuotaTelemetry } from './google-ads-quota-observability-domain.mjs?v=6';
import {
  GOOGLE_ADS_QUOTA_TELEMETRY_STORAGE_KEY,
  GOOGLE_ADS_QUOTA_TELEMETRY_UPDATED_EVENT,
  readGoogleAdsQuotaReference,
  readGoogleAdsQuotaTelemetry,
  writeGoogleAdsQuotaReference,
} from './google-ads-quota-observability-storage.mjs?v=5';

const REFERENCE_LIMITS = Object.freeze({ explorer: 2880, basic: 15000, standard: null });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const integer = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value) || 0);

function dateTimeLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function estimateLabel(row) {
  if (!row.attempts) return '—';
  if (row.estimatedMin == null) return 'Variável';
  if (row.estimatedMax == null) return row.estimatedMin ? `≥ ${integer(row.estimatedMin)}` : 'Variável';
  if (row.estimatedMin === row.estimatedMax) return integer(row.estimatedMin);
  return `${integer(row.estimatedMin)}–${integer(row.estimatedMax)}`;
}

function summaryEstimateLabel(summary) {
  if (!summary.totalAttempts) return 'Nenhuma chamada registrada';
  const known = summary.estimatedMin == null ? null : integer(summary.estimatedMin);
  const variable = summary.unknownCostCalls > 0;
  if (summary.estimatedMax == null) return known && Number(summary.estimatedMin) > 0
    ? `≥ ${known} · ${integer(summary.unknownCostCalls)} variável(is)`
    : `${integer(summary.unknownCostCalls)} custo(s) variável(is)`;
  if (summary.estimatedMin === summary.estimatedMax) return `${known} operação(ões)`;
  return `${known}–${integer(summary.estimatedMax)}${variable ? ` + ${integer(summary.unknownCostCalls)} variável(is)` : ''} operação(ões)`;
}

function usageLabel(summary, period, referenceId) {
  if (period === 'total') return 'Acumulado desde o início do registro';
  const limit = REFERENCE_LIMITS[referenceId];
  if (!limit) return 'Sem limite diário de operações no nível Standard';
  if (!summary.totalAttempts) return `0% da referência de ${integer(limit)}/24h`;
  if (summary.estimatedMax == null) {
    if (!(summary.estimatedMin > 0)) return 'Indeterminada: há operações variáveis';
    return `≥ ${((summary.estimatedMin / limit) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da referência`;
  }
  const low = (summary.estimatedMin / limit) * 100;
  const high = (summary.estimatedMax / limit) * 100;
  const percentage = low === high
    ? `${low.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
    : `${low.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}–${high.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  return `${percentage} da referência de ${integer(limit)}/24h`;
}

function statusLabel(row) {
  if (!row.attempts) return 'Sem execuções';
  const parts = [`${integer(row.successes)} ok`, `${integer(row.failures)} falha(s)`];
  if (row.cancellations) parts.push(`${integer(row.cancellations)} cancelada(s)`);
  const averageMs = row.durationTotalMs / row.attempts;
  if (averageMs > 0) parts.push(`média ${averageMs < 1000 ? `${Math.round(averageMs)} ms` : `${(averageMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`}`);
  return parts.join(' · ');
}

export function mountGoogleAdsQuotaObservability({ root } = {}) {
  if (!root) return null;
  let period = '24h';
  let referenceId = readGoogleAdsQuotaReference();

  root.innerHTML = `<section class="google-ads-quota-panel" aria-labelledby="googleAdsQuotaTitle">
    <div class="google-ads-quota-heading">
      <div><h3 id="googleAdsQuotaTitle">Observabilidade de cotas</h3><p>Chamadas HTTP Google Ads e operações de cota estimadas pelos serviços privados.</p></div>
      <div class="google-ads-quota-controls" role="group" aria-label="Período do monitoramento">
        <button class="btn is-active" type="button" data-google-ads-quota-period="24h" aria-pressed="true">Últimas 24h</button>
        <button class="btn" type="button" data-google-ads-quota-period="total" aria-pressed="false">Total</button>
      </div>
    </div>
    <div class="google-ads-quota-summary" aria-live="polite"></div>
    <div class="google-ads-quota-table-wrap"></div>
    <p class="google-ads-quota-note">Com cabeçalhos v2, os serviços separam chamadas HTTP e unidades de cota: cada Search/SearchStream conta como uma operação e cada item de mutação conta individualmente. Respostas do Google entram como estimativa; falhas de transporte sem resposta ficam indeterminadas. Sem cabeçalho v2, a tela usa a estimativa do código. O histórico anterior foi preservado em uma chave local separada e não entra nesta medição. Estes dados não substituem a métrica global do projeto no Google Cloud; “Últimas 24h” é uma janela móvel.</p>
  </section>`;

  const summaryRoot = root.querySelector('.google-ads-quota-summary');
  const tableRoot = root.querySelector('.google-ads-quota-table-wrap');

  function render() {
    const telemetry = readGoogleAdsQuotaTelemetry();
    const summary = summarizeGoogleAdsQuotaTelemetry(telemetry, period);
    const referenceLimit = REFERENCE_LIMITS[referenceId];
    const referenceText = referenceId === 'standard'
      ? 'Standard · sem limite diário de operações'
      : `${referenceId === 'explorer' ? 'Explorer' : 'Basic'} · ${integer(referenceLimit)} operações/24h`;
    const googleAdsRequests = summary.googleAdsRequestsResponded + summary.googleAdsRequestsUnknown;
    summaryRoot.innerHTML = `<div class="google-ads-quota-stat"><span>POSTs registrados pelo Hub</span><strong>${integer(summary.totalAttempts)}</strong><small>${integer(summary.successes)} concluída(s) · ${integer(summary.failures)} falha(s)${summary.cancellations ? ` · ${integer(summary.cancellations)} cancelada(s)` : ''}</small></div><div class="google-ads-quota-stat"><span>Operações de cota estimadas</span><strong>${escapeHtml(summaryEstimateLabel(summary))}</strong><small>${period === '24h' ? escapeHtml(usageLabel(summary, period, referenceId)) : 'Acumulado desde o início da telemetria v2'}</small></div><div class="google-ads-quota-stat"><span>Chamadas HTTP Ads nos endpoints v2</span><strong>${integer(googleAdsRequests)}</strong><small>${integer(summary.googleAdsRequestsResponded)} com resposta${summary.googleAdsRequestsUnknown ? ` · ${integer(summary.googleAdsRequestsUnknown)} sem resposta` : ''} · ${integer(summary.serverTrackedAttempts)} resposta(s) instrumentada(s)</small></div><label class="google-ads-quota-reference">Referência de comparação<select class="input" data-google-ads-quota-reference aria-label="Nível de acesso usado apenas como referência"><option value="explorer" ${referenceId === 'explorer' ? 'selected' : ''}>Explorer · 2.880/24h</option><option value="basic" ${referenceId === 'basic' ? 'selected' : ''}>Basic · 15.000/24h</option><option value="standard" ${referenceId === 'standard' ? 'selected' : ''}>Standard · sem limite diário</option></select><small>${escapeHtml(referenceText)}; confirme o nível real no Google Cloud.</small></label>`;

    const rows = summary.rows.map(row => {
      const apiRequestsCell = row.serverTrackedAttempts
        ? `<strong>${integer(row.googleAdsRequestsResponded + row.googleAdsRequestsUnknown)}</strong><small>${integer(row.googleAdsRequestsResponded)} com resposta${row.googleAdsRequestsUnknown ? ` · ${integer(row.googleAdsRequestsUnknown)} sem resposta` : ''}</small>`
        : '—';
      return `<tr class="google-ads-quota-row-${escapeHtml(row.group.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}"><td><strong>${escapeHtml(row.label)}</strong><small><code>${escapeHtml(row.operation)}</code></small>${row.note ? `<small>${escapeHtml(row.note)}</small>` : ''}</td><td>${escapeHtml(row.estimateLabel)}</td><td><strong>${integer(row.attempts)}</strong><small>${escapeHtml(statusLabel(row))}</small></td><td>${escapeHtml(estimateLabel(row))}</td><td>${apiRequestsCell}</td><td>${escapeHtml(dateTimeLabel(row.lastAtUtc))}${row.lastOutcome ? `<small>${row.lastOutcome === 'success' ? 'Concluída' : row.lastOutcome === 'cancelled' ? 'Cancelada' : 'Falhou'}</small>` : ''}</td></tr>`;
    }).join('');
    tableRoot.innerHTML = `<table class="google-ads-quota-table"><thead><tr><th>Operação do Hub</th><th>Custo estimado por chamada</th><th>Execuções no período</th><th>Operações de cota estimadas</th><th>Chamadas HTTP Google Ads</th><th>Última execução</th></tr></thead><tbody>${rows}</tbody></table>`;
    root.querySelectorAll('[data-google-ads-quota-period]').forEach(button => {
      const active = button.dataset.googleAdsQuotaPeriod === period;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-google-ads-quota-period]');
    if (!button) return;
    period = button.dataset.googleAdsQuotaPeriod === 'total' ? 'total' : '24h';
    render();
  });
  root.addEventListener('change', event => {
    if (!event.target.matches('[data-google-ads-quota-reference]')) return;
    referenceId = writeGoogleAdsQuotaReference(event.target.value);
    render();
  });
  const refresh = () => render();
  const onStorage = event => {
    if (event.key === GOOGLE_ADS_QUOTA_TELEMETRY_STORAGE_KEY) render();
  };
  globalThis.addEventListener?.(GOOGLE_ADS_QUOTA_TELEMETRY_UPDATED_EVENT, refresh);
  globalThis.addEventListener?.('storage', onStorage);
  render();
  return { refresh };
}
