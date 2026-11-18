export const GOOGLE_ADS_QUOTA_OPERATION_CATALOG = Object.freeze([
  { operation: 'accounts', label: 'MCCs e contas', group: 'Leitura', estimateLabel: '1 + detalhes por raiz/MCC', min: 1, max: null, note: 'Varia conforme contas acessíveis e fallbacks.' },
  { operation: 'conversion_actions', label: 'Ações de conversão', group: 'Leitura', estimateLabel: '1', min: 1, max: 1 },
  { operation: 'campaign_config', label: 'Configuração de campanhas', group: 'Leitura', estimateLabel: '2–3', min: 2, max: 3, note: 'A terceira consulta depende de estratégia de portfólio.' },
  { operation: 'report', label: 'Relatório agregado', group: 'Leitura', estimateLabel: '3', min: 3, max: 3 },
  { operation: 'daily_report', label: 'Relatório diário', group: 'Leitura', estimateLabel: '3', min: 3, max: 3 },
  { operation: 'sao_paulo_day_report', label: 'Fechamento D−1', group: 'Leitura', estimateLabel: '2', min: 2, max: 2 },
  { operation: 'search_term_campaigns', label: 'Lista de campanhas Search', group: 'Leitura', estimateLabel: '1', min: 1, max: 1 },
  { operation: 'search_terms', label: 'Termos de pesquisa', group: 'Leitura', estimateLabel: '1', min: 1, max: 1 },
  { operation: 'geographic_report', label: 'Localização geográfica dos cliques', group: 'Leitura', estimateLabel: '1–2 por conta/dia', min: 1, max: 2, note: 'Uma consulta diária por conta para até 14 dias; a segunda consulta resolve os nomes dos países quando há linhas.' },
  { operation: 'final_url_hosts', label: 'Destinos finais dos anúncios', group: 'Leitura', estimateLabel: 'Variável', min: 1, max: null },
  { operation: 'capabilities', label: 'Verificação de acesso a ações', group: 'Ações', estimateLabel: '0–1', min: 0, max: 1 },
  { operation: 'creation_capabilities', label: 'Verificação de acesso à criação', group: 'Ações', estimateLabel: '0–1', min: 0, max: 1 },
  { operation: 'campaign_templates', label: 'Modelos de campanha', group: 'Ações', estimateLabel: '2–6', min: 2, max: 6 },
  { operation: 'pause_campaign', label: 'Pausar campanha', group: 'Ações', estimateLabel: '2–4', min: 2, max: 4 },
  { operation: 'enable_campaign', label: 'Ativar campanha', group: 'Ações', estimateLabel: '2–4', min: 2, max: 4 },
  { operation: 'temporary_validate_campaign_goal', label: 'Teste temporário de meta', group: 'Leitura', estimateLabel: 'Variável por consulta', min: 1, max: null },
  { operation: 'apply_existing_campaign_custom_goal', label: 'Aplicar meta da MCC à campanha', group: 'Ações', estimateLabel: 'Variável por campanha', min: 1, max: null },
  { operation: 'inspect_campaign_goal', label: 'Conferir meta da campanha', group: 'Leitura', estimateLabel: '4 + ações', min: 1, max: null },
  { operation: 'prepare_search_campaign_preview_contexts', label: 'Preparar contexto compartilhado da prévia', group: 'Ações', estimateLabel: 'Variável por conta/MCC/países', min: null, max: null },
  { operation: 'preview_search_campaign', label: 'Prévia de criação Search', group: 'Ações', estimateLabel: 'Variável por campanha; requer telemetria v2', min: null, max: null },
  { operation: 'create_search_campaign', label: 'Criar campanha Search', group: 'Ações', estimateLabel: 'Variável por campanha; requer telemetria v2', min: null, max: null },
  { operation: 'apply_audience_targeting', label: 'Aplicar segmentação de público', group: 'Ações', estimateLabel: '4 + verificações/itens', min: 4, max: null },
  { operation: 'apply_configured_audience_targeting', label: 'Aplicar segmentação configurada', group: 'Ações', estimateLabel: '4 + verificações/itens', min: 4, max: null },
  { operation: 'apply_audience_exclusions', label: 'Aplicar exclusões de público', group: 'Ações', estimateLabel: '3 + verificações/itens', min: 3, max: null },
  { operation: 'campaign_duplication_list', label: 'Listar campanhas para duplicação', group: 'Ações', estimateLabel: 'Variável', min: 1, max: null },
  { operation: 'campaign_duplication_inspect', label: 'Inspecionar duplicação', group: 'Ações', estimateLabel: 'Variável', min: 1, max: null },
  { operation: 'campaign_duplication_preview', label: 'Prévia de duplicação', group: 'Ações', estimateLabel: 'Variável', min: 1, max: null },
  { operation: 'campaign_duplication_create', label: 'Criar duplicação', group: 'Ações', estimateLabel: 'Variável', min: 1, max: null },
  { operation: 'audience_targeting_upload_csv', label: 'Preparar CSV de públicos', group: 'Local', estimateLabel: 'Sem chamada Ads', min: 0, max: 0 },
  { operation: 'audience_targeting_upload_csv_stream', label: 'Processar CSV de públicos', group: 'Local', estimateLabel: 'Sem chamada Ads', min: 0, max: 0 },
  { operation: 'audience_exclusion_upload_catalog', label: 'Preparar catálogo de exclusões', group: 'Local', estimateLabel: 'Sem chamada Ads', min: 0, max: 0 },
  { operation: 'apply_campaign_sitelinks', label: 'Aplicar sitelinks', group: 'Ações', estimateLabel: 'Variável por recurso', min: 0, max: null },
  { operation: 'apply_campaign_destination_url', label: 'Aplicar URL de destino', group: 'Ações', estimateLabel: 'Variável por campanha/recurso', min: 0, max: null },
  { operation: 'upload_campaign_image_asset', label: 'Enviar asset de imagem', group: 'Ações', estimateLabel: 'Variável por asset', min: 1, max: null },
]);

