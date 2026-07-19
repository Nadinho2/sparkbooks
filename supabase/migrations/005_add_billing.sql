-- ============================================================
-- SparkBooks: Subscription billing with Paystack
-- Migration 005: Extend tenants table
-- ============================================================

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE plan_tier AS ENUM ('free', 'starter', 'pro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE plan_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- ALTER: tenants — billing columns
-- ------------------------------------------------------------
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS plan_tier plan_tier NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS plan_status plan_status NOT NULL DEFAULT 'trialing',
    ADD COLUMN IF NOT EXISTS paystack_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS paystack_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS monthly_message_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS monthly_message_limit INTEGER NOT NULL DEFAULT 30;

-- ------------------------------------------------------------
-- ALTER: whatsapp_messages — failure reason for plan limits
-- ------------------------------------------------------------
ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- ------------------------------------------------------------
-- Encourage index for queries that scan by subscription id
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tenants_paystack_sub
    ON tenants(paystack_subscription_id)
    WHERE paystack_subscription_id IS NOT NULL;

-- ------------------------------------------------------------
-- RPC: atomic increment of monthly_message_count
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_message_count(tenant_id BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE tenants
    SET monthly_message_count = monthly_message_count + 1
    WHERE id = tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- RPC: reset monthly_message_count for tenants whose cycle ended
-- ------------------------------------------------------------
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
        -- Roll period forward 1 month
        UPDATE tenants
        SET monthly_message_count = 0,
            current_period_end = r.current_period_end + INTERVAL '1 month'
        WHERE id = r.id;

        RETURN NEXT r.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
