import { fetchAdminBilling } from "@/app/admin/actions";
import { AdminBillingView } from "@/components/admin/BillingView";
import { BackButton } from "@/components/ui/BackButton";

export const metadata = {
  title: "Billing – Admin – SparkBooks",
};

export default async function AdminBillingPage() {
  const rows = await fetchAdminBilling();

  return (
    <div>
      <BackButton label="Tenants" className="mb-3" />
      <div className="mb-5">
        <h1 className="font-display text-xl text-ink">
          Billing
        </h1>
        <p className="text-xs text-ink-muted mt-0.5">
          Subscription status, payment history, comp overrides
        </p>
      </div>

      <AdminBillingView rows={rows} />
    </div>
  );
}
