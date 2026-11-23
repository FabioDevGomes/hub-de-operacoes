<?php
declare(strict_types=1);

require_once __DIR__ . '/../tools/google-ads-campaign-action-service.php';

$payload = [
    'operation' => 'read_campaign_keyword_inventory',
    'manager_customer_id' => '1234567890',
    'customer_id' => '1234567891',
    'campaign_id' => '987654321',
];
if (hub_google_ads_campaign_keyword_inventory_validate_payload($payload) !== ['1234567890', '1234567891', '987654321']) {
    throw new RuntimeException('A validação não normalizou os IDs da campanha.' );
}
foreach ([
    [...$payload, 'query' => 'SELECT customer.id FROM customer'],
    [...$payload, 'campaign_id' => '0'],
    [...$payload, 'customer_id' => '1234567890'],
] as $invalid) {
    try {
        hub_google_ads_campaign_keyword_inventory_validate_payload($invalid);
        throw new RuntimeException('A validação aceitou payload inválido.');
    } catch (HubGoogleAdsApiException $error) {
        if ($error->apiCode !== 'invalid_payload') throw $error;
    }
}

$campaignResource = 'customers/1234567891/campaigns/987654321';
$adGroupRows = [
    ['campaign' => ['resourceName' => $campaignResource], 'adGroupCriterion' => [
        'adGroup' => 'customers/1234567891/adGroups/11', 'status' => 'ENABLED', 'negative' => false,
        'keyword' => ['text' => 'bee relief', 'matchType' => 'PHRASE'],
    ]],
    ['campaign' => ['resourceName' => $campaignResource], 'adGroupCriterion' => [
        'adGroup' => 'customers/1234567891/adGroups/11', 'status' => 'PAUSED', 'negative' => true,
        'keyword' => ['text' => 'free', 'matchType' => 'BROAD'],
    ]],
    ['campaign' => ['resourceName' => $campaignResource], 'adGroupCriterion' => [
        'adGroup' => 'customers/1234567891/adGroups/12', 'status' => 'ENABLED', 'negative' => false,
        'keyword' => ['text' => 'bee relief', 'matchType' => 'PHRASE'],
    ]],
];
$campaignRows = [
    ['campaignCriterion' => [
        'campaign' => $campaignResource, 'status' => 'ENABLED', 'negative' => true,
        'keyword' => ['text' => 'employment', 'matchType' => 'EXACT'],
    ]],
];
$inventory = hub_google_ads_campaign_keyword_inventory_normalize_rows('1234567891', '987654321', $adGroupRows, $campaignRows);
if (count($inventory['positive_keywords']) !== 2 || count($inventory['negative_keywords']) !== 2
    || $inventory['positive_keywords'][0]['scope'] !== 'AD_GROUP'
    || $inventory['positive_keywords'][0]['ad_group_id'] !== '11'
    || $inventory['negative_keywords'][0]['status'] !== 'PAUSED'
    || $inventory['negative_keywords'][1]['scope'] !== 'CAMPAIGN'
    || $inventory['negative_keywords'][1]['ad_group_id'] !== null) {
    throw new RuntimeException('A normalização perdeu tipo, status ou escopo de palavras-chave.');
}
if (hub_google_ads_campaign_keyword_inventory_normalize_rows('1234567891', '987654321', [], [])
    !== ['positive_keywords' => [], 'negative_keywords' => []]) {
    throw new RuntimeException('Uma campanha sem critérios não retornou inventário vazio válido.');
}

try {
    hub_google_ads_campaign_keyword_inventory_normalize_rows('1234567891', '987654321', [[
        'campaign' => ['resourceName' => 'customers/1234567891/campaigns/999'],
        'adGroupCriterion' => $adGroupRows[0]['adGroupCriterion'],
    ]], []);
    throw new RuntimeException('A normalização aceitou um critério de outra campanha.');
} catch (HubGoogleAdsApiException $error) {
    if ($error->apiCode !== 'campaign_keyword_inventory_incomplete') throw $error;
}

echo "OK: payload estrito e inventário positivo/negativo por escopo, estado e grupo.\n";
