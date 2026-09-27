import { formatNaira } from "@/lib/format";

interface LedgerRowProps {
  title: string;
  subtitle: string;
  amount: number;
  direction: "in" | "out";
  paymentMethod?: string | null;
  receiptId?: number;
  source?: "whatsapp_voice" | "whatsapp_text" | "dashboard_manual";
  isLast?: boolean;
  onDelete?: () => void;
}

export function LedgerRow({
  title,
  subtitle,
  amount,
  direction,
  paymentMethod,
  receiptId,
  source,
  isLast,
  onDelete,
}: LedgerRowProps) {
  const isIn = direction === "in";
  const method = paymentMethod?.toLowerCase();

  return (
    <div
      className={`flex items-center justify-between bg-white px-4 py-3 hover:bg-paper/30 transition-colors ${
        isLast ? "" : "border-b border-rule"
      }`}
    >
      <div className="flex flex-col min-w-0 mr-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-ink truncate">{title}</span>
          {method && method !== "other" && (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                method === "cash"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : method === "pos"
                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}
            >
              {method}
            </span>
          )}
          {receiptId && isIn && (
            <a
              href={`/receipt/${receiptId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sand hover:bg-sand-light text-ink-muted hover:text-ink transition-colors border border-rule/60"
              title="View & share digital receipt"
            >
              <span>Receipt</span>
              <span>↗</span>
            </a>
          )}
          {source === "whatsapp_voice" && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-spark/10 text-spark">
              Voice
            </span>
          )}
          {source === "whatsapp_text" && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#25D366]/10 text-[#128C7E]">
              WhatsApp
            </span>
          )}
          {source === "dashboard_manual" && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rule text-ink-muted">
              Manual
            </span>
          )}
        </div>
        <span className="text-xs text-ink-muted mt-0.5">{subtitle}</span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span
          className={`text-sm font-semibold font-mono ${
            isIn ? "text-money" : "text-flag"
          }`}
        >
          {isIn ? "+" : "-"}
          {formatNaira(amount)}
        </span>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Delete entry"
            className="text-ink-muted/50 hover:text-flag transition-colors p-1 rounded hover:bg-rule/30 text-xs"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
