import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {normalizeGoogleAdsCountryCode, normalizeGoogleAdsCountryCodeInput, normalizeGoogleAdsCountryCodes} from '../src/google-ads/google-ads-country-codes.mjs';
import {parseGoogleAdsCampaignName} from '../src/google-ads/google-ads-campaign-name-parser.mjs';
import {previewGoogleAdsSearchCampaign} from '../src/google-ads/google-ads-campaign-creation-service.mjs';

const serviceSource = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-service.mjs', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');

test('UK é convertido para o código GB e a Curadoria não precisa ser alterada', () => {
  assert.equal(normalizeGoogleAdsCountryCode('uk'), 'GB');
  assert.equal(normalizeGoogleAdsCountryCode(' us '), 'US');
  assert.equal(normalizeGoogleAdsCountryCode('USA'), 'USA');
  assert.deepEqual(normalizeGoogleAdsCountryCodes(['US', 'UK']), ['US', 'GB']);
  assert.deepEqual(normalizeGoogleAdsCountryCodeInput('us; UK, GB'), {
    sourceCodes: ['US', 'UK', 'GB'],
    countryCodes: ['US', 'GB', 'GB'],
    aliases: [{from: 'UK', to: 'GB'}],
  });
});

test('o parser do nome da campanha trata UK como GB sem reescrever o nome', () => {
  const result = parseGoogleAdsCampaignName('31/10 - BioDentex 01 (CB-NBB-US/UK) 40% - U$ 88');
  assert.equal(result.ok, true);
  assert.deepEqual(result.countries, ['US', 'GB']);
  assert.deepEqual(result.countryCodeAliases, [{from: 'UK', to: 'GB'}]);
  assert.equal(result.campaignName, '31/10 - BioDentex 01 (CB-NBB-US/UK) 40% - U$ 88');
});

test('o serviço local envia GB ao endpoint para uma entrada UK, sem chamar Google Ads real', async () => {
  let sentPayload;
  const response = {
    ok: true,
    status: 200,
    headers: {get: () => ''},
    json: async () => ({
      ok: true,
      schema_version: 1,
      operation: 'preview_search_campaign',
      existing_campaign: true,
      campaign_id: '123',
      ad_group_id: '456',
      ad_group_status: 'PAUSED',
      ad_group_count: 1,
      campaign_name: '31/10 - BioDentex 01 (CB-NBB-US/UK) 40% - U$ 88',
      campaign_status: 'PAUSED',
      campaign_channel_type: 'SEARCH',
      audience_grouped: true,
      validated_only: false,
      will_create_paused: false,
    }),
  };
  const input = {
    managerCustomerId: '1234567890',
    customerId: '0987654321',
    campaignName: '31/10 - BioDentex 01 (CB-NBB-US/UK) 40% - U$ 88',
    finalUrl: 'https://example.test/',
    dailyBudget: '100',
    biddingStrategy: 'TARGET_CPA',
    targetCpa: '35.2',
    targetCpaCurrency: 'USD',
    geoTargetCountryCodes: ['US', 'UK'],
    keywords: ['biodentex'],
    keywordMatchType: 'BROAD',
    negativeKeywords: [],
    negativeKeywordMatchType: 'BROAD',
    individualKeywordMatch: true,
    targetSearchNetwork: false,
    targetContentNetwork: false,
    containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    trackingUrlTemplate: '',
    finalUrlSuffix: '',
    headlines: Array.from({length: 10}, (_, index) => 'Headline ' + (index + 1)),
    descriptions: ['Description 1', 'Description 2', 'Description 3'],
    promotion: {
      target: 'BioDentex', occasion: null, discount_type: 'percent_off', discount_value: '40',
      trigger_type: 'none', trigger_value: '', start_date: '', end_date: '', language_code: 'en',
    },
  };

  await previewGoogleAdsSearchCampaign(input, {
    token: 'synthetic-token',
    fetchImpl: async (_url, options) => {
      sentPayload = JSON.parse(options.body);
      return response;
    },
  });

  assert.deepEqual(sentPayload.geo_target_country_codes, ['US', 'GB']);
});

test('o formulário explica e normaliza o alias antes de validar e enviar o payload', () => {
  assert.match(viewSource, /UK é normalizado para GB/);
  assert.match(viewSource, /normalizeGoogleAdsCountryCodeInput\(rawCountries\.join\(', '\)\)/);
  assert.match(viewSource, /normalizeGeoCountryField\(\)\.countryCodes/);
  assert.match(viewSource, /normalizeGoogleAdsCountryCodes\(form\.elements\.namedItem\('geo_target_country_codes'\)/);
  assert.match(serviceSource, /normalizeGoogleAdsCountryCodes\(input\.geoTargetCountryCodes\)/);
});
