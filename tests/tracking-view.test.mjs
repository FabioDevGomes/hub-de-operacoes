import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  mount,
  TRACKING_CLICKS_AUTO_REFRESH_INTERVAL_MS,
  TRACKING_SALES_AUTO_REFRESH_INTERVAL_MS,
} from '../src/tracking/tracking-view.mjs';
import {
  TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY,
  TRACKING_TOKEN_STORAGE_KEY,
} from '../src/tracking/tracking-token-storage.mjs';
import { TRACKING_DOMAIN_LIST_STORAGE_KEY } from '../src/tracking/tracking-domain-list-storage.mjs';
import { TRACKING_CONVERSION_PROFILES_STORAGE_KEY } from '../src/tracking/tracking-conversion-profiles-storage.mjs';

const csv = [
  'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID',
  'CjwKCA_real_click_id_123456789,"Compra ClickBank",2026-10-15 18:22:09+0000,1.00,USD,ABC12345',
].join('\r\n') + '\r\n';

function makeRoot() {
  const listeners = new Map();
  const storageStatus = { textContent: '', classList: { toggle() {} } };
  const domainTokenStorageStatus = { textContent: '', classList: { toggle() {} } };
  const domainMessageStatus = { textContent: '', classList: { toggle() {} } };
  const presellScriptField = { value: '', focused: false, selected: false, focus() { this.focused = true; }, select() { this.selected = true; } };
  const tagDialogElement = { focused: false, focus() { this.focused = true; }, querySelectorAll() { return []; } };
  const productKeyPreviewField = { textContent: '' };
  const clicksStartDateField = { value: '' };
  const clicksEndDateField = { value: '' };
  const clicksProductFilterField = { value: '' };
  const clicksHostFilterField = { value: '' };
  const conversionProfileSelectField = { value: '' };
  const conversionProfileLabelField = { value: '' };
  const conversionActionNameField = { value: '' };
  const conversionProfileMessage = { textContent: '', classList: { toggle() {} } };
  const emailFields = new Map([
    'trackingEmailRecipient', 'trackingEmailSender', 'trackingEmailSmtpHost', 'trackingEmailSmtpPort',
    'trackingEmailSmtpSecurity', 'trackingEmailSmtpUsername', 'trackingEmailSmtpPassword',
  ].map(id => [id, { value: '' }]));
  return {
    innerHTML: '',
    tokenField: { value: '' },
    rememberField: { checked: false },
    domainTokenField: { value: '' },
    rememberDomainTokenField: { checked: false },
    domainNameField: { value: '' },
    productKeyField: { value: '' },
    productKeyPreviewField,
    domainIncludeWwwField: { checked: false },
    domainAdminTokenVisibleField: { checked: false },
    domainMessageStatus,
    domainTokenStorageStatus,
    presellScriptField,
    tagDialogElement,
    clicksStartDateField,
    clicksEndDateField,
    clicksProductFilterField,
    clicksHostFilterField,
    conversionProfileSelectField,
    conversionProfileLabelField,
    conversionActionNameField,
    conversionProfileMessage,
    emailFields,
    storageStatus,
    addEventListener(type, handler) { listeners.set(type, handler); },
    fire(type, event) { return listeners.get(type)?.(event); },
    querySelector(selector) {
      if (selector === '#trackingApiToken') return this.tokenField;
      if (selector === '#trackingRememberToken') return this.rememberField;
      if (selector === '#trackingTokenStorageStatus') return this.storageStatus;
      if (selector === '#trackingDomainAdminToken') return this.domainTokenField;
      if (selector === '#trackingRememberDomainAdminToken') return this.rememberDomainTokenField;
      if (selector === '#trackingDomainTokenStorageStatus') return this.domainTokenStorageStatus;
      if (selector === '#trackingDomainName') return this.domainNameField;
      if (selector === '#trackingDomainProductKey') return this.productKeyField;
      if (selector === '#trackingDomainProductKeyPreview') return this.productKeyPreviewField;
      if (selector === '#trackingDomainIncludeWww') return this.domainIncludeWwwField;
      if (selector === '#trackingDomainAdminTokenVisible') return this.domainAdminTokenVisibleField;
      if (selector === '#trackingDomainMessage') return this.domainMessageStatus;
      if (selector === '#trackingPresellScript') return this.presellScriptField;
      if (selector === '#trackingTagDialog') return this.tagDialogElement;
      if (selector === '#trackingClicksStartDate') return clicksStartDateField;
      if (selector === '#trackingClicksEndDate') return clicksEndDateField;
      if (selector === '#trackingClicksProductFilter') return clicksProductFilterField;
      if (selector === '#trackingClicksHostFilter') return clicksHostFilterField;
      if (selector === '#trackingConversionProfileSelect') return conversionProfileSelectField;
      if (selector === '#trackingConversionProfileLabel') return conversionProfileLabelField;
      if (selector === '#trackingConversionActionName') return conversionActionNameField;
      if (selector === '#trackingConversionProfileMessage') return conversionProfileMessage;
      if (selector.startsWith('#trackingEmail')) return emailFields.get(selector.slice(1)) || null;
      return null;
    },
  };
}

function installLocalStorage(initial = new Map()) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = initial;
  const localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
  return {
    values,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else delete globalThis.localStorage;
    },
  };
}

function makeClicksStorage(initialSnapshots = []) {
  const snapshots = structuredClone(initialSnapshots);
  let nextId = Math.max(0, ...snapshots.map(snapshot => snapshot.id || 0)) + 1;
  let nextSavedAtMs = Date.parse('2026-10-22T19:00:00.000Z');
  return {
    snapshots,
    async read() { return structuredClone(snapshots); },
    async append(report) {
      const snapshot = {
        ...structuredClone(report),
        id: nextId++,
        savedAtUtc: new Date(nextSavedAtMs++).toISOString(),
      };
      snapshots.push(snapshot);
      return structuredClone(snapshot);
    },
  };
}

function makeSalesStorage(initialSales = [], initialMetadata = null) {
  let sales = structuredClone(initialSales);
  let metadata = structuredClone(initialMetadata);
  return {
    async read() { return { sales: structuredClone(sales), metadata: structuredClone(metadata) }; },
    async replace(nextSales, nextMetadata) {
      sales = structuredClone(nextSales);
      metadata = {
        schemaVersion: 1,
        key: 'last_successful_sync',
        lastSyncedAtUtc: '2026-10-22T16:30:00.000Z',
        generatedAtUtc: nextMetadata.generatedAtUtc || '',
        snapshotMaxId: nextMetadata.snapshotMaxId,
        totalCount: sales.length,
      };
      return { sales: structuredClone(sales), metadata: structuredClone(metadata) };
    },
    get sales() { return structuredClone(sales); },
    get metadata() { return structuredClone(metadata); },
  };
}

