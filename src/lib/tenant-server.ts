import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { PlanTier, PlanStatus } from "@/lib/billing";

interface Tenant {
  id: number;
  businessName: string;
  businessType: string;
  whatsappNumber: string;
  shopAddress: string | null;
  landmark: string | null;
  cityLga: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  brandLogoUrl: string | null;
  brandColor: string;
  planTier: PlanTier;
  planStatus: PlanStatus;
  monthlyMessageCount: number;
  monthlyMessageLimit: number;
  currentPeriodEnd: string | null;
  paystackCustomerId: string | null;
  paystackSubscriptionId: string | null;
  isSuspended: boolean;
}

function mapTenantRow(data: Record<string, unknown>): Tenant {
  return {
    id: data.id as number,
    businessName: data.business_name as string,
    businessType: data.business_type as string,
    whatsappNumber: data.whatsapp_number as string,
    shopAddress: (data.shop_address as string | null) ?? null,
    landmark: (data.landmark as string | null) ?? null,
    cityLga: (data.city_lga as string | null) ?? null,
    state: (data.state as string | null) ?? null,
    latitude: data.latitude ? Number(data.latitude) : null,
    longitude: data.longitude ? Number(data.longitude) : null,
    brandLogoUrl: (data.brand_logo_url as string | null) ?? null,
    brandColor: (data.brand_color as string | null) || "#10B981",
    planTier: data.plan_tier as PlanTier,
    planStatus: data.plan_status as PlanStatus,
    monthlyMessageCount: data.monthly_message_count as number,
    monthlyMessageLimit: data.monthly_message_limit as number,
    currentPeriodEnd: data.current_period_end as string | null,
    paystackCustomerId: data.paystack_customer_id as string | null,
    paystackSubscriptionId: data.paystack_subscription_id as string | null,
    isSuspended: data.is_suspended as boolean,
  };
}

/**
 * Get the current tenant for the logged-in Clerk user.
 *
 * Resolution order:
 * 1. Check if user is the tenant owner (tenants.clerk_user_id)
 * 2. Check if user is an active team member (tenant_members)
 * 3. Check for pending invitations matching user's email → auto-activate
 *
 * Redirects to /onboarding if no tenant or membership exists.
 * Redirects to /suspended if the tenant is suspended.
 */
