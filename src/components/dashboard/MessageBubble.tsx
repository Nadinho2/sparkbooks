"use client";

import { format } from "date-fns";
import type { MessageRow, LinkedEntry } from "@/app/dashboard/messages/actions";
import { VoicePlayer } from "./VoicePlayer";
import { formatNaira } from "@/lib/format";

interface MessageBubbleProps {
  message: MessageRow;
  linkedEntries: LinkedEntry[];
}

function formatEntryBadge(entry: LinkedEntry): string {
  const label =
    entry.type === "sale"
      ? "Sale"
      : entry.type === "expense"
        ? "Expense"
        : entry.type === "stock_in"
          ? "Stock in"
          : "Stock out";

  if (entry.amount > 0) {
    return `${label}: ${formatNaira(entry.amount)} ${entry.description}`;
  }
  return `${label}: ${entry.description}`;
}

function entryBadgeColor(type: string) {
  switch (type) {
    case "sale":
      return "bg-money-light text-money border-money/20";
    case "expense":
      return "bg-flag-light text-flag border-flag/20";
    case "stock_in":
      return "bg-spark/10 text-spark border-spark/20";
    default:
      return "bg-rule text-ink-muted border-rule";
  }
}

const STATUS_LABELS: Record<string, string> = {
  matched: "Matched",
  unmatched: "Unmatched",
  pending_confirmation: "Needs review",
  failed: "Failed",
};

export function MessageBubble({ message, linkedEntries }: MessageBubbleProps) {
  const isInbound = message.direction === "inbound";
  const isVoice = message.type === "voice";
  const needsAttention =
    message.status === "pending_confirmation" || message.status === "failed";
  const timestamp = new Date(message.createdAt);

  return (
    <div
      className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-3 group`}
    >
      <div className={`max-w-[78%] min-w-0 ${isInbound ? "" : "items-end"}`}>
        {/* Bubble */}
        <div
          className={`relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isInbound
              ? "bg-white text-ink rounded-tl-sm border border-rule/60 shadow-2xs"
              : "bg-[#DCF8C6] text-ink rounded-tr-sm shadow-2xs"
          }`}
        >
          {/* Sender Header: Name, Username, Email, and Role Badge */}
          <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-rule/40 text-[11px] leading-tight">
            <span className="font-semibold text-ink truncate max-w-[130px] sm:max-w-[160px]">
              {message.senderName || (isInbound ? "Store Staff" : "SparkBooks AI Bot")}
            </span>

            {message.senderUsername && (
              <span className="text-spark font-medium truncate max-w-[100px] text-[10px]">
                {message.senderUsername}
              </span>
            )}

            {message.senderEmail && (
              <span className="text-ink-muted/80 text-[10px] truncate max-w-[160px] hidden sm:inline">
                &bull; {message.senderEmail}
              </span>
            )}

            <span
              className={`ml-auto shrink-0 text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider ${
                message.senderRole === "owner"
                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                  : message.senderRole === "bot"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-blue-100 text-blue-800 border border-blue-200"
              }`}
            >
              {message.senderRole === "owner"
                ? "Owner"
                : message.senderRole === "bot"
                  ? "Bot"
                  : "Staff"}
            </span>
          </div>

          {/* Status flag dot */}
          {needsAttention && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-flag border border-white"
              title={STATUS_LABELS[message.status]}
            />
          )}

          {/* Voice player */}
          {isVoice && message.mediaUrl ? (
            <VoicePlayer
              storagePath={message.mediaUrl}
              transcript={message.transcript}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words">
              {message.rawText ?? message.transcript}
            </p>
          )}
        </div>

        {/* Meta row: timestamp + status */}
        <div
          className={`flex items-center gap-1.5 mt-1 px-1 ${
            isInbound ? "justify-start" : "justify-end"
          }`}
        >
          <span className="text-[10px] text-ink-muted/70">
            {format(timestamp, "HH:mm")}
          </span>
          {message.senderEmail && (
            <span className="sm:hidden text-[10px] text-ink-muted/60 truncate max-w-[150px]">
              &middot; {message.senderEmail}
            </span>
          )}
          {isVoice && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="text-ink-muted/50"
            >
              <path
                d="M3 5.5v1a3 3 0 003 3v0a3 3 0 003-3v-1M6 9.5v1.5M4.5 11h3"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
          )}
          {needsAttention && (
            <span className="text-[10px] text-flag font-medium">
              {STATUS_LABELS[message.status]}
            </span>
          )}
        </div>

        {/* Linked entry badges */}
        {linkedEntries.length > 0 && (
          <div
            className={`flex flex-wrap gap-1 mt-1.5 ${
              isInbound ? "justify-start" : "justify-end"
            }`}
          >
            {linkedEntries.map((entry) => (
              <span
                key={entry.id}
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${entryBadgeColor(entry.type)}`}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className="shrink-0"
                >
                  <path
                    d="M1 9l8-8M8 1H3.5M8 1v4.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {formatEntryBadge(entry)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