test('sessão importa para prévia em memória, mascara IDs e baixa cópia byte a byte do CSV', async () => {
  const saved = { document: globalThis.document, window: globalThis.window, URL: globalThis.URL, Blob: globalThis.Blob };
  const local = installLocalStorage();
  const downloads = { blobs: [], links: [], revoked: [] };
  class BlobStub {
    constructor(parts, options) { this.parts = parts; this.type = options.type; downloads.blobs.push(this); }
  }
  globalThis.Blob = BlobStub;
  globalThis.URL = {
    createObjectURL(blob) { return `blob:test-${downloads.blobs.indexOf(blob)}`; },
    revokeObjectURL(url) { downloads.revoked.push(url); },
  };
  globalThis.window = { setTimeout(callback) { callback(); } };
  globalThis.document = {
    body: { append(link) { downloads.links.push(link); } },
    createElement(tag) {
      assert.equal(tag, 'a');
      return { click() { this.clicked = true; }, remove() { this.removed = true; } };
    },
  };

  try {
    const root = makeRoot();
    const controller = mount({ root });
    const headerStart = root.innerHTML.indexOf('class="tracking-intro-head"');
    const configStart = root.innerHTML.indexOf('id="trackingConnectionConfig"');
    const csvActionsStart = root.innerHTML.indexOf('<div class="tracking-actions">', configStart);
    const conversionProfileStart = root.innerHTML.indexOf('class="tracking-conversion-profile"', configStart);
    const conversionProfileEnd = root.innerHTML.indexOf('</section>', conversionProfileStart);
    const configEnd = root.innerHTML.indexOf('</div>', conversionProfileEnd);
    const refreshAction = root.innerHTML.indexOf('data-tracking-action="refresh-server"');
    const disconnectAction = root.innerHTML.indexOf('data-tracking-action="disconnect"');
    const configMarkup = root.innerHTML.slice(configStart, csvActionsStart);
    assert.ok(headerStart >= 0 && root.innerHTML.includes('data-tracking-action="toggle-connection-config"') && configStart > headerStart, 'o controle de configurações fica no cabeçalho da seção');
    assert.match(root.innerHTML.slice(configStart), /id="trackingConnectionConfig" class="tracking-connection-config" hidden/);
    assert.ok(refreshAction > configStart && disconnectAction > refreshAction, 'ações de conexão ficam agrupadas dentro da configuração recolhida');
    assert.ok(csvActionsStart > configStart && configMarkup.includes('class="tracking-conversion-profile"'), 'o perfil de conversão fica dentro das configurações recolhidas, antes das ações de CSV');
    assert.ok(conversionProfileStart > configStart && conversionProfileEnd > conversionProfileStart && csvActionsStart > configEnd, 'o bloco de perfil fica oculto com o painel e os controles de CSV ficam fora dele');
    assert.match(root.innerHTML, /aria-expanded="false"[^>]*>Exibir configurações<\/button>/);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'toggle-connection-config' } }) } });
    assert.match(root.innerHTML, /id="trackingConnectionConfig" class="tracking-connection-config">/);
    assert.match(root.innerHTML, /aria-expanded="true"[^>]*>Recolher configurações<\/button>/);
    assert.match(root.innerHTML.slice(root.innerHTML.indexOf('id="trackingConnectionConfig"')), /Token de acesso do Hub/);
    assert.match(root.innerHTML.slice(root.innerHTML.indexOf('id="trackingConnectionConfig"'), root.innerHTML.indexOf('<div class="tracking-actions">')), /Ação de conversão · vendas INS v8/);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'toggle-connection-config' } }) } });
    assert.match(root.innerHTML, /id="trackingConnectionConfig" class="tracking-connection-config" hidden/);
    assert.match(root.innerHTML, /id="trackingInstructionalText" class="tracking-session tracking-instructions-hidden"/);
    assert.match(root.innerHTML, /data-tracking-action="toggle-instructions" aria-label="Exibir instruções" aria-controls="trackingInstructionalText" aria-pressed="false"/);
    assert.match(root.innerHTML, /aria-expanded="false"[^>]*>Exibir configurações<\/button>/);
    assert.match(root.innerHTML, /Importar CSV já baixado/);
    assert.match(root.innerHTML, /Atualizar do servidor/);
    assert.match(root.innerHTML, /Baixar CSV para Google Ads/);
    assert.match(root.innerHTML, /A leitura é somente para conferência e preparação; o Hub não envia dados ao Google Ads\./);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'toggle-instructions' } }) } });
    assert.match(root.innerHTML, /id="trackingInstructionalText" class="tracking-session tracking-instructions-visible"/);
    assert.match(root.innerHTML, /aria-label="Ocultar instruções" aria-controls="trackingInstructionalText" aria-pressed="true"/);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'toggle-instructions' } }) } });
    assert.match(root.innerHTML, /id="trackingInstructionalText" class="tracking-session tracking-instructions-hidden"/);
    assert.match(root.innerHTML, /aria-label="Exibir instruções" aria-controls="trackingInstructionalText" aria-pressed="false"/);
    assert.doesNotMatch(root.innerHTML, /flow\s*tracking/i, 'a tela Tracking não deve mencionar a Flow Tracking');
    assert.match(root.innerHTML, /tracking-config\.php/);
    assert.match(root.innerHTML, /tracking_hub_api_token/);
    const tokenNote = root.innerHTML.match(/<p id="trackingTokenNote"[\s\S]*?<\/p>/)?.[0] || '';
    assert.match(tokenNote, /tracking-config\.php/);
    assert.match(tokenNote, /tracking_hub_api_token/);
    assert.doesNotMatch(tokenNote, /É diferente do token de postback|sem criptografia|backup JSON|Authorization|Origem autorizada|127\.0\.0\.1/i);
    assert.match(root.innerHTML, /sem criptografia/i);
    assert.equal(root.rememberField.checked, true);

    await root.fire('change', { target: { id: 'trackingCsvFile', files: [{
      name: 'clickbank-google-ads.csv', size: Buffer.byteLength(csv), text: async () => csv,
    }] } });
    assert.match(root.innerHTML, /Registros no arquivo/);
    assert.match(root.innerHTML, /1\.00/);
    assert.match(root.innerHTML, /CjwK…6789/);
    assert.doesNotMatch(root.innerHTML, /CjwKCA_real_click_id_123456789/);
    assert.match(root.innerHTML, /data-tracking-action="download"/);
    assert.doesNotMatch(root.innerHTML, /data-tracking-action="download" disabled/);

    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'download' } }) } });
    assert.equal(downloads.blobs.length, 1);
    assert.equal(downloads.blobs[0].parts[0], csv);
    assert.equal(downloads.blobs[0].type, 'text/csv;charset=utf-8');
    assert.equal(downloads.links[0].download, 'clickbank-google-ads.csv');
    assert.equal(downloads.links[0].clicked, true);
    assert.equal(downloads.revoked.length, 1);
    assert.match(root.innerHTML, /cópia exata/);

    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'clear' } }) } });
    assert.match(root.innerHTML, /Aguardando CSV/);
    assert.match(root.innerHTML, /Leitura removida desta sessão/);
    assert.equal(controller, mount({ root }), 'reentrar na rota reutiliza a mesma sessão e não duplica o mount');
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.URL = saved.URL;
    globalThis.Blob = saved.Blob;
    local.restore();
  }
});

