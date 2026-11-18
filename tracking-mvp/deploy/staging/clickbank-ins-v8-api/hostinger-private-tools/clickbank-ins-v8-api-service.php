<?php
declare(strict_types=1);

const CLICKBANK_INS_V8_API_MAX_TRANSACTIONS = 5000;
const CLICKBANK_INS_V8_API_PREVIEW_LIMIT = 100;
const CLICKBANK_INS_V8_API_CSV_HEADERS = [
    'Google Click ID',
    'Conversion Name',
    'Conversion Time',
    'Conversion Value',
    'Conversion Currency',
    'Order ID',
];

function clickbank_ins_v8_api_load_config(): array
{
    $configCandidates = [
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tracking-config.php',
        dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'tracking-config.php',
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
    return $config;
}

function clickbank_ins_v8_api_authorize(string $method, ?string $origin, ?string $authorization, array $config): array
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

    $expectedToken = $config['tracking_hub_api_token'] ?? null;
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

function clickbank_ins_v8_api_mask_identifier(?string $value): string
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

function clickbank_ins_v8_api_decimal(?string $value): ?string
{
    if ($value === null || trim($value) === '') {
        return null;
    }
    $value = trim($value);
    if (preg_match('/^(\d{1,10})(?:\.(\d{1,4}))?$/D', $value, $matches) !== 1) {
        return null;
    }
    return $matches[1] . '.' . str_pad($matches[2] ?? '', 4, '0');
}

function clickbank_ins_v8_api_conversion_time(?string $value): ?string
{
    if (!is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/D', $value) !== 1) {
        return null;
    }
    try {
        $date = new DateTimeImmutable($value, new DateTimeZone('UTC'));
    } catch (Throwable $error) {
        return null;
    }
    return $date->format('Y-m-d H:i:s') . '+0000';
}

/** Return one stable, non-sensitive reason for a transaction that cannot enter the CSV. */
function clickbank_ins_v8_api_ineligibility(array $transaction): ?string
{
    if ((int)($transaction['is_test'] ?? 0) === 1) {
        return 'test_transaction';
    }
    if (strtolower(trim((string)($transaction['source'] ?? ''))) !== 'clickbank_ins_v8') {
        return 'wrong_source';
    }
    if (strtoupper(trim((string)($transaction['role'] ?? ''))) !== 'AFFILIATE') {
        return 'not_affiliate';
    }
    if (strtoupper(trim((string)($transaction['transaction_type'] ?? ''))) !== 'SALE') {
        return 'not_sale';
    }
    if (trim((string)($transaction['receipt_id'] ?? '')) === '') {
        return 'missing_order_identifier';
    }
    if (clickbank_ins_v8_api_conversion_time($transaction['transaction_time_utc'] ?? null) === null) {
        return 'invalid_or_missing_time';
    }
    if (clickbank_ins_v8_api_decimal(isset($transaction['commission_total']) ? (string)$transaction['commission_total'] : null) === null) {
        return 'missing_or_invalid_commission';
    }
    $currency = strtoupper(trim((string)($transaction['commission_currency'] ?? '')));
    if (preg_match('/^[A-Z]{3}$/D', $currency) !== 1) {
        return 'missing_or_invalid_currency';
    }
    if ($currency !== 'USD') {
        return 'unsupported_currency';
    }

    $gclid = trim((string)($transaction['gclid'] ?? ''));
    $gclidSource = strtolower(trim((string)($transaction['gclid_source'] ?? 'unresolved')));
    if ($gclidSource === 'conflict') {
        return 'attribution_conflict';
    }
    if ($gclid === '') {
        return 'missing_gclid';
    }
    if (preg_match('/^(?:TEST|FAKE|DUMMY)(?:[-_]|$)/i', $gclid) === 1) {
        return 'synthetic_gclid';
    }
    if (!in_array($gclidSource, ['explicit', 'extclid_join'], true)) {
        return 'unresolved_gclid';
    }

    $reconciliation = strtolower(trim((string)($transaction['commission_reconciliation_status'] ?? '')));
    if ($reconciliation === 'mismatch') {
        return 'commission_mismatch';
    }
    if (!in_array($reconciliation, ['matched', 'unavailable'], true)) {
        return 'commission_reconciliation_pending';
    }
    return null;
}

function clickbank_ins_v8_api_line_items(PDO $pdo, array $transactions): array
{
    if ($transactions === []) {
        return [];
    }
    $ids = array_map(static fn(array $row): int => (int)$row['id'], $transactions);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $statement = $pdo->prepare(
        'SELECT transaction_id, line_index, product_item_no, product_title, line_item_type,
                quantity, commission_amount, product_price, product_discount
         FROM clickbank_ins_v8_line_items
         WHERE transaction_id IN (' . $placeholders . ')
         ORDER BY transaction_id DESC, line_index ASC'
    );
    $statement->execute($ids);
    $itemsByTransaction = [];
    foreach ($statement->fetchAll() as $item) {
        $itemsByTransaction[(string)$item['transaction_id']][] = $item;
    }
    return $itemsByTransaction;
}

/** Read only. The endpoint never writes to the receiver tables or legacy tracking tables. */
function clickbank_ins_v8_api_fetch_transactions(array $config): array
{
    $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    $statement = $pdo->query(
        'SELECT id, source, role, transaction_type, receipt_id, transaction_time_utc, customer_country,
                commission_total, sale_gross_total, commission_currency, upsell_original_receipt,
                gclid, gclid_source, commission_reconciliation_status, is_test, received_at_utc
         FROM clickbank_ins_v8_transactions
         WHERE source = \'clickbank_ins_v8\'
         ORDER BY id DESC
         LIMIT ' . (CLICKBANK_INS_V8_API_MAX_TRANSACTIONS + 1)
    );
    $transactions = $statement->fetchAll();
    if (count($transactions) > CLICKBANK_INS_V8_API_MAX_TRANSACTIONS) {
        throw new RuntimeException('transaction_limit_exceeded');
    }
    $itemsByTransaction = clickbank_ins_v8_api_line_items($pdo, $transactions);
    foreach ($transactions as &$transaction) {
        $transaction['line_items'] = $itemsByTransaction[(string)$transaction['id']] ?? [];
    }
    unset($transaction);
    return $transactions;
}

/** Return only a valid two-letter country code from the optional database field. */
function clickbank_ins_v8_api_country_code($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $country = strtoupper(trim($value));
    return preg_match('/^[A-Z]{2}$/D', $country) === 1 ? $country : null;
}

function clickbank_ins_v8_api_money_units(string $amount): int
{
    [$whole, $fraction] = explode('.', clickbank_ins_v8_api_decimal($amount), 2);
    return ((int)$whole * 10000) + (int)$fraction;
}

function clickbank_ins_v8_api_format_units(int $units): string
{
    return intdiv($units, 10000) . '.' . str_pad((string)($units % 10000), 4, '0', STR_PAD_LEFT);
}

/** Pure report/export projection; safe for synthetic unit-test fixtures. */
function clickbank_ins_v8_api_analyze_transactions(array $transactions, ?string $conversionName): array
{
    $evaluations = [];
    $receiptCounts = [];
    foreach ($transactions as $index => $transaction) {
        $reason = clickbank_ins_v8_api_ineligibility($transaction);
        $receipt = strtolower(trim((string)($transaction['receipt_id'] ?? '')));
        if ($reason === null && $receipt !== '') {
            $receiptCounts[$receipt] = ($receiptCounts[$receipt] ?? 0) + 1;
        }
        $evaluations[$index] = ['reason' => $reason, 'receipt' => $receipt];
    }
    foreach ($evaluations as &$evaluation) {
        if ($evaluation['reason'] === null && ($receiptCounts[$evaluation['receipt']] ?? 0) > 1) {
            $evaluation['reason'] = 'duplicate_receipt';
        }
    }
    unset($evaluation);

    $eligibleRows = [];
    $skippedByReason = [];
    $valueUnitsByCurrency = [];
    $saleCount = 0;
    $testCount = 0;
    foreach ($transactions as $index => $transaction) {
        $role = strtoupper(trim((string)($transaction['role'] ?? '')));
        $type = strtoupper(trim((string)($transaction['transaction_type'] ?? '')));
        $isTest = (int)($transaction['is_test'] ?? 0) === 1;
        if ($isTest) {
            $testCount++;
        }
        if (!$isTest && $role === 'AFFILIATE' && $type === 'SALE') {
            $saleCount++;
        }

        $reason = $evaluations[$index]['reason'];
        if ($reason !== null) {
            $skippedByReason[$reason] = ($skippedByReason[$reason] ?? 0) + 1;
            continue;
        }

        $commission = clickbank_ins_v8_api_decimal((string)$transaction['commission_total']);
        $currency = strtoupper(trim((string)$transaction['commission_currency']));
        $time = clickbank_ins_v8_api_conversion_time((string)$transaction['transaction_time_utc']);
        $receipt = trim((string)$transaction['receipt_id']);
        $gclid = trim((string)$transaction['gclid']);
        $eligibleRows[] = [
            'Google Click ID' => $gclid,
            'Conversion Name' => $conversionName ?? '',
            'Conversion Time' => $time,
            'Conversion Value' => $commission,
            'Conversion Currency' => $currency,
            'Order ID' => $receipt,
        ];
        $valueUnitsByCurrency[$currency] = ($valueUnitsByCurrency[$currency] ?? 0) + clickbank_ins_v8_api_money_units($commission);
    }

    ksort($valueUnitsByCurrency);
    $valueByCurrency = [];
    foreach ($valueUnitsByCurrency as $currency => $units) {
        $valueByCurrency[$currency] = clickbank_ins_v8_api_format_units($units);
    }

    $preview = [];
    foreach (array_slice($transactions, 0, CLICKBANK_INS_V8_API_PREVIEW_LIMIT) as $index => $transaction) {
        $itemRows = [];
        foreach (($transaction['line_items'] ?? []) as $item) {
            $itemRows[] = [
                'item_no' => (string)($item['product_item_no'] ?? ''),
                'title' => (string)($item['product_title'] ?? ''),
                'type' => (string)($item['line_item_type'] ?? ''),
                'quantity' => $item['quantity'] === null ? null : (string)$item['quantity'],
                'commission_amount' => clickbank_ins_v8_api_decimal($item['commission_amount'] === null ? null : (string)$item['commission_amount']),
                'product_price' => clickbank_ins_v8_api_decimal($item['product_price'] === null ? null : (string)$item['product_price']),
                'product_discount' => clickbank_ins_v8_api_decimal($item['product_discount'] === null ? null : (string)$item['product_discount']),
            ];
        }
        $preview[] = [
            'transaction_time_utc' => clickbank_ins_v8_api_conversion_time($transaction['transaction_time_utc'] ?? null),
            'customer_country' => clickbank_ins_v8_api_country_code($transaction['customer_country'] ?? null),
            'transaction_type' => (string)($transaction['transaction_type'] ?? ''),
            'role' => (string)($transaction['role'] ?? ''),
            'is_test' => (int)($transaction['is_test'] ?? 0) === 1,
            'conversion_name' => (strtoupper(trim((string)($transaction['role'] ?? ''))) === 'AFFILIATE'
                && strtoupper(trim((string)($transaction['transaction_type'] ?? ''))) === 'SALE'
                && (int)($transaction['is_test'] ?? 0) !== 1)
                    ? $conversionName
                    : null,
            'commission_total' => clickbank_ins_v8_api_decimal(isset($transaction['commission_total']) ? (string)$transaction['commission_total'] : null),
            'sale_gross_total' => clickbank_ins_v8_api_decimal(isset($transaction['sale_gross_total']) ? (string)$transaction['sale_gross_total'] : null),
            'commission_currency' => (string)($transaction['commission_currency'] ?? ''),
            'receipt_id_masked' => clickbank_ins_v8_api_mask_identifier(isset($transaction['receipt_id']) ? (string)$transaction['receipt_id'] : null),
            'gclid_masked' => clickbank_ins_v8_api_mask_identifier(isset($transaction['gclid']) ? (string)$transaction['gclid'] : null),
            'gclid_source' => (string)($transaction['gclid_source'] ?? 'unresolved'),
            'commission_reconciliation_status' => (string)($transaction['commission_reconciliation_status'] ?? 'pending'),
            'eligible' => $evaluations[$index]['reason'] === null,
            'ineligibility_reason' => $evaluations[$index]['reason'],
            'line_items' => $itemRows,
        ];
    }

    $candidateCount = count($transactions);
    $eligibleCount = count($eligibleRows);
    return [
        'report' => [
            'ok' => true,
            'schema_version' => 1,
            'source' => 'clickbank_ins_v8',
            'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'conversion_name' => $conversionName,
            'candidate_count' => $candidateCount,
            'test_count' => $testCount,
            'sale_count' => $saleCount,
            'eligible_count' => $eligibleCount,
            'ignored_count' => $candidateCount - $eligibleCount,
            'skipped_by_reason' => $skippedByReason === [] ? new stdClass() : $skippedByReason,
            'value_by_currency' => $valueByCurrency === [] ? new stdClass() : $valueByCurrency,
            'product_scope' => 'all_clickbank_products',
            'product_breakdown_available' => true,
            'preview' => $preview,
            'download_available' => $eligibleCount > 0,
        ],
        'rows' => $eligibleRows,
    ];
}

function clickbank_ins_v8_api_csv_string(array $rows): string
{
    $stream = fopen('php://temp', 'w+');
    if ($stream === false) {
        throw new RuntimeException('csv_unavailable');
    }
    try {
        if (fputcsv($stream, CLICKBANK_INS_V8_API_CSV_HEADERS, ',', '"', '') === false) {
            throw new RuntimeException('csv_unavailable');
        }
        foreach ($rows as $row) {
            $values = [];
            foreach (CLICKBANK_INS_V8_API_CSV_HEADERS as $header) {
                $values[] = $row[$header];
            }
            if (fputcsv($stream, $values, ',', '"', '') === false) {
                throw new RuntimeException('csv_unavailable');
            }
        }
        rewind($stream);
        $csv = stream_get_contents($stream);
        if (!is_string($csv)) {
            throw new RuntimeException('csv_unavailable');
        }
        return $csv;
    } finally {
        fclose($stream);
    }
}

function clickbank_ins_v8_api_authorization_header(): ?string
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

function clickbank_ins_v8_api_send_json(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function clickbank_ins_v8_api_normalize_conversion_name(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $name = trim($value);
    if ($name === '' || strlen($name) > 255 || preg_match('//u', $name) !== 1
        || preg_match('/[\x00-\x1f\x7f]/', $name) === 1) {
        return null;
    }
    return $name;
}

function clickbank_ins_v8_api_conversion_name_for_request(
    string $endpoint,
    string $method,
    array $config,
    ?string $contentType = null,
    ?string $rawBody = null
): ?string {
    if ($endpoint === 'report') {
        return null;
    }
    if ($endpoint !== 'csv') {
        throw new RuntimeException('not_found');
    }

    if (strtoupper($method) === 'GET') {
        $legacy = clickbank_ins_v8_api_normalize_conversion_name($config['tracking_hub_conversion_name'] ?? null);
        if ($legacy === null) {
            throw new RuntimeException('conversion_action_not_configured');
        }
        return $legacy;
    }
    if (strtoupper($method) !== 'POST') {
        throw new RuntimeException('method_not_allowed');
    }
    if (!is_string($contentType) || preg_match('/^application\/json(?:\s*;|$)/i', trim($contentType)) !== 1) {
        throw new RuntimeException('unsupported_content_type');
    }
    $body = $rawBody ?? file_get_contents('php://input', false, null, 0, 4097);
    if (!is_string($body) || strlen($body) > 4096) {
        throw new RuntimeException('payload_too_large');
    }
    $payload = json_decode($body, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($payload)
        || array_is_list($payload) || array_keys($payload) !== ['conversion_name']) {
        throw new RuntimeException('invalid_payload');
    }
    $conversionName = clickbank_ins_v8_api_normalize_conversion_name($payload['conversion_name']);
    if ($conversionName === null) {
        throw new RuntimeException('invalid_conversion_name');
    }
    return $conversionName;
}

function clickbank_ins_v8_api_dispatch(string $endpoint): never
{
    header('Cache-Control: no-store, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');

    try {
        $config = clickbank_ins_v8_api_load_config();
    } catch (Throwable $error) {
        clickbank_ins_v8_api_send_json(503, ['ok' => false, 'error' => 'api_not_configured']);
    }

    if (!in_array($endpoint, ['report', 'csv'], true)) {
        clickbank_ins_v8_api_send_json(404, ['ok' => false, 'error' => 'not_found']);
    }

    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $decision = clickbank_ins_v8_api_authorize(
        $method,
        is_string($origin) ? $origin : null,
        clickbank_ins_v8_api_authorization_header(),
        $config
    );
    if (is_string($decision['allow_origin'])) {
        header('Access-Control-Allow-Origin: ' . $decision['allow_origin']);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: ' . ($endpoint === 'csv' ? 'GET, POST, OPTIONS' : 'GET, OPTIONS'));
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Max-Age: 300');
    }
    if ($decision['status'] === 204) {
        http_response_code(204);
        exit;
    }
    if ($decision['status'] !== 200) {
        clickbank_ins_v8_api_send_json($decision['status'], ['ok' => false, 'error' => $decision['error']]);
    }
    if (($endpoint === 'report' && $method !== 'GET')
        || ($endpoint === 'csv' && !in_array($method, ['GET', 'POST'], true))) {
        clickbank_ins_v8_api_send_json(405, ['ok' => false, 'error' => 'method_not_allowed']);
    }
    if (($_SERVER['QUERY_STRING'] ?? '') !== '') {
        clickbank_ins_v8_api_send_json(400, ['ok' => false, 'error' => 'query_not_supported']);
    }
    try {
        $conversionName = clickbank_ins_v8_api_conversion_name_for_request(
            $endpoint,
            $method,
            $config,
            $_SERVER['CONTENT_TYPE'] ?? null
        );
    } catch (Throwable $error) {
        $code = $error->getMessage();
        $status = match ($code) {
            'conversion_action_not_configured' => 503,
            'unsupported_content_type' => 415,
            'payload_too_large' => 413,
            'method_not_allowed' => 405,
            'invalid_payload', 'invalid_conversion_name' => 400,
            default => 400,
        };
        clickbank_ins_v8_api_send_json($status, ['ok' => false, 'error' => $code]);
    }
    try {
        $transactions = clickbank_ins_v8_api_fetch_transactions($config);
        $result = clickbank_ins_v8_api_analyze_transactions($transactions, $conversionName);
        if ($endpoint === 'report') {
            clickbank_ins_v8_api_send_json(200, $result['report']);
        }
        if ($result['rows'] === []) {
            clickbank_ins_v8_api_send_json(409, ['ok' => false, 'error' => 'no_eligible_conversions']);
        }
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="clickbank-ins-v8-google-ads.csv"');
        echo clickbank_ins_v8_api_csv_string($result['rows']);
        exit;
    } catch (Throwable $error) {
        if ($error->getMessage() === 'transaction_limit_exceeded') {
            clickbank_ins_v8_api_send_json(409, ['ok' => false, 'error' => 'transaction_limit_exceeded']);
        }
        error_log('Tracking Hub INS v8 API request failed.');
        clickbank_ins_v8_api_send_json(500, ['ok' => false, 'error' => 'server_error']);
    }
}
