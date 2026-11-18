<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-action-service.php';

const HUB_AUTO_PAUSE_MAX_BODY_BYTES = 1048576;
const HUB_AUTO_PAUSE_MAX_JOBS = 500;
const HUB_AUTO_PAUSE_SNAPSHOT_MAX_BYTES = 8388608;
const HUB_AUTO_PAUSE_SNAPSHOT_PART_BYTES = 655360;
const HUB_AUTO_PAUSE_SNAPSHOT_MAX_PARTS = 13;
const HUB_AUTO_PAUSE_SIMULATION_RULE_CODE = 'queue_simulation';

function hub_auto_pause_json(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function hub_auto_pause_uuid(mixed $value): ?string
{
    return is_string($value) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $value) === 1
        ? strtolower($value) : null;
}

function hub_auto_pause_new_uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function hub_auto_pause_utc(mixed $value): ?string
{
    if (!is_string($value) || strlen($value) > 40
        || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/D', $value) !== 1) return null;
    try { return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v'); }
    catch (Throwable) { return null; }
}

function hub_auto_pause_iso_date(mixed $value): bool
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) return false;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('UTC'));
    return $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $value;
}

function hub_auto_pause_pdo(array $config): PDO
{
    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
        if (!is_string($config[$key] ?? null) || $config[$key] === '') throw new RuntimeException('api_not_configured');
    }
    return new PDO('mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
        $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
}

