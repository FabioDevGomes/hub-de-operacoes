<?php
declare(strict_types=1);

const HUB_GOOGLE_ADS_API_VERSION = 'v26';
const HUB_GOOGLE_ADS_MAX_CAMPAIGN_ROWS = 1000;
const HUB_GOOGLE_ADS_MAX_CONVERSION_ACTION_ROWS = 500;
const HUB_GOOGLE_ADS_DAILY_MAX_DAYS = 14;
const HUB_GOOGLE_ADS_GEOGRAPHIC_MAX_DAYS = 14;
const HUB_GOOGLE_ADS_GEOGRAPHIC_MAX_ROWS = 10000;
const HUB_GOOGLE_ADS_SAO_PAULO_DAY_MAX_DAYS = 13;
const HUB_GOOGLE_ADS_MAX_DAILY_ROWS = 10000;
const HUB_GOOGLE_ADS_SEARCH_TERMS_MAX_DAYS = 31;
const HUB_GOOGLE_ADS_SEARCH_TERMS_MAX_ROWS = 1000;
const HUB_GOOGLE_ADS_SEARCH_TERM_CAMPAIGNS_MAX_ROWS = 1000;
const HUB_GOOGLE_ADS_TRACKING_AUDIT_MAX_ROWS = 10000;
const HUB_GOOGLE_ADS_MAX_ACCOUNTS = 1000;
const HUB_GOOGLE_ADS_MAX_BODY_BYTES = 8192;
const HUB_GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const HUB_GOOGLE_ADS_TOKEN_URL = 'https://oauth2.googleapis.com/token';

$GLOBALS['hub_google_ads_quota_operations'] = [
    'requests_attempted' => 0,
    'requests_responded' => 0,
    'operations_attempted' => 0,
    'operations_responded' => 0,
];

final class HubGoogleAdsApiException extends RuntimeException
{
    public function __construct(public readonly string $apiCode, public readonly int $httpStatus = 502)
    {
        parent::__construct($apiCode);
    }
}

function hub_google_ads_expose_response_headers(): void
{
    header('Access-Control-Expose-Headers: X-Google-Ads-Diagnostic-ID, X-Google-Ads-Diagnostic-Stage, X-Google-Ads-Upstream-HTTP, X-Google-Ads-Status, X-Google-Ads-Request-ID, X-Google-Ads-Error-Codes, X-Google-Ads-Field-Paths, X-Google-Ads-Retryable, X-Google-Ads-Curl-Errno, X-Google-Ads-Response-Format, X-Hub-Google-Ads-Quota-Version, X-Hub-Google-Ads-Requests-Responded, X-Hub-Google-Ads-Requests-Unknown, X-Hub-Google-Ads-Quota-Operations-Estimated, X-Hub-Google-Ads-Quota-Operations-Unknown');
}

function hub_google_ads_quota_operation_units(string $method, string $path, ?string $body): int
{
    if (!str_ends_with($path, ':mutate')) return 1;
    $payload = is_string($body) ? json_decode($body, true) : null;
    if (!is_array($payload)) return 1;
    $operations = $payload['mutateOperations'] ?? $payload['operations'] ?? null;
    if (!is_array($operations) || !array_is_list($operations)) return 1;
    return count($operations);
}

function hub_google_ads_quota_operation_attempted(int $operationUnits = 1): void
{
    $counts = $GLOBALS['hub_google_ads_quota_operations'] ?? [
        'requests_attempted' => 0, 'requests_responded' => 0,
        'operations_attempted' => 0, 'operations_responded' => 0,
    ];
    $operationUnits = max(0, min(10000, $operationUnits));
    $counts['requests_attempted'] = max(0, (int)($counts['requests_attempted'] ?? 0)) + 1;
    $counts['requests_responded'] = max(0, (int)($counts['requests_responded'] ?? 0));
    $counts['operations_attempted'] = max(0, (int)($counts['operations_attempted'] ?? 0)) + $operationUnits;
    $counts['operations_responded'] = max(0, (int)($counts['operations_responded'] ?? 0));
    $GLOBALS['hub_google_ads_quota_operations'] = $counts;
}

function hub_google_ads_quota_operation_confirmed(int $operationUnits = 1): void
{
    $counts = $GLOBALS['hub_google_ads_quota_operations'] ?? [
        'requests_attempted' => 0, 'requests_responded' => 0,
        'operations_attempted' => 0, 'operations_responded' => 0,
    ];
    $operationUnits = max(0, min(10000, $operationUnits));
    $counts['requests_attempted'] = max(0, (int)($counts['requests_attempted'] ?? 0));
    $counts['requests_responded'] = min($counts['requests_attempted'], max(0, (int)($counts['requests_responded'] ?? 0)) + 1);
    $counts['operations_attempted'] = max(0, (int)($counts['operations_attempted'] ?? 0));
    $counts['operations_responded'] = min($counts['operations_attempted'], max(0, (int)($counts['operations_responded'] ?? 0)) + $operationUnits);
    $GLOBALS['hub_google_ads_quota_operations'] = $counts;
}

function hub_google_ads_publish_quota_headers(): void
{
    $counts = $GLOBALS['hub_google_ads_quota_operations'] ?? [];
    $requestsAttempted = max(0, (int)($counts['requests_attempted'] ?? 0));
    $requestsResponded = min($requestsAttempted, max(0, (int)($counts['requests_responded'] ?? 0)));
    $operationsAttempted = max(0, (int)($counts['operations_attempted'] ?? 0));
    $operationsResponded = min($operationsAttempted, max(0, (int)($counts['operations_responded'] ?? 0)));
    header('X-Hub-Google-Ads-Quota-Version: 2');
    header('X-Hub-Google-Ads-Requests-Responded: ' . $requestsResponded);
    header('X-Hub-Google-Ads-Requests-Unknown: ' . max(0, $requestsAttempted - $requestsResponded));
    header('X-Hub-Google-Ads-Quota-Operations-Estimated: ' . $operationsResponded);
    header('X-Hub-Google-Ads-Quota-Operations-Unknown: ' . max(0, $operationsAttempted - $operationsResponded));
}

/** Publish and log a compact diagnostic without recording campaign data or credentials. */
function hub_google_ads_publish_diagnostic(array $context): array
{
    try {
        $diagnosticId = 'gads-' . gmdate('YmdHis') . '-' . bin2hex(random_bytes(5));
    } catch (Throwable $error) {
        $diagnosticId = 'gads-' . gmdate('YmdHis') . '-' . substr(hash('sha256', uniqid('', true)), 0, 10);
    }

    $allowedStages = ['google_ads_transport', 'oauth_transport', 'google_ads_api', 'oauth_token'];
    $stage = in_array($context['stage'] ?? null, $allowedStages, true) ? $context['stage'] : 'google_ads_api';
    $httpStatus = filter_var($context['upstream_http_status'] ?? null, FILTER_VALIDATE_INT);
    $googleStatus = $context['google_status'] ?? null;
    if (!is_string($googleStatus) || preg_match('/^[A-Z][A-Z0-9_]{0,79}$/D', $googleStatus) !== 1) $googleStatus = null;
    $googleRequestId = $context['google_request_id'] ?? null;
    if (!is_string($googleRequestId) || preg_match('/^[A-Za-z0-9._:-]{8,120}$/D', $googleRequestId) !== 1) $googleRequestId = null;
    $apiOperation = $context['api_operation'] ?? null;
    if (!is_string($apiOperation) || preg_match('/^[A-Za-z][A-Za-z0-9:]{0,60}$/D', $apiOperation) !== 1) $apiOperation = null;
    $gaqlResource = $context['gaql_resource'] ?? null;
    if (!is_string($gaqlResource) || preg_match('/^[a-z][a-z0-9_]{0,59}$/D', $gaqlResource) !== 1) $gaqlResource = null;
    $errorCodes = array_values(array_unique(array_filter(
        is_array($context['google_error_codes'] ?? null) ? $context['google_error_codes'] : [],
        static fn(mixed $code): bool => is_string($code) && preg_match('/^(?:[A-Z][A-Z0-9_]{0,79}|[A-Za-z][A-Za-z0-9_]{0,59}\.[A-Z][A-Z0-9_]{0,79})$/D', $code) === 1
    )));
    $fieldPaths = array_values(array_unique(array_filter(
        is_array($context['field_paths'] ?? null) ? $context['field_paths'] : [],
        static fn(mixed $path): bool => is_string($path) && preg_match('/^[A-Za-z][A-Za-z0-9_]*(?:\[[0-9]{1,4}\])?(?:\.[A-Za-z][A-Za-z0-9_]*(?:\[[0-9]{1,4}\])?){0,12}$/D', $path) === 1
    )));
    $curlErrno = filter_var($context['curl_errno'] ?? null, FILTER_VALIDATE_INT);
    $retryable = ($context['retryable'] ?? false) === true;
    $errorSummary = hub_google_ads_sanitize_diagnostic_message($context['google_error_summary'] ?? null);
    $errorShape = in_array($context['google_error_shape'] ?? null, ['object', 'array_wrapper', 'string', 'missing', 'other'], true)
        ? $context['google_error_shape'] : null;
    $apiCode = filter_var($context['google_api_code'] ?? null, FILTER_VALIDATE_INT);
    $topLevelKeys = hub_google_ads_diagnostic_keys($context['google_top_level_keys'] ?? []);
    $errorKeys = hub_google_ads_diagnostic_keys($context['google_error_keys'] ?? []);
    $responseShape = in_array($context['google_response_shape'] ?? null, ['object', 'list', 'empty_list', 'scalar'], true)
        ? $context['google_response_shape'] : null;
    $chunkKeys = hub_google_ads_diagnostic_keys($context['google_stream_chunk_keys'] ?? []);
    $chunkCount = filter_var($context['google_stream_chunk_count'] ?? null, FILTER_VALIDATE_INT);
    $responseFormat = in_array($context['response_format'] ?? null, ['invalid_json', 'invalid_shape', 'missing_google_error'], true)
        ? $context['response_format']
        : null;

    $diagnostic = ['id' => $diagnosticId, 'stage' => $stage, 'retryable' => $retryable];
    if ($httpStatus !== false && $httpStatus > 0) $diagnostic['upstream_http_status'] = $httpStatus;
    if ($googleStatus !== null) $diagnostic['google_status'] = $googleStatus;
    if ($googleRequestId !== null) $diagnostic['google_request_id'] = $googleRequestId;
    if ($apiOperation !== null) $diagnostic['api_operation'] = $apiOperation;
    if ($gaqlResource !== null) $diagnostic['gaql_resource'] = $gaqlResource;
    if ($errorCodes) $diagnostic['google_error_codes'] = array_slice($errorCodes, 0, 3);
    if ($fieldPaths) $diagnostic['field_paths'] = array_slice($fieldPaths, 0, 3);
    if ($curlErrno !== false && $curlErrno > 0) $diagnostic['curl_errno'] = $curlErrno;
    if ($errorSummary !== null) $diagnostic['google_error_summary'] = $errorSummary;
    if ($errorShape !== null) $diagnostic['google_error_shape'] = $errorShape;
    if ($apiCode !== false && $apiCode >= 0) $diagnostic['google_api_code'] = $apiCode;
    if ($topLevelKeys) $diagnostic['google_top_level_keys'] = array_slice($topLevelKeys, 0, 12);
    if ($errorKeys) $diagnostic['google_error_keys'] = array_slice($errorKeys, 0, 12);
    if ($responseShape !== null) $diagnostic['google_response_shape'] = $responseShape;
    if ($chunkCount !== false && $chunkCount >= 0) $diagnostic['google_stream_chunk_count'] = min($chunkCount, 1000);
    if ($chunkKeys) $diagnostic['google_stream_chunk_keys'] = array_slice($chunkKeys, 0, 12);
    if ($responseFormat !== null) $diagnostic['response_format'] = $responseFormat;

    hub_google_ads_expose_response_headers();
    header('X-Google-Ads-Diagnostic-ID: ' . $diagnosticId);
    header('X-Google-Ads-Diagnostic-Stage: ' . $stage);
    header('X-Google-Ads-Retryable: ' . ($retryable ? 'true' : 'false'));
    if ($httpStatus !== false && $httpStatus > 0) header('X-Google-Ads-Upstream-HTTP: ' . $httpStatus);
    if ($googleStatus !== null) header('X-Google-Ads-Status: ' . $googleStatus);
    if ($googleRequestId !== null) header('X-Google-Ads-Request-ID: ' . $googleRequestId);
    if ($errorCodes) header('X-Google-Ads-Error-Codes: ' . implode(',', array_slice($errorCodes, 0, 3)));
    if ($fieldPaths) header('X-Google-Ads-Field-Paths: ' . implode(',', array_slice($fieldPaths, 0, 3)));
    if ($curlErrno !== false && $curlErrno > 0) header('X-Google-Ads-Curl-Errno: ' . $curlErrno);
    if ($responseFormat !== null) header('X-Google-Ads-Response-Format: ' . $responseFormat);

    error_log('Google Ads API diagnostic ' . json_encode($diagnostic, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    return $diagnostic;
}

/** Redact potentially sensitive values from Google error text before saving it. */
function hub_google_ads_sanitize_diagnostic_message(mixed $message): ?string
{
    if (!is_string($message)) return null;
    $text = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $message) ?? '');
    if ($text === '') return null;
    $text = preg_replace('~https?://[^\s<>"\']+~iu', '[url]', $text) ?? $text;
    $text = preg_replace('/\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/iu', '[email]', $text) ?? $text;
    $text = preg_replace('#\b(?:customers|campaigns|adGroups|assets)/[0-9]{5,}(?:/[A-Za-z]+)?\b#', 'resource/[id]', $text) ?? $text;
    $text = preg_replace('/\b[0-9]{9,}\b/', '[id]', $text) ?? $text;
    $text = preg_replace_callback('/(["\'])(.*?)\1/u', static function (array $match): string {
        $safeIdentifier = preg_match('/^(?:[A-Z][A-Z0-9_]{1,79}|[a-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){1,12})$/D', $match[2]) === 1;
        return $safeIdentifier ? $match[0] : '[valor]';
    }, $text) ?? $text;
    $text = trim(preg_replace('/\s{2,}/u', ' ', $text) ?? $text);
    if ($text === '') return null;
    return function_exists('mb_substr') ? mb_substr($text, 0, 420, 'UTF-8') : substr($text, 0, 420);
}

