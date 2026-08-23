export type ConstraintMode = "fixed" | "deadline" | "flexible";

export type UnassignedReason = "missing_info" | "no_feasible_interval" | "excluded" | "quick";

export type PlacementStrategy = "earliest_fit" | "delta_cost" | "delta_cost_switch";

export type TaskScheduleInput = {
  id: string;
  title: string;
  createdAt: string;
  importance: number;
  durationMinutes: number | null;
  dueAt: string | null;
  fixedStartsAt: string | null;
  fixedEndsAt: string | null;
  parentTaskId: string;
  tags: string[];
};

export type IntervalInput = {
  id: string;
  title: string;
  kind: string;
  startsAt: string;
  endsAt: string;
  archived: boolean;
};

export type SchedulerConfig = {
  now: Date;
  horizonDays: number;
  gamma: number;
  durationBuffer: number;
  defaultDurationMinutes: number;
  switchPenalty: number;
  wsptWeight: number;
  urgencyWeight: number;
  valueWeight: number;
  strategy: PlacementStrategy;
};

export type Assignment = {
  taskId: string;
  intervalId: string;
};

export type UnassignedTask = {
  taskId: string;
  reason: UnassignedReason;
};

export type SchedulerMetrics = {
  totalPostponement: number;
  contextSwitches: number;
  assignedCount: number;
  unassignedCount: number;
};

export type SchedulerResult = {
  assignments: Assignment[];
  unassigned: UnassignedTask[];
  metrics: SchedulerMetrics;
};

export const DEFAULT_SCHEDULER_CONFIG: Omit<SchedulerConfig, "now"> = {
  horizonDays: 21,
  gamma: 1,
  durationBuffer: 1.25,
  defaultDurationMinutes: 30,
  switchPenalty: 12,
  wsptWeight: 8,
  urgencyWeight: 0.6,
  valueWeight: 0.4,
  strategy: "delta_cost_switch"
};

export function mergeSchedulerConfig(now: Date, overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    now,
    ...DEFAULT_SCHEDULER_CONFIG,
    ...overrides
  };
}
