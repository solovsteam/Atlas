import type { Item, ItemPatch, UpdateItemResult } from "../../shared/item";
import { useAutosaveItem } from "../hooks/useAutosaveItem";
import { GeneratorBadge } from "./GeneratorBadge";
import { TaskStatusButtons } from "./TaskStatusButtons";

export function ItemEditor({
  item,
  generator,
  updateItem
}: {
  item: Item;
  generator: Item | null;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const autosave = useAutosaveItem(item, updateItem);

  async function patchItem(patch: ItemPatch) {
    await updateItem(item.id, JSON.stringify(patch), autosave.revision);
  }

  return (
    <section>
      <GeneratorBadge generator={generator} item={item} />

      {autosave.conflict ? (
        <div className="mb-4 rounded border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
          <p className="mb-2">This item was edited elsewhere.</p>
          <div className="flex gap-2">
            <button className="rounded border border-amber-600 px-2 py-1 hover:bg-amber-900" type="button" onClick={() => autosave.resolveConflict("mine")}>
              Keep mine
            </button>
            <button className="rounded border border-amber-600 px-2 py-1 hover:bg-amber-900" type="button" onClick={() => autosave.resolveConflict("theirs")}>
              Take server version
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-6 rounded border border-neutral-800 p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Capabilities</p>
        <div className="mb-4 flex flex-wrap gap-2">
          <CapabilityToggle
            active={item.isTask}
            label="Task"
            onToggle={() => void patchItem({ isTask: !item.isTask })}
          />
          <CapabilityToggle
            active={item.isDocumentation}
            label="Documentation"
            onToggle={() => void patchItem({ isDocumentation: !item.isDocumentation })}
          />
        </div>

        {item.isTask ? (
          <div className="mb-4">
            <p className="mb-2 text-xs text-neutral-500">Task status</p>
            <TaskStatusButtons
              status={item.taskStatus ?? "active"}
              onChange={(status) => void patchItem({ taskStatus: status })}
            />
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Plain note — no task status until you enable Task.</p>
        )}

        {item.isDocumentation ? (
          <div className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-400">
            Documentation is enabled. Schema editing and state tracking will be expanded in a later phase.
          </div>
        ) : null}

        <p className="mt-3 h-4 text-xs leading-4 text-neutral-500" aria-live="polite">
          {autosave.saving ? "Saving…" : ""}
        </p>
      </div>

      <input
        className="mb-4 w-full border border-neutral-700 bg-black px-3 py-2 text-2xl font-semibold outline-none focus:border-white"
        value={autosave.draft.title}
        onInput={(event) => autosave.updateTitle((event.currentTarget as HTMLInputElement).value)}
      />

      <textarea
        className="min-h-64 w-full border border-neutral-700 bg-black px-3 py-2 text-sm leading-6 outline-none focus:border-white"
        value={autosave.draft.body}
        onInput={(event) => autosave.updateBody((event.currentTarget as HTMLTextAreaElement).value)}
      />

      {item.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {item.generatedFromId && generator ? (
        <p className="mt-4 text-sm text-neutral-500">
          Generated from: {generator.title}
        </p>
      ) : null}
    </section>
  );
}

function CapabilityToggle({ active, label, onToggle }: { active: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      className={
        active
          ? "rounded border border-white bg-white px-3 py-1.5 text-xs font-medium text-black"
          : "rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
      }
      type="button"
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
