"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminPartnerDetail } from "@/app/admin/actions";
import { updatePartnerStatusAction, toggleCoordinatorRoleAction } from "@/app/admin/actions";

interface PartnerDetailViewProps {
  data: AdminPartnerDetail;
}

export function PartnerDetailView({ data }: PartnerDetailViewProps) {
  const { partner, merchants, downlines = [], commissions, metrics } = data;
  const [status, setStatus] = useState(partner.status);
  const [role, setRole] = useState(partner.role);
  const region = partner.region || "";
  const [roleUpdating, setRoleUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterHealth, setFilterHealth] = useState<"all" | "active" | "at_risk" | "dormant">("all");

  const formatNgn = (n: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(n);
  };

  const formatKoboToNgn = (kobo: number) => {
    return formatNgn(kobo / 100);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("en-NG", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const toggleStatus = async () => {
    const nextStatus = status === "active" ? "suspended" : "active";
    const res = await updatePartnerStatusAction(partner.id, nextStatus);
    if (res.success) {
      setStatus(nextStatus);
    }
  };

  const toggleCoordinator = async () => {
    const nextRole = role === "coordinator" ? "field_agent" : "coordinator";
    setRoleUpdating(true);
    const res = await toggleCoordinatorRoleAction(partner.id, nextRole, region);
    if (res.success) {
      setRole(nextRole);
    }
    setRoleUpdating(false);
  };

  const filteredMerchants = merchants.filter((m) => {
    if (filterHealth !== "all" && m.healthStatus !== filterHealth) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        m.businessName.toLowerCase().includes(q) ||
        m.whatsappNumber.includes(q) ||
        m.businessType.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-money bg-money-light border-money/30";
    if (score >= 60) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (score >= 40) return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-red-700 bg-red-50 border-red-200";
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 80) return "bg-money";
    if (score >= 60) return "bg-emerald-600";
    if (score >= 40) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/partners"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors px-2.5 py-1.5 rounded-lg border border-rule bg-white shadow-2xs"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back to Partners</span>
          </Link>

          <span className="text-rule">•</span>

          <span className="font-mono text-xs text-ink-muted">
            Code: <strong className="text-ink">{partner.partnerCode}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Promote / Demote Coordinator Toggle */}
          <button
            onClick={toggleCoordinator}
            disabled={roleUpdating}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              role === "coordinator"
                ? "border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
                : "border-rule text-ink bg-white hover:bg-paper"
            }`}
          >
            {roleUpdating
              ? "Updating..."
              : role === "coordinator"
              ? "★ Demote to Field BRM"
              : "★ Promote to Regional Coordinator"}
          </button>

          <button
            onClick={toggleStatus}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              status === "active"
                ? "border-red-200 text-red-700 hover:bg-red-50 bg-white"
                : "border-money/30 text-money hover:bg-money-light bg-white"
            }`}
          >
            {status === "active" ? "Suspend BRM" : "Re-activate BRM"}
          </button>
        </div>
      </div>

      {/* Partner Identity Card */}
      <div className="bg-white rounded-xl border border-rule p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="font-display text-2xl font-bold text-ink">
              {partner.fullName}
            </h1>

            {/* Role Badge */}
            {role === "coordinator" ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                Regional Coordinator ({downlines.length} Downlines)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                Field BRM {partner.coordinatorName ? `• Under ${partner.coordinatorName}` : ""}
              </span>
            )}

            {/* Region */}
            {region && (
              <span className="text-xs text-ink-muted bg-sand-light border border-rule px-2 py-0.5 rounded">
                📍 {region}
              </span>
            )}

            {status === "active" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-money-light text-money">
                <span className="w-1.5 h-1.5 rounded-full bg-money" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Suspended
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted font-mono">
            {partner.email} • {partner.phoneNumber} • Joined {formatDate(partner.createdAt)}
          </p>
        </div>

        {/* Settlement Bank */}
        <div className="bg-sand-light/50 p-3 rounded-lg border border-rule text-xs">
          <div className="text-[11px] text-ink-muted uppercase tracking-wider font-mono font-semibold">
            Settlement Account
          </div>
          {partner.bankName ? (
            <div className="mt-0.5 font-medium text-ink">
              {partner.bankName} — <span className="font-mono">{partner.accountNumber}</span> ({partner.accountName})
            </div>
          ) : (
            <div className="mt-0.5 text-ink-muted italic">
              No bank account linked yet
            </div>
          )}
        </div>
      </div>

      {/* Performance Scorecard Banner */}
      <div className="bg-white rounded-xl border border-rule p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-rule">
          {/* Main Grade Box */}
          <div className="flex items-center gap-5">
            <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center border font-mono ${getScoreColor(metrics.performanceScore)}`}>
              <span className="text-3xl font-bold tracking-tight">
                {metrics.totalStores === 0 ? "—" : `${metrics.performanceScore}%`}
              </span>
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wider">
                Score
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-xl font-bold text-ink">
                  Performance Grade: {metrics.performanceGrade}
                </h3>
              </div>
              <p className="text-xs text-ink-muted mt-1 max-w-md">
                {metrics.totalStores === 0
                  ? "This BRM has not onboarded any shops yet. Performance score will calculate once stores are assigned."
                  : `Score reflects ${metrics.retentionRate}% 7-day merchant activity retention and ${metrics.conversionRate}% paid subscriber conversion rate.`}
              </p>

              {/* Progress bar */}
              {metrics.totalStores > 0 && (
                <div className="w-full sm:w-72 bg-sand-light rounded-full h-2 mt-3 overflow-hidden border border-rule">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(metrics.performanceScore)}`}
                    style={{ width: `${Math.max(5, metrics.performanceScore)}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Quick Rev Share Badge */}
          <div className="text-left md:text-right bg-sand-light/40 md:bg-transparent p-3 md:p-0 rounded-lg">
            <div className="text-[11px] text-ink-muted font-mono uppercase">
              Rev-Share Rate
            </div>
            <div className="font-mono text-2xl font-bold text-money mt-0.5">
              {partner.commissionRate}%
            </div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              Monthly recurring split
            </div>
          </div>
        </div>

        {/* 4 Performance Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
          <div className="bg-sand-light/30 p-3.5 rounded-lg border border-rule">
            <div className="text-xs text-ink-muted">Active Store Retention</div>
            <div className="font-mono text-2xl font-bold text-ink mt-1">
              {metrics.retentionRate}%
            </div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              {metrics.activeStores} of {metrics.totalStores} active in 7 days
            </div>
          </div>

          <div className="bg-sand-light/30 p-3.5 rounded-lg border border-rule">
            <div className="text-xs text-ink-muted">Paid Conversion Rate</div>
            <div className="font-mono text-2xl font-bold text-ink mt-1">
              {metrics.conversionRate}%
            </div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              {metrics.paidStores} paying subscribers
            </div>
          </div>

          <div className="bg-sand-light/30 p-3.5 rounded-lg border border-rule">
            <div className="text-xs text-ink-muted">Ecosystem GMV Driven</div>
            <div className="font-mono text-2xl font-bold text-ink mt-1">
              {formatNgn(metrics.totalGmvNgn)}
            </div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              Sales logged via WhatsApp
            </div>
          </div>

          <div className="bg-sand-light/30 p-3.5 rounded-lg border border-rule">
            <div className="text-xs text-ink-muted">Commissions Earned</div>
            <div className="font-mono text-2xl font-bold text-money mt-1">
              {formatKoboToNgn(metrics.totalCommissionEarnedKobo)}
            </div>
            <div className="text-[11px] text-ink-muted mt-0.5">
              +{formatKoboToNgn(metrics.pendingCommissionKobo)} pending
            </div>
          </div>
        </div>
      </div>

      {/* Downlines Section if Coordinator */}
      {role === "coordinator" && (
        <div className="bg-white rounded-xl border border-rule shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-base text-ink">
                  Regional Downline Field Agents ({downlines.length})
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  10% Overrides Network
                </span>
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                Field agents supervised by this coordinator. Coordinator earns 10% override on all downline merchant subscriptions.
              </p>
            </div>
          </div>

          {downlines.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              No downline field agents recruited under this coordinator yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-sand-light/60 text-ink-muted uppercase tracking-wider font-mono text-[10px] border-b border-rule">
                  <tr>
                    <th className="py-3 px-4">Field Agent</th>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Territory</th>
                    <th className="py-3 px-4">Performance Score</th>
                    <th className="py-3 px-4">Stores Assigned</th>
                    <th className="py-3 px-4">Total Store GMV</th>
                    <th className="py-3 px-4">10% Override Generated</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule font-sans">
                  {downlines.map((agent) => (
                    <tr key={agent.id} className="hover:bg-sand-light/30 transition-colors">
                      <td className="py-3 px-4">
                        <Link href={`/admin/partners/${agent.id}`} className="font-semibold text-ink hover:text-money transition-colors">
                          {agent.fullName}
                        </Link>
                        <div className="text-[11px] text-ink-muted font-mono">
                          {agent.email} • {agent.phoneNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-ink">
                        <span className="px-2 py-0.5 rounded bg-paper border border-rule">
                          {agent.partnerCode}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-ink font-medium">
                        {agent.region || "General"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            agent.performanceScore >= 80
                              ? "bg-money-light text-money"
                              : agent.performanceScore >= 60
                              ? "bg-emerald-50 text-emerald-700"
                              : agent.performanceScore >= 40
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                          }`}>
                            {agent.performanceScore}%
                          </span>
                          <span className="text-[11px] font-medium text-ink">
                            {agent.performanceGrade}
                          </span>
                        </div>
                        <div className="text-[10px] text-ink-muted font-mono">
                          {agent.retentionRate}% active
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-ink">
                        {agent.storesCount} stores ({agent.activeStoresCount} active)
                      </td>
                      <td className="py-3 px-4 font-mono text-ink">
                        {formatNgn(agent.totalGmvNgn)}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-money">
                        {formatKoboToNgn(agent.overrideEarnedKobo)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/admin/partners/${agent.id}`}
                          className="px-2.5 py-1 text-[11px] font-medium rounded border border-rule bg-white text-ink hover:bg-paper transition-colors"
                        >
                          View Agent
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Assigned Merchants Table */}
      <div className="bg-white rounded-xl border border-rule shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-display font-bold text-base text-ink">
              Onboarded Stores ({merchants.length})
            </h3>
            <p className="text-xs text-ink-muted mt-0.5">
              All retail shops managed by this field relationship officer.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search store name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors w-full sm:w-48"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-4 py-2 bg-sand-light/40 border-b border-rule flex items-center gap-2 text-xs">
          <button
            onClick={() => setFilterHealth("all")}
            className={`px-2.5 py-0.5 rounded font-medium transition-colors ${
              filterHealth === "all" ? "bg-white shadow-2xs text-ink font-semibold" : "text-ink-muted"
            }`}
          >
            All ({merchants.length})
          </button>
          <button
            onClick={() => setFilterHealth("active")}
            className={`px-2.5 py-0.5 rounded font-medium transition-colors flex items-center gap-1 ${
              filterHealth === "active" ? "bg-white shadow-2xs text-money font-semibold" : "text-ink-muted"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-money" />
            Active ({merchants.filter((m) => m.healthStatus === "active").length})
          </button>
          <button
            onClick={() => setFilterHealth("at_risk")}
            className={`px-2.5 py-0.5 rounded font-medium transition-colors flex items-center gap-1 ${
              filterHealth === "at_risk" ? "bg-white shadow-2xs text-amber-700 font-semibold" : "text-ink-muted"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            At Risk 3d+ ({merchants.filter((m) => m.healthStatus === "at_risk").length})
          </button>
          <button
            onClick={() => setFilterHealth("dormant")}
            className={`px-2.5 py-0.5 rounded font-medium transition-colors flex items-center gap-1 ${
              filterHealth === "dormant" ? "bg-white shadow-2xs text-red-700 font-semibold" : "text-ink-muted"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Dormant 7d+ ({merchants.filter((m) => m.healthStatus === "dormant").length})
          </button>
        </div>

        {filteredMerchants.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink-muted">
            No merchants found matching your filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-sand-light/60 text-ink-muted uppercase tracking-wider font-mono text-[10px] border-b border-rule">
                <tr>
                  <th className="py-3 px-4">Store Name & Category</th>
                  <th className="py-3 px-4">WhatsApp Contact</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Sales Logged</th>
                  <th className="py-3 px-4">Revenue (₦)</th>
                  <th className="py-3 px-4 text-right">Onboarded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-sans">
                {filteredMerchants.map((m) => (
                  <tr key={m.tenantId} className="hover:bg-sand-light/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-ink text-sm">
                        {m.businessName}
                      </div>
                      <div className="text-[11px] text-ink-muted">
                        {m.businessType}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-ink">
                      {m.whatsappNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium capitalize bg-paper text-ink border border-rule">
                        {m.planTier}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {m.healthStatus === "active" && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-money-light text-money">
                          <span className="w-1.5 h-1.5 rounded-full bg-money" />
                          Active
                        </span>
                      )}
                      {m.healthStatus === "at_risk" && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          {m.daysInactive}d inactive
                        </span>
                      )}
                      {m.healthStatus === "dormant" && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Dormant
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-ink">
                      {m.salesCount} sales
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-ink">
                      {formatNgn(m.totalRevenueNgn)}
                    </td>
                    <td className="py-3 px-4 font-mono text-ink-muted text-right">
                      {formatDate(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Commission Earnings Log */}
      <div className="bg-white rounded-xl border border-rule shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-rule">
          <h3 className="font-display font-bold text-base text-ink">
            Commission History ({commissions.length})
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Audit trail of revenue share credits generated by this partner.
          </p>
        </div>

        {commissions.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-muted">
            No commissions recorded for this partner yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-sand-light/60 text-ink-muted uppercase tracking-wider font-mono text-[10px] border-b border-rule">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Merchant</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-sans">
                {commissions.map((c) => (
                  <tr key={c.id} className="hover:bg-sand-light/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-ink-muted">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-ink">
                      {c.businessName}
                    </td>
                    <td className="py-3 px-4 text-ink-muted">
                      {c.description || "Subscription revenue share"}
                    </td>
                    <td className="py-3 px-4">
                      {c.status === "cleared" && (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-money-light text-money">
                          Cleared
                        </span>
                      )}
                      {c.status === "pending" && (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700">
                          Pending
                        </span>
                      )}
                      {c.status === "paid" && (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700">
                          Paid
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-money text-right">
                      +{formatKoboToNgn(c.amountKobo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
