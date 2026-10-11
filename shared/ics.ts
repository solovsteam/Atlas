import type { Item } from "./item";
import type { ItemLink } from "./links";
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

function foldContentLine(line: string): string {
  const physicalLines: string[] = [];
  const encoder = new TextEncoder();
  let physicalLine = "";
  let octets = 0;
  for (const codePoint of line) {
    const codePointOctets = encoder.encode(codePoint).length;
    if (octets + codePointOctets > 75) {
      physicalLines.push(physicalLine);
      physicalLine = " ";
      octets = 1;
    }
    physicalLine += codePoint;
    octets += codePointOctets;
  }
  physicalLines.push(physicalLine);
  return physicalLines.join("\r\n");
}

export type CalendarEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description: string;
};

export function serializeVevent(event: CalendarEvent, timestamp: Date): string {
  return [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsUtc(timestamp)}`,
    `DTSTART:${icsUtc(event.start)}`,
    `DTEND:${icsUtc(event.end)}`,
    `SUMMARY:${icsEscape(event.summary)}`,
    `DESCRIPTION:${icsEscape(event.description)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(event.summary)}`,
    "END:VALARM",
    "END:VEVENT"
  ].map(foldContentLine).join("\r\n");
}

/** OS calendars already interrupt people. This is how Atlas borrows that, without Atlas staying open. */
export function calendarIcs(items: Item[], links: ItemLink[], now: Date, dayCount = 7): string {
  const events = selectCalendarEvents(items, links, now, dayCount);
  const serializedEvents = events.map((event) => serializeVevent(event, new Date()));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlas//EN", "CALSCALE:GREGORIAN", ...serializedEvents, "END:VCALENDAR"].join(
    "\r\n"
  );
}

export function selectCalendarEvents(items: Item[], links: ItemLink[], now: Date, dayCount = 7): CalendarEvent[] {
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(dayCount) || dayCount <= 0) {
    return [];
  }
  const rangeStart = startOfDay(now);
  const rangeEnd = addDays(rangeStart, dayCount);
  const rangeEndTime = Number.isFinite(rangeEnd.getTime()) ? rangeEnd.getTime() : Number.POSITIVE_INFINITY;
  const byId = new Map(items.map((item) => [item.id, item]));
  const titlesByInterval = new Map<string, string[]>();
  for (const link of links) {
    if (link.kind !== "scheduled_in") {
      continue;
    }
    const title = byId.get(link.fromId)?.title;
    if (!title) {
      continue;
    }
    const titles = titlesByInterval.get(link.toId);
    if (titles) {
      titles.push(title);
    } else {
      titlesByInterval.set(link.toId, [title]);
    }
  }
  const events: CalendarEvent[] = [];

  for (const item of items) {
    if (item.isInterval) {
      const slot = calendarIntervalFromItem(item);
      if (!slot || isArchivedSlot(slot)) {
        continue;
      }
      const start = slotRangeStart(slot);
      const end = slotRangeEnd(slot);
      if (!start || !end || end <= rangeStart || start.getTime() >= rangeEndTime) {
        continue;
      }
      const committed = titlesByInterval.get(item.id) ?? [];
      events.push({
        uid: `atlas-interval-${item.id}@atlas`,
        start,
        end,
        summary: item.title || "Work block",
        description: committed.length > 0 ? committed.join(", ") : "Nothing committed yet"
      });
    }
    if (item.isTask && item.taskStatus === "active") {
      const start = parseTime(item.taskFixedStartsAt);
      const end = parseTime(item.taskFixedEndsAt);
      if (!start || !end || end <= rangeStart || start.getTime() >= rangeEndTime) {
        continue;
      }
      events.push({
        uid: `atlas-appt-${item.id}@atlas`,
        start,
        end,
        summary: item.title || "Appointment",
        description: "Atlas appointment"
      });
    }
  }

  return events;
}
