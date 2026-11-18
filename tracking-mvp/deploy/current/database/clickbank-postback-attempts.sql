-- Additive audit table for authenticated ClickBank postback attempts.
-- It stores no token, raw URL, customer data, or full external click ID.
CREATE TABLE IF NOT EXISTS clickbank_postback_attempts (
    attempt_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    received_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    diagnostic_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    event_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    event_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    insert_result VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    http_status SMALLINT UNSIGNED NOT NULL,
    has_extclid TINYINT(1) NOT NULL DEFAULT 0,
    matched_click TINYINT(1) NULL,
    PRIMARY KEY (attempt_id),
    KEY idx_cb_attempt_received (received_at_utc),
    KEY idx_cb_attempt_event_id (event_id),
    KEY idx_cb_attempt_diagnostic (diagnostic_id),
    KEY idx_cb_attempt_result (insert_result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
