import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateGoogleAdsCommissionCpa} from '../src/google-ads/google-ads-auto-delivery-domain.mjs';

test('cálculo CPA usado pela prévia converte a comissão para a moeda de destino', () => {
  const source = fs.readFileSync(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bcommissionCpaForTarget\(/);
  assert.match(source, /return calculateGoogleAdsCommissionCpa\(\{ commission, percent, sourceCurrency, targetCurrency, usdBrlRate \}\)/);
  assert.equal(calculateGoogleAdsCommissionCpa({commission:88,percent:40,sourceCurrency:'USD',targetCurrency:'USD'}).targetAmount, '35.20');
  assert.equal(calculateGoogleAdsCommissionCpa({commission:88,percent:50,sourceCurrency:'USD',targetCurrency:'BRL',usdBrlRate:5}).targetAmount, '220.00');
  assert.equal(calculateGoogleAdsCommissionCpa({commission:88,percent:40,sourceCurrency:'USD',targetCurrency:'BRL'}), null);
});
