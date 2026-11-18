-- Adds the platform owner to each registered Pre-Sell Track.
-- Existing rows are intentionally classified as ClickBank for compatibility;
-- update GuruMedia rows in the Hub's Global Settings after publishing the API.
SET @tracking_platform_sql = IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tracking_allowed_domains' AND COLUMN_NAME = 'platform') = 0,
    'ALTER TABLE tracking_allowed_domains ADD COLUMN platform VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT ''clickbank'' AFTER product_label',
    'SELECT ''SKIP: tracking_allowed_domains.platform already exists'''
);
PREPARE tracking_platform_stmt FROM @tracking_platform_sql;
EXECUTE tracking_platform_stmt;
DEALLOCATE PREPARE tracking_platform_stmt;
