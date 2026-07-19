"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getPlanLimits } from "@/lib/billing";
import type { PlanTier } from "@/lib/billing";

/* ───────────────────────────────────────────
   Types
   ─────────────────────────────────────────── */

export interface AdminTenantRow {
  id: number;
  businessName: string;
  businessType: string;
  whatsappNumber: string;
  createdAt: string;
  planTier: PlanTier;
  planStatus: string;
  monthlyMessageCount: number;
  monthlyMessageLimit: number;
  isSuspended: boolean;
  isComped: boolean;
  paystackSubscriptionId: string | null;
  productCount: number;
}

export interface TenantDetail {
  id: number;
  businessName: string;
  businessType: string;
  whatsappNumber: string;
  createdAt: string;
  planTier: PlanTier;
  planStatus: string;
  monthlyMessageCount: number;
  monthlyMessageLimit: number;
  currentPeriodEnd: string | null;
  isSuspended: boolean;
  isComped: boolean;
  paystackCustomerId: string | null;
  paystackSubscriptionId: string | null;
  products: { id: number; name: string; quantity: number; unit: string }[];
  messages: {
    id: number;
    direction: string;
    type: string;
    rawText: string | null;
    status: string;
    createdAt: string;
  }[];
  ledgerEntries: {
    id: number;
    type: string;
    amount: number;
    description: string;
    createdAt: string;
  }[];
}

export interface UsageRow {
  tenantId: number;
  businessName: string;
  planTier: PlanTier;
  monthlyMessageCount: number;
  monthlyMessageLimit: number;
  messageUsagePercent: number;
  voiceCount: number;
  textCount: number;
  estimatedCost: number; // estimated Whisper + DeepSeek cost
}

export interface ParsingIssueRow {
  messageId: number;
  tenantBusinessName: string;
  tenantId: number;
  rawText: string | null;
  transcript: string | null;
  status: string;
  failureReason: string | null;
  createdAt: string;
  type: string;
}

export interface AdminBillingRow {
  tenantId: number;
  businessName: string;
  planTier: PlanTier;
  planStatus: string;
  isComped: boolean;
  isSuspended: boolean;
  paystackSubscriptionId: string | null;
  paystackCustomerId: string | null;
  currentPeriodEnd: string | null;
  monthlyMessageCount: number;
}

export interface CostSummary {
  totalRevenueNaira: number;
  totalEstimatedCostNaira: number;
  breakevenPercent: number;
  dailyMessageCount: number;
  monthlyMessageCount: number;
  activeTenants: number;
  freeTenants: number;
  paidTenants: number;
  compedTenants: number;
}

/* ───────────────────────────────────────────
   Audit log helper
   ─────────────────────────────────────────── */

async function logAdminAccess(
  adminUserId: string,
  tenantId: number,
  action = "view",
) {
  const supabase = createAdminClient();
  await supabase.from("admin_audit_log").insert({
    admin_user_id: adminUserId,
    tenant_id: tenantId,
    action,
  });
}

/* ───────────────────────────────────────────
   Tenant management
   ─────────────────────────────────────────── */

export async function fetchAllTenants(): Promise<AdminTenantRow[]> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("tenants")
    .select(
      "id, business_name, business_type, whatsapp_number, created_at, plan_tier, plan_status, monthly_message_count, monthly_message_limit, is_suspended, is_comped, paystack_subscription_id",
    )
    .order("created_at", { ascending: false });

  if (!data) return [];

  // Get product counts per tenant
  const { data: productCounts } = await supabase.rpc("get_tenant_product_counts");
  const countMap: Record<number, number> = {};
  if (Array.isArray(productCounts)) {
    for (const row of productCounts as { tenant_id: number; count: number }[]) {
      countMap[row.tenant_id] = Number(row.count);
    }
  }

  return data.map((t) => ({
    id: t.id,
    businessName: t.business_name,
    businessType: t.business_type,
    whatsappNumber: t.whatsapp_number,
    createdAt: t.created_at,
    planTier: t.plan_tier,
    planStatus: t.plan_status,
    monthlyMessageCount: Number(t.monthly_message_count),
    monthlyMessageLimit: Number(t.monthly_message_limit),
    isSuspended: t.is_suspended,
    isComped: t.is_comped,
    paystackSubscriptionId: t.paystack_subscription_id,
    productCount: countMap[t.id] ?? 0,
  }));
}

