import type { Item } from "../item";
import type { ItemLink } from "../links";
import type { TaskConstraint } from "./constraints";
import type { TaskDeferralCost } from "./deferralCost";

export type SchedulingMode = "quick" | "planning";

export type SchedulerScope = "unassigned_only" | "all_eligible";

export type SchedulerConfig = {
  scope: SchedulerScope;
  /** Days ahead from `now` to consider intervals. Default 21. */
  horizonDays: number;
  /** When true, planning-mode tasks are included (e.g. user clicked Auto-schedule). */
  includePlanningTasks: boolean;
  urgencyWeight: number;
  importanceWeight: number;
  /** Default minutes when task has no expectedDurationMinutes. */
  defaultTaskDurationMinutes: number;
};

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  scope: "unassigned_only",
  horizonDays: 21,
  includePlanningTasks: true,
  urgencyWeight: 0.6,
  importanceWeight: 0.4,
  defaultTaskDurationMinutes: 30
};

export type TaskScheduleInput = {
  task: Item;
  constraint: TaskConstraint;
  mode: SchedulingMode;
  locked: boolean;
  existingIntervalId: string | null;
  /** When set (e.g. by a future LLM enricher), overrides algorithm-inferred deferral cost curve. */
  deferralCost?: TaskDeferralCost;
};

export type TaskScheduleScore = {
  taskId: string;
  relevance: number;
  urgency: number;
  importance: number;
  breakdown: Record<string, number>;
  source: "algorithm" | "llm";
};

export type ScheduleAssignment = {
  taskId: string;
  intervalId: string;
  action: "assign" | "reassign";
};

export type ScheduleProposal = {
  assignments: ScheduleAssignment[];
  unassigned: { taskId: string; reason: string }[];
  scores: TaskScheduleScore[];
};

export type SchedulingContext = {
  now: Date;
  items: Item[];
  links: ItemLink[];
  intervals: Item[];
  config: SchedulerConfig;
};

export interface TaskEnricher {
  name: string;
  enrich(tasks: TaskScheduleInput[], ctx: SchedulingContext): TaskScheduleScore[];
}

export type ScheduleLinkChange = {
  taskId: string;
  beforeIntervalId: string | null;
  afterIntervalId: string | null;
};
