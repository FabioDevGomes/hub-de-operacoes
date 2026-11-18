-- Incremental, idempotent migration for automatic pause email reasons.
-- Run in the existing private tracking database. Existing outbox rows receive
-- the legacy reason so queued emails keep their previous meaning.

SET @google_ads_pause_reason_column_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'google_ads_campaign_pause_email_outbox'
      AND COLUMN_NAME = 'pause_reason'
);

SET @google_ads_pause_reason_migration := IF(
    @google_ads_pause_reason_column_exists = 0,
    'ALTER TABLE `google_ads_campaign_pause_email_outbox` ADD COLUMN `pause_reason` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT ''negative_remaining'' AFTER `campaign_name`',
    'SELECT ''pause_reason já existe; migração ignorada'' AS migration_status'
);

PREPARE google_ads_pause_reason_stmt FROM @google_ads_pause_reason_migration;
EXECUTE google_ads_pause_reason_stmt;
DEALLOCATE PREPARE google_ads_pause_reason_stmt;
