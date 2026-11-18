<?php
declare(strict_types=1);

/**
 * Pure helpers for preparing ClickBank purchases for a manual Google Ads upload.
 * This file never connects to the database and never performs an upload.
 */

const GOOGLE_ADS_UPLOAD_HEADERS = [
    'Google Click ID',
    'Conversion Name',
    'Conversion Time',
    'Conversion Value',
    'Conversion Currency',
    'Order ID',
];

function google_ads_is_synthetic_gclid(?string $gclid): bool
{
    $gclid = trim((string)$gclid);
    return $gclid === '' || preg_match('/^(?:TEST|FAKE|DUMMY)(?:[-_]|$)/i', $gclid) === 1;
}

function google_ads_parse_clickbank_time(?string $value): ?DateTimeImmutable
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    $value = trim($value);
    $hasUtcLabel = preg_match('/\[UTC\]$/i', $value) === 1;
    if ($hasUtcLabel) {
        $value = substr($value, 0, -5);
        if (preg_match('/(?:Z|[+-]\d{2}:?\d{2})$/i', $value) !== 1) {
            $value .= 'Z';
        }
    }

    // Require an explicit timezone so the PHP/server timezone cannot change
    // the meaning of a ClickBank timestamp.
    if (preg_match('/(?:Z|[+-]\d{2}:?\d{2})$/i', $value) !== 1) {
        return null;
    }

    try {
        return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'));
    } catch (Throwable $error) {
        return null;
    }
}

function google_ads_parse_database_utc(?string $value): ?DateTimeImmutable
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    try {
        return new DateTimeImmutable($value, new DateTimeZone('UTC'));
    } catch (Throwable $error) {
        return null;
    }
}

/**
 * @return array{row: ?array, reason: string}
 */
function google_ads_prepare_conversion_row(array $record, string $conversionName): array
{
    if (strtoupper(trim((string)($record['event_type'] ?? ''))) !== 'PURCHASE') {
        return ['row' => null, 'reason' => 'not_initial_purchase'];
    }

    $externalClickId = trim((string)($record['extclid'] ?? ''));
    $matchedClickId = trim((string)($record['matched_click_id'] ?? ''));
    if ($externalClickId === '' || $matchedClickId === '' || strtolower($externalClickId) !== strtolower($matchedClickId)) {
        return ['row' => null, 'reason' => 'unmatched_click'];
    }

    $gclid = trim((string)($record['gclid'] ?? ''));
    if ($gclid === '') {
        return ['row' => null, 'reason' => 'missing_gclid'];
    }
    if (google_ads_is_synthetic_gclid($gclid)) {
        return ['row' => null, 'reason' => 'synthetic_gclid'];
    }

    $conversionTime = google_ads_parse_clickbank_time($record['event_time'] ?? null);
    $clickTime = google_ads_parse_database_utc($record['click_received_at_utc'] ?? null);
    if ($conversionTime === null || $clickTime === null) {
        return ['row' => null, 'reason' => 'invalid_or_missing_time'];
    }

    $ageSeconds = $conversionTime->getTimestamp() - $clickTime->getTimestamp();
    if ($ageSeconds < 0) {
        return ['row' => null, 'reason' => 'conversion_before_click'];
    }
    if ($ageSeconds > 90 * 24 * 60 * 60) {
        return ['row' => null, 'reason' => 'outside_90_day_window'];
    }

    $rawValue = trim((string)($record['affiliate_earnings'] ?? ''));
    if (preg_match('/^\d{1,12}(?:\.\d{1,2})?$/D', $rawValue) !== 1) {
        return ['row' => null, 'reason' => 'missing_or_invalid_affiliate_earnings'];
    }

    $currency = strtoupper(trim((string)($record['order_currency'] ?? '')));
    if (preg_match('/^[A-Z]{3}$/D', $currency) !== 1) {
        return ['row' => null, 'reason' => 'missing_or_invalid_currency'];
    }

    $orderId = trim((string)($record['receipt_id'] ?? ''));
    if ($orderId === '') {
        $orderId = trim((string)($record['order_id'] ?? ''));
    }
    if ($orderId === '') {
        $orderId = trim((string)($record['event_id'] ?? ''));
    }
    if ($orderId === '') {
        return ['row' => null, 'reason' => 'missing_order_identifier'];
    }

    $valueParts = explode('.', $rawValue, 2);
    $value = $valueParts[0] . '.' . str_pad($valueParts[1] ?? '', 2, '0');

    return [
        'row' => [
            'Google Click ID' => $gclid,
            'Conversion Name' => $conversionName,
            'Conversion Time' => $conversionTime->format('Y-m-d H:i:s') . '+0000',
            'Conversion Value' => $value,
            'Conversion Currency' => $currency,
            'Order ID' => $orderId,
        ],
        'reason' => 'eligible',
    ];
}

/**
 * @return array{rows: array<int, array<string, string>>, skipped: array<string, int>}
 */
function google_ads_build_export_rows(array $records, string $conversionName): array
{
    $rows = [];
    $skipped = [];
    $seenOrderIds = [];

    foreach ($records as $record) {
        $result = google_ads_prepare_conversion_row($record, $conversionName);
        if ($result['row'] === null) {
            $reason = $result['reason'];
            $skipped[$reason] = ($skipped[$reason] ?? 0) + 1;
            continue;
        }

        $orderId = $result['row']['Order ID'];
        if (isset($seenOrderIds[$orderId])) {
            $skipped['duplicate_order_id'] = ($skipped['duplicate_order_id'] ?? 0) + 1;
            continue;
        }

        $seenOrderIds[$orderId] = true;
        $rows[] = $result['row'];
    }

    return ['rows' => $rows, 'skipped' => $skipped];
}
