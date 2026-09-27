"use client";

import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-16 px-4">
      <SignUp
        signInUrl="/sign-in"
        fallbackRedirectUrl="/dashboard"
      />
      <div className="mt-6 text-center text-xs text-ink-muted">
        Recruited as a Field BRM or Regional Coordinator?{" "}
        <Link href="/partner" className="text-forest font-semibold hover:underline">
          Access Partner Portal ↗
        </Link>
      </div>
    </div>
  );
}
