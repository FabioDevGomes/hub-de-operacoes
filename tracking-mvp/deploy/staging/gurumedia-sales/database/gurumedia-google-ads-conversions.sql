-- Run once in the Tracking MVP / Tracking API database, the same database
-- that already contains gurumedia_sales and tracking_allowed_domains.
-- Do not run this in the local Hub database or another site database.

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
