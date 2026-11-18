<?php
declare(strict_types=1);
require_once __DIR__ . '/../tools/google-ads-campaign-action-service.php';
$goal = 'customers/3533796641/customConversionGoals/123';
$action = 'customers/3533796641/conversionActions/456';
if (hub_google_ads_campaign_creation_relative_resource($goal, '7957548119', 'customConversionGoals') !== 'customers/7957548119/customConversionGoals/123') throw new RuntimeException('Referência da meta incorreta.');
if (hub_google_ads_campaign_creation_relative_resource($action, '7957548119', 'conversionActions') !== 'customers/7957548119/conversionActions/456') throw new RuntimeException('Referência da ação incorreta.');
foreach ([['customers/3533796641/customConversionGoals/123', 'invalid', 'customConversionGoals'], ['customers/3533796641/customConversionGoals/123', '7957548119', 'conversionActions']] as [$resource, $customer, $kind]) {
    try { hub_google_ads_campaign_creation_relative_resource($resource, $customer, $kind); throw new RuntimeException('Referência inválida aceita.'); }
    catch (HubGoogleAdsApiException $error) { if ($error->apiCode !== 'campaign_goal_configuration_unverified') throw $error; }
}
echo "OK: referências compartilhadas e entradas inválidas.\n";
