"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { formatNaira } from "@/lib/format";
import { EditProductModal } from "./EditProductModal";
import { ProductDetailModal } from "./ProductDetailModal";
import { CategoryManager } from "./CategoryManager";
import { BulkUploadModal } from "./BulkUploadModal";
import { softDeleteProduct, renameProduct } from "@/app/dashboard/products/actions";

export interface ProductRow {
  id: number;
  name: string;
  categoryName: string | null;
  categoryId: number | null;
  quantity: number;
  unit: string;
  unitCost: number | null;
  reorderThreshold: number | null;
  lastRestocked: string | null;
  totalValue: number;
  isLowStock: boolean;
  totalSold?: number;
  totalRevenue?: number;
  isService?: boolean;
  piecesPerPack?: number | null;
}

export interface Category {
  id: number;
  name: string;
}

interface ProductTableProps {
  products: ProductRow[];
  categories: Category[];
  tenantId: number;
  isOwner?: boolean;
  canBulkUpload?: boolean;
}

export function ProductTable({
  products,
  categories,
  tenantId,
  isOwner = true,
  canBulkUpload = false,
}: ProductTableProps) {
  const [items, setItems] = useState<ProductRow[]>(products);

  useEffect(() => {
    setItems(products);
  }, [products]);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ProductRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | "all">("all");

  const [inlineRenameId, setInlineRenameId] = useState<number | null>(null);
  const [inlineRenameName, setInlineRenameName] = useState<string>("");
  const [inlineRenaming, setInlineRenaming] = useState<boolean>(false);
  const [inlineRenameError, setInlineRenameError] = useState<string | null>(null);

  const handleSaveInlineRename = async (productId: number) => {
    const trimmed = inlineRenameName.trim();
    if (!trimmed) {
      setInlineRenameError("Product name cannot be empty");
      return;
    }
    setInlineRenaming(true);
    setInlineRenameError(null);
    try {
      const res = await renameProduct(productId, trimmed);
      if (res.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === productId ? { ...item, name: trimmed } : item
          )
        );
        setInlineRenameId(null);
      } else {
        setInlineRenameError(res.error || "Failed to update name");
      }
    } catch (err: any) {
      setInlineRenameError(err?.message || "Failed to update name");
    } finally {
      setInlineRenaming(false);
    }
  };

  const totalCatalogValue = useMemo(() => {
    return items.reduce((acc, p) => acc + (p.totalValue || 0), 0);
  }, [items]);

  const totalUnitsSold = useMemo(() => {
    return items.reduce((acc, p) => acc + (p.totalSold || 0), 0);
  }, [items]);

  const totalSalesRevenue = useMemo(() => {
    return items.reduce((acc, p) => acc + (p.totalRevenue || 0), 0);
  }, [items]);

  const lowStockCount = useMemo(() => {
    return items.filter((p) => p.isLowStock).length;
  }, [items]);

  const filteredProducts = useMemo(() => {
    return items.filter((p) => {
      if (selectedCategory !== "all" && p.categoryId !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.categoryName && p.categoryName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [items, selectedCategory, searchQuery]);

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    await softDeleteProduct(tenantId, deleting.id);
    setDeleting(null);
    window.location.reload();
  }, [deleting, tenantId]);

  return (
    <>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl text-ink font-bold tracking-tight">Products & Inventory</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Real-time catalog valuation, stock levels, and item-by-item sales breakdown.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={() => setShowCategories(!showCategories)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-rule bg-white text-xs font-medium text-ink hover:bg-sand-light transition-all shadow-xs"
          >
            <span>🏷️</span>
            <span>{showCategories ? "Close Categories" : "Manage Categories"}</span>
          </button>
          <button
            onClick={() => setShowBulkUpload(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-rule bg-white text-xs font-medium text-ink hover:bg-sand-light transition-all shadow-xs"
            title="Import products from CSV or Excel"
          >
            <span>📥</span>
            <span>Import CSV / Excel</span>
          </button>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 h-9 rounded-xl bg-ink px-4 text-xs font-semibold text-white hover:opacity-90 transition-all shadow-xs"
          >
            <span>+</span>
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {bulkSuccessMsg && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold">✓</span>
            <span className="font-semibold">{bulkSuccessMsg}</span>
          </div>
          <button
            onClick={() => setBulkSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold p-1"
          >
            ✕
          </button>
        </div>
      )}

      {showCategories && (
        <div className="mb-6">
          <CategoryManager tenantId={tenantId} categories={categories} />
        </div>
      )}

      {/* Catalog KPI Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* 1. Inventory Value */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Stock Valuation
            </span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">
              💰
            </span>
          </div>
          <div className="my-1">
            <span className="font-mono text-lg sm:text-xl font-bold text-ink">
              {formatNaira(totalCatalogValue)}
            </span>
          </div>
          <span className="text-[11px] text-ink-muted">
            Total working capital in warehouse
          </span>
        </div>

        {/* 2. Total Products */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Active Catalog
            </span>
            <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-xs">
              📦
            </span>
          </div>
          <div className="my-1 flex items-baseline gap-1">
            <span className="font-mono text-lg sm:text-xl font-bold text-ink">
              {products.length}
            </span>
            <span className="text-xs text-ink-muted">products</span>
          </div>
          <span className="text-[11px] text-ink-muted">
            Across {categories.length} {categories.length === 1 ? "category" : "categories"}
          </span>
        </div>

        {/* 3. Items Sold */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Total Units Sold
            </span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs">
              🛍️
            </span>
          </div>
          <div className="my-1 flex items-baseline gap-1">
            <span className="font-mono text-lg sm:text-xl font-bold text-ink">
              {totalUnitsSold}
            </span>
            <span className="text-xs text-ink-muted">units</span>
          </div>
          <span className="text-[11px] text-ink-muted">
            {totalSalesRevenue > 0
              ? `${formatNaira(totalSalesRevenue)} gross revenue`
              : "Awaiting sales"}
          </span>
        </div>

        {/* 4. Stock Health / Alerts */}
        <div
          className={`border rounded-2xl p-4 flex flex-col justify-between shadow-xs transition-colors ${
            lowStockCount > 0
              ? "bg-amber-50/40 border-amber-300/80"
              : "bg-white border-slate-200/90"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${
                lowStockCount > 0 ? "text-amber-800" : "text-ink-muted"
              }`}
            >
              Stock Health
            </span>
            <span
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${
                lowStockCount > 0
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-50 text-emerald-600"
              }`}
            >
              {lowStockCount > 0 ? "⚠️" : "✓"}
            </span>
          </div>
          <div className="my-1 flex items-baseline gap-1.5">
            <span
              className={`font-mono text-lg sm:text-xl font-bold ${
                lowStockCount > 0 ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              {lowStockCount > 0 ? `${lowStockCount} Low Stock` : "All Healthy"}
            </span>
          </div>
          <span
            className={`text-[11px] ${
              lowStockCount > 0 ? "text-amber-800 font-medium" : "text-ink-muted"
            }`}
          >
            {lowStockCount > 0
              ? "Reorder alert triggered"
              : "All products above threshold"}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-rule bg-white text-ink placeholder:text-ink-muted/70 focus:outline-hidden focus:border-ink transition-colors shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-xs p-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
              selectedCategory === "all"
                ? "bg-ink text-white font-semibold shadow-2xs"
                : "bg-white border border-rule text-ink-muted hover:text-ink"
            }`}
          >
            All ({products.length})
          </button>
          {categories.map((c) => {
            const count = products.filter((p) => p.categoryId === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
                  selectedCategory === c.id
                    ? "bg-ink text-white font-semibold shadow-2xs"
                    : "bg-white border border-rule text-ink-muted hover:text-ink"
                }`}
              >
                {c.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block bg-white rounded-2xl overflow-hidden border border-slate-200/90 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 text-left text-slate-500 bg-slate-50/80 font-medium">
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Sold To Date</th>
                <th className="py-3 px-4 text-right">On Hand</th>
                <th className="py-3 px-4 text-right">Price Bought</th>
                <th className="py-3 px-4 text-right">Stock Value</th>
                <th className="py-3 px-4">Last Restocked</th>
                <th className="py-3 px-4 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-muted text-xs">
                    {searchQuery || selectedCategory !== "all" ? (
                      <div className="space-y-1">
                        <p className="font-medium text-ink">No matching products found</p>
                        <p className="text-ink-muted">Try clearing your search query or category filter.</p>
                      </div>
                    ) : (
                      "No products yet. Add products during onboarding or click Add Product above."
                    )}
                  </td>
                </tr>
              )}
              {filteredProducts.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => {
                    if (inlineRenameId !== p.id) setSelectedDetail(p);
                  }}
                  className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                    p.isLowStock ? "bg-amber-50/30" : ""
                  }`}
                  title="Click to view sales and price analytics"
                >
                  <td className="py-3.5 px-4" onClick={(e) => {
                    if (inlineRenameId === p.id) e.stopPropagation();
                  }}>
                    {inlineRenameId === p.id ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          autoFocus
                          value={inlineRenameName}
                          onChange={(e) => setInlineRenameName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveInlineRename(p.id);
                            if (e.key === "Escape") setInlineRenameId(null);
                          }}
                          disabled={inlineRenaming}
                          className="px-2 py-1 text-xs font-semibold text-ink border border-emerald-500 rounded-lg outline-none bg-white shadow-xs focus:ring-2 focus:ring-emerald-500/20"
                          placeholder="Product name"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveInlineRename(p.id)}
                          disabled={inlineRenaming}
                          className="px-2 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors shadow-xs"
                          title="Save name"
                        >
                          {inlineRenaming ? "..." : "✓"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setInlineRenameId(null)}
                          disabled={inlineRenaming}
                          className="px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                          title="Cancel"
                        >
                          ✕
                        </button>
                        {inlineRenameError && (
                          <span className="text-[10px] text-rose-600 font-medium">
                            {inlineRenameError}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/name">
                        <span className="text-ink font-semibold group-hover:text-ink transition-colors">
                          {p.name}
                        </span>
                        {p.piecesPerPack && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sand border border-rule/60 text-ink-muted" title={`Pack size: ${p.piecesPerPack} ${p.unit} per carton/pack`}>
                            {p.piecesPerPack} {p.unit}/pack
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInlineRenameId(p.id);
                            setInlineRenameName(p.name);
                            setInlineRenameError(null);
                          }}
                          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-sand transition-colors opacity-70 group-hover/name:opacity-100"
                          title="Quick rename product"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <span className="text-[11px] text-ink-muted/70 group-hover:text-ink transition-colors">
                          ↗
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {p.categoryName ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-sand/60 border border-rule/60 text-ink-muted">
                        {p.categoryName}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {p.totalSold != null && p.totalSold > 0 ? (
                      <div>
                        <span className="font-mono text-ink font-semibold">
                          {p.totalSold} {p.unit}
                        </span>
                        {p.totalRevenue != null && p.totalRevenue > 0 && (
                          <span className="block text-[10px] text-emerald-700 font-medium">
                            {formatNaira(p.totalRevenue)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-muted text-xs">0 sold</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {p.isService ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Service
                      </span>
                    ) : p.isLowStock ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        {p.quantity} {p.unit}
                      </span>
                    ) : p.quantity === 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        Out of stock
                      </span>
                    ) : (
                      <span className="font-mono text-ink font-medium">
                        {p.quantity} <span className="text-ink-muted text-[11px]">{p.unit}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-ink-muted">
                    {p.unitCost != null ? formatNaira(p.unitCost) : "—"}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-medium text-ink">
                    {p.isService ? "—" : formatNaira(p.totalValue)}
                  </td>
                  <td className="py-3.5 px-4 text-ink-muted text-xs">{p.lastRestocked ?? "—"}</td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDetail(p);
                        }}
                        className="text-xs text-ink font-semibold hover:underline"
                      >
                        Insights
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(p);
                        }}
                        className="text-xs text-ink-muted hover:text-ink"
                      >
                        Edit
                      </button>
                      {isOwner && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleting(p);
                          }}
                          className="text-xs text-rose-600 hover:text-rose-700"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-3">
        {filteredProducts.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center text-ink-muted text-xs">
            No products match your filter.
          </div>
        )}
        {filteredProducts.map((p) => (
          <div
            key={p.id}
            onClick={() => {
              if (inlineRenameId !== p.id) setSelectedDetail(p);
            }}
            className={`bg-white rounded-xl border p-4 cursor-pointer hover:border-ink-muted transition-colors ${
              p.isLowStock ? "border-flag bg-flag-light/30" : "border-rule"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                {inlineRenameId === p.id ? (
                  <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      autoFocus
                      value={inlineRenameName}
                      onChange={(e) => setInlineRenameName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveInlineRename(p.id);
                        if (e.key === "Escape") setInlineRenameId(null);
                      }}
                      disabled={inlineRenaming}
                      className="px-2 py-1 text-xs font-semibold text-ink border border-emerald-500 rounded-lg outline-none bg-white shadow-xs"
                      placeholder="Product name"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveInlineRename(p.id)}
                      disabled={inlineRenaming}
                      className="px-2 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md"
                    >
                      {inlineRenaming ? "..." : "✓"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInlineRenameId(null)}
                      disabled={inlineRenaming}
                      className="px-1.5 py-1 text-xs text-slate-500"
                    >
                      ✕
                    </button>
                    {inlineRenameError && (
                      <span className="text-[10px] text-rose-600 font-medium block w-full">
                        {inlineRenameError}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-ink font-medium">{p.name}</h3>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInlineRenameId(p.id);
                        setInlineRenameName(p.name);
                        setInlineRenameError(null);
                      }}
                      className="p-1 rounded text-ink-muted hover:text-ink"
                      title="Rename product"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <span className="text-xs text-ink-muted">↗</span>
                  </div>
                )}
                {p.categoryName && (
                  <span className="text-xs text-ink-muted">{p.categoryName}</span>
                )}
                {p.piecesPerPack && (
                  <span className="text-[10px] block text-ink-muted">
                    Pack: {p.piecesPerPack} {p.unit}/carton
                  </span>
                )}
              </div>
              <div className="text-right">
                {p.isService ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Service
                  </span>
                ) : (
                  <>
                    <span className={`font-mono text-sm font-medium ${p.isLowStock ? "text-flag" : "text-ink"}`}>
                      {p.quantity}
                      <span className="text-ink-muted text-xs ml-1">{p.unit}</span>
                    </span>
                    <span className="block text-[10px] text-ink-muted">On hand</span>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted my-2.5 py-2 border-y border-rule/50">
              <div>
                <span className="text-[11px] block">Price bought (cost)</span>
                <span className="font-mono text-ink font-medium">
                  {p.unitCost != null ? formatNaira(p.unitCost) : "—"}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] block">Units sold</span>
                <span className="font-mono text-ink font-semibold">
                  {p.totalSold ?? 0} {p.unit}
                </span>
              </div>
            </div>

            {!p.isService && p.isLowStock && (
              <p className="text-xs text-flag font-medium mb-2">
                Low stock — below {p.reorderThreshold} threshold
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-ink font-medium flex items-center gap-1">
                View sales & profit ↗
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(p);
                  }}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  Edit
                </button>
                {isOwner && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting(p);
                    }}
                    className="text-xs text-flag hover:opacity-80"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Product Detail & Analytics Modal */}
      {selectedDetail && (
        <ProductDetailModal
          product={selectedDetail}
          tenantId={tenantId}
          onClose={() => setSelectedDetail(null)}
          onEdit={(prod) => {
            setSelectedDetail(null);
            setEditing(prod);
          }}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <EditProductModal
          product={editing}
          categories={categories}
          tenantId={tenantId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            window.location.reload();
          }}
        />
      )}

      {/* Add modal */}
      {adding && (
        <EditProductModal
          product={null}
          categories={categories}
          tenantId={tenantId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            window.location.reload();
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200/90 ring-1 ring-black/5 animate-in zoom-in-95 duration-150">
            <h3 className="font-medium text-ink mb-2">Delete product?</h3>
            <p className="text-sm text-ink-muted mb-4">
              &ldquo;{deleting.name}&rdquo; will be soft-deleted. Stock movement history will be preserved.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleting(null)}
                className="px-4 py-2 text-sm text-ink-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm bg-flag text-white rounded-lg hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk CSV / Excel Upload Modal */}
      {showBulkUpload && (
        <BulkUploadModal
          tenantId={tenantId}
          canBulkUpload={canBulkUpload}
          onClose={() => setShowBulkUpload(false)}
          onSuccess={(count) => {
            setBulkSuccessMsg(
              `Successfully imported ${count} product${count === 1 ? "" : "s"} into your catalog!`
            );
            setTimeout(() => {
              window.location.reload();
            }, 1200);
          }}
        />
      )}
    </>
  );
}

