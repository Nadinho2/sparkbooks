"use client";

import { useState, useMemo, useTransition } from "react";
import { formatNaira } from "@/lib/format";
import {
  createCustomerDebt,
  recordDebtPayment,
  settleDebt,
  type CustomerDebtItem,
  type DebtsOverviewData,
} from "@/app/dashboard/debts/actions";

interface DebtsClientProps {
  initialData: DebtsOverviewData;
  businessName: string;
}

type DebtFilter = "all" | "active" | "partially_paid" | "settled";

export function DebtsClient({ initialData, businessName }: DebtsClientProps) {
  const [debts, setDebts] = useState<CustomerDebtItem[]>(initialData.debts);
  const [filter, setFilter] = useState<DebtFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createTotal, setCreateTotal] = useState("");
  const [createPaid, setCreatePaid] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Payment modal state
  const [selectedDebt, setSelectedDebt] = useState<CustomerDebtItem | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("transfer");
  const [payError, setPayError] = useState<string | null>(null);

  // Metrics calculation
  const metrics = useMemo(() => {
    let totalOwed = 0;
    let totalPaid = 0;
    let activeCount = 0;

    for (const d of debts) {
      if (d.status !== "settled") {
        totalOwed += d.amountOwed;
        activeCount++;
      }
      totalPaid += d.amountPaid;
    }

    return { totalOwed, totalPaid, activeCount };
  }, [debts]);

  // Filtered debts
  const displayedDebts = useMemo(() => {
    return debts.filter((d) => {
      // Status filter
      if (filter === "active" && d.status === "settled") return false;
      if (filter === "partially_paid" && d.status !== "partially_paid") return false;
      if (filter === "settled" && d.status !== "settled") return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = d.customerName.toLowerCase().includes(q);
        const matchPhone = d.customerPhone?.toLowerCase().includes(q);
        const matchNotes = d.notes?.toLowerCase().includes(q);
        return matchName || matchPhone || matchNotes;
      }

      return true;
    });
  }, [debts, filter, searchQuery]);

  // Handle Create Debt
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const total = parseFloat(createTotal);
    if (isNaN(total) || total <= 0) {
      setCreateError("Please enter a valid total amount.");
      return;
    }
    const paid = parseFloat(createPaid) || 0;

    startTransition(async () => {
      const res = await createCustomerDebt({
        customerName: createName,
        customerPhone: createPhone || undefined,
        totalAmount: total,
        amountPaid: paid,
        notes: createNotes || undefined,
      });

      if (!res.success) {
        setCreateError(res.error || "Failed to create debt record");
      } else {
        // Optimistic refresh
        setIsCreateOpen(false);
        setCreateName("");
        setCreatePhone("");
        setCreateTotal("");
        setCreatePaid("");
        setCreateNotes("");
        // Reload page data
        window.location.reload();
      }
    });
  };

  // Handle Record Payment
  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt) return;
    setPayError(null);

    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setPayError("Please enter a valid payment amount.");
      return;
    }

    startTransition(async () => {
      const res = await recordDebtPayment(selectedDebt.id, amt, payMethod);
      if (!res.success) {
        setPayError(res.error || "Failed to record payment");
      } else {
        setSelectedDebt(null);
        setPayAmount("");
        window.location.reload();
      }
    });
  };

  // Handle Settle 1-Click
  const handleSettleDebt = (debtId: number) => {
    if (!confirm("Are you sure you want to mark this balance as completely settled?")) return;

    startTransition(async () => {
      const res = await settleDebt(debtId);
      if (res.success) {
        window.location.reload();
      } else {
        alert(res.error || "Failed to settle debt");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl text-ink">Customer Debts & Credit</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Track customer balances, credit purchases, and debt repayments for <strong className="text-ink">{businessName}</strong>
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-spark rounded-lg hover:opacity-90 transition-opacity shadow-xs self-stretch sm:self-auto"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Record Customer Debt
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-amber-200/80 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              Total Outstanding Debt
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <p className="font-display text-2xl sm:text-3xl font-bold text-amber-900 mt-2">
            {formatNaira(metrics.totalOwed)}
          </p>
          <p className="text-[11px] text-amber-700 mt-1">
            Across {metrics.activeCount} customer{metrics.activeCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Total Collected Repayments
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <p className="font-display text-2xl sm:text-3xl font-bold text-emerald-900 mt-2">
            {formatNaira(metrics.totalPaid)}
          </p>
          <p className="text-[11px] text-emerald-700 mt-1">
            Recovered into your cashflow
          </p>
        </div>

        <div className="bg-white border border-rule rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              WhatsApp Debt Tracking
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#25D366]/10 text-[#128C7E]">
              AI Automated
            </span>
          </div>
          <p className="text-xs text-ink mt-2 leading-relaxed">
            Record customer debts directly on WhatsApp by sending:
          </p>
          <p className="text-[11px] text-ink-muted font-mono bg-paper p-1.5 rounded-lg mt-1 border border-rule/60">
            &ldquo;Sold 1 wig 80k to Amaka, paid 50k, balance 30k&rdquo;
          </p>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-rule shadow-xs">
        <div className="flex items-center gap-1 bg-paper p-1 rounded-lg border border-rule/60 overflow-x-auto scrollbar-hide">
          {(
            [
              { key: "active", label: `Owing (${debts.filter(d => d.status !== "settled").length})` },
              { key: "all", label: `All (${debts.length})` },
              { key: "partially_paid", label: "Partially Paid" },
              { key: "settled", label: "Settled" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                filter === t.key
                  ? "bg-white text-ink font-semibold shadow-xs"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="Search customer, phone, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-paper border border-rule rounded-lg focus:outline-hidden focus:border-ink transition-colors"
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" />
          </svg>
        </div>
      </div>

      {/* Debtors List Table */}
      <div className="bg-white border border-rule rounded-2xl overflow-hidden shadow-xs">
        {displayedDebts.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-paper text-ink-muted flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <h3 className="font-display text-base font-semibold text-ink">No customer debts found</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
              {filter === "active"
                ? "Congratulations! All your customers have fully settled their accounts."
                : "No debtor records match your current filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-paper border-b border-rule text-ink-muted font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Total Billed</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Amount Owed</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {displayedDebts.map((debt) => {
                  const isSettled = debt.status === "settled";
                  const waReminderText = encodeURIComponent(
                    `Hello ${debt.customerName}! This is a friendly reminder from *${businessName}* regarding your outstanding balance of ${formatNaira(
                      debt.amountOwed
                    )}. Please let us know when convenient to settle. Thank you! 🙏`
                  );
                  const waUrl = debt.customerPhone
                    ? `https://wa.me/${debt.customerPhone.replace(/[^0-9]/g, "")}?text=${waReminderText}`
                    : `https://wa.me/?text=${waReminderText}`;

                  return (
                    <tr key={debt.id} className="hover:bg-sand/20 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-ink">
                        <div>
                          <p className="font-semibold text-ink text-sm">{debt.customerName}</p>
                          {debt.customerPhone && (
                            <p className="text-[11px] text-ink-muted">+{debt.customerPhone.replace(/^\+/, "")}</p>
                          )}
                          {debt.notes && (
                            <p className="text-[11px] text-ink-muted mt-0.5 truncate max-w-xs">{debt.notes}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-ink font-medium">
                        {formatNaira(debt.totalAmount)}
                      </td>
                      <td className="py-3.5 px-4 text-emerald-700 font-medium">
                        {formatNaira(debt.amountPaid)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-sm">
                        {isSettled ? (
                          <span className="text-ink-muted font-normal">₦0</span>
                        ) : (
                          <span className="text-amber-800">{formatNaira(debt.amountOwed)}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {debt.status === "settled" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            SETTLED ✓
                          </span>
                        )}
                        {debt.status === "partially_paid" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            PARTIAL
                          </span>
                        )}
                        {debt.status === "unpaid" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            UNPAID
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isSettled && (
                            <>
                              <button
                                onClick={() => setSelectedDebt(debt)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                              >
                                Record Payment
                              </button>
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Send reminder on WhatsApp"
                                className="p-1 rounded-lg text-[#128C7E] bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 transition-colors"
                              >
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
                                </svg>
                              </a>
                              <button
                                onClick={() => handleSettleDebt(debt.id)}
                                title="1-Click Settle"
                                className="px-2 py-1 text-xs text-ink-muted hover:text-ink hover:bg-sand rounded-lg transition-colors"
                              >
                                Settle
                              </button>
                            </>
                          )}
                          {isSettled && (
                            <span className="text-[11px] text-ink-muted italic">All settled</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {selectedDebt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-200/90 ring-1 ring-black/5 my-auto animate-in zoom-in-95 duration-150">
            <h3 className="font-display text-lg font-bold text-ink">Record Debt Payment</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Customer: <strong className="text-ink">{selectedDebt.customerName}</strong>
            </p>

            <div className="bg-sand/40 p-3 rounded-xl border border-rule/60 my-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-muted">Total Billed:</span>
                <span className="font-medium">{formatNaira(selectedDebt.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Already Paid:</span>
                <span className="font-medium text-emerald-700">{formatNaira(selectedDebt.amountPaid)}</span>
              </div>
              <div className="flex justify-between font-bold text-amber-900 pt-1 border-t border-rule/60">
                <span>Current Balance Due:</span>
                <span>{formatNaira(selectedDebt.amountOwed)}</span>
              </div>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Payment Amount (₦)
                </label>
                <input
                  type="number"
                  required
                  max={selectedDebt.amountOwed}
                  placeholder={selectedDebt.amountOwed.toString()}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-paper border border-rule rounded-lg focus:outline-hidden focus:border-ink font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Payment Channel
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-paper border border-rule rounded-lg focus:outline-hidden focus:border-ink font-medium"
                >
                  <option value="transfer">Bank Transfer (OPay, Kuda, GTB, etc.)</option>
                  <option value="cash">Cash in Hand</option>
                  <option value="pos">POS / Card Terminal</option>
                </select>
              </div>

              {payError && (
                <p className="text-xs text-rose-600 font-medium">{payError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDebt(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isPending ? "Recording..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Debt Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200/90 ring-1 ring-black/5 my-auto animate-in zoom-in-95 duration-150">
            <h3 className="font-display text-lg font-bold text-ink">Record Customer Debt / Credit</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              Record a sale where the customer is paying later or has a pending balance.
            </p>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 mt-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Blessing Okafor"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-paper border border-rule rounded-lg focus:outline-hidden focus:border-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Customer Phone (for WhatsApp Reminders)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-paper border border-rule rounded-lg focus:outline-hidden focus:border-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Total Amount (₦) *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="100000"
                    value={createTotal}
                    onChange={(e) => setCreateTotal(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-paper border border-rule rounded-lg focus:outline-hidden focus:border-ink font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Amount Paid Now (₦)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={createPaid}
                    onChange={(e) => setCreatePaid(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-paper border border-rule rounded-lg focus:outline-hidden focus:border-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Notes / Items Bought
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1 Bone straight wig 28 inches"
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-paper border border-rule rounded-lg focus:outline-hidden focus:border-ink"
                />
              </div>

              {createError && (
                <p className="text-xs text-rose-600 font-medium">{createError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold text-white bg-spark hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
