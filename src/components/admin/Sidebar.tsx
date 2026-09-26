"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: "building" | "chart" | "search" | "credit";
};

export function AdminSidebar({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-56 bg-white border-r border-rule flex flex-col shrink-0 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
          <Link href="/admin/tenants" className="font-display text-sm text-ink tracking-wide">
            SparkBooks
            <span className="text-flag ml-1 font-mono text-[10px]">ADMIN</span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-ink-muted hover:text-ink"
            aria-label="Close menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                pathname === item.href || pathname.startsWith(item.href + "/")
                  ? "bg-paper text-ink font-medium"
                  : "text-ink-muted hover:bg-paper hover:text-ink"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-rule">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1L2 6l1 1 3-3 3 3 1-1-4-5z" fill="currentColor" />
              <path d="M3 7v4h2V8h2v3h2V7" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
            Dashboard
          </Link>
        </div>
      </aside>

      {/* Mobile hamburger bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 bg-white border-b border-rule px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          className="text-ink-muted hover:text-ink"
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <span className="font-display text-sm text-ink">SparkBooks</span>
        <span className="text-flag font-mono text-[10px]">ADMIN</span>
      </div>
    </>
  );
}

function Icon({ name }: { name: NavItem["icon"] }) {
  switch (name) {
    case "building":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <rect x="2" y="3" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="10" y="1" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="7" y="5" width="2" height="9" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="3" y="5" width="1" height="1.5" fill="currentColor" opacity="0.4" />
          <rect x="4.5" y="5" width="1" height="1.5" fill="currentColor" opacity="0.4" />
          <rect x="11" y="3.5" width="1" height="1.5" fill="currentColor" opacity="0.4" />
          <rect x="12.5" y="3.5" width="1" height="1.5" fill="currentColor" opacity="0.4" />
        </svg>
      );
    case "chart":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <rect x="1.5" y="10" width="3" height="4" rx="0.5" fill="currentColor" opacity="0.3" />
          <rect x="6.5" y="6" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.5" />
          <rect x="11.5" y="2" width="3" height="12" rx="0.5" fill="currentColor" opacity="0.8" />
        </svg>
      );
    case "search":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M5.5 7h3M7 5.5v3" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.4" />
        </svg>
      );
    case "credit":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="1.5" y="7" width="13" height="2" fill="currentColor" opacity="0.15" />
          <circle cx="11" cy="9.5" r="0.8" fill="currentColor" opacity="0.5" />
        </svg>
      );
  }
}
