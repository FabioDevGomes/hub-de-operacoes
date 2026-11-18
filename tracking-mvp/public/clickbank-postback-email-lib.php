<?php
declare(strict_types=1);

/** Return the notification category only for ClickBank's initial order-form visit. */
function clickbank_postback_email_notification_kind($eventType): ?string
{
    if (!is_string($eventType)) {
        return null;
    }
    $normalized = strtolower(trim($eventType));
    $normalized = preg_replace('/[^a-z0-9]+/', '_', $normalized) ?? '';
    $normalized = trim($normalized, '_');
    return in_array($normalized, ['order_impression', 'order_form_impression'], true)
        ? 'checkout'
        : null;
}

/** Queue a reference to an already stored postback event, idempotently. */
function clickbank_postback_email_enqueue(PDO $pdo, int $postbackEventId, string $eventType): bool
{
    $kind = clickbank_postback_email_notification_kind($eventType);
    if ($kind === null) {
        return false;
    }
    if ($postbackEventId < 1) {
        throw new RuntimeException('notification_reference_invalid');
    }
    $statement = $pdo->prepare(
        'INSERT IGNORE INTO clickbank_postback_email_outbox
            (postback_event_id, notification_kind, created_at_utc, next_attempt_at_utc)
         VALUES (:postback_event_id, :notification_kind, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))'
    );
    $statement->execute([
        ':postback_event_id' => $postbackEventId,
        ':notification_kind' => $kind,
    ]);
    return $statement->rowCount() === 1;
}
