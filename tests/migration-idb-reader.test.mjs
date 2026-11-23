import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMigrationDatabase } from '../src/overview/migration-idb-reader.mjs';

test('não abre um banco cuja ausência foi confirmada', async () => {
  let opens = 0;
  const result = await readMigrationDatabase({ databases: async () => [], open: () => { opens++; } }, 'ausente', ['dados']);
  assert.equal(result.status, 'ausente');
  assert.equal(opens, 0);
});

test('não abre banco quando não é possível verificar sua existência', async () => {
  let opens = 0;
  const result = await readMigrationDatabase({ open: () => { opens++; } }, 'desconhecido', ['dados']);
  assert.equal(result.status, 'nao_verificado');
  assert.equal(opens, 0);
});

test('informa erro de enumeração sem criar banco', async () => {
  let opens = 0;
  const result = await readMigrationDatabase({ databases: async () => { throw new Error('falhou'); }, open: () => { opens++; } }, 'dados', []);
  assert.equal(result.status, 'nao_verificado');
  assert.equal(opens, 0);
});

test('lê chave e valor em transação somente leitura e fecha o banco', async () => {
  let mode, closed = false;
  const database = { version: 2, objectStoreNames: { contains: name => name === 'dados' }, close() { closed = true; }, transaction(names, requestedMode) {
    mode = requestedMode;
    const events = {};
    const transaction = { objectStore: () => ({ keyPath: null, autoIncrement: false, indexNames: [], getAllKeys: () => ({ result: ['chave'] }), getAll: () => ({ result: [{ valor: 0 }] }) }), addEventListener: (name, callback) => { (events[name] ||= []).push(callback); } };
    queueMicrotask(() => events.complete.forEach(callback => callback()));
    return transaction;
  } };
  const factory = { databases: async () => [{ name: 'banco' }], open: () => { const request = { result: database }; queueMicrotask(() => request.onsuccess()); return request; } };
  const result = await readMigrationDatabase(factory, 'banco', ['dados']);
  assert.equal(mode, 'readonly');
  assert.equal(closed, true);
  assert.deepEqual(result.stores.dados.records, [{ key: 'chave', value: { valor: 0 } }]);
});
