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
} from "@/app/dashboard/messages/actions";
import { fetchMessages, fetchLinkedEntries } from "@/app/dashboard/messages/actions";
import { MessageBubble } from "./MessageBubble";
import { ChatFilters, type ChatFilterValues } from "./ChatFilters";

interface ChatThreadProps {
  tenantId: number;
  initialMessages: MessageRow[];
  initialHasMore: boolean;
  initialNextCursor: number | null;
}

export function ChatThread({
  tenantId,
  initialMessages,
  initialHasMore,
  initialNextCursor,
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
    loadLinkedEntries(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <ChatFilters onChange={handleFilterChange} />

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
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              className="text-rule mb-3"
            >
              <rect
                x="6"
                y="6"
                width="36"
                height="36"
                rx="8"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16 20h16M16 28h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-sm text-ink-muted">No messages yet</p>
            <p className="text-xs text-ink-muted/70 mt-1">
              WhatsApp messages will appear here as they come in.
            </p>
          </div>
        )}

        {/* Date-grouped messages */}
        {dateGroups.map((group, gi) => (
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
