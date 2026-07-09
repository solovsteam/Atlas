import { Link, useMutation, useParams, useQuery } from "lakebed/client";
import { useMemo, useState } from "preact/hooks";
import type { Item } from "../../shared/item";
import {
  assignmentsForSlot,
  formatTimeRange,
  isArchivedSlot,
  slotKindLabel,
  toSlotPatchJson,
  type ScheduleSlot,
  type SlotAssignment
} from "../../shared/schedule";
import { ItemKindBadge } from "../components/ItemKindBadge";
import { EditableSlotTime } from "../components/DateTimeTextInput";

type UpdateResult = { ok: true } | { error: string };

export function TimeBoxPage() {
  const { slotId = "" } = useParams<{ slotId: string }>();
  const items = useQuery<Item[]>("items");
  const slots = useQuery<ScheduleSlot[]>("scheduleSlots");
  const assignments = useQuery<SlotAssignment[]>("slotAssignments");

  const updateSlot = useMutation<[id: string, patchJson: string], UpdateResult>("updateScheduleSlot");
  const archiveSlot = useMutation<[id: string], void>("archiveScheduleSlot");
  const deleteSlot = useMutation<[id: string], void>("deleteScheduleSlot");
  const assignItem = useMutation<[slotId: string, itemId: string], { ok: true } | { error: string }>("assignItemToSlot");
  const unassignItem = useMutation<[slotId: string, itemId: string], void>("unassignItemFromSlot");

  const [assignItemId, setAssignItemId] = useState("");
  const [error, setError] = useState("");

  const slot = useMemo(() => slots.find((entry) => entry.id === slotId) ?? null, [slots, slotId]);
  const slotAssignments = useMemo(
    () => (slot ? assignmentsForSlot(assignments, slot.id) : []),
    [assignments, slot]
  );
  const assignedItems = useMemo(
    () =>
      slotAssignments
        .map((entry) => items.find((item) => item.id === entry.itemId))
        .filter((item): item is Item => Boolean(item)),
    [slotAssignments, items]
  );
  const unassignedTasks = useMemo(
    () => items.filter((item) => item.isTask && !slotAssignments.some((entry) => entry.itemId === item.id)),
    [items, slotAssignments]
  );

  if (!slot) {
    return (
      <section>
        <p className="text-neutral-400">Time box not found.</p>
        <Link className="mt-4 inline-block text-sm text-neutral-300 hover:text-white" to="/calendar">
          Back to Calendar
        </Link>
      </section>
    );
  }

  async function onAssign(event: SubmitEvent) {
    event.preventDefault();
    if (!assignItemId) {
      return;
    }
    setError("");
    const result = await assignItem(slot.id, assignItemId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setAssignItemId("");
  }

  return (
    <section>
      <div className="mb-6 flex items-center gap-3">
        <Link className="text-sm text-neutral-400 hover:text-white" to="/calendar">
          ← Calendar
        </Link>
      </div>

      <div className="mb-6 rounded border border-neutral-800 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Time box</p>
        <h1 className="mb-2 text-3xl font-bold">{slot.label || (assignedItems.length === 0 ? "Free time" : "Scheduled block")}</h1>
        <p className="text-sm text-neutral-400">
          {slotKindLabel(slot.kind)} · {formatTimeRange(slot)}
          {isArchivedSlot(slot) ? " · archived" : ""}
        </p>
        <div className="mt-4 space-y-2 text-sm">
          {slot.startsAt ? (
            <EditableSlotTime
              iso={slot.startsAt}
              label="Starts"
              mode="datetime"
              onSave={async (iso) => {
                const result = await updateSlot(slot.id, toSlotPatchJson({ startsAt: iso || null }));
                if ("error" in result) {
                  setError(result.error);
                }
              }}
            />
          ) : null}
          {slot.endsAt ? (
            <EditableSlotTime
              iso={slot.endsAt}
              label={slot.kind === "due" ? "Due" : "Ends"}
              mode="datetime"
              onSave={async (iso) => {
                const result = await updateSlot(slot.id, toSlotPatchJson({ endsAt: iso || null }));
                if ("error" in result) {
                  setError(result.error);
                }
              }}
            />
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {isArchivedSlot(slot) ? (
            <button
              className="border border-neutral-700 px-3 py-1 text-xs hover:border-white"
              type="button"
              onClick={() => void updateSlot(slot.id, toSlotPatchJson({ slotStatus: "scheduled" }))}
            >
              Restore
            </button>
          ) : (
            <button className="border border-neutral-700 px-3 py-1 text-xs hover:border-white" type="button" onClick={() => void archiveSlot(slot.id)}>
              Archive
            </button>
          )}
          <button className="border border-red-800 px-3 py-1 text-xs text-red-300 hover:border-red-500" type="button" onClick={() => void deleteSlot(slot.id)}>
            Delete box
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </div>

      <div className="mb-6 rounded border border-neutral-800 p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Tasks in this box</p>
        {assignedItems.length === 0 ? (
          <p className="text-sm text-neutral-500">Free time — assign tasks when ready.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
            {assignedItems.map((item) => (
              <li className="flex items-center justify-between gap-3 py-3" key={item.id}>
                <Link className="min-w-0 flex-1 hover:text-white" to={`/item/${item.id}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{item.title}</span>
                    <ItemKindBadge item={item} />
                  </div>
                </Link>
                <button
                  className="shrink-0 text-xs text-neutral-500 hover:text-white"
                  type="button"
                  onClick={() => void unassignItem(slot.id, item.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="rounded border border-neutral-800 p-4" onSubmit={(event) => void onAssign(event)}>
        <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Assign task</p>
        <div className="flex gap-2">
          <select
            className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
            value={assignItemId}
            onChange={(event) => setAssignItemId((event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">Select task…</option>
            {unassignedTasks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <button className="shrink-0 border border-white px-4 py-2 text-sm font-medium" type="submit">
            Assign
          </button>
        </div>
      </form>
    </section>
  );
}
