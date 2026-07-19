"use client";

import { useState } from "react";
import { formatNaira } from "@/lib/format";
import type { CostSummary, UsageRow } from "@/app/admin/actions";

interface Props {
  summary: CostSummary;
  rows: UsageRow[];
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-rule rounded-xl px-4 py-3">
      <span className="text-[10px] text-ink-muted uppercase tracking-wider">
        {label}
      </span>
      <div className="text-lg font-display text-ink mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-ink-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function AdminUsageView({ summary, rows }: Props) {
  const [sortKey, setSortKey] = useState<keyof UsageRow>("estimatedCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = [...rows].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    const numA = typeof aVal === "number" ? aVal : 0;
    const numB = typeof bVal === "number" ? bVal : 0;
    return sortDir === "desc" ? numB - numA : numA - numB;
  });

  function toggleSort(key: keyof UsageRow) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Monthly revenue"
          value={formatNaira(summary.totalRevenueNaira)}
          sub={`${summary.paidTenants} paid tenants`}
        />
        <MetricCard
          label="Est. API cost"
          value={formatNaira(summary.totalEstimatedCostNaira)}
          sub="Whisper + DeepSeek"
        />
        <MetricCard
          label="Breakeven"
          value={`${summary.breakevenPercent}%`}
          sub={
            summary.breakevenPercent >= 100
              ? "Profitable"
              : "Below breakeven"
          }
        />
        <MetricCard
          label="Messages"
          value={String(summary.monthlyMessageCount)}
          sub={`${summary.dailyMessageCount} today`}
        />
      </div>

      {/* Tenant breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Total tenants" value={String(summary.activeTenants)} />
        <MetricCard label="Free" value={String(summary.freeTenants)} />
        <MetricCard label="Paid" value={String(summary.paidTenants)} />
        <MetricCard label="Comped" value={String(summary.compedTenants)} />
      </div>

      {/* Per-tenant usage table */}
      <div className="bg-white rounded-xl border border-rule overflow-hidden">
        <div className="p-4 border-b border-rule">
          <h3 className="font-display text-sm text-ink">
            Per-tenant usage
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-ink-muted uppercase tracking-wider border-b border-rule">
                <th className="px-4 py-2 font-medium">Tenant</th>
                <th className="px-4 py-2 font-medium">Tier</th>
                <th
                  className="px-4 py-2 font-medium text-right cursor-pointer hover:text-ink select-none"
                  onClick={() => toggleSort("monthlyMessageCount")}
                >
                  Usage {sortKey === "monthlyMessageCount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th
                  className="px-4 py-2 font-medium text-right cursor-pointer hover:text-ink select-none"
                  onClick={() => toggleSort("voiceCount")}
                >
                  Voice {sortKey === "voiceCount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th
                  className="px-4 py-2 font-medium text-right cursor-pointer hover:text-ink select-none"
                  onClick={() => toggleSort("textCount")}
                >
                  Text {sortKey === "textCount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th
                  className="px-4 py-2 font-medium text-right cursor-pointer hover:text-ink select-none"
                  onClick={() => toggleSort("estimatedCost")}
                >
                  Est. cost {sortKey === "estimatedCost" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.tenantId}
                  className={`border-b border-rule/50 last:border-0 ${
                    r.planTier === "free" && r.estimatedCost > 300
                      ? "bg-flag-light/30"
                      : ""
                  }`}
                >
                  <td className="px-4 py-2 text-ink font-medium">
                    {r.businessName}
                    {r.planTier === "free" && r.estimatedCost > 300 && (
                      <span className="ml-2 text-[10px] bg-flag-light text-flag px-1.5 py-0.5 rounded font-medium">
                        High cost
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
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
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    <span
                      className={
                        r.messageUsagePercent >= 90 ? "text-flag font-medium" : ""
                      }
                    >
                      {r.monthlyMessageCount}
                      {r.monthlyMessageLimit > 0 && (
                        <span className="text-ink-muted/50">
                          /{r.monthlyMessageLimit}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-ink-muted">
                    {r.voiceCount}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-ink-muted">
                    {r.textCount}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {formatNaira(r.estimatedCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && (
          <div className="text-center py-8 text-sm text-ink-muted">
            No usage data
          </div>
        )}
      </div>
    </div>
  );
}
