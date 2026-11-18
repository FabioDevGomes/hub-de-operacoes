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
    error_log('Tracking MVP: ' . $message);
    respond(503, ['ok' => false, 'error' => 'tracking_unavailable']);
}

function is_uuid($value): bool
{
    return is_string($value)
        && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1;
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

function normalized_page_url($value): ?string
{
    if (!is_string($value) || strlen($value) > 4096) {
        return null;
    }
    $parts = parse_url($value);
    if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https') {
        return null;
    }
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($host === '' || isset($parts['user']) || isset($parts['pass'])) {
        return null;
    }
    $path = (string)($parts['path'] ?? '/');
    if ($path === '' || $path[0] !== '/') {
        $path = '/';
    }
    return 'https://' . $host . $path;
}

function tracking_database_connection(array $config): PDO
{
    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $requiredKey) {
        if (!isset($config[$requiredKey]) || !is_string($config[$requiredKey]) || $config[$requiredKey] === '') {
            throw new RuntimeException('database_config_invalid');
        }
    }
    $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function tracking_dynamic_domain_allowed(PDO $pdo, string $origin, string $pageHost): bool
{
    $statement = $pdo->prepare(
        'SELECT 1 FROM tracking_allowed_domains WHERE origin = :origin AND page_host = :page_host LIMIT 1'
    );
    $statement->execute([':origin' => $origin, ':page_host' => $pageHost]);
    return $statement->fetchColumn() !== false;
}

function tracking_dynamic_domain_product_key(PDO $pdo, string $origin, string $pageHost): ?string
{
    $statement = $pdo->prepare(
        'SELECT product_key FROM tracking_allowed_domains WHERE origin = :origin AND page_host = :page_host LIMIT 1'
    );
    $statement->execute([':origin' => $origin, ':page_host' => $pageHost]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) {
        return null;
    }
    $productKey = $row['product_key'] ?? null;
    if ($productKey === null || $productKey === '') {
        return $pageHost;
    }
    if (!is_string($productKey)
        || strlen($productKey) > 253
        || preg_match('/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/D', $productKey) !== 1
        || str_contains($productKey, '..')) {
        throw new RuntimeException('registered_product_key_invalid');
    }
    return $productKey;
}

function tracking_dynamic_origin_allowed(PDO $pdo, string $origin): bool
{
    $statement = $pdo->prepare('SELECT 1 FROM tracking_allowed_domains WHERE origin = :origin LIMIT 1');
    $statement->execute([':origin' => $origin]);
    return $statement->fetchColumn() !== false;
}

function tracking_dynamic_origin_hostname(string $origin): ?string
{
    if (strlen($origin) > 261) {
        return null;
    }
    $parts = parse_url($origin);
    if (!is_array($parts)
        || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
        || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])
        || isset($parts['path']) || isset($parts['query']) || isset($parts['fragment'])) {
        return null;
    }
    $host = strtolower((string)($parts['host'] ?? ''));
    if (filter_var($host, FILTER_VALIDATE_IP) !== false
        || preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$/D', $host) !== 1
        || $origin !== 'https://' . $host) {
        return null;
    }
    return $host;
}

function tracking_cors_headers(string $origin): void
{
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 600');
}

function normalized_referrer_origin($value): ?string
{
    if (!is_string($value) || $value === '' || strlen($value) > 2048) {
        return null;
    }
    $parts = parse_url($value);
    if (!is_array($parts)) {
        return null;
    }
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true) || $host === '' || isset($parts['user']) || isset($parts['pass'])) {
        return null;
    }
    return $scheme . '://' . $host;
}

function normalized_destination_url($value): ?string
{
    if (!is_string($value) || $value === '' || strlen($value) > 4096) {
        return null;
    }
    $parts = parse_url($value);
    if (!is_array($parts)) {
        return null;
    }
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true) || $host === '' || isset($parts['user']) || isset($parts['pass'])) {
        return null;
    }
    $port = isset($parts['port']) ? ':' . (int)$parts['port'] : '';
    $path = (string)($parts['path'] ?? '/');
    return $scheme . '://' . $host . $port . ($path !== '' ? $path : '/');
}

$configCandidates = [
    dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'tracking-config.php',
    dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'tracking-config.php',
];
$configPath = null;
foreach ($configCandidates as $candidate) {
    if (is_file($candidate)) {
        $configPath = $candidate;
        break;
    }
}
if ($configPath === null) {
    config_error('private configuration file is missing.');
}
$config = require $configPath;
if (!is_array($config)) {
    config_error('private configuration file is invalid.');
}

