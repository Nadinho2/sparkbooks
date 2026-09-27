"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 px-4">
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
