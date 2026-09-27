"use client";

import { useState } from "react";
import { updateBankDetailsAction } from "@/app/partner/actions";

interface BankDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBankName: string | null;
  currentAccountNumber: string | null;
  currentAccountName: string | null;
}

export function BankDetailsModal({
  isOpen,
  onClose,
  currentBankName,
  currentAccountNumber,
  currentAccountName,
}: BankDetailsModalProps) {
  const [bankName, setBankName] = useState(currentBankName || "");
  const [accountNumber, setAccountNumber] = useState(currentAccountNumber || "");
  const [accountName, setAccountName] = useState(currentAccountName || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await updateBankDetailsAction({
        bankName,
        accountNumber,
        accountName,
      });

      if (!res.success) {
        setError(res.error || "Failed to update bank details.");
        setLoading(false);
        return;
      }

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1500);
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
          <h2 className="text-xl font-display font-bold text-ink">
            Settlement Bank Account
          </h2>
          <p className="text-xs text-ink-muted mt-1">
            Weekly commission payouts settle automatically to this account every Friday.
          </p>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        {saved ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-money-light text-money flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="font-bold text-ink text-base">Bank Details Saved!</h3>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Bank Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Access Bank, GTBank, OPay, Moniepoint"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Account Number (10 digits)
              </label>
              <input
                type="text"
                required
                maxLength={10}
                placeholder="0123456789"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Account Holder Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Tunde Balogun"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-rule bg-sand-light focus:bg-white focus:outline-none focus:border-money transition-colors"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-money rounded-lg hover:bg-money/90 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save Bank Details"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
