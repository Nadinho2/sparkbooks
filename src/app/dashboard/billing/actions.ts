"use server";

import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { PlanTier } from "@/lib/billing";
import { getPlanLimits } from "@/lib/billing";
import { getCurrentTenantId } from "@/lib/tenant-server";
import {
  createPaystackCustomer,
  createPaystackSubscription,
  enablePaystackSubscription,
  cancelPaystackSubscription,
  fetchPaystackSubscription,
  fetchPaystackTransactions,
  getTenantBilling,
} from "@/lib/billing-server";

export interface BillingState {
  planTier: PlanTier;
  planStatus: string;
  planLabel: string;
  monthlyMessageCount: number;
  monthlyMessageLimit: number;
  messageLimitDisplay: string;
  currentPeriodEnd: string | null;
  paystackCustomerId: string | null;
  paystackSubscriptionId: string | null;
  amountNaira: number;
  // For the progress bar
  usagePercent: number;
  isUnlimited: boolean;
}

/**
 * Fetch current billing state for the tenant (server-side).
 */
export async function getBillingState(clientTenantId?: number): Promise<BillingState> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  if (clientTenantId && clientTenantId !== tenantId) {
    throw new Error("Unauthorized tenant access");
  }

  const billing = await getTenantBilling(tenantId);
  if (!billing) throw new Error("Tenant not found");

  const limits = getPlanLimits(billing.planTier);
  const isUnlimited = limits.monthlyMessageLimit === -1;

  return {
    planTier: billing.planTier,
    planStatus: billing.planStatus,
    planLabel: limits.label,
    monthlyMessageCount: billing.monthlyMessageCount,
    monthlyMessageLimit: limits.monthlyMessageLimit,
    messageLimitDisplay: isUnlimited
      ? "Unlimited"
      : String(limits.monthlyMessageLimit),
    currentPeriodEnd: billing.currentPeriodEnd,
    paystackCustomerId: billing.paystackCustomerId,
    paystackSubscriptionId: billing.paystackSubscriptionId,
    amountNaira: limits.amountNaira,
    usagePercent: isUnlimited
      ? 0
      : Math.min(
          100,
          Math.round(
            (billing.monthlyMessageCount / limits.monthlyMessageLimit) * 100,
          ),
        ),
    isUnlimited,
  };
}

/**
 * Start a new subscription (or upgrade from free).
 * Creates a Paystack customer if one doesn't exist, then creates a subscription.
 */
export async function startSubscription(
  _clientTenantId: number,
  tier: PlanTier,
): Promise<{ authorizationUrl: string } | { error: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();

  const limits = getPlanLimits(tier);
  if (!limits.paystackPlanCode) {
    return { error: "This plan is not available for subscription." };
  }

  const supabase = createAdminClient();

  // Get tenant + user email
  const { data: tenant } = await supabase
    .from("tenants")
    .select("business_name, whatsapp_number, paystack_customer_id")
    .eq("id", tenantId)
    .single();

  if (!tenant) return { error: "Tenant not found" };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) return { error: "No email address found on your account." };

  let customerCode = tenant.paystack_customer_id;

  // Create Paystack customer if not exists
  if (!customerCode) {
    try {
      const customer = await createPaystackCustomer(
        email,
        tenant.business_name,
        tenant.whatsapp_number,
      );
      customerCode = customer.customerCode;

      await supabase
        .from("tenants")
        .update({ paystack_customer_id: customerCode })
        .eq("id", tenantId);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  // Create subscription
  try {
    const sub = await createPaystackSubscription(
      customerCode,
      limits.paystackPlanCode,
    );

    // Enable the subscription so it starts charging
    if (sub.emailToken) {
      try {
        await enablePaystackSubscription(sub.subscriptionCode, sub.emailToken);
      } catch {
        // Enabling may not be required depending on plan config; non-critical
      }
    }

    await supabase
      .from("tenants")
      .update({
        paystack_subscription_id: sub.subscriptionCode,
        plan_tier: tier,
        plan_status: "active",
        monthly_message_limit: limits.monthlyMessageLimit,
      })
      .eq("id", tenantId);

    revalidatePath("/dashboard/billing");

    return {
      authorizationUrl: sub.authorizationUrl,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * Cancel subscription — mark as cancelled but keep access until period_end.
 */
export async function cancelSubscription(
  clientTenantId?: number,
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  if (clientTenantId && clientTenantId !== tenantId) {
    throw new Error("Unauthorized tenant access");
  }

  const supabase = createAdminClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("paystack_subscription_id, current_period_end")
    .eq("id", tenantId)
    .single();

  if (!tenant?.paystack_subscription_id) {
    return { success: false, error: "No active subscription" };
  }

  // Cancel at Paystack
  try {
    const sub = await fetchPaystackSubscription(tenant.paystack_subscription_id);
    const emailToken = (sub as Record<string, unknown>)?.email_token as string;
    if (emailToken) {
      await cancelPaystackSubscription(tenant.paystack_subscription_id, emailToken);
    }
  } catch (err) {
    console.error("Paystack cancel error:", err);
  }

  // Mark as cancelled but keep paid access until current_period_end
  // The reset-usage cron will downgrade to free once period_end passes
  await supabase
    .from("tenants")
    .update({
      plan_status: "cancelled",
      // Don't change plan_tier or monthly_message_limit yet —
      // tenant keeps paid access until period_end
    })
    .eq("id", tenantId);

  revalidatePath("/dashboard/billing");
  return { success: true };
}

/**
 * Fetch payment history from Paystack.
 */
export async function getPaymentHistory(clientTenantId?: number) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  if (clientTenantId && clientTenantId !== tenantId) {
    throw new Error("Unauthorized tenant access");
  }

  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("paystack_customer_id")
    .eq("id", tenantId)
    .single();

  if (!tenant?.paystack_customer_id) {
    return { transactions: [] };
  }

  const result = await fetchPaystackTransactions(tenant.paystack_customer_id);
  return {
    transactions: result.transactions.map((t: Record<string, unknown>) => ({
      id: t.id,
      amount: Number(t.amount) / 100, // Paystack returns kobo
      status: t.status,
      reference: t.reference,
      channel: t.channel,
      createdAt: t.created_at,
      plan: (t.plan as Record<string, unknown>)?.name ?? null,
    })),
  };
}
