<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-api-service.php';

const CLICKBANK_INS_V8_SALES_PAGE_SIZE = 200;

function clickbank_ins_v8_sales_api_decimal_id(mixed $value): ?string
{
    if (!is_string($value) || preg_match('/^(?:0|[1-9][0-9]{0,19})$/D', $value) !== 1
        || clickbank_ins_v8_sales_api_compare_decimal_ids($value, '18446744073709551615') > 0) {
        return null;
    }
    return $value;
}

function clickbank_ins_v8_sales_api_compare_decimal_ids(string $left, string $right): int
{
    $left = ltrim($left, '0') ?: '0';
    $right = ltrim($right, '0') ?: '0';
    if (strlen($left) !== strlen($right)) return strlen($left) <=> strlen($right);
    return strcmp($left, $right) <=> 0;
}

function clickbank_ins_v8_sales_api_parse_request(?string $contentType, ?string $rawBody = null): array
{
    if (!is_string($contentType) || preg_match('/^application\/json(?:\s*;|$)/i', trim($contentType)) !== 1) {
        throw new RuntimeException('unsupported_content_type');
    }
    $body = $rawBody ?? file_get_contents('php://input', false, null, 0, 2049);
    if (!is_string($body) || strlen($body) > 2048) throw new RuntimeException('payload_too_large');
    $payload = json_decode($body, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($payload) || array_is_list($payload)
        || array_keys($payload) !== ['after_id', 'snapshot_max_id']) {
        throw new RuntimeException('invalid_payload');
    }
    $afterId = clickbank_ins_v8_sales_api_decimal_id($payload['after_id']);
    $snapshotMaxId = $payload['snapshot_max_id'] === null
        ? null
        : clickbank_ins_v8_sales_api_decimal_id($payload['snapshot_max_id']);
    if ($afterId === null || ($payload['snapshot_max_id'] !== null && $snapshotMaxId === null)) {
        throw new RuntimeException('invalid_payload');
    }
    if ($snapshotMaxId !== null && clickbank_ins_v8_sales_api_compare_decimal_ids($afterId, $snapshotMaxId) > 0) {
        throw new RuntimeException('invalid_payload');
    }
    return ['after_id' => $afterId, 'snapshot_max_id' => $snapshotMaxId];
}

function clickbank_ins_v8_sales_api_is_uuid(string $value): bool
{
    return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iD', $value) === 1;
}

/** Pure and privacy-reduced Track and campaign-candidate projection. */
function clickbank_ins_v8_sales_api_attribute_transactions(array $transactions, array $clickRows): array
{
    $lookups = [];
    $legacyLookups = [];
    foreach ($transactions as $transaction) {
        $extclid = $transaction['extclid'] ?? null;
        if (!is_string($extclid) || $extclid === '' || strlen($extclid) > 256 || preg_match('/^[\x21-\x7e]+$/D', $extclid) !== 1) continue;
        $lookups[$extclid] = [];
        if (clickbank_ins_v8_sales_api_is_uuid($extclid)) $legacyLookups[$extclid] = [];
    }

    foreach ($clickRows as $click) {
        if (($click['event_type'] ?? null) !== 'outbound_click') continue;
        $canonicalExtclid = $click['clickbank_extclid'] ?? null;
        if (is_string($canonicalExtclid) && array_key_exists($canonicalExtclid, $lookups)) {
            $lookups[$canonicalExtclid][] = $click;
        }
        $legacyClickId = $click['click_id'] ?? null;
        if (is_string($legacyClickId) && array_key_exists($legacyClickId, $legacyLookups)) {
            $legacyLookups[$legacyClickId][] = $click;
        }
    }

    $attributed = [];
    foreach ($transactions as $transaction) {
        $extclid = $transaction['extclid'] ?? null;
        $matchedClicks = is_string($extclid) ? ($lookups[$extclid] ?? []) : [];
        if (is_string($extclid) && isset($legacyLookups[$extclid])) {
            $matchedClicks = [...$matchedClicks, ...$legacyLookups[$extclid]];
        }
        $pairs = [];
        foreach ($matchedClicks as $click) {
            $host = $click['presell_host'] ?? null;
            $productKey = $click['product_key'] ?? null;
            if (!is_string($host) || $host === '' || !is_string($productKey) || $productKey === '') continue;
            $pairKey = $host . "\0" . $productKey;
            $pairs[$pairKey] = ['presell_host' => $host, 'product_key' => $productKey];
        }
        $clickLinkStatus = clickbank_ins_v8_sales_api_click_link_status($extclid, $matchedClicks, count($pairs));
        $campaignCandidate = clickbank_ins_v8_sales_api_campaign_candidate($matchedClicks);
        $sale = [
            'transaction_id' => (string)$transaction['id'],
            'transaction_time_utc' => $transaction['transaction_time_utc'] ?? null,
            'received_at_utc' => $transaction['received_at_utc'] ?? null,
            'commission_total' => $transaction['commission_total'] ?? null,
            'commission_currency' => $transaction['commission_currency'] ?? null,
            'click_link_diagnostic' => ['status' => $clickLinkStatus],
            'click_campaign_candidate' => $campaignCandidate,
        ];
        if (count($pairs) === 1) {
            $pair = reset($pairs);
            $attributed[] = [...$sale, 'attribution_status' => 'matched', 'presell_host' => $pair['presell_host'], 'product_key' => $pair['product_key']];
        } else {
            $attributed[] = [...$sale, 'attribution_status' => count($pairs) > 1 ? 'ambiguous' : 'unmatched', 'presell_host' => null, 'product_key' => null];
        }
    }
    return $attributed;
}

