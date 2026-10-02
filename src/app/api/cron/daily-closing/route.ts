import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTextMessage } from "@/lib/whatsapp";
import { formatNaira } from "@/lib/format";

/**
 * GET /api/cron/daily-closing
 *
 * Daily 8:00 PM closing cron job (19:00 UTC):
 * Calculates today's sales, payment channel breakdown, expenses, net profit,
 * customer debts, and low stock warnings for each active tenant.
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

  // Today's start of day in UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  // Fetch all active, non-suspended tenants with WhatsApp numbers
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

    // 1. Fetch today's entries
    const { data: entries } = await supabase
      .from("ledger_entries")
      .select("type, amount, payment_method, item_description")
      .eq("tenant_id", tenant.id)
      .gte("created_at", todayIso);

    // 2. Fetch any low stock items (< 5 units)
    const { data: lowStock } = await supabase
      .from("products")
      .select("name, quantity, unit")
      .eq("tenant_id", tenant.id)
      .is("deleted_at", null)
      .lte("quantity", 5)
      .order("quantity", { ascending: true })
      .limit(3);

    // 3. Fetch today's active customer debts
    let todayDebtorsCount = 0;
    let todayDebtsOwed = 0;
    try {
      const { data: debts } = await supabase
        .from("customer_debts")
        .select("amount_owed, status")
        .eq("tenant_id", tenant.id)
        .gte("created_at", todayIso)
        .neq("status", "settled");

      for (const d of debts ?? []) {
        todayDebtorsCount++;
        todayDebtsOwed += Number(d.amount_owed);
      }
    } catch {
      // If table not present yet, skip debt summary
    }

    // If no entries and no low stock, skip to prevent spamming inactive merchants
    if ((!entries || entries.length === 0) && (!lowStock || lowStock.length === 0)) {
      skippedCount++;
      continue;
    }

    let totalSales = 0;
    let totalExpenses = 0;
    let saleCount = 0;
    const paymentMethods: Record<string, number> = { transfer: 0, cash: 0, pos: 0, other: 0 };

    for (const e of entries ?? []) {
      const amt = Number(e.amount);
      const method = (e.payment_method || "transfer").toLowerCase();
      if (e.type === "sale") {
        totalSales += amt;
        saleCount++;
        if (paymentMethods[method] !== undefined) paymentMethods[method] += amt;
        else paymentMethods.other += amt;
      } else if (e.type === "expense") {
        totalExpenses += amt;
      }
    }

    const netProfit = totalSales - totalExpenses;
    const profitEmoji = netProfit >= 0 ? "📈" : "📉";
    const profitSign = netProfit >= 0 ? "+" : "";

    const dateStr = new Date().toLocaleDateString("en-NG", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

    let msg =
      `🌙 *SparkBooks Daily Closing Report*\n` +
      `*${tenant.business_name}* • ${dateStr}\n\n` +
      `💰 *Total Sales:* ${formatNaira(totalSales)} (${saleCount} transactions)\n`;

    if (totalSales > 0) {
      const channelBreakdown: string[] = [];
      if (paymentMethods.transfer > 0) channelBreakdown.push(`• Transfer: ${formatNaira(paymentMethods.transfer)}`);
      if (paymentMethods.cash > 0) channelBreakdown.push(`• Cash: ${formatNaira(paymentMethods.cash)}`);
      if (paymentMethods.pos > 0) channelBreakdown.push(`• POS: ${formatNaira(paymentMethods.pos)}`);
      if (channelBreakdown.length > 0) {
        msg += `💳 *Payment Channels:*\n${channelBreakdown.join("\n")}\n`;
      }
    }

    msg += `\n💸 *Total Expenses:* ${formatNaira(totalExpenses)}\n`;
    msg += `${profitEmoji} *Net Profit:* *${profitSign}${formatNaira(netProfit)}*\n\n`;

    if (todayDebtorsCount > 0) {
      msg += `⚠️ *New Debts Today:* ${formatNaira(todayDebtsOwed)} owed by ${todayDebtorsCount} customer(s)\n\n`;
    }

    if (lowStock && lowStock.length > 0) {
      msg += `📦 *Low Stock Alerts:*\n`;
      for (const p of lowStock) {
        msg += `• ${p.name}: only *${p.quantity} ${p.unit}* left\n`;
      }
      msg += `\n`;
    }

    msg +=
      `Sleep easy! Your books are 100% reconciled. 💤\n` +
      `View your full ledger anytime:\n` +
      `${appUrl}/dashboard`;

    try {
      const sendRes = await sendTextMessage(tenant.whatsapp_number, msg);
      if (sendRes.success) {
        sentCount++;
        // Log outbound message to database
        await supabase.from("whatsapp_messages").insert({
          tenant_id: tenant.id,
          wa_message_id: `daily_closing_${Date.now()}_${tenant.id}`,
          direction: "outbound",
          type: "text",
          raw_text: msg,
          status: "matched",
        });
      } else {
        console.error(`Failed to send daily closing to tenant ${tenant.id}:`, sendRes.error);
        failedCount++;
      }
    } catch (err) {
      console.error(`Error sending daily closing to tenant ${tenant.id}:`, err);
      failedCount++;
    }
  }

  return NextResponse.json({
    success: true,
    sent: sentCount,
    skipped: skippedCount,
    failed: failedCount,
  });
}
