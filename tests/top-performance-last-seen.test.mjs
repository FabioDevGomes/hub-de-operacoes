import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { latestSeenIndex } from '../src/curadoria/top-performance/top-performance-domain.mjs';

const index = latestSeenIndex([
  { offerId: 'current', lastSeenAt: '2026-09-20T10:00:00.000Z' },
  { offerId: 'snapshot-newer', lastSeenAt: '2026-09-20T10:00:00.000Z' },
  { offerId: 'missing' },
], [
  { offerId: 'current', capturedAt: '2026-09-19T10:00:00.000Z' },
  { offerId: 'snapshot-newer', capturedAt: '2026-09-21T10:00:00.000Z' },
  { offerId: 'missing', capturedAt: '2026-09-18T10:00:00.000Z' },
]);

assert.equal(index.get('current'), '2026-09-20T10:00:00.000Z', 'preserva a data atual da oferta se for mais recente que os snapshots');
assert.equal(index.get('snapshot-newer'), '2026-09-21T10:00:00.000Z', 'recupera a data mais recente pelo histórico imutável da coleta');
assert.equal(index.get('missing'), '2026-09-18T10:00:00.000Z', 'recupera a última coleta para registros antigos sem lastSeenAt');

const html = await readFile(new URL('../src/curadoria/top-performance/index.html', import.meta.url), 'utf8');
assert.ok(html.includes('latestSeenByOffer=Domain.latestSeenIndex(offers,snapshots)'), 'o índice da última coleta não é recomposto ao recarregar os registros');
assert.ok(html.includes('lastSeen=latestSeenByOffer.get(String(item.offerId))||item.lastSeenAt'), 'a renderização da coluna não usa o valor recuperado por oferta');
assert.ok(html.includes("time=item=>new Date(latestSeenByOffer.get(String(item.offerId))||item.lastSeenAt||0).getTime()"), 'a ordenação por Última coleta não usa a mesma fonte recuperada da renderização');
console.log('top performance last seen ok');