function hub_google_ads_diagnostic_keys(mixed $keys): array
{
    if (!is_array($keys)) return [];
    $safe = [];
    foreach ($keys as $key) {
        if (is_string($key) && preg_match('/^[A-Za-z@][A-Za-z0-9@_.-]{0,79}$/D', $key) === 1) $safe[] = $key;
    }
    return array_values(array_unique($safe));
}

/** Extract structured errors and a redacted summary without recording request payloads. */
function hub_google_ads_error_diagnostic_details(mixed $payload): array
{
    $topLevelKeys = is_array($payload) ? array_keys($payload) : [];
    $rawError = is_array($payload) ? ($payload['error'] ?? null) : null;
    $error = is_array($rawError) ? $rawError : null;
    $isStreamList = is_array($payload) && array_is_list($payload);
    $streamChunkCount = $isStreamList ? count($payload) : 0;
    $streamChunkKeys = [];
    $nestedRequestId = null;
    if ($isStreamList) {
        foreach (array_slice($payload, 0, 3) as $chunk) {
            if (!is_array($chunk)) continue;
            $streamChunkKeys = array_merge($streamChunkKeys, array_keys($chunk));
            if ($nestedRequestId === null && is_string($chunk['requestId'] ?? null)) $nestedRequestId = $chunk['requestId'];
            if (!array_key_exists('error', $chunk)) continue;
            $rawError = $chunk['error'];
            if (is_array($rawError)) {
                $error = $rawError;
                break;
            }
            if (is_string($rawError)) break;
            if (isset($chunk['message']) || isset($chunk['status']) || isset($chunk['details'])) {
                $rawError = $chunk;
                $error = $chunk;
                break;
            }
        }
    }
    if (!is_array($error) && is_array($rawError)) $error = $rawError;
    if (!is_array($error)) $error = [];
    $googleStatus = $error['status'] ?? null;
    if (!is_string($googleStatus) || preg_match('/^[A-Z][A-Z0-9_]{0,79}$/D', $googleStatus) !== 1) $googleStatus = null;
    $apiCode = filter_var($error['code'] ?? null, FILTER_VALIDATE_INT);
    $requestId = $nestedRequestId;
    $codes = [];
    $paths = [];
    $messages = [];
    $rootMessage = hub_google_ads_sanitize_diagnostic_message($error['message'] ?? (is_string($rawError) ? $rawError : null));
    if ($rootMessage !== null) $messages[] = $rootMessage;
    foreach (is_array($error['errors'] ?? null) ? $error['errors'] : [] as $item) {
        if (!is_array($item)) continue;
        $safeMessage = hub_google_ads_sanitize_diagnostic_message($item['message'] ?? null);
        if ($safeMessage !== null) $messages[] = $safeMessage;
        $reason = $item['reason'] ?? null;
        if (is_string($reason) && preg_match('/^[A-Z][A-Z0-9_]{0,79}$/D', $reason) === 1) $codes[] = $reason;
    }
    foreach (is_array($error['details'] ?? null) ? $error['details'] : [] as $detail) {
        if (!is_array($detail)) continue;
        if ($requestId === null && is_string($detail['requestId'] ?? null)) $requestId = $detail['requestId'];
        foreach (is_array($detail['errors'] ?? null) ? $detail['errors'] : [] as $item) {
            if (!is_array($item)) continue;
            $errorCode = $item['errorCode'] ?? null;
            if (is_array($errorCode)) {
                foreach ($errorCode as $category => $value) {
                    if (is_string($value) && preg_match('/^[A-Z][A-Z0-9_]{0,79}$/D', $value) === 1) {
                        $prefix = is_string($category) && preg_match('/^[A-Za-z][A-Za-z0-9_]{0,59}$/D', $category) === 1 ? $category . '.' : '';
                        $codes[] = $prefix . $value;
                    } elseif (is_array($value)) {
                        foreach ($value as $nestedValue) {
                            if (is_string($nestedValue) && preg_match('/^[A-Z][A-Z0-9_]{0,79}$/D', $nestedValue) === 1) $codes[] = $nestedValue;
                        }
                    }
                }
            }
            $elements = $item['location']['fieldPathElements'] ?? null;
            if (is_array($elements)) {
                $parts = [];
                foreach ($elements as $element) {
                    if (!is_array($element) || !is_string($element['fieldName'] ?? null)
                        || preg_match('/^[A-Za-z][A-Za-z0-9_]{0,60}$/D', $element['fieldName']) !== 1) continue;
                    $part = $element['fieldName'];
                    if (isset($element['index']) && filter_var($element['index'], FILTER_VALIDATE_INT) !== false) {
                        $index = (int)$element['index'];
                        if ($index >= 0 && $index <= 9999) $part .= '[' . $index . ']';
                    }
                    $parts[] = $part;
                }
                if ($parts) $paths[] = implode('.', array_slice($parts, 0, 13));
            }
            $safeMessage = hub_google_ads_sanitize_diagnostic_message($item['message'] ?? null);
            if ($safeMessage !== null) $messages[] = $safeMessage;
        }
    }
    $errorShape = is_array($rawError)
        ? ($isStreamList ? 'array_wrapper' : 'object')
        : (is_string($rawError) ? ($isStreamList ? 'array_wrapper' : 'string') : ($rawError === null ? 'missing' : 'other'));
    $responseShape = !is_array($payload)
        ? 'scalar'
        : ($isStreamList ? ($payload === [] ? 'empty_list' : 'list') : 'object');
    return [
        'google_status' => $googleStatus,
        'google_api_code' => $apiCode === false ? null : $apiCode,
        'google_request_id' => $requestId,
        'google_error_codes' => array_values(array_unique($codes)),
        'field_paths' => array_values(array_unique($paths)),
        'google_error_summary' => implode(' | ', array_slice(array_values(array_unique($messages)), 0, 3)),
        'google_error_shape' => $errorShape,
        'google_top_level_keys' => hub_google_ads_diagnostic_keys($topLevelKeys),
        'google_error_keys' => hub_google_ads_diagnostic_keys(is_array($rawError) ? array_keys($rawError) : []),
        'google_response_shape' => $responseShape,
        'google_stream_chunk_count' => $streamChunkCount,
        'google_stream_chunk_keys' => hub_google_ads_diagnostic_keys($streamChunkKeys),
    ];
}

function hub_google_ads_json(int $status, array $body): never
{
    hub_google_ads_expose_response_headers();
    hub_google_ads_publish_quota_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function hub_google_ads_authorization_header(): ?string
{
    $value = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
    if (is_string($value)) return $value;
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $headerValue) {
            if (strcasecmp((string)$name, 'Authorization') === 0 && is_string($headerValue)) return $headerValue;
        }
    }
    return null;
}

function hub_google_ads_load_tracking_config(): array
{
    $candidates = [
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tracking-config.php',
        dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'tracking-config.php',
    ];
    foreach ($candidates as $candidate) {
        if (!is_file($candidate)) continue;
        try { $config = require $candidate; } catch (Throwable $error) { continue; }
        if (is_array($config)) return $config;
    }
    throw new HubGoogleAdsApiException('api_not_configured', 503);
}

function hub_google_ads_authorize(array $config): array
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    $allowedOrigins = $config['tracking_hub_allowed_origins'] ?? null;
    if (!is_array($allowedOrigins) || !is_string($origin) || !in_array($origin, $allowedOrigins, true)) {
        return ['status' => 403, 'error' => 'origin_not_allowed', 'origin' => null];
    }
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'OPTIONS') return ['status' => 204, 'error' => null, 'origin' => $origin];
    if ($method !== 'POST') return ['status' => 405, 'error' => 'method_not_allowed', 'origin' => $origin];

    $expectedToken = $config['tracking_hub_api_token'] ?? null;
    $authorization = hub_google_ads_authorization_header();
    if (!is_string($expectedToken) || preg_match('/^[a-f0-9]{64}$/iD', $expectedToken) !== 1) {
        return ['status' => 503, 'error' => 'api_not_configured', 'origin' => $origin];
    }
    if (!is_string($authorization) || preg_match('/^Bearer ([a-f0-9]{64})$/iD', $authorization, $matches) !== 1
        || !hash_equals($expectedToken, $matches[1])) {
        return ['status' => 401, 'error' => 'not_authorized', 'origin' => $origin];
    }
    return ['status' => 200, 'error' => null, 'origin' => $origin];
}

function hub_google_ads_base64url(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function hub_google_ads_account_metadata_context_sign(?string $managerId, string $customerId, string $currencyCode, string $timeZone, string $privateKey): string
{
    if ($privateKey === '') throw new HubGoogleAdsApiException('credentials_missing', 503);
    $issuedAt = time();
    $context = [
        'version' => 1,
        'manager_customer_id' => $managerId,
        'customer_id' => $customerId,
        'currency_code' => $currencyCode,
        'time_zone' => $timeZone,
        'issued_at' => $issuedAt,
        'expires_at' => $issuedAt + 86400,
    ];
    $encodedPayload = json_encode($context, JSON_UNESCAPED_SLASHES);
    if (!is_string($encodedPayload)) throw new RuntimeException('Could not encode Google Ads account metadata context.');
    $body = hub_google_ads_base64url($encodedPayload);
    $signingKey = hash('sha256', "hub-google-ads-account-metadata-context:v1\0" . $privateKey, true);
    return $body . '.' . hub_google_ads_base64url(hash_hmac('sha256', $body, $signingKey, true));
}

function hub_google_ads_account_metadata_context_decode(mixed $token, ?string $managerId, string $customerId, string $privateKey): ?array
{
    if (!is_string($token) || strlen($token) > 2048 || $privateKey === ''
        || preg_match('/^([A-Za-z0-9_-]{1,1800})\.([A-Za-z0-9_-]{43})$/D', $token, $matches) !== 1) return null;
    $body = $matches[1];
    $signingKey = hash('sha256', "hub-google-ads-account-metadata-context:v1\0" . $privateKey, true);
    $expectedSignature = hub_google_ads_base64url(hash_hmac('sha256', $body, $signingKey, true));
    if (!hash_equals($expectedSignature, $matches[2])) return null;
    $encodedPayload = strtr($body, '-_', '+/');
    $encodedPayload .= str_repeat('=', (4 - strlen($encodedPayload) % 4) % 4);
    $json = base64_decode($encodedPayload, true);
    $context = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($context)) return null;
    $keys = array_keys($context);
    sort($keys, SORT_STRING);
    $expectedKeys = ['currency_code', 'customer_id', 'expires_at', 'issued_at', 'manager_customer_id', 'time_zone', 'version'];
    sort($expectedKeys, SORT_STRING);
    if ($keys !== $expectedKeys || ($context['version'] ?? null) !== 1
        || ($context['manager_customer_id'] ?? null) !== $managerId
        || ($context['customer_id'] ?? null) !== $customerId
        || !is_string($context['currency_code'] ?? null)
        || preg_match('/^[A-Z]{3}$/D', $context['currency_code']) !== 1
        || !is_string($context['time_zone'] ?? null)
        || !is_int($context['issued_at'] ?? null)
        || !is_int($context['expires_at'] ?? null)
        || $context['expires_at'] !== $context['issued_at'] + 86400
        || $context['issued_at'] > time() + 60
        || $context['expires_at'] <= time()) return null;
    try { new DateTimeZone($context['time_zone']); }
    catch (Throwable $error) { return null; }
    return $context;
}

function hub_google_ads_account_metadata_context_date_is_current(?string $date, string $timeZone): bool
{
    if (!is_string($date) || hub_google_ads_parse_date($date) === null) return false;
    try { return (new DateTimeImmutable('now', new DateTimeZone($timeZone)))->format('Y-m-d') === $date; }
    catch (Throwable $error) { return false; }
}

/** Returns live account metadata unless a valid, current-day, server-signed context is supplied. */
function hub_google_ads_account_metadata(?string $managerId, string $customerId, callable $search, ?string $contextDate, mixed $contextToken, string $privateKey): array
{
    if ($contextDate !== null) {
        $context = hub_google_ads_account_metadata_context_decode($contextToken, $managerId, $customerId, $privateKey);
        if (is_array($context) && hub_google_ads_account_metadata_context_date_is_current($contextDate, $context['time_zone'])) {
            return [
                'currency_code' => $context['currency_code'],
                'time_zone' => $context['time_zone'],
                'account_metadata_context_token' => (string)$contextToken,
                'account_metadata_context_reused' => true,
            ];
        }
    }

    $accountRows = $search('SELECT customer.currency_code, customer.time_zone FROM customer LIMIT 1');
    $customer = $accountRows[0]['customer'] ?? [];
    $currencyCode = is_array($customer) ? (string)($customer['currencyCode'] ?? '') : '';
    $timeZone = is_array($customer) ? (string)($customer['timeZone'] ?? '') : '';
    if (preg_match('/^[A-Z]{3}$/D', $currencyCode) !== 1 || $timeZone === '') {
        throw new HubGoogleAdsApiException('google_ads_request_rejected');
    }
    try { new DateTimeZone($timeZone); }
    catch (Throwable $error) { throw new HubGoogleAdsApiException('google_ads_request_rejected'); }
    $token = $contextDate !== null && hub_google_ads_account_metadata_context_date_is_current($contextDate, $timeZone)
        ? hub_google_ads_account_metadata_context_sign($managerId, $customerId, $currencyCode, $timeZone, $privateKey)
        : null;
    return [
        'currency_code' => $currencyCode,
        'time_zone' => $timeZone,
        'account_metadata_context_token' => $token,
        'account_metadata_context_reused' => false,
    ];
}

