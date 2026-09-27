-- ============================================================
-- SparkBooks: Complete schema setup
-- Run this entire file in the Supabase SQL Editor.
-- All IF NOT EXISTS guards are in place — safe to re-run.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
    CREATE TYPE stock_movement_type AS ENUM ('in', 'out', 'manual_adjustment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE entry_source AS ENUM ('whatsapp_voice', 'whatsapp_text', 'dashboard_manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE ledger_type AS ENUM ('sale', 'expense');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE wa_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE wa_message_type AS ENUM ('voice', 'text', 'template');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE wa_status AS ENUM ('matched', 'unmatched', 'pending_confirmation', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_products_updated_at();

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
DROP POLICY IF EXISTS rls_tenants ON tenants;
CREATE POLICY rls_tenants ON tenants
    FOR ALL
    USING (id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- categories
DROP POLICY IF EXISTS rls_categories ON categories;
CREATE POLICY rls_categories ON categories
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- products
DROP POLICY IF EXISTS rls_products ON products;
CREATE POLICY rls_products ON products
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- stock_movements
DROP POLICY IF EXISTS rls_stock_movements ON stock_movements;
CREATE POLICY rls_stock_movements ON stock_movements
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- ledger_entries
DROP POLICY IF EXISTS rls_ledger_entries ON ledger_entries;
CREATE POLICY rls_ledger_entries ON ledger_entries
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- whatsapp_messages
DROP POLICY IF EXISTS rls_whatsapp_messages ON whatsapp_messages;
CREATE POLICY rls_whatsapp_messages ON whatsapp_messages
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

-- admin_audit_log — no tenant-level RLS (admin-only table, accessed via service_role)
DROP POLICY IF EXISTS rls_admin_audit_log ON admin_audit_log;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_members TO authenticated;

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

-- ============================================================
-- MIGRATION 007: MULTI-USER / TEAM MEMBER SUPPORT
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_members (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    clerk_user_id   TEXT,
    role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    invited_email   TEXT,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'removed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    whatsapp_number TEXT,

    CONSTRAINT uq_tenant_member UNIQUE (tenant_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant
    ON tenant_members(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_members_clerk
    ON tenant_members(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_email
    ON tenant_members(invited_email, status);

CREATE OR REPLACE FUNCTION set_tenant_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenant_members_updated_at ON tenant_members;
CREATE TRIGGER trg_tenant_members_updated_at
    BEFORE UPDATE ON tenant_members
    FOR EACH ROW
    EXECUTE FUNCTION set_tenant_members_updated_at();

ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS sender_member_id BIGINT REFERENCES tenant_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wamessages_sender
    ON whatsapp_messages(sender_member_id);

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_members_self ON tenant_members;
CREATE POLICY rls_tenant_members_self ON tenant_members
    FOR SELECT
    USING (clerk_user_id = current_setting('app.current_user_id', TRUE));

DROP POLICY IF EXISTS rls_tenant_members_owner ON tenant_members;
CREATE POLICY rls_tenant_members_owner ON tenant_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM tenants t
            WHERE t.id = tenant_members.tenant_id
              AND t.clerk_user_id = current_setting('app.current_user_id', TRUE)
        )
    );

-- ============================================================
-- MIGRATION 008: PERFORMANCE & ATOMIC INVENTORY OPTIMIZATION
-- ============================================================

CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
    SELECT regexp_replace(phone, '[^0-9]', '', 'g');
$$ LANGUAGE sql IMMUTABLE;

CREATE INDEX IF NOT EXISTS idx_tenants_normalized_phone
    ON tenants (normalize_phone(whatsapp_number));

CREATE INDEX IF NOT EXISTS idx_tenant_members_normalized_phone
    ON tenant_members (tenant_id, normalize_phone(whatsapp_number));

CREATE OR REPLACE FUNCTION find_tenant_by_phone(phone_input TEXT)
RETURNS TABLE (
    id BIGINT,
    business_name TEXT,
    whatsapp_number TEXT,
    is_suspended BOOLEAN
) AS $$
DECLARE
    clean_phone TEXT := regexp_replace(phone_input, '[^0-9]', '', 'g');
    suffix_10 TEXT := right(clean_phone, 10);
BEGIN
    RETURN QUERY
    SELECT t.id, t.business_name, t.whatsapp_number, t.is_suspended
    FROM tenants t
    WHERE normalize_phone(t.whatsapp_number) = clean_phone
       OR (length(clean_phone) >= 10 AND right(normalize_phone(t.whatsapp_number), 10) = suffix_10)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION find_sender_member_by_phone(p_tenant_id BIGINT, phone_input TEXT)
RETURNS BIGINT AS $$
DECLARE
    clean_phone TEXT := regexp_replace(phone_input, '[^0-9]', '', 'g');
    suffix_10 TEXT := right(clean_phone, 10);
    v_member_id BIGINT;
BEGIN
    SELECT tm.id INTO v_member_id
    FROM tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
      AND tm.whatsapp_number IS NOT NULL
      AND (
          normalize_phone(tm.whatsapp_number) = clean_phone
          OR (length(clean_phone) >= 10 AND right(normalize_phone(tm.whatsapp_number), 10) = suffix_10)
      )
    LIMIT 1;

    RETURN v_member_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION adjust_product_stock(
    p_tenant_id BIGINT,
    p_product_id BIGINT,
    p_change_qty NUMERIC,
    p_type stock_movement_type,
    p_source entry_source,
    p_reason TEXT DEFAULT NULL,
    p_linked_message_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
    movement_id BIGINT,
    new_quantity NUMERIC,
    product_name TEXT,
    unit TEXT,
    reorder_threshold NUMERIC,
    last_low_stock_alert_at TIMESTAMPTZ
) AS $$
DECLARE
    v_movement_id BIGINT;
    v_new_quantity NUMERIC;
    v_product_name TEXT;
    v_unit TEXT;
    v_reorder_threshold NUMERIC;
    v_last_low_stock_alert_at TIMESTAMPTZ;
BEGIN
    UPDATE products
    SET quantity = GREATEST(0, quantity + p_change_qty),
        updated_at = now()
    WHERE id = p_product_id
      AND tenant_id = p_tenant_id
      AND deleted_at IS NULL
    RETURNING quantity, name, unit, reorder_threshold, last_low_stock_alert_at
    INTO v_new_quantity, v_product_name, v_unit, v_reorder_threshold, v_last_low_stock_alert_at;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found or deleted for tenant %', p_product_id, p_tenant_id;
    END IF;

    INSERT INTO stock_movements (
        tenant_id,
        product_id,
        change_qty,
        type,
        source,
        reason,
        linked_message_id
    )
    VALUES (
        p_tenant_id,
        p_product_id,
        p_change_qty,
        p_type,
        p_source,
        p_reason,
        p_linked_message_id
    )
    RETURNING id INTO v_movement_id;

    RETURN QUERY
    SELECT v_movement_id, v_new_quantity, v_product_name, v_unit, v_reorder_threshold, v_last_low_stock_alert_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Migration 009: Add customer debts tracking and payment methods
-- ============================================================

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

DROP POLICY IF EXISTS rls_customer_debts ON customer_debts;
CREATE POLICY rls_customer_debts ON customer_debts
    FOR ALL
    USING (tenant_id = (current_setting('app.current_tenant_id', TRUE)::BIGINT));

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

-- Migration 010: Add customer_name and customer_phone to ledger_entries
ALTER TABLE ledger_entries
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS customer_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_customer_name ON ledger_entries(tenant_id, customer_name);
