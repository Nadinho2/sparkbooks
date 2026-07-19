"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

export function Header() {
  const { isSignedIn } = useAuth();

  return (
    <header className="w-full max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
      <Link
        href="/"
        className="font-display text-ink text-xl tracking-tight hover:opacity-80 transition-opacity"
      >
        SparkBooks
      </Link>

      {isSignedIn ? (
        <Link
          href="/dashboard"
          className="inline-flex items-center h-10 rounded-full bg-ink px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Dashboard
        </Link>
      ) : (
        <Link
          href="/onboarding"
          className="inline-flex items-center h-10 rounded-full bg-ink px-5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Get Started
        </Link>
      )}
    </header>
  );
}
