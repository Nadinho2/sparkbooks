"use client";

import type { PartnerCommissionItem } from "@/lib/partner-server";

interface CommissionLedgerProps {
  commissions: PartnerCommissionItem[];
}

export function CommissionLedger({ commissions }: CommissionLedgerProps) {
  const formatNgn = (kobo: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(kobo / 100);
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("en-NG", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="bg-white rounded-xl border border-rule shadow-xs overflow-hidden mt-6">
      <div className="p-4 sm:p-5 border-b border-rule">
        <h3 className="font-display font-bold text-base text-ink">
          Commission Earnings History
        </h3>
        <p className="text-xs text-ink-muted mt-0.5">
          Itemized log of monthly subscription rev-shares and milestone earnings.
        </p>
      </div>

      {commissions.length === 0 ? (
        <div className="p-12 text-center text-ink-muted text-xs">
          No commissions recorded yet. When your merchants subscribe to Starter or Pro plans, your 30% rev-share will appear here automatically.
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
                <th className="py-3 px-4 text-right">Earned (₦)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule font-sans">
              {commissions.map((item) => (
                <tr key={item.id} className="hover:bg-sand-light/40 transition-colors">
                  <td className="py-3 px-4 font-mono text-ink-muted">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-ink">
                    {item.businessName}
                  </td>
                  <td className="py-3 px-4 text-ink-muted">
                    {item.description || "Subscription revenue share"}
                  </td>
                  <td className="py-3 px-4">
                    {item.status === "cleared" && (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-money-light text-money">
                        Cleared
                      </span>
                    )}
                    {item.status === "pending" && (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700">
                        Pending
                      </span>
                    )}
                    {item.status === "paid" && (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700">
                        Paid out
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-money text-right">
                    +{formatNgn(item.amountKobo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
