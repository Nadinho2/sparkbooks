import { getWhatsAppBotUrl, SPARKBOOKS_BOT_PHONE } from "@/lib/whatsapp";

interface CompletionStepProps {
  whatsappNumber: string;
  businessName?: string;
  productCount: number;
}

export function CompletionStep({
  whatsappNumber,
  businessName,
  productCount,
}: CompletionStepProps) {
  const brand = businessName?.trim() || "my store";
  const prefilledMessage = `Hi SparkBooks! 👋 I'm ready to start bookkeeping for ${brand}.`;
  const whatsappUrl = getWhatsAppBotUrl(businessName);

  return (
    <div className="bg-white rounded-2xl p-6 sm:p-8 text-center border border-rule shadow-sm max-w-lg mx-auto">
      {/* Success Icon */}
      <div className="w-16 h-16 bg-money-light rounded-full flex items-center justify-center mx-auto mb-4 text-money">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>

      <h1 className="font-display text-2xl sm:text-3xl text-ink font-semibold mb-2">
        {businessName ? `${businessName} is all set!` : "You're all set up!"}
      </h1>

      <p className="text-ink-muted text-sm mb-6 max-w-sm mx-auto">
        Your business profile is created. Connect to the SparkBooks WhatsApp bot to start recording
        sales, expenses, and checking inventory instantly.
      </p>

      {/* WhatsApp Action Card */}
      <div className="bg-sand/30 border border-rule rounded-xl p-4 sm:p-5 text-left mb-6 space-y-3">
        <div className="flex items-center justify-between text-xs text-ink-muted border-b border-rule/60 pb-2.5">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <span className="w-2 h-2 rounded-full bg-money animate-pulse" />
            Official SparkBooks AI Bot
          </span>
          <span className="font-mono text-ink-muted">+{SPARKBOOKS_BOT_PHONE}</span>
        </div>

        <div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-muted block mb-1">
            Prefilled Launch Message
          </span>
          <div className="bg-white border border-rule rounded-lg p-3 text-xs sm:text-sm text-ink font-mono relative">
            <span className="text-money font-semibold mr-1.5">💬</span>
            &ldquo;{prefilledMessage}&rdquo;
          </div>
        </div>

        <p className="text-[11px] text-ink-muted leading-relaxed">
          Tapping the button below opens WhatsApp with this message ready. Just hit <strong>Send</strong> to activate your 24/7 AI bookkeeping assistant!
        </p>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba59] text-white py-3 px-4 rounded-xl text-sm font-semibold shadow-sm transition-all hover:shadow hover:-translate-y-0.5"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
          </svg>
          Open SparkBooks WhatsApp Bot
        </a>
      </div>

      {/* Info & Secondary Action */}
      <div className="space-y-3">
        {productCount > 0 && (
          <p className="text-xs text-ink-muted">
            📦 <strong>{productCount} product{productCount !== 1 ? "s" : ""}</strong> pre-loaded into your catalog.
          </p>
        )}

        <button
          onClick={() => (window.location.href = "/dashboard")}
          className="text-xs text-ink-muted hover:text-ink font-medium underline transition-colors"
        >
          Skip to Web Dashboard instead →
        </button>
      </div>
    </div>
  );
}