function hub_google_ads_credentials(): array
{
    $directory = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'google-ads-credentials');
    $path = realpath(__DIR__ . DIRECTORY_SEPARATOR . 'google-ads-credentials' . DIRECTORY_SEPARATOR . 'service-account.json');
    $privatePrefix = realpath(__DIR__);
    if ($directory === false || $path === false || $privatePrefix === false
        || !str_starts_with($path, $directory . DIRECTORY_SEPARATOR)
        || !str_starts_with($directory . DIRECTORY_SEPARATOR, $privatePrefix . DIRECTORY_SEPARATOR)) {
        throw new HubGoogleAdsApiException('credentials_missing', 503);
    }
    $json = file_get_contents($path);
    $credentials = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($credentials) || !is_string($credentials['client_email'] ?? null)
        || !is_string($credentials['private_key'] ?? null) || !str_contains($credentials['private_key'], 'PRIVATE KEY')) {
        throw new HubGoogleAdsApiException('credentials_missing', 503);
    }
    return $credentials;
}

function hub_google_ads_http(string $url, string $method, array $headers, ?string $body = null): array
{
    $host = (string)(parse_url($url, PHP_URL_HOST) ?: '');
    $stage = $host === 'oauth2.googleapis.com' ? 'oauth_transport' : 'google_ads_transport';
    if (!function_exists('curl_init')) {
        hub_google_ads_publish_diagnostic(['stage' => $stage, 'retryable' => true]);
        throw new HubGoogleAdsApiException('google_ads_unavailable', 502);
    }
    $handle = curl_init($url);
    if ($handle === false) {
        hub_google_ads_publish_diagnostic(['stage' => $stage, 'retryable' => true]);
        throw new HubGoogleAdsApiException('google_ads_unavailable', 502);
    }
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CUSTOMREQUEST => $method,
    ];
    if ($body !== null) $options[CURLOPT_POSTFIELDS] = $body;
    curl_setopt_array($handle, $options);
    $response = curl_exec($handle);
    $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $headerSize = (int)curl_getinfo($handle, CURLINFO_HEADER_SIZE);
    $curlError = curl_errno($handle);
    curl_close($handle);
    if (!is_string($response) || $curlError !== 0) {
        hub_google_ads_publish_diagnostic(['stage' => $stage, 'curl_errno' => $curlError, 'retryable' => true]);
        throw new HubGoogleAdsApiException('google_ads_unavailable', 502);
    }
    return ['status' => $status, 'body' => substr($response, $headerSize)];
}

function hub_google_ads_access_token(array $credentials): string
{
    if (!function_exists('openssl_sign')) throw new HubGoogleAdsApiException('google_ads_auth_failed', 502);
    $issuedAt = time();
    $header = hub_google_ads_base64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_UNESCAPED_SLASHES));
    $claims = hub_google_ads_base64url(json_encode([
        'iss' => $credentials['client_email'],
        'scope' => HUB_GOOGLE_ADS_SCOPE,
        'aud' => HUB_GOOGLE_ADS_TOKEN_URL,
        'iat' => $issuedAt,
        'exp' => $issuedAt + 3600,
    ], JSON_UNESCAPED_SLASHES));
    $unsigned = $header . '.' . $claims;
    $privateKey = openssl_pkey_get_private($credentials['private_key']);
    if ($privateKey === false || !openssl_sign($unsigned, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
        throw new HubGoogleAdsApiException('google_ads_auth_failed', 502);
    }
    $assertion = $unsigned . '.' . hub_google_ads_base64url($signature);
    $tokenResponse = hub_google_ads_http(HUB_GOOGLE_ADS_TOKEN_URL, 'POST', [
        'Content-Type: application/x-www-form-urlencoded',
        'Accept: application/json',
    ], http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $assertion,
    ]));
    $payload = json_decode($tokenResponse['body'], true);
    if ($tokenResponse['status'] < 200 || $tokenResponse['status'] >= 300
        || !is_array($payload) || !is_string($payload['access_token'] ?? null) || $payload['access_token'] === '') {
        hub_google_ads_publish_diagnostic([
            'stage' => 'oauth_token',
            'upstream_http_status' => $tokenResponse['status'],
            'retryable' => $tokenResponse['status'] === 429 || $tokenResponse['status'] >= 500,
        'response_format' => is_array($payload) ? null : (json_last_error() === JSON_ERROR_NONE ? 'invalid_shape' : 'invalid_json'),
        ]);
        throw new HubGoogleAdsApiException('google_ads_auth_failed', 502);
    }
    return $payload['access_token'];
}

function hub_google_ads_api_request(string $method, string $path, string $accessToken, ?string $body = null, ?string $loginCustomerId = null): array
{
    $headers = [
        'Authorization: Bearer ' . $accessToken,
        'Accept: application/json',
    ];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    if (is_string($loginCustomerId) && $loginCustomerId !== '') $headers[] = 'login-customer-id: ' . $loginCustomerId;
    $operationUnits = hub_google_ads_quota_operation_units($method, $path, $body);
    hub_google_ads_quota_operation_attempted($operationUnits);
    $response = hub_google_ads_http('https://googleads.googleapis.com/' . HUB_GOOGLE_ADS_API_VERSION . '/' . ltrim($path, '/'), $method, $headers, $body);
    if ((int)($response['status'] ?? 0) >= 100) hub_google_ads_quota_operation_confirmed($operationUnits);
    $payload = json_decode($response['body'], true);
    if ($response['status'] < 200 || $response['status'] >= 300 || !is_array($payload)) {
        $errorDetails = hub_google_ads_error_diagnostic_details($payload);
        $gaqlResource = null;
        if (str_ends_with($path, '/googleAds:searchStream') && is_string($body)) {
            $requestPayload = json_decode($body, true);
            $query = is_array($requestPayload) ? ($requestPayload['query'] ?? null) : null;
            if (is_string($query) && preg_match('/\bFROM\s+([a-z][a-z0-9_]{0,59})\b/i', $query, $matches) === 1) {
                $gaqlResource = strtolower($matches[1]);
            }
        }
        $code = match ($response['status']) {
            401 => 'google_ads_auth_failed',
            403 => 'google_ads_access_denied',
            429 => 'google_ads_quota_exceeded',
            400, 404, 422 => 'google_ads_request_rejected',
            default => $response['status'] >= 400 && $response['status'] < 500
                ? 'google_ads_request_rejected'
                : 'google_ads_unavailable',
        };
        $apiOperation = basename(parse_url('/' . ltrim($path, '/'), PHP_URL_PATH) ?: '');
        hub_google_ads_publish_diagnostic([
            'stage' => 'google_ads_api',
            'upstream_http_status' => $response['status'],
            'google_status' => $errorDetails['google_status'],
            'google_api_code' => $errorDetails['google_api_code'],
            'google_request_id' => $errorDetails['google_request_id'],
            'google_error_codes' => $errorDetails['google_error_codes'],
            'field_paths' => $errorDetails['field_paths'],
            'google_error_summary' => $errorDetails['google_error_summary'],
            'google_error_shape' => $errorDetails['google_error_shape'],
            'google_top_level_keys' => $errorDetails['google_top_level_keys'],
            'google_error_keys' => $errorDetails['google_error_keys'],
            'google_response_shape' => $errorDetails['google_response_shape'],
            'google_stream_chunk_count' => $errorDetails['google_stream_chunk_count'],
            'google_stream_chunk_keys' => $errorDetails['google_stream_chunk_keys'],
            'api_operation' => $apiOperation,
            'gaql_resource' => $gaqlResource,
            'retryable' => in_array($code, ['google_ads_unavailable', 'google_ads_quota_exceeded'], true),
            'response_format' => !is_array($payload)
                ? (json_last_error() === JSON_ERROR_NONE ? 'invalid_shape' : 'invalid_json')
                : (!in_array($errorDetails['google_error_shape'], ['object', 'array_wrapper'], true) ? 'missing_google_error' : null),
        ]);
        throw new HubGoogleAdsApiException($code, 502);
    }
    return $payload;
}

function hub_google_ads_search(string $customerId, string $query, string $accessToken, ?string $loginCustomerId = null): array
{
    $payload = hub_google_ads_api_request(
        'POST',
        'customers/' . $customerId . '/googleAds:searchStream',
        $accessToken,
        json_encode(['query' => $query], JSON_UNESCAPED_SLASHES),
        $loginCustomerId
    );
    $rows = [];
    foreach ($payload as $chunk) {
        if (!is_array($chunk) || !is_array($chunk['results'] ?? null)) continue;
        foreach ($chunk['results'] as $row) if (is_array($row)) $rows[] = $row;
    }
    return $rows;
}

function hub_google_ads_direct_customer_details(string $customerId, string $accessToken): array
{
    $query = 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1';
    try {
        $rows = hub_google_ads_search($customerId, $query, $accessToken);
    } catch (HubGoogleAdsApiException $firstError) {
        // A directly accessible manager can require its own ID as login-customer-id.
        $rows = hub_google_ads_search($customerId, $query, $accessToken, $customerId);
    }
    $customer = $rows[0]['customer'] ?? null;
    if (!is_array($customer)) throw new HubGoogleAdsApiException('google_ads_access_denied', 502);
    return $customer;
}

function hub_google_ads_valid_customer_id(mixed $value): ?string
{
    return is_string($value) && preg_match('/^[1-9][0-9]{9}$/D', $value) === 1 ? $value : null;
}

function hub_google_ads_accessible_accounts(string $accessToken): array
{
    $payload = hub_google_ads_api_request('GET', 'customers:listAccessibleCustomers', $accessToken);
    $resourceNames = $payload['resourceNames'] ?? null;
    if (!is_array($resourceNames)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
    $managers = [];
    $accounts = [];
    $warningCount = 0;
    $directAccountsFound = false;
    $accessibleIds = [];
    foreach ($resourceNames as $resourceName) {
        if (!is_string($resourceName) || preg_match('#^customers/([1-9][0-9]{9})$#D', $resourceName, $matches) !== 1) continue;
        $accessibleIds[$matches[1]] = $matches[1];
    }
    foreach (array_values($accessibleIds) as $rootId) {
        try {
            $customer = hub_google_ads_direct_customer_details($rootId, $accessToken);
            $rootName = trim((string)($customer['descriptiveName'] ?? '')) ?: 'Conta ' . $rootId;
            if (($customer['manager'] ?? false) === true) {
                $managers[$rootId] = [
                    'customer_id' => $rootId,
                    'name' => $rootName,
                    'currency_code' => (string)($customer['currencyCode'] ?? ''),
                    'time_zone' => (string)($customer['timeZone'] ?? ''),
                ];
                try {
                    $clientRows = hub_google_ads_search($rootId,
                        'SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.level, customer_client.status FROM customer_client WHERE customer_client.level <= 5 LIMIT 1001',
                        $accessToken,
                        $rootId
                    );
                    foreach ($clientRows as $row) {
                        if (count($accounts) >= HUB_GOOGLE_ADS_MAX_ACCOUNTS) { $warningCount++; break; }
                        $client = $row['customerClient'] ?? null;
                        if (!is_array($client)) continue;
                        $clientId = hub_google_ads_valid_customer_id((string)($client['id'] ?? ''));
                        if ($clientId === null || $clientId === $rootId || ($client['manager'] ?? false) === true) continue;
                        $accounts[$rootId . ':' . $clientId] = [
                            'manager_customer_id' => $rootId,
                            'manager_name' => $rootName,
                            'customer_id' => $clientId,
                            'name' => trim((string)($client['descriptiveName'] ?? '')) ?: 'Conta ' . $clientId,
                            'currency_code' => (string)($client['currencyCode'] ?? ''),
                            'time_zone' => (string)($client['timeZone'] ?? ''),
                            'status' => (string)($client['status'] ?? ''),
                            'manager' => false,
                        ];
                    }
                } catch (HubGoogleAdsApiException $error) {
                    $warningCount++;
                }
            } else {
                $directAccountsFound = true;
                $accounts['direct:' . $rootId] = [
                    'manager_customer_id' => null,
                    'manager_name' => 'Contas com acesso direto',
                    'customer_id' => $rootId,
                    'name' => $rootName,
                    'currency_code' => (string)($customer['currencyCode'] ?? ''),
                    'time_zone' => (string)($customer['timeZone'] ?? ''),
                    'status' => '',
                    'manager' => false,
                ];
            }
        } catch (HubGoogleAdsApiException $error) {
            $warningCount++;
        }
    }
    if ($directAccountsFound) $managers['direct'] = ['customer_id' => null, 'name' => 'Contas com acesso direto', 'currency_code' => '', 'time_zone' => ''];
    $managerList = array_values($managers);
    usort($managerList, static fn(array $left, array $right): int => strcasecmp((string)$left['name'], (string)$right['name']));
    $accountList = array_values($accounts);
    usort($accountList, static fn(array $left, array $right): int => strcasecmp((string)$left['name'], (string)$right['name']));
    return [
        'ok' => true,
        'schema_version' => 1,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'warning_count' => $warningCount,
        'managers' => $managerList,
        'accounts' => $accountList,
    ];
}

function hub_google_ads_parse_date(string $value): ?DateTimeImmutable
{
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value) !== 1) return null;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('UTC'));
    $errors = DateTimeImmutable::getLastErrors();
    if ($date === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) || $date->format('Y-m-d') !== $value) return null;
    return $date;
}

