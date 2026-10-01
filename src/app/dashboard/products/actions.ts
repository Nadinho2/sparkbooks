"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { updateProductStock } from "@/lib/stock";
import { checkProductLimit } from "@/lib/billing-server";
import { findFuzzyMatches } from "@/lib/tenant";
import { getCurrentTenantId, isTenantOwner } from "@/lib/tenant-server";

export type EditProductData = {
  id: number;
  name: string;
  categoryId: number | null;
  unit: string;
  unitCost: number | null;
  reorderThreshold: number | null;
  isService?: boolean;
  piecesPerPack?: number | null;
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
  isService?: boolean;
  piecesPerPack?: number | null;
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

  const isService = Boolean(data.isService);

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      tenant_id: tenantId,
      name: data.name.trim(),
      category_id: data.categoryId,
      quantity: isService ? 0 : data.quantity,
      unit: data.unit,
      unit_cost: data.unitCost,
      reorder_threshold: isService
        ? null
        : (data.reorderThreshold ?? Math.round(data.quantity * 0.2)),
      is_service: isService,
      pieces_per_pack: isService ? null : (data.piecesPerPack ?? null),
    })
    .select("id, quantity, is_service")
    .single();

  if (error) throw new Error(error.message);

  // Write initial stock movement if quantity > 0 and not a service
  if (created && !created.is_service && Number(created.quantity) > 0) {
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

  const isService = Boolean(data.isService);
  const updatePayload: Record<string, unknown> = {
    name: data.name.trim(),
    category_id: data.categoryId,
    unit: data.unit,
    unit_cost: data.unitCost,
    reorder_threshold: isService ? null : data.reorderThreshold,
    is_service: isService,
    pieces_per_pack: isService ? null : (data.piecesPerPack ?? null),
  };

  if (isService) {
    updatePayload.quantity = 0;
  }

  // Update product fields
  const { error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", data.id)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  // If quantity changed and not service, use centralized stock update (also handles low-stock alert)
  if (!isService && data.quantityDelta && data.quantityDelta !== 0) {
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

export async function renameProduct(
  productId: number,
  newName: string,
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const trimmed = newName.trim();
  if (!trimmed) {
    return { success: false, error: "Product name cannot be empty." };
  }

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("products")
    .update({ name: trimmed })
    .eq("id", productId)
    .eq("tenant_id", tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/products");
  return { success: true };
}

export async function softDeleteProduct(
  _clientTenantId: number,
  productId: number,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const isOwner = await isTenantOwner();
  if (!isOwner) throw new Error("Only the account owner can delete products from the catalog.");

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
    isService?: boolean;
    piecesPerPack?: number | null;
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
    .select("id, name, category_id, quantity, unit, unit_cost, reorder_threshold, is_service, pieces_per_pack, categories(name)")
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
  const isProdService = Boolean(product.is_service);
  const currentStockValue = (!isProdService && pUnitCost != null) ? pQuantity * pUnitCost : 0;

  return {
    product: {
      id: product.id,
      name: product.name,
      categoryName: catObj?.name ?? null,
      categoryId: product.category_id,
      quantity: isProdService ? 0 : pQuantity,
      unit: product.unit,
      unitCost: pUnitCost,
      reorderThreshold:
        !isProdService && product.reorder_threshold != null ? Number(product.reorder_threshold) : null,
      isService: isProdService,
      piecesPerPack: product.pieces_per_pack != null ? Number(product.pieces_per_pack) : null,
    },
    summary: {
      totalSold,
      totalRevenue,
      avgSellingPrice,
      unitCost: pUnitCost,
      totalCogs,
      grossProfit,
      profitMarginPct,
      currentStock: isProdService ? 0 : pQuantity,
      currentStockValue,
      totalRestocked,
      totalRestockCost,
    },
    sales,
    restocks,
    movements: formattedMovements,
  };
}

export interface BulkProductItem {
  name: string;
  categoryName?: string | null;
  quantity?: number;
  unit?: string;
  unitCost?: number | null;
  reorderThreshold?: number | null;
  piecesPerPack?: number | null;
  isService?: boolean;
}

export interface BulkImportResult {
  success: boolean;
  imported: number;
  skippedDuplicates: string[];
  error?: string;
}

export async function bulkImportProducts(
  products: BulkProductItem[],
  options?: { skipDuplicates?: boolean },
): Promise<BulkImportResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, imported: 0, skippedDuplicates: [], error: "Unauthorized" };
  }

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  // Enforce plan check (Starter or Pro)
  const { data: tenant } = await supabase
    .from("tenants")
    .select("plan_tier")
    .eq("id", tenantId)
    .single();

  if (!tenant || tenant.plan_tier === "free") {
    return {
      success: false,
      imported: 0,
      skippedDuplicates: [],
      error: "CSV Bulk Upload is available on Starter and Pro plans. Please upgrade your plan to use this feature.",
    };
  }

  // Enforce product limits if applicable
  const limit = await checkProductLimit(tenantId);
  if (!limit.allowed) {
    return {
      success: false,
      imported: 0,
      skippedDuplicates: [],
      error: `Product limit reached (${limit.currentCount}/${limit.maxProducts}). Upgrade your plan to add more products.`,
    };
  }

  if (!products || products.length === 0) {
    return { success: false, imported: 0, skippedDuplicates: [], error: "No products provided" };
  }

  // Fetch existing categories to match or create new ones
  const { data: existingCategories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("tenant_id", tenantId);

  const categoryMap = new Map<string, number>();
  (existingCategories ?? []).forEach((c) => {
    categoryMap.set(c.name.trim().toLowerCase(), c.id);
  });

  // Collect any category names in products that don't exist yet
  const newCategoryNames = new Set<string>();
  products.forEach((p) => {
    const rawCat = p.categoryName?.trim();
    if (rawCat && !categoryMap.has(rawCat.toLowerCase())) {
      newCategoryNames.add(rawCat);
    }
  });

  if (newCategoryNames.size > 0) {
    const newCatsToInsert = Array.from(newCategoryNames).map((name) => ({
      tenant_id: tenantId,
      name,
    }));
    const { data: createdCats } = await supabase
      .from("categories")
      .insert(newCatsToInsert)
      .select("id, name");

    (createdCats ?? []).forEach((c) => {
      categoryMap.set(c.name.trim().toLowerCase(), c.id);
    });
  }

  // Fetch existing products to check for duplicates
  const { data: existingProducts } = await supabase
    .from("products")
    .select("name")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  const existingNameSet = new Set(
    (existingProducts ?? []).map((p) => p.name.trim().toLowerCase()),
  );

  const skippedDuplicates: string[] = [];
  const toInsert: Array<{
    tenant_id: number;
    name: string;
    category_id: number | null;
    quantity: number;
    unit: string;
    unit_cost: number | null;
    reorder_threshold: number | null;
    is_service: boolean;
    pieces_per_pack: number | null;
  }> = [];

  const seenInBatch = new Set<string>();

  for (const item of products) {
    const cleanName = item.name?.trim();
    if (!cleanName) continue;

    const lowerName = cleanName.toLowerCase();
    if (existingNameSet.has(lowerName) || seenInBatch.has(lowerName)) {
      skippedDuplicates.push(cleanName);
      if (options?.skipDuplicates !== false) {
        continue;
      }
    }
    seenInBatch.add(lowerName);

    const isService = Boolean(item.isService);
    const qty = isService ? 0 : Math.max(0, Number(item.quantity) || 0);
    const cost =
      item.unitCost != null && !isNaN(Number(item.unitCost))
        ? Math.max(0, Number(item.unitCost))
        : null;
    const threshold =
      !isService && item.reorderThreshold != null && !isNaN(Number(item.reorderThreshold))
        ? Math.max(0, Number(item.reorderThreshold))
        : isService
          ? null
          : Math.round(qty * 0.2);
    const piecesPerPack =
      !isService && item.piecesPerPack != null && !isNaN(Number(item.piecesPerPack))
        ? Math.max(1, Number(item.piecesPerPack))
        : null;

    let catId: number | null = null;
    if (item.categoryName?.trim()) {
      catId = categoryMap.get(item.categoryName.trim().toLowerCase()) ?? null;
    }

    toInsert.push({
      tenant_id: tenantId,
      name: cleanName,
      category_id: catId,
      quantity: qty,
      unit: item.unit?.trim() || "item",
      unit_cost: cost,
      reorder_threshold: threshold,
      is_service: isService,
      pieces_per_pack: piecesPerPack,
    });
  }

  if (toInsert.length === 0) {
    return {
      success: true,
      imported: 0,
      skippedDuplicates,
      error:
        skippedDuplicates.length > 0
          ? "All products were skipped because they already exist in your catalog."
          : "No valid product rows were found in the uploaded file.",
    };
  }

  // Insert products
  const { data: inserted, error: insertError } = await supabase
    .from("products")
    .insert(toInsert)
    .select("id, quantity, is_service");

  if (insertError) {
    return {
      success: false,
      imported: 0,
      skippedDuplicates,
      error: insertError.message,
    };
  }

  // Create initial stock movements for non-service products with quantity > 0
  const movements = (inserted ?? [])
    .filter((p) => !p.is_service && Number(p.quantity) > 0)
    .map((p) => ({
      tenant_id: tenantId,
      product_id: p.id,
      change_qty: Number(p.quantity),
      type: "in",
      source: "dashboard_csv_import",
      reason: "Bulk CSV/Excel import",
    }));

  if (movements.length > 0) {
    try {
      await supabase.from("stock_movements").insert(movements);
    } catch (movErr) {
      console.warn("Could not insert initial stock movements for bulk import:", movErr);
    }
  }

  revalidatePath("/dashboard/products");

  return {
    success: true,
    imported: inserted?.length ?? toInsert.length,
    skippedDuplicates,
  };
}

