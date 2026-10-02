"use client";

import { useState, useEffect, type FormEvent } from "react";
import type { ProductRow, Category } from "./ProductTable";
import { updateProduct, createProduct } from "@/app/dashboard/products/actions";
import { createCategory } from "@/app/dashboard/categories/actions";
import { formatNaira } from "@/lib/format";
import {
  buildPackagingLadder,
  formatStockBreakdown,
  PACKAGING_TEMPLATES,
  type PackagingUnit,
} from "@/lib/packaging";

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
  onCategoryCreated?: (newCategory: Category) => void;
}

export function EditProductModal({
  product,
  categories,
  tenantId,
  onClose,
  onSaved,
  onCategoryCreated,
}: EditProductModalProps) {
  const isAdd = product === null;

  const [availableCategories, setAvailableCategories] = useState<Category[]>(categories);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [creatingCatLoading, setCreatingCatLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  useEffect(() => {
    setAvailableCategories(categories);
  }, [categories]);

  async function handleQuickAddCategory() {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    setCreatingCatLoading(true);
    setCatError(null);
    try {
      const created = await createCategory(tenantId, trimmed);
      setAvailableCategories((prev) => {
        if (prev.some((c) => c.id === created.id)) return prev;
        return [...prev, created];
      });
      setCategoryId(String(created.id));
      setIsCreatingCategory(false);
      setNewCatName("");
      onCategoryCreated?.(created);
    } catch (err: any) {
      setCatError(err?.message || "Failed to create category");
    } finally {
      setCreatingCatLoading(false);
    }
  }

  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    product?.categoryId ? String(product.categoryId) : "",
  );
  const [isService, setIsService] = useState<boolean>(product?.isService ?? false);
  const [piecesPerPack, setPiecesPerPack] = useState<string>(
    product?.piecesPerPack != null ? String(product.piecesPerPack) : "",
  );

  // Multi-tier packaging units
  const initialPackaging: PackagingUnit[] =
    product?.packagingUnits && product.packagingUnits.length > 0
      ? product.packagingUnits
      : product?.piecesPerPack && Number(product.piecesPerPack) > 1
        ? [
            {
              name: "carton",
              size: Number(product.piecesPerPack),
              to_base: Number(product.piecesPerPack),
            },
          ]
        : [];

  const [hasPackagingLadder, setHasPackagingLadder] = useState(
    initialPackaging.length > 0,
  );
  const [packagingTiers, setPackagingTiers] = useState<
    Array<{ name: string; size: number }>
  >(() => {
    if (initialPackaging.length > 0) {
      return initialPackaging.map((t) => ({ name: t.name, size: t.size }));
    }
    return [{ name: "carton", size: 40 }];
  });

  // Base quantity (always stored as base pieces in the database)
  const [newQuantity, setNewQuantity] = useState(
    product ? String(product.quantity) : "0",
  );
  const [unit, setUnit] = useState(product?.unit ?? "");

  // Unit for stock entry in the UI: either "base" or name of a packaging tier (e.g. "carton", "pack")
  const [stockInputUnit, setStockInputUnit] = useState<string>("base");
  const [stockDisplayQty, setStockDisplayQty] = useState<string>(
    product ? String(product.quantity) : "0",
  );

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

  // Active ladder calculated from current packaging tiers
  const activeLadder =
    hasPackagingLadder && packagingTiers.length > 0
      ? buildPackagingLadder(packagingTiers)
      : [];

  function handleQuantityChange(baseVal: string) {
    setNewQuantity(baseVal);
    const qty = Number(baseVal);
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

  function handleStockDisplayChange(val: string, selectedUnit = stockInputUnit) {
    setStockDisplayQty(val);
    const tier = activeLadder.find(
      (t) => t.name.toLowerCase() === selectedUnit.toLowerCase(),
    );
    const multiplier = tier ? tier.to_base : 1;
    const num = parseFloat(val);
    const baseTotal = isNaN(num)
      ? "0"
      : String(Math.round(num * multiplier * 100) / 100);
    handleQuantityChange(baseTotal);
  }

  function handleStockUnitChange(newUnit: string) {
    setStockInputUnit(newUnit);
    const newTier = activeLadder.find(
      (t) => t.name.toLowerCase() === newUnit.toLowerCase(),
    );
    const newMultiplier = newTier ? newTier.to_base : 1;
    const currentBase = Number(newQuantity) || 0;
    if (newMultiplier > 0 && currentBase > 0) {
      const converted = Math.round((currentBase / newMultiplier) * 100) / 100;
      setStockDisplayQty(String(converted));
    } else {
      setStockDisplayQty(String(currentBase));
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
    const resolvedLadder =
      hasPackagingLadder && !isService && packagingTiers.length > 0
        ? buildPackagingLadder(packagingTiers)
        : null;
    const topPack =
      resolvedLadder && resolvedLadder.length > 0
        ? resolvedLadder[resolvedLadder.length - 1].to_base
        : piecesPerPack.trim()
          ? Number(piecesPerPack)
          : null;
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
            : reorderThreshold
              ? Number(reorderThreshold)
              : null,
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
            : reorderThreshold
              ? Number(reorderThreshold)
              : null,
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
      <div className="bg-white rounded-2xl p-6 sm:p-7 max-w-lg w-full my-auto shadow-2xl border border-slate-200/90 relative ring-1 ring-black/5 max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <h3 className="font-display text-lg text-slate-900 font-bold">
            {isAdd ? "Add Product" : `Edit ${product.name}`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Product Name */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-800">Product Name *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors font-medium"
              placeholder="e.g. Paracetamol Extra, Indomie Super Pack"
            />
          </label>

          {/* Category Selector with Inline Quick Add */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">Category</span>
              {!isCreatingCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingCategory(true);
                    setCatError(null);
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors flex items-center gap-1"
                >
                  <span>+</span>
                  <span>New Category</span>
                </button>
              )}
            </div>

            {isCreatingCategory ? (
              <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Category name (e.g. Pharmacy, Provisions, Hair)"
                    autoFocus
                    className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-medium"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleQuickAddCategory();
                      } else if (e.key === "Escape") {
                        setIsCreatingCategory(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={creatingCatLoading || !newCatName.trim()}
                    onClick={handleQuickAddCategory}
                    className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-2xs shrink-0"
                  >
                    {creatingCatLoading ? "..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingCategory(false);
                      setNewCatName("");
                      setCatError(null);
                    }}
                    className="p-1.5 text-xs text-slate-500 hover:text-slate-700"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
                {catError && <p className="text-[11px] text-red-600 font-medium">{catError}</p>}
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => {
                  if (e.target.value === "__create_new__") {
                    setIsCreatingCategory(true);
                  } else {
                    setCategoryId(e.target.value);
                  }
                }}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors font-medium"
              >
                <option value="">None (Uncategorized)</option>
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__create_new__" className="text-emerald-700 font-semibold">
                  + Add new category...
                </option>
              </select>
            )}
          </div>

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
                  setStockDisplayQty("0");
                  setReorderThreshold("");
                  if (!unit) setUnit("service");
                }
              }}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-spark focus:ring-spark"
            />
            <label htmlFor="isServiceToggle" className="text-xs text-slate-800 cursor-pointer select-none">
              <span className="font-semibold block text-slate-900">
                This is a service (e.g. tailoring, alteration, haircut, consulting)
              </span>
              <span className="text-slate-500 text-[11px] block mt-0.5">
                Services do not track physical inventory and will never trigger low-stock alerts.
              </span>
            </label>
          </div>

          {!isService ? (
            <>
              {/* Packaging & Measurement Units (Front & Center) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">📦</span>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Packaging & Measurement Units
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Define how you sell loose pieces and bulk containers (Carton, Pack, Card)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Base Loose Unit (Smallest Piece) */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                  <label className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800">
                        Smallest Loose Unit (Base) *
                      </span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        Individual piece sold loose
                      </span>
                    </div>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      required
                      placeholder="e.g. tablet, sachet, bottle, piece"
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors"
                    />
                  </label>
                </div>

                {/* Multi-Tier Bulk Packaging Toggle */}
                <div className="space-y-2.5">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasPackagingLadder}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setHasPackagingLadder(checked);
                        if (checked && packagingTiers.length === 0) {
                          setPackagingTiers([{ name: "carton", size: 40 }]);
                        }
                        if (!checked) {
                          setStockInputUnit("base");
                          setStockDisplayQty(newQuantity);
                        }
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-spark focus:ring-spark"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        This product has bulk containers (Carton, Pack, Card, Roll, etc.)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Allows recording WhatsApp sales & restocks in cartons or packs with automatic conversion
                      </span>
                    </div>
                  </label>

                  {hasPackagingLadder && (
                    <div className="space-y-3 pt-2 border-t border-slate-200/80 animate-in fade-in duration-150">
                      {/* Preset Templates */}
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
                                const newTiers = tmpl.tiers.map((t) => ({
                                  name: t.name,
                                  size: t.size,
                                }));
                                setPackagingTiers(newTiers);
                                setStockInputUnit("base");
                                setStockDisplayQty(newQuantity);
                              }}
                              className="text-[10px] px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold transition-colors shadow-2xs"
                            >
                              {tmpl.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Packaging Ladder Table */}
                      <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 pb-1.5 border-b border-slate-100">
                          <span>Packaging Container</span>
                          <span>Contains</span>
                        </div>

                        {packagingTiers.map((tier, idx) => {
                          const subUnitLabel =
                            idx === 0 ? unit.trim() || "pcs" : packagingTiers[idx - 1].name;
                          const runningLadder = buildPackagingLadder(
                            packagingTiers.slice(0, idx + 1),
                          );
                          const currentMultiplier =
                            runningLadder[idx]?.to_base || tier.size;

                          return (
                            <div key={idx} className="flex items-center gap-2 py-1">
                              <span className="text-xs text-slate-400 font-mono w-4">
                                {idx + 1}.
                              </span>
                              <div className="flex-1">
                                <input
                                  type="text"
                                  value={tier.name}
                                  onChange={(e) => {
                                    const updated = [...packagingTiers];
                                    updated[idx] = {
                                      ...updated[idx],
                                      name: e.target.value,
                                    };
                                    setPackagingTiers(updated);
                                  }}
                                  placeholder="e.g. card, pack, carton"
                                  className="w-full text-xs py-1.5 px-2.5 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white placeholder:text-slate-400 focus:border-spark focus:ring-1 focus:ring-spark outline-none transition-colors"
                                />
                              </div>
                              <span className="text-xs text-slate-500 font-medium">
                                has
                              </span>
                              <div className="w-20">
                                <input
                                  type="number"
                                  min="1"
                                  value={tier.size}
                                  onChange={(e) => {
                                    const updated = [...packagingTiers];
                                    updated[idx] = {
                                      ...updated[idx],
                                      size: Math.max(1, Number(e.target.value) || 1),
                                    };
                                    setPackagingTiers(updated);
                                  }}
                                  className="w-full text-xs py-1.5 px-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900 bg-white text-center focus:border-spark focus:ring-1 focus:ring-spark outline-none transition-colors"
                                />
                              </div>
                              <span
                                className="text-xs text-slate-700 font-semibold w-24 truncate"
                                title={subUnitLabel}
                              >
                                {subUnitLabel}
                              </span>
                              {idx > 0 && currentMultiplier > tier.size && (
                                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                                  (={currentMultiplier.toLocaleString()}{" "}
                                  {unit.trim() || "pcs"})
                                </span>
                              )}
                              {packagingTiers.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPackagingTiers(
                                      packagingTiers.filter((_, i) => i !== idx),
                                    );
                                  }}
                                  className="text-xs text-slate-400 hover:text-rose-600 p-1 font-bold"
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
                              const used = packagingTiers.map((t) =>
                                t.name.toLowerCase(),
                              );
                              const nextName =
                                defaultNames.find((n) => !used.includes(n)) || "box";
                              setPackagingTiers([
                                ...packagingTiers,
                                { name: nextName, size: 10 },
                              ]);
                            }}
                            className="mt-2 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 transition-colors"
                          >
                            + Add higher container tier (e.g. Carton, Pallet)
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Stock Inventory Section (Container-Aware!) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    {isAdd ? "Initial Stock in Store" : "Current Stock in Store"}
                  </span>
                  {hasPackagingLadder && activeLadder.length > 0 && (
                    <span className="text-[11px] text-slate-500 font-medium">
                      Enter in cartons, packs, or loose {unit.trim() || "pieces"}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={stockDisplayQty}
                      onChange={(e) => handleStockDisplayChange(e.target.value)}
                      required
                      placeholder="0"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 font-mono font-bold bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors"
                    />
                  </div>

                  {hasPackagingLadder && activeLadder.length > 0 ? (
                    <div className="w-48">
                      <select
                        value={stockInputUnit}
                        onChange={(e) => handleStockUnitChange(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-900 bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors"
                      >
                        <option value="base">{unit.trim() || "pcs"} (base piece)</option>
                        {activeLadder.map((tier) => (
                          <option key={tier.name} value={tier.name}>
                            {tier.name}s ({tier.to_base.toLocaleString()}{" "}
                            {unit.trim() || "pcs"})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-slate-700 px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono">
                      {unit.trim() || "pcs"}
                    </span>
                  )}
                </div>

                {/* Live Stock Breakdown Display */}
                {Number(newQuantity) > 0 && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-950">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] text-emerald-900 flex items-center gap-1">
                        <span>📦</span>
                        <span>Stock Summary:</span>
                      </span>
                      <span className="text-[10px] font-mono text-emerald-800 font-semibold">
                        Total Base: {Number(newQuantity).toLocaleString()}{" "}
                        {unit.trim() || "pcs"}
                      </span>
                    </div>
                    <p className="font-semibold text-emerald-950 mt-1 text-xs">
                      {hasPackagingLadder && activeLadder.length > 0
                        ? formatStockBreakdown(
                            Number(newQuantity) || 0,
                            unit.trim() || "pcs",
                            activeLadder,
                          ).summary
                        : `${Number(newQuantity).toLocaleString()} ${unit.trim() || "pcs"}`}
                    </p>
                  </div>
                )}

                {!isAdd && quantityChanged && (
                  <div className="text-[11px] font-medium pt-1">
                    <span
                      className={
                        quantityDelta > 0 ? "text-emerald-700" : "text-amber-700"
                      }
                    >
                      {quantityDelta > 0 ? "+" : ""}
                      {quantityDelta.toLocaleString()} {unit.trim() || "pcs"} from previous
                      stock of {product!.quantity.toLocaleString()}{" "}
                      {unit.trim() || "pcs"}
                    </span>
                  </div>
                )}
              </div>

              {/* Buying Cost section: toggle between Unit Price and Bulk Price */}
              <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    Buying Cost / Price
                  </span>
                  <div className="inline-flex rounded-lg p-0.5 bg-slate-200/70 text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={switchToUnit}
                      className={`px-2.5 py-0.5 rounded-md transition-all ${
                        costMode === "unit"
                          ? "bg-white text-slate-900 shadow-2xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Per Unit Price
                    </button>
                    <button
                      type="button"
                      onClick={switchToBulk}
                      className={`px-2.5 py-0.5 rounded-md transition-all ${
                        costMode === "bulk"
                          ? "bg-white text-slate-900 shadow-2xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Total Bulk Price
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {costMode === "unit" ? (
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className="text-xs text-slate-600 font-medium">
                        Cost per {unit.trim() || "unit"} (₦)
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={unitCost}
                        onChange={(e) => handleUnitCostChange(e.target.value)}
                        placeholder="e.g. 1500"
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 font-mono font-semibold bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors"
                      />
                      {Number(newQuantity) > 1 && unitCost && (
                        <span className="text-[10px] text-slate-500 font-medium">
                          Total for {Number(newQuantity).toLocaleString()}{" "}
                          {unit.trim() || "units"}: ≈{" "}
                          {formatNaira(Number(unitCost) * Number(newQuantity))}
                        </span>
                      )}
                    </label>
                  ) : (
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className="text-xs text-slate-600 font-medium">
                        Total Bulk Purchase Price (₦)
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={bulkCost}
                        onChange={(e) => handleBulkCostChange(e.target.value)}
                        placeholder="e.g. 50000 for entire batch"
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 font-mono font-semibold bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors"
                      />
                      {Number(newQuantity) > 0 && bulkCost ? (
                        <span className="text-[10px] text-emerald-700 font-medium leading-tight">
                          ≈ {formatNaira(Number(unitCost))} / {unit.trim() || "unit"} (
                          {formatNaira(Number(bulkCost))} ÷{" "}
                          {Number(newQuantity).toLocaleString()}{" "}
                          {unit.trim() || "units"})
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">
                          Enter quantity to calculate unit cost
                        </span>
                      )}
                    </label>
                  )}
                </div>
              </div>

              {/* Reorder Threshold */}
              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Reorder Threshold (Alert Level)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    in {unit.trim() || "base units"}
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={reorderThreshold}
                  onChange={(e) => setReorderThreshold(e.target.value)}
                  placeholder="e.g. 10"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 font-mono font-semibold bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors"
                />
                <span className="text-[10px] text-slate-500">
                  SparkBooks will alert you on WhatsApp before stock drops below this number
                </span>
              </label>
            </>
          ) : (
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-800">
                  Standard Service Charge (₦, optional)
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="e.g. 25000"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 font-mono font-semibold bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors"
                />
              </label>
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-950">
                <p className="font-bold flex items-center gap-1.5">
                  <span>🛠️</span>
                  <span>Service Item Configured</span>
                </p>
                <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                  When you record sales or tailoring jobs on WhatsApp (e.g. &ldquo;Sewed Senator 30k&rdquo;), revenue is logged directly into your ledger without deducting stock.
                </p>
              </div>
            </div>
          )}

          {/* Reason dropdown — only for edit mode with quantity change */}
          {quantityChanged && (
            <label className="flex flex-col gap-1 p-3 bg-amber-50/80 border border-amber-200 rounded-xl">
              <span className="text-xs text-amber-900 font-bold">
                Reason for Quantity Change *
              </span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white outline-none focus:border-spark focus:ring-1 focus:ring-spark transition-colors font-medium"
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
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5 text-xs text-rose-800 font-medium">
              {error}
            </div>
          )}

          <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-50 font-bold transition-all shadow-sm"
            >
              {saving ? "Saving…" : isAdd ? "Add Product" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
