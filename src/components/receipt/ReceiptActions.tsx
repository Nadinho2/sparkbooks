"use client";

import { useState } from "react";

interface ReceiptActionsProps {
  receiptNumber: string;
  businessName: string;
  totalFormatted: string;
  receiptUrl: string;
  customerName?: string | null;
}

export function ReceiptActions({
  receiptNumber,
  businessName,
  totalFormatted,
  receiptUrl,
  customerName,
}: ReceiptActionsProps) {
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleCopyLink = async () => {
    if (typeof window !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(receiptUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Fallback
      }
    }
  };

  const greeting = customerName ? `Hello ${customerName}!` : "Hello!";
  const waShareText = encodeURIComponent(
    `${greeting} Here is your official payment receipt #${receiptNumber} (${totalFormatted}) from *${businessName}*:\n\n${receiptUrl}\n\nThank you for your business! 🙏`
  );
  const waShareUrl = `https://wa.me/?text=${waShareText}`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 pt-6 border-t border-dashed border-gray-300 print:hidden">
      <button
        onClick={handlePrint}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-black transition-all shadow-sm active:scale-95"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Print / Save PDF
      </button>

      <a
        href={waShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] text-white text-xs font-semibold hover:bg-[#20ba59] transition-all shadow-sm active:scale-95"
      >
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
        </svg>
        Share on WhatsApp
      </a>

      <button
        onClick={handleCopyLink}
        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-all active:scale-95"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {copied ? "Link Copied! ✓" : "Copy Link"}
      </button>
    </div>
  );
}
