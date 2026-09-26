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

export interface ProductAnalytics {
  product: {
    id: number;
    name: string;
    categoryName: string | null;
    categoryId: number | null;
    quantity: number;
    unit: string;
    unitCost: number | null;
    reorderThreshold: number | null;
  };
  summary: {
    totalSold: number;
    totalRevenue: number;
    avgSellingPrice: number;
    unitCost: number | null;
    totalCogs: number;
    grossProfit: number;
    profitMarginPct: number | null;
    currentStock: number;
    currentStockValue: number;
    totalRestocked: number;
    totalRestockCost: number;
  };
  sales: Array<{
    id: number;
    date: string;
    rawDate: string;
    quantity: number;
    totalAmount: number;
    unitPrice: number;
    unitCost: number | null;
    totalCost: number | null;
    profit: number | null;
    marginPct: number | null;
    source: string;
    description: string;
  }>;
  restocks: Array<{
    id: number;
    date: string;
    rawDate: string;
    quantity: number;
    totalCost: number | null;
    unitCost: number | null;
    reason: string | null;
    source: string;
  }>;
  movements: Array<{
    id: number;
    date: string;
    rawDate: string;
    changeQty: number;
    type: string;
    source: string;
    reason: string | null;
  }>;
}

function parseQtyFromDescription(desc: string | null): number {
  if (!desc) return 1;
  const verbMatch = desc.match(/(?:sold|sale of|add|added|restock|restocked)\s+(\d+(?:\.\d+)?)/i);
  if (verbMatch && verbMatch[1]) {
    const val = parseFloat(verbMatch[1]);
    if (!isNaN(val) && val > 0) return val;
  }
  const unitMatch = desc.match(/(\d+(?:\.\d+)?)\s*(?:pcs|pieces|items|units|bundles|packs|cartons|bags|bottles)\b/i);
  if (unitMatch && unitMatch[1]) {
    const val = parseFloat(unitMatch[1]);
    if (!isNaN(val) && val > 0) return val;
  }
  return 1;
}

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function getProductAnalytics(
  productId: number,
): Promise<ProductAnalytics> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  // 1. Fetch product
  const { data: product, error: prodErr } = await supabase
    .from("products")
    .select("id, name, category_id, quantity, unit, unit_cost, reorder_threshold, categories(name)")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .single();

  if (prodErr || !product) {
    throw new Error("Product not found");
  }

  const catObj = (product.categories as unknown as { name: string }[])?.[0] ?? null;
  const pUnitCost = product.unit_cost != null ? Number(product.unit_cost) : null;
  const pQuantity = Number(product.quantity);

  // 2. Fetch all ledger entries for this product
  const { data: ledgers } = await supabase
    .from("ledger_entries")
    .select("id, type, amount, item_description, source, linked_message_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  // 3. Fetch all stock movements for this product
  const { data: movements } = await supabase
    .from("stock_movements")
    .select("id, change_qty, type, source, reason, linked_message_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  // 4. Correlate sales
  const salesLedgers = (ledgers ?? []).filter((l) => l.type === "sale");
  const sales: ProductAnalytics["sales"] = [];

  let totalSold = 0;
  let totalRevenue = 0;

  for (const s of salesLedgers) {
    let qty = 1;
    // Check if there is a stock movement with the same linked_message_id
    if (s.linked_message_id) {
      const sm = movements?.find(
        (m) => m.linked_message_id === s.linked_message_id && m.type === "out",
      );
      if (sm) {
        qty = Math.abs(Number(sm.change_qty));
      } else {
        qty = parseQtyFromDescription(s.item_description);
      }
    } else {
      qty = parseQtyFromDescription(s.item_description);
    }

    const totalAmount = Number(s.amount);
    const unitPrice = qty > 0 ? Math.round((totalAmount / qty) * 100) / 100 : totalAmount;
    const totalCost = pUnitCost != null ? Math.round(qty * pUnitCost * 100) / 100 : null;
    const profit = totalCost != null ? totalAmount - totalCost : null;
    const marginPct =
      pUnitCost != null && totalAmount > 0
        ? Math.round(((profit ?? 0) / totalAmount) * 1000) / 10
        : null;

    totalSold += qty;
    totalRevenue += totalAmount;

    sales.push({
      id: s.id,
      date: formatDateTime(s.created_at),
      rawDate: s.created_at,
      quantity: qty,
      totalAmount,
      unitPrice,
      unitCost: pUnitCost,
      totalCost,
      profit,
      marginPct,
      source: s.source,
      description: s.item_description,
    });
  }

  // 5. Correlate restocks / inventory additions
  const inMovements = (movements ?? []).filter((m) => m.type === "in");
  const expenseLedgers = (ledgers ?? []).filter((l) => l.type === "expense");
  const restocks: ProductAnalytics["restocks"] = [];

  let totalRestocked = 0;
  let totalRestockCost = 0;

  for (const im of inMovements) {
    const qty = Math.abs(Number(im.change_qty));
    totalRestocked += qty;

    // Check if there was an expense logged for this restock
    let expenseAmt: number | null = null;
    if (im.linked_message_id) {
      const exp = expenseLedgers.find((e) => e.linked_message_id === im.linked_message_id);
      if (exp) {
        expenseAmt = Number(exp.amount);
      }
    }

    // If no exact linked message expense, estimate or use unit_cost
    const effectiveTotalCost =
      expenseAmt != null
        ? expenseAmt
        : pUnitCost != null
          ? qty * pUnitCost
          : null;

    const effectiveUnitCost =
      effectiveTotalCost != null && qty > 0
        ? Math.round((effectiveTotalCost / qty) * 100) / 100
        : pUnitCost;

    if (effectiveTotalCost != null) {
      totalRestockCost += effectiveTotalCost;
    }

    restocks.push({
      id: im.id,
      date: formatDateTime(im.created_at),
      rawDate: im.created_at,
      quantity: qty,
      totalCost: effectiveTotalCost,
      unitCost: effectiveUnitCost,
      reason: im.reason,
      source: im.source,
    });
  }

  // 6. Format stock movements log
  const formattedMovements: ProductAnalytics["movements"] = (movements ?? []).map((m) => ({
    id: m.id,
    date: formatDateTime(m.created_at),
    rawDate: m.created_at,
    changeQty: Number(m.change_qty),
    type: m.type,
    source: m.source,
    reason: m.reason,
  }));

  // 7. Calculate summary
  const avgSellingPrice =
    totalSold > 0 ? Math.round((totalRevenue / totalSold) * 100) / 100 : 0;
  const totalCogs = pUnitCost != null ? totalSold * pUnitCost : 0;
  const grossProfit = pUnitCost != null ? totalRevenue - totalCogs : 0;
  const profitMarginPct =
    totalRevenue > 0 && pUnitCost != null
      ? Math.round((grossProfit / totalRevenue) * 1000) / 10
      : null;
  const currentStockValue = pUnitCost != null ? pQuantity * pUnitCost : 0;

  return {
    product: {
      id: product.id,
      name: product.name,
      categoryName: catObj?.name ?? null,
      categoryId: product.category_id,
      quantity: pQuantity,
      unit: product.unit,
      unitCost: pUnitCost,
      reorderThreshold:
        product.reorder_threshold != null ? Number(product.reorder_threshold) : null,
    },
    summary: {
      totalSold,
      totalRevenue,
      avgSellingPrice,
      unitCost: pUnitCost,
      totalCogs,
      grossProfit,
      profitMarginPct,
      currentStock: pQuantity,
      currentStockValue,
      totalRestocked,
      totalRestockCost,
    },
    sales,
    restocks,
    movements: formattedMovements,
  };
}

