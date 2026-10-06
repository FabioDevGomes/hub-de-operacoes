import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {formatLastCollection, lastCollectionCell, latestCollectionIndex, latestCollectionValue} from '../src/curadoria/last-collection.mjs';

test('last collection has fixed Brazilian date/time, including the UTC day boundary', () => {
  assert.equal(formatLastCollection('2026-10-05T14:26:00Z'), '05/10/2026, 11:26');
  assert.equal(formatLastCollection('2026-10-06T01:00:00Z'), '05/10/2026, 22:00');
  assert.equal(formatLastCollection('2026-10-05'), '05/10/2026');
  for (const value of [undefined, null, '', 'invalid']) {
    assert.equal(formatLastCollection(value), '—');
    assert.doesNotMatch(lastCollectionCell(value), /<time/);
  }
  assert.match(lastCollectionCell('2026-10-05'), /horário não informado/);
  assert.match(lastCollectionCell('2026-10-05T14:26:00Z'), /<time datetime="2026-10-05T14:26:00Z">05\/10\/2026, 11:26<\/time>/);
  assert.doesNotMatch(lastCollectionCell('2026-10-05T14:26:00Z'), /button|badge/);
});

test('latest observation belongs to the offer, never to a capture that omitted it', () => {
  const captures = [
    {capturedAt:'2026-10-05T14:00:00Z', offers:[{offerId:'1'}, {offerId:'2'}]},
    {capturedAt:'2026-10-06T14:00:00Z', offers:[{offerId:'1'}]},
    {capturedAt:'invalid', offers:[{offerId:'2'}]},
  ];
  const before = JSON.stringify(captures);
  const index = latestCollectionIndex(captures);
  assert.equal(index.get('1'), '2026-10-06T14:00:00Z');
  assert.equal(index.get('2'), '2026-10-05T14:00:00Z');
  assert.equal(index.get('missing'), undefined);
  assert.equal(JSON.stringify(captures), before);
  assert.deepEqual(latestCollectionIndex([...captures].reverse()), new Map([['1', index.get('1')], ['2', index.get('2')]]));
});

test('collection identities remain scoped and ordering compares instants rather than ISO text', () => {
  const index = latestCollectionIndex([
    {capturedAt:'2026-10-05T12:00:00-03:00',offers:[{key:'bottom:1'}]},
    {capturedAt:'2026-10-05T14:00:00Z',offers:[{key:'top:1'}, {key:'bottom:1'}]},
  ], item => item.key);
  assert.equal(index.get('bottom:1'), '2026-10-05T12:00:00-03:00');
  assert.equal(index.get('top:1'), '2026-10-05T14:00:00Z');
  assert.equal(latestCollectionValue(null, 'invalid', '2026-10-05'), '2026-10-05');
});

test('all six catalogue lists use the shared column and stylesheet, preserving existing keys', async () => {
  const paths = ['index.html','gerentes/index.html','top-performance/index.html','hot-offers-ms/index.html','clickbank-top-offers/index.html','smartadv-offers/index.html'];
  for (const path of paths) {
    const page = await readFile(new URL('../src/curadoria/' + path, import.meta.url),'utf8');
    assert.match(page, /curation-list-layout\.css\?v=2/, path);
    const viewPath = path.startsWith('hot-offers-ms') ? 'hot-offers-ms/hot-offers-ms-view.mjs'
      : path.startsWith('clickbank-top-offers') ? 'clickbank-top-offers/clickbank-top-offers-view.mjs'
      : path.startsWith('smartadv-offers') ? 'smartadv-offers/smartadv-offers-view.mjs' : path;
    const view = await readFile(new URL('../src/curadoria/' + viewPath, import.meta.url),'utf8');
    assert.match(view, /last-collection\.mjs/, path);
    assert.match(view, /lastCollectionCell\(/, path);
    if (!path.startsWith('hot-offers-ms')) {
      const header = page.match(/<thead>([\s\S]*?)<\/thead>/)?.[1];
      assert.match(header, /hub-last-collection[^<]*>[\s\S]*Última coleta[\s\S]*<\/th><\/tr>\s*$/, path);
    }
  }
  const css = await readFile(new URL('../src/curadoria/last-collection.css', import.meta.url),'utf8');
  assert.match(css, /white-space: nowrap/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
});
