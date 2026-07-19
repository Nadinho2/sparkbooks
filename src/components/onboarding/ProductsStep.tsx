"use client";

import {
  useState,
  useCallback,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from "react";
import * as Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ProductInput } from "@/app/(marketing)/onboarding/actions";
import { createProducts } from "@/app/(marketing)/onboarding/actions";

interface Category {
  id: number;
  name: string;
}

type EntryMode = "single" | "bulk";

interface BulkRow {
  name: string;
  category: string;
  quantity: string;
  unit: string;
  unitCost: string;
  __originalIndex: number;
}

interface ProductsStepProps {
  tenantId: number;
  categories: Category[];
  onComplete: (addedCount: number) => void;
  loading: boolean;
}

export function ProductsStep({
  tenantId,
  categories,
  onComplete,
  loading,
}: ProductsStepProps) {
  const [mode, setMode] = useState<EntryMode>("single");

  // ── Single-item form ──
  const [singleName, setSingleName] = useState("");
  const [singleCategory, setSingleCategory] = useState("");
  const [singleQty, setSingleQty] = useState("");
  const [singleUnit, setSingleUnit] = useState("");
  const [singleCost, setSingleCost] = useState("");
  const [singleThreshold, setSingleThreshold] = useState("");
  const [singleProducts, setSingleProducts] = useState<ProductInput[]>([]);
  const [singleMatch, setSingleMatch] = useState<string | null>(null);

  // ── Bulk upload ──
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<Record<number, string[]>>({});
  const [bulkMatch, setBulkMatch] = useState<string | null>(null);

  const FIELDS: { key: string; label: string; required: boolean }[] = [
    { key: "name", label: "Product name", required: true },
    { key: "category", label: "Category", required: false },
    { key: "quantity", label: "Quantity", required: true },
    { key: "unit", label: "Unit", required: true },
    { key: "unitCost", label: "Unit cost", required: false },
  ];

  /* ──────── Single-item ──────── */
  const pendingProduct = useRef<ProductInput | null>(null);

  async function handleSingleAdd(e: FormEvent) {
    e.preventDefault();
    const name = singleName.trim();
    if (!name || !singleQty || !singleUnit) return;

    const product: ProductInput = {
      name,
      categoryId: singleCategory ? Number(singleCategory) : null,
      quantity: Number(singleQty),
      unit: singleUnit.trim(),
      unitCost: singleCost ? Number(singleCost) : null,
      reorderThreshold: singleThreshold
        ? Number(singleThreshold)
        : Math.round(Number(singleQty) * 0.2),
    };

    // Check duplicate via API
    const res = await fetch(
      `/api/products/check-duplicate?name=${encodeURIComponent(name)}`,
    );
    const { matches } = await res.json();
    if (matches?.length) {
      pendingProduct.current = product;
      setSingleMatch(matches[0]);
      return;
    }

    commitSingleProduct(product);
  }

  function commitSingleProduct(product: ProductInput) {
    setSingleProducts((prev) => [...prev, product]);
    setSingleName("");
    setSingleCategory("");
    setSingleQty("");
    setSingleUnit("");
    setSingleCost("");
    setSingleThreshold("");
    setSingleMatch(null);
    pendingProduct.current = null;
  }

  /* ──────── Bulk: parse file ──────── */
  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith(".csv")) {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete(results) {
          const rows = results.data as string[][];
          if (rows.length < 2) return;
          setHeaders(rows[0]);
          setRawRows(rows.slice(1));
        },
      });
    } else {
      // Excel
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          defval: "",
        });
        if (json.length < 2) return;
        setHeaders(json[0] as string[]);
        setRawRows(json.slice(1) as string[][]);
      };
      reader.readAsBinaryString(file);
    }
  }

  /* ──────── Bulk: map columns ──────── */
  function handleColumnMap(fileCol: string, fieldKey: string) {
    setColumnMap((prev) => {
      const next = { ...prev };
      // Remove previous mapping to this field
      for (const k of Object.keys(next)) {
        if (next[k] === fieldKey) delete next[k];
      }
      next[fileCol] = fieldKey;
      return next;
    });
  }

  /* ──────── Bulk: generate preview ──────── */
  function generatePreview() {
    const mapped: BulkRow[] = rawRows.map((row, i) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[columnMap[h] ?? ""] = (row[idx] ?? "").toString().trim();
      });
      return {
        name: obj.name ?? "",
        category: obj.category ?? "",
        quantity: obj.quantity ?? "",
        unit: obj.unit ?? "",
        unitCost: obj.unitCost ?? "",
        __originalIndex: i,
      };
    });

    // Validate
    const errors: Record<number, string[]> = {};
    mapped.forEach((row, i) => {
      const rowErrors: string[] = [];
      if (!row.name) rowErrors.push("Name is required");
      if (!row.quantity || isNaN(Number(row.quantity)))
        rowErrors.push("Quantity must be a number");
      if (!row.unit) rowErrors.push("Unit is required");
      if (rowErrors.length) errors[i] = rowErrors;
    });

    setBulkRows(mapped);
    setValidationErrors(errors);
  }

  /* ──────── Bulk: update cell ──────── */
  function updateBulkCell(index: number, field: keyof BulkRow, value: string) {
    setBulkRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    // Re-validate
    setValidationErrors((prev) => {
      const row = bulkRows[index];
      const updated = { ...row, [field]: value };
      const rowErrors: string[] = [];
      if (!updated.name) rowErrors.push("Name is required");
      if (!updated.quantity || isNaN(Number(updated.quantity)))
        rowErrors.push("Quantity must be a number");
      if (!updated.unit) rowErrors.push("Unit is required");
      const next = { ...prev };
      if (rowErrors.length) next[index] = rowErrors;
      else delete next[index];
      return next;
    });
  }

  /* ──────── Bulk: import ──────── */
  async function handleBulkImport() {
    const hasErrors = Object.keys(validationErrors).length > 0;
    if (hasErrors) return;

    const products: ProductInput[] = bulkRows.map((row) => ({
      name: row.name.trim(),
      quantity: Number(row.quantity),
      unit: row.unit.trim(),
      unitCost: row.unitCost ? Number(row.unitCost) : null,
      reorderThreshold: null, // calculated server-side
    }));

    // Single duplicate check: use first product name
    const res = await fetch(
      `/api/products/check-duplicate?name=${encodeURIComponent(products[0]?.name ?? "")}`,
    );
    const { matches } = await res.json();
    if (matches?.length) {
      setBulkMatch(matches[0]);
      return;
    }

    await submitProducts(products, false);
  }

  /* ──────── Submit ──────── */
  async function submitProducts(
    products: ProductInput[],
    skipDupes = false,
  ) {
    const result = await createProducts(tenantId, products, skipDupes);
    if (result.duplicates?.length) {
      setSingleMatch(result.duplicates[0]);
      return;
    }
    onComplete(result.created ?? products.length);
  }

  function handleFinish() {
    onComplete(singleProducts.length);
  }

  /* ──────── Render ──────── */
  return (
    <div className="bg-white rounded-xl p-6">
      <h2 className="font-display text-xl text-ink mb-1">Add your products</h2>
      <p className="text-ink-muted text-sm mb-5">
        Add products you want to track sales and stock for.
      </p>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-5 border-b border-rule">
        {(["single", "bulk"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              mode === m
                ? "border-ink text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {m === "single" ? "Single item" : "Bulk upload (CSV/Excel)"}
          </button>
        ))}
      </div>

      {/* ── Single mode ── */}
      {mode === "single" && (
        <>
          <form onSubmit={handleSingleAdd} className="flex flex-col gap-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">Name *</span>
                <input
                  value={singleName}
                  onChange={(e) => setSingleName(e.target.value)}
                  required
                  className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
                  placeholder="e.g. Indomie Super Pack"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">Category</span>
                <select
                  value={singleCategory}
                  onChange={(e) => setSingleCategory(e.target.value)}
                  className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
                >
                  <option value="">None</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">
                  Starting quantity *
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={singleQty}
                  onChange={(e) => setSingleQty(e.target.value)}
                  required
                  className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">Unit *</span>
                <input
                  value={singleUnit}
                  onChange={(e) => setSingleUnit(e.target.value)}
                  required
                  className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
                  placeholder="bag, piece, carton…"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">Unit cost (optional)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={singleCost}
                  onChange={(e) => setSingleCost(e.target.value)}
                  className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">
                  Reorder threshold{" "}
                  <span className="text-ink-muted/60">
                    (default: 20% of qty)
                  </span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={singleThreshold}
                  onChange={(e) => setSingleThreshold(e.target.value)}
                  className="border border-rule rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-spark transition-colors"
                />
              </label>
            </div>

            <button
              type="submit"
              className="self-start bg-ink text-white rounded-lg px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Add product
            </button>
          </form>

          {/* Fuzzy match warning */}
          {singleMatch && (
            <div className="bg-flag-light border border-flag rounded-lg px-4 py-3 mb-4 text-sm text-flag">
              Did you mean <strong>{singleMatch}</strong>? A similar product
              already exists.{" "}
              <button
                type="button"
                onClick={() => {
                  if (pendingProduct.current) {
                    commitSingleProduct(pendingProduct.current);
                  }
                }}
                className="underline font-medium"
              >
                Add anyway
              </button>
            </div>
          )}

          {/* Added products list */}
          {singleProducts.length > 0 && (
            <div className="border-t border-rule pt-4">
              <p className="text-xs text-ink-muted mb-2">
                {singleProducts.length} product
                {singleProducts.length !== 1 ? "s" : ""} added
              </p>
              <ul className="flex flex-col gap-1 mb-4">
                {singleProducts.map((p, i) => (
                  <li
                    key={i}
                    className="flex justify-between text-sm text-ink border-b border-rule/50 pb-1"
                  >
                    <span>{p.name}</span>
                    <span className="font-mono text-ink-muted">
                      {p.quantity} {p.unit}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleFinish}
                disabled={loading}
                className="bg-ink text-white rounded-lg px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? "Saving…" : "Finish setup"}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Bulk mode ── */}
      {mode === "bulk" && (
        <>
          <div className="mb-4">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-ink file:text-white file:cursor-pointer hover:file:opacity-90"
            />
          </div>

          {/* Column mapping */}
          {headers.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-ink-muted mb-2">
                Map columns from your file:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <span className="text-sm text-ink min-w-0 truncate">
                      &ldquo;{h}&rdquo;
                    </span>
                    <span className="text-ink-muted">→</span>
                    <select
                      value={columnMap[h] ?? ""}
                      onChange={(e) => handleColumnMap(h, e.target.value)}
                      className="border border-rule rounded px-2 py-1 text-xs text-ink outline-none focus:border-spark"
                    >
                      <option value="">Skip</option>
                      {FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={generatePreview}
                className="mt-3 bg-ink text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:opacity-90"
              >
                Preview
              </button>
            </div>
          )}

          {/* Preview table */}
          {bulkRows.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule">
                    {FIELDS.map((f) => (
                      <th
                        key={f.key}
                        className="text-left text-xs text-ink-muted font-normal py-2 px-2"
                      >
                        {f.label}
                        {f.required && " *"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-rule/50 ${
                        validationErrors[i] ? "bg-flag-light/50" : ""
                      }`}
                    >
                      <td className="py-1 px-2">
                        <input
                          value={row.name}
                          onChange={(e) =>
                            updateBulkCell(i, "name", e.target.value)
                          }
                          className="w-full border border-rule rounded px-2 py-1 text-xs outline-none focus:border-spark"
                        />
                        {validationErrors[i]?.includes("Name is required") && (
                          <span className="text-[10px] text-flag block">
                            Required
                          </span>
                        )}
                      </td>
                      <td className="py-1 px-2">
                        <input
                          value={row.category}
                          onChange={(e) =>
                            updateBulkCell(i, "category", e.target.value)
                          }
                          className="w-full border border-rule rounded px-2 py-1 text-xs outline-none focus:border-spark"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <input
                          value={row.quantity}
                          onChange={(e) =>
                            updateBulkCell(i, "quantity", e.target.value)
                          }
                          className="w-full border border-rule rounded px-2 py-1 text-xs outline-none focus:border-spark font-mono"
                        />
                        {validationErrors[i]?.includes(
                          "Quantity must be a number",
                        ) && (
                          <span className="text-[10px] text-flag block">
                            Invalid
                          </span>
                        )}
                      </td>
                      <td className="py-1 px-2">
                        <input
                          value={row.unit}
                          onChange={(e) =>
                            updateBulkCell(i, "unit", e.target.value)
                          }
                          className="w-full border border-rule rounded px-2 py-1 text-xs outline-none focus:border-spark"
                        />
                        {validationErrors[i]?.includes("Unit is required") && (
                          <span className="text-[10px] text-flag block">
                            Required
                          </span>
                        )}
                      </td>
                      <td className="py-1 px-2">
                        <input
                          value={row.unitCost}
                          onChange={(e) =>
                            updateBulkCell(i, "unitCost", e.target.value)
                          }
                          className="w-full border border-rule rounded px-2 py-1 text-xs outline-none focus:border-spark font-mono"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bulk import action */}
          {bulkRows.length > 0 && (
            <>
              {bulkMatch && (
                <div className="bg-flag-light border border-flag rounded-lg px-4 py-3 mb-4 text-sm text-flag">
                  Did you mean <strong>{bulkMatch}</strong>? A similar product
                  already exists.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setBulkMatch(null);
                      submitProducts(
                        bulkRows.map((row) => ({
                          name: row.name.trim(),
                          quantity: Number(row.quantity),
                          unit: row.unit.trim(),
                          unitCost: row.unitCost
                            ? Number(row.unitCost)
                            : null,
                          reorderThreshold: null,
                        })),
                        true,
                      );
                    }}
                    className="underline font-medium"
                  >
                    Import anyway
                  </button>
                </div>
              )}
              <button
                onClick={handleBulkImport}
                disabled={
                  loading || Object.keys(validationErrors).length > 0
                }
                className="bg-ink text-white rounded-lg px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading
                  ? "Importing…"
                  : `Import ${bulkRows.length} product${bulkRows.length !== 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
