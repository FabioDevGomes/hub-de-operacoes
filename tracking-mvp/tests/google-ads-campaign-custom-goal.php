<?php
declare(strict_types=1);

require_once __DIR__ . '/../tools/google-ads-campaign-action-service.php';

$goalResource = 'customers/1234567890/customConversionGoals/7';
$actionResource = 'customers/1234567890/conversionActions/42';
$effectiveConversionCustomerId = '1234567890';
$goalRow = ['customConversionGoal' => [
    'resourceName' => $goalResource,
    'name' => 'meta personalizada da ação compra',
    'status' => 'ENABLED',
    'conversionActions' => [$actionResource],
]];
$actionMap = [$actionResource => [
    'resourceName' => $actionResource,
    'name' => 'Conversão compra off-line (upload)',
    'status' => 'ENABLED',
    'category' => 'PURCHASE',
    'type' => 'UPLOAD_CLICKS',
]];

$selectedAction = [
    'name' => 'pixel MCC com meta',
    'resource_name' => $actionResource,
];
$renamedGoalRow = $goalRow;
$renamedGoalRow['customConversionGoal']['name'] = 'meta pixel MCC com meta';
$renamedActionMap = [$actionResource => [
    'resourceName' => $actionResource,
    'name' => 'pixel MCC com meta',
    'status' => 'ENABLED',
    'category' => 'PURCHASE',
    'type' => 'UPLOAD_CLICKS',
]];
$selectedGoal = hub_google_ads_campaign_creation_select_custom_goal(
    [$renamedGoalRow], $renamedActionMap, $effectiveConversionCustomerId, $selectedAction
);
if (($selectedGoal['name'] ?? null) !== 'meta pixel MCC com meta'
    || ($selectedGoal['conversion_action_resource_name'] ?? null) !== $actionResource) {
    throw new RuntimeException('A meta vinculada à ação configurada não foi selecionada pelo seu nome real.');
}


$selected = hub_google_ads_campaign_creation_select_custom_goal([$goalRow], $actionMap, $effectiveConversionCustomerId);
if (($selected['resource_name'] ?? null) !== $goalResource
    || ($selected['conversion_action_resource_name'] ?? null) !== $actionResource) {
    throw new RuntimeException('A meta aprovada não foi selecionada.');
}

try {
    hub_google_ads_campaign_creation_select_custom_goal([$goalRow], [], $effectiveConversionCustomerId);
    throw new RuntimeException('Era esperado bloquear a ação ausente.');
} catch (HubGoogleAdsApiException $error) {
    if ($error->apiCode !== 'campaign_conversion_goal_unavailable') throw $error;
}

$secondGoalRow = $goalRow;
$secondGoalRow['customConversionGoal']['resourceName'] = 'customers/1234567890/customConversionGoals/8';
try {
    hub_google_ads_campaign_creation_select_custom_goal([$goalRow, $secondGoalRow], $actionMap, $effectiveConversionCustomerId);
    throw new RuntimeException('Era esperado bloquear metas ambíguas.');
} catch (HubGoogleAdsApiException $error) {
    if ($error->apiCode !== 'campaign_conversion_goal_ambiguous') throw $error;
}

try {
    hub_google_ads_campaign_creation_select_custom_goal([$goalRow], $actionMap, '9876543210');
    throw new RuntimeException('Era esperado rejeitar uma meta pertencente a outra conta de conversão.');
} catch (HubGoogleAdsApiException $error) {
    if ($error->apiCode !== 'campaign_conversion_goal_unavailable') throw $error;
}

echo "OK: meta padrão, meta de nome variável vinculada à ação configurada, ausência e ambiguidade.\n";
