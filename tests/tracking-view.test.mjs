import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { mount } from '../src/tracking/tracking-view.mjs';
import { TRACKING_TOKEN_STORAGE_KEY } from '../src/tracking/tracking-token-storage.mjs';

const csv = [
  'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID',
  'CjwKCA_real_click_id_123456789,"Compra ClickBank",2026-10-15 18:22:09+0000,1.00,USD,ABC12345',
].join('\r\n') + '\r\n';

function makeRoot() {
  const listeners = new Map();
  const storageStatus = { textContent: '', classList: { toggle() {} } };
  return {
    innerHTML: '',
    tokenField: { value: '' },
    rememberField: { checked: false },
    domainTokenField: { value: '' },
    domainNameField: { value: '' },
    domainIncludeWwwField: { checked: false },
    domainAdminTokenVisibleField: { checked: false },
    storageStatus,
    addEventListener(type, handler) { listeners.set(type, handler); },
    fire(type, event) { return listeners.get(type)?.(event); },
    querySelector(selector) {
      if (selector === '#trackingApiToken') return this.tokenField;
      if (selector === '#trackingRememberToken') return this.rememberField;
      if (selector === '#trackingTokenStorageStatus') return this.storageStatus;
      if (selector === '#trackingDomainAdminToken') return this.domainTokenField;
      if (selector === '#trackingDomainName') return this.domainNameField;
      if (selector === '#trackingDomainIncludeWww') return this.domainIncludeWwwField;
      if (selector === '#trackingDomainAdminTokenVisible') return this.domainAdminTokenVisibleField;
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
    const connectionStart = root.innerHTML.indexOf('class="tracking-connection"');
    const refreshAction = root.innerHTML.indexOf('data-tracking-action="refresh-server"');
    const disconnectAction = root.innerHTML.indexOf('data-tracking-action="disconnect"');
    assert.ok(headerStart >= 0 && refreshAction > headerStart && disconnectAction > refreshAction && disconnectAction < connectionStart, 'ações de conexão ficam no cabeçalho, antes do campo do token');
    assert.match(root.innerHTML, /Importar CSV já baixado/);
    assert.match(root.innerHTML, /Atualizar do servidor/);
    assert.match(root.innerHTML, /Baixar CSV para Google Ads/);
    assert.match(root.innerHTML, /tracking-config\.php/);
    assert.match(root.innerHTML, /tracking_hub_api_token/);
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

test('a view não faz fetch direto nem lê/grava IndexedDB ou localStorage', async () => {
  const [view, service, storage] = await Promise.all([
    readFile(new URL('../src/tracking/tracking-view.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-service.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-token-storage.mjs', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(view, /\bfetch\s*\(|XMLHttpRequest|indexedDB|localStorage|sessionStorage/);
  assert.match(view, /fetchTrackingReport/);
  assert.doesNotMatch(service, /localStorage|sessionStorage|indexedDB/);
  assert.match(storage, /localStorage/);
  assert.doesNotMatch(storage, /indexedDB|sessionStorage/);
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
    mount({ root });
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
    conversion_name: 'Venda afiliado ClickBank',
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
    mount({ root });
    await root.fire('input', { target: { id: 'trackingApiToken', value: token } });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'refresh-ins-v8' } }) } });
    assert.equal(requests.length, 1, 'consultar apenas lê o relatório e não baixa nem envia CSV automaticamente');
    assert.equal(requests[0].url, 'https://track.travenzo.shop/clickbank-ins-v8-report.php');
    assert.match(root.innerHTML, /2 transação\(ões\) capturada\(s\)/);
    assert.match(root.innerHTML, /TEST IPN/);
    assert.match(root.innerHTML, /Produto principal/);
    assert.match(root.innerHTML, /Complemento/);
    assert.match(root.innerHTML, /12,3456/);
    assert.match(root.innerHTML, /Flow Tracking continua intacta/);
    assert.doesNotMatch(root.innerHTML, /FullUnmaskedGclid|ORDER-REAL-12345/);
    assert.doesNotMatch(root.innerHTML, new RegExp(token));

    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'download' } }) } });
    assert.equal(requests.length, 2, 'o CSV só é solicitado depois da ação manual');
    assert.equal(requests[1].url, 'https://track.travenzo.shop/clickbank-ins-v8-csv.php');
    assert.equal(requests[1].options.headers.Authorization, `Bearer ${token}`);
    assert.equal(downloads.links[0].download, 'clickbank-ins-v8-google-ads.csv');
    assert.match(root.innerHTML, /não foi enviado ao Google Ads/);
  } finally {
    globalThis.fetch = saved.fetch;
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.URL = saved.URL;
    globalThis.Blob = saved.Blob;
    local.restore();
  }
});

test('cadastra novo domínio pela tela Tracking com token admin efêmero e permissão opcional de www', async () => {
  const savedFetch = globalThis.fetch;
  const local = installLocalStorage();
  const requests = [];
  const adminToken = 'd'.repeat(64);
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ ok: true, added: ['presell.example', 'www.presell.example'], already_allowed: [] }) };
  };
  try {
    const root = makeRoot();
    mount({ root });
    assert.match(root.innerHTML, /Domínios de pre-sell/);
    assert.match(root.innerHTML, /tracking-domain-admin-config\.php/);
    assert.match(root.innerHTML, /fora de <code>public_html/);

    await root.fire('input', { target: { id: 'trackingDomainAdminToken', value: adminToken } });
    await root.fire('input', { target: { id: 'trackingDomainName', value: 'Presell.Example' } });
    await root.fire('change', { target: { id: 'trackingDomainIncludeWww', checked: true } });
    await root.fire('click', { target: { closest: () => ({ dataset: { trackingAction: 'add-domain' } }) } });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://track.travenzo.shop/tracking-domains.php');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers.Authorization, `Bearer ${adminToken}`);
    assert.equal(requests[0].options.body, JSON.stringify({ domain: 'presell.example', include_www: true }));
    assert.equal(local.values.size, 0, 'the administrative token is never stored in localStorage');
    assert.match(root.innerHTML, /Liberado: presell\.example, www\.presell\.example/);
    assert.match(root.innerHTML, /presell\.example/);
    assert.doesNotMatch(root.innerHTML, new RegExp(adminToken));
  } finally {
    globalThis.fetch = savedFetch;
    local.restore();
  }
});
