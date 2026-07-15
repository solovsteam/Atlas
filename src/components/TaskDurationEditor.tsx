import { useEffect, useState } from "react";
import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";
import { formatDurationMinutes, parseDurationMinutes } from "@shared/duration";
import { trackItemPatchUndo, useUndo } from "../context/UndoContext";

export function TaskDurationEditor({
  item,
  updateItem
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const { push } = useUndo();
  const [draft, setDraft] = useState(() => formatDurationMinutes(item.expectedDurationMinutes));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(formatDurationMinutes(item.expectedDurationMinutes));
    setError(null);
  }, [item.expectedDurationMinutes, item.id]);

  async function save(nextMinutes: number | null) {
    if (nextMinutes === item.expectedDurationMinutes) {
      setDraft(formatDurationMinutes(nextMinutes));
      setError(null);
      return;
    }

    try {
      const result = await updateItem(
        item.id,
        JSON.stringify({ expectedDurationMinutes: nextMinutes } satisfies ItemPatch),
        item.revision
      );
      if ("conflict" in result && result.conflict) {
        setDraft(formatDurationMinutes(item.expectedDurationMinutes));
        return;
      }
      if ("ok" in result && result.ok) {
        trackItemPatchUndo(push, item.id, { expectedDurationMinutes: item.expectedDurationMinutes });
        setDraft(formatDurationMinutes(nextMinutes));
        setError(null);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not save duration");
      setDraft(formatDurationMinutes(item.expectedDurationMinutes));
    }
  }

  function commitDraft() {
    const trimmed = draft.trim();
    if (!trimmed) {
      void save(null);
      return;
    }

    const parsed = parseDurationMinutes(trimmed);
    if (parsed === null) {
      setError("Use minutes (e.g. 45), or formats like 30m, 1h, 1h 30m");
      return;
    }

    void save(parsed);
  }

  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs text-neutral-500" htmlFor={`task-duration-${item.id}`}>
        Expected duration
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-40 border border-neutral-700 bg-black px-3 py-1.5 text-sm outline-none focus:border-white"
          id={`task-duration-${item.id}`}
          placeholder="e.g. 30, 1h, 1h 30m"
          value={draft}
          onBlur={() => commitDraft()}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        {item.expectedDurationMinutes !== null ? (
          <button
            className="border border-neutral-700 px-2 py-1.5 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
            type="button"
            onClick={() => void save(null)}
          >
            Clear
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
      <p className="mt-1 text-xs text-neutral-600">Plain numbers are minutes (e.g. 45). Used for calendar placement later.</p>
    </div>
  );
}