function hub_google_ads_validate_report_request(array $payload): array
{
    $managerId = $payload['manager_customer_id'] ?? null;
    if ($managerId !== null) $managerId = hub_google_ads_valid_customer_id($managerId);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $dateFrom = is_string($payload['date_from'] ?? null) ? $payload['date_from'] : '';
    $dateTo = is_string($payload['date_to'] ?? null) ? $payload['date_to'] : '';
    $from = hub_google_ads_parse_date($dateFrom);
    $to = hub_google_ads_parse_date($dateTo);
    if (($payload['manager_customer_id'] ?? null) !== null && $managerId === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
    if ($customerId === null || $from === null || $to === null || $from > $to) throw new HubGoogleAdsApiException('invalid_date_range', 400);
    $days = (int)$from->diff($to)->days + 1;
    if ($days > 366) throw new HubGoogleAdsApiException('date_range_too_large', 400);
    return [$managerId, $customerId, $dateFrom, $dateTo];
}

function hub_google_ads_validate_daily_report_request(array $payload): array
{
    [$managerId, $customerId, $dateFrom, $dateTo] = hub_google_ads_validate_report_request($payload);
    $from = hub_google_ads_parse_date($dateFrom);
    $to = hub_google_ads_parse_date($dateTo);
    if ($from === null || $to === null || (int)$from->diff($to)->days + 1 > HUB_GOOGLE_ADS_DAILY_MAX_DAYS) {
        throw new HubGoogleAdsApiException('daily_date_range_too_large', 400);
    }
    return [$managerId, $customerId, $dateFrom, $dateTo];
}

function hub_google_ads_validate_geographic_report_request(array $payload): array
{
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    $expectedKeys = ['customer_id', 'date_from', 'date_to', 'manager_customer_id', 'operation'];
    sort($expectedKeys, SORT_STRING);
    if ($keys !== $expectedKeys || ($payload['operation'] ?? null) !== 'geographic_report') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    [$managerId, $customerId, $dateFrom, $dateTo] = hub_google_ads_validate_report_request($payload);
    $from = hub_google_ads_parse_date($dateFrom);
    $to = hub_google_ads_parse_date($dateTo);
    if ($from === null || $to === null || (int)$from->diff($to)->days + 1 > HUB_GOOGLE_ADS_GEOGRAPHIC_MAX_DAYS) {
        throw new HubGoogleAdsApiException('geographic_date_range_too_large', 400);
    }
    return [$managerId, $customerId, $dateFrom, $dateTo];
}

function hub_google_ads_validate_search_terms_request(array $payload): array
{
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    $baseKeys = ['customer_id', 'date_from', 'date_to', 'manager_customer_id', 'operation'];
    $filteredKeys = [...$baseKeys, 'campaign_id'];
    sort($baseKeys, SORT_STRING);
    sort($filteredKeys, SORT_STRING);
    if (($keys !== $baseKeys && $keys !== $filteredKeys) || ($payload['operation'] ?? null) !== 'search_terms') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }

    [$managerId, $customerId, $dateFrom, $dateTo] = hub_google_ads_validate_report_request($payload);
    $from = hub_google_ads_parse_date($dateFrom);
    $to = hub_google_ads_parse_date($dateTo);
    if ($from === null || $to === null || (int)$from->diff($to)->days + 1 > HUB_GOOGLE_ADS_SEARCH_TERMS_MAX_DAYS) {
        throw new HubGoogleAdsApiException('search_terms_date_range_too_large', 400);
    }
    $campaignId = null;
    if (array_key_exists('campaign_id', $payload)) {
        if (!is_string($payload['campaign_id']) || preg_match('/^[1-9][0-9]{0,19}$/D', $payload['campaign_id']) !== 1) {
            throw new HubGoogleAdsApiException('invalid_payload', 400);
        }
        $campaignId = $payload['campaign_id'];
    }
    return [$managerId, $customerId, $dateFrom, $dateTo, $campaignId];
}

function hub_google_ads_validate_search_term_campaigns_request(array $payload): array
{
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    if ($keys !== ['customer_id', 'manager_customer_id', 'operation'] || ($payload['operation'] ?? null) !== 'search_term_campaigns') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $managerId = $payload['manager_customer_id'] === null ? null : hub_google_ads_valid_customer_id($payload['manager_customer_id']);
    if ($customerId === null || ($payload['manager_customer_id'] !== null && $managerId === null)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $customerId];
}

function hub_google_ads_validate_sao_paulo_day_report_request(array $payload): array
{
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    $baseKeys = ['business_date', 'customer_id', 'manager_customer_id', 'operation'];
    $activeKeys = ['business_date', 'campaign_status_filter', 'customer_id', 'manager_customer_id', 'operation'];
    $campaignStatusFilter = 'ALL';
    if ($keys === $activeKeys) {
        if (($payload['campaign_status_filter'] ?? null) !== 'ENABLED') throw new HubGoogleAdsApiException('invalid_payload', 400);
        $campaignStatusFilter = 'ENABLED';
    }
    if (($keys !== $baseKeys && $keys !== $activeKeys)
        || ($payload['operation'] ?? null) !== 'sao_paulo_day_report') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $managerRaw = $payload['manager_customer_id'];
    $managerId = $managerRaw === null ? null : hub_google_ads_valid_customer_id($managerRaw);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
    $businessDate = is_string($payload['business_date']) ? $payload['business_date'] : '';
    $parsedBusinessDate = hub_google_ads_parse_date($businessDate);
    if (($managerRaw !== null && $managerId === null) || $customerId === null || $parsedBusinessDate === null) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $saoPaulo = new DateTimeZone('America/Sao_Paulo');
    $expectedYesterdayDate = (new DateTimeImmutable('now', $saoPaulo))->setTime(0, 0)->modify('-1 day');
    $expectedYesterday = $expectedYesterdayDate->format('Y-m-d');
    $earliestAllowedDate = $expectedYesterdayDate->modify('-' . (HUB_GOOGLE_ADS_SAO_PAULO_DAY_MAX_DAYS - 1) . ' days')->format('Y-m-d');
    if ($businessDate > $expectedYesterday || $businessDate < $earliestAllowedDate) {
        throw new HubGoogleAdsApiException('sao_paulo_day_outside_window', 400);
    }
    return [$managerId, $customerId, $businessDate, $campaignStatusFilter];
}

function hub_google_ads_report(string $accessToken, ?string $managerId, string $customerId, string $dateFrom, string $dateTo): array
{
    $coreQuery = "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '{$dateFrom}' AND '{$dateTo}' ORDER BY metrics.cost_micros DESC LIMIT " . (HUB_GOOGLE_ADS_MAX_CAMPAIGN_ROWS + 1);
    $coreRows = hub_google_ads_search($customerId, $coreQuery, $accessToken, $managerId);
    if (count($coreRows) > HUB_GOOGLE_ADS_MAX_CAMPAIGN_ROWS) throw new HubGoogleAdsApiException('report_limit_exceeded', 413);

    $shareMap = [];
    $shareMetricsAvailable = false;
    try {
        $shareQuery = "SELECT campaign.id, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share, metrics.top_impression_percentage, metrics.absolute_top_impression_percentage FROM campaign WHERE segments.date BETWEEN '{$dateFrom}' AND '{$dateTo}' LIMIT " . (HUB_GOOGLE_ADS_MAX_CAMPAIGN_ROWS + 1);
        $shareRows = hub_google_ads_search($customerId, $shareQuery, $accessToken, $managerId);
        foreach ($shareRows as $row) {
            $id = (string)($row['campaign']['id'] ?? '');
            if ($id === '') continue;
            $metrics = is_array($row['metrics'] ?? null) ? $row['metrics'] : [];
            $shareMap[$id] = [
                'search_impression_share' => $metrics['searchImpressionShare'] ?? null,
                'search_top_impression_share' => $metrics['searchTopImpressionShare'] ?? null,
                'search_absolute_top_impression_share' => $metrics['searchAbsoluteTopImpressionShare'] ?? null,
                'top_impression_percentage' => $metrics['topImpressionPercentage'] ?? null,
                'absolute_top_impression_percentage' => $metrics['absoluteTopImpressionPercentage'] ?? null,
            ];
        }
        $shareMetricsAvailable = true;
    } catch (HubGoogleAdsApiException $error) {
        // Share metrics are optional in this first view; retain the core report if their field combination is unavailable.
    }

    $currencyCode = '';
    $timeZone = '';
    try {
        $accountRows = hub_google_ads_search($customerId,
            'SELECT customer.currency_code, customer.time_zone FROM customer LIMIT 1',
            $accessToken,
            $managerId
        );
        $customer = $accountRows[0]['customer'] ?? [];
        if (is_array($customer)) {
            $currencyCode = (string)($customer['currencyCode'] ?? '');
            $timeZone = (string)($customer['timeZone'] ?? '');
        }
    } catch (HubGoogleAdsApiException $error) {
        // The selected account metadata is also available in the already loaded account list.
    }

    $rows = [];
    foreach ($coreRows as $row) {
        $campaign = is_array($row['campaign'] ?? null) ? $row['campaign'] : [];
        $metrics = is_array($row['metrics'] ?? null) ? $row['metrics'] : [];
        $campaignId = (string)($campaign['id'] ?? '');
        $share = $shareMap[$campaignId] ?? [];
        if ($campaignId === '') continue;
        $rows[] = [
            'campaign_id' => $campaignId,
            'campaign_name' => (string)($campaign['name'] ?? ''),
            'campaign_status' => (string)($campaign['status'] ?? ''),
            'channel_type' => (string)($campaign['advertisingChannelType'] ?? ''),
            'impressions' => $metrics['impressions'] ?? '0',
            'clicks' => $metrics['clicks'] ?? '0',
            'ctr' => $metrics['ctr'] ?? null,
            'average_cpc_micros' => $metrics['averageCpc'] ?? null,
            'cost_micros' => $metrics['costMicros'] ?? '0',
            'conversions' => $metrics['conversions'] ?? '0',
            'cost_per_conversion_micros' => $metrics['costPerConversion'] ?? null,
            'conversions_value' => $metrics['conversionsValue'] ?? '0',
            'search_impression_share' => $share['search_impression_share'] ?? null,
            'search_top_impression_share' => $share['search_top_impression_share'] ?? null,
            'search_absolute_top_impression_share' => $share['search_absolute_top_impression_share'] ?? null,
            'top_impression_percentage' => $share['top_impression_percentage'] ?? null,
            'absolute_top_impression_percentage' => $share['absolute_top_impression_percentage'] ?? null,
        ];
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'customer_id' => $customerId,
        'manager_customer_id' => $managerId,
        'date_from' => $dateFrom,
        'date_to' => $dateTo,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'currency_code' => $currencyCode,
        'time_zone' => $timeZone,
        'share_metrics_available' => $shareMetricsAvailable,
        'position_metrics_available' => $shareMetricsAvailable,
        'rows' => $rows,
    ];
}

function hub_google_ads_daily_report(string $accessToken, ?string $managerId, string $customerId, string $dateFrom, string $dateTo, ?string $contextDate = null, mixed $contextToken = null, string $privateKey = ''): array
{
    $coreQuery = "SELECT segments.date, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '{$dateFrom}' AND '{$dateTo}' ORDER BY segments.date DESC, metrics.cost_micros DESC LIMIT " . (HUB_GOOGLE_ADS_MAX_DAILY_ROWS + 1);
    $coreRows = hub_google_ads_search($customerId, $coreQuery, $accessToken, $managerId);
    if (count($coreRows) > HUB_GOOGLE_ADS_MAX_DAILY_ROWS) throw new HubGoogleAdsApiException('daily_report_limit_exceeded', 413);

    $shareMap = [];
    $shareMetricsAvailable = false;
    try {
        $shareQuery = "SELECT segments.date, campaign.id, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share, metrics.top_impression_percentage, metrics.absolute_top_impression_percentage FROM campaign WHERE segments.date BETWEEN '{$dateFrom}' AND '{$dateTo}' LIMIT " . (HUB_GOOGLE_ADS_MAX_DAILY_ROWS + 1);
        $shareRows = hub_google_ads_search($customerId, $shareQuery, $accessToken, $managerId);
        if (count($shareRows) <= HUB_GOOGLE_ADS_MAX_DAILY_ROWS) {
            foreach ($shareRows as $row) {
                $date = (string)($row['segments']['date'] ?? '');
                $id = (string)($row['campaign']['id'] ?? '');
                if ($date === '' || $id === '') continue;
                $metrics = is_array($row['metrics'] ?? null) ? $row['metrics'] : [];
                $shareMap[$date . ':' . $id] = [
                    'search_impression_share' => $metrics['searchImpressionShare'] ?? null,
                    'search_top_impression_share' => $metrics['searchTopImpressionShare'] ?? null,
                    'search_absolute_top_impression_share' => $metrics['searchAbsoluteTopImpressionShare'] ?? null,
                    'top_impression_percentage' => $metrics['topImpressionPercentage'] ?? null,
                    'absolute_top_impression_percentage' => $metrics['absoluteTopImpressionPercentage'] ?? null,
                ];
            }
            $shareMetricsAvailable = true;
        }
    } catch (HubGoogleAdsApiException $error) {
        // Impression-share metrics are optional in the first daily comparison preview.
    }

    $metadata = hub_google_ads_account_metadata(
        $managerId,
        $customerId,
        static fn(string $query): array => hub_google_ads_search($customerId, $query, $accessToken, $managerId),
        $contextDate,
        $contextToken,
        $privateKey
    );
    $currencyCode = $metadata['currency_code'];
    $timeZone = $metadata['time_zone'];

    $rows = [];
    foreach ($coreRows as $row) {
        $segments = is_array($row['segments'] ?? null) ? $row['segments'] : [];
        $campaign = is_array($row['campaign'] ?? null) ? $row['campaign'] : [];
        $metrics = is_array($row['metrics'] ?? null) ? $row['metrics'] : [];
        $date = (string)($segments['date'] ?? '');
        $campaignId = (string)($campaign['id'] ?? '');
        if ($date === '' || $campaignId === '') continue;
        $share = $shareMap[$date . ':' . $campaignId] ?? [];
        $rows[] = [
            'date' => $date,
            'campaign_id' => $campaignId,
            'campaign_name' => (string)($campaign['name'] ?? ''),
            'campaign_status' => (string)($campaign['status'] ?? ''),
            'channel_type' => (string)($campaign['advertisingChannelType'] ?? ''),
            'impressions' => $metrics['impressions'] ?? '0',
            'clicks' => $metrics['clicks'] ?? '0',
            'ctr' => $metrics['ctr'] ?? null,
            'average_cpc_micros' => $metrics['averageCpc'] ?? null,
            'cost_micros' => $metrics['costMicros'] ?? '0',
            'conversions' => $metrics['conversions'] ?? '0',
            'cost_per_conversion_micros' => $metrics['costPerConversion'] ?? null,
            'conversions_value' => $metrics['conversionsValue'] ?? '0',
            'search_impression_share' => $share['search_impression_share'] ?? null,
            'search_top_impression_share' => $share['search_top_impression_share'] ?? null,
            'search_absolute_top_impression_share' => $share['search_absolute_top_impression_share'] ?? null,
            'top_impression_percentage' => $share['top_impression_percentage'] ?? null,
            'absolute_top_impression_percentage' => $share['absolute_top_impression_percentage'] ?? null,
        ];
    }

    return [
        'ok' => true,
        'schema_version' => 1,
        'report_granularity' => 'daily',
        'query_complete' => true,
        'customer_id' => $customerId,
        'manager_customer_id' => $managerId,
        'date_from' => $dateFrom,
        'date_to' => $dateTo,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'currency_code' => $currencyCode,
        'time_zone' => $timeZone,
        'account_metadata_context_token' => $metadata['account_metadata_context_token'],
        'account_metadata_context_reused' => $metadata['account_metadata_context_reused'],
        'share_metrics_available' => $shareMetricsAvailable,
        'position_metrics_available' => $shareMetricsAvailable,
        'rows' => $rows,
    ];
}

