<?php
declare(strict_types=1);
require_once __DIR__ . '/../tools/google-ads-campaign-action-service.php';

$payload = [
    'operation' => 'preview_search_campaign',
    'manager_customer_id' => '1234567890', 'customer_id' => '1234567891',
    'campaign_name' => 'Campanha sintética', 'final_url' => 'https://example.test/',
    'daily_budget' => '100', 'max_cpc_bid' => '', 'bidding_strategy' => 'TARGET_CPA',
    'bidding_settings' => ['target_cpa' => '40', 'target_cpa_currency' => 'USD', 'target_roas_percent' => '', 'impression_share_location' => '', 'impression_share_percent' => ''],
    'geo_target_country_codes' => ['US'], 'keyword_match_type' => 'BROAD', 'negative_keyword_match_type' => 'BROAD',
    'keywords' => ['[produto]', '"comprar produto"', 'produto online'],
    'negative_keywords' => ['[gratuito]', '"porta falsa"', 'emprego'],
    'keyword_individual_match' => true,
    'network_settings' => ['target_search_network' => false, 'target_content_network' => false],
    'contains_eu_political_advertising' => 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    'tracking_url_template' => '', 'final_url_suffix' => '',
    'headlines' => array_map(static fn($i) => 'Título ' . $i, range(1,10)),
    'descriptions' => ['Descrição 1', 'Descrição 2', 'Descrição 3'],
    'promotion' => ['target' => 'Produto', 'occasion' => null, 'discount_type' => 'percent_off', 'discount_value' => '10', 'trigger_type' => 'none', 'trigger_value' => '', 'language_code' => 'en-US', 'start_date' => null, 'end_date' => null],
];
[$manager, $customer, $name, $url, $headlines, $descriptions, $promotion, $settings] =
    hub_google_ads_campaign_creation_validate_payload($payload, false);
$operations = hub_google_ads_campaign_creation_operations($customer, $settings, [], $name, $url, $headlines, $descriptions, $promotion, 'USD');
$campaignCreate = $operations[1]['campaignOperation']['create'] ?? null;
if (($settings['positive_geo_target_type'] ?? null) !== 'PRESENCE'
    || ($campaignCreate['geoTargetTypeSetting'] ?? null) !== ['positiveGeoTargetType' => 'PRESENCE']) {
    throw new RuntimeException('A campanha nova não fixa presença física nos locais incluídos.');
}
$positive = []; $negative = [];
foreach ($operations as $operation) {
    if (isset($operation['adGroupCriterionOperation']['create']['keyword'])) $positive[] = $operation['adGroupCriterionOperation']['create']['keyword'];
    if (isset($operation['campaignCriterionOperation']['create']['keyword'])) $negative[] = $operation['campaignCriterionOperation']['create']['keyword'];
}
$expectedPositive = [
    ['text' => 'produto', 'matchType' => 'EXACT'],
    ['text' => 'comprar produto', 'matchType' => 'PHRASE'],
    ['text' => 'produto online', 'matchType' => 'BROAD'],
];
$expectedNegative = [
    ['text' => 'gratuito', 'matchType' => 'EXACT'],
    ['text' => 'porta falsa', 'matchType' => 'PHRASE'],
    ['text' => 'emprego', 'matchType' => 'BROAD'],
];
if ($positive !== $expectedPositive || $negative !== $expectedNegative) throw new RuntimeException('As operações não preservaram os tipos individuais.');

$legacy = $payload;
unset($legacy['keyword_individual_match']);
$legacy['keywords'] = ['produto', 'produto online'];
$legacy['negative_keywords'] = ['gratuito'];
$legacy['keyword_match_type'] = 'PHRASE';
$legacy['negative_keyword_match_type'] = 'EXACT';
$legacySettings = hub_google_ads_campaign_creation_validate_payload($legacy, false)[7];
if ($legacySettings['keywords'][0]['match_type'] !== 'PHRASE' || $legacySettings['negative_keywords'][0]['match_type'] !== 'EXACT') throw new RuntimeException('A compatibilidade com chamadas antigas falhou.');

foreach (['[incompleto', '"incompleto', '[]'] as $invalid) {
    $bad = $payload; $bad['keywords'] = [$invalid];
    try {
        hub_google_ads_campaign_creation_validate_payload($bad, false);
        throw new RuntimeException('Marcação inválida foi aceita: ' . $invalid);
    } catch (HubGoogleAdsApiException $error) {
        if ($error->apiCode !== 'invalid_payload') throw $error;
    }
}
echo "OK: correspondência individual nas operações e compatibilidade anterior.\n";
