"use client";

import { useState } from "react";
import type { CoordinatorDownlineBrm } from "@/lib/partner-server";
import { reassignStoreAction } from "@/app/partner/actions";

interface CoordinatorTeamViewProps {
  downlines: CoordinatorDownlineBrm[];
  coordinatorId: number;
  coordinatorName: string;
  onOpenRecruitModal: () => void;
}

export function CoordinatorTeamView({
  downlines,
  coordinatorName,
  onOpenRecruitModal,
}: CoordinatorTeamViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAgentForReassign, setSelectedAgentForReassign] = useState<CoordinatorDownlineBrm | null>(null);
  const [reassignTenantId, setReassignTenantId] = useState<string>("");
  const [reassignTargetPartnerId, setReassignTargetPartnerId] = useState<string>("");
  const [reassignLoading, setReassignLoading] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = useState(false);

  const formatNgn = (naira: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(naira);
  };

  const formatKoboToNgn = (kobo: number) => {
    return formatNgn(kobo / 100);
  };

  const totalStores = downlines.reduce((sum, d) => sum + d.storesCount, 0);
  const totalActiveStores = downlines.reduce((sum, d) => sum + d.activeStoresCount, 0);
  const totalOverridesKobo = downlines.reduce((sum, d) => sum + d.overrideEarnedKobo, 0);
  const teamRetention = totalStores > 0 ? Math.round((totalActiveStores / totalStores) * 100) : 0;

  const filteredDownlines = downlines.filter((d) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      d.fullName.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      d.phoneNumber.includes(q) ||
      d.partnerCode.toLowerCase().includes(q) ||
      (d.region && d.region.toLowerCase().includes(q))
    );
  });

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignTenantId || !reassignTargetPartnerId) return;

    setReassignError(null);
    setReassignLoading(true);

    try {
      const res = await reassignStoreAction({
        tenantId: parseInt(reassignTenantId, 10),
        targetPartnerId: parseInt(reassignTargetPartnerId, 10),
      });

      if (!res.success) {
        setReassignError(res.error || "Failed to reassign store.");
        setReassignLoading(false);
        return;
      }

      setReassignSuccess(true);
      setTimeout(() => {
        setReassignSuccess(false);
        setSelectedAgentForReassign(null);
        setReassignTenantId("");
        setReassignTargetPartnerId("");
      }, 1500);
    } catch (err) {
      setReassignError((err as Error).message || "An error occurred.");
    } finally {
      setReassignLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Team Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Downlines */}
        <div className="bg-white p-4 rounded-xl border border-rule shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span>Downline Field Agents</span>
            <span className="w-2 h-2 rounded-full bg-money" />
          </div>
          <div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-ink">
              {downlines.length}
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Active field team
            </p>
          </div>
        </div>

        {/* Team Stores */}
        <div className="bg-white p-4 rounded-xl border border-rule shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span>Downline Stores</span>
            <span className="text-[10px] font-semibold text-money px-1.5 py-0.2 rounded bg-money-light">
              {teamRetention}% active
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl sm:text-2xl font-bold text-ink">
                {totalStores}
              </span>
              <span className="text-xs text-ink-muted">
                ({totalActiveStores} active)
              </span>
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Across all downlines
            </p>
          </div>
        </div>

        {/* 10% Override Earned */}
        <div className="bg-white p-4 rounded-xl border border-rule shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span>10% Team Overrides</span>
            <span className="font-mono text-xs font-bold text-money">10%</span>
          </div>
          <div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-money">
              {formatKoboToNgn(totalOverridesKobo)}
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Recurring override commissions
            </p>
          </div>
        </div>

        {/* Performance Overview */}
        <div className="bg-white p-4 rounded-xl border border-rule shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span>Team Retention</span>
            <span className="w-2 h-2 rounded-full bg-money" />
          </div>
          <div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-ink">
              {teamRetention}%
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Store 7-day activity health
            </p>
          </div>
        </div>
      </div>

      {/* Downlines Section Card */}
      <div className="bg-white rounded-xl border border-rule shadow-xs overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-base text-ink">
                Field Agent Hierarchy & Performance
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-money-light text-money">
                {downlines.length} BRMs
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              You earn 10% on every renewal from your downline agents. Coach them or reassign dormant stores to keep retention high.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenRecruitModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-money text-white shadow-xs hover:bg-money/90 active:scale-95 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Recruit Field BRM</span>
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="p-3 bg-sand-light/30 border-b border-rule flex items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              placeholder="Search field agents by name, code, phone, or region..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-rule bg-white text-ink text-xs placeholder:text-ink-muted/60 focus:outline-none focus:ring-1 focus:ring-money"
            />
            <svg
              className="absolute left-2.5 top-2 text-ink-muted"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div className="text-[11px] text-ink-muted font-mono hidden sm:block">
            Split: <strong>20% Field BRM</strong> / <strong>10% Regional Coordinator</strong>
          </div>
        </div>

        {/* Table */}
        {downlines.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-sand-light text-ink-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 className="font-display font-semibold text-sm text-ink mb-1">
              No Field Agents Recruited Yet
            </h3>
            <p className="text-xs text-ink-muted max-w-sm mx-auto mb-4">
              Expand your territory distribution network! Click &quot;Recruit Field BRM&quot; to authorize agents under your regional account.
            </p>
            <button
              onClick={onOpenRecruitModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-money text-white shadow-xs hover:bg-money/90 transition-all"
            >
              <span>+ Recruit First Field BRM</span>
            </button>
          </div>
        ) : filteredDownlines.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-muted">
            No field agents match your search filter.
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
                  <th className="py-3 px-4">Portfolio Stores</th>
                  <th className="py-3 px-4">Total Store GMV</th>
                  <th className="py-3 px-4">10% Override Earned</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-sans">
                {filteredDownlines.map((agent) => {
                  const cleanPhone = agent.phoneNumber.replace(/\D/g, "");
                  const coachWhatsappUrl = `https://wa.me/${cleanPhone}?text=Hi+${encodeURIComponent(agent.fullName)},+checking+in+on+your+SparkBooks+territory.+Let's+review+your+stores+this+week!`;

                  return (
                    <tr key={agent.id} className="hover:bg-sand-light/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink text-sm">
                            {agent.fullName}
                          </span>
                          {agent.status === "pending" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Pending Invite
                            </span>
                          )}
                          {agent.status === "suspended" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              Suspended
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-muted font-mono">
                          {agent.email} • {agent.phoneNumber}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold px-2 py-0.5 rounded bg-paper border border-rule text-ink text-[11px]">
                          {agent.partnerCode}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-[11px] text-ink font-medium">
                        {agent.region || <span className="text-ink-muted italic">General</span>}
                      </td>

                      <td className="py-3 px-4">
                        {agent.storesCount === 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sand-light text-ink-muted border border-rule">
                            New (0 stores)
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  agent.performanceScore >= 80
                                    ? "bg-money-light text-money"
                                    : agent.performanceScore >= 60
                                    ? "bg-emerald-50 text-emerald-700"
                                    : agent.performanceScore >= 40
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                {agent.performanceScore}%
                              </span>
                              <span className="text-[11px] font-medium text-ink">
                                {agent.performanceGrade}
                              </span>
                            </div>
                            <div className="text-[10px] text-ink-muted font-mono">
                              {agent.retentionRate}% active stores
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-ink">
                        <span className="font-semibold">{agent.storesCount}</span>
                        <span className="text-[11px] text-ink-muted"> ({agent.activeStoresCount} active)</span>
                      </td>

                      <td className="py-3 px-4 font-mono text-ink">
                        {formatNgn(agent.totalGmvNgn)}
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-money">
                        {formatKoboToNgn(agent.overrideEarnedKobo)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <a
                            href={coachWhatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-rule bg-white text-ink hover:bg-paper transition-colors"
                            title="Chat and coach field agent on WhatsApp"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                            </svg>
                            <span>Coach</span>
                          </a>

                          <button
                            onClick={() => setSelectedAgentForReassign(agent)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-rule bg-sand-light/50 text-ink hover:bg-sand-light transition-colors"
                            title="Reassign a dormant store to another agent"
                          >
                            Reassign Store
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reassign Store Modal */}
      {selectedAgentForReassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-rule shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setSelectedAgentForReassign(null)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink p-1"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="text-xl font-display font-bold text-ink mb-1">
              Reassign Territory Store
            </h2>
            <p className="text-xs text-ink-muted mb-4">
              Move a shop under your regional team to prevent dormancy. The new BRM receives the store&apos;s physical address and landmark to immediately conduct in-person coaching visits.
            </p>

            {reassignError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {reassignError}
              </div>
            )}

            {reassignSuccess ? (
              <div className="text-center py-6 text-money font-semibold text-sm">
                ✓ Store reassigned successfully! Refreshing territory...
              </div>
            ) : (
              <form onSubmit={handleReassign} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-ink mb-1">
                    Store ID <span className="text-flag">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="Enter Tenant ID (e.g. 1)"
                    value={reassignTenantId}
                    onChange={(e) => setReassignTenantId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-rule bg-sand-light/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-money font-mono"
                  />
                  <p className="text-[11px] text-ink-muted mt-1">
                    Found in your merchant portfolio CRM list.
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-ink mb-1">
                    Assign To Field BRM <span className="text-flag">*</span>
                  </label>
                  <select
                    required
                    value={reassignTargetPartnerId}
                    onChange={(e) => setReassignTargetPartnerId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-rule bg-sand-light/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-money text-xs"
                  >
                    <option value="">Select target field agent...</option>
                    <option value={coordinatorName ? "myself" : ""}>
                      Myself ({coordinatorName} - Coordinator Direct)
                    </option>
                    {downlines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} ({d.partnerCode}) - {d.region || "General"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAgentForReassign(null)}
                    className="px-3.5 py-2 rounded-lg border border-rule text-ink hover:bg-paper font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reassignLoading}
                    className="px-4 py-2 rounded-lg bg-money text-white font-semibold shadow-xs hover:bg-money/90 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {reassignLoading ? "Reassigning..." : "Confirm Reassignment"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
