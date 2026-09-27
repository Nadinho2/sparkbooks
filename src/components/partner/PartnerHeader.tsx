"use client";

import { useState } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/ui/SignOutButton";

interface PartnerHeaderProps {
  partnerName: string;
  partnerCode: string;
  bankName: string | null;
  accountNumber: string | null;
  role?: "field_agent" | "coordinator";
  region?: string | null;
  onOpenOnboardModal: () => void;
  onOpenBankModal: () => void;
  onOpenRecruitModal?: () => void;
}

export function PartnerHeader({
  partnerName,
  partnerCode,
  bankName,
  accountNumber,
  role = "field_agent",
  region,
  onOpenOnboardModal,
  onOpenBankModal,
  onOpenRecruitModal,
}: PartnerHeaderProps) {
  const [copied, setCopied] = useState(false);

  const botNumber = process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER || "2349000000000";
  const handshakeUrl = `https://wa.me/${botNumber.replace(/\D/g, "")}?text=Hi+SparkBooks+Set+up+my+store+with+Partner+${partnerCode}`;

  const copyHandshakeLink = () => {
    navigator.clipboard.writeText(handshakeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="bg-white border-b border-rule sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Partner Badge */}
        <div className="flex items-center gap-3">
          <Link href="/partner" className="flex items-center gap-1.5 font-display text-lg tracking-tight text-ink font-bold">
            SparkBooks
            {role === "coordinator" ? (
              <span className="text-amber-800 text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300">
                COORDINATOR
              </span>
            ) : (
              <span className="text-money text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-money-light border border-money/20">
                FIELD BRM
              </span>
            )}
          </Link>

          {region && (
            <span className="hidden md:inline-flex items-center text-xs font-medium text-ink-muted bg-sand-light px-2 py-0.5 rounded border border-rule">
              {region}
            </span>
          )}

          <span className="hidden sm:inline-block w-px h-5 bg-rule" />

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="hidden lg:inline font-semibold text-ink">{partnerName}</span>
            <span className="hidden lg:inline text-rule">•</span>
            <span>Code:</span>
            <code className="font-mono bg-paper px-1.5 py-0.5 rounded text-ink font-semibold border border-rule">
              {partnerCode}
            </code>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Share Handshake Link */}
          <button
            onClick={copyHandshakeLink}
            title="Copy pre-filled WhatsApp setup link"
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rule bg-sand-light text-ink hover:bg-paper transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {copied ? "Link Copied!" : "Copy WhatsApp Link"}
          </button>

          {/* Settlement Bank Info */}
          <button
            onClick={onOpenBankModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rule bg-white text-ink-muted hover:text-ink hover:bg-paper transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <span className="max-w-[100px] sm:max-w-none truncate">
              {bankName && accountNumber ? `${bankName} (••${accountNumber.slice(-4)})` : "Add Settlement Bank"}
            </span>
          </button>

          {/* Recruit Downline Field BRM (Coordinators Only) */}
          {role === "coordinator" && onOpenRecruitModal && (
            <button
              onClick={onOpenRecruitModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rule bg-white text-ink hover:bg-paper shadow-2xs active:scale-95 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Recruit BRM</span>
            </button>
          )}

          {/* Quick Onboard Shop Button */}
          <button
            onClick={onOpenOnboardModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-money text-white shadow-sm hover:bg-money/90 active:scale-95 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Onboard Shop</span>
          </button>

          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
