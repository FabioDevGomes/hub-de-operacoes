import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { DATABASES, exportMigration, readAllowedStorage } from '../src/overview/migration-export.mjs';
import { mountMigrationExport } from '../src/overview/migration-export-view.mjs';
globalThis.crypto ||= webcrypto;

function storage(entries) { const keys = Object.keys(entries); return { length: keys.length, key: index => keys[index], getItem: key => entries[key] ?? null }; }

test('o exportador limita as chaves e registra arquivos de produtos fora do escopo', async () => {
  const local = storage({ 'hub:campaign-delivery:records:v1': '[]', 'secret-token': 'nao-exportar' });
  assert.deepEqual(Object.keys(readAllowedStorage(local)), ['hub:campaign-delivery:records:v1']);
  const result = await exportMigration({ indexedDB: { databases: async () => [] }, storage: local });
  assert.equal(result.manifest.estado, 'parcial');
  assert.equal(result.manifest.fontes['radar-glimpse'].status, 'ausente');
  assert.equal(result.manifest.fontes.arquivos_produtos.status, 'nao_incluido_por_escopo');
  assert.ok(!result.manifest.pendencias.some(value => /Pasta de produtos não selecionada/.test(value)));
  assert.ok(result.blob.size > 0);
});

test('inclui os arquivos de páginas dos produtos vinculados e aponta outros tipos', async () => {
  const local = storage({ 'hub:campaign-delivery:records:v1': JSON.stringify([{ id: 'entrega-1', productName: 'Produto' }]) });
  const file = { kind: 'file', getFile: async () => new File(['imagem'], '01.png', { type: 'image/png' }) };
  const page = { kind: 'directory', async *entries() { yield ['01.png', file]; yield ['privado.json', { kind: 'file' }]; } };
  const product = { async *entries() { yield ['pag01', page]; } };
  const root = { async getDirectoryHandle(name) { assert.equal(name, 'Produto'); return product; } };
  const { manifest } = await exportMigration({ indexedDB: { databases: async () => [] }, storage: local, root });
  assert.equal(manifest.fontes.arquivos_produtos.files, 1);
  assert.equal(manifest.arquivos[0].size, 6);
  assert.equal(manifest.arquivos[0].sha256, createHash('sha256').update('imagem').digest('hex'));
  assert.match(manifest.pendencias.join(' '), /privado\.json/);
});

test('sinaliza alteração de fonte entre as duas leituras', async () => {
  let calls = 0;
  const indexedDB = { databases: async () => (++calls <= Object.keys(DATABASES).length ? [] : [{ name: 'radar-glimpse' }]), open: () => { throw new Error('indisponível'); } };
  const { manifest } = await exportMigration({ indexedDB, storage: storage({}) });
  assert.match(manifest.pendencias.join(' '), /radar-glimpse mudou durante a exportação/);
});

test('abrange bancos inventariados e mantém credenciais e permissões de pasta fora', async () => {
  assert.deepEqual(DATABASES['painel-meu-tempo'], ['categories', 'days', 'entries', 'imports', 'items', 'settings']);
  assert.deepEqual(DATABASES['hub-tracking-gurumedia-sales'], ['campaign_attributions', 'report_snapshots']);
  assert.ok(DATABASES['radar-lista-gerente'].includes('offers'));
  assert.ok(!Object.hasOwn(DATABASES, 'hub-asset-studio-settings'));
  const local = storage({ 'hub:tracking:product-labels:v1': '{}', 'hub:google-ads-search-terms:ai:v1:teste': '{}', 'hub:tracking:api-token:v1': 'segredo', 'hub:tracking:domain-admin-token:v1': 'segredo' });
  assert.deepEqual(Object.keys(readAllowedStorage(local)), ['hub:tracking:product-labels:v1', 'hub:google-ads-search-terms:ai:v1:teste']);
  const result = await exportMigration({ indexedDB: { databases: async () => [] }, storage: local });
  assert.equal(result.manifest.fontes['painel-meu-tempo'].status, 'ausente');
  assert.match(result.manifest.pendencias.join(' '), /lista selecionada/);
});

test('exporta dados operacionais selecionados e informa apenas a quantidade de chaves omitidas', async () => {
  const data = {
    'hub:google-ads:auto-pause-campaign-exceptions:v1': '{"campanha":["regra"]}',
    'hub:account-directory:manual-accounts:v1': '[]',
    'hub:review:materials:v1:entrega-ficticia': '{}',
    'hub:google-ads-search-terms:review:v1:consulta-ficticia': '{}',
    'hub:tracking:api-token:v1': 'segredo-ficticio',
    'desconhecida': 'privado-ficticio'
  };
  const { manifest, blob } = await exportMigration({ indexedDB: { databases: async () => [] }, storage: storage(data) });
  assert.equal(manifest.fontes.localStorage.count, 4);
  assert.equal(manifest.fontes.localStorage.excluded_count, 2);
  const zip = Buffer.from(await blob.arrayBuffer());
  assert.ok(zip.includes(Buffer.from('hub:review:materials:v1:entrega-ficticia')));
  assert.ok(zip.includes(Buffer.from('hub:google-ads-search-terms:review:v1:consulta-ficticia')));
  assert.ok(!zip.includes(Buffer.from('segredo-ficticio')));
  assert.ok(!zip.includes(Buffer.from('privado-ficticio')));
});

