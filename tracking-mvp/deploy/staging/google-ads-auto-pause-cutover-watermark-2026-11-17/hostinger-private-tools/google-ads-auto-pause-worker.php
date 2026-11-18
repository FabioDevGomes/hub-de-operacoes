<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-auto-pause-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-action-service.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-campaign-pause-email-service.php';

const HUB_AUTO_PAUSE_WORKER_BATCH_LIMIT = 5;
const HUB_AUTO_PAUSE_SHADOW_SNAPSHOT_BATCH_LIMIT = 10;
const HUB_AUTO_PAUSE_WORKER_RETRY_SECONDS = 300;
const HUB_AUTO_PAUSE_WORKER_PROCESSING_LEASE_SECONDS = 900;
const HUB_AUTO_PAUSE_SIMULATION_RULE_CODE = 'queue_simulation';

$execute = in_array('--execute', $argv ?? [], true);
$allowedArgs = $execute ? ['--execute'] : [];
if (array_values(array_slice($argv ?? [], 1)) !== $allowedArgs) {
    fwrite(STDERR, "Argumento inválido. Use sem argumentos para prévia ou --execute para executar.
");
    exit(2);
}

try {
    $trackingConfig = hub_google_ads_load_tracking_config();
    $pdo = hub_auto_pause_pdo($trackingConfig);
    $lock = (int)$pdo->query("SELECT GET_LOCK('google_ads_auto_pause_worker', 0)")->fetchColumn();
    if ($lock !== 1) {
        fwrite(STDOUT, "Worker já está em execução; esta rodada foi ignorada.\n");
        exit(0);
    }

    $counts = ['snapshots_evaluated' => 0, 'shadow_blocked_rules' => 0, 'shadow_errors' => 0, 'selected' => 0, 'simulated' => 0, 'ready' => 0, 'would_skip' => 0, 'applied' => 0, 'skipped' => 0, 'retry' => 0, 'failed' => 0];
    try {
        try {
            $shadow = hub_auto_pause_worker_evaluate_received_snapshots($pdo);
            $counts['snapshots_evaluated'] = $shadow['evaluated'];
            $counts['shadow_blocked_rules'] = $shadow['blocked_rules'];
        } catch (Throwable) {
            // Keep the existing queue worker operational if the additive shadow migration is not installed yet.
            $counts['shadow_errors']++;
            error_log('Google Ads auto-pause shadow evaluation could not process snapshots; check the shadow migration and policy configuration.');
        }
        for ($index = 0; $index < HUB_AUTO_PAUSE_WORKER_BATCH_LIMIT; $index++) {
            $job = hub_auto_pause_worker_claim_next($pdo);
            if ($job === null) break;
            $counts['selected']++;

            // This branch is unconditional: a simulation can never reach a Google Ads API call, even with --execute.
            if (($job['rule_code'] ?? null) === HUB_AUTO_PAUSE_SIMULATION_RULE_CODE) {
                hub_auto_pause_worker_finish($pdo, (string)$job['job_id'], 'skipped', 'simulation_processed');
                $counts['simulated']++;
                continue;
            }

            if (!$execute) {
                $decision = hub_auto_pause_worker_check_job($pdo, $trackingConfig, $job);
                hub_auto_pause_worker_finish($pdo, (string)$job['job_id'], 'pending', $decision === null ? 'dry_run_ready' : 'dry_run_' . $decision);
                $counts[$decision === null ? 'ready' : 'would_skip']++;
                continue;
            }

            try {
                $decision = hub_auto_pause_worker_check_job($pdo, $trackingConfig, $job);
                if ($decision !== null) {
                    hub_auto_pause_worker_finish($pdo, (string)$job['job_id'], 'skipped', $decision);
                    $counts['skipped']++;
                    continue;
                }

                $result = hub_google_ads_change_campaign_status(
                    $trackingConfig,
                    (string)$job['manager_customer_id'],
                    (string)$job['customer_id'],
                    (string)$job['campaign_id'],
                    'pause_campaign',
                    'ENABLED',
                    'PAUSED'
                );
                if (($result['verified'] ?? false) !== true || ($result['status'] ?? null) !== 'PAUSED') {
                    hub_auto_pause_worker_finish($pdo, (string)$job['job_id'], 'failed', 'pause_unverified');
                    $counts['failed']++;
                    continue;
                }
                if (($result['changed'] ?? false) !== true) {
                    hub_auto_pause_worker_finish($pdo, (string)$job['job_id'], 'skipped', 'campaign_already_paused');
                    $counts['skipped']++;
                    continue;
                }

                $emailQueued = true;
                try {
                    google_ads_campaign_pause_email_enqueue(
                        $pdo,
                        (string)$job['manager_customer_id'],
                        (string)$job['customer_id'],
                        (string)$job['campaign_id'],
                        (string)$result['campaign_name'],
                        (string)$job['rule_code'],
                        (string)$result['verified_at_utc']
                    );
                } catch (Throwable) {
                    $emailQueued = false;
                    error_log('Google Ads auto-pause worker could not queue a confirmed-pause notification.');
                }
                hub_auto_pause_worker_finish($pdo, (string)$job['job_id'], 'applied', $emailQueued ? 'pause_confirmed' : 'email_queue_failed');
                $counts['applied']++;
            } catch (HubGoogleAdsApiException $error) {
                if ($error->httpStatus >= 500 || in_array($error->apiCode, ['google_ads_unavailable', 'oauth_unavailable'], true)) {
                    hub_auto_pause_worker_finish($pdo, (string)$job['job_id'], 'pending', 'retryable_api_error');
                    $counts['retry']++;
                } else {
                    hub_auto_pause_worker_finish($pdo, (string)$job['job_id'], 'skipped', hub_auto_pause_worker_safe_code($error->apiCode));
                    $counts['skipped']++;
                }
            } catch (Throwable) {
                hub_auto_pause_worker_finish($pdo, (string)$job['job_id'], 'failed', 'worker_error');
                $counts['failed']++;
                error_log('Google Ads auto-pause worker encountered an unexpected job error.');
            }
        }
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('google_ads_auto_pause_worker')");
    }

    fwrite(STDOUT, sprintf(
        "Google Ads auto-pause worker (%s): %d snapshots avaliados em sombra, %d regras bloqueadas por dados ausentes, %d falhas da avaliação sombra, %d selecionados, %d simulações processadas, %d prontos, %d que seriam ignorados, %d pausados e confirmados, %d ignorados, %d para nova tentativa, %d falhas.\n",
        $execute ? 'execução' : 'prévia',
        $counts['snapshots_evaluated'], $counts['shadow_blocked_rules'], $counts['shadow_errors'],
        $counts['selected'], $counts['simulated'], $counts['ready'], $counts['would_skip'], $counts['applied'], $counts['skipped'], $counts['retry'], $counts['failed']
    ));
} catch (Throwable) {
    error_log('Google Ads auto-pause worker could not start; check private configuration and database access.');
    fwrite(STDERR, "Worker de pausa automática não iniciou; confira a configuração privada e o banco.\n");
    exit(1);
}

/**
 * Store a conservative, read-only shadow assessment for each complete D0 payload.
 * This intentionally creates no pause jobs and performs no Google Ads API calls.
 */
function hub_auto_pause_worker_evaluate_received_snapshots(PDO $pdo): array
{
    $configRow = $pdo->query('SELECT revision,config_json FROM google_ads_auto_pause_config WHERE config_id=1')->fetch();
    if (!is_array($configRow) || !is_string($configRow['revision'] ?? null)) {
        return ['evaluated' => 0, 'blocked_rules' => 0];
    }
    $policy = hub_auto_pause_validate_policy(json_decode((string)($configRow['config_json'] ?? ''), true));
    $revision = (string)$configRow['revision'];
    $query = $pdo->prepare(
        'SELECT p.snapshot_id,p.source_snapshot_id,p.completed_at_utc,p.received_at_utc,p.account_count,p.campaign_count,p.schema_version,p.payload_json '
        . 'FROM google_ads_auto_pause_snapshot_payloads p '
        . 'LEFT JOIN google_ads_auto_pause_shadow_evaluations e ON e.snapshot_id=p.snapshot_id '
        . 'WHERE p.received_at_utc<=UTC_TIMESTAMP(3) AND e.snapshot_id IS NULL '
        . 'ORDER BY p.completed_at_utc,p.received_at_utc LIMIT 1'
    );
    $evaluated = 0;
    $blockedRulesTotal = 0;
    $insert = $pdo->prepare(
        'INSERT IGNORE INTO google_ads_auto_pause_shadow_evaluations '
        . '(snapshot_id,source_snapshot_id,policy_revision,completed_at_utc,evaluation_due_at_utc,evaluated_at_utc,snapshot_state,enabled_rule_count,blocked_rule_count,candidate_count,result_sha256,result_json) '
        . 'VALUES (:snapshot_id,:source_snapshot_id,:policy_revision,:completed_at_utc,:due_at,:evaluated_at,:snapshot_state,:enabled_count,:blocked_count,:candidate_count,:result_sha256,:result_json)'
    );
    for ($batchIndex = 0; $batchIndex < HUB_AUTO_PAUSE_SHADOW_SNAPSHOT_BATCH_LIMIT; $batchIndex++) {
        $query->execute();
        $row = $query->fetch();
        if (!is_array($row)) break;
        $snapshotBlockedRules = 0;
        $snapshot = json_decode((string)$row['payload_json'], true);
        $snapshotValid = is_array($snapshot) && ($snapshot['periodType'] ?? null) === 'D0'
            && ($snapshot['scope'] ?? null) === 'ALL'
            && in_array((int)($row['schema_version'] ?? 0), [2, 3], true)
            && (int)($snapshot['accountCount'] ?? 0) === (int)$row['account_count']
            && is_array($snapshot['accounts'] ?? null)
            && count($snapshot['accounts']) === (int)$row['account_count']
            && is_array($snapshot['evaluationInputs']['campaigns'] ?? null);
        if ($snapshotValid) {
            foreach ($snapshot['accounts'] as $account) {
                if (($account['scope'] ?? null) !== 'ALL' || ($account['queryComplete'] ?? false) !== true || ($account['configurationComplete'] ?? false) !== true) {
                    $snapshotValid = false;
                    break;
                }
            }
        }
        $campaignCount = 0;
        $mappedCount = 0;
        $metricCount = 0;
        if ($snapshotValid) {
            foreach ($snapshot['accounts'] as $account) foreach (($account['campaigns'] ?? []) as $campaign) {
                $campaignCount++;
                if (($campaign['mappingStatus'] ?? null) === 'mapped') $mappedCount++;
                if (($campaign['metricsAvailable'] ?? false) === true
                    && is_numeric($campaign['impressions'] ?? null) && is_numeric($campaign['clicks'] ?? null)) $metricCount++;
            }
        }
        $facts = [];
        foreach (($snapshot['evaluationInputs']['campaigns'] ?? []) as $fact) {
            if (!is_array($fact)) continue;
            $key = json_encode([(string)($fact['managerCustomerId'] ?? ''), (string)($fact['customerId'] ?? ''), (string)($fact['campaignId'] ?? '')], JSON_UNESCAPED_SLASHES);
            if (is_string($key)) $facts[$key] = $fact;
        }
        $exceptions = [];
        foreach (($policy['campaignExceptions'] ?? []) as $exception) {
            if (!is_array($exception)) continue;
            $key = json_encode([(string)($exception['managerCustomerId'] ?? ''), (string)($exception['customerId'] ?? ''), (string)($exception['campaignId'] ?? '')], JSON_UNESCAPED_SLASHES);
            if (is_string($key)) $exceptions[$key] = array_fill_keys(is_array($exception['excludedRules'] ?? null) ? $exception['excludedRules'] : [], true);
        }
        $saleProtection = $policy['guruMediaSaleProtection'] ?? ['status' => 'unavailable', 'campaigns' => []];
        $saleProtectedCampaigns = [];
        foreach (($saleProtection['campaigns'] ?? []) as $soldCampaign) {
            if (!is_array($soldCampaign)) continue;
            $saleKey = json_encode([(string)($soldCampaign['managerCustomerId'] ?? ''), (string)($soldCampaign['customerId'] ?? ''), (string)($soldCampaign['campaignId'] ?? '')], JSON_UNESCAPED_SLASHES);
            if (is_string($saleKey)) $saleProtectedCampaigns[$saleKey] = true;
        }
        $rules = [];
        $candidateTotal = 0;
        foreach ($policy['rules'] as $ruleCode => $ruleConfig) {
            if (($ruleConfig['enabled'] ?? false) !== true) {
                $rules[$ruleCode] = ['state' => 'disabled', 'reason' => 'rule_disabled', 'candidate_count' => 0];
                continue;
            }
            if (!$snapshotValid) {
                $rules[$ruleCode] = ['state' => 'blocked', 'reason' => 'snapshot_incomplete', 'candidate_count' => 0];
                $snapshotBlockedRules++;
                continue;
            }
            if ($ruleCode === 'negative_remaining' && (int)($row['schema_version'] ?? 0) !== 3) {
                $rules[$ruleCode] = ['state' => 'blocked', 'reason' => 'remaining_value_unavailable', 'candidate_count' => 0];
                $snapshotBlockedRules++;
                continue;
            }
            if (!in_array($ruleCode, ['campaign_age', 'campaign_zero_impressions', 'negative_remaining'], true)) {
                $reason = match ($ruleCode) {
                    'negative_remaining' => 'campaign_financial_history_missing',
                    'reference_competitor' => 'product_identity_missing',
                    'product_performance' => 'product_identity_and_window_history_missing',
                    'clicks_without_sale' => 'complete_sales_source_coverage_missing',
                    default => 'rule_input_unavailable',
                };
                $rules[$ruleCode] = ['state' => 'blocked', 'reason' => $reason, 'candidate_count' => 0];
                $snapshotBlockedRules++;
                continue;
            }
            $candidates = []; $reasons = []; $excludedCount = 0; $campaignResults = [];
            foreach ($snapshot['accounts'] as $account) foreach (($account['campaigns'] ?? []) as $campaign) {
                if (strtoupper((string)($campaign['campaignStatus'] ?? '')) !== 'ENABLED') continue;
                $identity = [(string)($account['managerCustomerId'] ?? ''), (string)($account['customerId'] ?? ''), (string)($campaign['campaignId'] ?? '')];
                $key = json_encode($identity, JSON_UNESCAPED_SLASHES);
                if (isset($exceptions[$key][$ruleCode])) { $excludedCount++; if ($ruleCode === 'negative_remaining') $campaignResults[] = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'state' => 'not_candidate', 'reason' => 'campaign_exception']; continue; }
                if (($campaign['mappingStatus'] ?? null) !== 'mapped' || !preg_match('/^\d{10}$/D', $identity[0]) || !preg_match('/^\d{10}$/D', $identity[1]) || !preg_match('/^[1-9][0-9]{0,19}$/D', $identity[2])) { $reasons['campaign_mapping_unavailable'] = ($reasons['campaign_mapping_unavailable'] ?? 0) + 1; if ($ruleCode === 'negative_remaining') $campaignResults[] = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'state' => 'not_evaluable', 'reason' => 'campaign_mapping_unavailable']; continue; }
                $fact = $facts[$key] ?? null;
                if (!is_array($fact)) { $reasons['evaluation_input_missing'] = ($reasons['evaluation_input_missing'] ?? 0) + 1; if ($ruleCode === 'negative_remaining') $campaignResults[] = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'state' => 'not_evaluable', 'reason' => 'evaluation_input_missing']; continue; }
                if (($fact['excludedAsHistorical'] ?? false) === true) { if ($ruleCode === 'negative_remaining') $campaignResults[] = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'state' => 'not_candidate', 'reason' => 'historical_campaign']; continue; }
                if ($ruleCode === 'negative_remaining') {
                    $remainingValue = $fact['remainingValue'] ?? null;
                    if (!(is_int($remainingValue) || is_float($remainingValue)) || !is_finite((float)$remainingValue)) {
                        $reasons['remaining_value_missing_or_invalid'] = ($reasons['remaining_value_missing_or_invalid'] ?? 0) + 1;
                        $campaignResults[] = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'state' => 'not_evaluable', 'reason' => 'remaining_value_missing_or_invalid'];
                        continue;
                    }
                    if (($saleProtection['status'] ?? null) !== 'available') {
                        $reasons['gurumedia_protection_unavailable'] = ($reasons['gurumedia_protection_unavailable'] ?? 0) + 1;
                        $campaignResults[] = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'remainingValue' => (float)$remainingValue, 'state' => 'not_evaluable', 'reason' => 'gurumedia_protection_unavailable'];
                        continue;
                    }
                    if (isset($saleProtectedCampaigns[$key])) {
                        $campaignResults[] = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'remainingValue' => (float)$remainingValue, 'state' => 'not_candidate', 'reason' => 'sale_protected'];
                        continue;
                    }
                    $result = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'campaignName' => (string)($campaign['campaignName'] ?? ''), 'remainingValue' => (float)$remainingValue, 'state' => $remainingValue < 0 ? 'candidate' : 'not_candidate'];
                    $campaignResults[] = $result;
                    if ($remainingValue < 0) $candidates[] = $result;
                } elseif ($ruleCode === 'campaign_age') {
                    $startDate = $fact['startDate'] ?? null; $referenceDate = $fact['ageReferenceDate'] ?? null;
                    $impressions = $fact['lifetimeImpressions'] ?? null; $observed = $fact['lifetimeImpressionsObservedCount'] ?? null;
                    if (!is_string($startDate) || !is_string($referenceDate)) { $reasons['campaign_start_date_missing'] = ($reasons['campaign_start_date_missing'] ?? 0) + 1; continue; }
                    if (!is_int($impressions) || !is_int($observed) || $observed < 1) { $reasons['lifetime_impressions_unobserved'] = ($reasons['lifetime_impressions_unobserved'] ?? 0) + 1; continue; }
                    $start = DateTimeImmutable::createFromFormat('!Y-m-d', $startDate, new DateTimeZone('UTC'));
                    $reference = DateTimeImmutable::createFromFormat('!Y-m-d', $referenceDate, new DateTimeZone('UTC'));
                    if (!$start || !$reference || $start->format('Y-m-d') !== $startDate || $reference->format('Y-m-d') !== $referenceDate || $start > $reference) { $reasons['campaign_start_date_invalid'] = ($reasons['campaign_start_date_invalid'] ?? 0) + 1; continue; }
                    $ageDays = (int)$start->diff($reference)->format('%a');
                    $threshold = (int)($ruleConfig['thresholdDays'] ?? 30); $maxImpressions = (int)($ruleConfig['maxImpressions'] ?? 0);
                    if ($ageDays <= $threshold || $impressions > $maxImpressions) continue;
                    $candidates[] = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'campaignName' => (string)($campaign['campaignName'] ?? ''), 'startDate' => $startDate, 'ageDays' => $ageDays, 'lifetimeImpressions' => $impressions, 'thresholdDays' => $threshold, 'maxImpressions' => $maxImpressions];
                } else {
                    $streak = $fact['zeroImpressionStreakDays'] ?? null; $streakDate = $fact['zeroImpressionReferenceDate'] ?? null;
                    if (!is_int($streak) || !is_string($streakDate) || !is_string($account['date'] ?? null) || $streakDate !== $account['date']) { $reasons['consecutive_daily_history_missing'] = ($reasons['consecutive_daily_history_missing'] ?? 0) + 1; continue; }
                    $threshold = (int)($ruleConfig['thresholdDays'] ?? 35);
                    if ($streak < $threshold) continue;
                    $candidates[] = ['managerCustomerId' => $identity[0], 'customerId' => $identity[1], 'campaignId' => $identity[2], 'campaignName' => (string)($campaign['campaignName'] ?? ''), 'zeroImpressionStreakDays' => $streak, 'referenceDate' => $streakDate, 'thresholdDays' => $threshold];
                }
            }
            $candidateTotal += count($candidates);
            $hasBlocks = count($reasons) > 0;
            if ($hasBlocks) $snapshotBlockedRules++;
            $rules[$ruleCode] = ['state' => $hasBlocks ? 'partially_blocked' : 'evaluated', 'candidate_count' => count($candidates), 'blocked_campaign_count' => array_sum($reasons), 'blocked_reasons' => $reasons, 'excluded_campaign_count' => $excludedCount, 'candidates' => $candidates];
            if ($ruleCode === 'negative_remaining') $rules[$ruleCode]['campaign_results'] = $campaignResults;
        }
        // The payload is complete and validated before it is stored. Shadow evaluation
        // is therefore eligible from receipt; the Hub cadence/additional delay remains
        // reserved for job availability and the future missing-snapshot fallback.
        $dueAt = (string)$row['received_at_utc'];
        $evaluatedAt = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v');
        $result = [
            'mode' => 'shadow',
            'snapshot_valid' => $snapshotValid,
            'campaign_count' => $snapshotValid ? $campaignCount : (int)$row['campaign_count'],
            'mapped_campaign_count' => $mappedCount,
            'metrics_available_campaign_count' => $metricCount,
            'enabled_rule_count' => count(array_filter($rules, static fn(array $item): bool => $item['state'] !== 'disabled')),
            'blocked_rule_count' => $snapshotBlockedRules,
            'candidate_count' => $candidateTotal,
            'rules' => $rules,
        ];
        $json = json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $snapshotState = !$snapshotValid ? 'blocked_incomplete'
            : ($result['enabled_rule_count'] === 0 ? 'no_enabled_rules' : ($candidateTotal > 0 ? 'candidates_found' : ($snapshotBlockedRules > 0 ? 'partially_blocked' : 'evaluated')));
        $insert->execute([
            ':snapshot_id' => $row['snapshot_id'], ':source_snapshot_id' => $row['source_snapshot_id'], ':policy_revision' => $revision,
            ':completed_at_utc' => $row['completed_at_utc'], ':due_at' => $dueAt, ':evaluated_at' => $evaluatedAt,
            ':snapshot_state' => $snapshotState, ':enabled_count' => $result['enabled_rule_count'],
            ':blocked_count' => $result['blocked_rule_count'], ':candidate_count' => $candidateTotal,
            ':result_sha256' => hash('sha256', $json), ':result_json' => $json,
        ]);
        if ($insert->rowCount() === 1) {
            $evaluated++;
            $blockedRulesTotal += $snapshotBlockedRules;
        }
    }
    return ['evaluated' => $evaluated, 'blocked_rules' => $blockedRulesTotal];
}

