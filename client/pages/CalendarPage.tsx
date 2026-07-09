import { useMutation, useQuery } from "lakebed/client";
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
  slotKindLabel,
  startOfWeek,
  type ScheduleSlot,
  type SlotAssignment,
  type SlotKind
} from "../../shared/schedule";
import { DateTimeTextInput } from "../components/DateTimeTextInput";
import { CalendarDayView } from "./calendar/CalendarDayView";
import { CalendarMonthView } from "./calendar/CalendarMonthView";
import { CalendarWeekView } from "./calendar/CalendarWeekView";
import {
  anchorForToday,
  headerLabel,
  navigateAnchor,
  nextLabel,
  prevLabel,
  type CalendarView
} from "./calendar/calendarState";

type CreateResult = { id: string } | { error: string };

export function CalendarPage() {
  const items = useQuery<Item[]>("items");
  const slots = useQuery<ScheduleSlot[]>("scheduleSlots");
  const assignments = useQuery<SlotAssignment[]>("slotAssignments");
  const createTimeBox = useMutation<[kind: string, startsAt?: string, endsAt?: string, label?: string], CreateResult>(
    "createTimeBox"
  );

  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<SlotKind>("fixed");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const monthStart = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1), [anchor]);
  const weekStart = view === "week" ? anchor : startOfWeek(anchor);

  function goToToday() {
    setAnchor(anchorForToday(view));
  }

  function onSelectDay(day: Date) {
    setAnchor(day);
    setView("day");
  }

  async function onCreate(event: SubmitEvent) {
    event.preventDefault();

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
    const result = await createTimeBox(
      kind,
      kind === "due" ? "" : kind === "allDay" ? isoFromEuropeanDate(startsAt) : isoFromEuropeanDateTime(startsAt),
      kind === "allDay" ? isoFromEuropeanDate(startsAt, true) : isoFromEuropeanDateTime(endsAt),
      label
    );
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setShowForm(false);
    setStartsAt("");
    setEndsAt("");
    setLabel("");
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Calendar</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Day, week, and month views. Time boxes are separate from tasks. Dates use {DATE_TIME_PLACEHOLDER}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-neutral-700">
            {(["day", "week", "month"] as CalendarView[]).map((entry) => (
              <button
                className={
                  view === entry
                    ? "px-3 py-1.5 text-sm font-medium text-black bg-white"
                    : "px-3 py-1.5 text-sm text-neutral-400 hover:text-white"
                }
                key={entry}
                type="button"
                onClick={() => {
                  setView(entry);
                  setAnchor(anchorForToday(entry));
                }}
              >
                {entry[0]!.toUpperCase() + entry.slice(1)}
              </button>
            ))}
          </div>
          <button
            className="border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-white hover:text-white"
            type="button"
            onClick={() => setAnchor(navigateAnchor(view, anchor, -1))}
          >
            {prevLabel(view)}
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
            onClick={() => setAnchor(navigateAnchor(view, anchor, 1))}
          >
            {nextLabel(view)}
          </button>
          <button
            className="border border-white px-3 py-1.5 text-sm font-medium"
            type="button"
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? "Cancel" : "Add time box"}
          </button>
        </div>
      </div>

      <p className="mb-6 text-sm text-neutral-500">{headerLabel(view, anchor)}</p>

      {showForm ? (
        <form className="mb-8 rounded border border-neutral-800 p-4" onSubmit={(event) => void onCreate(event)}>
          <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">New time box (free time)</p>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-neutral-400">Label (optional)</span>
            <input
              className="w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
              placeholder="e.g. Free afternoon"
              value={label}
              onInput={(event) => setLabel((event.currentTarget as HTMLInputElement).value)}
            />
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
              <span className="mb-1 block text-sm text-neutral-400">Day ({DATE_PLACEHOLDER})</span>
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
            Create time box
          </button>
        </form>
      ) : null}

      {view === "day" ? (
        <CalendarDayView assignments={assignments} day={anchor} itemsById={itemsById} slots={slots} />
      ) : null}
      {view === "week" ? (
        <CalendarWeekView assignments={assignments} itemsById={itemsById} slots={slots} weekStart={weekStart} />
      ) : null}
      {view === "month" ? (
        <CalendarMonthView
          assignments={assignments}
          monthStart={monthStart}
          slots={slots}
          onSelectDay={onSelectDay}
        />
      ) : null}
    </section>
  );
}
