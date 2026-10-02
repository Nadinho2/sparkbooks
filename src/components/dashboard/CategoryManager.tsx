"use client";

import { useState, useEffect, type FormEvent } from "react";
import type { Category } from "./ProductTable";
import {
  createCategory,
  renameCategory,
  deleteCategory,
} from "@/app/dashboard/categories/actions";

interface CategoryManagerProps {
  tenantId: number;
  categories: Category[];
  onClose?: () => void;
  onCategoryChange?: (categories: Category[]) => void;
}

export function CategoryManager({
  tenantId,
  categories,
  onClose,
  onCategoryChange,
}: CategoryManagerProps) {
  const [catList, setCatList] = useState<Category[]>(categories);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCatList(categories);
  }, [categories]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createCategory(tenantId, trimmed);
      setNewName("");
      const updated = [...catList, created];
      setCatList(updated);
      onCategoryChange?.(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to create category");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: number) => {
    const trimmed = editName.trim();
    if (!trimmed || renaming) return;
    setRenaming(true);
    setError(null);
    try {
      await renameCategory(id, trimmed);
      const updated = catList.map((c) => (c.id === id ? { ...c, name: trimmed } : c));
      setCatList(updated);
      setEditingId(null);
      setEditName("");
      onCategoryChange?.(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to rename category");
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCategory(tenantId, id);
      const updated = catList.filter((c) => c.id !== id);
      setCatList(updated);
      setDeletingId(null);
      onCategoryChange?.(updated);
    } catch (err: any) {
      setError(err?.message || "Failed to delete category");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 mb-5 border border-slate-200/90 shadow-sm relative">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-ink text-sm sm:text-base flex items-center gap-1.5 font-display">
            <span>🏷️</span>
            <span>Manage Categories</span>
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Create, rename, or organize product categories for your catalog.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-sm transition-colors"
            title="Close category manager"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 font-bold px-1">
            ✕
          </button>
        </div>
      )}

      {/* Create new category */}
      <form onSubmit={handleCreate} className="flex gap-2 mb-5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name (e.g. Antibiotics, Beverages, Wigs)"
          className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-ink outline-none focus:border-emerald-600 bg-slate-50/60 focus:bg-white transition-all shadow-2xs"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 disabled:opacity-50 shrink-0 transition-all shadow-xs flex items-center gap-1.5"
        >
          <span>+</span>
          <span>{creating ? "Adding..." : "Add Category"}</span>
        </button>
      </form>

      {/* Category List */}
      <div className="border border-slate-200/80 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
        {catList.length === 0 ? (
          <div className="py-6 text-center text-xs text-ink-muted">
            No categories yet. Add your first category above!
          </div>
        ) : (
          catList.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between p-3 sm:px-4 hover:bg-slate-50/70 transition-colors"
            >
              {editingId === cat.id ? (
                <div className="flex gap-2 flex-1 items-center">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs text-ink outline-none bg-white shadow-2xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(cat.id);
                      else if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button
                    onClick={() => handleRename(cat.id)}
                    disabled={renaming || !editName.trim()}
                    className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded-lg font-medium hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {renaming ? "..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-xs font-semibold text-ink">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingId(cat.id);
                        setEditName(cat.name);
                        setError(null);
                      }}
                      className="text-xs font-medium text-slate-500 hover:text-ink px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
                    >
                      Rename
                    </button>
                    {cat.name !== "Uncategorized" && (
                      <button
                        onClick={() => {
                          setDeletingId(cat.id);
                          setError(null);
                        }}
                        className="text-xs font-medium text-rose-600 hover:text-rose-800 px-2 py-1 rounded-md hover:bg-rose-50 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Alert */}
      {deletingId && (
        <div className="mt-3.5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in duration-100">
          <span>
            ⚠️ Products in this category will be safely reassigned to <strong>&ldquo;Uncategorized&rdquo;</strong>.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setDeletingId(null)}
              className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDelete(deletingId)}
              disabled={deleting}
              className="px-3 py-1 text-xs bg-rose-600 text-white rounded-lg font-semibold hover:bg-rose-700 disabled:opacity-50 shadow-2xs"
            >
              {deleting ? "Deleting..." : "Confirm Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
