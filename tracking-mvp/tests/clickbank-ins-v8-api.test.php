<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-api-service.php';

function expect_ins_api_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ' Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

$token = str_repeat('a', 64);
$origin = 'http://127.0.0.1:8765';
$config = [
    'tracking_hub_api_token' => $token,
    'tracking_hub_allowed_origins' => [$origin],
];
expect_ins_api_same(200, clickbank_ins_v8_api_authorize('GET', $origin, 'Bearer ' . $token, $config)['status'], 'Valid Hub requests should be authorized.');
expect_ins_api_same(200, clickbank_ins_v8_api_authorize('POST', $origin, 'Bearer ' . $token, $config)['status'], 'Authenticated POST requests should be authorized before route-specific checks.');
expect_ins_api_same(204, clickbank_ins_v8_api_authorize('OPTIONS', $origin, null, $config)['status'], 'Preflight should not require the bearer token.');
expect_ins_api_same(403, clickbank_ins_v8_api_authorize('GET', 'https://attacker.example', 'Bearer ' . $token, $config)['status'], 'Unknown origins must be rejected.');
expect_ins_api_same(403, clickbank_ins_v8_api_authorize('GET', null, 'Bearer ' . $token, $config)['status'], 'Requests without an Origin must be rejected.');
expect_ins_api_same(405, clickbank_ins_v8_api_authorize('PUT', $origin, 'Bearer ' . $token, $config)['status'], 'Unsupported write methods must be rejected.');
expect_ins_api_same(401, clickbank_ins_v8_api_authorize('GET', $origin, 'Bearer ' . str_repeat('b', 64), $config)['status'], 'Invalid bearer tokens must be rejected.');

$sale = [
    'id' => 10,
    'source' => 'clickbank_ins_v8',
    'role' => 'AFFILIATE',
    'transaction_type' => 'SALE',
    'receipt_id' => 'ORDER-REAL-12345',
    'transaction_time_utc' => '2026-10-18 19:06:28.746',
    'customer_country' => 'us',
    'commission_total' => '12.3456',
    'sale_gross_total' => '100.0000',
    'commission_currency' => 'USD',
    'upsell_original_receipt' => null,
    'gclid' => 'FullRealGclidIdentifier123456789',
    'gclid_source' => 'extclid_join',
    'commission_reconciliation_status' => 'matched',
    'is_test' => 0,
    'line_items' => [
        ['line_index' => 0, 'product_item_no' => 'PROD-1', 'product_title' => 'Produto principal', 'line_item_type' => 'ORIGINAL', 'quantity' => '1.000', 'commission_amount' => '8.0000', 'product_price' => '80.0000', 'product_discount' => '0.0000'],
        ['line_index' => 1, 'product_item_no' => 'PROD-BUMP', 'product_title' => 'Complemento', 'line_item_type' => 'BUMP', 'quantity' => '1.000', 'commission_amount' => '4.3456', 'product_price' => '20.0000', 'product_discount' => '0.0000'],
    ],
];
$testTransaction = $sale;
$testTransaction['id'] = 9;
$testTransaction['transaction_type'] = 'TEST';
$testTransaction['receipt_id'] = 'TEST-RECEIPT-98765';
$testTransaction['gclid'] = 'TEST-GCLID-123';
$testTransaction['is_test'] = 1;
$testTransaction['customer_country'] = null;
$mismatch = $sale;
$mismatch['id'] = 8;
$mismatch['receipt_id'] = 'ORDER-MISMATCH-123';
$mismatch['commission_total'] = '15.0000';
$mismatch['commission_reconciliation_status'] = 'mismatch';
$duplicateOne = $sale;
$duplicateOne['id'] = 7;
$duplicateOne['receipt_id'] = 'ORDER-DUPLICATE-123';
$duplicateTwo = $duplicateOne;
$duplicateTwo['id'] = 6;
$duplicateTwo['gclid'] = 'AnotherFullRealGclidIdentifier987654321';
$duplicateTwo['customer_country'] = 'not-a-country';

