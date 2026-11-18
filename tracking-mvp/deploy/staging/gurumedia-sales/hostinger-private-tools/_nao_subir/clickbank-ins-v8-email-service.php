<?php
declare(strict_types=1);

const CLICKBANK_INS_V8_EMAIL_OUTBOX_TABLE = 'clickbank_ins_v8_email_outbox';
const CLICKBANK_POSTBACK_EMAIL_OUTBOX_TABLE = 'clickbank_postback_email_outbox';

/** Return the only event categories that should create a notification. */
function clickbank_ins_v8_email_notification_kind(array $event): ?string
{
    $type = strtoupper(trim((string)($event['transaction_type'] ?? '')));
    $isTest = (int)($event['is_test'] ?? 0) === 1
        || preg_match('/^(?:TEST(?:[_ -]|$)|CANCEL-TEST|UNCANCEL-TEST)/', $type) === 1;
    if ($isTest) {
        return 'test';
    }
    return strtoupper(trim((string)($event['role'] ?? ''))) === 'AFFILIATE' && $type === 'SALE'
        ? 'sale'
        : null;
}

/** Queue only a reference to the committed transaction; never store email/SMTP data here. */
function clickbank_ins_v8_email_enqueue(PDO $pdo, int $transactionId, array $event): bool
{
    $kind = clickbank_ins_v8_email_notification_kind($event);
    if ($kind === null) {
        return false;
    }
    $eventKey = $event['event_key'] ?? null;
    if (!is_string($eventKey) || preg_match('/^[a-f0-9]{64}$/iD', $eventKey) !== 1 || $transactionId < 1) {
        throw new RuntimeException('notification_reference_invalid');
    }
    $statement = $pdo->prepare(
        'INSERT IGNORE INTO ' . CLICKBANK_INS_V8_EMAIL_OUTBOX_TABLE . '
            (transaction_id, event_key, notification_kind, created_at_utc, next_attempt_at_utc)
         VALUES (:transaction_id, :event_key, :notification_kind, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))'
    );
    $statement->execute([
        ':transaction_id' => $transactionId,
        ':event_key' => $eventKey,
        ':notification_kind' => $kind,
    ]);
    return $statement->rowCount() === 1;
}

function clickbank_ins_v8_email_valid_address($value): bool
{
    return is_string($value) && strlen($value) <= 254
        && preg_match('/^[^\x00-\x20\x7f<>(),;:\\"\[\]]+@[^\x00-\x20\x7f<>(),;:\\"\[\]]+$/D', $value) === 1
        && filter_var($value, FILTER_VALIDATE_EMAIL) !== false;
}

function clickbank_ins_v8_email_valid_host($value): bool
{
    if (!is_string($value) || strlen($value) > 253 || $value === ''
        || preg_match('/[\x00-\x20\x7f\/\\:@]/', $value) === 1) {
        return false;
    }
    if (filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false) {
        return true;
    }
    return preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/iD', $value) === 1;
}

