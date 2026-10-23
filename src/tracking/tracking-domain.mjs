export const MAX_TRACKING_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_TRACKING_CSV_ROWS = 5000;

export const REQUIRED_GOOGLE_ADS_HEADERS = Object.freeze([
  'Google Click ID',
  'Conversion Name',
  'Conversion Time',
  'Conversion Value',
  'Conversion Currency',
  'Order ID',
]);

const ISSUE_LABELS = Object.freeze({
  unmatched_click: 'sem clique correspondente',
  missing_gclid: 'GCLID vazio',
  synthetic_gclid: 'GCLID fictício/de teste',
  invalid_or_missing_time: 'horário ausente ou inválido',
  conversion_before_click: 'conversão anterior ao clique',
  outside_90_day_window: 'fora da janela de 90 dias',
  missing_or_invalid_affiliate_earnings: 'comissão ausente ou inválida',
  missing_or_invalid_currency: 'moeda ausente ou inválida',
  missing_order_identifier: 'identificador do pedido vazio',
  not_initial_purchase: 'evento diferente de compra inicial',
  missing_conversion_name: 'nome da conversão vazio',
  invalid_conversion_time: 'data/hora inválida',
  invalid_conversion_value: 'valor inválido',
  invalid_currency: 'moeda inválida',
  missing_order_id: 'identificador do pedido vazio',
  duplicate_order_id: 'pedido duplicado no arquivo',
  test_transaction: 'transação de teste — fora do CSV',
  wrong_source: 'origem diferente de INS v8',
  not_affiliate: 'evento não recebido no papel de afiliado',
  not_sale: 'evento diferente de venda',
  invalid_or_missing_time: 'horário UTC ausente ou inválido',
  missing_or_invalid_commission: 'comissão ausente ou inválida',
  missing_or_invalid_currency: 'moeda ausente ou inválida',
  unsupported_currency: 'moeda inesperada; revisar antes do CSV',
  missing_order_identifier: 'recibo vazio',
  unresolved_gclid: 'GCLID sem fonte de atribuição validada',
  attribution_conflict: 'conflito entre fontes de atribuição',
  commission_mismatch: 'comissão total difere da soma dos itens',
  commission_reconciliation_pending: 'reconciliação da comissão pendente',
  duplicate_receipt: 'recibo repetido; fora do CSV',
});

function parseCsvMatrix(source) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  let started = false;

  const pushField = () => {
    row.push(field);
    field = '';
    afterQuote = false;
    started = true;
  };
  const pushRow = () => {
    pushField();
    if (row.some(value => value !== '')) rows.push(row);
    row = [];
    started = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ',') {
        pushField();
      } else if (character === '\r' || character === '\n') {
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        pushRow();
      } else {
        throw new Error('CSV inválido: há conteúdo depois de um campo entre aspas.');
      }
      continue;
    }

    if (character === '"') {
      if (field !== '') throw new Error('CSV inválido: aspas dentro de um campo sem escape.');
      inQuotes = true;
      started = true;
    } else if (character === ',') {
      pushField();
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      if (started || row.length) pushRow();
    } else {
      field += character;
      started = true;
    }
  }

  if (inQuotes) throw new Error('CSV inválido: campo entre aspas não foi fechado.');
  if (started || row.length || field !== '' || afterQuote) pushRow();
  return rows;
}

