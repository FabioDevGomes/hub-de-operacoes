-- Additive migration: creates a separate ClickBank event table and preserves
-- the existing tracking_events records and schema.
CREATE TABLE IF NOT EXISTS clickbank_postback_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    receipt_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    order_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    extclid VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NULL,
    affiliate_earnings DECIMAL(14,2) NULL,
    total_transaction_amount DECIMAL(14,2) NULL,
    order_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
    event_time VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    received_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_clickbank_postback_event_type (event_id, event_type),
    KEY idx_clickbank_postback_extclid (extclid),
    KEY idx_clickbank_postback_receipt_id (receipt_id),
    KEY idx_clickbank_postback_order_id (order_id),
    KEY idx_clickbank_postback_received_at (received_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
