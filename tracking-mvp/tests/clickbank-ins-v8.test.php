<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'clickbank-ins-v8-service.php';

function expect_ins_v8(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function make_ins_v8_envelope(array $payload, string $secretKey): string
{
    $iv = random_bytes(16);
    $key = substr(sha1($secretKey), 0, 32);
    $ciphertext = openssl_encrypt(
        json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        'AES-256-CBC',
        $key,
        OPENSSL_RAW_DATA,
        $iv
    );
    if (!is_string($ciphertext)) {
        throw new RuntimeException('Could not create the synthetic test envelope.');
    }
    return json_encode([
        'notification' => base64_encode($ciphertext),
        'iv' => base64_encode($iv),
    ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function ins_v8_payload_object(array $payload): stdClass
{
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $object = json_decode($json, false, 64, JSON_THROW_ON_ERROR);
    if (!$object instanceof stdClass) {
        throw new RuntimeException('Could not prepare the synthetic test payload.');
    }
    return $object;
}

$secret = 'SYNTHETIC_KEY_8';
$payload = [
    'version' => '8',
    'role' => 'AFFILIATE',
    'transactionType' => 'SALE',
    'receipt' => 'SYNTHETIC-12345',
    'transactionTime' => '2026-10-16T22:40:00-07:00',
    'totalAccountAmount' => '17.50',
    'totalOrderAmount' => '188.54',
    'currency' => 'USD',
    'lineItems' => [
        [
            'itemNo' => 'SKU-A',
            'productTitle' => 'Synthetic product A',
            'lineItemType' => 'ORIGINAL',
            'quantity' => '1',
            'accountAmount' => '12.50',
            'productPrice' => '100.00',
            'productDiscount' => '0',
        ],
        [
            'itemNo' => 'SKU-B',
            'productTitle' => 'Synthetic product B',
            'lineItemType' => 'BUMP',
            'quantity' => '1',
            'accountAmount' => '5.00',
            'productPrice' => '88.54',
            'productDiscount' => '0',
        ],
    ],
    'customer' => ['billing' => [
        'email' => 'must-not-be-stored@example.invalid',
        'address' => ['country' => 'br', 'city' => 'private city'],
    ]],
    'affiliateTrackingParameters' => [
        'extclid' => '4b38f55e-4fa1-4bc5-85c0-9920b6162b78',
        'affSub1' => 'UNVERIFIED-GCLID-CANDIDATE',
    ],
    'commonTrackingParameters' => ['clickId' => 'clickbank-synthetic-click'],
    'trackingCodes' => ['synthetic-tid'],
    'attemptCount' => 1,
];

$hasOpenSsl = function_exists('openssl_encrypt') && function_exists('openssl_decrypt');
if ($hasOpenSsl) {
    $envelope = make_ins_v8_envelope($payload, $secret);
    $decrypted = cb_ins_v8_decode_envelope($envelope, $secret);
    expect_ins_v8(($decrypted->receipt ?? null) === $payload['receipt'], 'The encrypted envelope did not decrypt.');
} else {
    $decrypted = ins_v8_payload_object($payload);
}
$normalized = cb_ins_v8_normalize_payload($decrypted);

expect_ins_v8($normalized['role'] === 'AFFILIATE', 'The role was not preserved.');
expect_ins_v8($normalized['transaction_type'] === 'SALE', 'The transaction type was not preserved.');
expect_ins_v8($normalized['commission_total'] === '17.50', 'The account commission was not preserved.');
expect_ins_v8($normalized['sale_gross_total'] === '188.54', 'Gross sale value was not kept separately.');
expect_ins_v8($normalized['transaction_time_utc'] === '2026-10-17 05:40:00.000', 'The timestamp was not normalized to UTC.');
expect_ins_v8($normalized['customer_country'] === 'BR', 'The billing country was not reduced to an uppercase ISO alpha-2 code.');
expect_ins_v8(count($normalized['line_items']) === 2, 'The multi-item sale was not preserved.');
expect_ins_v8($normalized['commission_reconciliation_status'] === 'matched', 'The item commission sum did not reconcile.');
expect_ins_v8($normalized['gclid'] === null && $normalized['gclid_source'] === 'unresolved', 'An unverified affSub1 was promoted to GCLID.');
expect_ins_v8($normalized['aff_sub1'] === 'UNVERIFIED-GCLID-CANDIDATE', 'affSub1 was not retained separately.');
expect_ins_v8(!array_key_exists('customer', $normalized), 'Buyer data leaked into the normalized record.');
expect_ins_v8(!array_key_exists('customer_email', $normalized) && !array_key_exists('customer_address', $normalized), 'Buyer PII leaked into the normalized record.');
expect_ins_v8(!array_key_exists('attemptCount', $normalized), 'Delivery metadata leaked into the normalized record.');

$retryPayload = $payload;
$retryPayload['attemptCount'] = 4;
$retryPayload['customer']['billing']['email'] = 'different-private-value@example.invalid';
$retry = cb_ins_v8_normalize_payload(ins_v8_payload_object($retryPayload));
expect_ins_v8($normalized['event_key'] === $retry['event_key'], 'Delivery retries changed the idempotency key.');

$invalidCountry = $payload;
$invalidCountry['customer']['billing']['address']['country'] = 'Brazil';
expect_ins_v8(
    cb_ins_v8_normalize_payload(ins_v8_payload_object($invalidCountry))['customer_country'] === null,
    'A country value other than ISO alpha-2 should be ignored, not persisted.'
);

$changedProduct = $payload;
$changedProduct['lineItems'][1]['itemNo'] = 'SKU-C';
$changedEvent = cb_ins_v8_normalize_payload(ins_v8_payload_object($changedProduct));
expect_ins_v8($normalized['event_key'] !== $changedEvent['event_key'], 'Different item sets produced the same event key.');

[$gclid, $source] = cb_ins_v8_resolve_gclid(null, $payload['affiliateTrackingParameters']['extclid'], ['SYNTHETIC-GCLID-123']);
expect_ins_v8($gclid === 'SYNTHETIC-GCLID-123' && $source === 'extclid_join', 'An exact own-click match did not resolve.');
[$gclid, $source] = cb_ins_v8_resolve_gclid(null, $payload['affiliateTrackingParameters']['extclid'], []);
expect_ins_v8($gclid === null && $source === 'unresolved', 'An unmatched external ID was incorrectly treated as GCLID.');
[$gclid, $source] = cb_ins_v8_resolve_gclid('SYNTHETIC-GCLID-123', $payload['affiliateTrackingParameters']['extclid'], ['OTHER-GCLID']);
expect_ins_v8($gclid === null && $source === 'conflict', 'Conflicting attribution sources were not quarantined.');
$flowExtclid = 'flow-opaque-id-1234567890123456789012345678901234';
$flowLookup = clickbank_ins_v8_extclid_lookup($flowExtclid);
expect_ins_v8(
    $flowLookup !== null
        && $flowLookup['where'] === 'clickbank_extclid = :clickbank_extclid'
        && $flowLookup['parameters'][':clickbank_extclid'] === $flowExtclid,
    'A preserved non-UUID extclid was not mapped to the separate ClickBank identifier column.'
);
$legacyLookup = clickbank_ins_v8_extclid_lookup('4b38f55e-4fa1-4bc5-85c0-9920b6162b78');
expect_ins_v8(
    $legacyLookup !== null && str_contains($legacyLookup['where'], 'OR click_id = :legacy_click_id'),
    'Historical UUID click IDs stopped being eligible for exact matching.'
);
expect_ins_v8(clickbank_ins_v8_extclid_lookup(str_repeat('a', 257)) === null, 'Overlong extclid must not enter the lookup.');
expect_ins_v8(clickbank_ins_v8_extclid_lookup("bad\nvalue") === null, 'Control characters must not enter the lookup.');
[$gclid, $source, $changed] = cb_ins_v8_merge_attribution(null, 'unresolved', 'SYNTHETIC-GCLID-123', 'extclid_join');
expect_ins_v8($gclid === 'SYNTHETIC-GCLID-123' && $source === 'extclid_join' && $changed, 'A retry did not enrich an unresolved click attribution.');
[$gclid, $source, $changed] = cb_ins_v8_merge_attribution('SYNTHETIC-GCLID-123', 'extclid_join', null, 'unresolved');
expect_ins_v8($gclid === 'SYNTHETIC-GCLID-123' && $source === 'extclid_join' && !$changed, 'An unresolved retry downgraded existing attribution.');
[$gclid, $source, $changed] = cb_ins_v8_merge_attribution('SYNTHETIC-GCLID-123', 'extclid_join', 'OTHER-GCLID', 'explicit');
expect_ins_v8($gclid === null && $source === 'conflict' && $changed, 'Conflicting retry attribution was not quarantined.');

$mismatch = $payload;
$mismatch['lineItems'][0]['accountAmount'] = '13.00';
expect_ins_v8(
    cb_ins_v8_normalize_payload(ins_v8_payload_object($mismatch))['commission_reconciliation_status'] === 'mismatch',
    'A total/item commission mismatch was not detected.'
);

$testSale = $payload;
$testSale['transactionType'] = 'TEST_SALE';
expect_ins_v8(cb_ins_v8_normalize_payload(ins_v8_payload_object($testSale))['is_test'] === 1, 'Test sales were not marked as test events.');
$subscriptionChange = $payload;
$subscriptionChange['transactionType'] = 'SUBSCRIPTION-CHG SKU old-item->new-item';
expect_ins_v8(
    cb_ins_v8_normalize_payload(ins_v8_payload_object($subscriptionChange))['transaction_type'] === $subscriptionChange['transactionType'],
    'A subscription-change transaction type with product identifiers was not preserved.'
);

if ($hasOpenSsl) {
    $decryptionFailed = false;
    try {
        cb_ins_v8_decode_envelope($envelope, 'WRONG_SYNTHETIC');
    } catch (RuntimeException $error) {
        $decryptionFailed = true;
    }
    expect_ins_v8($decryptionFailed, 'A wrong key did not fail decryption.');
    $unauthorized = clickbank_ins_v8_handle_request('POST', $envelope, ['clickbank_ins_v8_secret_key' => 'WRONG_SYNTHETIC']);
    expect_ins_v8($unauthorized['status'] === 401, 'The endpoint did not reject an envelope encrypted with another key.');
} else {
    echo "Aviso: extensão PHP OpenSSL indisponível; teste criptográfico foi ignorado neste runtime.\n";
}

$invalidTimeFormatReason = null;
try {
    $invalidTimeFormat = $payload;
    $invalidTimeFormat['transactionTime'] = 'October 16, 2026 22:40:00';
    cb_ins_v8_normalize_payload(ins_v8_payload_object($invalidTimeFormat));
} catch (InvalidArgumentException $error) {
    $invalidTimeFormatReason = $error->getMessage();
}
expect_ins_v8($invalidTimeFormatReason === 'invalid_transaction_time_format', 'A non-ISO timestamp did not return its safe diagnostic code.');

$localTime = $payload;
$localTime['transactionTime'] = '2026-10-16T22:40:00';
$normalizedLocalTime = cb_ins_v8_normalize_payload(ins_v8_payload_object($localTime));
expect_ins_v8(
    $normalizedLocalTime['transaction_time_source'] === '2026-10-16T22:40:00'
        && $normalizedLocalTime['transaction_time_utc'] === null,
    'A timestamp without an offset was not preserved without inventing UTC.'
);

$basicTime = $payload;
$basicTime['transactionTime'] = '20261016T224000-0700';
$normalizedBasicTime = cb_ins_v8_normalize_payload(ins_v8_payload_object($basicTime));
expect_ins_v8(
    $normalizedBasicTime['transaction_time_utc'] === '2026-10-17 05:40:00.000',
    'An ISO 8601 basic timestamp with a compact offset did not normalize to UTC.'
);

$commaFractionTime = $payload;
$commaFractionTime['transactionTime'] = '2026-10-16T22:40:00,250-07:00';
$normalizedCommaFractionTime = cb_ins_v8_normalize_payload(ins_v8_payload_object($commaFractionTime));
expect_ins_v8(
    $normalizedCommaFractionTime['transaction_time_utc'] === '2026-10-17 05:40:00.250',
    'An ISO 8601 timestamp with a decimal comma did not normalize to UTC.'
);

$invalidCalendarTimeReason = null;
try {
    $invalidCalendarTime = $payload;
    $invalidCalendarTime['transactionTime'] = '2026-13-46T22:40:00-07:00';
    cb_ins_v8_normalize_payload(ins_v8_payload_object($invalidCalendarTime));
} catch (InvalidArgumentException $error) {
    $invalidCalendarTimeReason = $error->getMessage();
}
expect_ins_v8($invalidCalendarTimeReason === 'invalid_transaction_time_value', 'An impossible calendar timestamp did not return its safe diagnostic code.');

$invalidVersionReason = null;
try {
    $invalidVersion = $payload;
    $invalidVersion['version'] = '7';
    cb_ins_v8_normalize_payload(ins_v8_payload_object($invalidVersion));
} catch (InvalidArgumentException $error) {
    $invalidVersionReason = $error->getMessage();
}
expect_ins_v8($invalidVersionReason === 'invalid_version', 'An unsupported version did not return its safe diagnostic code.');
expect_ins_v8(
    cb_ins_v8_validation_reason_code(new InvalidArgumentException('buyer@example.invalid')) === 'invalid_payload',
    'A non-allowlisted validation message was not reduced to a safe generic code.'
);

$wrongMethod = clickbank_ins_v8_handle_request('GET', '', ['clickbank_ins_v8_secret_key' => $secret]);
expect_ins_v8($wrongMethod['status'] === 405, 'The receiver accepted a non-POST request.');
$invalidEnvelope = clickbank_ins_v8_handle_request('POST', '{"not":"an envelope"}', ['clickbank_ins_v8_secret_key' => $secret]);
if ($hasOpenSsl) {
    expect_ins_v8($invalidEnvelope['status'] === 400, 'A malformed envelope was not rejected cleanly.');
} else {
    expect_ins_v8($invalidEnvelope['status'] === 503, 'A runtime without OpenSSL was not reported as unavailable.');
}
$oversized = clickbank_ins_v8_handle_request('POST', str_repeat('x', 65537), ['clickbank_ins_v8_secret_key' => $secret]);
expect_ins_v8($oversized['status'] === 413, 'An oversized request was not rejected.');

if ($hasOpenSsl) {
    echo "Testes locais INS v8 (criptografia, normalização e regras) aprovados. Nenhuma conexão com banco foi aberta.\n";
} else {
    echo "Testes locais de normalização INS v8 aprovados. Nenhuma conexão com banco foi aberta.\n";
}
