import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant-server";

/**
 * GET /api/messages/signed-url?path=...
 * Generates a signed URL for a private voice note file.
 * URL expires in 1 hour.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const tenant = await getCurrentTenant();

  // Validate the path belongs to this tenant
  if (!path.startsWith(`${tenant.id}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("voice-notes")
    .createSignedUrl(path, 3600); // 1 hour

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
