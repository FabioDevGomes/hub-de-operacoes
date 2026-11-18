    -- Fase 2A: persistência aditiva dos diagnósticos de avaliação em modo sombra.
    -- Esta tabela não alimenta a fila de pausas e não altera campanhas.

    CREATE TABLE IF NOT EXISTS google_ads_auto_pause_shadow_evaluations (
        snapshot_id CHAR(36) NOT NULL,
        source_snapshot_id VARCHAR(160) NOT NULL,
        policy_revision CHAR(36) NOT NULL,
        completed_at_utc DATETIME(3) NOT NULL,
        evaluation_due_at_utc DATETIME(3) NOT NULL,
        evaluated_at_utc DATETIME(3) NOT NULL,
        snapshot_state VARCHAR(32) NOT NULL,
        enabled_rule_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
        blocked_rule_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
        candidate_count INT UNSIGNED NOT NULL DEFAULT 0,
        result_sha256 CHAR(64) NOT NULL,
        result_json MEDIUMTEXT NOT NULL,
        PRIMARY KEY (snapshot_id),
        CONSTRAINT fk_auto_pause_shadow_payload
            FOREIGN KEY (snapshot_id) REFERENCES google_ads_auto_pause_snapshot_payloads (snapshot_id)
            ON DELETE CASCADE,
        KEY idx_auto_pause_shadow_evaluated (evaluated_at_utc),
        KEY idx_auto_pause_shadow_state (snapshot_state, evaluated_at_utc),
        KEY idx_auto_pause_shadow_policy (policy_revision, evaluated_at_utc)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
