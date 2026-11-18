<?php
declare(strict_types=1);
$source = file_get_contents(__DIR__ . '/../tools/google-ads-campaign-action-service.php');
if (!preg_match('/function hub_google_ads_campaign_creation_resolve_custom_goal\(string \$accessToken, string \$managerId, string \$customerId\): array\s*\{.*?\n\}/s', $source, $match)) throw new RuntimeException('Função não encontrada.');
function hub_google_ads_campaign_creation_custom_goal_name(): string { return 'meta'; }
function hub_google_ads_campaign_creation_gaql_string(string $value): string { return "'" . $value . "'"; }
function hub_google_ads_search(string $customerId, string $query, string $token, ?string $managerId = null): array {
    if (str_contains($query, 'google_ads_conversion_customer')) return [['customer' => ['conversionTrackingSetting' => ['googleAdsConversionCustomer' => 'customers/1234567891']]]];
    if (str_contains($query, 'FROM custom_conversion_goal')) return [['customConversionGoal' => ['conversionActions' => ['customers/1234567891/conversionActions/987']]]];
    if (str_contains($query, 'FROM conversion_action')) return [['conversionAction' => ['resourceName' => 'customers/1234567891/conversionActions/987']]];
    throw new RuntimeException('Consulta inesperada.');
}
function hub_google_ads_campaign_creation_select_custom_goal(array $goals, array $actions, string $customer): array { return ['customer' => $customer, 'actions' => count($actions)]; }
eval($match[0]);
$result = hub_google_ads_campaign_creation_resolve_custom_goal('token-sintetico', '1234567890', '1234567891');
if ($result !== ['customer' => '1234567891', 'actions' => 1]) throw new RuntimeException('Conta de conversão incorreta.');
echo "OK: ID numérico da conta de conversão permanece válido na consulta.\n";
