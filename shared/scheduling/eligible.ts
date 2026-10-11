import { isQuickDuration } from "../duration";
import { constraintMode, hasMissingInfo } from "./constraints";
import type { TaskScheduleInput, UnassignedTask } from "./types";

export function eligibleTasks(tasks: TaskScheduleInput[]): {
  candidates: TaskScheduleInput[];
  unassigned: UnassignedTask[];
  appointments: TaskScheduleInput[];
} {
  const candidates: TaskScheduleInput[] = [];
  const unassigned: UnassignedTask[] = [];
  const appointments: TaskScheduleInput[] = [];

  for (const task of tasks) {
    const mode = constraintMode(task);
    if (mode === "fixed") {
      appointments.push(task);
      unassigned.push({ taskId: task.id, reason: "excluded" });
      continue;
    }
    if (hasMissingInfo(task)) {
      unassigned.push({ taskId: task.id, reason: "missing_info" });
      continue;
    }
    if (isQuickDuration(task.durationMinutes)) {
      unassigned.push({ taskId: task.id, reason: "quick" });
      continue;
    }
    candidates.push(task);
  }

  return { candidates, unassigned, appointments };
}
