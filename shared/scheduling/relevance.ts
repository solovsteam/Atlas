import type { Item } from "../item";
import type { TaskConstraint } from "./constraints";
import {
  deferralCostCurveKind,
  inferDeferralCostCurve,
  normalizeImportance,
  postponementCost,
  type TaskDeferralCost
} from "./deferralCost";
import type { SchedulerConfig, TaskScheduleInput, TaskScheduleScore } from "./types";

export { normalizeImportance };

export function resolveTaskDeferralCost(input: TaskScheduleInput): TaskDeferralCost {
  return input.deferralCost ?? inferDeferralCostCurve(input.task, input.constraint);
}

/** Scheduling urgency derived from postponement cost at `now` (0–100). */
export function urgencyFromDeferralCost(deferralCost: TaskDeferralCost, now: Date): number {
  return postponementCost(deferralCost.curve, now);
}

export function combinedRelevance(
  urgency: number,
  importance: number,
  config: Pick<SchedulerConfig, "urgencyWeight" | "importanceWeight">
): number {
  return config.urgencyWeight * urgency + config.importanceWeight * importance;
}

export function scoreTaskInput(input: TaskScheduleInput, ctx: { now: Date; config: SchedulerConfig }): TaskScheduleScore {
  const { task } = input;
  const deferralCost = resolveTaskDeferralCost(input);
  const importance = normalizeImportance(task.manualRelevance);
  const urgency = urgencyFromDeferralCost(deferralCost, ctx.now);
  const relevance = combinedRelevance(urgency, importance, ctx.config);
  const curveKind = deferralCostCurveKind(deferralCost.curve);

  return {
    taskId: task.id,
    relevance,
    urgency,
    importance,
    breakdown: {
      urgency,
      importance,
      postponementCost: urgency,
      deferralCurveKind: curveKind === "deadline_step" ? 1 : 0,
      deferralSource: deferralCost.source === "llm" ? 1 : 0
    },
    source: deferralCost.source === "llm" ? "llm" : "algorithm"
  };
}

/** @deprecated Use urgencyFromDeferralCost / postponementCost instead. */
export function urgencyScore(task: Item, constraint: TaskConstraint, now: Date, _horizonDays: number): number {
  return urgencyFromDeferralCost(inferDeferralCostCurve(task, constraint), now);
}
