"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantId, isTenantOwner } from "@/lib/tenant-server";

/* ──────── Category CRUD server actions ──────── */

export async function createCategory(
  _clientTenantId: number,
  name: string,
): Promise<{ id: number; name: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({ tenant_id: tenantId, name: name.trim() })
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/products");
  return data;
}

export async function renameCategory(
  categoryId: number,
  newName: string,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("categories")
    .update({ name: newName.trim() })
    .eq("id", categoryId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/products");
}

export async function deleteCategory(
  _clientTenantId: number,
  categoryId: number,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const isOwner = await isTenantOwner();
  if (!isOwner) throw new Error("Only the account owner can delete categories.");

  const tenantId = await getCurrentTenantId();
  const supabase = createAdminClient();

  // Find or create "Uncategorized" for this tenant
  let { data: uncat } = await supabase
    .from("categories")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", "Uncategorized")
    .single();

  if (!uncat) {
    const { data: created } = await supabase
      .from("categories")
      .insert({ tenant_id: tenantId, name: "Uncategorized" })
      .select("id")
      .single();
    uncat = created;
  }

  // Reassign products strictly within this tenant
  await supabase
    .from("products")
    .update({ category_id: uncat!.id })
    .eq("category_id", categoryId)
    .eq("tenant_id", tenantId);

  // Delete category strictly within this tenant
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/products");
}
