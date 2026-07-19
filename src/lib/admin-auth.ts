/**
 * Admin auth — gate for the super-admin dashboard.
 *
 * Only Clerk users with publicMetadata.role === "admin" can access.
 * Set this manually via Clerk Dashboard → Users → Metadata for each admin.
 */

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/**
 * Require admin role. Redirects non-admins to /sign-in.
 * Call this at the top of every admin layout / page / server action.
 */
export async function requireAdmin(): Promise<string> {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const metadata = sessionClaims?.publicMetadata as
    | { role?: string }
    | undefined;

  if (metadata?.role !== "admin") {
    redirect("/sign-in");
  }

  return userId;
}

/**
 * Check whether the current user is an admin without redirecting.
 */
export async function isAdmin(): Promise<boolean> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return false;

  const metadata = sessionClaims?.publicMetadata as
    | { role?: string }
    | undefined;

  return metadata?.role === "admin";
}
