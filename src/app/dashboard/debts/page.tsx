import { getCurrentTenant } from "@/lib/tenant-server";
import { fetchCustomerDebts } from "./actions";
import { DebtsClient } from "@/components/dashboard/DebtsClient";

export const metadata = {
  title: "Customer Debts & Credit – SparkBooks",
  description: "Track customer balances, credit purchases, and debt repayments.",
};

export default async function DebtsPage() {
  const tenant = await getCurrentTenant();
  const debtsData = await fetchCustomerDebts();

  return (
    <DebtsClient
      initialData={debtsData}
      businessName={tenant.businessName}
    />
  );
}
