-- Additive queue for email alerts about ClickBank order-form impressions.
-- Stores only an event reference and retry state; no click IDs or customer data.
CREATE TABLE IF NOT EXISTS clickbank_postback_email_outbox (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    postback_event_id BIGINT UNSIGNED NOT NULL,
    notification_kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at_utc DATETIME(3) NOT NULL,
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at_utc DATETIME(3) NOT NULL,
    locked_until_utc DATETIME(3) NULL,
    sent_at_utc DATETIME(3) NULL,
    last_error_code VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_cb_postback_email_event_kind (postback_event_id, notification_kind),
    KEY idx_cb_postback_email_due (sent_at_utc, next_attempt_at_utc, locked_until_utc),
    CONSTRAINT fk_cb_postback_email_event
        FOREIGN KEY (postback_event_id)
        REFERENCES clickbank_postback_events (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
