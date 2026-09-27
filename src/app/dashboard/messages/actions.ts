"use server";

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/tenant-server";

export interface SenderProfile {
  id: string; // "owner" or member id as string
  name: string;
  username: string | null;
  email: string | null;
  role: "owner" | "member";
}

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
  senderUsername: string | null;
  senderEmail: string | null;
  senderRole: "owner" | "member" | "bot";
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
  senderId?: string;
  cursor?: number;
  limit?: number;
}

/**
 * Fetch all registered senders (Owner + Active/Pending Team Members) with their Clerk profiles.
 */
export async function getTenantSenders(providedTenantId?: number): Promise<SenderProfile[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  if (providedTenantId && providedTenantId !== tenantId) {
    throw new Error("Unauthorized tenant access");
  }

  const supabase = createAdminClient();

  // 1. Fetch tenant owner info
  const { data: tenant } = await supabase
    .from("tenants")
    .select("business_name, clerk_user_id, whatsapp_number")
    .eq("id", tenantId)
    .single();

  // 2. Fetch tenant members
  const { data: members } = await supabase
    .from("tenant_members")
    .select("id, clerk_user_id, role, invited_email, whatsapp_number")
    .eq("tenant_id", tenantId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });

  const senders: SenderProfile[] = [];

  // Helper to fetch Clerk user profile safely
  const getClerkInfo = async (clerkUserId: string | null) => {
    if (!clerkUserId) return null;
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const u = await client.users.getUser(clerkUserId);
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
      return {
        fullName: fullName || null,
        username: u.username ? `@${u.username}` : null,
        email: u.emailAddresses[0]?.emailAddress ?? null,
      };
    } catch {
      return null;
    }
  };

  // 3. Add Owner profile
  let ownerName = tenant?.business_name ? `${tenant.business_name} (Owner)` : "Store Owner";
  let ownerUsername: string | null = null;
  let ownerEmail: string | null = null;

  if (tenant?.clerk_user_id) {
    const ownerClerk = await getClerkInfo(tenant.clerk_user_id);
    if (ownerClerk) {
      if (ownerClerk.fullName) ownerName = ownerClerk.fullName;
      ownerUsername = ownerClerk.username;
      ownerEmail = ownerClerk.email;
    }
  }

  senders.push({
    id: "owner",
    name: ownerName,
    username: ownerUsername,
    email: ownerEmail,
    role: "owner",
  });

  // 4. Add Team Member profiles
  if (members && members.length > 0) {
    for (const m of members) {
      let name = m.invited_email ? m.invited_email.split("@")[0] : `Staff #${m.id}`;
      let username: string | null = null;
      let email: string | null = m.invited_email ?? null;

      if (m.clerk_user_id) {
        const memClerk = await getClerkInfo(m.clerk_user_id);
        if (memClerk) {
          if (memClerk.fullName) name = memClerk.fullName;
          else if (memClerk.username) name = memClerk.username;
          username = memClerk.username;
          if (memClerk.email) email = memClerk.email;
        }
      }

      senders.push({
        id: String(m.id),
        name,
        username,
        email,
        role: "member",
      });
    }
  }

  return senders;
}

export async function fetchMessages(
  params: FetchMessagesParams,
): Promise<{
  messages: MessageRow[];
  hasMore: boolean;
  nextCursor: number | null;
  senders: SenderProfile[];
}> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const tenantId = await getCurrentTenantId();
  const { status, search, beforeDate, afterDate, senderId, cursor, limit = 30 } = params;

  // Fetch senders directory for enrichment and filter dropdown
  const senders = await getTenantSenders(tenantId);
  const ownerSender = senders.find((s) => s.id === "owner");
  const senderMap = new Map<string, SenderProfile>(senders.map((s) => [s.id, s]));

  const supabase = createAdminClient();
  let query = supabase
    .from("whatsapp_messages")
    .select(
      "id, wa_message_id, direction, type, raw_text, transcript, media_url, status, linked_entry_id, sender_member_id, created_at",
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

  // Sender filtering
  if (senderId && senderId !== "all") {
    if (senderId === "owner") {
      query = query.is("sender_member_id", null).eq("direction", "inbound");
    } else {
      query = query.eq("sender_member_id", parseInt(senderId, 10));
    }
  }

  if (cursor) {
    query = query.lt("id", cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const hasMore = (data ?? []).length > limit;
  const messages = (hasMore ? (data ?? []).slice(0, limit) : data ?? []).map(
    (m): MessageRow => {
      const isOutbound = m.direction === "outbound";
      if (isOutbound) {
        return {
          id: m.id,
          waMessageId: m.wa_message_id,
          direction: "outbound",
          type: m.type,
          rawText: m.raw_text,
          transcript: m.transcript,
          mediaUrl: m.media_url,
          status: m.status,
          linkedEntryId: m.linked_entry_id,
          senderMemberId: m.sender_member_id,
          senderName: "SparkBooks AI Bot",
          senderUsername: "@sparkbooks",
          senderEmail: "ai@sparkbooks.com",
          senderRole: "bot",
          createdAt: m.created_at,
        };
      }

      // Inbound: Resolve member or owner profile
      const memberProfile = m.sender_member_id
        ? senderMap.get(String(m.sender_member_id))
        : null;
      const effectiveSender = memberProfile ?? ownerSender;

      return {
        id: m.id,
        waMessageId: m.wa_message_id,
        direction: "inbound",
        type: m.type,
        rawText: m.raw_text,
        transcript: m.transcript,
        mediaUrl: m.media_url,
        status: m.status,
        linkedEntryId: m.linked_entry_id,
        senderMemberId: m.sender_member_id,
        senderName: effectiveSender?.name ?? "Store Staff",
        senderUsername: effectiveSender?.username ?? null,
        senderEmail: effectiveSender?.email ?? null,
        senderRole: effectiveSender?.role ?? "member",
        createdAt: m.created_at,
      };
    },
  );

  return {
    messages,
    hasMore,
    nextCursor: hasMore && messages.length > 0 ? messages[messages.length - 1].id : null,
    senders,
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
      const prod = m.products as unknown as { name: string } | { name: string }[] | null;
      const productName = Array.isArray(prod)
        ? prod[0]?.name ?? "Product"
        : prod?.name ?? "Product";
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
