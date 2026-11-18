<?php
declare(strict_types=1);

$libraryCandidates = [
    __DIR__ . '/../tools/google-ads-api-lib.php',
    dirname(__DIR__) . '/google-ads-api-lib.php',
];
$libraryPath = null;
foreach ($libraryCandidates as $candidate) {
    if (is_file($candidate)) {
        $libraryPath = $candidate;
        break;
    }
}
if ($libraryPath === null) {
    throw new RuntimeException('Google Ads Hub API library not found.');
}
require_once $libraryPath;

function expect_api_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

$token = str_repeat('a', 64);
$config = [
    'tracking_hub_api_token' => $token,
    'tracking_hub_allowed_origins' => ['http://127.0.0.1:8765'],
];
$origin = 'http://127.0.0.1:8765';

expect_api_same(200, google_ads_api_authorize('GET', $origin, 'Bearer ' . $token, $config)['status'], 'A valid local Hub request should be authorized.');
expect_api_same(204, google_ads_api_authorize('OPTIONS', $origin, null, $config)['status'], 'A valid CORS preflight should not require the token.');
expect_api_same(403, google_ads_api_authorize('GET', 'https://attacker.example', 'Bearer ' . $token, $config)['status'], 'Unlisted origins must be rejected.');
expect_api_same(403, google_ads_api_authorize('GET', null, 'Bearer ' . $token, $config)['status'], 'Requests without an allowed Origin must be rejected.');
expect_api_same(405, google_ads_api_authorize('POST', $origin, 'Bearer ' . $token, $config)['status'], 'Write methods must be rejected.');
expect_api_same(401, google_ads_api_authorize('GET', $origin, 'Bearer ' . str_repeat('b', 64), $config)['status'], 'An invalid bearer token must be rejected.');
expect_api_same(503, google_ads_api_authorize('GET', $origin, 'Bearer ' . $token, ['tracking_hub_allowed_origins' => [$origin]])['status'], 'An unconfigured API token must fail closed.');

$row = [
    'Google Click ID' => 'RealClickIdExample123456789',
    'Conversion Name' => 'Conversão compra off-line (upload)',
    'Conversion Time' => '2026-10-15 18:22:09+0000',
    'Conversion Value' => '1.25',
    'Conversion Currency' => 'USD',
    'Order ID' => 'ORDER-123456789',
];
$secondRow = $row;
$secondRow['Google Click ID'] = 'AnotherRealClickId123456789';
$secondRow['Conversion Value'] = '2.05';
$secondRow['Conversion Currency'] = 'USD';
$report = google_ads_api_build_report([
    'candidate_count' => 3,
    'rows' => [$row, $secondRow],
    'skipped' => ['synthetic_gclid' => 1],
], $row['Conversion Name']);
$encodedReport = json_encode($report, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

expect_api_same(true, $report['ok'], 'The report should be marked successful.');
expect_api_same(1, $report['schema_version'], 'The report schema should be versioned.');
expect_api_same('all_tracked_products', $report['product_scope'], 'Current API scope should be product-neutral.');
expect_api_same(false, $report['product_breakdown_available'], 'The current database cannot break down results by product.');
expect_api_same(3, $report['candidate_count'], 'The report should show candidate postbacks.');
expect_api_same(2, $report['eligible_count'], 'The report should show eligible conversions.');
expect_api_same('3.30', $report['value_by_currency']['USD'], 'The report should total money without floating point.');
expect_api_same('Real…6789', $report['preview'][0]['google_click_id_masked'], 'Preview should mask the GCLID.');
expect_api_same('ORDE…6789', $report['preview'][0]['order_id_masked'], 'Preview should mask the order identifier.');
if (str_contains($encodedReport, $row['Google Click ID']) || str_contains($encodedReport, $row['Order ID']) || str_contains($encodedReport, $token)) {
    throw new RuntimeException('The JSON report must not include full identifiers or the API token.');
}

$emptyReport = google_ads_api_build_report([
    'candidate_count' => 0,
    'rows' => [],
    'skipped' => [],
], $row['Conversion Name']);
$emptyJson = json_decode(json_encode($emptyReport, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
expect_api_same(0, $emptyReport['eligible_count'], 'A report without sales should have zero eligible conversions.');
if (!isset($emptyJson->value_by_currency) || !($emptyJson->value_by_currency instanceof stdClass)) {
    throw new RuntimeException('An empty currency total must serialize as a JSON object, not a list.');
}

$csv = google_ads_api_csv_string([$row]);
$csvHeaderLine = explode("\n", $csv, 2)[0] ?? '';
$csvHeader = str_getcsv(rtrim($csvHeaderLine, "\r"));
expect_api_same(GOOGLE_ADS_UPLOAD_HEADERS, $csvHeader, 'CSV should preserve the Google Ads upload headings.');
if (!str_contains($csv, $row['Google Click ID']) || !str_contains($csv, $row['Order ID'])) {
    throw new RuntimeException('The explicit CSV download should preserve the full upload identifiers.');
}

echo "Testes da API do Hub aprovados.\n";
