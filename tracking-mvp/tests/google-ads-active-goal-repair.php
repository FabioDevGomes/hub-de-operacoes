<?php
declare(strict_types=1);
class HubGoogleAdsApiException extends RuntimeException { public function __construct(public string $apiCode, public int $httpStatus) { parent::__construct($apiCode); } }
$calls=[]; $activeQueries=0;
function hub_google_ads_campaign_creation_custom_goal_name(): string { return 'meta personalizada da ação compra'; }
function hub_google_ads_campaign_creation_conversion_action_name(): string { return 'Conversão compra off-line (upload)'; }
function hub_google_ads_api_request(string $method, string $path, string $token, ?string $body=null, ?string $manager=null): array {
    global $calls; $calls[] = [$path, json_decode((string)$body,true)];
    return ['results' => [['resourceName'=>'synthetic']]];
}
function hub_google_ads_search(string $customer, string $query, string $token, ?string $manager=null): array {
    global $activeQueries;
    if (str_contains($query,'FROM campaign_conversion_goal')) {
        if (!str_contains($query,'campaign_conversion_goal.biddable = TRUE')) throw new RuntimeException('Consulta não filtra metas ativas.');
        return ++$activeQueries === 1 ? [['campaignConversionGoal'=>['resourceName'=>'customers/7957548119/campaignConversionGoals/123~PURCHASE~WEBSITE']]] : [];
    }
    if (str_contains($query,'FROM conversion_goal_campaign_config')) return [['conversionGoalCampaignConfig'=>['goalConfigLevel'=>'CAMPAIGN','customConversionGoal'=>'customers/7957548119/customConversionGoals/7'],'customConversionGoal'=>['name'=>'meta personalizada da ação compra','status'=>'ENABLED','conversionActions'=>['customers/3533796641/conversionActions/8']]]];
    throw new RuntimeException('Consulta inesperada.');
}
$source=file_get_contents(__DIR__.'/../tools/google-ads-campaign-action-service.php');
foreach (['hub_google_ads_campaign_creation_relative_resource','hub_google_ads_campaign_creation_apply_and_verify_custom_goal','hub_google_ads_campaign_creation_read_campaign_goals'] as $name) {
    if (!preg_match('/function '.preg_quote($name,'/').'\([\s\S]*?\n\}/', $source,$match)) throw new RuntimeException('Função não encontrada: '.$name);
    eval($match[0]);
}
$result=hub_google_ads_campaign_creation_apply_and_verify_custom_goal('token','3533796641','7957548119','123',['resource_name'=>'customers/3533796641/customConversionGoals/7','conversion_action_resource_name'=>'customers/3533796641/conversionActions/8']);
if (($result['verified'] ?? false) !== true || count($calls)!==2) throw new RuntimeException('Fluxo não confirmado.');
if (($calls[1][1]['operations'][0]['update']['biddable'] ?? null) !== false) throw new RuntimeException('Meta padrão não desativada.');
echo "OK: meta padrão ativa desativada e ausência de metas ativas conferida.\n";
