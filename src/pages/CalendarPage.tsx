import { useMemo, useState } from "react";
import { activeScheduleSlots, navigateAnchor, startOfDay, type CalendarZoom } from "@shared/calendar";
import { useAtlasData } from "../context/AtlasDataContext";
import { CalendarDayView } from "../components/calendar/CalendarDayView";
import { CalendarMonthView } from "../components/calendar/CalendarMonthView";
import { CalendarToolbar, CalendarEmptyState } from "../components/calendar/CalendarToolbar";
import { CalendarWeekView } from "../components/calendar/CalendarWeekView";
import { AutoSchedulePanel } from "../components/AutoSchedulePanel";

export function CalendarPage() {
  const { items, itemLinks, itemsLoading } = useAtlasData();
  const [zoom, setZoom] = useState<CalendarZoom>("day");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));

  const slots = useMemo(() => activeScheduleSlots(items), [items]);
  const tasks = items;
  const hasCalendarContent = useMemo(
    () =>
      slots.length > 0 ||
      items.some(
        (item) =>
          item.isTask &&
          item.fixedStartsAt &&
          item.fixedEndsAt &&
          item.taskStatus !== "done" &&
          item.taskStatus !== "cancelled"
      ),
    [items, slots.length]
  );

  function goToday() {
    setAnchor(startOfDay(new Date()));
  }

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">Calendar</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Intervals as time blocks. Tasks assigned to an interval or with fixed appointment times appear here.
        </p>
      </div>

      <AutoSchedulePanel />

      <CalendarToolbar
        anchor={anchor}
        zoom={zoom}
        onNext={() => setAnchor((current) => navigateAnchor(zoom, current, 1))}
        onPrevious={() => setAnchor((current) => navigateAnchor(zoom, current, -1))}
        onToday={goToday}
        onZoomChange={setZoom}
      />

      {itemsLoading ? <p className="text-sm text-neutral-500">Loading calendar…</p> : null}

      {!itemsLoading && !hasCalendarContent ? <CalendarEmptyState /> : null}

      {!itemsLoading && hasCalendarContent && zoom === "day" ? (
        <CalendarDayView day={anchor} links={itemLinks} slots={slots} tasks={tasks} />
      ) : null}

      {!itemsLoading && hasCalendarContent && zoom === "week" ? (
        <CalendarWeekView anchor={anchor} links={itemLinks} slots={slots} tasks={tasks} />
      ) : null}

      {!itemsLoading && hasCalendarContent && zoom === "month" ? (
        <CalendarMonthView anchor={anchor} links={itemLinks} slots={slots} tasks={tasks} />
      ) : null}
    </section>
  );
}