$allowedOrigins = $config['allowed_origins'] ?? [];
$allowedPageHosts = array_map('strtolower', $config['allowed_page_hosts'] ?? []);
$origin = rtrim((string)($_SERVER['HTTP_ORIGIN'] ?? ''), '/');
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$legacyOriginAllowed = $origin !== '' && is_array($allowedOrigins) && in_array($origin, $allowedOrigins, true);
$pdo = null;
if ($method === 'OPTIONS') {
    if (!$legacyOriginAllowed && $origin !== '') {
        $dynamicOriginHost = tracking_dynamic_origin_hostname($origin);
        if ($dynamicOriginHost === null) {
            respond(403, ['ok' => false, 'error' => 'origin_not_allowed']);
        }
        try {
            $pdo = tracking_database_connection($config);
            $legacyOriginAllowed = tracking_dynamic_origin_allowed($pdo, $origin);
        } catch (Throwable $error) {
            config_error('dynamic domain registry could not be read.');
        }
    }
    if (!$legacyOriginAllowed) {
        respond(403, ['ok' => false, 'error' => 'origin_not_allowed']);
    }
    tracking_cors_headers($origin);
    http_response_code(204);
    exit;
}
if ($method !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 16384) {
    respond(413, ['ok' => false, 'error' => 'payload_too_large']);
}

$contentType = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
if (!in_array($contentType, ['application/json', 'text/plain'], true)) {
    respond(415, ['ok' => false, 'error' => 'unsupported_content_type']);
}

$rawBody = file_get_contents('php://input');
if (!is_string($rawBody) || $rawBody === '' || strlen($rawBody) > 16384) {
    respond(400, ['ok' => false, 'error' => 'invalid_payload']);
}

