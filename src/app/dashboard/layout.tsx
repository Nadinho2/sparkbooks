import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getCurrentTenant } from "@/lib/tenant-server";
import { SignOutButton } from "@/components/ui/SignOutButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getCurrentTenant();

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

  const links = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/products", label: "Products" },
    { href: "/dashboard/messages", label: "Messages" },
    { href: "/dashboard/team", label: "Team" },
    { href: "/dashboard/billing", label: "Billing" },
    { href: "/dashboard/settings", label: "Settings" },
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
              {email && (
                <>
                  <span className="text-rule shrink-0 hidden sm:inline">|</span>
                  <span className="truncate hidden sm:inline">{email}</span>
                </>
              )}
            </div>
          </div>
          <SignOutButton />
        </div>

        {/* Nav links — scrollable on mobile */}
        <nav className="flex items-center border-t border-rule/50 bg-white/80">
          <div className="max-w-5xl lg:max-w-6xl mx-auto w-full px-4 sm:px-6 flex gap-1 sm:gap-1.5 overflow-x-auto scrollbar-hide py-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-ink-muted hover:text-ink hover:bg-paper/60 transition-colors rounded-md"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className="flex-1 max-w-5xl lg:max-w-6xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-8">
        {children}
      </main>
    </div>
  );
}