test('gera configuração SMTP somente por download, sem salvar senha no navegador', async () => {
  const saved = { document: globalThis.document, window: globalThis.window, URL: globalThis.URL, Blob: globalThis.Blob };
  const local = installLocalStorage();
  const downloads = { blobs: [], links: [] };
  class BlobStub {
    constructor(parts, options) { this.parts = parts; this.type = options.type; downloads.blobs.push(this); }
  }
  globalThis.Blob = BlobStub;
  globalThis.URL = { createObjectURL: () => 'blob:email-config', revokeObjectURL() {} };
  globalThis.window = { setTimeout(callback) { callback(); } };
  globalThis.document = {
    body: { append(link) { downloads.links.push(link); } },
    createElement() { return { click() {}, remove() {} }; },
  };
  const secret = "synthetic-smtp-'password\\$";
  try {
    const root = makeRoot();
    mount({ root });
    assert.match(root.innerHTML, /Notificações de venda por e-mail/);
    assert.match(root.innerHTML, /id="trackingEmailConfigFields" class="tracking-email-config-body" hidden/);
    assert.match(root.innerHTML, /data-tracking-action="toggle-email-config" aria-controls="trackingEmailConfigFields" aria-expanded="false" title="Mostrar ou recolher as configurações de e-mail">Configurar/);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'toggle-email-config' } }) } });
    assert.match(root.innerHTML, /id="trackingEmailConfigFields" class="tracking-email-config-body"[>]/);
    assert.match(root.innerHTML, /aria-expanded="true" title="Mostrar ou recolher as configurações de e-mail">Recolher/);
    assert.match(root.innerHTML, /TESTE/);
    assert.match(root.innerHTML, /localStorage/);
    assert.match(root.innerHTML, /data-tracking-action="download-email-config"/);
    assert.match(root.innerHTML, /fora de <code>public_html/);
    for (const [id, value] of [
      ['trackingEmailRecipient', 'notify@example.invalid'],
      ['trackingEmailSender', 'alerts@example.invalid'],
      ['trackingEmailSmtpHost', 'smtp.example.invalid'],
      ['trackingEmailSmtpPort', '465'],
      ['trackingEmailSmtpUsername', 'alerts@example.invalid'],
      ['trackingEmailSmtpPassword', secret],
    ]) {
      await root.fire('input', { target: { id, value } });
    }
    await root.fire('change', { target: { id: 'trackingEmailSmtpSecurity', value: 'ssl' } });
    assert.equal(local.values.has(TRACKING_TOKEN_STORAGE_KEY), false);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'download-email-config' } }) } });

    assert.equal(downloads.blobs.length, 1);
    assert.equal(downloads.links[0].download, 'clickbank-email-config.php');
    const escapedSecret = secret.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
    assert.ok(downloads.blobs[0].parts[0].includes(escapedSecret), 'the generated private file must contain the safely escaped SMTP password');
    assert.equal(root.emailFields.get('trackingEmailSmtpPassword').value, '', 'password is cleared from the UI after download');
    assert.match(root.innerHTML, /baixado.*contém a senha SMTP/i);
    assert.deepEqual([...local.values.values()], [], 'no e-mail configuration or credential is written to localStorage');
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'toggle-email-config' } }) } });
    assert.match(root.innerHTML, /id="trackingEmailConfigFields" class="tracking-email-config-body" hidden/);
    assert.match(root.innerHTML, /aria-expanded="false" title="Mostrar ou recolher as configurações de e-mail">Configurar/);
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.URL = saved.URL;
    globalThis.Blob = saved.Blob;
    local.restore();
  }
});

test('a view não faz fetch direto nem lê/grava IndexedDB ou localStorage', async () => {
  const [view, service, storage] = await Promise.all([
    readFile(new URL('../src/tracking/tracking-view.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-service.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-token-storage.mjs', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(view, /\bfetch\s*\(|XMLHttpRequest|globalThis\.indexedDB|sessionStorage|globalThis\.localStorage|localStorage\.(?:getItem|setItem|removeItem)/);
  assert.match(view, /fetchTrackingReport/);
  assert.doesNotMatch(service, /localStorage|sessionStorage|indexedDB/);
  assert.match(storage, /localStorage/);
  assert.doesNotMatch(storage, /indexedDB|sessionStorage/);
});

test('só consulta o relatório agregado ao clicar, permite filtrar produto sem expor IDs', async () => {
  const savedFetch = globalThis.fetch;
  const local = installLocalStorage();
  const requests = [];
  const clicksStorage = makeClicksStorage();
  const token = 'd'.repeat(64);
  let pageViews = 3;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        ok: true, schema_version: 1, generated_at_utc: '2026-10-21T20:00:00Z',
        start_date: '2026-10-01', end_date: '2026-10-30', count_semantics: 'events_not_unique_visitors',
        rows: [
          { date_utc: '2026-10-21', product_key: 'metabo-zinvero', presell_host: 'metabo.zinvero.shop', page_views: pageViews, outbound_clicks: 1 },
          { date_utc: '2026-10-20', product_key: 'product-a', presell_host: 'a.example.com', page_views: 5, outbound_clicks: 2 },
        ],
      }),
    };
  };
  try {
    const root = makeRoot();
    const controller = mount({ root, clicksStorage });
    await controller.ready;
    assert.equal(requests.length, 0, 'Opening the screen must not trigger a remote query.');
    assert.match(root.innerHTML, /Tracking de visitas e cliques/);
    assert.match(root.innerHTML, /UTC/);
    assert.match(root.innerHTML, /type="text" inputmode="numeric"[^>]*placeholder="dd\/mm\/aaaa"/);
    assert.match(root.innerHTML, /Formato brasileiro: <strong>dd\/mm\/aaaa<\/strong>/);
    assert.doesNotMatch(root.innerHTML, /id="trackingClicks(?:Start|End)Date" type="date"/);
    await root.fire('input', { target: { id: 'trackingApiToken', value: token } });
    assert.equal(requests.length, 0);
    root.clicksStartDateField.value = '31/02/2026';
    root.clicksEndDateField.value = '30/10/2026';
    await root.fire('input', { target: { id: 'trackingClicksStartDate', value: '31/02/2026' } });
    await root.fire('input', { target: { id: 'trackingClicksEndDate', value: '30/10/2026' } });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-clicks' } }) } });
    assert.equal(requests.length, 0, 'Invalid Brazilian dates must not query using a stale ISO range.');
    assert.match(root.innerHTML, /datas válidas no formato dd\/mm\/aaaa/i);

    root.clicksStartDateField.value = '01/10/2026';
    root.clicksEndDateField.value = '30/10/2026';
    await root.fire('input', { target: { id: 'trackingClicksStartDate', value: '01/10/2026' } });
    await root.fire('input', { target: { id: 'trackingClicksEndDate', value: '30/10/2026' } });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-clicks' } }) } });
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /tracking-clicks-report\.php$/);
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.body, JSON.stringify({ start_date: '2026-10-01', end_date: '2026-10-30' }));
    assert.match(root.innerHTML, /Eventos de visita · page_view/);
    assert.match(root.innerHTML, /Eventos de saída · outbound_click/);
    assert.match(root.innerHTML, /metabo\.zinvero\.shop/);
    assert.match(root.innerHTML, /São contados eventos, não visitantes únicos/);
    assert.match(root.innerHTML, /Atualização salva no cache local/);
    assert.equal(clicksStorage.snapshots.length, 1);
    assert.doesNotMatch(root.innerHTML, new RegExp(token));

    root.clicksProductFilterField.value = 'p:product-a';
    await root.fire('change', { target: { id: 'trackingClicksProductFilter', value: 'p:product-a' } });
    const table = root.innerHTML.match(/<table class="tracking-table tracking-clicks-table">([\s\S]*?)<\/table>/)?.[1] || '';
    assert.match(table, /a\.example\.com/);
    assert.doesNotMatch(table, /metabo\.zinvero\.shop/);
    assert.match(table, /<td class="tracking-number">5<\/td>/);

    pageViews = 4;
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-clicks' } }) } });
    assert.equal(clicksStorage.snapshots.length, 2, 'atualizações ficam como snapshots independentes');
    assert.match(root.innerHTML, /Cache local atualizado:/);
    assert.match(root.innerHTML, /<td class="tracking-number">4<\/td>/);

    const restoredRoot = makeRoot();
    const restoredController = mount({ root: restoredRoot, clicksStorage });
    await restoredController.ready;
    assert.equal(requests.length, 2, 'reabrir não consulta o servidor');
    restoredRoot.clicksStartDateField.value = '01/10/2026';
    restoredRoot.clicksEndDateField.value = '30/10/2026';
    await restoredRoot.fire('input', { target: { id: 'trackingClicksStartDate', value: '01/10/2026' } });
    await restoredRoot.fire('input', { target: { id: 'trackingClicksEndDate', value: '30/10/2026' } });
    await restoredRoot.fire('change', { target: { id: 'trackingClicksEndDate', value: '30/10/2026' } });
    assert.equal(requests.length, 2, 'trocar o período usa os snapshots locais');
    assert.match(restoredRoot.innerHTML, /Cache local carregado/);
    assert.match(restoredRoot.innerHTML, /<td class="tracking-number">4<\/td>/);

    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'disconnect' } }) } });
    assert.match(root.innerHTML, /Relatório ainda não consultado/);
  } finally {
    globalThis.fetch = savedFetch;
    local.restore();
  }
});

