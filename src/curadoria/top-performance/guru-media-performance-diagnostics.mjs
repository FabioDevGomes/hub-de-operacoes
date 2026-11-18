const MAX_EVENTS = 300;
const FILTER_INPUTS = '#search, #idFilter, #payoutMin, #payoutMax';
const FILTER_SELECTS = '#categoryFilter, #badgeFilter, #countryFilter, #featureFilter, #languageFilter, #decisionFilter, #movementFilter, #presenceFilter, #visibilityFilter';
const COUNT_FIELDS = new Set(['offerCount', 'collectionCount', 'snapshotCount', 'decisionCount', 'trendCount', 'imageCount', 'glimpseCount', 'visibleRows', 'estimatedVisibleCells', 'trackCount', 'salesRowCount']);

const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]);
};

function emptyCollector() {
  return {
    enabled: false,
    startStage: () => null,
    endStage: () => {},
    beginRender: () => null,
    endRender: () => {},
  };
}

export function createGuruMediaPerformanceDiagnostics({
  document = globalThis.document,
  location = globalThis.location,
  window = globalThis.window,
  performance = globalThis.performance,
} = {}) {
  const enabled = new URLSearchParams(location?.search || '').get('guruMediaPerf') === '1';
  if (!enabled || !document?.body || !window?.requestAnimationFrame) return emptyCollector();

  const events = [];
  let droppedEvents = 0;
  let stopped = false;
  let pendingCause = 'initial-load';
  let pendingCauseAt = performance.now();
  let scrollSession = null;
  let animationFrameId = 0;
  let longTaskObserver = null;
  let renderCount = 0;
  let scrollCount = 0;
  let longTaskCount = 0;
  let firstRenderFramesScheduled = false;
  let lastSummaryUpdateAt = -Infinity;
  const sessionStartedAt = new Date().toISOString();

  const panel = document.createElement('section');
  panel.className = 'guru-media-performance-diagnostics';
  panel.setAttribute('aria-label', 'Diagnóstico de desempenho da Plataforma Guru Media');
  panel.innerHTML = `
    <header class="guru-media-performance-diagnostics-heading">
      <div>
        <h2>Diagnóstico de desempenho</h2>
        <p data-guru-media-perf-status role="status" aria-live="polite">Iniciando coleta opcional nesta aba…</p>
      </div>
      <div class="guru-media-performance-diagnostics-actions">
        <button class="btn" type="button" data-guru-media-perf-action="download">Baixar JSON</button>
        <button class="btn" type="button" data-guru-media-perf-action="stop">Encerrar coleta</button>
      </div>
    </header>
    <details>
      <summary>Resumo da coleta</summary>
      <pre data-guru-media-perf-summary></pre>
    </details>`;
  const summary = document.querySelector('#summary');
  if (summary) summary.before(panel);
  else document.querySelector('main')?.prepend(panel);

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./guru-media-performance-diagnostics.css?v=1', import.meta.url).href;
  document.head.append(stylesheet);

  const status = panel.querySelector('[data-guru-media-perf-status]');
  const summaryElement = panel.querySelector('[data-guru-media-perf-summary]');
  const stopButton = panel.querySelector('[data-guru-media-perf-action="stop"]');
  const now = () => performance.now();
  const isoAt = perfTime => new Date(Date.now() - Math.max(0, now() - perfTime)).toISOString();

  function updateStatus() {
    if (!status) return;
    status.textContent = `${stopped ? 'Coleta encerrada' : 'Coleta ativa'} · ${events.length} amostra(s) · ${renderCount} render(s) · ${scrollCount} sessão(ões) de rolagem · ${longTaskCount} tarefa(s) longa(s)`;
  }

  function add(event) {
    if (stopped) return null;
    const stored = { at: new Date().toISOString(), ...event };
    events.push(stored);
    if (events.length > MAX_EVENTS) {
      events.shift();
      droppedEvents += 1;
    }
    if (stored.type === 'render') renderCount += 1;
    if (stored.type === 'scroll-session') scrollCount += 1;
    if (stored.type === 'long-task') longTaskCount += 1;
    updateStatus();
    if (panel.querySelector('details')?.open && now() - lastSummaryUpdateAt >= 500) updateSummary();
    return stored;
  }

  function startStage(name) {
    return stopped ? null : { name, startedAt: now() };
  }

  function endStage(token, counts = {}, failed = false) {
    if (!token || stopped) return;
    const event = {
      type: 'load-stage',
      stage: String(token.name).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48),
      durationMs: round(Math.max(0, now() - token.startedAt)),
      failed: Boolean(failed),
    };
    for (const [key, value] of Object.entries(counts || {})) {
      if (COUNT_FIELDS.has(key) && Number.isFinite(value)) event[key] = Math.max(0, Math.round(value));
    }
    add(event);
  }

  function markCause(cause) {
    pendingCause = cause;
    pendingCauseAt = now();
  }

  function takeCause() {
    const cause = now() - pendingCauseAt <= 700 ? pendingCause : 'unspecified';
    pendingCause = 'unspecified';
    pendingCauseAt = -Infinity;
    return cause;
  }

  function beginRender(candidateRows) {
    if (stopped) return null;
    return { startedAt: now(), cause: takeCause(), candidateRows };
  }

  function endRender(token, { visibleRows, estimatedVisibleCells, failed = false } = {}) {
    if (!token || stopped) return;
    add({
      type: 'render',
      cause: token.cause,
      durationMs: round(Math.max(0, now() - token.startedAt)),
      candidateRows: Number.isFinite(token.candidateRows) ? Math.max(0, Math.round(token.candidateRows)) : null,
      visibleRows: Number.isFinite(visibleRows) ? Math.max(0, Math.round(visibleRows)) : null,
      estimatedVisibleCells: Number.isFinite(estimatedVisibleCells) ? Math.max(0, Math.round(estimatedVisibleCells)) : null,
      failed: Boolean(failed),
    });
    if (!firstRenderFramesScheduled && !failed) {
      firstRenderFramesScheduled = true;
      const renderStartedAt = token.startedAt;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        add({ type: 'first-render-frames', durationMs: round(Math.max(0, now() - renderStartedAt)) });
      }));
    }
  }

  function currentSummary() {
    const stages = [...new Set(events.filter(event => event.type === 'load-stage').map(event => event.stage))];
    const stageMetrics = Object.fromEntries(stages.map(stage => {
      const values = events.filter(event => event.type === 'load-stage' && event.stage === stage).map(event => event.durationMs).filter(Number.isFinite);
      return [stage, { samples: values.length, averageMs: round(values.reduce((sum, value) => sum + value, 0) / (values.length || 1)), p95Ms: percentile(values, 0.95), maxMs: values.length ? round(Math.max(...values)) : null }];
    }));
    const renders = events.filter(event => event.type === 'render');
    const renderTimes = renders.map(event => event.durationMs).filter(Number.isFinite);
    const scrolls = events.filter(event => event.type === 'scroll-session');
    const frameGaps = scrolls.flatMap(event => event.frameGapSamples || []).filter(Number.isFinite);
    const wheelLatencies = scrolls.flatMap(event => event.wheelToScrollSamples || []).filter(Number.isFinite);
    const longTasks = events.filter(event => event.type === 'long-task');
    const causeCounts = Object.fromEntries([...new Set(renders.map(event => event.cause))].map(cause => [cause, renders.filter(event => event.cause === cause).length]));
    return {
      loadStages: stageMetrics,
      renders: {
        samples: renderTimes.length,
        averageMs: round(renderTimes.reduce((sum, value) => sum + value, 0) / (renderTimes.length || 1)),
        p95Ms: percentile(renderTimes, 0.95),
        maxMs: renderTimes.length ? round(Math.max(...renderTimes)) : null,
        causes: causeCounts,
        maxCandidateRows: renders.length ? Math.max(...renders.map(event => event.candidateRows || 0)) : 0,
        maxVisibleRows: renders.length ? Math.max(...renders.map(event => event.visibleRows || 0)) : 0,
        maxEstimatedVisibleCells: renders.length ? Math.max(...renders.map(event => event.estimatedVisibleCells || 0)) : 0,
        firstRenderTwoFramesMs: events.find(event => event.type === 'first-render-frames')?.durationMs ?? null,
      },
      scrolling: {
        sessions: scrolls.length,
        wheelEvents: scrolls.reduce((sum, event) => sum + event.wheelEvents, 0),
        scrollEvents: scrolls.reduce((sum, event) => sum + event.scrollEvents, 0),
        frameSamples: frameGaps.length,
        frameGapP95Ms: percentile(frameGaps, 0.95),
        frameGapMaxMs: frameGaps.length ? round(Math.max(...frameGaps)) : null,
        frameGapsOver32Ms: scrolls.reduce((sum, event) => sum + event.frameGapsOver32Ms, 0),
        wheelToScrollP50Ms: percentile(wheelLatencies, 0.5),
        wheelToScrollMaxMs: wheelLatencies.length ? round(Math.max(...wheelLatencies)) : null,
      },
      longTasks: {
        samples: longTasks.length,
        totalMs: round(longTasks.reduce((sum, event) => sum + event.durationMs, 0)),
        maxMs: longTasks.length ? round(Math.max(...longTasks.map(event => event.durationMs))): null,
        duringScroll: longTasks.filter(event => event.duringScroll).length,
      },
      droppedEvents,
    };
  }

  function reportObject() {
    if (scrollSession) finishScrollSession();
    return {
      format: 'guru-media-performance-v1',
      scope: 'somente esta aba; memória volátil; não persistido',
      privacy: 'Durações, causas predefinidas e contagens agregadas. Sem nome/ID de oferta, valores, filtros digitados, URL ou conteúdo de campanhas.',
      measurementNotes: [
        'Intervalos de requestAnimationFrame são aproximações de fluidez e não confirmam pintura ou composição do navegador.',
        'A latência roda→evento de rolagem é aproximada; tarefas longas são correlacionadas apenas com a sessão de rolagem ativa.',
      ],
      startedAt: sessionStartedAt,
      summary: currentSummary(),
      events,
    };
  }

  function updateSummary() {
    lastSummaryUpdateAt = now();
    if (summaryElement) summaryElement.textContent = JSON.stringify(currentSummary(), null, 2);
  }

  function downloadReport() {
    const blob = new Blob([JSON.stringify(reportObject(), null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'diagnostico-guru-media-performance.json';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    updateStatus();
  }

  function areaFor(target) {
    return target?.closest?.('.offer-table-surface') ? 'table' : 'page';
  }

  function beginScrollSession(area) {
    const startedAt = now();
    scrollSession = {
      area,
      startedAt,
      lastActivityAt: startedAt,
      lastFrameAt: null,
      lastWheelAt: null,
      wheelEvents: 0,
      scrollEvents: 0,
      frameGapSamples: [],
      wheelToScrollSamples: [],
      frameGapsOver32Ms: 0,
    };
    scheduleScrollFrame();
  }

  function scheduleScrollFrame() {
    if (!scrollSession || animationFrameId || stopped) return;
    animationFrameId = window.requestAnimationFrame(sampleScrollFrame);
  }

  function sampleScrollFrame(frameAt) {
    animationFrameId = 0;
    if (!scrollSession || stopped) return;
    if (scrollSession.lastFrameAt !== null) {
      const gap = Math.max(0, frameAt - scrollSession.lastFrameAt);
      scrollSession.frameGapSamples.push(gap);
      if (gap > 32) scrollSession.frameGapsOver32Ms += 1;
    }
    scrollSession.lastFrameAt = frameAt;
    if (now() - scrollSession.lastActivityAt >= 260) finishScrollSession();
    else scheduleScrollFrame();
  }

  function finishScrollSession() {
    if (!scrollSession) return;
    if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    const session = scrollSession;
    scrollSession = null;
    if (!session.scrollEvents) return;
    add({
      type: 'scroll-session',
      area: session.area,
      durationMs: round(Math.max(0, now() - session.startedAt)),
      wheelEvents: session.wheelEvents,
      scrollEvents: session.scrollEvents,
      frameSamples: session.frameGapSamples.length,
      frameGapsOver32Ms: session.frameGapsOver32Ms,
      frameGapSamples: session.frameGapSamples.map(round),
      frameGapMaxMs: session.frameGapSamples.length ? round(Math.max(...session.frameGapSamples)) : null,
      wheelToScrollSamples: session.wheelToScrollSamples.map(round),
      wheelToScrollMaxMs: session.wheelToScrollSamples.length ? round(Math.max(...session.wheelToScrollSamples)) : null,
    });
  }

  function onWheel(event) {
    if (stopped || document.visibilityState === 'hidden') return;
    const area = areaFor(event.target);
    const at = now();
    if (!scrollSession || at - scrollSession.lastActivityAt > 500 || scrollSession.area !== area) {
      finishScrollSession();
      beginScrollSession(area);
    }
    scrollSession.lastActivityAt = at;
    scrollSession.lastWheelAt = at;
    scrollSession.wheelEvents += 1;
  }

  function onScroll(event) {
    if (stopped || document.visibilityState === 'hidden') return;
    const at = now();
    if (!scrollSession) beginScrollSession(areaFor(event.target));
    scrollSession.lastActivityAt = at;
    scrollSession.scrollEvents += 1;
    if (scrollSession.lastWheelAt !== null) {
      const latency = at - scrollSession.lastWheelAt;
      if (latency >= 0 && latency <= 1000) scrollSession.wheelToScrollSamples.push(latency);
      scrollSession.lastWheelAt = null;
    }
  }

  function onInput(event) {
    if (event.target?.matches?.(FILTER_INPUTS)) markCause('text-filter');
  }

  function onChange(event) {
    if (event.target?.matches?.(FILTER_SELECTS)) markCause('select-filter');
  }

  function onClick(event) {
    if (event.target?.closest?.('[data-sort]')) markCause('sort');
    else if (event.target?.closest?.('#clearFilters')) markCause('clear-filters');
    else if (event.target?.closest?.('#columnMenu')) markCause('column-change');
  }

  function stop() {
    if (stopped) return;
    finishScrollSession();
    add({ type: 'collection-stopped' });
    stopped = true;
    longTaskObserver?.disconnect();
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (stopButton) stopButton.disabled = true;
    updateStatus();
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') finishScrollSession();
  }

  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('wheel', onWheel, { capture: true, passive: true });
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  panel.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-guru-media-perf-action]')?.dataset.guruMediaPerfAction;
    if (action === 'download') downloadReport();
    else if (action === 'stop') stop();
  });
  panel.querySelector('details')?.addEventListener('toggle', updateSummary);

  if (window.PerformanceObserver) {
    try {
      longTaskObserver = new window.PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const start = Number(entry.startTime);
          const duration = Number(entry.duration);
          if (!Number.isFinite(start) || !Number.isFinite(duration)) continue;
          const end = start + duration;
          const duringScroll = Boolean(scrollSession && end >= scrollSession.startedAt && start <= now());
          add({ type: 'long-task', durationMs: round(duration), duringScroll });
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch {
      longTaskObserver?.disconnect();
      longTaskObserver = null;
    }
  }

  add({ type: 'session-start', trigger: 'url-parameter', longTaskObserver: Boolean(longTaskObserver), requestAnimationFrame: true });
  updateStatus();
  return { get enabled() { return !stopped; }, startStage, endStage, beginRender, endRender };
}
