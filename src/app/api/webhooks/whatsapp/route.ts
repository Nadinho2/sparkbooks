import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizePhone, sendTextMessage, sendTemplateMessage } from "@/lib/whatsapp";
import { parseMessage } from "@/lib/deepseek";
import { processVoiceMessage } from "@/lib/voice";
import { updateProductStock } from "@/lib/stock";
import {
  getPlanLimits,
  canProcessMessage,
  planLimitExceededMessage,
} from "@/lib/billing";
import {
  getTenantBilling,
  incrementMessageCount,
} from "@/lib/billing-server";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * GET — WhatsApp webhook verification.
 * Meta sends hub.mode, hub.verify_token, hub.challenge.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Verify X-Hub-Signature-256 HMAC from Meta.
 * Uses the WhatsApp App Secret (from Meta Developer Dashboard → App Settings → Security).
 */
function verifyHmacSignature(body: string, signature: string): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("WHATSAPP_APP_SECRET not configured — webhook verification skipped");
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(body).digest("hex");
  const expectedSig = `sha256=${expected}`;

  try {
    return timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature));
  } catch {
    return false;
  }
}

/* ───────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────── */

async function findTenantByPhone(
  supabase: ReturnType<typeof createAdminClient>,
  phone: string,
): Promise<{ id: number; business_name: string; whatsapp_number: string; is_suspended?: boolean } | null> {
  // 1. Try fast indexed RPC lookup
  try {
    const { data, error } = await supabase.rpc("find_tenant_by_phone", {
      phone_input: phone,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      return data[0];
    }
  } catch {
    // Fall back to query
  }

  // 2. Targeted query with database-level suffix matching
  const normalized = normalizePhone(phone);
  const suffix = normalized.slice(-10);

  const { data: matched } = await supabase
    .from("tenants")
    .select("id, business_name, whatsapp_number, is_suspended")
    .or(`whatsapp_number.ilike.%${suffix}%,whatsapp_number.eq.${normalized}`)
    .limit(1)
    .maybeSingle();

  if (matched) return matched;

  // 3. Fallback scan if numbers had non-standard characters
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, business_name, whatsapp_number, is_suspended")
    .limit(50);

  if (!tenants) return null;

  return (
    tenants.find((t) => {
      const tPhone = normalizePhone(t.whatsapp_number);
      return (
        tPhone === normalized ||
        tPhone.slice(-10) === suffix
      );
    }) ?? null
  );
}

/**
 * Find a team member by their WhatsApp number for a given tenant.
 * Uses indexed RPC first, then targeted database query.
 */
async function findSenderMember(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: number,
  fromPhone: string,
): Promise<number | null> {
  // 1. Try fast indexed RPC lookup
  try {
    const { data, error } = await supabase.rpc("find_sender_member_by_phone", {
      p_tenant_id: tenantId,
      phone_input: fromPhone,
    });
    if (!error && typeof data === "number") {
      return data;
    }
  } catch {
    // Fall back to query
  }

  const normalized = normalizePhone(fromPhone);
  const suffix = normalized.slice(-10);

  // 2. Targeted query fallback
  const { data: member } = await supabase
    .from("tenant_members")
    .select("id, whatsapp_number")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .or(`whatsapp_number.ilike.%${suffix}%,whatsapp_number.eq.${normalized}`)
    .limit(1)
    .maybeSingle();

  return member?.id ?? null;
}

/**
 * Reply to user via WhatsApp AND log outbound reply to dashboard messages table.
 */
async function replyToUser(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: number,
  fromPhone: string,
  replyText: string,
  senderMemberId?: number | null,
) {
  // 1. Attempt WhatsApp Cloud API transmission
  const sendRes = await sendTextMessage(fromPhone, replyText);

  // 2. Always persist outbound message so it displays in the dashboard thread
  try {
    await supabase.from("whatsapp_messages").insert({
      tenant_id: tenantId,
      wa_message_id: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      direction: "outbound",
      type: "text",
      raw_text: replyText,
      status: "matched",
      failure_reason: sendRes.success ? null : (sendRes.error ?? "outbound_delivery_pending"),
      sender_member_id: senderMemberId ?? null,
    });
  } catch (err) {
    console.error("Failed to store outbound message:", err);
  }

  return sendRes;
}

/**
 * Generate a public digital receipt URL for a ledger entry.
 */
function getReceiptUrl(entryId: number): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const domain =
    envUrl && !envUrl.includes("localhost")
      ? envUrl.replace(/\/$/, "")
      : "https://sparkbooks-jade.vercel.app";
  return `${domain}/receipt/${entryId}`;
}

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          text?: { body: string };
          voice?: { id: string };
          audio?: { id: string; mime_type?: string; voice?: boolean };
        }>;
        metadata?: {
          display_phone_number: string;
        };
      };
    }>;
  }>;
}

