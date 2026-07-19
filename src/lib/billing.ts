/**
 * Billing — plan tier types, limits, and pure utility functions.
 *
 * Safe for both client and server imports. No Supabase, no env secrets.
 */

/* ───────────────────────────────────────────
   Plan tier types
   ─────────────────────────────────────────── */

export type PlanTier = "free" | "starter" | "pro";
export type PlanStatus = "trialing" | "active" | "past_due" | "cancelled";

export interface PlanLimits {
  tier: PlanTier;
  label: string;
  monthlyMessageLimit: number; // -1 = unlimited
  maxProducts: number; // -1 = unlimited
  csvBulkUpload: boolean;
  whatsappLowStockAlerts: boolean;
  amountNaira: number;
  paystackPlanCode: string | null; // null for free
}

/* ───────────────────────────────────────────
   Plan definitions
   ─────────────────────────────────────────── */

const PLANS: Record<PlanTier, PlanLimits> = {
  free: {
    tier: "free",
    label: "Free",
    monthlyMessageLimit:
      Number(process.env.FREE_MESSAGE_LIMIT) || 30,
    maxProducts: Number(process.env.FREE_MAX_PRODUCTS) || 15,
    csvBulkUpload: false,
    whatsappLowStockAlerts: false,
    amountNaira: 0,
    paystackPlanCode: null,
  },
  starter: {
    tier: "starter",
    label: "Starter",
    monthlyMessageLimit:
      Number(process.env.STARTER_MESSAGE_LIMIT) || 200,
    maxProducts: -1,
    csvBulkUpload: true,
    whatsappLowStockAlerts: true,
    amountNaira: 3500,
    paystackPlanCode: process.env.PAYSTACK_STARTER_PLAN_CODE ?? null,
  },
  pro: {
    tier: "pro",
    label: "Pro",
    monthlyMessageLimit: -1,
    maxProducts: -1,
    csvBulkUpload: true,
    whatsappLowStockAlerts: true,
    amountNaira: 5000,
    paystackPlanCode: process.env.PAYSTACK_PRO_PLAN_CODE ?? null,
  },
};

/* ───────────────────────────────────────────
   Pure utility functions (safe anywhere)
   ─────────────────────────────────────────── */

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLANS[tier] ?? PLANS.free;
}

export function formatPlanLabel(tier: PlanTier): string {
  return PLANS[tier]?.label ?? "Free";
}

/**
 * Check if tenant can process another WhatsApp message (voice or text).
 * Returns true if limit not exceeded. -1 = unlimited.
 */
export function canProcessMessage(limits: PlanLimits, currentCount: number): boolean {
  const limit = limits.monthlyMessageLimit;
  if (limit === -1) return true;
  return currentCount < limit;
}

/**
 * Return the label for a message-limit-exceeded notice.
 */
export function planLimitExceededMessage(tier: PlanTier): string {
  const limits = getPlanLimits(tier);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sparkbooks.io";
  if (limits.tier === "free") {
    return (
      `You've reached your free limit of ${limits.monthlyMessageLimit} entries this month. ` +
      `Upgrade to Starter (₦3,500/month) for 200 entries or Pro (₦5,000/month) for unlimited. ` +
      `Visit: ${appUrl}/dashboard/billing`
    );
  }
  return (
    `You've reached your ${limits.label} limit of ${limits.monthlyMessageLimit} entries this month. ` +
    `Upgrade to Pro for unlimited entries. ` +
    `Visit: ${appUrl}/dashboard/billing`
  );
}
