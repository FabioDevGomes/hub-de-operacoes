<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-export-service.php';

/** Pure request check; token is accepted only from an Authorization header. */
function google_ads_api_authorize(string $method, ?string $origin, ?string $authorization, array $config): array
{
    $allowedOrigins = $config['tracking_hub_allowed_origins'] ?? null;
    if (!is_array($allowedOrigins) || !is_string($origin) || $origin === '' || !in_array($origin, $allowedOrigins, true)) {
        return ['status' => 403, 'error' => 'origin_not_allowed', 'allow_origin' => null];
    }

    $method = strtoupper($method);
    if ($method === 'OPTIONS') {
        return ['status' => 204, 'error' => null, 'allow_origin' => $origin];
    }
    if ($method !== 'GET') {
        return ['status' => 405, 'error' => 'method_not_allowed', 'allow_origin' => $origin];
    }

    $expectedToken = $config['tracking_hub_api_token'] ?? null;
    if (!is_string($expectedToken) || preg_match('/^[a-f0-9]{64}$/i', $expectedToken) !== 1) {
        return ['status' => 503, 'error' => 'api_not_configured', 'allow_origin' => $origin];
    }
    if (!is_string($authorization) || preg_match('/^Bearer ([a-f0-9]{64})$/i', $authorization, $matches) !== 1
        || !hash_equals($expectedToken, $matches[1])) {
        return ['status' => 401, 'error' => 'not_authorized', 'allow_origin' => $origin];
    }
    return ['status' => 200, 'error' => null, 'allow_origin' => $origin];
}

function google_ads_api_mask_identifier(?string $value): string
{
    $value = trim((string)$value);
    if ($value === '') {
        return '—';
    }
    if (strlen($value) <= 8) {
        return '••••';
    }
    return substr($value, 0, 4) . '…' . substr($value, -4);
}

/** JSON-safe read model. Full GCLID, click IDs, and raw postbacks stay server-side. */
function google_ads_api_build_report(array $export, string $conversionName, int $previewLimit = 100): array
{
    $valueCentsByCurrency = [];
    foreach ($export['rows'] as $row) {
        $currency = $row['Conversion Currency'];
        [$whole, $fraction] = explode('.', $row['Conversion Value'], 2);
        $cents = ((int)$whole * 100) + (int)str_pad($fraction, 2, '0');
        $valueCentsByCurrency[$currency] = ($valueCentsByCurrency[$currency] ?? 0) + $cents;
    }
    ksort($valueCentsByCurrency);
    $valueByCurrency = [];
    foreach ($valueCentsByCurrency as $currency => $cents) {
        $valueByCurrency[$currency] = intdiv($cents, 100) . '.' . str_pad((string)($cents % 100), 2, '0', STR_PAD_LEFT);
    }

    $preview = [];
    foreach (array_slice($export['rows'], 0, max(0, min(100, $previewLimit))) as $row) {
        $preview[] = [
            'conversion_time' => $row['Conversion Time'],
            'conversion_name' => $row['Conversion Name'],
            'conversion_value' => $row['Conversion Value'],
            'conversion_currency' => $row['Conversion Currency'],
            'google_click_id_masked' => google_ads_api_mask_identifier($row['Google Click ID']),
            'order_id_masked' => google_ads_api_mask_identifier($row['Order ID']),
        ];
    }

    $eligibleCount = count($export['rows']);
    return [
        'ok' => true,
        'schema_version' => 1,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'window_days' => 90,
        'product_scope' => 'all_tracked_products',
        'product_breakdown_available' => false,
        'conversion_name' => $conversionName,
        'candidate_count' => (int)$export['candidate_count'],
        'eligible_count' => $eligibleCount,
        'ignored_count' => max(0, (int)$export['candidate_count'] - $eligibleCount),
        'skipped_by_reason' => $export['skipped'],
        // Keep the API contract as a JSON object even when there are no eligible rows.
        // An empty PHP array would be encoded as [] and rejected by the Hub as a list.
        'value_by_currency' => $valueByCurrency === [] ? new stdClass() : $valueByCurrency,
        'preview' => $preview,
        'download_available' => $eligibleCount > 0,
    ];
}

function google_ads_api_csv_string(array $rows): string
{
    $stream = fopen('php://temp', 'w+');
    if ($stream === false) {
        throw new RuntimeException('Could not prepare CSV output.');
    }
    try {
        if (fputcsv($stream, GOOGLE_ADS_UPLOAD_HEADERS, ',', '"', '') === false) {
            throw new RuntimeException('Could not write CSV header.');
        }
        foreach ($rows as $row) {
            $values = [];
            foreach (GOOGLE_ADS_UPLOAD_HEADERS as $header) {
                $values[] = $row[$header];
            }
            if (fputcsv($stream, $values, ',', '"', '') === false) {
                throw new RuntimeException('Could not write CSV row.');
            }
        }
        rewind($stream);
        $csv = stream_get_contents($stream);
        if (!is_string($csv)) {
            throw new RuntimeException('Could not read prepared CSV output.');
        }
        return $csv;
    } finally {
        fclose($stream);
    }
}

function google_ads_api_authorization_header(): ?string
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

function google_ads_api_send_json(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function google_ads_api_dispatch(string $endpoint): never
{
    header('Cache-Control: no-store, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');

    try {
        $config = google_ads_load_tracking_config();
    } catch (Throwable $error) {
        google_ads_api_send_json(503, ['ok' => false, 'error' => 'api_not_configured']);
    }

    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    $decision = google_ads_api_authorize(
        (string)($_SERVER['REQUEST_METHOD'] ?? 'GET'),
        is_string($origin) ? $origin : null,
        google_ads_api_authorization_header(),
        $config
    );
    if (is_string($decision['allow_origin'])) {
        header('Access-Control-Allow-Origin: ' . $decision['allow_origin']);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Max-Age: 300');
    }
    if ($decision['status'] === 204) {
        http_response_code(204);
        exit;
    }
    if ($decision['status'] !== 200) {
        google_ads_api_send_json($decision['status'], ['ok' => false, 'error' => $decision['error']]);
    }

    if (($_SERVER['QUERY_STRING'] ?? '') !== '') {
        google_ads_api_send_json(400, ['ok' => false, 'error' => 'query_not_supported']);
    }
    if (!in_array($endpoint, ['report', 'csv'], true)) {
        google_ads_api_send_json(404, ['ok' => false, 'error' => 'not_found']);
    }

    $conversionName = $config['tracking_hub_conversion_name'] ?? null;
    if (!is_string($conversionName) || trim($conversionName) === '' || strlen($conversionName) > 255) {
        google_ads_api_send_json(503, ['ok' => false, 'error' => 'conversion_action_not_configured']);
    }

    try {
        $export = google_ads_collect_export($config, trim($conversionName));
        if ($endpoint === 'report') {
            google_ads_api_send_json(200, google_ads_api_build_report($export, trim($conversionName)));
        }
        if ($export['rows'] === []) {
            google_ads_api_send_json(409, ['ok' => false, 'error' => 'no_eligible_conversions']);
        }
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="clickbank-google-ads.csv"');
        header('X-Content-Type-Options: nosniff');
        echo google_ads_api_csv_string($export['rows']);
        exit;
    } catch (Throwable $error) {
        // Keep SQL details, file paths, and identifiers out of HTTP responses and logs.
        error_log('Tracking Hub API request failed.');
        google_ads_api_send_json(500, ['ok' => false, 'error' => 'server_error']);
    }
}
