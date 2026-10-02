"use client";

import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import Link from "next/link";
import { bulkImportProducts, type BulkProductItem } from "@/app/dashboard/products/actions";
import { formatNaira } from "@/lib/format";

interface BulkUploadModalProps {
  tenantId: number;
  canBulkUpload: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

type MappableField =
  | "name"
  | "categoryName"
  | "quantity"
  | "unit"
  | "unitCost"
  | "bulkCost"
  | "reorderThreshold"
  | "piecesPerPack";

const FIELD_OPTIONS: { key: MappableField; label: string; required?: boolean }[] = [
  { key: "name", label: "Product Name", required: true },
  { key: "categoryName", label: "Category" },
  { key: "quantity", label: "Initial Quantity / Stock" },
  { key: "unit", label: "Unit (e.g. pcs, bundle, bag)" },
  { key: "unitCost", label: "Buying Price (Per-Unit Cost ₦)" },
  { key: "bulkCost", label: "Buying Price (Total Bulk / Batch Cost ₦)" },
  { key: "reorderThreshold", label: "Low Stock Alert Level" },
  { key: "piecesPerPack", label: "Pieces per Pack" },
];

export function BulkUploadModal({
  tenantId: _tenantId,
  canBulkUpload,
  onClose,
  onSuccess,
}: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, MappableField>>({});
  const [priceMode, setPriceMode] = useState<"unit" | "bulk">("unit");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewSearch, setPreviewSearch] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If user is on Free plan, show upgrade modal
  if (!canBulkUpload) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl mb-4 border border-amber-200/60">
            📊
          </div>
          <h2 className="text-lg font-bold text-ink mb-1.5 font-display">
            CSV & Excel Bulk Upload
          </h2>
          <p className="text-xs text-ink-muted leading-relaxed mb-6">
            Bulk spreadsheet importing is a premium feature available on{" "}
            <strong className="text-ink font-semibold">Starter</strong> and{" "}
            <strong className="text-ink font-semibold">Pro</strong> plans.
            Upgrade to import hundreds of products in seconds with automatic stock tracking.
          </p>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <Link
              href="/dashboard/billing"
              className="px-4 py-2 text-xs font-semibold text-white bg-ink rounded-xl hover:opacity-90 transition-opacity shadow-xs"
            >
              View Plans & Upgrade →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Auto-detect column mappings based on common header names
  function autoDetectHeaders(cols: string[]) {
    const map: Record<string, MappableField> = {};
    cols.forEach((col) => {
      const lower = col.trim().toLowerCase();
      if (
        lower === "name" ||
        lower.includes("product") ||
        lower.includes("item") ||
        lower.includes("title") ||
        lower.includes("description")
      ) {
        if (!Object.values(map).includes("name")) map[col] = "name";
      } else if (
        lower.includes("cat") ||
        lower.includes("group") ||
        lower.includes("type")
      ) {
        if (!Object.values(map).includes("categoryName")) map[col] = "categoryName";
      } else if (
        lower.includes("qty") ||
        lower.includes("quant") ||
        lower.includes("stock") ||
        lower === "count" ||
        lower.includes("in stock")
      ) {
        if (!Object.values(map).includes("quantity")) map[col] = "quantity";
      } else if (
        lower.includes("bulk") ||
        lower.includes("total cost") ||
        lower.includes("total price") ||
        lower.includes("total amount") ||
        lower.includes("batch") ||
        lower.includes("carton cost") ||
        lower.includes("carton price")
      ) {
        if (!Object.values(map).includes("bulkCost")) {
          map[col] = "bulkCost";
          setPriceMode("bulk");
        }
      } else if (
        lower.includes("unit cost") ||
        lower.includes("unit price") ||
        lower.includes("cost") ||
        lower.includes("buying") ||
        lower.includes("purchase") ||
        lower.includes("price") ||
        lower.includes("selling") ||
        lower.includes("rate") ||
        lower.includes("amount")
      ) {
        if (!Object.values(map).includes("unitCost") && !Object.values(map).includes("bulkCost")) {
          map[col] = "unitCost";
        }
      } else if (
        lower === "unit" ||
        lower.includes("measure") ||
        lower.includes("pkg") ||
        lower.includes("uom") ||
        lower.includes("packaging") ||
        lower.includes("unit of measure")
      ) {
        if (!Object.values(map).includes("unit")) map[col] = "unit";
      } else if (
        lower.includes("alert") ||
        lower.includes("reorder") ||
        lower.includes("threshold") ||
        lower.includes("min")
      ) {
        if (!Object.values(map).includes("reorderThreshold")) map[col] = "reorderThreshold";
      } else if (
        lower.includes("pack") ||
        lower.includes("pieces") ||
        lower.includes("per pack") ||
        lower.includes("pack size")
      ) {
        if (!Object.values(map).includes("piecesPerPack")) map[col] = "piecesPerPack";
      }
    });
    setColumnMap(map);
  }

