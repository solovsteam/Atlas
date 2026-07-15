import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";
import { parentTaskOf, taskParentCandidates } from "@shared/subtasks";
import { trackItemPatchUndo, useUndo } from "../context/UndoContext";

export function SubtaskParentEditor({
  item,
  items,
  updateItem
}: {
  item: Item;
  items: Item[];
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const { push } = useUndo();
  const [query, setQuery] = useState("");
  const parent = useMemo(() => parentTaskOf(item, items), [item, items]);
  const candidates = useMemo(() => taskParentCandidates(item, items, query).slice(0, 8), [item, items, query]);

  async function setParent(parentTaskId: string | null) {
    const before: ItemPatch = { parentTaskId: item.parentTaskId || null };
    try {
      const result = await updateItem(
        item.id,
        JSON.stringify({ parentTaskId } satisfies ItemPatch),
        item.revision
      );
      if ("ok" in result && result.ok) {
        trackItemPatchUndo(push, item.id, before);
        setQuery("");
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not update parent task");
    }
  }

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs text-neutral-500">Parent task</p>
      {parent ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Link className="text-neutral-200 hover:text-white" to={`/item/${parent.id}`}>
            {parent.title}
          </Link>
          <button
            className="border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
            type="button"
            onClick={() => void setParent(null)}
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="mb-3 text-sm text-neutral-500">Not a subtask.</p>
      )}

      <input
        className="w-full border border-neutral-700 bg-black px-3 py-1.5 text-sm outline-none focus:border-white"
        placeholder="Search tasks to set as parent…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.trim() && candidates.length > 0 ? (
        <ul className="mt-2 divide-y divide-neutral-800 border border-neutral-800">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-950 hover:text-white"
                type="button"
                onClick={() => void setParent(candidate.id)}
              >
                {candidate.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
