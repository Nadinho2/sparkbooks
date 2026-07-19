import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * GET /api/debug/session — admin-only session debug endpoint.
 * Requires Clerk publicMetadata.role === "admin".
 */
export async function GET() {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const metadata = sessionClaims?.publicMetadata as Record<string, unknown> | undefined;

  if (metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    authenticated: true,
    userId,
    publicMetadata: metadata ?? null,
    role: metadata?.role ?? null,
    isAdmin: true,
    allClaims: sessionClaims,
  });
}