  function handleProcessFile(f: File) {
    setFile(f);
    setError(null);

    if (f.name.endsWith(".csv")) {
      Papa.parse(f, {
        header: false,
        skipEmptyLines: true,
        complete(results) {
          const rows = (results.data as string[][]).filter((r) =>
            r.some((cell) => cell.trim().length > 0)
          );
          if (rows.length < 2) {
            setError("The CSV file must contain a header row and at least one product.");
            return;
          }
          const detectedHeaders = rows[0].map((h) => h.trim());
          setHeaders(detectedHeaders);
          setRawRows(rows.slice(1));
          autoDetectHeaders(detectedHeaders);
        },
        error(err) {
          setError(`Failed to parse CSV: ${err.message}`);
        },
      });
    } else {
      // Excel (.xlsx or .xls)
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = XLSX.read(ev.target?.result, { type: "binary" });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
            header: 1,
            defval: "",
          });
          const rows = json.filter((r) => r.some((cell) => String(cell).trim().length > 0));
          if (rows.length < 2) {
            setError("The spreadsheet must contain a header row and at least one product row.");
            return;
          }
          const detectedHeaders = (rows[0] as string[]).map((h) => String(h).trim());
          setHeaders(detectedHeaders);
          setRawRows((rows.slice(1) as string[][]).map((row) => row.map((cell) => String(cell))));
          autoDetectHeaders(detectedHeaders);
        } catch (e: any) {
          setError(`Failed to read Excel file: ${e?.message || e}`);
        }
      };
      reader.readAsBinaryString(f);
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) handleProcessFile(selected);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleProcessFile(dropped);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDownloadSample() {
    const csvContent =
      "Product Name,Category,Quantity,Unit,Unit Cost,Reorder Alert,Pieces Per Pack\n" +
      "Bone Straight 18 inch,Hair Extensions,15,bundle,45000,3,1\n" +
      "Raw Curly 22 inch,Hair Extensions,8,bundle,58000,2,1\n" +
      "Lace Front Wig 24 inch,Wigs,4,pcs,85000,1,1\n" +
      "Leave-in Conditioner 250ml,Hair Care,25,bottle,4500,5,1\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "SparkBooks_Product_Import_Sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Compute mapped products preview
  const mappedProducts: (BulkProductItem & { bulkCost?: number | null; rawCost?: number | null })[] = rawRows.map((row) => {
    const item: BulkProductItem & { bulkCost?: number | null; rawCost?: number | null } = { name: "" };
    let parsedUnitCost: number | null = null;
    let parsedBulkCost: number | null = null;

    headers.forEach((header, idx) => {
      const field = columnMap[header];
      const val = row[idx]?.trim();
      if (!field || !val) return;

      if (field === "name") {
        item.name = val;
      } else if (field === "categoryName") {
        item.categoryName = val;
      } else if (field === "quantity") {
        item.quantity = parseFloat(val.replace(/,/g, "")) || 0;
      } else if (field === "unit") {
        item.unit = val;
      } else if (field === "unitCost") {
        parsedUnitCost = parseFloat(val.replace(/[^0-9.]/g, "")) || null;
      } else if (field === "bulkCost") {
        parsedBulkCost = parseFloat(val.replace(/[^0-9.]/g, "")) || null;
      } else if (field === "reorderThreshold") {
        item.reorderThreshold = parseFloat(val.replace(/,/g, "")) || null;
      } else if (field === "piecesPerPack") {
        item.piecesPerPack = parseInt(val.replace(/,/g, ""), 10) || null;
      }
    });

    // Defensive fix: if unit was mapped to a price column or contains purely numeric values (e.g. "1700", "4000")
    if (item.unit) {
      const numericClean = item.unit.replace(/[₦,\s]/g, "");
      if (/^\d+(\.\d+)?$/.test(numericClean)) {
        const numVal = parseFloat(numericClean);
        if (!isNaN(numVal) && numVal > 0) {
          if (parsedUnitCost == null && parsedBulkCost == null) {
            parsedUnitCost = numVal;
          }
        }
        item.unit = "pcs";
      }
    }

    const qty = item.quantity || 0;

    // Resolve bulk vs unit cost:
    if (parsedBulkCost != null) {
      item.bulkCost = parsedBulkCost;
      item.rawCost = parsedBulkCost;
      item.unitCost = qty > 0 ? Number((parsedBulkCost / qty).toFixed(2)) : parsedBulkCost;
    } else if (parsedUnitCost != null) {
      item.rawCost = parsedUnitCost;
      if (priceMode === "bulk") {
        item.bulkCost = parsedUnitCost;
        item.unitCost = qty > 0 ? Number((parsedUnitCost / qty).toFixed(2)) : parsedUnitCost;
      } else {
        item.unitCost = parsedUnitCost;
        item.bulkCost = qty > 0 ? Math.round(parsedUnitCost * qty * 100) / 100 : null;
      }
    }

    return item;
  });

  const validProducts = mappedProducts.filter((p) => p.name.trim().length > 0);
  const displayedProducts = previewSearch.trim()
    ? validProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(previewSearch.toLowerCase()) ||
          (p.categoryName &&
            p.categoryName.toLowerCase().includes(previewSearch.toLowerCase())),
      )
    : validProducts;
  const nameColumnAssigned = Object.values(columnMap).includes("name");

  async function handleImport() {
    if (!nameColumnAssigned) {
      setError("Please map a column to Product Name before importing.");
      return;
    }
    if (validProducts.length === 0) {
      setError("No valid products found to import. Each product must have a name.");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const res = await bulkImportProducts(validProducts, { skipDuplicates });
      if (!res.success) {
        setError(res.error || "Failed to import products.");
      } else {
        const total = res.imported + (res.updated || 0);
        onSuccess(total);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to import products. Please check the spreadsheet format.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rule">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-ink font-display">
              Bulk Import Products
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Import multiple products from CSV or Excel (.xlsx, .xls) files.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink rounded-lg transition-colors text-base"
          >
            ✕
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
              <span className="font-bold">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Upload or change file */}
          {!file ? (
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-50/50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-sand-light text-ink flex items-center justify-center mx-auto mb-3 text-2xl">
                  📁
                </div>
                <h3 className="text-sm font-semibold text-ink mb-1">
                  Choose a file or drag & drop here
                </h3>
                <p className="text-xs text-ink-muted max-w-xs mx-auto mb-4">
                  Supports CSV, XLSX, and XLS formats from Excel, Google Sheets, or POS systems.
                </p>
                <button
                  type="button"
                  className="px-4 py-2 text-xs font-semibold text-ink bg-white border border-rule rounded-xl shadow-xs hover:bg-slate-50 transition-colors"
                >
                  Browse Files
                </button>
              </div>

              {/* Sample Template */}
              <div className="mt-4 flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📄</span>
                  <div>
                    <p className="text-xs font-medium text-ink">Need a template to get started?</p>
                    <p className="text-[11px] text-ink-muted">Download our pre-formatted sample spreadsheet.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline"
                >
                  Download Sample CSV
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* File Info Bar */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">📊</span>
                  <div>
                    <p className="text-xs font-bold text-ink">{file.name}</p>
                    <p className="text-[11px] text-ink-muted">
                      {rawRows.length} rows found • {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setHeaders([]);
                    setRawRows([]);
                    setColumnMap({});
                    setError(null);
                  }}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                >
                  Choose another file
                </button>
              </div>

              {/* Step 2: Column Mapping */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    Match Spreadsheet Columns
                  </h3>
                  <span className="text-[11px] text-ink-muted">
                    {nameColumnAssigned ? "✓ Product Name mapped" : "⚠️ Product Name required"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 bg-slate-50/60 p-4 rounded-xl border border-slate-200">
                  {headers.map((header) => (
                    <div key={header} className="bg-white p-2.5 rounded-lg border border-rule">
                      <span className="text-[11px] font-medium text-ink-muted block truncate mb-1">
                        Column: <strong className="text-ink">{header}</strong>
                      </span>
                      <select
                        value={columnMap[header] || ""}
                        onChange={(e) => {
                          const val = e.target.value as MappableField | "";
                          setColumnMap((prev) => {
                            const next = { ...prev };
                            if (!val) {
                              delete next[header];
                            } else {
                              next[header] = val;
                            }
                            return next;
                          });
                        }}
                        className="w-full text-xs py-1.5 px-2 rounded-md border border-slate-200 bg-white text-ink focus:outline-hidden focus:border-ink"
                      >
                        <option value="">-- Ignore this column --</option>
                        {FIELD_OPTIONS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label} {f.required ? "*" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price Mode Interpretation Selector */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-ink">Price Column Interpretation</span>
                    <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Smart Calculation
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    Did the price column list the cost per single item, or the total bulk amount paid for the whole batch?
                  </p>
                </div>
                <div className="inline-flex rounded-xl p-1 bg-slate-200/80 text-xs shrink-0 font-medium self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setPriceMode("unit")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      priceMode === "unit"
                        ? "bg-white text-ink shadow-xs font-semibold"
                        : "text-slate-600 hover:text-ink"
                    }`}
                  >
                    Per-Unit Price (₦/pc)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceMode("bulk")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      priceMode === "bulk"
                        ? "bg-white text-emerald-800 shadow-xs font-semibold"
                        : "text-slate-600 hover:text-ink"
                    }`}
                  >
                    Total Bulk Price (Batch ₦)
                  </button>
                </div>
              </div>

              {/* Step 3: Preview */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                      Preview ({validProducts.length} products ready)
                    </h3>
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                      Scrollable
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {validProducts.length > 5 && (
                      <input
                        type="text"
                        placeholder="Search preview..."
                        value={previewSearch}
                        onChange={(e) => setPreviewSearch(e.target.value)}
                        className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white placeholder:text-slate-400 focus:outline-hidden focus:border-ink w-36 sm:w-44"
                      />
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-ink cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={skipDuplicates}
                        onChange={(e) => setSkipDuplicates(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Skip duplicates</span>
                    </label>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto max-h-80 sm:max-h-96 relative bg-white shadow-2xs">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 text-left text-slate-700 sticky top-0 z-10 font-semibold border-b border-slate-200 shadow-2xs">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center text-slate-400 font-mono">#</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-right">Quantity</th>
                        <th className="py-2.5 px-3">Unit</th>
                        {priceMode === "bulk" ? (
                          <>
                            <th className="py-2.5 px-3 text-right">Bulk Price (₦)</th>
                            <th className="py-2.5 px-3 text-right">Calculated Unit Cost</th>
                          </>
                        ) : (
                          <th className="py-2.5 px-3 text-right">Unit Cost (₦)</th>
                        )}
                        <th className="py-2.5 px-3 text-right">Alert Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {displayedProducts.length === 0 ? (
                        <tr>
                          <td colSpan={priceMode === "bulk" ? 8 : 7} className="py-8 text-center text-ink-muted text-xs">
                            No products match &ldquo;{previewSearch}&rdquo;
                          </td>
                        </tr>
                      ) : (
                        displayedProducts.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3 text-center text-[10px] text-slate-400 font-mono select-none">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-ink">{p.name}</td>
                            <td className="py-2.5 px-3 text-ink-muted">
                              {p.categoryName ? (
                                <span className="inline-block bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-700">
                                  {p.categoryName}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                              {p.quantity ?? 0}
                            </td>
                            <td className="py-2.5 px-3 text-ink-muted">{p.unit || "item"}</td>
                            {priceMode === "bulk" ? (
                              <>
                                <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-700">
                                  {p.bulkCost != null ? formatNaira(p.bulkCost) : "—"}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-medium text-emerald-700">
                                  {p.unitCost != null ? (
                                    <span title={`${formatNaira(p.bulkCost || 0)} ÷ ${p.quantity || 1}`}>
                                      {formatNaira(p.unitCost)} / {p.unit || "unit"}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              </>
                            ) : (
                              <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                                {p.unitCost != null ? formatNaira(p.unitCost) : "—"}
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {p.reorderThreshold != null ? p.reorderThreshold : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-[11px] text-ink-muted mt-2 px-1">
                  <span>
                    Showing {displayedProducts.length} of {validProducts.length} product{validProducts.length === 1 ? "" : "s"}
                  </span>
                  {validProducts.length > 5 && (
                    <span className="text-slate-400">↕ Scroll down to review all rows</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-rule bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
          {file && (
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !nameColumnAssigned || validProducts.length === 0}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {importing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Importing {validProducts.length} Products…</span>
                </>
              ) : (
                <span>Import {validProducts.length} Products</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