test('preserva configurações e notificações identificadas sem incluir credenciais', () => {
  const local = storage({ 'hub.google-ads-auto-update:notifications:v1': '[]', 'hub:google-ads:quota-telemetry:v2': '{}', 'hub:curation:column-widths:v1:tela:exemplo': '{}', 'hub:overview:visible-columns:v10': '[]', 'hub:tracking:api-token:v1': 'segredo', 'hub:tracking:domain-admin-token:v1': 'segredo' });
  assert.deepEqual(Object.keys(readAllowedStorage(local)), ['hub.google-ads-auto-update:notifications:v1', 'hub:google-ads:quota-telemetry:v2', 'hub:curation:column-widths:v1:tela:exemplo', 'hub:overview:visible-columns:v10']);
});

test('preserva seleções de copy e histórico D0 do preparador', () => {
  const local = storage({ 'google-ads-copy-selection-v1:new:mode:hash': '{}', 'painel-preparador-mcc-capturas-d0-v1': '[]', 'painel-preparador-mcc-pausas-d0-v1': '[]', 'hub:tracking:api-token:v1': 'segredo' });
  assert.deepEqual(Object.keys(readAllowedStorage(local)), ['google-ads-copy-selection-v1:new:mode:hash', 'painel-preparador-mcc-capturas-d0-v1', 'painel-preparador-mcc-pausas-d0-v1']);
});

test('exporta registros de uma fonte adicional em transação somente leitura', async () => {
  const listeners = {};
  const db = {
    version: 1,
    objectStoreNames: { contains: name => name === 'reports' },
    transaction(names, mode) {
      assert.deepEqual(names, ['reports']);
      assert.equal(mode, 'readonly');
      const tx = {
        objectStore: () => ({ keyPath: 'id', autoIncrement: false, indexNames: [], getAllKeys: () => ({ result: ['relatorio-1'] }), getAll: () => ({ result: [{ id: 'relatorio-1', total: 42 }] }) }),
        addEventListener(event, callback) { (listeners[event] ||= []).push(callback); }
      };
      queueMicrotask(() => { for (const callback of listeners.complete.splice(0)) callback(); });
      return tx;
    },
    close() {}
  };
  const indexedDB = {
    databases: async () => [{ name: 'hub-google-ads-geographic-reports' }],
    open() { const request = { result: db }; queueMicrotask(() => request.onsuccess()); return request; }
  };
  const { blob, manifest } = await exportMigration({ indexedDB, storage: storage({}) });
  assert.equal(manifest.fontes['hub-google-ads-geographic-reports'].status, 'presente');
  assert.equal(manifest.fontes['hub-google-ads-geographic-reports'].stores.reports, 1);
  assert.ok(Buffer.from(await blob.arrayBuffer()).includes(Buffer.from('relatorio-1')));
});

test('sinaliza conteúdo de arquivo alterado mesmo com tamanho igual', async () => {
  let reads = 0;
  const file = { kind: 'file', getFile: async () => new File([++reads < 3 ? 'aaa' : 'bbb'], '01.png', { type: 'image/png', lastModified: 123 }) };
  const page = { kind: 'directory', async *entries() { yield ['01.png', file]; } };
  const root = { getDirectoryHandle: async () => ({ async *entries() { yield ['pag01', page]; } }) };
  const local = storage({ 'hub:campaign-delivery:records:v1': JSON.stringify([{ productName: 'Produto' }]) });
  const { manifest } = await exportMigration({ indexedDB: { databases: async () => [] }, storage: local, root });
  assert.match(manifest.pendencias.join(' '), /Arquivo mudou durante a exportação/);
});

test('inclui as seleções persistidas necessárias à entrega', () => {
  const selected = storage({ 'hub.google-ads.campaign-creation.active-context:v1': 'lote', 'hub:asset-studio:pending-page-directory:v1': 'diretorio', 'hub:presell-campaign-handoff-selected-job:v1': 'entrega', 'secret-token': 'não' });
  assert.deepEqual(Object.keys(readAllowedStorage(selected)), ['hub.google-ads.campaign-creation.active-context:v1', 'hub:asset-studio:pending-page-directory:v1', 'hub:presell-campaign-handoff-selected-job:v1']);
});

test('botão executa a exportação sem solicitar pasta e inicia o download', async () => {
  const button = {}, cancel = {}, status = {};
  const events = [];
  const fakeWindow = { confirm: () => { throw new Error('Não deve solicitar confirmação'); }, showDirectoryPicker: async () => { throw new Error('A pasta não deve ser solicitada'); }, indexedDB: {}, localStorage: {}, URL: { createObjectURL: () => 'blob:teste', revokeObjectURL: () => {} }, setTimeout: () => {}, document: { querySelector: () => ({ content: '1.0.0' }), createElement: () => ({ click() { events.push(this.download); } }) } };
  mountMigrationExport({ button, cancel, status, windowObject: fakeWindow, exporter: async options => { assert.equal(options.root, undefined); return { blob: new Blob(['x']), manifest: { pendencias: ['teste'] } }; } });
  await button.onclick();
  assert.equal(events.length, 1);
  assert.match(events[0], /^hub-migracao-fase1-/);
  assert.match(status.textContent, /parcial/);
  assert.equal(button.disabled, false);
  assert.equal(cancel.hidden, true);
});