export async function POST(request: NextRequest) {
  // ── 0. HMAC SIGNATURE VERIFICATION ──
  const signature = request.headers.get("X-Hub-Signature-256");
  const rawBody = await request.text();

  if (!signature) {
    console.error("WhatsApp webhook rejected — missing X-Hub-Signature-256 header");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  if (!verifyHmacSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse body
  let body: WhatsAppWebhookPayload;
  try {
    body = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Extract basic payload info for quick validation
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];
  const metadata = value?.metadata;

  if (!message || !metadata) {
    return NextResponse.json({ ok: true });
  }

  // ── Process message completely within Meta's 20-second timeout window ──
  try {
    await processMessageAsync(body);
  } catch (err) {
    console.error("WhatsApp message processing error:", err);
  }

  return NextResponse.json({ ok: true });
}

/**
 * Full async message processing.
 */
async function processMessageAsync(body: WhatsAppWebhookPayload) {
  const supabase = createAdminClient();

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];
  const metadata = value?.metadata;

  if (!message || !metadata) return;

  const waMessageId = message.id;
  const fromPhone = message.from;
  const toPhone = metadata.display_phone_number;
  const msgType = message.type;

  // ── Determine text or audio content ──
  let rawText: string | null = null;
  let isVoice = false;
  let voiceTranscript: string | null = null;
  let voiceMediaUrl: string | null = null;
  let mediaId: string | null = null;

  if (msgType === "text") {
    rawText = message.text?.body ?? null;
  } else if (msgType === "audio" || msgType === "voice") {
    // Meta WhatsApp Cloud API delivers voice notes under type: "audio" with message.audio.id
    mediaId = message.audio?.id ?? message.voice?.id ?? null;
    console.log("Inbound audio message detected:", { msgType, mediaId, audio: message.audio, voice: message.voice });
    if (!mediaId) return;
    isVoice = true;
  } else {
    return;
  }

  // ── 1. IDEMPOTENCY CHECK ──
  const { data: existingMsg } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("wa_message_id", waMessageId)
    .single();

  if (existingMsg) return;

  // ── 2. FIND TENANT ──
  // 1) Match sender's phone (fromPhone) against tenant owner
  let tenant = await findTenantByPhone(supabase, fromPhone);
  let senderMemberId: number | null = null;

  if (!tenant) {
    // 2) Match sender's phone against registered active team members
    const cleanFrom = normalizePhone(fromPhone);
    const suffix10 = cleanFrom.slice(-10);
    const { data: member } = await supabase
      .from("tenant_members")
      .select("id, tenant_id, tenants!tenant_id(id, business_name, whatsapp_number, is_suspended)")
      .eq("status", "active")
      .or(`whatsapp_number.ilike.%${suffix10}%,whatsapp_number.eq.${cleanFrom}`)
      .limit(1)
      .maybeSingle();

    if (member?.tenants) {
      tenant = member.tenants as unknown as {
        id: number;
        business_name: string;
        whatsapp_number: string;
        is_suspended?: boolean;
      };
      senderMemberId = member.id;
    } else {
      // 3) Fallback: match by toPhone (for tenants with dedicated bot numbers)
      tenant = await findTenantByPhone(supabase, toPhone);
    }
  }

  if (!tenant) {
    console.warn(`No tenant found for sender: ${fromPhone} (bot: ${toPhone})`);
    return;
  }

  // ── 2b. FIND SENDER MEMBER (if not already resolved) ──
  if (!senderMemberId) {
    senderMemberId = await findSenderMember(supabase, tenant.id, fromPhone);
  }

  // ── 2c. SUSPENSION CHECK ──
  if ((tenant as { is_suspended?: boolean }).is_suspended) return;

  // ── 2d. PLAN LIMIT CHECK ──
  const billing = await getTenantBilling(tenant.id);
  const planLimits = billing
    ? getPlanLimits(billing.planTier)
    : getPlanLimits("free");

  if (!canProcessMessage(planLimits, billing?.monthlyMessageCount ?? 0)) {
    await supabase.from("whatsapp_messages").insert({
      tenant_id: tenant.id,
      wa_message_id: waMessageId,
      direction: "inbound",
      type: isVoice ? "voice" : "text",
      raw_text: isVoice ? null : rawText,
      status: "failed",
      failure_reason: "plan_limit_exceeded",
      sender_member_id: senderMemberId,
    });

    await sendTemplateMessage(fromPhone, "plan_limit_exceeded");
    const upgradeMsg = planLimitExceededMessage(billing?.planTier ?? "free");
    await replyToUser(supabase, tenant.id, fromPhone, upgradeMsg, senderMemberId);
    return;
  }

  // ── 3. VOICE: download → upload to Storage → transcribe with Whisper ──
  if (isVoice) {
    if (!mediaId) return;
    try {
      const result = await processVoiceMessage(
        supabase,
        tenant.id,
        waMessageId,
        mediaId,
      );
      voiceTranscript = result.transcript;
      voiceMediaUrl = result.storagePath;
      rawText = result.transcript;

      if (!rawText) {
        await supabase.from("whatsapp_messages").insert({
          tenant_id: tenant.id,
          wa_message_id: waMessageId,
          direction: "inbound",
          type: "voice",
          status: "failed",
          media_url: voiceMediaUrl,
          sender_member_id: senderMemberId,
        });
        await replyToUser(
          supabase,
          tenant.id,
          fromPhone,
          "I couldn't make out the audio clearly. Could you send a clearer voice note or type your message?",
          senderMemberId,
        );
        return;
      }
    } catch (err) {
      const errorMsg = (err as Error).message;

      if (errorMsg.includes("VOICE_TOO_LARGE")) {
        await supabase.from("whatsapp_messages").insert({
          tenant_id: tenant.id,
          wa_message_id: waMessageId,
          direction: "inbound",
          type: "voice",
          status: "failed",
          failure_reason: "voice_too_large",
          sender_member_id: senderMemberId,
        });
        await replyToUser(
          supabase,
          tenant.id,
          fromPhone,
          "Your voice note is a bit too long for me to process. Please send a shorter note or type your message instead.",
          senderMemberId,
        );
        return;
      }

      const isQuotaError = errorMsg.includes("OPENAI_QUOTA_EXHAUSTED");
      console.error("Voice processing error:", err);

      await supabase.from("whatsapp_messages").insert({
        tenant_id: tenant.id,
        wa_message_id: waMessageId,
        direction: "inbound",
        type: "voice",
        status: "failed",
        failure_reason: isQuotaError ? "openai_quota_exhausted" : errorMsg,
        sender_member_id: senderMemberId,
      });

      const userReply = isQuotaError
        ? "Voice transcription is temporarily paused: OpenAI API credit balance is exhausted ($0 balance). Please add credits at platform.openai.com or type your message for now."
        : "Sorry, I ran into trouble processing your voice note. Please type your message and I'll handle it right away.";

      await replyToUser(
        supabase,
        tenant.id,
        fromPhone,
        userReply,
        senderMemberId,
      );
      return;
    }
  }

  // ── 4. INSERT INBOUND MESSAGE ──
  const { data: waMsg, error: insertError } = await supabase
    .from("whatsapp_messages")
    .insert({
      tenant_id: tenant.id,
      wa_message_id: waMessageId,
      direction: "inbound",
      type: isVoice ? "voice" : "text",
      raw_text: rawText,
      transcript: voiceTranscript,
      media_url: voiceMediaUrl,
      status: "pending_confirmation",
      sender_member_id: senderMemberId,
    })
    .select("id")
    .single();

  if (insertError || !waMsg) {
    console.error("Failed to insert WhatsApp message:", insertError);
    return;
  }

  // ── 5. FETCH PRODUCT CATALOG ──
  const { data: catalog } = await supabase
    .from("products")
    .select("id, name, unit, unit_cost, categories(name)")
    .eq("tenant_id", tenant.id)
    .is("deleted_at", null);

  const catalogItems = (catalog ?? []).map((p) => {
    const cat = (p.categories as unknown as { name: string }[])?.[0] ?? null;
    return {
      id: p.id,
      name: p.name,
      category: cat?.name ?? null,
      unit: p.unit,
      unit_cost: p.unit_cost,
    };
  });

  // ── 6. PARSE WITH DEEPSEEK ──
  let parsed;
  try {
    parsed = await parseMessage(rawText!, catalogItems);
  } catch (err) {
    console.error("DeepSeek parse error:", err);
    await supabase
      .from("whatsapp_messages")
      .update({ status: "failed" })
      .eq("id", waMsg.id);
    await replyToUser(
      supabase,
      tenant.id,
      fromPhone,
      "Sorry, I had trouble parsing that. Could you please rephrase?",
      senderMemberId,
    );
    return;
  }

  const { confidence, entry_type } = parsed;

  // Increment usage counter
  await incrementMessageCount(tenant.id);

  const nf = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  });

  // ── 7. EXECUTE ACTION BY ENTRY TYPE ──

  // 7A: HELP OR GREETING
  if (entry_type === "help") {
    await supabase
      .from("whatsapp_messages")
      .update({ status: "matched" })
      .eq("id", waMsg.id);

    const brandGreeting = tenant.business_name ? ` *${tenant.business_name}*` : "";
    const helpReply =
      `👋 Welcome to *SparkBooks AI*,${brandGreeting}!\n` +
      `I'm your 24/7 automated bookkeeper. Here is what you can send me (text or voice note):\n\n` +
      `💰 *Record Sale:* "Sold 3 Bone Straight wig for 100k each via transfer"\n` +
      `🧾 *Credit Sale / Debt:* "Sold 1 wig 80k to Amaka, paid 50k, balance 30k"\n` +
      `💳 *Debt Repayment:* "Amaka paid her 30k balance"\n` +
      `📋 *Check Debtors:* "Who is owing me?" or "Debtors list"\n` +
      `💸 *Record Expense:* "Paid shop rent 50k" or "Bought fuel 5,000 cash"\n` +
      `📦 *Restock / Add Stock:* "Restocked 50 closures at 20k cost"\n` +
      `🔍 *Check Stock:* "How many Bone Straight do I have left?"\n` +
      `📊 *Summaries:* "Today's summary" or "Weekly report" or "Closing report"\n\n` +
      `Go ahead and record your first transaction now! 🚀`;

    await replyToUser(supabase, tenant.id, fromPhone, helpReply, senderMemberId);
    return;
  }

  // 7B: STOCK CHECK INQUIRY
  if (entry_type === "stock_check") {
    let reply = "";
    if (parsed.matched_product_id) {
      const { data: prod } = await supabase
        .from("products")
        .select("name, quantity, unit, unit_cost")
        .eq("id", parsed.matched_product_id)
        .single();

      if (prod) {
        reply = `📦 *Stock Check:*\nYou have *${prod.quantity} ${prod.unit}* of *${prod.name}* in stock.`;
      } else {
        reply = `Could not find that product in your catalog.`;
      }
    } else {
      const { data: prods } = await supabase
        .from("products")
        .select("name, quantity, unit")
        .eq("tenant_id", tenant.id)
        .is("deleted_at", null)
        .order("quantity", { ascending: true })
        .limit(10);

      if (prods && prods.length > 0) {
        reply = `📦 *Current Stock Levels:*\n` + prods.map((p) => `• ${p.name}: *${p.quantity} ${p.unit}*`).join("\n");
      } else {
        reply = `You have no products in your catalog yet.`;
      }
    }

    await supabase
      .from("whatsapp_messages")
      .update({ status: "matched" })
      .eq("id", waMsg.id);

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7C: TODAY'S SALES / CLOSING SUMMARY / P&L
  if (entry_type === "daily_summary") {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const { data: entries } = await supabase
      .from("ledger_entries")
      .select("type, amount, item_description, payment_method, created_at")
      .eq("tenant_id", tenant.id)
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: true });

    let totalSales = 0;
    let totalExpenses = 0;
    const paymentMethods: Record<string, number> = { transfer: 0, cash: 0, pos: 0, other: 0 };
    const salesList: string[] = [];
    const expenseList: string[] = [];

    for (const e of entries ?? []) {
      const amt = Number(e.amount);
      const method = (e.payment_method || "transfer").toLowerCase();
      if (e.type === "sale") {
        totalSales += amt;
        if (paymentMethods[method] !== undefined) paymentMethods[method] += amt;
        else paymentMethods.other += amt;
        salesList.push(`• ${e.item_description || "Sale"} — *${nf.format(amt)}* (${method.toUpperCase()})`);
      } else if (e.type === "expense") {
        totalExpenses += amt;
        expenseList.push(`• ${e.item_description || "Expense"} — *${nf.format(amt)}*`);
      }
    }

    const netProfit = totalSales - totalExpenses;
    const profitEmoji = netProfit >= 0 ? "📈" : "📉";
    const profitSign = netProfit >= 0 ? "+" : "";

    let summaryReply = `📊 *Today's Closing Summary & P&L:*\n\n`;

    summaryReply += `💰 *Sales Total: ${nf.format(totalSales)}* (${salesList.length} transaction${salesList.length === 1 ? "" : "s"})\n`;
    if (salesList.length > 0) {
      summaryReply += salesList.slice(0, 8).join("\n") + (salesList.length > 8 ? `\n...and ${salesList.length - 8} more` : "") + "\n\n";
    } else {
      summaryReply += `• No sales recorded today\n\n`;
    }

    if (totalSales > 0) {
      const pmParts: string[] = [];
      if (paymentMethods.transfer > 0) pmParts.push(`Transfer: ${nf.format(paymentMethods.transfer)}`);
      if (paymentMethods.cash > 0) pmParts.push(`Cash: ${nf.format(paymentMethods.cash)}`);
      if (paymentMethods.pos > 0) pmParts.push(`POS: ${nf.format(paymentMethods.pos)}`);
      if (paymentMethods.other > 0) pmParts.push(`Other: ${nf.format(paymentMethods.other)}`);
      if (pmParts.length > 0) {
        summaryReply += `💳 *By Payment Channel:*\n${pmParts.join(" | ")}\n\n`;
      }
    }

    summaryReply += `💸 *Expenses Total: ${nf.format(totalExpenses)}*\n`;
    if (expenseList.length > 0) {
      summaryReply += expenseList.slice(0, 5).join("\n") + "\n\n";
    } else {
      summaryReply += `• No expenses recorded today\n\n`;
    }

    summaryReply += `${profitEmoji} *Net Profit / Loss:* *${profitSign}${nf.format(netProfit)}*`;

    await supabase
      .from("whatsapp_messages")
      .update({ status: "matched" })
      .eq("id", waMsg.id);

    await replyToUser(supabase, tenant.id, fromPhone, summaryReply, senderMemberId);
    return;
  }

  // 7D: WEEKLY PERFORMANCE SUMMARY
  if (entry_type === "weekly_summary") {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getUTCDay();
    const diff = (day === 0 ? -6 : 1) - day;
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() + diff);
    startOfWeek.setUTCHours(0, 0, 0, 0);

    const { data: entries } = await supabase
      .from("ledger_entries")
      .select("type, amount, payment_method, created_at")
      .eq("tenant_id", tenant.id)
      .gte("created_at", startOfWeek.toISOString())
      .order("created_at", { ascending: true });

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
    const profitSign = netProfit >= 0 ? "+" : "";

    let reply = `📅 *Weekly Performance Summary:*\n\n`;
    reply += `💰 *Total Sales:* *${nf.format(totalSales)}* (${saleCount} transactions)\n`;
    reply += `💸 *Total Expenses:* *${nf.format(totalExpenses)}*\n`;
    reply += `📈 *Net Profit:* *${profitSign}${nf.format(netProfit)}*\n\n`;
    reply += `💳 *Channel Breakdown:*\n`;
    reply += `• Transfer: *${nf.format(paymentMethods.transfer)}*\n`;
    reply += `• Cash: *${nf.format(paymentMethods.cash)}*\n`;
    reply += `• POS: *${nf.format(paymentMethods.pos)}*`;

    await supabase
      .from("whatsapp_messages")
      .update({ status: "matched" })
      .eq("id", waMsg.id);

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7E: DEBT CHECK INQUIRY ("Who is owing me?" / "Debtors list")
  if (entry_type === "debt_check") {
    let reply = "";
    try {
      const { data: debtors, error } = await supabase
        .from("customer_debts")
        .select("customer_name, customer_phone, total_amount, amount_paid, amount_owed, status")
        .eq("tenant_id", tenant.id)
        .neq("status", "settled")
        .order("amount_owed", { ascending: false });

      if (error || !debtors || debtors.length === 0) {
        reply = `🎉 *Great news!* You currently have no outstanding customer debts. All accounts are settled!`;
      } else {
        let totalPending = 0;
        const list = debtors.map((d) => {
          const owed = Number(d.amount_owed);
          totalPending += owed;
          return `• *${d.customer_name}*: owing *${nf.format(owed)}* (paid ${nf.format(Number(d.amount_paid))})`;
        });

        reply =
          `📋 *Customer Debtors List (Pending Balances):*\n\n` +
          list.join("\n") +
          `\n\n💰 *Total Unpaid Debt:* *${nf.format(totalPending)}* across ${debtors.length} customer(s).\n` +
          `_Tip: When someone pays, send: "[Customer Name] paid [amount]"!_`;
      }
    } catch {
      reply = `Could not fetch debtors list right now. Please check your dashboard.`;
    }

    await supabase
      .from("whatsapp_messages")
      .update({ status: "matched" })
      .eq("id", waMsg.id);

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7F: DEBT REPAYMENT ("Blessing paid 40k balance")
  if (entry_type === "debt_repayment" && (parsed.amount || parsed.amount_paid)) {
    const payment = parsed.amount || parsed.amount_paid || 0;
    const custName = (parsed.customer_name || "").trim();
    const method = parsed.payment_method || "transfer";

    let debtor: {
      id: number;
      customer_name: string;
      total_amount: number;
      amount_paid: number;
      amount_owed: number;
    } | null = null;

    if (custName) {
      try {
        const { data: matched } = await supabase
          .from("customer_debts")
          .select("id, customer_name, total_amount, amount_paid, amount_owed")
          .eq("tenant_id", tenant.id)
          .neq("status", "settled")
          .ilike("customer_name", `%${custName}%`)
          .limit(1)
          .maybeSingle();

        debtor = matched;
      } catch (err) {
        console.error("Debt repayment lookup error:", err);
      }
    }

    let ledgerId: number | null = null;
    let reply = "";

    if (debtor) {
      const currentPaid = Number(debtor.amount_paid);
      const totalAmount = Number(debtor.total_amount);
      const newPaid = Math.min(totalAmount, currentPaid + payment);
      const newOwed = Math.max(0, totalAmount - newPaid);
      const newStatus = newOwed === 0 ? "settled" : "partially_paid";

      await supabase
        .from("customer_debts")
        .update({
          amount_paid: newPaid,
          amount_owed: newOwed,
          status: newStatus,
        })
        .eq("id", debtor.id);

      const { data: ledger } = await supabase
        .from("ledger_entries")
        .insert({
          tenant_id: tenant.id,
          type: "sale",
          amount: payment,
          item_description: `Debt repayment from ${debtor.customer_name}`,
          payment_method: method,
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          linked_message_id: waMsg.id,
          confidence_score: confidence,
        })
        .select("id")
        .single();

      ledgerId = ledger?.id ?? null;
      const receiptUrl = ledgerId ? getReceiptUrl(ledgerId) : null;

      reply =
        `✅ *Debt Payment Recorded!*\n` +
        `• Customer: *${debtor.customer_name}*\n` +
        `• Amount Paid: *${nf.format(payment)}* (${method.toUpperCase()})\n` +
        `• Remaining Balance: *${newOwed > 0 ? nf.format(newOwed) : "₦0 (Fully Settled! 🎉)"}*`;

      if (receiptUrl) {
        reply += `\n\n🧾 *Receipt for Customer:*\n${receiptUrl}`;
      }
    } else {
      const { data: ledger } = await supabase
        .from("ledger_entries")
        .insert({
          tenant_id: tenant.id,
          type: "sale",
          amount: payment,
          item_description: custName ? `Payment received from ${custName}` : "Customer payment",
          payment_method: method,
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          linked_message_id: waMsg.id,
          confidence_score: confidence,
        })
        .select("id")
        .single();

      ledgerId = ledger?.id ?? null;
      const receiptUrl = ledgerId ? getReceiptUrl(ledgerId) : null;

      reply = `✅ *Payment Recorded:* *${nf.format(payment)}* from *${custName || "Customer"}* (${method.toUpperCase()}).`;
      if (receiptUrl) {
        reply += `\n\n🧾 *Receipt:*\n${receiptUrl}`;
      }
    }

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "matched",
        linked_entry_id: ledgerId,
      })
      .eq("id", waMsg.id);

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7G: CREDIT SALE / CUSTOMER DEBT
  if ((entry_type === "debt" || (parsed.amount_owed && parsed.amount_owed > 0)) && confidence >= 0.7) {
    let productId = parsed.matched_product_id;
    let productName = parsed.matched_product_name;
    const qty = parsed.quantity ?? 1;
    const unit = parsed.unit ?? "pcs";
    const totalAmount = parsed.amount ?? (parsed.amount_paid ?? 0) + (parsed.amount_owed ?? 0);
    const amountPaid = parsed.amount_paid ?? Math.max(0, totalAmount - (parsed.amount_owed ?? 0));
    const amountOwed = parsed.amount_owed ?? Math.max(0, totalAmount - amountPaid);
    const customerName = (parsed.customer_name || "Customer").trim();
    const method = parsed.payment_method || "transfer";

    // Deduct stock if product matched
    if (productId && qty > 0) {
      await updateProductStock({
        supabase,
        tenantId: tenant.id,
        productId,
        changeQty: -qty,
        type: "out",
        source: isVoice ? "whatsapp_voice" : "whatsapp_text",
        linkedMessageId: waMsg.id,
        alertPhone: fromPhone,
        reason: `Credit sale to ${customerName}`,
      });
    }

    // Record in ledger
    const { data: ledger } = await supabase
      .from("ledger_entries")
      .insert({
        tenant_id: tenant.id,
        type: "sale",
        amount: totalAmount,
        item_description: productName
          ? `Sold ${qty} ${unit} of ${productName} to ${customerName}`
          : `Sale to ${customerName}`,
        product_id: productId,
        payment_method: method,
        source: isVoice ? "whatsapp_voice" : "whatsapp_text",
        linked_message_id: waMsg.id,
        confidence_score: confidence,
      })
      .select("id")
      .single();

    const ledgerId = ledger?.id ?? null;

    // Record debt
    try {
      await supabase.from("customer_debts").insert({
        tenant_id: tenant.id,
        customer_name: customerName,
        linked_entry_id: ledgerId,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        amount_owed: amountOwed,
        status: amountOwed === 0 ? "settled" : amountPaid > 0 ? "partially_paid" : "unpaid",
        notes: productName ? `${qty} ${unit} of ${productName}` : null,
      });
    } catch (err) {
      console.error("Failed to insert customer debt:", err);
    }

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "matched",
        linked_entry_id: ledgerId,
      })
      .eq("id", waMsg.id);

    const receiptUrl = ledgerId ? getReceiptUrl(ledgerId) : null;
    let reply =
      `📝 *Credit Sale Recorded!*\n` +
      `• Item: ${qty} ${unit} of *${productName ?? "item"}*\n` +
      `• Total Amount: *${nf.format(totalAmount)}*\n` +
      `• Paid Now: *${nf.format(amountPaid)}* (${method.toUpperCase()})\n` +
      `• Outstanding Debt: *${nf.format(amountOwed)}* (Owed by *${customerName}*)`;

    if (receiptUrl) {
      reply +=
        `\n\n🧾 *Customer Digital Receipt:*\n${receiptUrl}\n` +
        `_Copy & send this link to ${customerName} on WhatsApp!_`;
    }

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7H: STOCK IN / INVENTORY ADDITION / RESTOCK
  if (entry_type === "stock_in" && confidence >= 0.7) {
    let productId = parsed.matched_product_id;
    let productName = parsed.matched_product_name;
    const qty = parsed.quantity ?? 0;
    const unit = parsed.unit ?? "pcs";
    const unitCost =
      parsed.unit_cost ??
      (parsed.amount && qty > 0 ? Math.round(parsed.amount / qty) : null);
    const totalAmount =
      parsed.amount ?? (qty > 0 && unitCost ? qty * unitCost : null);

    // If new product (not in catalog yet), auto-create product with initial inventory
    if (!productId && (parsed.is_new_product || parsed.new_product_name)) {
      const newName = (parsed.new_product_name || parsed.matched_product_name || "New Product").trim();
      const { checkProductLimit } = await import("@/lib/billing-server");
      const pLimit = await checkProductLimit(tenant.id);

      if (!pLimit.allowed) {
        const reply = `Can't add "${newName}" — you've reached your product limit (${pLimit.currentCount}/${pLimit.maxProducts}). Upgrade your plan to add more.`;
        await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
        return;
      }

      const { data: createdProduct, error: pErr } = await supabase
        .from("products")
        .insert({
          tenant_id: tenant.id,
          name: newName,
          quantity: qty,
          unit,
          unit_cost: unitCost,
        })
        .select("id, name")
        .single();

      if (pErr || !createdProduct) {
        console.error("Failed to auto-create product:", pErr);
        const reply = `Could not create product "${newName}". Please try again or create it from the dashboard.`;
        await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
        return;
      }

      productId = createdProduct.id;
      productName = createdProduct.name;

      if (qty > 0) {
        await supabase.from("stock_movements").insert({
          tenant_id: tenant.id,
          product_id: productId,
          change_qty: qty,
          type: "in",
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          reason: "Initial stock via WhatsApp",
          linked_message_id: waMsg.id,
        });
      }
    } else if (productId) {
      if (qty > 0) {
        await updateProductStock({
          supabase,
          tenantId: tenant.id,
          productId,
          changeQty: qty,
          type: "in",
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          linkedMessageId: waMsg.id,
          alertPhone: fromPhone,
          reason: "Restocked via WhatsApp",
        });
      }
      if (unitCost != null) {
        await supabase
          .from("products")
          .update({ unit_cost: unitCost })
          .eq("id", productId);
      }
    }

    let ledgerId: number | null = null;
    if (totalAmount && totalAmount > 0) {
      const { data: ledger } = await supabase
        .from("ledger_entries")
        .insert({
          tenant_id: tenant.id,
          type: "expense",
          amount: totalAmount,
          item_description: `Inventory restock: ${qty} ${unit} of ${productName}`,
          product_id: productId,
          payment_method: parsed.payment_method || "transfer",
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          linked_message_id: waMsg.id,
          confidence_score: confidence,
        })
        .select("id")
        .single();

      ledgerId = ledger?.id ?? null;
    }

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "matched",
        linked_entry_id: ledgerId,
      })
      .eq("id", waMsg.id);

    let reply = `📦 *Stock Added:* +${qty} ${unit} of *${productName}*.`;
    if (totalAmount && totalAmount > 0) {
      reply += ` Recorded purchase cost of *${nf.format(totalAmount)}*.`;
    }

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7I: GENERAL BUSINESS EXPENSE
  if (entry_type === "expense" && confidence >= 0.75 && parsed.amount && parsed.amount > 0) {
    const desc =
      parsed.matched_product_name ||
      parsed.new_product_name ||
      "General business expense";

    const method = parsed.payment_method || "cash";

    const { data: ledger } = await supabase
      .from("ledger_entries")
      .insert({
        tenant_id: tenant.id,
        type: "expense",
        amount: parsed.amount,
        item_description: desc,
        product_id: parsed.matched_product_id ?? null,
        payment_method: method,
        source: isVoice ? "whatsapp_voice" : "whatsapp_text",
        linked_message_id: waMsg.id,
        confidence_score: confidence,
      })
      .select("id")
      .single();

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "matched",
        linked_entry_id: ledger?.id ?? null,
      })
      .eq("id", waMsg.id);

    const reply = `💸 *Recorded Expense:* ${desc} — *${nf.format(parsed.amount)}* (${method.toUpperCase()})`;
    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7J: RECORD SALE
  if (entry_type === "sale" && confidence >= 0.75) {
    let productId = parsed.matched_product_id;
    let productName = parsed.matched_product_name;
    const qty = parsed.quantity ?? 1;
    const unit = parsed.unit ?? "pcs";
    const amount = parsed.amount ?? 0;
    const method = parsed.payment_method || "transfer";

    // If new item not in catalog yet, auto-create it
    if (!productId && (parsed.is_new_product || parsed.new_product_name)) {
      const newName = (parsed.new_product_name || "New Item").trim();
      const { checkProductLimit } = await import("@/lib/billing-server");
      const pLimit = await checkProductLimit(tenant.id);

      if (pLimit.allowed) {
        const { data: createdProduct } = await supabase
          .from("products")
          .insert({
            tenant_id: tenant.id,
            name: newName,
            quantity: 0,
            unit,
          })
          .select("id, name")
          .single();

        if (createdProduct) {
          productId = createdProduct.id;
          productName = createdProduct.name;
        }
      }
    }

    const { data: ledger } = await supabase
      .from("ledger_entries")
      .insert({
        tenant_id: tenant.id,
        type: "sale",
        amount,
        item_description: productName ? `Sold ${qty} ${unit} of ${productName}` : "Sale",
        product_id: productId,
        payment_method: method,
        source: isVoice ? "whatsapp_voice" : "whatsapp_text",
        linked_message_id: waMsg.id,
        confidence_score: confidence,
      })
      .select("id")
      .single();

    if (productId && qty > 0) {
      await updateProductStock({
        supabase,
        tenantId: tenant.id,
        productId,
        changeQty: -qty,
        type: "out",
        source: isVoice ? "whatsapp_voice" : "whatsapp_text",
        linkedMessageId: waMsg.id,
        alertPhone: fromPhone,
        reason: "Sale via WhatsApp",
      });
    }

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "matched",
        linked_entry_id: ledger?.id ?? null,
      })
      .eq("id", waMsg.id);

    const receiptUrl = ledger?.id ? getReceiptUrl(ledger.id) : null;
    let reply = `Got it! Sold ${qty} ${unit} of *${productName ?? "item"}* (*${nf.format(amount)}*) via ${method.toUpperCase()}.`;
    if (receiptUrl) {
      reply += `\n\n🧾 *Customer Receipt:*\n${receiptUrl}`;
    }

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7K: LOW CONFIDENCE OR UNCLEAR FALLBACK
  await supabase
    .from("whatsapp_messages")
    .update({ status: "pending_confirmation" })
    .eq("id", waMsg.id);

  const fallbackMsg =
    parsed.clarification_needed ||
    "Sorry, I couldn't understand that. Could you please rephrase or specify product and amount?";

  await replyToUser(supabase, tenant.id, fromPhone, fallbackMsg, senderMemberId);
}
