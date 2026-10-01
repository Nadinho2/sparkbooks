-- ============================================================
-- SparkBooks: Services, Pack Size Conversions & Stock Adjustments
-- Migration 017: Add is_service, pieces_per_pack, and metadata
-- ============================================================

-- 1. Add is_service and pieces_per_pack to products
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pieces_per_pack NUMERIC(12,2) DEFAULT NULL;

-- 2. Add metadata JSONB to whatsapp_messages for interactive dialogs / pack size clarification
ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 3. Create index for fast lookup of pending interactive messages
CREATE INDEX IF NOT EXISTS idx_wa_messages_pending_action
    ON whatsapp_messages (tenant_id, status)
    WHERE status = 'pending_confirmation';

-- 4. Update adjust_product_stock RPC to be safe for service items
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
    v_is_service BOOLEAN;
BEGIN
    -- Check if product is a service
    SELECT is_service INTO v_is_service
    FROM products
    WHERE id = p_product_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found or deleted for tenant %', p_product_id, p_tenant_id;
    END IF;

    -- If service, do not mutate quantity or write stock movement
    IF v_is_service IS TRUE THEN
        RETURN QUERY
        SELECT 0::BIGINT, 0::NUMERIC, p.name, p.unit, NULL::NUMERIC, NULL::TIMESTAMPTZ
        FROM products p
        WHERE p.id = p_product_id;
        RETURN;
    END IF;

    -- 1. Atomic update of products table with row-level locking
    UPDATE products
    SET quantity = GREATEST(0, quantity + p_change_qty),
        updated_at = now()
    WHERE id = p_product_id
      AND tenant_id = p_tenant_id
      AND deleted_at IS NULL
    RETURNING quantity, name, unit, reorder_threshold, last_low_stock_alert_at
    INTO v_new_quantity, v_product_name, v_unit, v_reorder_threshold, v_last_low_stock_alert_at;

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
