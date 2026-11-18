import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAffiliateUrl } from '../src/campaign-delivery/affiliate-url-domain.mjs';

test('affiliate URLs accept absolute HTTP(S) links and preserve tracking parameters', () => {
  assert.equal(normalizeAffiliateUrl('  https://aff.example/path?click=abc  '), 'https://aff.example/path?click=abc');
  assert.equal(normalizeAffiliateUrl('http://aff.example/path'), 'http://aff.example/path');
});

test('affiliate URLs reject missing, relative, unsafe, credentialed, and oversized values', () => {
  assert.equal(normalizeAffiliateUrl(''), null);
  assert.equal(normalizeAffiliateUrl('aff.example/path'), null);
  assert.equal(normalizeAffiliateUrl('javascript:alert(1)'), null);
  assert.equal(normalizeAffiliateUrl('https://user:password@aff.example/'), null);
  assert.equal(normalizeAffiliateUrl(`https://${'a'.repeat(4100)}.example`), null);
});
