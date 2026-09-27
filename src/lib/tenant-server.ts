import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { PlanTier, PlanStatus } from "@/lib/billing";

interface Tenant {
  id: number;
  businessName: string;
  businessType: string;
  whatsappNumber: string;
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
    .single();

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

  // 3. Check for pending invitations matching user's email → auto-activate
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const email = clerkUser.emailAddresses[0]?.emailAddress;

  if (email) {
    const { data: pendingInvite } = await supabase
      .from("tenant_members")
      .select("id, tenant_id, tenants(*)")
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

      const tenant = (pendingInvite as unknown as { tenants: Record<string, unknown> | null }).tenants;
      if (!tenant) redirect("/onboarding");
      if (tenant.is_suspended) redirect("/suspended");
      return mapTenantRow(tenant);
    }
  }

  // No tenant or membership found
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
