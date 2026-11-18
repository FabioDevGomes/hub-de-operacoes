<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$schema = file_get_contents($root . DIRECTORY_SEPARATOR . 'clickbank-postback.sql');
$migration = file_get_contents($root . DIRECTORY_SEPARATOR . 'clickbank-postback-event-type-key.sql');
$endpoint = file_get_contents($root . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'clickbank-postback.php');

function expect_postback_event_key(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

expect_postback_event_key(is_string($schema) && str_contains($schema, 'UNIQUE KEY uq_clickbank_postback_event_type (event_id, event_type)'), 'Fresh installs must deduplicate by event ID and event type.');
expect_postback_event_key(is_string($migration)
    && str_contains($migration, 'DROP INDEX uq_clickbank_postback_event_id')
    && str_contains($migration, 'UNIQUE KEY uq_clickbank_postback_event_type (event_id, event_type)'), 'Existing installs need the one-time composite-key migration.');
expect_postback_event_key(is_string($endpoint)
    && preg_match('/WHERE event_id = :event_id AND event_type = :event_type/', $endpoint) === 1, 'Duplicate detection and event lookup must scope by event type.');

echo "Postback ClickBank: deduplicação por ID e tipo de evento conferida.\n";
