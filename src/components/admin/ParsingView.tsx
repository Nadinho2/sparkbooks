"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import type { ParsingIssueRow } from "@/app/admin/actions";
import { adminReRunParse } from "@/app/admin/actions";

interface Props {
  issues: ParsingIssueRow[];
}

export function AdminParsingView({ issues }: Props) {
  const [filter, setFilter] = useState("all");
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<
    Record<number, { success?: boolean; error?: string }>
  >({});

  const filtered =
    filter === "all"
      ? issues
      : issues.filter((i) => i.status === filter);

  function handleReRun(messageId: number, tenantId: number) {
    startTransition(async () => {
      const result = await adminReRunParse(messageId, tenantId);
      setResults((prev) => ({
        ...prev,
        [messageId]: result,
      }));
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-rule rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-spark bg-white"
        >
          <option value="all">All issues</option>
          <option value="failed">Failed only</option>
          <option value="unmatched">Unmatched only</option>
        </select>
        <span className="text-xs text-ink-muted">
          {filtered.length} message{filtered.length !== 1 ? "s" : ""}
        </span>
        {isPending && (
          <span className="text-xs text-ink-muted animate-pulse">
            Processing…
          </span>
        )}
      </div>

      {/* Issue cards */}
      <div className="space-y-3">
        {filtered.map((issue) => {
          const result = results[issue.messageId];

          return (
            <div
              key={issue.messageId}
              className="bg-white rounded-xl border border-rule p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink font-medium">
                    {issue.tenantBusinessName}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      issue.status === "failed"
                        ? "bg-flag-light text-flag"
                        : "bg-rule text-ink-muted"
                    }`}
                  >
                    {issue.status}
                  </span>
                  <span className="text-[10px] bg-spark/10 text-spark px-1.5 py-0.5 rounded">
                    {issue.type}
                  </span>
                  {issue.failureReason && (
                    <span className="text-[10px] bg-rule text-ink-muted px-1.5 py-0.5 rounded">
                      {issue.failureReason}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-ink-muted">
                  {format(new Date(issue.createdAt), "MMM d, HH:mm")}
                </span>
              </div>

              {/* Raw text / transcript */}
              <div className="bg-paper rounded-lg px-3 py-2 mb-2">
                <span className="text-[10px] text-ink-muted uppercase tracking-wider block mb-0.5">
                  {issue.transcript ? "Transcript" : "Raw text"}
                </span>
                <p className="text-sm text-ink whitespace-pre-wrap break-words">
                  {issue.transcript || issue.rawText || "(empty)"}
                </p>
              </div>

              {/* Re-run button + result */}
              <div className="flex items-center gap-3">
                {issue.type !== "voice" && (
                  <button
                    onClick={() =>
                      handleReRun(issue.messageId, issue.tenantId)
                    }
                    disabled={isPending}
                    className="text-xs font-medium bg-ink text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? "Running…" : "Re-run parse"}
                  </button>
                )}
                {issue.type === "voice" && (
                  <span className="text-[10px] text-ink-muted italic">
                    Voice message — re-parse not currently supported
                  </span>
                )}
                {result && (
                  <span
                    className={`text-xs ${
                      result.success ? "text-money" : "text-flag"
                    }`}
                  >
                    {result.success
                      ? "Re-parsed successfully"
                      : result.error}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-rule p-8 text-center text-sm text-ink-muted">
          No parsing issues found. Everything is matched.
        </div>
      )}
    </div>
  );
}