/** Report only the join outcome; never return the click identifier or buyer data. */
function clickbank_ins_v8_sales_api_click_link_status(mixed $extclid, array $matchedClicks, int $trackPairCount): string
{
    if ($extclid === null || $extclid === '') return 'extclid_missing';
    if (!is_string($extclid) || strlen($extclid) > 256 || preg_match('/^[\x21-\x7e]+$/D', $extclid) !== 1) return 'extclid_unusable';
    if ($matchedClicks === []) return 'exact_click_not_found';
    if ($trackPairCount === 0) return 'click_missing_track_metadata';
    if ($trackPairCount > 1) return 'click_matches_multiple_tracks';
    return 'track_matched';
}

/** The candidate is evidence from the exact outbound-click join, not a resolved campaign identity. */
function clickbank_ins_v8_sales_api_campaign_candidate(array $clicks): array
{
    if ($clicks === []) return ['status' => 'click_not_found', 'source' => null, 'campaign_id' => null];
    $ids = [];
    $missing = false;
    $invalid = false;
    foreach ($clicks as $click) {
        $value = $click['utm_campaign'] ?? null;
        if ($value === null || $value === '') { $missing = true; continue; }
        $value = is_string($value) ? trim($value) : (is_int($value) ? (string)$value : '');
        if (preg_match('/^[1-9][0-9]{0,19}$/D', $value) !== 1) { $invalid = true; continue; }
        $ids[$value] = $value;
    }
    if (count($ids) > 1) return ['status' => 'campaign_ambiguous', 'source' => null, 'campaign_id' => null];
    if ($ids !== [] && ($missing || $invalid)) return ['status' => 'source_conflict', 'source' => null, 'campaign_id' => null];
    if ($ids !== []) return ['status' => 'candidate', 'source' => 'utm_campaign_campaignid', 'campaign_id' => reset($ids)];
    if ($invalid && $missing) return ['status' => 'source_conflict', 'source' => null, 'campaign_id' => null];
    if ($invalid) return ['status' => 'campaign_id_invalid', 'source' => null, 'campaign_id' => null];
    return ['status' => 'campaign_id_missing', 'source' => null, 'campaign_id' => null];
}