function validConversionTime(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{4}|[+-]\d{2}:\d{2})$/);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, zone] = match;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (calendar.getUTCFullYear() !== Number(year)
      || calendar.getUTCMonth() !== Number(month) - 1
      || calendar.getUTCDate() !== Number(day)
      || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
  const normalized = zone === 'Z' ? 'Z' : zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  return Number.isFinite(Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${normalized}`));
}

function validateRecord(record) {
  const issues = [];
  const gclid = String(record['Google Click ID'] ?? '').trim();
  if (!gclid) issues.push('missing_gclid');
  else if (/^(?:TEST|FAKE|DUMMY)(?:[-_]|$)/i.test(gclid)) issues.push('synthetic_gclid');

  if (!String(record['Conversion Name'] ?? '').trim()) issues.push('missing_conversion_name');
  if (!validConversionTime(record['Conversion Time'])) issues.push('invalid_conversion_time');

  const value = String(record['Conversion Value'] ?? '').trim();
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(value)) issues.push('invalid_conversion_value');

  const currency = String(record['Conversion Currency'] ?? '').trim();
  if (!/^[A-Z]{3}$/.test(currency)) issues.push('invalid_currency');

  const orderId = String(record['Order ID'] ?? '').trim();
  if (!orderId) issues.push('missing_order_id');
  return { issues, orderId, value, currency };
}

/** Parse and locally validate the exact CSV produced by the server exporter.
 * The returned rows are a read-only projection; `rawText` remains untouched for download.
 */
export function parseGoogleAdsCsv(text) {
  const rawText = String(text ?? '');
  const source = rawText.replace(/^\uFEFF/, '');
  if (!source.trim()) throw new Error('O arquivo CSV está vazio.');

  const matrix = parseCsvMatrix(source);
  if (!matrix.length) throw new Error('O CSV não contém cabeçalho.');
  const headers = matrix.shift().map(value => value.trim());
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length) throw new Error(`Cabeçalho duplicado no CSV: ${[...new Set(duplicates)].join(', ')}.`);
  const missing = REQUIRED_GOOGLE_ADS_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new Error(`Este não parece ser o CSV do exportador: faltam as colunas ${missing.join(', ')}.`);

  const dataRows = matrix.filter(values => values.some(value => value !== ''));
  if (dataRows.length === 0) throw new Error('O CSV tem cabeçalho, mas não contém conversões.');
  if (dataRows.length > MAX_TRACKING_CSV_ROWS) throw new Error(`O arquivo ultrapassa o limite de ${MAX_TRACKING_CSV_ROWS} linhas.`);

  const rows = dataRows.map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`A linha ${index + 2} tem ${values.length} campos; eram esperados ${headers.length}.`);
    }
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    const checked = validateRecord(record);
    return {
      rowNumber: index + 2,
      conversionTime: record['Conversion Time'],
      conversionName: record['Conversion Name'],
      conversionValue: record['Conversion Value'],
      currency: record['Conversion Currency'],
      gclid: record['Google Click ID'],
      orderId: checked.orderId,
      issues: checked.issues,
    };
  });

  const orderRows = new Map();
  for (const row of rows) {
    if (!row.orderId || row.issues.includes('missing_order_id')) continue;
    const key = row.orderId.toLocaleLowerCase('en-US');
    orderRows.set(key, [...(orderRows.get(key) || []), row]);
  }
  for (const matchingRows of orderRows.values()) {
    if (matchingRows.length > 1) matchingRows.forEach(row => row.issues.push('duplicate_order_id'));
  }

  const validRows = rows.filter(row => row.issues.length === 0);
  const valueUnitsByCurrency = {};
  for (const row of validRows) {
    const [whole, fraction = ''] = row.conversionValue.split('.');
    const units = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
    valueUnitsByCurrency[row.currency] = (valueUnitsByCurrency[row.currency] || 0n) + units;
  }
  const valueByCurrency = Object.fromEntries(Object.entries(valueUnitsByCurrency).map(([currency, units]) => {
    return [currency, formatDecimalUnits(units, 4, 2)];
  }));
  const skippedByReason = {};
  for (const row of rows) {
    for (const issue of row.issues) skippedByReason[issue] = (skippedByReason[issue] || 0) + 1;
  }

  return Object.freeze({
    rawText,
    headers: Object.freeze(headers),
    rows: Object.freeze(rows.map(row => Object.freeze({ ...row, issues: Object.freeze([...row.issues]) }))),
    summary: Object.freeze({
      totalRows: rows.length,
      validRows: validRows.length,
      invalidRows: rows.length - validRows.length,
      conversionNames: Object.freeze([...new Set(rows.map(row => row.conversionName).filter(Boolean))]),
      currencies: Object.freeze(Object.keys(valueByCurrency).sort()),
      valueByCurrency: Object.freeze(valueByCurrency),
      skippedByReason: Object.freeze(skippedByReason),
    }),
    downloadable: rows.length > 0 && validRows.length === rows.length,
  });
}

export function trackingIssueLabel(code) {
  return ISSUE_LABELS[code] || 'dado inválido';
}

export function maskTrackingIdentifier(value) {
  const identifier = String(value ?? '').trim();
  if (!identifier) return '—';
  if (identifier.length <= 8) return '••••';
  return `${identifier.slice(0, 4)}…${identifier.slice(-4)}`;
}

function nonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Relatório do servidor inválido (${field}).`);
  return value;
}

