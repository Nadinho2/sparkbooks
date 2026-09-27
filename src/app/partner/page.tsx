import {
  requirePartner,
  getPartnerPortfolio,
  getPartnerEarnings,
  getPartnerCommissionHistory,
  getCoordinatorDownlines,
} from "@/lib/partner-server";
import { PartnerClientView } from "@/components/partner/PartnerClientView";

export const dynamic = "force-dynamic";

export default async function PartnerPage() {
  const partner = await requirePartner();

  const [merchants, earnings, commissions, downlines] = await Promise.all([
    getPartnerPortfolio(partner.id),
    getPartnerEarnings(partner.id),
    getPartnerCommissionHistory(partner.id),
    partner.role === "coordinator" ? getCoordinatorDownlines(partner.id) : Promise.resolve([]),
  ]);

  return (
    <PartnerClientView
      partner={partner}
      merchants={merchants}
      earnings={earnings}
      commissions={commissions}
      downlines={downlines}
    />
  );
}
