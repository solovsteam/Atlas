import type { Item } from "./item";
import { tasksScheduledIn, type ItemLink } from "./links";
import {
  addDays,
  calendarIntervalFromItem,
  isArchivedSlot,
  slotRangeEnd,
  slotRangeStart,
  startOfDay
} from "./schedule";
import { parseTime } from "./scheduling/math";

function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function eventBlock(uid: string, start: Date, end: Date, summary: string, description: string): string {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(summary)}`,
    "END:VALARM",
    "END:VEVENT"
  ].join("\r\n");
}

/** OS calendars already interrupt people. This is how Atlas borrows that, without Atlas staying open. */
export function calendarIcs(items: Item[], links: ItemLink[], now: Date, dayCount = 7): string {
  const rangeStart = startOfDay(now);
  const rangeEnd = addDays(rangeStart, dayCount);
  const byId = new Map(items.map((item) => [item.id, item]));
  const events: string[] = [];

  for (const item of items) {
    if (item.isInterval) {
      const slot = calendarIntervalFromItem(item);
      if (!slot || isArchivedSlot(slot)) {
        continue;
      }
      const start = slotRangeStart(slot);
      const end = slotRangeEnd(slot);
      if (!start || !end || end <= rangeStart || start >= rangeEnd) {
        continue;
      }
      const committed = tasksScheduledIn(item.id, links)
        .map((id) => byId.get(id)?.title)
        .filter((title): title is string => Boolean(title));
      events.push(
        eventBlock(
          `atlas-interval-${item.id}@atlas`,
          start,
          end,
          item.title || "Work block",
          committed.length > 0 ? committed.join(", ") : "Nothing committed yet"
        )
      );
    }
    if (item.isTask && item.taskStatus === "active") {
      const start = parseTime(item.taskFixedStartsAt);
      const end = parseTime(item.taskFixedEndsAt);
      if (!start || !end || end <= rangeStart || start >= rangeEnd) {
        continue;
      }
      events.push(eventBlock(`atlas-appt-${item.id}@atlas`, start, end, item.title || "Appointment", "Atlas appointment"));
    }
  }

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlas//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join(
    "\r\n"
  );
}
