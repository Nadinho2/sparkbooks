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

  let role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;

  // Fallback: If publicMetadata is not customized in the Clerk session JWT template,
  // query the user record directly via Clerk client.
  if (!role) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      role = (user.publicMetadata as { role?: string } | undefined)?.role;
    } catch (err) {
      console.error("[requireAdmin] Failed to fetch user metadata from Clerk:", err);
    }
  }

  if (role !== "admin") {
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

  let role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;

  if (!role) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      role = (user.publicMetadata as { role?: string } | undefined)?.role;
    } catch {
      return false;
    }
  }

  return role === "admin";
}
