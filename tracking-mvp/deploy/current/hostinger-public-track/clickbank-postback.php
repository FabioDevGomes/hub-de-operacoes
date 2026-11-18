<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function config_error(string $message): void
{
    error_log('Tracking MVP ClickBank postback: ' . $message);
    respond(503, ['ok' => false, 'error' => 'tracking_unavailable']);
}

function optional_text($value, int $maxLength): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_string($value) || strlen($value) > $maxLength || preg_match('/[\x00-\x1F\x7F]/', $value)) {
        return null;
    }
    return $value;
}

function optional_amount($value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_string($value) || !preg_match('/^-?\d{1,12}(?:\.\d{1,2})?$/D', $value)) {
        return null;
    }
    return $value;
}

function is_uuid($value): bool
{
    return is_string($value)
        && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1;
}

function record_postback_attempt(
    PDO $pdo,
    ?string $diagnosticId,
    string $eventId,
    string $eventType,
    string $insertResult,
    int $httpStatus,
    bool $hasExternalClickId,
    ?bool $matchedClick
): void {
    $statement = $pdo->prepare(
        'INSERT INTO clickbank_postback_attempts
        (diagnostic_id, event_id, event_type, insert_result, http_status, has_extclid, matched_click)
        VALUES
        (:diagnostic_id, :event_id, :event_type, :insert_result, :http_status, :has_extclid, :matched_click)'
    );
    $statement->execute([
        ':diagnostic_id' => $diagnosticId,
        ':event_id' => $eventId,
        ':event_type' => $eventType,
        ':insert_result' => $insertResult,
        ':http_status' => $httpStatus,
        ':has_extclid' => $hasExternalClickId ? 1 : 0,
        ':matched_click' => $matchedClick === null ? null : ($matchedClick ? 1 : 0),
    ]);
}

$configPath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'tracking-config.php';
if (!is_file($configPath)) {
    config_error('private configuration file is missing.');
}
$config = require $configPath;
if (!is_array($config)) {
    config_error('private configuration file is invalid.');
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (!in_array($method, ['GET', 'POST'], true)) {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) {
    respond(413, ['ok' => false, 'error' => 'payload_too_large']);
}

// ClickBank macros are normally placed in the query string. Form POST is also
// accepted, without using $_REQUEST (which could include cookies).
$params = $_GET + $_POST;
$expectedToken = $config['clickbank_postback_token'] ?? null;
$receivedToken = $params['token'] ?? null;
if (!is_string($expectedToken) || strlen($expectedToken) < 32) {
    config_error('ClickBank postback token is missing or too short.');
}
if (!is_string($receivedToken) || !hash_equals($expectedToken, $receivedToken)) {
    respond(403, ['ok' => false, 'error' => 'not_authorized']);
}

$eventId = optional_text($params['event_id'] ?? null, 128);
$eventType = optional_text($params['event_type'] ?? null, 64);
$diagnosticId = optional_text($params['diagnostic_id'] ?? null, 80);
if ($eventId === null || $eventType === null) {
    respond(400, ['ok' => false, 'error' => 'invalid_event']);
}
if (($params['diagnostic_id'] ?? null) !== null && ($params['diagnostic_id'] ?? null) !== '' && $diagnosticId === null) {
    respond(400, ['ok' => false, 'error' => 'invalid_diagnostic_id']);
}

$receiptId = optional_text($params['receipt_id'] ?? null, 32);
$orderId = optional_text($params['order_id'] ?? null, 128);
$externalClickId = optional_text($params['extclid'] ?? null, 256);
$affiliateEarnings = optional_amount($params['affiliate_earnings'] ?? null);
$transactionAmount = optional_amount($params['total_transaction_amount'] ?? null);
$orderCurrency = optional_text($params['order_currency'] ?? null, 3);
$eventTime = optional_text($params['event_time'] ?? null, 64);

// Invalid optional fields are rejected rather than silently written as null.
foreach ([
    'receipt_id' => [$params['receipt_id'] ?? null, $receiptId],
    'order_id' => [$params['order_id'] ?? null, $orderId],
    'extclid' => [$params['extclid'] ?? null, $externalClickId],
    'affiliate_earnings' => [$params['affiliate_earnings'] ?? null, $affiliateEarnings],
    'total_transaction_amount' => [$params['total_transaction_amount'] ?? null, $transactionAmount],
    'order_currency' => [$params['order_currency'] ?? null, $orderCurrency],
    'event_time' => [$params['event_time'] ?? null, $eventTime],
    'diagnostic_id' => [$params['diagnostic_id'] ?? null, $diagnosticId],
] as [$rawValue, $cleanValue]) {
    if ($rawValue !== null && $rawValue !== '' && $cleanValue === null) {
        respond(400, ['ok' => false, 'error' => 'invalid_optional_field']);
    }
}
if ($orderCurrency !== null && preg_match('/^[A-Za-z]{3}$/D', $orderCurrency) !== 1) {
    respond(400, ['ok' => false, 'error' => 'invalid_currency']);
}
foreach ([$eventId, $receiptId, $orderId, $externalClickId, $orderCurrency, $eventTime, $diagnosticId] as $identifier) {
    if ($identifier !== null && preg_match('/^[\x20-\x7E]+$/D', $identifier) !== 1) {
        respond(400, ['ok' => false, 'error' => 'invalid_identifier']);
    }
}

foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $requiredKey) {
    if (!isset($config[$requiredKey]) || !is_string($config[$requiredKey]) || $config[$requiredKey] === '') {
        config_error('one or more database settings are missing.');
    }
}

