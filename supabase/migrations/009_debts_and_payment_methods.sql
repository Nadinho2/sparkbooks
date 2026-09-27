-- Migration 009: Add customer debts tracking and payment methods

-- 1. Add payment_method to ledger_entries
ALTER TABLE ledger_entries
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'transfer';

-- 2. Create customer_debts table
CREATE TABLE IF NOT EXISTS customer_debts (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id          BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_name      TEXT NOT NULL,
    customer_phone     TEXT,
    linked_entry_id    BIGINT REFERENCES ledger_entries(id) ON DELETE SET NULL,
    total_amount       NUMERIC(12,2) NOT NULL,
    amount_paid        NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_owed        NUMERIC(12,2) NOT NULL,
    status             TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'settled')),
    due_date           DATE,
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_customer_debts_tenant ON customer_debts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_debts_status ON customer_debts(tenant_id, status);

-- 4. Enable Row Level Security
ALTER TABLE customer_debts ENABLE ROW LEVEL SECURITY;

-- 5. Trigger for updated_at
CREATE OR REPLACE FUNCTION fn_update_customer_debts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_debts_updated_at ON customer_debts;
CREATE TRIGGER trg_customer_debts_updated_at
    BEFORE UPDATE ON customer_debts
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_customer_debts_updated_at();
