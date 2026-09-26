"use client";

import { useRef } from "react";
import { BUSINESS_CATEGORIES } from "@/lib/tenant";

const BUSINESS_TYPES = Object.keys(BUSINESS_CATEGORIES);

interface InitialValues {
  businessType: string;
  businessName: string;
  whatsappNumber: string;
}

interface BusinessTypeStepProps {
  onNext: (data: {
    businessType: string;
    businessName: string;
    whatsappNumber: string;
  }) => void;
  loading: boolean;
  initialValues?: InitialValues;
}

export function BusinessTypeStep({
  onNext,
  loading,
  initialValues,
}: BusinessTypeStepProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const isEdit = !!initialValues;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onNext({
      businessType: form.get("businessType") as string,
      businessName: form.get("businessName") as string,
      whatsappNumber: form.get("whatsappNumber") as string,
    });
  }

  return (
    <div className="bg-white rounded-xl p-6">
      <h1 className="font-display text-2xl text-ink mb-1">
        {isEdit ? "Edit your store" : "Welcome to SparkBooks"}
      </h1>
      <p className="text-ink-muted text-sm mb-6">
        {isEdit
          ? "Update your business details below."
          : "Set up your store in under 2 minutes."}
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Business name */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">Business name</span>
          <input
            name="businessName"
            required
            defaultValue={initialValues?.businessName ?? ""}
            className="border border-rule rounded-lg px-3 py-2 text-sm text-ink bg-white outline-none focus:border-spark transition-colors"
            placeholder="Your store name"
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
            Sales and stock updates will be sent to this number.
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
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
