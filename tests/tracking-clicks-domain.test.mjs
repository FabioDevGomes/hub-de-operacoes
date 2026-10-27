import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTrackingDatePtBr,
  normalizeTrackingClicksReport,
  parseTrackingDatePtBr,
  resolveTrackingClicksCache,
  summarizeTrackingClicks,
  trackingClicksDefaultDateRange,
  trackingClicksDateRangeForPreset,
  trackingClicksRate,
  validateTrackingClicksDateRange,
} from '../src/tracking/tracking-clicks-domain.mjs';

const payload = {
  ok: true,
  schema_version: 1,
  generated_at_utc: '2026-10-21T20:00:00Z',
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  count_semantics: 'events_not_unique_visitors',
  rows: [
    { date_utc: '2026-10-21', product_key: 'metabo-zinvero', presell_host: 'metabo.zinvero.shop', page_views: 3, outbound_clicks: 1 },
    { date_utc: '2026-10-20', product_key: 'product-a', presell_host: 'a.example.com', page_views: 5, outbound_clicks: 2 },
  ],
};

test('inicia pelo calendário local do navegador e valida período inclusivo de até 366 dias', () => {
  assert.deepEqual(trackingClicksDefaultDateRange(new Date('2026-10-21T23:59:59-03:00'), 'America/Sao_Paulo'), {
    startDate: '2026-10-21', endDate: '2026-10-21',
  });
  const afterUtcMidnight = new Date('2026-10-27T00:07:11Z');
  assert.deepEqual(trackingClicksDefaultDateRange(afterUtcMidnight, 'America/Sao_Paulo'), {
    startDate: '2026-10-26', endDate: '2026-10-26',
  });
  assert.deepEqual(trackingClicksDateRangeForPreset('today', afterUtcMidnight, 'America/Sao_Paulo'), {
    startDate: '2026-10-26', endDate: '2026-10-26',
  });
  assert.deepEqual(validateTrackingClicksDateRange('2026-10-01', '2026-10-31'), { startDate: '2026-10-01', endDate: '2026-10-31' });
  assert.throws(() => validateTrackingClicksDateRange('2026-02-30', '2026-03-01'), /UTC válido/i);
  assert.throws(() => validateTrackingClicksDateRange('2026-10-02', '2026-10-01'), /UTC válido/i);
  assert.throws(() => validateTrackingClicksDateRange('2026-01-01', '2027-01-02'), /366 dias/i);
});

