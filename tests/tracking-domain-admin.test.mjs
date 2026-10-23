import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTrackingDomainAdminToken,
  normalizeTrackingDomainInput,
  normalizeTrackingDomainList,
  normalizeTrackingProductKey,
  normalizeTrackingProductLabel,
  normalizeTrackingDomainSave,
  buildTrackingPresellScriptTag,
  trackingDomainAdminConfigPhp,
} from '../src/tracking/tracking-domain-admin.mjs';

test('gera tag única vinculada ao produto sem crossorigin, token ou atributos por link', () => {
  const tag = buildTrackingPresellScriptTag('Metabo-Drops', 'metabo.example');
  assert.equal((tag.match(/<script\b/g) || []).length, 1);
  assert.match(tag, /https:\/\/track\.travenzo\.shop\/track\.js/);
  assert.match(tag, /data-endpoint="https:\/\/track\.travenzo\.shop\/collect\.php"/);
  assert.match(tag, /data-product-key="metabo-drops"/);
  assert.match(tag, /data-presell-host="metabo\.example"/);
  assert.doesNotMatch(tag, /crossorigin|token|data-track-outbound|data-track-clickbank/i);
  assert.match(buildTrackingPresellScriptTag('Metabo Drops - Zinvero', 'metabo.example'), /data-product-key="metabo-drops-zinvero"/);
  assert.throws(() => buildTrackingPresellScriptTag('metabo-drops', 'https://evil.example/path'));
});

test('converte nome de produto em identificador técnico e preserva o rótulo para exibição', () => {
  assert.equal(normalizeTrackingProductKey(' Product_42 '), 'product_42');
  assert.equal(normalizeTrackingProductKey('Metabo Drops - Zinvero'), 'metabo-drops-zinvero');
  assert.equal(normalizeTrackingProductKey('Produto   com   key'), 'produto-com-key');
  assert.equal(normalizeTrackingProductLabel(' Metabo Drops - Zinvero '), ' Metabo Drops - Zinvero ');
  assert.throws(() => normalizeTrackingProductKey('Totalcontrol -'), {
    message: 'O identificador deve começar e terminar com letra ou número. Use letras sem acento, números, ponto, hífen ou sublinhado; não use pontos consecutivos. Espaços e hífens consecutivos viram um único hífen.',
  });
  for (const value of ['', 'bad..key', '<script>', 'café', `x${'a'.repeat(253)}`]) {
    assert.throws(() => normalizeTrackingProductKey(value));
  }
  assert.throws(() => normalizeTrackingProductLabel('   '));
});

test('normaliza hostnames HTTPS e rejeita URL fora do escopo', () => {
  assert.equal(normalizeTrackingDomainInput(' Example.COM '), 'example.com');
  assert.equal(normalizeTrackingDomainInput('https://www.Example.com/'), 'www.example.com');
  assert.equal(normalizeTrackingDomainInput('https://xn--caf-dma.example:443/'), 'xn--caf-dma.example');
  for (const value of [
    'http://example.com', 'example.com/path', 'https://example.com?x=1',
    'https://user:pass@example.com', 'https://example.com:8443', '*.example.com',
    'localhost', '127.0.0.1', 'example',
  ]) assert.throws(() => normalizeTrackingDomainInput(value));
});

test('normaliza somente respostas seguras e coerentes da allowlist', () => {
  assert.deepEqual(normalizeTrackingDomainList({ ok: true, domains: [
    { page_host: 'www.example.com', origin: 'https://www.example.com', product_key: 'product-b', product_label: 'Product B', created_at_utc: '2026-10-21 12:00:00' },
    { page_host: 'example.com', origin: 'https://example.com', created_at_utc: '2026-10-21 11:00:00' },
  ] }).map(row => [row.hostname, row.productKey, row.productLabel]), [['example.com', 'example.com', null], ['www.example.com', 'product-b', 'Product B']]);
  assert.throws(() => normalizeTrackingDomainList({ ok: true, domains: [{ page_host: 'example.com', origin: 'https://evil.example' }] }));
  assert.deepEqual(normalizeTrackingDomainSave({ ok: true, product_key: 'product-a', added: ['example.com'], updated: [], already_allowed: ['www.example.com'] }), {
    added: ['example.com'], updated: [], alreadyAllowed: ['www.example.com'], productKey: 'product-a', productLabel: null,
  });
  assert.throws(() => normalizeTrackingDomainSave({ ok: true, added: ['*.example.com'], already_allowed: [] }));
});

test('gera token administrativo com 256 bits e produz apenas configuração PHP privada', () => {
  const token = createTrackingDomainAdminToken({ getRandomValues(bytes) { bytes.fill(0xab); return bytes; } });
  assert.equal(token, 'ab'.repeat(32));
  const php = trackingDomainAdminConfigPhp(token);
  assert.match(php, /tracking_domain_admin_token/);
  assert.ok(php.includes(token));
  assert.throws(() => trackingDomainAdminConfigPhp('curto'));
  assert.throws(() => createTrackingDomainAdminToken(null));
});
