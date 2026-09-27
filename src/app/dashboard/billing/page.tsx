import { getCurrentTenant, isTenantOwner } from "@/lib/tenant-server";
import { BillingClient } from "@/components/dashboard/BillingClient";
import { BackButton } from "@/components/ui/BackButton";
import { getBillingState, getPaymentHistory } from "./actions";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Billing – SparkBooks",
};

export default async function BillingPage() {
  const isOwner = await isTenantOwner();
  if (!isOwner) {
    redirect("/dashboard");
  }

  const tenant = await getCurrentTenant();
  const billing = await getBillingState(tenant.id);
  const { transactions } = await getPaymentHistory(tenant.id);

  return (
    <div>
      <BackButton label="Products" className="mb-3" />
      <div className="mb-5">
        <h1 className="font-display text-xl text-ink">Billing</h1>
        <p className="text-xs text-ink-muted mt-0.5">
          Manage your plan and payment method
        </p>
      </div>

      <BillingClient
        tenantId={tenant.id}
        initialBilling={billing}
        initialTransactions={transactions}
      />
    </div>
  );
}
