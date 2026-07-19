"use client";

import { useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import type { AdminTenantRow } from "@/app/admin/actions";

interface Props {
  tenants: AdminTenantRow[];
}

function statusColor(tier: string) {
  switch (tier) {
    case "pro":
      return "bg-ink text-white";
    case "starter":
      return "bg-spark/15 text-spark";
    default:
      return "bg-rule text-ink-muted";
  }
}

function planStatusBadge(status: string) {
  switch (status) {
    case "past_due":
      return (
        <span className="text-[10px] bg-flag-light text-flag px-1.5 py-0.5 rounded font-medium">
          Past due
        </span>
      );
    case "trialing":
      return (
        <span className="text-[10px] bg-spark/10 text-spark px-1.5 py-0.5 rounded font-medium">
          Trial
        </span>
      );
    case "cancelled":
      return (
        <span className="text-[10px] bg-rule text-ink-muted px-1.5 py-0.5 rounded font-medium">
          Cancelled
        </span>
      );
    default:
      return null;
  }
}

export function AdminTenantTable({ tenants }: Props) {
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = tenants.filter((t) => {
    if (search && !t.businessName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTier !== "all" && t.planTier !== filterTier) return false;
    if (filterStatus !== "all") {
      if (filterStatus === "suspended" && !t.isSuspended) return false;
      if (filterStatus === "comped" && !t.isComped) return false;
      if (filterStatus === "active" && (t.isSuspended || t.planStatus !== "active")) return false;
      if (filterStatus === "past_due" && t.planStatus !== "past_due") return false;
      if (filterStatus === "over_limit") {
        const limit = t.monthlyMessageLimit;
        if (limit <= 0 || t.monthlyMessageCount < limit * 0.9) return false;
      }
    }
    return true;
  });

  return (
    <div className="bg-white rounded-xl border border-rule overflow-hidden">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-rule">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search business name…"
          className="border border-rule rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-spark transition-colors w-52"
        />
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value)}
          className="border border-rule rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-spark bg-white"
        >
          <option value="all">All tiers</option>
          <option value="free">Free</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-rule rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-spark bg-white"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="past_due">Past due</option>
          <option value="suspended">Suspended</option>
          <option value="comped">Comped</option>
          <option value="over_limit">Near/over limit</option>
        </select>
        <span className="text-xs text-ink-muted ml-auto">
          {filtered.length} of {tenants.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] text-ink-muted uppercase tracking-wider border-b border-rule">
              <th className="px-4 py-2.5 font-medium">Business</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5 font-medium">Tier</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Usage</th>
              <th className="px-4 py-2.5 font-medium text-right">Products</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr
                key={t.id}
                className="border-b border-rule/50 last:border-0 hover:bg-paper/50 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/tenants/${t.id}`}
                    className="text-ink font-medium hover:text-spark transition-colors"
                  >
                    {t.businessName}
                  </Link>
                  <span className="text-[10px] text-ink-muted block">
                    {t.businessType}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-ink-muted font-mono text-xs">
                  {t.whatsappNumber}
                </td>
                <td className="px-4 py-2.5 text-ink-muted text-xs">
                  {format(new Date(t.createdAt), "MMM d, yyyy")}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor(t.planTier)}`}
                  >
                    {t.planTier}
                  </span>
                  {t.isComped && (
                    <span className="ml-1 text-[10px] bg-money-light text-money px-1.5 py-0.5 rounded-full font-medium">
                      Comped
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {t.isSuspended ? (
                    <span className="text-[10px] bg-flag-light text-flag px-1.5 py-0.5 rounded font-medium">
                      Suspended
                    </span>
                  ) : (
                    planStatusBadge(t.planStatus)
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span
                    className={`text-xs font-mono ${
                      t.monthlyMessageLimit > 0 &&
                      t.monthlyMessageCount >= t.monthlyMessageLimit * 0.9
                        ? "text-flag font-medium"
                        : "text-ink-muted"
                    }`}
                  >
                    {t.monthlyMessageCount}
                    <span className="text-ink-muted/50">
                      /{t.monthlyMessageLimit > 0 ? t.monthlyMessageLimit : "∞"}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-ink-muted font-mono text-xs">
                  {t.productCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-ink-muted">
          No tenants match the filters.
        </div>
      )}
    </div>
  );
}
