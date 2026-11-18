-- Add GuruMedia offer-to-Track mapping and durable warnings for matched offers
-- whose click ID cannot be associated with exactly one outbound event.
-- In Hostinger phpMyAdmin, select the MySQL database used by Tracking MVP / Tracking API:
-- the same database that already contains tracking_allowed_domains and the existing GuruMedia tables.
-- Do not run against the Hub's local data or another website database. Confirm the database in
-- Hostinger's database list if its name is unclear. Run after tracking-platform-classification.sql.

SET @gurumedia_offer_id_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_allowed_domains' AND COLUMN_NAME = 'offer_id') = 0,
    'ALTER TABLE tracking_allowed_domains ADD COLUMN offer_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'SELECT ''SKIP: tracking_allowed_domains.offer_id already exists'''
);
PREPARE gurumedia_offer_id_stmt FROM @gurumedia_offer_id_sql;
EXECUTE gurumedia_offer_id_stmt;
DEALLOCATE PREPARE gurumedia_offer_id_stmt;

SET @gurumedia_offer_id_index_sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_allowed_domains' AND INDEX_NAME = 'idx_tracking_domains_platform_offer') = 0,
    'ALTER TABLE tracking_allowed_domains ADD KEY idx_tracking_domains_platform_offer (platform, offer_id)',
    'SELECT ''SKIP: idx_tracking_domains_platform_offer already exists'''
);
PREPARE gurumedia_offer_id_index_stmt FROM @gurumedia_offer_id_index_sql;
EXECUTE gurumedia_offer_id_index_stmt;
DEALLOCATE PREPARE gurumedia_offer_id_index_stmt;

SET @gurumedia_attempt_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gurumedia_postback_attempts' AND COLUMN_NAME = 'offer_id') = 0,
    'ALTER TABLE gurumedia_postback_attempts ADD COLUMN offer_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'SELECT ''SKIP: gurumedia_postback_attempts.offer_id already exists'''
);
PREPARE gurumedia_attempt_stmt FROM @gurumedia_attempt_sql;
EXECUTE gurumedia_attempt_stmt;
DEALLOCATE PREPARE gurumedia_attempt_stmt;

SET @gurumedia_attempt_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gurumedia_postback_attempts' AND COLUMN_NAME = 'offer_name') = 0,
    'ALTER TABLE gurumedia_postback_attempts ADD COLUMN offer_name VARCHAR(253) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL',
    'SELECT ''SKIP: gurumedia_postback_attempts.offer_name already exists'''
);
PREPARE gurumedia_attempt_stmt FROM @gurumedia_attempt_sql;
EXECUTE gurumedia_attempt_stmt;
DEALLOCATE PREPARE gurumedia_attempt_stmt;

SET @gurumedia_attempt_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gurumedia_postback_attempts' AND COLUMN_NAME = 'payout_amount') = 0,
    'ALTER TABLE gurumedia_postback_attempts ADD COLUMN payout_amount DECIMAL(14,4) NULL',
    'SELECT ''SKIP: gurumedia_postback_attempts.payout_amount already exists'''
);
PREPARE gurumedia_attempt_stmt FROM @gurumedia_attempt_sql;
EXECUTE gurumedia_attempt_stmt;
DEALLOCATE PREPARE gurumedia_attempt_stmt;

SET @gurumedia_attempt_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gurumedia_postback_attempts' AND COLUMN_NAME = 'currency') = 0,
    'ALTER TABLE gurumedia_postback_attempts ADD COLUMN currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'SELECT ''SKIP: gurumedia_postback_attempts.currency already exists'''
);
PREPARE gurumedia_attempt_stmt FROM @gurumedia_attempt_sql;
EXECUTE gurumedia_attempt_stmt;
DEALLOCATE PREPARE gurumedia_attempt_stmt;

SET @gurumedia_attempt_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gurumedia_postback_attempts' AND COLUMN_NAME = 'conversion_at_utc') = 0,
    'ALTER TABLE gurumedia_postback_attempts ADD COLUMN conversion_at_utc DATETIME(3) NULL',
    'SELECT ''SKIP: gurumedia_postback_attempts.conversion_at_utc already exists'''
);
PREPARE gurumedia_attempt_stmt FROM @gurumedia_attempt_sql;
EXECUTE gurumedia_attempt_stmt;
DEALLOCATE PREPARE gurumedia_attempt_stmt;

SET @gurumedia_attempt_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gurumedia_postback_attempts' AND COLUMN_NAME = 'product_key') = 0,
    'ALTER TABLE gurumedia_postback_attempts ADD COLUMN product_key VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'SELECT ''SKIP: gurumedia_postback_attempts.product_key already exists'''
);
PREPARE gurumedia_attempt_stmt FROM @gurumedia_attempt_sql;
EXECUTE gurumedia_attempt_stmt;
DEALLOCATE PREPARE gurumedia_attempt_stmt;

SET @gurumedia_attempt_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gurumedia_postback_attempts' AND COLUMN_NAME = 'product_label') = 0,
    'ALTER TABLE gurumedia_postback_attempts ADD COLUMN product_label VARCHAR(253) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL',
    'SELECT ''SKIP: gurumedia_postback_attempts.product_label already exists'''
);
PREPARE gurumedia_attempt_stmt FROM @gurumedia_attempt_sql;
EXECUTE gurumedia_attempt_stmt;
DEALLOCATE PREPARE gurumedia_attempt_stmt;

SET @gurumedia_attempt_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gurumedia_postback_attempts' AND COLUMN_NAME = 'presell_host') = 0,
    'ALTER TABLE gurumedia_postback_attempts ADD COLUMN presell_host VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'SELECT ''SKIP: gurumedia_postback_attempts.presell_host already exists'''
);
PREPARE gurumedia_attempt_stmt FROM @gurumedia_attempt_sql;
EXECUTE gurumedia_attempt_stmt;
DEALLOCATE PREPARE gurumedia_attempt_stmt;

SET @gurumedia_attempt_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gurumedia_postback_attempts' AND COLUMN_NAME = 'offer_mapping_status') = 0,
    'ALTER TABLE gurumedia_postback_attempts ADD COLUMN offer_mapping_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'SELECT ''SKIP: gurumedia_postback_attempts.offer_mapping_status already exists'''
);
PREPARE gurumedia_attempt_stmt FROM @gurumedia_attempt_sql;
EXECUTE gurumedia_attempt_stmt;
DEALLOCATE PREPARE gurumedia_attempt_stmt;

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
