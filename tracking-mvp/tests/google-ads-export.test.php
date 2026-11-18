<?php
declare(strict_types=1);

$libraryCandidates = [
    __DIR__ . '/../tools/google-ads-export-lib.php',
    dirname(__DIR__) . '/google-ads-export-lib.php',
];
$libraryPath = null;
foreach ($libraryCandidates as $candidate) {
    if (is_file($candidate)) {
        $libraryPath = $candidate;
        break;
    }
}
if ($libraryPath === null) {
    throw new RuntimeException('Google Ads export library not found.');
}
require_once $libraryPath;

function expect_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

$base = [
    'event_id' => 'cb-event-1',
    'event_type' => 'PURCHASE',
    'receipt_id' => 'receipt-1',
    'order_id' => 'order-1',
    'extclid' => '00000000-0000-4000-8000-000000000001',
    'matched_click_id' => '00000000-0000-4000-8000-000000000001',
    'gclid' => 'RealClickIdExample123',
    'click_received_at_utc' => '2026-10-15 17:34:25.990',
    'event_time' => '2026-10-15T18:22:09.403411897Z[UTC]',
    'affiliate_earnings' => '1.00',
    'order_currency' => 'USD',
];

$eligible = google_ads_prepare_conversion_row($base, 'Purchase - ClickBank');
expect_same('eligible', $eligible['reason'], 'A valid ClickBank purchase should be eligible.');
expect_same('2026-10-15 18:22:09+0000', $eligible['row']['Conversion Time'], 'Conversion time should be normalized to UTC.');
expect_same('1.00', $eligible['row']['Conversion Value'], 'Affiliate earnings should retain two decimal places.');
expect_same('receipt-1', $eligible['row']['Order ID'], 'Receipt ID should be used as the unique order ID.');

$synthetic = $base;
$synthetic['gclid'] = 'TEST-GCLID-123';
expect_same('synthetic_gclid', google_ads_prepare_conversion_row($synthetic, 'Purchase - ClickBank')['reason'], 'Synthetic GCLIDs must be excluded.');

$unmatched = $base;
$unmatched['matched_click_id'] = '';
expect_same('unmatched_click', google_ads_prepare_conversion_row($unmatched, 'Purchase - ClickBank')['reason'], 'Unmatched postbacks must be excluded.');

$wrongEvent = $base;
$wrongEvent['event_type'] = 'UPSELL';
expect_same('not_initial_purchase', google_ads_prepare_conversion_row($wrongEvent, 'Purchase - ClickBank')['reason'], 'Non-initial events must be excluded.');

$noTimezone = $base;
$noTimezone['event_time'] = '2026-10-15T18:22:09';
expect_same('invalid_or_missing_time', google_ads_prepare_conversion_row($noTimezone, 'Purchase - ClickBank')['reason'], 'Timestamps without a timezone must be excluded.');

$beforeClick = $base;
$beforeClick['event_time'] = '2026-10-15T17:00:00Z';
expect_same('conversion_before_click', google_ads_prepare_conversion_row($beforeClick, 'Purchase - ClickBank')['reason'], 'A conversion before its click must be excluded.');

$outsideWindow = $base;
$outsideWindow['event_time'] = '2027-01-20T17:34:26Z';
expect_same('outside_90_day_window', google_ads_prepare_conversion_row($outsideWindow, 'Purchase - ClickBank')['reason'], 'Conversions after the 90-day window must be excluded.');

$duplicateBatch = google_ads_build_export_rows([$base, $base], 'Purchase - ClickBank');
expect_same(1, count($duplicateBatch['rows']), 'Repeated receipt IDs must only appear once.');
expect_same(1, $duplicateBatch['skipped']['duplicate_order_id'], 'Duplicate rows should be counted in the summary.');

echo "Testes do exportador Google Ads aprovados.\n";
