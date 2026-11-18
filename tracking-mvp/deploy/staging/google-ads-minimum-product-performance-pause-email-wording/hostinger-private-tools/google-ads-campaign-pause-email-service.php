<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-service.php';

const GOOGLE_ADS_CAMPAIGN_PAUSE_EMAIL_OUTBOX_TABLE = 'google_ads_campaign_pause_email_outbox';

function google_ads_campaign_pause_email_reason_from_context($context): ?string
{
    if (!is_string($context)) return null;
    $reasons = [
        'automatic_negative_remaining' => 'negative_remaining',
        'automatic_product_performance' => 'product_performance',
        'automatic_minimum_product_performance' => 'minimum_product_performance',
        'automatic_campaign_age' => 'campaign_age',
        'automatic_campaign_zero_impressions' => 'campaign_zero_impressions',
    ];
    return $reasons[$context] ?? null;
}

function google_ads_campaign_pause_email_reason_label($reason): string
{
    $labels = [
        'negative_remaining' => 'valor restante negativo',
        'product_performance' => 'critério de desempenho entre campanhas ativas do mesmo produto',
        'minimum_product_performance' => 'concorrente elegível pelo teto absoluto de impressões configurado',
        'campaign_age' => 'tempo ativo acima do limite configurado',
        'campaign_zero_impressions' => 'limite de dias consecutivos sem impressões atingido',
    ];
    return is_string($reason) ? ($labels[$reason] ?? 'regra de pausa automática configurada') : 'regra de pausa automática configurada';
}

/** Queue a reference to a server-confirmed automatic pause, without SMTP data or spend values. */
function google_ads_campaign_pause_email_enqueue(
    PDO $pdo,
    string $managerCustomerId,
    string $customerId,
    string $campaignId,
    string $campaignName,
    string $pauseReason,
    string $verifiedAtUtc
): bool {
    if (preg_match('/^\d{10}$/D', $managerCustomerId) !== 1
        || preg_match('/^\d{10}$/D', $customerId) !== 1
        || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1
        || !in_array($pauseReason, ['negative_remaining', 'product_performance', 'minimum_product_performance', 'campaign_age', 'campaign_zero_impressions'], true)
        || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D', $verifiedAtUtc) !== 1) {
        throw new RuntimeException('notification_reference_invalid');
    }

    try {
        $confirmedAt = new DateTimeImmutable($verifiedAtUtc, new DateTimeZone('UTC'));
    } catch (Throwable $error) {
        throw new RuntimeException('notification_reference_invalid', 0, $error);
    }
    if ($confirmedAt->format('Y-m-d\TH:i:s\Z') !== $verifiedAtUtc) {
        throw new RuntimeException('notification_reference_invalid');
    }

    $cleanCampaignName = google_ads_campaign_pause_email_clean_text($campaignName, 255);
    if ($cleanCampaignName === '') {
        $cleanCampaignName = 'Campanha Google Ads';
    }
    $confirmedAtDb = $confirmedAt->format('Y-m-d H:i:s.000');
    $notificationContext = $pauseReason === 'negative_remaining'
        ? 'automatic_negative_remaining'
        : 'automatic_' . $pauseReason;
    $notificationKey = hash('sha256', implode('|', [
        $notificationContext,
        $managerCustomerId,
        $customerId,
        $campaignId,
        $verifiedAtUtc,
    ]));

    $statement = $pdo->prepare(
        'INSERT IGNORE INTO ' . GOOGLE_ADS_CAMPAIGN_PAUSE_EMAIL_OUTBOX_TABLE . '
            (notification_key, manager_customer_id, customer_id, campaign_id, campaign_name, pause_reason,
             confirmed_at_utc, created_at_utc, next_attempt_at_utc)
         VALUES (:notification_key, :manager_customer_id, :customer_id, :campaign_id, :campaign_name, :pause_reason,
                 :confirmed_at_utc, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))'
    );
    $statement->execute([
        ':notification_key' => $notificationKey,
        ':manager_customer_id' => $managerCustomerId,
        ':customer_id' => $customerId,
        ':campaign_id' => $campaignId,
        ':campaign_name' => $cleanCampaignName,
        ':pause_reason' => $pauseReason,
        ':confirmed_at_utc' => $confirmedAtDb,
    ]);
    return $statement->rowCount() === 1;
}

/** Queue failure is reported separately; it never reverses an already-confirmed Google Ads pause. */
function google_ads_campaign_pause_email_queue_verified_transition(
    array $trackingConfig,
    string $managerCustomerId,
    string $customerId,
    string $campaignId,
    string $campaignName,
    string $pauseReason,
    string $verifiedAtUtc
): string {
    try {
        $pdo = clickbank_ins_v8_open_database($trackingConfig);
        return google_ads_campaign_pause_email_enqueue(
            $pdo,
            $managerCustomerId,
            $customerId,
            $campaignId,
            $campaignName,
            $pauseReason,
            $verifiedAtUtc
        ) ? 'queued' : 'already_queued';
    } catch (Throwable $error) {
        error_log('Google Ads automatic-pause email could not be queued.');
        return 'queue_failed';
    }
}

function google_ads_campaign_pause_email_clean_text($value, int $maxLength = 512): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = preg_replace('/[\x00-\x1f\x7f]+/u', ' ', $value) ?? '';
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    return function_exists('mb_substr') ? mb_substr($value, 0, $maxLength, 'UTF-8') : substr($value, 0, $maxLength);
}

