<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-lib.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-email-service.php';

function clickbank_ins_v8_result(int $status, array $body): array
{
    return ['status' => $status, 'body' => $body];
}

function clickbank_ins_v8_open_database(array $config): PDO
{
    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key]) || $config[$key] === '') {
            throw new RuntimeException('database_unavailable');
        }
    }
    $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 2,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function clickbank_ins_v8_diagnostic_id(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-'
        . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function clickbank_ins_v8_record_attempt(
    PDO $pdo,
    string $diagnosticId,
    ?string $eventKey,
    string $result,
    ?string $reason,
    int $httpStatus
): void {
    $statement = $pdo->prepare(
        'INSERT INTO clickbank_ins_v8_attempts
            (received_at_utc, diagnostic_id, event_key, attempt_result, reason_code, http_status)
         VALUES (UTC_TIMESTAMP(3), :diagnostic_id, :event_key, :attempt_result, :reason_code, :http_status)'
    );
    $statement->execute([
        ':diagnostic_id' => $diagnosticId,
        ':event_key' => $eventKey,
        ':attempt_result' => $result,
        ':reason_code' => $reason,
        ':http_status' => $httpStatus,
    ]);
}

function clickbank_ins_v8_extclid_lookup(?string $extclid): ?array
{
    if ($extclid === null || strlen($extclid) > 256 || preg_match('/^[\x21-\x7e]+$/D', $extclid) !== 1) {
        return null;
    }
    $where = 'clickbank_extclid = :clickbank_extclid';
    $parameters = [':clickbank_extclid' => $extclid];
    if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $extclid) === 1) {
        // Keep resolving historical events produced before extclid was stored separately.
        $where .= ' OR click_id = :legacy_click_id';
        $parameters[':legacy_click_id'] = $extclid;
    }
    return ['where' => $where, 'parameters' => $parameters];
}

function clickbank_ins_v8_find_matched_gclids(PDO $pdo, ?string $extclid): array
{
    $lookup = clickbank_ins_v8_extclid_lookup($extclid);
    if ($lookup === null) {
        return [];
    }
    $statement = $pdo->prepare(
        "SELECT DISTINCT gclid FROM tracking_events
         WHERE event_type = 'outbound_click' AND ({$lookup['where']})
           AND gclid IS NOT NULL AND gclid <> ''
         LIMIT 2"
    );
    $statement->execute($lookup['parameters']);
    return array_map('strval', $statement->fetchAll(PDO::FETCH_COLUMN));
}

