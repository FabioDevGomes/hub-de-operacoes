<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-sales-api-service.php';

final class SyntheticClickBankSalesRepository implements ClickBankInsV8SalesRepository
{
    public array $transactions;
    public array $clicks;
    public int $snapshotReads = 0;
    public array $clickLookups = [];

    public function __construct(array $transactions, array $clicks = []) { $this->transactions = $transactions; $this->clicks = $clicks; }
    public function snapshotMaxId(): string
    {
        $this->snapshotReads++;
        return (string)max(array_map(static fn($row) => (int)$row['id'], $this->transactions));
    }
    public function eligibleSalesPage(string $afterId, string $snapshotMaxId): array
    {
        $rows = array_values(array_filter($this->transactions, static fn($row) =>
            (string)$row['id'] > $afterId && (string)$row['id'] <= $snapshotMaxId
            && ($row['source'] ?? 'clickbank_ins_v8') === 'clickbank_ins_v8'
            && ($row['role'] ?? 'AFFILIATE') === 'AFFILIATE'
            && ($row['transaction_type'] ?? 'SALE') === 'SALE'
            && (int)($row['is_test'] ?? 0) === 0
        ));
        usort($rows, static fn($a, $b) => (int)$a['id'] <=> (int)$b['id']);
        return array_slice($rows, 0, CLICKBANK_INS_V8_SALES_PAGE_SIZE + 1);
    }
    public function outboundClicks(array $extclids, array $legacyClickIds): array
    {
        $this->clickLookups[] = [$extclids, $legacyClickIds];
        return array_values(array_filter($this->clicks, static fn($click) =>
            ($click['event_type'] ?? null) === 'outbound_click'
            && (in_array($click['clickbank_extclid'] ?? null, $extclids, true)
                || in_array($click['click_id'] ?? null, $legacyClickIds, true))
        ));
    }
}

function sales_api_request(array $overrides = []): array
{
    return array_replace([
        'method' => 'POST', 'origin' => 'https://hub.example.test', 'authorization' => 'Bearer ' . str_repeat('a', 64),
        'query_string' => '', 'content_type' => 'application/json', 'body' => '{"after_id":"0","snapshot_max_id":null}',
    ], $overrides);
}

function expect_sales_api_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

$parsed = clickbank_ins_v8_sales_api_parse_request(
    'application/json; charset=utf-8',
    '{"after_id":"0","snapshot_max_id":null}'
);
expect_sales_api_same(['after_id' => '0', 'snapshot_max_id' => null], $parsed, 'Initial cursor should be accepted.');
$parsed = clickbank_ins_v8_sales_api_parse_request(
    'application/json',
    '{"after_id":"18446744073709551614","snapshot_max_id":"18446744073709551615"}'
);
expect_sales_api_same('18446744073709551614', $parsed['after_id'], 'Unsigned BIGINT cursors must remain strings without precision loss.');

foreach ([
    ['text/plain', '{"after_id":"0","snapshot_max_id":null}', 'unsupported_content_type'],
    ['application/json', '{"after_id":0,"snapshot_max_id":null}', 'invalid_payload'],
    ['application/json', '{"after_id":"02","snapshot_max_id":null}', 'invalid_payload'],
    ['application/json', '{"after_id":"12","snapshot_max_id":"11"}', 'invalid_payload'],
    ['application/json', '{"after_id":"0","snapshot_max_id":"18446744073709551616"}', 'invalid_payload'],
    ['application/json', '{"after_id":"0","snapshot_max_id":null,"extclid":"must-not-be-accepted"}', 'invalid_payload'],
] as [$contentType, $body, $expectedError]) {
    try {
        clickbank_ins_v8_sales_api_parse_request($contentType, $body);
        throw new RuntimeException('Invalid sales API request unexpectedly passed validation.');
    } catch (RuntimeException $error) {
        expect_sales_api_same($expectedError, $error->getMessage(), 'Unexpected sales API request validation result.');
    }
}

