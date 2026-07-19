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

  // 1. Get current product state
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

  // 2. Insert stock_movements row (ALWAYS — this is the audit trail)
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

  // 3. Update product quantity
  const { error: updateError } = await supabase
    .from("products")
    .update({ quantity: newQty })
    .eq("id", productId);

  if (updateError) {
    throw new Error(`Failed to update product quantity: ${updateError.message}`);
  }

  // 4. Check low-stock threshold and send alert
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
}
