-- Additive queue for asynchronous ClickBank email notifications.
-- No buyer address, GCLID, extclid, SMTP credential, or raw INS payload is stored here.
-- Keep rows after delivery so duplicate INS retries cannot create a second email.

CREATE TABLE IF NOT EXISTS clickbank_ins_v8_email_outbox (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_id BIGINT UNSIGNED NOT NULL,
    event_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    notification_kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at_utc DATETIME(3) NOT NULL,
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at_utc DATETIME(3) NOT NULL,
    locked_until_utc DATETIME(3) NULL,
    sent_at_utc DATETIME(3) NULL,
    last_error_code VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_cb_ins_v8_email_tx_kind (transaction_id, notification_kind),
    KEY idx_cb_ins_v8_email_due (sent_at_utc, next_attempt_at_utc, locked_until_utc),
    CONSTRAINT fk_cb_ins_v8_email_transaction
        FOREIGN KEY (transaction_id)
        REFERENCES clickbank_ins_v8_transactions (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