test('atualiza do servidor em memória, exibe só IDs mascarados e desconecta limpando o token', async () => {
  const savedFetch = globalThis.fetch;
  const local = installLocalStorage();
  const requests = [];
  const token = 'a'.repeat(64);
  const serverReport = {
    ok: true,
    schema_version: 1,
    generated_at_utc: '2026-10-15T18:22:09Z',
    window_days: 90,
    product_scope: 'all_tracked_products',
    product_breakdown_available: false,
    conversion_name: 'Conversão compra off-line (upload)',
    candidate_count: 2,
    eligible_count: 1,
    ignored_count: 1,
    skipped_by_reason: { synthetic_gclid: 1 },
    value_by_currency: { USD: '1.00' },
    preview: [{
      conversion_time: '2026-10-15 18:22:09+0000',
      conversion_name: 'Conversão compra off-line (upload)',
      conversion_value: '1.00',
      conversion_currency: 'USD',
      google_click_id_masked: 'Real…6789',
      order_id_masked: 'ORDE…6789',
    }],
    download_available: true,
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => serverReport };
  };

  try {
    const root = makeRoot();
    const controller = mount({ root });
    await controller.ready;
    await root.fire('input', { target: { id: 'trackingApiToken', value: token } });
    assert.equal(local.values.get(TRACKING_TOKEN_STORAGE_KEY), token);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-server' } }) } });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://track.travenzo.shop/google-ads-report.php');
    assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
    assert.match(root.innerHTML, /2 postback\(s\) avaliados/);
    assert.match(root.innerHTML, /todos os produtos rastreados/);
    assert.match(root.innerHTML, /Real…6789/);
    assert.doesNotMatch(root.innerHTML, /RealClickIdExample123456789|ORDER-123456789/);

    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'not_authorized' }),
    });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-server' } }) } });
    assert.match(root.innerHTML, /Token não autorizado/i);
    assert.match(root.innerHTML, /Aguardando CSV/);
    assert.match(root.innerHTML, /data-tracking-action="download" disabled/);

    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'disconnect' } }) } });
    assert.equal(root.tokenField.value, '');
    assert.equal(root.rememberField.checked, false);
    assert.equal(local.values.has(TRACKING_TOKEN_STORAGE_KEY), false);
    assert.match(root.innerHTML, /Token removido da memória e do armazenamento local/i);
    assert.match(root.innerHTML, /Aguardando CSV/);
  } finally {
    globalThis.fetch = savedFetch;
    local.restore();
  }
});

test('restaura o token salvo entre montagens e permite apagar a persistência sem desconectar', async () => {
  const local = installLocalStorage();
  const token = 'b'.repeat(64);
  try {
    const firstRoot = makeRoot();
    mount({ root: firstRoot });
    await firstRoot.fire('input', { target: { id: 'trackingApiToken', value: token } });
    assert.equal(local.values.get(TRACKING_TOKEN_STORAGE_KEY), token);
    assert.doesNotMatch(firstRoot.innerHTML, new RegExp(token));
    assert.match(firstRoot.innerHTML, /~\/tracking-config\.php/);
    assert.doesNotMatch(firstRoot.innerHTML, /~\/domains\/travenzo\.shop\/tracking-config\.php/);
    assert.match(firstRoot.innerHTML, /tracking_hub_api_token/);

    const secondRoot = makeRoot();
    mount({ root: secondRoot });
    assert.equal(secondRoot.tokenField.value, token);
    assert.equal(secondRoot.rememberField.checked, true);
    assert.match(secondRoot.storageStatus.textContent, /lembrado neste navegador/i);

    await secondRoot.fire('change', { target: { id: 'trackingRememberToken', checked: false } });
    assert.equal(local.values.has(TRACKING_TOKEN_STORAGE_KEY), false);
    assert.equal(secondRoot.tokenField.value, token, 'desmarcar deixa o token utilizável na sessão atual');
    assert.equal(secondRoot.rememberField.checked, false);
    assert.match(secondRoot.storageStatus.textContent, /somente nesta aba/i);

    await secondRoot.fire('change', { target: { id: 'trackingRememberToken', checked: true } });
    assert.equal(local.values.get(TRACKING_TOKEN_STORAGE_KEY), token);
  } finally {
    local.restore();
  }
});

