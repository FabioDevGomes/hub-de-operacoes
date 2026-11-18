import assert from 'node:assert/strict';
import { firstSaleRows, mergeFirstSaleSales } from '../src/first-sale/first-sale-domain.mjs';

const campaigns = [
  { id: 'c-1', nome_mcc: 'Campaign 1' },
  { id: 'c-2', nome_mcc: 'Campaign 2' },
];
const projected = [
  { sale_id: 'mcc:c-1:2026-11-02', campaign_id: 'c-1', sale_date: '2026-11-02', source: 'mcc_conversion_aggregate', conversion_count: 1 },
  { sale_id: 'mcc:c-2:2026-11-02', campaign_id: 'c-2', sale_date: '2026-11-02', source: 'mcc_conversion_aggregate', conversion_count: 1 },
];
const persisted = [{ ...projected[0], active: false, cancelled_at: '2026-11-03' }];
const sales = mergeFirstSaleSales(persisted, projected);
assert.equal(sales.length, 2, 'deduplica projeções e mantém campanhas independentes');
assert.equal(sales.find(sale => sale.campaign_id === 'c-1').active, false, 'edição persistida prevalece sobre MCC projetado');

const rows = firstSaleRows({
  campaigns,
  sales,
  diary: [
    { campanha_id: 'c-1', data: '2026-11-01', celulas: { C: { value: 4 } } },
    { campanha_id: 'c-2', data: '2026-11-01', celulas: { C: { value: 3 } } },
    { campanha_id: 'c-2', data: '2026-11-02', celulas: { C: { value: 5 } } },
    { campanha_id: 'c-2', data: '2026-11-03', celulas: { C: { value: 99 } } },
  ],
});
assert.equal(rows.length, 1, 'não reativa venda MCC cancelada pelo usuário');
assert.equal(rows[0].campaignId, 'c-2', 'vincula a venda à campanha por ID exato');
assert.equal(rows[0].clicks, 8, 'soma os cliques observados até a data da venda, inclusive');

const apiRows = firstSaleRows({
  campaigns: [{ id: 'api-1', nome_mcc: 'API campaign' }],
  sales: [{ sale_id: 'sale-api', campaign_id: 'api-1', sale_date: '2026-11-03' }],
  diary: [
    { campanha_id: 'api-1', data: '2026-11-01', celulas: { C: { value: 4 } } },
    { campanha_id: 'api-1', data: '2026-11-02', celulas: { C: { value: 8 } } },
    { campanha_id: 'api-1', data: '2026-11-03', celulas: { C: { value: 9 } } },
  ],
  apiCaptures: [
    { captureSchemaVersion: 2, coverageStatus: 'rows_returned', date: '2026-11-02', capturedAtUtc: '2026-11-02T23:00:00Z', rows: [{ campaignInternalId: 'api-1', mappingStatus: 'mapped', clicks: 5 }] },
    { captureSchemaVersion: 2, coverageStatus: 'rows_returned', date: '2026-11-03', capturedAtUtc: '2026-11-03T23:00:00Z', rows: [{ campaignInternalId: 'api-1', mappingStatus: 'mapped', clicks: 2 }] },
  ],
});
assert.equal(apiRows[0].clicks, 11, 'no modo API usa o valor API por campanha/data e inclui a data da venda');

const apiMissingClick = firstSaleRows({
  campaigns: [{ id: 'api-2', nome_mcc: 'API campaign 2' }],
  sales: [{ sale_id: 'sale-api-2', campaign_id: 'api-2', sale_date: '2026-11-03' }],
  diary: [{ campanha_id: 'api-2', data: '2026-11-03', celulas: { C: { value: 9 } } }],
  apiCaptures: [{ captureSchemaVersion: 2, coverageStatus: 'rows_returned', date: '2026-11-03', capturedAtUtc: '2026-11-03T23:00:00Z', rows: [{ campaignInternalId: 'api-2', mappingStatus: 'mapped', clicks: null }] }],
});
assert.equal(apiMissingClick[0].clicks, null, 'uma captura API sem cliques não vira zero nem reaproveita um valor conflitante do Diário');

console.log('first sale domain ok');
