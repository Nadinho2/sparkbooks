"use client";

import { useState, useRef } from "react";
import { BUSINESS_CATEGORIES } from "@/lib/tenant";
import { uploadOnboardingLogo } from "@/app/(marketing)/onboarding/actions";

const BUSINESS_TYPES = Object.keys(BUSINESS_CATEGORIES);

const COLOR_PRESETS = [
  { name: "Spark Emerald", hex: "#10B981" },
  { name: "Royal Blue", hex: "#2563EB" },
  { name: "Luxury Gold", hex: "#D97706" },
  { name: "Royal Purple", hex: "#7C3AED" },
  { name: "Crimson Red", hex: "#DC2626" },
  { name: "Slate Obsidian", hex: "#0F172A" },
  { name: "Velvet Rose", hex: "#E11D48" },
  { name: "Warm Amber", hex: "#F59E0B" },
];

interface InitialValues {
  businessType: string;
  businessName: string;
  whatsappNumber: string;
  brandColor?: string;
  brandLogoUrl?: string | null;
}

interface BusinessTypeStepProps {
  onNext: (data: {
    businessType: string;
    businessName: string;
    whatsappNumber: string;
    brandColor?: string;
    brandLogoUrl?: string | null;
  }) => void;
  loading: boolean;
  initialValues?: InitialValues;
}

export function BusinessTypeStep({
  onNext,
  loading,
  initialValues,
}: BusinessTypeStepProps) {
  const [businessName, setBusinessName] = useState(initialValues?.businessName ?? "");
  const [selectedColor, setSelectedColor] = useState(initialValues?.brandColor || "#10B981");
  const [logoUrl, setLogoUrl] = useState<string | null>(initialValues?.brandLogoUrl ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showBrandSection, setShowBrandSection] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!initialValues;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await uploadOnboardingLogo(formData);
      if (!res.success || !res.url) {
        setUploadError(res.error || "Failed to upload logo.");
      } else {
        setLogoUrl(res.url);
      }
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onNext({
      businessType: form.get("businessType") as string,
      businessName: (form.get("businessName") as string) || businessName,
      whatsappNumber: form.get("whatsappNumber") as string,
      brandColor: selectedColor,
      brandLogoUrl: logoUrl,
    });
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
      <h1 className="font-display text-2xl text-ink mb-1">
        {isEdit ? "Edit your store" : "Welcome to SparkBooks"}
      </h1>
      <p className="text-ink-muted text-sm mb-6">
        {isEdit
          ? "Update your business details and branding below."
          : "Set up your store and branded receipts in under 2 minutes."}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Business name */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">Business name</span>
          <input
            name="businessName"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="border border-rule rounded-lg px-3 py-2 text-sm text-ink bg-white outline-none focus:border-spark transition-colors"
            placeholder="e.g. Adeola Fabrics, Chidi Supermarket"
          />
        </label>

        {/* Business type */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">
            What do you sell?
          </span>
          <select
            name="businessType"
            required
            defaultValue={initialValues?.businessType ?? ""}
            className="border border-rule rounded-lg px-3 py-2 text-sm text-ink bg-white outline-none focus:border-spark transition-colors"
          >
            <option value="">Select type…</option>
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
            <option value="Other">Other (no default categories)</option>
          </select>
        </label>

        {/* WhatsApp number */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">
            WhatsApp number for logging entries
          </span>
          <input
            name="whatsappNumber"
            required
            type="tel"
            defaultValue={initialValues?.whatsappNumber ?? ""}
            className="border border-rule rounded-lg px-3 py-2 text-sm text-ink bg-white outline-none focus:border-spark transition-colors"
            placeholder="+234 801 234 5678"
          />
          <span className="text-xs text-ink-muted">
            Sales, expenses, and customer receipts will route through this account.
          </span>
        </label>

        {/* ── Brand Customization & Receipt Styling ── */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-semibold text-ink block">
                Brand & Receipt Customization
              </span>
              <span className="text-xs text-ink-muted">
                Customizes the digital receipt links sent to your WhatsApp customers.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowBrandSection(!showBrandSection)}
              className="text-xs text-spark hover:underline font-medium"
            >
              {showBrandSection ? "Hide" : "Customize"}
            </button>
          </div>

          {showBrandSection && (
            <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col gap-4">
              {/* Brand Logo Upload */}
              <div>
                <span className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Store Logo (Optional)
                </span>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Logo preview"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs"
                        style={{ backgroundColor: selectedColor }}
                      >
                        {businessName ? businessName.charAt(0).toUpperCase() : "S"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                      >
                        {uploadingLogo
                          ? "Uploading…"
                          : logoUrl
                            ? "Change Logo"
                            : "Upload Logo"}
                      </button>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl(null)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      PNG, JPG, or SVG up to 5MB.
                    </span>
                  </div>
                </div>
                {uploadError && (
                  <p className="text-xs text-red-600 mt-1">{uploadError}</p>
                )}
              </div>

              {/* Brand Color Swatches */}
              <div>
                <span className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Brand Theme Color
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {COLOR_PRESETS.map((color) => {
                    const isSelected =
                      selectedColor.toLowerCase() === color.hex.toLowerCase();
                    return (
                      <button
                        key={color.hex}
                        type="button"
                        onClick={() => setSelectedColor(color.hex)}
                        title={color.name}
                        className={`w-7 h-7 rounded-full transition-all flex items-center justify-center ${
                          isSelected
                            ? "ring-2 ring-offset-2 ring-slate-800 scale-110 shadow-sm"
                            : "hover:scale-105 opacity-85 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: color.hex }}
                      >
                        {isSelected && (
                          <svg
                            className="w-3.5 h-3.5 text-white drop-shadow"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-slate-200">
                    <input
                      type="color"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                      title="Custom color"
                    />
                    <span className="text-[11px] font-mono text-slate-500 uppercase">
                      {selectedColor}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Mini Receipt Preview Card */}
              <div className="mt-1 bg-white border border-slate-200 rounded-lg p-3 shadow-xs">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-2">
                  <span className="uppercase tracking-wider">
                    Receipt Live Preview
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                    style={{ backgroundColor: selectedColor }}
                  >
                    Verified Receipt
                  </span>
                </div>
                <div
                  className="h-1 w-full rounded-full mb-2.5"
                  style={{
                    background: `linear-gradient(90deg, ${selectedColor}, #10B981)`,
                  }}
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Store Logo"
                        className="w-7 h-7 object-contain rounded"
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded flex items-center justify-center font-bold text-white text-[11px]"
                        style={{ backgroundColor: selectedColor }}
                      >
                        {businessName ? businessName.charAt(0).toUpperCase() : "S"}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold text-slate-900 leading-tight">
                        {businessName || "Your Business Name"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Paid via WhatsApp • ₦15,000
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-xs font-bold font-mono"
                    style={{ color: selectedColor }}
                  >
                    PAID
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || uploadingLogo}
          className="mt-2 bg-ink text-white rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading
            ? "Saving…"
            : isEdit
              ? "Save changes"
              : "Continue"}
        </button>
      </form>
    </div>
  );
}
