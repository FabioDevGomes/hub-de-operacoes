CREATE TABLE IF NOT EXISTS tracking_allowed_domains (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    page_host VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    product_key VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NULL,
    product_label VARCHAR(253) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    offer_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    origin VARCHAR(261) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tracking_allowed_domains_page_host (page_host),
    UNIQUE KEY uq_tracking_allowed_domains_origin (origin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