$saleQuery = clickbank_ins_v8_sales_api_sale_query();
foreach ([
    "source = 'clickbank_ins_v8'",
    "role = 'AFFILIATE'",
    "transaction_type = 'SALE'",
    'is_test = 0',
] as $requiredEligibilityClause) {
    if (!str_contains($saleQuery, $requiredEligibilityClause)) {
        throw new RuntimeException('The sales query must exclude TEST, non-affiliate and non-SALE INS events.');
    }
}

$uuid = '3f8ad364-a458-4f23-9d87-03f9ac4ebd4d';
$transactions = [
    ['id' => '10', 'transaction_time_utc' => '2026-10-20 12:00:00.123', 'extclid' => 'ext-real-1'],
    ['id' => '11', 'transaction_time_utc' => '2026-10-20 12:01:00.000', 'extclid' => 'ext-real-2'],
    ['id' => '12', 'transaction_time_utc' => null, 'extclid' => 'ext-missing'],
    ['id' => '13', 'transaction_time_utc' => '2026-10-20 12:03:00.000', 'extclid' => $uuid],
];
$clickRows = [
    ['event_type' => 'outbound_click', 'clickbank_extclid' => 'ext-real-1', 'click_id' => 'click-1', 'presell_host' => 'a.example.com', 'product_key' => 'product-a', 'utm_campaign' => '987654321'],
    ['event_type' => 'outbound_click', 'clickbank_extclid' => 'ext-real-1', 'click_id' => 'click-2', 'presell_host' => 'a.example.com', 'product_key' => 'product-a', 'utm_campaign' => '987654321'],
    ['event_type' => 'outbound_click', 'clickbank_extclid' => 'ext-real-2', 'click_id' => 'click-3', 'presell_host' => 'a.example.com', 'product_key' => 'product-a', 'utm_campaign' => '123456789'],
    ['event_type' => 'outbound_click', 'clickbank_extclid' => 'ext-real-2', 'click_id' => 'click-4', 'presell_host' => 'b.example.com', 'product_key' => 'product-a', 'utm_campaign' => '234567891'],
    ['event_type' => 'page_view', 'clickbank_extclid' => 'ext-real-2', 'click_id' => 'click-5', 'presell_host' => 'ignored.example.com', 'product_key' => 'product-a', 'utm_campaign' => '345678912'],
    ['event_type' => 'outbound_click', 'clickbank_extclid' => null, 'click_id' => $uuid, 'presell_host' => 'legacy.example.com', 'product_key' => 'product-old', 'utm_campaign' => '456789123'],
    ['event_type' => 'outbound_click', 'clickbank_extclid' => 'ext-real-1', 'click_id' => 'click-6', 'presell_host' => 'missing-product.example.com', 'product_key' => null, 'utm_campaign' => '987654321'],
];
$sales = clickbank_ins_v8_sales_api_attribute_transactions($transactions, $clickRows);
expect_sales_api_same('matched', $sales[0]['attribution_status'], 'Multiple clicks on one Track must remain a single unambiguous match.');
expect_sales_api_same(['presell_host' => 'a.example.com', 'product_key' => 'product-a'], [
    'presell_host' => $sales[0]['presell_host'], 'product_key' => $sales[0]['product_key'],
], 'The unique host/product pair should be attributed.');
expect_sales_api_same('track_matched', $sales[0]['click_link_diagnostic']['status'], 'The exact extclid join should expose only its safe join status.');
expect_sales_api_same(
    ['status' => 'candidate', 'source' => 'utm_campaign_campaignid', 'campaign_id' => '987654321'],
    $sales[0]['click_campaign_candidate'],
    'A single exact campaign ID repeated across matched outbound clicks should be returned as a candidate.'
);
expect_sales_api_same('ambiguous', $sales[1]['attribution_status'], 'More than one distinct Track pair must be marked ambiguous.');
expect_sales_api_same(null, $sales[1]['presell_host'], 'Ambiguous rows must not guess a host.');
expect_sales_api_same('campaign_ambiguous', $sales[1]['click_campaign_candidate']['status'], 'Distinct campaign IDs on the exact extclid join must not be guessed.');
expect_sales_api_same('unmatched', $sales[2]['attribution_status'], 'A sale with no matching click must remain unassigned.');
expect_sales_api_same('exact_click_not_found', $sales[2]['click_link_diagnostic']['status'], 'A sale without a click must expose a safe missing-click diagnostic.');
expect_sales_api_same('matched', $sales[3]['attribution_status'], 'Historical UUID click_id fallback should continue to work.');
expect_sales_api_same('legacy.example.com', $sales[3]['presell_host'], 'Legacy UUID association should retain its observed Track.');
expect_sales_api_same('456789123', $sales[3]['click_campaign_candidate']['campaign_id'], 'The exact UUID legacy join should retain its click campaign candidate.');

