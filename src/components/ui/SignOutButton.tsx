"use client";

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const { signOut } = useClerk();
  const router = useRouter();

  return (
    <button
      onClick={() => signOut(() => router.push("/"))}
      className="text-sm text-ink-muted hover:text-ink transition-colors"
    >
      Sign out
    </button>
  );
}
