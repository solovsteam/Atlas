export type { TaskConstraint } from "./constraints";
export {
  blocksNeeded,
  canPlaceInInterval,
  intervalCapacityMinutes,
  intervalDurationMinutes,
  isActiveTask,
  isOverdue,
  remainingIntervalCapacity,
  taskConstraint,
  taskDurationMinutes
} from "./constraints";

export type {
  ScheduleAssignment,
  ScheduleLinkChange,
  ScheduleProposal,
  SchedulerConfig,
  SchedulerScope,
  SchedulingContext,
  SchedulingMode,
  TaskEnricher,
  TaskScheduleInput,
  TaskScheduleScore
} from "./types";
export { DEFAULT_SCHEDULER_CONFIG } from "./types";

export {
  deferralCostCurveKind,
  inferDeferralCostCurve,
  normalizeImportance,
  postponementCost,
  postponementCostDelta,
  type DeferralCostCurve,
  type DeferralCostCurveKind,
  type DeferralCostSource,
  type TaskDeferralCost
} from "./deferralCost";

export {
  combinedRelevance,
  resolveTaskDeferralCost,
  scoreTaskInput,
  urgencyFromDeferralCost,
  urgencyScore
} from "./relevance";

export {
  algorithmRelevanceEnricher,
  buildSchedulingContext,
  runScheduler
} from "./engine";

export {
  effectiveSchedulingFields,
  effectiveSchedulingItem,
  missingSchedulingFields,
  readinessLabel,
  taskScheduleReadiness,
  type EffectiveSchedulingFields,
  type MissingSchedulingField,
  type TaskReadinessOrigin,
  type TaskScheduleReadiness
} from "./readiness";

export { assertSchedulingFixtures, makeInterval, makeTask } from "./fixtures";
