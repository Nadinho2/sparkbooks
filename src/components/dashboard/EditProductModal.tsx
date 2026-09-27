"use client";

import { useState, type FormEvent } from "react";
import type { ProductRow, Category } from "./ProductTable";
import { updateProduct, createProduct } from "@/app/dashboard/products/actions";

const REASONS = [
  "stock count correction",
  "damaged goods",
  "theft",
  "other",
] as const;

interface EditProductModalProps {
  /** Pass null for add-product mode */
  product: ProductRow | null;
  categories: Category[];
  tenantId: number;
  onClose: () => void;
  onSaved: () => void;
}

export function EditProductModal({
  product,
  categories,
  tenantId,
  onClose,
  onSaved,
}: EditProductModalProps) {
  const isAdd = product === null;

  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    product?.categoryId ? String(product.categoryId) : "",
  );
  const [newQuantity, setNewQuantity] = useState(
    product ? String(product.quantity) : "0",
  );
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [unitCost, setUnitCost] = useState(
    product?.unitCost != null ? String(product.unitCost) : "",
  );
  const [reorderThreshold, setReorderThreshold] = useState(
    product?.reorderThreshold != null ? String(product.reorderThreshold) : "",
  );
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantityDelta = product ? Number(newQuantity) - product.quantity : 0;
  const quantityChanged = !isAdd && quantityDelta !== 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Product name is required.");
      return;
    }
    if (quantityChanged && !reason) {
      setError("Please select a reason for the quantity change.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isAdd) {
        await createProduct(tenantId, {
          name: name.trim(),
          categoryId: categoryId ? Number(categoryId) : null,
          quantity: Number(newQuantity),
          unit: unit.trim(),
          unitCost: unitCost ? Number(unitCost) : null,
          reorderThreshold: reorderThreshold
            ? Number(reorderThreshold)
            : null,
        });
      } else {
        await updateProduct(tenantId, {
          id: product.id,
          name: name.trim(),
          categoryId: categoryId ? Number(categoryId) : null,
          unit: unit.trim(),
          unitCost: unitCost ? Number(unitCost) : null,
          reorderThreshold: reorderThreshold
            ? Number(reorderThreshold)
            : null,
          quantityDelta,
          quantityChangeReason: reason || undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl p-6 sm:p-7 max-w-md w-full my-auto shadow-2xl border border-slate-200/90 relative ring-1 ring-black/5 animate-in zoom-in-95 duration-150">
        <h3 className="font-display text-lg text-ink mb-4">
          {isAdd ? "Add product" : "Edit product"}
        </h3>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Name *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
              placeholder="e.g. Indomie Super Pack"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Category</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">
                {isAdd ? "Starting quantity" : "Quantity on hand"}
              </span>
              <input
                type="number"
                min="0"
                step="any"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                required
                className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors font-mono"
              />
              {!isAdd && quantityChanged && (
                <span
                  className={`text-[10px] ${
                    quantityDelta > 0 ? "text-money" : "text-flag"
                  }`}
                >
                  {quantityDelta > 0 ? "+" : ""}
                  {quantityDelta} from {product!.quantity}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Unit *</span>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
                placeholder="pcs, cartons, kg"
                className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Unit cost (&#8358;)</span>
              <input
                type="number"
                min="0"
                step="any"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors font-mono"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Reorder threshold</span>
              <input
                type="number"
                min="0"
                step="any"
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors font-mono"
              />
            </label>
          </div>

          {/* Reason dropdown — only for edit mode with quantity change */}
          {quantityChanged && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-flag font-medium">
                Reason for quantity change *
              </span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
              >
                <option value="">Select reason…</option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <div className="bg-flag-light border border-flag rounded-lg px-3 py-2 text-xs text-flag">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-ink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : isAdd ? "Add product" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
