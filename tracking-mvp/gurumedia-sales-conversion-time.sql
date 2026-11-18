-- One-time additive migration for existing GuruMedia installations.
-- Keeps the callback receipt timestamp and adds a separate, nullable event timestamp.
ALTER TABLE gurumedia_sales
    ADD COLUMN conversion_at_utc DATETIME(3) NULL AFTER presell_host,
    ADD KEY idx_gurumedia_sales_conversion_at (conversion_at_utc);