$pdo = null;
$matchedClick = null;
$insertResult = 'db_error';
$httpStatus = 503;
$recorded = false;

try {
    $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");

    $matchedClick = false;
    if (is_uuid($externalClickId)) {
        $match = $pdo->prepare(
            "SELECT 1 FROM tracking_events
             WHERE event_type = 'outbound_click' AND click_id = :click_id
             LIMIT 1"
        );
        $match->execute([':click_id' => $externalClickId]);
        $matchedClick = $match->fetchColumn() !== false;
    }

    $statement = $pdo->prepare(
        'INSERT IGNORE INTO clickbank_postback_events
        (event_id, event_type, receipt_id, order_id, extclid, affiliate_earnings,
         total_transaction_amount, order_currency, event_time, received_at_utc)
        VALUES
        (:event_id, :event_type, :receipt_id, :order_id, :extclid, :affiliate_earnings,
         :total_transaction_amount, :order_currency, :event_time, UTC_TIMESTAMP(3))'
    );
    $statement->execute([
        ':event_id' => $eventId,
        ':event_type' => $eventType,
        ':receipt_id' => $receiptId,
        ':order_id' => $orderId,
        ':extclid' => $externalClickId,
        ':affiliate_earnings' => $affiliateEarnings,
        ':total_transaction_amount' => $transactionAmount,
        ':order_currency' => $orderCurrency !== null ? strtoupper($orderCurrency) : null,
        ':event_time' => $eventTime,
    ]);

    $recorded = $statement->rowCount() === 1;
    if ($recorded) {
        $insertResult = 'inserted';
    } else {
        $existing = $pdo->prepare(
            'SELECT 1 FROM clickbank_postback_events WHERE event_id = :event_id LIMIT 1'
        );
        $existing->execute([':event_id' => $eventId]);
        $insertResult = $existing->fetchColumn() !== false ? 'duplicate' : 'not_inserted';
    }
    $httpStatus = 200;
} catch (Throwable $error) {
    error_log('Tracking MVP ClickBank postback: database operation failed; check the server error log.');
}

$auditLogged = false;
if ($pdo instanceof PDO) {
    try {
        record_postback_attempt(
            $pdo,
            $diagnosticId,
            $eventId,
            $eventType,
            $insertResult,
            $httpStatus,
            $externalClickId !== null,
            $matchedClick
        );
        $auditLogged = true;
    } catch (Throwable $error) {
        // Keep the conversion endpoint response independent from audit-table availability.
        error_log('Tracking MVP ClickBank postback: audit attempt could not be recorded.');
    }
}

if ($httpStatus === 200) {
    respond(200, [
        'ok' => true,
        'recorded' => $recorded,
        'insert_result' => $insertResult,
        'matched_click' => $matchedClick ?? false,
        'audit_logged' => $auditLogged,
    ]);
}

respond(503, [
    'ok' => false,
    'error' => 'tracking_unavailable',
    'insert_result' => 'db_error',
    'audit_logged' => $auditLogged,
]);
