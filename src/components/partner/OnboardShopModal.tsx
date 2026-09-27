"use client";

import { useState } from "react";
import { onboardShopAction } from "@/app/partner/actions";

interface OnboardShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OnboardShopModal({ isOpen, onClose, onSuccess }: OnboardShopModalProps) {
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("Provisions");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await onboardShopAction({
        businessName,
        businessType,
        whatsappNumber,
      });

      if (!res.success) {
        setError(res.error || "Failed to onboard store. Please check the information.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setSuccess(false);
        setBusinessName("");
        setWhatsappNumber("");
        onClose();
      }, 2000);
    } catch (err) {
      setError((err as Error).message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-rule shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors p-1"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="mb-5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-money-light text-money text-xs font-semibold mb-2">
            ⚡ 30-Second Setup
          </div>
          <h2 className="text-xl font-display font-bold text-ink">
            Onboard New Shop
          </h2>
          <p className="text-xs text-ink-muted mt-1">
            Store is immediately linked to your portfolio and sent a welcome WhatsApp message.
          </p>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        {success ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-money-light text-money flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="font-bold text-ink text-base">Shop Activated!</h3>
            <p className="text-xs text-ink-muted mt-1">
              Welcome WhatsApp message sent to merchant. You can test transactions right now!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Shop / Business Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Mama Chichi Supermarket"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Category
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
              >
                <option value="Provisions">Provisions / Foodstuff / Supermarket</option>
                <option value="Hair/Beauty">Hair / Beauty / Cosmetics</option>
                <option value="Fashion">Fashion / Clothing / Boutique</option>
                <option value="Electronics">Electronics / Gadgets / Accessories</option>
                <option value="Other">Other Retail Business</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Merchant WhatsApp Phone Number
              </label>
              <div className="relative">
                <input
                  type="tel"
                  required
                  placeholder="0803 123 4567 or +234..."
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
                />
              </div>
              <p className="text-[11px] text-ink-muted mt-1">
                Enter their active WhatsApp number. They will receive the initial setup prompt immediately.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-money rounded-lg hover:bg-money/90 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Setting up shop & sending WhatsApp...</span>
                  </>
                ) : (
                  <span>Activate & Connect Shop</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
