import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGuruMediaPostbackMacroParams,
  GURUMEDIA_POSTBACK_ENDPOINT,
  GURUMEDIA_POSTBACK_MACRO_DEFAULTS,
  inspectGuruMediaPostbackUrl,
} from '../src/tracking/tracking-gurumedia-domain.mjs';

const secret = 'a'.repeat(64);
const expectedParams = [
  'transaction_id={transaction_id}',
  'click_id={sub6}',
  'offer_name={offer_name}',
  'payout_amount={payout_amount}',
  'currency={offer_currency}',
  'conversion_time={timestamp}',
  'offer_id={offer_id}',
];

function activeUrl(params = expectedParams) {
  return `${GURUMEDIA_POSTBACK_ENDPOINT}?token=${secret}&${params.join('&')}`;
}

test('gera o conjunto de macros do postback GuruMedia incluindo hora real e ID da oferta', () => {
  assert.deepEqual(buildGuruMediaPostbackMacroParams(GURUMEDIA_POSTBACK_MACRO_DEFAULTS), expectedParams);
  assert.equal(buildGuruMediaPostbackMacroParams({
    ...GURUMEDIA_POSTBACK_MACRO_DEFAULTS,
    conversionTime: '',
  }), null);
  assert.equal(buildGuruMediaPostbackMacroParams({
    ...GURUMEDIA_POSTBACK_MACRO_DEFAULTS,
    offerId: '',
  }), null);
});

test('confere endpoint e macros ativos sem devolver o segredo da URL', () => {
  const result = inspectGuruMediaPostbackUrl(activeUrl());
  assert.equal(result.valid, true);
  assert.equal(result.endpointMatches, true);
  assert.equal(result.tokenPresent, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.ok(result.checks.every(check => check.status === 'ok'));
});

test('identifica parâmetros ausentes, macros divergentes e chaves repetidas', () => {
  const missingTime = inspectGuruMediaPostbackUrl(activeUrl(expectedParams.filter(param => !param.startsWith('conversion_time='))));
  assert.equal(missingTime.valid, false);
  assert.equal(missingTime.checks.find(check => check.parameter === 'conversion_time')?.status, 'missing');

  const wrongOfferMacro = inspectGuruMediaPostbackUrl(activeUrl(expectedParams.map(param =>
    param.startsWith('offer_id=') ? 'offer_id={wrong_offer}' : param)));
  assert.equal(wrongOfferMacro.valid, false);
  assert.equal(wrongOfferMacro.checks.find(check => check.parameter === 'offer_id')?.status, 'mismatch');

  const duplicateTime = inspectGuruMediaPostbackUrl(activeUrl([...expectedParams, 'conversion_time={timestamp}']));
  assert.equal(duplicateTime.valid, false);
  assert.equal(duplicateTime.checks.find(check => check.parameter === 'conversion_time')?.status, 'mismatch');
});

test('rejeita endpoint diferente e URL malformada sem expor dados informados', () => {
  const wrongEndpoint = inspectGuruMediaPostbackUrl(activeUrl().replace('track.travenzo.shop', 'example.com'));
  assert.equal(wrongEndpoint.valid, false);
  assert.equal(wrongEndpoint.endpointMatches, false);

  const invalid = inspectGuruMediaPostbackUrl('não é uma URL');
  assert.equal(invalid.valid, false);
  assert.equal(invalid.checks.find(check => check.parameter === 'conversion_time')?.status, 'missing');
  assert.equal(JSON.stringify(invalid).includes(secret), false);
});

test('permite a ausência do nome de oferta, que é opcional no postback', () => {
  const params = expectedParams.filter(param => !param.startsWith('offer_name='));
  const result = inspectGuruMediaPostbackUrl(activeUrl(params));
  assert.equal(result.valid, true);
  assert.equal(result.checks.find(check => check.parameter === 'offer_name')?.status, 'optional-missing');
});
