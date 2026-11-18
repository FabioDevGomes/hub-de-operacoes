<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-readonly-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-action-service.php';

const HUB_AUTO_PAUSE_MAX_BODY_BYTES = 1048576;
const HUB_AUTO_PAUSE_MAX_JOBS = 500;
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

function hub_auto_pause_pdo(array $config): PDO
{
    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
        if (!is_string($config[$key] ?? null) || $config[$key] === '') throw new RuntimeException('api_not_configured');
    }
    return new PDO('mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
        $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
}

function hub_auto_pause_validate_policy(mixed $policy): array
{
    if (!is_array($policy) || array_is_list($policy)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    if (!array_key_exists('campaignExceptions', $policy)) $policy['campaignExceptions'] = [];
    if (!array_key_exists('additionalDelayMinutes', $policy)) $policy['additionalDelayMinutes'] = 15;
    $keys = array_keys($policy); sort($keys, SORT_STRING);
    if ($keys !== ['additionalDelayMinutes', 'campaignExceptions', 'confirmationSeconds', 'maxRetainedSnapshots', 'rules', 'snapshotIntervalMinutes', 'version']
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
        if ($operation === 'sync_config') {
            $keys = array_keys($payload); sort($keys, SORT_STRING);
            if ($keys !== ['operation', 'policy', 'revision']) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $revision = hub_auto_pause_uuid($payload['revision']); $policy = hub_auto_pause_validate_policy($payload['policy']);
            if ($revision === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $json = json_encode($policy, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $pdo->beginTransaction();
            try {
                $currentConfig = $pdo->query('SELECT revision,config_json FROM google_ads_auto_pause_config WHERE config_id=1 FOR UPDATE')->fetch();
                if (is_array($currentConfig) && !hash_equals((string)$currentConfig['config_json'], $json)) {
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
                $pdo->prepare("INSERT INTO google_ads_auto_pause_jobs (job_id,snapshot_id,product_key,rule_code,manager_customer_id,customer_id,campaign_id,campaign_name,reason_context_json,available_at_utc,cancel_until_utc) VALUES (:job_id,:snapshot_id,'__hub_queue_simulation__',:rule,'0000000000','0000000000','0','Teste técnico da fila (simulação)',:context,:available,:available) ON DUPLICATE KEY UPDATE job_id=job_id")
                    ->execute([':job_id' => $testId, ':snapshot_id' => $testId, ':rule' => HUB_AUTO_PAUSE_SIMULATION_RULE_CODE, ':context' => $context, ':available' => $available]);
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
