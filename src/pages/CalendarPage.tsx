import { useCallback, useMemo, useRef, useState } from "react";
import { appointmentItemsToCalendar, intervalItemsToCalendar, startOfDay, startOfMonth } from "@shared/schedule";
import { anchorForView, calendarTitle, navigateAnchor, type CalendarView } from "@shared/calendar";
import { useAtlasData } from "../context/AtlasDataContext";
import { AutoSchedulePanel } from "../components/AutoSchedulePanel";
import { WebScheduleBridge } from "../components/WebScheduleBridge";
import { ReviewPanel } from "../components/ReviewPanel";
import { WorkBlockButtons } from "../components/WorkBlockButtons";
import { CalendarIcsButton } from "../components/CalendarIcsButton";
import { CalendarDayView, CalendarMonthView, CalendarWeekView } from "../components/calendar/CalendarViews";
import { IntervalSheet } from "../components/calendar/IntervalSheet";
import { LEGEND, TONE_DOT } from "../components/calendar/eventStyle";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "../components/icons";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" }
];

function nextFullHour(): Date {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  return start;
}

export function CalendarPage() {
  const { items, links } = useAtlasData();
  const slots = useMemo(() => [...intervalItemsToCalendar(items), ...appointmentItemsToCalendar(items)], [items]);
  const itemTitles = useMemo(() => new Map(items.map((item) => [item.id, item.title])), [items]);

  const [view, setView] = useState<CalendarView>("week");
  // The day the calendar is looking at; each view shows the period containing it.
  const [focus, setFocus] = useState(() => startOfDay(new Date()));
  const [newIntervalAt, setNewIntervalAt] = useState<Date | null>(null);
  const calendarRef = useRef<HTMLElement>(null);

  const anchor = anchorForView(view, focus);
  const closeSheet = useCallback(() => setNewIntervalAt(null), []);

  /** Switch view or period and bring the calendar's top back into sight, so nothing needs scrolling back up. */
  function show(nextView: CalendarView, nextFocus: Date) {
    setView(nextView);
    setFocus(startOfDay(nextFocus));
    const top = calendarRef.current ? calendarRef.current.getBoundingClientRect().top + window.scrollY : 0;
    if (window.scrollY > top) window.scrollTo({ top });
  }

  function step(delta: number) {
    // Step months from the 1st so 31 January does not jump past February.
    const from = view === "month" ? startOfMonth(focus) : focus;
    setFocus(navigateAnchor(view, from, delta));
  }

  const isOnToday = anchor.getTime() === anchorForView(view, new Date()).getTime();

  return (
    <section>
      <section aria-label="Calendar" ref={calendarRef}>
        <div className="sticky top-0 z-30 -mx-4 mb-3 border-b border-neutral-800/80 bg-black/90 px-4 pb-2.5 pt-2 backdrop-blur-md md:-mx-8 md:px-8">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight md:text-2xl">{calendarTitle(view, anchor)}</h1>
            <button
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                isOnToday ? "border-neutral-800 text-neutral-500" : "border-indigo-400/60 text-indigo-200 hover:bg-indigo-500/15"
              }`}
              type="button"
              onClick={() => show(view, new Date())}
            >
              Today
            </button>
            <div className="flex">
              <button aria-label="Previous" className="rounded-full p-1.5 text-neutral-300 hover:bg-neutral-800" type="button" onClick={() => step(-1)}>
                <ChevronLeftIcon />
              </button>
              <button aria-label="Next" className="rounded-full p-1.5 text-neutral-300 hover:bg-neutral-800" type="button" onClick={() => step(1)}>
                <ChevronRightIcon />
              </button>
            </div>
            <button
              aria-label="New interval"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-400"
              type="button"
              onClick={() => setNewIntervalAt(view === "day" && !isOnToday ? new Date(focus.getTime() + 9 * 3_600_000) : nextFullHour())}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 rounded-full bg-neutral-900 p-0.5 text-sm md:inline-grid md:w-72">
            {VIEWS.map((entry) => (
              <button
                aria-pressed={view === entry.id}
                className={
                  view === entry.id
                    ? "rounded-full bg-neutral-700 py-1 font-medium text-white shadow"
                    : "rounded-full py-1 text-neutral-400 hover:text-white"
                }
                key={entry.id}
                type="button"
                onClick={() => show(entry.id, focus)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        {view === "day" ? (
          <CalendarDayView
            day={anchor}
            itemTitles={itemTitles}
            links={links}
            slots={slots}
            onPickTime={setNewIntervalAt}
            onSelectDay={(day) => show("day", day)}
          />
        ) : null}
        {view === "week" ? (
          <CalendarWeekView
            itemTitles={itemTitles}
            links={links}
            slots={slots}
            weekStart={anchor}
            onPickTime={setNewIntervalAt}
            onSelectDay={(day) => show("day", day)}
          />
        ) : null}
        {view === "month" ? (
          <CalendarMonthView
            itemTitles={itemTitles}
            links={links}
            monthStart={anchor}
            slots={slots}
            onSelectDay={(day) => show("day", day)}
          />
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-neutral-500">
          {LEGEND.map((entry) => (
            <span className="inline-flex items-center gap-1.5" key={entry.tone}>
              <span className={`h-2 w-2 rounded-full ${TONE_DOT[entry.tone]}`} />
              {entry.label}
            </span>
          ))}
          {view === "day" ? <span className="text-neutral-600">Tap an empty time to add an interval.</span> : null}
        </div>
      </section>

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
        <WorkBlockButtons />
        <CalendarIcsButton />
      </div>

      <ReviewPanel />
      <AutoSchedulePanel />
      <WebScheduleBridge />

      {newIntervalAt ? <IntervalSheet start={newIntervalAt} onClose={closeSheet} /> : null}
    </section>
  );
}
