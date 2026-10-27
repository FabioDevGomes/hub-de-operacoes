import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a tela Tracking ClickBank, seus adaptadores e o estilo são publicados pelo build', async () => {
  const [html, sourceView, distView, sourceDomain, distDomain, sourceClicksDomain, distClicksDomain, sourceClicksStorage, distClicksStorage, sourceService, distService, sourceTokenStorage, distTokenStorage, sourceDomainAdmin, distDomainAdmin, sourceLabelStorage, distLabelStorage, sourceListStorage, distListStorage, sourceConversionProfileStorage, distConversionProfileStorage, sourceSalesDomain, distSalesDomain, sourceSalesStorage, distSalesStorage, sourceCss, distCss, registry, menu] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-view.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-view.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-domain.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-domain.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-clicks-domain.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-clicks-domain.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-clicks-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-clicks-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-service.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-service.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-token-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-token-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-domain-admin.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-domain-admin.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-domain-label-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-domain-label-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-domain-list-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-domain-list-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-conversion-profiles-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-conversion-profiles-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-sales-domain.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-sales-domain.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-sales-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-sales-storage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking.css', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/view-registry.js', import.meta.url), 'utf8'),
    readFile(new URL('../dist/sidebar-component.js', import.meta.url), 'utf8'),
  ]);

  assert.ok(html.includes('id="trackingView"') && html.includes('id="trackingModuleRoot"'));
  assert.ok(html.includes('/tracking/tracking.css?v=36'));
  assert.ok(html.includes("import('./tracking/tracking-view.mjs?v=40')"));
  assert.ok(html.includes('controller.activate?.()'));
  assert.ok(sourceView.includes('<h2>Tracks</h2>'));
  assert.ok(sourceView.includes('aria-label="Tracks cadastradas"'));
  assert.ok(sourceView.includes('https://track.travenzo.shop/clickbank-ins-v8.php'));
  assert.ok(sourceView.includes('Instant Notification URL · ClickBank (INS v8)'));
  assert.ok(sourceCss.includes('.tracking-ins-v8-url > code'));
  assert.ok(sourceService.includes('https://track.travenzo.shop/google-ads-report.php'));
  assert.ok(sourceService.includes('https://track.travenzo.shop/clickbank-ins-v8-report.php'));
  assert.ok(sourceService.includes('https://track.travenzo.shop/clickbank-ins-v8-csv.php'));
  assert.ok(sourceService.includes('https://track.travenzo.shop/tracking-clicks-report.php'));
  assert.ok(sourceService.includes('https://track.travenzo.shop/clickbank-ins-v8-sales.php'));
  assert.ok(sourceClicksStorage.includes("'hub-tracking-clicks'"));
  assert.ok(sourceClicksStorage.includes("'report_snapshots'"));
  assert.ok(sourceClicksStorage.includes('.add(snapshot)'), 'o cache é append-only e não sobrescreve consultas anteriores');
  assert.ok(registry.includes("query:'tracking'"));
  assert.ok(menu.includes("label: 'Tracking ClickBank'"));
  assert.equal(distView, sourceView);
  assert.equal(distDomain, sourceDomain);
  assert.equal(distClicksDomain, sourceClicksDomain);
  assert.equal(distClicksStorage, sourceClicksStorage);
  assert.equal(distService, sourceService);
  assert.equal(distTokenStorage, sourceTokenStorage);
  assert.ok(sourceView.includes("tracking-token-storage.mjs?v=2"));
  assert.ok(sourceView.includes("tracking-domain-label-storage.mjs?v=2"));
  assert.ok(sourceView.includes("tracking-domain-list-storage.mjs?v=3"));
  assert.ok(sourceView.includes("tracking-service.mjs?v=11"));
  assert.ok(sourceView.includes("tracking-domain-admin.mjs?v=7"));
  assert.ok(sourceView.includes('title="Consulta no servidor a lista autorizada de Tracks (domínios e produtos), atualiza a tabela e o cache local. Não cadastra nem altera domínios."'));
  assert.ok(sourceView.includes("tracking-domain-list-storage.mjs?v=3"));
  assert.ok(sourceView.includes("tracking-clicks-domain.mjs?v=5"));
  assert.ok(sourceView.includes("tracking-clicks-storage.mjs?v=1"));
  assert.ok(sourceView.includes("tracking-sales-domain.mjs?v=1"));
  assert.ok(sourceView.includes("tracking-sales-storage.mjs?v=1"));
  assert.ok(sourceView.includes('data-tracking-action="refresh-track-sales"'));
  assert.ok(sourceView.includes('<th class="tracking-sales-count">Vendas (SALE)</th>'));
  assert.ok(sourceView.includes('Atualizar do servidor'));
  assert.ok(sourceView.includes('id="trackingDomainAdminConfig" class="tracking-domain-admin-config"'));
  assert.ok(sourceView.includes('data-tracking-action="toggle-domain-config"'));
  assert.ok(sourceCss.includes('.tracking-domain-admin-config[hidden] { display: none; }'));
  assert.ok(sourceView.includes('Cache local atualizado:'));
  assert.ok(sourceView.includes('formatTrackingDatePtBr') && sourceView.includes('parseTrackingDatePtBr'));
  assert.ok(sourceView.includes('O Hub não grava a base operacional nem envia conversões ao Google Ads. O CSV INS v8 é somente preparado e baixado manualmente. Não reenvie linhas já aceitas.'));
  assert.doesNotMatch(sourceView, /flow\s*tracking/i, 'a view não deve exibir menções à Flow Tracking');
  assert.ok(sourceView.includes('A leitura é somente para conferência e preparação; o Hub não envia dados ao Google Ads.'));
  assert.ok(sourceView.includes('placeholder="dd/mm/aaaa"'));
  const tokenNote = sourceView.match(/<p id="trackingTokenNote"[\s\S]*?<\/p>/)?.[0] || '';
  assert.match(tokenNote, /tracking-config\.php/);
  assert.match(tokenNote, /tracking_hub_api_token/);
  assert.doesNotMatch(tokenNote, /É diferente do token de postback|sem criptografia|backup JSON|Authorization|Origem autorizada|127\.0\.0\.1/i);
  assert.ok(sourceTokenStorage.includes("hub:tracking:domain-admin-token:v1"));
  assert.equal(distDomainAdmin, sourceDomainAdmin);
  assert.equal(distLabelStorage, sourceLabelStorage);
  assert.equal(distListStorage, sourceListStorage);
  assert.equal(distConversionProfileStorage, sourceConversionProfileStorage);
  assert.equal(distSalesDomain, sourceSalesDomain);
  assert.equal(distSalesStorage, sourceSalesStorage);
  assert.ok(sourceView.includes("tracking-conversion-profiles-storage.mjs?v=1"));
  assert.ok(sourceView.includes('saveTrackingConversionProfiles'));
  assert.ok(sourceView.includes('MCC'));
  assert.ok(sourceListStorage.includes("hub:tracking:domain-list-cache:v1"));
  assert.equal(distCss, sourceCss);
  assert.ok(sourceCss.includes('.tracking-clicks-table .tracking-number { text-align: left; }'));
  assert.ok(sourceCss.includes('.tracking-domain-table .tracking-sales-count { text-align: center; }'));
  assert.match(sourceCss, /tracking-domain-table tbody tr\.tracking-new-track-pulse > td\s*\{\s*animation: tracking-new-track-row-pulse \.72s ease-in-out 3;/);
  assert.ok(sourceCss.includes('background-color: rgba(112, 202, 255, .2);'), 'nova Track recebe o pulso azul-claro do padrão visual da Curadoria');
  assert.ok(sourceCss.includes('.tracking-domain-table { min-width: 680px; }'));
  assert.match(sourceCss, /\.tracking-domain-form\s*\{[^}]*align-items:\s*start;/);
  assert.match(sourceCss, /@media\s*\(min-width:\s*901px\)\s*\{\s*\.tracking-domain-form\s*>\s*\.tracking-remember-token,\s*\.tracking-domain-form\s*>\s*\.tracking-domain-actions\s*\{\s*align-self:\s*end;/);
  assert.ok(sourceCss.includes('.tracking-tag-dialog-backdrop'));
  assert.match(sourceCss, /\.tracking-tag-dialog textarea,\s*\.tracking-email-config-body \.tracking-token-field textarea\s*\{[^}]*background: var\(--panel2, #13243a\);[^}]*color: var\(--hub-primary-text, #c3cede\);/);
  assert.match(sourceCss, /\.tracking-tag-dialog textarea:focus-visible,\s*\.tracking-email-config-body \.tracking-token-field textarea:focus-visible\s*\{[^}]*outline: 2px solid var\(--hub-control-focus, #5ab1ff\);/);
  assert.ok(sourceCss.includes('.tracking-email-config-body[hidden] { display: none; }'));
  assert.ok(sourceCss.includes('.tracking-email-panel .tracking-email-heading { align-items: center; }'));
  assert.match(sourceCss, /\.tracking-clicks-date-range\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(180px,\s*230px\)\)\s+minmax\(160px,\s*190px\);\s*max-width:\s*668px;/);
  assert.ok(sourceCss.includes('.tracking-ins-v8-table th:nth-child(n+6):nth-child(-n+9)') && sourceCss.includes('.tracking-ins-v8-table td:nth-child(n+6):nth-child(-n+9) { text-align: center; }'), 'Comissão total, Total bruto, Origem GCLID e Conciliação centralizam cabeçalhos e células somente na tabela INS v8');
  const introHeader = sourceView.match(/<div class="tracking-intro-head">([\s\S]*?)<div id="trackingConnectionConfig" class="tracking-connection-config"/);
  assert.ok(introHeader && introHeader[1].includes('data-tracking-action="toggle-connection-config"'), 'o cabeçalho oferece o controle para exibir/recolher configurações');
  assert.ok(introHeader[1].includes('data-tracking-action="toggle-instructions"') && introHeader[1].includes('aria-controls="trackingInstructionalText"'), 'o mesmo cabeçalho oferece o controle global de instruções');
  assert.ok(sourceView.includes("instructionsVisible: false") && sourceView.includes('tracking-instructions-hidden'), 'as instruções começam recolhidas a cada montagem da tela');
  assert.ok(sourceCss.includes('.tracking-instructions-hidden .tracking-instruction') && sourceCss.includes('color: var(--muted, #91a1b8)') && sourceCss.includes('.tracking-eye-icon'), 'o olho usa o tom secundário azul-claro do tema e as instruções podem ser ocultadas');
  assert.ok(sourceView.includes('class="tracking-connection-config"${state.connectionConfigExpanded ? \'\' : \' hidden\'}') && sourceView.includes('data-tracking-action="refresh-server"') && sourceView.includes('data-tracking-action="refresh-ins-v8"') && sourceView.includes('data-tracking-action="disconnect"') && sourceView.includes('Token de acesso do Hub'), 'ações e token permanecem agrupados no painel de configurações recolhível');
  const connectionConfig = sourceView.slice(sourceView.indexOf('id="trackingConnectionConfig"'), sourceView.indexOf('<div class="tracking-actions">'));
  assert.ok(connectionConfig.includes('class="tracking-conversion-profile"') && connectionConfig.includes('Ação de conversão · vendas INS v8'), 'o perfil de conversão também fica no painel recolhível; as ações de CSV continuam fora');
  assert.ok(sourceCss.includes('.tracking-connection-config > .tracking-conversion-profile { margin-top: 0; }'));
});