const catalogByOperation = new Map(GOOGLE_ADS_QUOTA_OPERATION_CATALOG.map(item => [item.operation, item]));
const safeOperationPattern = /^[a-z][a-z0-9_]{0,79}$/;

export function normalizeGoogleAdsQuotaOperation(value) {
  const operation = String(value || '').trim().toLowerCase();
  return safeOperationPattern.test(operation) ? operation : '';
}

export function getGoogleAdsQuotaOperation(operation) {
  const normalized = normalizeGoogleAdsQuotaOperation(operation);
  return catalogByOperation.get(normalized) || (normalized ? {
    operation: normalized,
    label: 'Operação nova ou não mapeada',
    group: 'Não mapeada',
    estimateLabel: 'Sem estimativa disponível',
    min: null,
    max: null,
    note: 'A tentativa foi contada, mas o custo Google Ads precisa de mapeamento.'
  } : null);
}

export function normalizeGoogleAdsQuotaServerCounts(value) {
  if (!value || typeof value !== 'object' || Number(value.version) !== 2) return null;
  const requestsResponded = Number(value.requestsResponded);
  const requestsUnknown = Number(value.requestsUnknown);
  const quotaOperationsEstimated = Number(value.quotaOperationsEstimated);
  const quotaOperationsUnknown = Number(value.quotaOperationsUnknown);
  const counts = [requestsResponded, requestsUnknown, quotaOperationsEstimated, quotaOperationsUnknown];
  if (!counts.every(count => Number.isSafeInteger(count) && count >= 0)
      || counts.reduce((sum, count) => sum + count, 0) > 1000000) return null;
  return { version: 2, requestsResponded, requestsUnknown, quotaOperationsEstimated, quotaOperationsUnknown };
}

export function estimateGoogleAdsQuotaAttempt(operation, outcome, serverCounts = null) {
  const serverCountsV2 = normalizeGoogleAdsQuotaServerCounts(serverCounts);
  if (serverCountsV2) {
    return {
      min: serverCountsV2.quotaOperationsEstimated,
      max: serverCountsV2.quotaOperationsEstimated + serverCountsV2.quotaOperationsUnknown,
      unknown: serverCountsV2.quotaOperationsUnknown > 0,
      serverTracked: true,
    };
  }
  const definition = getGoogleAdsQuotaOperation(operation);
  if (!definition) return { min: null, max: null, unknown: true, serverTracked: false };
  if (outcome !== 'success') {
    return { min: 0, max: definition.max, unknown: definition.min == null, serverTracked: false };
  }
  return { min: definition.min, max: definition.max, unknown: definition.min == null || definition.max == null, serverTracked: false };
}

