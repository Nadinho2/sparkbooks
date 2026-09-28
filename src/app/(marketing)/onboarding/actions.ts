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
  brand_color?: string;
  brand_logo_url?: string | null;
}

/**
 * Upload a brand logo during onboarding to the brand-assets storage bucket.
 */
export async function uploadOnboardingLogo(
  formData: FormData,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const supabase = createAdminClient();
  const file = formData.get("logo") as File;
  if (!file) {
    return { success: false, error: "No image file provided." };
  }

  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Please upload an image file (PNG, JPG, WebP, SVG)." };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "Image size must be less than 5MB." };
  }

  const ext = file.name.split(".").pop() || "png";
  const filePath = `onboarding_${userId}_${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadErr } = await supabase.storage
    .from("brand-assets")
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    return { success: false, error: uploadErr.message };
  }

  const { data: publicUrlData } = supabase.storage
    .from("brand-assets")
    .getPublicUrl(filePath);

  return { success: true, url: publicUrlData.publicUrl };
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
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (ownedTenant) {
    return {
      id: ownedTenant.id,
      business_name: ownedTenant.business_name,
      business_type: ownedTenant.business_type,
      whatsapp_number: ownedTenant.whatsapp_number,
      brand_color: (ownedTenant as any).brand_color || "#10B981",
      brand_logo_url: (ownedTenant as any).brand_logo_url || null,
    };
  }

  // 2. Check if an unclaimed store was pre-registered with this user's email by a BRM
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress?.trim().toLowerCase();

  if (email) {
    const { data: preRegistered } = await supabase
      .from("tenants")
      .select("*")
      .ilike("merchant_email", email)
      .is("clerk_user_id", null)
      .maybeSingle();

    if (preRegistered) {
      await supabase
        .from("tenants")
        .update({ clerk_user_id: userId })
        .eq("id", preRegistered.id);

      try {
        await client.users.updateUser(userId, {
          publicMetadata: { tenant_id: preRegistered.id },
        });
      } catch {}

      return {
        id: preRegistered.id,
        business_name: preRegistered.business_name,
        business_type: preRegistered.business_type,
        whatsapp_number: preRegistered.whatsapp_number,
        brand_color: (preRegistered as any).brand_color || "#10B981",
        brand_logo_url: (preRegistered as any).brand_logo_url || null,
      };
    }
  }

  // 3. Check for pending team member invitation → auto-activate
  if (email) {
    const { data: pendingInvite } = await supabase
      .from("tenant_members")
      .select(
        "id, tenant_id, tenants!tenant_id(*)",
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

      const tenant = (pendingInvite as unknown as {
        tenants: Record<string, any> | null;
      }).tenants;

      if (tenant) {
        return {
          id: tenant.id,
          business_name: tenant.business_name,
          business_type: tenant.business_type,
          whatsapp_number: tenant.whatsapp_number,
          brand_color: tenant.brand_color || "#10B981",
          brand_logo_url: tenant.brand_logo_url || null,
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
  shopAddress?: string | null;
  landmark?: string | null;
  cityLga?: string | null;
  state?: string | null;
  brandColor?: string | null;
  brandLogoUrl?: string | null;
}): Promise<{ success: boolean }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const supabase = createAdminClient();
  const updatePayload: Record<string, any> = {
    business_name: data.businessName,
    business_type: data.businessType,
    whatsapp_number: data.whatsappNumber,
  };

  if (data.shopAddress !== undefined) updatePayload.shop_address = data.shopAddress?.trim() || null;
  if (data.landmark !== undefined) updatePayload.landmark = data.landmark?.trim() || null;
  if (data.cityLga !== undefined) updatePayload.city_lga = data.cityLga?.trim() || null;
  if (data.state !== undefined) updatePayload.state = data.state?.trim() || null;
  if (data.brandColor !== undefined) updatePayload.brand_color = data.brandColor || "#10B981";
  if (data.brandLogoUrl !== undefined) updatePayload.brand_logo_url = data.brandLogoUrl;

  const { error } = await supabase
    .from("tenants")
    .update(updatePayload)
    .eq("clerk_user_id", userId);

  if (error) {
    // If brand columns don't exist yet, fallback to core fields
    if (error.message?.includes("column") || error.code === "42703") {
      const { error: fallbackError } = await supabase
        .from("tenants")
        .update({
          business_name: data.businessName,
          business_type: data.businessType,
          whatsapp_number: data.whatsappNumber,
        })
        .eq("clerk_user_id", userId);

      if (fallbackError) throw new Error(fallbackError.message);
      return { success: true };
    }
    throw new Error(error.message);
  }

  return { success: true };
}

/**
 * Step 1: Create tenant + seed categories from business type.
 */
export async function setupTenant(data: {
  businessType: string;
  businessName: string;
  whatsappNumber: string;
  shopAddress?: string | null;
  landmark?: string | null;
  cityLga?: string | null;
  state?: string | null;
  brandColor?: string | null;
  brandLogoUrl?: string | null;
}): Promise<TenantResult> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (existing) {
    throw new Error("Tenant already exists for this user");
  }

  // Check if an unclaimed tenant with this WhatsApp number already exists (pre-registered by BRM)
  const cleanDigits = data.whatsappNumber.replace(/\D/g, "");
  const suffix10 = cleanDigits.slice(-10);

  const { data: unclaimedByPhone } = await supabase
    .from("tenants")
    .select("id, business_name, business_type, whatsapp_number")
    .or(`whatsapp_number.ilike.%${suffix10}%,whatsapp_number.eq.${data.whatsappNumber.trim()}`)
    .is("clerk_user_id", null)
    .maybeSingle();

  if (unclaimedByPhone) {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();

    const claimPayload: Record<string, any> = {
      clerk_user_id: userId,
    };
    if (email) claimPayload.merchant_email = email;
    if (data.shopAddress) claimPayload.shop_address = data.shopAddress.trim();
    if (data.landmark) claimPayload.landmark = data.landmark.trim();
    if (data.cityLga) claimPayload.city_lga = data.cityLga.trim();
    if (data.state) claimPayload.state = data.state.trim();
    if (data.brandColor) claimPayload.brand_color = data.brandColor;
    if (data.brandLogoUrl) claimPayload.brand_logo_url = data.brandLogoUrl;

    await supabase
      .from("tenants")
      .update(claimPayload)
      .eq("id", unclaimedByPhone.id);

    try {
      await client.users.updateUser(userId, {
        publicMetadata: { tenant_id: unclaimedByPhone.id },
      });
    } catch {}

    const { data: existingCategories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("tenant_id", unclaimedByPhone.id);

    return {
      id: unclaimedByPhone.id,
      businessName: unclaimedByPhone.business_name,
      businessType: unclaimedByPhone.business_type,
      whatsappNumber: unclaimedByPhone.whatsapp_number,
      categories: existingCategories || [],
    };
  }

  // Check if this WhatsApp number is already owned by another claimed tenant
  const { data: alreadyClaimed } = await supabase
    .from("tenants")
    .select("id, business_name")
    .or(`whatsapp_number.ilike.%${suffix10}%,whatsapp_number.eq.${data.whatsappNumber.trim()}`)
    .not("clerk_user_id", "is", null)
    .maybeSingle();

  if (alreadyClaimed) {
    throw new Error(
      `A shop is already registered with WhatsApp number ${data.whatsappNumber} (${alreadyClaimed.business_name}). Please sign in with the original account or contact support.`
    );
  }

  const insertPayload: Record<string, any> = {
    business_name: data.businessName,
    business_type: data.businessType,
    whatsapp_number: data.whatsappNumber,
    clerk_user_id: userId,
  };
  if (data.shopAddress) insertPayload.shop_address = data.shopAddress.trim();
  if (data.landmark) insertPayload.landmark = data.landmark.trim();
  if (data.cityLga) insertPayload.city_lga = data.cityLga.trim();
  if (data.state) insertPayload.state = data.state.trim();
  if (data.brandColor) insertPayload.brand_color = data.brandColor;
  if (data.brandLogoUrl) insertPayload.brand_logo_url = data.brandLogoUrl;

  let tenant: any = null;
  let tenantError: any = null;

  const res = await supabase
    .from("tenants")
    .insert(insertPayload)
    .select("id, business_name, business_type, whatsapp_number")
    .single();

  tenant = res.data;
  tenantError = res.error;

  if (tenantError && (tenantError.message?.includes("column") || tenantError.code === "42703")) {
    const fallbackRes = await supabase
      .from("tenants")
      .insert({
        business_name: data.businessName,
        business_type: data.businessType,
        whatsapp_number: data.whatsappNumber,
        clerk_user_id: userId,
      })
      .select("id, business_name, business_type, whatsapp_number")
      .single();
    tenant = fallbackRes.data;
    tenantError = fallbackRes.error;
  }

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
