"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { formatNaira } from "@/lib/format";
import type { PlanTier } from "@/lib/billing";
import { getPlanLimits } from "@/lib/billing";
import type { BillingState } from "@/app/dashboard/billing/actions";
import {
  startSubscription,
  cancelSubscription,
} from "@/app/dashboard/billing/actions";

interface Transaction {
  id: number;
  amount: number;
  status: string;
  reference: string;
  channel: string;
  createdAt: string;
  plan: string | null;
}

interface BillingClientProps {
  tenantId: number;
  initialBilling: BillingState;
  initialTransactions: Transaction[];
}

const TIERS: { tier: PlanTier; highlight?: boolean }[] = [
  { tier: "free" },
  { tier: "starter", highlight: true },
  { tier: "pro" },
];

export function BillingClient({
  tenantId,
  initialBilling,
  initialTransactions,
}: BillingClientProps) {
  const [billing, setBilling] = useState(initialBilling);
  const [transactions] = useState(initialTransactions);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const currentTier = billing.planTier;

  function handleUpgrade(tier: PlanTier) {
    if (tier === currentTier) return;
    setMessage(null);

    startTransition(async () => {
      const result = await startSubscription(tenantId, tier);
      if ("error" in result) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({
          type: "success",
          text: `Redirecting to Paystack to complete your ${getPlanLimits(tier).label} subscription…`,
        });
        // Redirect to Paystack payment page
        window.location.href = result.authorizationUrl;
      }
    });
  }

  function handleCancel() {
    if (!confirm("Cancel your subscription and downgrade to Free? This will take effect at the end of your billing period."))
      return;
    setMessage(null);

    startTransition(async () => {
      const result = await cancelSubscription(tenantId);
      if (result.success) {
        setMessage({
          type: "success",
          text: "Subscription cancelled. You are now on the Free plan.",
        });
        setBilling((prev) => ({
          ...prev,
          planTier: "free",
          planStatus: "cancelled",
          planLabel: "Free",
          messageLimitDisplay: "30",
          monthlyMessageLimit: 30,
          amountNaira: 0,
          isUnlimited: false,
          usagePercent: Math.min(
            100,
            Math.round((prev.monthlyMessageCount / 30) * 100),
          ),
        }));
      } else {
        setMessage({ type: "error", text: result.error ?? "Cancellation failed" });
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Status message */}
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-money-light text-money border border-money/20"
              : "bg-flag-light text-flag border border-flag/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Current plan card */}
      <div className="bg-white rounded-xl border border-rule p-5">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs text-ink-muted uppercase tracking-wider">
              Current plan
            </span>
            <div className="flex items-center gap-2 mt-1">
              <h2 className="font-display text-2xl text-ink">
                {billing.planLabel}
              </h2>
              {billing.planStatus === "past_due" && (
                <span className="text-xs bg-flag-light text-flag px-2 py-0.5 rounded-full font-medium">
                  Past due
                </span>
              )}
              {billing.planStatus === "trialing" && (
                <span className="text-xs bg-spark/10 text-spark px-2 py-0.5 rounded-full font-medium">
                  Trial
                </span>
              )}
            </div>
            {billing.amountNaira > 0 && (
              <p className="text-sm text-ink-muted mt-1">
                {formatNaira(billing.amountNaira)}/month
              </p>
            )}
          </div>

          {billing.currentPeriodEnd && (
            <div className="text-right">
              <span className="text-xs text-ink-muted">Next renewal</span>
              <p className="text-sm text-ink font-medium">
                {format(new Date(billing.currentPeriodEnd), "MMM d, yyyy")}
              </p>
            </div>
          )}
        </div>

        {/* Usage bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span>Messages this month</span>
            <span>
              {billing.monthlyMessageCount} / {billing.messageLimitDisplay}
            </span>
          </div>
          <div className="h-2 bg-rule rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                billing.usagePercent >= 90
                  ? "bg-flag"
                  : billing.usagePercent >= 70
                    ? "bg-flag/60"
                    : "bg-spark"
              }`}
              style={{ width: `${billing.usagePercent}%` }}
            />
          </div>
          {billing.usagePercent >= 90 && (
            <p className="text-xs text-flag mt-1.5">
              You are close to your monthly limit. Consider upgrading.
            </p>
          )}
        </div>
      </div>

      {/* Plan comparison */}
      <div className="bg-white rounded-xl border border-rule p-5">
        <h3 className="font-display text-lg text-ink mb-4">Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map(({ tier, highlight }) => {
            const limits = getPlanLimits(tier);
            const isCurrent = currentTier === tier;

            return (
              <div
                key={tier}
                className={`rounded-xl border-2 p-4 flex flex-col ${
                  highlight
                    ? "border-spark bg-spark/[0.03]"
                    : isCurrent
                      ? "border-ink"
                      : "border-rule"
                }`}
              >
                <h4 className="font-display text-base text-ink">
                  {limits.label}
                </h4>
                <p className="text-2xl font-bold text-ink mt-1">
                  {tier === "free"
                    ? "Free"
                    : formatNaira(limits.amountNaira)}
                  {tier !== "free" && (
                    <span className="text-sm font-normal text-ink-muted">
                      /mo
                    </span>
                  )}
                </p>

                <ul className="mt-3 space-y-1.5 text-sm flex-1">
                  <li className="flex items-center gap-2">
                    <Check />
                    {limits.monthlyMessageLimit === -1
                      ? "Unlimited WhatsApp entries"
                      : `${limits.monthlyMessageLimit} WhatsApp entries/month`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check />
                    {limits.maxProducts === -1
                      ? "Unlimited products"
                      : `Up to ${limits.maxProducts} products`}
                  </li>
                  <li className="flex items-center gap-2">
                    {limits.csvBulkUpload ? <Check /> : <Cross />}
                    CSV bulk upload
                  </li>
                  <li className="flex items-center gap-2">
                    {limits.whatsappLowStockAlerts ? (
                      <Check />
                    ) : (
                      <Cross />
                    )}
                    WhatsApp low-stock alerts
                  </li>
                  <li className="flex items-center gap-2">
                    {tier === "pro" ? <Check /> : <Cross />}
                    Multi-user team access
                  </li>
                </ul>

                {isCurrent ? (
                  <span className="mt-4 block text-center text-sm text-ink-muted font-medium py-2 rounded-lg bg-rule/30">
                    Current plan
                  </span>
                ) : tier === "free" && currentTier !== "free" ? (
                  <button
                    onClick={handleCancel}
                    disabled={isPending}
                    className="mt-4 w-full text-sm text-ink-muted font-medium py-2 rounded-lg border border-rule hover:border-flag hover:text-flag transition-colors disabled:opacity-50"
                  >
                    {isPending ? "Processing…" : "Downgrade to Free"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgrade(tier)}
                    disabled={isPending}
                    className={`mt-4 w-full text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-50 ${
                      highlight
                        ? "bg-ink text-white hover:opacity-90"
                        : "bg-ink text-white hover:opacity-90"
                    }`}
                  >
                    {isPending
                      ? "Processing…"
                      : currentTier === "free"
                        ? `Upgrade to ${limits.label}`
                        : `Switch to ${limits.label}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment history */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-xl border border-rule p-5">
          <h3 className="font-display text-lg text-ink mb-3">
            Payment history
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted uppercase tracking-wider border-b border-rule">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Channel</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-rule/50 last:border-0"
                  >
                    <td className="py-2 text-ink-muted">
                      {format(new Date(tx.createdAt), "MMM d, yyyy")}
                    </td>
                    <td className="py-2 font-medium text-ink">
                      {formatNaira(tx.amount)}
                    </td>
                    <td className="py-2 text-ink-muted">
                      {tx.plan ?? "—"}
                    </td>
                    <td className="py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          tx.status === "success"
                            ? "bg-money-light text-money"
                            : tx.status === "failed"
                              ? "bg-flag-light text-flag"
                              : "bg-rule text-ink-muted"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-2 text-ink-muted capitalize">
                      {tx.channel ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty payment history */}
      {transactions.length === 0 && billing.planTier !== "free" && (
        <div className="bg-white rounded-xl border border-rule p-5 text-center">
          <p className="text-sm text-ink-muted">No payment history yet</p>
        </div>
      )}
    </div>
  );
}

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0 text-spark"
    >
      <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.15" />
      <path
        d="M4.5 7l2 2 3-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0 text-ink-muted/40"
    >
      <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.1" />
      <path
        d="M5 5l4 4M9 5l-4 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
