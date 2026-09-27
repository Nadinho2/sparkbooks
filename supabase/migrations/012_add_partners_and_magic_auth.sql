-- Migration 012: Partners (BRMs), Partner Commissions & WhatsApp Magic Auth Tokens

-- 1. Create partners table
CREATE TABLE IF NOT EXISTS partners (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clerk_user_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT NOT NULL,
  partner_code TEXT UNIQUE NOT NULL,
  commission_rate NUMERIC(5,2) DEFAULT 30.00 NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for clerk user lookup
CREATE INDEX IF NOT EXISTS idx_partners_clerk_user_id ON partners (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_partners_code ON partners (partner_code);
CREATE INDEX IF NOT EXISTS idx_partners_status ON partners (status);

-- 2. Alter tenants table to attach partner attribution and activity tracking
ALTER TABLE tenants 
  ADD COLUMN IF NOT EXISTS partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarded_by_partner BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tenants_partner_id ON tenants (partner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_last_activity ON tenants (last_activity_at);

-- 3. Create partner commissions table
CREATE TABLE IF NOT EXISTS partner_commissions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id BIGINT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount_kobo BIGINT NOT NULL,
  type TEXT DEFAULT 'subscription_rev_share' CHECK (type IN ('subscription_rev_share', 'onboarding_bounty', 'bonus')),
  status TEXT DEFAULT 'cleared' CHECK (status IN ('pending', 'cleared', 'paid')),
  description TEXT,
  payout_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commissions_partner ON partner_commissions (partner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_tenant ON partner_commissions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON partner_commissions (status);

-- 4. Create magic auth tokens table (for WhatsApp single-tap login)
CREATE TABLE IF NOT EXISTS magic_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_magic_tokens_hash ON magic_auth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_tenant ON magic_auth_tokens (tenant_id);

-- 5. Helper function to record partner commission atomically
CREATE OR REPLACE FUNCTION record_partner_commission(
  p_tenant_id BIGINT,
  p_amount_kobo BIGINT,
  p_description TEXT DEFAULT 'Subscription revenue share'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_partner_id BIGINT;
  v_commission_rate NUMERIC(5,2);
  v_commission_kobo BIGINT;
  v_commission_id BIGINT;
BEGIN
  -- Find partner attached to tenant
  SELECT partner_id INTO v_partner_id
  FROM tenants
  WHERE id = p_tenant_id;

  IF v_partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get partner commission rate
  SELECT commission_rate INTO v_commission_rate
  FROM partners
  WHERE id = v_partner_id AND status = 'active';

  IF v_commission_rate IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate rev-share amount (e.g. 30% of paid amount)
  v_commission_kobo := ROUND((p_amount_kobo * v_commission_rate) / 100);

  IF v_commission_kobo <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO partner_commissions (
    partner_id,
    tenant_id,
    amount_kobo,
    type,
    status,
    description
  ) VALUES (
    v_partner_id,
    p_tenant_id,
    v_commission_kobo,
    'subscription_rev_share',
    'cleared',
    p_description
  )
  RETURNING id INTO v_commission_id;

  RETURN v_commission_id;
END;
$$;
