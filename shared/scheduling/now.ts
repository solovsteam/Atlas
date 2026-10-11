import type { Item } from "../item";
import { isQuickDuration } from "../duration";
import { scheduledTaskIds, type ItemLink } from "../links";
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

type PreparedInterval = {
  item: Item;
  start: Date | null;
  end: Date | null;
};

function prepareIntervals(items: Item[]): PreparedInterval[] {
  return items.flatMap((item) => {
    if (!item.isInterval) {
      return [];
    }
    const slot = calendarIntervalFromItem(item);
    if (!slot || isArchivedSlot(slot)) {
      return [];
    }
    return [{ item, start: slotRangeStart(slot), end: slotRangeEnd(slot) }];
  });
}

function currentIntervals(intervals: PreparedInterval[], now: Date): Item[] {
  return intervals
    .filter(({ start, end }) =>
      start !== null && end !== null && now.getTime() >= start.getTime() && now.getTime() < end.getTime()
    )
    .map(({ item }) => item);
}

function todaysIntervals(intervals: PreparedInterval[], now: Date): Item[] {
  const start = startOfDay(now);
  const end = endOfDay(now);
  return intervals
    .filter(({ start: slotStart, end: slotEnd }) => {
      if (!slotStart && !slotEnd) {
        return false;
      }
      const a = slotStart ?? slotEnd!;
      const b = slotEnd ?? slotStart!;
      return a < end && b >= start;
    })
    .map(({ item }) => item);
}

export function buildNowFocus(items: Item[], links: ItemLink[], now: Date): NowFocus {
  const config = mergeSchedulerConfig(now);
  const byId = new Map(items.map((item) => [item.id, item]));
  const active = items.filter(isActiveTask);
  const resolvedInputs = new Map<Item, ReturnType<typeof itemToScheduleInput>>();
  const motivations = new Map<Item, number>();
  const scheduleInputFor = (item: Item) => {
    let input = resolvedInputs.get(item);
    if (!input) {
      input = itemToScheduleInput(item, items);
      resolvedInputs.set(item, input);
    }
    return input;
  };
  const motivationFor = (item: Item) => {
    let motivation = motivations.get(item);
    if (motivation === undefined) {
      motivation = nowMotivation(scheduleInputFor(item), config);
      motivations.set(item, motivation);
    }
    return motivation;
  };

  const liveAppointments = active
    .map((item, index) => ({
      item,
      index,
      start: parseTime(item.taskFixedStartsAt),
      end: parseTime(item.taskFixedEndsAt)
    }))
    .filter(({ start, end }) =>
      start !== null && end !== null && now.getTime() >= start.getTime() && now.getTime() < end.getTime()
    )
    .sort((a, b) => a.end!.getTime() - b.end!.getTime() || a.index - b.index)
    .map(({ item }) => item);

  if (liveAppointments[0]) {
    return {
      primary: { item: liveAppointments[0], reason: "Fixed appointment now" },
      committed: liveAppointments.slice(1).map((item) => ({ item, reason: "Also in range" })),
      suggestion: null
    };
  }

  const scheduledInByInterval = new Map<string, string[]>();
  for (const link of links) {
    if (link.kind !== "scheduled_in") continue;
    const taskIds = scheduledInByInterval.get(link.toId);
    if (taskIds) taskIds.push(link.fromId);
    else scheduledInByInterval.set(link.toId, [link.fromId]);
  }
  const tasksIn = (intervalId: string) => scheduledInByInterval.get(intervalId) ?? [];

  const preparedIntervals = prepareIntervals(items);
  const current = currentIntervals(preparedIntervals, now);
  const currentTasks = current
    .flatMap((interval) => tasksIn(interval.id))
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
  for (const interval of todaysIntervals(preparedIntervals, now)) {
    for (const taskId of tasksIn(interval.id)) {
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
    const input = scheduleInputFor(item);
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
  const rankedPool = (quickPool.length > 0 ? quickPool : suggestionPool)
    .map((item, index) => ({ item, index, motivation: motivationFor(item) }))
    .sort((a, b) => b.motivation - a.motivation || a.index - b.index)
    .map(({ item }) => item);
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
