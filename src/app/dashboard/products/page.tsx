import { getCurrentTenant, isTenantOwner } from "@/lib/tenant-server";
import { createAdminClient } from "@/lib/supabase/server";
import { ProductTable, type ProductRow, type Category } from "@/components/dashboard/ProductTable";
import { parsePackagingUnits } from "@/lib/packaging";

export default async function ProductsPage() {
  const tenant = await getCurrentTenant();
  const isOwner = await isTenantOwner();
  const supabase = createAdminClient();

  // Fetch non-deleted products with category names (gracefully fallback if packaging_units column not yet created)
  let products: any[] | null = null;
  const { data: withPkg, error: pkgErr } = await supabase
    .from("products")
    .select(
      "id, name, category_id, quantity, unit, unit_cost, reorder_threshold, is_service, pieces_per_pack, packaging_units, categories(name)",
    )
    .eq("tenant_id", tenant.id)
    .is("deleted_at", null)
    .order("name");

  if (!pkgErr) {
    products = withPkg;
  } else {
    const { data: withoutPkg } = await supabase
      .from("products")
      .select(
        "id, name, category_id, quantity, unit, unit_cost, reorder_threshold, is_service, pieces_per_pack, categories(name)",
      )
      .eq("tenant_id", tenant.id)
      .is("deleted_at", null)
      .order("name");
    products = withoutPkg;
  }

  // Fetch categories
  const { data: categoryList } = await supabase
    .from("categories")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .order("name");

  // Fetch latest restock date per product (max created_at from stock_movements where type='in')
  const productIds = (products ?? []).map((p) => p.id);
  const restockMap: Record<number, string> = {};
  const salesMap: Record<number, { totalSold: number; totalRevenue: number }> = {};

  if (productIds.length > 0) {
    const { data: restocks } = await supabase
      .from("stock_movements")
      .select("product_id, created_at")
      .in("product_id", productIds)
      .eq("type", "in")
      .order("created_at", { ascending: false });

    if (restocks) {
      for (const r of restocks) {
        if (!restockMap[r.product_id]) {
          restockMap[r.product_id] = new Date(r.created_at).toLocaleDateString(
            "en-NG",
            { day: "numeric", month: "short", year: "numeric" },
          );
        }
      }
    }

    // Fetch sales and stock movements for products to show total sold counts
    const { data: salesLedgers } = await supabase
      .from("ledger_entries")
      .select("product_id, amount, linked_message_id, item_description")
      .in("product_id", productIds)
      .eq("type", "sale");

    const { data: movements } = await supabase
      .from("stock_movements")
      .select("product_id, change_qty, linked_message_id, type")
      .in("product_id", productIds);

    for (const pid of productIds) {
      salesMap[pid] = { totalSold: 0, totalRevenue: 0 };
    }

    if (salesLedgers) {
      for (const s of salesLedgers) {
        if (!s.product_id) continue;
        let qty = 1;
        if (s.linked_message_id) {
          const sm = movements?.find(
            (m) =>
              m.linked_message_id === s.linked_message_id &&
              m.product_id === s.product_id &&
              m.type === "out",
          );
          if (sm) {
            qty = Math.abs(Number(sm.change_qty));
          } else {
            const verbMatch = s.item_description?.match(
              /(?:sold|sale of|add|added|restock|restocked)\s+(\d+(?:\.\d+)?)/i,
            );
            qty = verbMatch ? parseFloat(verbMatch[1]) : 1;
          }
        } else {
          const verbMatch = s.item_description?.match(
            /(?:sold|sale of|add|added|restock|restocked)\s+(\d+(?:\.\d+)?)/i,
          );
          qty = verbMatch ? parseFloat(verbMatch[1]) : 1;
        }

        if (!salesMap[s.product_id]) {
          salesMap[s.product_id] = { totalSold: 0, totalRevenue: 0 };
        }
        salesMap[s.product_id].totalSold += qty;
        salesMap[s.product_id].totalRevenue += Number(s.amount);
      }
    }
  }

  // Build rows
  const rows: ProductRow[] = (products ?? []).map((p) => {
    const catObj = (p.categories as unknown as { name: string }[])?.[0] ?? null;
    const isService = Boolean(p.is_service);
    const piecesPerPack = p.pieces_per_pack != null ? Number(p.pieces_per_pack) : null;
    const quantity = Number(p.quantity);
    const unitCost = p.unit_cost != null ? Number(p.unit_cost) : null;
    const threshold = p.reorder_threshold != null ? Number(p.reorder_threshold) : null;
    const salesInfo = salesMap[p.id] ?? { totalSold: 0, totalRevenue: 0 };

    return {
      id: p.id,
      name: p.name,
      categoryName: catObj?.name ?? null,
      categoryId: p.category_id,
      quantity: isService ? 0 : quantity,
      unit: p.unit,
      unitCost,
      reorderThreshold: isService ? null : threshold,
      lastRestocked: restockMap[p.id] ?? null,
      totalValue: (!isService && unitCost != null) ? quantity * unitCost : 0,
      isLowStock: !isService && threshold != null && quantity <= threshold,
      totalSold: salesInfo.totalSold,
      totalRevenue: salesInfo.totalRevenue,
      isService,
      piecesPerPack,
      packagingUnits: parsePackagingUnits(p.packaging_units, piecesPerPack),
    };
  });

  const categories: Category[] = (categoryList ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <ProductTable
      products={rows}
      categories={categories}
      tenantId={tenant.id}
      isOwner={isOwner}
      canBulkUpload={tenant.planTier !== "free"}
    />
  );
}