export async function getCurrentTenant(): Promise<Tenant> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const supabase = createAdminClient();

  // 1. Check if user is the tenant owner
  const { data: ownedTenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (ownedTenant) {
    if (ownedTenant.is_suspended) redirect("/suspended");
    return mapTenantRow(ownedTenant);
  }

  // 2. Check if user is an active team member
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("id, tenant_id, role, clerk_user_id, status, tenants(*)")
    .eq("clerk_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (membership) {
    const tenant = (membership as unknown as { tenants: Record<string, unknown> | null }).tenants;
    if (!tenant) redirect("/onboarding");
    if (tenant.is_suspended) redirect("/suspended");
    return mapTenantRow(tenant);
  }

  // 3. Check for pending invitations or pre-registered BRM stores
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress;
  const phoneNumber = clerkUser.phoneNumbers[0]?.phoneNumber;
  const metaTenantId = (clerkUser.publicMetadata as { tenantId?: number })?.tenantId;

  // 4. Auto-claim store if user was created with a tenantId in publicMetadata (e.g. via magic login)
  if (metaTenantId) {
    const { data: matchedMetaTenant } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", metaTenantId)
      .maybeSingle();

    if (matchedMetaTenant) {
      if (matchedMetaTenant.clerk_user_id !== userId) {
        let isClaimable = !matchedMetaTenant.clerk_user_id;
        if (!isClaimable) {
          try {
            await client.users.getUser(matchedMetaTenant.clerk_user_id);
          } catch {
            isClaimable = true;
          }
        }
        if (isClaimable) {
          await supabase
            .from("tenants")
            .update({ clerk_user_id: userId })
            .eq("id", matchedMetaTenant.id);
        }
      }
      if (matchedMetaTenant.is_suspended) redirect("/suspended");
      return mapTenantRow({ ...matchedMetaTenant, clerk_user_id: userId });
    }
  }

  // 5. Auto-claim store if user signed in with an email matching an unclaimed or orphaned tenant
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    const { data: matchedEmailTenant } = await supabase
      .from("tenants")
      .select("*")
      .ilike("merchant_email", cleanEmail)
      .maybeSingle();

    if (matchedEmailTenant) {
      let isClaimable = !matchedEmailTenant.clerk_user_id || matchedEmailTenant.clerk_user_id === userId;
      if (!isClaimable) {
        try {
          await client.users.getUser(matchedEmailTenant.clerk_user_id);
        } catch {
          // Stale dev ID not found in active Clerk instance
          isClaimable = true;
        }
      }

      if (isClaimable) {
        await supabase
          .from("tenants")
          .update({ clerk_user_id: userId })
          .eq("id", matchedEmailTenant.id);

        try {
          await client.users.updateUser(userId, {
            publicMetadata: {
              ...clerkUser.publicMetadata,
              tenant_id: matchedEmailTenant.id,
            },
          });
        } catch {}

        if (matchedEmailTenant.is_suspended) redirect("/suspended");
        return mapTenantRow({ ...matchedEmailTenant, clerk_user_id: userId });
      }
    }
  }

  // 6. Auto-claim store if user signed in with phone matching an unclaimed or orphaned tenant
  if (phoneNumber) {
    const rawDigits = phoneNumber.replace(/\D/g, "");
    if (rawDigits.length >= 7) {
      const { data: matchedPhoneTenant } = await supabase
        .from("tenants")
        .select("*")
        .ilike("whatsapp_number", `%${rawDigits.slice(-10)}%`)
        .maybeSingle();

      if (matchedPhoneTenant) {
        let isClaimable = !matchedPhoneTenant.clerk_user_id || matchedPhoneTenant.clerk_user_id === userId;
        if (!isClaimable) {
          try {
            await client.users.getUser(matchedPhoneTenant.clerk_user_id);
          } catch {
            isClaimable = true;
          }
        }

        if (isClaimable) {
          await supabase
            .from("tenants")
            .update({ clerk_user_id: userId })
            .eq("id", matchedPhoneTenant.id);

          try {
            await client.users.updateUser(userId, {
              publicMetadata: {
                ...clerkUser.publicMetadata,
                tenant_id: matchedPhoneTenant.id,
              },
            });
          } catch {}

          if (matchedPhoneTenant.is_suspended) redirect("/suspended");
          return mapTenantRow({ ...matchedPhoneTenant, clerk_user_id: userId });
        }
      }
    }
  }

  // 7. Check for pending or orphaned invitations in tenant_members
  if (email) {
    const { data: memberInvite } = await supabase
      .from("tenant_members")
      .select("id, tenant_id, clerk_user_id, status, tenants(*)")
      .ilike("invited_email", email.trim().toLowerCase())
      .in("status", ["pending", "active"])
      .maybeSingle();

    if (memberInvite) {
      let isClaimable = !memberInvite.clerk_user_id || memberInvite.clerk_user_id === userId;
      if (!isClaimable) {
        try {
          await client.users.getUser(memberInvite.clerk_user_id);
        } catch {
          isClaimable = true;
        }
      }

      if (isClaimable) {
        await supabase
          .from("tenant_members")
          .update({
            clerk_user_id: userId,
            status: "active",
          })
          .eq("id", memberInvite.id);

        const tenant = (memberInvite as unknown as { tenants: Record<string, unknown> | null }).tenants;
        if (!tenant) redirect("/onboarding");
        if (tenant.is_suspended) redirect("/suspended");
        return mapTenantRow(tenant);
      }
    }
  }

  // 6. Check if user is a Partner or Coordinator (they manage stores, they don't own one)
  const { getCurrentPartner } = await import("@/lib/partner-server");
  const partner = await getCurrentPartner();
  if (partner) {
    redirect("/partner");
  }

  // 7. Check if user is an Admin
  const { isAdmin } = await import("@/lib/admin-auth");
  const admin = await isAdmin();
  if (admin) {
    redirect("/admin");
  }

  // No tenant or membership found — route standard merchant to onboarding
  redirect("/onboarding");
}

/**
 * Get the current tenant's ID for the logged-in Clerk user.
 */
export async function getCurrentTenantId(): Promise<number> {
  const tenant = await getCurrentTenant();
  return tenant.id;
}

/**
 * Check if the current user is the tenant owner (not a member).
 */
export async function isTenantOwner(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  return !!data;
}