test('calcula presets do Tracking pelo calendário local, incluindo meses-calendário e limite de Total', () => {
  const now = new Date('2026-10-23T00:30:00-03:00');
  const timeZone = 'America/Sao_Paulo';
  assert.deepEqual(trackingClicksDateRangeForPreset('today', now, timeZone), { startDate: '2026-10-23', endDate: '2026-10-23' });
  assert.deepEqual(trackingClicksDateRangeForPreset('yesterday', now, timeZone), { startDate: '2026-10-22', endDate: '2026-10-22' });
  assert.deepEqual(trackingClicksDateRangeForPreset('7-days', now, timeZone), { startDate: '2026-10-17', endDate: '2026-10-23' });
  assert.deepEqual(trackingClicksDateRangeForPreset('30-days', now, timeZone), { startDate: '2026-09-24', endDate: '2026-10-23' });
  assert.deepEqual(trackingClicksDateRangeForPreset('this-month', now, timeZone), { startDate: '2026-10-01', endDate: '2026-10-23' });
  assert.deepEqual(trackingClicksDateRangeForPreset('last-month', now, timeZone), { startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.deepEqual(trackingClicksDateRangeForPreset('last-month', new Date('2026-01-01T12:00:00Z'), timeZone), { startDate: '2025-12-01', endDate: '2025-12-31' });
  assert.deepEqual(trackingClicksDateRangeForPreset('total', now, timeZone), { startDate: '2025-10-23', endDate: '2026-10-23' });
  assert.throws(() => trackingClicksDateRangeForPreset('custom', now), /período rápido válido/i);
});

test('converte datas ISO e brasileiras sem depender do locale do navegador', () => {
  assert.equal(formatTrackingDatePtBr('2026-09-22'), '22/09/2026');
  assert.equal(formatTrackingDatePtBr('2026-02-29'), '');
  assert.equal(parseTrackingDatePtBr('22/09/2026'), '2026-09-22');
  assert.equal(parseTrackingDatePtBr('29/02/2024'), '2024-02-29');
  assert.equal(parseTrackingDatePtBr('29/02/2026'), null);
  assert.equal(parseTrackingDatePtBr('31/04/2026'), null);
  assert.equal(parseTrackingDatePtBr('9/2/2026'), null);
  assert.equal(parseTrackingDatePtBr(''), null);
});

test('normaliza somente linhas agregadas, calcula totais e taxa por eventos', () => {
  const report = normalizeTrackingClicksReport(payload, { startDate: '2026-10-01', endDate: '2026-10-31' });
  assert.equal(report.rows[0].productKey, 'metabo-zinvero');
  assert.deepEqual(summarizeTrackingClicks(report.rows), { pageViews: 8, outboundClicks: 3 });
  assert.equal(trackingClicksRate(3, 8), 37.5);
  assert.equal(trackingClicksRate(2, 0), null);
  assert.throws(() => normalizeTrackingClicksReport(payload, { startDate: '2026-10-02', endDate: '2026-10-31' }), /período diferente/i);
});

test('rejeita campos privados, datas fora do período, contagens inválidas e duplicatas', () => {
  const privateField = structuredClone(payload);
  privateField.rows[0].visitor_id = 'visitor-secret';
  assert.throws(() => normalizeTrackingClicksReport(privateField), /campos não permitidos/i);

  const outsideDate = structuredClone(payload);
  outsideDate.rows[0].date_utc = '2026-11-01';
  assert.throws(() => normalizeTrackingClicksReport(outsideDate), /fora do período/i);

  const badCount = structuredClone(payload);
  badCount.rows[0].outbound_clicks = -1;
  assert.throws(() => normalizeTrackingClicksReport(badCount), /contagens inválidas/i);

  const duplicate = structuredClone(payload);
  duplicate.rows.push({ ...duplicate.rows[0] });
  assert.throws(() => normalizeTrackingClicksReport(duplicate), /duplicada/i);
});

test('reconcilia snapshots sobrepostos usando a consulta mais recente por dia, sem somar períodos duplicados', () => {
  const snapshots = [
    {
      id: 1, savedAtUtc: '2026-10-22T15:00:00.000Z', startDate: '2026-10-20', endDate: '2026-10-22',
      generatedAtUtc: '2026-10-22T14:59:00Z', rows: [
        { dateUtc: '2026-10-20', productKey: 'product-a', presellHost: 'a.example.com', pageViews: 5, outboundClicks: 2 },
        { dateUtc: '2026-10-21', productKey: 'product-a', presellHost: 'a.example.com', pageViews: 3, outboundClicks: 1 },
        { dateUtc: '2026-10-22', productKey: 'product-a', presellHost: 'a.example.com', pageViews: 2, outboundClicks: 1 },
      ],
    },
    {
      id: 2, savedAtUtc: '2026-10-22T16:00:00.000Z', startDate: '2026-10-21', endDate: '2026-10-22',
      generatedAtUtc: '2026-10-22T15:59:00Z', rows: [
        { dateUtc: '2026-10-21', productKey: 'product-a', presellHost: 'a.example.com', pageViews: 4, outboundClicks: 2 },
      ],
    },
  ];

  const resolved = resolveTrackingClicksCache(snapshots, { startDate: '2026-10-20', endDate: '2026-10-22' });
  assert.equal(resolved.meta.coveredDays, 3, 'o dia sem linhas também está coberto pela consulta mais recente');
  assert.equal(resolved.meta.snapshotCount, 2);
  assert.equal(resolved.meta.cacheUpdatedAtUtc, '2026-10-22T16:00:00.000Z');
  assert.deepEqual(resolved.report.rows, [
    { dateUtc: '2026-10-21', productKey: 'product-a', presellHost: 'a.example.com', pageViews: 4, outboundClicks: 2 },
    { dateUtc: '2026-10-20', productKey: 'product-a', presellHost: 'a.example.com', pageViews: 5, outboundClicks: 2 },
  ]);
  assert.deepEqual(summarizeTrackingClicks(resolved.report.rows), { pageViews: 9, outboundClicks: 4 });
});

test('informa cobertura parcial e ignora snapshots locais inválidos sem descartar os válidos', () => {
  const valid = {
    id: 1, savedAtUtc: '2026-10-22T16:00:00.000Z', startDate: '2026-10-20', endDate: '2026-10-20',
    generatedAtUtc: '2026-10-22T15:59:00Z', rows: [
      { dateUtc: '2026-10-20', productKey: null, presellHost: null, pageViews: 1, outboundClicks: 0 },
    ],
  };
  const resolved = resolveTrackingClicksCache([valid, { ...valid, id: 2, rows: [{ ...valid.rows[0], pageViews: -1 }] }], {
    startDate: '2026-10-20', endDate: '2026-10-22',
  });
  assert.equal(resolved.meta.coveredDays, 1);
  assert.equal(resolved.meta.totalDays, 3);
  assert.equal(resolved.meta.invalidSnapshotCount, 1);
  assert.equal(resolved.report.rows[0].pageViews, 1);
});
