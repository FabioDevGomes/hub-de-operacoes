<?php
declare(strict_types=1);

// Separate write surface. Shared authentication, credentials, OAuth and
// Google Ads HTTP helpers remain defined by the read-only service.
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-pause-email-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-duplication-service.php';

function hub_google_ads_campaign_actions_enabled(array $config): bool
{
    return ($config['tracking_google_ads_campaign_writes_enabled'] ?? false) === true
        && count(hub_google_ads_campaign_write_manager_customer_ids($config)) > 0;
}

/** Only explicitly listed manager accounts can authorize their linked advertiser accounts. */
function hub_google_ads_campaign_write_manager_customer_ids(array $config): array
{
    $configured = $config['tracking_google_ads_campaign_write_manager_customer_ids'] ?? [];
    if (!is_array($configured)) return [];
    $managerIds = [];
    foreach ($configured as $value) {
        $managerId = hub_google_ads_valid_customer_id($value);
        if ($managerId !== null) $managerIds[$managerId] = $managerId;
    }
    return array_values($managerIds);
}

function hub_google_ads_campaign_manager_is_allowed(array $config, string $managerId): bool
{
    return in_array($managerId, hub_google_ads_campaign_write_manager_customer_ids($config), true);
}

/** Check current manager hierarchy, so new active advertiser accounts are included automatically. */
function hub_google_ads_campaign_customer_is_active_child(string $accessToken, string $managerId, string $customerId): bool
{
    if ($managerId === $customerId) return false;
    $query = 'SELECT customer_client.id, customer_client.level, customer_client.manager, customer_client.status '
        . 'FROM customer_client WHERE customer_client.id = ' . $customerId
        . ' AND customer_client.level > 0 AND customer_client.manager = FALSE'
        . " AND customer_client.status = 'ENABLED' LIMIT 2";
    $rows = hub_google_ads_search($managerId, $query, $accessToken, $managerId);
    if (count($rows) > 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    if (!$rows) return false;
    $client = $rows[0]['customerClient'] ?? null;
    if (!is_array($client)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    $returnedId = hub_google_ads_valid_customer_id((string)($client['id'] ?? ''));
    $level = $client['level'] ?? null;
    if ($returnedId !== $customerId || !is_numeric($level) || (int)$level < 1
        || ($client['manager'] ?? null) !== false || ($client['status'] ?? null) !== 'ENABLED') {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    return true;
}

function hub_google_ads_campaign_action_validate_status_change(array $payload): array
{
    $transitions = [
        'pause_campaign' => ['ENABLED', 'PAUSED'],
        'enable_campaign' => ['PAUSED', 'ENABLED'],
    ];
    $operation = $payload['operation'] ?? null;
    $transition = is_string($operation) ? ($transitions[$operation] ?? null) : null;
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    $hasNotificationContext = array_key_exists('notification_context', $payload);
    $notificationContext = $hasNotificationContext ? $payload['notification_context'] : null;
    $allowedKeys = ['campaign_id', 'confirm', 'customer_id', 'expected_status', 'manager_customer_id', 'operation'];
    if (array_key_exists('notification_context', $payload)) {
        $allowedKeys[] = 'notification_context';
        sort($allowedKeys, SORT_STRING);
    }
    if ($keys !== $allowedKeys
        || ($payload['confirm'] ?? null) !== true
        || $transition === null
        || ($payload['expected_status'] ?? null) !== $transition[0]
        || ($hasNotificationContext
            && (google_ads_campaign_pause_email_reason_from_context($notificationContext) === null || $operation !== 'pause_campaign'))) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }

    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
    $campaignId = $payload['campaign_id'];
    if ($managerId === null || $customerId === null
        || !is_string($campaignId)
        || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }

    return [$managerId, $customerId, $campaignId, $operation, $transition[0], $transition[1], $notificationContext];
}

/** Read the current campaign state using a server-built, ID-validated GAQL query. */
function hub_google_ads_campaign_action_read(string $accessToken, ?string $managerId, string $customerId, string $campaignId): array
{
    $query = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.geo_target_type_setting.positive_geo_target_type FROM campaign WHERE campaign.id = '
        . $campaignId . ' LIMIT 2';
    $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    if (!$rows) throw new HubGoogleAdsApiException('campaign_not_found', 404);
    if (count($rows) !== 1 || !is_array($rows[0]['campaign'] ?? null)) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }

    $campaign = $rows[0]['campaign'];
    if ((string)($campaign['id'] ?? '') !== $campaignId || !is_string($campaign['status'] ?? null)) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    return [
        'id' => $campaignId,
        'name' => is_string($campaign['name'] ?? null) ? $campaign['name'] : '',
        'status' => $campaign['status'],
        'channel_type' => is_string($campaign['advertisingChannelType'] ?? null) ? $campaign['advertisingChannelType'] : '',
        'positive_geo_target_type' => is_string($campaign['geoTargetTypeSetting']['positiveGeoTargetType'] ?? null)
            ? $campaign['geoTargetTypeSetting']['positiveGeoTargetType'] : '',
    ];
}

/** Parse the full USD/BRL commission marker from the campaign name into integer cents. */
function hub_google_ads_campaign_cpa_commission_from_name(string $name): ?array
{
    if (preg_match_all('/(US\$|U\$|R\$)\s*([0-9][0-9.,]*)/i', $name, $matches, PREG_SET_ORDER) < 1) return null;
    $match = $matches[count($matches) - 1];
    $currency = strtoupper($match[1]) === 'R$' ? 'BRL' : 'USD';
    $amount = $match[2];
    $hasDot = str_contains($amount, '.');
    $hasComma = str_contains($amount, ',');
    $decimal = null;
    $group = null;
    if ($hasDot && $hasComma) {
        $decimal = strrpos($amount, '.') > strrpos($amount, ',') ? '.' : ',';
        $group = $decimal === '.' ? ',' : '.';
        $parts = explode($decimal, $amount);
        if (count($parts) !== 2 || preg_match('/^\d{1,6}$/D', $parts[1]) !== 1) return null;
        $groups = explode($group, $parts[0]);
        if (count($groups) > 1 && (preg_match('/^\d{1,3}$/D', $groups[0]) !== 1
            || count(array_filter(array_slice($groups, 1), static fn($part) => preg_match('/^\d{3}$/D', $part) !== 1)) > 0)) return null;
        $whole = implode('', $groups);
        $fraction = $parts[1];
    } elseif ($hasDot || $hasComma) {
        $separator = $hasDot ? '.' : ',';
        $parts = explode($separator, $amount);
        if (count($parts) > 2) {
            if (preg_match('/^\d{1,3}$/D', $parts[0]) !== 1
                || count(array_filter(array_slice($parts, 1), static fn($part) => preg_match('/^\d{3}$/D', $part) !== 1)) > 0) return null;
            $whole = implode('', $parts);
            $fraction = '';
        } elseif (count($parts) === 2 && strlen($parts[1]) === 3 && preg_match('/^\d{1,3}$/D', $parts[0]) === 1) {
            $whole = implode('', $parts);
            $fraction = '';
        } elseif (count($parts) === 2 && preg_match('/^\d{1,6}$/D', $parts[1]) === 1) {
            $whole = $parts[0];
            $fraction = $parts[1];
        } else {
            return null;
        }
    } else {
        $whole = $amount;
        $fraction = '';
    }
    if (preg_match('/^\d{1,12}$/D', $whole) !== 1) return null;
    $fraction = str_pad($fraction, 2, '0');
    $cents = ((int)$whole * 100) + (int)substr($fraction, 0, 2);
    if (strlen($fraction) > 2 && (int)$fraction[2] >= 5) $cents++;
    return $cents > 0 ? ['currency' => $currency, 'cents' => $cents] : null;
}

/** Read the account currency plus the direct campaign-level target CPA. */
function hub_google_ads_campaign_target_cpa_read(string $accessToken, string $managerId, string $customerId, string $campaignId, ?string $knownCurrencyCode = null): array
{
    if ($knownCurrencyCode === null) {
        $customerRows = hub_google_ads_search($customerId, 'SELECT customer.id, customer.currency_code FROM customer LIMIT 2', $accessToken, $managerId);
        if (count($customerRows) !== 1 || !is_array($customerRows[0]['customer'] ?? null)) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $customer = $customerRows[0]['customer'];
        if ((string)($customer['id'] ?? '') !== $customerId || !is_string($customer['currencyCode'] ?? null)) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $currencyCode = strtoupper($customer['currencyCode']);
    } else {
        $currencyCode = strtoupper($knownCurrencyCode);
    }
    $query = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.bidding_strategy, campaign.target_cpa.target_cpa_micros, campaign.maximize_conversions.target_cpa_micros FROM campaign WHERE campaign.id = '
        . $campaignId . ' LIMIT 2';
    $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    if (!$rows) throw new HubGoogleAdsApiException('campaign_not_found', 404);
    if (count($rows) !== 1 || !is_array($rows[0]['campaign'] ?? null)) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    $campaign = $rows[0]['campaign'];
    $strategy = $campaign['biddingStrategyType'] ?? '';
    $targetMicros = $strategy === 'TARGET_CPA'
        ? ($campaign['targetCpa']['targetCpaMicros'] ?? null)
        : ($strategy === 'MAXIMIZE_CONVERSIONS' ? ($campaign['maximizeConversions']['targetCpaMicros'] ?? null) : null);
    if ((string)($campaign['id'] ?? '') !== $campaignId || !is_string($campaign['status'] ?? null)
        || !is_string($strategy) || !is_string($campaign['advertisingChannelType'] ?? null)) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    return [
        'id' => $campaignId,
        'name' => is_string($campaign['name'] ?? null) ? $campaign['name'] : '',
        'status' => $campaign['status'],
        'channel_type' => $campaign['advertisingChannelType'],
        'strategy_type' => $strategy,
        'strategy_resource' => is_string($campaign['biddingStrategy'] ?? null) ? $campaign['biddingStrategy'] : '',
        'target_cpa_micros' => is_numeric($targetMicros) ? (string)$targetMicros : null,
        'currency_code' => $currencyCode,
    ];
}

/** Read a campaign's existing daily budget and whether any other campaign uses it. */
function hub_google_ads_campaign_daily_budget_read(string $accessToken, string $managerId, string $customerId, string $campaignId): array
{
    $query = 'SELECT customer.currency_code, campaign.id, campaign.name, campaign.status, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.period, campaign_budget.explicitly_shared, campaign_budget.reference_count FROM campaign WHERE campaign.id = '
        . $campaignId . ' LIMIT 2';
    $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    if (!$rows) throw new HubGoogleAdsApiException('campaign_not_found', 404);
    if (count($rows) !== 1 || !is_array($rows[0]['campaign'] ?? null)
        || !is_array($rows[0]['campaignBudget'] ?? null) || !is_array($rows[0]['customer'] ?? null)) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    $campaign = $rows[0]['campaign'];
    $budget = $rows[0]['campaignBudget'];
    $currency = strtoupper((string)($rows[0]['customer']['currencyCode'] ?? ''));
    $resourceName = $budget['resourceName'] ?? null;
    $amountMicros = $budget['amountMicros'] ?? null;
    $referenceCount = $budget['referenceCount'] ?? null;
    if ((string)($campaign['id'] ?? '') !== $campaignId || !is_string($campaign['status'] ?? null)
        || preg_match('/^[A-Z]{3}$/D', $currency) !== 1 || !is_string($resourceName)
        || !is_numeric($amountMicros) || !is_string($budget['period'] ?? null)
        || !is_bool($budget['explicitlyShared'] ?? null) || !is_numeric($referenceCount)) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    return [
        'id' => $campaignId,
        'name' => is_string($campaign['name'] ?? null) ? $campaign['name'] : '',
        'status' => $campaign['status'],
        'currency_code' => $currency,
        'budget_resource' => $resourceName,
        'budget_amount_micros' => (string)$amountMicros,
        'budget_period' => $budget['period'],
        'budget_explicitly_shared' => $budget['explicitlyShared'],
        'budget_reference_count' => (int)$referenceCount,
    ];
}

function hub_google_ads_campaign_budget_currency_digits(string $currency): int
{
    if (in_array($currency, ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'], true)) return 0;
    if (in_array($currency, ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'], true)) return 3;
    if (in_array($currency, ['CLF', 'UYW'], true)) return 4;
    return 2;
}

function hub_google_ads_campaign_budget_target_micros(string $currentMicros, string $currency, string $direction): int
{
    $current = (int)$currentMicros;
    if ($current <= 0 || $current > 9007199254740991) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $digits = hub_google_ads_campaign_budget_currency_digits($currency);
    $quantum = (int)(10 ** (6 - $digits));
    $factor = $direction === 'increase' ? 105 : 95;
    $denominator = 100 * $quantum;
    $targetMinorUnits = intdiv(($current * $factor) + intdiv($denominator, 2), $denominator);
    $target = $targetMinorUnits * $quantum;
    if ($target <= 0 || $target === $current || $target > 9007199254740991) {
        throw new HubGoogleAdsApiException('campaign_budget_adjustment_too_small', 409);
    }
    return $target;
}

function hub_google_ads_campaign_daily_budget_adjust(array $config, array $payload): array
{
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    $allowedKeys = ['campaign_id', 'confirm', 'customer_id', 'direction', 'expected_budget_amount_micros',
        'expected_budget_resource', 'expected_currency_code', 'manager_customer_id', 'operation'];
    sort($allowedKeys, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    $expectedMicros = $payload['expected_budget_amount_micros'] ?? null;
    $expectedResource = $payload['expected_budget_resource'] ?? null;
    $expectedCurrency = $payload['expected_currency_code'] ?? null;
    $direction = $payload['direction'] ?? null;
    if ($keys !== $allowedKeys || ($payload['operation'] ?? null) !== 'adjust_campaign_daily_budget' || ($payload['confirm'] ?? null) !== true
        || $managerId === null || $customerId === null || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !is_string($expectedMicros) || preg_match('/^[1-9][0-9]{0,15}$/D', $expectedMicros) !== 1
        || !is_string($expectedResource) || preg_match('/^customers\/' . $customerId . '\/campaignBudgets\/[1-9][0-9]{0,19}$/D', $expectedResource) !== 1
        || !is_string($expectedCurrency) || preg_match('/^[A-Z]{3}$/D', $expectedCurrency) !== 1
        || !in_array($direction, ['increase', 'decrease'], true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if (!hub_google_ads_campaign_actions_enabled($config)) throw new HubGoogleAdsApiException('campaign_writes_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    if (!hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId)) {
        throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    }
    $campaign = hub_google_ads_campaign_daily_budget_read($accessToken, $managerId, $customerId, $campaignId);
    if ($campaign['currency_code'] !== $expectedCurrency) throw new HubGoogleAdsApiException('campaign_budget_currency_mismatch', 409);
    if (!in_array($campaign['status'], ['ENABLED', 'PAUSED'], true)) throw new HubGoogleAdsApiException('campaign_status_changed', 409);
    if ($campaign['budget_period'] !== 'DAILY') throw new HubGoogleAdsApiException('campaign_budget_not_daily', 409);
    if ($campaign['budget_explicitly_shared'] !== false || $campaign['budget_reference_count'] !== 1) {
        throw new HubGoogleAdsApiException('campaign_budget_not_exclusive', 409);
    }
    if ($campaign['budget_resource'] !== $expectedResource || $campaign['budget_amount_micros'] !== $expectedMicros) {
        throw new HubGoogleAdsApiException('campaign_budget_changed', 409);
    }
    $targetMicros = hub_google_ads_campaign_budget_target_micros($expectedMicros, $expectedCurrency, $direction);
    $mutation = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/campaignBudgets:mutate', $accessToken,
        json_encode(['operations' => [[
            'update' => ['resourceName' => $campaign['budget_resource'], 'amountMicros' => (string)$targetMicros],
            'updateMask' => 'amount_micros',
        ]]], JSON_UNESCAPED_SLASHES), $managerId);
    if (!is_array($mutation['results'] ?? null) || count($mutation['results']) !== 1) {
        throw new HubGoogleAdsApiException('campaign_budget_adjustment_unverified', 502);
    }
    try {
        $verified = hub_google_ads_campaign_daily_budget_read($accessToken, $managerId, $customerId, $campaignId);
    } catch (Throwable $error) {
        throw new HubGoogleAdsApiException('campaign_budget_adjustment_unverified', 502);
    }
    if ($verified['budget_amount_micros'] !== (string)$targetMicros || $verified['budget_resource'] !== $campaign['budget_resource']
        || $verified['currency_code'] !== $campaign['currency_code'] || $verified['budget_period'] !== 'DAILY'
        || $verified['budget_explicitly_shared'] !== false || $verified['budget_reference_count'] !== 1) {
        throw new HubGoogleAdsApiException('campaign_budget_adjustment_unverified', 502);
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'adjust_campaign_daily_budget',
        'verified' => true,
        'campaign_id' => $campaignId,
        'campaign_name' => $verified['name'],
        'currency_code' => $verified['currency_code'],
        'budget_resource' => $verified['budget_resource'],
        'direction' => $direction,
        'previous_budget_amount_micros' => $expectedMicros,
        'budget_amount_micros' => (string)$targetMicros,
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

function hub_google_ads_campaign_target_cpa_adjust(array $config, array $payload): array
{
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    $allowedKeys = ['campaign_id', 'commission_cents', 'commission_currency', 'confirm', 'customer_id', 'direction',
        'exchange_rate', 'expected_commission_target_cents', 'expected_currency_code', 'expected_target_cpa_micros',
        'manager_customer_id', 'operation'];
    sort($allowedKeys, SORT_STRING);
    $allowedKeysWithStep = $allowedKeys;
    $allowedKeysWithStep[] = 'step_percentage_points';
    sort($allowedKeysWithStep, SORT_STRING);
    $stepValue = $payload['step_percentage_points'] ?? '2';
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    $expectedMicros = $payload['expected_target_cpa_micros'] ?? null;
    $commissionCents = $payload['commission_cents'] ?? null;
    $expectedTargetCents = $payload['expected_commission_target_cents'] ?? null;
    $sourceCurrency = $payload['commission_currency'] ?? null;
    $expectedCurrency = $payload['expected_currency_code'] ?? null;
    $direction = $payload['direction'] ?? null;
    $rateValue = $payload['exchange_rate'] ?? null;
    if (!in_array($keys, [$allowedKeys, $allowedKeysWithStep], true) || ($payload['operation'] ?? null) !== 'adjust_campaign_target_cpa' || ($payload['confirm'] ?? null) !== true
        || $managerId === null || $customerId === null || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !is_string($expectedMicros) || preg_match('/^[1-9][0-9]{0,17}$/D', $expectedMicros) !== 1
        || !is_string($commissionCents) || preg_match('/^[1-9][0-9]{0,12}$/D', $commissionCents) !== 1
        || !is_string($expectedTargetCents) || preg_match('/^[1-9][0-9]{0,12}$/D', $expectedTargetCents) !== 1
        || !is_string($sourceCurrency) || !in_array($sourceCurrency, ['USD', 'BRL'], true)
        || !is_string($expectedCurrency) || !in_array($expectedCurrency, ['USD', 'BRL'], true)
        || !in_array($direction, ['increase', 'decrease'], true)
        || !is_string($stepValue) || !in_array($stepValue, ['2', '4'], true)
        || (!is_string($rateValue) && !is_int($rateValue) && !is_float($rateValue)) || !is_numeric($rateValue)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $rate = (float)$rateValue;
    if (!is_finite($rate) || $rate <= 0 || $rate > 100
        || ($sourceCurrency === $expectedCurrency && abs($rate - 1) > 0.00000001)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if (!hub_google_ads_campaign_actions_enabled($config)) throw new HubGoogleAdsApiException('campaign_writes_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);

    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    if (!hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId)) {
        throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    }
    $campaign = hub_google_ads_campaign_target_cpa_read($accessToken, $managerId, $customerId, $campaignId);
    if ($campaign['currency_code'] !== $expectedCurrency) throw new HubGoogleAdsApiException('campaign_target_cpa_currency_mismatch', 409);
    if ($campaign['channel_type'] !== 'SEARCH' || !in_array($campaign['status'], ['ENABLED', 'PAUSED'], true)
        || !in_array($campaign['strategy_type'], ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'], true)
        || $campaign['strategy_resource'] !== '') {
        throw new HubGoogleAdsApiException('campaign_target_cpa_strategy_unsupported', 409);
    }
    if ($campaign['target_cpa_micros'] === null || preg_match('/^[1-9][0-9]{0,17}$/D', $campaign['target_cpa_micros']) !== 1) {
        throw new HubGoogleAdsApiException('campaign_target_cpa_not_set', 409);
    }
    if ($campaign['target_cpa_micros'] !== $expectedMicros) throw new HubGoogleAdsApiException('campaign_target_cpa_changed', 409);
    $commission = hub_google_ads_campaign_cpa_commission_from_name($campaign['name']);
    if ($commission === null || $commission['currency'] !== $sourceCurrency || (string)$commission['cents'] !== $commissionCents) {
        throw new HubGoogleAdsApiException('campaign_target_cpa_commission_changed', 409);
    }
    $sourceCents = (int)$commissionCents;
    if ($sourceCurrency === $expectedCurrency) {
        $targetCommissionCents = $sourceCents;
    } elseif ($sourceCurrency === 'USD' && $expectedCurrency === 'BRL') {
        $targetCommissionCents = (int)round($sourceCents * $rate, 0, PHP_ROUND_HALF_UP);
    } elseif ($sourceCurrency === 'BRL' && $expectedCurrency === 'USD') {
        $targetCommissionCents = (int)round($sourceCents / $rate, 0, PHP_ROUND_HALF_UP);
    } else {
        throw new HubGoogleAdsApiException('campaign_target_cpa_currency_mismatch', 409);
    }
    if ($targetCommissionCents <= 0 || (string)$targetCommissionCents !== $expectedTargetCents) {
        throw new HubGoogleAdsApiException('campaign_target_cpa_currency_mismatch', 409);
    }
    $stepPercentagePoints = (int)$stepValue;
    $deltaCents = (int)round($targetCommissionCents * $stepPercentagePoints / 100, 0, PHP_ROUND_HALF_UP);
    if ($deltaCents < 1) throw new HubGoogleAdsApiException('campaign_target_cpa_adjustment_too_small', 409);
    $previousMicros = (int)$campaign['target_cpa_micros'];
    $deltaMicros = $deltaCents * 10000;
    $targetMicros = $previousMicros + ($direction === 'increase' ? $deltaMicros : -$deltaMicros);
    if ($targetMicros <= 0 || $targetMicros > PHP_INT_MAX) throw new HubGoogleAdsApiException('invalid_payload', 400);

    $resourceName = 'customers/' . $customerId . '/campaigns/' . $campaignId;
    $update = ['resourceName' => $resourceName];
    $updateMask = $campaign['strategy_type'] === 'TARGET_CPA' ? 'target_cpa.target_cpa_micros' : 'maximize_conversions.target_cpa_micros';
    if ($campaign['strategy_type'] === 'TARGET_CPA') $update['targetCpa'] = ['targetCpaMicros' => (string)$targetMicros];
    else $update['maximizeConversions'] = ['targetCpaMicros' => (string)$targetMicros];
    $mutation = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/campaigns:mutate', $accessToken,
        json_encode(['operations' => [['update' => $update, 'updateMask' => $updateMask]]], JSON_UNESCAPED_SLASHES), $managerId);
    if (count($mutation['results'] ?? []) !== 1) throw new HubGoogleAdsApiException('campaign_target_cpa_adjustment_unverified', 502);

    try {
        $verified = hub_google_ads_campaign_target_cpa_read($accessToken, $managerId, $customerId, $campaignId, $campaign['currency_code']);
    } catch (Throwable $error) {
        throw new HubGoogleAdsApiException('campaign_target_cpa_adjustment_unverified', 502);
    }
    if ($verified['target_cpa_micros'] !== (string)$targetMicros || $verified['strategy_type'] !== $campaign['strategy_type']) {
        throw new HubGoogleAdsApiException('campaign_target_cpa_adjustment_unverified', 502);
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'adjust_campaign_target_cpa',
        'verified' => true,
        'campaign_id' => $campaignId,
        'campaign_name' => $verified['name'],
        'currency_code' => $verified['currency_code'],
        'direction' => $direction,
        'step_percentage_points' => (string)$stepPercentagePoints,
        'previous_target_cpa_micros' => (string)$previousMicros,
        'target_cpa_micros' => (string)$targetMicros,
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

/** Only explicit ENABLED ↔ PAUSED status changes are available. */
function hub_google_ads_change_campaign_status(
    array $config,
    string $managerId,
    string $customerId,
    string $campaignId,
    string $operation,
    string $expectedStatus,
    string $targetStatus
): array
{
    $transitions = [
        'pause_campaign' => ['ENABLED', 'PAUSED'],
        'enable_campaign' => ['PAUSED', 'ENABLED'],
    ];
    if (($transitions[$operation] ?? null) !== [$expectedStatus, $targetStatus]) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if (!hub_google_ads_campaign_actions_enabled($config)) {
        throw new HubGoogleAdsApiException('campaign_writes_disabled', 403);
    }
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
        throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    }

    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    if (!hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId)) {
        throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    }
    $campaign = hub_google_ads_campaign_action_read($accessToken, $managerId, $customerId, $campaignId);
    if ($campaign['status'] === $targetStatus) {
        return [
            'ok' => true,
            'schema_version' => 1,
            'operation' => $operation,
            'changed' => false,
            'verified' => true,
            'campaign_id' => $campaignId,
            'campaign_name' => $campaign['name'],
            'status' => $targetStatus,
            'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
    }
    if ($campaign['status'] !== $expectedStatus) {
        throw new HubGoogleAdsApiException('campaign_status_changed', 409);
    }

    $resourceName = 'customers/' . $customerId . '/campaigns/' . $campaignId;
    $mutation = hub_google_ads_api_request(
        'POST',
        'customers/' . $customerId . '/campaigns:mutate',
        $accessToken,
        json_encode([
            'operations' => [[
                'update' => ['resourceName' => $resourceName, 'status' => $targetStatus],
                'updateMask' => 'status',
            ]],
        ], JSON_UNESCAPED_SLASHES),
        $managerId
    );
    if (count($mutation['results'] ?? []) !== 1) {
        throw new HubGoogleAdsApiException('campaign_status_unverified', 502);
    }

    try {
        $verifiedCampaign = hub_google_ads_campaign_action_read($accessToken, $managerId, $customerId, $campaignId);
    } catch (Throwable $error) {
        throw new HubGoogleAdsApiException('campaign_status_unverified', 502);
    }
    if ($verifiedCampaign['status'] !== $targetStatus) {
        throw new HubGoogleAdsApiException('campaign_status_unverified', 502);
    }

    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => $operation,
        'changed' => true,
        'verified' => true,
        'campaign_id' => $campaignId,
        'campaign_name' => $verifiedCampaign['name'],
        'status' => $targetStatus,
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

/** Campaign creation is separately gated so existing pause/enable access stays unchanged. */
function hub_google_ads_campaign_creation_enabled(array $config): bool
{
    return ($config['tracking_google_ads_campaign_creation_enabled'] ?? false) === true
        && count(hub_google_ads_campaign_write_manager_customer_ids($config)) > 0;
}

function hub_google_ads_campaign_creation_authorize(array $config, string $accessToken, string $managerId, string $customerId): void
{
    if (!hub_google_ads_campaign_creation_enabled($config)) {
        throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    }
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)
        || !hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId)) {
        throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    }
}

function hub_google_ads_campaign_creation_text_length(string $value): int
{
    if (preg_match_all('/./us', $value, $matches) === false) return PHP_INT_MAX;
    return count($matches[0]);
}

function hub_google_ads_campaign_creation_lower(string $value): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function hub_google_ads_campaign_creation_substr(string $value, int $start, int $length): string
{
    return function_exists('mb_substr') ? mb_substr($value, $start, $length, 'UTF-8') : substr($value, $start, $length);
}

function hub_google_ads_campaign_creation_decimal_micros(mixed $value): ?string
{
    if (!is_string($value) || preg_match('/^(?:0|[1-9][0-9]{0,9})(?:\.([0-9]{1,6}))?$/D', $value, $matches) !== 1) return null;
    $parts = explode('.', $value, 2);
    $micros = $parts[0] . str_pad($parts[1] ?? '', 6, '0');
    $micros = ltrim($micros, '0');
    if ($micros === '') $micros = '0';
    if (strlen($micros) > 16 || (strlen($micros) === 16 && strcmp($micros, '9999999999999999') > 0)) return null;
    return $micros;
}

function hub_google_ads_campaign_creation_gaql_string(string $value): string
{
    return "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], $value) . "'";
}

function hub_google_ads_campaign_creation_custom_goal_name(): string
{
    return 'meta personalizada da ação compra';
}

function hub_google_ads_campaign_creation_conversion_action_name(): string
{
    return 'Conversão compra off-line (upload)';
}

/** Select the enabled single-action purchase goal by its configured action, or the legacy exact goal when none is selected. */
function hub_google_ads_campaign_creation_select_custom_goal(array $goalRows, array $actionsByResourceName, string $effectiveConversionCustomerId, ?array $selectedAction = null): array
{
    if (preg_match('/^[1-9][0-9]{9}$/D', $effectiveConversionCustomerId) !== 1) {
        throw new HubGoogleAdsApiException('campaign_conversion_goal_unavailable', 422);
    }
    $expectedGoalName = hub_google_ads_campaign_creation_custom_goal_name();
    $expectedActionName = is_array($selectedAction) ? ($selectedAction['name'] ?? null) : hub_google_ads_campaign_creation_conversion_action_name();
    $expectedActionResourceName = is_array($selectedAction) ? ($selectedAction['resource_name'] ?? null) : null;
    if (!is_string($expectedActionName) || trim($expectedActionName) !== $expectedActionName || $expectedActionName === ''
        || (is_array($selectedAction) && (!is_string($expectedActionResourceName)
            || preg_match('#^customers/' . preg_quote($effectiveConversionCustomerId, '#') . '/conversionActions/[1-9][0-9]{0,19}$#D', $expectedActionResourceName) !== 1))) {
        throw new HubGoogleAdsApiException('campaign_conversion_action_unavailable', 422);
    }
    $matches = [];
    foreach ($goalRows as $row) {
        $goal = $row['customConversionGoal'] ?? null;
        if (!is_array($goal) || ($goal['status'] ?? null) !== 'ENABLED') continue;
        $goalName = $goal['name'] ?? null;
        if (!is_string($goalName) || trim($goalName) !== $goalName || $goalName === ''
            || ($selectedAction === null && $goalName !== $expectedGoalName)) continue;
        $goalResourceName = $goal['resourceName'] ?? null;
        $goalActions = $goal['conversionActions'] ?? null;
        if (!is_string($goalResourceName)
            || preg_match('#^customers/' . preg_quote($effectiveConversionCustomerId, '#') . '/customConversionGoals/([1-9][0-9]{0,19})$#D', $goalResourceName) !== 1
            || !is_array($goalActions) || count($goalActions) !== 1 || !array_is_list($goalActions)) {
            continue;
        }
        $actionResourceName = $goalActions[0] ?? null;
        if (!is_string($actionResourceName)
            || preg_match('#^customers/' . preg_quote($effectiveConversionCustomerId, '#') . '/conversionActions/([1-9][0-9]{0,19})$#D', $actionResourceName) !== 1) {
            continue;
        }
        if (is_string($expectedActionResourceName) && $actionResourceName !== $expectedActionResourceName) continue;
        $action = $actionsByResourceName[$actionResourceName] ?? null;
        if (!is_array($action)
            || ($action['resourceName'] ?? null) !== $actionResourceName
            || ($action['name'] ?? null) !== $expectedActionName
            || ($action['status'] ?? null) !== 'ENABLED'
            || ($action['category'] ?? null) !== 'PURCHASE'
            || ($action['type'] ?? null) !== 'UPLOAD_CLICKS') {
            continue;
        }
        $matches[] = [
            'resource_name' => $goalResourceName,
            'name' => $goalName,
            'conversion_action_resource_name' => $actionResourceName,
            'conversion_action_name' => $expectedActionName,
        ];
    }
    if (count($matches) === 0) {
        throw new HubGoogleAdsApiException($selectedAction !== null
            ? 'campaign_conversion_action_unavailable' : 'campaign_conversion_goal_unavailable', 422);
    }
    if (count($matches) !== 1) throw new HubGoogleAdsApiException($selectedAction !== null
        ? 'campaign_conversion_action_ambiguous' : 'campaign_conversion_goal_ambiguous', 422);
    return $matches[0];
}

/** Resolve the effective conversion account configured for one child customer. */
function hub_google_ads_campaign_creation_effective_conversion_customer(string $accessToken, string $managerId, string $customerId): string
{
    $customerRows = hub_google_ads_search($customerId,
        'SELECT customer.conversion_tracking_setting.google_ads_conversion_customer FROM customer LIMIT 1',
        $accessToken, $managerId);
    $conversionCustomerResource = $customerRows[0]['customer']['conversionTrackingSetting']['googleAdsConversionCustomer'] ?? null;
    if (count($customerRows) !== 1 || !is_string($conversionCustomerResource)
        || preg_match('#^customers/([1-9][0-9]{9})$#D', $conversionCustomerResource, $conversionCustomerMatch) !== 1) {
        throw new HubGoogleAdsApiException('campaign_conversion_goal_unavailable', 422);
    }
    return $conversionCustomerMatch[1];
}

/** Resolve the user's approved goal directly in an effective conversion account. */
function hub_google_ads_campaign_creation_resolve_custom_goal_for_conversion_customer(string $accessToken, string $managerId, string $effectiveConversionCustomerId, ?array $selectedAction = null): array
{
    if (preg_match('/^[1-9][0-9]{9}$/D', $effectiveConversionCustomerId) !== 1) {
        throw new HubGoogleAdsApiException('campaign_conversion_goal_unavailable', 422);
    }
    $goalQuery = 'SELECT custom_conversion_goal.resource_name, custom_conversion_goal.name, custom_conversion_goal.status, custom_conversion_goal.conversion_actions '
        . "FROM custom_conversion_goal WHERE custom_conversion_goal.status = 'ENABLED'";
    if ($selectedAction !== null) {
        $selectedResourceName = $selectedAction['resource_name'] ?? null;
        if (!is_string($selectedResourceName)
            || preg_match('#^customers/' . preg_quote($effectiveConversionCustomerId, '#') . '/conversionActions/[1-9][0-9]{0,19}$#D', $selectedResourceName) !== 1) {
            throw new HubGoogleAdsApiException('campaign_conversion_action_unavailable', 422);
        }
        $goalQuery .= ' AND custom_conversion_goal.conversion_actions CONTAINS ANY ('
            . hub_google_ads_campaign_creation_gaql_string($selectedResourceName) . ')';
    } else {
        $goalQuery .= ' AND custom_conversion_goal.name = '
            . hub_google_ads_campaign_creation_gaql_string(hub_google_ads_campaign_creation_custom_goal_name());
    }
    $goalRows = hub_google_ads_search($effectiveConversionCustomerId,
        $goalQuery . ' LIMIT 21',
        $accessToken, $managerId);
    if (count($goalRows) > 20) throw new HubGoogleAdsApiException('campaign_conversion_goal_ambiguous', 422);

    $actionResourcesByCustomer = [];
    foreach ($goalRows as $row) {
        $goal = $row['customConversionGoal'] ?? null;
        $actions = is_array($goal) ? ($goal['conversionActions'] ?? null) : null;
        if (!is_array($actions) || count($actions) !== 1 || !array_is_list($actions)) continue;
        $actionResourceName = $actions[0] ?? null;
        if (!is_string($actionResourceName)
            || preg_match('#^customers/([1-9][0-9]{9})/conversionActions/([1-9][0-9]{0,19})$#D', $actionResourceName, $matches) !== 1) continue;
        $actionResourcesByCustomer[$matches[1]][$actionResourceName] = $actionResourceName;
    }
    if ($selectedAction !== null) {
        $selectedResourceName = $selectedAction['resource_name'] ?? null;
        if (!is_string($selectedResourceName)
            || preg_match('#^customers/' . preg_quote($effectiveConversionCustomerId, '#') . '/conversionActions/[1-9][0-9]{0,19}$#D', $selectedResourceName) !== 1) {
            throw new HubGoogleAdsApiException('campaign_conversion_action_unavailable', 422);
        }
        if (!isset($actionResourcesByCustomer[$effectiveConversionCustomerId][$selectedResourceName])) {
            throw new HubGoogleAdsApiException('campaign_conversion_action_unavailable', 422);
        }
    }
    $actionsByResourceName = [];
    foreach ($actionResourcesByCustomer as $conversionCustomerId => $resources) {
        $quoted = array_map(static fn(string $resource): string => hub_google_ads_campaign_creation_gaql_string($resource), array_values($resources));
        $actionRows = hub_google_ads_search((string)$conversionCustomerId,
            'SELECT conversion_action.resource_name, conversion_action.name, conversion_action.status, conversion_action.category, conversion_action.type '
            . 'FROM conversion_action WHERE conversion_action.resource_name IN (' . implode(', ', $quoted) . ') LIMIT 21',
            $accessToken, $managerId);
        if (count($actionRows) > 20) throw new HubGoogleAdsApiException('campaign_conversion_goal_ambiguous', 422);
        foreach ($actionRows as $row) {
            $action = $row['conversionAction'] ?? null;
            if (!is_array($action) || !is_string($action['resourceName'] ?? null)) continue;
            $actionsByResourceName[$action['resourceName']] = $action;
        }
    }
    return hub_google_ads_campaign_creation_select_custom_goal($goalRows, $actionsByResourceName, $effectiveConversionCustomerId, $selectedAction);
}

/** Resolve the user's approved goal through the selected customer's effective conversion account. */
function hub_google_ads_campaign_creation_resolve_custom_goal(string $accessToken, string $managerId, string $customerId, ?array $selectedAction = null): array
{
    $effectiveConversionCustomerId = hub_google_ads_campaign_creation_effective_conversion_customer($accessToken, $managerId, $customerId);
    return hub_google_ads_campaign_creation_resolve_custom_goal_for_conversion_customer($accessToken, $managerId, $effectiveConversionCustomerId, $selectedAction);
}

/** Reference a verified shared conversion resource from the campaign account. */
function hub_google_ads_campaign_creation_relative_resource(string $resource, string $customerId, string $kind): string
{
    if (!in_array($kind, ['customConversionGoals', 'conversionActions'], true)
        || preg_match('/^[1-9][0-9]{9}$/D', $customerId) !== 1
        || preg_match('#^customers/([1-9][0-9]{9})/' . $kind . '/([1-9][0-9]{0,19})$#D', $resource, $match) !== 1) {
        throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    }
    return 'customers/' . $customerId . '/' . $kind . '/' . $match[2];
}

/** Apply the custom goal, disable standard campaign goals, then read back the effective setup. */
function hub_google_ads_campaign_creation_apply_and_verify_custom_goal(
    string $accessToken,
    string $managerId,
    string $customerId,
    string $campaignId,
    array $goal
): array {
    $goalResourceName = $goal['resource_name'] ?? null;
    $actionResourceName = $goal['conversion_action_resource_name'] ?? null;
    $expectedGoalName = is_string($goal['name'] ?? null) && $goal['name'] !== ''
        ? $goal['name'] : hub_google_ads_campaign_creation_custom_goal_name();
    $expectedActionName = is_string($goal['conversion_action_name'] ?? null) && $goal['conversion_action_name'] !== ''
        ? $goal['conversion_action_name'] : hub_google_ads_campaign_creation_conversion_action_name();
    if (!is_string($goalResourceName)
        || preg_match('#^customers/[1-9][0-9]{9}/customConversionGoals/[1-9][0-9]{0,19}$#D', $goalResourceName) !== 1
        || !is_string($actionResourceName)
        || preg_match('#^customers/[1-9][0-9]{9}/conversionActions/[1-9][0-9]{0,19}$#D', $actionResourceName) !== 1
        || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
        throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    }

    $relativeGoal = hub_google_ads_campaign_creation_relative_resource($goalResourceName, $customerId, 'customConversionGoals');
    $relativeAction = hub_google_ads_campaign_creation_relative_resource($actionResourceName, $customerId, 'conversionActions');
    $configResourceName = 'customers/' . $customerId . '/conversionGoalCampaignConfigs/' . $campaignId;
    $configResponse = hub_google_ads_api_request(
        'POST',
        'customers/' . $customerId . '/conversionGoalCampaignConfigs:mutate',
        $accessToken,
        json_encode(['operations' => [[
            'update' => ['resourceName' => $configResourceName, 'customConversionGoal' => $relativeGoal],
            'updateMask' => 'customConversionGoal',
        ]]], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        $managerId
    );
    if (!is_array($configResponse['results'] ?? null) || count($configResponse['results']) !== 1) {
        throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    }

    $campaignGoalRows = hub_google_ads_campaign_creation_read_campaign_goals($accessToken, $managerId, $customerId, $campaignId);
    $operations = [];
    foreach ($campaignGoalRows as $row) {
        $campaignGoal = $row['campaignConversionGoal'] ?? null;
        if (!is_array($campaignGoal)
            || !is_string($campaignGoal['resourceName'] ?? null)
            || !str_starts_with($campaignGoal['resourceName'], 'customers/' . $customerId . '/campaignConversionGoals/')) {
            throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
        }
        $operations[] = [
            'update' => ['resourceName' => $campaignGoal['resourceName'], 'biddable' => false],
            'updateMask' => 'biddable',
        ];
    }
    if ($operations) {
        $goalsResponse = hub_google_ads_api_request(
            'POST',
            'customers/' . $customerId . '/campaignConversionGoals:mutate',
            $accessToken,
            json_encode(['operations' => $operations], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            $managerId
        );
        if (!is_array($goalsResponse['results'] ?? null) || count($goalsResponse['results']) !== count($operations)) {
            throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
        }
    }

    $verifiedConfigRows = hub_google_ads_search($customerId,
        'SELECT conversion_goal_campaign_config.goal_config_level, conversion_goal_campaign_config.custom_conversion_goal, '
        . 'custom_conversion_goal.name, custom_conversion_goal.status, custom_conversion_goal.conversion_actions '
        . 'FROM conversion_goal_campaign_config WHERE campaign.id = ' . $campaignId . ' LIMIT 2',
        $accessToken, $managerId);
    $verifiedCampaignGoalRows = hub_google_ads_campaign_creation_read_campaign_goals($accessToken, $managerId, $customerId, $campaignId);
    if (count($verifiedConfigRows) !== 1 || count($verifiedCampaignGoalRows) !== 0) {
        throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    }
    $verifiedConfig = $verifiedConfigRows[0];
    $configFields = $verifiedConfig['conversionGoalCampaignConfig'] ?? null;
    $verifiedGoal = $verifiedConfig['customConversionGoal'] ?? null;
    $verifiedActions = is_array($verifiedGoal) ? ($verifiedGoal['conversionActions'] ?? null) : null;
    if (!is_array($configFields) || !is_array($verifiedGoal) || !is_array($verifiedActions)
        || ($configFields['goalConfigLevel'] ?? null) !== 'CAMPAIGN'
        || !in_array(($configFields['customConversionGoal'] ?? null), [$relativeGoal, $goalResourceName], true)
        || ($verifiedGoal['name'] ?? null) !== $expectedGoalName
        || ($verifiedGoal['status'] ?? null) !== 'ENABLED'
        || count($verifiedActions) !== 1 || !in_array(($verifiedActions[0] ?? null), [$relativeAction, $actionResourceName], true)) {
        throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    }
    return [
        'goal_name' => $expectedGoalName,
        'conversion_action_name' => $expectedActionName,
        'conversion_action_resource_name' => $actionResourceName,
        'verified' => true,
    ];
}

/** Check whether the exact Hub purchase goal is already active for this campaign. */
function hub_google_ads_campaign_creation_custom_goal_is_current(
    string $accessToken,
    string $managerId,
    string $customerId,
    string $campaignId,
    array $goal
): bool {
    $goalResourceName = $goal['resource_name'] ?? null;
    $actionResourceName = $goal['conversion_action_resource_name'] ?? null;
    if (!is_string($goalResourceName)
        || !is_string($actionResourceName)
        || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
        throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    }
    $relativeGoal = hub_google_ads_campaign_creation_relative_resource($goalResourceName, $customerId, 'customConversionGoals');
    $relativeAction = hub_google_ads_campaign_creation_relative_resource($actionResourceName, $customerId, 'conversionActions');
    $rows = hub_google_ads_search($customerId,
        'SELECT conversion_goal_campaign_config.goal_config_level, conversion_goal_campaign_config.custom_conversion_goal, '
        . 'custom_conversion_goal.name, custom_conversion_goal.status, custom_conversion_goal.conversion_actions '
        . 'FROM conversion_goal_campaign_config WHERE campaign.id = ' . $campaignId . ' LIMIT 2',
        $accessToken, $managerId);
    if (count($rows) > 1) throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    if (count($rows) !== 1) return false;
    $config = $rows[0]['conversionGoalCampaignConfig'] ?? null;
    $customGoal = $rows[0]['customConversionGoal'] ?? null;
    $actions = is_array($customGoal) ? ($customGoal['conversionActions'] ?? null) : null;
    $expectedGoalName = is_string($goal['name'] ?? null) && $goal['name'] !== ''
        ? $goal['name'] : hub_google_ads_campaign_creation_custom_goal_name();
    if (!is_array($config) || !is_array($customGoal) || !is_array($actions)
        || ($config['goalConfigLevel'] ?? null) !== 'CAMPAIGN'
        || !in_array(($config['customConversionGoal'] ?? null), [$relativeGoal, $goalResourceName], true)
        || ($customGoal['name'] ?? null) !== $expectedGoalName
        || ($customGoal['status'] ?? null) !== 'ENABLED'
        || count($actions) !== 1 || !in_array(($actions[0] ?? null), [$relativeAction, $actionResourceName], true)) {
        return false;
    }
    return hub_google_ads_campaign_creation_read_campaign_goals($accessToken, $managerId, $customerId, $campaignId) === [];
}

function hub_google_ads_campaign_creation_read_campaign_goals(
    string $accessToken,
    string $managerId,
    string $customerId,
    string $campaignId
): array {
    $rows = hub_google_ads_search($customerId,
        'SELECT campaign_conversion_goal.resource_name '
        . 'FROM campaign_conversion_goal WHERE campaign.id = ' . $campaignId . ' AND campaign_conversion_goal.biddable = TRUE LIMIT 101',
        $accessToken, $managerId);
    if (count($rows) > 100) throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    return $rows;
}

function hub_google_ads_campaign_creation_customer_currency(string $accessToken, string $managerId, string $customerId): string
{
    $rows = hub_google_ads_search($customerId, 'SELECT customer.currency_code FROM customer LIMIT 1', $accessToken, $managerId);
    $currency = (string)($rows[0]['customer']['currencyCode'] ?? '');
    if (count($rows) !== 1 || preg_match('/^[A-Z]{3}$/D', $currency) !== 1) {
        throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    }
    return $currency;
}

/** Resolve a small explicit list of ISO-3166 alpha-2 countries to active Google geo targets. */
function hub_google_ads_campaign_creation_resolve_countries(string $accessToken, string $managerId, string $customerId, array $countryCodes): array
{
    if (!$countryCodes) return [];
    $quoted = array_map(static fn(string $code): string => hub_google_ads_campaign_creation_gaql_string($code), $countryCodes);
    $rows = hub_google_ads_search($customerId,
        'SELECT geo_target_constant.canonical_name, geo_target_constant.country_code, geo_target_constant.id, geo_target_constant.name, geo_target_constant.status, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.country_code IN (' . implode(', ', $quoted) . ") AND geo_target_constant.target_type = 'Country' AND geo_target_constant.status = 'ENABLED' LIMIT 51",
        $accessToken, $managerId);
    if (count($rows) > 50) throw new HubGoogleAdsApiException('campaign_country_limit_exceeded', 422);
    $resolved = [];
    foreach ($rows as $row) {
        $geo = $row['geoTargetConstant'] ?? null;
        if (!is_array($geo)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $code = (string)($geo['countryCode'] ?? '');
        $id = (string)($geo['id'] ?? '');
        if (!in_array($code, $countryCodes, true) || preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1
            || ($geo['status'] ?? null) !== 'ENABLED' || ($geo['targetType'] ?? null) !== 'Country'
            || isset($resolved[$code])) {
            throw new HubGoogleAdsApiException('campaign_country_not_targetable', 422);
        }
        $resolved[$code] = [
            'country_code' => $code,
            'name' => (string)($geo['canonicalName'] ?? $geo['name'] ?? $code),
            'resource_name' => 'geoTargetConstants/' . $id,
        ];
    }
    if (count($resolved) !== count($countryCodes)) throw new HubGoogleAdsApiException('campaign_country_not_targetable', 422);
    return array_values(array_map(static fn(string $code): array => $resolved[$code], $countryCodes));
}

function hub_google_ads_campaign_creation_preview_context_sign(array $context, array $credentials): string
{
    $privateKey = $credentials['private_key'] ?? null;
    if (!is_string($privateKey) || $privateKey === '') throw new HubGoogleAdsApiException('credentials_missing', 503);
    $encodedPayload = json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($encodedPayload)) throw new RuntimeException('Could not encode campaign preview context.');
    $body = hub_google_ads_base64url($encodedPayload);
    $signingKey = hash('sha256', "hub-google-ads-campaign-preview-context:v1\0" . $privateKey, true);
    $signature = hub_google_ads_base64url(hash_hmac('sha256', $body, $signingKey, true));
    return $body . '.' . $signature;
}

function hub_google_ads_campaign_creation_preview_context_decode(string $token, array $credentials, string $managerId, string $customerId, string $geoTargetingMode, array $countryCodes, ?array $selectedAction = null): array
{
    if (strlen($token) > 8192 || preg_match('/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/D', $token, $matches) !== 1) {
        throw new HubGoogleAdsApiException('campaign_preview_context_invalid', 409);
    }
    $privateKey = $credentials['private_key'] ?? null;
    if (!is_string($privateKey) || $privateKey === '') throw new HubGoogleAdsApiException('credentials_missing', 503);
    $body = $matches[1];
    $suppliedSignature = $matches[2];
    $signingKey = hash('sha256', "hub-google-ads-campaign-preview-context:v1\0" . $privateKey, true);
    $expectedSignature = hub_google_ads_base64url(hash_hmac('sha256', $body, $signingKey, true));
    if (!hash_equals($expectedSignature, $suppliedSignature)) throw new HubGoogleAdsApiException('campaign_preview_context_invalid', 409);

    $encodedPayload = strtr($body, '-_', '+/');
    $encodedPayload .= str_repeat('=', (4 - strlen($encodedPayload) % 4) % 4);
    $json = base64_decode($encodedPayload, true);
    $context = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($context)) throw new HubGoogleAdsApiException('campaign_preview_context_invalid', 409);
    $now = time();
    $issuedAt = $context['issued_at'] ?? null;
    $expiresAt = $context['expires_at'] ?? null;
    if (!is_int($issuedAt) || !is_int($expiresAt) || $expiresAt <= $now) {
        throw new HubGoogleAdsApiException('campaign_preview_context_expired', 409);
    }
    if ($issuedAt > $now + 60 || $expiresAt <= $issuedAt || $expiresAt - $issuedAt > 1200
        || ($context['schema_version'] ?? null) !== 1
        || ($context['manager_customer_id'] ?? null) !== $managerId
        || ($context['customer_id'] ?? null) !== $customerId
        || ($context['authorized_active_child'] ?? null) !== true
        || ($context['geo_targeting_mode'] ?? null) !== $geoTargetingMode
        || ($context['geo_target_country_codes'] ?? null) !== $countryCodes
        || !is_string($context['account_currency'] ?? null)
        || preg_match('/^[A-Z]{3}$/D', $context['account_currency']) !== 1) {
        throw new HubGoogleAdsApiException('campaign_preview_context_invalid', 409);
    }

    $conversionCustomerId = (string)($context['conversion_customer_id'] ?? '');
    $goalResourceName = (string)($context['custom_conversion_goal_resource_name'] ?? '');
    $actionResourceName = (string)($context['conversion_action_resource_name'] ?? '');
    $expectedActionName = is_array($selectedAction) ? ($selectedAction['name'] ?? null) : hub_google_ads_campaign_creation_conversion_action_name();
    $expectedActionResourceName = is_array($selectedAction) ? ($selectedAction['resource_name'] ?? null) : null;
    if (preg_match('/^[1-9][0-9]{9}$/D', $conversionCustomerId) !== 1
        || preg_match('#^customers/' . preg_quote($conversionCustomerId, '#') . '/customConversionGoals/[1-9][0-9]{0,19}$#D', $goalResourceName) !== 1
        || preg_match('#^customers/' . preg_quote($conversionCustomerId, '#') . '/conversionActions/[1-9][0-9]{0,19}$#D', $actionResourceName) !== 1
        || !is_string($context['custom_conversion_goal_name'] ?? null)
        || trim($context['custom_conversion_goal_name']) !== $context['custom_conversion_goal_name']
        || $context['custom_conversion_goal_name'] === ''
        || ($selectedAction === null && $context['custom_conversion_goal_name'] !== hub_google_ads_campaign_creation_custom_goal_name())
        || ($context['conversion_action_name'] ?? null) !== $expectedActionName
        || (is_string($expectedActionResourceName) && $actionResourceName !== $expectedActionResourceName)) {
        throw new HubGoogleAdsApiException('campaign_preview_context_invalid', 409);
    }
    $locations = $context['locations'] ?? null;
    if (!is_array($locations) || !array_is_list($locations) || count($locations) !== count($countryCodes)) {
        throw new HubGoogleAdsApiException('campaign_preview_context_invalid', 409);
    }
    foreach ($locations as $index => $location) {
        if (!is_array($location) || ($location['country_code'] ?? null) !== $countryCodes[$index]
            || !is_string($location['name'] ?? null) || $location['name'] === ''
            || !is_string($location['resource_name'] ?? null)
            || preg_match('#^geoTargetConstants/[1-9][0-9]{0,19}$#D', $location['resource_name']) !== 1) {
            throw new HubGoogleAdsApiException('campaign_preview_context_invalid', 409);
        }
    }
    return $context;
}

function hub_google_ads_campaign_creation_name_lookup_sign(array $context, array $credentials): string
{
    $privateKey = $credentials['private_key'] ?? null;
    if (!is_string($privateKey) || $privateKey === '') throw new HubGoogleAdsApiException('credentials_missing', 503);
    $encodedPayload = json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($encodedPayload)) throw new RuntimeException('Could not encode campaign name lookup context.');
    $body = hub_google_ads_base64url($encodedPayload);
    $signingKey = hash('sha256', "hub-google-ads-campaign-name-lookup:v1\0" . $privateKey, true);
    $signature = hub_google_ads_base64url(hash_hmac('sha256', $body, $signingKey, true));
    return $body . '.' . $signature;
}

/** Decode a short-lived, account- and campaign-name-bound result of the grouped duplicate-name lookup. */
function hub_google_ads_campaign_creation_name_lookup_decode(string $token, array $credentials, string $managerId, string $customerId, string $campaignName): array
{
    if (strlen($token) > 8192 || preg_match('/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/D', $token, $matches) !== 1) {
        throw new HubGoogleAdsApiException('campaign_name_lookup_context_invalid', 409);
    }
    $privateKey = $credentials['private_key'] ?? null;
    if (!is_string($privateKey) || $privateKey === '') throw new HubGoogleAdsApiException('credentials_missing', 503);
    $body = $matches[1];
    $signingKey = hash('sha256', "hub-google-ads-campaign-name-lookup:v1\0" . $privateKey, true);
    $expectedSignature = hub_google_ads_base64url(hash_hmac('sha256', $body, $signingKey, true));
    if (!hash_equals($expectedSignature, $matches[2])) throw new HubGoogleAdsApiException('campaign_name_lookup_context_invalid', 409);

    $encodedPayload = strtr($body, '-_', '+/');
    $encodedPayload .= str_repeat('=', (4 - strlen($encodedPayload) % 4) % 4);
    $json = base64_decode($encodedPayload, true);
    $context = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($context)) throw new HubGoogleAdsApiException('campaign_name_lookup_context_invalid', 409);
    $now = time();
    $issuedAt = $context['issued_at'] ?? null;
    $expiresAt = $context['expires_at'] ?? null;
    if (!is_int($issuedAt) || !is_int($expiresAt) || $expiresAt <= $now) {
        throw new HubGoogleAdsApiException('campaign_name_lookup_context_expired', 409);
    }
    if ($issuedAt > $now + 60 || $expiresAt <= $issuedAt || $expiresAt - $issuedAt > 1200
        || ($context['schema_version'] ?? null) !== 1
        || ($context['manager_customer_id'] ?? null) !== $managerId
        || ($context['customer_id'] ?? null) !== $customerId
        || ($context['campaign_name'] ?? null) !== $campaignName
        || !is_array($context['matches'] ?? null) || !array_is_list($context['matches']) || count($context['matches']) > 2) {
        throw new HubGoogleAdsApiException('campaign_name_lookup_context_invalid', 409);
    }
    $rows = [];
    foreach ($context['matches'] as $match) {
        if (!is_array($match)
            || !is_string($match['id'] ?? null) || preg_match('/^[1-9][0-9]{0,19}$/D', $match['id']) !== 1
            || !is_string($match['name'] ?? null) || hub_google_ads_campaign_creation_text_length($match['name']) > 128
            || !in_array($match['status'] ?? null, ['ENABLED', 'PAUSED'], true)
            || !is_string($match['channel_type'] ?? null) || preg_match('/^[A-Z][A-Z_]{1,63}$/D', $match['channel_type']) !== 1
            || !is_bool($match['audience_grouped'] ?? null)) {
            throw new HubGoogleAdsApiException('campaign_name_lookup_context_invalid', 409);
        }
        $rows[] = ['campaign' => [
            'id' => $match['id'],
            'name' => $match['name'],
            'status' => $match['status'],
            'advertisingChannelType' => $match['channel_type'],
            'audienceSetting' => ['useAudienceGrouped' => $match['audience_grouped']],
        ]];
    }
    return $rows;
}

/** Preflight the shared account/MCC reads once, then return signed short-lived contexts for per-campaign previews. */
function hub_google_ads_campaign_creation_prepare_preview_contexts(array $config, array $payload): array
{
    $expected = ['contexts', 'manager_customer_id', 'operation'];
    if (array_key_exists('campaign_names_by_customer', $payload)) $expected[] = 'campaign_names_by_customer';
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'prepare_search_campaign_preview_contexts') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $contextSpecs = $payload['contexts'] ?? null;
    if ($managerId === null || !is_array($contextSpecs) || !array_is_list($contextSpecs)
        || count($contextSpecs) < 1 || count($contextSpecs) > 100) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if (!hub_google_ads_campaign_creation_enabled($config)) throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);

    $normalizedSpecs = [];
    $seenSpecs = [];
    foreach ($contextSpecs as $spec) {
        if (!is_array($spec)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $specKeys = array_keys($spec); sort($specKeys, SORT_STRING);
        $baseSpecKeys = ['customer_id', 'geo_target_country_codes', 'geo_targeting_mode'];
        $selectedSpecKeys = array_merge($baseSpecKeys, ['conversion_action_name', 'conversion_action_resource_name']);
        sort($baseSpecKeys, SORT_STRING); sort($selectedSpecKeys, SORT_STRING);
        $hasActionName = array_key_exists('conversion_action_name', $spec);
        $hasActionResource = array_key_exists('conversion_action_resource_name', $spec);
        if (($specKeys !== $baseSpecKeys && $specKeys !== $selectedSpecKeys) || $hasActionName !== $hasActionResource) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $customerId = hub_google_ads_valid_customer_id($spec['customer_id'] ?? null);
        $geoTargetingMode = $spec['geo_targeting_mode'] ?? null;
        $countryCodes = $spec['geo_target_country_codes'] ?? null;
        $selectedAction = null;
        if ($hasActionName) {
            $actionName = $spec['conversion_action_name'];
            $actionResourceName = $spec['conversion_action_resource_name'];
            if (!is_string($actionName) || trim($actionName) !== $actionName || $actionName === '' || strlen($actionName) > 255
                || !is_string($actionResourceName)
                || preg_match('#^customers/' . preg_quote($managerId, '#') . '/conversionActions/[1-9][0-9]{0,19}$#D', $actionResourceName) !== 1) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $selectedAction = ['name' => $actionName, 'resource_name' => $actionResourceName];
        }
        if ($customerId === null || $customerId === $managerId || !in_array($geoTargetingMode, ['COUNTRIES', 'WORLD'], true)
            || !is_array($countryCodes) || !array_is_list($countryCodes)
            || ($geoTargetingMode === 'WORLD' ? count($countryCodes) !== 0 : (count($countryCodes) < 1 || count($countryCodes) > 20))) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $countrySeen = [];
        foreach ($countryCodes as $code) {
            if (!is_string($code) || preg_match('/^[A-Z]{2}$/D', $code) !== 1 || isset($countrySeen[$code])) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $countrySeen[$code] = true;
        }
        $key = hash('sha256', json_encode([$customerId, $geoTargetingMode, $countryCodes, $selectedAction], JSON_UNESCAPED_SLASHES));
        if (isset($seenSpecs[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $seenSpecs[$key] = true;
        $normalizedSpecs[] = ['customer_id' => $customerId, 'geo_targeting_mode' => $geoTargetingMode, 'geo_target_country_codes' => $countryCodes, 'selected_action' => $selectedAction, 'key' => $key];
    }

    $customerIds = array_fill_keys(array_column($normalizedSpecs, 'customer_id'), true);
    $campaignNamesByCustomer = [];
    $lookupSpecs = $payload['campaign_names_by_customer'] ?? null;
    if (array_key_exists('campaign_names_by_customer', $payload)) {
        if (!is_array($lookupSpecs) || !array_is_list($lookupSpecs) || count($lookupSpecs) < 1 || count($lookupSpecs) > 100) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $totalNames = 0;
        foreach ($lookupSpecs as $lookupSpec) {
            if (!is_array($lookupSpec)) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $lookupKeys = array_keys($lookupSpec); sort($lookupKeys, SORT_STRING);
            if ($lookupKeys !== ['campaign_names', 'customer_id']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $customerId = hub_google_ads_valid_customer_id($lookupSpec['customer_id'] ?? null);
            $names = $lookupSpec['campaign_names'] ?? null;
            if ($customerId === null || !isset($customerIds[$customerId]) || isset($campaignNamesByCustomer[$customerId])
                || !is_array($names) || !array_is_list($names) || count($names) < 1 || count($names) > 500) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $seenNames = [];
            foreach ($names as $name) {
                if (!is_string($name) || trim($name) !== $name || $name === ''
                    || hub_google_ads_campaign_creation_text_length($name) > 128
                    || preg_match('/[\x00-\x1F\x7F]/', $name) === 1 || isset($seenNames[$name])) {
                    throw new HubGoogleAdsApiException('invalid_payload', 400);
                }
                $seenNames[$name] = true;
            }
            $totalNames += count($names);
            if ($totalNames > 500) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $campaignNamesByCustomer[$customerId] = array_values($names);
        }
    }

    $credentials = hub_google_ads_credentials();
    $accessToken = hub_google_ads_access_token($credentials);
    $accounts = [];
    foreach ($normalizedSpecs as $spec) {
        $customerId = $spec['customer_id'];
        if (isset($accounts[$customerId])) continue;
        hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
        $conversionCustomerId = hub_google_ads_campaign_creation_effective_conversion_customer($accessToken, $managerId, $customerId);
        $accounts[$customerId] = [
            'conversion_customer_id' => $conversionCustomerId,
            'account_currency' => hub_google_ads_campaign_creation_customer_currency($accessToken, $managerId, $customerId),
        ];
    }
    $goalsByConversionCustomer = [];
    foreach ($normalizedSpecs as $spec) {
        $conversionCustomerId = $accounts[$spec['customer_id']]['conversion_customer_id'];
        $selectedAction = $spec['selected_action'];
        $goalKey = hash('sha256', json_encode([$conversionCustomerId, $selectedAction], JSON_UNESCAPED_SLASHES));
        if (!isset($goalsByConversionCustomer[$goalKey])) {
            $goalsByConversionCustomer[$goalKey] = hub_google_ads_campaign_creation_resolve_custom_goal_for_conversion_customer($accessToken, $managerId, $conversionCustomerId, $selectedAction);
        }
    }

    $issuedAt = time();
    $contexts = [];
    foreach ($normalizedSpecs as $spec) {
        $customerId = $spec['customer_id'];
        $account = $accounts[$customerId];
        $locations = hub_google_ads_campaign_creation_resolve_countries($accessToken, $managerId, $customerId, $spec['geo_target_country_codes']);
        $goalKey = hash('sha256', json_encode([$account['conversion_customer_id'], $spec['selected_action']], JSON_UNESCAPED_SLASHES));
        $goal = $goalsByConversionCustomer[$goalKey];
        $signedContext = [
            'schema_version' => 1,
            'manager_customer_id' => $managerId,
            'customer_id' => $customerId,
            'authorized_active_child' => true,
            'issued_at' => $issuedAt,
            'expires_at' => $issuedAt + 1200,
            'conversion_customer_id' => $account['conversion_customer_id'],
            'custom_conversion_goal_resource_name' => $goal['resource_name'],
            'custom_conversion_goal_name' => $goal['name'],
            'conversion_action_resource_name' => $goal['conversion_action_resource_name'],
            'conversion_action_name' => $goal['conversion_action_name'],
            'account_currency' => $account['account_currency'],
            'geo_targeting_mode' => $spec['geo_targeting_mode'],
            'geo_target_country_codes' => $spec['geo_target_country_codes'],
            'locations' => $locations,
        ];
        $contexts[] = [
            'customer_id' => $customerId,
            'geo_targeting_mode' => $spec['geo_targeting_mode'],
            'geo_target_country_codes' => $spec['geo_target_country_codes'],
            'conversion_customer_id' => $account['conversion_customer_id'],
            'account_currency' => $account['account_currency'],
            'custom_conversion_goal_name' => $goal['name'],
            'conversion_action_name' => $goal['conversion_action_name'],
            'conversion_action_resource_name' => $goal['conversion_action_resource_name'],
            'preview_context' => hub_google_ads_campaign_creation_preview_context_sign($signedContext, $credentials),
        ];
    }

    $campaignNameLookups = [];
    $campaignNameLookupQueryCount = 0;
    foreach ($campaignNamesByCustomer as $customerId => $names) {
        // PHP converts numeric-string array keys to integers; the Ads helper requires a string.
        $customerId = (string)$customerId;
        $matchesByName = array_fill_keys($names, []);
        $requestedNameAliases = [];
        foreach ($names as $name) $requestedNameAliases[hub_google_ads_campaign_creation_lower($name)][] = $name;
        foreach (array_chunk($names, 40) as $nameChunk) {
            $quotedNames = array_map('hub_google_ads_campaign_creation_gaql_string', $nameChunk);
            $query = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.audience_setting.use_audience_grouped FROM campaign WHERE campaign.name IN ('
                . implode(', ', $quotedNames) . ") AND campaign.status != 'REMOVED'";
            $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
            $campaignNameLookupQueryCount++;
            foreach ($rows as $row) {
                $campaign = $row['campaign'] ?? null;
                if (!is_array($campaign)) continue;
                $name = $campaign['name'] ?? null;
                if (!is_string($name)) continue;
                $requestedNames = $requestedNameAliases[hub_google_ads_campaign_creation_lower($name)] ?? [];
                if (!$requestedNames) continue;
                $match = [
                    'id' => (string)($campaign['id'] ?? ''),
                    'name' => $name,
                    'status' => $campaign['status'] ?? null,
                    'channel_type' => $campaign['advertisingChannelType'] ?? null,
                    'audience_grouped' => $campaign['audienceSetting']['useAudienceGrouped'] ?? false,
                ];
                foreach ($requestedNames as $requestedName) {
                    if (count($matchesByName[$requestedName]) < 2) $matchesByName[$requestedName][] = $match;
                }
            }
        }
        foreach ($names as $name) {
            $lookupContext = [
                'schema_version' => 1,
                'manager_customer_id' => $managerId,
                'customer_id' => $customerId,
                'campaign_name' => $name,
                'issued_at' => $issuedAt,
                'expires_at' => $issuedAt + 1200,
                'matches' => $matchesByName[$name],
            ];
            $campaignNameLookups[] = [
                'customer_id' => $customerId,
                'campaign_name' => $name,
                'lookup_context' => hub_google_ads_campaign_creation_name_lookup_sign($lookupContext, $credentials),
            ];
        }
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'prepare_search_campaign_preview_contexts',
        'context_count' => count($contexts),
        'conversion_customer_count' => count($goalsByConversionCustomer),
        'contexts' => $contexts,
        'campaign_name_lookup_count' => count($campaignNameLookups),
        'campaign_name_lookups' => $campaignNameLookups,
        'campaign_name_lookup_query_count' => $campaignNameLookupQueryCount,
    ];
}

/**
 * Return only simple Search campaigns that can be copied without silently
 * dropping targeting: one enabled standard ad group, daily unshared budget,
 * manual CPC, enabled positive keywords, and supported campaign criteria.
 */
function hub_google_ads_campaign_creation_templates(string $accessToken, string $managerId, string $customerId): array
{
    $campaignRows = hub_google_ads_search($customerId,
        "SELECT customer.currency_code, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.manual_cpc.enhanced_cpc_enabled, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network, campaign.contains_eu_political_advertising, campaign.tracking_url_template, campaign.final_url_suffix, campaign.url_custom_parameters, campaign_budget.amount_micros, campaign_budget.period, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED' AND campaign.advertising_channel_type = 'SEARCH' LIMIT 101",
        $accessToken, $managerId);
    if (count($campaignRows) > 100) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);

    $currency = '';
    $candidates = [];
    foreach ($campaignRows as $row) {
        $campaign = $row['campaign'] ?? [];
        $budget = $row['campaignBudget'] ?? [];
        if (!is_array($campaign) || !is_array($budget)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $currency = (string)($row['customer']['currencyCode'] ?? $currency);
        $euPolitical = $campaign['containsEuPoliticalAdvertising'] ?? null;
        $id = (string)($campaign['id'] ?? '');
        $amount = (string)($budget['amountMicros'] ?? '');
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        if (($campaign['advertisingChannelType'] ?? null) !== 'SEARCH'
            || ($campaign['biddingStrategyType'] ?? null) !== 'MANUAL_CPC'
            || ($budget['period'] ?? null) !== 'DAILY'
            || ($budget['explicitlyShared'] ?? null) !== false
            || preg_match('/^[1-9][0-9]{0,19}$/D', $amount) !== 1
            || ($campaign['networkSettings']['targetGoogleSearch'] ?? null) !== true
            || !in_array($euPolitical, ['DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING', 'CONTAINS_EU_POLITICAL_ADVERTISING'], true)) continue;
        $candidates[$id] = [
            'campaign_id' => $id,
            'campaign_name' => (string)($campaign['name'] ?? ''),
            'campaign_status' => (string)($campaign['status'] ?? ''),
            'daily_budget_micros' => $amount,
            'currency_code' => $currency,
            'enhanced_cpc_enabled' => (bool)($campaign['manualCpc']['enhancedCpcEnabled'] ?? false),
            'network_settings' => [
                'target_google_search' => true,
                'target_search_network' => (bool)($campaign['networkSettings']['targetSearchNetwork'] ?? false),
                'target_content_network' => (bool)($campaign['networkSettings']['targetContentNetwork'] ?? false),
                'target_partner_search_network' => (bool)($campaign['networkSettings']['targetPartnerSearchNetwork'] ?? false),
            ],
            'contains_eu_political_advertising' => $euPolitical,
            'tracking_settings' => [
                'tracking_url_template' => $campaign['trackingUrlTemplate'] ?? null,
                'final_url_suffix' => $campaign['finalUrlSuffix'] ?? null,
                'url_custom_parameters' => $campaign['urlCustomParameters'] ?? [],
            ],
        ];
    }
    if (!$candidates) return ['currency_code' => $currency, 'templates' => []];
    if (preg_match('/^[A-Z]{3}$/D', $currency) !== 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);

    $idsSql = implode(', ', array_keys($candidates));
    $adGroupRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.cpc_bid_micros, ad_group.tracking_url_template, ad_group.final_url_suffix, ad_group.url_custom_parameters FROM ad_group WHERE campaign.id IN ($idsSql) AND ad_group.status != 'REMOVED' LIMIT 501",
        $accessToken, $managerId);
    if (count($adGroupRows) > 500) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);
    $groups = [];
    foreach ($adGroupRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        if (!isset($candidates[$campaignId]) || !is_array($row['adGroup'] ?? null)) continue;
        $groups[$campaignId][] = $row['adGroup'];
    }
    foreach ($candidates as $id => &$candidate) {
        $candidate['source_ad_group'] = null;
        $rows = $groups[$id] ?? [];
        if (count($rows) !== 1) { unset($candidates[$id]); continue; }
        $group = $rows[0];
        $groupId = (string)($group['id'] ?? '');
        $bid = (string)($group['cpcBidMicros'] ?? '');
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $groupId) !== 1
            || ($group['status'] ?? null) !== 'ENABLED'
            || ($group['type'] ?? null) !== 'SEARCH_STANDARD'
            || preg_match('/^[1-9][0-9]{0,19}$/D', $bid) !== 1) {
            unset($candidates[$id]); continue;
        }
        $candidate['source_ad_group'] = [
            'id' => $groupId,
            'name' => (string)($group['name'] ?? ''),
            'cpc_bid_micros' => $bid,
            'tracking_settings' => [
                'tracking_url_template' => $group['trackingUrlTemplate'] ?? null,
                'final_url_suffix' => $group['finalUrlSuffix'] ?? null,
                'url_custom_parameters' => $group['urlCustomParameters'] ?? [],
            ],
        ];
    }
    unset($candidate);
    if (!$candidates) return ['currency_code' => $currency, 'templates' => []];

    $idsSql = implode(', ', array_keys($candidates));
    $adRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.tracking_url_template, ad_group_ad.ad.final_url_suffix, ad_group_ad.ad.url_custom_parameters FROM ad_group_ad WHERE campaign.id IN ($idsSql) AND ad_group_ad.status != 'REMOVED' LIMIT 501",
        $accessToken, $managerId);
    if (count($adRows) > 500) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);
    $ads = [];
    foreach ($adRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        if (!isset($candidates[$campaignId]) || !is_array($row['adGroupAd'] ?? null)) continue;
        if ((string)($row['adGroup']['id'] ?? '') !== (string)$candidates[$campaignId]['source_ad_group']['id']) continue;
        $ads[$campaignId][] = $row['adGroupAd'];
    }
    foreach ($candidates as $id => &$candidate) {
        $rows = $ads[$id] ?? [];
        if (count($rows) !== 1 || ($rows[0]['status'] ?? null) !== 'ENABLED'
            || ($rows[0]['ad']['type'] ?? null) !== 'RESPONSIVE_SEARCH_AD'
            || preg_match('/^[1-9][0-9]{0,19}$/D', (string)($rows[0]['ad']['id'] ?? '')) !== 1) {
            unset($candidates[$id]); continue;
        }
        $candidate['source_ad'] = [
            'id' => (string)$rows[0]['ad']['id'],
            'tracking_settings' => [
                'tracking_url_template' => $rows[0]['ad']['trackingUrlTemplate'] ?? null,
                'final_url_suffix' => $rows[0]['ad']['finalUrlSuffix'] ?? null,
                'url_custom_parameters' => $rows[0]['ad']['urlCustomParameters'] ?? [],
            ],
        ];
    }
    unset($candidate);
    if (!$candidates) return ['currency_code' => $currency, 'templates' => []];

    $idsSql = implode(', ', array_keys($candidates));
    $criterionRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign_criterion.type, campaign_criterion.status, campaign_criterion.negative, campaign_criterion.location.geo_target_constant, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id IN ($idsSql) AND campaign_criterion.status != 'REMOVED' LIMIT 1001",
        $accessToken, $managerId);
    if (count($criterionRows) > 1000) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);
    $campaignCriteria = [];
    foreach ($criterionRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        if (!isset($candidates[$campaignId])) continue;
        $criterion = $row['campaignCriterion'] ?? [];
        if (!is_array($criterion) || ($criterion['status'] ?? null) !== 'ENABLED') {
            $candidates[$campaignId]['unsupported_targeting'] = true; continue;
        }
        $type = $criterion['type'] ?? null;
        $negative = ($criterion['negative'] ?? false) === true;
        if ($type === 'LOCATION') {
            $geo = (string)($criterion['location']['geoTargetConstant'] ?? '');
            if (preg_match('#^geoTargetConstants/[1-9][0-9]{0,19}$#D', $geo) !== 1) {
                $candidates[$campaignId]['unsupported_targeting'] = true; continue;
            }
            $campaignCriteria[$campaignId][] = ['type' => 'LOCATION', 'negative' => $negative, 'geo_target_constant' => $geo];
        } elseif ($type === 'KEYWORD') {
            $text = $criterion['keyword']['text'] ?? null;
            $matchType = $criterion['keyword']['matchType'] ?? null;
            if (!is_string($text) || $text === '' || !in_array($matchType, ['EXACT', 'PHRASE', 'BROAD'], true) || !$negative) {
                $candidates[$campaignId]['unsupported_targeting'] = true; continue;
            }
            $campaignCriteria[$campaignId][] = ['type' => 'KEYWORD', 'negative' => true, 'text' => $text, 'match_type' => $matchType];
        } else {
            $candidates[$campaignId]['unsupported_targeting'] = true;
        }
    }

    $idsSql = implode(', ', array_keys($candidates));
    $keywordRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group.id, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE campaign.id IN ($idsSql) AND ad_group_criterion.status != 'REMOVED' LIMIT 2001",
        $accessToken, $managerId);
    if (count($keywordRows) > 2000) throw new HubGoogleAdsApiException('campaign_template_limit_exceeded', 422);
    $keywords = [];
    foreach ($keywordRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        if (!isset($candidates[$campaignId])) continue;
        $criterion = $row['adGroupCriterion'] ?? [];
        $groupId = (string)($row['adGroup']['id'] ?? '');
        if (!is_array($criterion) || $groupId !== (string)$candidates[$campaignId]['source_ad_group']['id']) continue;
        if (($criterion['type'] ?? null) !== 'KEYWORD'
            || ($criterion['status'] ?? null) !== 'ENABLED'
            || ($criterion['negative'] ?? false) !== false
            || !is_string($criterion['keyword']['text'] ?? null)
            || trim($criterion['keyword']['text']) === ''
            || !in_array($criterion['keyword']['matchType'] ?? null, ['EXACT', 'PHRASE', 'BROAD'], true)) {
            $candidates[$campaignId]['unsupported_keywords'] = true; continue;
        }
        $keywords[$campaignId][] = [
            'text' => (string)$criterion['keyword']['text'],
            'match_type' => (string)$criterion['keyword']['matchType'],
        ];
    }

    $templates = [];
    foreach ($candidates as $id => $candidate) {
        $criteria = $campaignCriteria[$id] ?? [];
        $positiveLocations = array_filter($criteria, static fn(array $item): bool => $item['type'] === 'LOCATION' && $item['negative'] === false);
        $templateKeywords = $keywords[$id] ?? [];
        if (!empty($candidate['unsupported_targeting']) || !empty($candidate['unsupported_keywords'])
            || !$positiveLocations || !$templateKeywords || count($templateKeywords) > 500 || count($criteria) > 500) continue;
        $candidate['campaign_criteria'] = $criteria;
        $candidate['keywords'] = $templateKeywords;
        unset($candidate['unsupported_targeting'], $candidate['unsupported_keywords']);
        $templates[] = $candidate;
    }
    usort($templates, static fn(array $a, array $b): int => strcasecmp($a['campaign_name'], $b['campaign_name']));
    return ['currency_code' => $currency, 'templates' => $templates];
}

function hub_google_ads_campaign_creation_validate_payload(array $payload, bool $confirmRequired): array
{
    $expected = ['bidding_settings', 'bidding_strategy', 'campaign_name', 'contains_eu_political_advertising', 'customer_id', 'daily_budget', 'descriptions', 'final_url', 'final_url_suffix', 'geo_target_country_codes', 'headlines', 'keyword_match_type', 'keywords', 'manager_customer_id', 'max_cpc_bid', 'network_settings', 'negative_keyword_match_type', 'negative_keywords', 'operation', 'promotion', 'tracking_url_template'];
    $hasConversionActionName = array_key_exists('conversion_action_name', $payload);
    $hasConversionActionResource = array_key_exists('conversion_action_resource_name', $payload);
    if ($hasConversionActionName) $expected[] = 'conversion_action_name';
    if ($hasConversionActionResource) $expected[] = 'conversion_action_resource_name';
    if (array_key_exists('geo_targeting_mode', $payload)) $expected[] = 'geo_targeting_mode';
    if (array_key_exists('keyword_individual_match', $payload)) $expected[] = 'keyword_individual_match';
    if (array_key_exists('preview_context', $payload) && !$confirmRequired) $expected[] = 'preview_context';
    if (array_key_exists('campaign_name_lookup_context', $payload) && !$confirmRequired) $expected[] = 'campaign_name_lookup_context';
    if ($confirmRequired) $expected[] = 'confirm';
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    if ($keys !== $expected || ($confirmRequired && ($payload['confirm'] ?? null) !== true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
    $conversionActionName = $payload['conversion_action_name'] ?? '';
    $conversionActionResourceName = $payload['conversion_action_resource_name'] ?? '';
    $name = $payload['campaign_name'];
    $url = $payload['final_url'];
    $campaignNameLookupToken = $payload['campaign_name_lookup_context'] ?? '';
    if ($managerId === null || $customerId === null
        || $hasConversionActionName !== $hasConversionActionResource
        || ($hasConversionActionName && (!is_string($conversionActionName) || trim($conversionActionName) !== $conversionActionName
            || $conversionActionName === '' || strlen($conversionActionName) > 255
            || !is_string($conversionActionResourceName)
            || preg_match('#^customers/' . preg_quote($managerId, '#') . '/conversionActions/[1-9][0-9]{0,19}$#D', $conversionActionResourceName) !== 1))
        || !is_string($name) || trim($name) !== $name || $name === '' || hub_google_ads_campaign_creation_text_length($name) > 128
        || preg_match('/[\x00-\x1F\x7F]/', $name) === 1
        || !is_string($campaignNameLookupToken) || strlen($campaignNameLookupToken) > 8192
        || !is_string($url) || strlen($url) > 2048 || filter_var($url, FILTER_VALIDATE_URL) === false
        || strtolower((string)parse_url($url, PHP_URL_SCHEME)) !== 'https'
        || !is_string(parse_url($url, PHP_URL_HOST))) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $dailyBudgetMicros = hub_google_ads_campaign_creation_decimal_micros($payload['daily_budget']);
    $biddingStrategy = $payload['bidding_strategy'] ?? null;
    $allowedBiddingStrategies = ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS', 'TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE', 'MAXIMIZE_CLICKS', 'TARGET_IMPRESSION_SHARE', 'MANUAL_CPC'];
    $bidding = $payload['bidding_settings'] ?? null;
    $expectedBiddingKeys = ['impression_share_location', 'impression_share_percent', 'target_cpa', 'target_cpa_currency', 'target_roas_percent'];
    if (!is_array($bidding)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $biddingKeys = array_keys($bidding); sort($biddingKeys, SORT_STRING); sort($expectedBiddingKeys, SORT_STRING);
    if ($biddingKeys !== $expectedBiddingKeys
        || !in_array($biddingStrategy, $allowedBiddingStrategies, true)
        || !is_string($payload['max_cpc_bid'] ?? null)
        || !is_string($bidding['target_cpa'] ?? null)
        || !is_string($bidding['target_cpa_currency'] ?? null)
        || !is_string($bidding['target_roas_percent'] ?? null)
        || !is_string($bidding['impression_share_location'] ?? null)
        || !is_string($bidding['impression_share_percent'] ?? null)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $maxCpcValue = $payload['max_cpc_bid'];
    $maxCpcBidMicros = $maxCpcValue === '' ? null : hub_google_ads_campaign_creation_decimal_micros($maxCpcValue);
    $targetCpaValue = $bidding['target_cpa'];
    $targetCpaCurrency = strtoupper($bidding['target_cpa_currency']);
    $targetCpaMicros = $targetCpaValue === '' ? null : hub_google_ads_campaign_creation_decimal_micros($targetCpaValue);
    $targetRoasPercentValue = $bidding['target_roas_percent'];
    $targetRoas = $targetRoasPercentValue === '' ? null : (float)$targetRoasPercentValue / 100;
    $impressionLocation = $bidding['impression_share_location'];
    $impressionPercentValue = $bidding['impression_share_percent'];
    $usesCpa = in_array($biddingStrategy, ['TARGET_CPA', 'MAXIMIZE_CONVERSIONS'], true);
    $needsCpa = $biddingStrategy === 'TARGET_CPA';
    $usesRoas = in_array($biddingStrategy, ['TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE'], true);
    $needsRoas = $biddingStrategy === 'TARGET_ROAS';
    $usesMaxCpc = in_array($biddingStrategy, ['MANUAL_CPC', 'MAXIMIZE_CLICKS', 'TARGET_IMPRESSION_SHARE'], true);
    $needsMaxCpc = in_array($biddingStrategy, ['MANUAL_CPC', 'TARGET_IMPRESSION_SHARE'], true);
    $usesImpressionShare = $biddingStrategy === 'TARGET_IMPRESSION_SHARE';
    $validMaxCpc = $maxCpcValue === ''
        ? !$needsMaxCpc
        : ($usesMaxCpc && $maxCpcBidMicros !== null && $maxCpcBidMicros !== '0');
    $validTargetCpa = $targetCpaValue === ''
        ? !$needsCpa
        : ($usesCpa && $targetCpaMicros !== null && $targetCpaMicros !== '0');
    $validTargetRoas = $targetRoasPercentValue === ''
        ? !$needsRoas
        : ($usesRoas && preg_match('/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/D', $targetRoasPercentValue) === 1 && $targetRoas > 0);
    $validImpressionShare = $usesImpressionShare
        ? (in_array($impressionLocation, ['ANYWHERE_ON_PAGE', 'TOP_OF_PAGE', 'ABSOLUTE_TOP_OF_PAGE'], true)
            && preg_match('/^(?:[1-9]|[1-9]\d|100)$/D', $impressionPercentValue) === 1)
        : ($impressionLocation === '' && $impressionPercentValue === '');
    if ($dailyBudgetMicros === null || $dailyBudgetMicros === '0'
        || !$validMaxCpc || !$validTargetCpa || !$validTargetRoas || !$validImpressionShare
        || (!$usesCpa && ($targetCpaValue !== '' || $targetCpaCurrency !== ''))
        || ($usesCpa && $targetCpaCurrency !== '' && preg_match('/^[A-Z]{3}$/D', $targetCpaCurrency) !== 1)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $previewContextToken = $payload['preview_context'] ?? '';
    if (!is_string($previewContextToken) || strlen($previewContextToken) > 8192
        || ($confirmRequired && array_key_exists('preview_context', $payload))) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $countryCodes = $payload['geo_target_country_codes'];
    $geoTargetingMode = $payload['geo_targeting_mode'] ?? 'COUNTRIES';
    if (!in_array($geoTargetingMode, ['COUNTRIES', 'WORLD'], true)
        || !is_array($countryCodes) || !array_is_list($countryCodes)
        || ($geoTargetingMode === 'WORLD' ? count($countryCodes) !== 0 : (count($countryCodes) < 1 || count($countryCodes) > 20))) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $countrySeen = [];
    foreach ($countryCodes as $code) {
        if (!is_string($code) || preg_match('/^[A-Z]{2}$/D', $code) !== 1 || isset($countrySeen[$code])) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $countrySeen[$code] = true;
    }
    $networkSettings = $payload['network_settings'] ?? null;
    if (!is_array($networkSettings)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $networkKeys = array_keys($networkSettings); sort($networkKeys, SORT_STRING);
    if ($networkKeys !== ['target_content_network', 'target_search_network']
        || !is_bool($networkSettings['target_search_network'] ?? null)
        || !is_bool($networkSettings['target_content_network'] ?? null)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $politicalDeclaration = $payload['contains_eu_political_advertising'] ?? null;
    if (!in_array($politicalDeclaration, ['DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING', 'CONTAINS_EU_POLITICAL_ADVERTISING'], true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $trackingTemplate = $payload['tracking_url_template'] ?? null;
    $urlSuffix = $payload['final_url_suffix'] ?? null;
    if (!is_string($trackingTemplate) || strlen($trackingTemplate) > 2048 || preg_match('/[\x00-\x1F\x7F]/', $trackingTemplate) === 1
        || ($trackingTemplate !== '' && (strtolower((string)parse_url($trackingTemplate, PHP_URL_SCHEME)) !== 'https'
            || !is_string(parse_url($trackingTemplate, PHP_URL_HOST))))
        || !is_string($urlSuffix) || strlen($urlSuffix) > 1024 || preg_match('/[\x00-\x1F\x7F]/', $urlSuffix) === 1
        || str_starts_with($urlSuffix, '?')) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $keywordMatchType = $payload['keyword_match_type'] ?? null;
    $negativeKeywordMatchType = $payload['negative_keyword_match_type'] ?? null;
    $individualKeywordMatch = $payload['keyword_individual_match'] ?? false;
    if (!in_array($keywordMatchType, ['EXACT', 'PHRASE', 'BROAD'], true)
        || !in_array($negativeKeywordMatchType, ['EXACT', 'PHRASE', 'BROAD'], true)
        || !is_bool($individualKeywordMatch)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $normalizeKeywords = static function (mixed $items, bool $required, string $defaultType, bool $individual): array {
        if (!is_array($items) || !array_is_list($items) || count($items) > 100 || ($required && count($items) < 1)) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $seen = []; $normalized = [];
        foreach ($items as $item) {
            if (!is_string($item) || trim($item) !== $item || $item === ''
                || preg_match('/[\x00-\x1F\x7F]/', $item) === 1) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $text = $item; $matchType = $defaultType;
            if ($individual) {
                if (preg_match('/^\[([^\[\]"]+)\]$/uD', $item, $match) === 1) { $text = trim($match[1]); $matchType = 'EXACT'; }
                elseif (preg_match('/^"([^\[\]"]+)"$/uD', $item, $match) === 1) { $text = trim($match[1]); $matchType = 'PHRASE'; }
                elseif (preg_match('/[\[\]"]/u', $item) === 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
                else $matchType = 'BROAD';
            }
            if ($text === '' || hub_google_ads_campaign_creation_text_length($text) > 80) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $key = hub_google_ads_campaign_creation_lower($text) . "\0" . $matchType;
            if (isset($seen[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $seen[$key] = true;
            $normalized[] = ['text' => $text, 'match_type' => $matchType];
        }
        return $normalized;
    };
    $keywords = $normalizeKeywords($payload['keywords'] ?? null, true, $keywordMatchType, $individualKeywordMatch);
    $negativeKeywords = $normalizeKeywords($payload['negative_keywords'] ?? null, false, $negativeKeywordMatchType, $individualKeywordMatch);
    foreach ([['headlines', 10, 30], ['descriptions', 3, 90]] as [$field, $count, $maxLength]) {
        $items = $payload[$field] ?? null;
        if (!is_array($items) || !array_is_list($items) || count($items) !== $count) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $seen = [];
        foreach ($items as $item) {
            if (!is_string($item) || trim($item) !== $item || $item === '' || preg_match('/[\x00-\x1F\x7F]/', $item) === 1
                || hub_google_ads_campaign_creation_text_length($item) > $maxLength) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $normalized = hub_google_ads_campaign_creation_lower($item);
            if (isset($seen[$normalized])) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $seen[$normalized] = true;
        }
    }
    $promotion = $payload['promotion'] ?? null;
    if (!is_array($promotion)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $promoKeys = array_keys($promotion); sort($promoKeys, SORT_STRING);
    $expectedPromo = ['discount_type', 'discount_value', 'end_date', 'language_code', 'occasion', 'start_date', 'target', 'trigger_type', 'trigger_value']; sort($expectedPromo, SORT_STRING);
    $promotionOccasions = [
        'BACK_TO_SCHOOL', 'BLACK_FRIDAY', 'BOXING_DAY', 'CARNIVAL', 'CHINESE_NEW_YEAR', 'CHRISTMAS',
        'CYBER_MONDAY', 'DIWALI', 'EASTER', 'EID_AL_ADHA', 'EID_AL_FITR', 'END_OF_SEASON', 'EPIPHANY',
        'FALL_SALE', 'FATHERS_DAY', 'HALLOWEEN', 'HANUKKAH', 'HOLI', 'INDEPENDENCE_DAY', 'LABOR_DAY',
        'MOTHERS_DAY', 'NATIONAL_DAY', 'NAVRATRI', 'NEW_YEARS', 'PARENTS_DAY', 'PASSOVER', 'RAMADAN',
        'ROSH_HASHANAH', 'SINGLES_DAY', 'SONGKRAN', 'SPRING_SALE', 'ST_NICHOLAS_DAY', 'SUMMER_SALE',
        'VALENTINES_DAY', 'WINTER_SALE', 'WOMENS_DAY', 'YEAR_END_GIFT',
    ];
    $occasion = $promotion['occasion'] ?? null;
    if ($promoKeys !== $expectedPromo
        || !is_string($promotion['target'] ?? null) || trim($promotion['target']) !== ($promotion['target'] ?? null)
        || $promotion['target'] === '' || hub_google_ads_campaign_creation_text_length($promotion['target']) > 20
        || ($occasion !== null && !in_array($occasion, $promotionOccasions, true))
        || !in_array($promotion['discount_type'] ?? null, ['percent_off', 'amount_off'], true)
        || !is_string($promotion['discount_value'] ?? null)
        || !in_array($promotion['trigger_type'] ?? null, ['none', 'promotion_code', 'orders_over_amount'], true)
        || !is_string($promotion['trigger_value'] ?? null)
        || ($promotion['trigger_type'] === 'none' && $promotion['trigger_value'] !== '')
        || !is_string($promotion['language_code'] ?? null)
        || preg_match('/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/D', $promotion['language_code']) !== 1) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $startDate = $promotion['start_date']; $endDate = $promotion['end_date'];
    if (($startDate === null) !== ($endDate === null)
        || ($startDate !== null && (!is_string($startDate) || preg_match('/^\d{4}-\d{2}-\d{2}$/D', $startDate) !== 1
            || !is_string($endDate) || preg_match('/^\d{4}-\d{2}-\d{2}$/D', $endDate) !== 1
            || !checkdate((int)substr($startDate, 5, 2), (int)substr($startDate, 8, 2), (int)substr($startDate, 0, 4))
            || !checkdate((int)substr($endDate, 5, 2), (int)substr($endDate, 8, 2), (int)substr($endDate, 0, 4))
            || $endDate < $startDate))) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if ($promotion['discount_type'] === 'percent_off') {
        if (preg_match('/^(?:[1-9]|[1-9][0-9]|100)$/D', $promotion['discount_value']) !== 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
    } elseif (hub_google_ads_campaign_creation_decimal_micros($promotion['discount_value']) === null
        || hub_google_ads_campaign_creation_decimal_micros($promotion['discount_value']) === '0') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if ($promotion['trigger_type'] === 'promotion_code') {
        if (preg_match('/^[A-Za-z0-9-]{1,20}$/D', $promotion['trigger_value']) !== 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
    } elseif ($promotion['trigger_type'] === 'orders_over_amount' && (hub_google_ads_campaign_creation_decimal_micros($promotion['trigger_value']) === null
        || hub_google_ads_campaign_creation_decimal_micros($promotion['trigger_value']) === '0')) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [
        $managerId, $customerId, $name, $url, $payload['headlines'], $payload['descriptions'], $promotion,
        [
            'daily_budget_micros' => $dailyBudgetMicros,
            'max_cpc_bid_micros' => $maxCpcBidMicros,
            'bidding_strategy' => $biddingStrategy,
            'target_cpa_micros' => $targetCpaMicros,
            'target_cpa_currency' => $targetCpaCurrency,
            'target_roas' => $targetRoas,
            'impression_share_location' => $usesImpressionShare ? $impressionLocation : null,
            'impression_share_percent' => $usesImpressionShare ? (int)$impressionPercentValue : null,
            'country_codes' => $countryCodes,
            'geo_targeting_mode' => $geoTargetingMode,
            'conversion_action_name' => $hasConversionActionName ? $conversionActionName : '',
            'conversion_action_resource_name' => $hasConversionActionName ? $conversionActionResourceName : '',
            'positive_geo_target_type' => 'PRESENCE',
            'keywords' => $keywords,
            'keyword_match_type' => $keywordMatchType,
            'negative_keywords' => $negativeKeywords,
            'negative_keyword_match_type' => $negativeKeywordMatchType,
            'network_settings' => [
                'target_google_search' => true,
                'target_search_network' => $networkSettings['target_search_network'],
                'target_partner_search_network' => false,
                'target_content_network' => $networkSettings['target_content_network'],
            ],
            'contains_eu_political_advertising' => $politicalDeclaration,
            'tracking_settings' => [
                'tracking_url_template' => $trackingTemplate,
                'final_url_suffix' => $urlSuffix,
            ],
        ],
        $previewContextToken,
        $campaignNameLookupToken,
    ];
}

/** Validate a single, explicit request to add audience IDs to a paused Hub-created Search campaign. */
function hub_google_ads_campaign_audience_targeting_validate_payload(array $payload): array
{
    $expected = ['ad_group_id', 'audience_ids', 'campaign_id', 'confirm', 'customer_id', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    $adGroupId = $payload['ad_group_id'] ?? null;
    $audienceIds = $payload['audience_ids'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_audience_targeting'
        || ($payload['confirm'] ?? null) !== true
        || $managerId === null || $customerId === null
        || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !is_string($adGroupId) || preg_match('/^[1-9][0-9]{0,19}$/D', $adGroupId) !== 1
        || !is_array($audienceIds) || !array_is_list($audienceIds)
        || count($audienceIds) < 1 || count($audienceIds) > 1000) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $seen = [];
    foreach ($audienceIds as $audienceId) {
        if (!is_string($audienceId) || preg_match('/^[1-9][0-9]{0,19}$/D', $audienceId) !== 1 || isset($seen[$audienceId])) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $seen[$audienceId] = true;
    }
    return [$managerId, $customerId, $campaignId, $adGroupId, $audienceIds];
}

/** Load the fixed user-interest/user-list IDs without exposing them to the Hub client. */
function hub_google_ads_campaign_configured_audience_ids(): array
{
    $path = __DIR__ . '/google-ads-audience-targeting-ids.json';
    if (!is_file($path) || !is_readable($path)) {
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    $json = file_get_contents($path);
    if (!is_string($json) || $json === '') {
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    try {
        $ids = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    if (!is_array($ids) || !array_is_list($ids) || count($ids) !== 918) {
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    $seen = [];
    foreach ($ids as $id) {
        if (!is_string($id) || preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1 || isset($seen[$id])) {
            throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
        }
        $seen[$id] = true;
    }
    return $ids;
}

/** Accept no audience IDs from the browser; the fixed private list is authoritative. */
function hub_google_ads_campaign_configured_audience_targeting_validate_payload(array $payload): array
{
    $expected = ['ad_group_id', 'campaign_id', 'confirm', 'customer_id', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_configured_audience_targeting'
        || ($payload['confirm'] ?? null) !== true) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $payload['operation'] = 'apply_audience_targeting';
    $payload['audience_ids'] = hub_google_ads_campaign_configured_audience_ids();
    return hub_google_ads_campaign_audience_targeting_validate_payload($payload);
}

/** Add the imported IDs as positive user-interest/user-list criteria in Targeting mode. */
function hub_google_ads_campaign_audience_targeting_apply(
    array $config,
    string $managerId,
    string $customerId,
    string $campaignId,
    string $adGroupId,
    array $audienceIds
): array {
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
    $targetQuery = 'SELECT campaign.id, campaign.status, campaign.advertising_channel_type, ad_group.id, ad_group.status, ad_group.targeting_setting.target_restrictions'
        . ' FROM ad_group WHERE ad_group.id = ' . $adGroupId . ' LIMIT 2';
    $targetRows = hub_google_ads_search($customerId, $targetQuery, $accessToken, $managerId);
    if (count($targetRows) !== 1 || !is_array($targetRows[0]['campaign'] ?? null) || !is_array($targetRows[0]['adGroup'] ?? null)) {
        throw new HubGoogleAdsApiException('audience_targeting_target_unavailable', 404);
    }
    $campaign = $targetRows[0]['campaign'];
    $adGroup = $targetRows[0]['adGroup'];
    if ((string)($campaign['id'] ?? '') !== $campaignId || (string)($adGroup['id'] ?? '') !== $adGroupId) {
        throw new HubGoogleAdsApiException('audience_targeting_target_mismatch', 409);
    }
    if (($campaign['status'] ?? null) !== 'PAUSED'
        || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH'
        || ($adGroup['status'] ?? null) !== 'ENABLED') {
        throw new HubGoogleAdsApiException('audience_targeting_campaign_must_be_paused', 409);
    }

    $idsSql = implode(', ', $audienceIds);
    $catalog = [];
    $interestRows = hub_google_ads_search($customerId,
        'SELECT user_interest.user_interest_id, user_interest.resource_name FROM user_interest WHERE user_interest.user_interest_id IN (' . $idsSql . ') LIMIT 1001',
        $accessToken, $managerId);
    foreach ($interestRows as $row) {
        $interest = $row['userInterest'] ?? null;
        if (!is_array($interest)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $id = (string)($interest['userInterestId'] ?? '');
        $resourceName = $interest['resourceName'] ?? null;
        if (!is_string($resourceName) || preg_match('#^customers/' . preg_quote($customerId, '#') . '/userInterests/([1-9][0-9]{0,19})$#D', $resourceName, $matches) !== 1
            || $id !== $matches[1] || !in_array($id, $audienceIds, true)) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $catalog[$id][] = ['kind' => 'user_interest', 'resource_name' => $resourceName];
    }
    $listRows = hub_google_ads_search($customerId,
        'SELECT user_list.id, user_list.resource_name FROM user_list WHERE user_list.id IN (' . $idsSql . ') LIMIT 1001',
        $accessToken, $managerId);
    foreach ($listRows as $row) {
        $list = $row['userList'] ?? null;
        if (!is_array($list)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $id = (string)($list['id'] ?? '');
        $resourceName = $list['resourceName'] ?? null;
        if (!is_string($resourceName) || preg_match('#^customers/' . preg_quote($customerId, '#') . '/userLists/([1-9][0-9]{0,19})$#D', $resourceName, $matches) !== 1
            || $id !== $matches[1] || !in_array($id, $audienceIds, true)) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $catalog[$id][] = ['kind' => 'user_list', 'resource_name' => $resourceName];
    }

    $adGroupResource = 'customers/' . $customerId . '/adGroups/' . $adGroupId;
    $candidateResources = ['USER_INTEREST' => [], 'USER_LIST' => []];
    foreach ($catalog as $matches) {
        foreach ($matches as $match) {
            $type = $match['kind'] === 'user_interest' ? 'USER_INTEREST' : 'USER_LIST';
            $candidateResources[$type][$match['resource_name']] = $match['resource_name'];
        }
    }
    $candidateFilters = [];
    if ($candidateResources['USER_INTEREST']) {
        $values = array_map('hub_google_ads_campaign_creation_gaql_string', array_values($candidateResources['USER_INTEREST']));
        $candidateFilters[] = "(ad_group_criterion.type = 'USER_INTEREST' AND ad_group_criterion.user_interest.user_interest_category IN (" . implode(', ', $values) . '))';
    }
    if ($candidateResources['USER_LIST']) {
        $values = array_map('hub_google_ads_campaign_creation_gaql_string', array_values($candidateResources['USER_LIST']));
        $candidateFilters[] = "(ad_group_criterion.type = 'USER_LIST' AND ad_group_criterion.user_list.user_list IN (" . implode(', ', $values) . '))';
    }
    $existingRows = $candidateFilters
        ? hub_google_ads_search($customerId,
            "SELECT ad_group_criterion.type, ad_group_criterion.user_interest.user_interest_category, ad_group_criterion.user_list.user_list FROM ad_group_criterion WHERE ad_group.id = " . $adGroupId . " AND ad_group_criterion.status != 'REMOVED' AND (" . implode(' OR ', $candidateFilters) . ') LIMIT 2001',
            $accessToken, $managerId)
        : [];
    if (count($existingRows) > 2000) throw new HubGoogleAdsApiException('audience_targeting_unverified', 502);
    $existing = [];
    foreach ($existingRows as $row) {
        $criterion = $row['adGroupCriterion'] ?? null;
        if (!is_array($criterion)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $kind = $criterion['type'] ?? null;
        $resourceName = $kind === 'USER_INTEREST'
            ? ($criterion['userInterest']['userInterestCategory'] ?? null)
            : ($kind === 'USER_LIST' ? ($criterion['userList']['userList'] ?? null) : null);
        if (!is_string($resourceName)) continue;
        if (preg_match('#^customers/' . preg_quote($customerId, '#') . '/userInterests/([1-9][0-9]{0,19})$#D', $resourceName, $matches) === 1) {
            $existing['user_interest:' . $matches[1]] = true;
        } elseif (preg_match('#^customers/' . preg_quote($customerId, '#') . '/userLists/([1-9][0-9]{0,19})$#D', $resourceName, $matches) === 1) {
            $existing['user_list:' . $matches[1]] = true;
        }
    }

    $operations = [];
    $eligible = [];
    $unrecognizedCount = 0;
    $ambiguousCount = 0;
    $alreadyPresentCount = 0;
    foreach ($audienceIds as $id) {
        $matches = $catalog[$id] ?? [];
        if (!$matches) { $unrecognizedCount++; continue; }
        if (count($matches) !== 1) { $ambiguousCount++; continue; }
        $match = $matches[0];
        $key = $match['kind'] . ':' . $id;
        if (isset($existing[$key])) { $alreadyPresentCount++; continue; }
        $eligible[$key] = $match;
        if ($match['kind'] === 'user_interest') {
            $operations[] = ['adGroupCriterionOperation' => ['create' => [
                'adGroup' => $adGroupResource,
                'status' => 'ENABLED',
                'userInterest' => ['userInterestCategory' => $match['resource_name']],
            ]]];
        } else {
            $operations[] = ['adGroupCriterionOperation' => ['create' => [
                'adGroup' => $adGroupResource,
                'status' => 'ENABLED',
                'userList' => ['userList' => $match['resource_name']],
            ]]];
        }
    }

    $restrictions = $adGroup['targetingSetting']['targetRestrictions'] ?? [];
    if (!is_array($restrictions)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    $audienceRestriction = null;
    foreach ($restrictions as $restriction) {
        if (!is_array($restriction)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        if (($restriction['targetingDimension'] ?? null) === 'AUDIENCE') $audienceRestriction = $restriction;
    }
    $targetingSettingNeedsUpdate = ($audienceRestriction['bidOnly'] ?? false) === true;
    if ($targetingSettingNeedsUpdate) {
        $nextRestrictions = array_values(array_filter($restrictions, static fn(array $item): bool => ($item['targetingDimension'] ?? null) !== 'AUDIENCE'));
        $nextRestrictions[] = ['targetingDimension' => 'AUDIENCE', 'bidOnly' => false];
        array_unshift($operations, ['adGroupOperation' => [
            'update' => ['resourceName' => $adGroupResource, 'targetingSetting' => ['targetRestrictions' => $nextRestrictions]],
            'updateMask' => 'targetingSetting.targetRestrictions',
        ]]);
    }

    $acceptedCount = 0;
    if ($operations) {
        $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $accessToken,
            json_encode(['mutateOperations' => $operations, 'partialFailure' => true], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        $results = $response['mutateOperationResponses'] ?? null;
        if (!is_array($results) || count($results) !== count($operations)) throw new HubGoogleAdsApiException('audience_targeting_unverified', 502);
        foreach ($results as $result) {
            if (isset($result['adGroupCriterionResult']['resourceName'])) $acceptedCount++;
        }
    }

    $verifiedCount = 0;
    $targetingSettingVerified = false;
    $verificationAvailable = true;
    try {
        $verificationRows = $candidateFilters
            ? hub_google_ads_search($customerId,
                "SELECT ad_group.targeting_setting.target_restrictions, ad_group_criterion.type, ad_group_criterion.user_interest.user_interest_category, ad_group_criterion.user_list.user_list FROM ad_group_criterion WHERE ad_group.id = " . $adGroupId . " AND ad_group_criterion.status != 'REMOVED' AND (" . implode(' OR ', $candidateFilters) . ') LIMIT 2001',
                $accessToken, $managerId)
            : [];
        if (count($verificationRows) > 2000) throw new HubGoogleAdsApiException('audience_targeting_unverified', 502);
        $verified = [];
        foreach ($verificationRows as $row) {
            $criterion = $row['adGroupCriterion'] ?? null;
            $group = $row['adGroup'] ?? null;
            if (!is_array($criterion) || !is_array($group)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            foreach (($group['targetingSetting']['targetRestrictions'] ?? []) as $restriction) {
                if (($restriction['targetingDimension'] ?? null) === 'AUDIENCE' && ($restriction['bidOnly'] ?? false) === false) {
                    $targetingSettingVerified = true;
                }
            }
            $kind = $criterion['type'] ?? null;
            $resourceName = $kind === 'USER_INTEREST'
                ? ($criterion['userInterest']['userInterestCategory'] ?? null)
                : ($kind === 'USER_LIST' ? ($criterion['userList']['userList'] ?? null) : null);
            if (is_string($resourceName)) $verified[$resourceName] = true;
        }
        if (!$verificationRows && $targetingSettingNeedsUpdate) {
            $settingRows = hub_google_ads_search($customerId, $targetQuery, $accessToken, $managerId);
            if (count($settingRows) !== 1 || !is_array($settingRows[0]['adGroup'] ?? null)) {
                throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            }
            $postRestrictions = $settingRows[0]['adGroup']['targetingSetting']['targetRestrictions'] ?? [];
            if (!is_array($postRestrictions)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $targetingSettingVerified = true;
            foreach ($postRestrictions as $restriction) {
                if (!is_array($restriction)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                if (($restriction['targetingDimension'] ?? null) === 'AUDIENCE' && ($restriction['bidOnly'] ?? false) === true) {
                    $targetingSettingVerified = false;
                }
            }
        }
        if (!$targetingSettingVerified && $audienceRestriction === null && !$targetingSettingNeedsUpdate) {
            // Google Ads API defaults an omitted AUDIENCE restriction to Targeting (bid_only=false).
            $targetingSettingVerified = true;
        }
        foreach ($eligible as $match) if (isset($verified[$match['resource_name']])) $verifiedCount++;
        $targetingSettingVerified = $targetingSettingVerified || (!$eligible && !$targetingSettingNeedsUpdate);
    } catch (Throwable $error) {
        $verificationAvailable = false;
    }
    $failedCount = max(0, count($eligible) - $acceptedCount);
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_audience_targeting',
        'campaign_id' => $campaignId,
        'ad_group_id' => $adGroupId,
        'targeting_mode' => 'TARGETING',
        'submitted_count' => count($audienceIds),
        'eligible_count' => count($eligible),
        'applied_count' => $acceptedCount,
        'verified_count' => $verifiedCount,
        'already_present_count' => $alreadyPresentCount,
        'unrecognized_count' => $unrecognizedCount,
        'ambiguous_count' => $ambiguousCount,
        'failed_count' => $failedCount,
        'targeting_setting_verified' => $targetingSettingVerified,
        'verification_available' => $verificationAvailable,
        'verified' => $verificationAvailable && $verifiedCount === count($eligible) && $targetingSettingVerified,
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

/** The fixed exclusion list with official Google Ads audience criterion IDs. */
function hub_google_ads_campaign_audience_exclusion_catalog(): array
{
    return [
        ['name' => 'Usuários avançados de serviços em nuvem', 'id' => '92931'],
        ['name' => 'Empregos em marketing e vendas', 'id' => '80422'],
        ['name' => 'Armazenamento em nuvem e dados hospedados', 'id' => '80538'],
        ['name' => 'Serviços de SEO e SEM', 'id' => '80529'],
        ['name' => 'Serviços de e-mail marketing', 'id' => '80528'],
        ['name' => 'Serviços de publicidade e marketing', 'id' => '80517'],
        ['name' => 'Soluções de CRM', 'id' => '80535'],
        ['name' => 'Registro de domínio', 'id' => '80542'],
        ['name' => 'Hospedagem na web', 'id' => '80544'],
        ['name' => 'Desenvolvimento de websites e webdesign', 'id' => '80543'],
        ['name' => 'Softwares empresariais', 'id' => '80279'],
        ['name' => 'Tecnologia de negócios', 'id' => '80520'],
        ['name' => 'Serviços da web', 'id' => '80532'],
    ];
}

function hub_google_ads_campaign_audience_exclusion_upload_validate_payload(array $payload): array
{
    $expected = ['campaign_ids', 'customer_id', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignIds = $payload['campaign_ids'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'audience_exclusion_upload_catalog'
        || $managerId === null || $customerId === null || !is_array($campaignIds)
        || count($campaignIds) < 1 || count($campaignIds) > 100) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $normalized = [];
    foreach ($campaignIds as $campaignId) {
        if (!is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $normalized[] = $campaignId;
    }
    if (count(array_unique($normalized)) !== count($normalized)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $customerId, $normalized];
}

function hub_google_ads_campaign_audience_exclusion_upload_catalog(): array
{
    $catalog = hub_google_ads_campaign_audience_exclusion_catalog();
    $audiences = [];
    foreach ($catalog as $item) {
        $id = is_string($item['id'] ?? null) ? $item['id'] : '';
        $name = '';
        if ($id === '') {
            $aliases = is_array($item['aliases'] ?? null) ? $item['aliases'] : [];
            $name = is_string($aliases[0] ?? null) && trim($aliases[0]) !== ''
                ? trim($aliases[0])
                : trim((string)($item['name'] ?? ''));
        }
        if (($id === '' && $name === '') || ($id !== '' && preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1)) {
            throw new HubGoogleAdsApiException('audience_exclusion_unverified', 500);
        }
        $audiences[] = ['id' => $id, 'name' => $name];
    }
    if (count($audiences) !== 13) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 500);
    return $audiences;
}

/** Validate the saved ad-group targets for a local bulk-upload CSV. */
function hub_google_ads_campaign_audience_targeting_upload_validate_payload(
    array $payload,
    string $expectedOperation = 'audience_targeting_upload_csv'
): array
{
    $expected = ['groups', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $groups = $payload['groups'] ?? null;
    if (!in_array($expectedOperation, ['audience_targeting_upload_csv', 'audience_targeting_upload_csv_stream'], true)
        || $keys !== $expected || ($payload['operation'] ?? null) !== $expectedOperation
        || $managerId === null || !is_array($groups) || !array_is_list($groups)
        || count($groups) < 1 || count($groups) > 1000 || count($groups) * 918 > 1000000) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }

    $normalized = [];
    $seen = [];
    foreach ($groups as $group) {
        if (!is_array($group)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $groupKeys = array_keys($group); sort($groupKeys, SORT_STRING);
        if ($groupKeys !== ['ad_group_id', 'campaign_id', 'customer_id']) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $customerId = hub_google_ads_valid_customer_id($group['customer_id']);
        $campaignId = $group['campaign_id'];
        $adGroupId = $group['ad_group_id'];
        if ($customerId === null || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
            || !is_string($adGroupId) || preg_match('/^[1-9][0-9]{0,19}$/D', $adGroupId) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $key = $customerId . ':' . $adGroupId;
        if (isset($seen[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $seen[$key] = true;
        $normalized[] = ['customer_id' => $customerId, 'campaign_id' => $campaignId, 'ad_group_id' => $adGroupId];
    }

    return [$managerId, $normalized];
}

/** Build the user's Apply Audience(s) CSV from the private, fixed 918-ID list. */
function hub_google_ads_campaign_audience_targeting_upload_csv(array $groups): string
{
    $audienceIds = hub_google_ads_campaign_configured_audience_ids();
    $stream = fopen('php://temp', 'w+');
    if ($stream === false) throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    $headers = ['Action', 'Customer ID', 'Campaign', 'Campaign ID', 'Ad group', 'Ad group ID', 'Audience status', 'Audience', 'Audience ID', 'Type', 'Level', 'Bid adj.'];
    if (fputcsv($stream, $headers, ',', '"', '\\', "\r\n") === false) {
        fclose($stream);
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    foreach ($groups as $group) {
        foreach ($audienceIds as $audienceId) {
            $row = ['Add', $group['customer_id'], '', $group['campaign_id'], '', $group['ad_group_id'], '', '', $audienceId, '', 'Ad Group', ''];
            if (fputcsv($stream, $row, ',', '"', '\\', "\r\n") === false) {
                fclose($stream);
                throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
            }
        }
    }
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    if (!is_string($csv) || $csv === '') throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    return $csv;
}

/** Stream the same private audience CSV in group-sized chunks with real progress events. */
function hub_google_ads_campaign_audience_targeting_upload_csv_stream(string $managerId, array $groups): never
{
    $audienceIds = hub_google_ads_campaign_configured_audience_ids();
    if (count($audienceIds) !== 918) throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    $headers = ['Action', 'Customer ID', 'Campaign', 'Campaign ID', 'Ad group', 'Ad group ID', 'Audience status', 'Audience', 'Audience ID', 'Type', 'Level', 'Bid adj.'];
    $headerStream = fopen('php://temp', 'w+');
    if ($headerStream === false || fputcsv($headerStream, $headers, ',', '"', '\\', "\r\n") === false) {
        if (is_resource($headerStream)) fclose($headerStream);
        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
    }
    rewind($headerStream);
    $headerCsv = stream_get_contents($headerStream);
    fclose($headerStream);
    if (!is_string($headerCsv) || $headerCsv === '') throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);

    while (ob_get_level() > 0) {
        if (!@ob_end_clean()) break;
    }
    @ini_set('output_buffering', '0');
    @ini_set('zlib.output_compression', '0');
    header('Content-Type: application/x-ndjson; charset=utf-8');
    header('X-Accel-Buffering: no');
    header('Content-Encoding: identity');

    $operation = 'audience_targeting_upload_csv_stream';
    $groupCount = count($groups);
    $totalRows = $groupCount * count($audienceIds);
    $sendEvent = static function (array $event): void {
        $json = json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($json)) throw new RuntimeException('Could not encode audience CSV progress event.');
        echo $json . "\n";
        flush();
    };
    $baseEvent = [
        'ok' => true,
        'schema_version' => 1,
        'operation' => $operation,
        'manager_customer_id' => $managerId,
        'audience_count' => count($audienceIds),
        'group_count' => $groupCount,
        'total_row_count' => $totalRows,
    ];

    try {
        $sendEvent($baseEvent + [
            'type' => 'progress',
            'completed_groups' => 0,
            'completed_rows' => 0,
            'csv_chunk' => $headerCsv,
        ]);
        foreach ($groups as $groupIndex => $group) {
            $stream = fopen('php://temp', 'w+');
            if ($stream === false) throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
            try {
                foreach ($audienceIds as $audienceId) {
                    $row = ['Add', $group['customer_id'], '', $group['campaign_id'], '', $group['ad_group_id'], '', '', $audienceId, '', 'Ad Group', ''];
                    if (fputcsv($stream, $row, ',', '"', '\\', "\r\n") === false) {
                        throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
                    }
                }
                rewind($stream);
                $csvChunk = stream_get_contents($stream);
            } finally {
                fclose($stream);
            }
            if (!is_string($csvChunk) || $csvChunk === '') throw new HubGoogleAdsApiException('audience_targeting_list_unavailable', 503);
            $completedGroups = $groupIndex + 1;
            $sendEvent($baseEvent + [
                'type' => 'progress',
                'completed_groups' => $completedGroups,
                'completed_rows' => $completedGroups * count($audienceIds),
                'csv_chunk' => $csvChunk,
            ]);
        }
        $sendEvent($baseEvent + [
            'type' => 'complete',
            'completed_groups' => $groupCount,
            'completed_rows' => $totalRows,
        ]);
    } catch (HubGoogleAdsApiException $error) {
        $sendEvent(['ok' => false, 'type' => 'error', 'error' => $error->apiCode]);
    } catch (Throwable $error) {
        error_log('Google Ads audience-targeting CSV stream failed.');
        $sendEvent(['ok' => false, 'type' => 'error', 'error' => 'server_error']);
    }
    exit;
}

function hub_google_ads_campaign_audience_exclusions_validate_payload(array $payload): array
{
    $expected = ['campaign_id', 'confirm', 'customer_id', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_audience_exclusions'
        || ($payload['confirm'] ?? null) !== true || $managerId === null || $customerId === null
        || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $customerId, $campaignId];
}

function hub_google_ads_campaign_audience_exclusion_search_compatible(array $interest): bool
{
    if (($interest['launchedToAll'] ?? false) === true) return true;
    $availabilities = $interest['availabilities'] ?? null;
    if (!is_array($availabilities)) return false;
    foreach ($availabilities as $availability) {
        $channel = is_array($availability) ? ($availability['channel'] ?? null) : null;
        if (!is_array($channel)) continue;
        if (($channel['availabilityMode'] ?? null) === 'ALL_CHANNELS'
            || ($channel['advertisingChannelType'] ?? null) === 'SEARCH') return true;
    }
    return false;
}

/** Resolve the configured audience names/IDs, then add negative user-interest criteria to one paused Search campaign. */
function hub_google_ads_campaign_audience_exclusions_apply(
    array $config,
    string $managerId,
    string $customerId,
    string $campaignId
): array {
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
    $campaignQuery = 'SELECT campaign.id, campaign.status, campaign.advertising_channel_type, campaign.audience_setting.use_audience_grouped'
        . ' FROM campaign WHERE campaign.id = ' . $campaignId . ' LIMIT 2';
    $campaignRows = hub_google_ads_search($customerId, $campaignQuery, $accessToken, $managerId);
    if (count($campaignRows) !== 1 || !is_array($campaignRows[0]['campaign'] ?? null)) {
        throw new HubGoogleAdsApiException('audience_exclusion_target_unavailable', 404);
    }
    $campaign = $campaignRows[0]['campaign'];
    if ((string)($campaign['id'] ?? '') !== $campaignId) throw new HubGoogleAdsApiException('audience_exclusion_target_mismatch', 409);
    if (($campaign['status'] ?? null) !== 'PAUSED' || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
        throw new HubGoogleAdsApiException('audience_exclusion_campaign_must_be_paused', 409);
    }
    if (($campaign['audienceSetting']['useAudienceGrouped'] ?? false) === true) {
        throw new HubGoogleAdsApiException('audience_exclusion_campaign_setting_incompatible', 409);
    }

    $configured = hub_google_ads_campaign_audience_exclusion_catalog();
    $knownIds = [];
    $nameFilters = [];
    foreach ($configured as $entry) {
        if ($entry['id'] !== null) $knownIds[$entry['id']] = $entry['id'];
        else foreach (array_merge([$entry['name']], $entry['aliases'] ?? []) as $candidateName) $nameFilters[$candidateName] = $candidateName;
    }
    $filters = [];
    if ($knownIds) $filters[] = 'user_interest.user_interest_id IN (' . implode(', ', array_values($knownIds)) . ')';
    if ($nameFilters) {
        $filters[] = 'user_interest.name IN (' . implode(', ', array_map('hub_google_ads_campaign_creation_gaql_string', $nameFilters)) . ')';
    }
    $interestRows = hub_google_ads_search($customerId,
        'SELECT user_interest.availabilities, user_interest.launched_to_all, user_interest.name, user_interest.resource_name, user_interest.user_interest_id'
            . ' FROM user_interest WHERE (' . implode(' OR ', $filters) . ') LIMIT 100',
        $accessToken, $managerId);
    if (count($interestRows) > 100) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 502);
    $byId = [];
    $byName = [];
    foreach ($interestRows as $row) {
        $interest = $row['userInterest'] ?? null;
        if (!is_array($interest)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $id = (string)($interest['userInterestId'] ?? '');
        $name = $interest['name'] ?? null;
        $resourceName = $interest['resourceName'] ?? null;
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1
            || !is_string($name) || trim($name) === ''
            || !is_string($resourceName)
            || preg_match('#^customers/' . preg_quote($customerId, '#') . '/userInterests/' . preg_quote($id, '#') . '$#D', $resourceName) !== 1) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $byId[$id] = $interest;
        $normalizedName = hub_google_ads_campaign_creation_lower(trim($name));
        $normalizedName = preg_replace('/[^\\p{L}\\p{N}]+/u', ' ', $normalizedName) ?? $normalizedName;
        $normalizedName = trim(preg_replace('/\\s+/u', ' ', $normalizedName) ?? $normalizedName);
        $byName[$normalizedName][] = $interest;
    }

    $resolved = [];
    $unresolvedNames = [];
    $ambiguousNames = [];
    $unsupportedNames = [];
    foreach ($configured as $entry) {
        if ($entry['id'] !== null) {
            $interest = $byId[$entry['id']] ?? null;
            if (!is_array($interest)) { $unresolvedNames[] = $entry['name']; continue; }
            $resolutionSource = 'id';
        } else {
            $matches = [];
            foreach (array_merge([$entry['name']], $entry['aliases'] ?? []) as $candidateName) {
                $normalizedCandidate = hub_google_ads_campaign_creation_lower(trim($candidateName));
                $normalizedCandidate = preg_replace('/[^\\p{L}\\p{N}]+/u', ' ', $normalizedCandidate) ?? $normalizedCandidate;
                $normalizedCandidate = trim(preg_replace('/\\s+/u', ' ', $normalizedCandidate) ?? $normalizedCandidate);
                foreach ($byName[$normalizedCandidate] ?? [] as $candidateInterest) {
                    $matches[(string)($candidateInterest['resourceName'] ?? '')] = $candidateInterest;
                }
            }
            $matches = array_values($matches);
            if (!$matches) { $unresolvedNames[] = $entry['name']; continue; }
            if (count($matches) !== 1) { $ambiguousNames[] = $entry['name']; continue; }
            $interest = $matches[0];
            $resolutionSource = 'name';
        }
        if (!hub_google_ads_campaign_audience_exclusion_search_compatible($interest)) {
            $unsupportedNames[] = $entry['name'];
            continue;
        }
        $resolved[] = [
            'name' => $entry['name'],
            'id' => (string)$interest['userInterestId'],
            'resource_name' => (string)$interest['resourceName'],
            'api_name' => (string)$interest['name'],
            'resolution_source' => $resolutionSource,
        ];
    }

    $resourceNames = array_values(array_unique(array_column($resolved, 'resource_name')));
    $existingRows = [];
    if ($resourceNames) {
        $quotedResources = array_map('hub_google_ads_campaign_creation_gaql_string', $resourceNames);
        $existingRows = hub_google_ads_search($customerId,
            "SELECT campaign_criterion.negative, campaign_criterion.resource_name, campaign_criterion.status, campaign_criterion.user_interest.user_interest_category"
                . " FROM campaign_criterion WHERE campaign.id = " . $campaignId
                . " AND campaign_criterion.type = 'USER_INTEREST' AND campaign_criterion.status != 'REMOVED'"
                . ' AND campaign_criterion.user_interest.user_interest_category IN (' . implode(', ', $quotedResources) . ') LIMIT 101',
            $accessToken, $managerId);
    }
    if (count($existingRows) > 100) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 502);
    $existing = [];
    foreach ($existingRows as $row) {
        $criterion = $row['campaignCriterion'] ?? null;
        if (!is_array($criterion)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $resourceName = $criterion['userInterest']['userInterestCategory'] ?? null;
        if (!is_string($resourceName) || !in_array($resourceName, $resourceNames, true)) continue;
        $existing[$resourceName][] = [
            'negative' => ($criterion['negative'] ?? false) === true,
            'status' => $criterion['status'] ?? null,
            'resource_name' => $criterion['resourceName'] ?? null,
        ];
    }

    $operations = [];
    $operationKinds = [];
    $alreadyPresentCount = 0;
    $conflictNames = [];
    foreach ($resolved as $entry) {
        $criteria = $existing[$entry['resource_name']] ?? [];
        $activeNegative = false;
        $pausedNegative = null;
        $positiveExists = false;
        foreach ($criteria as $criterion) {
            if ($criterion['negative'] && $criterion['status'] === 'ENABLED') $activeNegative = true;
            elseif ($criterion['negative'] && $criterion['status'] === 'PAUSED' && is_string($criterion['resource_name'])) $pausedNegative = $criterion['resource_name'];
            elseif (!$criterion['negative']) $positiveExists = true;
        }
        if ($activeNegative) { $alreadyPresentCount++; continue; }
        if ($positiveExists) { $conflictNames[] = $entry['name']; continue; }
        if ($pausedNegative !== null) {
            $operations[] = ['campaignCriterionOperation' => [
                'update' => ['resourceName' => $pausedNegative, 'status' => 'ENABLED'],
                'updateMask' => 'status',
            ]];
            $operationKinds[] = 'reactivate';
            continue;
        }
        $operations[] = ['campaignCriterionOperation' => ['create' => [
            'campaign' => 'customers/' . $customerId . '/campaigns/' . $campaignId,
            'negative' => true,
            'userInterest' => ['userInterestCategory' => $entry['resource_name']],
        ]]];
        $operationKinds[] = 'add';
    }

    $addedCount = 0;
    $reactivatedCount = 0;
    $failedCount = 0;
    if ($operations) {
        $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $accessToken,
            json_encode(['mutateOperations' => $operations, 'partialFailure' => true], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        $results = $response['mutateOperationResponses'] ?? null;
        if (!is_array($results) || count($results) !== count($operations)) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 502);
        foreach ($results as $index => $result) {
            if (!isset($result['campaignCriterionResult']['resourceName'])) { $failedCount++; continue; }
            if (($operationKinds[$index] ?? null) === 'add') $addedCount++;
            else $reactivatedCount++;
        }
    }

    $verificationAvailable = true;
    $verifiedCount = 0;
    $verifiedResources = [];
    try {
        $verificationRows = $resourceNames
            ? hub_google_ads_search($customerId,
                "SELECT campaign_criterion.negative, campaign_criterion.status, campaign_criterion.user_interest.user_interest_category"
                    . " FROM campaign_criterion WHERE campaign.id = " . $campaignId
                    . " AND campaign_criterion.type = 'USER_INTEREST' AND campaign_criterion.status != 'REMOVED'"
                    . ' AND campaign_criterion.user_interest.user_interest_category IN (' . implode(', ', array_map('hub_google_ads_campaign_creation_gaql_string', $resourceNames)) . ') LIMIT 101',
                $accessToken, $managerId)
            : [];
        if (count($verificationRows) > 100) throw new HubGoogleAdsApiException('audience_exclusion_unverified', 502);
        foreach ($verificationRows as $row) {
            $criterion = $row['campaignCriterion'] ?? null;
            if (!is_array($criterion)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $resourceName = $criterion['userInterest']['userInterestCategory'] ?? null;
            if (is_string($resourceName) && ($criterion['negative'] ?? false) === true && ($criterion['status'] ?? null) === 'ENABLED') {
                $verifiedResources[$resourceName] = true;
            }
        }
        foreach ($resolved as $entry) if (isset($verifiedResources[$entry['resource_name']])) $verifiedCount++;
    } catch (Throwable $error) {
        $verificationAvailable = false;
    }

    $complete = !$unresolvedNames && !$ambiguousNames && !$unsupportedNames && !$conflictNames && !$failedCount;
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_audience_exclusions',
        'campaign_id' => $campaignId,
        'target_level' => 'CAMPAIGN',
        'submitted_count' => count($configured),
        'resolved_count' => count($resolved),
        'added_count' => $addedCount,
        'reactivated_count' => $reactivatedCount,
        'already_present_count' => $alreadyPresentCount,
        'verified_count' => $verifiedCount,
        'unresolved_count' => count($unresolvedNames),
        'ambiguous_count' => count($ambiguousNames),
        'unsupported_count' => count($unsupportedNames),
        'conflict_count' => count($conflictNames),
        'failed_count' => $failedCount,
        'unresolved_names' => $unresolvedNames,
        'ambiguous_names' => $ambiguousNames,
        'unsupported_names' => $unsupportedNames,
        'conflict_names' => $conflictNames,
        'resolved_segments' => $resolved,
        'verification_available' => $verificationAvailable,
        'verified' => $verificationAvailable && $complete && $verifiedCount === count($resolved),
        'verified_at_utc' => gmdate('Y-m-d\\TH:i:s\\Z'),
    ];
}

function hub_google_ads_campaign_creation_operations(string $customerId, array $settings, array $locations, string $campaignName, string $finalUrl, array $headlines, array $descriptions, array $promotion, string $currencyCode): array
{
    $campaignResource = 'customers/' . $customerId . '/campaigns/-2';
    $adGroupResource = 'customers/' . $customerId . '/adGroups/-3';
    $budgetResource = 'customers/' . $customerId . '/campaignBudgets/-1';
    $assetResource = 'customers/' . $customerId . '/assets/-4';
    $campaignCreate = [
        'resourceName' => $campaignResource,
        'name' => $campaignName,
        'advertisingChannelType' => 'SEARCH',
        'status' => 'PAUSED',
        'campaignBudget' => $budgetResource,
        'networkSettings' => $settings['network_settings'],
        'geoTargetTypeSetting' => ['positiveGeoTargetType' => $settings['positive_geo_target_type']],
        'containsEuPoliticalAdvertising' => $settings['contains_eu_political_advertising'],
    ];
    switch ($settings['bidding_strategy']) {
        case 'TARGET_CPA':
            // Standard Search campaigns use MaximizeConversions with a required target CPA.
            $campaignCreate['maximizeConversions'] = ['targetCpaMicros' => (string)$settings['target_cpa_micros']];
            break;
        case 'MAXIMIZE_CONVERSIONS':
            $campaignCreate['maximizeConversions'] = $settings['target_cpa_micros'] === null
                ? new stdClass()
                : ['targetCpaMicros' => (string)$settings['target_cpa_micros']];
            break;
        case 'TARGET_ROAS':
            // Standard Search campaigns use MaximizeConversionValue with a required target ROAS.
            $campaignCreate['maximizeConversionValue'] = ['targetRoas' => $settings['target_roas']];
            break;
        case 'MAXIMIZE_CONVERSION_VALUE':
            $campaignCreate['maximizeConversionValue'] = $settings['target_roas'] === null
                ? new stdClass()
                : ['targetRoas' => $settings['target_roas']];
            break;
        case 'MAXIMIZE_CLICKS':
            // The Google Ads API represents Maximize clicks with the TargetSpend scheme.
            $campaignCreate['targetSpend'] = $settings['max_cpc_bid_micros'] === null
                ? new stdClass()
                : ['cpcBidCeilingMicros' => (string)$settings['max_cpc_bid_micros']];
            break;
        case 'TARGET_IMPRESSION_SHARE':
            $campaignCreate['targetImpressionShare'] = [
                'location' => $settings['impression_share_location'],
                'locationFractionMicros' => (string)($settings['impression_share_percent'] * 10000),
                'cpcBidCeilingMicros' => (string)$settings['max_cpc_bid_micros'],
            ];
            break;
        case 'MANUAL_CPC':
            $campaignCreate['manualCpc'] = ['enhancedCpcEnabled' => false];
            break;
    }
    $operations = [[
        'campaignBudgetOperation' => ['create' => [
            'resourceName' => $budgetResource,
            'name' => hub_google_ads_campaign_creation_substr($campaignName . ' - orçamento Hub', 0, 255),
            'deliveryMethod' => 'STANDARD',
            'amountMicros' => (string)$settings['daily_budget_micros'],
            'explicitlyShared' => false,
        ]],
    ], [
        'campaignOperation' => ['create' => $campaignCreate],
    ]];
    foreach ($settings['tracking_settings'] as $field => $value) {
        if ($value === null || $value === '' || $value === []) continue;
        $apiField = match ($field) {
            'tracking_url_template' => 'trackingUrlTemplate',
            'final_url_suffix' => 'finalUrlSuffix',
            'url_custom_parameters' => 'urlCustomParameters',
            default => null,
        };
        if ($apiField !== null) $operations[1]['campaignOperation']['create'][$apiField] = $value;
    }
    foreach ($locations as $location) {
        $operations[] = ['campaignCriterionOperation' => ['create' => [
            'campaign' => $campaignResource,
            'negative' => false,
            'location' => ['geoTargetConstant' => $location['resource_name']],
        ]]];
    }
    foreach ($settings['negative_keywords'] as $keyword) {
        $operations[] = ['campaignCriterionOperation' => ['create' => [
            'campaign' => $campaignResource,
            'negative' => true,
            'keyword' => ['text' => $keyword['text'], 'matchType' => $keyword['match_type']],
        ]]];
    }
    $adGroupName = hub_google_ads_campaign_creation_substr($campaignName . ' - Grupo', 0, 255);
    $adGroupCreate = [
        'resourceName' => $adGroupResource,
        'name' => $adGroupName,
        'campaign' => $campaignResource,
        'status' => 'ENABLED',
        'type' => 'SEARCH_STANDARD',
    ];
    if ($settings['bidding_strategy'] === 'MANUAL_CPC') $adGroupCreate['cpcBidMicros'] = (string)$settings['max_cpc_bid_micros'];
    $operations[] = ['adGroupOperation' => ['create' => $adGroupCreate]];
    foreach ($settings['keywords'] as $keyword) {
        $operations[] = ['adGroupCriterionOperation' => ['create' => [
            'adGroup' => $adGroupResource,
            'status' => 'ENABLED',
            'keyword' => ['text' => $keyword['text'], 'matchType' => $keyword['match_type']],
        ]]];
    }
    $operations[] = ['adGroupAdOperation' => ['create' => [
        'adGroup' => $adGroupResource,
        'status' => 'ENABLED',
        'ad' => [
            'finalUrls' => [$finalUrl],
            'responsiveSearchAd' => [
                'headlines' => array_map(static fn(string $text): array => ['text' => $text], $headlines),
                'descriptions' => array_map(static fn(string $text): array => ['text' => $text], $descriptions),
            ],
        ],
    ]]];
    $promotionAsset = [
        'resourceName' => $assetResource,
        'name' => hub_google_ads_campaign_creation_substr($campaignName . ' - promoção Hub', 0, 255),
        'finalUrls' => [$finalUrl],
        'promotionAsset' => [
            'promotionTarget' => $promotion['target'],
            'languageCode' => $promotion['language_code'],
        ],
    ];
    if ($promotion['occasion'] !== null) {
        $promotionAsset['promotionAsset']['occasion'] = $promotion['occasion'];
    }
    if ($promotion['discount_type'] === 'percent_off') {
        $promotionAsset['promotionAsset']['percentOff'] = (string)((int)$promotion['discount_value'] * 10000);
    } else {
        $promotionAsset['promotionAsset']['moneyAmountOff'] = [
            'amountMicros' => hub_google_ads_campaign_creation_decimal_micros($promotion['discount_value']),
            'currencyCode' => $currencyCode,
        ];
    }
    if ($promotion['trigger_type'] === 'promotion_code') {
        $promotionAsset['promotionAsset']['promotionCode'] = $promotion['trigger_value'];
    } elseif ($promotion['trigger_type'] === 'orders_over_amount') {
        $promotionAsset['promotionAsset']['ordersOverAmount'] = [
            'amountMicros' => hub_google_ads_campaign_creation_decimal_micros($promotion['trigger_value']),
            'currencyCode' => $currencyCode,
        ];
    }
    if ($promotion['start_date'] !== null) {
        $promotionAsset['promotionAsset']['startDate'] = $promotion['start_date'];
        $promotionAsset['promotionAsset']['endDate'] = $promotion['end_date'];
    }
    $operations[] = ['assetOperation' => ['create' => $promotionAsset]];
    $operations[] = ['campaignAssetOperation' => ['create' => [
        'campaign' => $campaignResource,
        'asset' => $assetResource,
        'fieldType' => 'PROMOTION',
        'status' => 'ENABLED',
    ]]];
    return $operations;
}

function hub_google_ads_campaign_creation_preview_or_create(array $config, array $payload, bool $create): array
{
    [$managerId, $customerId, $name, $url, $headlines, $descriptions, $promotion, $settings, $previewContextToken, $campaignNameLookupToken] =
        hub_google_ads_campaign_creation_validate_payload($payload, $create);
    if (!hub_google_ads_campaign_creation_enabled($config)) throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $credentials = hub_google_ads_credentials();
    $accessToken = hub_google_ads_access_token($credentials);
    $selectedAction = $settings['conversion_action_name'] !== '' ? [
        'name' => $settings['conversion_action_name'],
        'resource_name' => $settings['conversion_action_resource_name'],
    ] : null;
    $previewContext = $previewContextToken !== ''
        ? hub_google_ads_campaign_creation_preview_context_decode(
            $previewContextToken, $credentials, $managerId, $customerId,
            $settings['geo_targeting_mode'], $settings['country_codes'], $selectedAction
        )
        : null;
    if ($previewContext === null) hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
    if (!$create && $campaignNameLookupToken !== '') {
        $duplicates = hub_google_ads_campaign_creation_name_lookup_decode(
            $campaignNameLookupToken, $credentials, $managerId, $customerId, $name
        );
    } else {
        $duplicateQuery = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.audience_setting.use_audience_grouped FROM campaign WHERE campaign.name = '
            . hub_google_ads_campaign_creation_gaql_string($name) . " AND campaign.status != 'REMOVED' LIMIT 2";
        $duplicates = hub_google_ads_search($customerId, $duplicateQuery, $accessToken, $managerId);
    }
    if (count($duplicates) > 1) throw new HubGoogleAdsApiException('campaign_name_conflict', 409);
    if ($duplicates && $create) throw new HubGoogleAdsApiException('campaign_name_already_exists', 409);
    if ($duplicates) {
        $existing = $duplicates[0]['campaign'] ?? null;
        $campaignId = is_array($existing) ? (string)($existing['id'] ?? '') : '';
        $existingName = is_array($existing) ? ($existing['name'] ?? null) : null;
        $existingStatus = is_array($existing) ? ($existing['status'] ?? null) : null;
        $channelType = is_array($existing) ? ($existing['advertisingChannelType'] ?? null) : null;
        $audienceGrouped = is_array($existing) ? ($existing['audienceSetting']['useAudienceGrouped'] ?? false) : null;
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
            || $existingName !== $name
            || !in_array($existingStatus, ['ENABLED', 'PAUSED'], true)
            || !is_string($channelType) || preg_match('/^[A-Z][A-Z_]{1,63}$/D', $channelType) !== 1
            || !is_bool($audienceGrouped)) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }

        $adGroups = [];
        if ($channelType === 'SEARCH') {
            $adGroupRows = hub_google_ads_search($customerId,
                "SELECT ad_group.id, ad_group.status FROM ad_group WHERE campaign.id = $campaignId AND ad_group.status != 'REMOVED' LIMIT 2",
                $accessToken, $managerId);
            if (count($adGroupRows) > 2) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            foreach ($adGroupRows as $row) {
                $adGroup = $row['adGroup'] ?? null;
                $adGroupId = is_array($adGroup) ? (string)($adGroup['id'] ?? '') : '';
                $adGroupStatus = is_array($adGroup) ? ($adGroup['status'] ?? null) : null;
                if (preg_match('/^[1-9][0-9]{0,19}$/D', $adGroupId) !== 1
                    || !in_array($adGroupStatus, ['ENABLED', 'PAUSED'], true)) {
                    throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                }
                $adGroups[$adGroupId] = $adGroupStatus;
            }
        }
        $adGroupCount = count($adGroups);
        $uniqueAdGroupId = $adGroupCount === 1 ? (string)array_key_first($adGroups) : '';
        return [
            'ok' => true,
            'schema_version' => 1,
            'operation' => 'preview_search_campaign',
            'existing_campaign' => true,
            'validated_only' => false,
            'will_create_paused' => false,
            'campaign_name' => $existingName,
            'campaign_id' => $campaignId,
            'campaign_status' => $existingStatus,
            'campaign_channel_type' => $channelType,
            'audience_grouped' => $audienceGrouped,
            'ad_group_id' => $uniqueAdGroupId,
            'ad_group_status' => $uniqueAdGroupId !== '' ? $adGroups[$uniqueAdGroupId] : '',
            'ad_group_count' => $adGroupCount,
        ];
    }
    $customGoal = $previewContext === null
        ? hub_google_ads_campaign_creation_resolve_custom_goal($accessToken, $managerId, $customerId, $selectedAction)
        : [
            'resource_name' => $previewContext['custom_conversion_goal_resource_name'],
            'name' => $previewContext['custom_conversion_goal_name'],
            'conversion_action_resource_name' => $previewContext['conversion_action_resource_name'],
            'conversion_action_name' => $previewContext['conversion_action_name'],
        ];
    $currencyCode = $previewContext['account_currency'] ?? hub_google_ads_campaign_creation_customer_currency($accessToken, $managerId, $customerId);
    if ($settings['target_cpa_micros'] !== null && $settings['target_cpa_currency'] !== ''
        && $settings['target_cpa_currency'] !== $currencyCode) {
        throw new HubGoogleAdsApiException('campaign_currency_mismatch', 422);
    }
    $locations = $previewContext['locations'] ?? hub_google_ads_campaign_creation_resolve_countries($accessToken, $managerId, $customerId, $settings['country_codes']);
    $operations = hub_google_ads_campaign_creation_operations($customerId, $settings, $locations, $name, $url, $headlines, $descriptions, $promotion, $currencyCode);
    $request = ['mutateOperations' => $operations];
    if (!$create) $request['validateOnly'] = true;
    $response = hub_google_ads_api_request(
        'POST',
        'customers/' . $customerId . '/googleAds:mutate',
        $accessToken,
        json_encode($request, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        $managerId
    );
    if (!$create) {
        return [
            'ok' => true,
            'schema_version' => 1,
            'operation' => 'preview_search_campaign',
            'validated_only' => true,
            'campaign_status' => 'PAUSED',
            'campaign_name' => $name,
            'account_currency' => $currencyCode,
            'daily_budget_micros' => $settings['daily_budget_micros'],
            'bidding_strategy' => $settings['bidding_strategy'],
            'target_cpa_micros' => $settings['target_cpa_micros'],
            'target_roas' => $settings['target_roas'],
            'max_cpc_bid_micros' => $settings['max_cpc_bid_micros'],
            'impression_share_location' => $settings['impression_share_location'],
            'impression_share_percent' => $settings['impression_share_percent'],
            'geo_targeting_mode' => $settings['geo_targeting_mode'],
            'target_countries' => array_map(static fn(array $location): array => ['country_code' => $location['country_code'], 'name' => $location['name']], $locations),
            'keyword_count' => count($settings['keywords']),
            'negative_keyword_count' => count($settings['negative_keywords']),
            'network_settings' => $settings['network_settings'],
            'positive_geo_target_type' => $settings['positive_geo_target_type'],
            'contains_eu_political_advertising' => $settings['contains_eu_political_advertising'],
            'tracking_settings_provided' => array_filter($settings['tracking_settings'], static fn(mixed $value): bool => $value !== null && $value !== '') !== [],
            'goal_config_level' => 'CAMPAIGN',
            'custom_conversion_goal_name' => $customGoal['name'],
            'conversion_action_name' => $customGoal['conversion_action_name'],
            'conversion_action_resource_name' => $customGoal['conversion_action_resource_name'],
            'headline_count' => count($headlines),
            'description_count' => count($descriptions),
            'promotion_target' => $promotion['target'],
            'will_create_paused' => true,
        ];
    }
    $results = $response['mutateOperationResponses'] ?? null;
    if (!is_array($results) || count($results) !== count($operations)) throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
    $campaignResource = $results[1]['campaignResult']['resourceName'] ?? null;
    if (!is_string($campaignResource)
        || preg_match('#^customers/' . preg_quote($customerId, '#') . '/campaigns/([1-9][0-9]{0,19})$#D', $campaignResource, $matches) !== 1) {
        throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
    }
    $campaignId = $matches[1];
    try { $verified = hub_google_ads_campaign_action_read($accessToken, $managerId, $customerId, $campaignId); }
    catch (Throwable $error) { throw new HubGoogleAdsApiException('campaign_creation_unverified', 502); }
    if ($verified['status'] !== 'PAUSED' || $verified['name'] !== $name
        || $verified['positive_geo_target_type'] !== $settings['positive_geo_target_type']) {
        throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
    }
    try {
        $goalVerification = hub_google_ads_campaign_creation_apply_and_verify_custom_goal(
            $accessToken, $managerId, $customerId, $campaignId, $customGoal
        );
        $verified = hub_google_ads_campaign_action_read($accessToken, $managerId, $customerId, $campaignId);
    } catch (Throwable $error) {
        throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    }
    if ($verified['status'] !== 'PAUSED' || $verified['name'] !== $name
        || $verified['positive_geo_target_type'] !== $settings['positive_geo_target_type']
        || ($goalVerification['verified'] ?? null) !== true) {
        throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
    }
    $createdResources = [];
    foreach ($results as $result) {
        if (!is_array($result)) throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
        foreach (['campaignBudgetResult', 'campaignResult', 'campaignCriterionResult', 'adGroupResult', 'adGroupCriterionResult', 'adGroupAdResult', 'assetResult', 'campaignAssetResult'] as $resultKey) {
            if (!isset($result[$resultKey])) continue;
            $resourceName = $result[$resultKey]['resourceName'] ?? null;
            if (!is_string($resourceName) || !str_starts_with($resourceName, 'customers/' . $customerId . '/')) {
                throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
            }
            $createdResources[$resultKey] = $resourceName;
        }
    }
    if (!isset($createdResources['campaignBudgetResult'], $createdResources['campaignResult'], $createdResources['adGroupResult'], $createdResources['adGroupAdResult'], $createdResources['assetResult'], $createdResources['campaignAssetResult'])) {
        throw new HubGoogleAdsApiException('campaign_creation_unverified', 502);
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'create_search_campaign',
        'created' => true,
        'verified' => true,
        'campaign_id' => $campaignId,
        'campaign_resource_name' => $campaignResource,
        'campaign_name' => $verified['name'],
        'status' => $verified['status'],
        'geo_targeting_mode' => $settings['geo_targeting_mode'],
        'positive_geo_target_type' => $verified['positive_geo_target_type'],
        'goal_config_level' => 'CAMPAIGN',
        'custom_conversion_goal_name' => $goalVerification['goal_name'],
        'conversion_action_name' => $goalVerification['conversion_action_name'],
        'conversion_action_resource_name' => $goalVerification['conversion_action_resource_name'],
        'conversion_goal_verified' => true,
        'campaign_budget_resource_name' => $createdResources['campaignBudgetResult'],
        'ad_group_resource_name' => $createdResources['adGroupResult'],
        'ad_resource_name' => $createdResources['adGroupAdResult'],
        'promotion_asset_resource_name' => $createdResources['assetResult'],
        'campaign_asset_resource_name' => $createdResources['campaignAssetResult'],
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

function hub_google_ads_campaign_sitelinks_normalize_base_url(string $url): ?string
{
    $parts = parse_url($url);
    if (!is_array($parts) || !is_string($parts['scheme'] ?? null) || !is_string($parts['host'] ?? null)) return null;
    $scheme = strtolower($parts['scheme']);
    $host = $parts['host'];
    if (str_contains($host, ':') && !str_starts_with($host, '[')) $host = '[' . $host . ']';
    $baseUrl = $scheme . '://' . $host;
    if (isset($parts['port'])) $baseUrl .= ':' . $parts['port'];
    $baseUrl .= rtrim((string)($parts['path'] ?? ''), '/');
    if (array_key_exists('query', $parts)) $baseUrl .= '?' . $parts['query'];
    return $baseUrl;
}

function hub_google_ads_campaign_sitelinks_validate_payload(array $payload): array
{
    $expected = ['campaign_id', 'confirm', 'customer_id', 'manager_customer_id', 'operation', 'sitelinks'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    $rawLinks = $payload['sitelinks'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_campaign_sitelinks'
        || ($payload['confirm'] ?? null) !== true || $managerId === null || $customerId === null
        || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !is_array($rawLinks) || count($rawLinks) < 1 || count($rawLinks) > 6) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $anchors = [];
    $links = [];
    foreach ($rawLinks as $link) {
        if (!is_array($link)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $linkKeys = array_keys($link); sort($linkKeys, SORT_STRING);
        if ($linkKeys !== ['anchor', 'description1', 'description2', 'title']) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $title = is_string($link['title']) ? trim($link['title']) : '';
        $description1 = is_string($link['description1']) ? trim($link['description1']) : '';
        $description2 = is_string($link['description2']) ? trim($link['description2']) : '';
        $anchor = $link['anchor'];
        if (!is_int($anchor) || $anchor < 1 || $anchor > 6 || isset($anchors[$anchor])
            || $title === '' || hub_google_ads_campaign_creation_text_length($title) > 25
            || (($description1 === '') !== ($description2 === ''))
            || hub_google_ads_campaign_creation_text_length($description1) > 35
            || hub_google_ads_campaign_creation_text_length($description2) > 35) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $anchors[$anchor] = true;
        $links[] = ['title' => $title, 'description1' => $description1, 'description2' => $description2, 'anchor' => $anchor];
    }
    return [$managerId, $customerId, $campaignId, $links];
}

function hub_google_ads_campaign_sitelinks_apply(array $config, string $managerId, string $customerId, string $campaignId, array $links): array
{
    if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
        throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    }
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
    $adRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign.status, campaign.advertising_channel_type, ad_group_ad.ad.final_urls FROM ad_group_ad"
            . " WHERE campaign.id = $campaignId AND campaign.status != 'REMOVED' AND ad_group_ad.status != 'REMOVED' LIMIT 101",
        $accessToken, $managerId);
    if (count($adRows) < 1 || count($adRows) > 100) throw new HubGoogleAdsApiException('campaign_sitelinks_campaign_unavailable', 404);
    $campaign = null;
    $baseUrls = [];
    foreach ($adRows as $row) {
        $currentCampaign = $row['campaign'] ?? null;
        $ad = $row['adGroupAd']['ad'] ?? null;
        if (!is_array($currentCampaign) || (string)($currentCampaign['id'] ?? '') !== $campaignId
            || !in_array($currentCampaign['status'] ?? null, ['PAUSED', 'ENABLED'], true)
            || ($currentCampaign['advertisingChannelType'] ?? null) !== 'SEARCH'
            || !is_array($ad) || !is_array($ad['finalUrls'] ?? null)) {
            throw new HubGoogleAdsApiException('campaign_sitelinks_campaign_unavailable', 409);
        }
        $campaign = $currentCampaign;
        foreach ($ad['finalUrls'] as $url) {
            if (!is_string($url) || strlen($url) > 2048) throw new HubGoogleAdsApiException('campaign_sitelinks_url_mismatch', 409);
            $parts = parse_url($url);
            if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
                || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) {
                throw new HubGoogleAdsApiException('campaign_sitelinks_url_mismatch', 409);
            }
            $normalizedUrl = hub_google_ads_campaign_sitelinks_normalize_base_url($url);
            if ($normalizedUrl === null) throw new HubGoogleAdsApiException('campaign_sitelinks_url_mismatch', 409);
            $baseUrls[$normalizedUrl] = $normalizedUrl;
        }
    }
    if (!is_array($campaign) || count($baseUrls) !== 1) throw new HubGoogleAdsApiException('campaign_sitelinks_url_mismatch', 409);
    $baseUrl = (string)array_values($baseUrls)[0];
    $campaignRef = 'customers/' . $customerId . '/campaigns/' . $campaignId;
    $desired = [];
    foreach ($links as $link) {
        $url = $baseUrl . '#' . $link['anchor'];
        $key = hash('sha256', json_encode([$link['title'], $link['description1'], $link['description2'], $url], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $desired[$key] = $link + ['final_url' => $url];
    }

    $existingRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.status, campaign_asset.field_type, asset.type, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2"
            . " FROM campaign_asset WHERE campaign.id = $campaignId AND campaign_asset.field_type = 'SITELINK'"
            . " AND campaign_asset.status != 'REMOVED' LIMIT 201",
        $accessToken, $managerId);
    if (count($existingRows) > 200) throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
    $present = [];
    foreach ($existingRows as $row) {
        $asset = $row['asset'] ?? null;
        if (!is_array($asset) || ($asset['type'] ?? null) !== 'SITELINK') continue;
        $sitelink = $asset['sitelinkAsset'] ?? null;
        $urls = $asset['finalUrls'] ?? null;
        if (!is_array($sitelink) || !is_array($urls)) continue;
        foreach ($urls as $existingUrl) {
            if (!is_string($existingUrl)) continue;
            $key = hash('sha256', json_encode([
                (string)($sitelink['linkText'] ?? ''),
                (string)($sitelink['description1'] ?? ''),
                (string)($sitelink['description2'] ?? ''),
                $existingUrl,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            $present[$key][] = [
                'resource_name' => (string)($row['campaignAsset']['resourceName'] ?? ''),
                'status' => (string)($row['campaignAsset']['status'] ?? ''),
            ];
        }
    }
    $operations = [];
    $operationResultTypes = [];
    $newCount = 0;
    $reactivatedCount = 0;
    $alreadyPresentCount = 0;
    foreach ($desired as $key => $link) {
        $matches = $present[$key] ?? [];
        $active = array_filter($matches, static fn(array $match): bool => $match['status'] === 'ENABLED');
        if ($active) {
            $alreadyPresentCount++;
            continue;
        }
        $paused = null;
        foreach ($matches as $match) {
            if ($match['status'] === 'PAUSED' && preg_match('#^customers/' . preg_quote($customerId, '#') . '/campaignAssets/[1-9][0-9]*~[1-9][0-9]*~SITELINK$#D', $match['resource_name']) === 1) {
                $paused = $match;
                break;
            }
        }
        if ($paused !== null) {
            $operations[] = ['campaignAssetOperation' => [
                'update' => ['resourceName' => $paused['resource_name'], 'status' => 'ENABLED'],
                'updateMask' => 'status',
            ]];
            $operationResultTypes[] = 'campaign_asset';
            $reactivatedCount++;
            continue;
        }
        $assetRef = 'customers/' . $customerId . '/assets/-' . (2 * $newCount + 1);
        $assetName = hub_google_ads_campaign_creation_substr((string)($campaign['name'] ?? 'Campanha') . ' - Sitelink ' . $link['title'], 0, 255);
        $sitelinkAsset = [
            'linkText' => $link['title'],
        ];
        if ($link['description1'] !== '') {
            $sitelinkAsset['description1'] = $link['description1'];
            $sitelinkAsset['description2'] = $link['description2'];
        }
        $operations[] = ['assetOperation' => ['create' => [
            'resourceName' => $assetRef,
            'name' => $assetName,
            'finalUrls' => [$link['final_url']],
            'sitelinkAsset' => $sitelinkAsset,
        ]]];
        $operationResultTypes[] = 'asset';
        $operations[] = ['campaignAssetOperation' => ['create' => [
            'campaign' => $campaignRef,
            'asset' => $assetRef,
            'fieldType' => 'SITELINK',
            'status' => 'ENABLED',
        ]]];
        $operationResultTypes[] = 'campaign_asset';
        $newCount++;
    }
    if ($operations) {
        $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $accessToken,
            json_encode(['mutateOperations' => $operations, 'partialFailure' => false], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        $results = $response['mutateOperationResponses'] ?? null;
        if (!is_array($results) || count($results) !== count($operations)) {
            throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
        }
        foreach ($results as $index => $result) {
            $resultType = $operationResultTypes[$index] ?? '';
            $resultKey = $resultType === 'asset' ? 'assetResult' : 'campaignAssetResult';
            $expectedPrefix = 'customers/' . $customerId . '/' . ($resultType === 'asset' ? 'assets/' : 'campaignAssets/');
            $resourceName = $result[$resultKey]['resourceName'] ?? null;
            if (!is_string($resourceName) || !str_starts_with($resourceName, $expectedPrefix)) {
                throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
            }
        }
    }
    $verifiedRows = $operations
        ? hub_google_ads_search($customerId,
            "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.status, campaign_asset.field_type, asset.type, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2"
                . " FROM campaign_asset WHERE campaign.id = $campaignId AND campaign_asset.field_type = 'SITELINK'"
                . " AND campaign_asset.status != 'REMOVED' LIMIT 201",
            $accessToken, $managerId)
        : $existingRows;
    if (count($verifiedRows) > 200) throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
    $verifiedActive = [];
    foreach ($verifiedRows as $row) {
        if (($row['campaignAsset']['status'] ?? null) !== 'ENABLED') continue;
        $asset = $row['asset'] ?? null;
        if (!is_array($asset) || ($asset['type'] ?? null) !== 'SITELINK') continue;
        $sitelink = $asset['sitelinkAsset'] ?? null;
        $urls = $asset['finalUrls'] ?? null;
        if (!is_array($sitelink) || !is_array($urls)) continue;
        foreach ($urls as $url) {
            if (!is_string($url)) continue;
            $key = hash('sha256', json_encode([
                (string)($sitelink['linkText'] ?? ''),
                (string)($sitelink['description1'] ?? ''),
                (string)($sitelink['description2'] ?? ''),
                $url,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            $verifiedActive[$key] = true;
        }
    }
    foreach (array_keys($desired) as $key) {
        if (!isset($verifiedActive[$key])) throw new HubGoogleAdsApiException('campaign_sitelinks_write_rejected', 502);
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_campaign_sitelinks',
        'campaign_id' => $campaignId,
        'campaign_name' => (string)($campaign['name'] ?? ''),
        'campaign_status' => (string)($campaign['status'] ?? ''),
        'submitted_count' => count($links),
        'applied_count' => $newCount,
        'reactivated_count' => $reactivatedCount,
        'already_present_count' => $alreadyPresentCount,
        'verified' => true,
        'verified_at_utc' => gmdate('Y-m-d\\TH:i:s\\Z'),
    ];
}

function hub_google_ads_campaign_destination_url_validate_payload(array $payload): array
{
    $expected = ['batch_campaign_ids', 'campaign_id', 'confirm', 'customer_id', 'final_url', 'manager_customer_id', 'operation'];
    $keys = array_keys($payload); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $campaignId = $payload['campaign_id'] ?? null;
    $rawBatchIds = $payload['batch_campaign_ids'] ?? null;
    $url = $payload['final_url'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'apply_campaign_destination_url'
        || ($payload['confirm'] ?? null) !== true || $managerId === null || $customerId === null
        || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !is_array($rawBatchIds) || !array_is_list($rawBatchIds) || count($rawBatchIds) < 1 || count($rawBatchIds) > 100
        || !is_string($url) || strlen($url) > 2048) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $batchIds = [];
    foreach ($rawBatchIds as $rawId) {
        if (!is_string($rawId) || preg_match('/^[1-9][0-9]{0,19}$/D', $rawId) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $batchIds[$rawId] = $rawId;
    }
    if (!isset($batchIds[$campaignId])) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $parts = parse_url($url);
    if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
        || !is_string($parts['host'] ?? null) || $parts['host'] === ''
        || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])
        || filter_var($url, FILTER_VALIDATE_URL) === false) {
        throw new HubGoogleAdsApiException('campaign_destination_url_invalid', 422);
    }
    return [$managerId, $customerId, $campaignId, array_values($batchIds), $url];
}

function hub_google_ads_campaign_destination_url_rewrite(array $urls, string $newUrl, bool $preserveSitelinkSection): array
{
    $result = [];
    foreach ($urls as $url) {
        if (!is_string($url) || strlen($url) > 2048) throw new HubGoogleAdsApiException('campaign_destination_url_update_rejected', 502);
        $replacement = $newUrl;
        if ($preserveSitelinkSection) {
            $fragment = (string)(parse_url($url, PHP_URL_FRAGMENT) ?? '');
            if (preg_match('/^[1-6]$/D', $fragment) === 1) {
                $parts = parse_url($newUrl);
                if (!is_array($parts) || !is_string($parts['scheme'] ?? null) || !is_string($parts['host'] ?? null)) {
                    throw new HubGoogleAdsApiException('campaign_destination_url_invalid', 422);
                }
                $host = $parts['host'];
                if (str_contains($host, ':') && !str_starts_with($host, '[')) $host = '[' . $host . ']';
                $replacement = strtolower($parts['scheme']) . '://' . $host
                    . (isset($parts['port']) ? ':' . $parts['port'] : '')
                    . rtrim((string)($parts['path'] ?? ''), '/')
                    . (array_key_exists('query', $parts) ? '?' . $parts['query'] : '') . '#' . $fragment;
            }
        }
        $result[$replacement] = $replacement;
    }
    return array_values($result);
}

function hub_google_ads_campaign_destination_url_apply(
    array $config,
    string $managerId,
    string $customerId,
    string $campaignId,
    array $batchCampaignIds,
    string $finalUrl
): array {
    if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
        throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    }
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);

    $campaignRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = $campaignId LIMIT 2",
        $accessToken, $managerId);
    if (count($campaignRows) !== 1 || !is_array($campaignRows[0]['campaign'] ?? null)) {
        throw new HubGoogleAdsApiException('campaign_not_found', 404);
    }
    $campaign = $campaignRows[0]['campaign'];
    if ((string)($campaign['id'] ?? '') !== $campaignId
        || !in_array($campaign['status'] ?? null, ['PAUSED', 'ENABLED'], true)
        || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
        throw new HubGoogleAdsApiException('campaign_destination_url_campaign_unavailable', 409);
    }

    $batchIdsSql = implode(', ', $batchCampaignIds);
    $batchCampaignRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id IN ($batchIdsSql) LIMIT 101",
        $accessToken, $managerId);
    $verifiedBatchIds = [];
    foreach ($batchCampaignRows as $row) {
        $batchCampaign = $row['campaign'] ?? null;
        $id = is_array($batchCampaign) ? (string)($batchCampaign['id'] ?? '') : '';
        if ($id === '' || !in_array($batchCampaign['status'] ?? null, ['PAUSED', 'ENABLED'], true)
            || ($batchCampaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
            throw new HubGoogleAdsApiException('campaign_destination_url_campaign_unavailable', 409);
        }
        $verifiedBatchIds[$id] = true;
    }
    if (count($verifiedBatchIds) !== count($batchCampaignIds) || !isset($verifiedBatchIds[$campaignId])) {
        throw new HubGoogleAdsApiException('campaign_destination_url_campaign_unavailable', 409);
    }

    $adRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.resource_name, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls FROM ad_group_ad WHERE campaign.id = $campaignId AND ad_group_ad.status != 'REMOVED' LIMIT 501",
        $accessToken, $managerId);
    if (count($adRows) > 500) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    $criterionRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group_criterion.resource_name, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.final_urls, ad_group_criterion.final_mobile_urls FROM ad_group_criterion WHERE campaign.id = $campaignId AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' LIMIT 2001",
        $accessToken, $managerId);
    if (count($criterionRows) > 2000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    $campaignAssetRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.asset, campaign_asset.field_type, campaign_asset.status, asset.resource_name, asset.id, asset.type, asset.final_urls, asset.final_mobile_urls FROM campaign_asset WHERE campaign.id = $campaignId AND campaign_asset.status != 'REMOVED' LIMIT 301",
        $accessToken, $managerId);
    $groupAssetRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, ad_group_asset.resource_name, ad_group_asset.asset, ad_group_asset.field_type, ad_group_asset.status, asset.resource_name, asset.id, asset.type, asset.final_urls, asset.final_mobile_urls FROM ad_group_asset WHERE campaign.id = $campaignId AND ad_group_asset.status != 'REMOVED' LIMIT 301",
        $accessToken, $managerId);
    if (count($campaignAssetRows) > 300 || count($groupAssetRows) > 300) {
        throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    }

    $assetsByResource = [];
    foreach (array_merge($campaignAssetRows, $groupAssetRows) as $row) {
        $asset = $row['asset'] ?? null;
        $assetResource = is_array($asset) ? (string)($asset['resourceName'] ?? '') : '';
        $urls = is_array($asset) ? ($asset['finalUrls'] ?? []) : [];
        if ($assetResource === '' || !is_array($urls) || !$urls) continue;
        $assetsByResource[$assetResource] = [
            'resource_name' => $assetResource,
            'id' => (string)($asset['id'] ?? ''),
            'type' => (string)($asset['type'] ?? ''),
            'final_urls' => $urls,
            'final_mobile_urls' => is_array($asset['finalMobileUrls'] ?? null) ? $asset['finalMobileUrls'] : [],
        ];
    }

    $sharedOutsideBatch = [];
    $accountLinkedAssets = [];
    if ($assetsByResource) {
        $assetRefs = implode(', ', array_map('hub_google_ads_campaign_creation_gaql_string', array_keys($assetsByResource)));
        $otherCampaignRows = hub_google_ads_search($customerId,
            "SELECT campaign.id, campaign_asset.asset, campaign_asset.status FROM campaign_asset WHERE campaign_asset.asset IN ($assetRefs) AND campaign_asset.status != 'REMOVED' LIMIT 1001",
            $accessToken, $managerId);
        if (count($otherCampaignRows) > 1000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
        foreach ($otherCampaignRows as $row) {
            $assetResource = (string)($row['campaignAsset']['asset'] ?? '');
            $linkedCampaignId = (string)($row['campaign']['id'] ?? '');
            if ($assetResource !== '' && !in_array($linkedCampaignId, $batchCampaignIds, true)) $sharedOutsideBatch[$assetResource] = true;
        }
        $otherGroupRows = hub_google_ads_search($customerId,
            "SELECT campaign.id, ad_group_asset.asset, ad_group_asset.status FROM ad_group_asset WHERE ad_group_asset.asset IN ($assetRefs) AND ad_group_asset.status != 'REMOVED' LIMIT 1001",
            $accessToken, $managerId);
        if (count($otherGroupRows) > 1000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
        foreach ($otherGroupRows as $row) {
            $assetResource = (string)($row['adGroupAsset']['asset'] ?? '');
            $linkedCampaignId = (string)($row['campaign']['id'] ?? '');
            if ($assetResource !== '' && !in_array($linkedCampaignId, $batchCampaignIds, true)) $sharedOutsideBatch[$assetResource] = true;
        }
    }

    $customerAssetRows = hub_google_ads_search($customerId,
        "SELECT customer_asset.asset, customer_asset.status, asset.final_urls FROM customer_asset WHERE customer_asset.status != 'REMOVED' LIMIT 1001",
        $accessToken, $managerId);
    if (count($customerAssetRows) > 1000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    $accountScopedUrlAssetCount = 0;
    foreach ($customerAssetRows as $row) {
        $assetResource = (string)($row['customerAsset']['asset'] ?? '');
        if (is_array($row['asset']['finalUrls'] ?? null) && $row['asset']['finalUrls']) {
            $accountScopedUrlAssetCount++;
            if ($assetResource !== '' && isset($assetsByResource[$assetResource])) $accountLinkedAssets[$assetResource] = true;
        }
    }

    $mutateOperations = [];
    $expectedAds = [];
    $expectedCriteria = [];
    $expectedAssets = [];
    $adsAlreadyCurrent = 0;
    $criteriaAlreadyCurrent = 0;
    $assetsAlreadyCurrent = 0;
    $assetsSkippedShared = 0;
    $assetsSkippedAccount = 0;
    foreach ($adRows as $row) {
        $ad = $row['adGroupAd']['ad'] ?? null;
        $resourceName = is_array($ad) ? (string)($ad['resourceName'] ?? '') : '';
        $urls = is_array($ad) ? ($ad['finalUrls'] ?? null) : null;
        if ($resourceName === '' || !is_array($urls) || !$urls) throw new HubGoogleAdsApiException('campaign_destination_url_update_rejected', 502);
        $update = ['resourceName' => $resourceName, 'finalUrls' => [$finalUrl]];
        $mask = ['finalUrls'];
        if (is_array($ad['finalMobileUrls'] ?? null) && $ad['finalMobileUrls']) {
            $update['finalMobileUrls'] = [$finalUrl];
            $mask[] = 'finalMobileUrls';
        }
        $expectedAds[$resourceName] = ['final_urls' => [$finalUrl], 'final_mobile_urls' => $update['finalMobileUrls'] ?? []];
        if ($urls === [$finalUrl] && ($update['finalMobileUrls'] ?? ($ad['finalMobileUrls'] ?? [])) === ($ad['finalMobileUrls'] ?? [])) {
            $adsAlreadyCurrent++;
            unset($expectedAds[$resourceName]);
            continue;
        }
        $mutateOperations[] = ['adOperation' => ['update' => $update, 'updateMask' => implode(',', $mask)]];
    }
    foreach ($criterionRows as $row) {
        $criterion = $row['adGroupCriterion'] ?? null;
        if (!is_array($criterion) || ($criterion['type'] ?? null) !== 'KEYWORD') continue;
        $resourceName = (string)($criterion['resourceName'] ?? '');
        $urls = $criterion['finalUrls'] ?? [];
        if ($resourceName === '' || !is_array($urls)) throw new HubGoogleAdsApiException('campaign_destination_url_update_rejected', 502);
        if (!$urls) continue;
        $update = ['resourceName' => $resourceName, 'finalUrls' => [$finalUrl]];
        $mask = ['finalUrls'];
        if (is_array($criterion['finalMobileUrls'] ?? null) && $criterion['finalMobileUrls']) {
            $update['finalMobileUrls'] = [$finalUrl];
            $mask[] = 'finalMobileUrls';
        }
        $expectedCriteria[$resourceName] = ['final_urls' => [$finalUrl], 'final_mobile_urls' => $update['finalMobileUrls'] ?? []];
        if ($urls === [$finalUrl] && ($update['finalMobileUrls'] ?? ($criterion['finalMobileUrls'] ?? [])) === ($criterion['finalMobileUrls'] ?? [])) {
            $criteriaAlreadyCurrent++;
            unset($expectedCriteria[$resourceName]);
            continue;
        }
        $mutateOperations[] = ['adGroupCriterionOperation' => ['update' => $update, 'updateMask' => implode(',', $mask)]];
    }
    foreach ($assetsByResource as $resourceName => $asset) {
        $isSitelink = false;
        foreach (array_merge($campaignAssetRows, $groupAssetRows) as $row) {
            if (($row['asset']['resourceName'] ?? '') === $resourceName
                && (($row['campaignAsset']['fieldType'] ?? $row['adGroupAsset']['fieldType'] ?? '') === 'SITELINK')) {
                $isSitelink = true; break;
            }
        }
        $nextUrls = hub_google_ads_campaign_destination_url_rewrite($asset['final_urls'], $finalUrl, $isSitelink);
        $update = ['resourceName' => $resourceName, 'finalUrls' => $nextUrls];
        $mask = ['finalUrls'];
        $nextMobileUrls = [];
        if ($asset['final_mobile_urls']) {
            $nextMobileUrls = hub_google_ads_campaign_destination_url_rewrite($asset['final_mobile_urls'], $finalUrl, $isSitelink);
            $update['finalMobileUrls'] = $nextMobileUrls;
            $mask[] = 'finalMobileUrls';
        }
        if ($nextUrls === $asset['final_urls'] && $nextMobileUrls === $asset['final_mobile_urls']) {
            $assetsAlreadyCurrent++;
            continue;
        }
        if (isset($accountLinkedAssets[$resourceName])) { $assetsSkippedAccount++; continue; }
        if (isset($sharedOutsideBatch[$resourceName])) { $assetsSkippedShared++; continue; }
        $expectedAssets[$resourceName] = ['final_urls' => $nextUrls, 'final_mobile_urls' => $nextMobileUrls];
        $mutateOperations[] = ['assetOperation' => ['update' => $update, 'updateMask' => implode(',', $mask)]];
    }
    if (count($mutateOperations) > 1000) throw new HubGoogleAdsApiException('campaign_destination_url_resource_limit', 422);
    if ($mutateOperations) {
        $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $accessToken,
            json_encode(['mutateOperations' => $mutateOperations, 'partialFailure' => false], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        $results = $response['mutateOperationResponses'] ?? null;
        if (!is_array($results) || count($results) !== count($mutateOperations)) {
            throw new HubGoogleAdsApiException('campaign_destination_url_update_rejected', 502);
        }
    }

    $verifiedAdRows = $adRows;
    $verifiedCriterionRows = $criterionRows;
    $verifiedAssetRows = array_merge($campaignAssetRows, $groupAssetRows);
    if ($mutateOperations) {
        $verifiedAdRows = hub_google_ads_search($customerId,
            "SELECT campaign.id, ad_group_ad.status, ad_group_ad.ad.resource_name, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls FROM ad_group_ad WHERE campaign.id = $campaignId AND ad_group_ad.status != 'REMOVED' LIMIT 501",
            $accessToken, $managerId);
        $verifiedCriterionRows = hub_google_ads_search($customerId,
            "SELECT campaign.id, ad_group_criterion.resource_name, ad_group_criterion.type, ad_group_criterion.status, ad_group_criterion.final_urls, ad_group_criterion.final_mobile_urls FROM ad_group_criterion WHERE campaign.id = $campaignId AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' LIMIT 2001",
            $accessToken, $managerId);
        $verifiedAssetRows = array_merge(
            hub_google_ads_search($customerId,
                "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.asset, campaign_asset.field_type, campaign_asset.status, asset.resource_name, asset.final_urls, asset.final_mobile_urls FROM campaign_asset WHERE campaign.id = $campaignId AND campaign_asset.status != 'REMOVED' LIMIT 301",
                $accessToken, $managerId),
            hub_google_ads_search($customerId,
                "SELECT campaign.id, ad_group_asset.resource_name, ad_group_asset.asset, ad_group_asset.field_type, ad_group_asset.status, asset.resource_name, asset.final_urls, asset.final_mobile_urls FROM ad_group_asset WHERE campaign.id = $campaignId AND ad_group_asset.status != 'REMOVED' LIMIT 301",
                $accessToken, $managerId)
        );
    }
    $verifiedAds = [];
    foreach ($verifiedAdRows as $row) {
        $ad = $row['adGroupAd']['ad'] ?? null;
        if (is_array($ad)) $verifiedAds[(string)($ad['resourceName'] ?? '')] = $ad;
    }
    foreach ($expectedAds as $resource => $expected) {
        $current = $verifiedAds[$resource] ?? null;
        if (!is_array($current) || ($current['finalUrls'] ?? []) !== $expected['final_urls']
            || (($expected['final_mobile_urls'] ?? []) && ($current['finalMobileUrls'] ?? []) !== $expected['final_mobile_urls'])) {
            throw new HubGoogleAdsApiException('campaign_destination_url_update_unverified', 502);
        }
    }
    $verifiedCriteria = [];
    foreach ($verifiedCriterionRows as $row) {
        $criterion = $row['adGroupCriterion'] ?? null;
        if (is_array($criterion)) $verifiedCriteria[(string)($criterion['resourceName'] ?? '')] = $criterion;
    }
    foreach ($expectedCriteria as $resource => $expected) {
        $current = $verifiedCriteria[$resource] ?? null;
        if (!is_array($current) || ($current['finalUrls'] ?? []) !== $expected['final_urls']
            || (($expected['final_mobile_urls'] ?? []) && ($current['finalMobileUrls'] ?? []) !== $expected['final_mobile_urls'])) {
            throw new HubGoogleAdsApiException('campaign_destination_url_update_unverified', 502);
        }
    }
    $verifiedAssets = [];
    foreach ($verifiedAssetRows as $row) {
        $asset = $row['asset'] ?? null;
        if (is_array($asset)) $verifiedAssets[(string)($asset['resourceName'] ?? '')] = $asset;
    }
    foreach ($expectedAssets as $resource => $expected) {
        $current = $verifiedAssets[$resource] ?? null;
        if (!is_array($current) || ($current['finalUrls'] ?? []) !== $expected['final_urls']
            || (($expected['final_mobile_urls'] ?? []) && ($current['finalMobileUrls'] ?? []) !== $expected['final_mobile_urls'])) {
            throw new HubGoogleAdsApiException('campaign_destination_url_update_unverified', 502);
        }
    }
    $changedAds = count($mutateOperations) - count($expectedCriteria) - count($expectedAssets);
    $changedCriteria = count($expectedCriteria);
    $changedAssets = count($expectedAssets);
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_campaign_destination_url',
        'campaign_id' => $campaignId,
        'campaign_name' => (string)($campaign['name'] ?? ''),
        'campaign_status' => (string)($campaign['status'] ?? ''),
        'final_url' => $finalUrl,
        'ads_updated' => $changedAds,
        'criteria_updated' => $changedCriteria,
        'assets_updated' => $changedAssets,
        'ads_already_current' => $adsAlreadyCurrent,
        'criteria_already_current' => $criteriaAlreadyCurrent,
        'assets_already_current' => $assetsAlreadyCurrent,
        'assets_skipped_shared' => $assetsSkippedShared,
        'assets_skipped_account_level' => $assetsSkippedAccount,
        'account_scoped_url_assets_not_changed' => $accountScopedUrlAssetCount,
        'verified' => true,
        'complete' => $assetsSkippedShared === 0 && $assetsSkippedAccount === 0 && $accountScopedUrlAssetCount === 0,
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

const HUB_GOOGLE_ADS_CAMPAIGN_IMAGE_UPLOAD_MAX_BODY_BYTES = 7500000;
const HUB_GOOGLE_ADS_CAMPAIGN_IMAGE_MAX_BYTES = 5242880;
const HUB_GOOGLE_ADS_CAMPAIGN_PREVIEW_PREPARE_MAX_BODY_BYTES = 262144;

function hub_google_ads_campaign_image_upload_parse_request(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
    if (!is_string($contentType) || preg_match('/^application\/json(?:\s*;|$)/i', trim($contentType)) !== 1) {
        throw new HubGoogleAdsApiException('invalid_payload', 415);
    }
    $length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length <= HUB_GOOGLE_ADS_MAX_BODY_BYTES) return hub_google_ads_parse_request();
    if ($length > HUB_GOOGLE_ADS_CAMPAIGN_IMAGE_UPLOAD_MAX_BODY_BYTES) {
        throw new HubGoogleAdsApiException('campaign_image_file_too_large', 413);
    }
    $body = file_get_contents('php://input', false, null, 0, HUB_GOOGLE_ADS_CAMPAIGN_IMAGE_UPLOAD_MAX_BODY_BYTES + 1);
    if (!is_string($body) || strlen($body) > HUB_GOOGLE_ADS_CAMPAIGN_IMAGE_UPLOAD_MAX_BODY_BYTES) {
        throw new HubGoogleAdsApiException('campaign_image_file_too_large', 413);
    }
    $payload = json_decode($body, true);
    if (!is_array($payload) || array_is_list($payload)) throw new HubGoogleAdsApiException('invalid_payload', 413);
    if (($payload['operation'] ?? null) === 'prepare_search_campaign_preview_contexts') {
        if (strlen($body) > HUB_GOOGLE_ADS_CAMPAIGN_PREVIEW_PREPARE_MAX_BODY_BYTES) {
            throw new HubGoogleAdsApiException('invalid_payload', 413);
        }
        return $payload;
    }
    if (($payload['operation'] ?? null) !== 'upload_campaign_image_asset') throw new HubGoogleAdsApiException('invalid_payload', 413);
    return $payload;
}

function hub_google_ads_campaign_image_upload_validate_payload(array $payload): array
{
    $expected = ['batch_campaign_ids', 'confirm', 'customer_id', 'file_name', 'image_base64', 'image_sha256', 'manager_customer_id', 'mime_type', 'operation'];
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    sort($expected, SORT_STRING);
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $rawCampaignIds = $payload['batch_campaign_ids'] ?? null;
    $fileName = $payload['file_name'] ?? null;
    $imageBase64 = $payload['image_base64'] ?? null;
    $imageHash = $payload['image_sha256'] ?? null;
    $mimeType = $payload['mime_type'] ?? null;
    if ($keys !== $expected || ($payload['operation'] ?? null) !== 'upload_campaign_image_asset'
        || ($payload['confirm'] ?? null) !== true || $managerId === null || $customerId === null
        || !is_array($rawCampaignIds) || !array_is_list($rawCampaignIds) || count($rawCampaignIds) < 1 || count($rawCampaignIds) > 100
        || !is_string($fileName) || trim($fileName) === '' || strlen($fileName) > 180
        || !is_string($imageBase64) || $imageBase64 === '' || strlen($imageBase64) > 6990508
        || !is_string($imageHash) || preg_match('/^[a-f0-9]{64}$/D', $imageHash) !== 1
        || !in_array($mimeType, ['image/jpeg', 'image/png'], true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $campaignIds = [];
    foreach ($rawCampaignIds as $rawId) {
        if (!is_string($rawId) || preg_match('/^[1-9][0-9]{0,19}$/D', $rawId) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $campaignIds[$rawId] = $rawId;
    }
    if (count($campaignIds) !== count($rawCampaignIds)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $bytes = base64_decode($imageBase64, true);
    if (!is_string($bytes) || $bytes === '' || strlen($bytes) > HUB_GOOGLE_ADS_CAMPAIGN_IMAGE_MAX_BYTES) {
        throw new HubGoogleAdsApiException('campaign_image_file_too_large', 422);
    }
    $imageInfo = @getimagesizefromstring($bytes);
    if (!is_array($imageInfo) || !is_string($imageInfo['mime'] ?? null) || $imageInfo['mime'] !== $mimeType) {
        throw new HubGoogleAdsApiException('campaign_image_format_invalid', 422);
    }
    $width = filter_var($imageInfo[0] ?? null, FILTER_VALIDATE_INT);
    $height = filter_var($imageInfo[1] ?? null, FILTER_VALIDATE_INT);
    if ($width === false || $height === false || $width < 1 || $height < 1
        || !(($width === $height && $width >= 300)
            || ($width >= 600 && $height >= 314 && abs(($width / $height) - 1.91) <= 0.03))) {
        throw new HubGoogleAdsApiException('campaign_image_dimensions_invalid', 422);
    }
    if (!hash_equals($imageHash, hash('sha256', $bytes))) {
        throw new HubGoogleAdsApiException('campaign_image_hash_mismatch', 422);
    }
    return [$managerId, $customerId, array_values($campaignIds), trim($fileName), $imageBase64, $imageHash, $mimeType];
}

function hub_google_ads_campaign_image_asset_upload(array $config, string $managerId, string $customerId, array $campaignIds, string $fileName, string $imageBase64, string $imageHash): array
{
    if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
        throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
    }
    $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
    hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);

    $campaignIdSql = implode(', ', $campaignIds);
    $campaignRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id IN ($campaignIdSql) LIMIT 101",
        $accessToken, $managerId);
    $verifiedCampaignIds = [];
    foreach ($campaignRows as $row) {
        $campaign = $row['campaign'] ?? null;
        $id = is_array($campaign) ? (string)($campaign['id'] ?? '') : '';
        if ($id === '' || !in_array($campaign['status'] ?? null, ['PAUSED', 'ENABLED'], true)
            || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
            throw new HubGoogleAdsApiException('campaign_image_upload_campaign_unavailable', 409);
        }
        $verifiedCampaignIds[$id] = true;
    }
    if (count($verifiedCampaignIds) !== count($campaignIds)) {
        throw new HubGoogleAdsApiException('campaign_image_upload_campaign_unavailable', 409);
    }

    $assetName = 'Hub Image ' . $imageHash;
    $assetNameSql = hub_google_ads_campaign_creation_gaql_string($assetName);
    $assetRows = hub_google_ads_search($customerId,
        "SELECT asset.resource_name, asset.name, asset.type FROM asset WHERE asset.name = $assetNameSql AND asset.type = 'IMAGE' LIMIT 3",
        $accessToken, $managerId);
    if (count($assetRows) > 1) throw new HubGoogleAdsApiException('campaign_image_asset_conflict', 409);
    $assetResourceName = '';
    if ($assetRows) {
        $asset = $assetRows[0]['asset'] ?? null;
        $assetResourceName = is_array($asset) ? (string)($asset['resourceName'] ?? '') : '';
        if ($assetResourceName === '' || ($asset['name'] ?? null) !== $assetName || ($asset['type'] ?? null) !== 'IMAGE') {
            throw new HubGoogleAdsApiException('campaign_image_asset_conflict', 409);
        }
    }

    $presentByCampaign = [];
    if ($assetResourceName !== '') {
        $assetSql = hub_google_ads_campaign_creation_gaql_string($assetResourceName);
        $linkedRows = hub_google_ads_search($customerId,
            "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.status, campaign_asset.field_type, campaign_asset.asset FROM campaign_asset WHERE campaign.id IN ($campaignIdSql) AND campaign_asset.asset = $assetSql AND campaign_asset.field_type = 'AD_IMAGE' LIMIT 101",
            $accessToken, $managerId);
        if (count($linkedRows) > 100) throw new HubGoogleAdsApiException('campaign_image_asset_conflict', 502);
        foreach ($linkedRows as $row) {
            $campaign = $row['campaign'] ?? null;
            $link = $row['campaignAsset'] ?? null;
            $id = is_array($campaign) ? (string)($campaign['id'] ?? '') : '';
            $resourceName = is_array($link) ? (string)($link['resourceName'] ?? '') : '';
            $status = is_array($link) ? (string)($link['status'] ?? '') : '';
            if (isset($verifiedCampaignIds[$id]) && $resourceName !== '' && in_array($status, ['ENABLED', 'PAUSED', 'REMOVED'], true)) {
                $presentByCampaign[$id] = ['resource_name' => $resourceName, 'status' => $status];
            }
        }
    }

    $temporaryAssetRef = 'customers/' . $customerId . '/assets/-1';
    $assetReference = $assetResourceName !== '' ? $assetResourceName : $temporaryAssetRef;
    $operations = [];
    $operationTypes = [];
    if ($assetResourceName === '') {
        $operations[] = ['assetOperation' => ['create' => [
            'resourceName' => $temporaryAssetRef,
            'name' => $assetName,
            'type' => 'IMAGE',
            'imageAsset' => ['data' => $imageBase64],
        ]]];
        $operationTypes[] = 'asset';
    }
    $alreadyPresentCount = 0;
    $reactivatedCount = 0;
    $newLinksCount = 0;
    foreach ($campaignIds as $campaignId) {
        $existing = $presentByCampaign[$campaignId] ?? null;
        if (is_array($existing) && $existing['status'] === 'ENABLED') {
            $alreadyPresentCount++;
            continue;
        }
        if (is_array($existing)) {
            $operations[] = ['campaignAssetOperation' => [
                'update' => ['resourceName' => $existing['resource_name'], 'status' => 'ENABLED'],
                'updateMask' => 'status',
            ]];
            $operationTypes[] = 'campaign_asset';
            $reactivatedCount++;
            continue;
        }
        $operations[] = ['campaignAssetOperation' => ['create' => [
            'campaign' => 'customers/' . $customerId . '/campaigns/' . $campaignId,
            'asset' => $assetReference,
            'fieldType' => 'AD_IMAGE',
            'status' => 'ENABLED',
        ]]];
        $operationTypes[] = 'campaign_asset';
        $newLinksCount++;
    }

    if ($operations) {
        $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $accessToken,
            json_encode(['mutateOperations' => $operations, 'partialFailure' => false], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
        $results = $response['mutateOperationResponses'] ?? null;
        if (!is_array($results) || count($results) !== count($operations)) {
            throw new HubGoogleAdsApiException('campaign_image_upload_unverified', 502);
        }
        foreach ($results as $index => $result) {
            $resultType = $operationTypes[$index] ?? '';
            $resultKey = $resultType === 'asset' ? 'assetResult' : 'campaignAssetResult';
            $expectedPrefix = 'customers/' . $customerId . '/' . ($resultType === 'asset' ? 'assets/' : 'campaignAssets/');
            $resourceName = $result[$resultKey]['resourceName'] ?? null;
            if (!is_string($resourceName) || !str_starts_with($resourceName, $expectedPrefix)) {
                throw new HubGoogleAdsApiException('campaign_image_upload_unverified', 502);
            }
            if ($resultType === 'asset') $assetResourceName = $resourceName;
        }
    }
    if ($assetResourceName === '') throw new HubGoogleAdsApiException('campaign_image_upload_unverified', 502);

    $assetSql = hub_google_ads_campaign_creation_gaql_string($assetResourceName);
    $verifiedRows = hub_google_ads_search($customerId,
        "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.status, campaign_asset.field_type, campaign_asset.asset FROM campaign_asset WHERE campaign.id IN ($campaignIdSql) AND campaign_asset.asset = $assetSql AND campaign_asset.field_type = 'AD_IMAGE' LIMIT 101",
        $accessToken, $managerId);
    $verifiedActive = [];
    foreach ($verifiedRows as $row) {
        $campaign = $row['campaign'] ?? null;
        $link = $row['campaignAsset'] ?? null;
        $id = is_array($campaign) ? (string)($campaign['id'] ?? '') : '';
        if (isset($verifiedCampaignIds[$id]) && is_array($link) && ($link['status'] ?? null) === 'ENABLED'
            && ($link['fieldType'] ?? null) === 'AD_IMAGE' && ($link['asset'] ?? null) === $assetResourceName) {
            $verifiedActive[$id] = true;
        }
    }
    if (count($verifiedActive) !== count($campaignIds)) {
        throw new HubGoogleAdsApiException('campaign_image_upload_unverified', 502);
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'upload_campaign_image_asset',
        'customer_id' => $customerId,
        'image_sha256' => $imageHash,
        'file_name' => $fileName,
        'campaign_count' => count($campaignIds),
        'linked_count' => $newLinksCount + $reactivatedCount,
        'already_present_count' => $alreadyPresentCount,
        'reactivated_count' => $reactivatedCount,
        'asset_reused' => $assetRows !== [],
        'verified' => true,
        'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

function hub_google_ads_campaign_action_json(int $status, array $body): never
{
    hub_google_ads_expose_response_headers();
    hub_google_ads_publish_quota_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** Return only fixed, non-sensitive PHP failure metadata for troubleshooting. */
function hub_google_ads_campaign_action_safe_failure(Throwable $error): array
{
    $type = $error instanceof TypeError ? 'TypeError' : ($error instanceof Error ? 'Error' : 'Exception');
    $file = basename($error->getFile());
    if (!preg_match('/^google-ads-[a-z0-9-]+\.php$/D', $file)) $file = 'outro-arquivo';
    $result = ['type' => $type, 'file' => $file, 'line' => max(0, $error->getLine())];
    if (preg_match('/^Call to undefined function (hub_google_ads_[a-z0-9_]+)\(\)$/D', $error->getMessage(), $match)) {
        $result['missing_function'] = $match[1];
    }
    return $result;
}

function hub_google_ads_campaign_negative_keywords_enabled(array $config): bool
{
    return hub_google_ads_campaign_actions_enabled($config)
        && ($config['tracking_google_ads_negative_keywords_enabled'] ?? false) === true;
}

function hub_google_ads_campaign_batch_negative_keywords_enabled(array $config): bool
{
    return hub_google_ads_campaign_negative_keywords_enabled($config)
        && ($config['tracking_google_ads_campaign_batch_negative_keywords_enabled'] ?? false) === true;
}

function hub_google_ads_negative_keyword_product_from_name(string $name): ?string
{
    $pattern = '/^(\d{1,2}\/\d{1,2})\s*-\s*(.+?)\s+\d{1,3}\s+\([^)]+\)\s+\d{1,3}(?:[.,]\d+)?%\s*-\s*(?:US\$|U\$|USD|R\$|BRL|C\$|CAD|A\$|AUD|€|EUR|£|GBP)\s*\d+(?:[.,]\d+)?$/iuD';
    if (preg_match($pattern, trim($name), $match) !== 1) return null;
    $product = trim(preg_replace('/\s+/u', ' ', $match[2]) ?? '');
    return $product !== '' ? $product : null;
}

function hub_google_ads_negative_keyword_normalize_text(string $value): string
{
    $normalized = preg_replace('/\s+/u', ' ', trim($value)) ?? '';
    return function_exists('mb_strtolower') ? mb_strtolower($normalized, 'UTF-8') : strtolower($normalized);
}

function hub_google_ads_negative_keyword_character_count(string $value): int
{
    if (preg_match_all('/./us', $value, $characters) === false) return PHP_INT_MAX;
    return count($characters[0]);
}

function hub_google_ads_negative_keyword_validate_payload(array $payload, string $operation): array
{
    $expected = ['manager_customer_id', 'source_customer_id', 'source_campaign_id', 'source_campaign_name', 'term', 'match_type', 'scope', 'operation'];
    if ($operation === 'apply_product_negative_keyword') $expected = [...$expected, 'expected_campaigns', 'confirm'];
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    sort($expected, SORT_STRING);
    if ($keys !== $expected || ($operation === 'apply_product_negative_keyword' && ($payload['confirm'] ?? null) !== true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $sourceCustomerId = hub_google_ads_valid_customer_id($payload['source_customer_id'] ?? null);
    $sourceCampaignId = $payload['source_campaign_id'] ?? null;
    $sourceCampaignName = $payload['source_campaign_name'] ?? null;
    $term = $payload['term'] ?? null;
    $matchType = $payload['match_type'] ?? null;
    $scope = $payload['scope'] ?? null;
    if ($managerId === null || $sourceCustomerId === null
        || !is_string($sourceCampaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $sourceCampaignId) !== 1
        || !is_string($sourceCampaignName) || trim($sourceCampaignName) !== $sourceCampaignName || $sourceCampaignName === '' || strlen($sourceCampaignName) > 255
        || !is_string($term) || trim($term) !== $term || $term === '' || hub_google_ads_negative_keyword_character_count($term) > 80
        || preg_match('/[\x00-\x1F\x7F]/', $term) === 1 || count(preg_split('/\s+/u', trim($term), -1, PREG_SPLIT_NO_EMPTY) ?: []) > 10
        || !in_array($matchType, ['BROAD', 'PHRASE', 'EXACT'], true)
        || !in_array($scope, ['SOURCE_CAMPAIGN', 'PRODUCT'], true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $product = hub_google_ads_negative_keyword_product_from_name($sourceCampaignName);
    if ($product === null) throw new HubGoogleAdsApiException('negative_keyword_source_unavailable', 422);
    return [$managerId, $sourceCustomerId, $sourceCampaignId, $sourceCampaignName, $product, $term, $matchType, $scope];
}

/** Read only active Search campaigns for either the source campaign or product scope; fail closed on incomplete scans. */
function hub_google_ads_product_negative_keyword_scan(string $accessToken, string $managerId, string $sourceCustomerId, string $sourceCampaignId, string $sourceCampaignName, string $product, string $term, string $matchType, string $scope): array
{
    $targetCampaigns = [];
    if ($scope === 'SOURCE_CAMPAIGN') {
        $campaignRows = hub_google_ads_search($sourceCustomerId,
            "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.id = {$sourceCampaignId} AND campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH' LIMIT 2",
            $accessToken, $managerId);
        if (count($campaignRows) !== 1 || !is_array($campaignRows[0]['campaign'] ?? null)) {
            throw new HubGoogleAdsApiException('negative_keyword_source_unavailable', 409);
        }
        $campaign = $campaignRows[0]['campaign'];
        $campaignName = $campaign['name'] ?? null;
        $campaignStatus = $campaign['status'] ?? null;
        $campaignProduct = is_string($campaignName) ? hub_google_ads_negative_keyword_product_from_name($campaignName) : null;
        if ((string)($campaign['id'] ?? '') !== $sourceCampaignId || $campaignName !== $sourceCampaignName
            || $campaignStatus !== 'ENABLED'
            || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH'
            || $campaignProduct === null || hub_google_ads_negative_keyword_normalize_text($campaignProduct) !== hub_google_ads_negative_keyword_normalize_text($product)) {
            throw new HubGoogleAdsApiException('negative_keyword_source_unavailable', 409);
        }
        $targetCampaigns[] = [
            'customer_id' => $sourceCustomerId,
            'campaign_id' => $sourceCampaignId,
            'campaign_name' => $campaignName,
            'status' => $campaignStatus,
            'already_present' => false,
        ];
    } elseif ($scope === 'PRODUCT') {
        $childRows = hub_google_ads_search($managerId,
            "SELECT customer_client.id, customer_client.level, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.level > 0 AND customer_client.manager = FALSE AND customer_client.status = 'ENABLED' LIMIT 1001",
            $accessToken, $managerId);
        if (count($childRows) > 1000) throw new HubGoogleAdsApiException('negative_keyword_targets_too_many', 422);
        $children = [];
        foreach ($childRows as $row) {
            $client = $row['customerClient'] ?? null;
            if (!is_array($client)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $customerId = hub_google_ads_valid_customer_id((string)($client['id'] ?? ''));
            if ($customerId === null || (int)($client['level'] ?? 0) < 1 || ($client['manager'] ?? null) !== false || ($client['status'] ?? null) !== 'ENABLED') {
                throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            }
            $children[$customerId] = $customerId;
        }
        if (!isset($children[$sourceCustomerId])) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
        foreach (array_values($children) as $customerId) {
            $campaignRows = hub_google_ads_search($customerId,
                "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH' LIMIT 1001",
                $accessToken, $managerId);
            if (count($campaignRows) > 1000) throw new HubGoogleAdsApiException('negative_keyword_targets_too_many', 422);
            foreach ($campaignRows as $campaignRow) {
                $campaign = $campaignRow['campaign'] ?? null;
                if (!is_array($campaign)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                $campaignId = (string)($campaign['id'] ?? '');
                $campaignName = $campaign['name'] ?? null;
                $status = $campaign['status'] ?? null;
                if (preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1 || !is_string($campaignName)
                    || $status !== 'ENABLED' || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') continue;
                $campaignProduct = hub_google_ads_negative_keyword_product_from_name($campaignName);
                if ($campaignProduct === null || hub_google_ads_negative_keyword_normalize_text($campaignProduct) !== hub_google_ads_negative_keyword_normalize_text($product)) continue;
                $targetCampaigns[] = [
                    'customer_id' => $customerId,
                    'campaign_id' => $campaignId,
                    'campaign_name' => $campaignName,
                    'status' => $status,
                    'already_present' => false,
                ];
            }
        }
    } else {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if (count($targetCampaigns) > 100) throw new HubGoogleAdsApiException('negative_keyword_targets_too_many', 422);
    $sourceFound = false;
    foreach ($targetCampaigns as $campaign) {
        if ($campaign['customer_id'] === $sourceCustomerId && $campaign['campaign_id'] === $sourceCampaignId
            && $campaign['campaign_name'] === $sourceCampaignName) $sourceFound = true;
    }
    if (($scope === 'SOURCE_CAMPAIGN' && !$sourceFound) || !$targetCampaigns) throw new HubGoogleAdsApiException('negative_keyword_source_unavailable', 409);

    $criteriaByAccount = [];
    foreach (array_unique(array_column($targetCampaigns, 'customer_id')) as $customerId) {
        $criterionRows = hub_google_ads_search($customerId,
            "SELECT campaign_criterion.campaign, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type, campaign_criterion.negative, campaign_criterion.status FROM campaign_criterion WHERE campaign_criterion.type = 'KEYWORD' AND campaign_criterion.status != 'REMOVED' AND campaign_criterion.negative = TRUE LIMIT 10001",
            $accessToken, $managerId);
        if (count($criterionRows) > 10000) throw new HubGoogleAdsApiException('negative_keyword_targets_too_many', 422);
        foreach ($criterionRows as $criterionRow) {
            $criterion = $criterionRow['campaignCriterion'] ?? null;
            if (!is_array($criterion) || ($criterion['negative'] ?? null) !== true) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
            $resource = (string)($criterion['campaign'] ?? '');
            if (preg_match('#^customers/([1-9][0-9]{9})/campaigns/([1-9][0-9]{0,19})$#D', $resource, $resourceMatch) !== 1) continue;
            $criteriaByAccount[$resourceMatch[1]][$resourceMatch[2]][] = [
                'text' => (string)($criterion['keyword']['text'] ?? ''),
                'match_type' => (string)($criterion['keyword']['matchType'] ?? ''),
            ];
        }
    }
    $normalizedTerm = hub_google_ads_negative_keyword_normalize_text($term);
    foreach ($targetCampaigns as &$campaign) {
        foreach (($criteriaByAccount[$campaign['customer_id']][$campaign['campaign_id']] ?? []) as $criterion) {
            if ($criterion['match_type'] === $matchType && hub_google_ads_negative_keyword_normalize_text($criterion['text']) === $normalizedTerm) {
                $campaign['already_present'] = true;
                break;
            }
        }
    }
    unset($campaign);
    usort($targetCampaigns, static fn(array $left, array $right): int => [$left['customer_id'], $left['campaign_name'], $left['campaign_id']] <=> [$right['customer_id'], $right['campaign_name'], $right['campaign_id']]);
    return $targetCampaigns;
}

function hub_google_ads_product_negative_keyword_preview(array $config, array $payload): array
{
    [$managerId, $sourceCustomerId, $sourceCampaignId, $sourceCampaignName, $product, $term, $matchType, $scope] = hub_google_ads_negative_keyword_validate_payload($payload, 'preview_product_negative_keyword');
    if (!hub_google_ads_campaign_negative_keywords_enabled($config)) throw new HubGoogleAdsApiException('negative_keywords_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    if (!hub_google_ads_campaign_customer_is_active_child($token, $managerId, $sourceCustomerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $campaigns = hub_google_ads_product_negative_keyword_scan($token, $managerId, $sourceCustomerId, $sourceCampaignId, $sourceCampaignName, $product, $term, $matchType, $scope);
    $alreadyPresent = count(array_filter($campaigns, static fn(array $campaign): bool => $campaign['already_present']));
    return [
        'ok' => true,
        'schema_version' => 2,
        'operation' => 'preview_product_negative_keyword',
        'product' => $product,
        'term' => $term,
        'match_type' => $matchType,
        'scope' => $scope,
        'campaign_count' => count($campaigns),
        'to_create_count' => count($campaigns) - $alreadyPresent,
        'already_present_count' => $alreadyPresent,
        'campaigns' => $campaigns,
        'previewed_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

function hub_google_ads_product_negative_keyword_apply(array $config, array $payload): array
{
    [$managerId, $sourceCustomerId, $sourceCampaignId, $sourceCampaignName, $product, $term, $matchType, $scope] = hub_google_ads_negative_keyword_validate_payload($payload, 'apply_product_negative_keyword');
    if (!hub_google_ads_campaign_negative_keywords_enabled($config)) throw new HubGoogleAdsApiException('negative_keywords_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $expected = $payload['expected_campaigns'] ?? null;
    if (!is_array($expected) || !$expected || count($expected) > 100) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $expectedNormalized = [];
    foreach ($expected as $campaign) {
        $campaignKeys = is_array($campaign) ? array_keys($campaign) : [];
        $allowedCampaignKeys = ['customer_id', 'campaign_id', 'campaign_name', 'status', 'already_present'];
        sort($campaignKeys, SORT_STRING);
        sort($allowedCampaignKeys, SORT_STRING);
        if (!is_array($campaign) || $campaignKeys !== $allowedCampaignKeys
            || !is_bool($campaign['already_present'] ?? null)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $customerId = hub_google_ads_valid_customer_id($campaign['customer_id'] ?? null);
        $campaignId = $campaign['campaign_id'] ?? null;
        $campaignName = $campaign['campaign_name'] ?? null;
        $status = $campaign['status'] ?? null;
        if ($customerId === null || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
            || !is_string($campaignName) || trim($campaignName) !== $campaignName || $campaignName === '' || strlen($campaignName) > 255
            || $status !== 'ENABLED') throw new HubGoogleAdsApiException('invalid_payload', 400);
        $expectedNormalized[] = ['customer_id' => $customerId, 'campaign_id' => $campaignId, 'campaign_name' => $campaignName, 'status' => $status, 'already_present' => $campaign['already_present']];
    }
    usort($expectedNormalized, static fn(array $left, array $right): int => [$left['customer_id'], $left['campaign_name'], $left['campaign_id']] <=> [$right['customer_id'], $right['campaign_name'], $right['campaign_id']]);
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    if (!hub_google_ads_campaign_customer_is_active_child($token, $managerId, $sourceCustomerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $fresh = hub_google_ads_product_negative_keyword_scan($token, $managerId, $sourceCustomerId, $sourceCampaignId, $sourceCampaignName, $product, $term, $matchType, $scope);
    if ($expectedNormalized !== $fresh) throw new HubGoogleAdsApiException('negative_keyword_preview_changed', 409);

    $results = [];
    $toCreateByCustomer = [];
    foreach ($fresh as $campaign) {
        $key = $campaign['customer_id'] . '|' . $campaign['campaign_id'];
        $results[$key] = [
            'customer_id' => $campaign['customer_id'], 'campaign_id' => $campaign['campaign_id'],
            'campaign_name' => $campaign['campaign_name'], 'status' => $campaign['status'],
            'result' => $campaign['already_present'] ? 'already_present' : 'pending',
        ];
        if (!$campaign['already_present']) $toCreateByCustomer[$campaign['customer_id']][] = $campaign;
    }
    foreach ($toCreateByCustomer as $customerId => $campaigns) {
        $operations = [];
        foreach ($campaigns as $campaign) {
            $operations[] = ['campaignCriterionOperation' => ['create' => [
                'campaign' => 'customers/' . $customerId . '/campaigns/' . $campaign['campaign_id'],
                'negative' => true,
                'keyword' => ['text' => $term, 'matchType' => $matchType],
            ]]];
        }
        $acceptedIds = [];
        $writeResponseUncertain = false;
        try {
            $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $token,
                json_encode(['mutateOperations' => $operations], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
            $mutations = $response['mutateOperationResponses'] ?? null;
            if (!is_array($mutations) || count($mutations) !== count($campaigns)) throw new HubGoogleAdsApiException('negative_keyword_apply_unverified', 502);
            foreach ($campaigns as $index => $campaign) {
                if (!is_string($mutations[$index]['campaignCriterionResult']['resourceName'] ?? null)
                    || $mutations[$index]['campaignCriterionResult']['resourceName'] === '') {
                    $writeResponseUncertain = true;
                    continue;
                }
                $acceptedIds[$campaign['campaign_id']] = true;
            }
        } catch (Throwable $error) {
            // Continue with a read-back to classify outcomes; never retry a write whose response was uncertain.
            $writeResponseUncertain = true;
        }
        try {
            $criterionRows = hub_google_ads_search($customerId,
                "SELECT campaign_criterion.campaign, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type, campaign_criterion.negative, campaign_criterion.status FROM campaign_criterion WHERE campaign_criterion.type = 'KEYWORD' AND campaign_criterion.status != 'REMOVED' AND campaign_criterion.negative = TRUE LIMIT 10001",
                $token, $managerId);
            if (count($criterionRows) > 10000) throw new HubGoogleAdsApiException('negative_keyword_apply_unverified', 502);
            $verifiedCampaignIds = [];
            foreach ($criterionRows as $criterionRow) {
                $criterion = $criterionRow['campaignCriterion'] ?? null;
                if (!is_array($criterion) || ($criterion['negative'] ?? null) !== true) continue;
                $resource = (string)($criterion['campaign'] ?? '');
                if (preg_match('#^customers/' . preg_quote((string)$customerId, '#') . '/campaigns/([1-9][0-9]{0,19})$#D', $resource, $resourceMatch) !== 1) continue;
                if (($criterion['keyword']['matchType'] ?? null) === $matchType
                    && hub_google_ads_negative_keyword_normalize_text((string)($criterion['keyword']['text'] ?? '')) === hub_google_ads_negative_keyword_normalize_text($term)) {
                    $verifiedCampaignIds[$resourceMatch[1]] = true;
                }
            }
            foreach ($campaigns as $campaign) {
                $key = $customerId . '|' . $campaign['campaign_id'];
                if (!isset($verifiedCampaignIds[$campaign['campaign_id']])) {
                    // A success response followed by a missing read-back is still ambiguous; do not invite a blind retry.
                    $results[$key]['result'] = ($writeResponseUncertain || isset($acceptedIds[$campaign['campaign_id']])) ? 'write_unverified' : 'failed';
                } elseif (isset($acceptedIds[$campaign['campaign_id']])) {
                    $results[$key]['result'] = 'created_verified';
                } else {
                    // The initial scan found no matching negative; read-back now confirms the desired state.
                    $results[$key]['result'] = 'created_verified';
                }
            }
        } catch (Throwable $error) {
            foreach ($campaigns as $campaign) $results[$customerId . '|' . $campaign['campaign_id']]['result'] = 'write_unverified';
        }
    }
    $orderedResults = array_values($results);
    $createdCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'created_verified'));
    $alreadyPresentCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'already_present'));
    $unverifiedCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'write_unverified'));
    $failedCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'failed'));
    $complete = $unverifiedCount === 0 && $failedCount === 0;
    return [
        'ok' => true,
        'schema_version' => 2,
        'operation' => 'apply_product_negative_keyword',
        'product' => $product,
        'term' => $term,
        'match_type' => $matchType,
        'scope' => $scope,
        'campaign_count' => count($fresh),
        'created_count' => $createdCount,
        'already_present_count' => $alreadyPresentCount,
        'unverified_count' => $unverifiedCount,
        'failed_count' => $failedCount,
        'complete' => $complete,
        'verified' => $complete,
        'results' => $orderedResults,
        'verified_at_utc' => $complete ? gmdate('Y-m-d\TH:i:s\Z') : '',
    ];
}

function hub_google_ads_batch_negative_keywords_validate_payload(array $payload, string $operation): array
{
    $expected = ['manager_customer_id', 'campaigns', 'terms', 'operation'];
    if ($operation === 'apply_batch_negative_keywords') $expected = [...$expected, 'fingerprint', 'confirm'];
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    sort($expected, SORT_STRING);
    if ($keys !== $expected || ($operation === 'apply_batch_negative_keywords' && ($payload['confirm'] ?? null) !== true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $campaigns = $payload['campaigns'] ?? null;
    $terms = $payload['terms'] ?? null;
    if ($managerId === null || !is_array($campaigns) || !$campaigns || count($campaigns) > 100
        || !is_array($terms) || !$terms || count($terms) > 100) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $normalizedCampaigns = [];
    $campaignKeys = [];
    foreach ($campaigns as $campaign) {
        $campaignKeysInPayload = is_array($campaign) ? array_keys($campaign) : [];
        sort($campaignKeysInPayload, SORT_STRING);
        if ($campaignKeysInPayload !== ['campaign_id', 'campaign_name', 'customer_id', 'status']) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $customerId = hub_google_ads_valid_customer_id($campaign['customer_id'] ?? null);
        $campaignId = $campaign['campaign_id'] ?? null;
        $campaignName = $campaign['campaign_name'] ?? null;
        $status = $campaign['status'] ?? null;
        if ($customerId === null || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
            || !is_string($campaignName) || trim($campaignName) !== $campaignName || $campaignName === ''
            || strlen($campaignName) > 255 || !in_array($status, ['ENABLED', 'PAUSED'], true)) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $key = $customerId . '|' . $campaignId;
        if (isset($campaignKeys[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $campaignKeys[$key] = true;
        $normalizedCampaigns[] = [
            'customer_id' => $customerId,
            'campaign_id' => $campaignId,
            'campaign_name' => $campaignName,
            'status' => $status,
        ];
    }
    usort($normalizedCampaigns, static fn(array $left, array $right): int =>
        [$left['customer_id'], $left['campaign_id']] <=> [$right['customer_id'], $right['campaign_id']]);

    $normalizedTerms = [];
    $termKeys = [];
    foreach ($terms as $term) {
        $termKeysInPayload = is_array($term) ? array_keys($term) : [];
        sort($termKeysInPayload, SORT_STRING);
        if ($termKeysInPayload !== ['match_type', 'text']) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $text = $term['text'] ?? null;
        $matchType = $term['match_type'] ?? null;
        if (!is_string($text) || trim($text) !== $text || $text === ''
            || hub_google_ads_negative_keyword_character_count($text) > 80
            || preg_match('/[\x00-\x1F\x7F]/', $text) === 1
            || count(preg_split('/\s+/u', trim($text), -1, PREG_SPLIT_NO_EMPTY) ?: []) > 10
            || !in_array($matchType, ['BROAD', 'PHRASE', 'EXACT'], true)) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $key = $matchType . '|' . hub_google_ads_negative_keyword_normalize_text($text);
        if (isset($termKeys[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $termKeys[$key] = true;
        $normalizedTerms[] = ['text' => $text, 'match_type' => $matchType];
    }
    if (count($normalizedCampaigns) * count($normalizedTerms) > 10000) {
        throw new HubGoogleAdsApiException('negative_keyword_batch_too_large', 422);
    }
    $fingerprint = $payload['fingerprint'] ?? '';
    if ($operation === 'apply_batch_negative_keywords'
        && (!is_string($fingerprint) || preg_match('/^[a-f0-9]{64}$/D', $fingerprint) !== 1)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $normalizedCampaigns, $normalizedTerms, $fingerprint];
}

function hub_google_ads_batch_negative_keywords_gaql_string(string $value): string
{
    return '"' . str_replace(["\\", '"'], ["\\\\", '\\"'], $value) . '"';
}

/** Read only the supplied batch campaigns and requested terms. */
function hub_google_ads_batch_negative_keywords_read_pairs(
    string $accessToken,
    string $managerId,
    string $customerId,
    array $campaigns,
    array $terms
): array {
    $campaignResources = array_map(
        static fn(array $campaign): string => '"customers/' . $customerId . '/campaigns/' . $campaign['campaign_id'] . '"',
        $campaigns
    );
    $termTexts = array_values(array_unique(array_column($terms, 'text')));
    $matchTypes = array_values(array_unique(array_column($terms, 'match_type')));
    $textList = array_map('hub_google_ads_batch_negative_keywords_gaql_string', $termTexts);
    $query = "SELECT campaign_criterion.campaign, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type "
        . "FROM campaign_criterion WHERE campaign_criterion.type = 'KEYWORD' "
        . "AND campaign_criterion.status != 'REMOVED' AND campaign_criterion.negative = TRUE "
        . 'AND campaign_criterion.campaign IN (' . implode(', ', $campaignResources) . ') '
        . 'AND campaign_criterion.keyword.text IN (' . implode(', ', $textList) . ') '
        . 'AND campaign_criterion.keyword.match_type IN (' . implode(', ', $matchTypes) . ') LIMIT 10001';
    $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    if (count($rows) > 10000) throw new HubGoogleAdsApiException('negative_keyword_batch_scan_incomplete', 502);
    $campaignIds = array_fill_keys(array_column($campaigns, 'campaign_id'), true);
    $termMap = [];
    foreach ($terms as $term) {
        $termMap[$term['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($term['text'])] = $term['text'];
    }
    $present = [];
    foreach ($rows as $row) {
        $criterion = $row['campaignCriterion'] ?? null;
        if (!is_array($criterion)) throw new HubGoogleAdsApiException('negative_keyword_batch_scan_incomplete', 502);
        $resource = (string)($criterion['campaign'] ?? '');
        if (preg_match('#^customers/' . preg_quote($customerId, '#') . '/campaigns/([1-9][0-9]{0,19})$#D', $resource, $match) !== 1
            || !isset($campaignIds[$match[1]])) continue;
        $matchType = (string)($criterion['keyword']['matchType'] ?? '');
        $normalizedText = hub_google_ads_negative_keyword_normalize_text((string)($criterion['keyword']['text'] ?? ''));
        $termKey = $matchType . '|' . $normalizedText;
        if (!isset($termMap[$termKey])) continue;
        $present[$customerId . '|' . $match[1] . '|' . $termKey] = true;
    }
    return $present;
}

/** Validate and fingerprint the exact campaigns and term×campaign states from one saved Hub batch. */
function hub_google_ads_batch_negative_keywords_scan(
    string $accessToken,
    string $managerId,
    array $campaigns,
    array $terms
): array {
    $campaignsByCustomer = [];
    foreach ($campaigns as $campaign) $campaignsByCustomer[$campaign['customer_id']][] = $campaign;
    $verifiedCampaigns = [];
    foreach ($campaignsByCustomer as $customerId => $expectedCampaigns) {
        if (!hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId)) {
            throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
        }
        $ids = array_map(static fn(array $campaign): string => $campaign['campaign_id'], $expectedCampaigns);
        $query = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type '
            . 'FROM campaign WHERE campaign.id IN (' . implode(', ', $ids) . ") AND campaign.status != 'REMOVED' "
            . "AND campaign.advertising_channel_type = 'SEARCH' LIMIT " . (count($expectedCampaigns) + 1);
        $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
        if (count($rows) !== count($expectedCampaigns)) {
            throw new HubGoogleAdsApiException('negative_keyword_batch_campaign_changed', 409);
        }
        $found = [];
        foreach ($rows as $row) {
            $campaign = $row['campaign'] ?? null;
            if (!is_array($campaign)) throw new HubGoogleAdsApiException('negative_keyword_batch_scan_incomplete', 502);
            $id = (string)($campaign['id'] ?? '');
            $found[$id] = $campaign;
        }
        foreach ($expectedCampaigns as $expected) {
            $campaign = $found[$expected['campaign_id']] ?? null;
            if (!is_array($campaign) || (string)($campaign['id'] ?? '') !== $expected['campaign_id']
                || ($campaign['name'] ?? null) !== $expected['campaign_name']
                || ($campaign['status'] ?? null) !== $expected['status']
                || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
                throw new HubGoogleAdsApiException('negative_keyword_batch_campaign_changed', 409);
            }
            $verifiedCampaigns[] = $expected;
        }
    }
    usort($verifiedCampaigns, static fn(array $left, array $right): int =>
        [$left['customer_id'], $left['campaign_id']] <=> [$right['customer_id'], $right['campaign_id']]);

    $presentByPair = [];
    foreach ($campaignsByCustomer as $customerId => $accountCampaigns) {
        $presentByPair += hub_google_ads_batch_negative_keywords_read_pairs($accessToken, $managerId, $customerId, $accountCampaigns, $terms);
    }
    $pairs = [];
    foreach ($verifiedCampaigns as $campaign) {
        foreach ($terms as $term) {
            $termKey = $term['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($term['text']);
            $pairs[] = [
                'customer_id' => $campaign['customer_id'],
                'campaign_id' => $campaign['campaign_id'],
                'term' => $term['text'],
                'match_type' => $term['match_type'],
                'already_present' => isset($presentByPair[$campaign['customer_id'] . '|' . $campaign['campaign_id'] . '|' . $termKey]),
            ];
        }
    }
    $fingerprintData = [
        'manager_customer_id' => $managerId,
        'campaigns' => $verifiedCampaigns,
        'terms' => $terms,
        'pairs' => $pairs,
    ];
    $encoded = json_encode($fingerprintData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($encoded)) throw new HubGoogleAdsApiException('negative_keyword_batch_scan_incomplete', 502);
    return [
        'campaigns' => $verifiedCampaigns,
        'terms' => $terms,
        'pairs' => $pairs,
        'fingerprint' => hash('sha256', $encoded),
    ];
}

function hub_google_ads_batch_negative_keywords_preview(array $config, array $payload): array
{
    [$managerId, $campaigns, $terms] = hub_google_ads_batch_negative_keywords_validate_payload($payload, 'preview_batch_negative_keywords');
    if (!hub_google_ads_campaign_batch_negative_keywords_enabled($config)) throw new HubGoogleAdsApiException('negative_keyword_batch_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    $scan = hub_google_ads_batch_negative_keywords_scan($token, $managerId, $campaigns, $terms);
    $alreadyPresent = count(array_filter($scan['pairs'], static fn(array $pair): bool => $pair['already_present']));
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'preview_batch_negative_keywords',
        'manager_customer_id' => $managerId,
        'campaign_count' => count($scan['campaigns']),
        'term_count' => count($scan['terms']),
        'pair_count' => count($scan['pairs']),
        'already_present_count' => $alreadyPresent,
        'to_create_count' => count($scan['pairs']) - $alreadyPresent,
        'fingerprint' => $scan['fingerprint'],
        'campaigns' => $scan['campaigns'],
        'terms' => $scan['terms'],
        'pairs' => $scan['pairs'],
        'previewed_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

function hub_google_ads_batch_negative_keywords_apply(array $config, array $payload): array
{
    [$managerId, $campaigns, $terms, $fingerprint] =
        hub_google_ads_batch_negative_keywords_validate_payload($payload, 'apply_batch_negative_keywords');
    if (!hub_google_ads_campaign_batch_negative_keywords_enabled($config)) throw new HubGoogleAdsApiException('negative_keyword_batch_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    $fresh = hub_google_ads_batch_negative_keywords_scan($token, $managerId, $campaigns, $terms);
    if (!hash_equals($fingerprint, $fresh['fingerprint'])) {
        throw new HubGoogleAdsApiException('negative_keyword_batch_preview_changed', 409);
    }

    $results = [];
    $pendingByCustomer = [];
    foreach ($fresh['pairs'] as $pair) {
        $key = $pair['customer_id'] . '|' . $pair['campaign_id'] . '|' . $pair['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term']);
        $results[$key] = [
            'customer_id' => $pair['customer_id'],
            'campaign_id' => $pair['campaign_id'],
            'term' => $pair['term'],
            'match_type' => $pair['match_type'],
            'result' => $pair['already_present'] ? 'already_present' : 'pending',
        ];
        if (!$pair['already_present']) $pendingByCustomer[$pair['customer_id']][] = $pair;
    }
    $campaignByKey = [];
    foreach ($fresh['campaigns'] as $campaign) $campaignByKey[$campaign['customer_id'] . '|' . $campaign['campaign_id']] = $campaign;
    foreach ($pendingByCustomer as $customerId => $pendingPairs) {
        $operations = [];
        foreach ($pendingPairs as $pair) {
            $operations[] = ['campaignCriterionOperation' => ['create' => [
                'campaign' => 'customers/' . $customerId . '/campaigns/' . $pair['campaign_id'],
                'negative' => true,
                'keyword' => ['text' => $pair['term'], 'matchType' => $pair['match_type']],
            ]]];
        }
        $accepted = [];
        $writeUncertain = false;
        try {
            $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $token,
                json_encode(['mutateOperations' => $operations], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
            $mutationResults = $response['mutateOperationResponses'] ?? null;
            if (!is_array($mutationResults) || count($mutationResults) !== count($pendingPairs)) {
                $writeUncertain = true;
            } else {
                foreach ($pendingPairs as $index => $pair) {
                    $resourceName = $mutationResults[$index]['campaignCriterionResult']['resourceName'] ?? null;
                    if (!is_string($resourceName) || $resourceName === '') {
                        $writeUncertain = true;
                        continue;
                    }
                    $accepted[$pair['campaign_id'] . '|' . $pair['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term'])] = true;
                }
            }
        } catch (Throwable $error) {
            // The write response may have been lost after Google Ads accepted it. Read back; never retry here.
            $writeUncertain = true;
        }

        try {
            $accountCampaigns = array_values(array_filter($fresh['campaigns'], static fn(array $campaign): bool => $campaign['customer_id'] === $customerId));
            $verifiedPairs = hub_google_ads_batch_negative_keywords_read_pairs($token, $managerId, $customerId, $accountCampaigns, $terms);
            foreach ($pendingPairs as $pair) {
                $termKey = $pair['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term']);
                $pairKey = $customerId . '|' . $pair['campaign_id'] . '|' . $termKey;
                $resultKey = $customerId . '|' . $pair['campaign_id'] . '|' . $pair['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term']);
                if (isset($verifiedPairs[$pairKey])) {
                    $results[$resultKey]['result'] = 'created_verified';
                    continue;
                }
                $acceptedKey = $pair['campaign_id'] . '|' . $pair['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term']);
                $results[$resultKey]['result'] = ($writeUncertain || isset($accepted[$acceptedKey])) ? 'write_unverified' : 'failed';
            }
        } catch (Throwable $error) {
            foreach ($pendingPairs as $pair) {
                $resultKey = $customerId . '|' . $pair['campaign_id'] . '|' . $pair['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term']);
                $results[$resultKey]['result'] = 'write_unverified';
            }
        }
    }

    $orderedResults = array_values($results);
    $createdCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'created_verified'));
    $alreadyPresentCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'already_present'));
    $unverifiedCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'write_unverified'));
    $failedCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'failed'));
    $complete = $unverifiedCount === 0 && $failedCount === 0;
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_batch_negative_keywords',
        'manager_customer_id' => $managerId,
        'campaign_count' => count($fresh['campaigns']),
        'term_count' => count($fresh['terms']),
        'pair_count' => count($orderedResults),
        'created_count' => $createdCount,
        'already_present_count' => $alreadyPresentCount,
        'unverified_count' => $unverifiedCount,
        'failed_count' => $failedCount,
        'complete' => $complete,
        'verified' => $complete,
        'results' => $orderedResults,
        'verified_at_utc' => $complete ? gmdate('Y-m-d\TH:i:s\Z') : '',
    ];
}

function hub_google_ads_campaign_batch_positive_keywords_enabled(array $config): bool
{
    return hub_google_ads_campaign_actions_enabled($config)
        && ($config['tracking_google_ads_campaign_batch_positive_keywords_enabled'] ?? false) === true;
}

function hub_google_ads_batch_positive_keywords_validate_payload(array $payload, string $operation): array
{
    $expected = ['manager_customer_id', 'campaigns', 'terms', 'operation'];
    if ($operation === 'apply_batch_positive_keywords') $expected = [...$expected, 'fingerprint', 'confirm'];
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    sort($expected, SORT_STRING);
    if ($keys !== $expected || ($operation === 'apply_batch_positive_keywords' && ($payload['confirm'] ?? null) !== true)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id'] ?? null);
    $campaigns = $payload['campaigns'] ?? null;
    $terms = $payload['terms'] ?? null;
    if ($managerId === null || !is_array($campaigns) || !$campaigns || count($campaigns) > 100
        || !is_array($terms) || !$terms || count($terms) > 100) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $normalizedCampaigns = [];
    $campaignKeys = [];
    foreach ($campaigns as $campaign) {
        $campaignKeysInPayload = is_array($campaign) ? array_keys($campaign) : [];
        sort($campaignKeysInPayload, SORT_STRING);
        if ($campaignKeysInPayload !== ['ad_group_id', 'ad_group_status', 'campaign_id', 'campaign_name', 'customer_id', 'status']) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $customerId = hub_google_ads_valid_customer_id($campaign['customer_id'] ?? null);
        $campaignId = $campaign['campaign_id'] ?? null;
        $campaignName = $campaign['campaign_name'] ?? null;
        $status = $campaign['status'] ?? null;
        $adGroupId = $campaign['ad_group_id'] ?? null;
        $adGroupStatus = $campaign['ad_group_status'] ?? null;
        if ($customerId === null || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
            || !is_string($campaignName) || trim($campaignName) !== $campaignName || $campaignName === ''
            || strlen($campaignName) > 255 || !in_array($status, ['ENABLED', 'PAUSED'], true)
            || !is_string($adGroupId) || preg_match('/^[1-9][0-9]{0,19}$/D', $adGroupId) !== 1
            || !in_array($adGroupStatus, ['ENABLED', 'PAUSED'], true)) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $key = $customerId . '|' . $campaignId;
        if (isset($campaignKeys[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $campaignKeys[$key] = true;
        $normalizedCampaigns[] = [
            'customer_id' => $customerId,
            'campaign_id' => $campaignId,
            'campaign_name' => $campaignName,
            'status' => $status,
            'ad_group_id' => $adGroupId,
            'ad_group_status' => $adGroupStatus,
        ];
    }
    usort($normalizedCampaigns, static fn(array $left, array $right): int =>
        [$left['customer_id'], $left['campaign_id']] <=> [$right['customer_id'], $right['campaign_id']]);

    $normalizedTerms = [];
    $termKeys = [];
    foreach ($terms as $term) {
        $termKeysInPayload = is_array($term) ? array_keys($term) : [];
        sort($termKeysInPayload, SORT_STRING);
        if ($termKeysInPayload !== ['match_type', 'text']) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $text = $term['text'] ?? null;
        $matchType = $term['match_type'] ?? null;
        if (!is_string($text) || trim($text) !== $text || $text === ''
            || hub_google_ads_negative_keyword_character_count($text) > 80
            || preg_match('/[\x00-\x1F\x7F]/', $text) === 1
            || count(preg_split('/\s+/u', trim($text), -1, PREG_SPLIT_NO_EMPTY) ?: []) > 10
            || !in_array($matchType, ['BROAD', 'PHRASE', 'EXACT'], true)) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $key = $matchType . '|' . hub_google_ads_negative_keyword_normalize_text($text);
        if (isset($termKeys[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $termKeys[$key] = true;
        $normalizedTerms[] = ['text' => $text, 'match_type' => $matchType];
    }
    if (count($normalizedCampaigns) * count($normalizedTerms) > 10000) {
        throw new HubGoogleAdsApiException('positive_keyword_batch_too_large', 422);
    }
    $fingerprint = $payload['fingerprint'] ?? '';
    if ($operation === 'apply_batch_positive_keywords'
        && (!is_string($fingerprint) || preg_match('/^[a-f0-9]{64}$/D', $fingerprint) !== 1)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $normalizedCampaigns, $normalizedTerms, $fingerprint];
}

/** Read only the supplied batch ad groups and requested positive keywords. */
function hub_google_ads_batch_positive_keywords_read_pairs(
    string $accessToken,
    string $managerId,
    string $customerId,
    array $campaigns,
    array $terms
): array {
    $groupResources = array_map(
        static fn(array $campaign): string => '"customers/' . $customerId . '/adGroups/' . $campaign['ad_group_id'] . '"',
        $campaigns
    );
    $termTexts = array_values(array_unique(array_column($terms, 'text')));
    $matchTypes = array_values(array_unique(array_column($terms, 'match_type')));
    $textList = array_map('hub_google_ads_batch_negative_keywords_gaql_string', $termTexts);
    $query = "SELECT ad_group_criterion.ad_group, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type "
        . "FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' "
        . "AND ad_group_criterion.status != 'REMOVED' AND ad_group_criterion.negative = FALSE "
        . 'AND ad_group_criterion.ad_group IN (' . implode(', ', $groupResources) . ') '
        . 'AND ad_group_criterion.keyword.text IN (' . implode(', ', $textList) . ') '
        . 'AND ad_group_criterion.keyword.match_type IN (' . implode(', ', $matchTypes) . ') LIMIT 10001';
    $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    if (count($rows) > 10000) throw new HubGoogleAdsApiException('positive_keyword_batch_scan_incomplete', 502);
    $campaignByGroupId = [];
    foreach ($campaigns as $campaign) $campaignByGroupId[$campaign['ad_group_id']] = $campaign['campaign_id'];
    $termMap = [];
    foreach ($terms as $term) {
        $termMap[$term['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($term['text'])] = $term['text'];
    }
    $present = [];
    foreach ($rows as $row) {
        $criterion = $row['adGroupCriterion'] ?? null;
        if (!is_array($criterion)) throw new HubGoogleAdsApiException('positive_keyword_batch_scan_incomplete', 502);
        $resource = (string)($criterion['adGroup'] ?? '');
        if (preg_match('#^customers/' . preg_quote($customerId, '#') . '/adGroups/([1-9][0-9]{0,19})$#D', $resource, $match) !== 1
            || !isset($campaignByGroupId[$match[1]])) continue;
        $matchType = (string)($criterion['keyword']['matchType'] ?? '');
        $normalizedText = hub_google_ads_negative_keyword_normalize_text((string)($criterion['keyword']['text'] ?? ''));
        $termKey = $matchType . '|' . $normalizedText;
        if (!isset($termMap[$termKey])) continue;
        $campaignId = $campaignByGroupId[$match[1]];
        $present[$customerId . '|' . $campaignId . '|' . $match[1] . '|' . $termKey] = true;
    }
    return $present;
}

/** Verify one exact active ad group for each campaign and fingerprint its positive-keyword state. */
function hub_google_ads_batch_positive_keywords_scan(
    string $accessToken,
    string $managerId,
    array $campaigns,
    array $terms
): array {
    $campaignsByCustomer = [];
    foreach ($campaigns as $campaign) $campaignsByCustomer[$campaign['customer_id']][] = $campaign;
    $verifiedCampaigns = [];
    foreach ($campaignsByCustomer as $customerId => $expectedCampaigns) {
        if (!hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId)) {
            throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
        }
        $ids = array_map(static fn(array $campaign): string => $campaign['campaign_id'], $expectedCampaigns);
        $query = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type '
            . 'FROM campaign WHERE campaign.id IN (' . implode(', ', $ids) . ") AND campaign.status != 'REMOVED' "
            . "AND campaign.advertising_channel_type = 'SEARCH' LIMIT " . (count($expectedCampaigns) + 1);
        $rows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
        if (count($rows) !== count($expectedCampaigns)) {
            throw new HubGoogleAdsApiException('positive_keyword_batch_campaign_changed', 409);
        }
        $foundCampaigns = [];
        foreach ($rows as $row) {
            $campaign = $row['campaign'] ?? null;
            if (!is_array($campaign)) throw new HubGoogleAdsApiException('positive_keyword_batch_scan_incomplete', 502);
            $foundCampaigns[(string)($campaign['id'] ?? '')] = $campaign;
        }
        foreach ($expectedCampaigns as $expected) {
            $campaign = $foundCampaigns[$expected['campaign_id']] ?? null;
            if (!is_array($campaign) || (string)($campaign['id'] ?? '') !== $expected['campaign_id']
                || ($campaign['name'] ?? null) !== $expected['campaign_name']
                || ($campaign['status'] ?? null) !== $expected['status']
                || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH') {
                throw new HubGoogleAdsApiException('positive_keyword_batch_campaign_changed', 409);
            }
        }
        $campaignResources = array_map(static fn(array $item): string =>
            '"customers/' . $customerId . '/campaigns/' . $item['campaign_id'] . '"', $expectedCampaigns);
        $groupQuery = 'SELECT ad_group.id, ad_group.campaign, ad_group.status FROM ad_group WHERE ad_group.campaign IN ('
            . implode(', ', $campaignResources) . ") AND ad_group.status != 'REMOVED' LIMIT "
            . (count($expectedCampaigns) + 1);
        $groupRows = hub_google_ads_search($customerId, $groupQuery, $accessToken, $managerId);
        if (count($groupRows) > count($expectedCampaigns)) {
            throw new HubGoogleAdsApiException('positive_keyword_batch_ad_group_changed', 409);
        }
        $groupsByCampaign = [];
        foreach ($groupRows as $row) {
            $group = $row['adGroup'] ?? null;
            if (!is_array($group)) throw new HubGoogleAdsApiException('positive_keyword_batch_scan_incomplete', 502);
            $campaignResource = (string)($group['campaign'] ?? '');
            if (preg_match('#^customers/' . preg_quote($customerId, '#') . '/campaigns/([1-9][0-9]{0,19})$#D', $campaignResource, $match) !== 1) {
                throw new HubGoogleAdsApiException('positive_keyword_batch_scan_incomplete', 502);
            }
            $groupsByCampaign[$match[1]][] = [
                'id' => (string)($group['id'] ?? ''),
                'status' => (string)($group['status'] ?? ''),
            ];
        }
        foreach ($expectedCampaigns as $expected) {
            $groups = $groupsByCampaign[$expected['campaign_id']] ?? [];
            if (count($groups) !== 1 || $groups[0]['id'] !== $expected['ad_group_id']
                || $groups[0]['status'] !== $expected['ad_group_status']) {
                throw new HubGoogleAdsApiException('positive_keyword_batch_ad_group_changed', 409);
            }
            $verifiedCampaigns[] = $expected;
        }
    }
    usort($verifiedCampaigns, static fn(array $left, array $right): int =>
        [$left['customer_id'], $left['campaign_id']] <=> [$right['customer_id'], $right['campaign_id']]);

    $presentByPair = [];
    foreach ($campaignsByCustomer as $customerId => $accountCampaigns) {
        $presentByPair += hub_google_ads_batch_positive_keywords_read_pairs($accessToken, $managerId, $customerId, $accountCampaigns, $terms);
    }
    $pairs = [];
    foreach ($verifiedCampaigns as $campaign) {
        foreach ($terms as $term) {
            $termKey = $term['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($term['text']);
            $pairs[] = [
                'customer_id' => $campaign['customer_id'],
                'campaign_id' => $campaign['campaign_id'],
                'ad_group_id' => $campaign['ad_group_id'],
                'term' => $term['text'],
                'match_type' => $term['match_type'],
                'already_present' => isset($presentByPair[$campaign['customer_id'] . '|' . $campaign['campaign_id'] . '|' . $campaign['ad_group_id'] . '|' . $termKey]),
            ];
        }
    }
    $fingerprintData = ['manager_customer_id' => $managerId, 'campaigns' => $verifiedCampaigns, 'terms' => $terms, 'pairs' => $pairs];
    $encoded = json_encode($fingerprintData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($encoded)) throw new HubGoogleAdsApiException('positive_keyword_batch_scan_incomplete', 502);
    return ['campaigns' => $verifiedCampaigns, 'terms' => $terms, 'pairs' => $pairs, 'fingerprint' => hash('sha256', $encoded)];
}

function hub_google_ads_batch_positive_keywords_preview(array $config, array $payload): array
{
    [$managerId, $campaigns, $terms] = hub_google_ads_batch_positive_keywords_validate_payload($payload, 'preview_batch_positive_keywords');
    if (!hub_google_ads_campaign_batch_positive_keywords_enabled($config)) throw new HubGoogleAdsApiException('positive_keyword_batch_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    $scan = hub_google_ads_batch_positive_keywords_scan($token, $managerId, $campaigns, $terms);
    $alreadyPresent = count(array_filter($scan['pairs'], static fn(array $pair): bool => $pair['already_present']));
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'preview_batch_positive_keywords',
        'manager_customer_id' => $managerId,
        'campaign_count' => count($scan['campaigns']),
        'term_count' => count($scan['terms']),
        'pair_count' => count($scan['pairs']),
        'already_present_count' => $alreadyPresent,
        'to_create_count' => count($scan['pairs']) - $alreadyPresent,
        'fingerprint' => $scan['fingerprint'],
        'campaigns' => $scan['campaigns'],
        'terms' => $scan['terms'],
        'pairs' => $scan['pairs'],
        'previewed_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

function hub_google_ads_batch_positive_keywords_apply(array $config, array $payload): array
{
    [$managerId, $campaigns, $terms, $fingerprint] =
        hub_google_ads_batch_positive_keywords_validate_payload($payload, 'apply_batch_positive_keywords');
    if (!hub_google_ads_campaign_batch_positive_keywords_enabled($config)) throw new HubGoogleAdsApiException('positive_keyword_batch_disabled', 403);
    if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
    $token = hub_google_ads_access_token(hub_google_ads_credentials());
    $fresh = hub_google_ads_batch_positive_keywords_scan($token, $managerId, $campaigns, $terms);
    if (!hash_equals($fingerprint, $fresh['fingerprint'])) {
        throw new HubGoogleAdsApiException('positive_keyword_batch_preview_changed', 409);
    }
    $results = [];
    $pendingByCustomer = [];
    foreach ($fresh['pairs'] as $pair) {
        $key = $pair['customer_id'] . '|' . $pair['campaign_id'] . '|' . $pair['ad_group_id'] . '|' . $pair['match_type']
            . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term']);
        $results[$key] = [
            'customer_id' => $pair['customer_id'],
            'campaign_id' => $pair['campaign_id'],
            'ad_group_id' => $pair['ad_group_id'],
            'term' => $pair['term'],
            'match_type' => $pair['match_type'],
            'result' => $pair['already_present'] ? 'already_present' : 'pending',
        ];
        if (!$pair['already_present']) $pendingByCustomer[$pair['customer_id']][] = $pair;
    }
    foreach ($pendingByCustomer as $customerId => $pendingPairs) {
        $operations = [];
        foreach ($pendingPairs as $pair) {
            $operations[] = ['adGroupCriterionOperation' => ['create' => [
                'adGroup' => 'customers/' . $customerId . '/adGroups/' . $pair['ad_group_id'],
                'status' => 'ENABLED',
                'negative' => false,
                'keyword' => ['text' => $pair['term'], 'matchType' => $pair['match_type']],
            ]]];
        }
        $accepted = [];
        $writeUncertain = false;
        try {
            $response = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/googleAds:mutate', $token,
                json_encode(['mutateOperations' => $operations], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
            $mutationResults = $response['mutateOperationResponses'] ?? null;
            if (!is_array($mutationResults) || count($mutationResults) !== count($pendingPairs)) {
                $writeUncertain = true;
            } else {
                foreach ($pendingPairs as $index => $pair) {
                    $resourceName = $mutationResults[$index]['adGroupCriterionResult']['resourceName'] ?? null;
                    if (!is_string($resourceName) || $resourceName === '') {
                        $writeUncertain = true;
                        continue;
                    }
                    $accepted[$pair['campaign_id'] . '|' . $pair['ad_group_id'] . '|' . $pair['match_type'] . '|'
                        . hub_google_ads_negative_keyword_normalize_text($pair['term'])] = true;
                }
            }
        } catch (Throwable $error) {
            // A lost response can follow a successful write. Read back; never retry here.
            $writeUncertain = true;
        }
        try {
            $accountCampaigns = array_values(array_filter($fresh['campaigns'], static fn(array $campaign): bool => $campaign['customer_id'] === $customerId));
            $verifiedPairs = hub_google_ads_batch_positive_keywords_read_pairs($token, $managerId, $customerId, $accountCampaigns, $terms);
            foreach ($pendingPairs as $pair) {
                $termKey = $pair['match_type'] . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term']);
                $pairKey = $customerId . '|' . $pair['campaign_id'] . '|' . $pair['ad_group_id'] . '|' . $termKey;
                $resultKey = $customerId . '|' . $pair['campaign_id'] . '|' . $pair['ad_group_id'] . '|' . $pair['match_type']
                    . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term']);
                if (isset($verifiedPairs[$pairKey])) {
                    $results[$resultKey]['result'] = 'created_verified';
                    continue;
                }
                $acceptedKey = $pair['campaign_id'] . '|' . $pair['ad_group_id'] . '|' . $pair['match_type'] . '|'
                    . hub_google_ads_negative_keyword_normalize_text($pair['term']);
                $results[$resultKey]['result'] = ($writeUncertain || isset($accepted[$acceptedKey])) ? 'write_unverified' : 'failed';
            }
        } catch (Throwable $error) {
            foreach ($pendingPairs as $pair) {
                $resultKey = $customerId . '|' . $pair['campaign_id'] . '|' . $pair['ad_group_id'] . '|' . $pair['match_type']
                    . '|' . hub_google_ads_negative_keyword_normalize_text($pair['term']);
                $results[$resultKey]['result'] = 'write_unverified';
            }
        }
    }
    $orderedResults = array_values($results);
    $createdCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'created_verified'));
    $alreadyPresentCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'already_present'));
    $unverifiedCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'write_unverified'));
    $failedCount = count(array_filter($orderedResults, static fn(array $item): bool => $item['result'] === 'failed'));
    $complete = $unverifiedCount === 0 && $failedCount === 0;
    return [
        'ok' => true,
        'schema_version' => 1,
        'operation' => 'apply_batch_positive_keywords',
        'manager_customer_id' => $managerId,
        'campaign_count' => count($fresh['campaigns']),
        'term_count' => count($fresh['terms']),
        'pair_count' => count($orderedResults),
        'created_count' => $createdCount,
        'already_present_count' => $alreadyPresentCount,
        'unverified_count' => $unverifiedCount,
        'failed_count' => $failedCount,
        'complete' => $complete,
        'verified' => $complete,
        'results' => $orderedResults,
        'verified_at_utc' => $complete ? gmdate('Y-m-d\TH:i:s\Z') : '',
    ];
}


function hub_google_ads_campaign_action_dispatch(): never
{
    header('Cache-Control: no-store, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    try {
        $config = hub_google_ads_load_tracking_config();
        $authorization = hub_google_ads_authorize($config);
        if (is_string($authorization['origin'])) {
            header('Access-Control-Allow-Origin: ' . $authorization['origin']);
            header('Vary: Origin');
            header('Access-Control-Allow-Methods: POST, OPTIONS');
            header('Access-Control-Allow-Headers: Authorization, Content-Type');
            header('Access-Control-Max-Age: 300');
        }
        if ($authorization['status'] === 204) { http_response_code(204); exit; }
        if ($authorization['status'] !== 200) {
            hub_google_ads_campaign_action_json($authorization['status'], ['ok' => false, 'error' => $authorization['error']]);
        }
        if (($_SERVER['QUERY_STRING'] ?? '') !== '') {
            hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
        }

        $payload = hub_google_ads_campaign_image_upload_parse_request();
        $operation = $payload['operation'] ?? null;
        if ($operation === 'campaign_duplication_list') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_list($config, $payload));
        }
        if ($operation === 'campaign_duplication_inspect') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_inspect($config, $payload));
        }
        if ($operation === 'campaign_duplication_preview') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_preview($config, $payload));
        }
        if ($operation === 'campaign_duplication_create') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_create($config, $payload));
        }
        if ($operation === 'campaign_duplication_replace_preview') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_replace_preview($config, $payload));
        }
        if ($operation === 'campaign_duplication_replace_execute') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_duplication_replace_execute($config, $payload));
        }
        if ($operation === 'capabilities') {
            $keys = array_keys($payload);
            sort($keys, SORT_STRING);
            if ($keys !== ['customer_id', 'manager_customer_id', 'operation']) {
                hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
            }
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            if ($managerId === null || $customerId === null) {
                hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
            }
            $enabled = false;
            if (hub_google_ads_campaign_actions_enabled($config)
                && hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
                $enabled = hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId);
            }
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'campaign_actions_enabled' => $enabled,
                'allowed_operations' => $enabled ? ['pause_campaign', 'enable_campaign'] : [],
            ]);
        }
        if ($operation === 'creation_capabilities') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['customer_id', 'manager_customer_id', 'operation']) {
                hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
            }
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            if ($managerId === null || $customerId === null) {
                hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
            }
            $enabled = hub_google_ads_campaign_creation_enabled($config)
                && hub_google_ads_campaign_manager_is_allowed($config, $managerId);
            if ($enabled) {
                $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
                $enabled = hub_google_ads_campaign_customer_is_active_child($accessToken, $managerId, $customerId);
            }
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'campaign_creation_enabled' => $enabled,
                'allowed_operations' => $enabled ? ['prepare_search_campaign_preview_contexts', 'preview_search_campaign', 'create_search_campaign', 'apply_audience_targeting', 'apply_configured_audience_targeting', 'apply_audience_exclusions', 'apply_campaign_sitelinks', 'apply_campaign_destination_url', 'upload_campaign_image_asset', 'campaign_duplication_list', 'campaign_duplication_inspect', 'campaign_duplication_preview', 'campaign_duplication_create', 'campaign_duplication_replace_preview', 'campaign_duplication_replace_execute'] : [],
            ]);
        }
        if ($operation === 'prepare_search_campaign_preview_contexts') {
            $result = hub_google_ads_campaign_creation_prepare_preview_contexts($config, $payload);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'campaign_templates') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['customer_id', 'manager_customer_id', 'operation']) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            if ($managerId === null || $customerId === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
            if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
            }
            $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_campaign_creation_authorize($config, $accessToken, $managerId, $customerId);
            $catalog = hub_google_ads_campaign_creation_templates($accessToken, $managerId, $customerId);
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'operation' => 'campaign_templates',
                'customer_id' => $customerId,
                'currency_code' => $catalog['currency_code'],
                'template_count' => count($catalog['templates']),
                'templates' => $catalog['templates'],
            ]);
        }
        if ($operation === 'apply_existing_campaign_custom_goal') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['campaign_id', 'campaign_name', 'confirm', 'customer_id', 'manager_customer_id', 'operation'] || ($payload['confirm'] ?? null) !== true) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            $campaignId = (string)($payload['campaign_id'] ?? '');
            $name = $payload['campaign_name'] ?? null;
            if ($managerId === null || $customerId === null || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1 || !is_string($name) || trim($name) !== $name || $name === '' || strlen($name) > 255) throw new HubGoogleAdsApiException('invalid_payload', 400);
            if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
            $token = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_campaign_creation_authorize($config, $token, $managerId, $customerId);
            $current = hub_google_ads_campaign_action_read($token, $managerId, $customerId, $campaignId);
            if (($current['name'] ?? null) !== $name || ($current['status'] ?? null) !== 'PAUSED') throw new HubGoogleAdsApiException('campaign_creation_unverified', 409);
            $goal = hub_google_ads_campaign_creation_resolve_custom_goal($token, $managerId, $customerId);
            try {
                $verification = hub_google_ads_campaign_creation_apply_and_verify_custom_goal($token, $managerId, $customerId, $campaignId, $goal);
                $after = hub_google_ads_campaign_action_read($token, $managerId, $customerId, $campaignId);
                if (($after['name'] ?? null) !== $name || ($after['status'] ?? null) !== 'PAUSED' || ($verification['verified'] ?? null) !== true) throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502);
            } catch (Throwable $error) { throw new HubGoogleAdsApiException('campaign_goal_configuration_unverified', 502); }
            hub_google_ads_campaign_action_json(200, ['ok' => true, 'schema_version' => 1, 'operation' => $operation, 'campaign_id' => $campaignId, 'campaign_name' => $name, 'status' => 'PAUSED', 'goal_name' => $verification['goal_name'], 'conversion_action_name' => $verification['conversion_action_name'], 'verified' => true]);
        }
        if ($operation === 'apply_existing_campaign_delivery_settings') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['campaign_id', 'campaign_name', 'confirm', 'customer_id', 'manager_customer_id', 'operation'] || ($payload['confirm'] ?? null) !== true) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            $campaignId = (string)($payload['campaign_id'] ?? '');
            $name = $payload['campaign_name'] ?? null;
            if ($managerId === null || $customerId === null || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1 || !is_string($name) || trim($name) !== $name || $name === '' || strlen($name) > 255) throw new HubGoogleAdsApiException('invalid_payload', 400);
            if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
            $token = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_campaign_creation_authorize($config, $token, $managerId, $customerId);
            $current = hub_google_ads_campaign_action_read($token, $managerId, $customerId, $campaignId);
            if (($current['name'] ?? null) !== $name || ($current['status'] ?? null) !== 'PAUSED') throw new HubGoogleAdsApiException('campaign_creation_unverified', 409);
            if (($current['channel_type'] ?? null) !== 'SEARCH') throw new HubGoogleAdsApiException('campaign_delivery_settings_search_only', 409);

            $campaignStatus = (string)$current['status'];
            $positiveGeoTargetType = (string)($current['positive_geo_target_type'] ?? '');
            $presenceVerified = ($current['positive_geo_target_type'] ?? null) === 'PRESENCE';
            $presenceChanged = false;
            $goalVerified = false;
            $goalChanged = false;
            $failureCode = '';
            $goal = null;
            try {
                // Resolve and inspect both settings before the first write so an unavailable goal cannot leave a partial GEO change.
                $goal = hub_google_ads_campaign_creation_resolve_custom_goal($token, $managerId, $customerId);
                $goalVerified = hub_google_ads_campaign_creation_custom_goal_is_current($token, $managerId, $customerId, $campaignId, $goal);
                if (!$presenceVerified) {
                    $resourceName = 'customers/' . $customerId . '/campaigns/' . $campaignId;
                    $mutation = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/campaigns:mutate', $token,
                        json_encode(['operations' => [[
                            'update' => ['resourceName' => $resourceName, 'geoTargetTypeSetting' => ['positiveGeoTargetType' => 'PRESENCE']],
                            'updateMask' => 'geoTargetTypeSetting.positiveGeoTargetType',
                        ]]], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
                    if (count($mutation['results'] ?? []) !== 1) throw new HubGoogleAdsApiException('campaign_delivery_settings_unverified', 502);
                    $presenceChanged = true;
                    $afterPresence = hub_google_ads_campaign_action_read($token, $managerId, $customerId, $campaignId);
                    if (($afterPresence['name'] ?? null) !== $name || ($afterPresence['status'] ?? null) !== 'PAUSED'
                        || ($afterPresence['channel_type'] ?? null) !== 'SEARCH') {
                        throw new HubGoogleAdsApiException('campaign_creation_unverified', 409);
                    }
                    $campaignStatus = (string)$afterPresence['status'];
                    $positiveGeoTargetType = (string)($afterPresence['positive_geo_target_type'] ?? '');
                    $presenceVerified = ($afterPresence['positive_geo_target_type'] ?? null) === 'PRESENCE';
                    if (!$presenceVerified) throw new HubGoogleAdsApiException('campaign_delivery_settings_unverified', 502);
                }
                if (!$goalVerified) {
                    $beforeGoalMutation = hub_google_ads_campaign_action_read($token, $managerId, $customerId, $campaignId);
                    if (($beforeGoalMutation['name'] ?? null) !== $name || ($beforeGoalMutation['status'] ?? null) !== 'PAUSED'
                        || ($beforeGoalMutation['channel_type'] ?? null) !== 'SEARCH') {
                        throw new HubGoogleAdsApiException('campaign_creation_unverified', 409);
                    }
                    $verification = hub_google_ads_campaign_creation_apply_and_verify_custom_goal($token, $managerId, $customerId, $campaignId, $goal);
                    $goalVerified = ($verification['verified'] ?? null) === true;
                    $goalChanged = $goalVerified;
                }
                $after = hub_google_ads_campaign_action_read($token, $managerId, $customerId, $campaignId);
                if (($after['name'] ?? null) !== $name || ($after['status'] ?? null) !== 'PAUSED'
                    || ($after['channel_type'] ?? null) !== 'SEARCH') {
                    throw new HubGoogleAdsApiException('campaign_creation_unverified', 409);
                }
                $campaignStatus = (string)$after['status'];
                $positiveGeoTargetType = (string)($after['positive_geo_target_type'] ?? '');
                $presenceVerified = ($after['positive_geo_target_type'] ?? null) === 'PRESENCE';
                if (!$presenceVerified || !$goalVerified) throw new HubGoogleAdsApiException('campaign_delivery_settings_unverified', 502);
            } catch (Throwable $error) {
                $failureCode = $error instanceof HubGoogleAdsApiException ? $error->getMessage() : 'campaign_delivery_settings_unverified';
                if (preg_match('/^[a-z][a-z0-9_]{2,80}$/D', $failureCode) !== 1) $failureCode = 'campaign_delivery_settings_unverified';
                try {
                    $latest = hub_google_ads_campaign_action_read($token, $managerId, $customerId, $campaignId);
                    $campaignStatus = (string)($latest['status'] ?? '');
                    $positiveGeoTargetType = (string)($latest['positive_geo_target_type'] ?? '');
                    $presenceVerified = ($latest['name'] ?? null) === $name && ($latest['status'] ?? null) === 'PAUSED'
                        && ($latest['channel_type'] ?? null) === 'SEARCH' && ($latest['positive_geo_target_type'] ?? null) === 'PRESENCE';
                    if ($goal !== null && ($latest['name'] ?? null) === $name && ($latest['status'] ?? null) === 'PAUSED'
                        && ($latest['channel_type'] ?? null) === 'SEARCH') {
                        $goalVerified = hub_google_ads_campaign_creation_custom_goal_is_current($token, $managerId, $customerId, $campaignId, $goal);
                    }
                } catch (Throwable $ignored) {
                    // Keep the last confirmed values; the Hub will persist them as an incomplete checkpoint.
                }
            }
            $verified = $failureCode === '' && $presenceVerified && $goalVerified;
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'operation' => $operation,
                'campaign_id' => $campaignId,
                'campaign_name' => $name,
                'status' => $campaignStatus,
                'channel_type' => 'SEARCH',
                'positive_geo_target_type' => $positiveGeoTargetType,
                'presence_verified' => $presenceVerified,
                'presence_changed' => $presenceChanged,
                'goal_name' => is_array($goal) ? hub_google_ads_campaign_creation_custom_goal_name() : '',
                'conversion_action_name' => is_array($goal) ? hub_google_ads_campaign_creation_conversion_action_name() : '',
                'goal_verified' => $goalVerified,
                'goal_changed' => $goalChanged,
                'verified' => $verified,
                'failure_code' => $failureCode,
                'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
            ]);
        }
        if ($operation === 'apply_existing_campaign_eu_political_advertising_declaration_batch') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['campaigns', 'confirm', 'customer_id', 'manager_customer_id', 'operation']
                || ($payload['confirm'] ?? null) !== true || !is_array($payload['campaigns'])
                || count($payload['campaigns']) < 1 || count($payload['campaigns']) > 100) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            if ($managerId === null || $customerId === null || !hub_google_ads_campaign_creation_enabled($config)
                || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
            }
            $requested = [];
            foreach ($payload['campaigns'] as $item) {
                if (!is_array($item)) throw new HubGoogleAdsApiException('invalid_payload', 400);
                $itemKeys = array_keys($item); sort($itemKeys, SORT_STRING);
                $campaignId = (string)($item['campaign_id'] ?? '');
                $campaignName = $item['campaign_name'] ?? null;
                if ($itemKeys !== ['campaign_id', 'campaign_name']
                    || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
                    || !is_string($campaignName) || trim($campaignName) !== $campaignName
                    || $campaignName === '' || strlen($campaignName) > 255 || isset($requested[$campaignId])) {
                    throw new HubGoogleAdsApiException('invalid_payload', 400);
                }
                $requested[$campaignId] = $campaignName;
            }

            $targetDeclaration = 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING';
            $token = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_campaign_creation_authorize($config, $token, $managerId, $customerId);
            $idsSql = implode(', ', array_keys($requested));
            $queryCampaigns = static function (array $ids) use ($customerId, $token, $managerId): array {
                if (!$ids) return [];
                $query = 'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.contains_eu_political_advertising '
                    . 'FROM campaign WHERE campaign.id IN (' . implode(', ', array_keys($ids)) . ') LIMIT 101';
                $rows = hub_google_ads_search($customerId, $query, $token, $managerId);
                $found = [];
                foreach ($rows as $row) {
                    $campaign = $row['campaign'] ?? null;
                    if (!is_array($campaign)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                    $id = (string)($campaign['id'] ?? '');
                    if (!isset($ids[$id]) || isset($found[$id])) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                    $found[$id] = [
                        'name' => is_string($campaign['name'] ?? null) ? $campaign['name'] : '',
                        'status' => is_string($campaign['status'] ?? null) ? $campaign['status'] : '',
                        'channel_type' => is_string($campaign['advertisingChannelType'] ?? null) ? $campaign['advertisingChannelType'] : '',
                        'declaration' => is_string($campaign['containsEuPoliticalAdvertising'] ?? null) ? $campaign['containsEuPoliticalAdvertising'] : 'UNSPECIFIED',
                    ];
                }
                return $found;
            };
            $idSet = array_fill_keys(array_keys($requested), true);
            $initial = $queryCampaigns($idSet);
            $resultsById = [];
            $needsChange = [];
            $preflightFailed = false;
            foreach ($requested as $campaignId => $campaignName) {
                $campaign = $initial[$campaignId] ?? null;
                $status = is_array($campaign) ? $campaign['status'] : '';
                $declaration = is_array($campaign) ? $campaign['declaration'] : 'UNSPECIFIED';
                $failureCode = '';
                if (!$campaign) $failureCode = 'campaign_not_found';
                elseif ($campaign['name'] !== $campaignName) $failureCode = 'campaign_creation_unverified';
                elseif (!in_array($status, ['PAUSED', 'ENABLED'], true) || $campaign['channel_type'] !== 'SEARCH') {
                    $failureCode = 'campaign_eu_political_declaration_search_only';
                }
                $alreadyCorrect = $failureCode === '' && $declaration === $targetDeclaration;
                $resultsById[$campaignId] = [
                    'campaign_id' => $campaignId,
                    'campaign_name' => $campaignName,
                    'status' => $status,
                    'channel_type' => is_array($campaign) ? $campaign['channel_type'] : '',
                    'declaration' => $declaration,
                    'declaration_verified' => $alreadyCorrect,
                    'declaration_changed' => false,
                    'failure_code' => $failureCode,
                ];
                if ($failureCode !== '') $preflightFailed = true;
                elseif (!$alreadyCorrect) $needsChange[] = $campaignId;
            }

            if ($preflightFailed) {
                foreach ($needsChange as $campaignId) {
                    $resultsById[$campaignId]['failure_code'] = 'campaign_eu_political_declaration_preflight_failed';
                }
            } elseif ($needsChange) {
                $operations = [];
                foreach ($needsChange as $campaignId) {
                    $operations[] = [
                        'update' => [
                            'resourceName' => 'customers/' . $customerId . '/campaigns/' . $campaignId,
                            'containsEuPoliticalAdvertising' => $targetDeclaration,
                        ],
                        'updateMask' => 'containsEuPoliticalAdvertising',
                    ];
                }
                $mutationFailureCode = '';
                try {
                    $mutation = hub_google_ads_api_request('POST', 'customers/' . $customerId . '/campaigns:mutate', $token,
                        json_encode(['operations' => $operations], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $managerId);
                    if (count($mutation['results'] ?? []) !== count($needsChange)) {
                        throw new HubGoogleAdsApiException('campaign_eu_political_declaration_unverified', 502);
                    }
                } catch (Throwable $error) {
                    $mutationFailureCode = $error instanceof HubGoogleAdsApiException ? $error->getMessage() : 'campaign_eu_political_declaration_unverified';
                    if (preg_match('/^[a-z][a-z0-9_]{2,80}$/D', $mutationFailureCode) !== 1) {
                        $mutationFailureCode = 'campaign_eu_political_declaration_unverified';
                    }
                }

                if ($mutationFailureCode !== '') {
                    foreach ($needsChange as $campaignId) $resultsById[$campaignId]['failure_code'] = $mutationFailureCode;
                } else {
                    try {
                        $verifiedRows = $queryCampaigns(array_fill_keys($needsChange, true));
                        foreach ($needsChange as $campaignId) {
                            $campaign = $verifiedRows[$campaignId] ?? null;
                            $verified = is_array($campaign)
                                && $campaign['name'] === $requested[$campaignId]
                                && in_array($campaign['status'], ['PAUSED', 'ENABLED'], true)
                                && $campaign['channel_type'] === 'SEARCH'
                                && $campaign['declaration'] === $targetDeclaration;
                            $resultsById[$campaignId] = [
                                'campaign_id' => $campaignId,
                                'campaign_name' => $requested[$campaignId],
                                'status' => is_array($campaign) ? $campaign['status'] : '',
                                'channel_type' => is_array($campaign) ? $campaign['channel_type'] : '',
                                'declaration' => is_array($campaign) ? $campaign['declaration'] : 'UNSPECIFIED',
                                'declaration_verified' => $verified,
                                'declaration_changed' => $verified,
                                'failure_code' => $verified ? '' : 'campaign_eu_political_declaration_unverified',
                            ];
                        }
                    } catch (Throwable $error) {
                        foreach ($needsChange as $campaignId) {
                            $resultsById[$campaignId]['declaration_verified'] = false;
                            $resultsById[$campaignId]['failure_code'] = 'campaign_eu_political_declaration_unverified';
                        }
                    }
                }
            }

            $campaignResults = array_values($resultsById);
            $confirmedCount = count(array_filter($campaignResults, static fn(array $item): bool => $item['declaration_verified']));
            $changedCount = count(array_filter($campaignResults, static fn(array $item): bool => $item['declaration_changed']));
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'operation' => $operation,
                'customer_id' => $customerId,
                'target_declaration' => $targetDeclaration,
                'campaign_count' => count($campaignResults),
                'confirmed_count' => $confirmedCount,
                'changed_count' => $changedCount,
                'already_correct_count' => $confirmedCount - $changedCount,
                'complete' => $confirmedCount === count($campaignResults),
                'campaigns' => $campaignResults,
                'verified_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
            ]);
        }
        if ($operation === 'temporary_validate_campaign_goal') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['campaign_name', 'customer_id', 'manager_customer_id', 'operation']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            $name = $payload['campaign_name'] ?? null;
            if ($managerId === null || $customerId === null || !is_string($name) || trim($name) !== $name || $name === '' || strlen($name) > 255) throw new HubGoogleAdsApiException('invalid_payload', 400);
            if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
            $token = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_campaign_creation_authorize($config, $token, $managerId, $customerId);
            $rows = hub_google_ads_search($customerId, 'SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.name = ' . hub_google_ads_campaign_creation_gaql_string($name) . " AND campaign.status != 'REMOVED' LIMIT 2", $token, $managerId);
            if (count($rows) !== 1 || ($rows[0]['campaign']['name'] ?? null) !== $name || ($rows[0]['campaign']['status'] ?? null) !== 'PAUSED') throw new HubGoogleAdsApiException('campaign_creation_unverified', 409);
            $campaignId = (string)($rows[0]['campaign']['id'] ?? '');
            if (preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $goal = hub_google_ads_campaign_creation_resolve_custom_goal($token, $managerId, $customerId);
            if (preg_match('#^customers/([1-9][0-9]{9})/customConversionGoals/([1-9][0-9]{0,19})$#D', $goal['resource_name'], $relativeGoalMatch) !== 1) throw new HubGoogleAdsApiException('campaign_conversion_goal_unavailable', 422);
            // Temporary validateOnly probe: reference the same goal ID from the campaign account.
            $relativeGoal = 'customers/' . $customerId . '/customConversionGoals/' . $relativeGoalMatch[2];
            $body = json_encode(['validateOnly' => true, 'operations' => [['update' => ['resourceName' => 'customers/' . $customerId . '/conversionGoalCampaignConfigs/' . $campaignId, 'customConversionGoal' => $relativeGoal], 'updateMask' => 'customConversionGoal']]], JSON_UNESCAPED_SLASHES);
            $apiPath = 'customers/' . $customerId . '/conversionGoalCampaignConfigs:mutate';
            $operationUnits = hub_google_ads_quota_operation_units('POST', $apiPath, $body);
            hub_google_ads_quota_operation_attempted($operationUnits);
            $response = hub_google_ads_http('https://googleads.googleapis.com/' . HUB_GOOGLE_ADS_API_VERSION . '/' . $apiPath, 'POST', ['Authorization: Bearer ' . $token, 'Accept: application/json', 'Content-Type: application/json', 'login-customer-id: ' . $managerId], $body);
            if ((int)($response['status'] ?? 0) >= 100) hub_google_ads_quota_operation_confirmed($operationUnits);
            $raw = json_decode($response['body'], true); $codes = []; $paths = [];
            $details = $raw['error']['details'] ?? [];
            if (is_array($details)) foreach ($details as $detail) if (is_array($detail['errors'] ?? null)) foreach ($detail['errors'] as $item) if (is_array($item['errorCode'] ?? null)) foreach ($item['errorCode'] as $category => $code) {
                if (is_string($category) && preg_match('/^[A-Za-z][A-Za-z0-9_]{0,59}$/D', $category) && is_string($code) && preg_match('/^[A-Z][A-Z0-9_]{0,79}$/D', $code)) $codes[] = $category . '.' . $code;
            }
            if (is_array($details)) foreach ($details as $detail) if (is_array($detail['errors'] ?? null)) foreach ($detail['errors'] as $item) {
                $elements = $item['location']['fieldPathElements'] ?? [];
                if (!is_array($elements)) continue;
                $parts = [];
                foreach ($elements as $element) if (is_array($element) && is_string($element['fieldName'] ?? null) && preg_match('/^[A-Za-z][A-Za-z0-9_]{0,60}$/D', $element['fieldName'])) $parts[] = $element['fieldName'];
                if ($parts) $paths[] = implode('.', $parts);
            }
            $goalCustomerId = '';
            if (preg_match('#^customers/([1-9][0-9]{9})/customConversionGoals/[1-9][0-9]{0,19}$#D', $goal['resource_name'], $goalMatch)) $goalCustomerId = $goalMatch[1];
            hub_google_ads_campaign_action_json(200, ['ok' => true, 'schema_version' => 1, 'operation' => $operation, 'validated' => $response['status'] >= 200 && $response['status'] < 300 && is_array($raw) && !isset($raw['error']), 'google_http_status' => $response['status'], 'google_error_codes' => array_slice(array_values(array_unique($codes)), 0, 5), 'field_paths' => array_slice(array_values(array_unique($paths)), 0, 5), 'manager_customer_id' => $managerId, 'campaign_customer_id' => $customerId, 'goal_customer_id' => $goalCustomerId, 'goal_reference_customer_id' => $customerId, 'campaign_id' => $campaignId]);
        }
        if ($operation === 'inspect_campaign_goal') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['campaign_name', 'customer_id', 'manager_customer_id', 'operation']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
            $name = $payload['campaign_name'] ?? null;
            if ($managerId === null || $customerId === null || !is_string($name) || trim($name) !== $name || $name === '' || strlen($name) > 255) throw new HubGoogleAdsApiException('invalid_payload', 400);
            if (!hub_google_ads_campaign_creation_enabled($config) || !hub_google_ads_campaign_manager_is_allowed($config, $managerId)) throw new HubGoogleAdsApiException('campaign_creation_disabled', 403);
            $token = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_campaign_creation_authorize($config, $token, $managerId, $customerId);
            $query = 'SELECT campaign.id, campaign.name, campaign.status, conversion_goal_campaign_config.goal_config_level, conversion_goal_campaign_config.custom_conversion_goal, custom_conversion_goal.name, custom_conversion_goal.status, custom_conversion_goal.conversion_actions FROM conversion_goal_campaign_config WHERE campaign.name = ' . hub_google_ads_campaign_creation_gaql_string($name) . " AND campaign.status != 'REMOVED' LIMIT 2";
            $rows = hub_google_ads_search($customerId, $query, $token, $managerId);
            if (count($rows) > 1) throw new HubGoogleAdsApiException('campaign_name_conflict', 409);
            $row = $rows[0] ?? null;
            $actions = [];
            $standardGoals = [];
            if (is_array($row)) {
                $inspectedCampaignId = (string)($row['campaign']['id'] ?? '');
                if (preg_match('/^[1-9][0-9]{0,19}$/D', $inspectedCampaignId) !== 1) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                $standardRows = hub_google_ads_search($customerId, 'SELECT campaign_conversion_goal.category, campaign_conversion_goal.origin FROM campaign_conversion_goal WHERE campaign.id = ' . $inspectedCampaignId . ' AND campaign_conversion_goal.biddable = TRUE LIMIT 101', $token, $managerId);
                if (count($standardRows) > 100) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                foreach ($standardRows as $standardRow) {
                    $standard = $standardRow['campaignConversionGoal'] ?? null;
                    if (!is_array($standard) || !is_string($standard['category'] ?? null) || !is_string($standard['origin'] ?? null)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
                    $standardGoals[] = ['category' => $standard['category'], 'origin' => $standard['origin'], 'biddable' => true];
                }
            }
            $resources = is_array($row) ? ($row['customConversionGoal']['conversionActions'] ?? []) : [];
            if (is_array($resources)) foreach ($resources as $resource) {
                if (!is_string($resource) || preg_match('#^customers/([1-9][0-9]{9})/conversionActions/[1-9][0-9]{0,19}$#D', $resource, $match) !== 1) continue;
                $actionRows = hub_google_ads_search($match[1], 'SELECT conversion_action.resource_name, conversion_action.name, conversion_action.status, conversion_action.category, conversion_action.type FROM conversion_action WHERE conversion_action.resource_name = ' . hub_google_ads_campaign_creation_gaql_string($resource) . ' LIMIT 2', $token, $managerId);
                foreach ($actionRows as $actionRow) if (is_array($actionRow['conversionAction'] ?? null)) $actions[] = $actionRow['conversionAction'];
            }
            hub_google_ads_campaign_action_json(200, ['ok' => true, 'schema_version' => 1, 'operation' => $operation, 'found' => count($rows) === 1, 'result' => $row, 'actions' => $actions, 'standard_goals_checked' => count($rows) === 1, 'standard_goals' => $standardGoals]);
        }
        if ($operation === 'preview_search_campaign' || $operation === 'create_search_campaign') {
            $result = hub_google_ads_campaign_creation_preview_or_create($config, $payload, $operation === 'create_search_campaign');
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'apply_audience_targeting') {
            [$managerId, $customerId, $campaignId, $adGroupId, $audienceIds] = hub_google_ads_campaign_audience_targeting_validate_payload($payload);
            $result = hub_google_ads_campaign_audience_targeting_apply($config, $managerId, $customerId, $campaignId, $adGroupId, $audienceIds);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'apply_configured_audience_targeting') {
            [$managerId, $customerId, $campaignId, $adGroupId, $audienceIds] = hub_google_ads_campaign_configured_audience_targeting_validate_payload($payload);
            $result = hub_google_ads_campaign_audience_targeting_apply($config, $managerId, $customerId, $campaignId, $adGroupId, $audienceIds);
            $result['operation'] = 'apply_configured_audience_targeting';
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'apply_audience_exclusions') {
            [$managerId, $customerId, $campaignId] = hub_google_ads_campaign_audience_exclusions_validate_payload($payload);
            $result = hub_google_ads_campaign_audience_exclusions_apply($config, $managerId, $customerId, $campaignId);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'audience_targeting_upload_csv') {
            [$managerId, $groups] = hub_google_ads_campaign_audience_targeting_upload_validate_payload($payload);
            if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
            }
            $csv = hub_google_ads_campaign_audience_targeting_upload_csv($groups);
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'operation' => 'audience_targeting_upload_csv',
                'manager_customer_id' => $managerId,
                'audience_count' => 918,
                'group_count' => count($groups),
                'row_count' => count($groups) * 918,
                'csv_content' => $csv,
            ]);
        }
        if ($operation === 'audience_targeting_upload_csv_stream') {
            [$managerId, $groups] = hub_google_ads_campaign_audience_targeting_upload_validate_payload($payload, 'audience_targeting_upload_csv_stream');
            if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
            }
            hub_google_ads_campaign_audience_targeting_upload_csv_stream($managerId, $groups);
        }
        if ($operation === 'audience_exclusion_upload_catalog') {
            [$managerId, $customerId, $campaignIds] = hub_google_ads_campaign_audience_exclusion_upload_validate_payload($payload);
            if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
                throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
            }
            $audiences = hub_google_ads_campaign_audience_exclusion_upload_catalog();
            hub_google_ads_campaign_action_json(200, [
                'ok' => true,
                'schema_version' => 1,
                'operation' => 'audience_exclusion_upload_catalog',
                'customer_id' => $customerId,
                'campaign_count' => count($campaignIds),
                'exclusion_count_per_campaign' => count($audiences),
                'audiences' => $audiences,
            ]);
        }
        if ($operation === 'apply_campaign_sitelinks') {
            [$managerId, $customerId, $campaignId, $sitelinks] = hub_google_ads_campaign_sitelinks_validate_payload($payload);
            $result = hub_google_ads_campaign_sitelinks_apply($config, $managerId, $customerId, $campaignId, $sitelinks);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'apply_campaign_destination_url') {
            [$managerId, $customerId, $campaignId, $batchCampaignIds, $finalUrl] = hub_google_ads_campaign_destination_url_validate_payload($payload);
            $result = hub_google_ads_campaign_destination_url_apply($config, $managerId, $customerId, $campaignId, $batchCampaignIds, $finalUrl);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'upload_campaign_image_asset') {
            [$managerId, $customerId, $batchCampaignIds, $fileName, $imageBase64, $imageHash] = hub_google_ads_campaign_image_upload_validate_payload($payload);
            $result = hub_google_ads_campaign_image_asset_upload($config, $managerId, $customerId, $batchCampaignIds, $fileName, $imageBase64, $imageHash);
            hub_google_ads_campaign_action_json(200, $result);
        }
        if ($operation === 'preview_product_negative_keyword') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_product_negative_keyword_preview($config, $payload));
        }
        if ($operation === 'apply_product_negative_keyword') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_product_negative_keyword_apply($config, $payload));
        }
        if ($operation === 'preview_batch_negative_keywords') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_batch_negative_keywords_preview($config, $payload));
        }
        if ($operation === 'apply_batch_negative_keywords') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_batch_negative_keywords_apply($config, $payload));
        }
        if ($operation === 'adjust_campaign_target_cpa') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_target_cpa_adjust($config, $payload));
        }
        if ($operation === 'adjust_campaign_daily_budget') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_campaign_daily_budget_adjust($config, $payload));
        }
        if ($operation === 'preview_batch_positive_keywords') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_batch_positive_keywords_preview($config, $payload));
        }
        if ($operation === 'apply_batch_positive_keywords') {
            hub_google_ads_campaign_action_json(200, hub_google_ads_batch_positive_keywords_apply($config, $payload));
        }        if (!in_array($operation, ['pause_campaign', 'enable_campaign'], true)) {
            hub_google_ads_campaign_action_json(400, ['ok' => false, 'error' => 'invalid_payload']);
        }

        [$managerId, $customerId, $campaignId, $operation, $expectedStatus, $targetStatus, $notificationContext] = hub_google_ads_campaign_action_validate_status_change($payload);
        if (!hub_google_ads_campaign_actions_enabled($config)) {
            throw new HubGoogleAdsApiException('campaign_writes_disabled', 403);
        }
        if (!hub_google_ads_campaign_manager_is_allowed($config, $managerId)) {
            throw new HubGoogleAdsApiException('campaign_account_not_allowed', 403);
        }
        $result = hub_google_ads_change_campaign_status(
            $config,
            $managerId,
            $customerId,
            $campaignId,
            $operation,
            $expectedStatus,
            $targetStatus
        );
        if ($notificationContext !== null && $operation === 'pause_campaign') {
            $result['email_notification_status'] = $result['changed'] === true && $result['status'] === 'PAUSED'
                ? google_ads_campaign_pause_email_queue_verified_transition(
                    $config,
                    $managerId,
                    $customerId,
                    $campaignId,
                    (string)($result['campaign_name'] ?? ''),
                    (string)google_ads_campaign_pause_email_reason_from_context($notificationContext),
                    (string)($result['verified_at_utc'] ?? '')
                )
                : 'not_queued_no_change';
        }
        hub_google_ads_campaign_action_json(200, $result);
    } catch (HubGoogleAdsApiException $error) {
        hub_google_ads_campaign_action_json($error->httpStatus, ['ok' => false, 'error' => $error->apiCode]);
    } catch (Throwable $error) {
        error_log('Google Ads campaign action request failed.');
        hub_google_ads_campaign_action_json(500, ['ok' => false, 'error' => 'server_error', 'failure' => hub_google_ads_campaign_action_safe_failure($error)]);
    }
}
