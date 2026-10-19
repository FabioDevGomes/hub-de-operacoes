import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_TRACKING_CSV_ROWS,
  maskTrackingIdentifier,
  normalizeClickBankInsV8Report,
  normalizeTrackingApiReport,
  parseGoogleAdsCsv,
  trackingIssueLabel,
} from '../src/tracking/tracking-domain.mjs';

const headers = [
  'Google Click ID', 'Conversion Name', 'Conversion Time',
  'Conversion Value', 'Conversion Currency', 'Order ID',
];

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function makeCsv(records, columns = headers) {
  return [columns, ...records.map(record => columns.map(column => record[column] ?? ''))]
    .map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const validRecord = {
  'Google Click ID': 'CjwKCA_real_click_id_123456789',
  'Conversion Name': 'Compra, "ClickBank"',
  'Conversion Time': '2026-10-15 18:22:09+0000',
  'Conversion Value': '0.00',
  'Conversion Currency': 'USD',
  'Order ID': 'ABC12345',
};

test('lê o CSV do exportador com aspas, vírgula decimal de apresentação e zero preservado, sem reescrever bytes', () => {
  const original = `\uFEFF${makeCsv([validRecord])}`;
  const report = parseGoogleAdsCsv(original);
  assert.equal(report.rawText, original);
  assert.equal(report.headers[0], 'Google Click ID');
  assert.equal(report.summary.totalRows, 1);
  assert.equal(report.summary.validRows, 1);
  assert.equal(report.summary.invalidRows, 0);
  assert.deepEqual([...report.summary.conversionNames], ['Compra, "ClickBank"']);
  assert.deepEqual({ ...report.summary.valueByCurrency }, { USD: '0.00' });
  assert.equal(report.rows[0].conversionValue, '0.00');
  assert.equal(report.downloadable, true);
});

test('soma valores da prévia com precisão decimal por moeda', () => {
  const rows = [
    { ...validRecord, 'Conversion Value': '0.10', 'Order ID': 'ORDER-1' },
    { ...validRecord, 'Conversion Value': '0.20', 'Order ID': 'ORDER-2' },
    { ...validRecord, 'Conversion Value': '2.00', 'Conversion Currency': 'BRL', 'Order ID': 'ORDER-3' },
  ];
  const report = parseGoogleAdsCsv(makeCsv(rows));
  assert.deepEqual({ ...report.summary.valueByCurrency }, { USD: '0.30', BRL: '2.00' });
});

test('aceita colunas fora de ordem e cabeçalhos adicionais sem alterar o texto original', () => {
  const columns = ['Order ID', 'Extra', ...headers.slice(0, 5)];
  const record = { ...validRecord, Extra: 'observação, não exibida' };
  const raw = makeCsv([record], columns);
  const report = parseGoogleAdsCsv(raw);
  assert.equal(report.rows[0].orderId, 'ABC12345');
  assert.equal(report.downloadable, true);
  assert.equal(report.rawText, raw);
});

test('identifica GCLID de teste e pedido duplicado e impede baixar arquivo inválido', () => {
  const first = { ...validRecord, 'Google Click ID': 'TEST-GCLID-123', 'Order ID': 'RECEIPT-1' };
  const second = { ...validRecord, 'Order ID': 'receipt-1' };
  const report = parseGoogleAdsCsv(makeCsv([first, second]));
  assert.equal(report.summary.totalRows, 2);
  assert.equal(report.summary.validRows, 0);
  assert.equal(report.summary.invalidRows, 2);
  assert.equal(report.rows[0].issues.includes('synthetic_gclid'), true);
  assert.equal(report.rows.every(row => row.issues.includes('duplicate_order_id')), true);
  assert.equal(report.downloadable, false);
  assert.equal(report.summary.skippedByReason.duplicate_order_id, 2);
  assert.equal(trackingIssueLabel('synthetic_gclid'), 'GCLID fictício/de teste');
});

test('bloqueia cabeçalhos obrigatórios ausentes, duplicados, linhas truncadas e CSV malformado', () => {
  assert.throws(() => parseGoogleAdsCsv('a,b\r\n1,2\r\n'), /faltam as colunas/);
  const duplicateHeaders = [...headers, 'Order ID'].join(',') + '\r\n';
  assert.throws(() => parseGoogleAdsCsv(duplicateHeaders), /Cabeçalho duplicado/);
  assert.throws(() => parseGoogleAdsCsv(`${headers.join(',')}\r\n${csvCell(validRecord['Google Click ID'])}\r\n`), /campos/);
  assert.throws(() => parseGoogleAdsCsv(`${headers.join(',')}\r\n"sem fechamento`), /não foi fechado/);
});

test('aponta campos inválidos sem transformar ausência em zero e valida data e moeda', () => {
  const record = {
    ...validRecord,
    'Google Click ID': '',
    'Conversion Time': '2026-02-30 18:22:09+0000',
    'Conversion Value': '',
    'Conversion Currency': 'usd',
    'Order ID': '',
  };
  const report = parseGoogleAdsCsv(makeCsv([record]));
  assert.equal(report.downloadable, false);
  assert.deepEqual([...report.rows[0].issues].sort(), [
    'invalid_conversion_time', 'invalid_conversion_value', 'invalid_currency', 'missing_gclid', 'missing_order_id',
  ]);
  assert.deepEqual({ ...report.summary.valueByCurrency }, {});
});

test('não permite CSV vazio ou acima do limite de linhas, e mascara identificadores na prévia', () => {
  assert.throws(() => parseGoogleAdsCsv(''), /vazio/);
  assert.throws(() => parseGoogleAdsCsv(headers.join(',') + '\r\n'), /não contém conversões/);
  const oversized = makeCsv(Array.from({ length: MAX_TRACKING_CSV_ROWS + 1 }, (_, index) => ({
    ...validRecord, 'Order ID': `ORDER-${index}`,
  })));
  assert.throws(() => parseGoogleAdsCsv(oversized), /ultrapassa o limite/);
  assert.equal(maskTrackingIdentifier('CjwKCA_real_click_id_123456789'), 'CjwK…6789');
  assert.equal(maskTrackingIdentifier('ABC12345'), '••••');
  assert.equal(maskTrackingIdentifier(''), '—');
});

test('valida relatório versionado do servidor e bloqueia identificadores sem máscara', () => {
  const payload = {
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
  const report = normalizeTrackingApiReport(payload);
  assert.equal(report.candidateCount, 3);
  assert.equal(report.downloadAvailable, true);
  assert.equal(report.preview[0].gclidMasked, 'Real…6789');
  assert.equal(report.productScope, 'all_tracked_products');

  assert.throws(() => normalizeTrackingApiReport({
    ...payload,
    preview: [{ ...payload.preview[0], google_click_id_masked: 'FullRealClickId123456789' }],
  }), /identificador não mascarado/i);
  assert.throws(() => normalizeTrackingApiReport({
    ...payload,
    preview: [{ ...payload.preview[0], google_click_id_masked: 'FullRealClickId…6789' }],
  }), /identificador não mascarado/i);
  assert.throws(() => normalizeTrackingApiReport({ ...payload, ignored_count: 0 }), /totais.*não conferem/i);
  assert.throws(() => normalizeTrackingApiReport({ ...payload, skipped_by_reason: {} }), /motivos ignorados.*não conferem/i);
});

test('preserva quatro casas decimais da comissão em CSV sem arredondar', () => {
  const report = parseGoogleAdsCsv(makeCsv([{
    ...validRecord,
    'Conversion Value': '12.3456',
  }]));
  assert.equal(report.downloadable, true);
  assert.equal(report.rows[0].conversionValue, '12.3456');
  assert.deepEqual({ ...report.summary.valueByCurrency }, { USD: '12.3456' });
});

test('valida o relatório INS v8, inclui eventos de teste no diagnóstico e mascara identificadores', () => {
  const payload = {
    ok: true,
    schema_version: 1,
    source: 'clickbank_ins_v8',
    generated_at_utc: '2026-10-18T19:06:30Z',
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
      },
      {
        transaction_time_utc: '2026-10-18 19:08:00+0000',
        transaction_type: 'SALE',
        role: 'AFFILIATE',
        is_test: false,
        commission_total: '12.3456',
        sale_gross_total: '100.0000',
        commission_currency: 'USD',
        receipt_id_masked: 'ORDE…2345',
        gclid_masked: 'Real…6789',
        gclid_source: 'extclid_join',
        commission_reconciliation_status: 'matched',
        eligible: true,
        ineligibility_reason: null,
        line_items: [
          { item_no: 'SKU-1', title: 'Produto principal', type: 'ORIGINAL', quantity: '1.000', commission_amount: '8.0000', product_price: '80.0000', product_discount: '0.0000' },
          { item_no: 'SKU-BUMP', title: 'Complemento', type: 'BUMP', quantity: '1.000', commission_amount: '4.3456', product_price: '20.0000', product_discount: '0.0000' },
        ],
      },
    ],
    download_available: true,
  };
  const report = normalizeClickBankInsV8Report(payload);
  assert.equal(report.candidateCount, 2);
  assert.equal(report.testCount, 1);
  assert.equal(report.eligibleCount, 1);
  assert.equal(report.preview[0].isTest, true);
  assert.equal(report.preview[1].lineItems.length, 2);
  assert.equal(report.preview[1].commissionTotal, '12.3456');
  assert.equal(report.valueByCurrency.USD, '12.3456');
  assert.equal(report.preview[1].gclidMasked, 'Real…6789');
  assert.equal(trackingIssueLabel(report.preview[0].ineligibilityReason), 'transação de teste — fora do CSV');
  assert.throws(() => normalizeClickBankInsV8Report({
    ...payload,
    preview: [{ ...payload.preview[1], gclid_masked: 'FullUnmaskedGclid' }, payload.preview[1]],
  }), /identificador não mascarado/i);
});
