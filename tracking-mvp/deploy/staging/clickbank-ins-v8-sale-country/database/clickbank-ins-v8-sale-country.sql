-- Add only the ClickBank billing country code to already-installed INS v8 transactions.
-- One-time additive migration. Does not update or delete existing transactions.
ALTER TABLE clickbank_ins_v8_transactions
    ADD COLUMN customer_country CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NULL
    AFTER transaction_time_utc;
