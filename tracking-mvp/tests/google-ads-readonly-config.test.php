<?php
declare(strict_types=1);
require_once __DIR__ . '/../tools/google-ads-readonly-service.php';
function expect_config(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$queries = [];
$search = static function(string $query) use (&$queries): array {
    $queries[] = $query;
    if (str_contains($query, 'FROM accessible_bidding_strategy')) return [['accessibleBiddingStrategy' => ['id' => '99', 'ownerCustomerId' => '1111111111', 'targetCpa' => ['targetCpaMicros' => '12500000']]]];
    if (str_contains($query, 'FROM customer')) return [['customer' => ['currencyCode' => 'USD', 'timeZone' => 'America/Sao_Paulo']]];
    return [
        ['campaign' => ['id' => '1', 'name' => 'Sintética', 'status' => 'ENABLED', 'primaryStatus' => 'LIMITED', 'primaryStatusReasons' => ['HAS_ADS_LIMITED_BY_POLICY'], 'biddingStrategyType' => 'TARGET_CPA', 'biddingStrategy' => 'customers/1111111111/biddingStrategies/99'], 'campaignBudget' => ['resourceName' => 'customers/2222222222/campaignBudgets/7', 'amountMicros' => '50000000', 'period' => 'DAILY', 'explicitlyShared' => true]],
        ['campaign' => ['id' => '2', 'name' => 'Removida', 'status' => 'REMOVED', 'primaryStatus' => 'REMOVED', 'biddingStrategyType' => 'MAXIMIZE_CONVERSIONS'], 'campaignBudget' => ['period' => 'CUSTOM_PERIOD', 'totalAmountMicros' => '100000000']],
        ['campaign' => ['id' => '3', 'name' => 'Portfólio sem resolução', 'biddingStrategy' => 'customers/1111111111/biddingStrategies/404']],
    ];
};
$result = hub_google_ads_campaign_config('synthetic-token', '1111111111', '2222222222', $search);
expect_config($result['configuration_complete'] === true && count($result['campaigns']) === 3, 'A consulta de configuração não deve omitir campanha sem métricas ou removida.');
expect_config(!str_contains($queries[0], 'metrics.') && !str_contains($queries[0], 'segments.date'), 'Inventário deve ser independente de métricas/datas.');
expect_config($result['campaigns'][0]['target_cpa_micros'] === '12500000', 'CPA de portfólio precisa usar a estratégia do proprietário correto.');
expect_config($result['campaigns'][0]['budget_shared'] === true, 'Orçamento compartilhado deve ser identificado.');
expect_config($result['campaigns'][0]['primary_status_reasons'] === ['HAS_ADS_LIMITED_BY_POLICY'], 'Motivos técnicos devem ser preservados.');
expect_config($result['campaigns'][1]['budget_amount_micros'] === null && $result['campaigns'][1]['budget_total_amount_micros'] === '100000000', 'Orçamento total não pode virar orçamento diário.');
expect_config($result['campaigns'][2]['target_cpa_micros'] === null && $result['campaigns'][2]['target_cpa_resolution'] === 'unresolved_portfolio', 'Portfólio ausente não pode virar CPA zero ou não configurado.');
try {
    hub_google_ads_campaign_config('synthetic-token', null, '2222222222', static fn(string $query): array => array_fill(0, 1001, []));
    throw new RuntimeException('Inventário truncado foi aceito.');
} catch (HubGoogleAdsApiException $error) { expect_config($error->apiCode === 'configuration_limit_exceeded', 'Inventário truncado precisa falhar, sem declarar cobertura completa.'); }
echo "Configuração somente leitura Google Ads: testes aprovados.\n";
