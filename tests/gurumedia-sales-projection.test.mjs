import test from 'node:test';
import assert from 'node:assert/strict';
import {firstSaleRows, mergeFirstSaleSales} from '../src/first-sale/first-sale-domain.mjs';
import {buildGuruMediaCampaignDisplay} from '../src/tracking/gurumedia-campaign-display.mjs';
import {
  addGuruMediaConversionsToOverviewRow,
  guruMediaFirstSaleRecords,
  guruMediaSalesCount,
  projectGuruMediaSalesIntoDiary,
} from '../src/overview/gurumedia-sales-projection.mjs';

const projection = {
  byCampaignId: new Map([
    ['campaign-1', { sales: [
      { saleKey: 'sale-key-1', campaignDate: '2026-11-06', conversionAtUtc: '2026-11-07T00:05:32.000Z', receivedAtUtc: '2026-11-07T00:05:33.165Z', timeZone: 'America/Sao_Paulo', currency: 'USD', payoutAmount: '110.0000' },
      { saleKey: 'sale-key-2', campaignDate: '2026-11-07', conversionAtUtc: '2026-11-07T15:00:00.000Z', timeZone: 'America/Sao_Paulo', currency: 'BRL', payoutAmount: '30' },
    ] }],
  ]),
};

test('counts matched sales for consolidated and selected account-local dates', () => {
  assert.equal(guruMediaSalesCount(projection, 'campaign-1'), 2);
  assert.equal(guruMediaSalesCount(projection, 'campaign-1', { mode: 'd1', dates: { d1: '2026-11-06' } }), 1);
  assert.equal(guruMediaSalesCount(projection, 'campaign-1', { mode: 'd0', dates: { d0: '2026-11-07' } }), 1);
  assert.equal(guruMediaSalesCount(projection, 'missing'), 0);
});

test('adds matched sales to existing overview conversions without mutating source rows', () => {
  const original = { campaignId: 'campaign-1', totals: { conversions: 4, clicks: 8 } };
  const result = addGuruMediaConversionsToOverviewRow(original, 2);
  assert.deepEqual(result.totals, { conversions: 6, clicks: 8 });
  assert.deepEqual(original.totals, { conversions: 4, clicks: 8 });
  assert.equal(addGuruMediaConversionsToOverviewRow(original, 0), original);
});

test('converts matched sale timestamps to campaign-local first-sale records', () => {
  assert.deepEqual(guruMediaFirstSaleRecords(projection).map(sale => [sale.campaign_id, sale.sale_date, sale.sale_time, sale.source]), [
    ['campaign-1', '2026-11-06', '21:05:32', 'gurumedia_click_view'],
    ['campaign-1', '2026-11-07', '12:00:00', 'gurumedia_click_view'],
  ]);
});

test('GuruMedia sale participates in the existing first-sale click calculation', () => {
  const records = mergeFirstSaleSales([], guruMediaFirstSaleRecords(projection));
  const firstSales = firstSaleRows({
    campaigns: [{ id: 'campaign-1', nome_mcc: 'Campaign one' }],
    sales: records,
    diary: [
      { campanha_id: 'campaign-1', data: '2026-11-06', celulas: { C: { value: 4 }, B: { value: 80 } } },
      { campanha_id: 'campaign-1', data: '2026-11-07', celulas: { C: { value: 9 }, B: { value: 120 } } },
    ],
  });
  assert.equal(firstSales.length, 1);
  assert.equal(firstSales[0].saleDate, '2026-11-06');
  assert.equal(firstSales[0].clicks, 4);
  assert.equal(firstSales[0].sourceLabel, 'GuruMedia · ClickView');
});

test('keeps ClickView sales when merging by their stable sale key', () => {
  const [record] = guruMediaFirstSaleRecords(projection);
  assert.equal(record.sale_id, 'gurumedia_click_view:sale-key-1');
  assert.equal(mergeFirstSaleSales([], [record]).length, 1);
});

test('restores a persisted historical sale to the first-sale index without adding it to the current report', () => {
  const campaignName = 'Power Heat Pro DE02 15 (GM-NBB-DE) 50% - U$ 107.00';
  const display = buildGuruMediaCampaignDisplay({
    report: { startDate: '2026-11-16', endDate: '2026-11-16', saleDetails: [] },
    campaignActions: new Map([['internal-campaign-id', { campaignId: '24464253560', campaignName, customerId: '3290469827' }]]),
    accountDirectory: { accounts: [{ customerId: '3290469827', timeZone: 'Europe/Berlin' }] },
    firstSaleSales: [{
      saleKey: '22313904-35a6-4f96-8abf-700b1a1595ea',
      conversionAtUtc: '2026-11-15T14:12:37.000Z',
      receivedAtUtc: '2026-11-15T14:12:37.748Z',
      campaignAttribution: { status: 'matched', campaignId: '24464253560', campaignName },
    }],
  });

  assert.equal(display.byCampaignId.size, 0, 'a visualização GuruMedia do período atual não ganha vendas de datas fora dele');
  const [firstSale] = guruMediaFirstSaleRecords(display);
  assert.equal(firstSale.campaign_id, 'internal-campaign-id');
  assert.equal(firstSale.sale_date, '2026-11-15');
  assert.equal(firstSale.sale_time, '15:12:37');
  const [indexedSale] = firstSaleRows({
    campaigns: [{ id: 'internal-campaign-id', nome_mcc: campaignName }],
    sales: [firstSale],
    apiCaptures: [{
      captureSchemaVersion: 2,
      coverageStatus: 'rows_returned',
      date: '2026-11-15',
      capturedAtUtc: '2026-11-16T08:40:00.000Z',
      rows: [{ campaignInternalId: 'internal-campaign-id', mappingStatus: 'mapped', clicks: 1, impressions: 3 }],
    }],
  });
  assert.equal(indexedSale.saleDate, '2026-11-15');
  assert.equal(indexedSale.clicks, 1);
});

test('projects GuruMedia sales into standard diary conversion and commission cells without mutating source', () => {
  const source = [{ date: '2026-11-06', cells: { A: { value: '2026-11-06' }, F: { value: 2, origin: 'api' }, P: { value: 10, origin: 'api' }, C: { value: 5 } } }];
  const result = projectGuruMediaSalesIntoDiary(source, projection.byCampaignId.get('campaign-1').sales, { exchangeRate: 5.5 });
  assert.equal(result.length, 2);
  assert.equal(result[0].cells.F.value, 3);
  assert.equal(result[0].cells.P.value, 615);
  assert.equal(result[0].cells.C.value, 5);
  assert.equal(result[1].cells.F.value, 1);
  assert.equal(result[1].cells.P.value, 30);
  assert.equal(source[0].cells.F.value, 2);
  assert.equal(source[0].cells.P.value, 10);
});

test('counts a sale with an unsupported currency but leaves commission unchanged', () => {
  const row = { date: '2026-11-06', cells: { A: { value: '2026-11-06' }, F: { value: 0 }, P: { value: 25 } } };
  const [result] = projectGuruMediaSalesIntoDiary([row], [{ campaignDate: '2026-11-06', currency: 'EUR', payoutAmount: '10' }], { exchangeRate: 5.5 });
  assert.equal(result.cells.F.value, 1);
  assert.equal(result.cells.P.value, 25);
});