test('consulta a trilha INS v8, mostra itens multi-produto e só cria CSV após clique explícito', async () => {
  const saved = { fetch: globalThis.fetch, document: globalThis.document, window: globalThis.window, URL: globalThis.URL, Blob: globalThis.Blob };
  const local = installLocalStorage();
  const requests = [];
  const downloads = { blobs: [], links: [] };
  const token = 'c'.repeat(64);
  const report = {
    ok: true,
    schema_version: 1,
    source: 'clickbank_ins_v8',
    generated_at_utc: '2026-10-18T19:10:00Z',
    conversion_name: null,
    candidate_count: 2,
    test_count: 1,
    sale_count: 1,
    eligible_count: 1,
    ignored_count: 1,
    skipped_by_reason: { test_transaction: 1 },
    value_by_currency: { USD: '12.3456' },
    product_scope: 'all_clickbank_products',
    product_breakdown_available: true,
    preview: [
      {
        transaction_time_utc: '2026-10-18 19:06:28+0000',
        transaction_type: 'TEST', role: 'AFFILIATE', is_test: true,
        commission_total: '0.0000', sale_gross_total: '0.0000', commission_currency: 'USD',
        receipt_id_masked: 'TEST…9876', gclid_masked: 'TEST…1234', gclid_source: 'explicit',
        commission_reconciliation_status: 'unavailable', eligible: false, ineligibility_reason: 'test_transaction', line_items: [],
      },
      {
        transaction_time_utc: '2026-10-18 19:08:00+0000',
        transaction_type: 'SALE', role: 'AFFILIATE', is_test: false,
        customer_country: 'BR', conversion_name: null,
        commission_total: '12.3456', sale_gross_total: '100.0000', commission_currency: 'USD',
        receipt_id_masked: 'ORDE…2345', gclid_masked: 'Real…6789', gclid_source: 'extclid_join',
        commission_reconciliation_status: 'matched', eligible: true, ineligibility_reason: null,
        line_items: [
          { item_no: 'SKU-1', title: 'Produto principal', type: 'ORIGINAL', quantity: '1.000', commission_amount: '8.0000', product_price: '80.0000', product_discount: '0.0000' },
          { item_no: 'SKU-BUMP', title: 'Complemento', type: 'BUMP', quantity: '1.000', commission_amount: '4.3456', product_price: '20.0000', product_discount: '0.0000' },
        ],
      },
    ],
    download_available: true,
  };
  class BlobStub {
    constructor(parts, options) { this.parts = parts; this.type = options.type; downloads.blobs.push(this); }
  }
  globalThis.Blob = BlobStub;
  globalThis.URL = { createObjectURL: () => 'blob:ins-v8', revokeObjectURL() {} };
  globalThis.window = { setTimeout(callback) { callback(); } };
  globalThis.document = {
    body: { append(link) { downloads.links.push(link); } },
    createElement() { return { click() { this.clicked = true; }, remove() {} }; },
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('clickbank-ins-v8-report.php')) return { ok: true, json: async () => report };
    return { ok: true, headers: { get: () => 'text/csv; charset=utf-8' }, blob: async () => new BlobStub(['CSV'], { type: 'text/csv;charset=utf-8' }) };
  };

  try {
    const root = makeRoot();
    const controller = mount({ root });
    await controller.ready;
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'new-conversion-profile' } }) } });
    root.conversionProfileLabelField.value = 'MCC Principal';
    root.conversionActionNameField.value = 'Compra ClickBank - MCC 1';
    await root.fire('input', { target: { id: 'trackingConversionProfileLabel', value: root.conversionProfileLabelField.value } });
    await root.fire('input', { target: { id: 'trackingConversionActionName', value: root.conversionActionNameField.value } });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'save-conversion-profile' } }) } });
    assert.match(root.innerHTML, /MCC Principal/);
    assert.match(root.innerHTML, /Compra ClickBank - MCC 1/);
    assert.match(root.innerHTML, /salvo e selecionado neste navegador/i);
    assert.ok(local.values.has(TRACKING_CONVERSION_PROFILES_STORAGE_KEY));
    const restoredProfileRoot = makeRoot();
    const restoredController = mount({ root: restoredProfileRoot });
    await restoredController.ready;
    assert.equal(restoredProfileRoot.conversionActionNameField.value, 'Compra ClickBank - MCC 1');
    assert.equal(restoredProfileRoot.conversionProfileLabelField.value, 'MCC Principal');
    assert.match(restoredProfileRoot.innerHTML, /Perfil de exportação restaurado deste navegador/);
    await root.fire('input', { target: { id: 'trackingApiToken', value: token } });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-ins-v8' } }) } });
    assert.equal(requests.length, 1, 'consultar apenas lê o relatório e não baixa nem envia CSV automaticamente');
    assert.equal(requests[0].url, 'https://track.travenzo.shop/clickbank-ins-v8-report.php');
    assert.match(root.innerHTML, /2 transação\(ões\) capturada\(s\)/);
    assert.match(root.innerHTML, /TEST IPN/);
    assert.match(root.innerHTML, /Produto principal/);
    assert.match(root.innerHTML, /Complemento/);
    assert.match(root.innerHTML, /12,3456/);
    assert.match(root.innerHTML, /País \(cobrança\)/);
    assert.match(root.innerHTML, /Brasil \(BR\)/);
    assert.match(root.innerHTML, /Ação de conversão/);
    assert.match(root.innerHTML, /MCC Principal · Compra ClickBank - MCC 1/);
    assert.match(root.innerHTML, /Horário UTC/);
    assert.match(root.innerHTML, /2026-10-18 19:08:00\+0000/);
    assert.match(root.innerHTML, /perfil selecionado define o nome da ação somente no CSV gerado/);
    const csvSafetyNote = root.innerHTML.match(/<p class="tracking-scope-note(?: [^"]+)?">([\s\S]*?)<\/p>/)?.[1] || '';
    assert.equal(csvSafetyNote, 'O Hub não grava a base operacional nem envia conversões ao Google Ads. O CSV INS v8 é somente preparado e baixado manualmente. Não reenvie linhas já aceitas.');
    assert.doesNotMatch(root.innerHTML, /flow\s*tracking/i);
    assert.doesNotMatch(root.innerHTML, /FullUnmaskedGclid|ORDER-REAL-12345/);
    assert.doesNotMatch(root.innerHTML, new RegExp(token));

    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'download' } }) } });
    assert.equal(requests.length, 2, 'o CSV só é solicitado depois da ação manual');
    assert.equal(requests[1].url, 'https://track.travenzo.shop/clickbank-ins-v8-csv.php');
    assert.equal(requests[1].options.headers.Authorization, `Bearer ${token}`);
    assert.equal(requests[1].options.method, 'POST');
    assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
    assert.equal(requests[1].options.body, JSON.stringify({ conversion_name: 'Compra ClickBank - MCC 1' }));
    assert.equal(downloads.links[0].download, 'clickbank-ins-v8-mcc-principal.csv');
    assert.match(root.innerHTML, /CSV preparado para “MCC Principal” com a ação “Compra ClickBank - MCC 1”/);
    assert.match(root.innerHTML, /não foi enviado ao Google Ads/);
    assert.doesNotMatch(root.innerHTML, /flow\s*tracking/i);
  } finally {
    globalThis.fetch = saved.fetch;
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.URL = saved.URL;
    globalThis.Blob = saved.Blob;
    local.restore();
  }
});

