import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchAdminPartnerDetail } from "@/app/admin/actions";
import { PartnerDetailView } from "@/components/admin/PartnerDetailView";

export const metadata = {
  title: "Partner Performance – Admin – SparkBooks",
};

export const dynamic = "force-dynamic";

export default async function AdminPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const partnerId = Number(id);

  if (isNaN(partnerId)) {
    notFound();
  }

  const detail = await fetchAdminPartnerDetail(partnerId);
  if (!detail) {
    notFound();
  }

  return <PartnerDetailView data={detail} />;
}
