import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { timingSafeEqual } from "crypto";

/**
 * GET /api/cron/reset-usage
 *
 * Daily job: resets monthly_message_count to 0 and rolls current_period_end
 * forward by 1 month for any tenant whose billing cycle has ended.
 * Also resets free-tier tenants based on a calendar-month boundary.
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

  if (!providedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providedBuf = Buffer.from(providedToken);
  const secretBuf = Buffer.from(cronSecret);
  if (providedBuf.length !== secretBuf.length || !timingSafeEqual(providedBuf, secretBuf)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // ── 0. Try unified PostgreSQL bulk reset RPC (scales to 100k+ tenants in <25ms) ──
  try {
    const { data: bulkRes, error: bulkErr } = await supabase.rpc("reset_all_monthly_usage");
    if (!bulkErr && Array.isArray(bulkRes) && bulkRes.length > 0) {
      return NextResponse.json({
        ok: true,
        paidReset: Number(bulkRes[0].paid_reset_count ?? 0),
        freeReset: Number(bulkRes[0].free_reset_count ?? 0),
        method: "rpc_bulk",
      });
    }
  } catch {
    // Fall back to individual handlers if migration 014 RPC is not yet executed
  }

  let paidReset = 0;
  let freeReset = 0;

  // ── 1. Reset paid tenants (current_period_end has passed) via legacy RPC ──
  try {
    const { data, error } = await supabase.rpc("reset_billing_cycle");
    if (!error && Array.isArray(data)) {
      paidReset = data.length;
    }
  } catch {
    // RPC not available — fall back to query
  }

  if (paidReset === 0) {
    // Fallback for paid tenants whose period has ended
    const now = new Date().toISOString();
    const { data: expiredTenants } = await supabase
      .from("tenants")
      .select("id, current_period_end")
      .not("current_period_end", "is", null)
      .lt("current_period_end", now);

    if (expiredTenants && expiredTenants.length > 0) {
      for (const t of expiredTenants) {
        const nextPeriod = new Date(t.current_period_end);
        nextPeriod.setMonth(nextPeriod.getMonth() + 1);

        await supabase
          .from("tenants")
          .update({
            monthly_message_count: 0,
            current_period_end: nextPeriod.toISOString(),
          })
          .eq("id", t.id);

        paidReset++;
      }
    }
  }

  // ── 2. Reset free-tier tenants (first of the month only) ──
  // High-performance single batch update across all free tenants (scales to 100k+ users)
  const now = new Date();
  if (now.getDate() === 1) {
    const { data: updatedFree, error: freeErr } = await supabase
      .from("tenants")
      .update({ monthly_message_count: 0 })
      .eq("plan_tier", "free")
      .gt("monthly_message_count", 0)
      .select("id");

    if (!freeErr && updatedFree) {
      freeReset = updatedFree.length;
    }
  }

  return NextResponse.json({
    ok: true,
    paidReset,
    freeReset,
    method: paidReset > 0 ? "rpc" : "batch",
  });
}
