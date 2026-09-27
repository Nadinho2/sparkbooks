"use client";

import { useEffect, useState } from "react";
import { formatNaira } from "@/lib/format";
import type { ProductRow } from "./ProductTable";
import {
  getProductAnalytics,
  type ProductAnalytics,
} from "@/app/dashboard/products/actions";

interface ProductDetailModalProps {
  product: ProductRow;
  tenantId: number;
  onClose: () => void;
  onEdit: (product: ProductRow) => void;
}

type TabType = "sales" | "restocks" | "movements";

export function ProductDetailModal({
  product,
  onClose,
  onEdit,
}: ProductDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("sales");
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<ProductAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const data = await getProductAnalytics(product.id);
        if (!cancelled) {
          setAnalytics(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load product analytics",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const unitCost = analytics?.summary.unitCost ?? product.unitCost;
  const totalSold = analytics?.summary.totalSold ?? 0;
  const totalRevenue = analytics?.summary.totalRevenue ?? 0;
  const avgSellingPrice = analytics?.summary.avgSellingPrice ?? 0;
  const grossProfit = analytics?.summary.grossProfit ?? 0;
  const totalCogs = analytics?.summary.totalCogs ?? 0;
  const profitMarginPct = analytics?.summary.profitMarginPct;
  const currentStock = analytics?.summary.currentStock ?? product.quantity;
  const currentStockValue =
    analytics?.summary.currentStockValue ??
    (unitCost != null ? currentStock * unitCost : 0);

  // Helper to split date into clean date and time
  const formatDateTimeSplit = (isoString?: string) => {
    if (!isoString) return { date: "—", time: "" };
    const d = new Date(isoString);
    const date = d.toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const time = d.toLocaleTimeString("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return { date, time };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden ring-1 ring-black/5 animate-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="p-5 sm:p-6 border-b border-rule bg-gradient-to-b from-slate-50/80 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl sm:text-2xl text-ink font-bold tracking-tight">
                {product.name}
              </h2>
              {product.categoryName && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sand/70 border border-rule/80 text-ink-muted">
                  {product.categoryName}
                </span>
              )}
              {product.isLowStock ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Low Stock ({currentStock} {product.unit} left)
                </span>
              ) : currentStock === 0 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Out of Stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  In Stock ({currentStock} {product.unit})
                </span>
              )}
            </div>

            {/* Subtitle details pill */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span className="bg-sand/40 border border-rule/50 px-2.5 py-1 rounded-md">
                Stock Valuation:{" "}
                <strong className="text-ink font-mono font-medium">
                  {unitCost != null ? formatNaira(currentStockValue) : "—"}
                </strong>
              </span>
              <span className="bg-sand/40 border border-rule/50 px-2.5 py-1 rounded-md">
                Reorder Alert:{" "}
                <strong className="text-ink font-mono font-medium">
                  {product.reorderThreshold != null
                    ? `${product.reorderThreshold} ${product.unit}`
                    : "None"}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => onEdit(product)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rule bg-white text-xs font-medium text-ink hover:bg-sand-light hover:border-ink-muted transition-all shadow-xs"
            >
              <svg
                className="w-3.5 h-3.5 text-ink-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              Edit Product
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-ink-muted hover:text-ink hover:bg-sand-light transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Price Bought For (Cost Price) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Price Bought For
                </span>
                <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs">
                  🏷️
                </span>
              </div>
              <div className="my-1">
                <span className="font-mono text-lg sm:text-xl font-bold text-ink">
                  {unitCost != null ? formatNaira(unitCost) : "Not set"}
                </span>
                {unitCost != null && (
                  <span className="text-xs text-ink-muted ml-1">/{product.unit}</span>
                )}
              </div>
              <span className="text-[11px] text-ink-muted">
                {unitCost != null ? "Unit acquisition cost" : "Click Edit to set cost"}
              </span>
            </div>

            {/* 2. Items Sold */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Items Sold
                </span>
                <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs">
                  🛍️
                </span>
              </div>
              <div className="my-1 flex items-baseline gap-1">
                <span className="font-mono text-lg sm:text-xl font-bold text-ink">
                  {loading ? "..." : totalSold}
                </span>
                <span className="text-xs text-ink-muted font-medium">{product.unit}</span>
              </div>
              <span className="text-[11px] text-ink-muted">
                {loading
                  ? "Calculating..."
                  : totalRevenue > 0
                    ? `${formatNaira(totalRevenue)} total sales`
                    : "No sales yet"}
              </span>
            </div>

            {/* 3. Average Price Sold */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Avg. Price Sold
                </span>
                <span className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-xs">
                  ⚖️
                </span>
              </div>
              <div className="my-1">
                <span className="font-mono text-lg sm:text-xl font-bold text-ink">
                  {loading
                    ? "..."
                    : avgSellingPrice > 0
                      ? formatNaira(avgSellingPrice)
                      : "—"}
                </span>
                {avgSellingPrice > 0 && (
                  <span className="text-xs text-ink-muted ml-1">/{product.unit}</span>
                )}
              </div>
              <span className="text-[11px] text-ink-muted">
                {unitCost != null && avgSellingPrice > unitCost ? (
                  <span className="text-emerald-600 font-medium">
                    +{formatNaira(avgSellingPrice - unitCost)} above cost
                  </span>
                ) : totalSold > 0 ? (
                  `Across ${totalSold} ${product.unit} sold`
                ) : (
                  "Pending first sale"
                )}
              </span>
            </div>

            {/* 4. Gross Profit (Hero Card) */}
            <div className="bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 border-2 border-emerald-300/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Gross Profit
                </span>
                <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">
                  📈
                </span>
              </div>
              <div className="my-1 flex flex-wrap items-baseline gap-1.5">
                <span
                  className={`font-mono text-lg sm:text-xl font-bold ${
                    grossProfit > 0
                      ? "text-emerald-600"
                      : grossProfit < 0
                        ? "text-rose-600"
                        : "text-ink"
                  }`}
                >
                  {loading
                    ? "..."
                    : unitCost != null
                      ? `${grossProfit >= 0 ? "+" : ""}${formatNaira(grossProfit)}`
                      : "—"}
                </span>
                {profitMarginPct != null && (
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      profitMarginPct >= 0
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {profitMarginPct >= 0 ? "+" : ""}
                    {profitMarginPct}%
                  </span>
                )}
              </div>
              <span className="text-[11px] text-emerald-800/80 font-medium">
                {unitCost == null
                  ? "Set cost to unlock profit"
                  : totalSold > 0
                    ? "Revenue minus cost price"
                    : "Awaiting sales"}
              </span>
            </div>
          </div>

          {/* Segmented Pill Tabs */}
          <div className="flex items-center justify-between border-b border-rule pb-2">
            <div className="bg-sand/70 p-1 rounded-xl inline-flex items-center gap-1 border border-rule/60">
              <button
                onClick={() => setActiveTab("sales")}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "sales"
                    ? "bg-white text-ink shadow-xs font-semibold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                Sales Breakdown
                {analytics && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === "sales"
                        ? "bg-sand text-ink"
                        : "bg-white/60 text-ink-muted"
                    }`}
                  >
                    {analytics.sales.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("restocks")}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "restocks"
                    ? "bg-white text-ink shadow-xs font-semibold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                Purchases & Restocks
                {analytics && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === "restocks"
                        ? "bg-sand text-ink"
                        : "bg-white/60 text-ink-muted"
                    }`}
                  >
                    {analytics.restocks.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("movements")}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "movements"
                    ? "bg-white text-ink shadow-xs font-semibold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                Stock Movement Log
                {analytics && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === "movements"
                        ? "bg-sand text-ink"
                        : "bg-white/60 text-ink-muted"
                    }`}
                  >
                    {analytics.movements.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === "sales" && totalSold > 0 && (
              <span className="hidden sm:inline-block text-xs text-ink-muted">
                Total: <strong className="text-ink">{totalSold} {product.unit}</strong> for{" "}
                <strong className="text-ink font-mono">{formatNaira(totalRevenue)}</strong>
              </span>
            )}
          </div>

          {/* Loading Skeleton */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-6 h-6 border-2 border-ink/20 border-t-ink rounded-full animate-spin" />
              <p className="text-xs text-ink-muted">Fetching sales and purchase history...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="p-4 rounded-xl bg-flag-light/50 border border-flag/30 text-xs text-flag">
              {error}
            </div>
          )}

          {/* Tab 1: Sales Breakdown */}
          {!loading && !error && activeTab === "sales" && (
            <div className="space-y-3">
              {analytics?.sales.length === 0 ? (
                <div className="bg-sand/20 border border-dashed border-rule rounded-xl py-12 px-4 text-center">
                  <p className="text-sm font-medium text-ink mb-1">No sales recorded yet</p>
                  <p className="text-xs text-ink-muted max-w-md mx-auto">
                    Record sales via WhatsApp (e.g. &ldquo;Sold 2 {product.name} for 50k&rdquo;)
                    or through the dashboard to see your price per item, profit, and customer orders.
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden sm:block border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 text-left font-medium">
                          <th className="py-2.5 px-3.5">Date & Time</th>
                          <th className="py-2.5 px-3.5 text-right">Qty Sold</th>
                          <th className="py-2.5 px-3.5 text-right">Price Sold / Item</th>
                          <th className="py-2.5 px-3.5 text-right">Total Amount</th>
                          <th className="py-2.5 px-3.5 text-right">Total Cost (Bought For)</th>
                          <th className="py-2.5 px-3.5 text-right">Profit on Sale</th>
                          <th className="py-2.5 px-3.5 text-center">Channel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {analytics?.sales.map((sale) => {
                          const { date, time } = formatDateTimeSplit(sale.rawDate);
                          return (
                            <tr key={sale.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-3.5 text-ink-muted">
                                <span className="font-medium text-ink block">{date}</span>
                                <span className="text-[11px] text-ink-muted/80 font-mono">{time}</span>
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-medium text-ink">
                                {sale.quantity} {product.unit}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-semibold text-ink">
                                {formatNaira(sale.unitPrice)}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono text-ink">
                                {formatNaira(sale.totalAmount)}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono">
                                {sale.totalCost != null ? (
                                  <div>
                                    <span className="text-ink font-medium">
                                      {formatNaira(sale.totalCost)}
                                    </span>
                                    {sale.quantity > 1 && sale.unitCost != null ? (
                                      <span className="block text-[10px] text-ink-muted">
                                        ({formatNaira(sale.unitCost)} / {product.unit})
                                      </span>
                                    ) : (
                                      <span className="block text-[10px] text-ink-muted">
                                        (unit cost)
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-ink-muted">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono">
                                {sale.profit != null ? (
                                  <div className="flex flex-col items-end">
                                    <span
                                      className={`font-semibold ${
                                        sale.profit > 0
                                          ? "text-emerald-600"
                                          : sale.profit < 0
                                            ? "text-rose-600"
                                            : "text-slate-400"
                                      }`}
                                    >
                                      {sale.profit > 0 ? "+" : ""}
                                      {formatNaira(sale.profit)}
                                    </span>
                                    {sale.marginPct != null && (
                                      <span
                                        className={`text-[10px] px-1 py-0.2 rounded font-medium mt-0.5 ${
                                          sale.marginPct > 0
                                            ? "text-emerald-700 bg-emerald-50"
                                            : sale.marginPct < 0
                                              ? "text-rose-700 bg-rose-50"
                                              : "text-slate-500 bg-slate-100"
                                        }`}
                                      >
                                        {sale.marginPct > 0 ? "+" : ""}
                                        {sale.marginPct}%
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-ink-muted">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                                    sale.source.includes("whatsapp")
                                      ? "bg-[#25D366]/15 text-[#128C7E] border border-[#25D366]/20"
                                      : "bg-sand text-ink-muted border border-rule/50"
                                  }`}
                                >
                                  {sale.source.includes("whatsapp") ? (
                                    <>
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" />
                                      WhatsApp
                                    </>
                                  ) : (
                                    "Manual"
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* Footer reconciliation strip */}
                      <tfoot>
                        <tr className="bg-slate-50/90 border-t-2 border-slate-200 text-xs font-medium text-ink">
                          <td className="py-3 px-3.5 text-ink font-semibold">Total Reconciliation</td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-ink">
                            {totalSold} {product.unit}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-ink-muted">
                            avg. {formatNaira(avgSellingPrice)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-ink">
                            {formatNaira(totalRevenue)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono text-ink-muted">
                            {formatNaira(totalCogs)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-600">
                            {grossProfit >= 0 ? "+" : ""}
                            {formatNaira(grossProfit)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-2.5">
                    {analytics?.sales.map((sale) => {
                      const { date, time } = formatDateTimeSplit(sale.rawDate);
                      return (
                        <div
                          key={sale.id}
                          className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-xs"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-xs font-semibold text-ink">
                                Sold {sale.quantity} {product.unit}
                              </span>
                              <p className="text-[11px] text-ink-muted">{date} • {time}</p>
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                                sale.source.includes("whatsapp")
                                  ? "bg-[#25D366]/15 text-[#128C7E]"
                                  : "bg-sand text-ink-muted"
                              }`}
                            >
                              {sale.source.includes("whatsapp") ? "WhatsApp" : "Manual"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                            <div>
                              <span className="text-[11px] text-ink-muted block">Sold per item</span>
                              <span className="font-mono font-semibold text-ink">
                                {formatNaira(sale.unitPrice)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[11px] text-ink-muted block">Total collected</span>
                              <span className="font-mono font-medium text-ink">
                                {formatNaira(sale.totalAmount)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] text-ink-muted block">Cost (bought for)</span>
                              <span className="font-mono font-medium text-ink">
                                {sale.totalCost != null ? formatNaira(sale.totalCost) : "—"}
                              </span>
                              {sale.quantity > 1 && sale.unitCost != null && (
                                <span className="block text-[10px] text-ink-muted font-mono">
                                  ({sale.quantity} × {formatNaira(sale.unitCost)})
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-[11px] text-ink-muted block">Profit</span>
                              <span
                                className={`font-mono font-semibold ${
                                  (sale.profit ?? 0) > 0
                                    ? "text-emerald-600"
                                    : (sale.profit ?? 0) < 0
                                      ? "text-rose-600"
                                      : "text-slate-400"
                                }`}
                              >
                                {sale.profit != null
                                  ? `${sale.profit > 0 ? "+" : ""}${formatNaira(sale.profit)}`
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 2: Purchases & Restocks */}
          {!loading && !error && activeTab === "restocks" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>
                  Track all inventory additions and the price paid per unit.
                </span>
                {analytics && analytics.summary.totalRestocked > 0 && (
                  <span>
                    Total added:{" "}
                    <strong className="text-ink">
                      +{analytics.summary.totalRestocked} {product.unit}
                    </strong>
                  </span>
                )}
              </div>

              {analytics?.restocks.length === 0 ? (
                <div className="bg-sand/20 border border-dashed border-rule rounded-xl py-12 px-4 text-center">
                  <p className="text-sm font-medium text-ink mb-1">No restock entries yet</p>
                  <p className="text-xs text-ink-muted max-w-md mx-auto">
                    Restock your inventory anytime via WhatsApp (e.g. &ldquo;Restocked 50 {product.name} for 1m&rdquo;)
                    to automatically track your purchase costs and updated stock levels.
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden sm:block border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 text-left font-medium">
                          <th className="py-2.5 px-3.5">Date & Time</th>
                          <th className="py-2.5 px-3.5 text-right">Units Added</th>
                          <th className="py-2.5 px-3.5 text-right">Price Bought / Item</th>
                          <th className="py-2.5 px-3.5 text-right">Total Purchase Cost</th>
                          <th className="py-2.5 px-3.5">Reason / Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {analytics?.restocks.map((r) => {
                          const { date, time } = formatDateTimeSplit(r.rawDate);
                          return (
                            <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-3.5 text-ink-muted">
                                <span className="font-medium text-ink block">{date}</span>
                                <span className="text-[11px] text-ink-muted font-mono">{time}</span>
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-semibold text-emerald-600">
                                +{r.quantity} {product.unit}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono font-semibold text-ink">
                                {r.unitCost != null ? formatNaira(r.unitCost) : "—"}
                              </td>
                              <td className="py-3 px-3.5 text-right font-mono text-ink">
                                {r.totalCost != null ? formatNaira(r.totalCost) : "—"}
                              </td>
                              <td className="py-3 px-3.5 text-ink-muted">
                                <span className="capitalize">
                                  {r.reason || (r.source.includes("whatsapp") ? "WhatsApp Restock" : "Manual Adjustment")}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-2.5">
                    {analytics?.restocks.map((r) => {
                      const { date, time } = formatDateTimeSplit(r.rawDate);
                      return (
                        <div
                          key={r.id}
                          className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 shadow-xs"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-xs font-semibold text-emerald-600">
                                +{r.quantity} {product.unit} added
                              </span>
                              <p className="text-[11px] text-ink-muted">{date} • {time}</p>
                            </div>
                            <span className="text-[11px] text-ink-muted capitalize">
                              {r.reason || "Restock"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                            <div>
                              <span className="text-[11px] text-ink-muted block">Bought for / item</span>
                              <span className="font-mono font-semibold text-ink">
                                {r.unitCost != null ? formatNaira(r.unitCost) : "—"}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[11px] text-ink-muted block">Total purchase</span>
                              <span className="font-mono font-medium text-ink">
                                {r.totalCost != null ? formatNaira(r.totalCost) : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 3: Stock Movement Log */}
          {!loading && !error && activeTab === "movements" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>Complete history of inventory entries and deductions.</span>
                <span>Current: <strong className="text-ink font-mono">{currentStock} {product.unit}</strong></span>
              </div>

              {analytics?.movements.length === 0 ? (
                <div className="bg-sand/20 border border-dashed border-rule rounded-xl py-12 px-4 text-center">
                  <p className="text-sm font-medium text-ink mb-1">No movements recorded</p>
                  <p className="text-xs text-ink-muted">Stock movements will log automatically as sales or restocks occur.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 text-left font-medium">
                        <th className="py-2.5 px-3.5">Date & Time</th>
                        <th className="py-2.5 px-3.5 text-right">Change</th>
                        <th className="py-2.5 px-3.5">Type</th>
                        <th className="py-2.5 px-3.5">Reason / Note</th>
                        <th className="py-2.5 px-3.5 text-center">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analytics?.movements.map((m) => {
                        const { date, time } = formatDateTimeSplit(m.rawDate);
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-2.5 px-3.5 text-ink-muted">
                              <span className="font-medium text-ink block">{date}</span>
                              <span className="text-[11px] text-ink-muted font-mono">{time}</span>
                            </td>
                            <td
                              className={`py-2.5 px-3.5 text-right font-mono font-semibold ${
                                m.changeQty > 0
                                  ? "text-emerald-600"
                                  : m.changeQty < 0
                                    ? "text-rose-600"
                                    : "text-ink"
                              }`}
                            >
                              {m.changeQty > 0 ? `+${m.changeQty}` : m.changeQty} {product.unit}
                            </td>
                            <td className="py-2.5 px-3.5 capitalize text-ink">
                              {m.type === "in"
                                ? "Restock / In"
                                : m.type === "out"
                                  ? "Sale / Out"
                                  : "Adjustment"}
                            </td>
                            <td className="py-2.5 px-3.5 text-ink-muted truncate max-w-[200px]">
                              {m.reason || "—"}
                            </td>
                            <td className="py-2.5 px-3.5 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                                  m.source.includes("whatsapp")
                                    ? "bg-[#25D366]/15 text-[#128C7E]"
                                    : "bg-sand text-ink-muted"
                                }`}
                              >
                                {m.source.includes("whatsapp") ? "WhatsApp" : "Manual"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-rule bg-slate-50/80 flex items-center justify-between">
          <span className="text-[11px] text-ink-muted flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Live sync: All sales & restocks sent to WhatsApp reflect here instantly.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-rule bg-white text-xs font-semibold text-ink hover:bg-slate-50 shadow-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
