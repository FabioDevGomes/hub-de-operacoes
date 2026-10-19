import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a tela Tracking ClickBank, seus adaptadores e o estilo são publicados pelo build', async () => {
  const [html, sourceView, distView, sourceDomain, distDomain, sourceService, distService, sourceTokenStorage, distTokenStorage, sourceCss, distCss, registry, menu] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-view.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-view.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-domain.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-domain.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-service.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-service.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-token-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-token-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking.css', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/view-registry.js', import.meta.url), 'utf8'),
    readFile(new URL('../dist/sidebar-component.js', import.meta.url), 'utf8'),
  ]);

  assert.ok(html.includes('id="trackingView"') && html.includes('id="trackingModuleRoot"'));
  assert.ok(html.includes('/tracking/tracking.css?v=4'));
  assert.ok(html.includes("import('./tracking/tracking-view.mjs?v=4')"));
  assert.ok(sourceService.includes('https://track.travenzo.shop/google-ads-report.php'));
  assert.ok(sourceService.includes('https://track.travenzo.shop/clickbank-ins-v8-report.php'));
  assert.ok(sourceService.includes('https://track.travenzo.shop/clickbank-ins-v8-csv.php'));
  assert.ok(registry.includes("query:'tracking'"));
  assert.ok(menu.includes("label: 'Tracking ClickBank'"));
  assert.equal(distView, sourceView);
  assert.equal(distDomain, sourceDomain);
  assert.equal(distService, sourceService);
  assert.equal(distTokenStorage, sourceTokenStorage);
  assert.equal(distCss, sourceCss);
  const introHeader = sourceView.match(/<div class="tracking-intro-head">([\s\S]*?)<\/div>\s*<div class="tracking-connection">/);
  assert.ok(introHeader && introHeader[1].includes('data-tracking-action="refresh-server"') && introHeader[1].includes('data-tracking-action="refresh-ins-v8"') && introHeader[1].includes('data-tracking-action="disconnect"'), 'ações do servidor permanecem no cabeçalho acima do campo do token');
});