function hub_google_ads_search_term_campaigns(string $accessToken, ?string $managerId, string $customerId, ?callable $search = null): array
{
    $search ??= static fn(string $query): array => hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    $query = "SELECT campaign.id, campaign.name FROM campaign WHERE campaign.advertising_channel_type = 'SEARCH' ORDER BY campaign.name LIMIT " . (HUB_GOOGLE_ADS_SEARCH_TERM_CAMPAIGNS_MAX_ROWS + 1);
    $sourceRows = $search($query);
    if (count($sourceRows) > HUB_GOOGLE_ADS_SEARCH_TERM_CAMPAIGNS_MAX_ROWS) {
        throw new HubGoogleAdsApiException('search_term_campaigns_limit_exceeded', 413);
    }

    $campaigns = [];
    $seenIds = [];
    foreach ($sourceRows as $sourceRow) {
        $campaign = is_array($sourceRow['campaign'] ?? null) ? $sourceRow['campaign'] : [];
        $campaignId = (string)($campaign['id'] ?? '');
        $campaignName = trim((string)($campaign['name'] ?? ''));
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1 || $campaignName === '' || isset($seenIds[$campaignId])) {
            throw new HubGoogleAdsApiException('google_ads_report_incomplete', 502);
        }
        $seenIds[$campaignId] = true;
        $campaigns[] = ['campaign_id' => $campaignId, 'campaign_name' => $campaignName];
    }

    return [
        'ok' => true,
        'schema_version' => 1,
        'customer_id' => $customerId,
        'manager_customer_id' => $managerId,
        'campaign_scope' => 'SEARCH',
        'generated_at_utc' => gmdate('Y-m-d\\TH:i:s\\Z'),
        'query_complete' => true,
        'campaign_count' => count($campaigns),
        'campaigns' => $campaigns,
    ];
}

function hub_google_ads_search_terms(string $accessToken, ?string $managerId, string $customerId, string $dateFrom, string $dateTo, ?string $campaignId = null): array
{
    $limit = HUB_GOOGLE_ADS_SEARCH_TERMS_MAX_ROWS + 1;
    $campaignFilter = $campaignId === null ? '' : " AND campaign.id = {$campaignId}";
    $query = "SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type, ad_group.id, ad_group.name, search_term_view.search_term, segments.keyword.info.text, segments.keyword.info.match_type, segments.search_term_match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '{$dateFrom}' AND '{$dateTo}' AND campaign.advertising_channel_type = 'SEARCH'{$campaignFilter} AND metrics.impressions > 0 ORDER BY metrics.clicks DESC, metrics.impressions DESC, metrics.cost_micros DESC LIMIT {$limit}";
    $sourceRows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    if (count($sourceRows) > HUB_GOOGLE_ADS_SEARCH_TERMS_MAX_ROWS) {
        throw new HubGoogleAdsApiException('search_terms_limit_exceeded', 413);
    }

    $rows = [];
    $rowsWithoutKeyword = 0;
    $metricString = static function (mixed $value, bool $allowDecimal = false): ?string {
        if (!is_string($value) && !is_int($value) && !is_float($value)) return null;
        $text = (string)$value;
        $pattern = $allowDecimal ? '/^\d+(?:\.\d+)?$/D' : '/^\d+$/D';
        return preg_match($pattern, $text) === 1 ? $text : null;
    };

    foreach ($sourceRows as $sourceRow) {
        $campaign = is_array($sourceRow['campaign'] ?? null) ? $sourceRow['campaign'] : [];
        $adGroup = is_array($sourceRow['adGroup'] ?? null) ? $sourceRow['adGroup'] : [];
        $searchTermView = is_array($sourceRow['searchTermView'] ?? null) ? $sourceRow['searchTermView'] : [];
        $segments = is_array($sourceRow['segments'] ?? null) ? $sourceRow['segments'] : [];
        $keyword = is_array($segments['keyword'] ?? null) ? $segments['keyword'] : [];
        $keywordInfo = is_array($keyword['info'] ?? null) ? $keyword['info'] : [];
        $metrics = is_array($sourceRow['metrics'] ?? null) ? $sourceRow['metrics'] : [];

        $date = $segments['date'] ?? null;
        $rowCampaignId = (string)($campaign['id'] ?? '');
        $campaignName = trim((string)($campaign['name'] ?? ''));
        $adGroupId = (string)($adGroup['id'] ?? '');
        $adGroupName = trim((string)($adGroup['name'] ?? ''));
        $searchTerm = trim((string)($searchTermView['searchTerm'] ?? ''));
        if (!is_string($date) || hub_google_ads_parse_date($date) === null || $date < $dateFrom || $date > $dateTo
            || $rowCampaignId === '' || $campaignName === '' || ($campaign['advertisingChannelType'] ?? null) !== 'SEARCH'
            || $adGroupId === '' || $adGroupName === '' || $searchTerm === '') {
            throw new HubGoogleAdsApiException('google_ads_report_incomplete', 502);
        }

        $keywordText = trim((string)($keywordInfo['text'] ?? ''));
        if ($keywordText === '') {
            $rowsWithoutKeyword++;
            continue;
        }

        $impressions = $metricString($metrics['impressions'] ?? null);
        $clicks = $metricString($metrics['clicks'] ?? null);
        $costMicros = $metricString($metrics['costMicros'] ?? null);
        $conversions = $metricString($metrics['conversions'] ?? null, true);
        if ($impressions === null || $clicks === null || $costMicros === null || $conversions === null) {
            throw new HubGoogleAdsApiException('google_ads_report_incomplete', 502);
        }

        $rows[] = [
            'date' => $date,
            'campaign_id' => $rowCampaignId,
            'campaign_name' => $campaignName,
            'ad_group_id' => $adGroupId,
            'ad_group_name' => $adGroupName,
            'search_term' => $searchTerm,
            'keyword_text' => $keywordText,
            'keyword_match_type' => (string)($keywordInfo['matchType'] ?? ''),
            'search_term_match_type' => (string)($segments['searchTermMatchType'] ?? ''),
            'impressions' => $impressions,
            'clicks' => $clicks,
            'cost_micros' => $costMicros,
            'conversions' => $conversions,
        ];
    }

    return [
        'ok' => true,
        'schema_version' => 1,
        'customer_id' => $customerId,
        'manager_customer_id' => $managerId,
        'date_from' => $dateFrom,
        'date_to' => $dateTo,
        'campaign_scope' => 'SEARCH',
        'campaign_id_filter' => $campaignId,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'query_complete' => true,
        'row_count' => count($sourceRows),
        'rows_without_keyword' => $rowsWithoutKeyword,
        'rows' => $rows,
    ];
}

/** Reports user physical-location metrics by campaign and country for a bounded period. */
function hub_google_ads_geographic_report(string $accessToken, ?string $managerId, string $customerId, string $dateFrom, string $dateTo): array
{
    $query = "SELECT segments.date, campaign.id, campaign.name, user_location_view.country_criterion_id, metrics.clicks, metrics.impressions, metrics.cost_micros FROM user_location_view WHERE segments.date BETWEEN '{$dateFrom}' AND '{$dateTo}' AND metrics.clicks > 0 ORDER BY segments.date DESC, metrics.clicks DESC LIMIT " . (HUB_GOOGLE_ADS_GEOGRAPHIC_MAX_ROWS + 1);
    $sourceRows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    if (count($sourceRows) > HUB_GOOGLE_ADS_GEOGRAPHIC_MAX_ROWS) {
        throw new HubGoogleAdsApiException('geographic_report_limit_exceeded', 413);
    }

    $countryIds = [];
    foreach ($sourceRows as $sourceRow) {
        $location = is_array($sourceRow['userLocationView'] ?? null) ? $sourceRow['userLocationView'] : [];
        $id = (string)($location['countryCriterionId'] ?? '');
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1) {
            throw new HubGoogleAdsApiException('google_ads_report_incomplete', 502);
        }
        $countryIds[$id] = true;
    }

    $countries = [];
    if ($countryIds !== []) {
        $idList = implode(',', array_keys($countryIds));
        $countryQuery = "SELECT geo_target_constant.id, geo_target_constant.name, geo_target_constant.country_code, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.id IN ({$idList}) LIMIT " . (count($countryIds) + 1);
        $countryRows = hub_google_ads_search($customerId, $countryQuery, $accessToken, $managerId);
        foreach ($countryRows as $countryRow) {
            $constant = is_array($countryRow['geoTargetConstant'] ?? null) ? $countryRow['geoTargetConstant'] : [];
            $id = (string)($constant['id'] ?? '');
            $name = trim((string)($constant['name'] ?? ''));
            $code = strtoupper(trim((string)($constant['countryCode'] ?? '')));
            if (isset($countryIds[$id]) && ($constant['targetType'] ?? null) === 'Country'
                && $name !== '' && preg_match('/^[A-Z]{2}$/D', $code) === 1) {
                $countries[$id] = ['country_code' => $code, 'country_name' => $name];
            }
        }
        if (count($countries) !== count($countryIds)) {
            throw new HubGoogleAdsApiException('geographic_country_lookup_incomplete', 502);
        }
    }

    $rows = [];
    $seen = [];
    foreach ($sourceRows as $sourceRow) {
        $segments = is_array($sourceRow['segments'] ?? null) ? $sourceRow['segments'] : [];
        $campaign = is_array($sourceRow['campaign'] ?? null) ? $sourceRow['campaign'] : [];
        $location = is_array($sourceRow['userLocationView'] ?? null) ? $sourceRow['userLocationView'] : [];
        $metrics = is_array($sourceRow['metrics'] ?? null) ? $sourceRow['metrics'] : [];
        $date = $segments['date'] ?? null;
        $campaignId = (string)($campaign['id'] ?? '');
        $campaignName = trim((string)($campaign['name'] ?? ''));
        $countryId = (string)($location['countryCriterionId'] ?? '');
        $clicks = (string)($metrics['clicks'] ?? '');
        $impressions = (string)($metrics['impressions'] ?? '');
        $costMicros = (string)($metrics['costMicros'] ?? '');
        if (!is_string($date) || hub_google_ads_parse_date($date) === null || $date < $dateFrom || $date > $dateTo
            || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1 || $campaignName === ''
            || !isset($countries[$countryId])
            || preg_match('/^[1-9][0-9]{0,18}$/D', $clicks) !== 1
            || preg_match('/^(0|[1-9][0-9]{0,18})$/D', $impressions) !== 1
            || preg_match('/^(0|[1-9][0-9]{0,18})$/D', $costMicros) !== 1) {
            throw new HubGoogleAdsApiException('google_ads_report_incomplete', 502);
        }
        $key = $date . ':' . $campaignId . ':' . $countryId;
        if (isset($seen[$key])) throw new HubGoogleAdsApiException('google_ads_report_incomplete', 502);
        $seen[$key] = true;
        $rows[] = [
            'date' => $date,
            'campaign_id' => $campaignId,
            'campaign_name' => $campaignName,
            'country_criterion_id' => $countryId,
            'country_code' => $countries[$countryId]['country_code'],
            'country_name' => $countries[$countryId]['country_name'],
            'clicks' => $clicks,
            'impressions' => $impressions,
            'cost_micros' => $costMicros,
        ];
    }

    return [
        'ok' => true,
        'schema_version' => 1,
        'customer_id' => $customerId,
        'manager_customer_id' => $managerId,
        'date_from' => $dateFrom,
        'date_to' => $dateTo,
        'generated_at_utc' => gmdate('Y-m-d\\TH:i:s\\Z'),
        'query_complete' => true,
        'rows' => $rows,
    ];
}

