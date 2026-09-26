"use client";

import { useState, useCallback } from "react";
import { formatNaira } from "@/lib/format";
import { EditProductModal } from "./EditProductModal";
import { ProductDetailModal } from "./ProductDetailModal";
import { CategoryManager } from "./CategoryManager";
import { softDeleteProduct } from "@/app/dashboard/products/actions";

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
}

export interface Category {
  id: number;
  name: string;
}

interface ProductTableProps {
  products: ProductRow[];
  categories: Category[];
  tenantId: number;
}

export function ProductTable({
  products,
  categories,
  tenantId,
}: ProductTableProps) {
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ProductRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [showCategories, setShowCategories] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    await softDeleteProduct(tenantId, deleting.id);
    setDeleting(null);
    window.location.reload();
  }, [deleting, tenantId]);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-xl text-ink">Products</h1>
          <p className="text-xs text-ink-muted hidden sm:block mt-0.5">
            Click on any product to see units sold, price sold per item, and purchase costs.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center h-9 rounded-full bg-ink px-3 sm:px-4 text-xs sm:text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <span className="sm:hidden mr-1">+</span>
            <span className="hidden sm:inline">+ Add product</span>
          </button>
          <button
            onClick={() => setShowCategories(!showCategories)}
            className="text-xs sm:text-sm text-ink-muted hover:text-ink transition-colors"
          >
            {showCategories ? "Close" : "Categories"}
          </button>
        </div>
      </div>

      {showCategories && (
        <CategoryManager tenantId={tenantId} categories={categories} />
      )}

      {/* Desktop table */}
      <div className="hidden sm:block bg-white rounded-xl overflow-hidden border border-rule">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-xs text-ink-muted bg-sand/30">
                <th className="py-3 px-4 font-normal">Product</th>
                <th className="py-3 px-4 font-normal">Category</th>
                <th className="py-3 px-4 font-normal text-right">Sold</th>
                <th className="py-3 px-4 font-normal text-right">On hand</th>
                <th className="py-3 px-4 font-normal text-right">Price bought</th>
                <th className="py-3 px-4 font-normal text-right">Total value</th>
                <th className="py-3 px-4 font-normal">Last restocked</th>
                <th className="py-3 px-4 font-normal text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-muted text-sm">
                    No products yet. Add products during onboarding or via the dashboard.
                  </td>
                </tr>
              )}
              {products.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedDetail(p)}
                  className={`border-b border-rule/50 hover:bg-sand-light/60 transition-colors cursor-pointer group ${
                    p.isLowStock ? "bg-flag-light/40" : ""
                  }`}
                  title="Click to view sales and price analytics"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink font-medium group-hover:underline">
                        {p.name}
                      </span>
                      <span className="text-[11px] text-ink-muted group-hover:text-ink transition-colors">
                        ↗
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-ink-muted">{p.categoryName ?? "—"}</td>
                  <td className="py-3 px-4 text-right">
                    {p.totalSold != null && p.totalSold > 0 ? (
                      <div>
                        <span className="font-mono text-ink font-medium">
                          {p.totalSold} {p.unit}
                        </span>
                        {p.totalRevenue != null && p.totalRevenue > 0 && (
                          <span className="block text-[11px] text-money font-medium">
                            {formatNaira(p.totalRevenue)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-muted text-xs">0 sold</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-mono ${p.isLowStock ? "text-flag font-medium" : "text-ink"}`}>
                      {p.quantity}
                      {p.isLowStock && (
                        <span className="ml-1 text-[10px] text-flag">▼{p.reorderThreshold}</span>
                      )}
                    </span>
                    <span className="text-ink-muted ml-1 text-xs">{p.unit}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-ink-muted">
                    {p.unitCost != null ? formatNaira(p.unitCost) : "—"}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-ink">
                    {formatNaira(p.totalValue)}
                  </td>
                  <td className="py-3 px-4 text-ink-muted text-xs">{p.lastRestocked ?? "—"}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDetail(p);
                        }}
                        className="text-xs text-ink font-medium hover:underline px-1 py-0.5"
                      >
                        Insights
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(p);
                        }}
                        className="text-xs text-ink-muted hover:text-ink px-1 py-0.5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(p);
                        }}
                        className="text-xs text-flag hover:opacity-80 px-1 py-0.5"
                      >
                        Delete
                      </button>
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
        {products.length === 0 && (
          <div className="bg-white rounded-xl border border-rule py-12 text-center text-ink-muted text-sm">
            No products yet.
          </div>
        )}
        {products.map((p) => (
          <div
            key={p.id}
            onClick={() => setSelectedDetail(p)}
            className={`bg-white rounded-xl border p-4 cursor-pointer hover:border-ink-muted transition-colors ${
              p.isLowStock ? "border-flag bg-flag-light/30" : "border-rule"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-ink font-medium">{p.name}</h3>
                  <span className="text-xs text-ink-muted">↗</span>
                </div>
                {p.categoryName && (
                  <span className="text-xs text-ink-muted">{p.categoryName}</span>
                )}
              </div>
              <div className="text-right">
                <span className={`font-mono text-sm font-medium ${p.isLowStock ? "text-flag" : "text-ink"}`}>
                  {p.quantity}
                  <span className="text-ink-muted text-xs ml-1">{p.unit}</span>
                </span>
                <span className="block text-[10px] text-ink-muted">On hand</span>
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

            {p.isLowStock && (
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(p);
                  }}
                  className="text-xs text-flag hover:opacity-80"
                >
                  Delete
                </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-xl p-5 sm:p-6 max-w-sm w-full">
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
    </>
  );
}

