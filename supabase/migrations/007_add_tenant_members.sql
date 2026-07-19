-- ============================================================
-- SparkBooks: Multi-user / team member support
-- Migration 007: tenant_members table
-- ============================================================

-- ------------------------------------------------------------
-- TABLE: tenant_members — links additional users to a tenant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_members (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    clerk_user_id   TEXT,
    role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    invited_email   TEXT,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'removed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A Clerk user can only be a member of one tenant at a time
    CONSTRAINT uq_tenant_member UNIQUE (tenant_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant
    ON tenant_members(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_members_clerk
    ON tenant_members(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_email
    ON tenant_members(invited_email, status);

-- ------------------------------------------------------------
-- FUNCTION: auto-set updated_at
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- RLS POLICY: owner read/write, member read-only
-- ------------------------------------------------------------
-- ------------------------------------------------------------
-- COLUMN: whatsapp_number — optional, for sender identification
-- ------------------------------------------------------------
ALTER TABLE tenant_members
    ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- ------------------------------------------------------------
-- COLUMN: sender_member_id — links messages to team members
-- ------------------------------------------------------------
ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS sender_member_id BIGINT REFERENCES tenant_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wamessages_sender
    ON whatsapp_messages(sender_member_id);

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

-- Members can see their own membership
CREATE POLICY rls_tenant_members_self ON tenant_members
    FOR SELECT
    USING (clerk_user_id = current_setting('app.current_user_id', TRUE));

-- Tenant owner can manage members for their tenant
CREATE POLICY rls_tenant_members_owner ON tenant_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM tenants t
            WHERE t.id = tenant_members.tenant_id
              AND t.clerk_user_id = current_setting('app.current_user_id', TRUE)
        )
    );
