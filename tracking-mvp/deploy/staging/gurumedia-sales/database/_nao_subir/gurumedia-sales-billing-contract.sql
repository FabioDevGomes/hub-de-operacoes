-- One-time additive migration for existing GuruMedia installations.
-- Adds a persistent opaque sale key so local Billing can upsert each sale
-- without exposing GuruMedia transaction IDs or Hub click IDs.
ALTER TABLE gurumedia_sales
    ADD COLUMN sale_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER id;

UPDATE gurumedia_sales
SET sale_key = UUID()
WHERE sale_key IS NULL;

ALTER TABLE gurumedia_sales
    MODIFY COLUMN sale_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ADD UNIQUE KEY uq_gurumedia_sales_sale_key (sale_key);
