"use client";

import { useState, useMemo, useTransition } from "react";
import { MetricCard } from "@/components/MetricCard";
import { LedgerRow } from "@/components/LedgerRow";
import { formatNaira } from "@/lib/format";
import { createManualLedgerEntry, deleteLedgerEntry, type LedgerEntryItem } from "@/app/dashboard/actions";
import { getWhatsAppBotUrl, SPARKBOOKS_BOT_PHONE } from "@/lib/whatsapp";

interface ProductOption {
  id: number;
  name: string;
  unitCost: number | null;
}

interface OverviewClientProps {
  businessName: string;
  planTier: string;
  monthlyMessageCount: number;
  monthlyMessageLimit: number;
  initialEntries: LedgerEntryItem[];
  products: ProductOption[];
}

type Period = "today" | "week" | "month" | "all";
type EntryTypeFilter = "all" | "sale" | "expense";

export function OverviewClient({
  businessName,
  planTier,
  monthlyMessageCount,
  monthlyMessageLimit,
  initialEntries,
  products,
}: OverviewClientProps) {
  const [entries, setEntries] = useState<LedgerEntryItem[]>(initialEntries);
  const [period, setPeriod] = useState<Period>("month");
  const [typeFilter, setTypeFilter] = useState<EntryTypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [formType, setFormType] = useState<"sale" | "expense">("sale");
  const [formDesc, setFormDesc] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formProductId, setFormProductId] = useState<string>("");
  const [formQty, setFormQty] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);

  // Filter entries by date period
  const dateFilteredEntries = useMemo(() => {
    const now = new Date();
    return entries.filter((entry) => {
      const entryDate = new Date(entry.createdAt);

      if (period === "today") {
        return (
          entryDate.getDate() === now.getDate() &&
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear()
        );
      }

      if (period === "week") {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return entryDate >= startOfWeek;
      }

      if (period === "month") {
        return (
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear()
        );
      }

      return true; // 'all'
    });
  }, [entries, period]);

  // Aggregate metrics based on selected period
  const metrics = useMemo(() => {
    let sales = 0;
    let expenses = 0;

    for (const e of dateFilteredEntries) {
      if (e.type === "sale") {
        sales += e.amount;
      } else if (e.type === "expense") {
        expenses += e.amount;
      }
    }

    const netProfit = sales - expenses;
    return {
      sales,
      expenses,
      netProfit,
      count: dateFilteredEntries.length,
    };
  }, [dateFilteredEntries]);

  // Filter list by type & search text
  const displayedEntries = useMemo(() => {
    return dateFilteredEntries.filter((entry) => {
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDesc = entry.itemDescription.toLowerCase().includes(q);
        const matchesProd = entry.productName?.toLowerCase().includes(q) ?? false;
        return matchesDesc || matchesProd;
      }
      return true;
    });
  }, [dateFilteredEntries, typeFilter, searchQuery]);

  // Handle manual entry submission
  const handleCreateEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setFormError("Please enter a valid amount.");
      return;
    }

    if (!formDesc.trim()) {
      setFormError("Please enter a description.");
      return;
    }

    const selectedProd = formProductId ? Number(formProductId) : null;
    const qty = formQty ? Number(formQty) : null;

    startTransition(async () => {
      const res = await createManualLedgerEntry({
        type: formType,
        amount: amt,
        itemDescription: formDesc.trim(),
        productId: selectedProd,
        quantity: qty,
      });

      if (!res.success) {
        setFormError(res.error ?? "Failed to save entry.");
      } else {
        // Optimistic append
        const newEntry: LedgerEntryItem = {
          id: Date.now(),
          type: formType,
          amount: amt,
          itemDescription: formDesc.trim(),
          productId: selectedProd,
          productName: products.find((p) => p.id === selectedProd)?.name ?? null,
          source: "dashboard_manual",
          confidenceScore: 1.0,
          createdAt: new Date().toISOString(),
        };
        setEntries((prev) => [newEntry, ...prev]);
        setIsModalOpen(false);
        setFormDesc("");
        setFormAmount("");
        setFormProductId("");
        setFormQty("1");
      }
    });
  };

  // Handle entry deletion
  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to remove this ledger entry?")) return;

    startTransition(async () => {
      const res = await deleteLedgerEntry(id);
      if (res.success) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
      } else {
        alert(res.error ?? "Failed to delete entry");
      }
    });
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ["Date", "Type", "Description", "Product", "Amount (NGN)", "Source"];
    const rows = displayedEntries.map((e) => [
      new Date(e.createdAt).toLocaleDateString("en-NG"),
      e.type.toUpperCase(),
      `"${e.itemDescription.replace(/"/g, '""')}"`,
      `"${(e.productName ?? "").replace(/"/g, '""')}"`,
      e.amount.toFixed(2),
      e.source,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SparkBooks_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl text-ink">Overview & Ledger</h1>
          <p className="text-xs text-ink-muted mt-0.5 sm:mt-1">
            Financial ledger and business health for <strong className="text-ink">{businessName}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            onClick={handleExportCsv}
            disabled={displayedEntries.length === 0}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-ink bg-white border border-rule rounded-lg hover:bg-paper transition-colors disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-spark rounded-lg hover:opacity-90 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Record Entry
          </button>
        </div>
      </div>

      {/* WhatsApp Quick Connect Card */}
      <div className="bg-gradient-to-r from-[#25D366]/10 via-white to-sand-light border border-[#25D366]/30 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0 shadow-xs">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-semibold text-ink">Record sales & check stock on WhatsApp</h2>
              <span className="hidden sm:inline-block px-2 py-0.2 rounded-full text-[10px] font-semibold bg-[#25D366]/20 text-[#128C7E]">
                24/7 AI Active
              </span>
            </div>
            <p className="text-[11px] text-ink-muted mt-0.5 truncate">
              Send voice notes or text entries anytime to <strong>+{SPARKBOOKS_BOT_PHONE}</strong>
            </p>
          </div>
        </div>
        <a
          href={getWhatsAppBotUrl(businessName)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          Open WhatsApp Bot ↗
        </a>
      </div>

      {/* Period Selector Tabs */}
      <div className="flex items-center justify-between border-b border-rule pb-2 gap-2 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1 bg-paper p-1 rounded-lg border border-rule/60 shrink-0">
          {(
            [
              { key: "today", label: "Today" },
              { key: "week", label: "This Week" },
              { key: "month", label: "This Month" },
              { key: "all", label: "All Time" },
            ] as const
          ).map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`shrink-0 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p.key ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-ink-muted shrink-0 hidden sm:inline">
          {planTier.toUpperCase()} Plan &bull; {monthlyMessageCount}/{monthlyMessageLimit === -1 ? "∞" : monthlyMessageLimit} messages
        </span>
      </div>

      {/* Financial Metrics Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="border border-rule rounded-xl bg-white p-3.5 shadow-sm">
          <MetricCard label="Total Sales (Revenue)" value={formatNaira(metrics.sales)} tone="money" />
        </div>
        <div className="border border-rule rounded-xl bg-white p-3.5 shadow-sm">
          <MetricCard label="Total Expenses" value={formatNaira(metrics.expenses)} tone="flag" />
        </div>
        <div className="border border-rule rounded-xl bg-white p-3.5 shadow-sm">
          <MetricCard
            label="Net Profit"
            value={formatNaira(metrics.netProfit)}
            tone={metrics.netProfit >= 0 ? "money" : "flag"}
          />
        </div>
        <div className="border border-rule rounded-xl bg-white p-3.5 shadow-sm">
          <MetricCard
            label="Entries in Period"
            value={String(metrics.count)}
            tone="neutral"
          />
        </div>
      </div>

      {/* Ledger Feed Section */}
      <div className="bg-white border border-rule rounded-xl shadow-sm overflow-hidden">
        {/* Sub-header with search and type filters */}
        <div className="p-4 border-b border-rule bg-paper/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {(
              [
                { key: "all", label: "All" },
                { key: "sale", label: "Sales" },
                { key: "expense", label: "Expenses" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTypeFilter(t.key)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  typeFilter === t.key
                    ? "bg-ink text-white"
                    : "bg-paper text-ink-muted hover:text-ink border border-rule/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search transactions…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 pl-8 pr-3 py-1.5 text-xs bg-white border border-rule rounded-lg focus:outline-none focus:border-spark"
            />
            <svg
              className="absolute left-2.5 top-2 text-ink-muted"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        </div>

        {/* Ledger Rows List */}
        {displayedEntries.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-12 h-12 rounded-full bg-paper flex items-center justify-center mx-auto mb-3 text-ink-muted">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-ink">No transactions found</h3>
            <p className="text-xs text-ink-muted max-w-sm mx-auto mt-1">
              Send sales or expenses as a WhatsApp message, record a voice note, or use the Record Entry button above.
            </p>
            <a
              href={getWhatsAppBotUrl(businessName)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-semibold shadow-xs transition-colors"
            >
              Open WhatsApp Bot ↗
            </a>
          </div>
        ) : (
          <div className="divide-y divide-rule">
            {displayedEntries.map((entry, index) => {
              const formattedDate = new Date(entry.createdAt).toLocaleDateString("en-NG", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              const subtitle = `${formattedDate}${entry.productName ? ` • ${entry.productName}` : ""}`;

              return (
                <LedgerRow
                  key={entry.id}
                  title={entry.itemDescription}
                  subtitle={subtitle}
                  amount={entry.amount}
                  direction={entry.type === "sale" ? "in" : "out"}
                  source={entry.source}
                  isLast={index === displayedEntries.length - 1}
                  onDelete={() => handleDelete(entry.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-rule relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-ink-muted hover:text-ink text-sm"
            >
              ✕
            </button>

            <h2 className="font-display text-lg text-ink mb-1">Record Transaction</h2>
            <p className="text-xs text-ink-muted mb-4">
              Add a manual transaction directly into your SparkBooks ledger.
            </p>

            {formError && (
              <div className="mb-4 bg-flag-light border border-flag/30 text-flag text-xs rounded-lg p-3">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateEntry} className="space-y-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 bg-paper p-1 rounded-lg border border-rule">
                <button
                  type="button"
                  onClick={() => setFormType("sale")}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    formType === "sale" ? "bg-white text-money shadow-sm" : "text-ink-muted"
                  }`}
                >
                  + Sale (Income)
                </button>
                <button
                  type="button"
                  onClick={() => setFormType("expense")}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                    formType === "expense" ? "bg-white text-flag shadow-sm" : "text-ink-muted"
                  }`}
                >
                  - Expense (Cost)
                </button>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Item Description / Details <span className="text-flag">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={formType === "sale" ? "e.g. Sold 2 cartons Indomie" : "e.g. Generator fuel, transport"}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-rule rounded-lg focus:outline-none focus:border-spark"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Amount in Naira (₦) <span className="text-flag">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="e.g. 5000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-rule rounded-lg focus:outline-none focus:border-spark font-mono"
                />
              </div>

              {/* Product link (optional for sales) */}
              {formType === "sale" && products.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-ink mb-1">Linked Product (Optional)</label>
                    <select
                      value={formProductId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setFormProductId(pid);
                        if (pid) {
                          const p = products.find((item) => String(item.id) === pid);
                          if (p && !formDesc) setFormDesc(`Sale of ${p.name}`);
                          if (p?.unitCost && !formAmount) setFormAmount(String(p.unitCost));
                        }
                      }}
                      className="w-full text-xs px-3 py-2 border border-rule rounded-lg focus:outline-none focus:border-spark bg-white"
                    >
                      <option value="">-- No inventory link --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.unitCost ? `(₦${p.unitCost})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink mb-1">Qty Sold</label>
                    <input
                      type="number"
                      min="1"
                      value={formQty}
                      onChange={(e) => setFormQty(e.target.value)}
                      disabled={!formProductId}
                      className="w-full text-xs px-3 py-2 border border-rule rounded-lg focus:outline-none focus:border-spark disabled:bg-paper"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-ink bg-paper rounded-lg hover:bg-rule/50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-medium text-white bg-spark rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isPending ? "Saving…" : "Save Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
