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
  const profitMarginPct = analytics?.summary.profitMarginPct;
  const currentStock = analytics?.summary.currentStock ?? product.quantity;
  const currentStockValue =
    analytics?.summary.currentStockValue ??
    (unitCost != null ? currentStock * unitCost : 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl border border-rule w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="p-4 sm:p-6 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-sand/30">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl sm:text-2xl text-ink font-semibold">
                {product.name}
              </h2>
              {product.categoryName && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sand border border-rule text-ink-muted">
                  {product.categoryName}
                </span>
              )}
              {product.isLowStock ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-flag-light text-flag border border-flag/20">
                  ⚠️ Low Stock ({currentStock} {product.unit} left)
                </span>
              ) : currentStock === 0 ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-flag-light text-flag border border-flag/20">
                  Out of Stock
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-money-light text-money border border-money/20">
                  ✓ In Stock ({currentStock} {product.unit})
                </span>
              )}
            </div>
            <p className="text-xs text-ink-muted">
              Inventory Value:{" "}
              <span className="font-mono text-ink font-medium">
                {unitCost != null ? formatNaira(currentStockValue) : "—"}
              </span>{" "}
              • Reorder Threshold:{" "}
              <span className="font-mono text-ink">
                {product.reorderThreshold != null
                  ? `${product.reorderThreshold} ${product.unit}`
                  : "None"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => onEdit(product)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rule bg-white text-xs font-medium text-ink hover:bg-sand-light hover:border-ink-muted transition-colors shadow-xs"
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
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-sand-light transition-colors"
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
            <div className="bg-sand/40 border border-rule rounded-xl p-3.5 sm:p-4 flex flex-col justify-between">
              <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-ink-muted">
                Price Bought For
              </span>
              <div className="my-1.5">
                <span className="font-mono text-lg sm:text-xl font-semibold text-ink">
                  {unitCost != null ? formatNaira(unitCost) : "Not set"}
                </span>
                {unitCost != null && (
                  <span className="text-xs text-ink-muted ml-1">/{product.unit}</span>
                )}
              </div>
              <span className="text-[11px] text-ink-muted">
                {unitCost != null ? "Unit acquisition cost" : "Set in edit to track profit"}
              </span>
            </div>

            {/* 2. Items Sold */}
            <div className="bg-sand/40 border border-rule rounded-xl p-3.5 sm:p-4 flex flex-col justify-between">
              <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-ink-muted">
                Items Sold
              </span>
              <div className="my-1.5 flex items-baseline gap-1">
                <span className="font-mono text-lg sm:text-xl font-semibold text-ink">
                  {loading ? "..." : totalSold}
                </span>
                <span className="text-xs text-ink-muted">{product.unit}</span>
              </div>
              <span className="text-[11px] text-ink-muted">
                {loading
                  ? "Calculating..."
                  : totalRevenue > 0
                    ? `${formatNaira(totalRevenue)} revenue`
                    : "No sales yet"}
              </span>
            </div>

            {/* 3. Average Price Sold */}
            <div className="bg-sand/40 border border-rule rounded-xl p-3.5 sm:p-4 flex flex-col justify-between">
              <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-ink-muted">
                Avg. Price Sold
              </span>
              <div className="my-1.5">
                <span className="font-mono text-lg sm:text-xl font-semibold text-ink">
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
                {loading
                  ? "Loading..."
                  : totalSold > 0
                    ? `Across ${totalSold} ${product.unit} sold`
                    : "Pending first sale"}
              </span>
            </div>

            {/* 4. Profit Earned */}
            <div className="bg-sand/40 border border-rule rounded-xl p-3.5 sm:p-4 flex flex-col justify-between">
              <span className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-ink-muted">
                Gross Profit
              </span>
              <div className="my-1.5 flex flex-wrap items-baseline gap-1.5">
                <span
                  className={`font-mono text-lg sm:text-xl font-semibold ${
                    grossProfit > 0
                      ? "text-money"
                      : grossProfit < 0
                        ? "text-flag"
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
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      profitMarginPct >= 0
                        ? "bg-money-light text-money"
                        : "bg-flag-light text-flag"
                    }`}
                  >
                    {profitMarginPct >= 0 ? "+" : ""}
                    {profitMarginPct}%
                  </span>
                )}
              </div>
              <span className="text-[11px] text-ink-muted">
                {unitCost == null
                  ? "Add cost price to see profit"
                  : totalSold > 0
                    ? "Revenue minus cost price"
                    : "Awaiting sales"}
              </span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-rule flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab("sales")}
              className={`pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors relative flex items-center gap-1.5 ${
                activeTab === "sales"
                  ? "text-ink border-b-2 border-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Sales Breakdown
              {analytics && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sand border border-rule text-ink-muted">
                  {analytics.sales.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("restocks")}
              className={`pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors relative flex items-center gap-1.5 ${
                activeTab === "restocks"
                  ? "text-ink border-b-2 border-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Purchases & Restocks
              {analytics && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sand border border-rule text-ink-muted">
                  {analytics.restocks.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("movements")}
              className={`pb-2.5 px-3 text-xs sm:text-sm font-medium transition-colors relative flex items-center gap-1.5 ${
                activeTab === "movements"
                  ? "text-ink border-b-2 border-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Stock Movement Log
              {analytics && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sand border border-rule text-ink-muted">
                  {analytics.movements.length}
                </span>
              )}
            </button>
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
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>
                  Showing all sales where <strong>{product.name}</strong> was sold.
                </span>
                {totalSold > 0 && (
                  <span>
                    Total: <strong className="text-ink">{totalSold} {product.unit}</strong> for{" "}
                    <strong className="text-ink font-mono">{formatNaira(totalRevenue)}</strong>
                  </span>
                )}
              </div>

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
                  <div className="hidden sm:block border border-rule rounded-xl overflow-hidden bg-white shadow-xs">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-sand/40 border-b border-rule text-ink-muted text-left">
                          <th className="py-2.5 px-3.5 font-medium">Date & Time</th>
                          <th className="py-2.5 px-3.5 font-medium text-right">Qty Sold</th>
                          <th className="py-2.5 px-3.5 font-medium text-right">Price Sold / Item</th>
                          <th className="py-2.5 px-3.5 font-medium text-right">Total Amount</th>
                          <th className="py-2.5 px-3.5 font-medium text-right">Cost (Bought For)</th>
                          <th className="py-2.5 px-3.5 font-medium text-right">Profit on Sale</th>
                          <th className="py-2.5 px-3.5 font-medium text-center">Channel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule/60">
                        {analytics?.sales.map((sale) => (
                          <tr key={sale.id} className="hover:bg-sand-light/50 transition-colors">
                            <td className="py-3 px-3.5 text-ink-muted">
                              <div>{sale.date}</div>
                              <div className="text-[11px] text-ink-muted/70 truncate max-w-[160px]">
                                {sale.description}
                              </div>
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
                            <td className="py-3 px-3.5 text-right font-mono text-ink-muted">
                              {sale.unitCost != null ? formatNaira(sale.unitCost) : "—"}
                            </td>
                            <td className="py-3 px-3.5 text-right font-mono">
                              {sale.profit != null ? (
                                <div className="flex flex-col items-end">
                                  <span
                                    className={`font-semibold ${
                                      sale.profit >= 0 ? "text-money" : "text-flag"
                                    }`}
                                  >
                                    {sale.profit >= 0 ? "+" : ""}
                                    {formatNaira(sale.profit)}
                                  </span>
                                  {sale.marginPct != null && (
                                    <span
                                      className={`text-[10px] ${
                                        sale.marginPct >= 0 ? "text-money" : "text-flag"
                                      }`}
                                    >
                                      {sale.marginPct >= 0 ? "+" : ""}
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
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium capitalize ${
                                  sale.source.includes("whatsapp")
                                    ? "bg-money-light text-money"
                                    : "bg-sand text-ink-muted"
                                }`}
                              >
                                {sale.source.includes("whatsapp") ? "WhatsApp" : "Manual"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-2.5">
                    {analytics?.sales.map((sale) => (
                      <div
                        key={sale.id}
                        className="bg-sand/20 border border-rule rounded-xl p-3.5 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-medium text-ink">
                              Sold {sale.quantity} {product.unit}
                            </span>
                            <p className="text-[11px] text-ink-muted">{sale.date}</p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${
                              sale.source.includes("whatsapp")
                                ? "bg-money-light text-money"
                                : "bg-sand text-ink-muted"
                            }`}
                          >
                            {sale.source.includes("whatsapp") ? "WhatsApp" : "Manual"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-rule/50 text-xs">
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
                            <span className="text-[11px] text-ink-muted block">Bought for</span>
                            <span className="font-mono text-ink-muted">
                              {sale.unitCost != null ? formatNaira(sale.unitCost) : "—"}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] text-ink-muted block">Profit</span>
                            <span
                              className={`font-mono font-semibold ${
                                (sale.profit ?? 0) >= 0 ? "text-money" : "text-flag"
                              }`}
                            >
                              {sale.profit != null
                                ? `${sale.profit >= 0 ? "+" : ""}${formatNaira(sale.profit)}`
                                : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
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
                  <div className="hidden sm:block border border-rule rounded-xl overflow-hidden bg-white shadow-xs">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-sand/40 border-b border-rule text-ink-muted text-left">
                          <th className="py-2.5 px-3.5 font-medium">Date & Time</th>
                          <th className="py-2.5 px-3.5 font-medium text-right">Units Added</th>
                          <th className="py-2.5 px-3.5 font-medium text-right">Price Bought / Item</th>
                          <th className="py-2.5 px-3.5 font-medium text-right">Total Purchase Cost</th>
                          <th className="py-2.5 px-3.5 font-medium">Reason / Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule/60">
                        {analytics?.restocks.map((r) => (
                          <tr key={r.id} className="hover:bg-sand-light/50 transition-colors">
                            <td className="py-3 px-3.5 text-ink-muted">{r.date}</td>
                            <td className="py-3 px-3.5 text-right font-mono font-medium text-money">
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
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-2.5">
                    {analytics?.restocks.map((r) => (
                      <div
                        key={r.id}
                        className="bg-sand/20 border border-rule rounded-xl p-3.5 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-semibold text-money">
                              +{r.quantity} {product.unit} added
                            </span>
                            <p className="text-[11px] text-ink-muted">{r.date}</p>
                          </div>
                          <span className="text-[11px] text-ink-muted capitalize">
                            {r.reason || "Restock"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-rule/50 text-xs">
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
                    ))}
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
                <div className="border border-rule rounded-xl overflow-hidden bg-white shadow-xs">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-sand/40 border-b border-rule text-ink-muted text-left">
                        <th className="py-2.5 px-3.5 font-medium">Date & Time</th>
                        <th className="py-2.5 px-3.5 font-medium text-right">Change</th>
                        <th className="py-2.5 px-3.5 font-medium">Type</th>
                        <th className="py-2.5 px-3.5 font-medium">Reason / Note</th>
                        <th className="py-2.5 px-3.5 font-medium text-center">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule/60">
                      {analytics?.movements.map((m) => (
                        <tr key={m.id} className="hover:bg-sand-light/50 transition-colors">
                          <td className="py-2.5 px-3.5 text-ink-muted">{m.date}</td>
                          <td
                            className={`py-2.5 px-3.5 text-right font-mono font-semibold ${
                              m.changeQty > 0
                                ? "text-money"
                                : m.changeQty < 0
                                  ? "text-flag"
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
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium capitalize ${
                                m.source.includes("whatsapp")
                                  ? "bg-money-light text-money"
                                  : "bg-sand text-ink-muted"
                              }`}
                            >
                              {m.source.includes("whatsapp") ? "WhatsApp" : "Manual"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-rule bg-sand/30 flex items-center justify-between">
          <span className="text-[11px] text-ink-muted">
            Tip: All sales & restocks sent to WhatsApp are parsed and displayed here in real time.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-rule bg-white text-xs font-medium text-ink hover:bg-sand-light transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