/** Aggregates hourly Google Ads metrics that fall inside yesterday's São Paulo civil day. */
function hub_google_ads_sao_paulo_day_report(string $accessToken, ?string $managerId, string $customerId, string $businessDate, string $campaignStatusFilter = 'ALL'): array
{
    $saoPaulo = new DateTimeZone('America/Sao_Paulo');
    $businessStart = new DateTimeImmutable($businessDate . ' 00:00:00', $saoPaulo);
    $businessEnd = $businessStart->modify('+1 day');
    $businessStartTimestamp = $businessStart->getTimestamp();
    $businessEndTimestamp = $businessEnd->getTimestamp();

    // Google Ads date/hour segments use the customer's timezone. Require hour-aligned
    // boundaries and no DST transition so every selected hourly bucket is exact.
    try {
        $accountRows = hub_google_ads_search($customerId,
            'SELECT customer.currency_code, customer.time_zone FROM customer LIMIT 1',
            $accessToken,
            $managerId
        );
        $customer = $accountRows[0]['customer'] ?? null;
        $currencyCode = is_array($customer) ? (string)($customer['currencyCode'] ?? '') : '';
        $timeZone = is_array($customer) ? (string)($customer['timeZone'] ?? '') : '';
        if ($currencyCode === '' || $timeZone === '') throw new HubGoogleAdsApiException('google_ads_timezone_unavailable', 422);
        $accountZone = new DateTimeZone($timeZone);
    } catch (HubGoogleAdsApiException $error) {
        throw $error;
    } catch (Throwable $error) {
        throw new HubGoogleAdsApiException('google_ads_timezone_unavailable', 422);
    }

    $accountStart = $businessStart->setTimezone($accountZone);
    $accountEnd = $businessEnd->setTimezone($accountZone);
    if ($accountStart->format('i:s') !== '00:00' || $accountEnd->format('i:s') !== '00:00'
        || $accountEnd->getTimestamp() - $accountStart->getTimestamp() !== 86400) {
        throw new HubGoogleAdsApiException('sao_paulo_day_timezone_unsupported', 422);
    }
    $transitions = $accountZone->getTransitions($businessStartTimestamp - 1, $businessEndTimestamp + 1);
    if (is_array($transitions)) {
        $previousOffset = $transitions[0]['offset'] ?? null;
        foreach (array_slice($transitions, 1) as $transition) {
            $transitionTimestamp = (int)($transition['ts'] ?? 0);
            $offset = $transition['offset'] ?? null;
            if ($transitionTimestamp > $businessStartTimestamp && $transitionTimestamp < $businessEndTimestamp
                && $offset !== $previousOffset) {
                throw new HubGoogleAdsApiException('sao_paulo_day_timezone_unsupported', 422);
            }
            $previousOffset = $offset;
        }
    }

    $sourceDateFrom = $accountStart->format('Y-m-d');
    $sourceDateTo = $accountEnd->modify('-1 second')->format('Y-m-d');
    $statusCondition = $campaignStatusFilter === 'ENABLED' ? " AND campaign.status = 'ENABLED'" : '';
    $query = "SELECT segments.date, segments.hour, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.top_impression_percentage, metrics.absolute_top_impression_percentage FROM campaign WHERE segments.date BETWEEN '{$sourceDateFrom}' AND '{$sourceDateTo}'{$statusCondition} ORDER BY segments.date ASC, segments.hour ASC LIMIT " . (HUB_GOOGLE_ADS_MAX_DAILY_ROWS + 1);
    $hourlyRows = hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    if (count($hourlyRows) > HUB_GOOGLE_ADS_MAX_DAILY_ROWS) throw new HubGoogleAdsApiException('daily_report_limit_exceeded', 413);

    $aggregates = [];
    foreach ($hourlyRows as $row) {
        $segments = is_array($row['segments'] ?? null) ? $row['segments'] : [];
        $campaign = is_array($row['campaign'] ?? null) ? $row['campaign'] : [];
        $date = (string)($segments['date'] ?? '');
        $hourValue = $segments['hour'] ?? null;
        $campaignId = (string)($campaign['id'] ?? '');
        if (hub_google_ads_parse_date($date) === null || (!is_string($hourValue) && !is_int($hourValue))
            || preg_match('/^(?:[0-9]|1[0-9]|2[0-3])$/D', (string)$hourValue) !== 1
            || preg_match('/^[1-9][0-9]{0,19}$/D', $campaignId) !== 1) {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $hour = str_pad((string)$hourValue, 2, '0', STR_PAD_LEFT);
        $bucketStart = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $date . ' ' . $hour . ':00:00', $accountZone);
        $bucketErrors = DateTimeImmutable::getLastErrors();
        if ($bucketStart === false || ($bucketErrors !== false && ($bucketErrors['warning_count'] > 0 || $bucketErrors['error_count'] > 0))
            || $bucketStart->format('Y-m-d H:i:s') !== $date . ' ' . $hour . ':00:00') {
            throw new HubGoogleAdsApiException('sao_paulo_day_timezone_unsupported', 422);
        }
        $bucketTimestamp = $bucketStart->getTimestamp();
        if ($bucketTimestamp < $businessStartTimestamp || $bucketTimestamp + 3600 > $businessEndTimestamp) continue;

        $metrics = is_array($row['metrics'] ?? null) ? $row['metrics'] : [];
        if (!isset($aggregates[$campaignId])) {
            $aggregates[$campaignId] = [
                'campaign_id' => $campaignId,
                'campaign_name' => (string)($campaign['name'] ?? ''),
                'campaign_status' => (string)($campaign['status'] ?? ''),
                'channel_type' => (string)($campaign['advertisingChannelType'] ?? ''),
                'impressions' => 0,
                'clicks' => 0,
                'cost_micros' => 0,
                'conversions' => 0.0,
                'conversions_value' => 0.0,
                'top_impression_percentage_weighted_sum' => 0.0,
                'top_impression_percentage_weight' => 0,
                'top_impression_percentage_incomplete' => false,
                'absolute_top_impression_percentage_weighted_sum' => 0.0,
                'absolute_top_impression_percentage_weight' => 0,
                'absolute_top_impression_percentage_incomplete' => false,
            ];
        }
        $bucketImpressions = max(0, (int)($metrics['impressions'] ?? 0));
        $aggregates[$campaignId]['impressions'] += $bucketImpressions;
        foreach ([
            'top_impression_percentage' => 'topImpressionPercentage',
            'absolute_top_impression_percentage' => 'absoluteTopImpressionPercentage',
        ] as $aggregateKey => $apiKey) {
            if ($bucketImpressions === 0) continue;
            $value = $metrics[$apiKey] ?? null;
            if (is_numeric($value) && (float)$value >= 0 && (float)$value <= 1) {
                $aggregates[$campaignId][$aggregateKey . '_weighted_sum'] += (float)$value * $bucketImpressions;
                $aggregates[$campaignId][$aggregateKey . '_weight'] += $bucketImpressions;
            } else {
                $aggregates[$campaignId][$aggregateKey . '_incomplete'] = true;
            }
        }
        $aggregates[$campaignId]['clicks'] += max(0, (int)($metrics['clicks'] ?? 0));
        $aggregates[$campaignId]['cost_micros'] += max(0, (int)($metrics['costMicros'] ?? 0));
        $aggregates[$campaignId]['conversions'] += max(0.0, (float)($metrics['conversions'] ?? 0));
        $aggregates[$campaignId]['conversions_value'] += max(0.0, (float)($metrics['conversionsValue'] ?? 0));
    }

    $rows = [];
    foreach ($aggregates as $aggregate) {
        $impressions = $aggregate['impressions'];
        $clicks = $aggregate['clicks'];
        $costMicros = $aggregate['cost_micros'];
        $conversions = $aggregate['conversions'];
        $rows[] = [
            'date' => $businessDate,
            'campaign_id' => $aggregate['campaign_id'],
            'campaign_name' => $aggregate['campaign_name'],
            'campaign_status' => $aggregate['campaign_status'],
            'channel_type' => $aggregate['channel_type'],
            'impressions' => $impressions,
            'clicks' => $clicks,
            'ctr' => $impressions > 0 ? $clicks / $impressions : null,
            'average_cpc_micros' => $clicks > 0 ? $costMicros / $clicks : null,
            'cost_micros' => $costMicros,
            'conversions' => $conversions,
            'cost_per_conversion_micros' => $conversions > 0 ? $costMicros / $conversions : null,
            'conversions_value' => $aggregate['conversions_value'],
            'search_impression_share' => null,
            'search_top_impression_share' => null,
            'search_absolute_top_impression_share' => null,
            'top_impression_percentage' => $aggregate['top_impression_percentage_weight'] > 0 && !$aggregate['top_impression_percentage_incomplete'] ? $aggregate['top_impression_percentage_weighted_sum'] / $aggregate['top_impression_percentage_weight'] : null,
            'absolute_top_impression_percentage' => $aggregate['absolute_top_impression_percentage_weight'] > 0 && !$aggregate['absolute_top_impression_percentage_incomplete'] ? $aggregate['absolute_top_impression_percentage_weighted_sum'] / $aggregate['absolute_top_impression_percentage_weight'] : null,
        ];
    }
    usort($rows, static fn(array $left, array $right): int => strcasecmp($left['campaign_name'], $right['campaign_name']));
    return [
        'ok' => true,
        'schema_version' => 1,
        'report_granularity' => 'business_day_hourly_aggregate',
        'query_complete' => true,
        'customer_id' => $customerId,
        'manager_customer_id' => $managerId,
        'date_from' => $businessDate,
        'date_to' => $businessDate,
        'business_date' => $businessDate,
        'business_time_zone' => 'America/Sao_Paulo',
        'campaign_status_filter' => $campaignStatusFilter,
        'source_date_from' => $sourceDateFrom,
        'source_date_to' => $sourceDateTo,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'currency_code' => $currencyCode,
        'time_zone' => $timeZone,
        'share_metrics_available' => false,
        'position_metrics_available' => true,
        'rows' => $rows,
    ];
}

