import type { Item } from "../item";
import type { TaskConstraint } from "./constraints";

/** Shapes for cost-of-postponement over time. More kinds (e.g. non-linear continuous) later. */
export type DeferralCostCurveKind = "deadline_step" | "linear_continuous";

export type DeferralCostSource = "algorithm" | "llm";

/**
 * Cost accumulated if the task remains undone at instant `at`.
 * Normalized to 0–100 for scheduling scores.
 */
export type DeferralCostCurve =
  | {
      kind: "deadline_step";
      /** ISO instant where cost jumps (hard deadline). */
      dueAt: string;
      /** Flat cost while still before the deadline. */
      preDueLevel?: number;
      /** Cost at or after the deadline. */
      postDueLevel?: number;
      /**
       * Optional days before due where cost ramps toward `nearDueLevel` (the "almost step" shoulder).
       * 0 = pure step at dueAt.
       */
      rampDaysBeforeDue?: number;
      nearDueLevel?: number;
    }
  | {
      kind: "linear_continuous";
      /** Postponement clock starts here (typically task creation). */
      referenceAt: string;
      /** Cost points added per day since referenceAt. */
      ratePerDay: number;
      maxCost?: number;
    };

export type TaskDeferralCost = {
  curve: DeferralCostCurve;
  source: DeferralCostSource;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeImportance(manualRelevance: number): number {
  if (manualRelevance <= 10) {
    return clamp(manualRelevance * 10, 0, 100);
  }
  return clamp(manualRelevance, 0, 100);
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
}

/** Infer curve from structured task fields. LLM enrichers may override via TaskScheduleInput.deferralCost. */
export function inferDeferralCostCurve(task: Item, constraint: TaskConstraint): TaskDeferralCost {
  if (constraint.mode === "deadline") {
    return {
      source: "algorithm",
      curve: {
        kind: "deadline_step",
        dueAt: constraint.dueAt,
        preDueLevel: 10,
        postDueLevel: 100,
        rampDaysBeforeDue: 7,
        nearDueLevel: 90
      }
    };
  }

  const importance = normalizeImportance(task.manualRelevance);
  const ratePerDay = clamp(2 + importance / 15, 2, 10);

  return {
    source: "algorithm",
    curve: {
      kind: "linear_continuous",
      referenceAt: task.createdAt,
      ratePerDay,
      maxCost: 100
    }
  };
}

export function deferralCostCurveKind(curve: DeferralCostCurve): DeferralCostCurveKind {
  return curve.kind;
}

/** Cumulative postponement cost if the task is still not done at `at`. */
export function postponementCost(curve: DeferralCostCurve, at: Date): number {
  if (curve.kind === "deadline_step") {
    const due = new Date(curve.dueAt);
    const postDue = curve.postDueLevel ?? 100;

    if (at.getTime() >= due.getTime()) {
      return postDue;
    }

    const preDue = curve.preDueLevel ?? 10;
    const rampDays = curve.rampDaysBeforeDue ?? 0;
    if (rampDays <= 0) {
      return preDue;
    }

    const daysUntilDue = daysBetween(at, due);
    if (daysUntilDue >= rampDays) {
      return preDue;
    }

    const nearDue = curve.nearDueLevel ?? 90;
    const progress = 1 - daysUntilDue / rampDays;
    return preDue + progress * (nearDue - preDue);
  }

  const reference = new Date(curve.referenceAt);
  const daysOpen = Math.max(0, daysBetween(reference, at));
  const maxCost = curve.maxCost ?? 100;
  return clamp(daysOpen * curve.ratePerDay, 0, maxCost);
}

/** Extra cost incurred by remaining undone from `at` until `deferredUntil`. */
export function postponementCostDelta(curve: DeferralCostCurve, at: Date, deferredUntil: Date): number {
  if (deferredUntil.getTime() <= at.getTime()) {
    return 0;
  }
  return postponementCost(curve, deferredUntil) - postponementCost(curve, at);
}
