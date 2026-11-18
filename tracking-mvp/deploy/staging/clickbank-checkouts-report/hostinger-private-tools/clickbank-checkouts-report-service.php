<?php
declare(strict_types=1);

const CLICKBANK_CHECKOUTS_REPORT_BATCH_SIZE = 200;

function clickbank_checkouts_report_count(mixed $value): int
{
    $count = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    if (!is_int($count)) throw new RuntimeException('invalid_checkout_count');
    return $count;
}

function clickbank_checkouts_report_add(int &$total, int $amount): void
{
    if ($amount < 0 || $total > PHP_INT_MAX - $amount) {
        throw new RuntimeException('checkout_count_overflow');
    }
    $total += $amount;
}

function clickbank_checkouts_report_is_extclid(mixed $value): bool
{
    return is_string($value) && $value !== '' && strlen($value) <= 256
        && preg_match('/^[\x21-\x7e]+$/D', $value) === 1;
}

/** Resolve checkout identifiers using the same exact, unique registered-track rule as the email alert. */
function clickbank_checkouts_report_track_matches(PDO $pdo, array $extclids): array
{
    if ($extclids === []) return [];
    $requested = array_fill_keys($extclids, true);
    $matches = [];
    foreach (array_chunk($extclids, CLICKBANK_CHECKOUTS_REPORT_BATCH_SIZE) as $batch) {
        $extclidPlaceholders = [];
        $clickIdPlaceholders = [];
        $parameters = [];
        foreach ($batch as $index => $extclid) {
            $extclidName = ':extclid_' . $index;
            $clickIdName = ':click_id_' . $index;
            $extclidPlaceholders[] = $extclidName;
            $clickIdPlaceholders[] = $clickIdName;
            $parameters[$extclidName] = $extclid;
            $parameters[$clickIdName] = $extclid;
        }
        $extclidIn = implode(',', $extclidPlaceholders);
        $clickIdIn = implode(',', $clickIdPlaceholders);
        $statement = $pdo->prepare(
            "SELECT DISTINCT e.clickbank_extclid, e.click_id, e.product_key, e.presell_host,
                    d.page_host AS allowed_page_host
             FROM tracking_events e
             LEFT JOIN tracking_allowed_domains d
               ON d.page_host = e.presell_host AND d.product_key = e.product_key AND d.platform = 'clickbank'
             WHERE e.event_type = 'outbound_click'
               AND (e.clickbank_extclid IN ({$extclidIn}) OR e.click_id IN ({$clickIdIn}))
               AND e.presell_host IS NOT NULL AND e.presell_host <> ''
               AND e.product_key IS NOT NULL AND e.product_key <> ''"
        );
        $statement->execute($parameters);
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $host = strtolower(trim((string)($row['presell_host'] ?? '')));
            $productKey = trim((string)($row['product_key'] ?? ''));
            if ($host === '' || $productKey === '') continue;
            $pairKey = json_encode([$host, $productKey], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if (!is_string($pairKey)) continue;
            $allowedHost = strtolower(trim((string)($row['allowed_page_host'] ?? '')));
            $pair = [
                'presell_host' => $host,
                'product_key' => $productKey,
                'registered' => $allowedHost !== '' && $allowedHost === $host,
            ];
            foreach (['clickbank_extclid', 'click_id'] as $field) {
                $identifier = $row[$field] ?? null;
                if (!is_string($identifier) || !array_key_exists($identifier, $requested)) continue;
                if (!isset($matches[$identifier][$pairKey]) || $pair['registered']) {
                    $matches[$identifier][$pairKey] = $pair;
                }
            }
        }
    }
    return $matches;
}

