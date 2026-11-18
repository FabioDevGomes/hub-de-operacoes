<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'tracking-domain-allowlist-lib.php';

function tracking_domains_api_load_config(): array
{
    $configCandidates = [
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tracking-config.php',
        dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'tracking-config.php',
        dirname(__DIR__, 5) . DIRECTORY_SEPARATOR . 'tracking-config.php',
    ];
    $configPath = null;
    foreach ($configCandidates as $candidate) {
        if (is_file($candidate)) {
            $configPath = $candidate;
            break;
        }
    }
    if ($configPath === null) {
        throw new RuntimeException('api_not_configured');
    }

    $config = require $configPath;
    if (!is_array($config)) {
        throw new RuntimeException('api_not_configured');
    }
    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key]) || $config[$key] === '') {
            throw new RuntimeException('api_not_configured');
        }
    }
    $adminConfigPath = dirname($configPath) . DIRECTORY_SEPARATOR . 'tracking-domain-admin-config.php';
    if (!is_file($adminConfigPath)) {
        throw new RuntimeException('api_not_configured');
    }
    $adminConfig = require $adminConfigPath;
    if (!is_array($adminConfig)
        || !isset($adminConfig['tracking_domain_admin_token'])
        || !is_string($adminConfig['tracking_domain_admin_token'])
        || preg_match('/^[a-f0-9]{64}$/iD', $adminConfig['tracking_domain_admin_token']) !== 1
        || !is_array($config['tracking_hub_allowed_origins'] ?? null)) {
        throw new RuntimeException('api_not_configured');
    }
    $config['tracking_domain_admin_token'] = $adminConfig['tracking_domain_admin_token'];
    return $config;
}

function tracking_domains_api_authorize(string $method, ?string $origin, ?string $authorization, array $config): array
{
    $allowedOrigins = $config['tracking_hub_allowed_origins'] ?? null;
    if (!is_array($allowedOrigins) || !is_string($origin) || $origin === '' || !in_array($origin, $allowedOrigins, true)) {
        return ['status' => 403, 'error' => 'origin_not_allowed', 'allow_origin' => null];
    }

    $method = strtoupper($method);
    if ($method === 'OPTIONS') {
        return ['status' => 204, 'error' => null, 'allow_origin' => $origin];
    }
    if (!in_array($method, ['GET', 'POST'], true)) {
        return ['status' => 405, 'error' => 'method_not_allowed', 'allow_origin' => $origin];
    }

    $expectedToken = $config['tracking_domain_admin_token'] ?? null;
    if (!is_string($expectedToken) || preg_match('/^[a-f0-9]{64}$/iD', $expectedToken) !== 1) {
        return ['status' => 503, 'error' => 'api_not_configured', 'allow_origin' => $origin];
    }
    if (!is_string($authorization)
        || preg_match('/^Bearer ([a-f0-9]{64})$/iD', $authorization, $matches) !== 1
        || !hash_equals($expectedToken, $matches[1])) {
        return ['status' => 401, 'error' => 'not_authorized', 'allow_origin' => $origin];
    }
    return ['status' => 200, 'error' => null, 'allow_origin' => $origin];
}

function tracking_domains_api_authorization_header(): ?string
{
    $value = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
    if (is_string($value)) {
        return $value;
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $headerValue) {
            if (strcasecmp((string)$name, 'Authorization') === 0 && is_string($headerValue)) {
                return $headerValue;
            }
        }
    }
    return null;
}

function tracking_domains_api_send_json(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function tracking_domains_api_dispatch(): never
{
    header('Cache-Control: no-store, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');

    try {
        $config = tracking_domains_api_load_config();
    } catch (Throwable $error) {
        tracking_domains_api_send_json(503, ['ok' => false, 'error' => 'api_not_configured']);
    }

    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    $decision = tracking_domains_api_authorize(
        (string)($_SERVER['REQUEST_METHOD'] ?? 'GET'),
        is_string($origin) ? $origin : null,
        tracking_domains_api_authorization_header(),
        $config
    );
    if (is_string($decision['allow_origin'])) {
        header('Access-Control-Allow-Origin: ' . $decision['allow_origin']);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Max-Age: 300');
    }
    if ($decision['status'] === 204) {
        http_response_code(204);
        exit;
    }
    if ($decision['status'] !== 200) {
        tracking_domains_api_send_json($decision['status'], ['ok' => false, 'error' => $decision['error']]);
    }
    if (($_SERVER['QUERY_STRING'] ?? '') !== '') {
        tracking_domains_api_send_json(400, ['ok' => false, 'error' => 'query_not_supported']);
    }

    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    try {
        $pdo = tracking_domains_connect_db($config);
        if ($method === 'GET') {
            tracking_domains_api_send_json(200, ['ok' => true, 'domains' => tracking_domains_fetch($pdo)]);
        }

        $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($contentLength > 4096) {
            tracking_domains_api_send_json(413, ['ok' => false, 'error' => 'payload_too_large']);
        }
        $contentType = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
        if ($contentType !== 'application/json') {
            tracking_domains_api_send_json(415, ['ok' => false, 'error' => 'unsupported_content_type']);
        }
        $rawBody = file_get_contents('php://input');
        if (!is_string($rawBody) || $rawBody === '' || strlen($rawBody) > 4096) {
            tracking_domains_api_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
        }
        try {
            $payload = json_decode($rawBody, true, 8, JSON_THROW_ON_ERROR);
        } catch (Throwable $error) {
            tracking_domains_api_send_json(400, ['ok' => false, 'error' => 'invalid_json']);
        }
        if (!is_array($payload)
            || array_diff(array_keys($payload), ['domain', 'include_www', 'product_key', 'product_label', 'platform', 'offer_id']) !== []
            || !array_key_exists('domain', $payload)
            || (array_key_exists('include_www', $payload) && !is_bool($payload['include_www']))
            || (array_key_exists('product_key', $payload) && !is_string($payload['product_key']))
            || (array_key_exists('product_label', $payload) && !is_string($payload['product_label']))
            || (array_key_exists('platform', $payload) && !is_string($payload['platform']))
            || (array_key_exists('offer_id', $payload) && $payload['offer_id'] !== null && !is_string($payload['offer_id']))) {
            tracking_domains_api_send_json(400, ['ok' => false, 'error' => 'invalid_payload']);
        }
        try {
            $entries = tracking_domains_input_entries(
                $payload['domain'],
                $payload['include_www'] ?? false,
                $payload['product_key'] ?? null,
                $payload['product_label'] ?? null,
                $payload['platform'] ?? null,
                $payload['offer_id'] ?? null
            );
        } catch (InvalidArgumentException $error) {
            tracking_domains_api_send_json(400, ['ok' => false, 'error' => $error->getMessage()]);
        }
        $result = tracking_domains_add($pdo, $entries);
        tracking_domains_api_send_json(200, [
            'ok' => true,
            'product_key' => $entries[0]['product_key'] ?? tracking_domains_default_product_key($entries[0]['page_host']),
            'product_label' => $entries[0]['product_label'] ?? null,
            'platform' => $entries[0]['platform'] ?? 'clickbank',
            'offer_id' => $entries[0]['offer_id'] ?? null,
            'added' => $result['added'],
            'updated' => $result['updated'],
            'already_allowed' => $result['already_allowed'],
        ]);
    } catch (Throwable $error) {
        error_log('Tracking domains API request failed.');
        tracking_domains_api_send_json(503, ['ok' => false, 'error' => 'domain_registry_unavailable']);
    }
}
