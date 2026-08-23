import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";
import { EditableSlotTime } from "./DateTimeTextInput";
import { trackItemPatchUndo, useUndo } from "../context/UndoContext";

export function TaskSchedulingEditor({
  item,
  updateItem
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const { push } = useUndo();

  async function save(patch: ItemPatch, before: ItemPatch) {
    const result = await updateItem(item.id, JSON.stringify(patch), item.revision);
    if ("ok" in result && result.ok) {
      trackItemPatchUndo(push, item.id, before);
    }
  }

  return (
    <div className="mb-4 space-y-2">
      <p className="text-xs text-neutral-500">Due and appointment</p>
      <EditableSlotTime
        iso={item.taskDueAt || null}
        label="Due"
        mode="datetime"
        onSave={(iso) => void save({ taskDueAt: iso || null }, { taskDueAt: item.taskDueAt || null })}
      />
      <EditableSlotTime
        iso={item.taskFixedStartsAt || null}
        label="Appointment start"
        mode="datetime"
        onSave={(iso) => void save({ taskFixedStartsAt: iso || null }, { taskFixedStartsAt: item.taskFixedStartsAt || null })}
      />
      <EditableSlotTime
        iso={item.taskFixedEndsAt || null}
        label="Appointment end"
        mode="datetime"
        onSave={(iso) => void save({ taskFixedEndsAt: iso || null }, { taskFixedEndsAt: item.taskFixedEndsAt || null })}
      />
    </div>
  );
}