export async function fetchTenantDetail(
  tenantId: number,
): Promise<TenantDetail | null> {
  const adminId = await requireAdmin();
  const supabase = createAdminClient();

  const { data: t } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .single();
  if (!t) return null;

  // Log access
  await logAdminAccess(adminId, tenantId, "view");

  // Fetch products, messages, ledger in parallel
  const [productsRes, messagesRes, ledgerRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, quantity, unit")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("whatsapp_messages")
      .select("id, direction, type, raw_text, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("ledger_entries")
      .select("id, type, amount, item_description, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    id: t.id,
    businessName: t.business_name,
    businessType: t.business_type,
    whatsappNumber: t.whatsapp_number,
    createdAt: t.created_at,
    planTier: t.plan_tier,
    planStatus: t.plan_status,
    monthlyMessageCount: Number(t.monthly_message_count),
    monthlyMessageLimit: Number(t.monthly_message_limit),
    currentPeriodEnd: t.current_period_end,
    isSuspended: t.is_suspended,
    isComped: t.is_comped,
    paystackCustomerId: t.paystack_customer_id,
    paystackSubscriptionId: t.paystack_subscription_id,
    products: (productsRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      quantity: Number(p.quantity),
      unit: p.unit,
    })),
    messages: (messagesRes.data ?? []).map((m) => ({
      id: m.id,
      direction: m.direction,
      type: m.type,
      rawText: m.raw_text,
      status: m.status,
      createdAt: m.created_at,
    })),
    ledgerEntries: (ledgerRes.data ?? []).map((l) => ({
      id: l.id,
      type: l.type,
      amount: Number(l.amount),
      description: l.item_description,
      createdAt: l.created_at,
    })),
  };
}

export async function suspendTenant(
  tenantId: number,
  suspend: boolean,
): Promise<void> {
  const adminId = await requireAdmin();
  const supabase = createAdminClient();

  await logAdminAccess(adminId, tenantId, suspend ? "suspend" : "reactivate");

  await supabase
    .from("tenants")
    .update({ is_suspended: suspend })
    .eq("id", tenantId);

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function adminSetPlanTier(
  tenantId: number,
  tier: PlanTier,
): Promise<void> {
  const adminId = await requireAdmin();
  const supabase = createAdminClient();

  await logAdminAccess(adminId, tenantId, `set_plan_${tier}`);

  const limits = getPlanLimits(tier);
  await supabase
    .from("tenants")
    .update({
      plan_tier: tier,
      monthly_message_limit: limits.monthlyMessageLimit,
    })
    .eq("id", tenantId);

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function adminExtendPeriod(
  tenantId: number,
  newPeriodEnd: string,
): Promise<void> {
  const adminId = await requireAdmin();
  const supabase = createAdminClient();

  await logAdminAccess(adminId, tenantId, "extend_period");

  await supabase
    .from("tenants")
    .update({ current_period_end: newPeriodEnd })
    .eq("id", tenantId);

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function adminSetComp(
  tenantId: number,
  isComped: boolean,
  tier?: PlanTier,
): Promise<void> {
  const adminId = await requireAdmin();
  const supabase = createAdminClient();

  await logAdminAccess(adminId, tenantId, isComped ? "comp_enable" : "comp_disable");

  const update: Record<string, unknown> = { is_comped: isComped };
  if (isComped && tier) {
    const limits = getPlanLimits(tier);
    update.plan_tier = tier;
    update.monthly_message_limit = limits.monthlyMessageLimit;
    update.plan_status = "active";
  }
  if (!isComped) {
    update.plan_tier = "free";
    update.monthly_message_limit = getPlanLimits("free").monthlyMessageLimit;
    update.plan_status = "cancelled";
    update.paystack_subscription_id = null;
  }

  await supabase.from("tenants").update(update).eq("id", tenantId);
  revalidatePath("/admin/billing");
}

/* ───────────────────────────────────────────
   Usage & cost monitoring
   ─────────────────────────────────────────── */

export async function fetchUsageSummary(): Promise<CostSummary> {
  await requireAdmin();
  const supabase = createAdminClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // All tenants count
  const { count: totalTenants } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true });

  const { count: freeTenants } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("plan_tier", "free");

  const { count: paidTenants } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .neq("plan_tier", "free");

  const { count: compedTenants } = await supabase
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("is_comped", true);

  // Monthly messages
  const { data: monthlyMsgs } = await supabase
    .from("whatsapp_messages")
    .select("id, type", { count: "exact" })
    .gte("created_at", monthStart);

  const monthlyCount = monthlyMsgs?.length ?? 0;

  // Daily messages (today)
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const { count: dailyCount } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .gte("created_at", dayStart);

  // Cost estimates
  // Whisper: ~$0.006/min, DeepSeek: ~$0.0005/1K tokens (~1K per message)
  const WHISPER_COST_PER_CALL = 0.006; // USD
  const DEEPSEEK_COST_PER_CALL = 0.0005; // USD
  const USD_TO_NGN = 1500;

  const { count: voiceCount } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("type", "voice")
    .gte("created_at", monthStart);

  const { count: textCount } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monthStart)
    .in("status", ["matched", "pending_confirmation"]);

  const estimatedCost = ((voiceCount ?? 0) * WHISPER_COST_PER_CALL +
    (textCount ?? 0) * DEEPSEEK_COST_PER_CALL) * USD_TO_NGN;

  // Revenue: exclusive of comped tenants
  // starter=₦3500, pro=₦5000 per active tenant
  const { data: payingTenants } = await supabase
    .from("tenants")
    .select("plan_tier")
    .eq("is_comped", false)
    .neq("plan_tier", "free")
    .eq("plan_status", "active");

  let revenue = 0;
  if (payingTenants) {
    for (const pt of payingTenants) {
      revenue += pt.plan_tier === "pro" ? 5000 : 3500;
    }
  }

  return {
    totalRevenueNaira: revenue,
    totalEstimatedCostNaira: Math.round(estimatedCost),
    breakevenPercent: revenue > 0 ? Math.round((revenue / Math.max(estimatedCost, 1)) * 100) : 0,
    dailyMessageCount: dailyCount ?? 0,
    monthlyMessageCount: monthlyCount,
    activeTenants: totalTenants ?? 0,
    freeTenants: freeTenants ?? 0,
    paidTenants: paidTenants ?? 0,
    compedTenants: compedTenants ?? 0,
  };
}

