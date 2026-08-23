import type { TaskScheduleInput } from "./types";

export function switchCost(previous: TaskScheduleInput | null, next: TaskScheduleInput, penalty: number): number {
  if (!previous || penalty <= 0) {
    return 0;
  }
  if (previous.id === next.id) {
    return 0;
  }
  if (previous.parentTaskId && previous.parentTaskId === next.parentTaskId) {
    return 0;
  }
  if (next.parentTaskId && next.parentTaskId === previous.id) {
    return 0;
  }
  if (previous.parentTaskId && previous.parentTaskId === next.id) {
    return 0;
  }
  const sharedTag = next.tags.some((tag) => tag && previous.tags.includes(tag));
  if (sharedTag) {
    return 0;
  }
  return penalty;
}
