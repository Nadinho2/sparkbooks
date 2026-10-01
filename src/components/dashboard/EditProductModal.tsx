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
  const [isService, setIsService] = useState<boolean>(product?.isService ?? false);
  const [piecesPerPack, setPiecesPerPack] = useState<string>(
    product?.piecesPerPack != null ? String(product.piecesPerPack) : "",
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
  const quantityChanged = !isAdd && !isService && quantityDelta !== 0;

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
    const parsedPack = piecesPerPack.trim() ? Number(piecesPerPack) : null;
    const resolvedUnit = unit.trim() || (isService ? "service" : "pcs");

    try {
      if (isAdd) {
        await createProduct(tenantId, {
          name: name.trim(),
          categoryId: categoryId ? Number(categoryId) : null,
          quantity: isService ? 0 : Number(newQuantity),
          unit: resolvedUnit,
          unitCost: unitCost ? Number(unitCost) : null,
          reorderThreshold: isService
            ? null
            : (reorderThreshold ? Number(reorderThreshold) : null),
          isService,
          piecesPerPack: isService ? null : parsedPack,
        });
      } else {
        await updateProduct(tenantId, {
          id: product.id,
          name: name.trim(),
          categoryId: categoryId ? Number(categoryId) : null,
          unit: resolvedUnit,
          unitCost: unitCost ? Number(unitCost) : null,
          reorderThreshold: isService
            ? null
            : (reorderThreshold ? Number(reorderThreshold) : null),
          quantityDelta: isService ? 0 : quantityDelta,
          quantityChangeReason: reason || undefined,
          isService,
          piecesPerPack: isService ? null : parsedPack,
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

          {/* Service toggle */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <input
              type="checkbox"
              id="isServiceToggle"
              checked={isService}
              onChange={(e) => {
                const checked = e.target.checked;
                setIsService(checked);
                if (checked) {
                  setNewQuantity("0");
                  setReorderThreshold("");
                  if (!unit) setUnit("service");
                }
              }}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-spark focus:ring-spark"
            />
            <label htmlFor="isServiceToggle" className="text-xs text-ink cursor-pointer select-none">
              <span className="font-semibold block text-slate-800">This is a service (e.g. tailoring, alteration, haircut)</span>
              <span className="text-ink-muted text-[11px] block mt-0.5">
                Services do not track physical inventory and will never trigger low-stock alerts.
              </span>
            </label>
          </div>

          {!isService ? (
            <>
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
                    required={!isService}
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
                  <span className="text-xs text-ink-muted">Selling Unit *</span>
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    required
                    placeholder="pcs, rolls, kg"
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

              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">
                  Pieces per carton / pack (optional)
                </span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={piecesPerPack}
                  onChange={(e) => setPiecesPerPack(e.target.value)}
                  placeholder="e.g. 40 (if bought in cartons & sold in pieces)"
                  className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors font-mono"
                />
                <span className="text-[10px] text-ink-muted">
                  Restock in cartons on WhatsApp, and SparkBooks will auto-multiply into single pieces!
                </span>
              </label>
            </>
          ) : (
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">Standard / Base Service Charge (&#8358;, optional)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="e.g. 25000"
                  className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors font-mono"
                />
              </label>
              <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs text-indigo-900">
                <p className="font-semibold flex items-center gap-1.5">
                  <span>🛠️</span> Service Item Configured
                </p>
                <p className="text-[11px] text-indigo-700 mt-1">
                  When you record sales or tailoring jobs on WhatsApp (e.g. &ldquo;Sewed Senator 30k&rdquo;), revenue is logged directly into your ledger without deducting stock.
                </p>
              </div>
            </div>
          )}

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
