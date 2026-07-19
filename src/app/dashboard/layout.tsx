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
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    email = user.emailAddresses[0]?.emailAddress ?? null;
  }

  const links = [
    { href: "/dashboard/messages", label: "Messages" },
    { href: "/dashboard/products", label: "Products" },
    { href: "/dashboard/team", label: "Team" },
    { href: "/dashboard/billing", label: "Billing" },
    { href: "/onboarding", label: "Settings" },
  ];

  return (
    <div className="min-h-full bg-paper flex flex-col">
      <header className="bg-white border-b border-rule">
        {/* Top bar: logo + email */}
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/dashboard" className="font-display text-lg text-ink shrink-0">
              SparkBooks
            </Link>
            <div className="hidden sm:flex items-center gap-2 text-xs text-ink-muted border-l border-rule pl-3 min-w-0">
              <span className="truncate">{tenant.businessName}</span>
              {email && (
                <>
                  <span className="text-rule shrink-0">|</span>
                  <span className="truncate">{email}</span>
                </>
              )}
            </div>
          </div>
          <SignOutButton />
        </div>

        {/* Nav links — scrollable on mobile */}
        <nav className="flex items-center border-t border-rule/50 bg-white/80">
          <div className="max-w-4xl mx-auto w-full px-4 flex gap-1 overflow-x-auto scrollbar-hide">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 px-3 py-2 text-xs sm:text-sm text-ink-muted hover:text-ink hover:bg-paper/50 transition-colors rounded-t-md border-b-2 border-transparent hover:border-rule"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
