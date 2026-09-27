"use client";

import { useState } from "react";
import type { SenderProfile } from "@/app/dashboard/messages/actions";

export interface ChatFilterValues {
  status: string;
  search: string;
  senderId: string;
  afterDate: string;
  beforeDate: string;
}

interface ChatFiltersProps {
  senders?: SenderProfile[];
  onChange: (filters: ChatFilterValues) => void;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All messages" },
  { value: "matched", label: "Matched" },
  { value: "pending_confirmation", label: "Needs review" },
  { value: "failed", label: "Failed" },
  { value: "unmatched", label: "Unmatched" },
];

export function ChatFilters({ senders = [], onChange }: ChatFiltersProps) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [senderId, setSenderId] = useState("all");
  const [afterDate, setAfterDate] = useState("");
  const [beforeDate, setBeforeDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  function emit(next: Partial<ChatFilterValues>) {
    const merged = { status, search, senderId, afterDate, beforeDate, ...next };
    onChange(merged);
  }

  return (
    <div className="p-3 sm:p-4 bg-white border-b border-rule rounded-t-xl">
      {/* Keyword search + status */}
      <div className="flex items-center gap-2 mb-2 sm:mb-0">
        <div className="relative flex-1 min-w-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted/50 shrink-0"
          >
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              emit({ search: e.target.value });
            }}
            placeholder="Search messages…"
            className="w-full border border-rule rounded-lg pl-8 pr-3 py-1.5 text-sm text-ink outline-none focus:border-spark transition-colors"
          />
        </div>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            emit({ status: e.target.value });
          }}
          className="border border-rule rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm text-ink outline-none focus:border-spark transition-colors bg-white shrink-0"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Sender filter */}
        <select
          value={senderId}
          onChange={(e) => {
            setSenderId(e.target.value);
            emit({ senderId: e.target.value });
          }}
          className="border border-rule rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm text-ink outline-none focus:border-spark transition-colors bg-white shrink-0 max-w-[130px] sm:max-w-[210px] truncate"
          title="Filter by sender"
        >
          <option value="all">All Senders</option>
          {senders.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.username ? `(${s.username})` : s.email ? `(${s.email})` : `(${s.role})`}
            </option>
          ))}
        </select>

        {/* Filter toggle for date range on mobile */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="sm:hidden shrink-0 border border-rule rounded-lg px-2 py-1.5 text-sm text-ink-muted"
          aria-label="More filters"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 4h10M4 7h6M5.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Date range — always visible on desktop, toggleable on mobile */}
      <div className={`${showFilters ? "flex" : "hidden sm:flex"} items-center gap-1.5 mt-2 sm:mt-0 sm:ml-0`}>
        <div className="flex items-center gap-1.5 text-sm flex-1 sm:flex-initial">
          <input
            type="date"
            value={afterDate}
            onChange={(e) => {
              setAfterDate(e.target.value);
              emit({ afterDate: e.target.value });
            }}
            className="border border-rule rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-spark transition-colors flex-1 sm:w-[140px]"
            aria-label="From date"
          />
          <span className="text-ink-muted/50">&ndash;</span>
          <input
            type="date"
            value={beforeDate}
            onChange={(e) => {
              setBeforeDate(e.target.value);
              emit({ beforeDate: e.target.value });
            }}
            className="border border-rule rounded-lg px-2 py-1.5 text-sm text-ink outline-none focus:border-spark transition-colors flex-1 sm:w-[140px]"
            aria-label="To date"
          />
        </div>

        {/* Needs review quick link */}
        {status === "all" && (
          <button
            onClick={() => {
              setStatus("pending_confirmation");
              emit({ status: "pending_confirmation" });
            }}
            className="flex items-center gap-1 text-xs text-flag hover:text-flag/80 transition-colors shrink-0 ml-auto"
          >
            <span className="w-2 h-2 rounded-full bg-flag inline-block" />
            <span className="hidden sm:inline">Show items needing review</span>
            <span className="sm:hidden">Review</span>
          </button>
        )}
      </div>
    </div>
  );
}
