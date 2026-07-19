type MetricTone = "neutral" | "money" | "flag";

interface MetricCardProps {
  label: string;
  value: string;
  tone: MetricTone;
}

const toneClasses: Record<MetricTone, string> = {
  neutral: "text-ink",
  money: "text-money",
  flag: "text-flag",
};

export function MetricCard({ label, value, tone }: MetricCardProps) {
  return (
    <div className="bg-white rounded-[10px] px-3 py-2.5">
      <p className="text-[11px] leading-tight text-ink-muted">{label}</p>
      <p className={`text-base font-medium font-mono ${toneClasses[tone]}`}>
        {value}
      </p>
    </div>
  );
}
