import assert from 'node:assert/strict';
import test from 'node:test';
import {
  downloadClickBankInsV8Csv,
  downloadTrackingCsv,
  addTrackingDomain,
  fetchClickBankInsV8Report,
  fetchTrackingClicksReport,
  fetchTrackingDomains,
  fetchTrackingReport,
  fetchTrackingSalesPage,
  TRACKING_API_ENDPOINTS,
} from '../src/tracking/tracking-service.mjs';

const token = 'a'.repeat(64);
const reportPayload = {
  ok: true,
  schema_version: 1,
  generated_at_utc: '2026-10-15T18:22:09Z',
  window_days: 90,
  product_scope: 'all_tracked_products',
  product_breakdown_available: false,
  conversion_name: 'Conversão compra off-line (upload)',
  candidate_count: 3,
  eligible_count: 2,
  ignored_count: 1,
  skipped_by_reason: { synthetic_gclid: 1 },
  value_by_currency: { USD: '3.30' },
  preview: [{
    conversion_time: '2026-10-15 18:22:09+0000',
    conversion_name: 'Conversão compra off-line (upload)',
    conversion_value: '1.25',
    conversion_currency: 'USD',
    google_click_id_masked: 'Real…6789',
    order_id_masked: 'ORDE…6789',
  }],
  download_available: true,
};

test('consulta o endpoint fixo em HTTPS com bearer header efêmero e sem cookies/cache', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => reportPayload };
  };

  const report = await fetchTrackingReport(token, { fetchImpl });
  assert.equal(report.candidateCount, 3);
  assert.equal(report.eligibleCount, 2);
  assert.equal(report.preview[0].gclidMasked, 'Real…6789');
  assert.equal(requests[0].url, TRACKING_API_ENDPOINTS.report);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.mode, 'cors');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
  assert.doesNotMatch(requests[0].url, /[?&](?:token|auth)=/i);
});

test('bloqueia resposta JSON com identificadores completos ou totais inconsistentes', async () => {
  const rawIdPayload = structuredClone(reportPayload);
  rawIdPayload.preview[0].google_click_id_masked = 'FullUnmaskedClickIdentifier123';
  await assert.rejects(fetchTrackingReport(token, {
    fetchImpl: async () => ({ ok: true, json: async () => rawIdPayload }),
  }), /identificador não mascarado/i);

  const wrongTotals = structuredClone(reportPayload);
  wrongTotals.ignored_count = 0;
  await assert.rejects(fetchTrackingReport(token, {
    fetchImpl: async () => ({ ok: true, json: async () => wrongTotals }),
  }), /totais.*não conferem/i);
});

test('download solicita CSV sem cookies e rejeita token ausente ou erro HTTP sem revelar segredo', async () => {
  let request;
  const blob = new Blob(['Google Click ID,Order ID\r\n'], { type: 'text/csv;charset=utf-8' });
  const received = await downloadTrackingCsv(token, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, headers: { get: () => 'text/csv; charset=utf-8' }, blob: async () => blob };
    },
  });
  assert.equal(received, blob);
  assert.equal(request.url, TRACKING_API_ENDPOINTS.csv);
  assert.equal(request.options.credentials, 'omit');

  let called = false;
  await assert.rejects(fetchTrackingReport('', {
    fetchImpl: async () => { called = true; return null; },
  }), /token de 64 caracteres/i);
  assert.equal(called, false);

  await assert.rejects(fetchTrackingReport(token, {
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'not_authorized' }) }),
  }), /Token não autorizado/i);
});

test('consulta e baixa somente os endpoints dedicados ao INS v8 com o token no header', async () => {
  const requests = [];
  const insV8Report = {
    ok: true,
    schema_version: 1,
    source: 'clickbank_ins_v8',
    generated_at_utc: '2026-10-18T19:06:30Z',
    conversion_name: 'Venda afiliado ClickBank',
    candidate_count: 1,
    test_count: 1,
    sale_count: 0,
    eligible_count: 0,
    ignored_count: 1,
    skipped_by_reason: { test_transaction: 1 },
    value_by_currency: {},
    product_scope: 'all_clickbank_products',
    product_breakdown_available: true,
    preview: [{
      transaction_time_utc: '2026-10-18 19:06:28+0000',
      transaction_type: 'TEST',
      role: 'AFFILIATE',
      is_test: true,
      commission_total: '0.0000',
      sale_gross_total: '0.0000',
      commission_currency: 'USD',
      receipt_id_masked: 'TEST…9876',
      gclid_masked: 'TEST…1234',
      gclid_source: 'explicit',
      commission_reconciliation_status: 'unavailable',
      eligible: false,
      ineligibility_reason: 'test_transaction',
      line_items: [],
    }],
    download_available: false,
  };
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url === TRACKING_API_ENDPOINTS.insV8Report) return { ok: true, json: async () => insV8Report };
    return { ok: true, headers: { get: () => 'text/csv; charset=utf-8' }, blob: async () => new Blob(['csv']) };
  };

  const report = await fetchClickBankInsV8Report(token, { fetchImpl });
  assert.equal(report.productScope, 'all_clickbank_products');
  assert.equal(report.testCount, 1);
  assert.equal(report.preview[0].isTest, true);
  assert.equal(requests[0].url, TRACKING_API_ENDPOINTS.insV8Report);
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
  assert.equal(requests[0].options.cache, 'no-store');
  assert.doesNotMatch(requests[0].url, /[?&](?:token|auth)=/i);

  await downloadClickBankInsV8Csv(token, { conversionName: 'Ação MCC A', fetchImpl });
  assert.equal(requests[1].url, TRACKING_API_ENDPOINTS.insV8Csv);
  assert.equal(requests[1].options.credentials, 'omit');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
  assert.equal(requests[1].options.body, JSON.stringify({ conversion_name: 'Ação MCC A' }));
  assert.throws(() => downloadClickBankInsV8Csv(token, { fetchImpl }), /nome exato da ação/i);
});

