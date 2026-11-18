-- Safe incremental schema migration; existing columns and indexes are retained.
-- The checks make this migration compatible with an allowlist table that may
-- already include product_key from a fresh-install schema.

SET @tracking_identity_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_allowed_domains' AND COLUMN_NAME = 'product_key') = 0,
    'ALTER TABLE tracking_allowed_domains ADD COLUMN product_key VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER page_host',
    'SELECT ''SKIP: tracking_allowed_domains.product_key already exists'''
);
PREPARE tracking_identity_stmt FROM @tracking_identity_sql;
EXECUTE tracking_identity_stmt;
DEALLOCATE PREPARE tracking_identity_stmt;

SET @tracking_identity_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_allowed_domains' AND COLUMN_NAME = 'product_label') = 0,
    'ALTER TABLE tracking_allowed_domains ADD COLUMN product_label VARCHAR(253) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER product_key',
    'SELECT ''SKIP: tracking_allowed_domains.product_label already exists'''
);
PREPARE tracking_identity_stmt FROM @tracking_identity_sql;
EXECUTE tracking_identity_stmt;
DEALLOCATE PREPARE tracking_identity_stmt;

SET @tracking_identity_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_allowed_domains' AND COLUMN_NAME = 'platform') = 0,
    'ALTER TABLE tracking_allowed_domains ADD COLUMN platform VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT ''clickbank'' AFTER product_label',
    'SELECT ''SKIP: tracking_allowed_domains.platform already exists'''
);
PREPARE tracking_identity_stmt FROM @tracking_identity_sql;
EXECUTE tracking_identity_stmt;
DEALLOCATE PREPARE tracking_identity_stmt;

SET @tracking_identity_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_events' AND COLUMN_NAME = 'product_key') = 0,
    'ALTER TABLE tracking_events ADD COLUMN product_key VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER clickbank_extclid',
    'SELECT ''SKIP: tracking_events.product_key already exists'''
);
PREPARE tracking_identity_stmt FROM @tracking_identity_sql;
EXECUTE tracking_identity_stmt;
DEALLOCATE PREPARE tracking_identity_stmt;

SET @tracking_identity_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_events' AND COLUMN_NAME = 'presell_host') = 0,
    'ALTER TABLE tracking_events ADD COLUMN presell_host VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER product_key',
    'SELECT ''SKIP: tracking_events.presell_host already exists'''
);
PREPARE tracking_identity_stmt FROM @tracking_identity_sql;
EXECUTE tracking_identity_stmt;
DEALLOCATE PREPARE tracking_identity_stmt;

SET @tracking_identity_sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_events' AND INDEX_NAME = 'idx_tracking_events_product_key') = 0,
    'ALTER TABLE tracking_events ADD KEY idx_tracking_events_product_key (product_key)',
    'SELECT ''SKIP: idx_tracking_events_product_key already exists'''
);
PREPARE tracking_identity_stmt FROM @tracking_identity_sql;
EXECUTE tracking_identity_stmt;
DEALLOCATE PREPARE tracking_identity_stmt;

SET @tracking_identity_sql = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_events' AND INDEX_NAME = 'idx_tracking_events_presell_host') = 0,
    'ALTER TABLE tracking_events ADD KEY idx_tracking_events_presell_host (presell_host)',
    'SELECT ''SKIP: idx_tracking_events_presell_host already exists'''
);
PREPARE tracking_identity_stmt FROM @tracking_identity_sql;
EXECUTE tracking_identity_stmt;
DEALLOCATE PREPARE tracking_identity_stmt;
