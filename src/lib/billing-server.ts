/**
 * Billing server — Supabase-dependent billing functions.
 *
 * Server-only. Never import from client components.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type { PlanTier } from "@/lib/billing";
import { getPlanLimits } from "@/lib/billing";

export type { PlanTier } from "@/lib/billing";

export interface TenantBilling {
  id: number;
  planTier: PlanTier;
  planStatus: string;
  monthlyMessageCount: number;
  monthlyMessageLimit: number;
  currentPeriodEnd: string | null;
  paystackCustomerId: string | null;
  paystackSubscriptionId: string | null;
}

/* ───────────────────────────────────────────
   Paystack API helpers
   ─────────────────────────────────────────── */

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = "https://api.paystack.co";

function paystackHeaders(): Record<string, string> {
  if (!PAYSTACK_SECRET) throw new Error("PAYSTACK_SECRET_KEY not set");
  return {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    "Content-Type": "application/json",
  };
}

export async function createPaystackCustomer(
  email: string,
  businessName: string,
  phone: string,
): Promise<{ customerCode: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/customer`, {
    method: "POST",
    headers: paystackHeaders(),
    body: JSON.stringify({ email, first_name: businessName, phone }),
  });
  const body = await res.json();
  if (!body.status) throw new Error(body.message ?? "Failed to create Paystack customer");
  return { customerCode: body.data.customer_code };
}

export async function createPaystackSubscription(
  customerCode: string,
  planCode: string,
): Promise<{ subscriptionCode: string; emailToken: string; authorizationUrl: string }> {
  const res = await fetch(`${PAYSTACK_BASE}/subscription`, {
    method: "POST",
    headers: paystackHeaders(),
    body: JSON.stringify({ customer: customerCode, plan: planCode }),
  });
  const body = await res.json();
  if (!body.status) throw new Error(body.message ?? "Failed to create subscription");
  return {
    subscriptionCode: body.data.subscription_code,
    emailToken: body.data.email_token,
    authorizationUrl: body.data.authorization_url,
  };
}

export async function fetchPaystackSubscription(subscriptionCode: string) {
  const res = await fetch(`${PAYSTACK_BASE}/subscription/${subscriptionCode}`, {
    headers: paystackHeaders(),
  });
  const body = await res.json();
  if (!body.status) return null;
  return body.data;
}

export async function enablePaystackSubscription(
  subscriptionCode: string,
  emailToken: string,
) {
  const res = await fetch(`${PAYSTACK_BASE}/subscription/enable`, {
    method: "POST",
    headers: paystackHeaders(),
    body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
  });
  const body = await res.json();
  return body.status;
}

export async function cancelPaystackSubscription(
  subscriptionCode: string,
  emailToken: string,
) {
  const res = await fetch(`${PAYSTACK_BASE}/subscription/disable`, {
    method: "POST",
    headers: paystackHeaders(),
    body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
  });
  const body = await res.json();
  return body.status;
}

export async function fetchPaystackTransactions(customerCode: string, page = 1) {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction?customer=${customerCode}&perPage=20&page=${page}`,
    { headers: paystackHeaders() },
  );
  const body = await res.json();
  if (!body.status) return { transactions: [], meta: { total: 0 } };
  return { transactions: body.data, meta: body.meta };
}

/* ───────────────────────────────────────────
   Usage guard helpers
   ─────────────────────────────────────────── */

export async function getTenantBilling(tenantId: number): Promise<TenantBilling | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select(
      "id, plan_tier, plan_status, monthly_message_count, monthly_message_limit, current_period_end, paystack_customer_id, paystack_subscription_id",
    )
    .eq("id", tenantId)
    .single();
  if (!data) return null;
  return {
    id: data.id,
    planTier: data.plan_tier,
    planStatus: data.plan_status,
    monthlyMessageCount: data.monthly_message_count,
    monthlyMessageLimit: data.monthly_message_limit,
    currentPeriodEnd: data.current_period_end,
    paystackCustomerId: data.paystack_customer_id,
    paystackSubscriptionId: data.paystack_subscription_id,
  };
}

export async function incrementMessageCount(tenantId: number): Promise<void> {
  const supabase = createAdminClient();
  try {
    // Primary: use the DB function (atomic, race-condition safe)
    await supabase.rpc("increment_message_count", { tenant_id: tenantId });
  } catch {
    // Fallback: raw SQL for atomic increment. This is safe because
    // it's a single atomic UPDATE ... SET x = x + 1 statement.
    try {
      await supabase.rpc("increment_message_count_atomic", { tenant_id: tenantId });
    } catch {
      console.error(
        "increment_message_count RPC not available — create it:\n" +
        "CREATE OR REPLACE FUNCTION increment_message_count(tenant_id BIGINT)\n" +
        "RETURNS void AS $$\n" +
        "  UPDATE tenants SET monthly_message_count = monthly_message_count + 1 WHERE id = tenant_id;\n" +
        "$$ LANGUAGE sql;"
      );
    }
  }

  // Check if tenant reached 80% or 100% quota threshold and dispatch email notification
  try {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("business_name, merchant_email, monthly_message_count, monthly_message_limit")
      .eq("id", tenantId)
      .single();

    if (tenant?.merchant_email && tenant.monthly_message_limit && tenant.monthly_message_limit > 0) {
      const count = Number(tenant.monthly_message_count);
      const limit = Number(tenant.monthly_message_limit);
      const threshold80 = Math.floor(limit * 0.8);

      if (count === threshold80 || count === limit) {
        const usagePercent = Math.round((count / limit) * 100);
        const { sendQuotaWarningEmail } = await import("@/lib/email");
        await sendQuotaWarningEmail(
          tenant.merchant_email,
          tenant.business_name || "SparkBooks Merchant",
          count,
          limit,
          usagePercent
        );
      }
    }
  } catch (quotaErr) {
    console.warn("Could not check/dispatch quota warning email:", quotaErr);
  }
}

/* ───────────────────────────────────────────
   Product catalog limit enforcement
   ─────────────────────────────────────────── */

export async function checkProductLimit(
  tenantId: number,
): Promise<{ allowed: boolean; maxProducts: number; currentCount: number }> {
  const supabase = createAdminClient();
  const [billingRes, countRes] = await Promise.all([
    supabase.from("tenants").select("plan_tier").eq("id", tenantId).single(),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
  ]);
  const tier: PlanTier = billingRes.data?.plan_tier ?? "free";
  const limits = getPlanLimits(tier);
  const currentCount = countRes.count ?? 0;
  if (limits.maxProducts === -1) return { allowed: true, maxProducts: -1, currentCount };
  return { allowed: currentCount < limits.maxProducts, maxProducts: limits.maxProducts, currentCount };
}

export async function canSendLowStockAlert(tenantId: number): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("plan_tier")
    .eq("id", tenantId)
    .single();
  if (!data) return false;
  return getPlanLimits(data.plan_tier).whatsappLowStockAlerts;
}

export async function canUseCsvBulkUpload(tenantId: number): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("plan_tier")
    .eq("id", tenantId)
    .single();
  if (!data) return false;
  return getPlanLimits(data.plan_tier).csvBulkUpload;
}
