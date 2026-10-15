import { addDays, addMonths, startOfDay, startOfMonth, startOfWeek } from "./schedule";

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
  return anchorForView(view, new Date());
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday-first weekday abbreviation. */
export function weekdayShort(date: Date): string {
  return WEEKDAYS_SHORT[(date.getDay() + 6) % 7]!;
}

/** Compact toolbar title: "October 2026", "12 – 18 Oct 2026", "Thu 15 Oct". */
export function calendarTitle(view: CalendarView, anchor: Date): string {
  if (view === "month") {
    return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }
  if (view === "day") {
    return `${weekdayShort(anchor)} ${anchor.getDate()} ${SHORT_MONTHS[anchor.getMonth()]}`;
  }
  const end = addDays(anchor, 6);
  const sameMonth = end.getMonth() === anchor.getMonth();
  const startText = sameMonth ? `${anchor.getDate()}` : `${anchor.getDate()} ${SHORT_MONTHS[anchor.getMonth()]}`;
  return `${startText} – ${end.getDate()} ${SHORT_MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

/** The anchor a view shows when switching to it while looking at `focus`. */
export function anchorForView(view: CalendarView, focus: Date): Date {
  if (view === "day") {
    return startOfDay(focus);
  }
  if (view === "week") {
    return startOfWeek(focus);
  }
  return startOfMonth(focus);
}
