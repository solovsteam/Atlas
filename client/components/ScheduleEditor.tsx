import { useMutation } from "lakebed/client";
import { useMemo, useState } from "preact/hooks";
import type { Item } from "../../shared/item";
import {
  DATE_PLACEHOLDER,
  DATE_TIME_PLACEHOLDER,
  isoFromEuropeanDate,
  isoFromEuropeanDateTime,
  validateEuropeanDate,
  validateEuropeanDateTime
} from "../../shared/locale";
import {
  SLOT_KINDS,
  formatTimeRange,
  isArchivedSlot,
  slotKindLabel,
  slotsForItem,
  toSlotPatchJson,
  type ScheduleSlot,
  type SlotKind
} from "../../shared/schedule";
import { DateTimeTextInput, EditableSlotTime } from "./DateTimeTextInput";

type CreateResult = { id: string } | { error: string };
type UpdateResult = { ok: true } | { error: string };

export function ScheduleEditor({ item, slots }: { item: Item; slots: ScheduleSlot[] }) {
  const itemSlots = useMemo(() => slotsForItem(slots, item.id), [slots, item.id]);
  const createSlot = useMutation<[itemId: string, kind: string, startsAt?: string, endsAt?: string], CreateResult>(
    "createScheduleSlot"
  );
  const updateSlot = useMutation<[id: string, patchJson: string], UpdateResult>("updateScheduleSlot");
  const archiveSlot = useMutation<[id: string], void>("archiveScheduleSlot");
  const deleteSlot = useMutation<[id: string], void>("deleteScheduleSlot");

  const [kind, setKind] = useState<SlotKind>("fixed");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onCreate(event: SubmitEvent) {
    event.preventDefault();
    setError("");

    if (kind === "allDay") {
      const dayError = validateEuropeanDate(startsAt);
      if (dayError) {
        setError(dayError);
        return;
      }
    } else {
      if (kind !== "due") {
        const startError = validateEuropeanDateTime(startsAt);
        if (startError) {
          setError(startError);
          return;
        }
      }
      const endError = validateEuropeanDateTime(endsAt);
      if (endError) {
        setError(endError);
        return;
      }
    }

    setSaving(true);
    try {
      const result = await createSlot(
        item.id,
        kind,
        kind === "due" ? "" : kind === "allDay" ? isoFromEuropeanDate(startsAt) : isoFromEuropeanDateTime(startsAt),
        kind === "allDay" ? isoFromEuropeanDate(startsAt, true) : isoFromEuropeanDateTime(endsAt)
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setStartsAt("");
      setEndsAt("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <p className="mb-6 text-sm text-neutral-400">
        Enter dates as {DATE_TIME_PLACEHOLDER} or {DATE_PLACEHOLDER}. Archived slots stay visible but grayed out.
      </p>

      <form className="mb-8 rounded border border-neutral-800 p-4" onSubmit={(event) => void onCreate(event)}>
        <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Add schedule slot</p>

        <div className="mb-4 flex flex-wrap gap-2">
          {SLOT_KINDS.map((entry) => (
            <button
              className={
                kind === entry
                  ? "rounded border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                  : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-500"
              }
              key={entry}
              type="button"
              onClick={() => setKind(entry)}
            >
              {slotKindLabel(entry)}
            </button>
          ))}
        </div>

        {kind !== "due" && kind !== "allDay" ? (
          <div className="mb-3">
            <span className="mb-1 block text-sm text-neutral-400">Starts</span>
            <DateTimeTextInput mode="datetime" value={startsAt} onChange={setStartsAt} />
          </div>
        ) : null}

        {kind === "allDay" ? (
          <div className="mb-3">
            <span className="mb-1 block text-sm text-neutral-400">Day</span>
            <DateTimeTextInput mode="date" value={startsAt} onChange={setStartsAt} />
          </div>
        ) : (
          <div className="mb-3">
            <span className="mb-1 block text-sm text-neutral-400">{kind === "due" ? "Due" : "Ends"}</span>
            <DateTimeTextInput mode="datetime" value={endsAt} onChange={setEndsAt} />
          </div>
        )}

        {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}

        <button className="border border-white px-4 py-2 text-sm font-medium" disabled={saving} type="submit">
          {saving ? "Adding…" : "Add slot"}
        </button>
      </form>

      {itemSlots.length === 0 ? (
        <p className="text-sm text-neutral-500">No schedule slots yet.</p>
      ) : (
        <ul className="space-y-3">
          {itemSlots.map((slot) => (
            <SlotRow
              archiveSlot={(id) => archiveSlot(id)}
              deleteSlot={(id) => deleteSlot(id)}
              key={slot.id}
              slot={slot}
              updateSlot={(id, patchJson) => updateSlot(id, patchJson)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SlotRow({
  slot,
  updateSlot,
  archiveSlot,
  deleteSlot
}: {
  slot: ScheduleSlot;
  updateSlot: (id: string, patchJson: string) => Promise<UpdateResult>;
  archiveSlot: (id: string) => Promise<void>;
  deleteSlot: (id: string) => Promise<void>;
}) {
  const archived = isArchivedSlot(slot);

  async function restore() {
    await updateSlot(slot.id, toSlotPatchJson({ slotStatus: "scheduled" }));
  }

  return (
    <li
      className={
        archived
          ? "rounded border border-neutral-800 bg-neutral-950/60 px-4 py-3 opacity-60"
          : "rounded border border-neutral-800 px-4 py-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{slotKindLabel(slot.kind)}</p>
          <p className="mt-1 text-sm text-neutral-400">{formatTimeRange(slot)}</p>
          {archived ? <p className="mt-1 text-xs text-neutral-500">Archived</p> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {archived ? (
            <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={() => void restore()}>
              Restore
            </button>
          ) : (
            <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={() => void archiveSlot(slot.id)}>
              Archive
            </button>
          )}
          <button className="text-xs text-red-400 hover:text-red-300" type="button" onClick={() => void deleteSlot(slot.id)}>
            Delete
          </button>
        </div>
      </div>

      {!archived && slot.kind !== "allDay" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {slot.kind !== "due" ? (
            <EditableSlotTime
              iso={slot.startsAt}
              label="Starts"
              mode="datetime"
              onSave={(iso) => void updateSlot(slot.id, toSlotPatchJson({ startsAt: iso || null }))}
            />
          ) : null}
          <EditableSlotTime
            iso={slot.endsAt}
            label={slot.kind === "due" ? "Due" : "Ends"}
            mode="datetime"
            onSave={(iso) => void updateSlot(slot.id, toSlotPatchJson({ endsAt: iso || null }))}
          />
        </div>
      ) : null}
    </li>
  );
}
