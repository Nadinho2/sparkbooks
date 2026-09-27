-- Migration 013: Regional Coordinators & Multi-tier Agency Hierarchy

-- 1. Add coordinator role and coordinator parent hierarchy to partners table
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'field_agent' CHECK (role IN ('field_agent', 'coordinator')),
  ADD COLUMN IF NOT EXISTS coordinator_id BIGINT REFERENCES partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS region TEXT;

CREATE INDEX IF NOT EXISTS idx_partners_role ON partners (role);
CREATE INDEX IF NOT EXISTS idx_partners_coordinator_id ON partners (coordinator_id);

-- 2. Update record_partner_commission to handle 2-tier 20% / 10% commission split
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
  v_partner_role TEXT;
  v_coordinator_id BIGINT;
  v_partner_rate NUMERIC(5,2);
  v_field_kobo BIGINT;
  v_override_kobo BIGINT;
  v_field_comm_id BIGINT;
BEGIN
  -- 1. Find partner attached to tenant
  SELECT partner_id INTO v_partner_id
  FROM tenants
  WHERE id = p_tenant_id;

  IF v_partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Get partner role, coordinator parent, and commission rate
  SELECT role, coordinator_id, commission_rate 
  INTO v_partner_role, v_coordinator_id, v_partner_rate
  FROM partners
  WHERE id = v_partner_id AND status = 'active';

  IF v_partner_rate IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Case A: Partner is a Coordinator or direct independent agent (no coordinator parent)
  IF v_partner_role = 'coordinator' OR v_coordinator_id IS NULL THEN
    -- Direct onboarding gets the full 30% (or partner_rate)
    v_field_kobo := ROUND((p_amount_kobo * v_partner_rate) / 100);

    IF v_field_kobo > 0 THEN
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
        v_field_kobo,
        'subscription_rev_share',
        'cleared',
        p_description || ' (Direct)'
      )
      RETURNING id INTO v_field_comm_id;
    END IF;

    RETURN v_field_comm_id;

  -- 4. Case B: Partner is a Field Agent under a Regional Coordinator
  ELSE
    -- Field BRM gets 20%
    v_field_kobo := ROUND((p_amount_kobo * 20.00) / 100);
    -- Regional Coordinator gets 10% override
    v_override_kobo := ROUND((p_amount_kobo * 10.00) / 100);

    -- Credit Field BRM
    IF v_field_kobo > 0 THEN
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
        v_field_kobo,
        'subscription_rev_share',
        'cleared',
        p_description || ' (Field BRM: 20%)'
      )
      RETURNING id INTO v_field_comm_id;
    END IF;

    -- Credit Regional Coordinator override
    IF v_override_kobo > 0 AND v_coordinator_id IS NOT NULL THEN
      INSERT INTO partner_commissions (
        partner_id,
        tenant_id,
        amount_kobo,
        type,
        status,
        description
      ) VALUES (
        v_coordinator_id,
        p_tenant_id,
        v_override_kobo,
        'subscription_rev_share',
        'cleared',
        p_description || ' (Team Override: 10%)'
      );
    END IF;

    RETURN v_field_comm_id;
  END IF;
END;
$$;
