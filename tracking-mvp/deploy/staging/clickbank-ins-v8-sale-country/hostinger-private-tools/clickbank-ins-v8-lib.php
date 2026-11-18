<?php
declare(strict_types=1);

/**
 * Pure parsing and normalization helpers for ClickBank INS v8.
 * This file never connects to a database and never logs notification contents.
 */

function cb_ins_v8_decode_envelope(string $rawBody, string $secretKey): stdClass
{
    if ($rawBody === '' || strlen($rawBody) > 65536 || $secretKey === '' || strlen($secretKey) > 16) {
        throw new InvalidArgumentException('invalid_envelope');
    }

    try {
        $envelope = json_decode($rawBody, false, 16, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new InvalidArgumentException('invalid_envelope');
    }
    if (!$envelope instanceof stdClass
        || !isset($envelope->notification, $envelope->iv)
        || !is_string($envelope->notification)
        || !is_string($envelope->iv)) {
        throw new InvalidArgumentException('invalid_envelope');
    }

    $ciphertext = base64_decode($envelope->notification, true);
    $iv = base64_decode($envelope->iv, true);
    if (!is_string($ciphertext) || $ciphertext === '' || strlen($ciphertext) % 16 !== 0
        || !is_string($iv) || strlen($iv) !== 16) {
        throw new InvalidArgumentException('invalid_envelope');
    }

    // This matches ClickBank's published PHP sample: SHA-1 hex, first 32 chars.
    $key = substr(sha1($secretKey), 0, 32);
    $decrypted = openssl_decrypt($ciphertext, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
    if (!is_string($decrypted)) {
        throw new RuntimeException('decryption_failed');
    }

    // ClickBank's sample removes PKCS#7 padding as control bytes before JSON parsing.
    $decrypted = rtrim($decrypted, "\0..\x20");
    try {
        $payload = json_decode($decrypted, false, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new RuntimeException('decryption_failed');
    }
    if (!$payload instanceof stdClass) {
        throw new RuntimeException('decryption_failed');
    }
    return $payload;
}

function cb_ins_v8_optional_text(
    $value,
    int $maxBytes,
    bool $ascii = false,
    bool $acceptInteger = false,
    string $reasonCode = 'invalid_text'
): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if ($acceptInteger && is_int($value)) {
        $value = (string)$value;
    }
    if (!is_string($value) || strlen($value) > $maxBytes
        || preg_match('/[\x00-\x1F\x7F]/', $value)
        || preg_match('//u', $value) !== 1) {
        throw new InvalidArgumentException($reasonCode);
    }
    if ($ascii && preg_match('/^[\x20-\x7E]+$/D', $value) !== 1) {
        throw new InvalidArgumentException($reasonCode);
    }
    return $value;
}

function cb_ins_v8_decimal(
    $value,
    int $scale,
    bool $allowNegative = true,
    int $maxIntegerDigits = 10,
    string $reasonCode = 'invalid_decimal'
): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (is_int($value)) {
        $value = (string)$value;
    } elseif (is_float($value) && is_finite($value)) {
        // json_encode returns PHP's shortest round-trip decimal representation.
        $value = json_encode($value, JSON_PRESERVE_ZERO_FRACTION);
    }
    if (!is_string($value) || strlen($value) > 32) {
        throw new InvalidArgumentException($reasonCode);
    }

    $sign = $allowNegative ? '-?' : '';
    $pattern = '/^' . $sign . '(?:0|[1-9]\d{0,' . ($maxIntegerDigits - 1) . '})(?:\.\d{1,' . $scale . '})?$/D';
    if (preg_match($pattern, $value) !== 1) {
        throw new InvalidArgumentException($reasonCode);
    }
    return $value;
}

function cb_ins_v8_parse_time($value): array
{
    $source = cb_ins_v8_optional_text($value, 64, true, false, 'invalid_transaction_time_value');
    if ($source === null) {
        return [null, null];
    }
    $pattern = '/^(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}|\d{8}T\d{6})(?:[.,]\d+)?(?<zone>Z|[+-]\d{2}(?::?\d{2})?)?$/iD';
    if (preg_match($pattern, $source, $matches) !== 1) {
        throw new InvalidArgumentException('invalid_transaction_time_format');
    }

    // Accept ISO 8601 extended/basic notation and normalize variants for PHP's parser.
    $parseSource = str_replace(['t', ','], ['T', '.'], $source);
    $zone = $matches['zone'] ?? '';
    if ($zone !== '') {
        if (strtoupper($zone) === 'Z') {
            $normalizedZone = '+00:00';
        } elseif (preg_match('/^([+-]\d{2})(\d{2})$/D', $zone, $zoneParts) === 1) {
            $normalizedZone = $zoneParts[1] . ':' . $zoneParts[2];
        } elseif (preg_match('/^([+-]\d{2})$/D', $zone, $zoneParts) === 1) {
            $normalizedZone = $zoneParts[1] . ':00';
        } else {
            $normalizedZone = $zone;
        }
        $parseSource = preg_replace('/(?:Z|[+-]\d{2}:?\d{2}|[+-]\d{2})$/i', $normalizedZone, $parseSource) ?? $parseSource;
    }

    try {
        $date = new DateTimeImmutable($parseSource);
    } catch (Throwable $error) {
        throw new InvalidArgumentException('invalid_transaction_time_value');
    }
    $parseErrors = DateTimeImmutable::getLastErrors();
    if (is_array($parseErrors) && ($parseErrors['warning_count'] > 0 || $parseErrors['error_count'] > 0)) {
        throw new InvalidArgumentException('invalid_transaction_time_value');
    }

    // Preserve local wall time when no zone was supplied, but never invent a UTC offset.
    $utc = $zone === '' ? null : $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
    return [$source, $utc];
}

function cb_ins_v8_object_field($value, string $reasonCode = 'invalid_object'): ?stdClass
{
    if ($value === null) {
        return null;
    }
    if (!$value instanceof stdClass) {
        throw new InvalidArgumentException($reasonCode);
    }
    return $value;
}

/** Keep only the ISO 3166-1 alpha-2 billing country; never retain customer address fields. */
function cb_ins_v8_customer_country_code(stdClass $payload): ?string
{
    $customer = $payload->customer ?? null;
    $billing = $customer instanceof stdClass ? ($customer->billing ?? null) : null;
    $address = $billing instanceof stdClass ? ($billing->address ?? null) : null;
    $country = $address instanceof stdClass ? ($address->country ?? null) : null;
    if (!is_string($country)) {
        return null;
    }
    $country = strtoupper(trim($country));
    return preg_match('/^[A-Z]{2}$/D', $country) === 1 ? $country : null;
}

function cb_ins_v8_normalize_payload(stdClass $payload): array
{
    $version = $payload->version ?? null;
    if (!in_array((string)$version, ['8', '8.0'], true)) {
        throw new InvalidArgumentException('invalid_version');
    }

    $role = cb_ins_v8_optional_text($payload->role ?? null, 32, true, false, 'invalid_role');
    if ($role === null) {
        throw new InvalidArgumentException('invalid_role');
    }
    $transactionType = cb_ins_v8_optional_text($payload->transactionType ?? null, 48, true, false, 'invalid_transaction_type');
    if ($transactionType === null) {
        throw new InvalidArgumentException('invalid_transaction_type');
    }
    $role = strtoupper($role);
    if (!in_array($role, ['AFFILIATE', 'VENDOR', 'JV_UPSELL'], true)) {
        throw new InvalidArgumentException('invalid_role');
    }
    if (trim($transactionType) === '' || preg_match('/^[\x20-\x7E]+$/D', $transactionType) !== 1) {
        throw new InvalidArgumentException('invalid_transaction_type');
    }

    [$transactionTimeSource, $transactionTimeUtc] = cb_ins_v8_parse_time($payload->transactionTime ?? null);
    $receiptId = cb_ins_v8_optional_text($payload->receipt ?? null, 128, true, false, 'invalid_receipt');
    $commissionTotal = cb_ins_v8_decimal($payload->totalAccountAmount ?? null, 4, true, 10, 'invalid_commission_total');
    $saleGrossTotal = cb_ins_v8_decimal($payload->totalOrderAmount ?? null, 4, true, 10, 'invalid_sale_gross_total');
    $upsell = cb_ins_v8_object_field($payload->upsell ?? null, 'invalid_upsell');
    $upsellOriginalReceipt = cb_ins_v8_optional_text(
        $upsell->upsellOriginalReceipt ?? null,
        128,
        true,
        false,
        'invalid_upsell_original_receipt'
    );

    $currency = cb_ins_v8_optional_text($payload->currency ?? null, 3, true, false, 'invalid_currency');
    if ($currency === null) {
        $currency = 'USD';
    }
    $currency = strtoupper($currency);
    if (preg_match('/^[A-Z]{3}$/D', $currency) !== 1) {
        throw new InvalidArgumentException('invalid_currency');
    }

    $lineItems = $payload->lineItems ?? [];
    if (!is_array($lineItems) || count($lineItems) > 100) {
        throw new InvalidArgumentException('invalid_line_items');
    }
    $normalizedItems = [];
    foreach ($lineItems as $index => $item) {
        if (!$item instanceof stdClass || $index > 65535) {
            throw new InvalidArgumentException('invalid_line_item');
        }
        $normalizedItems[] = [
            'line_index' => $index,
            'product_item_no' => cb_ins_v8_optional_text($item->itemNo ?? null, 128, true, true, 'invalid_product_item_no'),
            'product_title' => cb_ins_v8_optional_text($item->productTitle ?? null, 512, false, false, 'invalid_product_title'),
            'line_item_type' => cb_ins_v8_optional_text($item->lineItemType ?? null, 32, true, false, 'invalid_line_item_type'),
            'quantity' => cb_ins_v8_decimal($item->quantity ?? null, 3, false, 9, 'invalid_quantity'),
            'commission_amount' => cb_ins_v8_decimal($item->accountAmount ?? null, 4, true, 10, 'invalid_item_commission'),
            'product_price' => cb_ins_v8_decimal($item->productPrice ?? null, 4, false, 10, 'invalid_product_price'),
            'product_discount' => cb_ins_v8_decimal($item->productDiscount ?? null, 4, false, 10, 'invalid_product_discount'),
        ];
    }

    $tracking = cb_ins_v8_object_field($payload->affiliateTrackingParameters ?? null, 'invalid_affiliate_tracking_parameters');
    $commonTracking = cb_ins_v8_object_field($payload->commonTrackingParameters ?? null, 'invalid_common_tracking_parameters');
    $explicitGclid = cb_ins_v8_optional_text($payload->gclid ?? $tracking->gclid ?? null, 2048, true, false, 'invalid_gclid');
    $extclid = cb_ins_v8_optional_text($tracking->extclid ?? null, 256, true, false, 'invalid_extclid');
    $affSub1 = cb_ins_v8_optional_text($tracking->affSub1 ?? null, 255, true, false, 'invalid_aff_sub1');
    $clickbankClickId = cb_ins_v8_optional_text($commonTracking->clickId ?? null, 255, true, false, 'invalid_clickbank_click_id');

    $trackingId = null;
    if (isset($payload->trackingCodes)) {
        if (!is_array($payload->trackingCodes)) {
            throw new InvalidArgumentException('invalid_tracking_codes');
        }
        if (isset($payload->trackingCodes[0])) {
            $trackingId = cb_ins_v8_optional_text($payload->trackingCodes[0], 128, true, false, 'invalid_tracking_id');
        }
    }

    $isTest = preg_match('/^(?:TEST(?:_|$)|CANCEL-TEST|UNCANCEL-TEST)/', strtoupper($transactionType)) === 1;
    $normalized = [
        'source' => 'clickbank_ins_v8',
        'ins_version' => 8,
        'role' => $role,
        'transaction_type' => $transactionType,
        'receipt_id' => $receiptId,
        'transaction_time_source' => $transactionTimeSource,
        'transaction_time_utc' => $transactionTimeUtc,
        'customer_country' => cb_ins_v8_customer_country_code($payload),
        'commission_total' => $commissionTotal,
        'sale_gross_total' => $saleGrossTotal,
        'commission_currency' => $currency,
        'upsell_original_receipt' => $upsellOriginalReceipt,
        'gclid' => $explicitGclid,
        'extclid' => $extclid,
        'aff_sub1' => $affSub1,
        'clickbank_click_id' => $clickbankClickId,
        'tracking_id' => $trackingId,
        'gclid_source' => $explicitGclid === null ? 'unresolved' : 'explicit',
        'commission_reconciliation_status' => cb_ins_v8_reconcile_commission($commissionTotal, $normalizedItems),
        'is_test' => $isTest ? 1 : 0,
        'line_items' => $normalizedItems,
    ];
    $normalized['event_key'] = cb_ins_v8_event_key($normalized);
    return $normalized;
}

/** Return only an allowlisted, non-sensitive field diagnostic for database audit. */
function cb_ins_v8_validation_reason_code(Throwable $error): string
{
    static $safeCodes = [
        'invalid_version', 'invalid_role', 'invalid_transaction_type', 'invalid_transaction_time_format',
        'invalid_transaction_time_value',
        'invalid_receipt', 'invalid_commission_total', 'invalid_sale_gross_total', 'invalid_upsell',
        'invalid_upsell_original_receipt', 'invalid_currency', 'invalid_line_items', 'invalid_line_item',
        'invalid_product_item_no', 'invalid_product_title', 'invalid_line_item_type', 'invalid_quantity',
        'invalid_item_commission', 'invalid_product_price', 'invalid_product_discount',
        'invalid_affiliate_tracking_parameters', 'invalid_common_tracking_parameters', 'invalid_gclid',
        'invalid_extclid', 'invalid_aff_sub1', 'invalid_clickbank_click_id', 'invalid_tracking_codes',
        'invalid_tracking_id', 'invalid_text', 'invalid_decimal', 'invalid_object',
    ];
    $reasonCode = $error->getMessage();
    return in_array($reasonCode, $safeCodes, true) ? $reasonCode : 'invalid_payload';
}

function cb_ins_v8_decimal_units(?string $amount, int $scale = 4): ?int
{
    if ($amount === null) {
        return null;
    }
    $negative = str_starts_with($amount, '-');
    if ($negative) {
        $amount = substr($amount, 1);
    }
    [$whole, $fraction] = array_pad(explode('.', $amount, 2), 2, '');
    $fraction = str_pad($fraction, $scale, '0');
    $units = ((int)$whole * (10 ** $scale)) + (int)$fraction;
    return $negative ? -$units : $units;
}

function cb_ins_v8_reconcile_commission(?string $total, array $items): string
{
    if ($total === null || $items === []) {
        return 'unavailable';
    }
    $sum = 0;
    foreach ($items as $item) {
        if ($item['commission_amount'] === null) {
            return 'unavailable';
        }
        $units = cb_ins_v8_decimal_units($item['commission_amount']);
        if ($units === null) {
            return 'unavailable';
        }
        $sum += $units;
    }
    return cb_ins_v8_decimal_units($total) === $sum ? 'matched' : 'mismatch';
}

function cb_ins_v8_event_key(array $event): string
{
    $identity = [
        $event['role'],
        $event['receipt_id'],
        $event['transaction_type'],
        $event['transaction_time_source'],
        $event['commission_total'],
        $event['sale_gross_total'],
        $event['commission_currency'],
        $event['upsell_original_receipt'],
        $event['line_items'],
    ];
    $canonical = json_encode($identity, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    return hash('sha256', $canonical);
}

/** Resolve attribution only from an explicit GCLID or an exact own-click extclid join. */
function cb_ins_v8_resolve_gclid(?string $explicit, ?string $extclid, array $matchedGclids): array
{
    $matchedGclids = array_values(array_unique(array_filter($matchedGclids, static fn($value): bool =>
        is_string($value) && $value !== ''
    )));
    if ($explicit !== null) {
        if (count($matchedGclids) > 1
            || (count($matchedGclids) === 1 && !in_array($explicit, $matchedGclids, true))) {
            return [null, 'conflict'];
        }
        return [$explicit, 'explicit'];
    }
    if ($extclid !== null && count($matchedGclids) === 1) {
        return [$matchedGclids[0], 'extclid_join'];
    }
    if ($extclid !== null && count($matchedGclids) > 1) {
        return [null, 'conflict'];
    }
    // affSub1 is retained separately; it is not promoted until its use as GCLID is verified.
    return [null, 'unresolved'];
}

/** Merge attribution from a retry without downgrading a resolved value. */
function cb_ins_v8_merge_attribution(
    ?string $existingGclid,
    string $existingSource,
    ?string $incomingGclid,
    string $incomingSource
): array {
    if ($existingSource === 'conflict') {
        return [null, 'conflict', false];
    }
    if ($incomingSource === 'conflict') {
        return [null, 'conflict', $existingSource !== 'conflict'];
    }

    $trustedSources = ['explicit', 'extclid_join'];
    $incomingResolved = $incomingGclid !== null && in_array($incomingSource, $trustedSources, true);
    $existingResolved = $existingGclid !== null && in_array($existingSource, $trustedSources, true);

    if (!$existingResolved && $incomingResolved) {
        return [$incomingGclid, $incomingSource, true];
    }
    if ($existingResolved && $incomingResolved && $existingGclid !== $incomingGclid) {
        return [null, 'conflict', true];
    }
    return [$existingGclid, $existingSource, false];
}
