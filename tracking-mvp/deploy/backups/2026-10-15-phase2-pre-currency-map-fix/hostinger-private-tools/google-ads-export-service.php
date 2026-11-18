<?php
declare(strict_types=1);

// Shared, side-effect-free service used by the private CLI and authenticated
// public API. Requiring this file never opens a database connection.
require_once __DIR__ . DIRECTORY_SEPARATOR . 'google-ads-export-lib.php';

const MAX_EXPORT_CANDIDATES = 5001;

function google_ads_load_tracking_config(): array
{
    // Keep compatibility with the documented sibling location and the
    // nested Hostinger layout already used by the private CLI exporter.
    $configCandidates = [
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tracking-config.php',
        dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'tracking-config.php',
    ];
    $configPath = null;
    foreach ($configCandidates as $candidate) {
        if (is_file($candidate)) {
            $configPath = $candidate;
            break;
        }
    }
    if ($configPath === null) {
        throw new RuntimeException('Private tracking configuration is missing.');
    }

    $config = require $configPath;
    if (!is_array($config)) {
        throw new RuntimeException('Private tracking configuration is invalid.');
    }
    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key]) || $config[$key] === '') {
            throw new RuntimeException('Private database configuration is incomplete.');
        }
    }
    return $config;
}

function google_ads_cutoff_utc(?string $since): DateTimeImmutable
{
    $utc = new DateTimeZone('UTC');
    if ($since === null || $since === '') {
        return (new DateTimeImmutable('now', $utc))->modify('-90 days');
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $since, $utc);
    $errors = DateTimeImmutable::getLastErrors();
    if ($date === false || (is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        throw new InvalidArgumentException('--since must use YYYY-MM-DD.');
    }
    return $date;
}

/** Read-only query of ClickBank candidates and their matching outbound clicks. */
function google_ads_fetch_purchase_candidates(array $config, DateTimeImmutable $cutoff): array
{
    $dsn = 'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");

    $statement = $pdo->prepare(
        "SELECT cb.event_id, cb.event_type, cb.receipt_id, cb.order_id, cb.extclid,
                cb.affiliate_earnings, cb.order_currency, cb.event_time,
                te.click_id AS matched_click_id, te.gclid,
                te.received_at_utc AS click_received_at_utc
         FROM clickbank_postback_events AS cb
         LEFT JOIN tracking_events AS te
           ON te.event_type = 'outbound_click' AND te.click_id = cb.extclid
         WHERE UPPER(cb.event_type) = 'PURCHASE'
           AND cb.received_at_utc >= :cutoff
         ORDER BY cb.id ASC
         LIMIT " . MAX_EXPORT_CANDIDATES
    );
    $statement->execute([':cutoff' => $cutoff->format('Y-m-d H:i:s')]);
    return $statement->fetchAll();
}

/** Build the same validated export rows for CLI previews and Hub requests. */
function google_ads_collect_export(array $config, string $conversionName, ?string $since = null): array
{
    $cutoff = google_ads_cutoff_utc($since);
    $records = google_ads_fetch_purchase_candidates($config, $cutoff);
    if (count($records) >= MAX_EXPORT_CANDIDATES) {
        throw new RuntimeException('More than 5,000 candidates; narrow the date window.');
    }
    $result = google_ads_build_export_rows($records, $conversionName);
    return [
        'cutoff_utc' => $cutoff->format('Y-m-d H:i:s'),
        'candidate_count' => count($records),
        'rows' => $result['rows'],
        'skipped' => $result['skipped'],
    ];
}
