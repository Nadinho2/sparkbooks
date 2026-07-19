interface CompletionStepProps {
  whatsappNumber: string;
  productCount: number;
}

export function CompletionStep({ whatsappNumber, productCount }: CompletionStepProps) {
  return (
    <div className="bg-white rounded-xl p-8 text-center">
      <div className="mb-4 text-spark">
        <svg
          className="mx-auto"
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="24" cy="24" r="20" />
          <path d="M16 24l5 5 11-11" />
        </svg>
      </div>

      <h1 className="font-display text-2xl text-ink mb-2">
        You&apos;re set up!
      </h1>
      <p className="text-ink-muted text-sm mb-6 max-w-xs mx-auto">
        Start logging sales and stock via WhatsApp at{" "}
        <span className="font-medium text-ink">{whatsappNumber}</span>.
        {productCount > 0 && (
          <span className="block mt-1">
            {productCount} product{productCount !== 1 ? "s" : ""} added.
          </span>
        )}
      </p>

      <button
        onClick={() => (window.location.href = "/dashboard")}
        className="bg-ink text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Go to Dashboard
      </button>
    </div>
  );
}
