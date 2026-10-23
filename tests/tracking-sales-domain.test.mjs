import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTrackingSalesPage,
  summarizeTrackingSales,
  TRACKING_SALES_PAGE_SIZE,
} from '../src/tracking/tracking-sales-domain.mjs';

const matched = {
  transaction_id: '12',
  transaction_time_utc: '2026-10-20T12:00:00.123Z',
  attribution_status: 'matched',
  presell_host: 'buy.example.com',
  product_key: 'product-a',
};

function page(sales = [matched], overrides = {}) {
  return {
    ok: true,
    schema_version: 1,
    snapshot_max_id: '20',
    after_id: '10',
    next_after_id: '12',
    has_more: false,
    generated_at_utc: '2026-10-20T12:02:00Z',
    sales,
    ...overrides,
  };
}

test('normaliza só a projeção reduzida, com cursor e vínculo Track exatos', () => {
  const result = normalizeTrackingSalesPage(page(), { afterId: '10', snapshotMaxId: null });
  assert.equal(result.snapshotMaxId, '20');
  assert.deepEqual(result.sales[0], {
    transactionId: '12',
    transactionTimeUtc: '2026-10-20T12:00:00.123Z',
    attributionStatus: 'matched',
    presellHost: 'buy.example.com',
    productKey: 'product-a',
  });
  assert.equal(Object.hasOwn(result.sales[0], 'extclid'), false);
});

test('recusa campos de rastreamento sensíveis, associação incompleta e páginas adulteradas', () => {
  assert.throws(() => normalizeTrackingSalesPage(page([{ ...matched, extclid: 'secret' }]), { afterId: '10' }), /campos inesperados/i);
  assert.throws(() => normalizeTrackingSalesPage(page([{ ...matched, gclid: 'secret' }]), { afterId: '10' }), /campos inesperados/i);
  assert.throws(() => normalizeTrackingSalesPage(page([{ ...matched, product_key: null }]), { afterId: '10' }), /Track válida/i);
  assert.throws(() => normalizeTrackingSalesPage(page([{
    transaction_id: '12', transaction_time_utc: null, attribution_status: 'unmatched',
    presell_host: 'buy.example.com', product_key: 'product-a',
  }]), { afterId: '10' }), /não pode atribuir/i);
  assert.throws(() => normalizeTrackingSalesPage(page([matched], { after_id: '9' }), { afterId: '10' }), /cursor diferente/i);
  assert.throws(() => normalizeTrackingSalesPage(page([matched], { snapshot_max_id: '21' }), { afterId: '10', snapshotMaxId: '20' }), /snapshot de vendas mudou/i);
  assert.throws(() => normalizeTrackingSalesPage(page([matched], { next_after_id: '11' }), { afterId: '10' }), /cursor da API/i);
});

test('valida a paginação cheia, a ordem de IDs e o teto de páginas', () => {
  const full = Array.from({ length: TRACKING_SALES_PAGE_SIZE }, (_, index) => ({
    transaction_id: String(index + 1),
    transaction_time_utc: null,
    attribution_status: 'unmatched',
    presell_host: null,
    product_key: null,
  }));
  const fullPage = normalizeTrackingSalesPage(page(full, {
    snapshot_max_id: '250', after_id: '0', next_after_id: '200', has_more: true,
  }), { afterId: '0' });
  assert.equal(fullPage.hasMore, true);
  assert.throws(() => normalizeTrackingSalesPage(page(full.slice(0, 1), {
    snapshot_max_id: '250', after_id: '0', next_after_id: '1', has_more: true,
  }), { afterId: '0' }), /limite esperado/i);
  assert.throws(() => normalizeTrackingSalesPage(page([matched, matched]), { afterId: '10' }), /duplicados ou fora de ordem/i);
});

test('resume vendas somente pelo par exato de hostname e product_key e separa histórico', () => {
  const sales = [
    { transactionId: '1', attributionStatus: 'matched', presellHost: 'buy.example.com', productKey: 'product-a' },
    { transactionId: '2', attributionStatus: 'matched', presellHost: 'buy.example.com', productKey: 'product-a' },
    { transactionId: '3', attributionStatus: 'matched', presellHost: 'old.example.com', productKey: 'product-old' },
    { transactionId: '4', attributionStatus: 'unmatched', presellHost: null, productKey: null },
    { transactionId: '5', attributionStatus: 'ambiguous', presellHost: null, productKey: null },
  ];
  const summary = summarizeTrackingSales(sales, [{ hostname: 'buy.example.com', productKey: 'product-a' }]);
  assert.equal(summary.totalCount, 5);
  assert.equal(summary.matchedCount, 3);
  assert.equal(summary.unmatchedCount, 1);
  assert.equal(summary.ambiguousCount, 1);
  assert.equal(summary.historicalCount, 1);
  assert.equal(summary.countsByTrack.get(JSON.stringify(['buy.example.com', 'product-a'])), 2);
});