function hub_auto_pause_normalize_gurumedia_protection(mixed $value): array
{
    if (!is_array($value) || array_is_list($value)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $keys = array_keys($value); sort($keys, SORT_STRING);
    if ($keys !== ['campaigns', 'generatedAtUtc', 'status']
        || !in_array($value['status'] ?? null, ['available', 'incomplete', 'unavailable', 'capacity_exceeded'], true)
        || !is_array($value['campaigns'] ?? null) || !array_is_list($value['campaigns']) || count($value['campaigns']) > 5000
        || !(($value['generatedAtUtc'] ?? null) === null || hub_auto_pause_utc($value['generatedAtUtc']) !== null)
        || (($value['status'] ?? null) === 'available' && hub_auto_pause_utc($value['generatedAtUtc'] ?? null) === null)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $campaigns = []; $seen = [];
    foreach ($value['campaigns'] as $campaign) {
        if (!is_array($campaign) || array_is_list($campaign)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $campaignKeys = array_keys($campaign); sort($campaignKeys, SORT_STRING);
        if ($campaignKeys !== ['campaignId', 'customerId', 'managerCustomerId']) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $manager = hub_google_ads_valid_customer_id($campaign['managerCustomerId']);
        $customer = hub_google_ads_valid_customer_id($campaign['customerId']);
        $campaignId = $campaign['campaignId'];
        if ($manager === null || $customer === null || !is_string($campaignId) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $key = json_encode([$manager, $customer, $campaignId], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (isset($seen[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $seen[$key] = true;
        $campaigns[] = ['managerCustomerId' => $manager, 'customerId' => $customer, 'campaignId' => $campaignId];
    }
    usort($campaigns, static fn(array $a, array $b): int => [$a['managerCustomerId'], $a['customerId'], $a['campaignId']] <=> [$b['managerCustomerId'], $b['customerId'], $b['campaignId']]);
    return ['status' => $value['status'], 'generatedAtUtc' => $value['generatedAtUtc'], 'campaigns' => $campaigns];
}

function hub_auto_pause_merge_gurumedia_protection(array $policy, ?array $currentPolicy): array
{
    if ($currentPolicy === null) return $policy;
    $merged = [];
    foreach ([...($currentPolicy['guruMediaSaleProtection']['campaigns'] ?? []), ...($policy['guruMediaSaleProtection']['campaigns'] ?? [])] as $item) {
        $key = json_encode([$item['managerCustomerId'], $item['customerId'], $item['campaignId']], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $merged[$key] = $item;
    }
    $protection = $policy['guruMediaSaleProtection'];
    if (($currentPolicy['guruMediaSaleProtection']['status'] ?? null) === 'capacity_exceeded' || count($merged) > 5000) {
        $protection['status'] = 'capacity_exceeded';
        $merged = array_slice($merged, 0, 5000, true);
    }
    $protection['campaigns'] = array_values($merged);
    $policy['guruMediaSaleProtection'] = hub_auto_pause_normalize_gurumedia_protection($protection);
    return $policy;
}

function hub_auto_pause_policy_behavioral_json(array $policy): string
{
    unset($policy['guruMediaSaleProtection']);
    ksort($policy, SORT_STRING);
    return json_encode($policy, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

function hub_auto_pause_validate_policy(mixed $policy): array
{
    if (!is_array($policy) || array_is_list($policy)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    if (!array_key_exists('campaignExceptions', $policy)) $policy['campaignExceptions'] = [];
    if (!array_key_exists('additionalDelayMinutes', $policy)) $policy['additionalDelayMinutes'] = 15;
    if (!array_key_exists('guruMediaSaleProtection', $policy)) $policy['guruMediaSaleProtection'] = ['status' => 'unavailable', 'generatedAtUtc' => null, 'campaigns' => []];
    $keys = array_keys($policy); sort($keys, SORT_STRING);
    if ($keys !== ['additionalDelayMinutes', 'campaignExceptions', 'confirmationSeconds', 'guruMediaSaleProtection', 'maxRetainedSnapshots', 'rules', 'snapshotIntervalMinutes', 'version']
        || ($policy['version'] ?? null) !== 1
        || !is_int($policy['snapshotIntervalMinutes'] ?? null) || $policy['snapshotIntervalMinutes'] < 1 || $policy['snapshotIntervalMinutes'] > 10080
        || !is_int($policy['additionalDelayMinutes'] ?? null) || $policy['additionalDelayMinutes'] < 0 || $policy['additionalDelayMinutes'] > 1440
        || !is_int($policy['confirmationSeconds'] ?? null) || $policy['confirmationSeconds'] < 1 || $policy['confirmationSeconds'] > 3600
        || !is_int($policy['maxRetainedSnapshots'] ?? null) || $policy['maxRetainedSnapshots'] < 1 || $policy['maxRetainedSnapshots'] > 100
        || !is_array($policy['rules'] ?? null) || array_is_list($policy['rules'])) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $allowedExceptionRules = ['negative_remaining', 'product_performance', 'minimum_product_performance', 'reference_competitor', 'campaign_age', 'campaign_zero_impressions', 'clicks_without_sale'];
    if (!is_array($policy['campaignExceptions']) || !array_is_list($policy['campaignExceptions']) || count($policy['campaignExceptions']) > 5000) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $exceptions = []; $seenExceptions = [];
    foreach ($policy['campaignExceptions'] as $exception) {
        if (!is_array($exception) || array_is_list($exception)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $exceptionKeys = array_keys($exception); sort($exceptionKeys, SORT_STRING);
        if ($exceptionKeys !== ['campaignId', 'customerId', 'excludedRules', 'managerCustomerId']
            || !is_array($exception['excludedRules']) || !array_is_list($exception['excludedRules']) || count($exception['excludedRules']) < 1 || count($exception['excludedRules']) > count($allowedExceptionRules)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $manager = hub_google_ads_valid_customer_id($exception['managerCustomerId']);
        $customer = hub_google_ads_valid_customer_id($exception['customerId']);
        $campaign = $exception['campaignId'];
        if ($manager === null || $customer === null
            || !is_string($campaign) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaign) !== 1) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $excluded = array_values(array_unique($exception['excludedRules']));
        foreach ($excluded as $rule) if (!is_string($rule) || !in_array($rule, $allowedExceptionRules, true)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        sort($excluded, SORT_STRING);
        $key = json_encode([$manager, $customer, $campaign], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (isset($seenExceptions[$key])) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $seenExceptions[$key] = true;
        $exceptions[] = ['managerCustomerId' => $manager, 'customerId' => $customer, 'campaignId' => $campaign, 'excludedRules' => $excluded];
    }
    usort($exceptions, static fn(array $a, array $b): int => [$a['managerCustomerId'], $a['customerId'], $a['campaignId']] <=> [$b['managerCustomerId'], $b['customerId'], $b['campaignId']]);
    $policy['campaignExceptions'] = $exceptions;
    $policy['guruMediaSaleProtection'] = hub_auto_pause_normalize_gurumedia_protection($policy['guruMediaSaleProtection']);
    $rules = $policy['rules']; $ruleKeys = array_keys($rules); sort($ruleKeys, SORT_STRING);
    if ($ruleKeys !== ['campaign_age', 'campaign_zero_impressions', 'clicks_without_sale', 'negative_remaining', 'product_performance', 'reference_competitor']) throw new HubGoogleAdsApiException('invalid_payload', 400);
    if (!is_array($rules['negative_remaining']) || array_is_list($rules['negative_remaining'])
        || array_keys($rules['negative_remaining']) !== ['enabled'] || !is_bool($rules['negative_remaining']['enabled'] ?? null)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $zeroImpressions = $rules['campaign_zero_impressions'];
    $zeroKeys = array_keys($zeroImpressions); sort($zeroKeys, SORT_STRING);
    if ($zeroKeys !== ['enabled', 'thresholdDays'] || !is_bool($zeroImpressions['enabled'] ?? null)
        || !is_int($zeroImpressions['thresholdDays'] ?? null) || $zeroImpressions['thresholdDays'] < 1 || $zeroImpressions['thresholdDays'] > 3650) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $product = $rules['product_performance']; $productKeys = array_keys($product); sort($productKeys, SORT_STRING);
    if ($productKeys !== ['enabled', 'impressionThreshold', 'impressionWindowHours', 'minimumCampaigns', 'minimumClicks', 'requireRedDot']
        || !is_bool($product['enabled'] ?? null) || !is_bool($product['requireRedDot'] ?? null)
        || !is_int($product['minimumCampaigns'] ?? null) || $product['minimumCampaigns'] < 2 || $product['minimumCampaigns'] > 100
        || !is_int($product['minimumClicks'] ?? null) || $product['minimumClicks'] < 1 || $product['minimumClicks'] > 100000
        || !is_int($product['impressionThreshold'] ?? null) || $product['impressionThreshold'] < 1 || $product['impressionThreshold'] > 1000000
        || !is_int($product['impressionWindowHours'] ?? null) || $product['impressionWindowHours'] < 1 || $product['impressionWindowHours'] > 24) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $age = $rules['campaign_age']; $ageKeys = array_keys($age); sort($ageKeys, SORT_STRING);
    if ($ageKeys !== ['enabled', 'maxImpressions', 'thresholdDays'] || !is_bool($age['enabled'] ?? null)
        || !is_int($age['thresholdDays'] ?? null) || $age['thresholdDays'] < 1 || $age['thresholdDays'] > 3650
        || !is_int($age['maxImpressions'] ?? null) || $age['maxImpressions'] < 0 || $age['maxImpressions'] > 2147483647) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $clicks = $rules['clicks_without_sale']; $clickKeys = array_keys($clicks); sort($clickKeys, SORT_STRING);
    if ($clickKeys !== ['enabled', 'thresholdClicks'] || !is_bool($clicks['enabled'] ?? null)
        || !is_int($clicks['thresholdClicks'] ?? null) || $clicks['thresholdClicks'] < 0 || $clicks['thresholdClicks'] > 99) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $reference = $rules['reference_competitor']; $referenceKeys = array_keys($reference); sort($referenceKeys, SORT_STRING);
    if ($referenceKeys !== ['competitorMinImpressions', 'enabled', 'maxPausesPerProductPerSnapshot', 'referenceClicks', 'referenceImpressions']) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if (!is_bool($reference['enabled'] ?? null)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    foreach (['competitorMinImpressions', 'referenceClicks', 'referenceImpressions'] as $key) {
        if (!is_int($reference[$key]) || $reference[$key] < 0 || $reference[$key] > 2147483647) throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    if (!is_int($reference['maxPausesPerProductPerSnapshot']) || $reference['maxPausesPerProductPerSnapshot'] < 1 || $reference['maxPausesPerProductPerSnapshot'] > 100) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return $policy;
}

function hub_auto_pause_validate_job(mixed $job, string $snapshotId, array $policy): array
{
    if (!is_array($job) || array_is_list($job)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $keys = array_keys($job); sort($keys, SORT_STRING);
    if ($keys !== ['campaign_id', 'campaign_name', 'customer_id', 'has_diary_sale', 'manager_customer_id', 'product_key', 'reason_context', 'rule_code'])
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    $rule = $job['rule_code'];
    if (!in_array($rule, ['negative_remaining', 'reference_competitor', 'campaign_zero_impressions', 'product_performance', 'campaign_age', 'clicks_without_sale'], true) || ($policy['rules'][$rule]['enabled'] ?? false) !== true
        || ($job['has_diary_sale'] ?? null) !== false) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $manager = hub_google_ads_valid_customer_id($job['manager_customer_id']);
    $customer = hub_google_ads_valid_customer_id($job['customer_id']);
    $campaign = $job['campaign_id']; $product = $job['product_key']; $name = $job['campaign_name'];
    if ($manager === null || $customer === null || !hub_google_ads_campaign_manager_is_allowed($GLOBALS['hub_auto_pause_config'] ?? [], $manager)
        || !is_string($campaign) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaign) !== 1
        || !is_string($product) || trim($product) === '' || strlen($product) > 190
        || !is_string($name) || trim($name) === '' || strlen($name) > 255
        || !is_array($job['reason_context']) || array_is_list($job['reason_context'])) throw new HubGoogleAdsApiException('invalid_payload', 400);
    $context = $job['reason_context'];
    $contextJson = json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($contextJson) || strlen($contextJson) > 12000) throw new HubGoogleAdsApiException('invalid_payload', 400);
    return ['job_id' => hub_auto_pause_uuid($snapshotId) === null ? '' : hub_auto_pause_job_id($snapshotId, $product, $rule, $campaign),
        'snapshot_id' => $snapshotId, 'product_key' => trim($product), 'rule_code' => $rule,
        'manager_customer_id' => $manager, 'customer_id' => $customer, 'campaign_id' => $campaign,
        'campaign_name' => trim($name), 'reason_context_json' => $contextJson];
}

function hub_auto_pause_job_id(string $snapshotId, string $productKey, string $rule, string $campaignId): string
{
    $hex = substr(hash('sha256', $snapshotId . "\0" . $productKey . "\0" . $rule . "\0" . $campaignId), 0, 32);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-5' . substr($hex, 13, 3) . '-a' . substr($hex, 17, 3) . '-' . substr($hex, 20, 12);
}

function hub_auto_pause_read_json_body(): array
{
    $length = filter_var($_SERVER['CONTENT_LENGTH'] ?? null, FILTER_VALIDATE_INT);
    if ($length !== false && $length > HUB_AUTO_PAUSE_MAX_BODY_BYTES) throw new HubGoogleAdsApiException('payload_too_large', 413);
    $raw = file_get_contents('php://input', false, null, 0, HUB_AUTO_PAUSE_MAX_BODY_BYTES + 1);
    if (!is_string($raw) || strlen($raw) > HUB_AUTO_PAUSE_MAX_BODY_BYTES) throw new HubGoogleAdsApiException('payload_too_large', 413);
    $payload = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($payload) || array_is_list($payload)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    return $payload;
}

function hub_auto_pause_snapshot_payload(mixed $snapshot, string $envelopeCompletedAt, int $schemaVersion = 1): array
{
    if (!is_array($snapshot) || array_is_list($snapshot)) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
    $keys = array_keys($snapshot); sort($keys, SORT_STRING);
    $required = ['accountCount', 'accounts', 'campaignCount', 'completedAtUtc', 'executionMode', 'id', 'periodType', 'runId', 'scope'];
    if (in_array($schemaVersion, [2, 3], true)) $required[] = 'evaluationInputs';
    $allowed = [...$required, 'triggerAccountCount', 'triggerReason']; sort($allowed, SORT_STRING);
    if (array_diff($required, $keys) || array_diff($keys, $allowed)
        || ($snapshot['periodType'] ?? null) !== 'D0' || ($snapshot['executionMode'] ?? null) !== 'automatic'
        || !is_string($snapshot['id'] ?? null) || trim($snapshot['id']) === '' || strlen($snapshot['id']) > 160
        || !is_string($snapshot['runId'] ?? null) || trim($snapshot['runId']) === '' || strlen($snapshot['runId']) > 160
        || hub_auto_pause_utc($snapshot['completedAtUtc'] ?? null) !== $envelopeCompletedAt
        || !in_array($snapshot['scope'] ?? null, ['ALL', 'ENABLED'], true)
        || !is_int($snapshot['accountCount'] ?? null) || $snapshot['accountCount'] < 1 || $snapshot['accountCount'] > 1000
        || !is_int($snapshot['campaignCount'] ?? null) || $snapshot['campaignCount'] < 0 || $snapshot['campaignCount'] > 100000
        || !is_array($snapshot['accounts'] ?? null) || !array_is_list($snapshot['accounts'])
        || count($snapshot['accounts']) !== $snapshot['accountCount']) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
    if (isset($snapshot['triggerReason']) && $snapshot['triggerReason'] !== 'account_directory_change') throw new HubGoogleAdsApiException('invalid_snapshot', 400);
    if (isset($snapshot['triggerAccountCount']) && (!is_int($snapshot['triggerAccountCount']) || $snapshot['triggerAccountCount'] < 1 || $snapshot['triggerAccountCount'] > 1000)) throw new HubGoogleAdsApiException('invalid_snapshot', 400);

    $campaignTotal = 0; $seenAccounts = [];
    foreach ($snapshot['accounts'] as $account) {
        if (!is_array($account) || array_is_list($account)) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
        $accountKeys = array_keys($account); sort($accountKeys, SORT_STRING);
        $expectedAccountKeys = ['accountName', 'campaigns', 'configurationComplete', 'configurationGeneratedAtUtc', 'currencyCode', 'customerId', 'date', 'exchangeRateUsdBrl', 'managerCustomerId', 'managerName', 'queryComplete', 'scope', 'timeZone']; sort($expectedAccountKeys, SORT_STRING);
        if ($accountKeys !== $expectedAccountKeys
            || hub_google_ads_valid_customer_id($account['customerId'] ?? null) === null
            || !(($account['managerCustomerId'] ?? null) === null || hub_google_ads_valid_customer_id($account['managerCustomerId']) !== null)
            || !is_string($account['date'] ?? null) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $account['date'])
            || !is_string($account['currencyCode'] ?? null) || !preg_match('/^[A-Z]{3}$/D', $account['currencyCode'])
            || !is_string($account['timeZone'] ?? null) || trim($account['timeZone']) === '' || strlen($account['timeZone']) > 80
            || !in_array($account['scope'] ?? null, ['ALL', 'ENABLED'], true)
            || !is_bool($account['queryComplete'] ?? null) || !is_bool($account['configurationComplete'] ?? null)
            || !is_array($account['campaigns'] ?? null) || !array_is_list($account['campaigns'])
            || !is_string($account['accountName'] ?? null) || strlen($account['accountName']) > 160
            || !is_string($account['managerName'] ?? null) || strlen($account['managerName']) > 100
            || !(($account['configurationGeneratedAtUtc'] ?? null) === null || hub_auto_pause_utc($account['configurationGeneratedAtUtc']) !== null)
            || !(($account['exchangeRateUsdBrl'] ?? null) === null || (is_numeric($account['exchangeRateUsdBrl']) && is_finite((float)$account['exchangeRateUsdBrl']) && (float)$account['exchangeRateUsdBrl'] > 0))) {
            throw new HubGoogleAdsApiException('invalid_snapshot', 400);
        }
        $accountKey = json_encode([$account['managerCustomerId'] ?? 'direct', $account['customerId']], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (isset($seenAccounts[$accountKey])) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
        $seenAccounts[$accountKey] = true; $seenCampaigns = [];
        foreach ($account['campaigns'] as $campaign) {
            if (!is_array($campaign) || array_is_list($campaign)) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
            $campaignKeys = array_keys($campaign); sort($campaignKeys, SORT_STRING);
            $expectedCampaignKeys = ['campaignId', 'campaignInternalId', 'campaignName', 'campaignStatus', 'channelType', 'clicks', 'conversions', 'conversionsValue', 'costMicros', 'impressions', 'inferredZero', 'mappingStatus', 'metricsAvailable', 'zeroEvidence']; sort($expectedCampaignKeys, SORT_STRING);
            if ($campaignKeys !== $expectedCampaignKeys
                || !is_string($campaign['campaignId'] ?? null) || !preg_match('/^[1-9][0-9]{0,19}$/D', $campaign['campaignId'])
                || isset($seenCampaigns[$campaign['campaignId']])
                || !(($campaign['campaignInternalId'] ?? null) === null || (is_string($campaign['campaignInternalId']) && strlen($campaign['campaignInternalId']) <= 160))
                || !is_string($campaign['campaignName'] ?? null) || strlen($campaign['campaignName']) > 240
                || !is_string($campaign['campaignStatus'] ?? null) || strlen($campaign['campaignStatus']) > 40
                || !is_string($campaign['channelType'] ?? null) || strlen($campaign['channelType']) > 60
                || !is_string($campaign['mappingStatus'] ?? null) || !in_array($campaign['mappingStatus'], ['mapped', 'unmapped', 'ambiguous', 'mapping_conflict'], true)
                || !is_bool($campaign['inferredZero'] ?? null) || !is_bool($campaign['metricsAvailable'] ?? null)
                || !(($campaign['zeroEvidence'] ?? null) === null || (is_string($campaign['zeroEvidence']) && strlen($campaign['zeroEvidence']) <= 80))) {
                throw new HubGoogleAdsApiException('invalid_snapshot', 400);
            }
            foreach (['impressions', 'clicks', 'conversions', 'costMicros', 'conversionsValue'] as $metric) {
                $value = $campaign[$metric] ?? null;
                if ($value !== null && (!is_numeric($value) || !is_finite((float)$value) || (float)$value < 0)) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
            }
            $seenCampaigns[$campaign['campaignId']] = true; $campaignTotal++;
        }
    }
    if ($campaignTotal < $snapshot['campaignCount']) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
    if (in_array($schemaVersion, [2, 3], true)) {
        $inputs = $snapshot['evaluationInputs'];
        if (!is_array($inputs) || array_is_list($inputs)) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
        $inputKeys = array_keys($inputs); sort($inputKeys, SORT_STRING);
        $inputVersion = $schemaVersion === 3 ? 2 : 1;
        if ($inputKeys !== ['campaigns', 'generatedAtUtc', 'version'] || ($inputs['version'] ?? null) !== $inputVersion
            || hub_auto_pause_utc($inputs['generatedAtUtc'] ?? null) !== $envelopeCompletedAt
            || !is_array($inputs['campaigns'] ?? null) || !array_is_list($inputs['campaigns'])
            || count($inputs['campaigns']) !== $campaignTotal) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
        $facts = [];
        foreach ($inputs['campaigns'] as $fact) {
            if (!is_array($fact) || array_is_list($fact)) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
            $factKeys = array_keys($fact); sort($factKeys, SORT_STRING);
            $expectedFactKeys = ['ageReferenceDate', 'campaignId', 'campaignInternalId', 'customerId', 'excludedAsHistorical', 'lifetimeImpressions', 'lifetimeImpressionsObservedCount', 'managerCustomerId', 'startDate', 'startDateSource', 'zeroImpressionReferenceDate', 'zeroImpressionStreakDays'];
            if ($schemaVersion === 3) $expectedFactKeys[] = 'remainingValue';
            sort($expectedFactKeys, SORT_STRING);
            if ($factKeys !== $expectedFactKeys
                || !(($fact['managerCustomerId'] ?? null) === null || hub_google_ads_valid_customer_id($fact['managerCustomerId']) !== null)
                || hub_google_ads_valid_customer_id($fact['customerId'] ?? null) === null
                || !is_string($fact['campaignId'] ?? null) || !preg_match('/^[1-9][0-9]{0,19}$/D', $fact['campaignId'])
                || !(($fact['campaignInternalId'] ?? null) === null || (is_string($fact['campaignInternalId']) && strlen($fact['campaignInternalId']) <= 160))
                || !is_bool($fact['excludedAsHistorical'] ?? null)
                || !(($fact['startDate'] ?? null) === null || hub_auto_pause_iso_date($fact['startDate']))
                || !(($fact['startDateSource'] ?? null) === null || in_array($fact['startDateSource'], ['confirmed', 'identity'], true))
                || (($fact['startDate'] ?? null) === null) !== (($fact['startDateSource'] ?? null) === null)
                || !(($fact['ageReferenceDate'] ?? null) === null || hub_auto_pause_iso_date($fact['ageReferenceDate']))
                || !(($fact['lifetimeImpressions'] ?? null) === null || (is_int($fact['lifetimeImpressions']) && $fact['lifetimeImpressions'] >= 0))
                || !(($fact['lifetimeImpressionsObservedCount'] ?? null) === null || (is_int($fact['lifetimeImpressionsObservedCount']) && $fact['lifetimeImpressionsObservedCount'] > 0))
                || (($fact['lifetimeImpressions'] ?? null) === null) !== (($fact['lifetimeImpressionsObservedCount'] ?? null) === null)
                || !(($fact['zeroImpressionStreakDays'] ?? null) === null || (is_int($fact['zeroImpressionStreakDays']) && $fact['zeroImpressionStreakDays'] >= 0))
                || !(($fact['zeroImpressionReferenceDate'] ?? null) === null || hub_auto_pause_iso_date($fact['zeroImpressionReferenceDate']))
                || (($fact['zeroImpressionStreakDays'] ?? null) === null) !== (($fact['zeroImpressionReferenceDate'] ?? null) === null)
                || ($schemaVersion === 3 && !(($fact['remainingValue'] ?? null) === null || ((is_int($fact['remainingValue']) || is_float($fact['remainingValue'])) && is_finite((float)$fact['remainingValue']))))) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
            $key = json_encode([$fact['managerCustomerId'], $fact['customerId'], $fact['campaignId']], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            if (isset($facts[$key])) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
            $facts[$key] = true;
        }
        foreach ($snapshot['accounts'] as $account) foreach ($account['campaigns'] as $campaign) {
            $key = json_encode([$account['managerCustomerId'] ?? '', $account['customerId'], $campaign['campaignId']], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            if (!isset($facts[$key])) throw new HubGoogleAdsApiException('invalid_snapshot', 400);
        }
    } elseif (array_key_exists('evaluationInputs', $snapshot)) {
        throw new HubGoogleAdsApiException('invalid_snapshot', 400);
    }
    return $snapshot;
}

function hub_auto_pause_prune_snapshot_payloads(PDO $pdo, int $keep): void
{
    $keep = max(1, min(100, $keep));
    $old = $pdo->query("SELECT p.snapshot_id FROM google_ads_auto_pause_snapshot_payloads p WHERE NOT EXISTS (SELECT 1 FROM google_ads_auto_pause_jobs j WHERE j.snapshot_id=p.snapshot_id AND j.state IN ('pending','processing')) ORDER BY p.completed_at_utc DESC,p.received_at_utc DESC LIMIT 18446744073709551615 OFFSET " . $keep)->fetchAll(PDO::FETCH_COLUMN);
    if (!$old) return;
    $placeholders = implode(',', array_fill(0, count($old), '?'));
    $pdo->prepare("DELETE FROM google_ads_auto_pause_snapshot_payloads WHERE snapshot_id IN ($placeholders)")->execute($old);
}

function hub_auto_pause_snapshot_keep_limit(PDO $pdo): int
{
    $row = $pdo->query('SELECT config_json FROM google_ads_auto_pause_config WHERE config_id=1')->fetch();
    if (!is_array($row)) return 10;
    try { $policy = hub_auto_pause_validate_policy(json_decode((string)$row['config_json'], true)); }
    catch (Throwable) { return 10; }
    return (int)$policy['maxRetainedSnapshots'];
}

function hub_auto_pause_dispatch(): never
{
    header('Cache-Control: no-store, private'); header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff'); header('Referrer-Policy: no-referrer');
    try {
        $config = hub_google_ads_load_tracking_config(); $GLOBALS['hub_auto_pause_config'] = $config;
        $auth = hub_google_ads_authorize($config);
        if (is_string($auth['origin'] ?? null)) {
            header('Access-Control-Allow-Origin: ' . $auth['origin']); header('Vary: Origin');
            header('Access-Control-Allow-Methods: POST, OPTIONS'); header('Access-Control-Allow-Headers: Authorization, Content-Type');
            header('Access-Control-Max-Age: 300');
        }
        if (($auth['status'] ?? 500) === 204) { http_response_code(204); exit; }
        if (($auth['status'] ?? 500) !== 200) hub_auto_pause_json((int)$auth['status'], ['ok' => false, 'error' => $auth['error'] ?? 'not_authorized']);
        if (($_SERVER['QUERY_STRING'] ?? '') !== '') throw new HubGoogleAdsApiException('invalid_payload', 400);
        $payload = hub_auto_pause_read_json_body(); $operation = $payload['operation'] ?? null;
        if (!is_string($operation)) throw new HubGoogleAdsApiException('invalid_payload', 400);
        $pdo = hub_auto_pause_pdo($config);
        if ($operation === 'authority_status') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['operation']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $authority = $pdo->query('SELECT authority,revision,hub_lease_until_utc,server_started_at_utc FROM google_ads_auto_pause_authority WHERE authority_id=1')->fetch();
            if (!is_array($authority)) throw new HubGoogleAdsApiException('authority_not_initialized', 503);
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'authority' => $authority['authority'], 'revision' => (int)$authority['revision']]);
        }
        if ($operation === 'hub_execution_begin' || $operation === 'hub_execution_heartbeat' || $operation === 'hub_execution_end') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['lease_token', 'operation'] || !is_string($payload['lease_token']) || hub_auto_pause_uuid($payload['lease_token']) === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $token = hub_auto_pause_uuid($payload['lease_token']);
            $pdo->beginTransaction();
            try {
                $authority = $pdo->query('SELECT authority,hub_lease_token,hub_lease_until_utc FROM google_ads_auto_pause_authority WHERE authority_id=1 FOR UPDATE')->fetch();
                if (!is_array($authority)) throw new HubGoogleAdsApiException('authority_not_initialized', 503);
                $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
                $leaseUntil = isset($authority['hub_lease_until_utc']) ? new DateTimeImmutable((string)$authority['hub_lease_until_utc'], new DateTimeZone('UTC')) : null;
                $activeLease = $leaseUntil !== null && $leaseUntil > $now;
                $acquired = false;
                if ($operation === 'hub_execution_begin') {
                    $acquired = $authority['authority'] === 'hub' && (!$activeLease || hash_equals((string)$authority['hub_lease_token'], $token));
                    if ($acquired) $pdo->prepare('UPDATE google_ads_auto_pause_authority SET hub_lease_token=:token,hub_lease_until_utc=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE),updated_at_utc=UTC_TIMESTAMP(3) WHERE authority_id=1')->execute([':token' => $token]);
                } elseif ($operation === 'hub_execution_heartbeat') {
                    $acquired = $authority['authority'] === 'hub' && $activeLease && hash_equals((string)$authority['hub_lease_token'], $token);
                    if ($acquired) $pdo->prepare('UPDATE google_ads_auto_pause_authority SET hub_lease_until_utc=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE),updated_at_utc=UTC_TIMESTAMP(3) WHERE authority_id=1')->execute();
                } else {
                    $acquired = true;
                    if (hash_equals((string)($authority['hub_lease_token'] ?? ''), $token)) $pdo->prepare('UPDATE google_ads_auto_pause_authority SET hub_lease_token=NULL,hub_lease_until_utc=NULL,updated_at_utc=UTC_TIMESTAMP(3) WHERE authority_id=1')->execute();
                }
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'acquired' => $acquired]);
        }
        if ($operation === 'cutover_preflight') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['operation']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $latest = $pdo->query(
                "SELECT source_snapshot_id,evaluated_at_utc,snapshot_state,candidate_count,blocked_rule_count,"
                . "JSON_UNQUOTE(JSON_EXTRACT(result_json,'$.mode')) AS evaluation_mode "
                . 'FROM google_ads_auto_pause_shadow_evaluations ORDER BY evaluated_at_utc DESC LIMIT 1'
            )->fetch();
            $counts = $pdo->query(
                "SELECT SUM(state='pending') AS pending_count,SUM(state='processing') AS processing_count,"
                . "SUM(state='applied') AS applied_count,SUM(state='failed') AS failed_count "
                . "FROM google_ads_auto_pause_jobs WHERE rule_code<>'" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "'"
            )->fetch() ?: [];
            $authority = $pdo->query('SELECT authority,revision,hub_lease_until_utc FROM google_ads_auto_pause_authority WHERE authority_id=1')->fetch();
            if (!is_array($authority)) throw new HubGoogleAdsApiException('authority_not_initialized', 503);
            $leaseUntil = isset($authority['hub_lease_until_utc']) ? new DateTimeImmutable((string)$authority['hub_lease_until_utc'], new DateTimeZone('UTC')) : null;
            $activeLease = $leaseUntil !== null && $leaseUntil > new DateTimeImmutable('now', new DateTimeZone('UTC'));
            $evaluationMode = is_array($latest) ? (string)($latest['evaluation_mode'] ?? '') : '';
            $blockers = [];
            if ($evaluationMode !== 'server') $blockers[] = 'snapshot_evaluator_does_not_create_jobs';
            if (!is_array($latest)) $blockers[] = 'no_snapshot_evaluation_recorded';
            if (is_array($latest) && ((int)($latest['blocked_rule_count'] ?? 1) > 0 || str_contains((string)$latest['snapshot_state'], 'blocked'))) $blockers[] = 'server_rules_are_blocked';
            if ((int)($counts['processing_count'] ?? 0) > 0) $blockers[] = 'server_jobs_are_processing';
            if ($activeLease) $blockers[] = 'hub_execution_is_active';
            hub_auto_pause_json(200, [
                'ok' => true,
                'operation' => $operation,
                'ready' => count($blockers) === 0,
                'authority' => $authority['authority'],
                'authority_revision' => (int)$authority['revision'],
                'server_started_at_utc' => $authority['server_started_at_utc'] ?? null,
                'transfer_supported' => count($blockers) === 0,
                'blockers' => $blockers,
                'latest_evaluation' => is_array($latest) ? $latest : null,
                'server_jobs' => [
                    'pending_count' => (int)($counts['pending_count'] ?? 0),
                    'processing_count' => (int)($counts['processing_count'] ?? 0),
                    'applied_count' => (int)($counts['applied_count'] ?? 0),
                    'failed_count' => (int)($counts['failed_count'] ?? 0),
                ],
            ]);
        }
        if ($operation === 'cutover_set_authority') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['authority', 'operation'] || !in_array($payload['authority'] ?? null, ['hub', 'server'], true)) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $target = $payload['authority'];
            $pdo->beginTransaction();
            try {
                $current = $pdo->query('SELECT authority,revision,hub_lease_token,hub_lease_until_utc,server_started_at_utc FROM google_ads_auto_pause_authority WHERE authority_id=1 FOR UPDATE')->fetch();
                if (!is_array($current)) throw new HubGoogleAdsApiException('authority_not_initialized', 503);
                $counts = $pdo->query("SELECT SUM(state='pending') AS pending_count,SUM(state='processing') AS processing_count FROM google_ads_auto_pause_jobs WHERE rule_code<>'" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "'")->fetch() ?: [];
                $leaseUntil = isset($current['hub_lease_until_utc']) ? new DateTimeImmutable((string)$current['hub_lease_until_utc'], new DateTimeZone('UTC')) : null;
                $activeLease = $leaseUntil !== null && $leaseUntil > new DateTimeImmutable('now', new DateTimeZone('UTC'));
                $blockers = [];
                if ($target === 'server') {
                    $latest = $pdo->query("SELECT snapshot_state,blocked_rule_count,JSON_UNQUOTE(JSON_EXTRACT(result_json,'$.mode')) AS evaluation_mode FROM google_ads_auto_pause_shadow_evaluations ORDER BY evaluated_at_utc DESC LIMIT 1")->fetch();
                    if (!is_array($latest)) $blockers[] = 'no_snapshot_evaluation_recorded';
                    if (!is_array($latest) || (string)($latest['evaluation_mode'] ?? '') !== 'server') $blockers[] = 'snapshot_evaluator_does_not_create_jobs';
                    if (is_array($latest) && ((int)($latest['blocked_rule_count'] ?? 1) > 0 || str_contains((string)$latest['snapshot_state'], 'blocked'))) $blockers[] = 'server_rules_are_blocked';
                    if ($activeLease) $blockers[] = 'hub_execution_is_active';
                }
                if ($target === 'hub' && (int)($counts['pending_count'] ?? 0) > 0) $blockers[] = 'server_jobs_are_pending';
                if ((int)($counts['processing_count'] ?? 0) > 0) $blockers[] = 'server_jobs_are_processing';
                if ($activeLease && $target !== $current['authority']) $blockers[] = 'hub_execution_is_active';
                $supersededPendingCount = 0;
                $serverStartedAt = $current['server_started_at_utc'] ?? null;
                if (!$blockers && $current['authority'] !== $target) {
                    if ($target === 'server') {
                        $cutoverAt = (string)$pdo->query('SELECT UTC_TIMESTAMP(3)')->fetchColumn();
                        $supersede = $pdo->prepare(
                            "UPDATE google_ads_auto_pause_jobs j JOIN google_ads_auto_pause_snapshot_payloads p ON p.snapshot_id=j.snapshot_id "
                            . "SET j.state='skipped',j.result_code='pre_cutover_superseded',j.updated_at_utc=:cutover_at "
                            . "WHERE j.state='pending' AND j.rule_code<>'" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "' AND p.received_at_utc<:snapshot_cutoff"
                        );
                        $supersede->execute([':cutover_at' => $cutoverAt, ':snapshot_cutoff' => $cutoverAt]);
                        $supersededPendingCount = $supersede->rowCount();
                        $serverStartedAt = $cutoverAt;
                    } else {
                        $serverStartedAt = null;
                    }
                    $pdo->prepare('UPDATE google_ads_auto_pause_authority SET authority=:authority,revision=revision+1,server_started_at_utc=:server_started_at,hub_lease_token=NULL,hub_lease_until_utc=NULL,updated_at_utc=UTC_TIMESTAMP(3) WHERE authority_id=1')->execute([
                        ':authority' => $target,
                        ':server_started_at' => $serverStartedAt,
                    ]);
                }
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'changed' => !$blockers && $current['authority'] !== $target, 'authority' => !$blockers ? $target : $current['authority'], 'blockers' => $blockers, 'ready' => !$blockers, 'superseded_pending_count' => $supersededPendingCount, 'server_started_at_utc' => $serverStartedAt]);
        }
        if ($operation === 'sync_config') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['operation', 'policy', 'revision']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $revision = hub_auto_pause_uuid($payload['revision']); $policy = hub_auto_pause_validate_policy($payload['policy']);
            if ($revision === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $json = json_encode($policy, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $pdo->beginTransaction();
            try {
                $currentConfig = $pdo->query('SELECT revision,config_json FROM google_ads_auto_pause_config WHERE config_id=1 FOR UPDATE')->fetch();
                $currentPolicy = is_array($currentConfig) ? hub_auto_pause_validate_policy(json_decode((string)($currentConfig['config_json'] ?? ''), true)) : null;
                $policy = hub_auto_pause_merge_gurumedia_protection($policy, $currentPolicy);
                $json = json_encode($policy, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                if ($currentPolicy !== null && !hash_equals(hub_auto_pause_policy_behavioral_json($currentPolicy), hub_auto_pause_policy_behavioral_json($policy))) {
                    $pdo->exec("UPDATE google_ads_auto_pause_jobs SET state='skipped',result_code='policy_changed',updated_at_utc=UTC_TIMESTAMP(3) WHERE state='pending' AND rule_code<>'" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "'");
                }
                $pdo->prepare('INSERT INTO google_ads_auto_pause_config (config_id,revision,config_json) VALUES (1,:revision,:config) ON DUPLICATE KEY UPDATE revision=VALUES(revision), config_json=VALUES(config_json), updated_at_utc=CURRENT_TIMESTAMP(3)')
                    ->execute([':revision' => $revision, ':config' => $json]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'revision' => $revision, 'saved' => true]);
        }
        if ($operation === 'begin_snapshot_upload') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['completed_at_utc', 'operation', 'part_count', 'payload_bytes', 'payload_sha256', 'schema_version', 'snapshot_id', 'source_snapshot_id']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $snapshotId = hub_auto_pause_uuid($payload['snapshot_id']); $completed = hub_auto_pause_utc($payload['completed_at_utc']);
            $sourceId = $payload['source_snapshot_id']; $size = $payload['payload_bytes']; $parts = $payload['part_count']; $digest = $payload['payload_sha256'];
            $schemaVersion = $payload['schema_version'] ?? null;
            if ($snapshotId === null || $completed === null || !in_array($schemaVersion, [1, 2, 3], true)
                || !is_string($sourceId) || trim($sourceId) === '' || strlen($sourceId) > 160
                || !is_int($size) || $size < 2 || $size > HUB_AUTO_PAUSE_SNAPSHOT_MAX_BYTES
                || !is_int($parts) || $parts !== (int)ceil($size / HUB_AUTO_PAUSE_SNAPSHOT_PART_BYTES) || $parts > HUB_AUTO_PAUSE_SNAPSHOT_MAX_PARTS
                || !is_string($digest) || !preg_match('/^[a-f0-9]{64}$/D', $digest)) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $stored = $pdo->prepare('SELECT payload_sha256 FROM google_ads_auto_pause_snapshot_payloads WHERE snapshot_id=:id LIMIT 1');
            $stored->execute([':id' => $snapshotId]); $storedHash = $stored->fetchColumn();
            if ($storedHash !== false) {
                if (!hash_equals((string)$storedHash, $digest)) throw new HubGoogleAdsApiException('snapshot_id_conflict', 409);
                hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'snapshot_id' => $snapshotId, 'already_received' => true]);
            }
            $pdo->exec("DELETE p FROM google_ads_auto_pause_snapshot_upload_parts p JOIN google_ads_auto_pause_snapshot_uploads u ON u.snapshot_id=p.snapshot_id WHERE u.updated_at_utc<DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)");
            $pdo->exec("DELETE FROM google_ads_auto_pause_snapshot_uploads WHERE updated_at_utc<DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 24 HOUR)");
            $pdo->beginTransaction();
            try {
                $existing = $pdo->prepare('SELECT source_snapshot_id,completed_at_utc,schema_version,payload_bytes,payload_sha256,part_count FROM google_ads_auto_pause_snapshot_uploads WHERE snapshot_id=:id FOR UPDATE');
                $existing->execute([':id' => $snapshotId]); $row = $existing->fetch();
                if (is_array($row)) {
                    $same = (string)$row['source_snapshot_id'] === $sourceId
                        && (string)$row['completed_at_utc'] === $completed
                        && (int)$row['schema_version'] === $schemaVersion && (int)$row['payload_bytes'] === $size
                        && hash_equals((string)$row['payload_sha256'], $digest) && (int)$row['part_count'] === $parts;
                    if (!$same) throw new HubGoogleAdsApiException('snapshot_upload_conflict', 409);
                } else {
                    $pdo->prepare('INSERT INTO google_ads_auto_pause_snapshot_uploads (snapshot_id,source_snapshot_id,completed_at_utc,schema_version,payload_bytes,payload_sha256,part_count) VALUES (:id,:source,:completed,:schema,:bytes,:hash,:parts)')
                        ->execute([':id' => $snapshotId, ':source' => $sourceId, ':completed' => $completed, ':schema' => $schemaVersion, ':bytes' => $size, ':hash' => $digest, ':parts' => $parts]);
                }
                $pdo->commit();
            } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'snapshot_id' => $snapshotId, 'already_received' => false, 'part_count' => $parts]);
        }
        if ($operation === 'put_snapshot_part') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['operation', 'part_base64', 'part_index', 'part_sha256', 'snapshot_id']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $snapshotId = hub_auto_pause_uuid($payload['snapshot_id']); $index = $payload['part_index']; $base64 = $payload['part_base64']; $partHash = $payload['part_sha256'];
            if ($snapshotId === null || !is_int($index) || $index < 0 || !is_string($base64) || strlen($base64) > 900000
                || !preg_match('/^[A-Za-z0-9+\/]*={0,2}$/D', $base64) || !is_string($partHash) || !preg_match('/^[a-f0-9]{64}$/D', $partHash)) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $part = base64_decode($base64, true);
            if (!is_string($part) || strlen($part) < 1 || strlen($part) > HUB_AUTO_PAUSE_SNAPSHOT_PART_BYTES || !hash_equals($partHash, hash('sha256', $part))) throw new HubGoogleAdsApiException('invalid_snapshot_part', 400);
            $pdo->beginTransaction();
            try {
                $upload = $pdo->prepare('SELECT payload_bytes,part_count FROM google_ads_auto_pause_snapshot_uploads WHERE snapshot_id=:id FOR UPDATE');
                $upload->execute([':id' => $snapshotId]); $uploadRow = $upload->fetch();
                if (!is_array($uploadRow) || $index >= (int)$uploadRow['part_count']) throw new HubGoogleAdsApiException('snapshot_upload_not_found', 404);
                $expectedBytes = min(HUB_AUTO_PAUSE_SNAPSHOT_PART_BYTES, (int)$uploadRow['payload_bytes'] - ($index * HUB_AUTO_PAUSE_SNAPSHOT_PART_BYTES));
                if (strlen($part) !== $expectedBytes) throw new HubGoogleAdsApiException('invalid_snapshot_part', 400);
                $existing = $pdo->prepare('SELECT part_sha256 FROM google_ads_auto_pause_snapshot_upload_parts WHERE snapshot_id=:id AND part_index=:part FOR UPDATE');
                $existing->execute([':id' => $snapshotId, ':part' => $index]); $existingHash = $existing->fetchColumn();
                if ($existingHash !== false && !hash_equals((string)$existingHash, $partHash)) throw new HubGoogleAdsApiException('snapshot_part_conflict', 409);
                if ($existingHash === false) $pdo->prepare('INSERT INTO google_ads_auto_pause_snapshot_upload_parts (snapshot_id,part_index,part_sha256,payload_part) VALUES (:id,:part,:hash,:payload)')
                    ->execute([':id' => $snapshotId, ':part' => $index, ':hash' => $partHash, ':payload' => $part]);
                $pdo->prepare('UPDATE google_ads_auto_pause_snapshot_uploads SET updated_at_utc=UTC_TIMESTAMP(3) WHERE snapshot_id=:id')->execute([':id' => $snapshotId]);
                $pdo->commit();
            } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'snapshot_id' => $snapshotId, 'part_index' => $index, 'stored' => true]);
        }
        if ($operation === 'finalize_snapshot_upload') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['operation', 'snapshot_id']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $snapshotId = hub_auto_pause_uuid($payload['snapshot_id']);
            if ($snapshotId === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $pdo->beginTransaction();
            try {
                $upload = $pdo->prepare('SELECT source_snapshot_id,completed_at_utc,schema_version,payload_bytes,payload_sha256,part_count FROM google_ads_auto_pause_snapshot_uploads WHERE snapshot_id=:id FOR UPDATE');
                $upload->execute([':id' => $snapshotId]); $uploadRow = $upload->fetch();
                if (!is_array($uploadRow)) {
                    $stored = $pdo->prepare('SELECT payload_sha256 FROM google_ads_auto_pause_snapshot_payloads WHERE snapshot_id=:id LIMIT 1');
                    $stored->execute([':id' => $snapshotId]); $storedHash = $stored->fetchColumn();
                    if ($storedHash !== false) { $pdo->commit(); hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'snapshot_id' => $snapshotId, 'stored' => true, 'duplicate' => true]); }
                    throw new HubGoogleAdsApiException('snapshot_upload_not_found', 404);
                }
                $partsQuery = $pdo->prepare('SELECT part_index,part_sha256,payload_part FROM google_ads_auto_pause_snapshot_upload_parts WHERE snapshot_id=:id ORDER BY part_index');
                $partsQuery->execute([':id' => $snapshotId]); $partRows = $partsQuery->fetchAll();
                if (count($partRows) !== (int)$uploadRow['part_count']) throw new HubGoogleAdsApiException('snapshot_parts_missing', 409);
                $raw = '';
                foreach ($partRows as $expectedIndex => $partRow) {
                    if ((int)$partRow['part_index'] !== $expectedIndex || !hash_equals((string)$partRow['part_sha256'], hash('sha256', (string)$partRow['payload_part']))) throw new HubGoogleAdsApiException('snapshot_parts_invalid', 409);
                    $raw .= (string)$partRow['payload_part'];
                }
                if (strlen($raw) !== (int)$uploadRow['payload_bytes'] || !hash_equals((string)$uploadRow['payload_sha256'], hash('sha256', $raw))) throw new HubGoogleAdsApiException('snapshot_hash_mismatch', 409);
                $snapshot = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
                $normalized = hub_auto_pause_snapshot_payload($snapshot, (string)$uploadRow['completed_at_utc'], (int)$uploadRow['schema_version']);
                if ((string)$normalized['id'] !== (string)$uploadRow['source_snapshot_id'] || (string)$normalized['runId'] !== (string)$uploadRow['source_snapshot_id']) throw new HubGoogleAdsApiException('snapshot_identity_mismatch', 409);
                $existing = $pdo->prepare('SELECT payload_sha256 FROM google_ads_auto_pause_snapshot_payloads WHERE snapshot_id=:id FOR UPDATE');
                $existing->execute([':id' => $snapshotId]); $existingHash = $existing->fetchColumn();
                if ($existingHash !== false && !hash_equals((string)$existingHash, (string)$uploadRow['payload_sha256'])) throw new HubGoogleAdsApiException('snapshot_id_conflict', 409);
                if ($existingHash === false) {
                    $payloadJson = json_encode($normalized, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                    $pdo->prepare('INSERT INTO google_ads_auto_pause_snapshot_payloads (snapshot_id,source_snapshot_id,completed_at_utc,schema_version,payload_sha256,payload_bytes,account_count,campaign_count,payload_json) VALUES (:id,:source,:completed,:schema,:hash,:bytes,:accounts,:campaigns,:json)')
                        ->execute([':id' => $snapshotId, ':source' => $uploadRow['source_snapshot_id'], ':completed' => $uploadRow['completed_at_utc'], ':schema' => $uploadRow['schema_version'], ':hash' => $uploadRow['payload_sha256'], ':bytes' => $uploadRow['payload_bytes'], ':accounts' => $normalized['accountCount'], ':campaigns' => $normalized['campaignCount'], ':json' => $payloadJson]);
                }
                $pdo->prepare('DELETE FROM google_ads_auto_pause_snapshot_upload_parts WHERE snapshot_id=:id')->execute([':id' => $snapshotId]);
                $pdo->prepare('DELETE FROM google_ads_auto_pause_snapshot_uploads WHERE snapshot_id=:id')->execute([':id' => $snapshotId]);
                hub_auto_pause_prune_snapshot_payloads($pdo, hub_auto_pause_snapshot_keep_limit($pdo));
                $pdo->commit();
            } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'snapshot_id' => $snapshotId, 'stored' => true, 'duplicate' => $existingHash !== false, 'payload_sha256' => $uploadRow['payload_sha256']]);
        }
        if ($operation === 'update_campaign_exceptions') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['campaign_id', 'customer_id', 'excluded_rules', 'manager_customer_id', 'operation']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $manager = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            $customer = hub_google_ads_valid_customer_id($payload['customer_id']);
            $campaign = $payload['campaign_id']; $excluded = $payload['excluded_rules'];
            $allowedRules = ['negative_remaining', 'product_performance', 'minimum_product_performance', 'reference_competitor', 'campaign_age', 'campaign_zero_impressions', 'clicks_without_sale'];
            if ($manager === null || $customer === null || !hub_google_ads_campaign_manager_is_allowed($config, $manager)
                || !is_string($campaign) || preg_match('/^[1-9][0-9]{0,19}$/D', $campaign) !== 1
                || !is_array($excluded) || !array_is_list($excluded) || count($excluded) > count($allowedRules)) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $excluded = array_values(array_unique($excluded));
            foreach ($excluded as $rule) if (!is_string($rule) || !in_array($rule, $allowedRules, true)) throw new HubGoogleAdsApiException('invalid_payload', 400);
            sort($excluded, SORT_STRING);
            $pdo->beginTransaction();
            try {
                $current = $pdo->query('SELECT revision,config_json FROM google_ads_auto_pause_config WHERE config_id=1 FOR UPDATE')->fetch();
                if (!is_array($current)) throw new HubGoogleAdsApiException('policy_unavailable', 409);
                $policy = hub_auto_pause_validate_policy(json_decode((string)$current['config_json'], true));
                $identity = [$manager, $customer, $campaign];
                $exceptions = array_values(array_filter($policy['campaignExceptions'], static fn(array $item): bool => [$item['managerCustomerId'], $item['customerId'], $item['campaignId']] !== $identity));
                if ($excluded) $exceptions[] = ['managerCustomerId' => $manager, 'customerId' => $customer, 'campaignId' => $campaign, 'excludedRules' => $excluded];
                $policy['campaignExceptions'] = $exceptions;
                $policy = hub_auto_pause_validate_policy($policy);
                $json = json_encode($policy, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                $changed = !hash_equals((string)$current['config_json'], $json);
                if ($changed) {
                    $revision = hub_auto_pause_new_uuid();
                    $pdo->prepare('UPDATE google_ads_auto_pause_config SET revision=:revision,config_json=:config,updated_at_utc=CURRENT_TIMESTAMP(3) WHERE config_id=1')
                        ->execute([':revision' => $revision, ':config' => $json]);
                    if ($excluded) {
                        $placeholders = implode(',', array_fill(0, count($excluded), '?'));
                        $pdo->prepare("UPDATE google_ads_auto_pause_jobs SET state='skipped',result_code='campaign_rule_excluded',updated_at_utc=UTC_TIMESTAMP(3) WHERE manager_customer_id=? AND customer_id=? AND campaign_id=? AND rule_code IN ($placeholders) AND state='pending'")
                            ->execute([$manager, $customer, $campaign, ...$excluded]);
                    }
                } else $revision = (string)$current['revision'];
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'revision' => $revision, 'saved' => true, 'changed' => $changed]);
        }
        if ($operation === 'publish_evaluation') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['completed_at_utc', 'jobs', 'operation', 'revision', 'snapshot_id']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $snapshotId = hub_auto_pause_uuid($payload['snapshot_id']); $revision = hub_auto_pause_uuid($payload['revision']);
            $completed = hub_auto_pause_utc($payload['completed_at_utc']); $jobs = $payload['jobs'];
            if ($snapshotId === null || $revision === null || $completed === null || !is_array($jobs) || !array_is_list($jobs)
                || count($jobs) > HUB_AUTO_PAUSE_MAX_JOBS) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $configRow = $pdo->prepare('SELECT config_json FROM google_ads_auto_pause_config WHERE config_id=1 AND revision=:revision');
            $configRow->execute([':revision' => $revision]); $stored = $configRow->fetch();
            if (!is_array($stored)) throw new HubGoogleAdsApiException('policy_revision_not_found', 409);
            $policy = hub_auto_pause_validate_policy(json_decode((string)$stored['config_json'], true));
            $validatedJobs = []; $seenJobs = [];
            foreach ($jobs as $job) {
                $valid = hub_auto_pause_validate_job($job, $snapshotId, $policy);
                if (isset($seenJobs[$valid['job_id']])) throw new HubGoogleAdsApiException('duplicate_campaign_job', 400);
                $seenJobs[$valid['job_id']] = true; $validatedJobs[] = $valid;
            }
            usort($validatedJobs, static fn(array $a, array $b): int => strcmp($a['job_id'], $b['job_id']));
            $completedDate = new DateTimeImmutable($completed, new DateTimeZone('UTC'));
            $available = $completedDate->modify('+' . ($policy['snapshotIntervalMinutes'] + $policy['additionalDelayMinutes']) . ' minutes')->format('Y-m-d H:i:s.v');
            $cancelUntil = $completedDate->modify('+' . $policy['confirmationSeconds'] . ' seconds')->format('Y-m-d H:i:s.v');
            $evaluationHash = hash('sha256', json_encode($validatedJobs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
            $pdo->beginTransaction();
            try {
                $pdo->prepare('INSERT INTO google_ads_auto_pause_snapshots (snapshot_id,completed_at_utc,evaluation_sha256) VALUES (:id,:completed,:hash) ON DUPLICATE KEY UPDATE snapshot_id=snapshot_id')
                    ->execute([':id' => $snapshotId, ':completed' => $completed, ':hash' => $evaluationHash]);
                $hashQuery = $pdo->prepare('SELECT evaluation_sha256 FROM google_ads_auto_pause_snapshots WHERE snapshot_id=:id FOR UPDATE');
                $hashQuery->execute([':id' => $snapshotId]);
                if (!hash_equals((string)$hashQuery->fetchColumn(), $evaluationHash)) throw new HubGoogleAdsApiException('snapshot_id_conflict', 409);
                $insert = $pdo->prepare("INSERT INTO google_ads_auto_pause_jobs (job_id,snapshot_id,product_key,rule_code,manager_customer_id,customer_id,campaign_id,campaign_name,reason_context_json,available_at_utc,cancel_until_utc) VALUES (:job_id,:snapshot_id,:product_key,:rule_code,:manager_customer_id,:customer_id,:campaign_id,:campaign_name,:reason_context_json,:available,:cancel_until) ON DUPLICATE KEY UPDATE job_id=job_id");
                foreach ($validatedJobs as $job) $insert->execute($job + [':available' => $available, ':cancel_until' => $cancelUntil]);
                $keep = (int)$policy['maxRetainedSnapshots'];
                $oldSnapshots = $pdo->query('SELECT snapshot_id FROM google_ads_auto_pause_snapshots ORDER BY completed_at_utc DESC LIMIT 18446744073709551615 OFFSET ' . $keep)->fetchAll(PDO::FETCH_COLUMN);
                if ($oldSnapshots) {
                    $placeholders = implode(',', array_fill(0, count($oldSnapshots), '?'));
                    $pdo->prepare("DELETE FROM google_ads_auto_pause_jobs WHERE snapshot_id IN ($placeholders) AND state IN ('cancelled','applied','skipped','failed')")->execute($oldSnapshots);
                    $pdo->prepare("DELETE FROM google_ads_auto_pause_snapshots WHERE snapshot_id IN ($placeholders) AND NOT EXISTS (SELECT 1 FROM google_ads_auto_pause_jobs j WHERE j.snapshot_id=google_ads_auto_pause_snapshots.snapshot_id AND j.state IN ('pending','processing'))")->execute($oldSnapshots);
                }
                $pdo->commit();
            } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'snapshot_id' => $snapshotId, 'job_count' => count($validatedJobs), 'available_at_utc' => $available]);
        }
        if ($operation === 'simulate_enqueue') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['operation', 'test_id']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $testId = hub_auto_pause_uuid($payload['test_id']);
            if ($testId === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $existing = $pdo->prepare('SELECT job_id,snapshot_id,state,result_code,available_at_utc,created_at_utc,updated_at_utc FROM google_ads_auto_pause_jobs WHERE job_id=:job_id AND rule_code=:rule LIMIT 1');
            $existing->execute([':job_id' => $testId, ':rule' => HUB_AUTO_PAUSE_SIMULATION_RULE_CODE]);
            $existingJob = $existing->fetch();
            if (is_array($existingJob)) hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'simulation' => $existingJob]);
            $collision = $pdo->prepare('SELECT job_id FROM google_ads_auto_pause_jobs WHERE job_id=:job_id LIMIT 1');
            $collision->execute([':job_id' => $testId]);
            if ($collision->fetchColumn() !== false) throw new HubGoogleAdsApiException('simulation_id_conflict', 409);

            $simulationTime = '2000-01-01 00:00:00.000';
            $available = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v');
            $evaluationHash = hash('sha256', 'hub-auto-pause-queue-simulation:' . $testId);
            $context = json_encode(['type' => HUB_AUTO_PAUSE_SIMULATION_RULE_CODE, 'test_id' => $testId], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $pdo->beginTransaction();
            try {
                $pdo->prepare('INSERT INTO google_ads_auto_pause_snapshots (snapshot_id,completed_at_utc,evaluation_sha256) VALUES (:id,:completed,:hash) ON DUPLICATE KEY UPDATE snapshot_id=snapshot_id')
                    ->execute([':id' => $testId, ':completed' => $simulationTime, ':hash' => $evaluationHash]);
                $pdo->prepare("INSERT INTO google_ads_auto_pause_jobs (job_id,snapshot_id,product_key,rule_code,manager_customer_id,customer_id,campaign_id,campaign_name,reason_context_json,available_at_utc,cancel_until_utc) VALUES (:job_id,:snapshot_id,'__hub_queue_simulation__',:rule,'0000000000','0000000000','0','Teste técnico da fila (simulação)',:context,:available,:cancel_until) ON DUPLICATE KEY UPDATE job_id=job_id")
                    ->execute([':job_id' => $testId, ':snapshot_id' => $testId, ':rule' => HUB_AUTO_PAUSE_SIMULATION_RULE_CODE, ':context' => $context, ':available' => $available, ':cancel_until' => $available]);
                $query = $pdo->prepare('SELECT job_id,snapshot_id,state,result_code,available_at_utc,created_at_utc,updated_at_utc FROM google_ads_auto_pause_jobs WHERE job_id=:job_id AND rule_code=:rule LIMIT 1');
                $query->execute([':job_id' => $testId, ':rule' => HUB_AUTO_PAUSE_SIMULATION_RULE_CODE]);
                $simulation = $query->fetch();
                if (!is_array($simulation)) throw new HubGoogleAdsApiException('simulation_enqueue_failed', 500);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'simulation' => $simulation]);
        }
        if ($operation === 'simulation_status') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['operation', 'test_id']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $testId = hub_auto_pause_uuid($payload['test_id']);
            if ($testId === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $query = $pdo->prepare('SELECT job_id,snapshot_id,state,result_code,available_at_utc,created_at_utc,updated_at_utc FROM google_ads_auto_pause_jobs WHERE job_id=:job_id AND rule_code=:rule LIMIT 1');
            $query->execute([':job_id' => $testId, ':rule' => HUB_AUTO_PAUSE_SIMULATION_RULE_CODE]);
            $simulation = $query->fetch();
            if (!is_array($simulation)) throw new HubGoogleAdsApiException('simulation_not_found', 404);
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'simulation' => $simulation]);
        }
        if ($operation === 'pending' || $operation === 'cancel_product') {
            if ($operation === 'pending') {
                $keys = array_keys($payload); sort($keys, SORT_STRING); if ($keys !== ['operation']) throw new HubGoogleAdsApiException('invalid_payload', 400);
                $rows = $pdo->query("SELECT job_id,snapshot_id,product_key,rule_code,manager_customer_id,customer_id,campaign_id,campaign_name,reason_context_json,available_at_utc,cancel_until_utc,state FROM google_ads_auto_pause_jobs WHERE state='pending' AND rule_code<>'" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "' ORDER BY available_at_utc,created_at_utc LIMIT 500")->fetchAll();
                foreach ($rows as &$row) { $row['reason_context'] = json_decode((string)$row['reason_context_json'] ?? '{}', true) ?: new stdClass(); unset($row['reason_context_json']); }
                hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'jobs' => $rows]);
            }
            $keys = array_keys($payload); sort($keys, SORT_STRING); if ($keys !== ['operation', 'product_key', 'snapshot_id']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $snapshotId = hub_auto_pause_uuid($payload['snapshot_id']); $product = $payload['product_key'];
            if ($snapshotId === null || !is_string($product) || trim($product) === '' || strlen($product) > 190) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $statement = $pdo->prepare("UPDATE google_ads_auto_pause_jobs SET state='cancelled',updated_at_utc=CURRENT_TIMESTAMP(3) WHERE product_key=:product AND state='pending' AND EXISTS (SELECT job_id FROM (SELECT job_id FROM google_ads_auto_pause_jobs WHERE snapshot_id=:snapshot AND product_key=:product_key AND state='pending' AND cancel_until_utc>UTC_TIMESTAMP(3)) cancellable_snapshot)");
            $statement->execute([':product' => trim($product), ':snapshot' => $snapshotId, ':product_key' => trim($product)]);
            hub_auto_pause_json(200, ['ok' => true, 'operation' => $operation, 'cancelled' => $statement->rowCount() > 0]);
        }
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    } catch (HubGoogleAdsApiException $error) {
        hub_auto_pause_json($error->httpStatus, ['ok' => false, 'error' => $error->apiCode]);
    } catch (JsonException) {
        hub_auto_pause_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    } catch (Throwable) {
        error_log('Google Ads automatic-pause endpoint failed.');
        hub_auto_pause_json(500, ['ok' => false, 'error' => 'server_error']);
    }
}
