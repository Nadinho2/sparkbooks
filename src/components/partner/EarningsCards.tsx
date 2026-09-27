"use client";

import type { PartnerEarnings } from "@/lib/partner-server";

interface EarningsCardsProps {
  earnings: PartnerEarnings;
  commissionRate: number;
  role?: "field_agent" | "coordinator";
}

export function EarningsCards({ earnings, commissionRate, role = "field_agent" }: EarningsCardsProps) {
  const formatNgn = (kobo: number) => {
    const naira = kobo / 100;
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(naira);
  };

  const activeRate = earnings.merchantCount > 0
    ? Math.round((earnings.activeCount / earnings.merchantCount) * 100)
    : 0;

  return (
    <div className="space-y-3 mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Available Payout */}
        <div className="bg-white p-4 rounded-xl border border-rule shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span>Available Payout</span>
            <span className="w-2 h-2 rounded-full bg-money" />
          </div>
          <div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-money">
              {formatNgn(earnings.availableKobo)}
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Auto-settles every Friday
            </p>
          </div>
        </div>

        {/* Pending Commission */}
        <div className="bg-white p-4 rounded-xl border border-rule shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span>Pending Validation</span>
            <span className="w-2 h-2 rounded-full bg-flag" />
          </div>
          <div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-ink">
              {formatNgn(earnings.pendingKobo)}
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Cleared on payment verification
            </p>
          </div>
        </div>

        {/* Merchant Portfolio Health */}
        <div className="bg-white p-4 rounded-xl border border-rule shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span>Direct Portfolio</span>
            <span className="text-[10px] font-semibold text-money px-1.5 py-0.2 rounded bg-money-light">
              {activeRate}% active
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl sm:text-2xl font-bold text-ink">
                {earnings.merchantCount}
              </span>
              <span className="text-xs text-ink-muted">
                ({earnings.activeCount} active in 3d)
              </span>
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Direct assigned stores
            </p>
          </div>
        </div>

        {/* Commission Terms */}
        <div className="bg-white p-4 rounded-xl border border-rule shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1.5">
            <span>Rev-Share Model</span>
            <span className="font-mono text-xs font-bold text-money">
              {role === "coordinator" ? "30% / 10%" : "20%"}
            </span>
          </div>
          <div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-ink">
              {role === "coordinator" ? "30% Max" : `${commissionRate}%`}
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5">
              {role === "coordinator"
                ? "30% direct • 10% team override"
                : "Recurring monthly on active stores"}
            </p>
          </div>
        </div>
      </div>

      {/* Coordinator Split Breakdown Strip */}
      {role === "coordinator" && (
        <div className="bg-sand-light/60 border border-rule rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-ink flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Regional Split Breakdown:
            </span>
            <span className="text-ink-muted font-mono">
              Direct (30%): <strong className="text-ink">{formatNgn(earnings.personalKobo)}</strong>
            </span>
            <span className="text-rule">•</span>
            <span className="text-ink-muted font-mono">
              Team Override (10%): <strong className="text-money">{formatNgn(earnings.overrideKobo)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 text-ink font-medium font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-white border border-rule">
              {earnings.downlinesCount} Downline BRMs
            </span>
            <span className="px-2 py-0.5 rounded bg-white border border-rule">
              {earnings.teamMerchantCount} Team Stores ({earnings.teamActiveCount} Active)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
