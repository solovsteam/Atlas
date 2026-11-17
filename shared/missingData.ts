import type { DocumentationEntry } from './documentationEntries';
import { confirmedDay } from './dayEvidence';
import { methylphenidateStatus } from './intake';
import { addDays, atLocalClock, civilDate } from './recurringReferences';
import { recordedSleepWakeDate } from './sleepIntegration';
import { sleepNight, sleepNightDate, targetLightsOut } from './sleepLog';
import { sleepReactionTest } from './sleepReactionTest';
import type { SleepScreenSettings } from './sleepScreens';

export type MissingKind = 'evening' | 'lights-out' | 'morning' | 'reactionTest' | 'medicine' | 'confirmation';
export type MissingData = { date: string; kind: MissingKind; label: string; to: string };
/** Dates for evening and lights out refer to the evening. Morning and tests use their own date. */
export function missingData(entries: readonly DocumentationEntry[], now: Date, timeZone: string, settings: SleepScreenSettings): MissingData[] {
  const today = civilDate(now, timeZone);
  const nights = entries.flatMap(entry => { const night = sleepNight(entry); return night ? [{ entry, night }] : []; });
  const tests = entries.flatMap(entry => { const test = sleepReactionTest(entry); return test ? [test] : []; });
  const result: MissingData[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(today, -offset);
    const wakeDate = addDays(date, 1);
    const evening = nights.find(row => recordedSleepWakeDate(row.entry, row.night) === wakeDate);
    const morning = nights.find(row => sleepNightDate(row.night) === date);
    const previousEvening = nights.find(row => recordedSleepWakeDate(row.entry, row.night) === date);
    const target = targetLightsOut(nights.map(row => row.night), wakeDate, timeZone, settings);
    const eveningDue = offset > 0 || now.getTime() >= Date.parse(target.lightsOutAt) - settings.eveningReminderLeadMinutes * 60000;
    const morningDue = offset > 0 || now.getTime() >= Date.parse(morning?.night.morning?.wakeAt ?? atLocalClock(date, `${settings.anchorWake}:00`, timeZone));
    const nightUrl = (kind: string, row: typeof evening, forDate: string) => `/sleep/${kind}?for=${forDate}${row ? `&entry=${encodeURIComponent(row.entry.id)}` : ''}`;
    const add = (kind: MissingKind, label: string, to: string) => result.push({ date, kind, label, to });
    if (eveningDue && !evening?.night.evening?.dayRating) add('evening', 'Evening log', nightUrl('evening', evening, wakeDate));
    if ((offset > 0 || now.getTime() >= Date.parse(target.lightsOutAt)) && !evening?.night.evening?.lightsOut) add('lights-out', 'Lights out', nightUrl('lights-out', evening, wakeDate));
    if (morningDue && !morning?.night.morning?.wakeAt) add('morning', 'Morning log', nightUrl('morning', previousEvening, date));
    if ((offset > 0 || now.getTime() >= Date.parse(atLocalClock(date, `${settings.testTime}:00`, timeZone)))
      && !tests.some(test => civilDate(new Date(test.startedAt), test.timeZone) === date)) add('reactionTest', 'Reaction test', `/sleep/test?date=${date}`);
    if (eveningDue && methylphenidateStatus(entries, date, timeZone) === 'unknown') add('medicine', 'Methylphenidate answer', `/sleep/evening?for=${wakeDate}&day=${date}&answer=medicine`);
    if (eveningDue && !confirmedDay(entries, date, timeZone)) add('confirmation', 'Day confirmation', `/sleep/evening?for=${wakeDate}&day=${date}&answer=confirmation`);
  }
  return result;
}
