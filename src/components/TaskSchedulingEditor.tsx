import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";
import { isOverdue, taskConstraint } from "@shared/scheduling";
import { trackItemPatchUndo, useUndo } from "../context/UndoContext";
import { EditableSlotTime } from "./DateTimeTextInput";

export function TaskSchedulingEditor({
  item,
  updateItem
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const { push } = useUndo();
  const constraint = taskConstraint(item);
  const overdue = isOverdue(item, new Date());

  async function save(patch: ItemPatch, before: ItemPatch) {
    try {
      const result = await updateItem(item.id, JSON.stringify(patch), item.revision);
      if ("conflict" in result && result.conflict) {
        return;
      }
      if ("ok" in result && result.ok) {
        trackItemPatchUndo(push, item.id, before);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not save scheduling");
    }
  }

  return (
    <div className="mb-4 space-y-4">
      <div>
        <p className="mb-2 text-xs text-neutral-500">Due date</p>
        <EditableSlotTime
          iso={item.dueAt}
          key={`${item.id}-due-${item.dueAt ?? ""}`}
          label="Due"
          mode="datetime"
          onSave={(iso) =>
            void save(
              { dueAt: iso || null },
              { dueAt: item.dueAt }
            )
          }
        />
        {overdue ? <p className="mt-1 text-xs text-amber-400">Overdue</p> : null}
        <p className="mt-1 text-xs text-neutral-600">Optional deadline — work can be scheduled any time before this.</p>
      </div>

      <div>
        <p className="mb-2 text-xs text-neutral-500">Appointment</p>
        <div className="space-y-2">
          <EditableSlotTime
            iso={item.fixedStartsAt}
            key={`${item.id}-fixed-start-${item.fixedStartsAt ?? ""}`}
            label="Starts"
            mode="datetime"
            onSave={(iso) =>
              void save(
                { fixedStartsAt: iso || null },
                { fixedStartsAt: item.fixedStartsAt }
              )
            }
          />
          <EditableSlotTime
            iso={item.fixedEndsAt}
            key={`${item.id}-fixed-end-${item.fixedEndsAt ?? ""}`}
            label="Ends"
            mode="datetime"
            onSave={(iso) =>
              void save(
                { fixedEndsAt: iso || null },
                { fixedEndsAt: item.fixedEndsAt }
              )
            }
          />
        </div>
        {constraint?.mode === "fixed" ? (
          <p className="mt-1 text-xs text-neutral-600">Fixed appointment — the scheduler will not move this task.</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-600">Optional fixed time block (e.g. a meeting).</p>
        )}
      </div>
    </div>
  );
}