try {
    $payload = json_decode($rawBody, true, 16, JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    respond(400, ['ok' => false, 'error' => 'invalid_json']);
}
if (!is_array($payload)) {
    respond(400, ['ok' => false, 'error' => 'invalid_payload']);
}

$eventId = $payload['event_id'] ?? null;
$visitorId = $payload['visitor_id'] ?? null;
$eventType = $payload['event_type'] ?? null;
$clickId = $payload['click_id'] ?? null;
$pageUrl = normalized_page_url($payload['page_url'] ?? null);
$pageHost = $pageUrl === null ? null : strtolower((string)(parse_url($pageUrl, PHP_URL_HOST) ?: ''));
$rawPresellHost = $payload['presell_host'] ?? null;
$providedPresellHost = null;
if ($rawPresellHost !== null && $rawPresellHost !== '') {
    if (!is_string($rawPresellHost)
        || strlen($rawPresellHost) > 253
        || preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/D', strtolower($rawPresellHost)) !== 1) {
        respond(400, ['ok' => false, 'error' => 'invalid_presell_host']);
    }
    $providedPresellHost = strtolower($rawPresellHost);
}
$rawProductKey = $payload['product_key'] ?? null;
$providedProductKey = null;
if ($rawProductKey !== null && $rawProductKey !== '') {
    if (!is_string($rawProductKey)
        || strlen($rawProductKey) > 253
        || preg_match('/^[a-z0-9](?:[a-z0-9._-]{0,251}[a-z0-9])?$/D', $rawProductKey) !== 1
        || str_contains($rawProductKey, '..')) {
        respond(400, ['ok' => false, 'error' => 'invalid_product_key']);
    }
    $providedProductKey = $rawProductKey;
}

if (!is_uuid($eventId) || !is_uuid($visitorId) || !in_array($eventType, ['page_view', 'outbound_click'], true) || $pageUrl === null || $pageHost === '') {
    respond(400, ['ok' => false, 'error' => 'invalid_event']);
}
if ($providedPresellHost !== null && !hash_equals($pageHost, $providedPresellHost)) {
    respond(403, ['ok' => false, 'error' => 'presell_host_mismatch']);
}
if ($eventType === 'outbound_click' && (!is_uuid($clickId) || normalized_destination_url($payload['destination_url'] ?? null) === null)) {
    respond(400, ['ok' => false, 'error' => 'invalid_outbound_click']);
}
if ($eventType === 'page_view') {
    $clickId = null;
}
$clickbankExtclid = null;
if ($eventType === 'outbound_click') {
    $rawClickbankExtclid = $payload['clickbank_extclid'] ?? null;
    if ($rawClickbankExtclid !== null && $rawClickbankExtclid !== '') {
        if (!is_string($rawClickbankExtclid)
            || strlen($rawClickbankExtclid) > 256
            || preg_match('/^[\x21-\x7e]+$/D', $rawClickbankExtclid) !== 1) {
            respond(400, ['ok' => false, 'error' => 'invalid_clickbank_extclid']);
        }
        $clickbankExtclid = $rawClickbankExtclid;
    }
}

$legacyPageHostAllowed = $pageHost !== '' && in_array($pageHost, $allowedPageHosts, true);
$legacyPairAllowed = $legacyOriginAllowed && $legacyPageHostAllowed;
$eventProductKey = null;
$eventPresellHost = $pageHost;
$registeredProductKey = null;
$dynamicOriginHost = $origin !== '' ? tracking_dynamic_origin_hostname($origin) : null;
if ($dynamicOriginHost !== null && $dynamicOriginHost === $pageHost) {
    try {
        $pdo = $pdo ?? tracking_database_connection($config);
        $registeredProductKey = tracking_dynamic_domain_product_key($pdo, $origin, $pageHost);
    } catch (Throwable $error) {
        config_error('dynamic domain registry could not be read.');
    }
}
if ($registeredProductKey === null && !$legacyPairAllowed) {
    respond(403, ['ok' => false, 'error' => 'origin_not_allowed']);
}
tracking_cors_headers($origin);
if ($registeredProductKey !== null) {
    if ($providedProductKey !== null && !hash_equals($registeredProductKey, $providedProductKey)) {
        respond(403, ['ok' => false, 'error' => 'product_key_mismatch']);
    }
    $eventProductKey = $registeredProductKey;
}

$gclid = optional_text($payload['gclid'] ?? null, 2048);
$gbraid = optional_text($payload['gbraid'] ?? null, 2048);
$wbraid = optional_text($payload['wbraid'] ?? null, 2048);
$utmSource = optional_text($payload['utm_source'] ?? null, 255);
$utmMedium = optional_text($payload['utm_medium'] ?? null, 255);
$utmCampaign = optional_text($payload['utm_campaign'] ?? null, 255);
$utmTerm = optional_text($payload['utm_term'] ?? null, 255);
$utmContent = optional_text($payload['utm_content'] ?? null, 255);
$referrerOrigin = normalized_referrer_origin($payload['referrer'] ?? null);
$destinationUrl = $eventType === 'outbound_click'
    ? normalized_destination_url($payload['destination_url'] ?? null)
    : null;

try {
    $pdo = $pdo ?? tracking_database_connection($config);

    $statement = $pdo->prepare(
        'INSERT IGNORE INTO tracking_events
        (event_id, event_type, click_id, clickbank_extclid, product_key, presell_host, visitor_id, gclid, gbraid, wbraid,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         page_url, referrer_origin, destination_url, received_at_utc)
        VALUES
        (:event_id, :event_type, :click_id, :clickbank_extclid, :product_key, :presell_host, :visitor_id, :gclid, :gbraid, :wbraid,
         :utm_source, :utm_medium, :utm_campaign, :utm_term, :utm_content,
         :page_url, :referrer_origin, :destination_url, UTC_TIMESTAMP(3))'
    );
    $statement->execute([
        ':event_id' => $eventId,
        ':event_type' => $eventType,
        ':click_id' => $clickId,
        ':clickbank_extclid' => $clickbankExtclid,
        ':product_key' => $eventProductKey,
        ':presell_host' => $eventPresellHost,
        ':visitor_id' => $visitorId,
        ':gclid' => $gclid,
        ':gbraid' => $gbraid,
        ':wbraid' => $wbraid,
        ':utm_source' => $utmSource,
        ':utm_medium' => $utmMedium,
        ':utm_campaign' => $utmCampaign,
        ':utm_term' => $utmTerm,
        ':utm_content' => $utmContent,
        ':page_url' => $pageUrl,
        ':referrer_origin' => $referrerOrigin,
        ':destination_url' => $destinationUrl,
    ]);
    respond(200, ['ok' => true, 'recorded' => $statement->rowCount() === 1]);
} catch (Throwable $error) {
    error_log('Tracking MVP: database operation failed; check the server error log.');
    respond(503, ['ok' => false, 'error' => 'tracking_unavailable']);
}
