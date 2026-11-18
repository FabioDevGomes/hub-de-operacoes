-- Marco temporal da transferência de autoridade das pausas automáticas.
-- A coluna é aditiva, nula por padrão e compatível com a autoridade atual no Hub.

SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'google_ads_auto_pause_authority'
      AND COLUMN_NAME = 'server_started_at_utc'
);
SET @ddl = IF(
    @column_exists = 0,
    'ALTER TABLE google_ads_auto_pause_authority ADD COLUMN server_started_at_utc DATETIME(3) NULL DEFAULT NULL AFTER revision',
    'SELECT 1'
);
PREPARE add_server_started_at FROM @ddl;
EXECUTE add_server_started_at;
DEALLOCATE PREPARE add_server_started_at;
