import { useEffect, useState } from "react";
import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";
import { trackItemPatchUndo, useUndo } from "../../context/UndoContext";

export function ImportanceSlider({
  item,
  updateItem
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const { push } = useUndo();
  const [value, setValue] = useState(item.manualRelevance);

  useEffect(() => {
    setValue(item.manualRelevance);
  }, [item.id, item.manualRelevance]);

  async function commit(next: number) {
    if (next === item.manualRelevance) {
      return;
    }
    try {
      const result = await updateItem(
        item.id,
        JSON.stringify({ manualRelevance: next } satisfies ItemPatch),
        item.revision
      );
      if ("ok" in result && result.ok) {
        trackItemPatchUndo(push, item.id, { manualRelevance: item.manualRelevance });
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not save importance");
      setValue(item.manualRelevance);
    }
  }

  return (
    <label
      className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-wide text-neutral-500"
      title="Importance"
    >
      <span className="w-8">Imp</span>
      <input
        className="h-1 w-20 cursor-pointer accent-white"
        max={10}
        min={0}
        step={1}
        type="range"
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        onMouseUp={() => void commit(value)}
        onTouchEnd={() => void commit(value)}
      />
      <span className="w-4 text-neutral-400">{value}</span>
    </label>
  );
}
