-- Adjust idempotency so a ClickBank event ID can identify distinct event types.
-- This allows Test Integration's repeated synthetic IDs to coexist with stored purchases.
-- Existing rows are retained; only the uniqueness rule changes. Run once on existing installs.
ALTER TABLE clickbank_postback_events
    DROP INDEX uq_clickbank_postback_event_id,
    ADD UNIQUE KEY uq_clickbank_postback_event_type (event_id, event_type);
