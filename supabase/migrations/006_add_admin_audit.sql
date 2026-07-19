-- ============================================================
-- SparkBooks: Super-admin dashboard support
-- Migration 006: audit_log + comps
-- ============================================================

-- ------------------------------------------------------------
-- TABLE: admin_audit_log — tracks every admin view of tenant data
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_user_id   TEXT NOT NULL,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action          TEXT NOT NULL DEFAULT 'view',
    accessed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_admin
    ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant
    ON admin_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_accessed
    ON admin_audit_log(accessed_at DESC);

-- ------------------------------------------------------------
-- ALTER: tenants — is_comped flag for manual override accounts
-- ------------------------------------------------------------
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS is_comped BOOLEAN NOT NULL DEFAULT FALSE;

-- Tenants that are comped don't require a Paystack subscription
-- and should be excluded from revenue reporting. The field is set
-- manually by an admin from the super-admin billing view.

-- ------------------------------------------------------------
-- ALTER: tenants — is_suspended flag
-- ------------------------------------------------------------
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;

-- ------------------------------------------------------------
-- RPC: get product counts per tenant (for admin tenant list)
-- ------------------------------------------------------------
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
