import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTextMessage } from "@/lib/whatsapp";
import { formatNaira } from "@/lib/format";

/**
 * GET /api/cron/weekly-summary
 *
 * Weekly cron job: Calculates 7-day revenue, expenses, and net profit
 * for each active tenant and sends an automated recap via WhatsApp.
 *
 * Auth: requires CRON_SECRET as bearer token or ?token= query param.
 */
export async function GET(request: NextRequest) {
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sparkbooks.io";

  // Calculate past 7 days cutoff
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString();

  // Fetch all active, non-suspended tenants with WhatsApp numbers
  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, business_name, whatsapp_number, merchant_email")
    .eq("is_suspended", false)
    .not("whatsapp_number", "is", null);

  if (tenantsError || !tenants) {
    return NextResponse.json(
      { error: tenantsError?.message ?? "Failed to fetch tenants" },
      { status: 500 },
    );
  }

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const tenant of tenants) {
    if (!tenant.whatsapp_number) {
      skippedCount++;
      continue;
    }

    // Fetch entries for this tenant from the past 7 days
    const { data: entries } = await supabase
      .from("ledger_entries")
      .select("type, amount")
      .eq("tenant_id", tenant.id)
      .gte("created_at", cutoffIso);

    if (!entries || entries.length === 0) {
      // No activity in past 7 days — skip sending unsolicited message
      skippedCount++;
      continue;
    }

    let totalSales = 0;
    let totalExpenses = 0;

    for (const e of entries) {
      const amt = Number(e.amount);
      if (e.type === "sale") totalSales += amt;
      else if (e.type === "expense") totalExpenses += amt;
    }

    const netProfit = totalSales - totalExpenses;
    const count = entries.length;

    const storeName = (tenant.business_name || "Your Store").replace(/&bull;?/gi, "").trim();
    const summaryText =
      `📊 *SparkBooks Weekly Summary*\n` +
      `Business: *${storeName}*\n` +
      `Period: Past 7 Days\n\n` +
      `💰 *Total Sales:* ${formatNaira(totalSales)}\n` +
      `💸 *Total Expenses:* ${formatNaira(totalExpenses)}\n` +
      `📈 *Net Profit:* ${formatNaira(netProfit)}\n` +
      `📝 *Entries Logged:* ${count}\n\n` +
      `Check your full ledger and stock anytime:\n` +
      `${appUrl}/dashboard`;

    try {
      await sendTextMessage(tenant.whatsapp_number, summaryText);
      sentCount++;
    } catch (err) {
      console.error(`Failed to send weekly summary to tenant ${tenant.id}:`, err);
      failedCount++;
    }

    // Also dispatch branded HTML weekly digest via Resend if merchant email is on file
    if (tenant.merchant_email) {
      try {
        const { sendWeeklyDigestEmail } = await import("@/lib/email");
        await sendWeeklyDigestEmail(
          tenant.merchant_email,
          tenant.business_name,
          {
            totalSales: totalSales.toLocaleString("en-NG"),
            totalExpenses: totalExpenses.toLocaleString("en-NG"),
            netProfit: netProfit.toLocaleString("en-NG"),
            totalEntriesCount: count,
          }
        );
      } catch (emailErr) {
        console.warn(`Failed to dispatch weekly email to ${tenant.merchant_email}:`, emailErr);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sentCount,
    skippedCount,
    failedCount,
    totalTenants: tenants.length,
  });
}
