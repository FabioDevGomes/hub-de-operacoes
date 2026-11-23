import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMigrationValue } from '../src/overview/migration-serialization.mjs';

test('preserva campos, valores especiais e binários sem alterar a origem', async () => {
  const binary = [];
  const source = { zero: 0, absent: undefined, minusZero: -0, date: new Date('2026-01-01T00:00:00Z'), image: new Blob(['imagem'], { type: 'image/png' }), nested: { $hubType: 'original' } };
  const result = await encodeMigrationValue(source, async (bytes, metadata) => { binary.push({ bytes, metadata }); return { path: 'arquivos/1' }; });
  const entries = Object.fromEntries(result.entries);
  assert.equal(entries.zero, 0);
  assert.equal(entries.absent.$hubType, 'undefined');
  assert.equal(entries.minusZero.value, '-0');
  assert.equal(entries.date.value, '2026-01-01T00:00:00.000Z');
  assert.equal(entries.image.path, 'arquivos/1');
  assert.equal(binary[0].metadata.mime, 'image/png');
  assert.equal(new TextDecoder().decode(binary[0].bytes), 'imagem');
  assert.deepEqual(entries.nested.entries, [['$hubType', 'original']]);
  assert.equal(source.nested.$hubType, 'original');
});

test('rejeita dados que não pode representar sem perda', async () => {
  const circular = {}; circular.self = circular;
  await assert.rejects(encodeMigrationValue(circular, () => {}), /circular/);
  await assert.rejects(encodeMigrationValue(new Map(), () => {}), /não suportado/);
});
