import type { Item } from "./item";

/**
 * Routine calendar blocks (breakfast, dinner, buffers, workouts) are written by
 * Brain action pulses as task items. Their body starts with the pulse marker and
 * names a routine occurrence ("Reason: Occurrence breakfast@2026-10-27").
 * They belong to the calendar, not to the Tasks working list. One-off tasks from
 * a pulse (for example "Call dentist") have no occurrence reason and stay visible.
 */
export function isRoutineBlock(item: Pick<Item, "isTask" | "body">): boolean {
  const body = item.body ?? "";
  return item.isTask && body.startsWith("Brain action pulse ") && /(^|\n)Reason: Occurrence [^@\s]+@\d{4}-\d{2}-\d{2}/.test(body);
}

/** Newest first, so a task that was just added appears at the top. */
export function newestFirst<T extends { createdAt: string; id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
