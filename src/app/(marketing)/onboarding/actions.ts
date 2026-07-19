"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { BUSINESS_CATEGORIES, findFuzzyMatches } from "@/lib/tenant";
import { checkProductLimit } from "@/lib/billing-server";

export interface ProductInput {
  name: string;
  categoryId?: number | null;
  quantity: number;
  unit: string;
  unitCost?: number | null;
  reorderThreshold?: number | null;
}

export interface TenantResult {
  id: number;
  businessName: string;
  businessType: string;
  whatsappNumber: string;
  categories: { id: number; name: string }[];
}

export interface TenantData {
  id: number;
  business_name: string;
  business_type: string;
  whatsapp_number: string;
}

/**
 * Fetch the current tenant or return null.
 * Also auto-activates any pending team member invitations matching this user's email.
 */
export async function getExistingTenant(): Promise<TenantData | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = createAdminClient();

  // 1. Check if user is the tenant owner
  const { data: ownedTenant } = await supabase
    .from("tenants")
    .select("id, business_name, business_type, whatsapp_number")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (ownedTenant) return ownedTenant;

  // 2. Check for pending team member invitation → auto-activate
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress;

  if (email) {
    const { data: pendingInvite } = await supabase
      .from("tenant_members")
      .select(
        "id, tenant_id, tenants!tenant_id(id, business_name, business_type, whatsapp_number)",
      )
      .eq("invited_email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingInvite) {
      // Activate the membership
      await supabase
        .from("tenant_members")
        .update({
          clerk_user_id: userId,
          status: "active",
        })
        .eq("id", pendingInvite.id);

      const tenant = (pendingInvite as any).tenants as {
        id: number;
        business_name: string;
        business_type: string;
        whatsapp_number: string;
      } | null;

      if (tenant) {
        return {
          id: tenant.id,
          business_name: tenant.business_name,
          business_type: tenant.business_type,
          whatsapp_number: tenant.whatsapp_number,
        };
      }
    }
  }

  return null;
}

/**
 * Update an existing tenant's business details.
 */
export async function updateTenant(data: {
  businessType: string;
  businessName: string;
  whatsappNumber: string;
}): Promise<{ success: boolean }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      business_name: data.businessName,
      business_type: data.businessType,
      whatsapp_number: data.whatsappNumber,
    })
    .eq("clerk_user_id", userId);

  if (error) throw new Error(error.message);
  return { success: true };
}

/**
 * Step 1: Create tenant + seed categories from business type.
 */
export async function setupTenant(data: {
  businessType: string;
  businessName: string;
  whatsappNumber: string;
}): Promise<TenantResult> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (existing) {
    throw new Error("Tenant already exists for this user");
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      business_name: data.businessName,
      business_type: data.businessType,
      whatsapp_number: data.whatsappNumber,
      clerk_user_id: userId,
    })
    .select("id, business_name, business_type, whatsapp_number")
    .single();

  if (tenantError || !tenant) {
    throw new Error(tenantError?.message ?? "Failed to create tenant");
  }

  const client = await clerkClient();
  await client.users.updateUser(userId, {
    publicMetadata: { tenant_id: tenant.id },
  });

  const categoryNames = BUSINESS_CATEGORIES[data.businessType];
  let categories: { id: number; name: string }[] = [];

  if (categoryNames && categoryNames.length > 0) {
    const { data: seeded, error: catError } = await supabase
      .from("categories")
      .insert(
        categoryNames.map((name) => ({
          tenant_id: tenant.id,
          name,
        })),
      )
      .select("id, name");

    if (!catError && seeded) {
      categories = seeded;
    }
  }

  return {
    id: tenant.id,
    businessName: tenant.business_name,
    businessType: tenant.business_type,
    whatsappNumber: tenant.whatsapp_number,
    categories,
  };
}

/**
 * Step 2: Create products for a tenant with duplicate checking.
 */
export async function createProducts(
  tenantId: number,
  products: ProductInput[],
  skipDuplicates = false,
): Promise<{
  created: number;
  duplicates: string[];
}> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const supabase = createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .eq("clerk_user_id", userId)
    .single();

  if (!tenant) throw new Error("Tenant not found");

  const productLimit = await checkProductLimit(tenantId);
  if (!productLimit.allowed) {
    throw new Error(
      `Product limit reached (${productLimit.currentCount}/${productLimit.maxProducts}). Upgrade your plan to add more products.`,
    );
  }

  if (!skipDuplicates) {
    const { data: existing } = await supabase
      .from("products")
      .select("name")
      .eq("tenant_id", tenantId);

    const candidateNames = (existing ?? []).map((p) => p.name);
    const allDuplicates: string[] = [];

    for (const product of products) {
      const matches = findFuzzyMatches(product.name, candidateNames);
      allDuplicates.push(...matches);
    }

    if (allDuplicates.length > 0) {
      return { created: 0, duplicates: [...new Set(allDuplicates)] };
    }
  }

  const { data: created, error } = await supabase
    .from("products")
    .insert(
      products.map((p) => ({
        tenant_id: tenantId,
        name: p.name.trim(),
        category_id: p.categoryId ?? null,
        quantity: p.quantity,
        unit: p.unit,
        unit_cost: p.unitCost ?? null,
        reorder_threshold:
          p.reorderThreshold ?? Math.round(p.quantity * 0.2),
      })),
    )
    .select("id, quantity");

  if (error) throw new Error(error.message);

  if (created) {
    const movements = created
      .filter((p) => Number(p.quantity) > 0)
      .map((p) => ({
        tenant_id: tenantId,
        product_id: p.id,
        change_qty: Number(p.quantity),
        type: "in" as const,
        source: "dashboard_manual" as const,
        reason: "initial stock setup",
      }));

    if (movements.length > 0) {
      await supabase.from("stock_movements").insert(movements);
    }
  }

  return { created: products.length, duplicates: [] };
}
