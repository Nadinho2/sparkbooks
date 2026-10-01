/**
 * Centralized stock update — the single function that mutates products.quantity
 * everywhere in the codebase. Every mutation writes a stock_movements row.
 *
 * Rule: NEVER update products.quantity directly. Always call this function.
 */

import { sendTextMessage } from "@/lib/whatsapp";
import { canSendLowStockAlert } from "@/lib/billing-server";

type StockSource = "whatsapp_voice" | "whatsapp_text" | "dashboard_manual";
type MovementType = "in" | "out" | "manual_adjustment";

interface StockUpdateParams {
  supabase: ReturnType<
    typeof import("@/lib/supabase/server").createAdminClient
  >;
  tenantId: number;
  productId: number;
  changeQty: number;
  type: MovementType;
  source: StockSource;
  reason?: string;
  linkedMessageId?: number;
  /** WhatsApp number to send low-stock alert to */
  alertPhone?: string;
}

/**
 * Update product stock — inserts stock_movements row, updates products.quantity,
 * and fires low-stock alert if threshold is breached.
 */
export async function updateProductStock(
  params: StockUpdateParams,
): Promise<number | null> {
  const {
    supabase,
    tenantId,
    productId,
    changeQty,
    type,
    source,
    reason,
    linkedMessageId,
    alertPhone,
  } = params;

  // 0. Skip stock adjustments for service items (no physical inventory)
  const { data: prodCheck } = await supabase
    .from("products")
    .select("is_service")
    .eq("id", productId)
    .maybeSingle();

  if (prodCheck?.is_service) {
    return null;
  }

  // 1. Try atomic PostgreSQL RPC execution
  try {
    const { data, error } = await supabase.rpc("adjust_product_stock", {
      p_tenant_id: tenantId,
      p_product_id: productId,
      p_change_qty: changeQty,
      p_type: type,
      p_source: source,
      p_reason: reason ?? null,
      p_linked_message_id: linkedMessageId ?? null,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      const res = data[0] as {
        movement_id: number;
        new_quantity: number;
        product_name: string;
        unit: string;
        reorder_threshold: number | null;
        last_low_stock_alert_at: string | null;
      };
      const movementId = Number(res.movement_id);
      const newQty = Number(res.new_quantity);
      const threshold = res.reorder_threshold != null ? Number(res.reorder_threshold) : null;

      await checkAndSendLowStockAlert(supabase, {
        productId,
        tenantId,
        productName: res.product_name,
        newQty,
        unit: res.unit,
        threshold,
        lastAlertAt: res.last_low_stock_alert_at,
        alertPhone,
      });

      return movementId;
    }
  } catch {
    // Fall back to sequential execution
  }

  // 2. Sequential fallback if RPC is not yet loaded in DB
  const { data: product, error: fetchError } = await supabase
    .from("products")
    .select("id, name, quantity, unit, reorder_threshold, last_low_stock_alert_at")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .single();

  if (fetchError || !product) {
    throw new Error(`Product ${productId} not found: ${fetchError?.message}`);
  }

  const currentQty = Number(product.quantity);
  const newQty = Math.max(0, currentQty + changeQty);

  // Insert stock_movements row (audit trail)
  const { data: movement, error: moveError } = await supabase
    .from("stock_movements")
    .insert({
      tenant_id: tenantId,
      product_id: productId,
      change_qty: changeQty,
      type,
      source,
      reason: reason ?? null,
      linked_message_id: linkedMessageId ?? null,
    })
    .select("id")
    .single();

  if (moveError) {
    throw new Error(`Failed to insert stock movement: ${moveError.message}`);
  }

  // Update product quantity
  const { error: updateError } = await supabase
    .from("products")
    .update({ quantity: newQty })
    .eq("id", productId);

  if (updateError) {
    throw new Error(`Failed to update product quantity: ${updateError.message}`);
  }

  // Check low-stock threshold and send alert
  await checkAndSendLowStockAlert(supabase, {
    productId,
    tenantId,
    productName: product.name,
    newQty,
    unit: product.unit,
    threshold: product.reorder_threshold != null ? Number(product.reorder_threshold) : null,
    lastAlertAt: product.last_low_stock_alert_at,
    alertPhone,
  });

  return movement.id;
}

interface LowStockCheck {
  productId: number;
  tenantId: number;
  productName: string;
  newQty: number;
  unit: string;
  threshold: number | null;
  lastAlertAt: string | null;
  alertPhone?: string;
}

/**
 * Check if a product is low on stock and send a WhatsApp alert
 * if no alert was sent in the last 24 hours.
 */
async function checkAndSendLowStockAlert(
  supabase: ReturnType<
    typeof import("@/lib/supabase/server").createAdminClient
  >,
  check: LowStockCheck,
): Promise<void> {
  if (check.threshold == null || check.newQty > check.threshold) return;
  if (!check.alertPhone) return;

  // Check if tenant's plan allows WhatsApp low-stock alerts
  const canAlert = await canSendLowStockAlert(check.tenantId);
  if (!canAlert) return;

  // 24-hour dedup
  const now = new Date();
  if (check.lastAlertAt) {
    const lastAlert = new Date(check.lastAlertAt);
    const hoursSince = (now.getTime() - lastAlert.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) return;
  }

  // Send alert
  const body = `${check.productName} is down to ${check.newQty} ${check.unit} — might be time to restock.`;

  try {
    await sendTextMessage(check.alertPhone, body);
  } catch {
    // Template fallback would go here if outside 24h window
    console.warn(`Failed to send low-stock alert for product ${check.productId}`);
    return;
  }

  // Record alert time
  await supabase
    .from("products")
    .update({ last_low_stock_alert_at: now.toISOString() })
    .eq("id", check.productId);

  // Dispatch low stock email alert via Resend if merchant email is configured
  try {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("business_name, merchant_email")
      .eq("id", check.tenantId)
      .single();

    if (tenant?.merchant_email) {
      const { sendLowStockEmail } = await import("@/lib/email");
      await sendLowStockEmail(
        tenant.merchant_email,
        tenant.business_name || "SparkBooks Store",
        check.productName,
        check.newQty,
        check.unit
      );
    }
  } catch (emailErr) {
    console.warn("Could not dispatch low stock email alert:", emailErr);
  }
}