function maskedServerIdentifier(value, field) {
  if (typeof value !== 'string' || !/^(?:.{4}….{4}|••••|—)$/u.test(value)) {
    throw new Error(`O servidor enviou um identificador não mascarado (${field}); a prévia foi bloqueada.`);
  }
  return value;
}

function formatDecimalUnits(units, scale = 4, minimumFractionDigits = 2) {
  const numeric = BigInt(units);
  const factor = 10n ** BigInt(scale);
  const whole = numeric / factor;
  let fraction = (numeric % factor).toString().padStart(scale, '0');
  while (fraction.length > minimumFractionDigits && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return `${whole}.${fraction.padEnd(minimumFractionDigits, '0')}`;
}

function nullableApiText(value, field, maxLength) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > maxLength) throw new Error(`Campo ${field} inválido na prévia INS v8.`);
  return value;
}

function nullableApiDecimal(value, field, pattern = /^\d{1,10}\.\d{4}$/) {
  if (value === null) return null;
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`Valor ${field} inválido na prévia INS v8.`);
  return value;
}

/** Validate the privacy-reduced report for the independent INS v8 receiver. */
export function normalizeClickBankInsV8Report(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.ok !== true || value.schema_version !== 1
      || value.source !== 'clickbank_ins_v8'
      || value.product_scope !== 'all_clickbank_products'
      || value.product_breakdown_available !== true) {
    throw new Error('Resposta incompatível da API ClickBank INS v8.');
  }

  const candidateCount = nonNegativeInteger(value.candidate_count, 'candidate_count');
  const testCount = nonNegativeInteger(value.test_count, 'test_count');
  const saleCount = nonNegativeInteger(value.sale_count, 'sale_count');
  const eligibleCount = nonNegativeInteger(value.eligible_count, 'eligible_count');
  const ignoredCount = nonNegativeInteger(value.ignored_count, 'ignored_count');
  if (testCount > candidateCount || saleCount > candidateCount
      || eligibleCount > candidateCount || ignoredCount !== candidateCount - eligibleCount) {
    throw new Error('Os totais do relatório INS v8 não conferem.');
  }
  const reportConversionName = value.conversion_name === undefined || value.conversion_name === null
    ? null
    : nullableApiText(value.conversion_name, 'conversion_name', 255);
  if (reportConversionName !== null && !reportConversionName.trim()) {
    throw new Error('O relatório INS v8 informou uma ação de conversão inválida.');
  }
  if (typeof value.generated_at_utc !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.generated_at_utc)
      || !Number.isFinite(Date.parse(value.generated_at_utc))) {
    throw new Error('O relatório INS v8 não informou um horário válido.');
  }
  if (!value.skipped_by_reason || typeof value.skipped_by_reason !== 'object' || Array.isArray(value.skipped_by_reason)) {
    throw new Error('O relatório INS v8 não informou os motivos de exclusão.');
  }
  const skippedByReason = Object.fromEntries(Object.entries(value.skipped_by_reason).map(([reason, count]) => [
    reason,
    nonNegativeInteger(count, `skipped_by_reason.${reason}`),
  ]));
  if (Object.values(skippedByReason).reduce((total, count) => total + count, 0) !== ignoredCount) {
    throw new Error('Os motivos de exclusão do relatório INS v8 não conferem.');
  }
  if (!value.value_by_currency || typeof value.value_by_currency !== 'object' || Array.isArray(value.value_by_currency)) {
    throw new Error('O relatório INS v8 não informou a comissão elegível por moeda.');
  }
  const valueByCurrency = Object.fromEntries(Object.entries(value.value_by_currency).map(([currency, amount]) => {
    if (!/^[A-Z]{3}$/.test(currency) || typeof amount !== 'string' || !/^\d{1,18}\.\d{4}$/.test(amount)) {
      throw new Error('O relatório INS v8 enviou um total de comissão inválido.');
    }
    return [currency, amount];
  }));
  if (!Array.isArray(value.preview) || value.preview.length > 100 || value.preview.length > candidateCount) {
    throw new Error('A prévia INS v8 excede o limite permitido.');
  }

  const preview = value.preview.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Transação ${index + 1} da prévia INS v8 inválida.`);
    if (typeof row.transaction_time_utc !== 'string' && row.transaction_time_utc !== null) {
      throw new Error(`Horário da transação ${index + 1} inválido.`);
    }
    if (row.transaction_time_utc !== null && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+0000$/.test(row.transaction_time_utc)) {
      throw new Error(`Horário UTC da transação ${index + 1} inválido.`);
    }
    const transactionType = nullableApiText(row.transaction_type, 'transaction_type', 48);
    const role = nullableApiText(row.role, 'role', 32);
    const country = row.customer_country === undefined
      ? null
      : nullableApiText(row.customer_country, 'customer_country', 2);
    if (country !== null && !/^[A-Z]{2}$/.test(country)) {
      throw new Error(`País da transação ${index + 1} inválido.`);
    }
    const conversionName = row.conversion_name === undefined
      ? null
      : nullableApiText(row.conversion_name, 'conversion_name', 255);
    if (!transactionType || !role || typeof row.is_test !== 'boolean' || typeof row.eligible !== 'boolean') {
      throw new Error(`Estado da transação ${index + 1} inválido.`);
    }
    if (row.eligible !== (row.ineligibility_reason === null)) {
      throw new Error(`Elegibilidade da transação ${index + 1} inconsistente.`);
    }
    const reason = nullableApiText(row.ineligibility_reason, 'ineligibility_reason', 64);
    if (!['explicit', 'extclid_join', 'aff_sub1', 'unresolved', 'conflict'].includes(row.gclid_source)) {
      throw new Error(`Fonte de atribuição da transação ${index + 1} inválida.`);
    }
    if (!['matched', 'mismatch', 'unavailable', 'pending'].includes(row.commission_reconciliation_status)) {
      throw new Error(`Reconciliação da comissão da transação ${index + 1} inválida.`);
    }
    if (typeof row.commission_currency !== 'string'
        || (row.commission_currency !== '' && !/^[A-Z]{3}$/.test(row.commission_currency))) {
      throw new Error(`Moeda da transação ${index + 1} inválida.`);
    }
    if (!Array.isArray(row.line_items) || row.line_items.length > 100) {
      throw new Error(`Itens da transação ${index + 1} inválidos.`);
    }
    const lineItems = row.line_items.map((item, itemIndex) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Item ${itemIndex + 1} da transação ${index + 1} inválido.`);
      const quantity = item.quantity;
      if (quantity !== null && (typeof quantity !== 'string' || !/^\d{1,9}(?:\.\d{1,3})?$/.test(quantity))) {
        throw new Error(`Quantidade do item ${itemIndex + 1} inválida.`);
      }
      return Object.freeze({
        itemNo: nullableApiText(item.item_no, 'item_no', 128),
        title: nullableApiText(item.title, 'title', 512),
        type: nullableApiText(item.type, 'type', 32),
        quantity,
        commissionAmount: nullableApiDecimal(item.commission_amount, 'commission_amount'),
        productPrice: nullableApiDecimal(item.product_price, 'product_price'),
        productDiscount: nullableApiDecimal(item.product_discount, 'product_discount'),
      });
    });
    return Object.freeze({
      transactionTime: row.transaction_time_utc,
      transactionType,
      role,
      isTest: row.is_test,
      customerCountry: country,
      conversionName,
      commissionTotal: nullableApiDecimal(row.commission_total, 'commission_total'),
      saleGrossTotal: nullableApiDecimal(row.sale_gross_total, 'sale_gross_total'),
      currency: row.commission_currency,
      receiptMasked: maskedServerIdentifier(row.receipt_id_masked, 'recibo'),
      gclidMasked: maskedServerIdentifier(row.gclid_masked, 'GCLID'),
      gclidSource: row.gclid_source,
      reconciliationStatus: row.commission_reconciliation_status,
      eligible: row.eligible,
      ineligibilityReason: reason,
      lineItems: Object.freeze(lineItems),
    });
  });

  const downloadAvailable = value.download_available === true;
  if (downloadAvailable !== (eligibleCount > 0)) throw new Error('O status do CSV INS v8 é inconsistente.');
  return Object.freeze({
    generatedAtUtc: value.generated_at_utc,
    conversionName: reportConversionName,
    candidateCount,
    testCount,
    saleCount,
    eligibleCount,
    ignoredCount,
    skippedByReason: Object.freeze(skippedByReason),
    valueByCurrency: Object.freeze(valueByCurrency),
    productScope: value.product_scope,
    preview: Object.freeze(preview),
    downloadAvailable,
  });
}

