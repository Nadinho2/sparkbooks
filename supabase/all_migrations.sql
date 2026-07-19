-- ============================================================
-- SparkBooks: Complete schema setup
-- Run this entire file in the Supabase SQL Editor.
-- All IF NOT EXISTS guards are in place — safe to re-run.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE stock_movement_type AS ENUM ('in', 'out', 'manual_adjustment');
CREATE TYPE entry_source AS ENUM ('whatsapp_voice', 'whatsapp_text', 'dashboard_manual');
CREATE TYPE ledger_type AS ENUM ('sale', 'expense');
CREATE TYPE wa_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE wa_message_type AS ENUM ('voice', 'text', 'template');
CREATE TYPE wa_status AS ENUM ('matched', 'unmatched', 'pending_confirmation', 'failed');

DO $$ BEGIN
    CREATE TYPE plan_tier AS ENUM ('free', 'starter', 'pro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE plan_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- TENANTS
CREATE TABLE IF NOT EXISTS tenants (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_name   TEXT NOT NULL,
    business_type   TEXT NOT NULL DEFAULT 'general_store',
    whatsapp_number TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Chunk 2: Clerk link
    clerk_user_id   TEXT UNIQUE,

    -- Chunk 10: Billing
    plan_tier               plan_tier NOT NULL DEFAULT 'free',
    plan_status             plan_status NOT NULL DEFAULT 'trialing',
    paystack_customer_id    TEXT,
    paystack_subscription_id TEXT,
    current_period_end      TIMESTAMPTZ,
    monthly_message_count   INTEGER NOT NULL DEFAULT 0,
    monthly_message_limit   INTEGER NOT NULL DEFAULT 30,

    -- Chunk 11: Admin
    is_comped     BOOLEAN NOT NULL DEFAULT FALSE,
    is_suspended  BOOLEAN NOT NULL DEFAULT FALSE
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_categories_tenant_name UNIQUE (tenant_id, name)
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id         BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    name                TEXT NOT NULL,
    quantity            NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit                TEXT NOT NULL DEFAULT 'pcs',
    unit_cost           NUMERIC(12,2),
    reorder_threshold   NUMERIC(12,2),
    supplier            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Chunk 5: Soft delete
    deleted_at          TIMESTAMPTZ,

    -- Chunk 8: Low-stock alert dedup
    last_low_stock_alert_at TIMESTAMPTZ
);

-- WHATSAPP_MESSAGES
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    wa_message_id   TEXT NOT NULL,
    direction       wa_direction NOT NULL,
    type            wa_message_type NOT NULL,
    raw_text        TEXT,
    transcript      TEXT,
    media_url       TEXT,
    status          wa_status NOT NULL DEFAULT 'unmatched',
    linked_entry_id BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Chunk 10: Plan limit failure reason
    failure_reason  TEXT,

    CONSTRAINT uq_wa_message_id UNIQUE (wa_message_id)
);

-- STOCK_MOVEMENTS
CREATE TABLE IF NOT EXISTS stock_movements (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id         BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id        BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    change_qty        NUMERIC(12,2) NOT NULL,
    type              stock_movement_type NOT NULL,
    source            entry_source NOT NULL,
    reason            TEXT,
    linked_message_id BIGINT REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LEDGER_ENTRIES
CREATE TABLE IF NOT EXISTS ledger_entries (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id         BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type              ledger_type NOT NULL,
    amount            NUMERIC(12,2) NOT NULL,
    item_description  TEXT NOT NULL,
    product_id        BIGINT REFERENCES products(id) ON DELETE SET NULL,
    source            entry_source NOT NULL,
    linked_message_id BIGINT REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
    confidence_score  NUMERIC(5,4),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ADMIN_AUDIT_LOG
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_user_id   TEXT NOT NULL,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action          TEXT NOT NULL DEFAULT 'view',
    accessed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- FOREIGN KEY: whatsapp_messages.linked_entry_id → ledger_entries
-- ============================================================
DO $$ BEGIN
    ALTER TABLE whatsapp_messages
      ADD CONSTRAINT fk_wa_linked_entry
      FOREIGN KEY (linked_entry_id) REFERENCES ledger_entries(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- INDEXES
-- ============================================================

-- categories
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);

-- products
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(deleted_at) WHERE deleted_at IS NOT NULL;

-- stock_movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);

-- ledger_entries
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant ON ledger_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_product ON ledger_entries(product_id);

-- whatsapp_messages
CREATE INDEX IF NOT EXISTS idx_wa_messages_tenant ON whatsapp_messages(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_message_id ON whatsapp_messages(wa_message_id);

-- tenants (clerk + paystack)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_clerk_user ON tenants(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_paystack_sub ON tenants(paystack_subscription_id)
    WHERE paystack_subscription_id IS NOT NULL;

-- admin_audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON admin_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_accessed ON admin_audit_log(accessed_at DESC);

-- ============================================================
-- TRIGGER: auto-update updated_at on products
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_products_updated_at
        BEFORE UPDATE ON products
        FOR EACH ROW
        EXECUTE FUNCTION fn_update_products_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- tenants
CREATE POLICY rls_tenants ON tenants
    FOR ALL
    USING (id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- categories
CREATE POLICY rls_categories ON categories
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- products
CREATE POLICY rls_products ON products
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- stock_movements
CREATE POLICY rls_stock_movements ON stock_movements
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- ledger_entries
CREATE POLICY rls_ledger_entries ON ledger_entries
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- whatsapp_messages
CREATE POLICY rls_whatsapp_messages ON whatsapp_messages
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- admin_audit_log — no tenant-level RLS (admin-only table, accessed via service_role)
CREATE POLICY rls_admin_audit_log ON admin_audit_log
    FOR ALL
    USING (true);

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_audit_log TO authenticated;

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Atomic increment of monthly_message_count
CREATE OR REPLACE FUNCTION increment_message_count(tenant_id BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE tenants
    SET monthly_message_count = monthly_message_count + 1
    WHERE id = tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset monthly_message_count for tenants whose cycle ended
CREATE OR REPLACE FUNCTION reset_billing_cycle()
RETURNS SETOF BIGINT AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT id, current_period_end
        FROM tenants
        WHERE current_period_end IS NOT NULL
          AND current_period_end < now()
    LOOP
        UPDATE tenants
        SET monthly_message_count = 0,
            current_period_end = r.current_period_end + INTERVAL '1 month'
        WHERE id = r.id;

        RETURN NEXT r.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get product counts per tenant (for admin tenant list)
CREATE OR REPLACE FUNCTION get_tenant_product_counts()
RETURNS TABLE(tenant_id BIGINT, count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT p.tenant_id, COUNT(*)::BIGINT
    FROM products p
    WHERE p.deleted_at IS NULL
    GROUP BY p.tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
