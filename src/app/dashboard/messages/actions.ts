"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant-server";

export interface MessageRow {
  id: number;
  waMessageId: string;
  direction: "inbound" | "outbound";
  type: "voice" | "text" | "template";
  rawText: string | null;
  transcript: string | null;
  mediaUrl: string | null;
  status: "matched" | "unmatched" | "pending_confirmation" | "failed";
  linkedEntryId: number | null;
  senderMemberId: number | null;
  senderName: string | null;
  createdAt: string;
}

export interface LinkedEntry {
  id: number;
  type: "sale" | "expense" | "stock_in" | "stock_out";
  description: string;
  amount: number;
  createdAt: string;
}

interface FetchMessagesParams {
  tenantId: number;
  status?: string;
  search?: string;
  beforeDate?: string;
  afterDate?: string;
  cursor?: number;
  limit?: number;
}

export async function fetchMessages(
  params: FetchMessagesParams,
): Promise<{ messages: MessageRow[]; hasMore: boolean; nextCursor: number | null }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();

  const { status, search, beforeDate, afterDate, cursor, limit = 30 } = params;

  const supabase = createAdminClient();
  let query = supabase
    .from("whatsapp_messages")
    .select(
      "id, wa_message_id, direction, type, raw_text, transcript, media_url, status, linked_entry_id, sender_member_id, created_at, tenant_members!sender_member_id(invited_email)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  // Filters
  if (status && status !== "all") {
    query = query.eq("status", status);
  }
  if (search) {
    query = query.or(
      `raw_text.ilike.%${search}%,transcript.ilike.%${search}%`,
    );
  }
  if (beforeDate) {
    query = query.lte("created_at", beforeDate);
  }
  if (afterDate) {
    query = query.gte("created_at", afterDate);
  }
  if (cursor) {
    query = query.lt("id", cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const hasMore = (data ?? []).length > limit;
  const messages = (hasMore ? (data ?? []).slice(0, limit) : data ?? []).map(
    (m) => ({
      id: m.id,
      waMessageId: m.wa_message_id,
      direction: m.direction,
      type: m.type,
      rawText: m.raw_text,
      transcript: m.transcript,
      mediaUrl: m.media_url,
      status: m.status,
      linkedEntryId: m.linked_entry_id,
      senderMemberId: m.sender_member_id,
      senderName:
        (m.tenant_members as { invited_email?: string } | null)?.invited_email ?? null,
      createdAt: m.created_at,
    }),
  );

  return {
    messages,
    hasMore,
    nextCursor: hasMore && messages.length > 0 ? messages[messages.length - 1].id : null,
  };
}

/**
 * Fetch linked ledger entries and stock movements for a set of message IDs.
 */
export async function fetchLinkedEntries(
  _clientTenantId: number,
  messageIds: number[],
): Promise<Record<number, LinkedEntry[]>> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();

  const supabase = createAdminClient();

  const result: Record<number, LinkedEntry[]> = {};

  // Ledger entries linked to these messages
  const { data: ledgers } = await supabase
    .from("ledger_entries")
    .select("id, type, item_description, amount, linked_message_id, created_at")
    .eq("tenant_id", tenantId)
    .in("linked_message_id", messageIds);

  if (ledgers) {
    for (const l of ledgers) {
      const msgId = l.linked_message_id;
      if (!result[msgId]) result[msgId] = [];
      result[msgId].push({
        id: l.id,
        type: l.type,
        description: l.item_description,
        amount: Number(l.amount),
        createdAt: l.created_at,
      });
    }
  }

  // Stock movements linked to these messages
  const { data: movements } = await supabase
    .from("stock_movements")
    .select(
      "id, type, product_id, change_qty, linked_message_id, products(name)",
    )
    .eq("tenant_id", tenantId)
    .in("linked_message_id", messageIds);

  if (movements) {
    for (const m of movements) {
      const msgId = m.linked_message_id;
      if (!result[msgId]) result[msgId] = [];
      const productName =
        (m.products as unknown as { name: string }[])?.[0]?.name ?? "Unknown";
      result[msgId].push({
        id: m.id,
        type: m.type === "in" ? "stock_in" : "stock_out",
        description: `${m.type === "in" ? "+" : "-"}${Math.abs(m.change_qty)} of ${productName}`,
        amount: 0,
        createdAt: "",
      });
    }
  }

  return result;
}
