import { getCurrentTenant } from "@/lib/tenant-server";
import { fetchDashboardOverview } from "./actions";
import { OverviewClient } from "@/components/dashboard/OverviewClient";

export const metadata = {
  title: "Overview & Ledger – SparkBooks",
  description: "View financial ledger, sales, expenses, and net profit for your business.",
};

export default async function DashboardPage() {
  const tenant = await getCurrentTenant();
  const { entries, products } = await fetchDashboardOverview();

  return (
    <OverviewClient
      businessName={tenant.businessName}
      planTier={tenant.planTier}
      monthlyMessageCount={tenant.monthlyMessageCount}
      monthlyMessageLimit={tenant.monthlyMessageLimit}
      initialEntries={entries}
      products={products}
    />
  );
}
