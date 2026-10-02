import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTextMessage } from "@/lib/whatsapp";
import { formatNaira } from "@/lib/format";

/**
 * GET /api/cron/weekly-debtors
 *
 * Weekly Sunday 8:00 PM WAT (19:00 UTC) cron job:
 * Reminds vendors of all outstanding customer debts and pending balances
 * heading into the new week.
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
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const appUrl =
    envUrl && !envUrl.includes("localhost")
      ? envUrl.replace(/\/$/, "")
      : "https://sparkbooks-jade.vercel.app";

  // Fetch all active, non-suspended tenants with a registered WhatsApp number
  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, business_name, whatsapp_number")
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

    // 1. Fetch outstanding debts for this tenant
    let debtors: Array<{
      customer_name: string;
      customer_phone: string | null;
      amount_paid: number;
      amount_owed: number;
      total_amount: number;
    }> = [];

    try {
      const { data: dbDebtors, error: debtError } = await supabase
        .from("customer_debts")
        .select("customer_name, customer_phone, total_amount, amount_paid, amount_owed")
        .eq("tenant_id", tenant.id)
        .neq("status", "settled")
        .order("amount_owed", { ascending: false });

      if (!debtError && dbDebtors) {
        debtors = dbDebtors.map((d) => ({
          customer_name: d.customer_name,
          customer_phone: d.customer_phone,
          amount_paid: Number(d.amount_paid),
          amount_owed: Number(d.amount_owed),
          total_amount: Number(d.total_amount),
        }));
      }
    } catch (err) {
      console.error(`Error querying customer_debts for tenant ${tenant.id}:`, err);
    }

    // If there are outstanding debtors, format the weekly reminder
    if (debtors.length > 0) {
      let totalPending = 0;
      const debtorLines = debtors.map((d) => {
        totalPending += d.amount_owed;
        return `• *${d.customer_name}*: owing *${formatNaira(d.amount_owed)}* (paid ${formatNaira(d.amount_paid)})`;
      });

      const msg =
        `📋 *SparkBooks Weekly Debtors Digest*\n` +
        `*${tenant.business_name}* • Sunday 8:00 PM Review\n\n` +
        `Here is your active debtors list heading into the new week:\n\n` +
        debtorLines.join("\n") +
        `\n\n💰 *Total Unpaid Debt:* *${formatNaira(totalPending)}* across ${debtors.length} customer(s).\n\n` +
        `💡 *Weekly Debt Collection Tip:*\n` +
        `Send a friendly reminder message to each customer before Monday business resumes!\n` +
        `When someone pays, reply: *"[Customer Name] paid [amount]"*.\n\n` +
        `Manage debts & record repayments:\n` +
        `${appUrl}/dashboard/debts`;

      try {
        const sendRes = await sendTextMessage(tenant.whatsapp_number, msg);
        if (sendRes.success) {
          sentCount++;
          // Persist outbound notification in message history
          await supabase.from("whatsapp_messages").insert({
            tenant_id: tenant.id,
            wa_message_id: `weekly_debtors_${Date.now()}_${tenant.id}`,
            direction: "outbound",
            type: "text",
            raw_text: msg,
            status: "matched",
          });
        } else {
          console.error(`Failed to send weekly debtors to tenant ${tenant.id}:`, sendRes.error);
          failedCount++;
        }
      } catch (err) {
        console.error(`Error sending weekly debtors to tenant ${tenant.id}:`, err);
        failedCount++;
      }
    } else {
      // Check if tenant has recent activity (past 30 days) to send a congratulatory message
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentEntries } = await supabase
        .from("ledger_entries")
        .select("id")
        .eq("tenant_id", tenant.id)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .limit(1);

      if (recentEntries && recentEntries.length > 0) {
        const clearMsg =
          `🎉 *SparkBooks Weekly Debtors Digest*\n` +
          `*${tenant.business_name}* • Sunday 8:00 PM Review\n\n` +
          `Great news! All customer accounts are *100% settled*. You have zero outstanding debts heading into the new week. 🚀\n\n` +
          `Track your sales and inventory anytime:\n` +
          `${appUrl}/dashboard`;

        try {
          const sendRes = await sendTextMessage(tenant.whatsapp_number, clearMsg);
          if (sendRes.success) {
            sentCount++;
            await supabase.from("whatsapp_messages").insert({
              tenant_id: tenant.id,
              wa_message_id: `weekly_debtors_${Date.now()}_${tenant.id}`,
              direction: "outbound",
              type: "text",
              raw_text: clearMsg,
              status: "matched",
            });
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        }
      } else {
        // Inactive tenant with zero debts — skip to avoid unnecessary messages
        skippedCount++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    sent: sentCount,
    skipped: skippedCount,
    failed: failedCount,
  });
}
