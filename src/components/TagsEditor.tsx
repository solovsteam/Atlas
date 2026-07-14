import { useState } from "react";
import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";

export function TagsEditor({
  item,
  updateItem
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const [tagInput, setTagInput] = useState("");

  async function patchItem(patch: ItemPatch) {
    return updateItem(item.id, JSON.stringify(patch), item.revision);
  }

  async function addTag() {
    const next = tagInput.trim().toLowerCase();
    if (!next || item.tags.includes(next)) {
      setTagInput("");
      return;
    }
    await patchItem({ tags: [...item.tags, next] });
    setTagInput("");
  }

  async function removeTag(tag: string) {
    await patchItem({ tags: item.tags.filter((entry) => entry !== tag) });
  }

  return (
    <div className="mb-6 rounded border border-neutral-800 p-4">
      <label className="block text-sm">
        <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Tags</span>
        <div className="mb-2 flex flex-wrap gap-2">
          {item.tags.length === 0 ? <span className="text-xs text-neutral-600">No tags yet.</span> : null}
          {item.tags.map((tag) => (
            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300" key={tag}>
              {tag}
              <button className="text-neutral-500 hover:text-white" type="button" onClick={() => void removeTag(tag)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
            placeholder="Add tag"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addTag();
              }
            }}
          />
          <button className="border border-neutral-600 px-3 py-2 text-xs hover:border-white" type="button" onClick={() => void addTag()}>
            Add
          </button>
        </div>
      </label>
    </div>
  );
}
