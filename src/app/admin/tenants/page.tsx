import { fetchAllTenants } from "@/app/admin/actions";
import { AdminTenantTable } from "@/components/admin/TenantTable";

export const metadata = {
  title: "Tenants – Admin – SparkBooks",
};

export default async function AdminTenantsPage() {
  const tenants = await fetchAllTenants();

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-xl text-ink">Tenants</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            {tenants.length} tenant{tenants.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <AdminTenantTable tenants={tenants} />
    </div>
  );
}
