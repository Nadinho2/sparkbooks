import { requireAdmin } from "@/lib/admin-auth";
import { fetchAdminPartners } from "@/app/admin/actions";
import { PartnersView } from "@/components/admin/PartnersView";

export const dynamic = "force-dynamic";

export default async function AdminPartnersPage() {
  await requireAdmin();
  const partners = await fetchAdminPartners();

  return <PartnersView partners={partners} />;
}
