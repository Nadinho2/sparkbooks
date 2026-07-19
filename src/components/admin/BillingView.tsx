"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { formatNaira } from "@/lib/format";
import { getPlanLimits } from "@/lib/billing";
import type { PlanTier } from "@/lib/billing";
import type { AdminBillingRow } from "@/app/admin/actions";
import { adminSetComp } from "@/app/admin/actions";

interface Props {
  rows: AdminBillingRow[];
}

const COMP_TIERS: PlanTier[] = ["free", "starter", "pro"];

export function AdminBillingView({ rows }: Props) {
  const [isPending, startTransition] = useTransition();
  const [compState, setCompState] = useState<
    Record<number, { tier: PlanTier }>
  >({});
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function handleComp(tenantId: number, enable: boolean, tier?: PlanTier) {
    startTransition(async () => {
      try {
        await adminSetComp(tenantId, enable, tier);
        setMessage({
          type: "success",
          text: enable ? "Comp enabled" : "Comp removed",
        });
      } catch (err) {
        setMessage({ type: "error", text: (err as Error).message });
      }
    });
  }

  const paying = rows.filter(
    (r) => !r.isComped && !r.isSuspended && r.planTier !== "free",
  );
  const totalRevenue = paying.reduce((sum, r) => {
    const limits = getPlanLimits(r.planTier);
    return sum + limits.amountNaira;
  }, 0);

  return (
    <div className="space-y-5">
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

      {/* Revenue summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Monthly revenue",
            value: formatNaira(totalRevenue),
            sub: `${paying.length} paying tenants`,
          },
          {
            label: "Active subscriptions",
            value: String(
              rows.filter(
                (r) =>
                  !r.isComped &&
                  r.planStatus === "active" &&
                  r.paystackSubscriptionId,
              ).length,
            ),
            sub: "via Paystack",
          },
          {
            label: "Past due",
            value: String(
              rows.filter((r) => r.planStatus === "past_due").length,
            ),
            sub: "payment failed",
          },
          {
            label: "Comped",
            value: String(rows.filter((r) => r.isComped).length),
            sub: "excluded from revenue",
          },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-white border border-rule rounded-xl px-4 py-3"
          >
            <span className="text-[10px] text-ink-muted uppercase tracking-wider">
              {c.label}
            </span>
            <div className="text-lg font-display text-ink mt-0.5">
              {c.value}
            </div>
            <div className="text-[10px] text-ink-muted mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tenant billing table */}
      <div className="bg-white rounded-xl border border-rule overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-ink-muted uppercase tracking-wider border-b border-rule">
                <th className="px-4 py-2.5 font-medium">Business</th>
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Renews</th>
                <th className="px-4 py-2.5 font-medium text-right">
                  Msgs
                </th>
                <th className="px-4 py-2.5 font-medium">Comped</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.tenantId}
                  className="border-b border-rule/50 last:border-0"
                >
                  <td className="px-4 py-2.5">
                    <span className="text-ink font-medium">
                      {r.businessName}
                    </span>
                    {r.isSuspended && (
                      <span className="ml-2 text-[10px] bg-flag-light text-flag px-1.5 py-0.5 rounded">
                        Suspended
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        r.planTier === "pro"
                          ? "bg-ink text-white"
                          : r.planTier === "starter"
                            ? "bg-spark/15 text-spark"
                            : "bg-rule text-ink-muted"
                      }`}
                    >
                      {r.planTier}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                        r.planStatus === "active"
                          ? "bg-money-light text-money"
                          : r.planStatus === "past_due"
                            ? "bg-flag-light text-flag"
                            : "bg-rule text-ink-muted"
                      }`}
                    >
                      {r.planStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-muted">
                    {r.currentPeriodEnd
                      ? format(
                          new Date(r.currentPeriodEnd),
                          "MMM d, yyyy",
                        )
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-muted">
                    {r.monthlyMessageCount}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.isComped ? (
                      <span className="text-[10px] bg-money-light text-money px-1.5 py-0.5 rounded font-medium">
                        Yes
                      </span>
                    ) : (
                      <span className="text-[10px] text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.isComped ? (
                      <button
                        onClick={() => handleComp(r.tenantId, false)}
                        disabled={isPending}
                        className="text-[10px] text-flag hover:underline disabled:opacity-50"
                      >
                        Remove comp
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={compState[r.tenantId]?.tier ?? "starter"}
                          onChange={(e) =>
                            setCompState((prev) => ({
                              ...prev,
                              [r.tenantId]: {
                                tier: e.target.value as PlanTier,
                              },
                            }))
                          }
                          className="border border-rule rounded px-1.5 py-0.5 text-[10px] outline-none focus:border-spark"
                        >
                          {COMP_TIERS.map((t) => (
                            <option key={t} value={t}>
                              {getPlanLimits(t).label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() =>
                            handleComp(
                              r.tenantId,
                              true,
                              compState[r.tenantId]?.tier ?? "starter",
                            )
                          }
                          disabled={isPending}
                          className="text-[10px] font-medium bg-ink text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
                        >
                          Comp
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="text-center py-8 text-sm text-ink-muted">
            No tenants yet.
          </div>
        )}
      </div>
    </div>
  );
}
