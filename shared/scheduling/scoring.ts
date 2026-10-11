import { constraintMode, intervalRange, taskFitsInterval } from "./constraints";
import { postponementCost, waitHorizon } from "./deferral";
import { resolvedDuration } from "./constraints";
import { bufferedMinutes } from "./math";
import { switchCost } from "./switching";
import { valueScore } from "./math";
import type { IntervalInput, SchedulerConfig, TaskScheduleInput } from "./types";

export type TaskBenefitConstants = {
  duration: number;
  valueScore: number;
  delayCostIfWait: number;
};

export type PlacementSlotClock = {
  time: Date;
};

export function placementSlotClock(interval: IntervalInput, config: SchedulerConfig): PlacementSlotClock {
  const range = intervalRange(interval);
  return { time: range ? (range.start.getTime() < config.now.getTime() ? config.now : range.start) : config.now };
}

export function placementBenefit(
  task: TaskScheduleInput,
  constants: TaskBenefitConstants,
  interval: IntervalInput,
  previous: TaskScheduleInput | null,
  later: IntervalInput[],
  remaining: Map<string, number>,
  config: SchedulerConfig,
  slotClock?: PlacementSlotClock
): number {
  const slotTime = slotClock?.time ?? placementSlotClock(interval, config).time;
  const delayCostHere = postponementCost(task, slotTime, config);
  const switching = config.strategy === "delta_cost_switch" ? switchCost(previous, task, config.switchPenalty) : 0;
  const laterFit = later.some((candidate) =>
    taskFitsInterval(task, candidate, remaining.get(candidate.id) ?? 0, config)
  );
  const lastChance = laterFit ? 0 : constraintMode(task) === "deadline" ? 500 : 80;
  return lastChance + (constants.delayCostIfWait - delayCostHere) - switching +
    config.wsptWeight * (constants.valueScore / constants.duration);
}

export function taskBenefitConstants(task: TaskScheduleInput, config: SchedulerConfig): TaskBenefitConstants {
  return {
    duration: bufferedMinutes(resolvedDuration(task, config), config),
    valueScore: valueScore(task.importance),
    delayCostIfWait: postponementCost(task, waitHorizon(task, config), config)
  };
}
