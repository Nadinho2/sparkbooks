import { fetchUsageSummary, fetchUsageRows } from "@/app/admin/actions";
import { AdminUsageView } from "@/components/admin/UsageView";
import { BackButton } from "@/components/ui/BackButton";

export const metadata = {
  title: "Usage – Admin – SparkBooks",
};

export default async function AdminUsagePage() {
  const summary = await fetchUsageSummary();
  const rows = await fetchUsageRows();

  return (
    <div>
      <BackButton label="Tenants" className="mb-3" />
      <div className="mb-5">
        <h1 className="font-display text-xl text-ink">
          Usage &amp; Cost Monitoring
        </h1>
        <p className="text-xs text-ink-muted mt-0.5">
          Aggregated API cost vs revenue
        </p>
      </div>

      <AdminUsageView summary={summary} rows={rows} />
    </div>
  );
}
