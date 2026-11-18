import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('coluna da Curadoria consome snapshots locais sem consulta própria ao servidor', async () => {
  const source = await readFile(new URL('../src/curadoria/top-performance/gurumedia-sales-column.mjs', import.meta.url), 'utf8');

  assert.match(source, /readGuruMediaSalesSnapshot/);
  assert.match(source, /readTrackingDomainList/);
  assert.match(source, /new BroadcastChannel\('hub-tracking-gurumedia-sales'\)/);
  assert.doesNotMatch(source, /fetchGuruMediaSalesReport|fetchTrackingDomains|readTrackingHubToken/);
  assert.doesNotMatch(source, /guru-sales-toolbar|Atualizar vendas/);
});
