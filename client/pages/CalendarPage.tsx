import { Link, useMutation, useQuery } from "lakebed/client";
import { useMemo, useState } from "preact/hooks";
import type { Item } from "../../shared/item";
import {
  SLOT_KINDS,
  addDays,
  formatDayLabel,
  formatTimeRange,
  isArchivedSlot,
  slotKindLabel,
  slotOverlapsRange,
  slotsInRange,
  startOfWeek,
  type ScheduleSlot,
  type SlotKind
} from "../../shared/schedule";
import {
  DATE_PLACEHOLDER,
  DATE_TIME_PLACEHOLDER,
  isoFromEuropeanDate,
  isoFromEuropeanDateTime,
  validateEuropeanDate,
  validateEuropeanDateTime
} from "../../shared/locale";
import { DateTimeTextInput } from "../components/DateTimeTextInput";

type CreateResult = { id: string } | { error: string };

export function CalendarPage() {
  const items = useQuery<Item[]>("items");
  const slots = useQuery<ScheduleSlot[]>("scheduleSlots");
  const createSlot = useMutation<[itemId: string, kind: string, startsAt?: string, endsAt?: string], CreateResult>(
    "createScheduleSlot"
  );

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [itemId, setItemId] = useState("");
  const [kind, setKind] = useState<SlotKind>("fixed");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");

  const weekEnd = addDays(weekStart, 7);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekSlots = useMemo(() => slotsInRange(slots, weekStart, weekEnd), [slots, weekStart, weekEnd]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const weekLabel = `${formatDayLabel(weekStart)} – ${formatDayLabel(addDays(weekStart, 6))}`;

  function goToToday() {
    setWeekStart(startOfWeek(new Date()));
  }

  async function onCreate(event: SubmitEvent) {
    event.preventDefault();
    if (!itemId) {
      setError("Choose an item");
      return;
    }

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

    setError("");
    const result = await createSlot(
      itemId,
      kind,
      kind === "due" ? "" : kind === "allDay" ? isoFromEuropeanDate(startsAt) : isoFromEuropeanDateTime(startsAt),
      kind === "allDay" ? isoFromEuropeanDate(startsAt, true) : isoFromEuropeanDateTime(endsAt)
    );
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setShowForm(false);
    setStartsAt("");
    setEndsAt("");
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Calendar</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Week view. Dates use {DATE_TIME_PLACEHOLDER}. Archived slots appear grayed out.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-white hover:text-white"
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            ← Prev
          </button>
          <button
            className="border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-white hover:text-white"
            type="button"
            onClick={goToToday}
          >
            Today
          </button>
          <button
            className="border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-white hover:text-white"
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            Next →
          </button>
          <button
            className="border border-white px-3 py-1.5 text-sm font-medium"
            type="button"
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? "Cancel" : "Add slot"}
          </button>
        </div>
      </div>

      <p className="mb-6 text-sm text-neutral-500">{weekLabel}</p>

      {showForm ? (
        <form className="mb-8 rounded border border-neutral-800 p-4" onSubmit={(event) => void onCreate(event)}>
          <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Quick add</p>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-neutral-400">Item</span>
            <select
              className="w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
              value={itemId}
              onChange={(event) => setItemId((event.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">Select item…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

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
          <button className="border border-white px-4 py-2 text-sm font-medium" type="submit">
            Create slot
          </button>
        </form>
      ) : null}

      <div className="grid gap-3 md:grid-cols-7">
        {weekDays.map((day) => {
          const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
          const dayEnd = addDays(dayStart, 1);
          const daySlots = weekSlots.filter((slot) => slotOverlapsRange(slot, dayStart, dayEnd));

          return (
            <div className="min-h-40 rounded border border-neutral-800 p-3" key={day.toISOString()}>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">{formatDayLabel(day)}</p>
              {daySlots.length === 0 ? (
                <p className="text-xs text-neutral-600">—</p>
              ) : (
                <ul className="space-y-2">
                  {daySlots.map((slot) => {
                    const item = itemsById.get(slot.itemId);
                    const archived = isArchivedSlot(slot);
                    return (
                      <li key={slot.id}>
                        <Link
                          className={
                            archived
                              ? "block rounded border border-neutral-800 bg-neutral-950/60 px-2 py-1.5 text-xs opacity-60 hover:opacity-80"
                              : "block rounded border border-neutral-700 px-2 py-1.5 text-xs hover:border-white"
                          }
                          to={`/item/${slot.itemId}`}
                        >
                          <span className="font-medium">{item?.title ?? "Untitled"}</span>
                          <span className="mt-0.5 block text-neutral-500">{formatTimeRange(slot)}</span>
                          {archived ? <span className="mt-0.5 block text-neutral-600">archived</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {weekSlots.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">No slots this week. Add one from an item’s Schedule tab or use Quick add.</p>
      ) : null}
    </section>
  );
}
