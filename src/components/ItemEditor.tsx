import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";
import { EXTENDED_SCHEMA_MESSAGE } from "@shared/item";
import { useAutosaveItem } from "../hooks/useAutosaveItem";
import { trackItemPatchUndo, trackTaskStatusUndo, useUndo } from "../context/UndoContext";
import { useAtlasData } from "../context/AtlasDataContext";
import { GenerationEditor } from "./GenerationEditor";
import { IntervalEditor } from "./IntervalEditor";
import { TagsEditor } from "./TagsEditor";
import { TaskStatusButtons } from "./TaskStatusButtons";

export function ItemEditor({
  item,
  occurrences,
  updateItem
}: {
  item: Item;
  occurrences: Item[];
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const { push } = useUndo();
  const { extendedSchema } = useAtlasData();
  const autosave = useAutosaveItem(item, updateItem, (before) => {
    trackItemPatchUndo(push, item.id, before);
  });

  async function patchItem(patch: ItemPatch) {
    const before: ItemPatch = {};
    if (patch.isTask !== undefined) {
      before.isTask = item.isTask;
    }
    if (patch.taskStatus !== undefined) {
      before.taskStatus = item.taskStatus;
    }
    if (patch.isInterval !== undefined) {
      before.isInterval = item.isInterval;
      before.intervalKind = item.intervalKind;
      before.intervalStartsAt = item.intervalStartsAt;
      before.intervalEndsAt = item.intervalEndsAt;
      before.intervalStatus = item.intervalStatus;
    }
    if (patch.isGenerator !== undefined) {
      before.isGenerator = item.isGenerator;
      before.recurrenceRule = item.recurrenceRule;
    }

    const result = await updateItem(item.id, JSON.stringify(patch), item.revision);
    if ("conflict" in result && result.conflict) {
      return;
    }
    if ("ok" in result && result.ok) {
      if (patch.taskStatus !== undefined) {
        trackTaskStatusUndo(push, item);
      } else if (Object.keys(before).length > 0) {
        trackItemPatchUndo(push, item.id, before);
      }
    }
  }

  async function patchItemSafe(patch: ItemPatch) {
    try {
      await patchItem(patch);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not save changes");
    }
  }

  return (
    <section>
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
        {!extendedSchema ? (
          <p className="mb-4 text-sm text-amber-200/90">{EXTENDED_SCHEMA_MESSAGE}</p>
        ) : null}
        <div className="mb-4 flex flex-wrap gap-2">
          <CapabilityToggle active={item.isTask} label="Task" onToggle={() => void patchItemSafe({ isTask: !item.isTask })} />
          <CapabilityToggle
            active={item.isInterval}
            label="Interval"
            disabled={!extendedSchema}
            onToggle={() =>
              void patchItemSafe(
                item.isInterval
                  ? { isInterval: false }
                  : {
                      isInterval: true,
                      ...(item.intervalKind ? {} : { intervalKind: "fixed" }),
                      ...(item.intervalStatus ? {} : { intervalStatus: "scheduled" })
                    }
              )
            }
          />
          {!item.generatedFromId ? (
            <CapabilityToggle
              active={item.isGenerator}
              label="Generator"
              disabled={!extendedSchema}
              onToggle={() => void patchItemSafe({ isGenerator: !item.isGenerator })}
            />
          ) : null}
        </div>

        {item.isTask ? (
          <div className="mb-4">
            <p className="mb-2 text-xs text-neutral-500">Task status</p>
            <TaskStatusButtons status={item.taskStatus ?? "active"} onChange={(status) => void patchItemSafe({ taskStatus: status })} />
          </div>
        ) : (
          <p className="mb-4 text-sm text-neutral-500">Plain note — no task status until you enable Task.</p>
        )}

        <p className="mt-3 h-4 text-xs leading-4 text-neutral-500" aria-live="polite">
          {autosave.saving ? "Saving…" : ""}
        </p>
      </div>

      {item.isInterval ? <IntervalEditor item={item} updateItem={updateItem} /> : null}
      {item.isGenerator || item.generatedFromId ? (
        <GenerationEditor item={item} occurrences={occurrences} updateItem={updateItem} />
      ) : null}

      <TagsEditor item={item} updateItem={updateItem} />

      <input
        className="mb-4 w-full border border-neutral-700 bg-black px-3 py-2 text-2xl font-semibold outline-none focus:border-white"
        value={autosave.draft.title}
        onChange={(event) => autosave.updateTitle(event.target.value)}
      />

      <label className="mb-4 block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Notes</span>
        <textarea
          className="min-h-64 w-full border border-neutral-700 bg-black px-3 py-2 text-base leading-6 outline-none focus:border-white"
          value={autosave.draft.body}
          onChange={(event) => autosave.updateBody(event.target.value)}
        />
      </label>
    </section>
  );
}

function CapabilityToggle({
  active,
  label,
  disabled = false,
  onToggle
}: {
  active: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={
        active
          ? "rounded border border-white bg-white px-3 py-1.5 text-xs font-medium text-black"
          : "rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-700"
      }
      disabled={disabled}
      type="button"
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
