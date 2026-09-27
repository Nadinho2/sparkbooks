"use client";

import { useState } from "react";
import { recruitDownlineBrmAction } from "@/app/partner/actions";

interface RecruitBrmModalProps {
  isOpen: boolean;
  onClose: () => void;
  coordinatorRegion: string | null;
}

export function RecruitBrmModal({
  isOpen,
  onClose,
  coordinatorRegion,
}: RecruitBrmModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [region, setRegion] = useState(coordinatorRegion || "");
  const [partnerCode, setPartnerCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await recruitDownlineBrmAction({
        fullName,
        email,
        phoneNumber,
        region: region.trim() || undefined,
        partnerCode: partnerCode.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || "Failed to recruit field agent.");
        setLoading(false);
        return;
      }

      setSuccessCode(res.partnerCode || "PROVISIONED");
      setLoading(false);
    } catch (err) {
      setError((err as Error).message || "An unexpected error occurred.");
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setFullName("");
    setEmail("");
    setPhoneNumber("");
    setPartnerCode("");
    setError(null);
    setSuccessCode(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-rule shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={handleResetAndClose}
          className="absolute top-4 right-4 text-ink-muted hover:text-ink p-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {successCode ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-money-light text-money rounded-full flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="text-xl font-display font-bold text-ink mb-1">
              Field Agent Authorized!
            </h2>
            <p className="text-xs text-ink-muted mb-4 max-w-xs mx-auto">
              <strong>{fullName}</strong> has been recruited into your regional agency network with partner code:
            </p>
            <div className="inline-block bg-paper border border-rule font-mono font-bold text-base px-4 py-2 rounded-lg text-ink mb-4">
              {successCode}
            </div>
            <p className="text-[11px] text-ink-muted mb-6">
              A welcome message has been dispatched to their WhatsApp with their commission terms (20% rev-share) and login instructions.
            </p>
            <button
              onClick={handleResetAndClose}
              className="w-full py-2.5 px-4 rounded-lg bg-money text-white text-xs font-semibold hover:bg-money/90 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-money-light text-money mb-2">
                <span>TEAM OVERRIDE</span>
                <span>•</span>
                <span>10% RECURRING</span>
              </div>
              <h2 className="text-xl font-display font-bold text-ink">
                Recruit Field Agent (BRM)
              </h2>
              <p className="text-xs text-ink-muted mt-1">
                Add a field representative under your regional leadership. They earn <strong>20%</strong> on stores they onboard, and you earn a <strong>10%</strong> team override.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-ink mb-1">
                  Full Name <span className="text-flag">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ibrahim Adeyemi"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-rule bg-sand-light/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-money"
                />
              </div>

              <div>
                <label className="block font-medium text-ink mb-1">
                  WhatsApp Phone Number <span className="text-flag">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 08012345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-rule bg-sand-light/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-money"
                />
              </div>

              <div>
                <label className="block font-medium text-ink mb-1">
                  Email Address <span className="text-flag">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="ibrahim@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-rule bg-sand-light/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-money"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-ink mb-1">
                    Territory / Region
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ikeja, Lagos"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-rule bg-sand-light/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-money"
                  />
                </div>

                <div>
                  <label className="block font-medium text-ink mb-1">
                    Partner Code <span className="text-ink-muted text-[10px]">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated"
                    value={partnerCode}
                    onChange={(e) => setPartnerCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-rule bg-sand-light/30 focus:bg-white focus:outline-none focus:ring-1 focus:ring-money font-mono uppercase"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-sand-light/50 border border-rule text-[11px] text-ink-muted space-y-1">
                <div className="flex justify-between">
                  <span>Downline Agent Rev-Share:</span>
                  <strong className="text-ink font-mono">20%</strong>
                </div>
                <div className="flex justify-between">
                  <span>Your Regional Override:</span>
                  <strong className="text-money font-mono">10%</strong>
                </div>
                <div className="flex justify-between border-t border-rule pt-1 font-semibold text-ink">
                  <span>Total System Cap:</span>
                  <span className="font-mono">30%</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-3.5 py-2 rounded-lg border border-rule text-ink hover:bg-paper font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-money text-white font-semibold shadow-xs hover:bg-money/90 active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? "Authorizing..." : "Authorize Field Agent"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
