import { formatNaira } from "@/lib/format";

interface LedgerRowProps {
  title: string;
  subtitle: string;
  amount: number;
  direction: "in" | "out";
  isLast?: boolean;
}

export function LedgerRow({ title, subtitle, amount, direction, isLast }: LedgerRowProps) {
  const isIn = direction === "in";

  return (
    <div
      className={`flex items-center justify-between bg-white px-[14px] py-[11px] ${
        isLast ? "" : "border-b border-rule"
      }`}
    >
      <div className="flex flex-col min-w-0 mr-3">
        <span className="text-sm text-ink truncate">{title}</span>
        <span className="text-xs text-ink-muted mt-0.5">{subtitle}</span>
      </div>
      <span
        className={`text-sm font-medium font-mono shrink-0 ${
          isIn ? "text-money" : "text-flag"
        }`}
      >
        {isIn ? "+" : "-"}
        {formatNaira(amount)}
      </span>
    </div>
  );
}
