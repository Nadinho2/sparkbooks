"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BUSINESS_CATEGORIES } from "@/lib/tenant";
import { updateBusinessSettings } from "@/app/dashboard/settings/actions";

interface SettingsViewProps {
  tenant: {
    id: number;
    businessName: string;
    businessType: string;
    whatsappNumber: string;
    planTier: string;
    planStatus: string;
    monthlyMessageCount: number;
    monthlyMessageLimit: number;
  };
  email: string | null;
}

export function SettingsView({ tenant, email }: SettingsViewProps) {
  const [businessName, setBusinessName] = useState(tenant.businessName);
  const [businessType, setBusinessType] = useState(tenant.businessType);
  const [whatsappNumber, setWhatsappNumber] = useState(tenant.whatsappNumber);

  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    startTransition(async () => {
      const res = await updateBusinessSettings({
        businessName,
        businessType,
        whatsappNumber,
      });

      if (res.success) {
        setSuccessMsg("Settings updated successfully.");
      } else {
        setErrorMsg(res.error ?? "Failed to save settings.");
      }
    });
  };

  const businessTypes = Object.keys(BUSINESS_CATEGORIES);
  if (!businessTypes.includes(businessType) && businessType) {
    businessTypes.push(businessType);
  }

  const usagePercent =
    tenant.monthlyMessageLimit === -1
      ? 100
      : Math.min(100, Math.round((tenant.monthlyMessageCount / tenant.monthlyMessageLimit) * 100));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl text-ink">Settings</h1>
        <p className="text-xs text-ink-muted mt-1">
          Manage your store details, WhatsApp connection, and preferences.
        </p>
      </div>

      {successMsg && (
        <div className="bg-money-light border border-money text-money text-xs rounded-xl p-4 font-medium flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="bg-flag-light border border-flag text-flag text-xs rounded-xl p-4 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Store Details Card */}
      <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
        <h2 className="font-display text-base text-ink mb-1">Store Details</h2>
        <p className="text-xs text-ink-muted mb-4">
          This information identifies your business in WhatsApp responses and reports.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Business Name</label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full text-sm sm:text-xs px-3 py-2.5 sm:py-2 border border-rule rounded-lg focus:outline-none focus:border-spark"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Business Category</label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full text-sm sm:text-xs px-3 py-2.5 sm:py-2 border border-rule rounded-lg focus:outline-none focus:border-spark bg-white"
              >
                {businessTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">WhatsApp Phone Number</label>
              <input
                type="tel"
                required
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="+2348012345678"
                className="w-full text-sm sm:text-xs px-3 py-2.5 sm:py-2 border border-rule rounded-lg focus:outline-none focus:border-spark font-mono"
              />
              <p className="text-[11px] text-ink-muted mt-1">
                The primary WhatsApp number used to send bookkeeping entries.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto px-6 py-2.5 sm:py-2 text-xs font-medium text-white bg-spark rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* WhatsApp Connection Guide Card */}
      <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-base text-ink">WhatsApp Bookkeeping Connection</h2>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-money/10 text-money">
            <span className="w-1.5 h-1.5 rounded-full bg-money animate-pulse" />
            Connected
          </span>
        </div>
        <p className="text-xs text-ink-muted mb-4">
          All team members registered in your account send entries to the SparkBooks WhatsApp service.
        </p>

        <div className="bg-paper rounded-lg p-3.5 border border-rule text-xs space-y-2 text-ink">
          <p className="font-medium text-ink">💡 Quick Tips for WhatsApp Logging:</p>
          <ul className="list-disc pl-4 space-y-1 text-ink-muted text-[11px]">
            <li>
              <strong>Sales:</strong> &ldquo;Sold 3 packs rice for ₦4,500&rdquo; or &ldquo;Sell 1 wig 45k&rdquo;
            </li>
            <li>
              <strong>Expenses:</strong> &ldquo;Bought 50L generator fuel ₦35,000&rdquo; or &ldquo;Transport ₦2,000&rdquo;
            </li>
            <li>
              <strong>Voice Notes:</strong> Record a quick WhatsApp voice note in English or Pidgin &mdash; Whisper AI transcribes and parses it automatically!
            </li>
          </ul>
        </div>
      </div>

      {/* Plan & Usage Overview */}
      <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-base text-ink">Subscription Plan</h2>
            <p className="text-xs text-ink-muted">
              Current tier: <strong className="text-ink uppercase">{tenant.planTier}</strong> ({tenant.planStatus})
            </p>
          </div>
          <Link
            href="/dashboard/billing"
            className="text-xs font-medium text-spark hover:underline"
          >
            Manage Billing &rarr;
          </Link>
        </div>

        <div className="space-y-2 mt-4">
          <div className="flex justify-between text-xs text-ink-muted">
            <span>Monthly Entries Used</span>
            <span className="font-mono text-ink font-medium">
              {tenant.monthlyMessageCount} / {tenant.monthlyMessageLimit === -1 ? "Unlimited" : tenant.monthlyMessageLimit}
            </span>
          </div>
          <div className="h-2 w-full bg-paper rounded-full overflow-hidden border border-rule">
            <div
              className={`h-full transition-all ${usagePercent >= 90 ? "bg-flag" : "bg-spark"}`}
              style={{ width: `${tenant.monthlyMessageLimit === -1 ? 15 : usagePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Account & Privacy Card */}
      <div className="bg-white border border-rule rounded-xl p-5 shadow-sm">
        <h2 className="font-display text-base text-ink mb-1">Account & Data</h2>
        <div className="text-xs text-ink-muted space-y-2 mt-2">
          <p>
            Logged in email: <strong className="text-ink">{email ?? "—"}</strong>
          </p>
          <p>
            Tenant Reference ID: <span className="font-mono text-ink">#{tenant.id}</span>
          </p>
          <div className="pt-2 border-t border-rule flex items-center justify-between text-xs">
            <span>Need to delete your data per WhatsApp policy?</span>
            <Link href="/deletion" className="text-flag hover:underline">
              Data Deletion Instructions
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
