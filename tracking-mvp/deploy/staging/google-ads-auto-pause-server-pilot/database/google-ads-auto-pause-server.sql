-- Additive storage for the Hub-to-server automatic-pause pilot.
-- No existing tables or rows are modified.
CREATE TABLE IF NOT EXISTS google_ads_auto_pause_snapshots (
    snapshot_id CHAR(36) NOT NULL,
    completed_at_utc DATETIME(3) NOT NULL,
    evaluation_sha256 CHAR(64) NOT NULL,
    received_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (snapshot_id),
    KEY idx_auto_pause_snapshot_completed (completed_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS google_ads_auto_pause_config (
    config_id TINYINT UNSIGNED NOT NULL,
    revision CHAR(36) NOT NULL,
    config_json MEDIUMTEXT NOT NULL,
    updated_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (config_id),
    KEY idx_auto_pause_config_revision (revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS google_ads_auto_pause_jobs (
    job_id CHAR(36) NOT NULL,
    snapshot_id CHAR(36) NOT NULL,
    product_key VARCHAR(190) NOT NULL,
    rule_code VARCHAR(40) NOT NULL,
    manager_customer_id CHAR(10) NOT NULL,
    customer_id CHAR(10) NOT NULL,
    campaign_id VARCHAR(20) NOT NULL,
    campaign_name VARCHAR(255) NOT NULL,
    reason_context_json TEXT NOT NULL,
    available_at_utc DATETIME(3) NOT NULL,
    cancel_until_utc DATETIME(3) NOT NULL,
    state ENUM('pending','cancelled','processing','applied','skipped','failed') NOT NULL DEFAULT 'pending',
    result_code VARCHAR(64) NULL,
    created_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (job_id),
    UNIQUE KEY uq_auto_pause_job_snapshot_campaign (snapshot_id, product_key, rule_code, campaign_id),
    KEY idx_auto_pause_jobs_due (state, available_at_utc, cancel_until_utc),
    CONSTRAINT fk_auto_pause_job_snapshot FOREIGN KEY (snapshot_id)
        REFERENCES google_ads_auto_pause_snapshots (snapshot_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
