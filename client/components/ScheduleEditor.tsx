import { Link, useMutation } from "lakebed/client";
import { useMemo, useState } from "preact/hooks";
import type { Item, ItemPatch, UpdateItemResult } from "../../shared/item";
import {
  DATE_PLACEHOLDER,
  DATE_TIME_PLACEHOLDER,
  isoFromEuropeanDate,
  isoFromEuropeanDateTime,
  validateEuropeanDate,
  validateEuropeanDateTime
} from "../../shared/locale";
import { parseStartableWindow, startableWindowLabels } from "../../shared/startable";
import {
  SLOT_KINDS,
  formatTimeRange,
  isArchivedSlot,
  slotKindLabel,
  slotsForItem,
  type ScheduleSlot,
  type SlotAssignment,
  type SlotKind
} from "../../shared/schedule";
import { DateTimeTextInput } from "./DateTimeTextInput";

type CreateResult = { id: string } | { error: string };

export function ScheduleEditor({
  item,
  slots,
  assignments,
  updateItem
}: {
  item: Item;
  slots: ScheduleSlot[];
  assignments: SlotAssignment[];
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const placements = useMemo(() => slotsForItem(slots, assignments, item.id), [slots, assignments, item.id]);
  const createSlot = useMutation<[itemId: string, kind: string, startsAt?: string, endsAt?: string], CreateResult>(
    "createScheduleSlot"
  );

  const [kind, setKind] = useState<SlotKind>("fixed");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const windowLabels = startableWindowLabels(item.startableWindow);
  const [windowStart, setWindowStart] = useState(windowLabels.start);
  const [windowEnd, setWindowEnd] = useState(windowLabels.end);
  const [location, setLocation] = useState(item.location);

  async function patchItem(patch: ItemPatch) {
    await updateItem(item.id, JSON.stringify(patch), item.revision);
  }

  async function saveConstraints() {
    const startableWindow = parseStartableWindow(windowStart, windowEnd);
    await patchItem({ location: location.trim(), startableWindow });
  }

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
        Scheduling constraints describe when and where a task <em>can</em> be placed. Calendar time boxes are separate
        placements. Dates use {DATE_TIME_PLACEHOLDER} or {DATE_PLACEHOLDER}.
      </p>

      <div className="mb-8 rounded border border-neutral-800 p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Scheduling constraints</p>
        <p className="mb-4 text-xs text-neutral-500">Used by a future auto-scheduler — not the same as calendar placement.</p>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-neutral-400">Location</span>
          <input
            className="w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
            value={location}
            onBlur={() => void saveConstraints()}
            onInput={(event) => setLocation((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-neutral-400">Startable from</span>
            <input
              className="w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
              placeholder="09:00"
              value={windowStart}
              onBlur={() => void saveConstraints()}
              onInput={(event) => setWindowStart((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-neutral-400">Startable until</span>
            <input
              className="w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
              placeholder="17:00"
              value={windowEnd}
              onBlur={() => void saveConstraints()}
              onInput={(event) => setWindowEnd((event.currentTarget as HTMLInputElement).value)}
            />
          </label>
        </div>
      </div>

      <div className="mb-8 rounded border border-neutral-800 p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Placements</p>
        {placements.length === 0 ? (
          <p className="mb-4 text-sm text-neutral-500">Not placed on the calendar yet.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {placements.map((slot) => (
              <li key={slot.id}>
                <Link className="block rounded border border-neutral-700 px-3 py-2 text-sm hover:border-white" to={`/calendar/box/${slot.id}`}>
                  <span className="font-medium">{slot.label || slotKindLabel(slot.kind)}</span>
                  <span className="mt-0.5 block text-xs text-neutral-500">{formatTimeRange(slot)}</span>
                  {isArchivedSlot(slot) ? <span className="mt-0.5 block text-xs text-neutral-600">archived</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={(event) => void onCreate(event)}>
          <p className="mb-3 text-xs text-neutral-500">Add placement (creates time box + assigns this item)</p>
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
            {saving ? "Adding…" : "Add placement"}
          </button>
        </form>
      </div>
    </section>
  );
}
