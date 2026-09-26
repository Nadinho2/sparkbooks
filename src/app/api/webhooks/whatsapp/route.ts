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

function buildConfirmationMessage(
  entryType: string,
  details: {
    productName: string;
    quantity: number;
    unit: string;
    amount: number;
  },
): string {
  const nf = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  });

  switch (entryType) {
    case "sale":
      return `Got it! Sold ${details.quantity} ${details.unit} of ${details.productName} (${nf.format(details.amount)})`;
    case "expense":
      return `Recorded expense: ${details.productName} — ${nf.format(details.amount)}`;
    case "stock_in":
      return `Stock added: +${details.quantity} ${details.unit} of ${details.productName}`;
    default:
      return `Entry logged: ${details.productName}`;
  }
}

/** Check if a text reply is an affirmative response (yes-like) */
function isAffirmative(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const affirmatives = [
    "yes", "yeah", "yep", "ya", "sure", "ok", "okay", "k",
    "add it", "add", "go ahead", "do it", "proceed",
  ];
  return affirmatives.some((a) => lower === a || lower.startsWith(a));
}

/** Check if a text reply is a negative response (no-like) */
function isNegative(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const negatives = [
    "no", "nah", "nope", "skip", "cancel", "ignore", "don't", "dont", "leave it",
  ];
  return negatives.some((n) => lower === n || lower.startsWith(n));
}

