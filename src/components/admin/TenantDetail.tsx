"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { formatNaira } from "@/lib/format";
import type { PlanTier } from "@/lib/billing";
import { getPlanLimits } from "@/lib/billing";
import type { TenantDetail } from "@/app/admin/actions";
import {
  suspendTenant,
  adminSetPlanTier,
  adminExtendPeriod,
} from "@/app/admin/actions";

interface Props {
  tenant: TenantDetail;
}

const PLAN_OPTIONS: PlanTier[] = ["free", "starter", "pro"];

export function AdminTenantDetail({ tenant }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function handleSuspend(suspend: boolean) {
    if (
      !confirm(
        suspend
          ? `Suspend ${tenant.businessName}? They will not be able to receive WhatsApp processing.`
          : `Reactivate ${tenant.businessName}?`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await suspendTenant(tenant.id, suspend);
        setMessage({
          type: "success",
          text: suspend ? "Tenant suspended" : "Tenant reactivated",
        });
      } catch (err) {
        setMessage({ type: "error", text: (err as Error).message });
      }
    });
  }

  function handleSetPlan(tier: PlanTier) {
    startTransition(async () => {
      try {
        await adminSetPlanTier(tenant.id, tier);
        setMessage({ type: "success", text: `Plan set to ${getPlanLimits(tier).label}` });
      } catch (err) {
        setMessage({ type: "error", text: (err as Error).message });
      }
    });
  }

  function handleExtend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const date = new Date(form.extendDate.value);
    if (isNaN(date.getTime())) return;
    startTransition(async () => {
      try {
        await adminExtendPeriod(tenant.id, date.toISOString());
        setMessage({
          type: "success",
          text: `Period extended to ${format(date, "MMM d, yyyy")}`,
        });
      } catch (err) {
        setMessage({ type: "error", text: (err as Error).message });
      }
    });
  }

  const planLimits = getPlanLimits(tenant.planTier);

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

      {/* Tenant info card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard label="WhatsApp" value={tenant.whatsappNumber} />
        <InfoCard
          label="Joined"
          value={format(new Date(tenant.createdAt), "MMM d, yyyy")}
        />
        <InfoCard
          label="Current period ends"
          value={
            tenant.currentPeriodEnd
              ? format(new Date(tenant.currentPeriodEnd), "MMM d, yyyy")
              : "N/A"
          }
        />
        <InfoCard
          label="Plan"
          value={
            <span className="flex items-center gap-2">
              <span className="font-medium">{planLimits.label}</span>
              {tenant.isComped && (
                <span className="text-[10px] bg-money-light text-money px-1.5 py-0.5 rounded font-medium">
                  Comped
                </span>
              )}
              {tenant.isSuspended && (
                <span className="text-[10px] bg-flag-light text-flag px-1.5 py-0.5 rounded font-medium">
                  Suspended
                </span>
              )}
            </span>
          }
        />
        <InfoCard
          label="Monthly usage"
          value={`${tenant.monthlyMessageCount} / ${
            tenant.monthlyMessageLimit > 0
              ? tenant.monthlyMessageLimit
              : "∞"
          }`}
        />
        <InfoCard
          label="Products"
          value={String(tenant.products.length)}
        />
        <InfoCard
          label="Physical Location"
          value={
            tenant.shopAddress ? (
              <span className="text-xs">
                📍 {tenant.shopAddress}
                {tenant.landmark ? ` (${tenant.landmark})` : ""}
                {tenant.cityLga ? `, ${tenant.cityLga}` : ""}
                {tenant.state ? `, ${tenant.state}` : ""}
              </span>
            ) : (
              <span className="text-xs text-ink-muted italic">No address on file</span>
            )
          }
        />
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl border border-rule p-5">
        <h3 className="font-display text-sm text-ink mb-4">Admin actions</h3>

        {/* Plan change */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-xs text-ink-muted w-20 shrink-0">
            Change plan:
          </span>
          {PLAN_OPTIONS.map((tier) => (
            <button
              key={tier}
              onClick={() => handleSetPlan(tier)}
              disabled={isPending || tenant.planTier === tier}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                tenant.planTier === tier
                  ? "bg-ink text-white border-ink"
                  : "border-rule text-ink-muted hover:border-ink hover:text-ink"
              }`}
            >
              {getPlanLimits(tier).label}
            </button>
          ))}
        </div>

        {/* Extend period */}
        <form onSubmit={handleExtend} className="flex items-center gap-3 mb-4">
          <span className="text-xs text-ink-muted w-20 shrink-0">
            Extend period:
          </span>
          <input
            type="date"
            name="extendDate"
            required
            defaultValue={
              tenant.currentPeriodEnd
                ? new Date(tenant.currentPeriodEnd)
                    .toISOString()
                    .split("T")[0]
                : ""
            }
            className="border border-rule rounded-lg px-3 py-1.5 text-xs text-ink outline-none focus:border-spark"
          />
          <button
            type="submit"
            disabled={isPending}
            className="text-xs font-medium bg-ink text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "..." : "Extend"}
          </button>
        </form>

        {/* Suspend / Reactivate */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted w-20 shrink-0">
            Access:
          </span>
          {tenant.isSuspended ? (
            <button
              onClick={() => handleSuspend(false)}
              disabled={isPending}
              className="text-xs font-medium bg-money text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              Reactivate
            </button>
          ) : (
            <button
              onClick={() => handleSuspend(true)}
              disabled={isPending}
              className="text-xs font-medium bg-flag text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              Suspend
            </button>
          )}
        </div>
      </div>

      {/* Products */}
      <div className="bg-white rounded-xl border border-rule p-5">
        <h3 className="font-display text-sm text-ink mb-3">
          Products ({tenant.products.length})
        </h3>
        {tenant.products.length === 0 ? (
          <p className="text-xs text-ink-muted">No products</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tenant.products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border border-rule/50 rounded-lg px-3 py-2"
              >
                <span className="text-sm text-ink">{p.name}</span>
                <span className="text-xs text-ink-muted font-mono">
                  {p.quantity} {p.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent messages */}
      <div className="bg-white rounded-xl border border-rule p-5">
        <h3 className="font-display text-sm text-ink mb-3">
          Recent messages ({tenant.messages.length})
        </h3>
        {tenant.messages.length === 0 ? (
          <p className="text-xs text-ink-muted">No messages</p>
        ) : (
          <div className="space-y-2">
            {tenant.messages.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-3 border-b border-rule/30 pb-2 last:border-0 last:pb-0"
              >
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                    m.direction === "inbound"
                      ? "bg-spark/10 text-spark"
                      : "bg-rule text-ink-muted"
                  }`}
                >
                  {m.direction}
                </span>
                <span className="text-xs text-ink-muted shrink-0 w-8">
                  {m.type}
                </span>
                <span className="text-sm text-ink flex-1 line-clamp-1">
                  {m.rawText ?? "(no text)"}
                </span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                    m.status === "matched"
                      ? "bg-money-light text-money"
                      : m.status === "failed"
                        ? "bg-flag-light text-flag"
                        : "bg-rule text-ink-muted"
                  }`}
                >
                  {m.status}
                </span>
                <span className="text-[10px] text-ink-muted shrink-0">
                  {format(new Date(m.createdAt), "MMM d HH:mm")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ledger entries */}
      <div className="bg-white rounded-xl border border-rule p-5">
        <h3 className="font-display text-sm text-ink mb-3">
          Recent ledger entries ({tenant.ledgerEntries.length})
        </h3>
        {tenant.ledgerEntries.length === 0 ? (
          <p className="text-xs text-ink-muted">No entries</p>
        ) : (
          <div className="space-y-1">
            {tenant.ledgerEntries.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      l.type === "sale"
                        ? "bg-money-light text-money"
                        : "bg-flag-light text-flag"
                    }`}
                  >
                    {l.type}
                  </span>
                  <span className="text-ink">{l.description}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-ink font-mono font-medium">
                    {formatNaira(l.amount)}
                  </span>
                  <span className="text-[10px] text-ink-muted">
                    {format(new Date(l.createdAt), "MMM d")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-rule rounded-xl px-4 py-3">
      <span className="text-[10px] text-ink-muted uppercase tracking-wider">
        {label}
      </span>
      <div className="text-sm text-ink mt-0.5 font-medium break-all">
        {value}
      </div>
    </div>
  );
}
