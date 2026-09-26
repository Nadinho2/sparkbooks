import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchTenantDetail } from "@/app/admin/actions";
import { AdminTenantDetail } from "@/components/admin/TenantDetail";

export const metadata = {
  title: "Tenant Detail – Admin – SparkBooks",
};

export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await fetchTenantDetail(Number(id));
  if (!tenant) notFound();

  return (
    <div>
      <div className="mb-5">
        <Link
          href="/admin/tenants"
          className="text-xs text-ink-muted hover:text-ink transition-colors"
        >
          &larr; Back to tenants
        </Link>
        <h1 className="font-display text-xl text-ink mt-1">
          {tenant.businessName}
        </h1>
        <p className="text-xs text-ink-muted">{tenant.businessType}</p>
      </div>

      <AdminTenantDetail tenant={tenant} />
    </div>
  );
}
