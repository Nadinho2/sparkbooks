-- ============================================================
-- SparkBooks: Multi-tenant WhatsApp bookkeeping & stock keeper
-- Migration 001: Core schema
-- ============================================================

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
CREATE TYPE stock_movement_type AS ENUM ('in', 'out', 'manual_adjustment');
CREATE TYPE entry_source AS ENUM ('whatsapp_voice', 'whatsapp_text', 'dashboard_manual');
CREATE TYPE ledger_type AS ENUM ('sale', 'expense');
CREATE TYPE wa_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE wa_message_type AS ENUM ('voice', 'text', 'template');
CREATE TYPE wa_status AS ENUM ('matched', 'unmatched', 'pending_confirmation', 'failed');

-- ------------------------------------------------------------
-- TABLES
-- ------------------------------------------------------------

-- TENANTS
CREATE TABLE tenants (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_name   TEXT NOT NULL,
    business_type   TEXT NOT NULL DEFAULT 'general_store',
    whatsapp_number TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CATEGORIES
CREATE TABLE categories (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id   BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_categories_tenant_name UNIQUE (tenant_id, name)
);

-- PRODUCTS
CREATE TABLE products (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id          BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id        BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    name               TEXT NOT NULL,
    quantity           NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit               TEXT NOT NULL DEFAULT 'pcs',
    unit_cost          NUMERIC(12,2),
    reorder_threshold  NUMERIC(12,2),
    supplier           TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WHATSAPP_MESSAGES
CREATE TABLE whatsapp_messages (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id        BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    wa_message_id    TEXT NOT NULL,
    direction        wa_direction NOT NULL,
    type             wa_message_type NOT NULL,
    raw_text         TEXT,
    transcript       TEXT,
    media_url        TEXT,
    status           wa_status NOT NULL DEFAULT 'unmatched',
    linked_entry_id  BIGINT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_wa_message_id UNIQUE (wa_message_id)
);

-- STOCK_MOVEMENTS
CREATE TABLE stock_movements (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id          BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id         BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    change_qty         NUMERIC(12,2) NOT NULL,
    type               stock_movement_type NOT NULL,
    source             entry_source NOT NULL,
    reason             TEXT,
    linked_message_id  BIGINT REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LEDGER_ENTRIES
CREATE TABLE ledger_entries (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id          BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type               ledger_type NOT NULL,
    amount             NUMERIC(12,2) NOT NULL,
    item_description   TEXT NOT NULL,
    product_id         BIGINT REFERENCES products(id) ON DELETE SET NULL,
    source             entry_source NOT NULL,
    linked_message_id  BIGINT REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
    confidence_score   NUMERIC(5,4),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link whatsapp_messages.linked_entry_id -> ledger_entries (deferred as table exists now)
ALTER TABLE whatsapp_messages
  ADD CONSTRAINT fk_wa_linked_entry
  FOREIGN KEY (linked_entry_id) REFERENCES ledger_entries(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
CREATE INDEX idx_categories_tenant       ON categories(tenant_id);
CREATE INDEX idx_products_tenant         ON products(tenant_id);
CREATE INDEX idx_products_category       ON products(category_id);
CREATE INDEX idx_stock_movements_tenant  ON stock_movements(tenant_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_ledger_entries_tenant   ON ledger_entries(tenant_id);
CREATE INDEX idx_ledger_entries_product  ON ledger_entries(product_id);
CREATE INDEX idx_wa_messages_tenant      ON whatsapp_messages(tenant_id);
CREATE UNIQUE INDEX idx_wa_message_id    ON whatsapp_messages(wa_message_id);

-- ------------------------------------------------------------
-- TRIGGER: auto-update updated_at on products
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_products_updated_at();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Helper: policy for tables with tenant_id column
-- Each tenant row also gets its own policy below.

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

-- Grant anon & authenticated access (Row-Level Security will still filter)
-- These grants are safe because RLS is enabled on all tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_messages TO authenticated;