/** Current configuration snapshot; no date segment and no metric-driven omissions. */
function hub_google_ads_campaign_config(string $accessToken, ?string $managerId, string $customerId, ?callable $search = null, ?string $contextDate = null, mixed $contextToken = null, string $privateKey = ''): array
{
    $search ??= static fn(string $query): array => hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    $rows = $search('SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.bidding_strategy, campaign.target_cpa.target_cpa_micros, campaign.maximize_conversions.target_cpa_micros, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.period, campaign_budget.explicitly_shared FROM campaign LIMIT ' . (HUB_GOOGLE_ADS_MAX_CAMPAIGN_ROWS + 1));
    if (count($rows) > HUB_GOOGLE_ADS_MAX_CAMPAIGN_ROWS) throw new HubGoogleAdsApiException('configuration_limit_exceeded', 422);
    $strategies = [];
    if (array_filter($rows, static fn(array $row): bool => !empty($row['campaign']['biddingStrategy']))) {
        $strategyRows = $search('SELECT accessible_bidding_strategy.id, accessible_bidding_strategy.owner_customer_id, accessible_bidding_strategy.target_cpa.target_cpa_micros, accessible_bidding_strategy.maximize_conversions.target_cpa_micros FROM accessible_bidding_strategy LIMIT ' . (HUB_GOOGLE_ADS_MAX_CAMPAIGN_ROWS + 1));
        if (count($strategyRows) > HUB_GOOGLE_ADS_MAX_CAMPAIGN_ROWS) throw new HubGoogleAdsApiException('configuration_limit_exceeded', 422);
        foreach ($strategyRows as $row) {
            $strategy = $row['accessibleBiddingStrategy'] ?? [];
            $strategies['customers/' . ($strategy['ownerCustomerId'] ?? '') . '/biddingStrategies/' . ($strategy['id'] ?? '')] = $strategy;
        }
    }
    $metadata = hub_google_ads_account_metadata($managerId, $customerId, $search, $contextDate, $contextToken, $privateKey);
    $campaigns = [];
    foreach ($rows as $row) {
        $campaign = $row['campaign'] ?? [];
        $id = (string)($campaign['id'] ?? '');
        if (preg_match('/^\d{1,20}$/D', $id) !== 1) throw new HubGoogleAdsApiException('google_ads_request_rejected');
        $budget = $row['campaignBudget'] ?? [];
        $portfolio = (string)($campaign['biddingStrategy'] ?? '');
        $scheme = $portfolio !== '' ? ($strategies[$portfolio] ?? []) : $campaign;
        $target = $scheme['targetCpa']['targetCpaMicros'] ?? $scheme['maximizeConversions']['targetCpaMicros'] ?? null;
        $campaigns[] = [
            'campaign_id' => $id, 'campaign_name' => (string)($campaign['name'] ?? ''),
            'campaign_status' => (string)($campaign['status'] ?? ''),
            'primary_status' => (string)($campaign['primaryStatus'] ?? ''),
            'primary_status_reasons' => array_values($campaign['primaryStatusReasons'] ?? []),
            'channel_type' => (string)($campaign['advertisingChannelType'] ?? ''),
            'bidding_strategy_type' => (string)($campaign['biddingStrategyType'] ?? ''),
            'bidding_strategy_resource' => $portfolio ?: null,
            'target_cpa_micros' => $target,
            'target_cpa_resolution' => $portfolio !== '' && !isset($strategies[$portfolio]) ? 'unresolved_portfolio' : ($target === null ? (($campaign['biddingStrategyType'] ?? '') === 'TARGET_CPA' ? 'unavailable' : 'not_set') : 'observed'),
            'budget_resource' => $budget['resourceName'] ?? null,
            'budget_period' => $budget['period'] ?? null,
            'budget_amount_micros' => $budget['amountMicros'] ?? null,
            'budget_total_amount_micros' => $budget['totalAmountMicros'] ?? null,
            'budget_shared' => (bool)($budget['explicitlyShared'] ?? false),
        ];
    }
    return ['ok' => true, 'schema_version' => 1, 'configuration_complete' => true,
        'customer_id' => $customerId, 'manager_customer_id' => $managerId,
        'currency_code' => $metadata['currency_code'], 'time_zone' => $metadata['time_zone'],
        'account_metadata_context_token' => $metadata['account_metadata_context_token'],
        'account_metadata_context_reused' => $metadata['account_metadata_context_reused'],
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'), 'campaigns' => $campaigns];
}

function hub_google_ads_tracking_url_fields(array $resource): array
{
    return [
        'suffix' => is_string($resource['finalUrlSuffix'] ?? null) ? trim($resource['finalUrlSuffix']) : '',
        'template' => is_string($resource['trackingUrlTemplate'] ?? null) ? trim($resource['trackingUrlTemplate']) : '',
        'urls' => array_values(array_filter(
            is_array($resource['finalUrls'] ?? null) ? $resource['finalUrls'] : [],
            static fn(mixed $url): bool => is_string($url) && trim($url) !== ''
        )),
    ];
}

function hub_google_ads_tracking_campaign_macro(string $value): bool
{
    return preg_match('/utm_campaign\\s*=\\s*(?:%7b)?\\{?campaignid\\}?(?:%7d)?/i', $value) === 1;
}

/** Evaluate the resolved URL fields for one active destination path; never return raw URLs. */
function hub_google_ads_tracking_audit_path(array $chain): array
{
    $suffix = ['label' => '', 'value' => ''];
    $template = ['label' => '', 'value' => ''];
    foreach ($chain as $entry) {
        $fields = $entry['fields'] ?? [];
        if ($suffix['value'] === '' && is_string($fields['suffix'] ?? null) && $fields['suffix'] !== '') {
            $suffix = ['label' => (string)($entry['label'] ?? ''), 'value' => $fields['suffix']];
        }
        if ($template['value'] === '' && is_string($fields['template'] ?? null) && $fields['template'] !== '') {
            $template = ['label' => (string)($entry['label'] ?? ''), 'value' => $fields['template']];
        }
    }
    $urls = [];
    foreach ($chain as $entry) {
        $fields = $entry['fields'] ?? [];
        if (!empty($fields['urls']) && is_array($fields['urls'])) {
            $urls = $fields['urls'];
            break;
        }
    }
    $suffixHasMacro = $suffix['value'] !== '' && hub_google_ads_tracking_campaign_macro($suffix['value']);
    $urlHasMacro = false;
    foreach ($urls as $url) if (hub_google_ads_tracking_campaign_macro((string)$url)) { $urlHasMacro = true; break; }
    $templateHasMacro = $template['value'] !== '' && hub_google_ads_tracking_campaign_macro($template['value']);
    $templateHasLandingUrl = $template['value'] !== '' && preg_match('/\\{(?:lpurl|escapedlpurl|unescapedlpurl|lpurl\\+[0-9]+)\\}/i', $template['value']) === 1;
    $hasData = $suffix['value'] !== '' || $template['value'] !== '' || $urls !== [];
    if ($template['value'] !== '' && !$templateHasLandingUrl) {
        $status = 'review';
    } elseif ($suffixHasMacro || $urlHasMacro) {
        $status = 'tracked';
    } elseif ($templateHasMacro) {
        $status = 'review';
    } else {
        $status = $hasData ? 'missing' : 'review';
    }
    $source = $suffixHasMacro ? $suffix['label'] : ($urlHasMacro ? 'URL final' : ($templateHasMacro ? 'Modelo de acompanhamento' : ''));
    return [
        'status' => $status,
        'source' => $source,
        'has_template' => $template['value'] !== '',
    ];
}

function hub_google_ads_tracking_audit_assert_limit(array $rows): void
{
    if (count($rows) > HUB_GOOGLE_ADS_TRACKING_AUDIT_MAX_ROWS) {
        throw new HubGoogleAdsApiException('tracking_coverage_limit_exceeded', 413);
    }
}

/** Read-only campaign URL audit. It reports configuration evidence only, never click or sale confirmation. */
function hub_google_ads_campaign_tracking_coverage(string $accessToken, ?string $managerId, string $customerId, ?callable $search = null): array
{
    $search ??= static fn(string $query): array => hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    $limit = HUB_GOOGLE_ADS_TRACKING_AUDIT_MAX_ROWS + 1;
    $campaignRows = $search("SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.final_url_suffix, campaign.tracking_url_template, customer.final_url_suffix, customer.tracking_url_template FROM campaign WHERE campaign.status = 'ENABLED' LIMIT 1001");
    if (count($campaignRows) > HUB_GOOGLE_ADS_MAX_CAMPAIGN_ROWS) throw new HubGoogleAdsApiException('configuration_limit_exceeded', 422);
    $campaigns = [];
    foreach ($campaignRows as $row) {
        $campaign = $row['campaign'] ?? [];
        $id = (string)($campaign['id'] ?? '');
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $id) !== 1) throw new HubGoogleAdsApiException('google_ads_request_rejected');
        $campaigns[$id] = [
            'campaign_id' => $id,
            'campaign_name' => (string)($campaign['name'] ?? ''),
            'channel_type' => (string)($campaign['advertisingChannelType'] ?? ''),
            'campaign_fields' => hub_google_ads_tracking_url_fields($campaign),
            'customer_fields' => hub_google_ads_tracking_url_fields($row['customer'] ?? []),
            'groups' => [],
            'campaign_sitelinks' => [],
            'customer_sitelinks' => [],
        ];
    }
    if (!$campaigns) {
        return ['ok' => true, 'schema_version' => 1, 'customer_id' => $customerId,
            'manager_customer_id' => $managerId, 'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'), 'campaigns' => []];
    }

    $adRows = $search("SELECT campaign.id, ad_group.id, ad_group.final_url_suffix, ad_group.tracking_url_template, ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_url_suffix, ad_group_ad.ad.tracking_url_template FROM ad_group_ad WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED' LIMIT $limit");
    hub_google_ads_tracking_audit_assert_limit($adRows);
    foreach ($adRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        $group = $row['adGroup'] ?? [];
        $groupId = (string)($group['id'] ?? '');
        $ad = $row['adGroupAd']['ad'] ?? [];
        $adId = (string)($ad['id'] ?? '');
        if (!isset($campaigns[$campaignId]) || $groupId === '' || $adId === '') continue;
        if (!isset($campaigns[$campaignId]['groups'][$groupId])) {
            $campaigns[$campaignId]['groups'][$groupId] = [
                'fields' => hub_google_ads_tracking_url_fields($group), 'ads' => [], 'criteria' => [], 'sitelinks' => [],
            ];
        }
        $campaigns[$campaignId]['groups'][$groupId]['ads'][] = hub_google_ads_tracking_url_fields($ad);
    }

    $criterionRows = $search("SELECT campaign.id, ad_group.id, ad_group.final_url_suffix, ad_group.tracking_url_template, ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.final_urls, ad_group_criterion.final_url_suffix, ad_group_criterion.tracking_url_template FROM ad_group_criterion WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.negative = FALSE LIMIT $limit");
    hub_google_ads_tracking_audit_assert_limit($criterionRows);
    foreach ($criterionRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        $group = $row['adGroup'] ?? [];
        $groupId = (string)($group['id'] ?? '');
        $criterion = $row['adGroupCriterion'] ?? [];
        if (!isset($campaigns[$campaignId]) || $groupId === '') continue;
        if (!isset($campaigns[$campaignId]['groups'][$groupId])) {
            $campaigns[$campaignId]['groups'][$groupId] = [
                'fields' => hub_google_ads_tracking_url_fields($group), 'ads' => [], 'criteria' => [], 'sitelinks' => [],
            ];
        }
        $campaigns[$campaignId]['groups'][$groupId]['criteria'][] = hub_google_ads_tracking_url_fields($criterion);
    }

    $customerAssetRows = $search("SELECT customer_asset.field_type, asset.type, asset.final_urls, asset.final_url_suffix, asset.tracking_url_template FROM customer_asset WHERE customer_asset.field_type = 'SITELINK' AND customer_asset.status = 'ENABLED' LIMIT $limit");
    hub_google_ads_tracking_audit_assert_limit($customerAssetRows);
    foreach ($customerAssetRows as $row) {
        $campaignAsset = $row['asset'] ?? [];
        $fields = hub_google_ads_tracking_url_fields($campaignAsset);
        foreach ($campaigns as &$campaign) $campaign['customer_sitelinks'][] = $fields;
        unset($campaign);
    }

    $campaignAssetRows = $search("SELECT campaign.id, campaign_asset.field_type, campaign_asset.status, asset.type, asset.final_urls, asset.final_url_suffix, asset.tracking_url_template FROM campaign_asset WHERE campaign.status = 'ENABLED' AND campaign_asset.field_type = 'SITELINK' AND campaign_asset.status = 'ENABLED' LIMIT $limit");
    hub_google_ads_tracking_audit_assert_limit($campaignAssetRows);
    foreach ($campaignAssetRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        $asset = $row['asset'] ?? [];
        if (isset($campaigns[$campaignId])) $campaigns[$campaignId]['campaign_sitelinks'][] = hub_google_ads_tracking_url_fields($asset);
    }

    $groupAssetRows = $search("SELECT campaign.id, ad_group.id, ad_group.final_url_suffix, ad_group.tracking_url_template, ad_group_asset.field_type, ad_group_asset.status, asset.type, asset.final_urls, asset.final_url_suffix, asset.tracking_url_template FROM ad_group_asset WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_asset.field_type = 'SITELINK' AND ad_group_asset.status = 'ENABLED' LIMIT $limit");
    hub_google_ads_tracking_audit_assert_limit($groupAssetRows);
    foreach ($groupAssetRows as $row) {
        $campaignId = (string)($row['campaign']['id'] ?? '');
        $group = $row['adGroup'] ?? [];
        $groupId = (string)($group['id'] ?? '');
        $asset = $row['asset'] ?? [];
        if (!isset($campaigns[$campaignId]) || $groupId === '') continue;
        if (!isset($campaigns[$campaignId]['groups'][$groupId])) {
            $campaigns[$campaignId]['groups'][$groupId] = [
                'fields' => hub_google_ads_tracking_url_fields($group), 'ads' => [], 'criteria' => [], 'sitelinks' => [],
            ];
        }
        $campaigns[$campaignId]['groups'][$groupId]['sitelinks'][] = hub_google_ads_tracking_url_fields($asset);
    }

    $results = [];
    foreach ($campaigns as $campaign) {
        $stats = ['checked' => 0, 'tracked' => 0, 'missing' => 0, 'review' => 0, 'templates' => 0, 'sources' => [], 'overrides' => 0, 'truncated' => false];
        $recordPath = static function (array $result) use (&$stats): void {
            $stats['checked']++;
            if ($result['status'] === 'tracked') {
                $stats['tracked']++;
                if ($result['source'] !== '') $stats['sources'][$result['source']] = true;
            } elseif ($result['status'] === 'missing') $stats['missing']++;
            else $stats['review']++;
            if ($result['has_template']) $stats['templates']++;
        };
        $campaignSource = ['label' => 'Campanha', 'fields' => $campaign['campaign_fields']];
        $customerSource = ['label' => 'Conta', 'fields' => $campaign['customer_fields']];
        foreach ($campaign['groups'] as $group) {
            $groupSource = ['label' => 'Grupo de anúncios', 'fields' => $group['fields']];
            if ($group['fields']['suffix'] !== '' || $group['fields']['template'] !== '') $stats['overrides']++;
            $criteria = $group['criteria'];
            foreach ($group['ads'] as $adFields) {
                if ($adFields['suffix'] !== '' || $adFields['template'] !== '') $stats['overrides']++;
                $adSource = ['label' => 'Anúncio', 'fields' => $adFields];
                if ($criteria) {
                    foreach ($criteria as $criterionFields) {
                        if ($stats['checked'] >= 20000) { $stats['truncated'] = true; break 2; }
                        if ($criterionFields['suffix'] !== '' || $criterionFields['template'] !== '') $stats['overrides']++;
                        $criterionSource = ['label' => 'Critério', 'fields' => $criterionFields];
                        $recordPath(hub_google_ads_tracking_audit_path([$criterionSource, $adSource, $groupSource, $campaignSource, $customerSource]));
                    }
                } else {
                    if ($stats['checked'] >= 20000) { $stats['truncated'] = true; break; }
                    $recordPath(hub_google_ads_tracking_audit_path([$adSource, $groupSource, $campaignSource, $customerSource]));
                }
            }
            foreach ($group['sitelinks'] as $assetFields) {
                if ($stats['checked'] >= 20000) { $stats['truncated'] = true; break 2; }
                if ($assetFields['suffix'] !== '' || $assetFields['template'] !== '') $stats['overrides']++;
                $assetSource = ['label' => 'Sitelink', 'fields' => $assetFields];
                $recordPath(hub_google_ads_tracking_audit_path([$assetSource, $groupSource, $campaignSource, $customerSource]));
            }
        }
        foreach ($campaign['campaign_sitelinks'] as $assetFields) {
            if ($stats['checked'] >= 20000) { $stats['truncated'] = true; break; }
            if ($assetFields['suffix'] !== '' || $assetFields['template'] !== '') $stats['overrides']++;
            $assetSource = ['label' => 'Sitelink', 'fields' => $assetFields];
            $recordPath(hub_google_ads_tracking_audit_path([$assetSource, $campaignSource, $customerSource]));
        }
        foreach ($campaign['customer_sitelinks'] as $assetFields) {
            if ($stats['checked'] >= 20000) { $stats['truncated'] = true; break; }
            if ($assetFields['suffix'] !== '' || $assetFields['template'] !== '') $stats['overrides']++;
            $assetSource = ['label' => 'Sitelink', 'fields' => $assetFields];
            $recordPath(hub_google_ads_tracking_audit_path([$assetSource, $customerSource]));
        }
        $unsupportedChannel = in_array($campaign['channel_type'], ['PERFORMANCE_MAX', 'DEMAND_GEN', 'SMART', 'LOCAL'], true);
        if ($unsupportedChannel || $stats['checked'] === 0 || $stats['truncated']) $status = 'inconclusive';
        elseif ($stats['tracked'] === $stats['checked'] && $stats['review'] === 0 && $stats['missing'] === 0) $status = 'covered';
        elseif ($stats['tracked'] > 0) $status = 'partial';
        elseif ($stats['review'] > 0) $status = 'review';
        else $status = 'missing';
        $detail = match ($status) {
            'covered' => 'O parâmetro foi localizado em todas as rotas avaliadas; a API não confirma clique nem venda recebida pelo Track.',
            'partial' => 'O parâmetro não foi localizado em todas as rotas avaliadas; confira configurações inferiores e URLs finais.',
            'review' => 'Há modelo de acompanhamento ou rota sem dados suficientes para confirmar a chegada do parâmetro à página.',
            'missing' => 'Não foi localizado utm_campaign={campaignid} nas URLs finais efetivas avaliadas.',
            default => $unsupportedChannel
                ? 'Este canal usa rotas dinâmicas ou grupos de recursos não cobertos por esta leitura; a cobertura ficou inconclusiva.'
                : ($stats['truncated'] ? 'A quantidade de rotas excedeu o limite seguro desta leitura; nenhum resultado completo foi afirmado.' : 'Não foram encontradas rotas ativas com URL suficiente para avaliar.'),
        };
        $results[] = [
            'campaign_id' => $campaign['campaign_id'],
            'campaign_name' => $campaign['campaign_name'],
            'channel_type' => $campaign['channel_type'],
            'coverage_status' => $status,
            'coverage_detail' => $detail,
            'checked_paths' => $stats['checked'],
            'tracked_paths' => $stats['tracked'],
            'missing_paths' => $stats['missing'],
            'review_paths' => $stats['review'],
            'tracking_template_paths' => $stats['templates'],
            'override_settings_count' => $stats['overrides'],
            'tracking_sources' => array_values(array_keys($stats['sources'])),
        ];
    }
    return ['ok' => true, 'schema_version' => 1, 'customer_id' => $customerId,
        'manager_customer_id' => $managerId, 'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'), 'campaigns' => $results];
}