/** Validate a private SMTP config again on the server before opening a socket. */
function clickbank_ins_v8_email_normalize_config(array $config): array
{
    $to = $config['to_email'] ?? null;
    $from = $config['from_email'] ?? null;
    $host = $config['smtp_host'] ?? null;
    $username = $config['smtp_username'] ?? null;
    $password = $config['smtp_password'] ?? null;
    $security = $config['smtp_security'] ?? null;
    $port = filter_var($config['smtp_port'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    if (!clickbank_ins_v8_email_valid_address($to) || !clickbank_ins_v8_email_valid_address($from)
        || !clickbank_ins_v8_email_valid_host($host) || $port === false
        || !in_array($security, ['ssl', 'starttls'], true)
        || !is_string($username) || $username === '' || strlen($username) > 320
        || preg_match('/[\x00-\x1f\x7f]/', $username) === 1
        || !is_string($password) || $password === '' || strlen($password) > 1024
        || preg_match('/[\x00-\x1f\x7f]/', $password) === 1) {
        throw new RuntimeException('configuration_invalid');
    }
    return [
        'to_email' => $to,
        'from_email' => $from,
        'smtp_host' => $host,
        'smtp_port' => (int)$port,
        'smtp_security' => $security,
        'smtp_username' => $username,
        'smtp_password' => $password,
    ];
}

function clickbank_ins_v8_email_clean_text($value, int $maxLength = 512): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = preg_replace('/[\x00-\x1f\x7f]+/u', ' ', $value) ?? '';
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    return function_exists('mb_substr') ? mb_substr($value, 0, $maxLength, 'UTF-8') : substr($value, 0, $maxLength);
}

function clickbank_ins_v8_email_mask_receipt($receipt): string
{
    $value = clickbank_ins_v8_email_clean_text($receipt, 128);
    if ($value === '') {
        return 'não informado';
    }
    $suffix = function_exists('mb_substr') ? mb_substr($value, -4, null, 'UTF-8') : substr($value, -4);
    return '••••' . $suffix;
}

function clickbank_ins_v8_email_utc($value): string
{
    if (!is_string($value) || trim($value) === '') {
        return 'não informado';
    }
    return clickbank_ins_v8_email_clean_text($value, 32) . ' UTC';
}

/** Format a stored transaction amount for a human-readable email. */
function clickbank_ins_v8_email_format_money($amount, $currency): ?string
{
    if ((!is_string($amount) && !is_int($amount) && !is_float($amount)) || !is_numeric($amount)) {
        return null;
    }
    $formattedAmount = number_format((float)$amount, 2, ',', '.');
    $currencyCode = strtoupper(clickbank_ins_v8_email_clean_text($currency, 3));
    return $currencyCode === 'USD'
        ? 'US$ ' . $formattedAmount
        : $formattedAmount . ' ' . (preg_match('/^[A-Z]{3}$/D', $currencyCode) === 1 ? $currencyCode : '—');
}

/** Produce plain text without GCLID, extclid, buyer address, or full receipt identifiers. */
function clickbank_ins_v8_email_build_message(array $outbox, array $transaction, array $items): array
{
    $kind = ($outbox['notification_kind'] ?? '') === 'test' ? 'test' : 'sale';
    $isTest = $kind === 'test' || (int)($transaction['is_test'] ?? 0) === 1;
    $commission = clickbank_ins_v8_email_format_money(
        $transaction['commission_total'] ?? null,
        $transaction['commission_currency'] ?? null
    );
    $subject = $isTest
        ? 'TESTE - Notificação ClickBank'
        : 'Venda ClickBank recebida' . ($commission !== null ? ' - ' . $commission : '');
    $lines = [
        $isTest ? 'NOTIFICAÇÃO DE TESTE' : 'VENDA DE AFILIADO RECEBIDA',
        '',
        'Evento: ' . clickbank_ins_v8_email_clean_text($transaction['transaction_type'] ?? '', 48),
        'Recebido em: ' . clickbank_ins_v8_email_utc($transaction['received_at_utc'] ?? null),
        'Horário da transação: ' . clickbank_ins_v8_email_utc($transaction['transaction_time_utc'] ?? null),
        'País de cobrança: ' . (preg_match('/^[A-Z]{2}$/D', (string)($transaction['customer_country'] ?? '')) === 1
            ? $transaction['customer_country']
            : 'não informado'),
        'Recibo: ' . clickbank_ins_v8_email_mask_receipt($transaction['receipt_id'] ?? null),
        'Total bruto: ' . (isset($transaction['sale_gross_total']) && $transaction['sale_gross_total'] !== null
            ? clickbank_ins_v8_email_clean_text((string)$transaction['sale_gross_total'], 32) : 'não informado')
            . ' ' . (clickbank_ins_v8_email_clean_text($transaction['commission_currency'] ?? '', 3) ?: '—'),
        'Comissão afiliada: ' . ($commission ?? 'não informado'),
        '',
        'Produtos/itens:',
    ];
    $visibleItems = array_slice($items, 0, 5);
    if ($visibleItems === []) {
        $lines[] = '- Nenhum item informado';
    } else {
        foreach ($visibleItems as $item) {
            $title = clickbank_ins_v8_email_clean_text($item['product_title'] ?? '', 180) ?: 'Item sem nome';
            $quantity = clickbank_ins_v8_email_clean_text($item['quantity'] ?? '', 24);
            $lines[] = '- ' . $title . ($quantity !== '' ? ' · quantidade ' . $quantity : '');
        }
        if (count($items) > count($visibleItems)) {
            $lines[] = '- e mais ' . (count($items) - count($visibleItems)) . ' item(ns)';
        }
    }
    $lines[] = '';
    $lines[] = $isTest
        ? 'Este evento está marcado como TESTE e não é elegível para o CSV do Google Ads.'
        : 'Revise a transação e a elegibilidade no Hub antes de preparar o CSV. Este e-mail não envia conversões ao Google Ads.';
    $lines[] = 'Esta mensagem não inclui GCLID, extclid nem endereço de comprador.';
    return ['subject' => $subject, 'body' => implode("\n", $lines) . "\n"];
}

function clickbank_ins_v8_email_smtp_read($socket): int
{
    $code = null;
    $total = 0;
    do {
        $line = fgets($socket, 2049);
        if (!is_string($line) || $line === '' || strlen($line) > 2048) {
            throw new RuntimeException('smtp_protocol_error');
        }
        $total += strlen($line);
        if ($total > 8192 || preg_match('/^(\d{3})([ -])/', $line, $matches) !== 1) {
            throw new RuntimeException('smtp_protocol_error');
        }
        $lineCode = (int)$matches[1];
        if ($code !== null && $code !== $lineCode) {
            throw new RuntimeException('smtp_protocol_error');
        }
        $code = $lineCode;
    } while ($matches[2] === '-');
    $metadata = stream_get_meta_data($socket);
    if (!empty($metadata['timed_out'])) {
        throw new RuntimeException('smtp_timeout');
    }
    return (int)$code;
}

function clickbank_ins_v8_email_smtp_write($socket, string $data): void
{
    $offset = 0;
    $length = strlen($data);
    while ($offset < $length) {
        $written = fwrite($socket, substr($data, $offset));
        if (!is_int($written) || $written < 1) {
            throw new RuntimeException('smtp_connection_lost');
        }
        $offset += $written;
    }
}

function clickbank_ins_v8_email_smtp_command(
    $socket,
    string $command,
    array $expected,
    string $failureCode = 'smtp_rejected'
): int
{
    clickbank_ins_v8_email_smtp_write($socket, $command . "\r\n");
    $code = clickbank_ins_v8_email_smtp_read($socket);
    if (!in_array($code, $expected, true)) {
        throw new RuntimeException($failureCode);
    }
    return $code;
}

/** Minimal TLS-only SMTP transport (implicit TLS or STARTTLS); no PHP mail() fallback. */
function clickbank_ins_v8_email_smtp_send(array $rawConfig, string $subject, string $body): void
{
    $stage = 'configuration';
    $socket = null;
    try {
        $config = clickbank_ins_v8_email_normalize_config($rawConfig);
        $host = $config['smtp_host'];
        $context = stream_context_create(['ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
            'peer_name' => $host,
            'SNI_enabled' => true,
        ]]);
        $transport = $config['smtp_security'] === 'ssl' ? 'ssl://' : 'tcp://';
        $stage = 'smtp_connect';
        $socket = @stream_socket_client(
            $transport . $host . ':' . $config['smtp_port'],
            $errorNumber,
            $errorMessage,
            12,
            STREAM_CLIENT_CONNECT,
            $context
        );
        if (!is_resource($socket)) {
            throw new RuntimeException('smtp_connect_failed');
        }
        stream_set_timeout($socket, 12);

        $stage = 'smtp_greeting';
        if (clickbank_ins_v8_email_smtp_read($socket) !== 220) {
            throw new RuntimeException('smtp_greeting_failed');
        }
        $stage = 'smtp_ehlo';
        clickbank_ins_v8_email_smtp_command($socket, 'EHLO localhost', [250], 'smtp_ehlo_failed');
        if ($config['smtp_security'] === 'starttls') {
            $stage = 'smtp_starttls';
            clickbank_ins_v8_email_smtp_command($socket, 'STARTTLS', [220], 'smtp_starttls_failed');
            $crypto = @stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            if ($crypto !== true) {
                throw new RuntimeException('smtp_tls_failed');
            }
            $stage = 'smtp_ehlo';
            clickbank_ins_v8_email_smtp_command($socket, 'EHLO localhost', [250], 'smtp_ehlo_failed');
        }
        $stage = 'smtp_auth';
        clickbank_ins_v8_email_smtp_command($socket, 'AUTH LOGIN', [334], 'smtp_auth_failed');
        clickbank_ins_v8_email_smtp_command(
            $socket,
            base64_encode($config['smtp_username']),
            [334],
            'smtp_auth_failed'
        );
        clickbank_ins_v8_email_smtp_command(
            $socket,
            base64_encode($config['smtp_password']),
            [235],
            'smtp_auth_failed'
        );
        $stage = 'smtp_sender';
        clickbank_ins_v8_email_smtp_command(
            $socket,
            'MAIL FROM:<' . $config['from_email'] . '>',
            [250],
            'smtp_sender_rejected'
        );
        $stage = 'smtp_recipient';
        clickbank_ins_v8_email_smtp_command(
            $socket,
            'RCPT TO:<' . $config['to_email'] . '>',
            [250, 251],
            'smtp_recipient_rejected'
        );
        $stage = 'smtp_data';
        clickbank_ins_v8_email_smtp_command($socket, 'DATA', [354], 'smtp_data_rejected');

        $stage = 'smtp_message';
        $messageIdDomain = substr(strrchr($config['from_email'], '@') ?: '@localhost', 1);
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $encodedBody = rtrim(chunk_split(base64_encode($body), 76, "\r\n"));
        $message = 'From: <' . $config['from_email'] . ">\r\n"
            . 'To: <' . $config['to_email'] . ">\r\n"
            . 'Subject: ' . $encodedSubject . "\r\n"
            . 'Date: ' . gmdate('D, d M Y H:i:s') . " +0000\r\n"
            . 'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $messageIdDomain . ">\r\n"
            . "MIME-Version: 1.0\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: base64\r\n\r\n"
            . $encodedBody . "\r\n.\r\n";
        clickbank_ins_v8_email_smtp_write($socket, $message);
        if (clickbank_ins_v8_email_smtp_read($socket) !== 250) {
            throw new RuntimeException('smtp_message_rejected');
        }
        $stage = 'smtp_quit';
        try {
            clickbank_ins_v8_email_smtp_command($socket, 'QUIT', [221]);
        } catch (Throwable $ignored) {
            // SMTP has already accepted the message; do not report a duplicate-prone failure.
        }
    } catch (Throwable $error) {
        $failureCode = clickbank_ins_v8_email_failure_code($error, $stage);
        if ($failureCode === $error->getMessage()) {
            throw $error;
        }
        throw new RuntimeException($failureCode, 0, $error);
    } finally {
        if (is_resource($socket)) {
            fclose($socket);
        }
    }
}

