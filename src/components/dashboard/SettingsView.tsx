"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BUSINESS_CATEGORIES } from "@/lib/tenant";
import { updateBusinessSettings, uploadBrandLogo } from "@/app/dashboard/settings/actions";
import { getWhatsAppBotUrl, SPARKBOOKS_BOT_PHONE } from "@/lib/whatsapp";

interface SettingsViewProps {
  tenant: {
    id: number;
    businessName: string;
    businessType: string;
    whatsappNumber: string;
    brandLogoUrl?: string | null;
    brandColor?: string | null;
    planTier: string;
    planStatus: string;
    monthlyMessageCount: number;
    monthlyMessageLimit: number;
  };
  email: string | null;
}

const BRAND_COLOR_PRESETS = [
  { name: "Emerald Green", hex: "#10B981" },
  { name: "Royal Blue", hex: "#2563EB" },
  { name: "Luxury Gold", hex: "#D97706" },
  { name: "Deep Purple", hex: "#7C3AED" },
  { name: "Crimson Red", hex: "#E11D48" },
  { name: "Midnight Slate", hex: "#0F172A" },
  { name: "Blush Rose", hex: "#DB2777" },
  { name: "Vibrant Amber", hex: "#EA580C" },
];

export function SettingsView({ tenant, email }: SettingsViewProps) {
  const [businessName, setBusinessName] = useState(tenant.businessName);
  const [businessType, setBusinessType] = useState(tenant.businessType);
  const [whatsappNumber, setWhatsappNumber] = useState(tenant.whatsappNumber);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string>(tenant.brandLogoUrl || "");
  const [brandColor, setBrandColor] = useState<string>(tenant.brandColor || "#10B981");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await uploadBrandLogo(fd);
      if (res.success && res.url) {
        setBrandLogoUrl(res.url);
        setSuccessMsg("Brand logo uploaded successfully!");
      } else {
        setErrorMsg(res.error || "Failed to upload logo.");
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    startTransition(async () => {
      const res = await updateBusinessSettings({
        businessName,
        businessType,
        whatsappNumber,
        brandColor,
        brandLogoUrl: brandLogoUrl || null,
      });

      if (res.success) {
        setSuccessMsg("Settings and brand styling saved successfully!");
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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl text-ink font-bold">Store Settings & Branding</h1>
        <p className="text-xs text-ink-muted mt-1">
          Manage your store profile, brand colors, logo, and digital customer receipts.
        </p>
      </div>

      {successMsg && (
        <div className="bg-money-light border border-money text-money text-xs rounded-xl p-4 font-medium flex items-center gap-2 shadow-xs">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="bg-flag-light border border-flag text-flag text-xs rounded-xl p-4 font-medium shadow-xs">
          {errorMsg}
        </div>
      )}

      {/* Main Settings & Branding Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Store Details Card */}
        <div className="bg-white border border-rule rounded-2xl p-5 sm:p-6 shadow-xs">
          <h2 className="font-display text-base font-bold text-ink mb-1">Store Details</h2>
          <p className="text-xs text-ink-muted mb-4">
            Identifies your business in WhatsApp message confirmations, receipts, and closing reports.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Business Name</label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Belle Hairs"
                className="w-full text-sm sm:text-xs px-3.5 py-2.5 border border-rule rounded-xl focus:outline-none focus:border-spark"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Business Category</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full text-sm sm:text-xs px-3.5 py-2.5 border border-rule rounded-xl focus:outline-none focus:border-spark bg-white"
                >
                  {businessTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">WhatsApp Phone Number</label>
                <input
                  type="tel"
                  required
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+2348012345678"
                  className="w-full text-sm sm:text-xs px-3.5 py-2.5 border border-rule rounded-xl focus:outline-none focus:border-spark font-mono"
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  Primary WhatsApp number used to record sales, stock, and receive reports.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Brand & Digital Receipt Customization Card */}
        <div className="bg-white border border-rule rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div>
              <h2 className="font-display text-base font-bold text-ink">Brand & Receipt Customization</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Upload your brand logo and pick an accent color. These apply dynamically to all your digital receipts!
              </p>
            </div>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full text-white self-start sm:self-auto shadow-xs"
              style={{ backgroundColor: brandColor }}
            >
              Custom Receipt Active
            </span>
          </div>

          <div className="grid lg:grid-cols-12 gap-6 mt-6 items-start">
            {/* Left Controls Column (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Brand Logo Upload */}
              <div>
                <label className="block text-xs font-semibold text-ink mb-2">
                  Brand Logo
                </label>
                <div className="flex items-center gap-4">
                  {brandLogoUrl ? (
                    <div className="relative group w-16 h-16 rounded-2xl border-2 border-rule overflow-hidden bg-sand flex items-center justify-center p-1.5 shadow-xs shrink-0">
                      <img
                        src={brandLogoUrl}
                        alt="Brand Logo"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div
                      className="w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center shadow-xs shrink-0"
                      style={{ borderColor: brandColor, backgroundColor: `${brandColor}12` }}
                    >
                      <span className="font-display font-bold text-xl" style={{ color: brandColor }}>
                        {businessName ? businessName.charAt(0).toUpperCase() : "B"}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rule text-xs font-semibold text-ink bg-white hover:bg-paper transition-colors shadow-xs">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span>{isUploadingLogo ? "Uploading..." : brandLogoUrl ? "Change Logo" : "Upload Logo"}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={handleLogoUpload}
                          disabled={isUploadingLogo}
                        />
                      </label>

                      {brandLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setBrandLogoUrl("")}
                          className="text-xs text-flag hover:underline font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-muted">
                      PNG, JPG, or SVG up to 5MB. Renders at the top of digital receipts.
                    </p>
                  </div>
                </div>
              </div>

              {/* Brand Accent Color */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-ink">
                    Brand Accent Color
                  </label>
                  <span className="font-mono text-xs font-bold text-ink bg-sand px-2 py-0.5 rounded-md border border-rule">
                    {brandColor.toUpperCase()}
                  </span>
                </div>

                {/* Swatches */}
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-3">
                  {BRAND_COLOR_PRESETS.map((preset) => {
                    const isSelected = brandColor.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setBrandColor(preset.hex)}
                        title={preset.name}
                        className={`h-9 rounded-xl flex items-center justify-center transition-all ${
                          isSelected
                            ? "ring-2 ring-offset-2 ring-ink scale-105 shadow-sm"
                            : "hover:scale-102 opacity-90 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      >
                        {isSelected && (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Color Input */}
                <div className="flex items-center gap-2.5 pt-1">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-9 h-9 rounded-lg border border-rule cursor-pointer p-0.5 bg-white shadow-2xs"
                  />
                  <span className="text-xs text-ink-muted">
                    Click the color box to choose any custom hex color code.
                  </span>
                </div>
              </div>
            </div>

            {/* Right Live Mini Receipt Preview (5 cols) */}
            <div className="lg:col-span-5 bg-sand-light/60 p-4 rounded-2xl border border-rule">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  Live Receipt Preview
                </span>
                <span className="text-[10px] text-ink-muted font-mono">Updates in real time</span>
              </div>

              {/* Mini Receipt Card */}
              <div className="bg-white rounded-2xl shadow-md border border-rule/80 p-4 relative overflow-hidden text-ink">
                {/* Dynamic Brand Accent Bar */}
                <div
                  className="absolute top-0 left-0 right-0 h-1.5"
                  style={{
                    background: `linear-gradient(90deg, ${brandColor}, ${brandColor}cc, #25D366)`,
                  }}
                />

                {/* Mini Header */}
                <div className="text-center pb-3 border-b border-dashed border-rule">
                  {brandLogoUrl ? (
                    <div className="flex justify-center mb-1.5">
                      <img
                        src={brandLogoUrl}
                        alt={businessName}
                        className="max-h-8 max-w-[100px] object-contain rounded-md"
                      />
                    </div>
                  ) : (
                    <div
                      className="w-7 h-7 mx-auto rounded-lg flex items-center justify-center mb-1 text-xs font-bold"
                      style={{ backgroundColor: `${brandColor}15`, color: brandColor }}
                    >
                      {businessName ? businessName.charAt(0).toUpperCase() : "B"}
                    </div>
                  )}
                  <h4 className="font-display font-bold text-xs text-ink leading-tight">
                    {businessName || "Your Store"}
                  </h4>
                  <span className="text-[9px] text-ink-muted">Receipt #SPK-000013 &bull; Today</span>
                </div>

                {/* Mini Items */}
                <div className="py-2.5 border-b border-rule/50 text-[11px] space-y-1">
                  <div className="flex justify-between text-ink-muted text-[10px]">
                    <span>Item</span>
                    <span>Amount</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="truncate pr-2">3 pcs of 2*6 closure</span>
                    <span className="font-bold">₦90,000</span>
                  </div>
                </div>

                {/* Mini Total */}
                <div className="pt-2 flex justify-between items-baseline text-xs font-bold">
                  <span>Total Billed</span>
                  <span style={{ color: brandColor }}>₦90,000</span>
                </div>

                {/* Mini Verified Seal */}
                <div className="mt-3 pt-2 border-t border-dashed border-rule text-center">
                  <span
                    className="inline-flex items-center gap-1 text-[9px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ backgroundColor: `${brandColor}12`, color: brandColor }}
                  >
                    ✓ Verified &bull; {businessName || "Merchant"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-5 border-t border-rule/60 mt-6">
            <button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto px-7 py-2.5 text-xs font-semibold text-white bg-spark rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-xs"
            >
              {isPending ? "Saving changes..." : "Save Store & Brand Settings"}
            </button>
          </div>
        </div>
      </form>

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

        <div className="bg-sand/30 border border-rule rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-muted block">
              Official WhatsApp Bot Number
            </span>
            <span className="font-mono text-sm font-semibold text-ink">+{SPARKBOOKS_BOT_PHONE}</span>
          </div>
          <a
            href={getWhatsAppBotUrl(tenant.businessName)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
          >
            Open WhatsApp Bot ↗
          </a>
        </div>

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
