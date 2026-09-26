"use client";

import { useState, useCallback, useEffect } from "react";
import { BusinessTypeStep } from "@/components/onboarding/BusinessTypeStep";
import { ProductsStep } from "@/components/onboarding/ProductsStep";
import { CompletionStep } from "@/components/onboarding/CompletionStep";
import { getExistingTenant, updateTenant } from "./actions";

type Step = "business" | "products" | "complete";
type Mode = "setup" | "edit";

interface Category {
  id: number;
  name: string;
}

export default function OnboardingPage() {
  const [mode, setMode] = useState<Mode>("setup");
  const [step, setStep] = useState<Step>("business");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [tenantId, setTenantId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tenantInfo, setTenantInfo] = useState<{
    businessName: string;
    businessType: string;
    whatsappNumber: string;
  } | null>(null);
  const [productCount, setProductCount] = useState(0);

  // Check for existing tenant on mount
  useEffect(() => {
    getExistingTenant().then((existing) => {
      if (existing) {
        setMode("edit");
        setTenantId(existing.id);
        setTenantInfo({
          businessName: existing.business_name,
          businessType: existing.business_type,
          whatsappNumber: existing.whatsapp_number,
        });
      }
    });
  }, []);

  /* ── Setup: create tenant (new users) ── */
  const handleSetupTenant = useCallback(
    async (data: {
      businessType: string;
      businessName: string;
      whatsappNumber: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/onboarding/setup-tenant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const { error: msg } = await res.json();
          throw new Error(msg ?? "Failed to set up tenant");
        }
        const result = await res.json();
        setTenantId(result.id);
        setCategories(result.categories);
        setTenantInfo({
          businessName: result.businessName,
          businessType: result.businessType,
          whatsappNumber: result.whatsappNumber,
        });
        setStep("products");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /* ── Edit: update existing tenant ── */
  const handleUpdateTenant = useCallback(
    async (data: {
      businessType: string;
      businessName: string;
      whatsappNumber: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        await updateTenant(data);
        setSuccessMsg("Business details updated.");
        setTenantInfo(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleBusinessType = useCallback(
    (data: {
      businessType: string;
      businessName: string;
      whatsappNumber: string;
    }) => {
      if (mode === "edit") {
        handleUpdateTenant(data);
      } else {
        handleSetupTenant(data);
      }
    },
    [mode, handleSetupTenant, handleUpdateTenant],
  );

  const handleProductsReady = useCallback(async (addedCount: number) => {
    setProductCount(addedCount);
    setStep("complete");
  }, []);

  const handleSkipProducts = useCallback(() => {
    setProductCount(0);
    setStep("complete");
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Step indicator (setup only) */}
      {mode === "setup" && (
        <div className="flex items-center gap-2 text-xs text-ink-muted mb-1">
          <span
            className={step === "business" ? "text-ink font-medium" : ""}
          >
            Store details
          </span>
          <span>/</span>
          <span
            className={
              step === "products"
                ? "text-ink font-medium"
                : step === "complete"
                  ? "text-ink"
                  : ""
            }
          >
            Products
          </span>
          <span>/</span>
          <span
            className={step === "complete" ? "text-ink font-medium" : ""}
          >
            Done
          </span>
        </div>
      )}

      {mode === "edit" && (
        <p className="text-xs text-ink-muted mb-1">
          Edit your store details below.
        </p>
      )}

      {error && (
        <div className="bg-flag-light border border-flag rounded-lg px-4 py-3 text-sm text-flag">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="bg-money-light border border-money rounded-lg px-4 py-3 text-sm text-money font-medium">
          {successMsg}
        </div>
      )}

      {step === "business" && (
        <BusinessTypeStep
          onNext={handleBusinessType}
          loading={loading}
          initialValues={
            mode === "edit" && tenantInfo
              ? {
                  businessType: tenantInfo.businessType,
                  businessName: tenantInfo.businessName,
                  whatsappNumber: tenantInfo.whatsappNumber,
                }
              : undefined
          }
        />
      )}

      {step === "products" && tenantId && (
        <>
          <ProductsStep
            tenantId={tenantId}
            categories={categories}
            onComplete={handleProductsReady}
            loading={loading}
          />
          <button
            onClick={handleSkipProducts}
            className="text-center text-sm text-ink-muted hover:text-ink transition-colors"
          >
            Skip for now — I&apos;ll add products later
          </button>
        </>
      )}

      {step === "complete" && tenantInfo && (
        <CompletionStep
          whatsappNumber={tenantInfo.whatsappNumber}
          businessName={tenantInfo.businessName}
          productCount={productCount}
        />
      )}
    </div>
  );
}
