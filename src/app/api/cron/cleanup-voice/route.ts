import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const RETENTION_DAYS = 14;
const BATCH_SIZE = 100;

/**
 * GET /api/cron/cleanup-voice
 * Deletes voice note files older than 14 days from Supabase Storage.
 * Sets media_url to null on the row, keeps transcript and message intact.
 * Loops through all expired rows (not capped at a single batch).
 *
 * Schedule: call once daily via a cron job.
 *
 * Auth: requires CRON_SECRET as bearer token or ?token= query param.
 */
export async function GET(request: NextRequest) {
  // Auth check — mandatory in production
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const queryToken = request.nextUrl.searchParams.get("token");
  const providedToken = bearerToken ?? queryToken;

  if (providedToken !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  let deleted = 0;
  let skipped = 0;
  let totalProcessed = 0;
  let hasMore = true;

  // Loop until all expired rows are processed
  while (hasMore) {
    const { data: messages, error } = await supabase
      .from("whatsapp_messages")
      .select("id, media_url, tenant_id")
      .eq("type", "voice")
      .not("media_url", "is", null)
      .lt("created_at", cutoff.toISOString())
      .limit(BATCH_SIZE);

    if (error) {
      return NextResponse.json(
        { error: error.message, deleted, skipped, totalProcessed },
        { status: 500 },
      );
    }

    if (!messages || messages.length === 0) {
      hasMore = false;
      break;
    }

    for (const msg of messages) {
      if (!msg.media_url) {
        skipped++;
        continue;
      }

      // Delete from storage
      const { error: delError } = await supabase.storage
        .from("voice-notes")
        .remove([msg.media_url]);

      if (delError) {
        console.error(`Failed to delete ${msg.media_url}:`, delError.message);
        skipped++;
        continue;
      }

      // Nullify media_url on the row
      await supabase
        .from("whatsapp_messages")
        .update({ media_url: null })
        .eq("id", msg.id);

      deleted++;
    }

    totalProcessed += messages.length;

    // If we got fewer than BATCH_SIZE, there are no more rows
    if (messages.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  return NextResponse.json({
    ok: true,
    cutoff: cutoff.toISOString(),
    deleted,
    skipped,
    totalProcessed,
  });
}
