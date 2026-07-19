import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

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

  if (providedToken !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let paidReset = 0;
  let freeReset = 0;

  // ── 1. Reset paid tenants (current_period_end has passed) ──
  try {
    const { data, error } = await supabase.rpc("reset_billing_cycle");
    if (!error && Array.isArray(data)) {
      paidReset = data.length;
    }
  } catch {
    // RPC not available — fall back to manual query
  }

  if (paidReset === 0) {
    // Manual fallback for paid tenants
    const now = new Date().toISOString();
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, current_period_end")
      .not("current_period_end", "is", null)
      .lt("current_period_end", now);

    if (tenants) {
      for (const t of tenants) {
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
  // Free tenants have no current_period_end and no last_reset_at column.
  // Reset their monthly_message_count on the 1st of each calendar month.
  const now = new Date();
  if (now.getDate() === 1) {
    const { data: freeTenants } = await supabase
      .from("tenants")
      .select("id")
      .eq("plan_tier", "free")
      .gt("monthly_message_count", 0);

    if (freeTenants) {
      for (const t of freeTenants) {
        await supabase
          .from("tenants")
          .update({ monthly_message_count: 0 })
          .eq("id", t.id);

        freeReset++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    paidReset,
    freeReset,
    method: paidReset > 0 ? "rpc" : "manual",
  });
}
