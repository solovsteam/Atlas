import type { DocumentationEntry } from './documentationEntries';
import { addDays, civilDate } from './recurringReferences';
import { choiceNight, followUpWindow, shortfall, sleepNight, sleepNightDate, targetLightsOut, usualSleep, type SleepEvening, type SleepNight } from './sleepLog';
import { activeSleepWakeDate, localClock, requiredWakeForDate, type SleepScreenSettings } from './sleepScreens';
import { createSleepTrialConfig, sleepTrialTonight, type SleepChoice, type StoredSleepTrial } from './sleepTrial';
import type { SleepReactionTest } from './sleepReactionTest';
import type { SleepHistoryContext } from './sleepHistory';

export function sleepTrialDisplay(trial: StoredSleepTrial | null | undefined, wakeDate: string) {
  if (!trial) return { phase: 'none' as const, assignment: null, normalStart: null, normalEnd: null, trialStart: null };
  const config = createSleepTrialConfig(trial.normalLevelStartDate);
  return { ...sleepTrialTonight(config, trial.seed, wakeDate), normalStart: config.normalLevelStartDate,
    normalEnd: addDays(config.trialStartDate, -1), trialStart: config.trialStartDate };
}
export function reactionTestCardDue(now: Date, timeZone: string, testTime: string, tests: readonly SleepReactionTest[]): boolean {
  const today = civilDate(now, timeZone);
  return localClock(now, timeZone) >= testTime && !tests.some(test => civilDate(new Date(test.startedAt), timeZone) === today);
}
export function recordedSleepWakeDate(entry: DocumentationEntry, night: SleepNight): string {
  return sleepNightDate(night) ?? activeSleepWakeDate(new Date(night.evening?.lightsOut ?? entry.occurredAt), night.evening?.timeZone ?? 'UTC');
}
export function previousSleepChoices(rows: readonly { entry: DocumentationEntry; night: SleepNight }[], wakeDate: string): [SleepChoice | null, SleepChoice | null] {
  return [1, 2].map(offset => rows.find(row => (row.night.evening?.choice?.wakeDate ?? recordedSleepWakeDate(row.entry, row.night)) === addDays(wakeDate, -offset))?.night.evening?.choice?.outcome ?? null) as [SleepChoice | null, SleepChoice | null];
}
export function sleepChoiceCard(lightsOut: string, wakeDate: string, timeZone: string, nights: readonly SleepNight[], settings: SleepScreenSettings, earlyObligationAt?: string) {
  if (activeSleepWakeDate(new Date(lightsOut), timeZone) !== wakeDate) return null;
  const target = targetLightsOut(nights, wakeDate, timeZone, settings);
  const opportunity = choiceNight(lightsOut, wakeDate, timeZone, requiredWakeForDate(wakeDate, timeZone, settings, earlyObligationAt), settings, target.usualFallAsleepMinutes);
  if (!opportunity?.isChoiceNight) return null;
  const usual = usualSleep(nights, addDays(wakeDate, -1), settings);
  const expectedShortfall = (wakeAt: string) => shortfall(Math.max(0, (Date.parse(wakeAt) - Date.parse(lightsOut)) / 60000 - target.usualFallAsleepMinutes), usual ?? settings.sleepMinutes)!;
  return { ...opportunity, usesWindowEstimate: usual === null, keepShortfall: expectedShortfall(opportunity.anchorWakeAt), extendShortfall: expectedShortfall(opportunity.extendWakeAt),
    followUpWindow: followUpWindow(addDays(wakeDate, -1), date => !!requiredWakeForDate(date, timeZone, settings, date === wakeDate ? earlyObligationAt : undefined)) };
}
export function sleepHistoryContext(entries: readonly DocumentationEntry[], settings: SleepScreenSettings): SleepHistoryContext {
  const requiredWakeByDate: Record<string, string | null> = {};
  const choiceWakeDates: string[] = [];
  const followUpWindows = [];
  for (const entry of entries) {
    const night = sleepNight(entry);
    if (!night) continue;
    const date = recordedSleepWakeDate(entry, night);
    const zone = night.morning?.timeZone ?? night.evening?.timeZone ?? 'UTC';
    requiredWakeByDate[date] = requiredWakeForDate(date, zone, settings, night.evening?.earlyObligationAt);
    if (night.evening?.choice) {
      choiceWakeDates.push(night.evening.choice.wakeDate);
      followUpWindows.push(night.evening.choice.followUpWindow);
    }
  }
  return { requiredWakeByDate, choiceWakeDates, followUpWindows };
}
export function supplementMode(evening: SleepEvening, trial: ReturnType<typeof sleepTrialDisplay>): 'manual' | 'normal-level' | 'assignment' {
  if (evening.trial?.assignment || trial.phase === 'trial') return 'assignment';
  return trial.phase === 'normal-level' ? 'normal-level' : 'manual';
}
