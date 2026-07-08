import { useEffect, useState } from "preact/hooks";
import type { Item, ItemPatch, UpdateItemResult } from "../../shared/item";
import { parseStartableWindow, startableWindowLabels } from "../../shared/startable";

export function RelevanceMetadataEditor({
  item,
  updateItem
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const [tagInput, setTagInput] = useState("");
  const [location, setLocation] = useState(item.location);
  const windowLabels = startableWindowLabels(item.startableWindow);

  useEffect(() => {
    setLocation(item.location);
  }, [item.id, item.location, item.revision]);

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
      <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Relevance</p>

      <label className="mb-4 block text-sm">
        <span className="mb-1 block text-neutral-400">Tags</span>
        <div className="mb-2 flex flex-wrap gap-2">
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
            onInput={(event) => setTagInput((event.currentTarget as HTMLInputElement).value)}
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

      <label className="mb-4 block text-sm">
        <span className="mb-1 block text-neutral-400">Location</span>
        <input
          className="w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
          placeholder="e.g. home, office"
          value={location}
          onBlur={() => {
            if (location !== item.location) {
              void patchItem({ location });
            }
          }}
          onInput={(event) => setLocation((event.currentTarget as HTMLInputElement).value)}
        />
      </label>

      <div className="mb-4">
        <span className="mb-1 block text-sm text-neutral-400">Startable window</span>
        <div className="flex items-center gap-2">
          <input
            className="w-24 border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
            defaultValue={windowLabels.start}
            key={`start-${item.id}-${item.revision}`}
            placeholder="09:00"
            onBlur={(event) => {
              const start = (event.currentTarget as HTMLInputElement).value;
              const endInput = event.currentTarget.parentElement?.querySelector("[data-end-window]") as HTMLInputElement | null;
              const end = endInput?.value ?? windowLabels.end;
              if (!start.trim() && !end.trim()) {
                if (item.startableWindow) {
                  void patchItem({ startableWindow: null });
                }
                return;
              }
              const parsed = parseStartableWindow(start, end);
              if (parsed) {
                void patchItem({ startableWindow: parsed });
              }
            }}
          />
          <span className="text-neutral-500">–</span>
          <input
            className="w-24 border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
            data-end-window
            defaultValue={windowLabels.end}
            key={`end-${item.id}-${item.revision}`}
            placeholder="17:00"
            onBlur={(event) => {
              const end = (event.currentTarget as HTMLInputElement).value;
              const startInput = event.currentTarget.parentElement?.querySelector("input:not([data-end-window])") as HTMLInputElement | null;
              const start = startInput?.value ?? windowLabels.start;
              if (!start.trim() && !end.trim()) {
                if (item.startableWindow) {
                  void patchItem({ startableWindow: null });
                }
                return;
              }
              const parsed = parseStartableWindow(start, end);
              if (parsed) {
                void patchItem({ startableWindow: parsed });
              }
            }}
          />
        </div>
        <p className="mt-1 text-xs text-neutral-500">HH:MM – HH:MM. Items rank higher inside this daily window.</p>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-neutral-400">Manual relevance ({item.manualRelevance})</span>
        <input
          className="w-full"
          max={100}
          min={-100}
          step={1}
          type="range"
          value={item.manualRelevance}
          onChange={(event) => {
            void patchItem({ manualRelevance: Number((event.currentTarget as HTMLInputElement).value) });
          }}
        />
        <p className="mt-1 text-xs text-neutral-500">Higher values float up in Now when other signals tie.</p>
      </label>
    </div>
  );
}