function clickbank_ins_v8_email_failure_code(Throwable $error, string $stage = ''): string
{
    static $allowed = [
        'smtp_auth_failed', 'smtp_connect_failed', 'smtp_connection_lost', 'smtp_protocol_error',
        'smtp_rejected', 'smtp_timeout', 'smtp_tls_failed', 'smtp_greeting_failed', 'smtp_ehlo_failed',
        'smtp_starttls_failed', 'smtp_sender_rejected', 'smtp_recipient_rejected', 'smtp_data_rejected',
        'smtp_data_failed',
        'smtp_message_rejected', 'smtp_message_failed', 'smtp_transport_failed', 'smtp_unexpected_failure',
        'configuration_invalid', 'notification_reference_invalid', 'notification_build_failed',
        'outbox_update_failed',
    ];
    if (in_array($error->getMessage(), $allowed, true)) {
        return $error->getMessage();
    }

    return match ($stage) {
        'configuration' => 'configuration_invalid',
        'notification_prepare' => 'notification_build_failed',
        'smtp_connect' => 'smtp_connect_failed',
        'smtp_greeting' => 'smtp_greeting_failed',
        'smtp_ehlo' => 'smtp_ehlo_failed',
        'smtp_starttls' => 'smtp_starttls_failed',
        'smtp_auth' => 'smtp_auth_failed',
        'smtp_sender' => 'smtp_sender_rejected',
        'smtp_recipient' => 'smtp_recipient_rejected',
        'smtp_data' => 'smtp_data_failed',
        'smtp_message' => 'smtp_message_failed',
        'smtp_quit' => 'smtp_transport_failed',
        'smtp_send' => 'smtp_unexpected_failure',
        'outbox_update' => 'outbox_update_failed',
        default => 'notification_failed',
    };
}

