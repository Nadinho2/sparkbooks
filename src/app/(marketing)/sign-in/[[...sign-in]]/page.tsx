"use client";

import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ExpiredAlert() {
  const searchParams = useSearchParams();
  const isExpired = searchParams.get("expired") === "1";

  if (!isExpired) return null;

  return (
    <div className="mb-6 w-full max-w-md bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-start gap-2.5 text-xs text-amber-900 shadow-xs">
      <span className="text-base leading-none">🔒</span>
      <div>
        <p className="font-semibold text-amber-900">Session Expired</p>
        <p className="text-amber-800 mt-0.5">
          You were automatically signed out after 12 hours of inactivity for your security. Please sign in again.
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 px-4">
      <Suspense fallback={null}>
        <ExpiredAlert />
      </Suspense>
      <SignIn
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/dashboard"
      />
      <div className="mt-6 text-center text-xs text-ink-muted">
        Are you a Field Relationship Manager (BRM) or Coordinator?{" "}
        <Link href="/partner" className="text-forest font-semibold hover:underline">
          Go to Partner Portal ↗
        </Link>
      </div>
    </div>
  );
}

