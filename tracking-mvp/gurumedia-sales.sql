CREATE TABLE IF NOT EXISTS gurumedia_sales (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    transaction_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    click_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    offer_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    offer_name VARCHAR(253) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    payout_amount DECIMAL(14,4) NOT NULL,
    currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    product_key VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NULL,
    product_label VARCHAR(253) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    presell_host VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    conversion_at_utc DATETIME(3) NULL,
    received_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_gurumedia_sales_sale_key (sale_key),
    UNIQUE KEY uq_gurumedia_sales_transaction_id (transaction_id),
    KEY idx_gurumedia_sales_received_at (received_at_utc),
    KEY idx_gurumedia_sales_track (product_key, presell_host),
    KEY idx_gurumedia_sales_currency (currency),
    KEY idx_gurumedia_sales_conversion_at (conversion_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gurumedia_postback_attempts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    result_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    has_click_id TINYINT(1) NOT NULL DEFAULT 0,
    offer_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    offer_name VARCHAR(253) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    payout_amount DECIMAL(14,4) NULL,
    currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
    conversion_at_utc DATETIME(3) NULL,
    product_key VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NULL,
    product_label VARCHAR(253) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    presell_host VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NULL,
    offer_mapping_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL,
    attempt_count INT UNSIGNED NOT NULL DEFAULT 1,
    first_received_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_received_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_gurumedia_attempt_transaction_hash (transaction_hash),
    KEY idx_gurumedia_attempt_result_time (result_code, last_received_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One asynchronous warning per unmatched callback from a registered offer.
-- The attempt stores a transaction hash, not the transaction ID or buyer data.
CREATE TABLE IF NOT EXISTS gurumedia_postback_email_outbox (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    postback_attempt_id BIGINT UNSIGNED NOT NULL,
    notification_kind VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at_utc DATETIME(3) NOT NULL,
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at_utc DATETIME(3) NOT NULL,
    locked_until_utc DATETIME(3) NULL,
    sent_at_utc DATETIME(3) NULL,
    last_error_code VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_gurumedia_postback_email_attempt_kind (postback_attempt_id, notification_kind),
    KEY idx_gurumedia_postback_email_due (sent_at_utc, next_attempt_at_utc, locked_until_utc),
    CONSTRAINT fk_gurumedia_postback_email_attempt
        FOREIGN KEY (postback_attempt_id)
        REFERENCES gurumedia_postback_attempts (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One asynchronous email notification per newly recorded, Hub-attributed sale.
-- The row stores only a sale reference and retry state; SMTP credentials live in
-- the shared private tracking-email-config.php file.
CREATE TABLE IF NOT EXISTS gurumedia_sales_email_outbox (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_id BIGINT UNSIGNED NOT NULL,
    notification_kind VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at_utc DATETIME(3) NOT NULL,
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at_utc DATETIME(3) NOT NULL,
    locked_until_utc DATETIME(3) NULL,
    sent_at_utc DATETIME(3) NULL,
    last_error_code VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_gurumedia_email_sale_kind (sale_id, notification_kind),
    KEY idx_gurumedia_email_due (sent_at_utc, next_attempt_at_utc, locked_until_utc),
    CONSTRAINT fk_gurumedia_email_sale
        FOREIGN KEY (sale_id)
        REFERENCES gurumedia_sales (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data Manager conversion delivery. Automatic sending starts disabled.
CREATE TABLE IF NOT EXISTS gurumedia_google_ads_settings (
    id TINYINT UNSIGNED NOT NULL,
    live_enabled TINYINT(1) NOT NULL DEFAULT 0,
    updated_at_utc DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_gurumedia_ads_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gurumedia_google_ads_settings (id, live_enabled, updated_at_utc)
VALUES (1, 0, UTC_TIMESTAMP(3));

CREATE TABLE IF NOT EXISTS gurumedia_google_ads_routes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    presell_host VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    product_key VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    customer_id CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    mcc_customer_id CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    conversion_action_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    updated_at_utc DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_gurumedia_ads_route_track (presell_host, product_key),
    KEY idx_gurumedia_ads_route_mcc (mcc_customer_id, conversion_action_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gurumedia_google_ads_outbox (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_id BIGINT UNSIGNED NOT NULL,
    mcc_customer_id CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    conversion_action_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    validation_at_utc DATETIME(3) NULL,
    validation_event_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    validation_request_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    request_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    request_accepted_at_utc DATETIME(3) NULL,
    status_checked_at_utc DATETIME(3) NULL,
    last_error_code VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_at_utc DATETIME(3) NOT NULL,
    next_attempt_at_utc DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_gurumedia_ads_outbox_sale (sale_id),
    KEY idx_gurumedia_ads_outbox_due (status, next_attempt_at_utc),
    KEY idx_gurumedia_ads_outbox_request (request_id),
    CONSTRAINT fk_gurumedia_ads_outbox_sale
        FOREIGN KEY (sale_id)
        REFERENCES gurumedia_sales (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
