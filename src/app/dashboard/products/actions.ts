"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { updateProductStock } from "@/lib/stock";
import { checkProductLimit } from "@/lib/billing-server";
import { findFuzzyMatches } from "@/lib/tenant";
import { getCurrentTenantId } from "@/lib/tenant-server";

export type EditProductData = {
  id: number;
  name: string;
  categoryId: number | null;
  unit: string;
  unitCost: number | null;
  reorderThreshold: number | null;
  /** Only set if quantity changed — the delta (new - old) */
  quantityDelta?: number;
  quantityChangeReason?: string;
};

export type CreateProductData = {
  name: string;
  categoryId: number | null;
  quantity: number;
  unit: string;
  unitCost: number | null;
  reorderThreshold: number | null;
};

export async function createProduct(
  _clientTenantId: number,
  data: CreateProductData,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();

  const supabase = createAdminClient();

  // Enforce product limit
  const limit = await checkProductLimit(tenantId);
  if (!limit.allowed) {
    throw new Error(
      `Product limit reached (${limit.currentCount}/${limit.maxProducts}). Upgrade your plan to add more products.`,
    );
  }

  // Check for duplicates via fuzzy match
  const { data: existing } = await supabase
    .from("products")
    .select("name")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  const candidateNames = (existing ?? []).map((p) => p.name);
  const matches = findFuzzyMatches(data.name.trim(), candidateNames);
  if (matches.length > 0) {
    throw new Error(
      `A similar product already exists: ${matches.join(", ")}`,
    );
  }

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      tenant_id: tenantId,
      name: data.name.trim(),
      category_id: data.categoryId,
      quantity: data.quantity,
      unit: data.unit,
      unit_cost: data.unitCost,
      reorder_threshold:
        data.reorderThreshold ?? Math.round(data.quantity * 0.2),
    })
    .select("id, quantity")
    .single();

  if (error) throw new Error(error.message);

  // Write initial stock movement if quantity > 0
  if (created && Number(created.quantity) > 0) {
    await supabase.from("stock_movements").insert({
      tenant_id: tenantId,
      product_id: created.id,
      change_qty: Number(created.quantity),
      type: "in",
      source: "dashboard_manual",
      reason: "initial stock via dashboard",
    });
  }

  revalidatePath("/dashboard/products");
}

export async function updateProduct(
  _clientTenantId: number,
  data: EditProductData,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();

  const supabase = createAdminClient();

  // Update product fields
  const { error } = await supabase
    .from("products")
    .update({
      name: data.name.trim(),
      category_id: data.categoryId,
      unit: data.unit,
      unit_cost: data.unitCost,
      reorder_threshold: data.reorderThreshold,
    })
    .eq("id", data.id)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  // If quantity changed, use centralized stock update (also handles low-stock alert)
  if (data.quantityDelta && data.quantityDelta !== 0) {
    await updateProductStock({
      supabase,
      tenantId,
      productId: data.id,
      changeQty: data.quantityDelta,
      type: "manual_adjustment",
      source: "dashboard_manual",
      reason: data.quantityChangeReason ?? "stock count correction",
    });
  }

  revalidatePath("/dashboard/products");
}

export async function softDeleteProduct(
  _clientTenantId: number,
  productId: number,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/products");
}
