"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { format, isSameDay } from "date-fns";
import type {
  MessageRow,
  LinkedEntry,
  SenderProfile,
} from "@/app/dashboard/messages/actions";
import { fetchMessages, fetchLinkedEntries } from "@/app/dashboard/messages/actions";
import { MessageBubble } from "./MessageBubble";
import { ChatFilters, type ChatFilterValues } from "./ChatFilters";
import { getWhatsAppBotUrl } from "@/lib/whatsapp";

interface ChatThreadProps {
  tenantId: number;
  businessName?: string;
  initialMessages: MessageRow[];
  initialHasMore: boolean;
  initialNextCursor: number | null;
  initialSenders?: SenderProfile[];
}

export function ChatThread({
  tenantId,
  businessName,
  initialMessages,
  initialHasMore,
  initialNextCursor,
  initialSenders = [],
}: ChatThreadProps) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [linkedEntries, setLinkedEntries] = useState<
    Record<number, LinkedEntry[]>
  >({});
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState<number | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ChatFilterValues>({
    status: "all",
    search: "",
    senderId: "all",
    afterDate: "",
    beforeDate: "",
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const isInitialMount = useRef(true);

  // Display messages oldest-first (bottom = newest)
  const displayMessages = useMemo(
    () => [...messages].reverse(),
    [messages],
  );

  // Fetch linked entries for a batch of messages
  const loadLinkedEntries = useCallback(
    async (msgs: MessageRow[]) => {
      const ids = msgs.map((m) => m.id);
      if (ids.length === 0) return;
      const entries = await fetchLinkedEntries(tenantId, ids);
      setLinkedEntries((prev) => ({ ...prev, ...entries }));
    },
    [tenantId],
  );

  // Load linked entries for initial messages
  useEffect(() => {
    let ignore = false;
    const ids = initialMessages.map((m) => m.id);
    if (ids.length > 0) {
      fetchLinkedEntries(tenantId, ids).then((entries) => {
        if (!ignore) {
          setLinkedEntries((prev) => ({ ...prev, ...entries }));
        }
      });
    }
    return () => {
      ignore = true;
    };
  }, [tenantId, initialMessages]);

  // Scroll to bottom on first load
  useEffect(() => {
    if (isInitialMount.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
      isInitialMount.current = false;
    }
  }, []);

  // Handle filter changes — re-fetch from scratch
  const handleFilterChange = useCallback(
    async (newFilters: ChatFilterValues) => {
      setFilters(newFilters);
      setLoading(true);
      const result = await fetchMessages({
        tenantId,
        status: newFilters.status !== "all" ? newFilters.status : undefined,
        search: newFilters.search || undefined,
        senderId: newFilters.senderId !== "all" ? newFilters.senderId : undefined,
        afterDate: newFilters.afterDate || undefined,
        beforeDate: newFilters.beforeDate
          ? `${newFilters.beforeDate}T23:59:59`
          : undefined,
      });
      setMessages(result.messages);
      setHasMore(result.hasMore);
      setCursor(result.nextCursor);
      setLinkedEntries({});
      loadLinkedEntries(result.messages);
      setLoading(false);

      // Scroll to bottom after filter
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop =
            scrollContainerRef.current.scrollHeight;
        }
      });
    },
    [tenantId, loadLinkedEntries],
  );

  // Load older messages (scroll to top)
  const loadMore = useCallback(async () => {
    if (loading || !hasMore || cursor === null) return;

    setLoading(true);
    prevScrollHeightRef.current =
      scrollContainerRef.current?.scrollHeight ?? 0;

    const result = await fetchMessages({
      tenantId,
      status: filters.status !== "all" ? filters.status : undefined,
      search: filters.search || undefined,
      senderId: filters.senderId !== "all" ? filters.senderId : undefined,
      afterDate: filters.afterDate || undefined,
      beforeDate: filters.beforeDate
        ? `${filters.beforeDate}T23:59:59`
        : undefined,
      cursor,
    });

    setMessages((prev) => [...prev, ...result.messages]);
    setHasMore(result.hasMore);
    setCursor(result.nextCursor);
    loadLinkedEntries(result.messages);
    setLoading(false);
  }, [
    loading,
    hasMore,
    cursor,
    tenantId,
    filters,
    loadLinkedEntries,
  ]);

  // Restore scroll position after prepending older messages
  useEffect(() => {
    if (
      prevScrollHeightRef.current > 0 &&
      scrollContainerRef.current
    ) {
      const newHeight = scrollContainerRef.current.scrollHeight;
      scrollContainerRef.current.scrollTop =
        newHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    }
  }, [displayMessages.length]);

  // Intersection observer for top sentinel
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  // Group messages by date (for date dividers)
  const dateGroups = useMemo(() => {
    const groups: { date: Date; messages: MessageRow[] }[] = [];
    for (const msg of displayMessages) {
      const d = new Date(msg.createdAt);
      const last = groups[groups.length - 1];
      if (last && isSameDay(last.date, d)) {
        last.messages.push(msg);
      } else {
        groups.push({ date: d, messages: [msg] });
      }
    }
    return groups;
  }, [displayMessages]);

  return (
    <div className="bg-white rounded-xl border border-rule overflow-hidden flex flex-col h-[calc(100vh-160px)] sm:h-[calc(100vh-140px)]">
      {/* Filters */}
      <ChatFilters senders={initialSenders} onChange={handleFilterChange} />

      {/* Message list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 bg-[#efeae2]"
      >
        {/* Top sentinel for infinite scroll */}
        <div ref={topSentinelRef} className="h-1" />

        {loading && (
          <div className="text-center py-3">
            <span className="text-xs text-ink-muted animate-pulse">
              Loading…
            </span>
          </div>
        )}

        {displayMessages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className="w-12 h-12 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center mb-3">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink">No WhatsApp messages yet</p>
            <p className="text-xs text-ink-muted/80 max-w-sm mt-1 mb-4">
              Send sales, expenses, or stock updates on WhatsApp and they will appear in this thread in real time.
            </p>
            <a
              href={getWhatsAppBotUrl(businessName)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-semibold shadow-xs transition-colors"
            >
              Open WhatsApp & Chat ↗
            </a>
          </div>
        )}

        {/* Date-grouped messages */}
        {dateGroups.map((group) => (
          <div key={group.date.toISOString()}>
            {/* Date divider */}
            <div className="flex items-center justify-center my-4">
              <span className="bg-white/80 text-[10px] text-ink-muted px-3 py-1 rounded-full shadow-sm border border-rule/40">
                {format(group.date, "EEEE, MMMM d, yyyy")}
              </span>
            </div>

            {group.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                linkedEntries={linkedEntries[msg.id] ?? []}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
