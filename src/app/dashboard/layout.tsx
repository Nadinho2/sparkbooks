import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getCurrentTenant, isTenantOwner } from "@/lib/tenant-server";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { getWhatsAppBotUrl } from "@/lib/whatsapp";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getCurrentTenant();
  const isOwner = await isTenantOwner();

  const { userId } = await auth();
  let email: string | null = null;
  if (userId) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      email = user.emailAddresses[0]?.emailAddress ?? null;
    } catch {
      email = null;
    }
  }

  const isSyntheticEmail = email?.endsWith("@sparkbooks.io");
  const displayContact = !isSyntheticEmail && email
    ? email
    : tenant.whatsappNumber
      ? (tenant.whatsappNumber.startsWith("+") ? tenant.whatsappNumber : `+${tenant.whatsappNumber}`)
      : null;

  const links = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/products", label: "Products" },
    { href: "/dashboard/debts", label: "Debts & Credit" },
    { href: "/dashboard/messages", label: "Messages" },
    ...(isOwner
      ? [
          { href: "/dashboard/team", label: "Team" },
          { href: "/dashboard/billing", label: "Billing" },
          { href: "/dashboard/settings", label: "Settings" },
        ]
      : []),
  ];

  return (
    <div className="min-h-full bg-paper flex flex-col">
      <header className="bg-white border-b border-rule">
        {/* Top bar: logo + business name + email */}
        <div className="max-w-5xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/dashboard" className="font-display text-lg sm:text-xl text-ink shrink-0 hover:opacity-90 transition-opacity">
              SparkBooks
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-ink-muted border-l border-rule pl-2.5 sm:pl-3 min-w-0">
              <span className="truncate max-w-[120px] sm:max-w-[200px] font-medium text-ink-muted">{tenant.businessName}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider ${
                isOwner ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"
              }`}>
                {isOwner ? "Owner" : "Staff"}
              </span>
              {displayContact && (
                <>
                  <span className="text-rule shrink-0 hidden sm:inline">|</span>
                  <span className="truncate hidden sm:inline">{displayContact}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <a
              href={getWhatsAppBotUrl(tenant.businessName)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20 text-xs font-semibold border border-[#25D366]/30 transition-all shadow-xs"
              title="Open SparkBooks WhatsApp Bot"
            >
              <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
              <span className="hidden sm:inline">WhatsApp Bot</span>
              <span className="sm:hidden">Bot</span> ↗
            </a>
            <SignOutButton />
          </div>
        </div>

        {/* Nav links with active route indicator */}
        <DashboardNav links={links} />
      </header>
      <main className="flex-1 max-w-5xl lg:max-w-6xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-8">
        {children}
      </main>
    </div>
  );
}