function hub_auto_pause_worker_claim_next(PDO $pdo): ?array
{
    $pdo->beginTransaction();
    try {
        $authority = $pdo->query('SELECT authority,hub_lease_until_utc,server_started_at_utc FROM google_ads_auto_pause_authority WHERE authority_id=1 FOR UPDATE')->fetch();
        if (!is_array($authority)) {
            $pdo->commit();
            return null;
        }
        $leaseUntil = isset($authority['hub_lease_until_utc']) ? new DateTimeImmutable((string)$authority['hub_lease_until_utc'], new DateTimeZone('UTC')) : null;
        $hubLeaseActive = $leaseUntil !== null && $leaseUntil > new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $serverCanClaim = $authority['authority'] === 'server' && !$hubLeaseActive && is_string($authority['server_started_at_utc'] ?? null) && $authority['server_started_at_utc'] !== '';
        if ($serverCanClaim) {
            $stale = $pdo->prepare(
                "UPDATE google_ads_auto_pause_jobs j JOIN google_ads_auto_pause_snapshot_payloads p ON p.snapshot_id=j.snapshot_id "
                . "SET j.state='skipped',j.result_code='pre_cutover_superseded',j.updated_at_utc=UTC_TIMESTAMP(3) "
                . "WHERE j.state='pending' AND j.rule_code<>'" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "' AND p.received_at_utc<:server_started_at"
            );
            $stale->execute([':server_started_at' => $authority['server_started_at_utc']]);
        }
        $statement = $pdo->prepare(
            "SELECT j.job_id,j.snapshot_id,j.product_key,j.rule_code,j.manager_customer_id,j.customer_id,j.campaign_id,j.campaign_name,j.available_at_utc,j.cancel_until_utc,s.completed_at_utc,p.received_at_utc "
            . "FROM google_ads_auto_pause_jobs j JOIN google_ads_auto_pause_snapshots s ON s.snapshot_id=j.snapshot_id LEFT JOIN google_ads_auto_pause_snapshot_payloads p ON p.snapshot_id=j.snapshot_id "
            . "WHERE (j.rule_code='" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "' OR (" . ($serverCanClaim ? 'p.received_at_utc>=:server_started_at' : '1=0') . ")) AND ((j.state='pending' AND j.available_at_utc<=UTC_TIMESTAMP(3) AND j.cancel_until_utc<=UTC_TIMESTAMP(3) "
            . "AND (j.rule_code='" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "' OR j.updated_at_utc<=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL " . HUB_AUTO_PAUSE_WORKER_RETRY_SECONDS . " SECOND))) "
            . "OR (j.state='processing' AND j.updated_at_utc<=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL " . HUB_AUTO_PAUSE_WORKER_PROCESSING_LEASE_SECONDS . " SECOND))) "
            . "ORDER BY (j.rule_code='" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "') DESC,j.available_at_utc,j.created_at_utc LIMIT 1 FOR UPDATE"
        );
        $statement->execute($serverCanClaim ? [':server_started_at' => $authority['server_started_at_utc']] : []);
        $job = $statement->fetch();
        if (!is_array($job)) {
            $pdo->commit();
            return null;
        }
        $update = $pdo->prepare("UPDATE google_ads_auto_pause_jobs SET state='processing',updated_at_utc=UTC_TIMESTAMP(3) WHERE job_id=:job_id");
        $update->execute([':job_id' => $job['job_id']]);
        $pdo->commit();
        return $job;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

/** If a newer complete Hub evaluation exists, require it to retain this candidate. */
function hub_auto_pause_worker_check_job(PDO $pdo, array $trackingConfig, array $job): ?string
{
    if (($job['rule_code'] ?? null) !== HUB_AUTO_PAUSE_SIMULATION_RULE_CODE) {
        $authority = $pdo->query('SELECT authority,server_started_at_utc FROM google_ads_auto_pause_authority WHERE authority_id=1')->fetch();
        if (!is_array($authority) || $authority['authority'] !== 'server') return 'authority_not_server';
        if (!is_string($authority['server_started_at_utc'] ?? null) || $authority['server_started_at_utc'] === '') return 'server_cutover_time_unavailable';
        if (!is_string($job['received_at_utc'] ?? null) || $job['received_at_utc'] < $authority['server_started_at_utc']) return 'pre_cutover_snapshot';
    }
    $configRow = $pdo->query('SELECT config_json FROM google_ads_auto_pause_config WHERE config_id=1')->fetch();
    if (!is_array($configRow)) return 'policy_unavailable';
    $policyJson = json_decode((string)($configRow['config_json'] ?? ''), true);
    try {
        $policy = hub_auto_pause_validate_policy($policyJson);
    } catch (Throwable) {
        return 'policy_invalid';
    }
    if (($policy['rules'][$job['rule_code']]['enabled'] ?? false) !== true) return 'rule_disabled';
    $guruProtection = $policy['guruMediaSaleProtection'] ?? ['status' => 'unavailable', 'campaigns' => []];
    if (($guruProtection['status'] ?? null) !== 'available') {
        $status = in_array($guruProtection['status'] ?? null, ['incomplete', 'unavailable', 'capacity_exceeded'], true) ? $guruProtection['status'] : 'unavailable';
        return 'gurumedia_protection_' . $status;
    }
    foreach ($guruProtection['campaigns'] ?? [] as $soldCampaign) {
        if (($soldCampaign['managerCustomerId'] ?? null) === (string)$job['manager_customer_id']
            && ($soldCampaign['customerId'] ?? null) === (string)$job['customer_id']
            && ($soldCampaign['campaignId'] ?? null) === (string)$job['campaign_id']) return 'gurumedia_sale_protected';
    }
    foreach ($policy['campaignExceptions'] ?? [] as $exception) {
        if (($exception['managerCustomerId'] ?? null) === (string)$job['manager_customer_id']
            && ($exception['customerId'] ?? null) === (string)$job['customer_id']
            && ($exception['campaignId'] ?? null) === (string)$job['campaign_id']
            && in_array((string)$job['rule_code'], $exception['excludedRules'] ?? [], true)) return 'campaign_rule_excluded';
    }
    if (!hub_google_ads_campaign_actions_enabled($trackingConfig)) return 'campaign_writes_disabled';

    $latest = $pdo->query('SELECT snapshot_id,completed_at_utc FROM google_ads_auto_pause_snapshots ORDER BY completed_at_utc DESC LIMIT 1')->fetch();
    if (!is_array($latest)) return 'snapshot_unavailable';
    $jobSnapshotAt = new DateTimeImmutable((string)$job['completed_at_utc'], new DateTimeZone('UTC'));
    $latestSnapshotAt = new DateTimeImmutable((string)$latest['completed_at_utc'], new DateTimeZone('UTC'));
    if ($latestSnapshotAt <= $jobSnapshotAt) return null;

    $fresh = $pdo->prepare(
        "SELECT job_id FROM google_ads_auto_pause_jobs WHERE snapshot_id=:snapshot_id AND product_key=:product_key AND rule_code=:rule_code "
        . "AND manager_customer_id=:manager_id AND customer_id=:customer_id AND campaign_id=:campaign_id AND state='pending' LIMIT 1"
    );
    $fresh->execute([
        ':snapshot_id' => $latest['snapshot_id'],
        ':product_key' => $job['product_key'],
        ':rule_code' => $job['rule_code'],
        ':manager_id' => $job['manager_customer_id'],
        ':customer_id' => $job['customer_id'],
        ':campaign_id' => $job['campaign_id'],
    ]);
    return $fresh->fetchColumn() === false ? 'candidate_not_confirmed' : null;
}

function hub_auto_pause_worker_finish(PDO $pdo, string $jobId, string $state, string $resultCode): void
{
    if (!in_array($state, ['pending', 'applied', 'skipped', 'failed'], true)
        || preg_match('/^[a-z0-9_]{1,64}$/D', $resultCode) !== 1) {
        throw new RuntimeException('invalid_worker_result');
    }
    $statement = $pdo->prepare(
        'UPDATE google_ads_auto_pause_jobs SET state=:state,result_code=:result_code,updated_at_utc=UTC_TIMESTAMP(3) WHERE job_id=:job_id AND state=\'processing\''
    );
    $statement->execute([':state' => $state, ':result_code' => $resultCode, ':job_id' => $jobId]);
}

function hub_auto_pause_worker_safe_code(string $apiCode): string
{
    return preg_match('/^[a-z0-9_]{1,56}$/D', $apiCode) === 1 ? $apiCode : 'api_action_rejected';
}