test('cadastra novo domínio pela tela Tracking lembrando token administrativo e permissão opcional de www', async () => {
  const savedFetch = globalThis.fetch;
  const local = installLocalStorage();
  const requests = [];
  const highlightTimers = [];
  const adminToken = 'd'.repeat(64);
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ ok: true, product_key: 'metabo-drops-zinvero', product_label: 'Metabo Drops - Zinvero', added: ['presell.example', 'www.presell.example'], updated: [], already_allowed: [] }) };
  };
  try {
    const root = makeRoot();
    mount({
      root,
      setTimeoutFn(callback, delay) {
        highlightTimers.push({ callback, delay });
        return highlightTimers.length;
      },
      clearTimeoutFn() {},
    });
    assert.match(root.innerHTML, /<h2>Tracks<\/h2>/);
    assert.match(root.innerHTML, /aria-label="Tracks cadastradas"/);
    assert.match(root.innerHTML, /\d+ Tracks? na tabela/);
    assert.match(root.innerHTML, /id="trackingDomainAdminConfig" class="tracking-domain-admin-config" hidden/);
    assert.match(root.innerHTML, /data-tracking-action="toggle-domain-config" aria-controls="trackingDomainAdminConfig" aria-expanded="false" title="[^"]*">Exibir configurações/);
    assert.match(root.innerHTML, /data-tracking-action="load-domains" title="Consulta no servidor a lista autorizada de Tracks \(domínios e produtos\), atualiza a tabela e o cache local\. Não cadastra nem altera domínios\."/);
    assert.match(root.innerHTML, /tracking-domain-admin-config\.php/);
    const domainConfigStart = root.innerHTML.indexOf('id="trackingDomainAdminConfig"');
    const notificationUrlIndex = root.innerHTML.indexOf('class="tracking-ins-v8-url"', domainConfigStart);
    const domainFormIndex = root.innerHTML.indexOf('<div class="tracking-domain-form">', domainConfigStart);
    assert.ok(notificationUrlIndex > domainConfigStart && notificationUrlIndex < domainFormIndex, 'a URL INS v8 fica dentro da área recolhível e antes do formulário de domínios');
    assert.match(root.innerHTML, /<span>Instant Notification URL · ClickBank \(INS v8\)<\/span>\s*<code>https:\/\/track\.travenzo\.shop\/clickbank-ins-v8\.php<\/code>/);
    assert.match(root.innerHTML, /É diferente do Custom Postback\/Pixels\./);
    assert.match(root.innerHTML, /fora de <code>public_html/);
    assert.match(root.innerHTML, /Lembrar token administrativo neste navegador/);
    assert.match(root.innerHTML, /localStorage/);
    assert.match(root.innerHTML, /sem criptografia/);
    assert.match(root.innerHTML, /<th>Domínio<\/th><th>Nome do Track<\/th><th class="tracking-sales-count">Vendas \(SALE\)<\/th><th>Tag<\/th>/);
    assert.match(root.innerHTML, /for="trackingDomainProductKey"><span>Nome do Track<\/span>/);
    assert.doesNotMatch(root.innerHTML, /data-tracking-action="show-presell-tag"/);
    assert.doesNotMatch(root.innerHTML, /id="trackingPresellScript"|data-tracking-action="copy-presell-script"/);
    assert.doesNotMatch(root.innerHTML, /flow\s*tracking/i);
    assert.doesNotMatch(root.innerHTML, /data-track-outbound|data-track-clickbank/);

    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'toggle-domain-config' } }) } });
    assert.match(root.innerHTML, /id="trackingDomainAdminConfig" class="tracking-domain-admin-config">/);
    assert.ok(root.innerHTML.indexOf('class="tracking-ins-v8-url"') < root.innerHTML.indexOf('<div class="tracking-domain-form">'));
    assert.match(root.innerHTML, /aria-expanded="true" title="O token atual também serve para cadastrar domínios; só é preciso substituir a configuração privada ao trocar o token ou migrar o servidor\.\">Recolher configurações/);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'toggle-domain-config' } }) } });
    assert.match(root.innerHTML, /id="trackingDomainAdminConfig" class="tracking-domain-admin-config" hidden/);
    assert.ok(root.innerHTML.includes('https://track.travenzo.shop/clickbank-ins-v8.php'), 'a URL permanece no painel, oculto junto com as configurações');
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'toggle-domain-config' } }) } });
    await root.fire('input', { target: { id: 'trackingDomainAdminToken', value: adminToken } });
    await root.fire('input', { target: { id: 'trackingDomainName', value: 'Presell.Example' } });
    await root.fire('input', { target: { id: 'trackingDomainProductKey', value: 'Totalcontrol -' } });
    assert.match(root.productKeyPreviewField.textContent, /deve começar e terminar com letra ou número/);
    await root.fire('input', { target: { id: 'trackingDomainProductKey', value: 'Metabo Drops - Zinvero' } });
    assert.equal(root.productKeyPreviewField.textContent, 'Identificador técnico: metabo-drops-zinvero');
    await root.fire('change', { target: { id: 'trackingDomainIncludeWww', checked: true } });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'add-domain' } }) } });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://track.travenzo.shop/tracking-domains.php');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers.Authorization, `Bearer ${adminToken}`);
    assert.equal(requests[0].options.body, JSON.stringify({ domain: 'presell.example', include_www: true, product_key: 'metabo-drops-zinvero', product_label: 'Metabo Drops - Zinvero' }));
    assert.equal(local.values.get(TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY), adminToken, 'the administrative token is stored only under its dedicated key');
    assert.equal(local.values.has(TRACKING_TOKEN_STORAGE_KEY), false, 'the sales token remains independent');
    assert.match(root.innerHTML, /Liberado: presell\.example, www\.presell\.example/);
    assert.match(root.innerHTML, /<td><code>presell\.example<\/code><\/td><td>Metabo Drops - Zinvero<\/td>/);
    assert.equal((root.innerHTML.match(/class="tracking-new-track-pulse"/g) || []).length, 2, 'as duas linhas realmente adicionadas, domínio e www, recebem destaque');
    assert.equal(highlightTimers[0].delay, 2250, 'o destaque dura os três pulsos de 0,72 s com uma pequena margem');
    assert.match(root.innerHTML, /data-presell-host="presell\.example"/);
    assert.match(root.innerHTML, /data-tracking-action="show-presell-tag"/);
    assert.doesNotMatch(root.innerHTML, /id="trackingPresellScript"/);
    assert.match(root.innerHTML, /Nome do Track “Metabo Drops - Zinvero” salvo no servidor e sincronizado neste navegador/);
    assert.doesNotMatch(root.innerHTML, new RegExp(adminToken));
    highlightTimers[0].callback();
    assert.doesNotMatch(root.innerHTML, /tracking-new-track-pulse/, 'a linha volta ao estilo normal quando os pulsos terminam');

    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, domains: [
      { page_host: 'presell.example', origin: 'https://presell.example', product_key: 'metabo-drops-zinvero' },
    ] }) });
    const reloadedRoot = makeRoot();
    mount({ root: reloadedRoot });
    await reloadedRoot.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'load-domains' } }) } });
    assert.match(reloadedRoot.innerHTML, /<td><code>presell\.example<\/code><\/td><td>Metabo Drops - Zinvero<\/td>/);
    assert.doesNotMatch(reloadedRoot.innerHTML, /id="trackingPresellScript"/);
  } finally {
    globalThis.fetch = savedFetch;
    local.restore();
  }
});

test('pisca a linha salva também quando o domínio foi atualizado ou já estava autorizado', async () => {
  const savedFetch = globalThis.fetch;
  const local = installLocalStorage();
  const adminToken = 'b'.repeat(64);
  const results = [
    { added: [], updated: ['existing.example'], already_allowed: [] },
    { added: [], updated: [], already_allowed: ['existing.example'] },
  ];
  const highlightTimers = [];
  let responseIndex = 0;
  local.values.set(TRACKING_DOMAIN_LIST_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    updatedAtUtc: '2026-10-23T10:00:00.000Z',
    domains: [{
      page_host: 'existing.example',
      origin: 'https://existing.example',
      product_key: 'existing-track',
      product_label: 'Existing Track',
      created_at_utc: '2026-10-22 12:00:00',
    }],
  }));
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      product_key: 'existing-track',
      product_label: 'Existing Track',
      ...results[responseIndex++],
    }),
  });

  try {
    for (const result of results) {
      const root = makeRoot();
      const timers = [];
      mount({
        root,
        setTimeoutFn(callback, delay) {
          timers.push({ callback, delay });
          highlightTimers.push({ callback, delay });
          return highlightTimers.length;
        },
        clearTimeoutFn() {},
      });
      await root.fire('input', { target: { id: 'trackingDomainAdminToken', value: adminToken } });
      await root.fire('input', { target: { id: 'trackingDomainName', value: 'existing.example' } });
      await root.fire('input', { target: { id: 'trackingDomainProductKey', value: 'Existing Track' } });
      await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'add-domain' } }) } });

      assert.match(root.innerHTML, /<tr class="tracking-new-track-pulse"><td><code>existing\.example<\/code><\/td>/);
      assert.equal(timers.length, 1, 'cada salvamento iniciado aciona um ciclo de destaque');
      assert.equal(timers[0].delay, 2250, 'a linha permanece destacada durante três pulsos de 0,72 s');
      timers[0].callback();
      assert.doesNotMatch(root.innerHTML, /tracking-new-track-pulse/, 'o destaque é removido após os três pulsos');
    }
    assert.equal(responseIndex, 2, 'o teste cobre respostas de atualização e de domínio já autorizado');
  } finally {
    globalThis.fetch = savedFetch;
    local.restore();
  }
});

test('abre configurações administrativas quando atualizar ou cadastrar exige um token ausente', async () => {
  const root = makeRoot();
  mount({ root });
  assert.match(root.innerHTML, /id="trackingDomainAdminConfig" class="tracking-domain-admin-config" hidden/);
  await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'load-domains' } }) } });
  assert.match(root.innerHTML, /id="trackingDomainAdminConfig" class="tracking-domain-admin-config">/);
  assert.match(root.innerHTML, /aria-expanded="true"/);
  assert.match(root.innerHTML, /Informe o token administrativo separado do token de acesso às vendas/);
});