$transactions = [$sale, $testTransaction, $mismatch, $duplicateOne, $duplicateTwo];
$result = clickbank_ins_v8_api_analyze_transactions($transactions, 'Venda afiliado ClickBank');
$report = $result['report'];
$json = json_encode($report, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
expect_ins_api_same(5, $report['candidate_count'], 'All captured transactions should be counted.');
expect_ins_api_same(1, $report['test_count'], 'The INS test transaction should be identified.');
expect_ins_api_same(4, $report['sale_count'], 'Only non-test affiliate SALE events count as sales.');
expect_ins_api_same(1, $report['eligible_count'], 'Only the fully eligible receipt should be exportable.');
expect_ins_api_same(4, $report['ignored_count'], 'Tests, mismatch and duplicate receipts should stay out of the CSV.');
expect_ins_api_same(1, $report['skipped_by_reason']['test_transaction'], 'Test IPN must have its own exclusion reason.');
expect_ins_api_same(1, $report['skipped_by_reason']['commission_mismatch'], 'Mismatched commission must be excluded.');
expect_ins_api_same(2, $report['skipped_by_reason']['duplicate_receipt'], 'All repeated eligible receipts must be blocked.');
expect_ins_api_same('12.3456', $report['value_by_currency']['USD'], 'Commission totals should retain four decimal places.');
expect_ins_api_same(2, count($report['preview'][0]['line_items']), 'The report must preserve each product line.');
expect_ins_api_same('US', $report['preview'][0]['customer_country'], 'The report should expose only an uppercase two-letter country code.');
expect_ins_api_same('Venda afiliado ClickBank', $report['preview'][0]['conversion_name'], 'A non-test affiliate sale should show the configured conversion action.');
expect_ins_api_same(null, $report['preview'][1]['conversion_name'], 'A test notification must not be assigned a sale conversion action.');
expect_ins_api_same(null, $report['preview'][4]['customer_country'], 'Invalid persisted country values should be suppressed from the report.');
expect_ins_api_same('PROD-BUMP', $report['preview'][0]['line_items'][1]['item_no'], 'Multiple products should retain their identifiers and order.');
expect_ins_api_same('Full…6789', $report['preview'][0]['gclid_masked'], 'The JSON preview must mask GCLIDs.');
expect_ins_api_same('ORDE…2345', $report['preview'][0]['receipt_id_masked'], 'The JSON preview must mask receipts.');
if (str_contains($json, $sale['gclid']) || str_contains($json, $sale['receipt_id']) || str_contains($json, $testTransaction['receipt_id']) || str_contains($json, $token)) {
    throw new RuntimeException('The JSON report must not include full GCLIDs, receipts or tokens.');
}

$reportWithoutConfiguredAction = clickbank_ins_v8_api_analyze_transactions($transactions, null)['report'];
expect_ins_api_same(null, $reportWithoutConfiguredAction['conversion_name'], 'The report should not require a global conversion action.');
expect_ins_api_same(null, $reportWithoutConfiguredAction['preview'][0]['conversion_name'], 'The report must not assign an action before the user selects an export profile.');
$profileRows = clickbank_ins_v8_api_analyze_transactions([$sale], 'Compra Conta B')['rows'];
expect_ins_api_same('Compra Conta B', $profileRows[0]['Conversion Name'], 'The selected Hub profile action must be used verbatim in the CSV row.');

expect_ins_api_same(null, clickbank_ins_v8_api_conversion_name_for_request('report', 'GET', []), 'Report reads must not require a conversion action in server configuration.');
expect_ins_api_same('Conta A - Compra principal', clickbank_ins_v8_api_conversion_name_for_request(
    'csv', 'POST', [], 'application/json; charset=utf-8', '{"conversion_name":"  Conta A - Compra principal  "}'
), 'The CSV request should accept the action supplied by the selected Hub profile.');
expect_ins_api_same('Ação legada', clickbank_ins_v8_api_conversion_name_for_request(
    'csv', 'GET', ['tracking_hub_conversion_name' => 'Ação legada']
), 'Old Hub builds should keep working through the optional legacy GET configuration.');

function expect_ins_api_throws(string $expectedCode, callable $callback, string $message): void
{
    try {
        $callback();
    } catch (RuntimeException $error) {
        expect_ins_api_same($expectedCode, $error->getMessage(), $message);
        return;
    }
    throw new RuntimeException($message . ' Expected ' . $expectedCode . '.');
}

expect_ins_api_throws('invalid_conversion_name', fn() => clickbank_ins_v8_api_conversion_name_for_request(
    'csv', 'POST', [], 'application/json', '{"conversion_name":""}'
), 'An empty action name must be rejected.');
expect_ins_api_throws('invalid_conversion_name', fn() => clickbank_ins_v8_api_conversion_name_for_request(
    'csv', 'POST', [], 'application/json', '{"conversion_name":"ação\ninválida"}'
), 'Control characters in an action name must be rejected.');
expect_ins_api_throws('unsupported_content_type', fn() => clickbank_ins_v8_api_conversion_name_for_request(
    'csv', 'POST', [], 'text/plain', '{"conversion_name":"Ação"}'
), 'The action should only be accepted as JSON.');
expect_ins_api_throws('invalid_payload', fn() => clickbank_ins_v8_api_conversion_name_for_request(
    'csv', 'POST', [], 'application/json', '{"conversion_name":"Ação","extra":"value"}'
), 'Unrecognized request fields must be rejected.');
expect_ins_api_throws('conversion_action_not_configured', fn() => clickbank_ins_v8_api_conversion_name_for_request(
    'csv', 'GET', []
), 'Legacy GET export should require its old server-side action.');

$csv = clickbank_ins_v8_api_csv_string($result['rows']);
$lines = preg_split('/\r?\n/', trim($csv));
expect_ins_api_same(CLICKBANK_INS_V8_API_CSV_HEADERS, str_getcsv($lines[0]), 'CSV headers must match the offline conversion format.');
expect_ins_api_same(1, count($lines) - 1, 'The CSV must contain one row per eligible receipt only.');
if (!str_contains($csv, $sale['gclid']) || !str_contains($csv, $sale['receipt_id']) || str_contains($csv, 'TEST-GCLID') || str_contains($csv, 'ORDER-DUPLICATE')) {
    throw new RuntimeException('CSV should include full eligible identifiers and exclude test/duplicate transactions.');
}
if (!str_contains($csv, '12.3456') || !str_contains($csv, '2026-10-18 19:06:28+0000')) {
    throw new RuntimeException('CSV should preserve the recorded commission and normalize the stored UTC time.');
}

$unresolved = $sale;
$unresolved['gclid_source'] = 'unresolved';
expect_ins_api_same('unresolved_gclid', clickbank_ins_v8_api_ineligibility($unresolved), 'Unresolved attribution must not be exported.');
$unsupportedCurrency = $sale;
$unsupportedCurrency['commission_currency'] = 'BRL';
expect_ins_api_same('unsupported_currency', clickbank_ins_v8_api_ineligibility($unsupportedCurrency), 'Unexpected currency must be held for review.');

echo "Testes da API ClickBank INS v8 aprovados.\n";