function google_ads_campaign_pause_email_local_datetime($value): string
{
    if (!is_string($value) || trim($value) === '') {
        return 'não informado';
    }
    try {
        return (new DateTimeImmutable(trim($value), new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('America/Sao_Paulo'))
            ->format('d/m/Y H:i:s');
    } catch (Throwable $error) {
        return 'não informado';
    }
}

function google_ads_campaign_pause_email_build_message(array $event): array
{
    $campaignName = google_ads_campaign_pause_email_clean_text($event['campaign_name'] ?? '', 255);
    if ($campaignName === '') {
        $campaignName = 'Campanha Google Ads';
    }
    $body = implode("\n", [
        'PAUSA AUTOMÁTICA CONFIRMADA NO GOOGLE ADS',
        '',
        'Campanha: ' . $campaignName,
        'ID da campanha: ' . google_ads_campaign_pause_email_clean_text($event['campaign_id'] ?? '', 20),
        'Conta Google Ads: ' . google_ads_campaign_pause_email_clean_text($event['customer_id'] ?? '', 10),
        'MCC: ' . google_ads_campaign_pause_email_clean_text($event['manager_customer_id'] ?? '', 10),
        'Status confirmado: Pausada',
        'Motivo: ' . google_ads_campaign_pause_email_reason_label($event['pause_reason'] ?? null) . '.',
        'Confirmada em: ' . google_ads_campaign_pause_email_local_datetime($event['confirmed_at_utc'] ?? null) . ' (São Paulo)',
        '',
        'O servidor confirmou a mudança de status pela API do Google Ads. Nenhuma outra configuração da campanha foi alterada.',
    ]) . "\n";

    return [
        'subject' => google_ads_campaign_pause_email_clean_text('Google Ads: pausa automática confirmada - ' . $campaignName, 180),
        'body' => $body,
    ];
}

/** Process a small batch through the existing shared SMTP transport and Cron worker. */
function google_ads_campaign_pause_email_process_batch(PDO $pdo, array $rawConfig, int $limit = 5, ?callable $sender = null): array
{
    $config = clickbank_ins_v8_email_normalize_config($rawConfig);
    $limit = max(1, min(10, $limit));
    $select = $pdo->query(
        'SELECT id FROM ' . GOOGLE_ADS_CAMPAIGN_PAUSE_EMAIL_OUTBOX_TABLE . '
         WHERE sent_at_utc IS NULL AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
           AND (locked_until_utc IS NULL OR locked_until_utc <= UTC_TIMESTAMP(3))
         ORDER BY id ASC LIMIT ' . $limit
    );
    $ids = array_map('intval', $select->fetchAll(PDO::FETCH_COLUMN));
    $sent = 0;
    $failed = 0;
    $send = $sender ?? 'clickbank_ins_v8_email_smtp_send';

    foreach ($ids as $id) {
        $claim = $pdo->prepare(
            'UPDATE ' . GOOGLE_ADS_CAMPAIGN_PAUSE_EMAIL_OUTBOX_TABLE . '
             SET locked_until_utc = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 300 SECOND)
             WHERE id = :id AND sent_at_utc IS NULL AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
               AND (locked_until_utc IS NULL OR locked_until_utc <= UTC_TIMESTAMP(3))'
        );
        $claim->execute([':id' => $id]);
        if ($claim->rowCount() !== 1) {
            continue;
        }

        $read = $pdo->prepare(
            'SELECT id, attempt_count, manager_customer_id, customer_id, campaign_id, campaign_name, pause_reason, confirmed_at_utc
             FROM ' . GOOGLE_ADS_CAMPAIGN_PAUSE_EMAIL_OUTBOX_TABLE . ' WHERE id = :id LIMIT 1'
        );
        $read->execute([':id' => $id]);
        $event = $read->fetch();
        $failureStage = 'notification_prepare';
        try {
            if (!is_array($event)) {
                throw new RuntimeException('notification_reference_invalid');
            }
            $message = google_ads_campaign_pause_email_build_message($event);
            $failureStage = 'smtp_send';
            $send($config, $message['subject'], $message['body']);
            $failureStage = 'outbox_update';
            $update = $pdo->prepare(
                'UPDATE ' . GOOGLE_ADS_CAMPAIGN_PAUSE_EMAIL_OUTBOX_TABLE . '
                 SET attempt_count = attempt_count + 1, sent_at_utc = UTC_TIMESTAMP(3),
                     locked_until_utc = NULL, last_error_code = NULL
                 WHERE id = :id AND sent_at_utc IS NULL'
            );
            $update->execute([':id' => $id]);
            $sent++;
        } catch (Throwable $error) {
            $attemptNumber = is_array($event) ? (int)$event['attempt_count'] + 1 : 1;
            $failureCode = clickbank_ins_v8_email_failure_code($error, $failureStage);
            $delay = clickbank_ins_v8_email_retry_delay_seconds($attemptNumber);
            $update = $pdo->prepare(
                'UPDATE ' . GOOGLE_ADS_CAMPAIGN_PAUSE_EMAIL_OUTBOX_TABLE . '
                 SET attempt_count = attempt_count + 1,
                     next_attempt_at_utc = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ' . $delay . ' SECOND),
                     locked_until_utc = NULL, last_error_code = :last_error_code
                 WHERE id = :id AND sent_at_utc IS NULL'
            );
            $update->execute([':last_error_code' => $failureCode, ':id' => $id]);
            $failed++;
        }
    }

    return ['selected' => count($ids), 'sent' => $sent, 'failed' => $failed];
}
