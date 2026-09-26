"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLink {
  href: string;
  label: string;
}

export function DashboardNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center border-t border-rule/50 bg-white/90 backdrop-blur-xs">
      <div className="max-w-5xl lg:max-w-6xl mx-auto w-full px-4 sm:px-6 flex gap-1 sm:gap-1.5 overflow-x-auto scrollbar-hide py-1.5">
        {links.map((link) => {
          const isActive =
            link.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 px-3 py-1.5 text-xs sm:text-sm font-medium transition-all rounded-lg ${
                isActive
                  ? "bg-sand text-ink font-semibold shadow-2xs"
                  : "text-ink-muted hover:text-ink hover:bg-sand/40"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