expect_sales_api_same(
    ['status' => 'source_conflict', 'source' => null, 'campaign_id' => null],
    clickbank_ins_v8_sales_api_campaign_candidate([
        ['utm_campaign' => '987654321'],
        ['utm_campaign' => null],
    ]),
    'A valid campaign ID mixed with missing click campaign data must be withheld as conflicting evidence.'
);
expect_sales_api_same(
    'campaign_id_invalid',
    clickbank_ins_v8_sales_api_campaign_candidate([['utm_campaign' => 'Power Heat Pro DE02']])['status'],
    'Campaign names must not be interpreted as campaign IDs.'
);
expect_sales_api_same(
    'extclid_missing',
    clickbank_ins_v8_sales_api_click_link_status(null, [], 0),
    'Missing extclid must remain distinguishable without returning its value.'
);
$json = json_encode($sales, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
foreach (['ext-real', 'gclid', 'receipt', 'customer', 'buyer'] as $forbidden) {
    if (stripos($json, $forbidden) !== false) throw new RuntimeException('The reduced sales API output unexpectedly contains ' . $forbidden . '.');
}

$config = ['tracking_hub_allowed_origins' => ['https://hub.example.test'], 'tracking_hub_api_token' => str_repeat('a', 64)];
$rows = [];
for ($id = 1; $id <= 203; $id++) {
    $rows[] = ['id' => (string)$id, 'transaction_time_utc' => '2026-11-15 12:00:00.000', 'received_at_utc' => '2026-11-15 12:01:00.000', 'commission_total' => '90.00', 'commission_currency' => 'USD', 'extclid' => $id === 1 ? 'sensitive-extclid-fixture' : null];
}
$rows[] = ['id' => '204', 'transaction_type' => 'TEST'];
$rows[] = ['id' => '205', 'role' => 'VENDOR'];
$rows[] = ['id' => '206', 'is_test' => 1];
$clicks = [['event_type' => 'outbound_click', 'clickbank_extclid' => 'sensitive-extclid-fixture', 'click_id' => 'private-click-fixture', 'presell_host' => 'buy.example.test', 'product_key' => 'synthetic-product', 'utm_campaign' => '987654321']];
$repository = new SyntheticClickBankSalesRepository($rows, $clicks);
$firstResult = clickbank_ins_v8_sales_api_handle_request(sales_api_request(), $config, $repository);
expect_sales_api_same(200, $firstResult['status'], 'An authorized synthetic first-page request should succeed.');
expect_sales_api_same('206', $firstResult['body']['snapshot_max_id'], 'Snapshot max ID should include the fixed table boundary.');
expect_sales_api_same(200, count($firstResult['body']['sales']), 'First page should return the configured page size.');
expect_sales_api_same(true, $firstResult['body']['has_more'], 'First page should indicate that a second page exists.');
expect_sales_api_same('200', $firstResult['body']['next_after_id'], 'First-page cursor should advance to its final sale.');
expect_sales_api_same('candidate', $firstResult['body']['sales'][0]['click_campaign_candidate']['status'], 'The exact outbound-click lookup should reach the candidate projection.');
expect_sales_api_same(1, $repository->snapshotReads, 'The first request should choose the snapshot boundary once.');
expect_sales_api_same([['sensitive-extclid-fixture'], []], $repository->clickLookups[0], 'Click lookup should use only exact IDs from returned sales.');

$rows[] = ['id' => '207', 'transaction_time_utc' => '2026-11-15 12:02:00.000', 'received_at_utc' => '2026-11-15 12:03:00.000', 'commission_total' => '90.00', 'commission_currency' => 'USD'];
$secondResult = clickbank_ins_v8_sales_api_handle_request(sales_api_request([
    'body' => '{"after_id":"200","snapshot_max_id":"206"}',
]), $config, $repository);
expect_sales_api_same(200, $secondResult['status'], 'The next page should succeed using the original snapshot boundary.');
expect_sales_api_same(3, count($secondResult['body']['sales']), 'Second page should return only the remaining pre-snapshot sales.');
expect_sales_api_same('203', $secondResult['body']['next_after_id'], 'Second-page cursor should stop at the final eligible sale.');
expect_sales_api_same(false, $secondResult['body']['has_more'], 'Second page should mark the snapshot complete.');
expect_sales_api_same(1, $repository->snapshotReads, 'Subsequent pages must not refresh the snapshot max ID.');
expect_sales_api_same(false, in_array('207', array_column($secondResult['body']['sales'], 'transaction_id'), true), 'Sales inserted after the snapshot must not leak into later pages.');

foreach ([
    [sales_api_request(['method' => 'OPTIONS', 'authorization' => null]), 204, null],
    [sales_api_request(['origin' => 'https://evil.example.test']), 403, 'origin_not_allowed'],
    [sales_api_request(['authorization' => 'Bearer ' . str_repeat('b', 64)]), 401, 'not_authorized'],
    [sales_api_request(['method' => 'GET']), 405, 'method_not_allowed'],
    [sales_api_request(['content_type' => 'text/plain']), 415, 'unsupported_content_type'],
    [sales_api_request(['body' => '{bad json']), 400, 'invalid_payload'],
    [sales_api_request(['query_string' => 'after_id=1']), 400, 'query_not_supported'],
] as [$input, $expectedStatus, $expectedError]) {
    $result = clickbank_ins_v8_sales_api_handle_request($input, $config, $repository);
    expect_sales_api_same($expectedStatus, $result['status'], 'The HTTP contract must reject this synthetic request.');
    if ($expectedError !== null) expect_sales_api_same($expectedError, $result['body']['error'], 'The HTTP contract must return a stable non-sensitive error.');
}
$headers = $firstResult['headers'];
expect_sales_api_same('https://hub.example.test', $headers['Access-Control-Allow-Origin'] ?? null, 'Successful requests should include CORS for the allowed origin.');
$responseJson = json_encode($firstResult['body'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
foreach (['sensitive-extclid-fixture', 'private-click-fixture', 'gclid', 'receipt', 'buyer'] as $forbidden) {
    if (stripos($responseJson, $forbidden) !== false) throw new RuntimeException('The HTTP response unexpectedly contains ' . $forbidden . '.');
}
$failingRepository = new class implements ClickBankInsV8SalesRepository {
    public function snapshotMaxId(): string { throw new RuntimeException('synthetic database detail'); }
    public function eligibleSalesPage(string $afterId, string $snapshotMaxId): array { return []; }
    public function outboundClicks(array $extclids, array $legacyClickIds): array { return []; }
};
$failure = clickbank_ins_v8_sales_api_handle_request(sales_api_request(), $config, $failingRepository);
expect_sales_api_same(500, $failure['status'], 'Repository failures should become a generic server response.');
expect_sales_api_same(['ok' => false, 'error' => 'server_error'], $failure['body'], 'Repository details must not leak to the caller.');

echo "Testes sintéticos da API de vendas por Track, paginação, handler HTTP e autenticação aprovados.\n";
