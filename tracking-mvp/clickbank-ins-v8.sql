-- Additive migration for the separate ClickBank INS v8 receiver.
-- Creates new tables only. It does not alter or delete legacy tracking/postback data.
-- Do not store raw INS payloads, buyer PII, authentication tokens, or encryption keys here.
-- The application must normalize transaction_time_utc and received_at_utc to UTC.

CREATE TABLE IF NOT EXISTS clickbank_ins_v8_transactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'clickbank_ins_v8',
    ins_version SMALLINT UNSIGNED NOT NULL DEFAULT 8,
    role VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    transaction_type VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    -- SHA-256 hex from canonical business fields; do not make receipt/type alone unique.
    event_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    receipt_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    transaction_time_source VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    transaction_time_utc DATETIME(3) NULL,
    commission_total DECIMAL(14,4) NULL,
    sale_gross_total DECIMAL(14,4) NULL,
    commission_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
    upsell_original_receipt VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,

    -- Attribution identifiers stay separate. gclid is the resolved value, not extclid/TID.
    gclid VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin NULL,
    extclid VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NULL,
    aff_sub1 VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
    clickbank_click_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
    tracking_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    gclid_source VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'unresolved',

    -- Set by validated application logic; reconciliation state: pending/matched/mismatch/unavailable.
    commission_reconciliation_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
    is_test TINYINT(1) NOT NULL DEFAULT 0,
    received_at_utc DATETIME(3) NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_cb_ins_v8_event_key (event_key),
    KEY idx_cb_ins_v8_receipt (receipt_id),
    KEY idx_cb_ins_v8_type_time (transaction_type, transaction_time_utc),
    KEY idx_cb_ins_v8_extclid (extclid),
    KEY idx_cb_ins_v8_received (received_at_utc),
    KEY idx_cb_ins_v8_gclid (gclid(128))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clickbank_ins_v8_line_items (
    transaction_id BIGINT UNSIGNED NOT NULL,
    line_index SMALLINT UNSIGNED NOT NULL,
    product_item_no VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    product_title VARCHAR(512) NULL,
    line_item_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    quantity DECIMAL(12,3) NULL,
    commission_amount DECIMAL(14,4) NULL,
    product_price DECIMAL(14,4) NULL,
    product_discount DECIMAL(14,4) NULL,

    PRIMARY KEY (transaction_id, line_index),
    KEY idx_cb_ins_v8_item_no (product_item_no),
    KEY idx_cb_ins_v8_line_type (line_item_type),
    CONSTRAINT fk_cb_ins_v8_line_transaction
        FOREIGN KEY (transaction_id)
        REFERENCES clickbank_ins_v8_transactions (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per request accepted for processing, including retries and post-auth failures.
-- Intentionally excludes request URL, headers, token, raw payload, GCLID, and buyer data.
-- attempt_result/reason_code are short application-defined diagnostic labels, not raw errors.
CREATE TABLE IF NOT EXISTS clickbank_ins_v8_attempts (
    attempt_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    received_at_utc DATETIME(3) NOT NULL,
    diagnostic_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    event_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    attempt_result VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reason_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    http_status SMALLINT UNSIGNED NULL,

    PRIMARY KEY (attempt_id),
    KEY idx_cb_ins_v8_attempt_received (received_at_utc),
    KEY idx_cb_ins_v8_attempt_diagnostic (diagnostic_id),
    KEY idx_cb_ins_v8_attempt_event (event_key),
    KEY idx_cb_ins_v8_attempt_result (attempt_result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
