"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminPartnerRow } from "@/app/admin/actions";
import {
  createOrPromotePartnerAction,
  updatePartnerStatusAction,
} from "@/app/admin/actions";

interface PartnersViewProps {
  partners: AdminPartnerRow[];
}

export function PartnersView({ partners }: PartnersViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [partnerCode, setPartnerCode] = useState("");
  const [commissionRate, setCommissionRate] = useState("20");
  const [role, setRole] = useState<"field_agent" | "coordinator">("field_agent");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatNgn = (kobo: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(kobo / 100);
  };

  const handleRoleChange = (newRole: "field_agent" | "coordinator") => {
    setRole(newRole);
    if (newRole === "coordinator") {
      setCommissionRate("30");
    } else {
      setCommissionRate("20");
    }
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await createOrPromotePartnerAction({
        fullName,
        email,
        phoneNumber,
        partnerCode: partnerCode.trim() || undefined,
        commissionRate: parseFloat(commissionRate) || (role === "coordinator" ? 30.0 : 20.0),
        role,
        region: region.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || "Failed to create partner");
        setLoading(false);
        return;
      }

      setFullName("");
      setEmail("");
      setPhoneNumber("");
      setPartnerCode("");
      setCommissionRate("20");
      setRole("field_agent");
      setRegion("");
      setModalOpen(false);
    } catch (err) {
      setError((err as Error).message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (partnerId: number, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "suspended" : "active";
    await updatePartnerStatusAction(partnerId, nextStatus);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Field Partners (BRMs)
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Manage relationship managers, monitor field merchant onboarding, and track performance scores.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-money text-white shadow-xs hover:bg-money/90 active:scale-95 transition-all self-start sm:self-auto"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add / Promote Partner</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-rule shadow-xs overflow-hidden">
        {partners.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink-muted">
            No partners registered yet. Click &quot;Add / Promote Partner&quot; to authorize your first BRM.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-sand-light/60 text-ink-muted uppercase tracking-wider font-mono text-[10px] border-b border-rule">
                <tr>
                  <th className="py-3 px-4">Partner Name & Email</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Performance Grade</th>
                  <th className="py-3 px-4">Assigned Stores</th>
                  <th className="py-3 px-4">Total Earned</th>
                  <th className="py-3 px-4">Settlement Bank</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-sans">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-sand-light/40 transition-colors">
                    <td className="py-3 px-4">
                      <Link
                        href={`/admin/partners/${p.id}`}
                        className="group block"
                        title="Click to view full partner performance"
                      >
                        <div className="font-semibold text-ink text-sm group-hover:text-money transition-colors flex items-center gap-1.5">
                          <span>{p.fullName}</span>
                          <span className="text-ink-muted text-xs group-hover:translate-x-0.5 transition-transform">→</span>
                        </div>
                        <div className="text-[11px] text-ink-muted font-mono">
                          {p.email} • {p.phoneNumber}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {p.role === "coordinator" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              Regional Coordinator ({p.downlinesCount} BRMs)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              Field BRM {p.coordinatorName ? `• Under ${p.coordinatorName}` : ""}
                            </span>
                          )}
                          {p.region && (
                            <span className="text-[10px] text-ink-muted bg-sand-light border border-rule px-1.5 py-0.5 rounded">
                              {p.region}
                            </span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-ink">
                      <span className="px-2 py-0.5 rounded bg-paper border border-rule">
                        {p.partnerCode}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {p.merchantCount === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sand-light text-ink-muted border border-rule">
                          New BRM (0 stores)
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              p.performanceScore >= 80
                                ? "bg-money-light text-money"
                                : p.performanceScore >= 60
                                ? "bg-emerald-50 text-emerald-700"
                                : p.performanceScore >= 40
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700"
                            }`}>
                              {p.performanceScore}%
                            </span>
                            <span className="text-[11px] font-medium text-ink">
                              {p.performanceGrade}
                            </span>
                          </div>
                          <div className="text-[10px] text-ink-muted font-mono">
                            {p.retentionRate}% active • {p.conversionRate}% paid
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-ink">
                      <span className="font-semibold">{p.merchantCount}</span> stores
                      {p.merchantCount > 0 && (
                        <span className="text-[10px] text-ink-muted block">
                          ({p.activeMerchantCount} active)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-ink">
                      {formatNgn(p.totalEarningsKobo)}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-ink-muted">
                      {p.bankName ? (
                        <div>
                          <span className="font-medium text-ink">{p.bankName}</span>
                          <div className="font-mono">{p.accountNumber} ({p.accountName})</div>
                        </div>
                      ) : (
                        <span className="italic">Not configured</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {p.status === "active" ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-money-light text-money">
                          <span className="w-1.5 h-1.5 rounded-full bg-money" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Suspended
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <Link
                          href={`/admin/partners/${p.id}`}
                          className="px-2.5 py-1 text-[11px] font-medium rounded border border-rule bg-white text-ink hover:bg-paper transition-colors"
                        >
                          View Performance
                        </Link>
                        <button
                          onClick={() => toggleStatus(p.id, p.status)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors ${
                            p.status === "active"
                              ? "border-red-200 text-red-700 hover:bg-red-50"
                              : "border-money/30 text-money hover:bg-money-light"
                          }`}
                        >
                          {p.status === "active" ? "Suspend" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-rule shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink p-1"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <h2 className="text-xl font-display font-bold text-ink mb-1">
              Add Field Partner (BRM)
            </h2>
            <p className="text-xs text-ink-muted mb-4">
              Authorize a relationship manager. Grants them access to the <code>/partner</code> dashboard.
            </p>

            {error && (
              <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleCreatePartner} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tunde Balogun"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="tunde@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money"
                />
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Used for Clerk authentication sign-in.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  WhatsApp / Phone Number
                </label>
                <input
                  type="tel"
                  required
                  placeholder="0803 123 4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money"
                />
              </div>

              {/* Partner Role Hierarchy */}
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Distribution Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRoleChange("field_agent")}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      role === "field_agent"
                        ? "border-money bg-money-light/30 text-ink"
                        : "border-rule bg-sand-light/50 text-ink-muted hover:bg-sand-light"
                    }`}
                  >
                    <div className="font-semibold text-xs text-ink flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${role === "field_agent" ? "bg-money" : "bg-ink-muted/40"}`} />
                      Field BRM
                    </div>
                    <div className="text-[10px] text-ink-muted mt-0.5">
                      20% recurring rev-share
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleChange("coordinator")}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      role === "coordinator"
                        ? "border-amber-400 bg-amber-50/60 text-ink"
                        : "border-rule bg-sand-light/50 text-ink-muted hover:bg-sand-light"
                    }`}
                  >
                    <div className="font-semibold text-xs text-ink flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${role === "coordinator" ? "bg-amber-500" : "bg-ink-muted/40"}`} />
                      Regional Lead
                    </div>
                    <div className="text-[10px] text-ink-muted mt-0.5">
                      30% direct + 10% override
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Territory / Region
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lagos Mainland, Ikeja, Abuja"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Partner Code (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TUNDE26"
                    value={partnerCode}
                    onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-sm font-mono uppercase rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Rev-Share %
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-money rounded-lg hover:bg-money/90 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? "Registering Partner..." : "Authorize Partner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