function clickbank_ins_v8_insert_transaction(PDO $pdo, array $event): array
{
    $statement = $pdo->prepare(
        'INSERT IGNORE INTO clickbank_ins_v8_transactions
            (source, ins_version, role, transaction_type, event_key, receipt_id,
             transaction_time_source, transaction_time_utc, customer_country, commission_total, sale_gross_total,
             commission_currency, upsell_original_receipt, gclid, extclid, aff_sub1,
             clickbank_click_id, tracking_id, gclid_source,
             commission_reconciliation_status, is_test, received_at_utc)
         VALUES
            (:source, :ins_version, :role, :transaction_type, :event_key, :receipt_id,
             :transaction_time_source, :transaction_time_utc, :customer_country, :commission_total, :sale_gross_total,
             :commission_currency, :upsell_original_receipt, :gclid, :extclid, :aff_sub1,
             :clickbank_click_id, :tracking_id, :gclid_source,
             :commission_reconciliation_status, :is_test, UTC_TIMESTAMP(3))'
    );
    $statement->execute([
        ':source' => $event['source'],
        ':ins_version' => $event['ins_version'],
        ':role' => $event['role'],
        ':transaction_type' => $event['transaction_type'],
        ':event_key' => $event['event_key'],
        ':receipt_id' => $event['receipt_id'],
        ':transaction_time_source' => $event['transaction_time_source'],
        ':transaction_time_utc' => $event['transaction_time_utc'],
        ':customer_country' => $event['customer_country'],
        ':commission_total' => $event['commission_total'],
        ':sale_gross_total' => $event['sale_gross_total'],
        ':commission_currency' => $event['commission_currency'],
        ':upsell_original_receipt' => $event['upsell_original_receipt'],
        ':gclid' => $event['gclid'],
        ':extclid' => $event['extclid'],
        ':aff_sub1' => $event['aff_sub1'],
        ':clickbank_click_id' => $event['clickbank_click_id'],
        ':tracking_id' => $event['tracking_id'],
        ':gclid_source' => $event['gclid_source'],
        ':commission_reconciliation_status' => $event['commission_reconciliation_status'],
        ':is_test' => $event['is_test'],
    ]);

    if ($statement->rowCount() === 1) {
        $transactionId = (int)$pdo->lastInsertId();
        if ($event['line_items'] !== []) {
            $lineStatement = $pdo->prepare(
                'INSERT INTO clickbank_ins_v8_line_items
                    (transaction_id, line_index, product_item_no, product_title, line_item_type,
                     quantity, commission_amount, product_price, product_discount)
                 VALUES
                    (:transaction_id, :line_index, :product_item_no, :product_title, :line_item_type,
                     :quantity, :commission_amount, :product_price, :product_discount)'
            );
            foreach ($event['line_items'] as $item) {
                $lineStatement->execute([
                    ':transaction_id' => $transactionId,
                    ':line_index' => $item['line_index'],
                    ':product_item_no' => $item['product_item_no'],
                    ':product_title' => $item['product_title'],
                    ':line_item_type' => $item['line_item_type'],
                    ':quantity' => $item['quantity'],
                    ':commission_amount' => $item['commission_amount'],
                    ':product_price' => $item['product_price'],
                    ':product_discount' => $item['product_discount'],
                ]);
            }
        }
        return ['recorded' => true, 'transaction_id' => $transactionId];
    }

    $existing = $pdo->prepare(
        'SELECT id FROM clickbank_ins_v8_transactions WHERE event_key = :event_key LIMIT 1'
    );
    $existing->execute([':event_key' => $event['event_key']]);
    $transactionId = $existing->fetchColumn();
    if ($transactionId === false) {
        throw new RuntimeException('database_unavailable');
    }
    return ['recorded' => false, 'transaction_id' => (int)$transactionId];
}

function clickbank_ins_v8_enrich_duplicate_attribution(PDO $pdo, int $transactionId, array $event): ?string
{
    $select = $pdo->prepare(
        'SELECT gclid, gclid_source FROM clickbank_ins_v8_transactions WHERE id = :id LIMIT 1'
    );
    $select->execute([':id' => $transactionId]);
    $existing = $select->fetch();
    if (!is_array($existing)) {
        return null;
    }

    [$gclid, $source, $changed] = cb_ins_v8_merge_attribution(
        is_string($existing['gclid']) ? $existing['gclid'] : null,
        (string)$existing['gclid_source'],
        $event['gclid'],
        $event['gclid_source']
    );
    if (!$changed) {
        return null;
    }
    $update = $pdo->prepare(
        'UPDATE clickbank_ins_v8_transactions
         SET gclid = :gclid, gclid_source = :gclid_source
         WHERE id = :id'
    );
    $update->execute([
        ':gclid' => $gclid,
        ':gclid_source' => $source,
        ':id' => $transactionId,
    ]);
    return $source === 'conflict' ? 'attribution_conflict' : 'attribution_enriched';
}

