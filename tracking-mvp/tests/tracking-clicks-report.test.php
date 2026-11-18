<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'tracking-clicks-report-service.php';

function expect_tracking_clicks_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

function expect_tracking_clicks(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$token = str_repeat('a', 64);
$origin = 'http://127.0.0.1:8765';
$config = ['tracking_hub_api_token' => $token, 'tracking_hub_allowed_origins' => [$origin]];
expect_tracking_clicks_same(200, tracking_clicks_authorize('POST', $origin, 'Bearer ' . $token, $config)['status'], 'The read-only Hub token should authorize an aggregate report.');
expect_tracking_clicks_same(204, tracking_clicks_authorize('OPTIONS', $origin, null, $config)['status'], 'CORS preflight should not require a token.');
expect_tracking_clicks_same(403, tracking_clicks_authorize('POST', 'https://attacker.example', 'Bearer ' . $token, $config)['status'], 'Unknown origins must be refused.');
expect_tracking_clicks_same(401, tracking_clicks_authorize('POST', $origin, 'Bearer ' . str_repeat('b', 64), $config)['status'], 'Wrong bearer tokens must be refused.');
expect_tracking_clicks_same(405, tracking_clicks_authorize('GET', $origin, 'Bearer ' . $token, $config)['status'], 'The endpoint accepts only POST/OPTIONS.');

$range = tracking_clicks_normalize_dates('2026-10-01', '2026-10-31');
expect_tracking_clicks_same('2026-10-01 00:00:00', $range['start_at_utc'], 'The date start is inclusive UTC midnight.');
expect_tracking_clicks_same('2026-11-01 00:00:00', $range['end_before_utc'], 'The end is exclusive midnight after the requested UTC date.');
tracking_clicks_normalize_dates('2024-01-01', '2024-12-31');
foreach ([
    ['2026-02-30', '2026-03-01'],
    ['2026-10-02', '2026-10-01'],
    ['2026-01-01', '2027-01-02'],
    ['2026-1-01', '2026-01-02'],
] as [$start, $end]) {
    try {
        tracking_clicks_normalize_dates($start, $end);
        throw new RuntimeException('Malformed or excessive ranges must be rejected.');
    } catch (InvalidArgumentException $error) {
        expect_tracking_clicks(in_array($error->getMessage(), ['invalid_date_range', 'date_range_too_large'], true), 'A stable date-range error should be returned.');
    }
}

class TrackingClicksFixtureStatement extends PDOStatement
{
    public array $parameters = [];

    public function __construct(private array $fixtureRows) {}
    public function execute(?array $params = null): bool { $this->parameters = $params ?? []; return true; }
    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array { return $this->fixtureRows; }
}

class TrackingClicksFixturePdo extends PDO
{
    public string $preparedSql = '';
    public function __construct(private array $fixtureRows) {}
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        $this->preparedSql = $query;
        return new TrackingClicksFixtureStatement($this->fixtureRows);
    }
}

$pdo = new TrackingClicksFixturePdo([[
    'date_utc' => '2026-10-21', 'product_key' => 'metabo-zinvero', 'presell_host' => 'metabo.zinvero.shop',
    'page_views' => '3', 'outbound_clicks' => '1',
]]);
$rows = tracking_clicks_fetch_report($pdo, $range);
expect_tracking_clicks_same([[
    'date_utc' => '2026-10-21', 'product_key' => 'metabo-zinvero', 'presell_host' => 'metabo.zinvero.shop',
    'page_views' => 3, 'outbound_clicks' => 1,
]], $rows, 'Only aggregated event counts and product/host keys leave the query.');
expect_tracking_clicks(str_contains($pdo->preparedSql, "event_type IN ('page_view', 'outbound_click')"), 'The SQL must count only visits and outbound clicks.');
expect_tracking_clicks(str_contains($pdo->preparedSql, 'GROUP BY DATE(received_at_utc), product_key, presell_host'), 'The query must group by day, product, and pre-sell host.');
expect_tracking_clicks(str_contains($pdo->preparedSql, 'received_at_utc >= :start_at_utc') && str_contains($pdo->preparedSql, 'received_at_utc < :end_before_utc'), 'The report must use a prepared UTC date range.');
expect_tracking_clicks(!preg_match('/SELECT\s+.*\b(visitor_id|gclid|gbraid|wbraid|clickbank_extclid|page_url|destination_url)\b/is', $pdo->preparedSql), 'The report SQL must not select visitor or click identifiers.');

echo "Testes do relatório agregado de cliques aprovados.\n";
