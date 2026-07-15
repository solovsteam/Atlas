import { useMemo } from "react";
import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";
import {
  calendarIntervalFromItem,
  formatTimeRange,
  isArchivedSlot,
  SLOT_KINDS,
  slotKindLabel,
  type SlotKind
} from "@shared/schedule";
import { EditableSlotTime } from "./DateTimeTextInput";

export function IntervalEditor({
  item,
  updateItem
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const slot = useMemo(() => calendarIntervalFromItem(item), [item]);

  async function patchItem(patch: ItemPatch) {
    await updateItem(item.id, JSON.stringify(patch), item.revision);
  }

  if (!slot) {
    return null;
  }

  return (
    <div className="mb-6 rounded border border-neutral-800 p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Interval</p>
      <p className="mb-4 text-sm text-neutral-400">
        {slotKindLabel(slot.kind)} · {formatTimeRange(slot)}
        {isArchivedSlot(slot) ? " · archived" : ""}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {SLOT_KINDS.map((kind) => (
          <button
            className={
              slot.kind === kind
                ? "rounded border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
            }
            key={kind}
            type="button"
            onClick={() => void patchItem({ intervalKind: kind as SlotKind })}
          >
            {slotKindLabel(kind)}
          </button>
        ))}
      </div>

      <div className="space-y-2 text-sm">
        {slot.kind !== "due" ? (
          <EditableSlotTime
            iso={slot.startsAt}
            label={slot.kind === "allDay" ? "Date" : "Starts"}
            mode={slot.kind === "allDay" ? "date" : "datetime"}
            onSave={(iso) => void patchItem({ intervalStartsAt: iso || null })}
          />
        ) : null}
        {slot.kind !== "allDay" ? (
          <EditableSlotTime
            iso={slot.endsAt}
            label={slot.kind === "due" ? "Due" : "Ends"}
            mode="datetime"
            onSave={(iso) => void patchItem({ intervalEndsAt: iso || null })}
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isArchivedSlot(slot) ? (
          <button
            className="border border-neutral-700 px-3 py-1 text-xs hover:border-white"
            type="button"
            onClick={() => void patchItem({ intervalStatus: "scheduled" })}
          >
            Restore
          </button>
        ) : (
          <button
            className="border border-neutral-700 px-3 py-1 text-xs hover:border-white"
            type="button"
            onClick={() => void patchItem({ intervalStatus: "archived" })}
          >
            Archive
          </button>
        )}
      </div>
    </div>
  );
}
