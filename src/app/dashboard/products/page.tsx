import { getCurrentTenant } from "@/lib/tenant-server";
import { createAdminClient } from "@/lib/supabase/server";
import { ProductTable, type ProductRow, type Category } from "@/components/dashboard/ProductTable";

export default async function ProductsPage() {
  const tenant = await getCurrentTenant();
  const supabase = createAdminClient();

  // Fetch non-deleted products with category names
  const { data: products } = await supabase
    .from("products")
    .select(
      "id, name, category_id, quantity, unit, unit_cost, reorder_threshold, categories(name)",
    )
    .eq("tenant_id", tenant.id)
    .is("deleted_at", null)
    .order("name");

  // Fetch categories
  const { data: categoryList } = await supabase
    .from("categories")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .order("name");

  // Fetch latest restock date per product (max created_at from stock_movements where type='in')
  const productIds = (products ?? []).map((p) => p.id);
  const restockMap: Record<number, string> = {};

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
  }

  // Build rows
  const rows: ProductRow[] = (products ?? []).map((p) => {
    const catObj = (p.categories as unknown as { name: string }[])?.[0] ?? null;
    const quantity = Number(p.quantity);
    const unitCost = p.unit_cost != null ? Number(p.unit_cost) : null;
    const threshold = p.reorder_threshold != null ? Number(p.reorder_threshold) : null;

    return {
      id: p.id,
      name: p.name,
      categoryName: catObj?.name ?? null,
      categoryId: p.category_id,
      quantity,
      unit: p.unit,
      unitCost,
      reorderThreshold: threshold,
      lastRestocked: restockMap[p.id] ?? null,
      totalValue: unitCost != null ? quantity * unitCost : 0,
      isLowStock: threshold != null && quantity <= threshold,
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
    />
  );
}