function clickbank_ins_v8_email_retry_delay_seconds(int $attemptNumber): int
{
    $steps = [60, 300, 900, 3600, 21600];
    return $steps[min(max($attemptNumber - 1, 0), count($steps) - 1)];
}

/** Process a small batch. A lock prevents overlapping Cron runs from sending the same row. */
function clickbank_ins_v8_email_process_batch(PDO $pdo, array $rawConfig, int $limit = 5, ?callable $sender = null): array
{
    $config = clickbank_ins_v8_email_normalize_config($rawConfig);
    $limit = max(1, min(10, $limit));
    $select = $pdo->query(
        'SELECT id FROM ' . CLICKBANK_INS_V8_EMAIL_OUTBOX_TABLE . '
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
            'UPDATE ' . CLICKBANK_INS_V8_EMAIL_OUTBOX_TABLE . '
             SET locked_until_utc = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 300 SECOND)
             WHERE id = :id AND sent_at_utc IS NULL AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
               AND (locked_until_utc IS NULL OR locked_until_utc <= UTC_TIMESTAMP(3))'
        );
        $claim->execute([':id' => $id]);
        if ($claim->rowCount() !== 1) {
            continue;
        }
        $read = $pdo->prepare(
            'SELECT o.id, o.notification_kind, o.attempt_count, t.id AS transaction_id,
                    t.transaction_type, t.role, t.is_test, t.receipt_id,
                    t.transaction_time_utc, t.received_at_utc, t.customer_country,
                    t.commission_total, t.sale_gross_total, t.commission_currency
             FROM ' . CLICKBANK_INS_V8_EMAIL_OUTBOX_TABLE . ' o
             INNER JOIN clickbank_ins_v8_transactions t ON t.id = o.transaction_id
             WHERE o.id = :id LIMIT 1'
        );
        $read->execute([':id' => $id]);
        $transaction = $read->fetch();
        $failureStage = 'notification_prepare';
        try {
            if (!is_array($transaction)) {
                throw new RuntimeException('notification_reference_invalid');
            }
            $itemsQuery = $pdo->prepare(
                'SELECT product_title, quantity FROM clickbank_ins_v8_line_items
                 WHERE transaction_id = :transaction_id ORDER BY line_index ASC LIMIT 100'
            );
                $itemsQuery->execute([':transaction_id' => (int)$transaction['transaction_id']]);
            $message = clickbank_ins_v8_email_build_message(
                $transaction,
                $transaction,
                $itemsQuery->fetchAll()
            );
            $failureStage = 'smtp_send';
            $send($config, $message['subject'], $message['body']);
            $failureStage = 'outbox_update';
            $update = $pdo->prepare(
                'UPDATE ' . CLICKBANK_INS_V8_EMAIL_OUTBOX_TABLE . '
                 SET attempt_count = attempt_count + 1, sent_at_utc = UTC_TIMESTAMP(3),
                     locked_until_utc = NULL, last_error_code = NULL
                 WHERE id = :id AND sent_at_utc IS NULL'
            );
            $update->execute([':id' => $id]);
            $sent++;
        } catch (Throwable $error) {
            $attemptNumber = is_array($transaction) ? (int)$transaction['attempt_count'] + 1 : 1;
            $failureCode = clickbank_ins_v8_email_failure_code($error, $failureStage);
            $delay = clickbank_ins_v8_email_retry_delay_seconds($attemptNumber);
            $update = $pdo->prepare(
                'UPDATE ' . CLICKBANK_INS_V8_EMAIL_OUTBOX_TABLE . '
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

/** Keep the private CLI worker independent from the public tracking helper files. */
function clickbank_postback_email_worker_notification_kind($eventType): ?string
{
    if (!is_string($eventType)) {
        return null;
    }
    $normalized = strtolower(trim($eventType));
    $normalized = preg_replace('/[^a-z0-9]+/', '_', $normalized) ?? '';
    $normalized = trim($normalized, '_');
    return in_array($normalized, ['order_impression', 'order_form_impression'], true)
        ? 'checkout'
        : null;
}

/** Resolve a human-readable Track only when the extclid maps to exactly one Track. */
function clickbank_postback_email_track_name_from_matches(array $matches): ?string
{
    if (count($matches) !== 1) {
        return null;
    }
    $match = $matches[0];
    if (!is_array($match)) {
        return null;
    }
    $label = clickbank_ins_v8_email_clean_text($match['product_label'] ?? '', 253);
    if ($label !== '') {
        return $label;
    }
    $productKey = clickbank_ins_v8_email_clean_text($match['product_key'] ?? '', 253);
    return $productKey !== '' ? $productKey : null;
}

/** Require one exact click identity and a matching current Hub allowlist entry. */
function clickbank_postback_email_registered_track_from_matches(array $matches): ?string
{
    if (count($matches) !== 1 || !is_array($matches[0])) {
        return null;
    }
    $match = $matches[0];
    $presellHost = strtolower(clickbank_ins_v8_email_clean_text($match['presell_host'] ?? '', 253));
    $allowedHost = strtolower(clickbank_ins_v8_email_clean_text($match['allowed_page_host'] ?? '', 253));
    $productKey = clickbank_ins_v8_email_clean_text($match['product_key'] ?? '', 253);
    if ($presellHost === '' || $allowedHost === '' || $presellHost !== $allowedHost || $productKey === '') {
        return null;
    }

    $label = clickbank_ins_v8_email_clean_text($match['product_label'] ?? '', 253);
    return $label !== '' ? $label : $productKey;
}

/** Resolve a checkout only from its exact extclid and a currently registered Hub Track. */
function clickbank_postback_email_find_registered_track(PDO $pdo, $extclid): ?string
{
    if (!is_string($extclid) || $extclid === '' || strlen($extclid) > 256
        || preg_match('/^[\x21-\x7e]+$/D', $extclid) !== 1) {
        return null;
    }
    $statement = $pdo->prepare(
        'SELECT DISTINCT e.presell_host, e.product_key,
                d.page_host AS allowed_page_host, d.product_label
         FROM tracking_events e
         LEFT JOIN tracking_allowed_domains d
           ON d.page_host = e.presell_host AND d.product_key = e.product_key AND d.platform = \'clickbank\'
         WHERE e.event_type = \'outbound_click\'
           AND (e.clickbank_extclid = :external_extclid OR e.click_id = :legacy_click_id)
           AND e.presell_host IS NOT NULL AND e.presell_host <> \'\'
           AND e.product_key IS NOT NULL AND e.product_key <> \'\'
         LIMIT 2'
    );
    $statement->execute([
        ':external_extclid' => $extclid,
        ':legacy_click_id' => $extclid,
    ]);
    return clickbank_postback_email_registered_track_from_matches($statement->fetchAll(PDO::FETCH_ASSOC));
}

/** Build a minimal alert; an order-form impression is not a purchase. */
function clickbank_postback_email_local_datetime($value): string
{
    if (!is_string($value) || trim($value) === '') {
        return 'não informado';
    }
    try {
        $date = new DateTimeImmutable(trim($value), new DateTimeZone('UTC'));
        return $date->setTimezone(new DateTimeZone('America/Sao_Paulo'))->format('d/m/Y H:i');
    } catch (Throwable $error) {
        return 'não informado';
    }
}

function clickbank_postback_email_build_message(array $event): array
{
    $trackName = clickbank_ins_v8_email_clean_text($event['track_name'] ?? '', 253) ?: 'não identificada';
    $body = implode("\n", [
        $trackName,
        'Horário do evento: ' . clickbank_postback_email_local_datetime($event['event_time'] ?? null),
        'Recebido em: ' . clickbank_postback_email_local_datetime($event['received_at_utc'] ?? null),
    ]) . "\n";
    return ['subject' => 'Checkout ClickBank', 'body' => $body];
}

/** Process a small batch of order-form impression alerts via the existing private SMTP config. */
function clickbank_postback_email_process_batch(PDO $pdo, array $rawConfig, int $limit = 5, ?callable $sender = null): array
{
    $config = clickbank_ins_v8_email_normalize_config($rawConfig);
    $limit = max(1, min(10, $limit));
    $select = $pdo->query(
        'SELECT id FROM ' . CLICKBANK_POSTBACK_EMAIL_OUTBOX_TABLE . '
         WHERE notification_kind = \'checkout\' AND sent_at_utc IS NULL
           AND (last_error_code IS NULL OR last_error_code <> \'checkout_track_not_registered\')
           AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
           AND (locked_until_utc IS NULL OR locked_until_utc <= UTC_TIMESTAMP(3))
         ORDER BY id ASC LIMIT ' . $limit
    );
    $ids = array_map('intval', $select->fetchAll(PDO::FETCH_COLUMN));
    $sent = 0;
    $failed = 0;
    $ignored = 0;
    $send = $sender ?? 'clickbank_ins_v8_email_smtp_send';
    foreach ($ids as $id) {
        $claim = $pdo->prepare(
            'UPDATE ' . CLICKBANK_POSTBACK_EMAIL_OUTBOX_TABLE . '
             SET locked_until_utc = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 300 SECOND)
             WHERE id = :id AND notification_kind = \'checkout\' AND sent_at_utc IS NULL
               AND (last_error_code IS NULL OR last_error_code <> \'checkout_track_not_registered\')
               AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
               AND (locked_until_utc IS NULL OR locked_until_utc <= UTC_TIMESTAMP(3))'
        );
        $claim->execute([':id' => $id]);
        if ($claim->rowCount() !== 1) {
            continue;
        }
        $read = $pdo->prepare(
            'SELECT o.id, o.attempt_count, e.event_type, e.event_time, e.received_at_utc, e.extclid
             FROM ' . CLICKBANK_POSTBACK_EMAIL_OUTBOX_TABLE . ' o
             INNER JOIN clickbank_postback_events e ON e.id = o.postback_event_id
             WHERE o.id = :id AND o.notification_kind = \'checkout\' LIMIT 1'
        );
        $read->execute([':id' => $id]);
        $event = $read->fetch();
        $failureStage = 'notification_prepare';
        try {
            if (!is_array($event)
                || clickbank_postback_email_worker_notification_kind($event['event_type'] ?? null) !== 'checkout') {
                throw new RuntimeException('notification_reference_invalid');
            }
            $event['track_name'] = clickbank_postback_email_find_registered_track($pdo, $event['extclid'] ?? null);
            if (!is_string($event['track_name']) || $event['track_name'] === '') {
                $ignore = $pdo->prepare(
                    'UPDATE ' . CLICKBANK_POSTBACK_EMAIL_OUTBOX_TABLE . '
                     SET locked_until_utc = NULL, last_error_code = \'checkout_track_not_registered\'
                     WHERE id = :id AND sent_at_utc IS NULL'
                );
                $ignore->execute([':id' => $id]);
                if ($ignore->rowCount() === 1) {
                    $ignored++;
                }
                continue;
            }
            $message = clickbank_postback_email_build_message($event);
            $failureStage = 'smtp_send';
            $send($config, $message['subject'], $message['body']);
            $failureStage = 'outbox_update';
            $update = $pdo->prepare(
                'UPDATE ' . CLICKBANK_POSTBACK_EMAIL_OUTBOX_TABLE . '
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
                'UPDATE ' . CLICKBANK_POSTBACK_EMAIL_OUTBOX_TABLE . '
                 SET attempt_count = attempt_count + 1,
                     next_attempt_at_utc = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ' . $delay . ' SECOND),
                     locked_until_utc = NULL, last_error_code = :last_error_code
                 WHERE id = :id AND sent_at_utc IS NULL'
            );
            $update->execute([':last_error_code' => $failureCode, ':id' => $id]);
            $failed++;
        }
    }
    return ['selected' => count($ids), 'sent' => $sent, 'failed' => $failed, 'ignored' => $ignored];
}

function clickbank_ins_v8_email_find_private_config(): ?string
{
    $cursor = realpath(__DIR__);
    for ($depth = 0; is_string($cursor) && $depth < 10; $depth++, $cursor = dirname($cursor)) {
        $candidate = realpath($cursor . DIRECTORY_SEPARATOR . 'tracking-config.php');
        if ($candidate === false || !is_file($candidate)) {
            continue;
        }
        $normalized = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, strtolower($candidate));
        if (str_contains($normalized, DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR)) {
            continue;
        }
        return $candidate;
    }
    return null;
}

function gurumedia_sales_email_local_datetime($value): string
{
    if (!is_string($value) || trim($value) === '') {
        return 'não informado';
    }
    try {
        return (new DateTimeImmutable(trim($value), new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('America/Sao_Paulo'))
            ->format('d/m/Y H:i');
    } catch (Throwable $error) {
        return 'não informado';
    }
}

function gurumedia_sales_email_build_message(array $sale): array
{
    $track = clickbank_ins_v8_email_clean_text($sale['product_label'] ?? '', 120);
    if ($track === '') {
        $track = clickbank_ins_v8_email_clean_text($sale['product_key'] ?? '', 120);
    }
    $track = $track !== '' ? $track : 'Track sem nome';
    $offer = clickbank_ins_v8_email_clean_text($sale['offer_name'] ?? '', 180);
    if ($offer === '') {
        $offer = clickbank_ins_v8_email_clean_text($sale['offer_id'] ?? '', 64) ?: 'não informada';
    }
    $currency = clickbank_ins_v8_email_clean_text($sale['currency'] ?? '', 3);
    $payout = clickbank_ins_v8_email_format_money($sale['payout_amount'] ?? null, $currency);
    $body = implode("\n", [
        'VENDA GURUMEDIA RECEBIDA',
        '',
        'Track: ' . $track,
        'Oferta: ' . $offer,
        'Pre-sell: ' . clickbank_ins_v8_email_clean_text($sale['presell_host'] ?? '', 253),
        'Comissão afiliada: ' . ($payout ?? 'não informada'),
        'Recebido em: ' . gurumedia_sales_email_local_datetime($sale['received_at_utc'] ?? null),
        '',
        'Esta notificação registra uma venda associada a uma Track do Hub. Ela não envia conversões ao Google Ads.',
    ]) . "\n";
    return [
        'subject' => clickbank_ins_v8_email_clean_text('Venda GuruMedia recebida - ' . $track, 180),
        'body' => $body,
    ];
}

/** Send queued GuruMedia sales using the shared private SMTP configuration. */
function gurumedia_sales_email_process_batch(PDO $pdo, array $rawConfig, int $limit = 5, ?callable $sender = null): array
{
    $config = clickbank_ins_v8_email_normalize_config($rawConfig);
    $limit = max(1, min(10, $limit));
    $select = $pdo->query(
        'SELECT id FROM gurumedia_sales_email_outbox
         WHERE notification_kind = \'sale\' AND sent_at_utc IS NULL
           AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
           AND (locked_until_utc IS NULL OR locked_until_utc <= UTC_TIMESTAMP(3))
         ORDER BY id ASC LIMIT ' . $limit
    );
    $ids = array_map('intval', $select->fetchAll(PDO::FETCH_COLUMN));
    $sent = 0;
    $failed = 0;
    $send = $sender ?? 'clickbank_ins_v8_email_smtp_send';
    foreach ($ids as $id) {
        $claim = $pdo->prepare(
            'UPDATE gurumedia_sales_email_outbox
             SET locked_until_utc = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 300 SECOND)
             WHERE id = :id AND notification_kind = \'sale\' AND sent_at_utc IS NULL
               AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
               AND (locked_until_utc IS NULL OR locked_until_utc <= UTC_TIMESTAMP(3))'
        );
        $claim->execute([':id' => $id]);
        if ($claim->rowCount() !== 1) {
            continue;
        }
        $read = $pdo->prepare(
            'SELECT o.attempt_count, s.product_label, s.product_key, s.offer_id,
                    s.offer_name, s.payout_amount, s.currency, s.presell_host, s.received_at_utc
             FROM gurumedia_sales_email_outbox AS o
             INNER JOIN gurumedia_sales AS s ON s.id = o.sale_id
             WHERE o.id = :id AND o.notification_kind = \'sale\' LIMIT 1'
        );
        $read->execute([':id' => $id]);
        $sale = $read->fetch(PDO::FETCH_ASSOC);
        $failureStage = 'notification_prepare';
        try {
            if (!is_array($sale)) {
                throw new RuntimeException('notification_reference_invalid');
            }
            $message = gurumedia_sales_email_build_message($sale);
            $failureStage = 'smtp_send';
            $send($config, $message['subject'], $message['body']);
            $failureStage = 'outbox_update';
            $update = $pdo->prepare(
                'UPDATE gurumedia_sales_email_outbox
                 SET attempt_count = attempt_count + 1, sent_at_utc = UTC_TIMESTAMP(3),
                     locked_until_utc = NULL, last_error_code = NULL
                 WHERE id = :id AND sent_at_utc IS NULL'
            );
            $update->execute([':id' => $id]);
            $sent++;
        } catch (Throwable $error) {
            $attemptNumber = is_array($sale) ? (int)$sale['attempt_count'] + 1 : 1;
            $failureCode = clickbank_ins_v8_email_failure_code($error, $failureStage);
            $delay = clickbank_ins_v8_email_retry_delay_seconds($attemptNumber);
            $update = $pdo->prepare(
                'UPDATE gurumedia_sales_email_outbox
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

/** Notify only when a registered GuruMedia offer arrives without a unique outbound-click match. */
function gurumedia_postback_email_build_message(array $attempt): array
{
    $track = clickbank_ins_v8_email_clean_text($attempt['product_label'] ?? '', 120);
    if ($track === '') $track = clickbank_ins_v8_email_clean_text($attempt['product_key'] ?? '', 120);
    $mapping = (string)($attempt['offer_mapping_status'] ?? '');
    if ($track === '') {
        $track = $mapping === 'ambiguous_offer' ? 'ID associado a mais de uma Track' : 'Track não identificada';
    }
    $offer = clickbank_ins_v8_email_clean_text($attempt['offer_name'] ?? '', 180);
    if ($offer === '') $offer = clickbank_ins_v8_email_clean_text($attempt['offer_id'] ?? '', 64) ?: 'não informada';
    $currency = clickbank_ins_v8_email_clean_text($attempt['currency'] ?? '', 3);
    $payout = clickbank_ins_v8_email_format_money($attempt['payout_amount'] ?? null, $currency);
    $reason = ($attempt['result_code'] ?? '') === 'ambiguous_click'
        ? 'Mais de um clique correspondeu ao ID recebido.'
        : 'Não foi encontrado um clique de saída correspondente ao ID recebido.';
    $body = implode("\n", [
        'VENDA GURUMEDIA RECEBIDA SEM ASSOCIAÇÃO A CLIQUE',
        '',
        'Track: ' . $track,
        'Oferta: ' . ($offer !== '' ? $offer : 'não informada'),
        'ID da oferta: ' . clickbank_ins_v8_email_clean_text($attempt['offer_id'] ?? '', 64),
        'Pre-sell: ' . clickbank_ins_v8_email_clean_text($attempt['presell_host'] ?? '', 253),
        'Comissão afiliada: ' . ($payout ?? 'não informada'),
        'Horário do evento: ' . gurumedia_sales_email_local_datetime($attempt['conversion_at_utc'] ?? null),
        'Recebido em: ' . gurumedia_sales_email_local_datetime($attempt['last_received_at_utc'] ?? null),
        'Click ID incluído: ' . ((int)($attempt['has_click_id'] ?? 0) === 1 ? 'sim' : 'não'),
        'Motivo: ' . $reason,
        '',
        'A venda foi guardada para diagnóstico, mas não foi atribuída a uma Track por clique e não entra nos totais de vendas associadas nem é enviada ao Google Ads.',
        'A mensagem não inclui o identificador da transação nem dados do comprador.',
    ]) . "\n";
    return [
        'subject' => clickbank_ins_v8_email_clean_text('Venda GuruMedia sem clique correspondente - ' . $track, 180),
        'body' => $body,
    ];
}

/** Send queued registered-offer diagnostics using the shared private SMTP configuration. */
function gurumedia_postback_email_process_batch(PDO $pdo, array $rawConfig, int $limit = 5, ?callable $sender = null): array
{
    $config = clickbank_ins_v8_email_normalize_config($rawConfig);
    $limit = max(1, min(10, $limit));
    $select = $pdo->query(
        'SELECT id FROM gurumedia_postback_email_outbox
         WHERE notification_kind = \'unmatched_sale\' AND sent_at_utc IS NULL
           AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
           AND (locked_until_utc IS NULL OR locked_until_utc <= UTC_TIMESTAMP(3))
         ORDER BY id ASC LIMIT ' . $limit
    );
    $ids = array_map('intval', $select->fetchAll(PDO::FETCH_COLUMN));
    $sent = 0;
    $failed = 0;
    $send = $sender ?? 'clickbank_ins_v8_email_smtp_send';
    foreach ($ids as $id) {
        $claim = $pdo->prepare(
            'UPDATE gurumedia_postback_email_outbox
             SET locked_until_utc = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 300 SECOND)
             WHERE id = :id AND notification_kind = \'unmatched_sale\' AND sent_at_utc IS NULL
               AND next_attempt_at_utc <= UTC_TIMESTAMP(3)
               AND (locked_until_utc IS NULL OR locked_until_utc <= UTC_TIMESTAMP(3))'
        );
        $claim->execute([':id' => $id]);
        if ($claim->rowCount() !== 1) continue;
        $read = $pdo->prepare(
            'SELECT o.attempt_count, a.result_code, a.has_click_id, a.offer_id, a.offer_name,
                    a.payout_amount, a.currency, a.conversion_at_utc, a.product_key, a.product_label,
                    a.presell_host, a.offer_mapping_status, a.last_received_at_utc
             FROM gurumedia_postback_email_outbox AS o
             INNER JOIN gurumedia_postback_attempts AS a ON a.id = o.postback_attempt_id
             WHERE o.id = :id AND o.notification_kind = \'unmatched_sale\' LIMIT 1'
        );
        $read->execute([':id' => $id]);
        $attempt = $read->fetch(PDO::FETCH_ASSOC);
        $failureStage = 'notification_prepare';
        try {
            if (!is_array($attempt)) throw new RuntimeException('notification_reference_invalid');
            $message = gurumedia_postback_email_build_message($attempt);
            $failureStage = 'smtp_send';
            $send($config, $message['subject'], $message['body']);
            $failureStage = 'outbox_update';
            $update = $pdo->prepare(
                'UPDATE gurumedia_postback_email_outbox
                 SET attempt_count = attempt_count + 1, sent_at_utc = UTC_TIMESTAMP(3),
                     locked_until_utc = NULL, last_error_code = NULL
                 WHERE id = :id AND sent_at_utc IS NULL'
            );
            $update->execute([':id' => $id]);
            $sent++;
        } catch (Throwable $error) {
            $attemptNumber = is_array($attempt) ? (int)$attempt['attempt_count'] + 1 : 1;
            $failureCode = clickbank_ins_v8_email_failure_code($error, $failureStage);
            $delay = clickbank_ins_v8_email_retry_delay_seconds($attemptNumber);
            $update = $pdo->prepare(
                'UPDATE gurumedia_postback_email_outbox
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

