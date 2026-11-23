<?php
declare(strict_types=1);
require_once __DIR__ . '/../tools/google-ads-readonly-service.php';
$queries=[];
$search=static function(string $query) use (&$queries): array {
    $queries[]=$query;
    return [['campaign'=>['id'=>'12'],'adGroup'=>['id'=>'34'],'adGroupAd'=>['ad'=>['id'=>'56'],'status'=>'ENABLED','policySummary'=>['approvalStatus'=>'DISAPPROVED','policyTopicEntries'=>[['topic'=>'DESTINATION_NOT_WORKING','type'=>'PROHIBITED']]]]]];
};
$result=hub_google_ads_campaign_policy_findings('synthetic', '1111111111', '2222222222', ['12','13'], $search);
if(count($queries)!==1 || !str_contains($queries[0], 'campaign.id IN (12,13)') || $result['ads'][0]['topics'][0]['topic']!=='DESTINATION_NOT_WORKING') throw new RuntimeException('Consulta agrupada inválida');
try { hub_google_ads_campaign_policy_findings('synthetic', null, '2222222222', ['12 OR 1=1'], $search); throw new RuntimeException('Identificador inválido aceito'); } catch (HubGoogleAdsApiException $e) { if ($e->apiCode !== 'invalid_payload') throw $e; }
echo "Consulta de políticas: testes aprovados.\n";
