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

    $counts = ['selected' => 0, 'simulated' => 0, 'ready' => 0, 'would_skip' => 0, 'applied' => 0, 'skipped' => 0, 'retry' => 0, 'failed' => 0];
    try {
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
        "Google Ads auto-pause worker (%s): %d selecionados, %d simulações processadas, %d prontos, %d que seriam ignorados, %d pausados e confirmados, %d ignorados, %d para nova tentativa, %d falhas.\n",
        $execute ? 'execução' : 'prévia',
        $counts['selected'], $counts['simulated'], $counts['ready'], $counts['would_skip'], $counts['applied'], $counts['skipped'], $counts['retry'], $counts['failed']
    ));
} catch (Throwable) {
    error_log('Google Ads auto-pause worker could not start; check private configuration and database access.');
    fwrite(STDERR, "Worker de pausa automática não iniciou; confira a configuração privada e o banco.\n");
    exit(1);
}

function hub_auto_pause_worker_claim_next(PDO $pdo): ?array
{
    $pdo->beginTransaction();
    try {
        $statement = $pdo->query(
            "SELECT j.job_id,j.snapshot_id,j.product_key,j.rule_code,j.manager_customer_id,j.customer_id,j.campaign_id,j.campaign_name,j.available_at_utc,j.cancel_until_utc,s.completed_at_utc "
            . "FROM google_ads_auto_pause_jobs j JOIN google_ads_auto_pause_snapshots s ON s.snapshot_id=j.snapshot_id "
            . "WHERE ((j.state='pending' AND j.available_at_utc<=UTC_TIMESTAMP(3) AND j.cancel_until_utc<=UTC_TIMESTAMP(3) "
            . "AND (j.rule_code='" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "' OR j.updated_at_utc<=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL " . HUB_AUTO_PAUSE_WORKER_RETRY_SECONDS . " SECOND))) "
            . "OR (j.state='processing' AND j.updated_at_utc<=DATE_SUB(UTC_TIMESTAMP(3), INTERVAL " . HUB_AUTO_PAUSE_WORKER_PROCESSING_LEASE_SECONDS . " SECOND))) "
            . "ORDER BY (j.rule_code='" . HUB_AUTO_PAUSE_SIMULATION_RULE_CODE . "') DESC,j.available_at_utc,j.created_at_utc LIMIT 1 FOR UPDATE"
        );
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
