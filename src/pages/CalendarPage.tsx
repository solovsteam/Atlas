import { useMemo, useState } from "react";
import {
  DATE_PLACEHOLDER,
  DATE_TIME_PLACEHOLDER,
  isoFromEuropeanDate,
  isoFromEuropeanDateTime,
  validateEuropeanDate,
  validateEuropeanDateTime
} from "@shared/locale";
import {
  appointmentItemsToCalendar,
  intervalItemsToCalendar,
  startOfMonth,
  startOfWeek,
  type SlotKind
} from "@shared/schedule";
import { anchorForToday, headerLabel, navigateAnchor, nextLabel, prevLabel, type CalendarView } from "@shared/calendar";
import { useAtlasData } from "../context/AtlasDataContext";
import { trackCreateUndo, useUndo } from "../context/UndoContext";
import { AutoSchedulePanel } from "../components/AutoSchedulePanel";
import { WebScheduleBridge } from "../components/WebScheduleBridge";
import { ReviewPanel } from "../components/ReviewPanel";
import { WorkBlockButtons } from "../components/WorkBlockButtons";
import { CalendarIcsButton } from "../components/CalendarIcsButton";
import { CalendarDayView, CalendarMonthView, CalendarWeekView } from "../components/calendar/CalendarViews";
import { DateTimeTextInput } from "../components/DateTimeTextInput";

export function CalendarPage() {
  const { items, links, createItem } = useAtlasData();
  const { push } = useUndo();
  const slots = useMemo(
    () => [...intervalItemsToCalendar(items), ...appointmentItemsToCalendar(items)],
    [items]
  );
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<SlotKind>("fixed");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  const monthStart = useMemo(() => startOfMonth(anchor), [anchor]);
  const weekStart = startOfWeek(anchor);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    if (kind === "allDay") {
      const dayError = validateEuropeanDate(startsAt);
      if (dayError) {
        setError(dayError);
        return;
      }
    } else {
      const startError = validateEuropeanDateTime(startsAt);
      if (startError) {
        setError(startError);
        return;
      }
      const endError = validateEuropeanDateTime(endsAt);
      if (endError) {
        setError(endError);
        return;
      }
    }
    setError("");
    const startIso = kind === "allDay" ? isoFromEuropeanDate(startsAt) : isoFromEuropeanDateTime(startsAt);
    const endIso = kind === "allDay" ? isoFromEuropeanDate(startsAt, true) : isoFromEuropeanDateTime(endsAt);
    const result = await createItem(label.trim() || "Interval", {
      isInterval: true,
      intervalKind: kind,
      intervalStartsAt: startIso,
      intervalEndsAt: endIso,
      intervalStatus: "scheduled"
    });
    trackCreateUndo(push, result.id);
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
            Intervals are work capacity, not fake deadlines. Block morning/afternoon, then auto-schedule into them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-neutral-700">
            {(["day", "week", "month"] as CalendarView[]).map((entry) => (
              <button
                className={
                  view === entry
                    ? "px-3 py-1.5 text-xs font-medium text-white"
                    : "px-3 py-1.5 text-xs text-neutral-500 hover:text-white"
                }
                key={entry}
                type="button"
                onClick={() => {
                  setView(entry);
                  setAnchor(anchorForToday(entry));
                }}
              >
                {entry}
              </button>
            ))}
          </div>
          <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={() => setAnchor(anchorForToday(view))}>
            Today
          </button>
          <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={() => setAnchor(navigateAnchor(view, anchor, -1))}>
            {prevLabel(view)}
          </button>
          <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={() => setAnchor(navigateAnchor(view, anchor, 1))}>
            {nextLabel(view)}
          </button>
          <button
            className="border border-neutral-600 px-3 py-1.5 text-xs hover:border-white"
            type="button"
            onClick={() => setShowForm((open) => !open)}
          >
            {showForm ? "Cancel" : "New interval"}
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-neutral-300">{headerLabel(view, view === "month" ? monthStart : view === "week" ? weekStart : anchor)}</p>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <WorkBlockButtons />
        <CalendarIcsButton />
      </div>

      <ReviewPanel />

      <WebScheduleBridge />

      <AutoSchedulePanel />

      {showForm ? (
        <form className="mb-8 space-y-3 rounded border border-neutral-800 p-4" onSubmit={(event) => void onCreate(event)}>
          <div className="flex gap-2">
            {(["fixed", "allDay"] as SlotKind[]).map((entry) => (
              <button
                className={
                  kind === entry
                    ? "rounded border border-white px-3 py-1 text-xs"
                    : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400"
                }
                key={entry}
                type="button"
                onClick={() => setKind(entry)}
              >
                {entry === "allDay" ? "All day" : "Fixed"}
              </button>
            ))}
          </div>
          <input
            className="w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
            placeholder="Label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <DateTimeTextInput
            label={kind === "allDay" ? "Date" : "Starts"}
            mode={kind === "allDay" ? "date" : "datetime"}
            placeholder={kind === "allDay" ? DATE_PLACEHOLDER : DATE_TIME_PLACEHOLDER}
            value={startsAt}
            onChange={setStartsAt}
          />
          {kind !== "allDay" ? (
            <DateTimeTextInput
              label="Ends"
              mode="datetime"
              placeholder={DATE_TIME_PLACEHOLDER}
              value={endsAt}
              onChange={setEndsAt}
            />
          ) : null}
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          <button className="border border-white px-3 py-1.5 text-xs" type="submit">
            Create interval
          </button>
        </form>
      ) : null}

      {view === "day" ? (
        <CalendarDayView day={anchor} itemsById={itemsById} links={links} slots={slots} />
      ) : null}
      {view === "week" ? (
        <CalendarWeekView itemsById={itemsById} links={links} slots={slots} weekStart={weekStart} />
      ) : null}
      {view === "month" ? (
        <CalendarMonthView
          links={links}
          monthStart={monthStart}
          slots={slots}
          onSelectDay={(day) => {
            setAnchor(day);
            setView("day");
          }}
        />
      ) : null}
    </section>
  );
}