/** Handle one request and return an HTTP status plus a small non-sensitive JSON body. */
function clickbank_ins_v8_handle_request(string $method, string $rawBody, array $config): array
{
    if (strtoupper($method) !== 'POST') {
        return clickbank_ins_v8_result(405, ['ok' => false, 'error' => 'method_not_allowed']);
    }
    if (strlen($rawBody) > 65536) {
        return clickbank_ins_v8_result(413, ['ok' => false, 'error' => 'payload_too_large']);
    }
    $secretKey = $config['clickbank_ins_v8_secret_key'] ?? null;
    if (!is_string($secretKey) || $secretKey === '' || strlen($secretKey) > 16) {
        error_log('Tracking MVP INS v8: private secret configuration is missing or invalid.');
        return clickbank_ins_v8_result(503, ['ok' => false, 'error' => 'receiver_unavailable']);
    }
    if (!function_exists('openssl_decrypt')) {
        error_log('Tracking MVP INS v8: PHP OpenSSL extension is unavailable.');
        return clickbank_ins_v8_result(503, ['ok' => false, 'error' => 'receiver_unavailable']);
    }

    try {
        $payload = cb_ins_v8_decode_envelope($rawBody, $secretKey);
    } catch (InvalidArgumentException $error) {
        return clickbank_ins_v8_result(400, ['ok' => false, 'error' => 'invalid_envelope']);
    } catch (Throwable $error) {
        return clickbank_ins_v8_result(401, ['ok' => false, 'error' => 'notification_not_decrypted']);
    }

    $diagnosticId = clickbank_ins_v8_diagnostic_id();
    try {
        $event = cb_ins_v8_normalize_payload($payload);
    } catch (Throwable $error) {
        try {
            $pdo = clickbank_ins_v8_open_database($config);
            clickbank_ins_v8_record_attempt(
                $pdo,
                $diagnosticId,
                null,
                'rejected',
                cb_ins_v8_validation_reason_code($error),
                400
            );
        } catch (Throwable $databaseError) {
            error_log('Tracking MVP INS v8: rejected notification could not be audited.');
        }
        return clickbank_ins_v8_result(400, ['ok' => false, 'error' => 'invalid_notification', 'diagnostic_id' => $diagnosticId]);
    }

    try {
        $pdo = clickbank_ins_v8_open_database($config);
        $matchedGclids = clickbank_ins_v8_find_matched_gclids($pdo, $event['extclid']);
        [$event['gclid'], $event['gclid_source']] = cb_ins_v8_resolve_gclid(
            $event['gclid'],
            $event['extclid'],
            $matchedGclids
        );
        $pdo->beginTransaction();
        $stored = clickbank_ins_v8_insert_transaction($pdo, $event);
        try {
            clickbank_ins_v8_email_enqueue($pdo, $stored['transaction_id'], $event);
        } catch (Throwable $notificationError) {
            // Email is auxiliary: never hold up or reject ClickBank's INS acknowledgement.
            error_log('Tracking MVP INS v8: notification enqueue failed.');
        }
        $duplicateReason = null;
        if (!$stored['recorded']) {
            $duplicateReason = clickbank_ins_v8_enrich_duplicate_attribution(
                $pdo,
                $stored['transaction_id'],
                $event
            );
        }
        clickbank_ins_v8_record_attempt(
            $pdo,
            $diagnosticId,
            $event['event_key'],
            $stored['recorded'] ? 'inserted' : 'duplicate',
            $duplicateReason,
            200
        );
        $pdo->commit();
        return clickbank_ins_v8_result(200, [
            'ok' => true,
            'recorded' => $stored['recorded'],
            'result' => $stored['recorded'] ? 'inserted' : 'duplicate',
            'diagnostic_id' => $diagnosticId,
        ]);
    } catch (Throwable $error) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (isset($pdo) && $pdo instanceof PDO) {
            try {
                clickbank_ins_v8_record_attempt($pdo, $diagnosticId, $event['event_key'], 'db_error', 'storage_failed', 503);
            } catch (Throwable $auditError) {
                error_log('Tracking MVP INS v8: storage failure could not be audited.');
            }
        }
        error_log('Tracking MVP INS v8: database operation failed.');
        return clickbank_ins_v8_result(503, [
            'ok' => false,
            'error' => 'receiver_unavailable',
            'diagnostic_id' => $diagnosticId,
        ]);
    }
}
