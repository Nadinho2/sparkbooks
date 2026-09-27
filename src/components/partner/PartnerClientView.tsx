"use client";

import { useState } from "react";
import type {
  Partner,
  PartnerMerchantRow,
  PartnerEarnings,
  PartnerCommissionItem,
  CoordinatorDownlineBrm,
} from "@/lib/partner-server";
import { PartnerHeader } from "./PartnerHeader";
import { EarningsCards } from "./EarningsCards";
import { MerchantCRM } from "./MerchantCRM";
import { CommissionLedger } from "./CommissionLedger";
import { OnboardShopModal } from "./OnboardShopModal";
import { BankDetailsModal } from "./BankDetailsModal";
import { CoordinatorTeamView } from "./CoordinatorTeamView";
import { RecruitBrmModal } from "./RecruitBrmModal";

interface PartnerClientViewProps {
  partner: Partner;
  merchants: PartnerMerchantRow[];
  earnings: PartnerEarnings;
  commissions: PartnerCommissionItem[];
  downlines?: CoordinatorDownlineBrm[];
}

export function PartnerClientView({
  partner,
  merchants,
  earnings,
  commissions,
  downlines = [],
}: PartnerClientViewProps) {
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isRecruitModalOpen, setIsRecruitModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"merchants" | "downlines" | "commissions">("merchants");

  const isCoordinator = partner.role === "coordinator";

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <PartnerHeader
        partnerName={partner.fullName}
        partnerCode={partner.partnerCode}
        bankName={partner.bankName}
        accountNumber={partner.accountNumber}
        role={partner.role}
        region={partner.region}
        onOpenOnboardModal={() => setIsOnboardModalOpen(true)}
        onOpenBankModal={() => setIsBankModalOpen(true)}
        onOpenRecruitModal={() => setIsRecruitModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Welcome Banner */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">
                Welcome, {partner.fullName.split(" ")[0]}! 👋
              </h1>
              {isCoordinator && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                  Regional Coordinator
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-ink-muted mt-1">
              {isCoordinator
                ? "Regional Agency Workspace • Lead your field agents, track 10% team overrides, and manage direct shops."
                : "Field Territory Dashboard • Onboard retail stores, track WhatsApp adoption, and earn 20% recurring monthly commission."}
            </p>
          </div>
        </div>

        {/* Financial & Performance Scoreboard */}
        <EarningsCards
          earnings={earnings}
          commissionRate={partner.commissionRate}
          role={partner.role}
        />

        {/* Tab Navigation for Coordinators */}
        {isCoordinator && (
          <div className="flex items-center gap-2 border-b border-rule mb-6 pb-2">
            <button
              onClick={() => setActiveTab("merchants")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === "merchants"
                  ? "bg-money text-white shadow-2xs"
                  : "bg-white text-ink-muted hover:text-ink border border-rule"
              }`}
            >
              Direct Stores ({merchants.length})
            </button>

            <button
              onClick={() => setActiveTab("downlines")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === "downlines"
                  ? "bg-money text-white shadow-2xs"
                  : "bg-white text-ink-muted hover:text-ink border border-rule"
              }`}
            >
              <span>Field Agent Network</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === "downlines" ? "bg-white/20 text-white" : "bg-sand-light text-ink"
              }`}>
                {downlines.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("commissions")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === "commissions"
                  ? "bg-money text-white shadow-2xs"
                  : "bg-white text-ink-muted hover:text-ink border border-rule"
              }`}
            >
              Commission Log ({commissions.length})
            </button>
          </div>
        )}

        {/* Coordinator: Downlines Tab */}
        {isCoordinator && activeTab === "downlines" && (
          <CoordinatorTeamView
            downlines={downlines}
            coordinatorId={partner.id}
            coordinatorName={partner.fullName}
            onOpenRecruitModal={() => setIsRecruitModalOpen(true)}
          />
        )}

        {/* Direct Merchants Portfolio */}
        {(!isCoordinator || activeTab === "merchants") && (
          <MerchantCRM
            merchants={merchants}
            partnerName={partner.fullName}
          />
        )}

        {/* Historical Commission Log */}
        {(!isCoordinator || activeTab === "commissions") && (
          <div className={isCoordinator ? "" : "mt-6"}>
            <CommissionLedger commissions={commissions} />
          </div>
        )}
      </main>

      {/* Onboarding Modal */}
      <OnboardShopModal
        isOpen={isOnboardModalOpen}
        onClose={() => setIsOnboardModalOpen(false)}
      />

      {/* Bank Settlement Modal */}
      <BankDetailsModal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        currentBankName={partner.bankName}
        currentAccountNumber={partner.accountNumber}
        currentAccountName={partner.accountName}
      />

      {/* Recruit Field BRM Modal */}
      <RecruitBrmModal
        isOpen={isRecruitModalOpen}
        onClose={() => setIsRecruitModalOpen(false)}
        coordinatorRegion={partner.region}
      />
    </div>
  );
}
