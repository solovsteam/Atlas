import { addDays, addMonths, startOfDay, startOfMonth, startOfWeek } from "./schedule";
import { formatDayLabel } from "./locale";

export type CalendarView = "day" | "week" | "month";

export function navigateAnchor(view: CalendarView, anchor: Date, delta: number): Date {
  if (view === "day") {
    return addDays(anchor, delta);
  }
  if (view === "week") {
    return addDays(anchor, delta * 7);
  }
  return addMonths(anchor, delta);
}

export function anchorForToday(view: CalendarView): Date {
  const today = startOfDay(new Date());
  if (view === "day") {
    return today;
  }
  if (view === "week") {
    return startOfWeek(today);
  }
  return startOfMonth(today);
}

export function headerLabel(view: CalendarView, anchor: Date): string {
  if (view === "day") {
    return formatDayLabel(anchor);
  }
  if (view === "week") {
    return `${formatDayLabel(anchor)} – ${formatDayLabel(addDays(anchor, 6))}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function prevLabel(view: CalendarView): string {
  if (view === "day") {
    return "← Prev day";
  }
  if (view === "week") {
    return "← Prev week";
  }
  return "← Prev month";
}

export function nextLabel(view: CalendarView): string {
  if (view === "day") {
    return "Next day →";
  }
  if (view === "week") {
    return "Next week →";
  }
  return "Next month →";
}
