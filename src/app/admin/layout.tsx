import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminSidebar } from "@/components/admin/Sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  const navItems = [
    { href: "/admin/tenants", label: "Tenants", icon: "building" as const },
    { href: "/admin/usage", label: "Usage", icon: "chart" as const },
    { href: "/admin/parsing", label: "Parsing", icon: "search" as const },
    { href: "/admin/billing", label: "Billing", icon: "credit" as const },
  ];

  return (
    <div className="min-h-screen flex bg-paper">
      <AdminSidebar navItems={navItems} />
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