test('restaura a última lista de domínios sem fetch e só consulta o servidor após clique explícito', async () => {
  const savedFetch = globalThis.fetch;
  const local = installLocalStorage();
  const requests = [];
  const adminToken = 'e'.repeat(64);
  let responseDomains = [
    { page_host: 'metabo.zinvero.shop', origin: 'https://metabo.zinvero.shop', product_key: 'metabo-zinvero' },
  ];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ ok: true, domains: responseDomains }) };
  };

  try {
    const firstRoot = makeRoot();
    mount({ root: firstRoot });
    assert.equal(requests.length, 0, 'mounting must not refresh the server list');
    await firstRoot.fire('input', { target: { id: 'trackingDomainAdminToken', value: adminToken } });
    await firstRoot.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'load-domains' } }) } });
    assert.equal(requests.length, 1);
    assert.match(firstRoot.innerHTML, /Cache local atualizado em/);
    const savedSnapshot = local.values.get(TRACKING_DOMAIN_LIST_STORAGE_KEY);
    assert.ok(savedSnapshot);
    assert.doesNotMatch(savedSnapshot, new RegExp(adminToken));
    assert.match(savedSnapshot, /metabo\.zinvero\.shop/);

    responseDomains = [
      ...responseDomains,
      { page_host: 'new-product.example', origin: 'https://new-product.example', product_key: 'product-b' },
    ];
    const restoredRoot = makeRoot();
    mount({ root: restoredRoot });
    assert.equal(requests.length, 1, 'mounting a new view must use local cache, not call the endpoint');
    assert.match(restoredRoot.innerHTML, /<td><code>metabo\.zinvero\.shop<\/code><\/td><td>metabo-zinvero<\/td>/);
    assert.match(restoredRoot.innerHTML, /Lista restaurada do navegador/);
    assert.match(restoredRoot.innerHTML, /Cache local atualizado em/);
    assert.match(restoredRoot.innerHTML, /<th>Domínio<\/th><th>Nome do Track<\/th><th class="tracking-sales-count">Vendas \(SALE\)<\/th><th>Tag<\/th>/);
    assert.doesNotMatch(restoredRoot.innerHTML, /id="trackingPresellScript"/);

    await restoredRoot.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'load-domains' } }) } });
    assert.equal(requests.length, 2, 'only the explicit refresh click reaches the server');
    assert.match(restoredRoot.innerHTML, /new-product\.example/);
    assert.match(local.values.get(TRACKING_DOMAIN_LIST_STORAGE_KEY), /new-product\.example/);
    assert.doesNotMatch(restoredRoot.innerHTML, new RegExp(adminToken));
  } finally {
    globalThis.fetch = savedFetch;
    local.restore();
  }
});

test('restaura o token administrativo entre montagens e o botão Esquecer apaga sua cópia local', async () => {
  const local = installLocalStorage();
  const adminToken = 'a'.repeat(64);
  try {
    const firstRoot = makeRoot();
    mount({ root: firstRoot });
    assert.equal(firstRoot.rememberDomainTokenField.checked, true);
    await firstRoot.fire('input', { target: { id: 'trackingDomainAdminToken', value: adminToken } });
    assert.equal(local.values.get(TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY), adminToken);
    assert.match(firstRoot.domainTokenStorageStatus.textContent, /lembrado neste navegador/);

    const secondRoot = makeRoot();
    mount({ root: secondRoot });
    assert.equal(secondRoot.domainTokenField.value, adminToken);
    assert.equal(secondRoot.rememberDomainTokenField.checked, true);
    assert.match(secondRoot.innerHTML, /Token administrativo lembrado neste navegador/);

    await secondRoot.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'clear-domain-token' } }) } });
    assert.equal(local.values.has(TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY), false);
    assert.equal(secondRoot.domainTokenField.value, '');
    assert.equal(secondRoot.rememberDomainTokenField.checked, false);
    assert.match(secondRoot.innerHTML, /Token administrativo removido desta aba e do armazenamento local/);
    assert.match(secondRoot.innerHTML, /Opção desativada: o token administrativo fica somente nesta aba/);
  } finally {
    local.restore();
  }
});

test('permite esquecer um token administrativo armazenado com formato inválido', async () => {
  const local = installLocalStorage(new Map([[TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY, 'inválido']]));
  try {
    const root = makeRoot();
    mount({ root });
    assert.match(root.innerHTML, /O valor salvo não tem o formato esperado/);
    assert.match(root.innerHTML, /data-tracking-action="clear-domain-token"(?! disabled)/);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'clear-domain-token' } }) } });
    assert.equal(local.values.has(TRACKING_DOMAIN_ADMIN_TOKEN_STORAGE_KEY), false);
  } finally {
    local.restore();
  }
});

test('exibe a tag somente após clique, copia por ação separada e fecha de volta para a tabela', async () => {
  const local = installLocalStorage();
  const copied = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, domains: [
    { page_host: 'presell.example', origin: 'https://presell.example', product_key: 'product-a' },
  ] }) });
  try {
    const root = makeRoot();
    mount({ root, clipboard: { async writeText(value) { copied.push(value); } } });
    await root.fire('input', { target: { id: 'trackingDomainAdminToken', value: 'd'.repeat(64) } });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'load-domains' } }) } });
    assert.doesNotMatch(root.innerHTML, /id="trackingPresellScript"/);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'show-presell-tag', presellHost: 'presell.example' } }) } });
    assert.match(root.innerHTML, /role="dialog" aria-modal="true"/);
    assert.match(root.innerHTML, /id="trackingPresellScript"/);
    assert.match(root.innerHTML, /data-product-key=&quot;product-a&quot;/);
    assert.match(root.innerHTML, /data-tracking-action="copy-presell-script"/);
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'copy-presell-script' } }) } });

    assert.equal(copied.length, 1);
    assert.match(copied[0], /^<script src="https:\/\/track\.travenzo\.shop\/track\.js"/);
    assert.match(copied[0], /data-product-key="product-a"/);
    assert.match(copied[0], /data-presell-host="presell\.example"/);
    assert.doesNotMatch(copied[0], /crossorigin/i);
    assert.match(root.domainMessageStatus.textContent, /Tag copiada/);
    assert.doesNotMatch(root.domainMessageStatus.textContent, /flow\s*tracking/i);
    assert.match(root.innerHTML, /id="trackingPresellScript"/, 'copiar a tag não fecha a janela');
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'close-presell-tag' } }) } });
    assert.doesNotMatch(root.innerHTML, /id="trackingPresellScript"|role="dialog" aria-modal="true"/);
    assert.match(root.innerHTML, /<td><code>presell\.example<\/code><\/td>/, 'fechar retorna à tabela sem apagar a lista');
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'show-presell-tag', presellHost: 'presell.example' } }) } });
    let escapePrevented = false;
    await root.fire('keydown', { key: 'Escape', preventDefault() { escapePrevented = true; } });
    assert.equal(escapePrevented, true);
    assert.doesNotMatch(root.innerHTML, /id="trackingPresellScript"|role="dialog" aria-modal="true"/, 'Esc também fecha e devolve a tabela');
  } finally {
    globalThis.fetch = savedFetch;
    local.restore();
  }
});