test('lê e cadastra domínios pela API administrativa usando token separado, HTTPS e payload normalizado', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'GET') {
      return { ok: true, json: async () => ({ ok: true, domains: [
        { page_host: 'example.com', origin: 'https://example.com', product_key: 'product-a', created_at_utc: '2026-10-21 12:00:00' },
      ] }) };
    }
      return { ok: true, json: async () => ({ ok: true, product_key: 'product-a', product_label: 'Product A', added: ['example.com', 'www.example.com'], updated: [], already_allowed: [] }) };
  };
  const domains = await fetchTrackingDomains(token, { fetchImpl });
  assert.equal(domains[0].hostname, 'example.com');
  assert.equal(domains[0].productKey, 'product-a');
  assert.equal(requests[0].url, TRACKING_API_ENDPOINTS.domains);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);

  const saved = await addTrackingDomain(token, 'Example.com', { includeWww: true, productKey: 'product-a', productLabel: 'Product A', fetchImpl });
  assert.deepEqual(saved, { added: ['example.com', 'www.example.com'], updated: [], alreadyAllowed: [], productKey: 'product-a', productLabel: 'Product A' });
  assert.equal(requests[1].url, TRACKING_API_ENDPOINTS.domains);
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
  assert.equal(requests[1].options.body, JSON.stringify({ domain: 'example.com', include_www: true, product_key: 'product-a', product_label: 'Product A' }));
  assert.doesNotMatch(requests[1].url, /[?&](?:token|auth)=/i);

  let called = false;
  assert.throws(() => addTrackingDomain(token, 'http://example.com', { fetchImpl: async () => { called = true; } }), /HTTPS/i);
  assert.throws(() => addTrackingDomain(token, 'example.com', { productKey: 'bad@code', fetchImpl: async () => { called = true; } }));
  assert.equal(called, false, 'invalid domain input must be rejected before a request');
});

test('consulta relatório agregado de cliques por POST JSON, token Bearer e sem dados de visitante', async () => {
  const requests = [];
  const range = { startDate: '2026-10-01', endDate: '2026-10-31' };
  const payload = {
    ok: true,
    schema_version: 1,
    generated_at_utc: '2026-10-21T20:00:00Z',
    start_date: range.startDate,
    end_date: range.endDate,
    count_semantics: 'events_not_unique_visitors',
    rows: [{ date_utc: '2026-10-21', product_key: 'metabo-zinvero', presell_host: 'metabo.zinvero.shop', page_views: 3, outbound_clicks: 1 }],
  };
  const report = await fetchTrackingClicksReport(token, range, {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => payload };
    },
  });
  assert.deepEqual(report.rows[0], {
    dateUtc: '2026-10-21', productKey: 'metabo-zinvero', presellHost: 'metabo.zinvero.shop', pageViews: 3, outboundClicks: 1,
  });
  assert.equal(requests[0].url, TRACKING_API_ENDPOINTS.clicksReport);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.equal(requests[0].options.body, JSON.stringify({ start_date: range.startDate, end_date: range.endDate }));
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.doesNotMatch(requests[0].url, /[?&](?:token|auth)=/i);

  let called = false;
  assert.throws(() => fetchTrackingClicksReport(token, { startDate: 'bad', endDate: range.endDate }, {
    fetchImpl: async () => { called = true; },
  }), /UTC válido/i);
  assert.equal(called, false, 'An invalid range is rejected before the network request.');

  const unexpectedData = structuredClone(payload);
  unexpectedData.rows[0].gclid = 'must-not-be-returned';
  await assert.rejects(fetchTrackingClicksReport(token, range, {
    fetchImpl: async () => ({ ok: true, json: async () => unexpectedData }),
  }), /campos não permitidos/i);
});

test('consulta páginas de vendas por POST autenticado e valida vínculo sem enviar cursor na URL', async () => {
  const requests = [];
  const payload = {
    ok: true,
    schema_version: 1,
    snapshot_max_id: '20',
    after_id: '10',
    next_after_id: '12',
    has_more: false,
    generated_at_utc: '2026-10-20T12:02:00Z',
    sales: [{
      transaction_id: '12',
      transaction_time_utc: '2026-10-20T12:00:00.123Z',
      attribution_status: 'matched',
      presell_host: 'buy.example.com',
      product_key: 'product-a',
    }],
  };
  const page = await fetchTrackingSalesPage(token, {
    afterId: '10',
    snapshotMaxId: null,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => payload };
    },
  });
  assert.equal(page.sales[0].transactionId, '12');
  assert.equal(page.sales[0].presellHost, 'buy.example.com');
  assert.equal(requests[0].url, TRACKING_API_ENDPOINTS.sales);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.equal(requests[0].options.body, JSON.stringify({ after_id: '10', snapshot_max_id: null }));
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.doesNotMatch(requests[0].url, /[?&](?:token|auth|cursor)=/i);
  const unexpected = structuredClone(payload);
  unexpected.sales[0].extclid = 'private';
  await assert.rejects(fetchTrackingSalesPage(token, {
    afterId: '10', fetchImpl: async () => ({ ok: true, json: async () => unexpected }),
  }), /campos inesperados/i);
  let called = false;
  assert.throws(() => fetchTrackingSalesPage(token, { afterId: 10, fetchImpl: async () => { called = true; } }), /cursor de vendas/i);
  assert.throws(() => fetchTrackingSalesPage(token, { afterId: '18446744073709551616', fetchImpl: async () => { called = true; } }), /cursor de vendas/i);
  assert.equal(called, false);
});
