import type { Item } from "./item";
import { tasksScheduledIn, type ItemLink } from "./links";
import {
  calendarIntervalFromItem,
  isArchivedSlot,
  slotOverlapsRange,
  slotRangeEnd,
  slotRangeStart,
  startOfDay
} from "./schedule";
import { parseTime } from "./scheduling/math";
import { nominalWorkWindow } from "./workBlocks";

export const NUDGE_LEAD_MS = 10 * 60 * 1000;
export const NUDGE_HORIZON_MS = 24 * 60 * 60 * 1000;

export type NudgeKind = "appointment_soon" | "appointment_start" | "block_soon" | "block_start" | "empty_morning";

export type Nudge = {
  id: string;
  kind: NudgeKind;
  fireAt: number;
  expiresAt: number;
  title: string;
  body: string;
};

function localDateKey(now: Date): string {
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isActiveTask(item: Item): boolean {
  return item.isTask && item.taskStatus === "active";
}

function pushClockNudges(
  nudges: Nudge[],
  idBase: string,
  start: Date,
  soon: { kind: NudgeKind; title: string; body: string },
  begin: { kind: NudgeKind; title: string; body: string }
): void {
  const startMs = start.getTime();
  nudges.push({
    id: `${idBase}:soon`,
    kind: soon.kind,
    fireAt: startMs - NUDGE_LEAD_MS,
    expiresAt: startMs,
    title: soon.title,
    body: soon.body
  });
  nudges.push({
    id: `${idBase}:start`,
    kind: begin.kind,
    fireAt: startMs,
    expiresAt: startMs + 5 * 60 * 1000,
    title: begin.title,
    body: begin.body
  });
}

/**
 * Clock-true pings only. Never “you have N tasks.”
 * A reminders list fails because it waits to be opened; these fire at the same moments a calendar would.
 */
export function buildNudges(items: Item[], links: ItemLink[], now: Date): Nudge[] {
  const nowMs = now.getTime();
  const horizon = nowMs + NUDGE_HORIZON_MS;
  const byId = new Map(items.map((item) => [item.id, item]));
  const nudges: Nudge[] = [];

  for (const item of items) {
    if (!isActiveTask(item)) {
      continue;
    }
    const start = parseTime(item.taskFixedStartsAt);
    const end = parseTime(item.taskFixedEndsAt);
    if (!start || !end) {
      continue;
    }
    const label = item.title || "Untitled";
    pushClockNudges(
      nudges,
      `appt:${item.id}:${start.toISOString()}`,
      start,
      { kind: "appointment_soon", title: "Appointment in 10 minutes", body: label },
      { kind: "appointment_start", title: "Appointment now", body: label }
    );
  }

  for (const item of items) {
    if (!item.isInterval) {
      continue;
    }
    const slot = calendarIntervalFromItem(item);
    if (!slot || isArchivedSlot(slot)) {
      continue;
    }
    const start = slotRangeStart(slot);
    const end = slotRangeEnd(slot);
    if (!start || !end) {
      continue;
    }
    const committed = tasksScheduledIn(item.id, links)
      .map((id) => byId.get(id))
      .filter((entry): entry is Item => entry !== undefined && isActiveTask(entry));
    const blockLabel = item.title || "Work block";
    const body = committed[0]?.title || "Nothing committed yet — open Now";
    pushClockNudges(
      nudges,
      `block:${item.id}:${start.toISOString()}`,
      start,
      { kind: "block_soon", title: `${blockLabel} in 10 minutes`, body },
      { kind: "block_start", title: `${blockLabel} now`, body }
    );
  }

  const morning = nominalWorkWindow(now, "morning");
  const hasMorning = items.some((item) => {
    if (!item.isInterval) {
      return false;
    }
    const slot = calendarIntervalFromItem(item);
    return Boolean(slot && !isArchivedSlot(slot) && slotOverlapsRange(slot, morning.startsAt, morning.endsAt));
  });
  if (!hasMorning) {
    const fire = startOfDay(now);
    fire.setHours(8, 50, 0, 0);
    const expires = new Date(morning.startsAt.getTime() + 10 * 60_000);
    nudges.push({
      id: `empty-morning:${localDateKey(now)}`,
      kind: "empty_morning",
      fireAt: fire.getTime(),
      expiresAt: expires.getTime(),
      title: "No morning block",
      body: "Block morning so work has a place to land."
    });
  }

  return nudges
    .filter((nudge) => nudge.fireAt < horizon && nowMs < nudge.expiresAt)
    .sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
}

export function nextPendingNudge(nudges: Nudge[], now: Date, firedIds: Set<string>): Nudge | null {
  const nowMs = now.getTime();
  return nudges.find((nudge) => !firedIds.has(nudge.id) && nowMs < nudge.expiresAt) ?? null;
}
