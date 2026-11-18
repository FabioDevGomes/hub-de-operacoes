-- Additive migration: preserve the current ClickBank extclid separately from
-- our internal UUID click_id so another tracker (for example Flow) is not overwritten.
-- Check that both the column and index are absent before running this once.
ALTER TABLE tracking_events
    ADD COLUMN clickbank_extclid VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER click_id,
    ADD KEY idx_tracking_events_clickbank_extclid (clickbank_extclid);