/** Return aggregate checkout counts only; no event ID, extclid, buyer, receipt, URL, or click ID leaves the server. */
function clickbank_checkouts_report_fetch(array $config): array
{
    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key]) || $config[$key] === '') {
            throw new RuntimeException('api_not_configured');
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

    $statement = $pdo->query(
        "SELECT extclid, COUNT(*) AS checkout_count
         FROM clickbank_postback_events
         WHERE UPPER(TRIM(event_type)) IN ('ORDER_IMPRESSION', 'ORDER_FORM_IMPRESSION')
         GROUP BY extclid"
    );
    $checkoutsByExtclid = [];
    $unmatchedCount = 0;
    $totalCount = 0;
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $count = clickbank_checkouts_report_count($row['checkout_count'] ?? null);
        clickbank_checkouts_report_add($totalCount, $count);
        $extclid = $row['extclid'] ?? null;
        if (!clickbank_checkouts_report_is_extclid($extclid)) {
            clickbank_checkouts_report_add($unmatchedCount, $count);
            continue;
        }
        if (!isset($checkoutsByExtclid[$extclid])) $checkoutsByExtclid[$extclid] = 0;
        clickbank_checkouts_report_add($checkoutsByExtclid[$extclid], $count);
    }

    $matches = clickbank_checkouts_report_track_matches($pdo, array_keys($checkoutsByExtclid));
    $countsByTrack = [];
    $matchedCount = 0;
    $ambiguousCount = 0;
    foreach ($checkoutsByExtclid as $extclid => $count) {
        $pairs = $matches[$extclid] ?? [];
        if (count($pairs) !== 1) {
            if (count($pairs) > 1) clickbank_checkouts_report_add($ambiguousCount, $count);
            else clickbank_checkouts_report_add($unmatchedCount, $count);
            continue;
        }
        $pair = reset($pairs);
        if (!is_array($pair) || ($pair['registered'] ?? false) !== true) {
            clickbank_checkouts_report_add($unmatchedCount, $count);
            continue;
        }
        $key = json_encode([$pair['presell_host'], $pair['product_key']], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($key)) throw new RuntimeException('invalid_track_key');
        if (!isset($countsByTrack[$key])) {
            $countsByTrack[$key] = [
                'presell_host' => $pair['presell_host'],
                'product_key' => $pair['product_key'],
                'checkout_count' => 0,
            ];
        }
        clickbank_checkouts_report_add($countsByTrack[$key]['checkout_count'], $count);
        clickbank_checkouts_report_add($matchedCount, $count);
    }

    $counts = array_values($countsByTrack);
    usort($counts, static fn(array $left, array $right): int =>
        strcmp($left['presell_host'], $right['presell_host'])
        ?: strcmp($left['product_key'], $right['product_key'])
    );
    if ($matchedCount + $unmatchedCount + $ambiguousCount !== $totalCount) {
        throw new RuntimeException('checkout_totals_inconsistent');
    }
    return [
        'ok' => true,
        'schema_version' => 1,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'total_checkouts' => $totalCount,
        'matched_count' => $matchedCount,
        'unmatched_count' => $unmatchedCount,
        'ambiguous_count' => $ambiguousCount,
        'counts' => $counts,
    ];
}

function clickbank_checkouts_report_dispatch(): never
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
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization');
        header('Access-Control-Max-Age: 300');
    }
    if ($decision['status'] === 204) {
        http_response_code(204);
        exit;
    }
    if ($decision['status'] !== 200) {
        clickbank_ins_v8_api_send_json($decision['status'], ['ok' => false, 'error' => $decision['error']]);
    }
    if ($method !== 'GET') clickbank_ins_v8_api_send_json(405, ['ok' => false, 'error' => 'method_not_allowed']);
    if (($_SERVER['QUERY_STRING'] ?? '') !== '') clickbank_ins_v8_api_send_json(400, ['ok' => false, 'error' => 'query_not_supported']);

    try {
        clickbank_ins_v8_api_send_json(200, clickbank_checkouts_report_fetch($config));
    } catch (Throwable $error) {
        error_log('Tracking Hub ClickBank checkouts report request failed.');
        clickbank_ins_v8_api_send_json(500, ['ok' => false, 'error' => 'server_error']);
    }
}