export async function fetchUsageRows(): Promise<UsageRow[]> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, business_name, plan_tier, monthly_message_count, monthly_message_limit")
    .order("monthly_message_count", { ascending: false });

  if (!tenants) return [];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // For each tenant, get voice and text counts this month
  const rows: UsageRow[] = await Promise.all(
    tenants.map(async (t) => {
      const [voiceRes, textRes] = await Promise.all([
        supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", t.id)
          .eq("type", "voice")
          .gte("created_at", monthStart),
        supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", t.id)
          .gte("created_at", monthStart)
          .in("status", ["matched", "pending_confirmation"]),
      ]);

      const vc = voiceRes.count ?? 0;
      const tc = textRes.count ?? 0;
      const limit = Number(t.monthly_message_limit);
      const count = Number(t.monthly_message_count);

      return {
        tenantId: t.id,
        businessName: t.business_name,
        planTier: t.plan_tier,
        monthlyMessageCount: count,
        monthlyMessageLimit: limit,
        messageUsagePercent: limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0,
        voiceCount: vc,
        textCount: tc,
        estimatedCost: Math.round((vc * 0.006 + tc * 0.0005) * 1500),
      };
    }),
  );

  return rows;
}

/* ───────────────────────────────────────────
   Parsing quality
   ─────────────────────────────────────────── */

export async function fetchParsingIssues(): Promise<ParsingIssueRow[]> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("whatsapp_messages")
    .select(
      "id, tenant_id, raw_text, transcript, status, failure_reason, created_at, type, tenants(business_name)",
    )
    .in("status", ["unmatched", "failed"])
    .order("created_at", { ascending: false })
    .limit(200);

  return (data ?? []).map((m) => ({
    messageId: m.id,
    tenantBusinessName:
      (m.tenants as unknown as { business_name: string }[])?.[0]?.business_name ?? "Unknown",
    tenantId: m.tenant_id,
    rawText: m.raw_text,
    transcript: m.transcript,
    status: m.status,
    failureReason: m.failure_reason,
    createdAt: m.created_at,
    type: m.type,
  }));
}

