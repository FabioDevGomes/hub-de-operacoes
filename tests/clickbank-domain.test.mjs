import assert from 'node:assert/strict';
import { STATUS, latestVerification, marketplaceSearchUrl, shortenedSearchTerm, statusLabel, upsertVerification } from '../src/curadoria/clickbank-domain.mjs';

assert.equal(shortenedSearchTerm('Zeneara (2025)'), 'Zeneara');
assert.equal(shortenedSearchTerm('Produto X - Official Offer'), 'Produto X');
assert.equal(statusLabel(STATUS.NOT_FOUND), 'Não encontrado hoje');
assert.equal(
  marketplaceSearchUrl('Teds Woodworking'),
  'https://accounts.clickbank.com/master/dashboard/affiliate-marketplace#/results?includeKeywords=Teds+Woodworking&sortField=relevance'
);

const first = { date: '2026-09-12', capturedAt: '2026-09-12T10:00:00Z', status: STATUS.RECHECK };
const replacement = { date: '2026-09-12', capturedAt: '2026-09-12T11:00:00Z', status: STATUS.FOUND };
const newest = { date: '2026-09-13', capturedAt: '2026-09-13T09:00:00Z', status: STATUS.NOT_FOUND };
let values = upsertVerification([], first);
values = upsertVerification(values, replacement);
values = upsertVerification(values, newest);
assert.equal(values.length, 2);
assert.equal(values[0].status, STATUS.FOUND);
assert.equal(latestVerification(values).status, STATUS.NOT_FOUND);

console.log('clickbank domain ok');