function hub_google_ads_validate_campaign_tracking_coverage_request(array $payload): array
{
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    if ($keys !== ['customer_id', 'manager_customer_id', 'operation'] || ($payload['operation'] ?? null) !== 'campaign_tracking_coverage') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
    $managerId = $payload['manager_customer_id'] === null ? null : hub_google_ads_valid_customer_id($payload['manager_customer_id']);
    if ($customerId === null || ($payload['manager_customer_id'] !== null && $managerId === null)) {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    return [$managerId, $customerId];
}

function hub_google_ads_validate_conversion_actions_request(array $payload): array
{
    $keys = array_keys($payload);
    sort($keys, SORT_STRING);
    if ($keys !== ['customer_id', 'manager_customer_id', 'operation'] || ($payload['operation'] ?? null) !== 'conversion_actions') {
        throw new HubGoogleAdsApiException('invalid_payload', 400);
    }
    $managerId = hub_google_ads_valid_customer_id($payload['manager_customer_id']);
    $customerId = hub_google_ads_valid_customer_id($payload['customer_id']);
    if ($managerId === null || $customerId === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
    return [$managerId, $customerId];
}

/** Lists conversion actions visible to the requested customer. This operation never mutates Google Ads. */
function hub_google_ads_conversion_actions(string $accessToken, string $managerId, string $customerId, ?callable $search = null): array
{
    $search ??= static fn(string $query): array => hub_google_ads_search($customerId, $query, $accessToken, $managerId);
    $query = 'SELECT conversion_action.id, conversion_action.resource_name, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category, conversion_action.origin, conversion_action.owner_customer, conversion_action.primary_for_goal, conversion_action.include_in_conversions_metric, conversion_action.value_settings.default_currency_code FROM conversion_action ORDER BY conversion_action.name LIMIT ' . (HUB_GOOGLE_ADS_MAX_CONVERSION_ACTION_ROWS + 1);
    $rows = $search($query);
    if (count($rows) > HUB_GOOGLE_ADS_MAX_CONVERSION_ACTION_ROWS) {
        throw new HubGoogleAdsApiException('conversion_actions_limit_exceeded', 413);
    }

    $actions = [];
    foreach ($rows as $row) {
        $action = $row['conversionAction'] ?? null;
        if (!is_array($action)) throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        $id = $action['id'] ?? null;
        $resourceName = $action['resourceName'] ?? null;
        $status = $action['status'] ?? null;
        if ((!is_string($id) && !is_int($id)) || preg_match('/^[1-9][0-9]{0,19}$/D', (string)$id) !== 1
            || !is_string($resourceName) || preg_match('#^customers/[1-9][0-9]{9}/conversionActions/' . preg_quote((string)$id, '#') . '$#D', $resourceName) !== 1
            || !is_string($status) || $status === '') {
            throw new HubGoogleAdsApiException('google_ads_request_rejected', 502);
        }
        $settings = is_array($action['valueSettings'] ?? null) ? $action['valueSettings'] : [];
        $ownerCustomer = $action['ownerCustomer'] ?? null;
        $actions[] = [
            'id' => (string)$id,
            'resource_name' => $resourceName,
            'name' => is_string($action['name'] ?? null) ? $action['name'] : '',
            // Keep the API status verbatim; HIDDEN and REMOVED are not promoted to active.
            'status' => $status,
            'type' => is_string($action['type'] ?? null) ? $action['type'] : null,
            'category' => is_string($action['category'] ?? null) ? $action['category'] : null,
            'origin' => is_string($action['origin'] ?? null) ? $action['origin'] : null,
            'owner_customer' => is_string($ownerCustomer) ? $ownerCustomer : null,
            'primary_for_goal' => is_bool($action['primaryForGoal'] ?? null) ? $action['primaryForGoal'] : null,
            'include_in_conversions_metric' => is_bool($action['includeInConversionsMetric'] ?? null) ? $action['includeInConversionsMetric'] : null,
            'default_currency_code' => is_string($settings['defaultCurrencyCode'] ?? null) ? $settings['defaultCurrencyCode'] : null,
        ];
    }

    return [
        'ok' => true,
        'schema_version' => 1,
        'manager_customer_id' => $managerId,
        'customer_id' => $customerId,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'action_count' => count($actions),
        'actions' => $actions,
    ];
}

function hub_google_ads_parse_request(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
    if (!is_string($contentType) || preg_match('/^application\/json(?:\s*;|$)/i', trim($contentType)) !== 1) {
        throw new HubGoogleAdsApiException('invalid_payload', 415);
    }
    $length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > HUB_GOOGLE_ADS_MAX_BODY_BYTES) throw new HubGoogleAdsApiException('invalid_payload', 413);
    $body = file_get_contents('php://input', false, null, 0, HUB_GOOGLE_ADS_MAX_BODY_BYTES + 1);
    if (!is_string($body) || strlen($body) > HUB_GOOGLE_ADS_MAX_BODY_BYTES) throw new HubGoogleAdsApiException('invalid_payload', 413);
    $payload = json_decode($body, true);
    if (!is_array($payload) || array_is_list($payload)) throw new HubGoogleAdsApiException('invalid_payload', 400);
    return $payload;
}

function hub_google_ads_dispatch(): never
{
    header('Cache-Control: no-store, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    try {
        $config = hub_google_ads_load_tracking_config();
        $authorization = hub_google_ads_authorize($config);
        if (is_string($authorization['origin'])) {
            header('Access-Control-Allow-Origin: ' . $authorization['origin']);
            header('Vary: Origin');
            header('Access-Control-Allow-Methods: POST, OPTIONS');
            header('Access-Control-Allow-Headers: Authorization, Content-Type');
            header('Access-Control-Max-Age: 300');
        }
        if ($authorization['status'] === 204) { http_response_code(204); exit; }
        if ($authorization['status'] !== 200) {
            hub_google_ads_json($authorization['status'], ['ok' => false, 'error' => $authorization['error']]);
        }
        if (($_SERVER['QUERY_STRING'] ?? '') !== '') hub_google_ads_json(400, ['ok' => false, 'error' => 'invalid_payload']);

        $payload = hub_google_ads_parse_request();
        $operation = $payload['operation'] ?? null;
        if ($operation === 'conversion_actions') {
            [$managerId, $customerId] = hub_google_ads_validate_conversion_actions_request($payload);
            $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_json(200, hub_google_ads_conversion_actions($accessToken, $managerId, $customerId));
        }
        if ($operation === 'campaign_tracking_coverage') {
            [$managerId, $customerId] = hub_google_ads_validate_campaign_tracking_coverage_request($payload);
            $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_json(200, hub_google_ads_campaign_tracking_coverage($accessToken, $managerId, $customerId));
        }
        if ($operation === 'campaign_config' && array_key_exists('manager_customer_id', $payload)) {
            $keys = array_keys($payload);
            sort($keys, SORT_STRING);
            $baseKeys = ['customer_id', 'manager_customer_id', 'operation'];
            $contextKeys = [...$baseKeys, 'account_metadata_context_date'];
            $tokenKeys = [...$contextKeys, 'account_metadata_context_token'];
            sort($baseKeys, SORT_STRING);
            sort($contextKeys, SORT_STRING);
            sort($tokenKeys, SORT_STRING);
            if ($keys !== $baseKeys && $keys !== $contextKeys && $keys !== $tokenKeys) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $contextDate = null;
            if (array_key_exists('account_metadata_context_date', $payload)) {
                $contextDate = is_string($payload['account_metadata_context_date']) ? $payload['account_metadata_context_date'] : null;
                if ($contextDate === null || hub_google_ads_parse_date($contextDate) === null) throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $contextToken = $payload['account_metadata_context_token'] ?? null;
            if (array_key_exists('account_metadata_context_token', $payload)
                && ($contextDate === null || !is_string($contextToken) || strlen($contextToken) > 2048)) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            $customerId = hub_google_ads_valid_customer_id($payload['customer_id'] ?? null);
            $managerId = $payload['manager_customer_id'] === null ? null : hub_google_ads_valid_customer_id($payload['manager_customer_id']);
            if ($customerId === null || ($payload['manager_customer_id'] !== null && $managerId === null)) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $credentials = hub_google_ads_credentials();
            $accessToken = hub_google_ads_access_token($credentials);
            hub_google_ads_json(200, hub_google_ads_campaign_config($accessToken, $managerId, $customerId, null, $contextDate, $contextToken, (string)($credentials['private_key'] ?? '')));
        }
        if ($operation === 'search_term_campaigns') {
            [$managerId, $customerId] = hub_google_ads_validate_search_term_campaigns_request($payload);
            $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
            hub_google_ads_json(200, hub_google_ads_search_term_campaigns($accessToken, $managerId, $customerId));
        }
        if ($operation === 'accounts' && array_keys($payload) === ['operation']) {
            $credentials = hub_google_ads_credentials();
            $accessToken = hub_google_ads_access_token($credentials);
            hub_google_ads_json(200, hub_google_ads_accessible_accounts($accessToken));
        }
        if ($operation === 'report' && count($payload) === 5
            && isset($payload['customer_id'], $payload['date_from'], $payload['date_to'])
            && array_key_exists('manager_customer_id', $payload)) {
            [$managerId, $customerId, $dateFrom, $dateTo] = hub_google_ads_validate_report_request($payload);
            $credentials = hub_google_ads_credentials();
            $accessToken = hub_google_ads_access_token($credentials);
            $report = hub_google_ads_report($accessToken, $managerId, $customerId, $dateFrom, $dateTo);
            hub_google_ads_json(200, $report);
        }
        if ($operation === 'daily_report'
            && isset($payload['customer_id'], $payload['date_from'], $payload['date_to'])
            && array_key_exists('manager_customer_id', $payload)) {
            $keys = array_keys($payload);
            sort($keys, SORT_STRING);
            $baseKeys = ['customer_id', 'date_from', 'date_to', 'manager_customer_id', 'operation'];
            $contextKeys = [...$baseKeys, 'account_metadata_context_date'];
            $tokenKeys = [...$contextKeys, 'account_metadata_context_token'];
            sort($baseKeys, SORT_STRING);
            sort($contextKeys, SORT_STRING);
            sort($tokenKeys, SORT_STRING);
            if ($keys !== $baseKeys && $keys !== $contextKeys && $keys !== $tokenKeys) throw new HubGoogleAdsApiException('invalid_payload', 400);
            $contextDate = null;
            if (array_key_exists('account_metadata_context_date', $payload)) {
                $contextDate = is_string($payload['account_metadata_context_date']) ? $payload['account_metadata_context_date'] : null;
                if ($contextDate === null || hub_google_ads_parse_date($contextDate) === null || $contextDate !== $payload['date_from'] || $contextDate !== $payload['date_to']) {
                    throw new HubGoogleAdsApiException('invalid_payload', 400);
                }
            }
            $contextToken = $payload['account_metadata_context_token'] ?? null;
            if (array_key_exists('account_metadata_context_token', $payload)
                && ($contextDate === null || !is_string($contextToken) || strlen($contextToken) > 2048)) {
                throw new HubGoogleAdsApiException('invalid_payload', 400);
            }
            [$managerId, $customerId, $dateFrom, $dateTo] = hub_google_ads_validate_daily_report_request($payload);
            $credentials = hub_google_ads_credentials();
            $accessToken = hub_google_ads_access_token($credentials);
            $report = hub_google_ads_daily_report($accessToken, $managerId, $customerId, $dateFrom, $dateTo, $contextDate, $contextToken, (string)($credentials['private_key'] ?? ''));
            hub_google_ads_json(200, $report);
        }
        if ($operation === 'geographic_report'
            && isset($payload['customer_id'], $payload['date_from'], $payload['date_to'])
            && array_key_exists('manager_customer_id', $payload)) {
            [$managerId, $customerId, $dateFrom, $dateTo] = hub_google_ads_validate_geographic_report_request($payload);
            $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
            $report = hub_google_ads_geographic_report($accessToken, $managerId, $customerId, $dateFrom, $dateTo);
            hub_google_ads_json(200, $report);
        }
        if ($operation === 'search_terms' && (count($payload) === 5 || count($payload) === 6)
            && isset($payload['customer_id'], $payload['date_from'], $payload['date_to'])
            && array_key_exists('manager_customer_id', $payload)) {
            [$managerId, $customerId, $dateFrom, $dateTo, $campaignId] = hub_google_ads_validate_search_terms_request($payload);
            $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
            $report = hub_google_ads_search_terms($accessToken, $managerId, $customerId, $dateFrom, $dateTo, $campaignId);
            hub_google_ads_json(200, $report);
        }
        if ($operation === 'sao_paulo_day_report') {
            [$managerId, $customerId, $businessDate, $campaignStatusFilter] = hub_google_ads_validate_sao_paulo_day_report_request($payload);
            $accessToken = hub_google_ads_access_token(hub_google_ads_credentials());
            $report = hub_google_ads_sao_paulo_day_report($accessToken, $managerId, $customerId, $businessDate, $campaignStatusFilter);
            hub_google_ads_json(200, $report);
        }
        hub_google_ads_json(400, ['ok' => false, 'error' => 'invalid_payload']);
    } catch (HubGoogleAdsApiException $error) {
        hub_google_ads_json($error->httpStatus, ['ok' => false, 'error' => $error->apiCode]);
    } catch (Throwable $error) {
        error_log('Google Ads read-only API request failed.');
        hub_google_ads_json(500, ['ok' => false, 'error' => 'server_error']);
    }
}
