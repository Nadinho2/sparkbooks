"use client";

import { useState, useCallback, type FormEvent } from "react";
import type { Category } from "./ProductTable";
import {
  createCategory,
  renameCategory,
  deleteCategory,
} from "@/app/dashboard/categories/actions";

interface CategoryManagerProps {
  tenantId: number;
  categories: Category[];
}

export function CategoryManager({ tenantId, categories }: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!newName.trim()) return;
      await createCategory(tenantId, newName);
      setNewName("");
      window.location.reload();
    },
    [tenantId, newName],
  );

  const handleRename = useCallback(
    async (id: number) => {
      if (!editName.trim()) return;
      await renameCategory(id, editName);
      setEditingId(null);
      setEditName("");
      window.location.reload();
    },
    [editName],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteCategory(tenantId, id);
      setDeletingId(null);
      window.location.reload();
    },
    [tenantId],
  );

  return (
    <div className="bg-white rounded-xl p-5 mb-4 border border-rule">
      <h3 className="font-medium text-ink text-sm mb-3">Categories</h3>

      {/* Create */}
      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          className="flex-1 border border-rule rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-spark transition-colors"
        />
        <button
          type="submit"
          className="px-3 py-1.5 text-sm bg-ink text-white rounded-lg hover:opacity-90 shrink-0"
        >
          Add
        </button>
      </form>

      {/* List */}
      <ul className="flex flex-col gap-1">
        {categories.map((cat) => (
          <li
            key={cat.id}
            className="flex items-center justify-between py-1.5 border-b border-rule/30 last:border-0"
          >
            {editingId === cat.id ? (
              <div className="flex gap-2 flex-1">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 border border-rule rounded px-2 py-1 text-sm text-ink outline-none focus:border-spark"
                />
                <button
                  onClick={() => handleRename(cat.id)}
                  className="text-xs text-spark font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-ink-muted"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <span className="text-sm text-ink">{cat.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditName(cat.name);
                    }}
                    className="text-xs text-ink-muted hover:text-ink"
                  >
                    Rename
                  </button>
                  {cat.name !== "Uncategorized" && (
                    <button
                      onClick={() => setDeletingId(cat.id)}
                      className="text-xs text-flag hover:opacity-80"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* Delete confirm */}
      {deletingId && (
        <div className="mt-3 bg-flag-light border border-flag rounded-lg px-3 py-2 text-xs text-flag flex items-center justify-between">
          <span>Products will be moved to &ldquo;Uncategorized&rdquo;.</span>
          <div className="flex gap-2">
            <button
              onClick={() => setDeletingId(null)}
              className="text-ink-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDelete(deletingId)}
              className="font-medium"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