/** Parse the pending new-product confirmation context stored in failure_reason */
function parsePendingContext(failureReason: string | null): { newProductName: string } | null {
  if (!failureReason) return null;
  try {
    const parsed = JSON.parse(failureReason);
    if (parsed.action === "confirm_new_product" && parsed.new_product_name) {
      return { newProductName: parsed.new_product_name };
    }
    return null;
  } catch {
    return null;
  }
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
 * Full async message processing — runs after 200 is returned.
 * This prevents Meta webhook retries due to slow AI/API calls.
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

  // ── Determine text content ──
  let rawText: string | null = null;
  let isVoice = false;
  let voiceTranscript: string | null = null;
  let voiceMediaUrl: string | null = null;

  if (msgType === "text") {
    rawText = message.text?.body ?? null;
  } else if (msgType === "voice") {
    const mediaId = message.voice?.id;
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
    await sendTextMessage(fromPhone, upgradeMsg);
    return;
  }

  // ── 3. VOICE: download → upload → transcribe ──
  if (isVoice) {
    const mediaId = message.voice?.id;
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
        await sendTextMessage(
          fromPhone,
          "I couldn't make out the audio clearly. Could you type your message instead?",
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
          sender_member_id: senderMemberId,
        });
        await sendTextMessage(
          fromPhone,
          "Your voice note is a bit too long for me to process. Please send a shorter note or type your message instead.",
        );
        return;
      }

      console.error("Voice processing error:", err);
      await supabase.from("whatsapp_messages").insert({
        tenant_id: tenant.id,
        wa_message_id: waMessageId,
        direction: "inbound",
        type: "voice",
        status: "failed",
        sender_member_id: senderMemberId,
      });
      await sendTextMessage(
        fromPhone,
        "Sorry, I ran into trouble processing your voice note. Please type your message and I'll handle it right away.",
      );
      return;
    }
  }

  // ── 4. CHECK FOR PENDING CONFIRMATION ──
  if (!isVoice && rawText) {
    const { data: pendingMsgs } = await supabase
      .from("whatsapp_messages")
      .select("id, raw_text, failure_reason, created_at")
      .eq("tenant_id", tenant.id)
      .eq("status", "pending_confirmation")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(5);

    if (pendingMsgs && pendingMsgs.length > 0) {
      for (const pending of pendingMsgs) {
        const context = parsePendingContext(pending.failure_reason);
        if (context) {
          if (isAffirmative(rawText)) {
            const trimmedName = context.newProductName.trim();
            const { checkProductLimit: cpl } = await import("@/lib/billing-server");
            const productLimit = await cpl(tenant.id);
            if (!productLimit.allowed) {
              await sendTextMessage(
                fromPhone,
                `Can't add "${trimmedName}" — you've reached your product limit (${productLimit.currentCount}/${productLimit.maxProducts}). Upgrade your plan to add more.`,
              );
            } else {
              const { error: createErr } = await supabase
                .from("products")
                .insert({
                  tenant_id: tenant.id,
                  name: trimmedName,
                  quantity: 0,
                  unit: "pcs",
                })
                .select("id, name")
                .single();

              if (createErr) {
                await sendTextMessage(
                  fromPhone,
                  `Couldn't add "${trimmedName}" — something went wrong. Try adding it from your dashboard.`,
                );
              } else {
                await sendTextMessage(
                  fromPhone,
                  `Added "${trimmedName}" to your catalog. You can now use it in your entries.`,
                );
              }
            }

            await supabase
              .from("whatsapp_messages")
              .update({ status: "matched", failure_reason: null })
              .eq("id", pending.id);

            await supabase.from("whatsapp_messages").insert({
              tenant_id: tenant.id,
              wa_message_id: waMessageId,
              direction: "inbound",
              type: "text",
              raw_text: rawText,
              status: "matched",
              sender_member_id: senderMemberId,
            });

            await incrementMessageCount(tenant.id);
            return;
          } else if (isNegative(rawText)) {
            await supabase
              .from("whatsapp_messages")
              .update({ status: "unmatched", failure_reason: null })
              .eq("id", pending.id);

            await supabase.from("whatsapp_messages").insert({
              tenant_id: tenant.id,
              wa_message_id: waMessageId,
              direction: "inbound",
              type: "text",
              raw_text: rawText,
              status: "unmatched",
              sender_member_id: senderMemberId,
            });

            await sendTextMessage(fromPhone, "OK, skipping that one.");
            return;
          }
          break; // only handle the first pending context
        }
      }
    }
  }

  // ── 5. INSERT INBOUND MESSAGE ──
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

  // ── 6. FETCH PRODUCT CATALOG ──
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

  // ── 7. PARSE WITH DEEPSEEK ──
  let parsed;
  try {
    parsed = await parseMessage(rawText!, catalogItems);
  } catch (err) {
    console.error("DeepSeek parse error:", err);
    await supabase
      .from("whatsapp_messages")
      .update({ status: "failed" })
      .eq("id", waMsg.id);
    return;
  }

  const { confidence, entry_type } = parsed;

  // Increment usage counter
  await incrementMessageCount(tenant.id);

  // ── 8a. HIGH CONFIDENCE + NEW PRODUCT ──
  if (
    confidence >= 0.75 &&
    entry_type !== "unclear" &&
    parsed.is_new_product &&
    parsed.new_product_name
  ) {
    const pendingContext = JSON.stringify({
      action: "confirm_new_product",
      new_product_name: parsed.new_product_name,
    });

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "pending_confirmation",
        failure_reason: pendingContext,
      })
      .eq("id", waMsg.id);

    await sendTextMessage(
      fromPhone,
      `New item "${parsed.new_product_name}" — add this to your catalog? Reply yes or no.`,
    );
  }
  // ── 8b. HIGH CONFIDENCE + MATCHED PRODUCT ──
  else if (
    confidence >= 0.75 &&
    entry_type !== "unclear" &&
    parsed.matched_product_id
  ) {
    let linkedEntryId: number | null = null;

    if (entry_type === "sale" || entry_type === "expense") {
      const { data: ledger } = await supabase
        .from("ledger_entries")
        .insert({
          tenant_id: tenant.id,
          type: entry_type,
          amount: parsed.amount ?? 0,
          item_description: parsed.matched_product_name ?? "Unknown item",
          product_id: parsed.matched_product_id,
          source: isVoice ? "whatsapp_voice" : "whatsapp_text",
          linked_message_id: waMsg.id,
          confidence_score: confidence,
        })
        .select("id")
        .single();

      linkedEntryId = ledger?.id ?? null;
    }

    if (entry_type === "stock_in" || entry_type === "sale") {
      const changeQty =
        entry_type === "sale"
          ? -(parsed.quantity ?? 0)
          : parsed.quantity ?? 0;

      const movementId = await updateProductStock({
        supabase,
        tenantId: tenant.id,
        productId: parsed.matched_product_id,
        changeQty,
        type: entry_type === "sale" ? "out" : "in",
        source: isVoice ? "whatsapp_voice" : "whatsapp_text",
        linkedMessageId: waMsg.id,
        alertPhone: fromPhone,
      });

      if (!linkedEntryId && movementId) linkedEntryId = movementId;
    }

    await supabase
      .from("whatsapp_messages")
      .update({
        status: "matched",
        linked_entry_id: linkedEntryId,
      })
      .eq("id", waMsg.id);

    const confirmMsg = buildConfirmationMessage(entry_type, {
      productName: parsed.matched_product_name ?? "item",
      quantity: parsed.quantity ?? 0,
      unit: parsed.unit ?? "pcs",
      amount: parsed.amount ?? 0,
    });

    await sendTextMessage(fromPhone, confirmMsg);
  }
  // ── 8c. LOW CONFIDENCE OR UNCLEAR ──
  else {
    if (parsed.clarification_needed) {
      await sendTextMessage(fromPhone, parsed.clarification_needed);
    } else {
      await sendTemplateMessage(fromPhone, "entry_unclear_fallback");
    }

    await supabase
      .from("whatsapp_messages")
      .update({ status: "pending_confirmation" })
      .eq("id", waMsg.id);
  }
}
