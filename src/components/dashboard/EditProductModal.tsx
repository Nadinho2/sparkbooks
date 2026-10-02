"use client";

import { useState, type FormEvent } from "react";
import type { ProductRow, Category } from "./ProductTable";
import { updateProduct, createProduct } from "@/app/dashboard/products/actions";
import { formatNaira } from "@/lib/format";
import { buildPackagingLadder, formatStockBreakdown, PACKAGING_TEMPLATES, type PackagingUnit } from "@/lib/packaging";

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

  // Multi-tier packaging units
  const initialPackaging: PackagingUnit[] = product?.packagingUnits && product.packagingUnits.length > 0
    ? product.packagingUnits
    : (product?.piecesPerPack && Number(product.piecesPerPack) > 1
        ? [{ name: "carton", size: Number(product.piecesPerPack), to_base: Number(product.piecesPerPack) }]
        : []);

  const [hasPackagingLadder, setHasPackagingLadder] = useState(initialPackaging.length > 0);
  const [packagingTiers, setPackagingTiers] = useState<Array<{ name: string; size: number }>>(() => {
    if (initialPackaging.length > 0) {
      return initialPackaging.map((t) => ({ name: t.name, size: t.size }));
    }
    return [{ name: "carton", size: 40 }];
  });

  const [newQuantity, setNewQuantity] = useState(
    product ? String(product.quantity) : "0",
  );
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [costMode, setCostMode] = useState<"unit" | "bulk">("unit");
  const [unitCost, setUnitCost] = useState(
    product?.unitCost != null ? String(product.unitCost) : "",
  );
  const [bulkCost, setBulkCost] = useState<string>(() => {
    if (product?.unitCost != null && product.quantity > 0) {
      return String(Math.round(product.unitCost * product.quantity * 100) / 100);
    }
    return "";
  });
  const [reorderThreshold, setReorderThreshold] = useState(
    product?.reorderThreshold != null ? String(product.reorderThreshold) : "",
  );
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleQuantityChange(val: string) {
    setNewQuantity(val);
    const qty = Number(val);
    if (costMode === "bulk" && bulkCost && qty > 0) {
      const b = parseFloat(bulkCost);
      if (!isNaN(b)) {
        setUnitCost(String(Number((b / qty).toFixed(2))));
      }
    } else if (costMode === "unit" && unitCost && qty > 0) {
      const u = parseFloat(unitCost);
      if (!isNaN(u)) {
        setBulkCost(String(Math.round(u * qty * 100) / 100));
      }
    }
  }

  function handleUnitCostChange(val: string) {
    setUnitCost(val);
    const qty = Number(newQuantity);
    const u = parseFloat(val);
    if (qty > 0 && !isNaN(u)) {
      setBulkCost(String(Math.round(u * qty * 100) / 100));
    } else if (!val) {
      setBulkCost("");
    }
  }

  function handleBulkCostChange(val: string) {
    setBulkCost(val);
    const qty = Number(newQuantity);
    const b = parseFloat(val);
    if (qty > 0 && !isNaN(b)) {
      setUnitCost(String(Number((b / qty).toFixed(2))));
    } else if (!val) {
      setUnitCost("");
    }
  }

  function switchToBulk() {
    setCostMode("bulk");
    const qty = Number(newQuantity);
    const u = parseFloat(unitCost);
    if (qty > 0 && !isNaN(u) && !bulkCost) {
      setBulkCost(String(Math.round(u * qty * 100) / 100));
    }
  }

  function switchToUnit() {
    setCostMode("unit");
    const qty = Number(newQuantity);
    const b = parseFloat(bulkCost);
    if (qty > 0 && !isNaN(b) && !unitCost) {
      setUnitCost(String(Number((b / qty).toFixed(2))));
    }
  }

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
    const resolvedLadder = hasPackagingLadder && !isService && packagingTiers.length > 0
      ? buildPackagingLadder(packagingTiers)
      : null;
    const topPack = resolvedLadder && resolvedLadder.length > 0
      ? resolvedLadder[resolvedLadder.length - 1].to_base
      : (piecesPerPack.trim() ? Number(piecesPerPack) : null);
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
          piecesPerPack: isService ? null : topPack,
          packagingUnits: resolvedLadder,
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
          piecesPerPack: isService ? null : topPack,
          packagingUnits: resolvedLadder,
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
                    onChange={(e) => handleQuantityChange(e.target.value)}
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

              {/* Buying Cost section: toggle between Unit Price and Bulk Price */}
              <div className="p-3 bg-slate-50/80 border border-slate-200/90 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">Buying Cost / Price</span>
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-200/70 text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={switchToUnit}
                      className={`px-2.5 py-0.5 rounded-md transition-all ${
                        costMode === "unit"
                          ? "bg-white text-ink shadow-2xs font-semibold"
                          : "text-slate-600 hover:text-ink"
                      }`}
                    >
                      Per Unit Price
                    </button>
                    <button
                      type="button"
                      onClick={switchToBulk}
                      className={`px-2.5 py-0.5 rounded-md transition-all ${
                        costMode === "bulk"
                          ? "bg-white text-ink shadow-2xs font-semibold"
                          : "text-slate-600 hover:text-ink"
                      }`}
                    >
                      Total Bulk Price
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {costMode === "unit" ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-ink-muted">Cost per unit (₦)</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={unitCost}
                        onChange={(e) => handleUnitCostChange(e.target.value)}
                        placeholder="e.g. 1500"
                        className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors font-mono bg-white"
                      />
                      {Number(newQuantity) > 1 && unitCost && (
                        <span className="text-[10px] text-ink-muted">
                          Total for {newQuantity} {unit || "units"}: ≈ {formatNaira(Number(unitCost) * Number(newQuantity))}
                        </span>
                      )}
                    </label>
                  ) : (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-ink-muted">Total Bulk Price (₦)</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={bulkCost}
                        onChange={(e) => handleBulkCostChange(e.target.value)}
                        placeholder="e.g. 18000 for batch"
                        className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors font-mono bg-white"
                      />
                      {Number(newQuantity) > 0 && bulkCost ? (
                        <span className="text-[10px] text-emerald-700 font-medium leading-tight">
                          ≈ {formatNaira(Number(unitCost))} / {unit || "unit"} ({formatNaira(Number(bulkCost))} ÷ {newQuantity})
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-muted">
                          Enter quantity to calculate unit cost
                        </span>
                      )}
                    </label>
                  )}

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-ink-muted">Reorder threshold</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={reorderThreshold}
                      onChange={(e) => setReorderThreshold(e.target.value)}
                      className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors font-mono bg-white"
                    />
                    <span className="text-[10px] text-ink-muted">
                      Alert when stock falls below this
                    </span>
                  </label>
                </div>
              </div>

              {/* Multi-Tier Packaging Units (Carton -> Pack -> Card -> Pcs) */}
              <div className="p-3.5 bg-slate-50/90 border border-slate-200/90 rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasPackagingLadder}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setHasPackagingLadder(checked);
                        if (checked && packagingTiers.length === 0) {
                          setPackagingTiers([{ name: "carton", size: 40 }]);
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-spark focus:ring-spark mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Multi-Unit Packaging Ladder
                      </span>
                      <span className="text-[11px] text-ink-muted block mt-0.5">
                        For products bought in bulk & sold in parts (e.g. Carton → Pack → Card → Tablets).
                      </span>
                    </div>
                  </label>
                </div>

                {hasPackagingLadder && (
                  <div className="space-y-3 pt-2 border-t border-slate-200/80 animate-in fade-in duration-150">
                    {/* Quick Preset Templates */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                        Quick Industry Presets:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {PACKAGING_TEMPLATES.map((tmpl) => (
                          <button
                            key={tmpl.id}
                            type="button"
                            onClick={() => {
                              if (!unit || unit === "pcs") setUnit(tmpl.baseUnit);
                              setPackagingTiers(tmpl.tiers.map((t) => ({ name: t.name, size: t.size })));
                            }}
                            className="text-[10px] px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-100/70 text-slate-700 transition-colors font-medium"
                          >
                            {tmpl.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Packaging Steps Ladder */}
                    <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 pb-1 border-b border-slate-100">
                        <span>Packaging Tier</span>
                        <span>Contains</span>
                      </div>

                      {packagingTiers.map((tier, idx) => {
                        const subUnitLabel = idx === 0 ? (unit || "pcs") : packagingTiers[idx - 1].name;
                        const runningLadder = buildPackagingLadder(packagingTiers.slice(0, idx + 1));
                        const currentMultiplier = runningLadder[idx]?.to_base || tier.size;

                        return (
                          <div key={idx} className="flex items-center gap-2 py-1">
                            <span className="text-xs text-slate-400 font-mono w-4">{idx + 1}.</span>
                            <div className="flex-1">
                              <input
                                type="text"
                                value={tier.name}
                                onChange={(e) => {
                                  const updated = [...packagingTiers];
                                  updated[idx].name = e.target.value;
                                  setPackagingTiers(updated);
                                }}
                                placeholder="e.g. pack, carton"
                                className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 font-medium text-ink focus:border-spark outline-none"
                              />
                            </div>
                            <span className="text-xs text-slate-400">has</span>
                            <div className="w-20">
                              <input
                                type="number"
                                min="1"
                                value={tier.size}
                                onChange={(e) => {
                                  const updated = [...packagingTiers];
                                  updated[idx].size = Math.max(1, Number(e.target.value) || 1);
                                  setPackagingTiers(updated);
                                }}
                                className="w-full text-xs py-1.5 px-2 rounded-lg border border-slate-200 font-mono text-ink text-center focus:border-spark outline-none"
                              />
                            </div>
                            <span className="text-xs text-slate-600 font-medium w-24 truncate" title={subUnitLabel}>
                              {subUnitLabel}
                            </span>
                            {idx > 0 && currentMultiplier > tier.size && (
                              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                                (={currentMultiplier.toLocaleString()} {unit || "pcs"})
                              </span>
                            )}
                            {packagingTiers.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPackagingTiers(packagingTiers.filter((_, i) => i !== idx));
                                }}
                                className="text-xs text-slate-400 hover:text-rose-600 p-1"
                                title="Remove tier"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {packagingTiers.length < 4 && (
                        <button
                          type="button"
                          onClick={() => {
                            const defaultNames = ["pack", "carton", "crate", "pallet"];
                            const used = packagingTiers.map((t) => t.name.toLowerCase());
                            const nextName = defaultNames.find((n) => !used.includes(n)) || "box";
                            setPackagingTiers([...packagingTiers, { name: nextName, size: 10 }]);
                          }}
                          className="mt-2 text-[11px] font-semibold text-spark hover:underline flex items-center gap-1"
                        >
                          + Add higher packaging tier
                        </button>
                      )}
                    </div>

                    {/* Live Stock Breakdown Display */}
                    {Number(newQuantity) > 0 && (
                      <div className="p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-lg text-xs text-emerald-900">
                        <span className="font-semibold block text-[11px] text-emerald-800">
                          📦 Current Stock Representation:
                        </span>
                        <span className="font-medium text-emerald-950 mt-0.5 block">
                          {formatStockBreakdown(Number(newQuantity) || 0, unit || "pcs", buildPackagingLadder(packagingTiers)).summary}
                        </span>
                        <span className="text-[10px] text-emerald-700 block mt-0.5 font-mono">
                          (Total base inventory: {Number(newQuantity).toLocaleString()} {unit || "pcs"})
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
