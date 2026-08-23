import { isQuickDuration } from "../duration";
import { constraintMode, hasMissingInfo } from "./constraints";
import type { TaskScheduleInput } from "./types";

export type Readiness = "ready" | "missing_info" | "scheduled" | "excluded" | "no_feasible_interval" | "quick";

export function taskReadiness(task: TaskScheduleInput, scheduled: boolean): Readiness {
  const mode = constraintMode(task);
  if (mode === "fixed") {
    return "excluded";
  }
  if (isQuickDuration(task.durationMinutes)) {
    return "quick";
  }
  if (hasMissingInfo(task)) {
    return "missing_info";
  }
  if (scheduled) {
    return "scheduled";
  }
  return "ready";
}

export function readinessLabel(readiness: Readiness): string {
  switch (readiness) {
    case "ready":
      return "Ready";
    case "missing_info":
      return "Missing times";
    case "scheduled":
      return "Scheduled";
    case "excluded":
      return "Appointment";
    case "no_feasible_interval":
      return "No room";
    case "quick":
      return "Two minutes — Now, not calendar";
  }
}
