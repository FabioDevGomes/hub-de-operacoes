-- Additive queue for verified automatic Google Ads campaign pause emails.
-- Stores campaign references and delivery state only; no SMTP configuration or spend value.

CREATE TABLE IF NOT EXISTS google_ads_campaign_pause_email_outbox (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    notification_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    manager_customer_id CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    customer_id CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    campaign_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    campaign_name VARCHAR(255) NOT NULL,
    pause_reason VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'negative_remaining',
    confirmed_at_utc DATETIME(3) NOT NULL,
    created_at_utc DATETIME(3) NOT NULL,
    attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at_utc DATETIME(3) NOT NULL,
    locked_until_utc DATETIME(3) NULL,
    sent_at_utc DATETIME(3) NULL,
    last_error_code VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_google_ads_pause_email_notification (notification_key),
    KEY idx_google_ads_pause_email_due (sent_at_utc, next_attempt_at_utc, locked_until_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
