import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizePhone, sendTextMessage, sendTemplateMessage } from "@/lib/whatsapp";
import { parseMessage, ParsedEntry, ChatMessage } from "@/lib/deepseek";
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
import { generateMagicLoginToken } from "@/lib/magic-auth-server";
import {
  parsePackagingUnits,
  resolveUnitMultiplier,
  formatStockBreakdown,
  normalizeUnitName,
} from "@/lib/packaging";
import {
  findBestCatalogMatches,
  parseNewProductCatalogingReply,
} from "@/lib/tenant";

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

const BULK_UNITS = [
  "carton",
  "cartons",
  "pack",
  "packs",
  "crate",
  "crates",
  "bundle",
  "bundles",
  "box",
  "boxes",
  "roll",
  "rolls",
  "bag",
  "bags",
];

/**
 * Fast deterministic intent detection for common queries and commands.
 * Runs instantly without waiting for LLM completion.
 */
function detectFastIntent(
  text: string,
): "debt_check" | "daily_summary" | "weekly_summary" | "stock_check" | "help" | "magic_login" | "undo_last" | null {
  const t = text.trim().toLowerCase().replace(/[?!.,]/g, "").replace(/\s+/g, " ");

  // 1. Debt check: "who is owing me", "who is owning me", "who dey owe me", "who dey own me", "who owe me",
  // "debtors", "debtors list", "check debtors", "show debtors", "show my debtors", "my debtors", "debts",
  // "anybody owing me", "anybody owning me", "people owing me", "people owning me", "how much debts are people owning me"
  if (
    /(who\s+(?:is\s+)?(?:owing|owning|dey\s+owe|owe|dey\s+own)\s*(?:me(?:\s+money)?)?|debtors?|debtors?\s+list|show\s+(?:me\s+)?debtors?|check\s+debts?|unpaid\s+debts?|anybody\s+(?:owing|owning)(?:\s+me)?|list\s+of\s+debtors|customer\s+debts?|who\s+dey\s+owe|who\s+dey\s+own|people\s+(?:owing|owning)\s*me|debts\s+are\s+people\s+(?:owing|owning))/i.test(t) ||
    /^(who\s+(?:is\s+)?(?:owing|owning|dey\s+owe|owe)\s*me)/i.test(t) ||
    /^(show|check|get|list)\s+(?:all\s+)?(?:my\s+)?debtors/i.test(t)
  ) {
    return "debt_check";
  }

  // 2. Daily summary: "today summary", "today's summary", "closing report", "daily summary", "today sales", "sales today", "how much did i sell today", "closing"
  if (
    /^(today(?:'s)?\s+(?:summary|sales|report)|closing\s+report|daily\s+summary|how\s+much\s+(?:did\s+i\s+sell\s+)?today|sales\s+today|today\s+p&?l|closing\s+summary|close\s+today)$/i.test(t)
  ) {
    return "daily_summary";
  }

  // 3. Weekly summary: "weekly summary", "weekly report", "this week sales", "how much this week"
  if (
    /^(weekly\s+(?:summary|report|sales)|this\s+week(?:'s)?\s+sales|how\s+much\s+(?:did\s+i\s+sell\s+)?this\s+week)$/i.test(t)
  ) {
    return "weekly_summary";
  }

  // 4. Stock check: "check stock", "stock list", "all stock", "show stock", "view stock", "what do i have in my stock", "what is my inventory"
  if (
    /^(check\s+stock|stock\s+list|all\s+stock|show\s+stock|view\s+stock|inventory\s+list|how\s+many\s+stock|what\s+(?:do\s+i\s+have\s+in\s+)?(?:my\s+)?stock|what\s+is\s+my\s+inventory|my\s+stock|check\s+inventory|view\s+inventory|show\s+inventory|wetin\s+(?:remain|i\s+get)\s+(?:for\s+stock)?)$/i.test(t) ||
    /what\s+(?:do\s+i\s+have\s+in\s+)?(?:my\s+)?stock/i.test(t) ||
    /what\s+is\s+my\s+inventory/i.test(t)
  ) {
    return "stock_check";
  }

  // 5. Help / Greeting: "help", "menu", "hi", "hello", "hey"
  if (/^(help|menu|hi|hello|hey|how\s+does\s+this\s+work)$/i.test(t)) {
    return "help";
  }

  // 6. Magic login / Web dashboard: "login", "dashboard", "portal", "sign in"
  if (
    /^(login|log in|dashboard|portal|web dashboard|my dashboard|open dashboard|view dashboard|sign in|website)$/i.test(t)
  ) {
    return "magic_login";
  }

  // 7. Undo / Mistake / Cancellation: "this is not correct", "that is wrong", "undo", "cancel last", "delete last", "mistake", "cancel that", "wrong"
  if (
    /^(this\s+is\s+not\s+correct|that(?:'s|\s+is)\s+wrong|not\s+correct|wrong|undo|cancel\s+last|delete\s+last|mistake|cancel\s+that|remove\s+last|error)$/i.test(t) ||
    /^(this\s+is\s+not\s+correct|that\s+is\s+wrong|undo\s+last|cancel\s+last)/i.test(t)
  ) {
    return "undo_last";
  }

  return null;
}

/**
 * Parse response to pack size & restock cost clarification.
 * Handles answers like "40", "40 pcs", "40 pieces, 60k", "40 pcs, 30k each", "60,000 for 40 pcs"
 */
function parsePackClarificationReply(
  text: string,
  rawQty: number,
  existingAmount?: number | null,
  existingUnitCost?: number | null,
): { packSize: number | null; totalCost: number | null } {
  let packSize: number | null = null;
  let totalCost: number | null = existingAmount ?? (existingUnitCost ? existingUnitCost * rawQty : null);

  const clean = text.trim();

  // 1. Look for cost with 'k' (e.g. 50k, 25k each, for 36k)
  const kMatch = clean.match(/(?:cost|bought|at|for|total|price)?\s*(?:₦|ngn)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const val = parseFloat(kMatch[1]) * 1000;
    if (/each|per\s+(?:carton|pack|box|bundle|crate|roll|bag)/i.test(clean)) {
      totalCost = val * rawQty;
    } else {
      totalCost = val;
    }
  }

  // 2. Look for currency sign ₦ or NGN or price with comma or explicit "for 36000"
  if (!kMatch) {
    const forPriceMatch = clean.match(/(?:for|at|cost|price|total)\s*(?:₦|ngn)?\s*(\d[\d,]*(?:\.\d+)?)/i);
    const nairaMatch = clean.match(/(?:₦|ngn)\s*(\d[\d,]*(?:\.\d+)?)/i);
    const priceTarget = forPriceMatch || nairaMatch;
    if (priceTarget) {
      const val = parseFloat(priceTarget[1].replace(/,/g, ""));
      if (val >= 100) {
        if (/each|per\s+(?:carton|pack|box|bundle|crate|roll|bag)/i.test(clean)) {
          totalCost = val * rawQty;
        } else {
          totalCost = val;
        }
      }
    }
  }

  // 3. Nigerian market quantity units: "dozen", "dozens", "gross", "half dozen"
  const dozenMatch = clean.match(/(\d+(?:\.\d+)?)\s*dozens?\b/i);
  const halfDozenMatch = /\bhalf\s*dozen\b/i.test(clean);
  const grossMatch = clean.match(/(\d+(?:\.\d+)?)\s*gross\b/i);

  if (halfDozenMatch) {
    packSize = 6;
  } else if (dozenMatch) {
    const dozCount = parseFloat(dozenMatch[1]);
    const totalDozPcs = dozCount * 12;

    // Check if the user is stating total quantity or per-pack size:
    // e.g. user bought 24 packs, and says "It is 2 dozens for 36000":
    // 2 dozens = 24 items. That means the 24 packs ARE the 24 pieces (1 pack = 1 pc retail unit)!
    if (rawQty > 0 && Math.abs(totalDozPcs - rawQty) <= 1) {
      packSize = 1;
    } else if (rawQty > 0 && totalDozPcs > rawQty && totalDozPcs % rawQty === 0) {
      // e.g. bought 2 cartons, says "2 dozens" (24 pcs) -> 24 / 2 = 12 pcs per carton
      packSize = Math.round(totalDozPcs / rawQty);
    } else if (/per\s+(?:pack|carton)|in\s+(?:a\s+pack|1\s+pack|a\s+carton|1\s+carton)/i.test(clean)) {
      packSize = totalDozPcs;
    } else if (rawQty === 1) {
      packSize = totalDozPcs;
    } else {
      packSize = 12;
    }
  } else if (grossMatch) {
    const grossCount = parseFloat(grossMatch[1]);
    const totalGrossPcs = grossCount * 144;
    if (rawQty > 0 && Math.abs(totalGrossPcs - rawQty) <= 1) {
      packSize = 1;
    } else if (rawQty > 0 && totalGrossPcs > rawQty && totalGrossPcs % rawQty === 0) {
      packSize = Math.round(totalGrossPcs / rawQty);
    } else {
      packSize = 144;
    }
  }

  // 4. Look for expressions like "10packs is 10" or "pack is 12" or "1 carton has 40"
  if (!packSize) {
    const relationMatch = clean.match(/\b(?:\d+\s*packs?\s*(?:is|=|has)|pack\s*(?:is|=|has)|carton\s*(?:is|=|has))\s*(\d+)\b/i);
    if (relationMatch) {
      packSize = parseFloat(relationMatch[1]);
    }
  }

  // 5. Look for explicit pieces indicator: e.g. "40 pcs", "40 pieces", "40 per carton"
  if (!packSize) {
    const pcsMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:pcs|pieces|piece|pk|items|units|per\s+(?:carton|pack|box))/i);
    if (pcsMatch) {
      packSize = parseFloat(pcsMatch[1]);
    }
  }

  // 6. Inspect remaining numeric tokens in the string for packSize or cost
  const allNums = clean.match(/\b\d[\d,]*(?:\.\d+)?\b/g);
  if (allNums) {
    for (const numStr of allNums) {
      const val = parseFloat(numStr.replace(/,/g, ""));
      if (isNaN(val) || val <= 0) continue;

      if (totalCost && (val === totalCost || val === Math.round(totalCost / rawQty) || val === Math.round(totalCost / 1000))) {
        continue;
      }

      // If it's a large number (>= 1000) and we don't have totalCost yet, it's cost
      if (val >= 1000 && !totalCost) {
        if (/each|per\s+(?:carton|pack|box|bundle|crate|roll|bag)/i.test(clean)) {
          totalCost = val * rawQty;
        } else {
          totalCost = val;
        }
      } else if (!packSize && val > 0 && val < 5000) {
        // If the number matches the word "dozens", don't set raw dozen count as piece count
        if (clean.toLowerCase().includes("dozen")) continue;
        packSize = val;
      }
    }
  }

  return { packSize, totalCost };
}

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

  // ── Dispatch background async processing and acknowledge Meta within <100ms ──
  // Next.js after() keeps the serverless runtime active while Meta receives an instant 200 OK.
  after(async () => {
    try {
      await processMessageAsync(body);
    } catch (err) {
      console.error("WhatsApp message processing error:", err);
    }
  });

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

  // Update tenant's last activity timestamp for partner CRM monitoring
  try {
    await supabase
      .from("tenants")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", tenant.id);
  } catch (err) {
    console.warn("Could not update tenant last_activity_at:", err);
  }

  const nf = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  });

  // ── 4b. CHECK FOR PENDING INTERACTIVE REPLIES (e.g. Pack Size Clarification) ──
  try {
    let pendingQuery = supabase
      .from("whatsapp_messages")
      .select("id, metadata, created_at, sender_member_id")
      .eq("tenant_id", tenant.id)
      .eq("status", "pending_confirmation")
      .not("metadata->pending_action", "is", null)
      .gte("created_at", new Date(Date.now() - 20 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (senderMemberId) {
      pendingQuery = pendingQuery.or(`sender_member_id.eq.${senderMemberId},sender_member_id.is.null`);
    }

    const { data: pendingPackMsg } = await pendingQuery.maybeSingle();

    if (pendingPackMsg && pendingPackMsg.metadata) {
      const meta = pendingPackMsg.metadata as {
        pending_action?: string;
        product_id?: number | null;
        product_name?: string;
        candidate_id?: number | null;
        candidate_name?: string;
        raw_product_name?: string;
        raw_qty?: number;
        unit?: string;
        unit_cost?: number | null;
        amount?: number | null;
        payment_method?: "transfer" | "cash" | "pos" | "other" | null;
        customer_name?: string | null;
        is_new_product?: boolean;
        is_credit_sale?: boolean;
        amount_paid?: number | null;
        amount_owed?: number | null;
      };

      if (meta.pending_action === "pack_size_clarification" && (meta.product_id || meta.product_name) && meta.raw_qty) {
        // User wants to cancel
        if (rawText && /^(cancel|nevermind|abort|stop|leave it|forget it|undo|don't record|dont record|cancel (?:sale|restock))\b/i.test(rawText.trim())) {
          await supabase
            .from("whatsapp_messages")
            .update({ status: "failed" })
            .eq("id", pendingPackMsg.id);
          await supabase
            .from("whatsapp_messages")
            .update({ status: "matched" })
            .eq("id", waMsg.id);
          await replyToUser(supabase, tenant.id, fromPhone, "Restock cancelled.", senderMemberId);
          return;
        }

        const { packSize, totalCost } = parsePackClarificationReply(
          rawText || "",
          meta.raw_qty,
          meta.amount,
          meta.unit_cost,
        );

        if (packSize && packSize > 0) {
          const totalPcs = meta.raw_qty * packSize;
          const perPieceCost = totalCost && totalPcs > 0
            ? Math.round(totalCost / totalPcs)
            : meta.unit_cost
            ? Math.round(meta.unit_cost / packSize)
            : null;

          let targetProductId = meta.product_id ?? null;
          let targetProductName = meta.product_name || "New Product";

          // If product did not exist in catalog, create it now
          if (!targetProductId) {
            const { checkProductLimit } = await import("@/lib/billing-server");
            const pLimit = await checkProductLimit(tenant.id);
            if (!pLimit.allowed) {
              const reply = `Can't add "${targetProductName}" — you've reached your product limit (${pLimit.currentCount}/${pLimit.maxProducts}). Upgrade your plan to add more.`;
              await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
              return;
            }

            const { data: createdProduct, error: pErr } = await supabase
              .from("products")
              .insert({
                tenant_id: tenant.id,
                name: targetProductName,
                quantity: totalPcs,
                unit: "pcs",
                unit_cost: perPieceCost,
                pieces_per_pack: packSize,
                is_service: false,
              })
              .select("id, name")
              .single();

            if (pErr || !createdProduct) {
              console.error("Failed to auto-create product from pack clarification:", pErr);
              const reply = `Could not create product "${targetProductName}". Please try again or create it from the dashboard.`;
              await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
              return;
            }

            targetProductId = createdProduct.id;
            targetProductName = createdProduct.name;

            await supabase.from("stock_movements").insert({
              tenant_id: tenant.id,
              product_id: targetProductId,
              change_qty: totalPcs,
              type: "in",
              source: isVoice ? "whatsapp_voice" : "whatsapp_text",
              reason: `Initial stock: ${meta.raw_qty} ${meta.unit || "carton(s)"} (${packSize} pcs/carton)`,
              linked_message_id: waMsg.id,
            });
          } else {
            // Existing product: update pieces_per_pack
            await supabase
              .from("products")
              .update({ pieces_per_pack: packSize, unit: "pcs" })
              .eq("id", targetProductId);

            await updateProductStock({
              supabase,
              tenantId: tenant.id,
              productId: targetProductId,
              changeQty: totalPcs,
              type: "in",
              source: isVoice ? "whatsapp_voice" : "whatsapp_text",
              linkedMessageId: waMsg.id,
              alertPhone: fromPhone,
              reason: `Restocked ${meta.raw_qty} ${meta.unit || "cartons"} (${packSize} pcs/carton)`,
            });

            if (perPieceCost != null) {
              await supabase
                .from("products")
                .update({ unit_cost: perPieceCost })
                .eq("id", targetProductId);
            }
          }

          let ledgerId: number | null = null;
          if (totalCost && totalCost > 0) {
            const { data: ledger } = await supabase
              .from("ledger_entries")
              .insert({
                tenant_id: tenant.id,
                type: "expense",
                amount: totalCost,
                item_description: `Inventory restock: ${meta.raw_qty} ${meta.unit || "carton(s)"} (${totalPcs} pcs) of ${targetProductName}`,
                product_id: targetProductId,
                source: isVoice ? "whatsapp_voice" : "whatsapp_text",
                linked_message_id: waMsg.id,
                confidence_score: 1.0,
              })
              .select("id")
              .single();

            ledgerId = ledger?.id ?? null;
          }

          await supabase
            .from("whatsapp_messages")
            .update({ status: "matched", linked_entry_id: ledgerId })
            .eq("id", pendingPackMsg.id);

          await supabase
            .from("whatsapp_messages")
            .update({ status: "matched", linked_entry_id: ledgerId })
            .eq("id", waMsg.id);

          const costStr = totalCost
            ? ` Recorded purchase cost of *${nf.format(totalCost)}* (${nf.format(perPieceCost ?? 0)}/pc).`
            : "";
          const reply =
            `✅ *Saved & Restocked!*\n` +
            `• *${targetProductName}*: 1 ${meta.unit || "carton"} = *${packSize} pcs* (saved to catalog)\n` +
            `• Added *+${totalPcs} pcs* to your stock.${costStr}\n\n` +
            `_I will remember this pack size for future restocks!_ 🚀`;

          await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
          return;
        }
      }

      // Handle missing sale price clarification
      if (meta.pending_action === "sale_price_clarification" && (meta.product_id || meta.product_name)) {
        if (rawText && /^(cancel|nevermind|abort|stop|leave it|forget it|undo|don't record|dont record|cancel (?:sale|restock))\b/i.test(rawText.trim())) {
          await supabase
            .from("whatsapp_messages")
            .update({ status: "failed" })
            .eq("id", pendingPackMsg.id);
          await supabase
            .from("whatsapp_messages")
            .update({ status: "matched" })
            .eq("id", waMsg.id);
          await replyToUser(supabase, tenant.id, fromPhone, "Sale cancelled.", senderMemberId);
          return;
        }

        const cleanReply = (rawText || "").trim();
        let saleAmount: number | null = null;
        let detectedMethod: "transfer" | "cash" | "pos" | null = null;

        if (/transfer|opay|moniepoint|kuda|bank/i.test(cleanReply)) detectedMethod = "transfer";
        else if (/cash/i.test(cleanReply)) detectedMethod = "cash";
        else if (/pos|card/i.test(cleanReply)) detectedMethod = "pos";

        const kMatch = cleanReply.match(/(?:₦|ngn)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
        if (kMatch) {
          saleAmount = parseFloat(kMatch[1]) * 1000;
        } else {
          const numMatch = cleanReply.match(/(?:₦|ngn)?\s*(\d[\d,]*(?:\.\d+)?)/i);
          if (numMatch) {
            saleAmount = parseFloat(numMatch[1].replace(/,/g, ""));
          }
        }

        if (saleAmount && saleAmount > 0) {
          let targetProductId = meta.product_id ?? null;
          let targetProductName = meta.product_name || "New Item";
          const qty = meta.raw_qty ?? 1;
          const unit = meta.unit ?? "pcs";
          const method = detectedMethod || meta.payment_method || null;
          const methodTag = method ? ` (${method.toUpperCase()})` : "";

          if (!targetProductId && targetProductName) {
            const { data: catList } = await supabase
              .from("products")
              .select("id, name, unit, unit_cost, quantity, is_service")
              .eq("tenant_id", tenant.id)
              .is("deleted_at", null);

            const catCandidates = (catList ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              quantity: Number(c.quantity ?? 0),
              unit: c.unit,
              unit_cost: c.unit_cost,
              is_service: c.is_service,
            }));

            const matchResult = findBestCatalogMatches(targetProductName, catCandidates);

            if (matchResult.exactMatch) {
              targetProductId = matchResult.exactMatch.id;
              targetProductName = matchResult.exactMatch.name;
            } else if (matchResult.fuzzyCandidates.length > 0) {
              const topCandidate = matchResult.fuzzyCandidates[0].item;
              await supabase
                .from("whatsapp_messages")
                .update({
                  metadata: {
                    ...meta,
                    pending_action: "fuzzy_product_clarification",
                    candidate_id: topCandidate.id,
                    candidate_name: topCandidate.name,
                    raw_product_name: targetProductName,
                    amount: saleAmount,
                    payment_method: method,
                  },
                })
                .eq("id", pendingPackMsg.id);

              await supabase.from("whatsapp_messages").update({ status: "matched" }).eq("id", waMsg.id);

              const stockStr = `${topCandidate.quantity} ${topCandidate.unit} in stock`;
              const reply =
                `Got it, *${nf.format(saleAmount)}*! 💰\n\n` +
                `🔍 I couldn't find *"${targetProductName}"*, but found *${topCandidate.name}* in your catalog (${stockStr}).\n\n` +
                `Did you mean *${topCandidate.name}*?\n` +
                `1️⃣ *Yes* — Record sale & deduct stock\n` +
                `2️⃣ *No* — This is a new product\n\n` +
                `_(Reply **1** or **2**)_`;

              await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
              return;
            } else {
              await supabase
                .from("whatsapp_messages")
                .update({
                  metadata: {
                    ...meta,
                    pending_action: "new_product_cataloging",
                    product_name: targetProductName,
                    amount: saleAmount,
                    payment_method: method,
                  },
                })
                .eq("id", pendingPackMsg.id);

              await supabase.from("whatsapp_messages").update({ status: "matched" }).eq("id", waMsg.id);

              const reply =
                `Got it, *${nf.format(saleAmount)}*! 💰\n\n` +
                `⚠️ *"${targetProductName}"* is not in your product catalog yet!\n\n` +
                `To track your stock and calculate your profit on this sale, let's add it quickly:\n\n` +
                `📦 *How many do you have in stock, and what did you buy each?*\n` +
                `_(Reply e.g.: **"12 in stock, cost 6000"**)_\n\n` +
                `💡 _Or reply **SKIP** to record without stock tracking._`;

              await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
              return;
            }
          }

          let qtyToDeduct = qty;
          let isProdService = false;
          let prodBaseUnit = "pcs";

          if (targetProductId) {
            const { data: prodInfo } = await supabase
              .from("products")
              .select("is_service, pieces_per_pack, packaging_units, unit")
              .eq("id", targetProductId)
              .maybeSingle();

            isProdService = Boolean(prodInfo?.is_service);
            prodBaseUnit = prodInfo?.unit || "pcs";
            const pkgUnits = parsePackagingUnits(prodInfo?.packaging_units, prodInfo?.pieces_per_pack != null ? Number(prodInfo.pieces_per_pack) : null);
            const mult = resolveUnitMultiplier(unit, pkgUnits, prodInfo?.unit || "pcs", prodInfo?.pieces_per_pack).multiplier;
            qtyToDeduct = qty * mult;

            if (qtyToDeduct > 0 && !isProdService) {
              await updateProductStock({
                supabase,
                tenantId: tenant.id,
                productId: targetProductId,
                changeQty: -qtyToDeduct,
                type: "out",
                source: isVoice ? "whatsapp_voice" : "whatsapp_text",
                linkedMessageId: waMsg.id,
                alertPhone: fromPhone,
                reason: `Sale of ${qty} ${unit} via WhatsApp`,
              });
            }
          }

          const desc = (meta as any).customer_name
            ? `Sold ${qty} ${unit} of ${targetProductName} to ${(meta as any).customer_name}`
            : `Sold ${qty} ${unit} of ${targetProductName}`;

          const { data: ledger } = await supabase
            .from("ledger_entries")
            .insert({
              tenant_id: tenant.id,
              type: "sale",
              amount: saleAmount,
              item_description: desc,
              product_id: targetProductId,
              payment_method: method,
              customer_name: (meta as any).customer_name || null,
              source: isVoice ? "whatsapp_voice" : "whatsapp_text",
              linked_message_id: waMsg.id,
              confidence_score: 1.0,
            })
            .select("id")
            .single();

          const ledgerId = ledger?.id ?? null;

          await supabase
            .from("whatsapp_messages")
            .update({ status: "matched", linked_entry_id: ledgerId })
            .eq("id", pendingPackMsg.id);

          await supabase
            .from("whatsapp_messages")
            .update({ status: "matched", linked_entry_id: ledgerId })
            .eq("id", waMsg.id);

          const receiptUrl = ledgerId ? getReceiptUrl(ledgerId) : null;
          const unitBreakdown = qtyToDeduct !== qty ? ` (${qtyToDeduct} ${prodBaseUnit})` : "";
          const custNote = (meta as any).customer_name ? ` to *${(meta as any).customer_name}*` : "";

          let reply = `Got it! Sold ${qty} ${unit}${unitBreakdown} of *${targetProductName}* (*${nf.format(saleAmount)}*)${custNote}${methodTag}.`;
          if (receiptUrl) {
            reply += `\n\n🧾 *Customer Receipt:*\n${receiptUrl}`;
          }

          await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
          return;
        }
      }

      // ── Handle Spelling / Fuzzy Product Clarification ("Did you mean...?") ──
      if (meta.pending_action === "fuzzy_product_clarification" && meta.candidate_id) {
        if (rawText && /^(cancel|nevermind|abort|stop|leave it|forget it|undo|don't record|dont record|cancel sale)\b/i.test(rawText.trim())) {
          await supabase.from("whatsapp_messages").update({ status: "failed" }).eq("id", pendingPackMsg.id);
          await supabase.from("whatsapp_messages").update({ status: "matched" }).eq("id", waMsg.id);
          await replyToUser(supabase, tenant.id, fromPhone, "Sale cancelled.", senderMemberId);
          return;
        }

        const replyTrim = (rawText || "").trim().toLowerCase();
        const isConfirmMatch =
          /^(1|yes|y|yeah|yep|correct|sure|ok|confirm|true)\b/i.test(replyTrim) ||
          /\b(option 1|that's it|thats it)\b/i.test(replyTrim);
        const isRejectMatch =
          /^(2|no|n|new|nope|neither|different|false)\b/i.test(replyTrim) ||
          /\b(option 2|new product|new item|neither|different product|not that)\b/i.test(replyTrim);

        if (isConfirmMatch) {
          const targetProductId = meta.candidate_id;
          let targetProductName = meta.candidate_name || "item";
          const qty = meta.raw_qty ?? 1;
          const unit = meta.unit ?? "pcs";
          const saleAmount = meta.amount ?? 0;
          const method = meta.payment_method ?? null;
          const methodTag = method ? ` (${method.toUpperCase()})` : "";
          const isCredit = Boolean(meta.is_credit_sale);

          let qtyToDeduct = qty;
          let isProdService = false;
          let prodBaseUnit = "pcs";

          const { data: prodInfo } = await supabase
            .from("products")
            .select("name, unit, unit_cost, quantity, is_service, pieces_per_pack, packaging_units")
            .eq("id", targetProductId)
            .maybeSingle();

          if (prodInfo) {
            targetProductName = prodInfo.name;
            isProdService = Boolean(prodInfo.is_service);
            prodBaseUnit = prodInfo.unit || "pcs";
            const pkgUnits = parsePackagingUnits(prodInfo.packaging_units, prodInfo.pieces_per_pack != null ? Number(prodInfo.pieces_per_pack) : null);
            const mult = resolveUnitMultiplier(unit, pkgUnits, prodInfo.unit || "pcs", prodInfo.pieces_per_pack).multiplier;
            qtyToDeduct = qty * mult;

            if (qtyToDeduct > 0 && !isProdService) {
              await updateProductStock({
                supabase,
                tenantId: tenant.id,
                productId: targetProductId,
                changeQty: -qtyToDeduct,
                type: "out",
                source: isVoice ? "whatsapp_voice" : "whatsapp_text",
                linkedMessageId: waMsg.id,
                alertPhone: fromPhone,
                reason: `Sale of ${qty} ${unit} via WhatsApp (confirmed spelling)`,
              });
            }
          }

          const desc = meta.customer_name
            ? `Sold ${qty} ${unit} of ${targetProductName} to ${meta.customer_name}`
            : `Sold ${qty} ${unit} of ${targetProductName}`;

          const { data: ledger } = await supabase
            .from("ledger_entries")
            .insert({
              tenant_id: tenant.id,
              type: "sale",
              amount: saleAmount,
              item_description: desc,
              product_id: targetProductId,
              payment_method: method,
              customer_name: meta.customer_name || null,
              source: isVoice ? "whatsapp_voice" : "whatsapp_text",
              linked_message_id: waMsg.id,
              confidence_score: 1.0,
            })
            .select("id")
            .single();

          const ledgerId = ledger?.id ?? null;

          if (isCredit) {
            try {
              const amountPaid = meta.amount_paid ?? 0;
              const amountOwed = meta.amount_owed ?? Math.max(0, saleAmount - amountPaid);
              await supabase.from("customer_debts").insert({
                tenant_id: tenant.id,
                customer_name: meta.customer_name || "Customer",
                linked_entry_id: ledgerId,
                total_amount: saleAmount,
                amount_paid: amountPaid,
                amount_owed: amountOwed,
                status: amountOwed === 0 ? "settled" : amountPaid > 0 ? "partially_paid" : "unpaid",
                notes: `${qty} ${unit} of ${targetProductName}`,
              });
            } catch (err) {
              console.error("Failed to insert customer debt:", err);
            }
          }

          await supabase.from("whatsapp_messages").update({ status: "matched", linked_entry_id: ledgerId }).eq("id", pendingPackMsg.id);
          await supabase.from("whatsapp_messages").update({ status: "matched", linked_entry_id: ledgerId }).eq("id", waMsg.id);

          const receiptUrl = ledgerId ? getReceiptUrl(ledgerId) : null;
          const newStock = prodInfo && !isProdService ? Number(prodInfo.quantity) - qtyToDeduct : null;
          const stockNote = newStock != null ? ` (${newStock} ${prodBaseUnit} remaining in stock)` : "";
          const custNote = meta.customer_name ? ` to *${meta.customer_name}*` : "";

          let reply = `✅ *Sale Recorded for ${targetProductName}!*${custNote}\n• Quantity: *${qty} ${unit}*${stockNote}\n• Amount: *${nf.format(saleAmount)}*${methodTag}`;
          if (isCredit) {
            const amountPaid = meta.amount_paid ?? 0;
            const amountOwed = meta.amount_owed ?? Math.max(0, saleAmount - amountPaid);
            reply += `\n• 👤 Customer Debt: *${meta.customer_name || "Customer"}* owes *${nf.format(amountOwed)}* (Paid: ${nf.format(amountPaid)})`;
          }
          if (receiptUrl) {
            reply += `\n\n🧾 *Customer Receipt:*\n${receiptUrl}`;
          }

          await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
          return;
        }

        if (isRejectMatch) {
          const rawName = meta.raw_product_name || "item";
          await supabase
            .from("whatsapp_messages")
            .update({
              metadata: {
                ...meta,
                pending_action: "new_product_cataloging",
                product_name: rawName,
              },
            })
            .eq("id", pendingPackMsg.id);

          await supabase.from("whatsapp_messages").update({ status: "matched" }).eq("id", waMsg.id);

          const prompt =
            `Got it, *"${rawName}"* is a new product! 👍\n\n` +
            `📦 *How many do you have in stock, and what did you buy each?*\n` +
            `_(Reply e.g.: **"12 in stock, cost 6000"** or reply **SKIP** to record without stock tracking)_`;

          await replyToUser(supabase, tenant.id, fromPhone, prompt, senderMemberId);
          return;
        }

        // Neither 1 nor 2: check if user sent a new command or re-prompt
        const hasNewIntent = Boolean(detectFastIntent(rawText || "") || /\b(sold|bought|restock|expense|paid|transfer|cash)\b/i.test(rawText || ""));
        if (hasNewIntent) {
          await supabase.from("whatsapp_messages").update({ status: "failed" }).eq("id", pendingPackMsg.id);
        } else {
          const candidateName = meta.candidate_name || "the item";
          const rePrompt =
            `Please reply:\n` +
            `1️⃣ *Yes* — to confirm *${candidateName}*\n` +
            `2️⃣ *No* — if this is a new product\n` +
            `Or reply *CANCEL* to discard the sale.`;
          await replyToUser(supabase, tenant.id, fromPhone, rePrompt, senderMemberId);
          return;
        }
      }

      // ── Handle New Product Fast WhatsApp Cataloging ──
      if (meta.pending_action === "new_product_cataloging" && meta.product_name) {
        const parsedReply = parseNewProductCatalogingReply(rawText || "");

        if (parsedReply.isCancel) {
          await supabase.from("whatsapp_messages").update({ status: "failed" }).eq("id", pendingPackMsg.id);
          await supabase.from("whatsapp_messages").update({ status: "matched" }).eq("id", waMsg.id);
          await replyToUser(supabase, tenant.id, fromPhone, "Sale cancelled.", senderMemberId);
          return;
        }

        if (parsedReply.isDisplacedTransaction) {
          await supabase.from("whatsapp_messages").update({ status: "failed" }).eq("id", pendingPackMsg.id);
          // fall through to process the displaced transaction normally!
        } else {
          const isSkipOrCatalogInfo = parsedReply.isSkip || parsedReply.stockQty != null || parsedReply.unitCost != null || parsedReply.isService;

          if (!isSkipOrCatalogInfo) {
            const hasNewIntent = Boolean(detectFastIntent(rawText || "") || /\b(sold|bought|restock|expense|paid|transfer|cash)\b/i.test(rawText || ""));
            if (hasNewIntent) {
              await supabase.from("whatsapp_messages").update({ status: "failed" }).eq("id", pendingPackMsg.id);
            } else {
              const rePrompt =
                `To record *"${meta.product_name}"*, please reply with your stock and cost:\n` +
                `📦 E.g.: *"12 in stock, cost 6000"*\n` +
                `💡 Or reply *SKIP* to record without stock tracking, or *CANCEL*.`;
              await replyToUser(supabase, tenant.id, fromPhone, rePrompt, senderMemberId);
              return;
            }
          }

          const saleAmount = meta.amount ?? 0;
          const soldQty = meta.raw_qty ?? 1;
          const saleUnit = meta.unit ?? "pcs";
          const method = meta.payment_method ?? null;
          const methodTag = method ? ` (${method.toUpperCase()})` : "";
          const custName = meta.customer_name || null;
          const isCredit = Boolean(meta.is_credit_sale);

          let targetProductId: number | null = null;
          let createdProdName = meta.product_name;
          let finalStockRemaining: number | null = null;
          let profitStr = "";

          let limitNote = "";

          if (parsedReply.isService) {
            const { checkProductLimit } = await import("@/lib/billing-server");
            const pLimit = await checkProductLimit(tenant.id);
            if (pLimit.allowed) {
              const { data: createdProduct } = await supabase
                .from("products")
                .insert({
                  tenant_id: tenant.id,
                  name: meta.product_name,
                  quantity: 0,
                  unit: "service",
                  is_service: true,
                })
                .select("id, name, unit")
                .single();

              if (createdProduct) {
                targetProductId = createdProduct.id;
                createdProdName = createdProduct.name;
              }
            } else {
              limitNote = `\n\n⚠️ _Could not save to catalog (plan product limit reached). Sale recorded as uncataloged._`;
            }
          } else if (!parsedReply.isSkip && (parsedReply.stockQty != null || parsedReply.unitCost != null)) {
            const initialStock = parsedReply.stockQty != null ? Math.max(parsedReply.stockQty, soldQty) : soldQty;
            const effectiveUnitCost = parsedReply.unitCost ?? null;
            const prodUnit = parsedReply.unit || saleUnit || "pcs";

            const { checkProductLimit } = await import("@/lib/billing-server");
            const pLimit = await checkProductLimit(tenant.id);

            if (pLimit.allowed) {
              const { data: createdProduct } = await supabase
                .from("products")
                .insert({
                  tenant_id: tenant.id,
                  name: meta.product_name,
                  quantity: initialStock,
                  unit: prodUnit,
                  unit_cost: effectiveUnitCost,
                  reorder_threshold: Math.round(initialStock * 0.2),
                  is_service: false,
                })
                .select("id, name, unit")
                .single();

              if (createdProduct) {
                targetProductId = createdProduct.id;
                createdProdName = createdProduct.name;

                // Initial stock movement
                await supabase.from("stock_movements").insert({
                  tenant_id: tenant.id,
                  product_id: createdProduct.id,
                  change_qty: initialStock,
                  type: "in",
                  source: isVoice ? "whatsapp_voice" : "whatsapp_text",
                  reason: `Initial stock setup via WhatsApp (${initialStock} ${prodUnit})`,
                  linked_message_id: waMsg.id,
                });

                // Deduct sold quantity
                await updateProductStock({
                  supabase,
                  tenantId: tenant.id,
                  productId: createdProduct.id,
                  changeQty: -soldQty,
                  type: "out",
                  source: isVoice ? "whatsapp_voice" : "whatsapp_text",
                  linkedMessageId: waMsg.id,
                  alertPhone: fromPhone,
                  reason: `Sale of ${soldQty} ${prodUnit} via WhatsApp`,
                });

                if (parsedReply.stockQty != null) {
                  finalStockRemaining = initialStock - soldQty;
                }

                if (effectiveUnitCost != null && saleAmount > 0) {
                  const totalCostOfSale = effectiveUnitCost * soldQty;
                  const grossProfit = saleAmount - totalCostOfSale;
                  const profitSign = grossProfit >= 0 ? "+" : "";
                  profitStr = `\n• Cost: *${nf.format(effectiveUnitCost)}/${prodUnit}* | Profit: *${profitSign}${nf.format(grossProfit)}* 📈`;
                }
              }
            } else {
              limitNote = `\n\n⚠️ _Could not save to catalog (plan product limit reached). Sale recorded as uncataloged._`;
            }
          } else {
            // Merchant chose SKIP: create uncataloged product
            const { checkProductLimit } = await import("@/lib/billing-server");
            const pLimit = await checkProductLimit(tenant.id);
            if (pLimit.allowed) {
              const { data: createdProduct } = await supabase
                .from("products")
                .insert({
                  tenant_id: tenant.id,
                  name: meta.product_name,
                  quantity: 0,
                  unit: saleUnit,
                  is_service: false,
                })
                .select("id, name")
                .single();

              if (createdProduct) {
                targetProductId = createdProduct.id;
                createdProdName = createdProduct.name;
              }
            }
          }

          const desc = custName
            ? `Sold ${soldQty} ${saleUnit} of ${createdProdName} to ${custName}`
            : `Sold ${soldQty} ${saleUnit} of ${createdProdName}`;

          const { data: ledger } = await supabase
            .from("ledger_entries")
            .insert({
              tenant_id: tenant.id,
              type: "sale",
              amount: saleAmount,
              item_description: desc,
              product_id: targetProductId,
              payment_method: method,
              customer_name: custName,
              source: isVoice ? "whatsapp_voice" : "whatsapp_text",
              linked_message_id: waMsg.id,
              confidence_score: 1.0,
            })
            .select("id")
            .single();

          const ledgerId = ledger?.id ?? null;

          if (isCredit) {
            try {
              const amountPaid = meta.amount_paid ?? 0;
              const amountOwed = meta.amount_owed ?? Math.max(0, saleAmount - amountPaid);
              await supabase.from("customer_debts").insert({
                tenant_id: tenant.id,
                customer_name: custName || "Customer",
                linked_entry_id: ledgerId,
                total_amount: saleAmount,
                amount_paid: amountPaid,
                amount_owed: amountOwed,
                status: amountOwed === 0 ? "settled" : amountPaid > 0 ? "partially_paid" : "unpaid",
                notes: `${soldQty} ${saleUnit} of ${createdProdName}`,
              });
            } catch (err) {
              console.error("Failed to insert customer debt:", err);
            }
          }

          await supabase.from("whatsapp_messages").update({ status: "matched", linked_entry_id: ledgerId }).eq("id", pendingPackMsg.id);
          await supabase.from("whatsapp_messages").update({ status: "matched", linked_entry_id: ledgerId }).eq("id", waMsg.id);

          const receiptUrl = ledgerId ? getReceiptUrl(ledgerId) : null;
          const custNote = custName ? ` to *${custName}*` : "";

          let reply = "";
          if (finalStockRemaining != null) {
            reply =
              `✅ *Product Added & Sale Recorded!*\n` +
              `• Product: *${createdProdName}*${custNote}\n` +
              `• Current Stock: *${finalStockRemaining} ${saleUnit}* remaining\n` +
              `• Sale Amount: *${nf.format(saleAmount)}*${methodTag}${profitStr}`;
          } else if (parsedReply.unitCost != null) {
            reply =
              `✅ *Product Added & Sale Recorded!*\n` +
              `• Product: *${createdProdName}*${custNote}\n` +
              `• Cost: *${nf.format(parsedReply.unitCost)}/${saleUnit}*${profitStr}\n` +
              `• Sale Amount: *${nf.format(saleAmount)}*${methodTag}\n\n` +
              `💡 _Tip: You can set your stock level anytime by texting e.g. "Restocked 20 ${createdProdName}"!_`;
          } else {
            reply =
              `Got it! Sold ${soldQty} ${saleUnit} of *${createdProdName}* (*${nf.format(saleAmount)}*)${custNote}${methodTag}.\n\n` +
              `💡 _Tip: Upload your full product list anytime on your dashboard: https://sparkbooks.com.ng/dashboard/products_`;
          }

          if (isCredit) {
            const amountPaid = meta.amount_paid ?? 0;
            const amountOwed = meta.amount_owed ?? Math.max(0, saleAmount - amountPaid);
            reply += `\n• 👤 Customer Debt: *${custName || "Customer"}* owes *${nf.format(amountOwed)}* (Paid: ${nf.format(amountPaid)})`;
          }

          if (limitNote) {
            reply += limitNote;
          }

          if (receiptUrl) {
            reply += `\n\n🧾 *Customer Receipt:*\n${receiptUrl}`;
          }

          await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
          return;
        }
      }
    }
  } catch (packErr) {
    console.warn("Pending pack size reply check error:", packErr);
  }

  // ── 5. FETCH PRODUCT CATALOG ──
  let catalog: any[] | null = null;
  const { data: catWithPkg, error: catPkgErr } = await supabase
    .from("products")
    .select("id, name, unit, unit_cost, quantity, is_service, pieces_per_pack, packaging_units, categories(name)")
    .eq("tenant_id", tenant.id)
    .is("deleted_at", null);

  if (catPkgErr) {
    const { data: catFallback } = await supabase
      .from("products")
      .select("id, name, unit, unit_cost, quantity, is_service, pieces_per_pack, categories(name)")
      .eq("tenant_id", tenant.id)
      .is("deleted_at", null);
    catalog = catFallback;
  } else {
    catalog = catWithPkg;
  }

  const catalogItems = (catalog ?? []).map((p) => {
    const cat = (p.categories as unknown as { name: string }[])?.[0] ?? null;
    return {
      id: p.id,
      name: p.name,
      category: cat?.name ?? null,
      unit: p.unit,
      unit_cost: p.unit_cost,
      quantity: Number(p.quantity ?? 0),
      is_service: p.is_service ?? false,
      pieces_per_pack: p.pieces_per_pack != null ? Number(p.pieces_per_pack) : null,
      packaging_units: parsePackagingUnits(p.packaging_units),
    };
  });

  // ── 6. PARSE INTENT (FAST DETERMINISTIC MATCH OR DEEPSEEK) ──
  const fastIntent = rawText ? detectFastIntent(rawText) : null;
  let parsed: ParsedEntry;

  if (fastIntent) {
    parsed = {
      entry_type: fastIntent,
      matched_product_id: null,
      matched_product_name: null,
      is_new_product: false,
      new_product_name: null,
      quantity: null,
      unit: null,
      unit_cost: null,
      amount: null,
      payment_method: null,
      customer_name: null,
      amount_paid: null,
      amount_owed: null,
      confidence: 1.0,
      clarification_needed: null,
    };
  } else {
    // 6b. Fetch recent conversation history (last 15 minutes, up to 6 messages) for multi-turn context
    let chatHistory: ChatMessage[] = [];
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: recentDbMsgs } = await supabase
        .from("whatsapp_messages")
        .select("id, direction, raw_text, transcript, created_at")
        .eq("tenant_id", tenant.id)
        .neq("id", waMsg.id)
        .gte("created_at", fifteenMinutesAgo)
        .order("created_at", { ascending: false })
        .limit(6);

      chatHistory = (recentDbMsgs ?? [])
        .reverse()
        .map((m) => {
          const content = (m.direction === "inbound" ? (m.transcript || m.raw_text) : m.raw_text) || "";
          return {
            role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
            content: content.trim(),
          };
        })
        .filter((h) => h.content.length > 0);
    } catch (historyErr) {
      console.warn("Could not load chat history for DeepSeek context:", historyErr);
    }

    try {
      parsed = await parseMessage(rawText!, catalogItems, chatHistory);
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
  }

  const { confidence, entry_type } = parsed;

  // Increment usage counter
  await incrementMessageCount(tenant.id);

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

  // 7A2: MAGIC LOGIN LINK REQUEST
  if (entry_type === "magic_login") {
    await supabase
      .from("whatsapp_messages")
      .update({ status: "matched" })
      .eq("id", waMsg.id);

    try {
      const { loginUrl } = await generateMagicLoginToken(tenant.id, fromPhone);
      const reply =
        `🔐 *SparkBooks Web Dashboard Login*\n\n` +
        `Tap this secure link to open your live dashboard:\n` +
        `👉 ${loginUrl}\n\n` +
        `⏳ _Valid for 24 hours. Password not required._`;

      await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    } catch (err) {
      console.error("Magic login generation error:", err);
      await replyToUser(
        supabase,
        tenant.id,
        fromPhone,
        "Sorry, I had trouble generating your login link. Please try again in a few moments.",
        senderMemberId,
      );
    }
    return;
  }

  // 7A2b: UNDO / CANCEL LAST TRANSACTION ("This is not correct", "undo", "cancel last")
  if (entry_type === "undo_last") {
    // 1. Check if there was an active pending confirmation (e.g. pack size or price clarification)
    const { data: pendingMsg } = await supabase
      .from("whatsapp_messages")
      .select("id, metadata")
      .eq("tenant_id", tenant.id)
      .eq("status", "pending_confirmation")
      .not("metadata->pending_action", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingMsg) {
      await supabase
        .from("whatsapp_messages")
        .update({ status: "failed" })
        .eq("id", pendingMsg.id);

      await supabase
        .from("whatsapp_messages")
        .update({ status: "matched" })
        .eq("id", waMsg.id);

      await replyToUser(supabase, tenant.id, fromPhone, "↩️ Pending transaction cancelled.", senderMemberId);
      return;
    }

    // 2. Look for the most recent ledger entry in the last 20 minutes
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: recentEntry } = await supabase
      .from("ledger_entries")
      .select("id, type, amount, item_description, product_id, created_at")
      .eq("tenant_id", tenant.id)
      .gte("created_at", twentyMinsAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentEntry) {
      // If it was a sale and product is tracked, restore stock
      if (recentEntry.type === "sale" && recentEntry.product_id) {
        const { data: sm } = await supabase
          .from("stock_movements")
          .select("id, change_qty")
          .eq("tenant_id", tenant.id)
          .eq("product_id", recentEntry.product_id)
          .gte("created_at", twentyMinsAgo)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const qtyToRestore = sm?.change_qty ? Math.abs(Number(sm.change_qty)) : 1;
        await updateProductStock({
          supabase,
          tenantId: tenant.id,
          productId: recentEntry.product_id,
          changeQty: qtyToRestore,
          type: "in",
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          linkedMessageId: waMsg.id,
          alertPhone: fromPhone,
          reason: "Undo of cancelled sale via WhatsApp",
        });
      } else if (recentEntry.type === "expense" && recentEntry.product_id) {
        const { data: sm } = await supabase
          .from("stock_movements")
          .select("id, change_qty")
          .eq("tenant_id", tenant.id)
          .eq("product_id", recentEntry.product_id)
          .gte("created_at", twentyMinsAgo)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const qtyToDeduct = sm?.change_qty ? Math.abs(Number(sm.change_qty)) : 0;
        if (qtyToDeduct > 0) {
          await updateProductStock({
            supabase,
            tenantId: tenant.id,
            productId: recentEntry.product_id,
            changeQty: -qtyToDeduct,
            type: "out",
            source: isVoice ? "whatsapp_voice" : "whatsapp_text",
            linkedMessageId: waMsg.id,
            alertPhone: fromPhone,
            reason: "Undo of cancelled restock via WhatsApp",
          });
        }
      }

      // If customer debt was linked, delete it
      await supabase
        .from("customer_debts")
        .delete()
        .eq("linked_entry_id", recentEntry.id);

      // Delete the ledger entry
      await supabase
        .from("ledger_entries")
        .delete()
        .eq("id", recentEntry.id);

      await supabase
        .from("whatsapp_messages")
        .update({ status: "matched" })
        .eq("id", waMsg.id);

      const reply =
        `↩️ *Last Transaction Cancelled & Undone!*\n` +
        `• Removed: *${recentEntry.item_description || "Transaction"}* (${nf.format(Number(recentEntry.amount))})\n` +
        `• Physical stock and ledger have been fully restored.\n\n` +
        `_You can re-enter your transaction anytime!_ 🎯`;

      await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
      return;
    }

    // No recent entry to undo
    await supabase.from("whatsapp_messages").update({ status: "matched" }).eq("id", waMsg.id);
    const reply = `I couldn't find any recent transactions in the last 20 minutes to undo. You can inspect and edit your full ledger anytime on your dashboard: https://sparkbooks.com.ng/dashboard`;
    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7A3: UPDATE PACK SIZE / PIECES PER CARTON (Conversational memory)
  if (entry_type === "update_pack_size" && confidence >= 0.7) {
    let productId = parsed.matched_product_id;
    let productName = parsed.matched_product_name;

    if (!productId && catalog && catalog.length > 0) {
      const targetName = (productName || "").toLowerCase().trim();
      const found = catalog.find((c) =>
        c.name.toLowerCase().includes(targetName) || targetName.includes(c.name.toLowerCase())
      );
      if (found) {
        productId = found.id;
        productName = found.name;
      }
    }

    if (!productId) {
      await supabase.from("whatsapp_messages").update({ status: "failed" }).eq("id", waMsg.id);
      await replyToUser(
        supabase,
        tenant.id,
        fromPhone,
        "Which product would you like to update the pack size for?",
        senderMemberId,
      );
      return;
    }

    const packSize = parsed.pieces_per_pack;
    if (!packSize || packSize <= 0) {
      await replyToUser(
        supabase,
        tenant.id,
        fromPhone,
        `How many pieces are inside 1 carton of *${productName}*?`,
        senderMemberId,
      );
      return;
    }

    await supabase
      .from("products")
      .update({
        pieces_per_pack: packSize,
        unit: "pcs",
      })
      .eq("id", productId);

    await supabase.from("whatsapp_messages").update({ status: "matched" }).eq("id", waMsg.id);

    const reply =
      `✅ *Pack Size Updated!*\n` +
      `• *${productName}*: 1 carton = *${packSize} pcs* (catalog updated)\n` +
      `• Base inventory unit: *pcs*\n\n` +
      `_All future carton restocks and sales will automatically convert to ${packSize} pcs!_ 🚀`;

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7A4: ATTACH PURCHASE COST OR UPDATE PREVIOUS SALE (Conversational memory)
  if (entry_type === "transaction_update" && confidence >= 0.7) {
    let productId = parsed.matched_product_id;
    let productName = parsed.matched_product_name;

    // Check if the user is updating a SALE (e.g. "This was sold for 4000", "I sold the 1pack for 4000", "recorded for 0naira was actually sold for 4000")
    const rawLower = (rawText || "").toLowerCase();
    const isSaleCorrection =
      /\b(?:sold|sell|sale)\b/i.test(rawLower) ||
      (!/\b(?:cost|bought|purchase|restock)\b/i.test(rawLower) && parsed.amount != null);

    if (isSaleCorrection && parsed.amount && parsed.amount > 0) {
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      let query = supabase
        .from("ledger_entries")
        .select("id, amount, product_id, item_description, customer_name")
        .eq("tenant_id", tenant.id)
        .eq("type", "sale")
        .gte("created_at", twentyMinsAgo)
        .order("created_at", { ascending: false })
        .limit(1);

      if (productId) {
        query = query.eq("product_id", productId);
      }

      const { data: recentSale } = await query.maybeSingle();

      if (recentSale) {
        await supabase
          .from("ledger_entries")
          .update({ amount: parsed.amount })
          .eq("id", recentSale.id);

        await supabase
          .from("whatsapp_messages")
          .update({ status: "matched", linked_entry_id: recentSale.id })
          .eq("id", waMsg.id);

        const receiptUrl = getReceiptUrl(recentSale.id);
        const reply =
          `✅ *Sale Price Updated!*\n` +
          `• Description: *${recentSale.item_description}*\n` +
          `• Updated Amount: *${nf.format(parsed.amount)}* (was ${nf.format(Number(recentSale.amount))})\n\n` +
          `🧾 *Updated Receipt:*\n${receiptUrl}`;

        await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
        return;
      }
    }

    if (!productId && catalog && catalog.length > 0) {
      const targetName = (productName || "").toLowerCase().trim();
      const found = catalog.find((c) =>
        c.name.toLowerCase().includes(targetName) || targetName.includes(c.name.toLowerCase())
      );
      if (found) {
        productId = found.id;
        productName = found.name;
      }
    }

    let prod: any = null;
    if (productId) {
      const { data: pData, error: pErr } = await supabase
        .from("products")
        .select("id, name, unit, pieces_per_pack, packaging_units, unit_cost")
        .eq("id", productId)
        .single();
      if (pErr) {
        const { data: fbData } = await supabase
          .from("products")
          .select("id, name, unit, pieces_per_pack, unit_cost")
          .eq("id", productId)
          .single();
        prod = fbData;
      } else {
        prod = pData;
      }
    }

    const qty = parsed.quantity ?? 1;
    const unit = parsed.unit ?? "cartons";
    const pkgUnits = parsePackagingUnits(prod?.packaging_units, prod?.pieces_per_pack != null ? Number(prod.pieces_per_pack) : null);
    const ladderMult = resolveUnitMultiplier(unit, pkgUnits, prod?.unit || "pcs", prod?.pieces_per_pack).multiplier;
    const packSize = parsed.pieces_per_pack ?? (ladderMult > 1 ? ladderMult : (prod?.pieces_per_pack ? Number(prod.pieces_per_pack) : null));
    const isBulk = BULK_UNITS.includes(unit.toLowerCase().trim()) || (ladderMult > 1);

    let totalCost = parsed.amount;
    let perPieceCost = parsed.unit_cost;

    if (!totalCost && parsed.unit_cost) {
      totalCost = parsed.unit_cost * qty;
    }

    if (totalCost && packSize && isBulk) {
      const totalPcs = qty * packSize;
      perPieceCost = Math.round(totalCost / totalPcs);
    } else if (totalCost && qty > 0) {
      perPieceCost = Math.round(totalCost / qty);
    }

    if (productId && perPieceCost != null) {
      await supabase
        .from("products")
        .update({
          unit_cost: perPieceCost,
          unit: packSize ? "pcs" : (prod?.unit || "pcs"),
        })
        .eq("id", productId);
    }

    let ledgerId: number | null = null;
    if (totalCost && totalCost > 0) {
      const { data: existingLedger } = await supabase
        .from("ledger_entries")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("type", "expense")
        .eq("product_id", productId)
        .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingLedger) {
        await supabase
          .from("ledger_entries")
          .update({ amount: totalCost })
          .eq("id", existingLedger.id);
        ledgerId = existingLedger.id;
      } else {
        const desc = isBulk && packSize
          ? `Inventory restock: ${qty} ${unit} (${qty * packSize} pcs) of ${productName || prod?.name || "item"}`
          : `Inventory restock: ${qty} ${unit} of ${productName || prod?.name || "item"}`;

        const { data: newLedger } = await supabase
          .from("ledger_entries")
          .insert({
            tenant_id: tenant.id,
            type: "expense",
            amount: totalCost,
            item_description: desc,
            product_id: productId,
            source: isVoice ? "whatsapp_voice" : "whatsapp_text",
            linked_message_id: waMsg.id,
            confidence_score: 1.0,
          })
          .select("id")
          .single();
        ledgerId = newLedger?.id ?? null;
      }
    }

    await supabase.from("whatsapp_messages").update({ status: "matched", linked_entry_id: ledgerId }).eq("id", waMsg.id);

    const costPerPieceStr = perPieceCost ? ` (${nf.format(perPieceCost)}/pc)` : "";
    const reply =
      `✅ *Purchase Cost Recorded!*\n` +
      `• Product: *${productName || prod?.name || "item"}*\n` +
      `• Recorded purchase cost: *${nf.format(totalCost ?? 0)}*${costPerPieceStr}\n` +
      `• Physical stock unchanged (already added earlier).\n\n` +
      `_Transaction updated successfully!_ 🎯`;

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7B: STOCK CHECK INQUIRY
  if (entry_type === "stock_check") {
    let reply = "";
    if (parsed.matched_product_id) {
      let prod: any = null;
      const { data: pData, error: pErr } = await supabase
        .from("products")
        .select("name, quantity, unit, unit_cost, is_service, pieces_per_pack, packaging_units")
        .eq("id", parsed.matched_product_id)
        .single();

      if (pErr) {
        const { data: fbData } = await supabase
          .from("products")
          .select("name, quantity, unit, unit_cost, is_service, pieces_per_pack")
          .eq("id", parsed.matched_product_id)
          .single();
        prod = fbData;
      } else {
        prod = pData;
      }

      if (prod) {
        if (prod.is_service) {
          reply = `ℹ️ *${prod.name}* is a service (labor/craft — stock is not tracked).`;
        } else {
          const pkgUnits = parsePackagingUnits(prod.packaging_units, prod.pieces_per_pack != null ? Number(prod.pieces_per_pack) : null);
          const breakdown = formatStockBreakdown(prod.quantity, prod.unit || "pcs", pkgUnits).summary;
          reply = `📦 *Stock Check:*\nYou have *${breakdown}* of *${prod.name}* in stock.`;
        }
      } else {
        reply = `Could not find that product in your catalog.`;
      }
    } else {
      let prods: any[] | null = null;
      const { data: prodsData, error: prodsErr } = await supabase
        .from("products")
        .select("name, quantity, unit, is_service, pieces_per_pack, packaging_units")
        .eq("tenant_id", tenant.id)
        .is("deleted_at", null)
        .order("quantity", { ascending: true })
        .limit(10);

      if (prodsErr) {
        const { data: fbProds } = await supabase
          .from("products")
          .select("name, quantity, unit, is_service, pieces_per_pack")
          .eq("tenant_id", tenant.id)
          .is("deleted_at", null)
          .order("quantity", { ascending: true })
          .limit(10);
        prods = fbProds;
      } else {
        prods = prodsData;
      }

      if (prods && prods.length > 0) {
        reply =
          `📦 *Current Stock Levels:*\n` +
          prods
            .map((p) => {
              if (p.is_service) return `• ${p.name}: *(Service)*`;
              const pkgUnits = parsePackagingUnits(p.packaging_units, p.pieces_per_pack != null ? Number(p.pieces_per_pack) : null);
              const breakdown = formatStockBreakdown(p.quantity, p.unit || "pcs", pkgUnits).summary;
              return `• ${p.name}: *${breakdown}*`;
            })
            .join("\n");
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

  // 7B2: STOCK ADJUSTMENT / MANUAL CORRECTION VIA WHATSAPP
  if (entry_type === "stock_adjustment" && confidence >= 0.7) {
    let productId = parsed.matched_product_id;
    let productName = parsed.matched_product_name;

    if (!productId && catalog && catalog.length > 0 && rawText) {
      const targetName = (parsed.new_product_name || parsed.matched_product_name || "").toLowerCase().trim();
      if (targetName) {
        const found = catalog.find((c) =>
          c.name.toLowerCase().includes(targetName) ||
          targetName.includes(c.name.toLowerCase())
        );
        if (found) {
          productId = found.id;
          productName = found.name;
        }
      }
    }

    if (!productId) {
      await supabase
        .from("whatsapp_messages")
        .update({ status: "failed", failure_reason: "product_not_found" })
        .eq("id", waMsg.id);

      await replyToUser(
        supabase,
        tenant.id,
        fromPhone,
        `I couldn't identify the product to adjust. Please state the exact product name, e.g. "Correct Lush Hair stock to 40".`,
        senderMemberId,
      );
      return;
    }

    const { data: prod } = await supabase
      .from("products")
      .select("id, name, quantity, unit, is_service")
      .eq("id", productId)
      .single();

    if (!prod) {
      await replyToUser(supabase, tenant.id, fromPhone, `Product not found.`, senderMemberId);
      return;
    }

    if (prod.is_service) {
      await supabase
        .from("whatsapp_messages")
        .update({ status: "matched" })
        .eq("id", waMsg.id);

      await replyToUser(
        supabase,
        tenant.id,
        fromPhone,
        `ℹ️ *${prod.name}* is marked as a service (stock count is not tracked). No adjustment needed!`,
        senderMemberId,
      );
      return;
    }

    const targetQty = Math.max(0, Math.abs(parsed.quantity ?? 0));
    const currentQty = Number(prod.quantity);
    const delta = targetQty - currentQty;

    if (delta !== 0) {
      await updateProductStock({
        supabase,
        tenantId: tenant.id,
        productId: prod.id,
        changeQty: delta,
        type: "manual_adjustment",
        source: isVoice ? "whatsapp_voice" : "whatsapp_text",
        linkedMessageId: waMsg.id,
        reason: "Stock correction via WhatsApp",
      });
    }

    await supabase
      .from("whatsapp_messages")
      .update({ status: "matched" })
      .eq("id", waMsg.id);

    const deltaSign = delta > 0 ? "+" : "";
    const reply =
      `📦 *Stock Count Adjusted!*\n` +
      `• Product: *${prod.name}*\n` +
      `• Previous Count: *${currentQty} ${prod.unit}*\n` +
      `• New Stock: *${targetQty} ${prod.unit}* (${deltaSign}${delta} adjustment)\n\n` +
      `_Audit record created: Stock correction via WhatsApp._`;

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
      const method = (e.payment_method || "").toLowerCase();
      if (e.type === "sale") {
        totalSales += amt;
        if (method === "transfer") paymentMethods.transfer += amt;
        else if (method === "cash") paymentMethods.cash += amt;
        else if (method === "pos") paymentMethods.pos += amt;
        else paymentMethods.other += amt;
        const methodTag = method ? ` (${method.toUpperCase()})` : "";
        salesList.push(`• ${e.item_description || "Sale"} — *${nf.format(amt)}*${methodTag}`);
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
      if (paymentMethods.other > 0) pmParts.push(`Direct/Other: ${nf.format(paymentMethods.other)}`);
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
      const method = (e.payment_method || "").toLowerCase();
      if (e.type === "sale") {
        totalSales += amt;
        saleCount++;
        if (method === "transfer") paymentMethods.transfer += amt;
        else if (method === "cash") paymentMethods.cash += amt;
        else if (method === "pos") paymentMethods.pos += amt;
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

    const channelLines: string[] = [];
    if (paymentMethods.transfer > 0) channelLines.push(`• Transfer: *${nf.format(paymentMethods.transfer)}*`);
    if (paymentMethods.cash > 0) channelLines.push(`• Cash: *${nf.format(paymentMethods.cash)}*`);
    if (paymentMethods.pos > 0) channelLines.push(`• POS: *${nf.format(paymentMethods.pos)}*`);
    if (paymentMethods.other > 0) channelLines.push(`• Direct/Other: *${nf.format(paymentMethods.other)}*`);
    if (channelLines.length > 0) {
      reply += `💳 *Channel Breakdown:*\n${channelLines.join("\n")}\n\n`;
    }

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
    const payment = Math.max(0, Math.abs(parsed.amount || parsed.amount_paid || 0));
    if (payment <= 0) return;
    const custName = (parsed.customer_name || "").trim();
    const method = parsed.payment_method ?? null;
    const methodTag = method ? ` (${method.toUpperCase()})` : "";

    let debtor: {
      id: number;
      customer_name: string;
      total_amount: number;
      amount_paid: number;
      amount_owed: number;
    } | null = null;

    if (custName) {
      try {
        let { data: matched } = await supabase
          .from("customer_debts")
          .select("id, customer_name, total_amount, amount_paid, amount_owed")
          .eq("tenant_id", tenant.id)
          .neq("status", "settled")
          .ilike("customer_name", `%${custName}%`)
          .limit(1)
          .maybeSingle();

        if (!matched && custName.includes(" ")) {
          const firstName = custName.split(" ")[0];
          const { data: matchedFirst } = await supabase
            .from("customer_debts")
            .select("id, customer_name, total_amount, amount_paid, amount_owed")
            .eq("tenant_id", tenant.id)
            .neq("status", "settled")
            .ilike("customer_name", `%${firstName}%`)
            .limit(1)
            .maybeSingle();
          matched = matchedFirst;
        }

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
          item_description: `Debt repayment from ${debtor.customer_name} [debt:${debtor.id}] [rem:${newOwed}]`,
          payment_method: method,
          customer_name: debtor.customer_name,
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
        `• Amount Paid: *${nf.format(payment)}*${methodTag}\n` +
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
          customer_name: custName || null,
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          linked_message_id: waMsg.id,
          confidence_score: confidence,
        })
        .select("id")
        .single();

      ledgerId = ledger?.id ?? null;
      const receiptUrl = ledgerId ? getReceiptUrl(ledgerId) : null;

      reply = `✅ *Payment Recorded:* *${nf.format(payment)}* from *${custName || "Customer"}*${methodTag}.`;
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
    const qty = Math.max(1, Math.abs(parsed.quantity ?? 1));
    const unit = parsed.unit ?? "pcs";
    const totalAmount = Math.max(0, Math.abs(parsed.amount ?? (parsed.amount_paid ?? 0) + (parsed.amount_owed ?? 0)));
    const amountPaid = Math.max(0, Math.min(totalAmount, Math.abs(parsed.amount_paid ?? 0)));
    const amountOwed = Math.max(0, totalAmount - amountPaid);
    const customerName = (parsed.customer_name || "Customer").trim();
    const method = parsed.payment_method ?? null;
    const methodTag = method ? ` (${method.toUpperCase()})` : "";

    // ── CHECK PRODUCT IN CATALOG ──
    const rawTargetName = (productName || parsed.new_product_name || "").trim();
    const matchedInCatalog = productId ? catalogItems.find((c) => c.id === productId) : null;

    if (!matchedInCatalog && rawTargetName) {
      if (catalogItems.length === 0) {
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "pending_confirmation",
            metadata: {
              pending_action: "new_product_cataloging",
              product_name: rawTargetName,
              raw_qty: qty,
              unit,
              amount: totalAmount,
              payment_method: method,
              customer_name: customerName,
              is_credit_sale: true,
              amount_paid: amountPaid,
              amount_owed: amountOwed,
            },
          })
          .eq("id", waMsg.id);

        const reply =
          `👋 Welcome to *SparkBooks*! Before we record your first credit sale, your product catalog is currently empty.\n\n` +
          `Uploading your inventory first unlocks:\n` +
          `• 📉 *Automated low-stock alerts before items finish*\n` +
          `• 📊 *Accurate daily profit & cost calculations*\n\n` +
          `*How would you like to add your products?*\n` +
          `📁 *Option A (Fastest):* Upload your Excel/CSV list here:\nhttps://sparkbooks.com.ng/dashboard/products\n` +
          `💬 *Option B:* Reply with your stock & cost (e.g. *"10 in stock, cost 5000"*).\n\n` +
          `_Or reply **SKIP** to record this credit sale as uncataloged for now._`;

        await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
        return;
      }

      const matchResult = findBestCatalogMatches(rawTargetName, catalogItems);

      if (matchResult.exactMatch) {
        productId = matchResult.exactMatch.id;
        productName = matchResult.exactMatch.name;
      } else if (matchResult.fuzzyCandidates.length > 0) {
        const topCandidate = matchResult.fuzzyCandidates[0].item;
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "pending_confirmation",
            metadata: {
              pending_action: "fuzzy_product_clarification",
              candidate_id: topCandidate.id,
              candidate_name: topCandidate.name,
              raw_product_name: rawTargetName,
              raw_qty: qty,
              unit,
              amount: totalAmount,
              payment_method: method,
              customer_name: customerName,
              is_credit_sale: true,
              amount_paid: amountPaid,
              amount_owed: amountOwed,
            },
          })
          .eq("id", waMsg.id);

        const stockStr = `${topCandidate.quantity} ${topCandidate.unit} in stock`;
        const reply =
          `🔍 I couldn't find *"${rawTargetName}"*, but found *${topCandidate.name}* in your catalog (${stockStr}).\n\n` +
          `Did you mean *${topCandidate.name}*?\n` +
          `1️⃣ *Yes* — Record credit sale & deduct stock\n` +
          `2️⃣ *No* — This is a new product\n\n` +
          `_(Reply **1** or **2**)_`;

        await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
        return;
      } else {
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "pending_confirmation",
            metadata: {
              pending_action: "new_product_cataloging",
              product_name: rawTargetName,
              raw_qty: qty,
              unit,
              amount: totalAmount,
              payment_method: method,
              customer_name: customerName,
              is_credit_sale: true,
              amount_paid: amountPaid,
              amount_owed: amountOwed,
            },
          })
          .eq("id", waMsg.id);

        const reply =
          `⚠️ *"${rawTargetName}"* is not in your product catalog yet!\n\n` +
          `To track your stock and customer debt accurately, let's add it quickly:\n\n` +
          `📦 *How many do you have in stock, and what did you buy each?*\n` +
          `_(Reply e.g.: **"12 in stock, cost 6000"**)_\n\n` +
          `💡 _Or reply **SKIP** to record the ${nf.format(totalAmount)} credit sale without stock tracking._`;

        await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
        return;
      }
    }
    // Check if product is service or has packaging tiers
    let qtyToDeduct = qty;
    let isProdService = false;
    let prodBaseUnit = "pcs";
    if (productId) {
      let prodInfo: any = null;
      const { data: pData, error: pErr } = await supabase
        .from("products")
        .select("is_service, pieces_per_pack, packaging_units, unit")
        .eq("id", productId)
        .maybeSingle();

      if (pErr) {
        const { data: fbData } = await supabase
          .from("products")
          .select("is_service, pieces_per_pack, unit")
          .eq("id", productId)
          .maybeSingle();
        prodInfo = fbData;
      } else {
        prodInfo = pData;
      }

      isProdService = Boolean(prodInfo?.is_service);
      prodBaseUnit = prodInfo?.unit || "pcs";
      const pkgUnits = parsePackagingUnits(prodInfo?.packaging_units, prodInfo?.pieces_per_pack != null ? Number(prodInfo.pieces_per_pack) : null);
      const mult = resolveUnitMultiplier(unit, pkgUnits, prodInfo?.unit || "pcs", prodInfo?.pieces_per_pack).multiplier;
      qtyToDeduct = qty * mult;
    }

    // Deduct stock if product matched and not a service
    if (productId && qtyToDeduct > 0 && !isProdService) {
      await updateProductStock({
        supabase,
        tenantId: tenant.id,
        productId,
        changeQty: -qtyToDeduct,
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
        customer_name: customerName,
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
    const creditUnitBreakdown = qtyToDeduct !== qty ? ` (${qtyToDeduct} ${prodBaseUnit})` : "";
    let reply =
      `📝 *Credit Sale Recorded!*\n` +
      `• Item: ${qty} ${unit}${creditUnitBreakdown} of *${productName ?? "item"}*\n` +
      `• Total Amount: *${nf.format(totalAmount)}*\n` +
      `• Paid Now: *${nf.format(amountPaid)}*${methodTag}\n` +
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
    const qty = Math.max(0, Math.abs(parsed.quantity ?? 0));
    const unit = parsed.unit ?? "pcs";
    const unitCost =
      parsed.unit_cost != null
        ? Math.max(0, Math.abs(parsed.unit_cost))
        : (parsed.amount && qty > 0 ? Math.round(Math.abs(parsed.amount) / qty) : null);
    const totalAmount =
      parsed.amount != null
        ? Math.max(0, Math.abs(parsed.amount))
        : (qty > 0 && unitCost ? qty * unitCost : null);

    // 0. Check product details (service vs packaging ladder)
    let prodInfo: any = null;
    if (productId) {
      const { data: pData, error: pErr } = await supabase
        .from("products")
        .select("id, name, unit, is_service, pieces_per_pack, packaging_units")
        .eq("id", productId)
        .maybeSingle();

      if (pErr) {
        const { data: fbData } = await supabase
          .from("products")
          .select("id, name, unit, is_service, pieces_per_pack")
          .eq("id", productId)
          .maybeSingle();
        prodInfo = fbData;
      } else {
        prodInfo = pData;
      }
    }

    if (prodInfo?.is_service) {
      await supabase.from("whatsapp_messages").update({ status: "matched" }).eq("id", waMsg.id);
      await replyToUser(
        supabase,
        tenant.id,
        fromPhone,
        `ℹ️ *${productName}* is marked as a service (services don't track physical inventory). If you bought materials or paid for labor, please record it as an expense (e.g. "Bought thread and lining 10k").`,
        senderMemberId,
      );
      return;
    }

    const pkgUnits = parsePackagingUnits(prodInfo?.packaging_units, prodInfo?.pieces_per_pack != null ? Number(prodInfo.pieces_per_pack) : null);
    const ladderMult = resolveUnitMultiplier(unit, pkgUnits, prodInfo?.unit || "pcs", prodInfo?.pieces_per_pack).multiplier;
    const isBulk = BULK_UNITS.includes(unit.toLowerCase().trim());
    let packSize = parsed.pieces_per_pack ?? (ladderMult > 1 ? ladderMult : null);

    // If restocked in cartons/bulk, but pack size / multiplier is completely unknown (mult === 1 and not base unit):
    const isBaseUnit = prodInfo?.unit && normalizeUnitName(unit) === normalizeUnitName(prodInfo.unit);
    if ((isBulk || (!isBaseUnit && pkgUnits.length > 0)) && !packSize && ladderMult === 1 && !isBaseUnit) {
      const targetName = (productName || parsed.new_product_name || parsed.matched_product_name || "this item").trim();
      await supabase
        .from("whatsapp_messages")
        .update({
          status: "pending_confirmation",
          metadata: {
            pending_action: "pack_size_clarification",
            product_id: productId ?? null,
            product_name: targetName,
            raw_qty: qty,
            unit,
            unit_cost: unitCost,
            amount: totalAmount,
          },
        })
        .eq("id", waMsg.id);

      const hasCost = totalAmount != null && totalAmount > 0;
      const promptReply =
        `📦 *Carton / Bulk Restock Detected:*\n` +
        `Before I record this: how many pieces are inside 1 ${unit} of *${targetName}*?` +
        (!hasCost ? ` (And how much was the total cost or cost per ${unit}?)` : "") +
        `\n\n` +
        `_(Reply e.g. "40 pieces" or "40 pcs, 50k")_`;

      await replyToUser(supabase, tenant.id, fromPhone, promptReply, senderMemberId);
      return;
    }

    // If pack size was explicitly stated in this message, save it to product
    if (parsed.pieces_per_pack && productId && (!prodInfo?.pieces_per_pack || Number(prodInfo.pieces_per_pack) !== parsed.pieces_per_pack)) {
      await supabase.from("products").update({ pieces_per_pack: parsed.pieces_per_pack }).eq("id", productId);
    }

    const mult = packSize ?? ladderMult;
    const actualQty = qty * mult;
    const effectiveUnitCost = totalAmount && actualQty > 0
      ? Math.round(totalAmount / actualQty)
      : (unitCost && mult > 1 ? Math.round(unitCost / mult) : unitCost);

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
          quantity: actualQty,
          unit: (isBulk || parsed.pieces_per_pack) ? "pcs" : unit,
          unit_cost: effectiveUnitCost,
          pieces_per_pack: parsed.pieces_per_pack ?? null,
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

      if (actualQty > 0) {
        await supabase.from("stock_movements").insert({
          tenant_id: tenant.id,
          product_id: productId,
          change_qty: actualQty,
          type: "in",
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          reason: "Initial stock via WhatsApp",
          linked_message_id: waMsg.id,
        });
      }
    } else if (productId) {
      if (actualQty > 0) {
        await updateProductStock({
          supabase,
          tenantId: tenant.id,
          productId,
          changeQty: actualQty,
          type: "in",
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          linkedMessageId: waMsg.id,
          alertPhone: fromPhone,
          reason: mult > 1 ? `Restocked ${qty} ${unit} (${actualQty} ${prodInfo?.unit || "pcs"})` : "Restocked via WhatsApp",
        });
      }
      const updatePayload: Record<string, unknown> = {};
      if (effectiveUnitCost != null) {
        updatePayload.unit_cost = effectiveUnitCost;
      }
      if (mult > 1 && !prodInfo?.unit) {
        updatePayload.unit = "pcs";
      }
      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from("products")
          .update(updatePayload)
          .eq("id", productId);
      }
    }

    let ledgerId: number | null = null;
    if (totalAmount && totalAmount > 0) {
      const desc = mult > 1
        ? `Inventory restock: ${qty} ${unit} (${actualQty} ${prodInfo?.unit || "pcs"}) of ${productName}`
        : `Inventory restock: ${actualQty} ${unit} of ${productName}`;

      const { data: ledger } = await supabase
        .from("ledger_entries")
        .insert({
          tenant_id: tenant.id,
          type: "expense",
          amount: totalAmount,
          item_description: desc,
          product_id: productId,
          payment_method: parsed.payment_method ?? null,
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

    const packNote = mult > 1 ? ` (${qty} ${unit} × ${mult} ${prodInfo?.unit || "pcs"})` : "";
    const displayUnit = prodInfo?.unit || (mult > 1 ? "pcs" : unit);
    let reply = `📦 *Stock Added:* +${actualQty} ${displayUnit} of *${productName}*${packNote}.`;
    if (totalAmount && totalAmount > 0) {
      reply += ` Recorded purchase cost of *${nf.format(totalAmount)}* (${nf.format(effectiveUnitCost ?? 0)}/${displayUnit}).`;
    }

    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7I: GENERAL BUSINESS EXPENSE
  if (entry_type === "expense" && confidence >= 0.75 && parsed.amount && parsed.amount > 0) {
    const expenseAmount = Math.max(0, Math.abs(parsed.amount));
    const desc =
      parsed.matched_product_name ||
      parsed.new_product_name ||
      "General business expense";

    const method = parsed.payment_method ?? null;
    const methodTag = method ? ` (${method.toUpperCase()})` : "";

    const { data: ledger } = await supabase
      .from("ledger_entries")
      .insert({
        tenant_id: tenant.id,
        type: "expense",
        amount: expenseAmount,
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

    const reply = `💸 *Recorded Expense:* ${desc} — *${nf.format(expenseAmount)}*${methodTag}`;
    await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
    return;
  }

  // 7J: RECORD SALE
  if (entry_type === "sale" && confidence >= 0.75) {
    let productId = parsed.matched_product_id;
    let productName = parsed.matched_product_name;
    const qty = Math.max(1, Math.abs(parsed.quantity ?? 1));
    const unit = parsed.unit ?? "pcs";
    const amount = Math.max(0, Math.abs(parsed.amount ?? 0));
    const method = parsed.payment_method ?? null;

    // NEVER record a ₦0 sale silently! Intercept and ask the seller for the price.
    if (!parsed.amount || parsed.amount <= 0) {
      const targetLabel = productName || (parsed.new_product_name || "item");
      await supabase
        .from("whatsapp_messages")
        .update({
          status: "pending_confirmation",
          metadata: {
            pending_action: "sale_price_clarification",
            product_id: productId,
            product_name: targetLabel,
            is_new_product: Boolean(!productId && (parsed.is_new_product || parsed.new_product_name)),
            raw_qty: qty,
            unit,
            payment_method: method,
            customer_name: (parsed.customer_name || "").trim() || null,
          },
        })
        .eq("id", waMsg.id);

      const custLabel = parsed.customer_name ? ` to *${parsed.customer_name.trim()}*` : "";
      const reply = `Got it, sold ${qty} ${unit} of *${targetLabel}*${custLabel}! 💰\n\nHow much did you sell it for?\n_(Reply e.g. "4000" or "4k")_`;

      await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
      return;
    }

    // 2. CHECK PRODUCT IN CATALOG
    const rawTargetName = (productName || parsed.new_product_name || "").trim();
    let matchedInCatalog = productId ? catalogItems.find((c) => c.id === productId) : null;

    if (!matchedInCatalog && rawTargetName) {
      if (catalogItems.length === 0) {
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "pending_confirmation",
            metadata: {
              pending_action: "new_product_cataloging",
              product_name: rawTargetName,
              raw_qty: qty,
              unit,
              amount,
              payment_method: method,
              customer_name: (parsed.customer_name || "").trim() || null,
              is_credit_sale: false,
            },
          })
          .eq("id", waMsg.id);

        const reply =
          `👋 Welcome to *SparkBooks*! Before we record your first sale, your product catalog is currently empty.\n\n` +
          `Uploading your inventory first unlocks:\n` +
          `• 📉 *Automated low-stock alerts before items finish*\n` +
          `• 📊 *Accurate daily profit & cost calculations*\n\n` +
          `*How would you like to add your products?*\n` +
          `📁 *Option A (Fastest):* Upload your Excel/CSV list here:\nhttps://sparkbooks.com.ng/dashboard/products\n` +
          `💬 *Option B:* Reply with your stock & cost (e.g. *"10 in stock, cost 5000"*).\n\n` +
          `_Or reply **SKIP** to record this sale as uncataloged for now._`;

        await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
        return;
      }

      const matchResult = findBestCatalogMatches(rawTargetName, catalogItems);

      if (matchResult.exactMatch) {
        productId = matchResult.exactMatch.id;
        productName = matchResult.exactMatch.name;
      } else if (matchResult.fuzzyCandidates.length > 0) {
        const topCandidate = matchResult.fuzzyCandidates[0].item;
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "pending_confirmation",
            metadata: {
              pending_action: "fuzzy_product_clarification",
              candidate_id: topCandidate.id,
              candidate_name: topCandidate.name,
              raw_product_name: rawTargetName,
              raw_qty: qty,
              unit,
              amount,
              payment_method: method,
              customer_name: (parsed.customer_name || "").trim() || null,
              is_credit_sale: false,
            },
          })
          .eq("id", waMsg.id);

        const stockStr = `${topCandidate.quantity} ${topCandidate.unit} in stock`;
        const reply =
          `🔍 I couldn't find *"${rawTargetName}"*, but found *${topCandidate.name}* in your catalog (${stockStr}).\n\n` +
          `Did you mean *${topCandidate.name}*?\n` +
          `1️⃣ *Yes* — Record sale & deduct stock\n` +
          `2️⃣ *No* — This is a new product\n\n` +
          `_(Reply **1** or **2**)_`;

        await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
        return;
      } else {
        await supabase
          .from("whatsapp_messages")
          .update({
            status: "pending_confirmation",
            metadata: {
              pending_action: "new_product_cataloging",
              product_name: rawTargetName,
              raw_qty: qty,
              unit,
              amount,
              payment_method: method,
              customer_name: (parsed.customer_name || "").trim() || null,
              is_credit_sale: false,
            },
          })
          .eq("id", waMsg.id);

        const reply =
          `⚠️ *"${rawTargetName}"* is not in your product catalog yet!\n\n` +
          `To track your stock and calculate your profit on this sale, let's add it quickly:\n\n` +
          `📦 *How many do you have in stock, and what did you buy each?*\n` +
          `_(Reply e.g.: **"12 in stock, cost 6000"**)_\n\n` +
          `💡 _Or reply **SKIP** to record the ${nf.format(amount)} sale without stock tracking._`;

        await replyToUser(supabase, tenant.id, fromPhone, reply, senderMemberId);
        return;
      }
    }

    const custName = (parsed.customer_name || "").trim() || null;
    const { data: ledger } = await supabase
      .from("ledger_entries")
      .insert({
        tenant_id: tenant.id,
        type: "sale",
        amount,
        item_description: productName
          ? (custName ? `Sold ${qty} ${unit} of ${productName} to ${custName}` : `Sold ${qty} ${unit} of ${productName}`)
          : (custName ? `Sale to ${custName}` : "Sale"),
        product_id: productId,
        payment_method: method,
        customer_name: custName,
        source: isVoice ? "whatsapp_voice" : "whatsapp_text",
        linked_message_id: waMsg.id,
        confidence_score: confidence,
      })
      .select("id")
      .single();

    // Check if product is service or has packaging tiers
    let qtyToDeduct = qty;
    let isProdService = false;
    let prodBaseUnit = "pcs";
    if (productId) {
      let prodInfo: any = null;
      const { data: pData, error: pErr } = await supabase
        .from("products")
        .select("is_service, pieces_per_pack, packaging_units, unit")
        .eq("id", productId)
        .maybeSingle();

      if (pErr) {
        const { data: fbData } = await supabase
          .from("products")
          .select("is_service, pieces_per_pack, unit")
          .eq("id", productId)
          .maybeSingle();
        prodInfo = fbData;
      } else {
        prodInfo = pData;
      }

      isProdService = Boolean(prodInfo?.is_service);
      prodBaseUnit = prodInfo?.unit || "pcs";
      const pkgUnits = parsePackagingUnits(prodInfo?.packaging_units, prodInfo?.pieces_per_pack != null ? Number(prodInfo.pieces_per_pack) : null);
      const mult = resolveUnitMultiplier(unit, pkgUnits, prodInfo?.unit || "pcs", prodInfo?.pieces_per_pack).multiplier;
      qtyToDeduct = qty * mult;
    }

    if (productId && qtyToDeduct > 0 && !isProdService) {
      await updateProductStock({
        supabase,
        tenantId: tenant.id,
        productId,
        changeQty: -qtyToDeduct,
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
    const viaTag = method ? ` via ${method.toUpperCase()}` : "";
    const bulkNote = (qtyToDeduct !== qty) ? ` (${qtyToDeduct} ${prodBaseUnit})` : "";
    let reply = custName
      ? isProdService
        ? `Got it! Recorded *${productName ?? "service"}* (*${nf.format(amount)}*) for *${custName}*${viaTag}.`
        : `Got it! Sold ${qty} ${unit}${bulkNote} of *${productName ?? "item"}* (*${nf.format(amount)}*) to *${custName}*${viaTag}.`
      : isProdService
      ? `Got it! Recorded *${productName ?? "service"}* (*${nf.format(amount)}*)${viaTag}.`
      : `Got it! Sold ${qty} ${unit}${bulkNote} of *${productName ?? "item"}* (*${nf.format(amount)}*)${viaTag}.`;

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
