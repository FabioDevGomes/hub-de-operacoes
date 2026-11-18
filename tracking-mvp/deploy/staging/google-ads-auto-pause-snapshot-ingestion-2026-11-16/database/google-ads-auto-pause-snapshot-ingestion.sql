-- Fase 1: armazenamento aditivo dos snapshots completos recebidos do Hub.
-- Não altera filas, avaliações, configurações ou registros já existentes.

CREATE TABLE IF NOT EXISTS google_ads_auto_pause_snapshot_uploads (
    snapshot_id CHAR(36) NOT NULL,
    source_snapshot_id VARCHAR(160) NOT NULL,
    completed_at_utc DATETIME(3) NOT NULL,
    schema_version SMALLINT UNSIGNED NOT NULL,
    payload_bytes INT UNSIGNED NOT NULL,
    payload_sha256 CHAR(64) NOT NULL,
    part_count SMALLINT UNSIGNED NOT NULL,
    created_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (snapshot_id),
    KEY idx_auto_pause_upload_updated (updated_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS google_ads_auto_pause_snapshot_upload_parts (
    snapshot_id CHAR(36) NOT NULL,
    part_index SMALLINT UNSIGNED NOT NULL,
    part_sha256 CHAR(64) NOT NULL,
    payload_part MEDIUMBLOB NOT NULL,
    received_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (snapshot_id, part_index),
    CONSTRAINT fk_auto_pause_snapshot_upload_part
        FOREIGN KEY (snapshot_id) REFERENCES google_ads_auto_pause_snapshot_uploads (snapshot_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS google_ads_auto_pause_snapshot_payloads (
    snapshot_id CHAR(36) NOT NULL,
    source_snapshot_id VARCHAR(160) NOT NULL,
    completed_at_utc DATETIME(3) NOT NULL,
    schema_version SMALLINT UNSIGNED NOT NULL,
    payload_sha256 CHAR(64) NOT NULL,
    payload_bytes INT UNSIGNED NOT NULL,
    account_count SMALLINT UNSIGNED NOT NULL,
    campaign_count INT UNSIGNED NOT NULL,
    payload_json MEDIUMTEXT NOT NULL,
    received_at_utc DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (snapshot_id),
    UNIQUE KEY uq_auto_pause_payload_source_id (source_snapshot_id),
    KEY idx_auto_pause_payload_completed (completed_at_utc, received_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