function clickbank_ins_v8_sales_api_format_time(mixed $value): ?string
{
    if (!is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/D', $value) !== 1) return null;
    try {
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    } catch (Throwable $error) {
        return null;
    }
}

function clickbank_ins_v8_sales_api_sale_query(): string
{
    return "SELECT id, transaction_time_utc, received_at_utc, commission_total, commission_currency, extclid
         FROM clickbank_ins_v8_transactions
         WHERE id > :after_id AND id <= :snapshot_max_id
           AND source = 'clickbank_ins_v8' AND role = 'AFFILIATE'
           AND transaction_type = 'SALE' AND is_test = 0
         ORDER BY id ASC
         LIMIT " . (CLICKBANK_INS_V8_SALES_PAGE_SIZE + 1);
}

interface ClickBankInsV8SalesRepository
{
    public function snapshotMaxId(): string;
    public function eligibleSalesPage(string $afterId, string $snapshotMaxId): array;
    public function outboundClicks(array $extclids, array $legacyClickIds): array;
}

/** Production adapter. Query semantics stay here; tests inject a synthetic repository. */
final class ClickBankInsV8PdoSalesRepository implements ClickBankInsV8SalesRepository
{
    private PDO $pdo;

    public function __construct(array $config)
    {
        foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
            if (!isset($config[$key]) || !is_string($config[$key]) || $config[$key] === '') throw new RuntimeException('api_not_configured');
        }
        $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
        $this->pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $this->pdo->exec("SET time_zone = '+00:00'");
    }

    public function snapshotMaxId(): string
    {
        $value = clickbank_ins_v8_sales_api_decimal_id((string)$this->pdo->query('SELECT COALESCE(MAX(id), 0) FROM clickbank_ins_v8_transactions')->fetchColumn());
        if ($value === null) throw new RuntimeException('database_unavailable');
        return $value;
    }

    public function eligibleSalesPage(string $afterId, string $snapshotMaxId): array
    {
        $statement = $this->pdo->prepare(clickbank_ins_v8_sales_api_sale_query());
        $statement->execute([':after_id' => $afterId, ':snapshot_max_id' => $snapshotMaxId]);
        return $statement->fetchAll();
    }

    public function outboundClicks(array $extclids, array $legacyClickIds): array
    {
        $conditions = [];
        $parameters = [];
        $index = 0;
        foreach ([['clickbank_extclid', $extclids, 'extclid_'], ['click_id', $legacyClickIds, 'click_id_']] as [$column, $values, $prefix]) {
            if ($values === []) continue;
            $placeholders = [];
            foreach ($values as $value) {
                $name = ':' . $prefix . $index++;
                $placeholders[] = $name;
                $parameters[$name] = $value;
            }
            $conditions[] = $column . ' IN (' . implode(',', $placeholders) . ')';
        }
        if ($conditions === []) return [];
        $statement = $this->pdo->prepare(
            "SELECT clickbank_extclid, click_id, product_key, presell_host, utm_campaign, event_type
             FROM tracking_events
             WHERE event_type = 'outbound_click' AND (" . implode(' OR ', $conditions) . ')'
        );
        $statement->execute($parameters);
        return $statement->fetchAll();
    }
}

/** Read non-test affiliate SALE rows in stable ID-bounded pages. Never returns buyer data, receipt, GCLID, or extclid. */
function clickbank_ins_v8_sales_api_fetch_page(array $config, string $afterId, ?string $snapshotMaxId, ?ClickBankInsV8SalesRepository $repository = null): array
{
    $repository ??= new ClickBankInsV8PdoSalesRepository($config);
    if ($snapshotMaxId === null) {
        $snapshotMaxId = clickbank_ins_v8_sales_api_decimal_id($repository->snapshotMaxId());
        if ($snapshotMaxId === null) throw new RuntimeException('database_unavailable');
    }

    $transactions = $repository->eligibleSalesPage($afterId, $snapshotMaxId);
    if (!array_is_list($transactions) || count($transactions) > CLICKBANK_INS_V8_SALES_PAGE_SIZE + 1) throw new RuntimeException('database_unavailable');
    $hasMore = count($transactions) > CLICKBANK_INS_V8_SALES_PAGE_SIZE;
    if ($hasMore) array_pop($transactions);

    $extclids = [];
    $legacyIds = [];
    foreach ($transactions as $transaction) {
        $extclid = $transaction['extclid'] ?? null;
        if (!is_string($extclid) || $extclid === '' || strlen($extclid) > 256 || preg_match('/^[\x21-\x7e]+$/D', $extclid) !== 1) continue;
        $extclids[$extclid] = $extclid;
        if (clickbank_ins_v8_sales_api_is_uuid($extclid)) $legacyIds[$extclid] = $extclid;
    }
    $clickRows = [];
    if ($extclids !== []) {
    }
    if ($extclids !== [] || $legacyIds !== []) $clickRows = $repository->outboundClicks(array_values($extclids), array_values($legacyIds));
    $sales = clickbank_ins_v8_sales_api_attribute_transactions($transactions, $clickRows);
    foreach ($sales as &$sale) {
        $sale['transaction_time_utc'] = clickbank_ins_v8_sales_api_format_time($sale['transaction_time_utc']);
        $sale['received_at_utc'] = clickbank_ins_v8_sales_api_format_time($sale['received_at_utc']);
        $sale['commission_total'] = $sale['commission_total'] === null ? null : (string)$sale['commission_total'];
        $sale['commission_currency'] = is_string($sale['commission_currency']) && preg_match('/^[A-Z]{3}$/D', $sale['commission_currency']) === 1
            ? $sale['commission_currency'] : null;
    }
    unset($sale);

    $lastId = $transactions === [] ? $afterId : (string)$transactions[array_key_last($transactions)]['id'];
    return [
        'ok' => true,
        'schema_version' => 4,
        'snapshot_max_id' => $snapshotMaxId,
        'after_id' => $afterId,
        'next_after_id' => $lastId,
        'has_more' => $hasMore,
        'generated_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'sales' => $sales,
    ];
}

/** Testable HTTP contract. It returns an HTTP-shaped result without globals, headers, or process exit. */
function clickbank_ins_v8_sales_api_handle_request(array $input, array $config, ?ClickBankInsV8SalesRepository $repository = null): array
{
    $headers = [
        'Cache-Control' => 'no-store, private', 'Pragma' => 'no-cache',
        'X-Content-Type-Options' => 'nosniff', 'Referrer-Policy' => 'no-referrer',
    ];
    $origin = $input['origin'] ?? null;
    $method = strtoupper((string)($input['method'] ?? 'GET'));
    $authorization = $input['authorization'] ?? null;
    $decision = clickbank_ins_v8_api_authorize($method, is_string($origin) ? $origin : null, is_string($authorization) ? $authorization : null, $config);
    if (is_string($decision['allow_origin'])) {
        $headers += [
            'Access-Control-Allow-Origin' => $decision['allow_origin'], 'Vary' => 'Origin',
            'Access-Control-Allow-Methods' => 'POST, OPTIONS',
            'Access-Control-Allow-Headers' => 'Authorization, Content-Type', 'Access-Control-Max-Age' => '300',
        ];
    }
    if ($decision['status'] === 204) return ['status' => 204, 'headers' => $headers, 'body' => null];
    if ($decision['status'] !== 200) return ['status' => $decision['status'], 'headers' => $headers, 'body' => ['ok' => false, 'error' => $decision['error']]];
    if ($method !== 'POST') return ['status' => 405, 'headers' => $headers, 'body' => ['ok' => false, 'error' => 'method_not_allowed']];
    if (($input['query_string'] ?? '') !== '') return ['status' => 400, 'headers' => $headers, 'body' => ['ok' => false, 'error' => 'query_not_supported']];
    try {
        $request = clickbank_ins_v8_sales_api_parse_request($input['content_type'] ?? null, $input['body'] ?? null);
    } catch (Throwable $error) {
        $code = $error->getMessage();
        $status = match ($code) { 'unsupported_content_type' => 415, 'payload_too_large' => 413, default => 400 };
        return ['status' => $status, 'headers' => $headers, 'body' => ['ok' => false, 'error' => $code]];
    }
    try {
        $page = clickbank_ins_v8_sales_api_fetch_page($config, $request['after_id'], $request['snapshot_max_id'], $repository);
        if (clickbank_ins_v8_sales_api_compare_decimal_ids($request['after_id'], $page['snapshot_max_id']) > 0) {
            return ['status' => 400, 'headers' => $headers, 'body' => ['ok' => false, 'error' => 'invalid_payload']];
        }
        return ['status' => 200, 'headers' => $headers, 'body' => $page];
    } catch (Throwable $error) {
        error_log('Tracking Hub INS v8 sales API request failed.');
        return ['status' => 500, 'headers' => $headers, 'body' => ['ok' => false, 'error' => 'server_error']];
    }
}

function clickbank_ins_v8_sales_api_dispatch(): never
{
    try {
        $config = clickbank_ins_v8_api_load_config();
    } catch (Throwable $error) {
        clickbank_ins_v8_api_send_json(503, ['ok' => false, 'error' => 'api_not_configured']);
    }
    $result = clickbank_ins_v8_sales_api_handle_request([
        'method' => $_SERVER['REQUEST_METHOD'] ?? 'GET', 'origin' => $_SERVER['HTTP_ORIGIN'] ?? null,
        'authorization' => clickbank_ins_v8_api_authorization_header(), 'query_string' => $_SERVER['QUERY_STRING'] ?? '',
        'content_type' => $_SERVER['CONTENT_TYPE'] ?? null,
    ], $config);
    foreach ($result['headers'] as $name => $value) header($name . ': ' . $value);
    http_response_code($result['status']);
    if ($result['body'] === null) exit;
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($result['body'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
