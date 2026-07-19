"use client";

import { useState, useCallback } from "react";
import { formatNaira } from "@/lib/format";
import { EditProductModal } from "./EditProductModal";
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
        <h1 className="font-display text-xl text-ink">Products</h1>
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
              <tr className="border-b border-rule text-left text-xs text-ink-muted">
                <th className="py-3 px-4 font-normal">Product</th>
                <th className="py-3 px-4 font-normal">Category</th>
                <th className="py-3 px-4 font-normal text-right">On hand</th>
                <th className="py-3 px-4 font-normal text-right">Unit cost</th>
                <th className="py-3 px-4 font-normal text-right">Total value</th>
                <th className="py-3 px-4 font-normal">Last restocked</th>
                <th className="py-3 px-4 font-normal w-10" />
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-ink-muted text-sm">
                    No products yet. Add products during onboarding or via the dashboard.
                  </td>
                </tr>
              )}
              {products.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-rule/50 ${p.isLowStock ? "bg-flag-light/50" : ""}`}
                >
                  <td className="py-3 px-4">
                    <span className="text-ink font-medium">{p.name}</span>
                  </td>
                  <td className="py-3 px-4 text-ink-muted">{p.categoryName ?? "—"}</td>
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
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(p)}
                        className="text-xs text-ink-muted hover:text-ink px-1 py-0.5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleting(p)}
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
            className={`bg-white rounded-xl border p-4 ${p.isLowStock ? "border-flag bg-flag-light/30" : "border-rule"}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-ink font-medium">{p.name}</h3>
                {p.categoryName && (
                  <span className="text-xs text-ink-muted">{p.categoryName}</span>
                )}
              </div>
              <span className={`font-mono text-sm font-medium ${p.isLowStock ? "text-flag" : "text-ink"}`}>
                {p.quantity}
                <span className="text-ink-muted text-xs ml-1">{p.unit}</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
              <span>Unit cost: {p.unitCost != null ? formatNaira(p.unitCost) : "—"}</span>
              <span>Value: {formatNaira(p.totalValue)}</span>
            </div>
            {p.lastRestocked && (
              <p className="text-xs text-ink-muted mb-2">Last restocked: {p.lastRestocked}</p>
            )}
            {p.isLowStock && (
              <p className="text-xs text-flag font-medium mb-2">Low stock — below {p.reorderThreshold} threshold</p>
            )}
            <div className="flex items-center gap-3 pt-2 border-t border-rule/50">
              <button
                onClick={() => setEditing(p)}
                className="text-xs text-ink-muted hover:text-ink"
              >
                Edit
              </button>
              <button
                onClick={() => setDeleting(p)}
                className="text-xs text-flag hover:opacity-80"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

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
