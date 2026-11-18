import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../src/overview/performance-diagnostics.js', import.meta.url), 'utf8');

test('mantém o diagnóstico ativo se a navegação limpar overviewPerf antes de montar a Visão Geral', () => {
  const browser = {
    location: { search: '?overviewPerf=1' },
    performance: { now: () => 0 },
    addEventListener() {},
  };
  const context = vm.createContext({ window: browser, URLSearchParams });
  vm.runInContext(source, context);

  // A navegação inicial normaliza a URL antes de montar a view.
  browser.location.search = '?view=totals';

  const status = { textContent: '' };
  const report = { hidden: true, textContent: '' };
  const panel = {
    hidden: true,
    querySelector(selector) { return selector === '[data-perf-status]' ? status : report; },
    addEventListener() {},
  };
  const document = {
    defaultView: browser,
    visibilityState: 'visible',
    addEventListener() {},
  };
  browser.requestAnimationFrame = () => {};
  const root = { ownerDocument: document, querySelector: () => panel };

  const diagnostics = browser.HubOverviewPerformanceDiagnostics.create({ root, state: { activeView: 'totals' } });

  assert.equal(diagnostics.enabled, true);
  assert.equal(panel.hidden, false);
  assert.match(status.textContent, /amostras em memória/);
});
