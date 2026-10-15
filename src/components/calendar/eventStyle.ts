import { taskCountInInterval, type ItemLink } from "@shared/links";
import { isArchivedSlot, type ScheduleSlot } from "@shared/schedule";

/** What a calendar entry is, which decides its colour everywhere it is drawn. */
export type EventTone = "interval" | "openInterval" | "appointment" | "allDay" | "due" | "archived";

export function eventTone(slot: ScheduleSlot, links: ItemLink[]): EventTone {
  if (isArchivedSlot(slot)) return "archived";
  if (slot.id.startsWith("appt:")) return "appointment";
  if (slot.kind === "allDay") return "allDay";
  if (slot.kind === "due") return "due";
  return taskCountInInterval(slot.id, links) > 0 ? "interval" : "openInterval";
}

// Full class strings, so Tailwind's scanner keeps them.
export const TONE_BOX: Record<EventTone, string> = {
  interval: "border-l-[3px] border-indigo-400 bg-indigo-500/25 text-indigo-50 hover:bg-indigo-500/35",
  openInterval: "border border-dashed border-indigo-400/60 bg-indigo-500/[0.07] text-indigo-200 hover:bg-indigo-500/15",
  appointment: "border-l-[3px] border-amber-400 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30",
  allDay: "border-l-[3px] border-emerald-400 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30",
  due: "border-l-[3px] border-rose-400 bg-rose-500/20 text-rose-50 hover:bg-rose-500/30",
  archived: "border-l-[3px] border-neutral-600 bg-neutral-800/60 text-neutral-400 hover:bg-neutral-800"
};

export const TONE_DOT: Record<EventTone, string> = {
  interval: "bg-indigo-400",
  openInterval: "border border-indigo-400 bg-transparent",
  appointment: "bg-amber-400",
  allDay: "bg-emerald-400",
  due: "bg-rose-400",
  archived: "bg-neutral-600"
};

export const LEGEND: { tone: EventTone; label: string }[] = [
  { tone: "interval", label: "Interval with tasks" },
  { tone: "openInterval", label: "Open interval" },
  { tone: "appointment", label: "Appointment" },
  { tone: "allDay", label: "All day" }
];

export function slotHref(slot: ScheduleSlot): string {
  return slot.id.startsWith("appt:") ? `/item/${slot.id.slice(5)}` : `/item/${slot.id}`;
}
