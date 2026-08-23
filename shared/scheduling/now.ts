import type { Item } from "../item";
import { isQuickDuration } from "../duration";
import { scheduledTaskIds, tasksScheduledIn, type ItemLink } from "../links";
import {
  calendarIntervalFromItem,
  endOfDay,
  isArchivedSlot,
  slotRangeEnd,
  slotRangeStart,
  startOfDay
} from "../schedule";
import { constraintMode, hasMissingInfo } from "./constraints";
import { nowMotivation } from "./deferral";
import { parseTime } from "./math";
import { itemToScheduleInput } from "./resolve";
import { mergeSchedulerConfig } from "./types";

export type NowEntry = {
  item: Item;
  reason: string;
};

export type NowFocus = {
  primary: NowEntry | null;
  committed: NowEntry[];
  suggestion: NowEntry | null;
};

function isActiveTask(item: Item): boolean {
  return item.isTask && item.taskStatus === "active";
}

function appointmentContains(item: Item, now: Date): boolean {
  const start = parseTime(item.taskFixedStartsAt);
  const end = parseTime(item.taskFixedEndsAt);
  if (!start || !end) {
    return false;
  }
  return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
}

function currentIntervals(items: Item[], now: Date): Item[] {
  return items.filter((item) => {
    if (!item.isInterval) {
      return false;
    }
    const slot = calendarIntervalFromItem(item);
    if (!slot || isArchivedSlot(slot)) {
      return false;
    }
    const start = slotRangeStart(slot);
    const end = slotRangeEnd(slot);
    if (!start || !end) {
      return false;
    }
    return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
  });
}

function todaysIntervals(items: Item[], now: Date): Item[] {
  const start = startOfDay(now);
  const end = endOfDay(now);
  return items.filter((item) => {
    if (!item.isInterval) {
      return false;
    }
    const slot = calendarIntervalFromItem(item);
    if (!slot || isArchivedSlot(slot)) {
      return false;
    }
    const slotStart = slotRangeStart(slot);
    const slotEnd = slotRangeEnd(slot);
    if (!slotStart && !slotEnd) {
      return false;
    }
    const a = slotStart ?? slotEnd!;
    const b = slotEnd ?? slotStart!;
    return a < end && b >= start;
  });
}

export function buildNowFocus(items: Item[], links: ItemLink[], now: Date): NowFocus {
  const config = mergeSchedulerConfig(now);
  const byId = new Map(items.map((item) => [item.id, item]));
  const active = items.filter(isActiveTask);

  const liveAppointments = active
    .filter((item) => appointmentContains(item, now))
    .sort((a, b) => (parseTime(a.taskFixedEndsAt)?.getTime() ?? 0) - (parseTime(b.taskFixedEndsAt)?.getTime() ?? 0));

  if (liveAppointments[0]) {
    return {
      primary: { item: liveAppointments[0], reason: "Fixed appointment now" },
      committed: liveAppointments.slice(1).map((item) => ({ item, reason: "Also in range" })),
      suggestion: null
    };
  }

  const current = currentIntervals(items, now);
  const currentTasks = current
    .flatMap((interval) => tasksScheduledIn(interval.id, links))
    .map((id) => byId.get(id))
    .filter((item): item is Item => item !== undefined && isActiveTask(item));

  if (currentTasks.length > 0) {
    const [first, ...rest] = currentTasks;
    const label = current[0]?.title || "current interval";
    return {
      primary: { item: first!, reason: `In ${label}` },
      committed: rest.map((item) => ({ item, reason: "Also in this interval" })),
      suggestion: null
    };
  }

  const seen = new Set<string>();
  const todayTasks: Item[] = [];
  for (const interval of todaysIntervals(items, now)) {
    for (const taskId of tasksScheduledIn(interval.id, links)) {
      if (seen.has(taskId)) {
        continue;
      }
      const item = byId.get(taskId);
      if (!item || !isActiveTask(item)) {
        continue;
      }
      seen.add(taskId);
      todayTasks.push(item);
    }
  }

  const scheduled = scheduledTaskIds(links);
  const suggestionPool = active.filter((item) => {
    if (scheduled.has(item.id) || seen.has(item.id)) {
      return false;
    }
    const input = itemToScheduleInput(item, items);
    if (constraintMode(input) === "fixed" || hasMissingInfo(input)) {
      return false;
    }
    return true;
  });

  const idle =
    liveAppointments.length === 0 && current.length === 0 && todayTasks.length === 0;
  const quickPool = idle
    ? suggestionPool.filter((item) => isQuickDuration(item.expectedDurationMinutes))
    : [];
  const rankedPool = (quickPool.length > 0 ? quickPool : suggestionPool).sort(
    (a, b) => nowMotivation(itemToScheduleInput(b, items), config) - nowMotivation(itemToScheduleInput(a, items), config)
  );
  const suggestionItem = rankedPool[0] ?? null;
  const suggestion = suggestionItem
    ? {
        item: suggestionItem,
        reason: isQuickDuration(suggestionItem.expectedDurationMinutes)
          ? "Two minutes or less — do it now, don’t calendar it"
          : "Highest start-now motivation among unscheduled work"
      }
    : null;

  if (todayTasks.length > 0) {
    const [first, ...rest] = todayTasks;
    return {
      primary: { item: first!, reason: "Committed today" },
      committed: rest.map((item) => ({ item, reason: "Also today" })),
      suggestion
    };
  }

  return {
    primary: suggestion,
    committed: [],
    suggestion: null
  };
}