test('atualiza cliques e vendas automaticamente ao ativar Tracking, respeita cadências e não grava no cache local', async () => {
  const savedFetch = globalThis.fetch;
  const token = 'e'.repeat(64);
  const local = installLocalStorage(new Map([[TRACKING_TOKEN_STORAGE_KEY, token]]));
  const requests = [];
  const timers = [];
  const clicksStorage = makeClicksStorage();
  const salesStorage = makeSalesStorage();
  let visible = false;
  let pageViews = 2;
  globalThis.fetch = async (url, options) => {
    const request = { url: String(url), options };
    requests.push(request);
    if (request.url.includes('tracking-clicks-report.php')) {
      const range = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          ok: true, schema_version: 1, generated_at_utc: '2026-10-23T12:00:00Z',
          start_date: range.start_date, end_date: range.end_date, count_semantics: 'events_not_unique_visitors',
          rows: [{ date_utc: range.end_date, product_key: 'product-a', presell_host: 'a.example.com', page_views: pageViews, outbound_clicks: 1 }],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true, schema_version: 1, snapshot_max_id: '0', after_id: '0', next_after_id: '0',
        has_more: false, generated_at_utc: '2026-10-23T12:00:00Z', sales: [],
      }),
    };
  };
  try {
    const root = makeRoot();
    const controller = mount({
      root,
      clicksStorage,
      salesStorage,
      isTrackingViewVisibleFn: () => visible,
      nowFn: () => new Date('2026-10-23T12:00:00.000Z'),
      scheduleAutoRefreshFn(callback, delay) {
        const timer = { callback, delay, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearAutoRefreshFn(timer) { if (timer) timer.cleared = true; },
    });
    await controller.ready;
    assert.equal(requests.length, 0, 'montar a tela não consulta até ela ser ativada');
    assert.match(root.innerHTML, /a cada 5 minutos/);
    assert.match(root.innerHTML, /a cada 30 minutos/);
    assert.match(root.innerHTML, /Atualizar do servidor salva no cache local/);

    await controller.activate();
    assert.equal(requests.length, 0, 'Tracking oculto não consulta as APIs');
    visible = true;
    await controller.activate();
    assert.equal(requests.length, 2, 'ao abrir Tracking, consulta as duas APIs');
    assert.ok(requests.some(request => request.url.includes('tracking-clicks-report.php')));
    assert.ok(requests.some(request => request.url.includes('clickbank-ins-v8-sales.php')));
    assert.equal(clicksStorage.snapshots.length, 0, 'consulta automática não cria snapshots de cliques');
    assert.equal(salesStorage.sales.length, 0, 'consulta automática não substitui o cache de vendas');
    assert.match(root.innerHTML, /Busca automática concluída/);
    assert.match(root.innerHTML, /use Atualizar vendas para salvar no cache local/);
    assert.ok(timers.some(timer => timer.delay === TRACKING_CLICKS_AUTO_REFRESH_INTERVAL_MS));
    assert.ok(timers.some(timer => timer.delay === TRACKING_SALES_AUTO_REFRESH_INTERVAL_MS));

    const clicksTimer = timers.find(timer => timer.delay === TRACKING_CLICKS_AUTO_REFRESH_INTERVAL_MS && !timer.cleared);
    pageViews = 4;
    await clicksTimer.callback();
    clicksTimer.fired = true;
    assert.equal(requests.filter(request => request.url.includes('tracking-clicks-report.php')).length, 2);
    assert.equal(clicksStorage.snapshots.length, 0, 'repetições automáticas também não gravam snapshots');
    assert.match(root.innerHTML, /<td class="tracking-number">4<\/td>/);

    const salesTimer = timers.find(timer => timer.delay === TRACKING_SALES_AUTO_REFRESH_INTERVAL_MS && !timer.cleared);
    await salesTimer.callback();
    salesTimer.fired = true;
    assert.equal(requests.filter(request => request.url.includes('clickbank-ins-v8-sales.php')).length, 2);
    assert.equal(salesStorage.sales.length, 0, 'atualizações periódicas de vendas são somente em memória');

    const nextClicksTimer = timers.filter(timer => timer.delay === TRACKING_CLICKS_AUTO_REFRESH_INTERVAL_MS && !timer.cleared && !timer.fired).at(-1);
    visible = false;
    const hiddenRequestCount = requests.length;
    await nextClicksTimer.callback();
    nextClicksTimer.fired = true;
    assert.equal(requests.length, hiddenRequestCount, 'ocultar a tela pausa as consultas automáticas');
    visible = true;
    await controller.activate();
    assert.equal(requests.length, hiddenRequestCount + 2, 'voltar a Tracking faz uma nova consulta inicial às duas APIs');

    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'disconnect' } }) } });
    await root.fire('input', { target: { id: 'trackingApiToken', value: token } });
    assert.equal(requests.filter(request => request.url.includes('tracking-clicks-report.php')).length, 4, 'reconectar com token válido retoma a busca imediata');
    assert.equal(requests.filter(request => request.url.includes('clickbank-ins-v8-sales.php')).length, 4);
    assert.equal(clicksStorage.snapshots.length, 0);
    assert.equal(salesStorage.sales.length, 0);
  } finally {
    globalThis.fetch = savedFetch;
    local.restore();
  }
});

test('sincroniza vendas explicitamente, persiste o cache local e conta apenas o vínculo exato da Track', async () => {
  const local = installLocalStorage();
  const domainList = {
    schemaVersion: 1,
    updatedAtUtc: '2026-10-22T15:00:00.000Z',
    domains: [{ page_host: 'buy.example.com', origin: 'https://buy.example.com', product_key: 'product-a', created_at_utc: '2026-10-20 12:00:00' }],
  };
  local.values.set(TRACKING_DOMAIN_LIST_STORAGE_KEY, JSON.stringify(domainList));
  const savedFetch = globalThis.fetch;
  const requests = [];
  let shouldFail = false;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (shouldFail) return { ok: false, status: 503, json: async () => ({ ok: false, error: 'server_error' }) };
    return {
      ok: true,
      json: async () => ({
        ok: true,
        schema_version: 1,
        snapshot_max_id: '3',
        after_id: '0',
        next_after_id: '3',
        has_more: false,
        generated_at_utc: '2026-10-22T16:29:00Z',
        sales: [
          { transaction_id: '1', transaction_time_utc: '2026-10-22T10:00:00.000Z', attribution_status: 'matched', presell_host: 'buy.example.com', product_key: 'product-a' },
          { transaction_id: '2', transaction_time_utc: null, attribution_status: 'unmatched', presell_host: null, product_key: null },
          { transaction_id: '3', transaction_time_utc: null, attribution_status: 'ambiguous', presell_host: null, product_key: null },
        ],
      }),
    };
  };
  try {
    const salesStorage = makeSalesStorage();
    const root = makeRoot();
    const controller = mount({ root, salesStorage });
    await controller.ready;
    assert.equal(requests.length, 0, 'abrir a tela não consulta a rede');
    assert.match(root.innerHTML, /Tracks cadastradas, domínio, nome do Track e vendas/);
    assert.match(root.innerHTML, /<th class="tracking-sales-count">Vendas \(SALE\)<\/th>/);
    assert.match(root.innerHTML, /<td class="tracking-number tracking-sales-count" title="Sincronize as vendas para preencher esta contagem">—<\/td>/);

    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-track-sales' } }) } });
    assert.equal(requests.length, 0, 'sem token, deve solicitar a configuração local sem enviar requisição');
    assert.match(root.innerHTML, /Informe o token de acesso do Hub/);
    assert.match(root.innerHTML, /id="trackingConnectionConfig" class="tracking-connection-config"/);
    const token = 'f'.repeat(64);
    await root.fire('input', { target: { id: 'trackingApiToken', value: token } });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-track-sales' } }) } });
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /clickbank-ins-v8-sales\.php$/);
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.body, JSON.stringify({ after_id: '0', snapshot_max_id: null }));
    assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
    assert.doesNotMatch(JSON.stringify(requests[0].options), /extclid|gclid|receipt/i);
    assert.equal(salesStorage.sales.length, 3);
    assert.match(root.innerHTML, /<td class="tracking-number tracking-sales-count" title="1 venda\(s\) associada\(s\) por extclid a esta combinação exata de domínio e produto">1<\/td>/);
    assert.match(root.innerHTML, /1 venda\(s\) associada\(s\) a uma Track; 1 sem clique correspondente e 1 com mais de uma Track possível/);
    assert.match(root.innerHTML, /Última atualização:/);
    assert.doesNotMatch(root.innerHTML, new RegExp(token));

    shouldFail = true;
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-track-sales' } }) } });
    assert.equal(salesStorage.sales.length, 3, 'falha remota mantém o snapshot local anterior');
    assert.match(root.innerHTML, /O cache local anterior.*foi mantido/);
  } finally {
    globalThis.fetch = savedFetch;
    local.restore();
  }
});
