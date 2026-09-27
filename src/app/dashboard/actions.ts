"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant-server";
import { revalidatePath } from "next/cache";
import { updateProductStock } from "@/lib/stock";

export interface LedgerEntryItem {
  id: number;
  type: "sale" | "expense";
  amount: number;
  itemDescription: string;
  productId: number | null;
  productName: string | null;
  paymentMethod: string | null;
  customerName: string | null;
  source: "whatsapp_voice" | "whatsapp_text" | "dashboard_manual";
  confidenceScore: number | null;
  createdAt: string;
}

export interface DashboardOverviewData {
  entries: LedgerEntryItem[];
  products: { id: number; name: string; unitCost: number | null }[];
}

/**
 * Fetch all ledger entries and available products for the current tenant.
 */
export async function fetchDashboardOverview(): Promise<DashboardOverviewData> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  const [entriesRes, productsRes] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select("id, type, amount, item_description, product_id, payment_method, customer_name, source, confidence_score, created_at, products(name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("products")
      .select("id, name, unit_cost")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  if (entriesRes.error) {
    throw new Error(`Failed to load ledger: ${entriesRes.error.message}`);
  }

  const entries: LedgerEntryItem[] = (entriesRes.data ?? []).map((row) => {
    const prodObj = (row.products as unknown as { name: string }[])?.[0] ?? null;
    const r = row as { payment_method?: string | null; customer_name?: string | null };
    return {
      id: row.id,
      type: row.type as "sale" | "expense",
      amount: Number(row.amount),
      itemDescription: row.item_description,
      productId: row.product_id,
      productName: prodObj?.name ?? null,
      paymentMethod: r.payment_method ?? "transfer",
      customerName: r.customer_name ?? null,
      source: row.source as "whatsapp_voice" | "whatsapp_text" | "dashboard_manual",
      confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
      createdAt: row.created_at,
    };
  });

  const products = (productsRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    unitCost: p.unit_cost != null ? Number(p.unit_cost) : null,
  }));

  return { entries, products };
}

/**
 * Record a manual sale or expense from the dashboard.
 */
export async function createManualLedgerEntry(data: {
  type: "sale" | "expense";
  amount: number;
  itemDescription: string;
  productId?: number | null;
  quantity?: number | null;
  paymentMethod?: string | null;
  customerName?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  if (!data.amount || data.amount <= 0) {
    return { success: false, error: "Amount must be greater than 0" };
  }

  if (!data.itemDescription?.trim()) {
    return { success: false, error: "Description is required" };
  }

  // 1. Insert into ledger_entries
  const { data: newEntry, error: insertError } = await supabase
    .from("ledger_entries")
    .insert({
      tenant_id: tenantId,
      type: data.type,
      amount: data.amount,
      item_description: data.itemDescription.trim(),
      product_id: data.productId ?? null,
      payment_method: data.paymentMethod || null,
      customer_name: data.customerName?.trim() || null,
      source: "dashboard_manual",
      confidence_score: 1.0,
    })
    .select("id")
    .single();

  if (insertError || !newEntry) {
    return { success: false, error: insertError?.message ?? "Failed to save entry" };
  }

  // 2. If it's a sale with a linked product and quantity, update inventory stock
  if (data.type === "sale" && data.productId && data.quantity && data.quantity > 0) {
    try {
      await updateProductStock({
        supabase,
        tenantId,
        productId: data.productId,
        changeQty: -data.quantity,
        type: "out",
        source: "dashboard_manual",
        reason: `Manual sale entry #${newEntry.id}`,
      });
    } catch (err) {
      console.error("Failed to adjust inventory for manual sale:", err);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  return { success: true };
}

/**
 * Delete a ledger entry.
 */
export async function deleteLedgerEntry(entryId: number): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("ledger_entries")
    .delete()
    .eq("id", entryId)
    .eq("tenant_id", tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
