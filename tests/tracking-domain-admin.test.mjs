import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTrackingDomainAdminToken,
  normalizeTrackingDomainInput,
  normalizeTrackingDomainList,
  normalizeTrackingDomainSave,
  trackingDomainAdminConfigPhp,
} from '../src/tracking/tracking-domain-admin.mjs';

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
    { page_host: 'www.example.com', origin: 'https://www.example.com', created_at_utc: '2026-10-21 12:00:00' },
    { page_host: 'example.com', origin: 'https://example.com', created_at_utc: '2026-10-21 11:00:00' },
  ] }).map(row => row.hostname), ['example.com', 'www.example.com']);
  assert.throws(() => normalizeTrackingDomainList({ ok: true, domains: [{ page_host: 'example.com', origin: 'https://evil.example' }] }));
  assert.deepEqual(normalizeTrackingDomainSave({ ok: true, added: ['example.com'], already_allowed: ['www.example.com'] }), {
    added: ['example.com'], alreadyAllowed: ['www.example.com'],
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
