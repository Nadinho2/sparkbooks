-- ============================================================
-- SparkBooks: Performance & Atomic Inventory Optimization
-- Migration 008: Phone lookup indexes and atomic stock adjust RPC
-- ============================================================

-- ------------------------------------------------------------
-- 1. PHONE NORMALIZATION & INDEXES
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_phone(phone TEXT)
RETURNS TEXT AS $$
    SELECT regexp_replace(phone, '[^0-9]', '', 'g');
$$ LANGUAGE sql IMMUTABLE;

CREATE INDEX IF NOT EXISTS idx_tenants_normalized_phone
    ON tenants (normalize_phone(whatsapp_number));

CREATE INDEX IF NOT EXISTS idx_tenant_members_normalized_phone
    ON tenant_members (tenant_id, normalize_phone(whatsapp_number));

-- ------------------------------------------------------------
-- 2. FAST TENANT LOOKUP BY PHONE
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 3. FAST SENDER MEMBER LOOKUP BY PHONE
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. ATOMIC STOCK ADJUSTMENT RPC
-- Locks the product row, updates quantity, and records movement in 1 transaction
-- ------------------------------------------------------------
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
    -- 1. Atomic update of products table with row-level locking
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

    -- 2. Insert into stock_movements within the same transaction
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
