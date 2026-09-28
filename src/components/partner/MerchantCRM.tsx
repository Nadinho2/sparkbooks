"use client";

import { useState } from "react";
import type { PartnerMerchantRow } from "@/lib/partner-server";

interface MerchantCRMProps {
  merchants: PartnerMerchantRow[];
  partnerName: string;
}

export function MerchantCRM({ merchants, partnerName }: MerchantCRMProps) {
  const [filter, setFilter] = useState<"all" | "active" | "at_risk" | "dormant">("all");
  const [search, setSearch] = useState("");

  const filtered = merchants.filter((m) => {
    if (filter !== "all" && m.healthStatus !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        m.businessName.toLowerCase().includes(q) ||
        m.whatsappNumber.includes(q) ||
        m.businessType.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: merchants.length,
    active: merchants.filter((m) => m.healthStatus === "active").length,
    at_risk: merchants.filter((m) => m.healthStatus === "at_risk").length,
    dormant: merchants.filter((m) => m.healthStatus === "dormant").length,
  };

  const formatNgn = (n: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(n);
  };

  const createWhatsAppNudgeUrl = (phone: string, shopName: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const msg = `Hello ${shopName}! This is ${partnerName} from SparkBooks. I noticed you haven't recorded sales in the last few days. Is everything going well with your store or do you need any help with your WhatsApp bookkeeper?`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  };

  const createGoogleMapsUrl = (m: PartnerMerchantRow) => {
    if (m.latitude && m.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`;
    }
    const queryParts = [m.shopAddress, m.landmark, m.cityLga, m.state].filter(Boolean).join(", ");
    if (!queryParts) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts)}`;
  };

  return (
    <div className="bg-white rounded-xl border border-rule shadow-xs overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display font-bold text-base text-ink">
            Merchant Portfolio CRM
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Monitor store activity, prevent churn, and assist your merchants.
          </p>
        </div>

        {/* Search */}
        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search shop or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2.5 bg-sand-light/50 border-b border-rule flex items-center gap-2 overflow-x-auto text-xs">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-md font-medium transition-colors ${
            filter === "all"
              ? "bg-white text-ink shadow-xs border border-rule font-semibold"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          All Stores ({counts.all})
        </button>
        <button
          onClick={() => setFilter("active")}
          className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
            filter === "active"
              ? "bg-white text-money shadow-xs border border-rule font-semibold"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-money" />
          Active ({counts.active})
        </button>
        <button
          onClick={() => setFilter("at_risk")}
          className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
            filter === "at_risk"
              ? "bg-white text-flag shadow-xs border border-rule font-semibold"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-flag" />
          At Risk 3d+ ({counts.at_risk})
        </button>
        <button
          onClick={() => setFilter("dormant")}
          className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
            filter === "dormant"
              ? "bg-white text-red-600 shadow-xs border border-rule font-semibold"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Dormant 7d+ ({counts.dormant})
        </button>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center text-ink-muted text-xs">
          No stores found matching your current filter.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-sand-light/60 text-ink-muted uppercase tracking-wider font-mono text-[10px] border-b border-rule">
                <tr>
                  <th className="py-3 px-4">Store & Location</th>
                  <th className="py-3 px-4">WhatsApp Contact</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Health Status</th>
                  <th className="py-3 px-4">Total Recorded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-sans">
                {filtered.map((m) => {
                  const mapsUrl = createGoogleMapsUrl(m);

                  return (
                    <tr key={m.tenantId} className="hover:bg-sand-light/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-ink text-sm">
                            {m.businessName}
                          </span>
                          {m.isTransferred && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                              title={`Transferred store. Originally registered by ${m.registeredByPartnerName || "another BRM"}`}
                            >
                              🔄 Transferred
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-muted">
                          {m.businessType}
                        </div>
                        {m.shopAddress ? (
                          <div className="text-[11px] text-ink-muted flex items-start gap-1 mt-0.5 max-w-xs">
                            <span className="text-money shrink-0">📍</span>
                            <span className="truncate">
                              {m.shopAddress}
                              {m.landmark ? ` (${m.landmark})` : ""}
                              {m.cityLga ? `, ${m.cityLga}` : ""}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-ink-muted/60 italic mt-0.5">
                            No physical address recorded
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-ink">
                        {m.whatsappNumber}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize bg-paper text-ink border border-rule">
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
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {m.daysInactive}d inactive
                          </span>
                        )}
                        {m.healthStatus === "dormant" && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            Dormant ({m.daysInactive}d)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <div className="font-semibold text-ink">
                          {formatNgn(m.totalRevenueNgn)}
                        </div>
                        <div className="text-[11px] text-ink-muted">
                          {m.totalSalesCount} sales logged
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {mapsUrl && (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 text-[11px] font-medium rounded border border-rule bg-white text-ink hover:bg-money-light hover:text-money hover:border-money/30 transition-colors flex items-center gap-1"
                              title="Navigate to shop in Google Maps"
                            >
                              <span>📍</span>
                              <span>Map</span>
                            </a>
                          )}
                          <a
                            href={createWhatsAppNudgeUrl(m.whatsappNumber, m.businessName)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 text-[11px] font-medium rounded border border-rule bg-white text-ink hover:bg-money-light hover:text-money hover:border-money/30 transition-colors flex items-center gap-1"
                          >
                            <span>💬</span>
                            <span>Nudge</span>
                          </a>
                          <a
                            href={`tel:${m.whatsappNumber}`}
                            className="p-1 text-ink-muted hover:text-ink rounded hover:bg-paper transition-colors"
                            title="Call Merchant"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-rule">
            {filtered.map((m) => {
              const mapsUrl = createGoogleMapsUrl(m);

              return (
                <div key={m.tenantId} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-semibold text-ink text-sm">{m.businessName}</h4>
                        {m.isTransferred && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            🔄 Transferred
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-muted">{m.businessType} • {m.whatsappNumber}</p>
                      {m.shopAddress && (
                        <p className="text-[11px] text-ink-muted mt-1 flex items-start gap-1">
                          <span className="text-money shrink-0">📍</span>
                          <span>{m.shopAddress}{m.landmark ? ` (${m.landmark})` : ""}{m.cityLga ? `, ${m.cityLga}` : ""}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      {m.healthStatus === "active" && (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-money" title="Active" />
                      )}
                      {m.healthStatus === "at_risk" && (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-flag" title="At Risk" />
                      )}
                      {m.healthStatus === "dormant" && (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Dormant" />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-sand-light/50 p-2.5 rounded-lg font-mono">
                    <div>
                      <span className="text-ink-muted">Recorded: </span>
                      <span className="font-semibold text-ink">{formatNgn(m.totalRevenueNgn)}</span>
                    </div>
                    <div className="text-ink-muted">
                      {m.totalSalesCount} sales
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-ink-muted capitalize">
                      Plan: <span className="font-medium text-ink">{m.planTier}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 text-xs rounded border border-rule text-ink bg-white hover:bg-money-light hover:text-money flex items-center gap-1"
                        >
                          <span>📍</span>
                          <span>Map</span>
                        </a>
                      )}
                      <a
                        href={`tel:${m.whatsappNumber}`}
                        className="px-2.5 py-1 text-xs rounded border border-rule text-ink bg-white hover:bg-paper"
                      >
                        Call
                      </a>
                      <a
                        href={createWhatsAppNudgeUrl(m.whatsappNumber, m.businessName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 text-xs font-semibold rounded bg-money text-white hover:bg-money/90"
                      >
                        Nudge on WhatsApp
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
