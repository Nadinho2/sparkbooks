-- Migration 010: Add customer_name and customer_phone to ledger_entries

ALTER TABLE ledger_entries
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS customer_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_customer_name ON ledger_entries(tenant_id, customer_name);