export function summarizeGoogleAdsQuotaTelemetry(snapshot, period = '24h', now = Date.now()) {
  const isTotal = period === 'total';
  const aggregates = snapshot?.totals && typeof snapshot.totals === 'object' ? snapshot.totals : {};
  const events = Array.isArray(snapshot?.recent) ? snapshot.recent : [];
  const cutoff = now - 24 * 60 * 60 * 1000;
  const selectedEvents = isTotal ? [] : events.filter(event => {
    const at = Date.parse(event?.atUtc || '');
    return Number.isFinite(at) && at >= cutoff && at <= now;
  });
  const grouped = new Map();

  if (isTotal) {
    for (const [operation, value] of Object.entries(aggregates)) {
      grouped.set(operation, {
        operation,
        attempts: Number(value?.attempts) || 0,
        successes: Number(value?.successes) || 0,
        failures: Number(value?.failures) || 0,
        cancellations: Number(value?.cancellations) || 0,
        durationTotalMs: Number(value?.durationTotalMs) || 0,
        estimatedMin: Number(value?.estimatedMin) || 0,
        estimatedMax: value?.estimatedMax == null ? null : Number(value.estimatedMax) || 0,
        unknownCostCalls: Number(value?.unknownCostCalls) || 0,
        serverTrackedAttempts: Number(value?.serverTrackedAttempts) || 0,
        quotaOperationsEstimated: Number(value?.quotaOperationsEstimated) || 0,
        quotaOperationsUnknown: Number(value?.quotaOperationsUnknown) || 0,
        googleAdsRequestsResponded: Number(value?.googleAdsRequestsResponded) || 0,
        googleAdsRequestsUnknown: Number(value?.googleAdsRequestsUnknown) || 0,
        lastAtUtc: value?.lastAtUtc || '',
        lastOutcome: value?.lastOutcome || '',
      });
    }
  } else {
    for (const event of selectedEvents) {
      const operation = normalizeGoogleAdsQuotaOperation(event?.operation);
      if (!operation) continue;
      const row = grouped.get(operation) || {
        operation, attempts: 0, successes: 0, failures: 0, cancellations: 0,
        durationTotalMs: 0, estimatedMin: 0, estimatedMax: 0, unknownCostCalls: 0,
        serverTrackedAttempts: 0, quotaOperationsEstimated: 0, quotaOperationsUnknown: 0, googleAdsRequestsResponded: 0, googleAdsRequestsUnknown: 0,
        lastAtUtc: '', lastOutcome: '',
      };
      const outcome = ['success', 'failed', 'cancelled'].includes(event?.outcome) ? event.outcome : 'failed';
      const estimate = estimateGoogleAdsQuotaAttempt(operation, outcome, event?.serverCounts);
      row.attempts += 1;
      if (outcome === 'success') row.successes += 1;
      else if (outcome === 'cancelled') row.cancellations += 1;
      else row.failures += 1;
      row.durationTotalMs += Math.max(0, Number(event?.durationMs) || 0);
      if (estimate.unknown && !estimate.serverTracked) row.unknownCostCalls += 1;
      if (estimate.min != null) row.estimatedMin += estimate.min;
      if (row.estimatedMax == null || estimate.max == null) row.estimatedMax = null;
      else row.estimatedMax += estimate.max;
      if (estimate.serverTracked) {
        row.serverTrackedAttempts += 1;
        row.quotaOperationsEstimated += Number(event.serverCounts.quotaOperationsEstimated) || 0;
        row.quotaOperationsUnknown += Number(event.serverCounts.quotaOperationsUnknown) || 0;
        row.googleAdsRequestsResponded += Number(event.serverCounts.requestsResponded) || 0;
        row.googleAdsRequestsUnknown += Number(event.serverCounts.requestsUnknown) || 0;
      }
      if (!row.lastAtUtc || Date.parse(event.atUtc) > Date.parse(row.lastAtUtc)) {
        row.lastAtUtc = event.atUtc;
        row.lastOutcome = outcome;
      }
      grouped.set(operation, row);
    }
  }

  const rows = GOOGLE_ADS_QUOTA_OPERATION_CATALOG.map(definition => ({
    ...definition,
    ...(grouped.get(definition.operation) || {
      attempts: 0, successes: 0, failures: 0, cancellations: 0,
      durationTotalMs: 0, estimatedMin: 0, estimatedMax: 0, unknownCostCalls: 0,
      serverTrackedAttempts: 0, quotaOperationsEstimated: 0, quotaOperationsUnknown: 0, googleAdsRequestsResponded: 0, googleAdsRequestsUnknown: 0,
      lastAtUtc: '', lastOutcome: '',
    }),
  }));
  for (const [operation, row] of grouped) {
    if (catalogByOperation.has(operation)) continue;
    rows.push({ ...getGoogleAdsQuotaOperation(operation), ...row });
  }

  const totalAttempts = rows.reduce((sum, row) => sum + row.attempts, 0);
  const successes = rows.reduce((sum, row) => sum + row.successes, 0);
  const failures = rows.reduce((sum, row) => sum + row.failures, 0);
  const cancellations = rows.reduce((sum, row) => sum + row.cancellations, 0);
  const estimatedMin = rows.reduce((sum, row) => sum + row.estimatedMin, 0);
  const estimatedMax = rows.some(row => row.estimatedMax == null) ? null : rows.reduce((sum, row) => sum + row.estimatedMax, 0);
  const unknownCostCalls = rows.reduce((sum, row) => sum + row.unknownCostCalls, 0);
  const serverTrackedAttempts = rows.reduce((sum, row) => sum + row.serverTrackedAttempts, 0);
  const quotaOperationsEstimated = rows.reduce((sum, row) => sum + row.quotaOperationsEstimated, 0);
  const quotaOperationsUnknown = rows.reduce((sum, row) => sum + row.quotaOperationsUnknown, 0);
  const googleAdsRequestsResponded = rows.reduce((sum, row) => sum + row.googleAdsRequestsResponded, 0);
  const googleAdsRequestsUnknown = rows.reduce((sum, row) => sum + row.googleAdsRequestsUnknown, 0);
  const knownActivityRows = rows.filter(row => row.attempts > 0).sort((a, b) => b.attempts - a.attempts || Date.parse(b.lastAtUtc || 0) - Date.parse(a.lastAtUtc || 0));

  return { rows, totalAttempts, successes, failures, cancellations, estimatedMin, estimatedMax, unknownCostCalls, serverTrackedAttempts, quotaOperationsEstimated, quotaOperationsUnknown, googleAdsRequestsResponded, googleAdsRequestsUnknown, knownActivityRows };
}