export async function adminReRunParse(
  messageId: number,
  tenantId: number,
): Promise<{ success: boolean; error?: string }> {
  const adminId = await requireAdmin();
  const supabase = createAdminClient();

  await logAdminAccess(adminId, tenantId, "rerun_parse");

  // Fetch the message
  const { data: msg } = await supabase
    .from("whatsapp_messages")
    .select("raw_text, transcript, type")
    .eq("id", messageId)
    .single();

  if (!msg) return { success: false, error: "Message not found" };

  const text = msg.transcript || msg.raw_text;
  if (!text) return { success: false, error: "No text to parse" };

  // Fetch catalog
  const { data: catalog } = await supabase
    .from("products")
    .select("id, name, unit, unit_cost, categories(name)")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  const catalogItems = (catalog ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: (p.categories as unknown as { name: string }[])?.[0]?.name ?? null,
    unit: p.unit,
    unit_cost: p.unit_cost,
  }));

  // Re-run parse
  const { parseMessage } = await import("@/lib/deepseek");
  const { updateProductStock } = await import("@/lib/stock");
  const { incrementMessageCount } = await import("@/lib/billing-server");
  const { sendTextMessage } = await import("@/lib/whatsapp");

  try {
    const parsed = await parseMessage(text, catalogItems);

    if (parsed.confidence >= 0.75 && parsed.matched_product_id) {
      // Re-process the match
      if (
        parsed.entry_type === "sale" ||
        parsed.entry_type === "expense"
      ) {
        const { data: ledger } = await supabase
          .from("ledger_entries")
          .insert({
            tenant_id: tenantId,
            type: parsed.entry_type,
            amount: parsed.amount ?? 0,
            item_description:
              parsed.matched_product_name ?? "Unknown item",
            product_id: parsed.matched_product_id,
            source: "whatsapp_text",
            linked_message_id: messageId,
            confidence_score: parsed.confidence,
          })
          .select("id")
          .single();

        if (ledger) {
          await supabase
            .from("whatsapp_messages")
            .update({
              status: "matched",
              linked_entry_id: ledger.id,
              failure_reason: null,
            })
            .eq("id", messageId);
        }
      }

      if (
        parsed.entry_type === "stock_in" ||
        parsed.entry_type === "sale"
      ) {
        const changeQty =
          parsed.entry_type === "sale"
            ? -(parsed.quantity ?? 0)
            : parsed.quantity ?? 0;

        await updateProductStock({
          supabase,
          tenantId,
          productId: parsed.matched_product_id,
          changeQty,
          type: parsed.entry_type === "sale" ? "out" : "in",
          source: "whatsapp_text",
          linkedMessageId: messageId,
        });
      }

      // Increment usage since we re-ran through DeepSeek
      await incrementMessageCount(tenantId);

      // Try to send confirmation
      const { data: phoneData } = await supabase
        .from("tenants")
        .select("whatsapp_number")
        .eq("id", tenantId)
        .single();

      if (phoneData) {
        try {
          await sendTextMessage(
            phoneData.whatsapp_number,
            `Manual re-parse: Entry logged for ${parsed.matched_product_name ?? "item"}`,
          );
        } catch { /* ignore send failure */ }
      }

      revalidatePath("/admin/parsing");
      return { success: true };
    }

    // Low confidence — just mark as unmatched for manual review
    await supabase
      .from("whatsapp_messages")
      .update({
        status: "unmatched",
        failure_reason: "admin_rerun_low_confidence",
      })
      .eq("id", messageId);

    return {
      success: false,
      error: `Low confidence (${parsed.confidence}). Entry type: ${parsed.entry_type}`,
    };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
    };
  }
}

/* ───────────────────────────────────────────
   Billing view
   ─────────────────────────────────────────── */

export async function fetchAdminBilling(): Promise<AdminBillingRow[]> {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("tenants")
    .select(
      "id, business_name, plan_tier, plan_status, is_comped, is_suspended, paystack_subscription_id, paystack_customer_id, current_period_end, monthly_message_count",
    )
    .order("business_name");

  return (data ?? []).map((t) => ({
    tenantId: t.id,
    businessName: t.business_name,
    planTier: t.plan_tier,
    planStatus: t.plan_status,
    isComped: t.is_comped,
    isSuspended: t.is_suspended,
    paystackSubscriptionId: t.paystack_subscription_id,
    paystackCustomerId: t.paystack_customer_id,
    currentPeriodEnd: t.current_period_end,
    monthlyMessageCount: Number(t.monthly_message_count),
  }));
}