/** Validate the versioned, privacy-reduced JSON contract from the tracking server. */
export function normalizeTrackingApiReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.ok !== true || value.schema_version !== 1
      || value.product_scope !== 'all_tracked_products'
      || value.product_breakdown_available !== false) {
    throw new Error('Resposta incompatível do servidor de Tracking.');
  }

  const candidateCount = nonNegativeInteger(value.candidate_count, 'candidate_count');
  const eligibleCount = nonNegativeInteger(value.eligible_count, 'eligible_count');
  const ignoredCount = nonNegativeInteger(value.ignored_count, 'ignored_count');
  if (eligibleCount > candidateCount || ignoredCount !== candidateCount - eligibleCount) {
    throw new Error('Os totais do relatório do servidor não conferem.');
  }
  if (typeof value.conversion_name !== 'string' || !value.conversion_name.trim()) {
    throw new Error('O relatório do servidor não informou a ação de conversão.');
  }
  if (typeof value.generated_at_utc !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.generated_at_utc)
      || !Number.isFinite(Date.parse(value.generated_at_utc))) {
    throw new Error('O relatório do servidor não informou um horário válido.');
  }
  if (!value.skipped_by_reason || typeof value.skipped_by_reason !== 'object' || Array.isArray(value.skipped_by_reason)) {
    throw new Error('O relatório do servidor não informou os motivos ignorados.');
  }
  const skippedByReason = Object.fromEntries(Object.entries(value.skipped_by_reason).map(([reason, count]) => [
    reason,
    nonNegativeInteger(count, `skipped_by_reason.${reason}`),
  ]));
  if (Object.values(skippedByReason).reduce((total, count) => total + count, 0) !== ignoredCount) {
    throw new Error('Os motivos ignorados do relatório do servidor não conferem.');
  }
  if (!value.value_by_currency || typeof value.value_by_currency !== 'object' || Array.isArray(value.value_by_currency)) {
    throw new Error('O relatório do servidor não informou os valores por moeda.');
  }
  const valueByCurrency = Object.fromEntries(Object.entries(value.value_by_currency).map(([currency, amount]) => {
    if (!/^[A-Z]{3}$/.test(currency) || typeof amount !== 'string' || !/^\d{1,18}\.\d{2}$/.test(amount)) {
      throw new Error('O servidor enviou um total por moeda inválido.');
    }
    return [currency, amount];
  }));
  if (!Array.isArray(value.preview) || value.preview.length > 100 || value.preview.length > eligibleCount) {
    throw new Error('A prévia do servidor excede o limite permitido.');
  }
  const preview = value.preview.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Linha ${index + 1} da prévia inválida.`);
    for (const [field, content] of [
      ['conversion_time', row.conversion_time],
      ['conversion_name', row.conversion_name],
      ['conversion_value', row.conversion_value],
      ['conversion_currency', row.conversion_currency],
    ]) {
      if (typeof content !== 'string' || !content.trim()) throw new Error(`Campo ${field} da prévia inválido.`);
    }
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+0000$/.test(row.conversion_time)
        || !/^\d{1,12}\.\d{2}$/.test(row.conversion_value)
        || !/^[A-Z]{3}$/.test(row.conversion_currency)) {
      throw new Error(`Linha ${index + 1} da prévia contém dados inválidos.`);
    }
    return Object.freeze({
      conversionTime: row.conversion_time,
      conversionName: row.conversion_name,
      conversionValue: row.conversion_value,
      currency: row.conversion_currency,
      gclidMasked: maskedServerIdentifier(row.google_click_id_masked, 'GCLID'),
      orderIdMasked: maskedServerIdentifier(row.order_id_masked, 'Order ID'),
    });
  });

  const downloadAvailable = value.download_available === true;
  if (downloadAvailable !== (eligibleCount > 0)) throw new Error('O status de download do relatório é inconsistente.');
  const windowDays = nonNegativeInteger(value.window_days, 'window_days');
  if (windowDays !== 90) throw new Error('A janela do relatório do servidor não é a esperada.');
  return Object.freeze({
    generatedAtUtc: value.generated_at_utc,
    windowDays,
    productScope: value.product_scope,
    conversionName: value.conversion_name,
    candidateCount,
    eligibleCount,
    ignoredCount,
    skippedByReason: Object.freeze(skippedByReason),
    valueByCurrency: Object.freeze(valueByCurrency),
    preview: Object.freeze(preview),
    downloadAvailable,
  });
}
